import { Controller, Get, Query } from '@nestjs/common';
import { TipoMovimiento } from '@prisma/client';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { PanelAuditoriaService } from './panel-auditoria.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CuentasPorCobrarService } from '../cuentas-por-cobrar/cuentas-por-cobrar.service';

/**
 * Panel de solo lectura para el rol Auditor (ver propuesta aprobada).
 * A propósito, este controller NO tiene ninguna ruta POST/PUT/DELETE — no
 * hay nada que "bloquear" para escritura porque estructuralmente no existe.
 * Reusa los services de otros módulos tal cual, nunca sus rutas de escritura.
 */
@Permiso('panel-auditoria')
@Controller('panel-auditoria')
export class PanelAuditoriaController {
  constructor(
    private readonly panelAuditoriaService: PanelAuditoriaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly movimientosService: MovimientosService,
    private readonly cuentasPorCobrarService: CuentasPorCobrarService,
  ) {}

  @Get('bitacora')
  bitacora(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('accion') accion?: string,
    @Query('modulo') modulo?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.auditoriaService.findAll(empresaId, { busqueda, accion, modulo, usuarioId, desde, hasta });
  }

  @Get('discrepancias')
  discrepancias(@TenantId() empresaId: string, @Query('almacenId') almacenId?: string) {
    return this.panelAuditoriaService.discrepancias(empresaId, { almacenId });
  }

  @Get('movimientos')
  movimientos(
    @TenantId() empresaId: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('tipo') tipo?: TipoMovimiento,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.movimientosService.findAll(empresaId, { productoId, almacenId, tipo, desde, hasta });
  }

  @Get('cxc')
  cxc(@TenantId() empresaId: string, @Query('estado') estado?: string) {
    return this.cuentasPorCobrarService.findAll(empresaId, { estado });
  }
}
