import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { LotesService } from './lotes.service';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';

@Permiso('lotes-series')
@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Get()
  findAll(@TenantId() empresaId: string, @Query('productoId') productoId?: string) {
    return this.lotesService.findAll(empresaId, productoId);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.lotesService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateLoteDto) {
    return this.lotesService.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateLoteDto) {
    return this.lotesService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.lotesService.remove(empresaId, id);
  }
}
