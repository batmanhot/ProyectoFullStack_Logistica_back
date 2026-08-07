import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoRuta } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DespachosService } from '../despachos/despachos.service';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { MarcarParadaDto } from './dto/marcar-parada.dto';
import { CompletarRutaDto } from './dto/completar-ruta.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class RutasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly despachosService: DespachosService,
  ) {}

  findAll(empresaId: string, filtros: { transportistaId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ruta.findMany({
        where: {
          empresaId,
          ...(filtros.transportistaId && { transportistaId: filtros.transportistaId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoRuta)) }),
        },
        include: {
          transportista: { select: { nombre: true } },
          paradas: { include: { despacho: { select: { numero: true, estado: true } } }, orderBy: { orden: 'asc' } },
        },
        orderBy: { fechaSalida: 'desc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const ruta = await this.prisma.withTenant(empresaId, (tx) =>
      tx.ruta.findFirst({
        where: { id, empresaId },
        include: {
          paradas: { include: { despacho: true }, orderBy: { orden: 'asc' } },
        },
      }),
    );
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }

  /** Crea la Ruta en PROGRAMADA con una Parada por cada despacho, en el orden dado. */
  async create(empresaId: string, dto: CreateRutaDto) {
    await this.validarTransportista(empresaId, dto.transportistaId);
    if (dto.almacenId) await this.validarAlmacen(empresaId, dto.almacenId);

    if (new Set(dto.despachoIds).size !== dto.despachoIds.length) {
      throw new BadRequestException('No se puede repetir el mismo despacho dos veces en la ruta');
    }

    const despachos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findMany({ where: { id: { in: dto.despachoIds }, empresaId } }),
    );
    if (despachos.length !== dto.despachoIds.length) {
      throw new BadRequestException('Uno o más despachos no existen o no pertenecen a esta empresa');
    }
    const noListos = despachos.filter((d) => d.estado !== 'LISTO');
    if (noListos.length > 0) {
      throw new BadRequestException(
        `Todos los despachos deben estar en estado LISTO para entrar a una ruta (no listos: ${noListos.map((d) => d.numero).join(', ')})`,
      );
    }

    const yaAsignados = await this.prisma.withTenant(empresaId, (tx) =>
      tx.parada.findMany({
        where: {
          despachoId: { in: dto.despachoIds },
          ruta: { estado: { in: ['PROGRAMADA', 'EN_RUTA'] } },
        },
        include: { despacho: { select: { numero: true } }, ruta: { select: { numero: true } } },
      }),
    );
    if (yaAsignados.length > 0) {
      const detalle = yaAsignados.map((p) => `${p.despacho.numero} (ya en ${p.ruta.numero})`).join(', ');
      throw new BadRequestException(`Uno o más despachos ya están asignados a otra ruta activa: ${detalle}`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.ruta.count({ where: { empresaId } });
      const numero = `RUTA-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      return tx.ruta.create({
        data: {
          empresaId,
          numero,
          transportistaId: dto.transportistaId,
          almacenId: dto.almacenId,
          costoViaje: dto.costoViaje,
          fechaSalida: new Date(dto.fechaSalida),
          paradas: {
            create: dto.despachoIds.map((despachoId, index) => ({
              despachoId,
              orden: index + 1,
            })),
          },
        },
        include: { paradas: true },
      });
    });
  }

  /**
   * PROGRAMADA -> EN_RUTA. Despacha TODOS los despachos de la ruta en la
   * MISMA transacción (decisión de Fase 5: iniciar la ruta = el camión
   * físicamente se fue con esa mercadería).
   */
  async iniciar(empresaId: string, id: string) {
    const ruta = await this.findOne(empresaId, id);
    if (ruta.estado !== 'PROGRAMADA') {
      throw new ForbiddenException(`Solo se puede iniciar una ruta en estado PROGRAMADA (actual: ${ruta.estado})`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const parada of ruta.paradas) {
        await this.despachosService.despacharEnTransaccion(tx, empresaId, parada.despachoId, {});
      }
      return tx.ruta.update({
        where: { id },
        data: { estado: 'EN_RUTA' },
        include: { paradas: true },
      });
    });
  }

  /**
   * Actualiza el estado de una parada. Si se marca ENTREGADO, también marca
   * el Despacho correspondiente como ENTREGADO en la misma transacción.
   * ENTREGADO/FALLIDO setean horaLlegada (si no estaba) y horaPartida —
   * EN_CAMINO no toca timestamps (todavía no llegó a la parada).
   */
  async marcarParada(empresaId: string, rutaId: string, despachoId: string, dto: MarcarParadaDto) {
    const ruta = await this.findOne(empresaId, rutaId);
    if (ruta.estado !== 'EN_RUTA') {
      throw new ForbiddenException('Solo se pueden actualizar paradas de una ruta EN_RUTA');
    }
    const parada = ruta.paradas.find((p) => p.despachoId === despachoId);
    if (!parada) throw new NotFoundException('Esa parada no pertenece a esta ruta');

    return this.prisma.withTenant(empresaId, async (tx) => {
      if (dto.estado === 'ENTREGADO') {
        await this.despachosService.entregarEnTransaccion(tx, empresaId, despachoId, {
          receptorNombre: dto.receptorNombre,
          evidenciaFoto: dto.evidenciaFoto,
          evidenciaNotas: dto.evidenciaNotas,
        });
      }

      const esResolucionFinal = dto.estado === 'ENTREGADO' || dto.estado === 'FALLIDO';

      await tx.parada.update({
        where: { id: parada.id },
        data: {
          estado: dto.estado,
          ...(dto.observacion !== undefined && { observacion: dto.observacion }),
          ...(esResolucionFinal && {
            horaLlegada: parada.horaLlegada ?? new Date(),
            horaPartida: new Date(),
          }),
        },
      });

      // Devolver la Ruta completa (no solo la Parada actualizada): el
      // frontend reemplaza el detalle abierto en pantalla con esta
      // respuesta (ModalDetalleRuta espera numero/estado/paradas de la
      // Ruta, no de una Parada suelta — encontrado en la sesión de QA).
      return tx.ruta.findFirst({
        where: { id: rutaId },
        include: { paradas: { include: { despacho: true }, orderBy: { orden: 'asc' } } },
      });
    });
  }

  /** EN_RUTA -> COMPLETADA. Exige que TODAS las paradas estén resueltas. */
  async completar(empresaId: string, id: string, dto: CompletarRutaDto) {
    const ruta = await this.findOne(empresaId, id);
    if (ruta.estado !== 'EN_RUTA') {
      throw new ForbiddenException(`Solo se puede completar una ruta EN_RUTA (actual: ${ruta.estado})`);
    }
    const pendientes = ruta.paradas.filter((p) => !['ENTREGADO', 'FALLIDO'].includes(p.estado));
    if (pendientes.length > 0) {
      throw new BadRequestException(
        `Quedan ${pendientes.length} parada(s) sin resolver (ENTREGADO o FALLIDO) antes de completar la ruta`,
      );
    }

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ruta.update({
        where: { id },
        data: {
          estado: 'COMPLETADA',
          fechaRetorno: new Date(),
          ...(dto.kmRecorrido !== undefined && { kmRecorrido: dto.kmRecorrido }),
          ...(dto.costoViaje !== undefined && { costoViaje: dto.costoViaje }),
        },
        include: { paradas: true },
      }),
    );
  }

  /** Solo se puede cancelar ANTES de iniciar — una vez EN_RUTA, los despachos ya salieron. */
  async cancelar(empresaId: string, id: string) {
    const ruta = await this.findOne(empresaId, id);
    if (ruta.estado !== 'PROGRAMADA') {
      throw new ForbiddenException('Solo se puede cancelar una ruta que aún no inició');
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ruta.update({ where: { id }, data: { estado: 'CANCELADA' } }),
    );
  }

  private validarTransportista(empresaId: string, transportistaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.transportista.findFirst({ where: { id: transportistaId, empresaId } })),
      'El transportista indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarAlmacen(empresaId: string, almacenId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.almacen.findFirst({ where: { id: almacenId, empresaId } })),
      'El almacén indicado no existe o no pertenece a esta empresa',
    );
  }
}
