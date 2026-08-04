import { Controller, Delete, Get, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AuditoriaService } from './auditoria.service';

@Permiso('auditoria')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * GET /api/auditoria
   * Parámetros opcionales: busqueda, accion, modulo, usuarioId, desde (YYYY-MM-DD), hasta (YYYY-MM-DD),
   * page (1-based), pageSize.
   */
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda')  busqueda?: string,
    @Query('accion')    accion?: string,
    @Query('modulo')    modulo?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('desde')     desde?: string,
    @Query('hasta')     hasta?: string,
    @Query('page')      page?: string,
    @Query('pageSize')  pageSize?: string,
  ) {
    return this.auditoriaService.findAll(
      empresaId,
      { busqueda, accion, modulo, usuarioId, desde, hasta },
      { page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined },
    );
  }

  /**
   * DELETE /api/auditoria — elimina todos los logs del tenant.
   *
   * Hallazgo Medio #13 (auditoría 2026-07-29): antes compartía el permiso
   * 'auditoria' con la lectura — un futuro rol de solo-lectura habría
   * heredado, sin querer, la capacidad de borrar los logs. Permiso propio
   * de mínimo privilegio; hoy solo lo tienen owner/admin (comodín '*'),
   * igual que antes.
   */
  @Permiso('auditoria-eliminar')
  @Delete()
  limpiar(@TenantId() empresaId: string) {
    return this.auditoriaService.limpiar(empresaId);
  }
}
