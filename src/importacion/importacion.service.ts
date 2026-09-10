import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampoImport, ENTIDADES_IMPORT, EntidadImport } from './entidades-import';

export interface FilaAnalizada {
  fila: number; // nº de fila en el Excel (1 = encabezado)
  valido: boolean;
  errores: string[];
  datos: Record<string, unknown>;
  clave: string;
  accion: 'crear' | 'actualizar' | 'omitir';
  existenteId?: string;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_RUC = /^\d{8,11}$/;

@Injectable()
export class ImportacionService {
  constructor(private readonly prisma: PrismaService) {}

  private cfg(entidad: string): EntidadImport {
    const cfg = ENTIDADES_IMPORT[entidad];
    if (!cfg) throw new NotFoundException(`Entidad de importación desconocida: "${entidad}".`);
    return cfg;
  }

  /** Estructura de la plantilla para que el frontend genere el .xlsx y mapee la vista previa. */
  plantilla(entidad: string) {
    const cfg = this.cfg(entidad);
    return {
      entidad: cfg.entidad,
      label: cfg.label,
      columnas: cfg.campos.map((c) => c.columna),
      requeridas: cfg.campos.filter((c) => c.requerido).map((c) => c.columna),
      campos: cfg.campos.map((c) => ({
        columna: c.columna,
        campo: c.campo,
        requerido: !!c.requerido,
        tipo: c.tipo ?? 'texto',
      })),
      ejemplos: [cfg.campos.map((c) => c.ejemplo ?? '')],
    };
  }

  /**
   * Analiza + valida las filas contra el catálogo del tenant.
   * dryRun=true → solo devuelve el diagnóstico (vista previa).
   * dryRun=false → si TODAS las filas son válidas, hace el upsert en una
   * transacción (todo o nada); si alguna es inválida, no escribe nada.
   */
  async procesar(
    empresaId: string,
    entidad: string,
    filasRaw: Record<string, unknown>[],
    dryRun: boolean,
  ) {
    const cfg = this.cfg(entidad);
    if (!Array.isArray(filasRaw) || filasRaw.length === 0) {
      throw new BadRequestException('No se recibió ninguna fila para importar.');
    }

    const analizadas = filasRaw.map((raw, i) => this.analizarFila(cfg, raw, i));
    this.marcarClavesDuplicadas(analizadas);

    const modelo = cfg.modelo as 'cliente' | 'proveedor' | 'categoria' | 'almacen';
    const existentes: any[] = await this.prisma.withTenant(empresaId, (tx) =>
      (tx[modelo] as any).findMany({ where: { empresaId } }),
    );
    const porClave = new Map<string, any>();
    for (const e of existentes) {
      const k = this.claveDe(cfg, e);
      if (k) porClave.set(k.toLowerCase(), e);
    }
    for (const a of analizadas) {
      if (!a.valido) continue;
      const match = porClave.get(a.clave.toLowerCase());
      a.accion = match ? 'actualizar' : 'crear';
      a.existenteId = match?.id;
    }

    const resumen = {
      total: analizadas.length,
      crear: analizadas.filter((a) => a.accion === 'crear').length,
      actualizar: analizadas.filter((a) => a.accion === 'actualizar').length,
      error: analizadas.filter((a) => !a.valido).length,
    };

    if (dryRun) {
      return { entidad: cfg.entidad, resumen, filas: analizadas };
    }

    const invalidas = analizadas.filter((a) => !a.valido);
    if (invalidas.length > 0) {
      throw new BadRequestException({
        message: `No se importó nada: ${invalidas.length} fila(s) con error. Corrige el archivo y vuelve a subirlo.`,
        errores: invalidas.map((a) => ({ fila: a.fila, mensaje: a.errores.join(' · ') })),
      });
    }

    let creados = 0;
    let actualizados = 0;
    await this.prisma.withTenant(empresaId, async (tx) => {
      const delegate = (tx as any)[modelo];
      for (const a of analizadas) {
        if (a.accion === 'crear') {
          await delegate.create({ data: { empresaId, ...a.datos } });
          creados++;
        } else {
          await delegate.update({ where: { id: a.existenteId }, data: a.datos });
          actualizados++;
        }
      }
    });

    return { entidad: cfg.entidad, resumen: { ...resumen, creados, actualizados } };
  }

  private analizarFila(cfg: EntidadImport, raw: Record<string, unknown>, i: number): FilaAnalizada {
    const errores: string[] = [];
    const datos: Record<string, unknown> = {};

    for (const c of cfg.campos) {
      const bruto = raw?.[c.columna];
      const s = bruto === undefined || bruto === null ? '' : String(bruto).trim();
      if (!s) {
        if (c.requerido) errores.push(`"${c.columna}" es obligatorio`);
        continue;
      }
      const [valor, error] = this.parsearCampo(c, s);
      if (error) errores.push(error);
      else datos[c.campo] = valor;
    }

    const clave = String(this.claveDe(cfg, datos) ?? '').trim();
    if (errores.length === 0 && !clave) {
      errores.push('No hay valor para identificar la fila (RUC / nombre vacío)');
    }

    return {
      fila: i + 2,
      valido: errores.length === 0,
      errores,
      datos,
      clave,
      accion: 'omitir',
    };
  }

  private parsearCampo(c: CampoImport, s: string): [unknown, string | null] {
    switch (c.tipo) {
      case 'numero': {
        const n = Number(s.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) return [null, `"${c.columna}" debe ser un número ≥ 0`];
        return [n, null];
      }
      case 'booleano':
        return [['si', 'sí', 'true', '1', 'x'].includes(s.toLowerCase()), null];
      case 'email':
        return RE_EMAIL.test(s) ? [s, null] : [null, `"${c.columna}" no es un email válido`];
      case 'ruc':
        return RE_RUC.test(s) ? [s, null] : [null, `"${c.columna}" debe tener entre 8 y 11 dígitos`];
      default:
        return [s, null];
    }
  }

  private claveDe(cfg: EntidadImport, obj: Record<string, unknown>): string {
    const principal = obj[cfg.claveNatural];
    if (principal !== undefined && principal !== null && String(principal).trim() !== '') {
      return String(principal).trim();
    }
    if (cfg.claveNaturalFallback) {
      const alt = obj[cfg.claveNaturalFallback];
      if (alt !== undefined && alt !== null) return String(alt).trim();
    }
    return '';
  }

  private marcarClavesDuplicadas(analizadas: FilaAnalizada[]): void {
    const vistas = new Map<string, number>();
    for (const a of analizadas) {
      if (!a.valido || !a.clave) continue;
      const k = a.clave.toLowerCase();
      const prev = vistas.get(k);
      if (prev !== undefined) {
        a.valido = false;
        a.errores.push(`Valor "${a.clave}" repetido (ya está en la fila ${prev})`);
      } else {
        vistas.set(k, a.fila);
      }
    }
  }
}
