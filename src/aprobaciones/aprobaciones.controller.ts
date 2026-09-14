import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AprobacionesService } from './aprobaciones.service';
import { ActualizarReglaAprobacionDto } from './dto/actualizar-regla-aprobacion.dto';

/**
 * Configuración → Aprobaciones (tenant). Qué rol(es) aprueban cada proceso.
 * Ver AprobacionGuard + `@Aprobacion(proceso)` en los controllers de negocio.
 *
 * Sin @Permiso a nivel de clase (antes 'configuracion' cubría todo el
 * controller) — `listar()` solo devuelve qué rol(es) aprueban cada proceso
 * (nada sensible), y lo necesita cualquier usuario autenticado del tenant
 * para saber si SU rol es aprobador (Alertas.jsx dispara "Pendiente de
 * aprobación" solo a quien realmente puede aprobar, sin depender del
 * permiso 'configuracion' que la mayoría de roles operativos no tiene).
 * Editar la regla sigue exclusivo de 'configuracion'.
 */
@Controller('aprobaciones')
export class AprobacionesController {
  constructor(private readonly aprobaciones: AprobacionesService) {}

  @Get('reglas')
  listar(@TenantId() empresaId: string) {
    return this.aprobaciones.listar(empresaId);
  }

  @Permiso('configuracion')
  @Put('reglas/:proceso')
  actualizar(
    @TenantId() empresaId: string,
    @Param('proceso') proceso: string,
    @Body() dto: ActualizarReglaAprobacionDto,
  ) {
    return this.aprobaciones.actualizar(empresaId, proceso, dto.rolesAprobadores);
  }
}
