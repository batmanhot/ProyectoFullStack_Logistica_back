import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanesService {
  constructor(private readonly prisma: PrismaService) {}

  /** soloPublicos: para el catálogo público (landing) — oculta planes a medida (esPublico=false). */
  findAll(incluirInactivos = false, soloPublicos = false) {
    return this.prisma.planSaaS.findMany({
      where: {
        ...(!incluirInactivos && { activo: true }),
        ...(soloPublicos && { esPublico: true }),
      },
      orderBy: { precioMensual: 'asc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.planSaaS.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    try {
      return await this.prisma.planSaaS.create({ data: dto });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException(`Ya existe un plan con id "${dto.id}"`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);
    return this.prisma.planSaaS.update({ where: { id }, data: dto });
  }

  /** Soft-delete: nunca se borra — RenovacionPlan/Empresa.plan lo referencian. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.planSaaS.update({ where: { id }, data: { activo: false } });
  }
}
