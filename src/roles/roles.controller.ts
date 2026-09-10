import { Controller, Get, Param, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { RolesService } from './roles.service';

/**
 * Sin prefijo propio: expone tanto /api/roles/* como /api/permisos/verificar
 * (sección 3.8 del documento histórico BACKEND_PENDIENTES.md, vigente para Fase 1).
 *
 * SOLO LECTURA desde el tenant (2026-09-10): el catálogo de roles —tanto el
 * base (`empresaId null`) como los roles propios del negocio— lo gobierna
 * ÚNICAMENTE el SuperAdmin en `/admin/roles-base` (panel "Roles del sistema").
 * El tenant asigna roles a sus usuarios y consulta qué concede cada uno, nada
 * más. Ya no hay `POST`/`PUT`/`DELETE /roles`.
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
