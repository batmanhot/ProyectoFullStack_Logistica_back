import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { SeveridadIncidencia } from '@prisma/client';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { IncidenciasService } from './incidencias.service';
import { ResolverIncidenciaDto } from './dto/resolver-incidencia.dto';

/**
 * Registro de incidencias del sistema (excepciones no controladas), al
 * estilo "Registro de eventos de Windows" — ver docs/PROPUESTA-MODULO-PICKING.md
 * como referencia de formato para propuestas de módulo. Alimentado
 * automáticamente por HttpExceptionFilter, solo lectura + marcar resuelta acá.
 */
@Permiso('incidencias')
@Controller('incidencias')
export class IncidenciasController {
  constructor(private readonly incidenciasService: IncidenciasService) {}

  /**
   * GET /api/incidencias
   * Parámetros opcionales: severidad, modulo, resuelto, busqueda, desde (YYYY-MM-DD), hasta (YYYY-MM-DD),
   * page (1-based), pageSize.
   */
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('severidad') severidad?: SeveridadIncidencia,
    @Query('modulo') modulo?: string,
    @Query('resuelto') resuelto?: string,
    @Query('busqueda') busqueda?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.incidenciasService.findAll(
      empresaId,
      {
        severidad,
        modulo,
        resuelto: resuelto === undefined ? undefined : resuelto === 'true',
        busqueda,
        desde,
        hasta,
      },
      { page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined },
    );
  }

  @Patch(':id/resolver')
  marcarResuelta(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ResolverIncidenciaDto,
  ) {
    return this.incidenciasService.marcarResuelta(empresaId, id, dto.notaResolucion);
  }
}
