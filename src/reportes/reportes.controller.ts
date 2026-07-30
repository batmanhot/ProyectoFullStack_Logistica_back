import { Controller, Get, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ReportesService } from './reportes.service';

// Acota un query param numérico a un rango razonable — un valor inválido o
// fuera de rango (ej. ?meses=9999) cae al default en vez de disparar un bucle
// sin techo en ReportesService.financiero().
function clamp(valor: string | undefined, min: number, max: number, porDefecto: number): number {
  const n = valor !== undefined ? parseInt(valor, 10) : NaN;
  if (Number.isNaN(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Permiso('financiero')
  @Get('financiero')
  financiero(@TenantId() empresaId: string, @Query('meses') meses?: string) {
    return this.reportesService.financiero(empresaId, clamp(meses, 1, 24, 6));
  }

  @Permiso('kpis')
  @Get('kpis-operativos')
  kpisOperativos(@TenantId() empresaId: string, @Query('dias') dias?: string) {
    return this.reportesService.kpisOperativos(empresaId, clamp(dias, 1, 90, 30));
  }
}
