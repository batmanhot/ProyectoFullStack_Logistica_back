import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AprobacionesService } from './aprobaciones.service';
import { ActualizarReglaAprobacionDto } from './dto/actualizar-regla-aprobacion.dto';

/**
 * Configuración → Aprobaciones (tenant). Qué rol(es) aprueban cada proceso.
 * Ver AprobacionGuard + `@Aprobacion(proceso)` en los controllers de negocio.
 */
@Permiso('configuracion')
@Controller('aprobaciones')
export class AprobacionesController {
  constructor(private readonly aprobaciones: AprobacionesService) {}

  @Get('reglas')
  listar(@TenantId() empresaId: string) {
    return this.aprobaciones.listar(empresaId);
  }

  @Put('reglas/:proceso')
  actualizar(
    @TenantId() empresaId: string,
    @Param('proceso') proceso: string,
    @Body() dto: ActualizarReglaAprobacionDto,
  ) {
    return this.aprobaciones.actualizar(empresaId, proceso, dto.rolesAprobadores);
  }
}
