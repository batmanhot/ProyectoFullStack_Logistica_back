import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoDocumentoSunat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarcarAceptadoDto } from './dto/marcar-aceptado.dto';
import { MarcarRechazadoDto } from './dto/marcar-rechazado.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

// Mapeo de unidadMedida interna -> código SUNAT, igual que generarJSONGRE() real.
const UNIDAD_SUNAT: Record<string, string> = { KG: 'KGM', LT: 'LTR', MTR: 'MTR' };

@Injectable()
export class SunatService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: { estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.guiaRemisionElectronica.findMany({
        where: { empresaId, ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoDocumentoSunat)) }) },
        include: { despacho: { select: { numero: true, guiaNumero: true, fecha: true, fechaDespacho: true, clienteId: true, cliente: { select: { razonSocial: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Despachos con guía asignada y activos — candidatos a generar su GRE (replica despConGuia real). */
  despachosConGuia(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findMany({
        where: { empresaId, guiaNumero: { not: null }, estado: { not: 'CANCELADO' } },
        include: { guiaRemisionElectronica: true, cliente: { select: { razonSocial: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  async findOne(empresaId: string, despachoId: string) {
    const doc = await this.prisma.withTenant(empresaId, (tx) =>
      tx.guiaRemisionElectronica.findFirst({ where: { despachoId, empresaId } }),
    );
    if (!doc) throw new NotFoundException('Este despacho todavía no tiene una GRE generada');
    return doc;
  }

  /**
   * Genera (o regenera) el registro de TRACKING de la GRE — el JSON en sí
   * nunca se persiste, se computa en vivo vía generarJSON(). Requiere que
   * el despacho ya tenga guiaNumero asignado (se generó al despachar).
   */
  async generarDocumento(empresaId: string, despachoId: string) {
    const despacho = await this.validarDespacho(empresaId, despachoId);
    if (!despacho.guiaNumero) {
      throw new BadRequestException('Este despacho todavía no tiene número de guía de remisión asignado');
    }
    if (despacho.estado === 'CANCELADO') {
      throw new BadRequestException('No se puede generar una GRE para un despacho CANCELADO');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.guiaRemisionElectronica.findFirst({ where: { despachoId } });
      if (existente) return existente; // regenerar el JSON no cambia el tracking — solo se computa de nuevo al leerlo
      return tx.guiaRemisionElectronica.create({ data: { empresaId, despachoId } });
    });
  }

  /**
   * Computa el JSON de la GRE EN VIVO — replica generarJSONGRE() de
   * Sunat.jsx real, mapeado a los campos reales de nuestro schema.
   * Nunca se persiste: siempre refleja el estado actual del despacho.
   */
  async generarJSON(empresaId: string, despachoId: string) {
    const despacho = await this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findFirst({
        where: { id: despachoId, empresaId },
        include: {
          cliente: true,
          transportista: true,
          empaque: true,
          items: { include: { producto: true } },
        },
      }),
    );
    if (!despacho) throw new NotFoundException('Despacho no encontrado');
    if (!despacho.guiaNumero) {
      throw new BadRequestException('Este despacho todavía no tiene número de guía de remisión asignado');
    }

    const empresa = await this.prisma.withTenant(empresaId, (tx) => tx.empresa.findUnique({ where: { id: empresaId } }));

    const items = despacho.items.map((item, i) => ({
      orden: i + 1,
      codigo: item.producto.sku,
      descripcion: item.producto.nombre,
      unidad_medida: UNIDAD_SUNAT[item.producto.unidadMedida ?? ''] ?? 'NIU',
      cantidad: Number(item.cantidad),
      codigo_producto_sunat: item.producto.codigoSunat ?? null,
    }));

    const fechaRef = despacho.fechaDespacho ?? despacho.fecha;

    return {
      _metadata: {
        tipo_documento: 'GUIA_REMISION_REMITENTE',
        formato_version: '2.0',
        ose_compatible: ['Nubefact', 'Factura.com', 'SUNAT_REST'],
        generado_por: 'StockPro API',
        fecha_generacion: new Date().toISOString(),
      },
      ruc_remitente: empresa?.ruc ?? '',
      razon_social_remitente: empresa?.nombre ?? '',
      tipo_guia: '09',
      serie: 'T001',
      correlativo: despacho.guiaNumero.split('-').pop() ?? '001',
      fecha_emision: fechaRef.toISOString().split('T')[0],
      modalidad_traslado: '01',
      motivo_traslado: '01',
      descripcion_motivo: 'VENTA',
      fecha_inicio_traslado: fechaRef.toISOString().split('T')[0],
      peso_bruto_total: despacho.empaque ? Number(despacho.empaque.pesoTotal ?? 0) || null : null,
      unidad_peso: 'KGM',
      numero_bultos: despacho.empaque?.bultos ?? 1,
      transportista: {
        tipo_documento: '6',
        numero_documento: despacho.transportista?.ruc ?? '',
        razon_social: despacho.transportista?.nombre ?? 'POR DEFINIR',
      },
      destinatario: {
        tipo_documento: (despacho.cliente.ruc?.length ?? 0) === 11 ? '6' : '1',
        numero_documento: despacho.cliente.ruc ?? '',
        razon_social: despacho.cliente.razonSocial,
        direccion: despacho.direccionEntrega ?? despacho.cliente.direccion ?? '',
        ubigeo: null,
      },
      punto_partida: { direccion: empresa?.direccion ?? '', ubigeo: null },
      punto_llegada: { direccion: despacho.direccionEntrega ?? despacho.cliente.direccion ?? '', ubigeo: null },
      referencia_venta: despacho.guiaNumero,
      items,
    };
  }

  async marcarEnviado(empresaId: string, despachoId: string) {
    const doc = await this.findOne(empresaId, despachoId);
    if (doc.estado !== 'PENDIENTE') {
      throw new ForbiddenException(`Solo se puede marcar enviado un documento en PENDIENTE (actual: ${doc.estado})`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.guiaRemisionElectronica.update({
        where: { id: doc.id },
        data: { estado: 'ENVIADO', fechaEnvio: new Date() },
      }),
    );
  }

  async marcarAceptado(empresaId: string, despachoId: string, dto: MarcarAceptadoDto) {
    const doc = await this.findOne(empresaId, despachoId);
    if (doc.estado !== 'ENVIADO') {
      throw new ForbiddenException(`Solo se puede aceptar un documento en ENVIADO (actual: ${doc.estado})`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.guiaRemisionElectronica.update({
        where: { id: doc.id },
        data: { estado: 'ACEPTADO', fechaRespuesta: new Date(), cdr: dto.cdr },
      }),
    );
  }

  async marcarRechazado(empresaId: string, despachoId: string, dto: MarcarRechazadoDto) {
    const doc = await this.findOne(empresaId, despachoId);
    if (doc.estado !== 'ENVIADO') {
      throw new ForbiddenException(`Solo se puede rechazar un documento en ENVIADO (actual: ${doc.estado})`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.guiaRemisionElectronica.update({
        where: { id: doc.id },
        data: { estado: 'RECHAZADO', fechaRespuesta: new Date(), motivoRechazo: dto.motivo },
      }),
    );
  }

  private validarDespacho(empresaId: string, despachoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.despacho.findFirst({ where: { id: despachoId, empresaId } })),
      'Despacho no encontrado',
      NotFoundException,
    );
  }
}
