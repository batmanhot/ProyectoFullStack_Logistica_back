import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AuditoriaPlataformaService } from './auditoria-plataforma.service';

// Sin PlatformAuditInterceptor a propósito: es de solo lectura (GET).
@Public()
@UseGuards(PlatformAdminGuard)
@Controller('admin/auditoria')
export class AuditoriaPlataformaController {
  constructor(private readonly auditoriaService: AuditoriaPlataformaService) {}

  @Get()
  findAll(
    @Query('tipo') tipo?: string,
    @Query('busqueda') busqueda?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.auditoriaService.findAll({
      tipo,
      busqueda,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      desde,
      hasta,
    });
  }

  @Get('resumen')
  resumen() {
    return this.auditoriaService.resumen();
  }

  /** Ámbito "Sistema logístico": la auditoría operativa de los negocios. */
  @Get('sistema')
  sistema(
    @Query('empresaId') empresaId?: string,
    @Query('busqueda') busqueda?: string,
    @Query('accion') accion?: string,
    @Query('modulo') modulo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.auditoriaService.sistema({
      empresaId,
      busqueda,
      accion,
      modulo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      desde,
      hasta,
    });
  }
}
