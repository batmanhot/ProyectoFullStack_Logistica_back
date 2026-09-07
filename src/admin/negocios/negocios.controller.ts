import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { NegociosService } from './negocios.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { ArchivarNegocioDto } from './dto/archivar-negocio.dto';

@Public() // bypass del guard de tenant — esta ruta usa PlatformAdminGuard, no JWT por empresa
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/negocios')
export class NegociosController {
  constructor(private readonly negociosService: NegociosService) {}

  @Get()
  findAll(@Query('estado') estado?: string, @Query('plan') plan?: string) {
    return this.negociosService.findAll({ estado, plan });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.negociosService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateNegocioDto) {
    return this.negociosService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNegocioDto) {
    return this.negociosService.update(id, dto);
  }

  /** "Cancelar negocio" — soft-delete reversible (ver NegociosService.remove). */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.negociosService.remove(id);
  }

  /** "Eliminar definitivamente" — protegido, exige el nombre del negocio como confirmación. */
  @Post(':id/archivar')
  archivar(@Param('id') id: string, @Body() dto: ArchivarNegocioDto) {
    return this.negociosService.archivar(id, dto.confirmacionNombre);
  }
}
