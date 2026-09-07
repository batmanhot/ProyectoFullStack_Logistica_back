import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { AlmacenesService } from './almacenes.service';
import { CreateAlmacenDto } from './dto/create-almacen.dto';
import { UpdateAlmacenDto } from './dto/update-almacen.dto';

@Controller('almacenes')
export class AlmacenesController {
  constructor(private readonly almacenesService: AlmacenesService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.almacenesService.findAll(empresaId, busqueda, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.almacenesService.findOne(empresaId, id);
  }

  // Hallazgo Alto #7 (auditoría 2026-07-29): la lectura queda abierta (se
  // consulta desde muchas pantallas, para cualquier rol autenticado — mismo
  // patrón que el resto de catálogos), pero crear/editar/borrar un almacén
  // completo requiere permiso explícito.
  // Auditoría 2026-09-04: 'almacenes' pasó a ser todo-o-nada también para
  // Ejecutivo Comercial (necesitaba SOLO listar almacenes para el selector
  // de Portal de Pedidos, ver oportunidades del mismo día) — @SoloRoles
  // acota crear/editar/eliminar a quien ya gestionaba esto de verdad
  // (Supervisor de Almacén "por definición", Gerente de Operaciones).
  @Permiso('almacenes')
  @SoloRoles('gerente-operaciones', 'supervisor')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateAlmacenDto) {
    return this.almacenesService.create(empresaId, dto);
  }

  @Permiso('almacenes')
  @SoloRoles('gerente-operaciones', 'supervisor')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateAlmacenDto) {
    return this.almacenesService.update(empresaId, id, dto);
  }

  @Permiso('almacenes')
  @SoloRoles('gerente-operaciones', 'supervisor')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.almacenesService.remove(empresaId, id);
  }
}
