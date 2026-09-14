import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AtencionesAlertaService } from './atenciones-alerta.service';
import { MarcarAtendidaDto } from './dto/marcar-atendida.dto';

/**
 * Centro de Alertas (tenant) — seguimiento de atención (2026-09-13). Las
 * alertas se calculan en vivo en el frontend a partir de datos reales
 * (stock, OC, despachos, etc. — ver utils/alertas.js); acá solo se registra
 * que un responsable la ATENDIÓ y qué acción tomó. Gateado por 'alertas' —
 * el mismo permiso que abre la pantalla de Alertas, así que cualquiera que
 * puede ver una alerta puede marcarla atendida, y nadie más.
 */
@Permiso('alertas')
@Controller('alertas/atenciones')
export class AtencionesAlertaController {
  constructor(private readonly atenciones: AtencionesAlertaService) {}

  @Get()
  listar(@TenantId() empresaId: string) {
    return this.atenciones.listar(empresaId);
  }

  @Post()
  marcarAtendida(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: MarcarAtendidaDto,
  ) {
    return this.atenciones.marcarAtendida(empresaId, user.sub, dto);
  }

  @Delete(':tipo/:clave')
  reabrir(@TenantId() empresaId: string, @Param('tipo') tipo: string, @Param('clave') clave: string) {
    return this.atenciones.reabrir(empresaId, tipo, clave);
  }
}
