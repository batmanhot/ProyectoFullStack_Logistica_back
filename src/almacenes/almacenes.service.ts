import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlmacenDto } from './dto/create-almacen.dto';
import { UpdateAlmacenDto } from './dto/update-almacen.dto';

// Campos que el tenant puede escribir en un Almacén. `nombre` va aparte en
// create() (es obligatorio); el resto es la ubicación física opcional que
// alimenta la Torre de Control de Almacenes. Un valor `null` explícito limpia la
// columna; `undefined` la deja como está.
const CAMPOS_EDITABLES = [
  'nombre',
  'activo',
  'direccion',
  'ciudad',
  'region',
  'pais',
  'latitud',
  'longitud',
  'responsable',
  'telefono',
] as const;

@Injectable()
export class AlmacenesService {
  constructor(private readonly prisma: PrismaService) {}

  private soloDefinidos(dto: CreateAlmacenDto | UpdateAlmacenDto) {
    const data: Record<string, unknown> = {};
    for (const campo of CAMPOS_EDITABLES) {
      if ((dto as Record<string, unknown>)[campo] !== undefined) {
        data[campo] = (dto as Record<string, unknown>)[campo];
      }
    }
    return data;
  }

  findAll(empresaId: string, busqueda?: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.findMany({
        where: {
          empresaId,
          ...(busqueda && { nombre: { contains: busqueda, mode: 'insensitive' } }),
          ...(!incluirInactivos && { activo: true }),
        },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const almacen = await this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.findFirst({ where: { id, empresaId } }),
    );
    if (!almacen) throw new NotFoundException('Almacén no encontrado');
    return almacen;
  }

  create(empresaId: string, dto: CreateAlmacenDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.create({ data: { empresaId, ...this.soloDefinidos(dto), nombre: dto.nombre } }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateAlmacenDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.update({ where: { id }, data: this.soloDefinidos(dto) }),
    );
  }

  /** Soft-delete: nunca borra la fila — Inventario/Movimientos (Fase 3) la referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.update({ where: { id }, data: { activo: false } }),
    );
  }
}
