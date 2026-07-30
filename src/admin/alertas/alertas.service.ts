import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';

function diasHasta(fecha: Date | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha);
  objetivo.setHours(0, 0, 0, 0);
  return Math.ceil((objetivo.getTime() - hoy.getTime()) / 86400000);
}

@Injectable()
export class AlertasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.reglaAlertaVencimiento.findMany({ orderBy: { diasAntes: 'asc' } });
  }

  async findOne(id: string) {
    const regla = await this.prisma.reglaAlertaVencimiento.findUnique({ where: { id } });
    if (!regla) throw new NotFoundException('Regla de alerta no encontrada');
    return regla;
  }

  create(dto: CreateReglaAlertaDto) {
    return this.prisma.reglaAlertaVencimiento.create({ data: dto });
  }

  async update(id: string, dto: UpdateReglaAlertaDto) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({ where: { id }, data: dto });
  }

  /** Soft-delete reutilizando el flag "activa" que ya existe en el modelo. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({ where: { id }, data: { activa: false } });
  }

  /**
   * Replica "proximosVencimientos" de AdminSaaS.jsx — cruza
   * Empresa.fechaVencimiento contra las reglas activas (mismo patrón que
   * FlotaService.alertas() en Fase 7a).
   */
  async vencimientosProximos() {
    const reglas = await this.prisma.reglaAlertaVencimiento.findMany({
      where: { activa: true },
      orderBy: { diasAntes: 'asc' },
    });
    if (reglas.length === 0) return [];

    const maxDias = Math.max(...reglas.map((r) => r.diasAntes));
    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true, fechaVencimiento: { not: null } },
    });

    const resultado: Array<{
      empresaId: string;
      nombre: string;
      codigo: string;
      fechaVencimiento: Date;
      dias: number;
      reglaAplicable: { id: string; asunto: string; canales: string[] } | null;
    }> = [];

    for (const empresa of empresas) {
      const dias = diasHasta(empresa.fechaVencimiento);
      if (dias === null || dias > maxDias) continue;

      const reglaAplicable = reglas.find((r) => dias <= r.diasAntes) ?? null;
      resultado.push({
        empresaId: empresa.id,
        nombre: empresa.nombre,
        codigo: empresa.codigo,
        fechaVencimiento: empresa.fechaVencimiento!,
        dias,
        reglaAplicable: reglaAplicable
          ? { id: reglaAplicable.id, asunto: reglaAplicable.asunto, canales: reglaAplicable.canales }
          : null,
      });
    }

    return resultado.sort((a, b) => a.dias - b.dias);
  }
}
