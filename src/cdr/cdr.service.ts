import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCdrDto } from './dto/create-cdr.dto';
import { UpdateCdrDto } from './dto/update-cdr.dto';

@Injectable()
export class CdrService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cDR.findMany({
        where: { empresaId, ...(!incluirInactivos && { activo: true }) },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const cdr = await this.prisma.withTenant(empresaId, (tx) => tx.cDR.findFirst({ where: { id, empresaId } }));
    if (!cdr) throw new NotFoundException('CDR no encontrado');
    return cdr;
  }

  async create(empresaId: string, dto: CreateCdrDto) {
    try {
      return await this.prisma.withTenant(empresaId, (tx) => tx.cDR.create({ data: { empresaId, ...dto } }));
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un CDR con ese código en esta empresa');
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateCdrDto) {
    await this.findOne(empresaId, id);
    try {
      return await this.prisma.withTenant(empresaId, (tx) => tx.cDR.update({ where: { id }, data: dto }));
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un CDR con ese código en esta empresa');
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — Proyecto la referencia por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) => tx.cDR.update({ where: { id }, data: { activo: false } }));
  }
}
