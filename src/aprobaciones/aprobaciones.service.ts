import { BadRequestException, Injectable } from '@nestjs/common';
import { ProcesoAprobacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROCESOS_APROBACION, PROCESO_APROBACION_VALUES } from '../common/aprobacion-procesos';

// Owner/Admin aprueban siempre (permiso '*'); listarlos como aprobadores es
// redundante — se descartan al guardar.
const ROLES_SIEMPRE = ['owner', 'admin'];

export interface ReglaAprobacionVista {
  proceso: ProcesoAprobacion;
  label: string;
  descripcion: string;
  rolesAprobadores: string[];
  porDefecto: boolean; // true = todavía no hay fila, se muestra el valor por defecto
}

@Injectable()
export class AprobacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Las 4 reglas del tenant — con su fila real o, si falta, el valor por defecto. */
  async listar(empresaId: string): Promise<ReglaAprobacionVista[]> {
    const filas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.reglaAprobacion.findMany({ where: { empresaId } }),
    );
    const porProceso = new Map(filas.map((f) => [f.proceso, f]));

    return PROCESOS_APROBACION.map((meta) => {
      const fila = porProceso.get(meta.proceso);
      return {
        proceso: meta.proceso,
        label: meta.label,
        descripcion: meta.descripcion,
        rolesAprobadores: fila?.rolesAprobadores ?? meta.rolesPorDefecto,
        porDefecto: !fila,
      };
    });
  }

  async actualizar(
    empresaId: string,
    proceso: string,
    rolesAprobadores: string[],
  ): Promise<ReglaAprobacionVista> {
    if (!PROCESO_APROBACION_VALUES.includes(proceso as ProcesoAprobacion)) {
      throw new BadRequestException(`Proceso de aprobación desconocido: "${proceso}".`);
    }
    const procesoEnum = proceso as ProcesoAprobacion;

    // Normaliza: sin duplicados, sin owner/admin, y solo códigos del catálogo
    // de roles que el tenant puede ver (Rol.empresaId null — el del SuperAdmin).
    const pedidos = [...new Set(rolesAprobadores)].filter((c) => !ROLES_SIEMPRE.includes(c));

    const limpio = await this.prisma.withTenant(empresaId, async (tx) => {
      if (pedidos.length > 0) {
        const existentes = await tx.rol.findMany({
          where: { codigo: { in: pedidos }, OR: [{ empresaId: null }, { empresaId }] },
          select: { codigo: true },
        });
        const validos = new Set(existentes.map((r) => r.codigo));
        const desconocidos = pedidos.filter((c) => !validos.has(c));
        if (desconocidos.length > 0) {
          throw new BadRequestException(`Rol(es) inexistente(s): ${desconocidos.join(', ')}.`);
        }
      }

      await tx.reglaAprobacion.upsert({
        where: { empresaId_proceso: { empresaId, proceso: procesoEnum } },
        create: { empresaId, proceso: procesoEnum, rolesAprobadores: pedidos },
        update: { rolesAprobadores: pedidos },
      });
      return pedidos;
    });

    const meta = PROCESOS_APROBACION.find((p) => p.proceso === procesoEnum)!;
    return {
      proceso: procesoEnum,
      label: meta.label,
      descripcion: meta.descripcion,
      rolesAprobadores: limpio,
      porDefecto: false,
    };
  }
}
