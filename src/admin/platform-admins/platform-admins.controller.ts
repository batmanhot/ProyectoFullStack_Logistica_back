import { Body, Controller, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { CurrentPlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import type { PlatformAdminPayload } from '../../common/guards/platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { UpdatePlatformAdminDto } from './dto/update-platform-admin.dto';

/**
 * Gobierno de plataforma (regla de negocio 2026-09-04): como máximo 2
 * PlatformAdmin registrados en todo el sistema — el propio SuperAdmin
 * administra quiénes cumplen ese rol.
 */
@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/platform-admins')
export class PlatformAdminsController {
  constructor(private readonly platformAdminsService: PlatformAdminsService) {}

  @Get()
  findAll() {
    return this.platformAdminsService.findAll();
  }

  @Post()
  create(@Body() dto: CreatePlatformAdminDto) {
    return this.platformAdminsService.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAdminDto,
    @CurrentPlatformAdmin() actor: PlatformAdminPayload,
  ) {
    return this.platformAdminsService.update(id, dto, actor.sub);
  }
}
