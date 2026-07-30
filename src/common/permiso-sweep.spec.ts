import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Barrido estático (AST, no runtime) que confirma que todo handler HTTP de
 * todo *.controller.ts tiene alguna capa de autorización explícita:
 * @Permiso() propio o de clase, @Public() propio o de clase, o
 * @UseGuards() propio o de clase (portal-cliente/proveedor, admin/*).
 *
 * Objetivo: que un controller NUEVO sin guard se note en este test, no en
 * producción — ya pasó una vez con facturas-b2b.controller.ts (auditoría de
 * seguridad 2026-07-29). Las excepciones de abajo son lecturas
 * intencionalmente abiertas a cualquier usuario autenticado (documentadas
 * inline en cada controller) — la mutación siempre queda gateada.
 */
const SRC_DIR = path.join(__dirname, '..');

const ALLOWLIST: Record<string, string[]> = {
  'configuracion/configuracion.controller.ts': ['findOne'],
  'categorias/categorias.controller.ts': ['findAll', 'findOne'],
  'areas-internas/areas-internas.controller.ts': ['findAll', 'findOne'],
  'almacenes/almacenes.controller.ts': ['findAll', 'findOne'],
  'movimientos/movimientos.controller.ts': ['findAll', 'findOne', 'kardex'],
  'roles/roles.controller.ts': ['verificarPermiso'],
  'auth/auth.controller.ts': ['logout'],
};

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const AUTH_DECORATORS = new Set(['Permiso', 'Public', 'UseGuards']);

function listControllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listControllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

function decoratorNames(decorators: readonly ts.Decorator[] | undefined): string[] {
  if (!decorators) return [];
  return decorators
    .map((d) => (ts.isCallExpression(d.expression) ? d.expression.expression : d.expression))
    .filter(ts.isIdentifier)
    .map((id) => id.text);
}

describe('Barrido de autorización — @Permiso()/@Public()/@UseGuards() en todo handler HTTP', () => {
  const files = listControllerFiles(SRC_DIR);

  it('encontró controllers para barrer (el walker no se rompió silenciosamente)', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    const relPath = path.relative(SRC_DIR, file).replace(/\\/g, '/');

    it(`${relPath}: todo handler HTTP tiene autorización explícita o allowlist`, () => {
      const sourceText = fs.readFileSync(file, 'utf-8');
      const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

      let classNode: ts.ClassDeclaration | undefined;
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isClassDeclaration(node) && node.name?.text.endsWith('Controller')) classNode = node;
      });
      if (!classNode) throw new Error(`No se encontró una clase *Controller en ${relPath}`);

      const claseCubierta = decoratorNames(ts.getDecorators(classNode)).some((d) => AUTH_DECORATORS.has(d));
      const allowlist = ALLOWLIST[relPath] || [];
      const violaciones: string[] = [];

      for (const member of classNode.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const names = decoratorNames(ts.getDecorators(member));
        if (!names.some((n) => HTTP_DECORATORS.has(n))) continue; // no es un handler HTTP

        const methodName = member.name && ts.isIdentifier(member.name) ? member.name.text : '(anónimo)';
        const metodoCubierto = names.some((n) => AUTH_DECORATORS.has(n));

        if (!claseCubierta && !metodoCubierto && !allowlist.includes(methodName)) {
          violaciones.push(methodName);
        }
      }

      expect(violaciones).toEqual([]);
    });
  }
});
