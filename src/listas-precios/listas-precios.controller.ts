import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { ListasPreciosService } from './listas-precios.service';
import { CreateListaPreciosDto } from './dto/create-lista-precios.dto';
import { UpdateListaPreciosDto } from './dto/update-lista-precios.dto';

@Controller('listas-precios')
export class ListasPreciosController {
  constructor(private readonly service: ListasPreciosService) {}

  // Lectura abierta — mismo criterio que Almacenes/Categorías/Proveedores/
  // Clientes/Transportistas/Productos (Hallazgo Alto #7, auditoría
  // 2026-07-29). Encontrado 2026-09-12 al auditar el mismo tipo de bug que
  // Proveedores: Clientes.jsx asigna una lista de precios al crear/editar un
  // cliente, y Coordinador de Transporte tiene el módulo completo 'clientes'
  // pero no 'lista-precios' — con @Permiso a nivel de clase ese selector
  // quedaba vacío pese a haber listas de precios reales.
  @Get()
  findAll(@TenantId() empresaId: string) {
    return this.service.findAll(empresaId);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.findOne(empresaId, id);
  }

  // Auditoría 2026-09-04: 'lista-precios' lo tiene también Ejecutivo
  // Comercial (necesita CONSULTAR listas para cotizar en Proformas), pero
  // definir la estructura de precios/descuentos es política comercial de
  // gestión, no del vendedor individual — decisión explícita del cliente.
  @Permiso('lista-precios')
  @SoloRoles('gerente-operaciones')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateListaPreciosDto) {
    return this.service.create(empresaId, dto);
  }

  @Permiso('lista-precios')
  @SoloRoles('gerente-operaciones')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateListaPreciosDto) {
    return this.service.update(empresaId, id, dto);
  }

  @Permiso('lista-precios')
  @SoloRoles('gerente-operaciones')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.remove(empresaId, id);
  }

  @Permiso('lista-precios')
  @SoloRoles('gerente-operaciones')
  @Patch(':id/precio/:productoId')
  setPrecio(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('productoId') productoId: string,
    @Body() body: { precio: number | null },
  ) {
    return this.service.setPrecioProducto(empresaId, id, productoId, body.precio);
  }

  @Permiso('lista-precios')
  @SoloRoles('gerente-operaciones')
  @Post(':id/duplicar')
  duplicar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.duplicar(empresaId, id);
  }
}
