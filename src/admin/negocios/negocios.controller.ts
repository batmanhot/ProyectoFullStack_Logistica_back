import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { NegociosService } from './negocios.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';

@Public() // bypass del guard de tenant — esta ruta usa PlatformAdminGuard, no JWT por empresa
@UseGuards(PlatformAdminGuard)
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.negociosService.remove(id);
  }
}
