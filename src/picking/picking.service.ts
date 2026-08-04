import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmarLineaPickingDto } from './dto/confirmar-linea-picking.dto';
import { assertExists } from '../common/utils/assert-exists.util';

const INCLUDE_LISTA = {
  lineas: {
    include: {
      producto: { select: { sku: true, nombre: true, unidadMedida: true } },
      ubicacion: { select: { codigo: true, zona: true } },
    },
  },
  usuarioAsignado: { select: { id: true, nombre: true } },
} as const;

/**
 * Fase 1 (docs/PROPUESTA-MODULO-PICKING.md) — solo Despachos, sin picking
 * parcial. ListaPicking/LineaPicking son trazabilidad de trabajo: nunca
 * tocan Inventario.cantidad, eso lo sigue haciendo únicamente el motor de
 * Movimientos cuando DespachosService.despachar() genera la SALIDA real.
 */
@Injectable()
export class PickingService {
  constructor(private readonly prisma: PrismaService) {}

  findByDespacho(empresaId: string, despachoId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPicking.findFirst({ where: { despachoId, empresaId }, include: INCLUDE_LISTA }),
    );
  }

  /**
   * Crea la ListaPicking con una línea por cada item del Despacho, dentro de
   * la MISMA transacción que DespachosService.iniciarPicking() usa para el
   * cambio de estado — si algo falla, ninguna de las dos cosas queda a medias.
   * Asume que el despacho ya fue validado por el caller (estado APROBADO).
   */
  async generarListaEnTransaccion(
    tx: PrismaClient,
    empresaId: string,
    despacho: { id: string; almacenId: string; items: { productoId: string; cantidad: unknown }[] },
  ) {
    const lineas: { productoId: string; ubicacionId: string | null; cantidadRequerida: number }[] = [];
    for (const item of despacho.items) {
      const ubicacionId = await this.sugerirUbicacion(tx, item.productoId, despacho.almacenId);
      lineas.push({ productoId: item.productoId, ubicacionId, cantidadRequerida: Number(item.cantidad) });
    }
    return tx.listaPicking.create({
      data: { empresaId, despachoId: despacho.id, lineas: { create: lineas } },
    });
  }

  /**
   * Ubicación sugerida para pickear: prioriza zona "Picking" sobre
   * "Reserva"/"Cuarentena" (Ubicacion.zona, Fase 2, nunca usada en lógica
   * real hasta ahora) y, a igualdad de zona, la de mayor stock disponible.
   * null = no hay stock en ninguna ubicación del Mapa de Almacén; se sugiere
   * el bucket sin asignar (Inventario.ubicacionId: null).
   */
  private async sugerirUbicacion(tx: PrismaClient, productoId: string, almacenId: string): Promise<string | null> {
    const filas = await tx.inventario.findMany({
      where: { productoId, almacenId, ubicacionId: { not: null }, cantidad: { gt: 0 } },
      include: { ubicacion: true },
    });
    if (filas.length === 0) return null;

    const prioridadZona = (zona?: string) => (zona === 'Picking' ? 0 : zona === 'Reserva' ? 1 : 2);
    filas.sort((a, b) => {
      const diff = prioridadZona(a.ubicacion?.zona) - prioridadZona(b.ubicacion?.zona);
      return diff !== 0 ? diff : Number(b.cantidad) - Number(a.cantidad);
    });
    return filas[0].ubicacionId;
  }

  async asignar(empresaId: string, despachoId: string, usuarioId: string) {
    const lista = await this.validarLista(empresaId, despachoId);
    await assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.usuario.findFirst({ where: { id: usuarioId, empresaId } })),
      'El usuario indicado no existe o no pertenece a esta empresa',
    );
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPicking.update({
        where: { id: lista.id },
        data: { usuarioAsignadoId: usuarioId },
        include: INCLUDE_LISTA,
      }),
    );
  }

  /**
   * Confirma cuánto se pickeó de una línea (y opcionalmente de qué ubicación
   * real, si difiere de la sugerida). No permite exceder cantidadRequerida —
   * no hay concepto de "sobre-picking" en esta fase.
   */
  async confirmarLinea(empresaId: string, despachoId: string, lineaId: string, dto: ConfirmarLineaPickingDto) {
    const lista = await this.validarLista(empresaId, despachoId);
    if (lista.estado === 'COMPLETADA') {
      throw new ForbiddenException('Esta lista de picking ya está completa');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const linea = await tx.lineaPicking.findFirst({ where: { id: lineaId, listaId: lista.id } });
      if (!linea) throw new NotFoundException('Línea de picking no encontrada');

      if (dto.cantidad > Number(linea.cantidadRequerida)) {
        throw new BadRequestException(
          `No se puede pickear más de lo requerido (requerido ${linea.cantidadRequerida}, enviado ${dto.cantidad})`,
        );
      }

      const estadoLinea =
        dto.cantidad === Number(linea.cantidadRequerida) ? 'COMPLETA' : dto.cantidad > 0 ? 'PARCIAL' : 'PENDIENTE';

      await tx.lineaPicking.update({
        where: { id: lineaId },
        data: {
          cantidadPickeada: dto.cantidad,
          estado: estadoLinea,
          ...(dto.ubicacionId !== undefined && { ubicacionId: dto.ubicacionId }),
        },
      });

      const todasLasLineas = await tx.lineaPicking.findMany({ where: { listaId: lista.id } });
      const todasCompletas = todasLasLineas.every((l) => l.estado === 'COMPLETA');

      await tx.listaPicking.update({
        where: { id: lista.id },
        data: {
          estado: todasCompletas ? 'COMPLETADA' : 'EN_PROCESO',
          ...(!lista.fechaInicio && { fechaInicio: new Date() }),
          ...(todasCompletas && { fechaFin: new Date() }),
        },
      });

      if (todasCompletas) {
        await this.avanzarSiEmpaqueListo(tx, despachoId);
      }

      return tx.listaPicking.findFirst({ where: { id: lista.id }, include: INCLUDE_LISTA });
    });
  }

  /**
   * Simétrico a EmpaquesService.upsert(): si al completar la última línea de
   * picking el empaque ya estaba confirmado (se puede registrar en cualquier
   * etapa activa del despacho — ver EmpaquesService), avanza el despacho a
   * LISTO sin esperar el clic manual "Marcar Listo".
   */
  private async avanzarSiEmpaqueListo(tx: PrismaClient, despachoId: string) {
    const despacho = await tx.despacho.findFirst({ where: { id: despachoId } });
    if (despacho?.estado !== 'PICKING') return;
    const empaque = await tx.empaque.findFirst({ where: { despachoId } });
    if (empaque?.estado === 'CONFIRMADO') {
      await tx.despacho.update({ where: { id: despachoId }, data: { estado: 'LISTO' } });
    }
  }

  /** Usado por DespachosService.marcarListo() — rechaza si queda alguna línea sin completar. */
  async assertCompleta(empresaId: string, despachoId: string) {
    const lista = await this.findByDespacho(empresaId, despachoId);
    if (!lista) return; // no debería pasar (iniciarPicking siempre crea una), fail-open por robustez
    const incompleta = lista.lineas.some((l) => l.estado !== 'COMPLETA');
    if (incompleta) {
      throw new ForbiddenException(
        'No se puede marcar LISTO: hay líneas de picking sin completar. Confirma el picking de todos los productos primero.',
      );
    }
  }

  private validarLista(empresaId: string, despachoId: string) {
    return assertExists(
      () => this.findByDespacho(empresaId, despachoId),
      'Este despacho todavía no tiene una lista de picking generada',
      NotFoundException,
    );
  }
}
