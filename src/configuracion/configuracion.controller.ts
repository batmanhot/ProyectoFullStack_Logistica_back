import { Body, Controller, Get, Patch } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ConfiguracionService } from './configuracion.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  /**
   * GET /api/configuracion — datos de empresa del tenant autenticado.
   * Sin @Permiso() a propósito: usePlanLimits/PlanVencimientoBanner (Fase 0)
   * la llaman para CUALQUIER usuario logueado, no solo admins.
   */
  @Get()
  findOne(@TenantId() empresaId: string) {
    return this.configuracionService.findOne(empresaId);
  }

  /** PATCH /api/configuracion — actualiza nombre, RUC, contacto, etc. */
  @Permiso('configuracion')
  @Patch()
  update(@TenantId() empresaId: string, @Body() dto: UpdateConfiguracionDto) {
    return this.configuracionService.update(empresaId, dto);
  }
}
