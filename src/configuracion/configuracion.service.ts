import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

const CAMPOS_PUBLICOS = {
  id: true, nombre: true, ruc: true, contacto: true,
  email: true, telefono: true, direccion: true, plan: true,
  origen: true, modoDesarrollo: true, fechaVencimiento: true, estado: true,
};

// Límites que el tenant puede ver de su propio plan — subconjunto de PlanSaaS,
// nunca se exponen precios ni campos internos de administración.
const LIMITES_PLAN = {
  maxUsuarios: true, maxProductos: true, maxAlmacenes: true,
  maxProveedores: true, maxClientes: true, maxOrdenesMes: true,
};

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve los campos de configuración de la empresa (no expone campos internos). */
  async findOne(empresaId: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where:  { id: empresaId },
      select: CAMPOS_PUBLICOS,
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    // PlanSaaS no tiene RLS por tenant (igual que Empresa) — se lee directo, sin withTenant().
    const plan = empresa.plan
      ? await this.prisma.planSaaS.findUnique({ where: { id: empresa.plan }, select: LIMITES_PLAN })
      : null;

    return { ...empresa, limites: plan };
  }

  /** Actualiza los campos de configuración editables de la empresa. */
  async update(empresaId: string, dto: UpdateConfiguracionDto) {
    await this.findOne(empresaId); // verifica que existe
    return this.prisma.empresa.update({
      where:  { id: empresaId },
      data:   dto,
      select: CAMPOS_PUBLICOS,
    });
  }
}
