import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AuditoriaPlataformaService } from './auditoria-plataforma.service';

// Sin PlatformAuditInterceptor a propósito: es de solo lectura (GET), y el
// interceptor ya ignora GET — no hay nada que auditar acá.
@Public()
@UseGuards(PlatformAdminGuard)
@Controller('admin/auditoria')
export class AuditoriaPlataformaController {
  constructor(private readonly auditoriaService: AuditoriaPlataformaService) {}

  @Get()
  findAll(
    @Query('limite') limite?: string,
    @Query('empresaId') empresaId?: string,
    @Query('recurso') recurso?: string,
  ) {
    return this.auditoriaService.findAll({
      limite: limite ? Number(limite) : undefined,
      empresaId,
      recurso,
    });
  }
}
