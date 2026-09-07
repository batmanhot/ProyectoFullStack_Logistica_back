import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { RenovacionesService } from './renovaciones.service';
import { CreateRenovacionDto } from './dto/create-renovacion.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/renovaciones')
export class RenovacionesController {
  constructor(private readonly renovacionesService: RenovacionesService) {}

  @Get()
  findAll(@Query('empresaId') empresaId?: string, @Query('estado') estado?: string) {
    return this.renovacionesService.findAll({ empresaId, estado });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.renovacionesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRenovacionDto) {
    return this.renovacionesService.create(dto);
  }

  @Post(':id/anular')
  anular(@Param('id') id: string) {
    return this.renovacionesService.anular(id);
  }
}
