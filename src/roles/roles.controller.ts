import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

/**
 * Sin prefijo propio: expone tanto /api/roles/* como /api/permisos/verificar
 * (sección 3.8 del documento histórico BACKEND_PENDIENTES.md, vigente para Fase 1).
 */
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Permiso('usuarios')
  @Get('roles')
  findAll(@TenantId() empresaId: string) {
    return this.rolesService.findAll(empresaId);
  }

  @Permiso('usuarios')
  @Get('roles/:id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.rolesService.findOne(empresaId, id);
  }

  @Permiso('usuarios')
  @Post('roles')
  create(@TenantId() empresaId: string, @Body() dto: CreateRolDto) {
    return this.rolesService.create(empresaId, dto);
  }

  @Permiso('usuarios')
  @Put('roles/:id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRolDto,
  ) {
    return this.rolesService.update(empresaId, id, dto);
  }

  @Permiso('usuarios')
  @Delete('roles/:id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.rolesService.remove(empresaId, id);
  }

  // Sin @Permiso() a propósito: cualquier usuario autenticado debe poder
  // consultar su propio permiso — gatearla detrás del módulo que verifica
  // sería circular (ver plan de Fase 3).
  @Get('permisos/verificar')
  verificarPermiso(
    @TenantId() empresaId: string,
    @Query('rolId') rolId: string,
    @Query('modulo') modulo: string,
  ) {
    return this.rolesService.verificarPermiso(empresaId, rolId, modulo);
  }
}
