import { Controller, HttpCode, Post } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { DatosService } from './datos.service';

// Acciones destructivas de todo el tenant — gateadas bajo 'configuracion',
// que con el catálogo de Fase 2 solo tienen Owner/Admin (vía '*').
@Permiso('configuracion')
@Controller('datos')
export class DatosController {
  constructor(private readonly service: DatosService) {}

  @Post('limpiar-operativos')
  @HttpCode(200)
  limpiarOperativos(@TenantId() empresaId: string) {
    return this.service.limpiarOperativos(empresaId);
  }

  @Post('restaurar-demo')
  @HttpCode(200)
  restaurarDemo(@TenantId() empresaId: string) {
    return this.service.restaurarDemo(empresaId);
  }
}
