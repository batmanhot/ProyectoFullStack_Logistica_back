import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { assertExists } from '../../common/utils/assert-exists.util';

@Injectable()
export class NegociosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A diferencia de TODO el resto del backend, aquí NUNCA se usa
   * withTenant() — un PlatformAdmin ve todas las empresas a la vez.
   * Empresa no tiene RLS (decisión de Fase 1), así que esto es seguro.
   */
  findAll(filtros: { estado?: string; plan?: string } = {}) {
    return this.prisma.empresa.findMany({
      where: {
        ...(filtros.estado && { estado: filtros.estado }),
        ...(filtros.plan && { plan: filtros.plan }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!empresa) throw new NotFoundException('Negocio no encontrado');
    return empresa;
  }

  /**
   * Crea la Empresa Y su Usuario administrador inicial (rol global 'admin')
   * en una sola transacción — sin esto, un negocio recién creado quedaría
   * sin ningún usuario que pueda iniciar sesión.
   */
  async create(dto: CreateNegocioDto) {
    if (dto.plan) await this.validarPlan(dto.plan);

    const rolAdmin = await this.prisma.rol.findFirst({
      where: { empresaId: null, codigo: 'admin' },
    });
    if (!rolAdmin) {
      throw new BadRequestException(
        'No se encontró el rol base "admin" — corre el seed de Fase 1 antes de crear negocios',
      );
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: {
            codigo: dto.codigo.toLowerCase(),
            nombre: dto.nombre,
            ruc: dto.ruc,
            contacto: dto.contacto,
            email: dto.email,
            telefono: dto.telefono,
            plan: dto.plan ?? 'starter',
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            notas: dto.notas,
            origen: 'admin_saas',
          },
        });

        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nombre: dto.adminNombre,
            email: dto.adminEmail,
            passwordHash,
            rolId: rolAdmin.id,
          },
          select: { id: true, nombre: true, email: true }, // nunca se devuelve passwordHash
        });

        return { ...empresa, usuarioAdminInicial: usuario };
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un negocio con ese código o RUC');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateNegocioDto) {
    await this.findOne(id);
    if (dto.plan) await this.validarPlan(dto.plan);

    try {
      return await this.prisma.empresa.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.ruc !== undefined && { ruc: dto.ruc }),
          ...(dto.contacto !== undefined && { contacto: dto.contacto }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.telefono !== undefined && { telefono: dto.telefono }),
          ...(dto.plan !== undefined && { plan: dto.plan }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
          ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
          ...(dto.notas !== undefined && { notas: dto.notas }),
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un negocio con ese RUC');
      }
      throw e;
    }
  }

  /**
   * Soft-delete — mismo principio que TODO el resto del backend: nunca se
   * borra físicamente una Empresa (arrastraría toda su data por cascada).
   */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.empresa.update({
      where: { id },
      data: { activo: false, estado: 'cancelado' },
    });
  }

  private validarPlan(planId: string) {
    return assertExists(
      () => this.prisma.planSaaS.findUnique({ where: { id: planId } }),
      `El plan "${planId}" no existe en el catálogo de PlanSaaS`,
    );
  }
}
