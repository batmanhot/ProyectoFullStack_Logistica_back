import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { LotesService } from './lotes.service';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  // Lectura abierta — mismo criterio que Ordenes de Compra (ver comentario
  // ahí): Alertas.jsx y los dashboards de Almacenero/Supervisor calculan
  // alertas de "lote por vencer" para cualquier rol que no sea especial —
  // Admin y Gerente de Operaciones (ya no tienen 'lotes-series' desde el
  // Alcance de roles 2026-09-11) y Despachador/Analista de Compras (nunca
  // lo tuvieron) perdían esas alertas en silencio.
  @Get()
  findAll(@TenantId() empresaId: string, @Query('productoId') productoId?: string) {
    return this.lotesService.findAll(empresaId, productoId);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.lotesService.findOne(empresaId, id);
  }

  @Permiso('lotes-series')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateLoteDto) {
    return this.lotesService.create(empresaId, dto);
  }

  @Permiso('lotes-series')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateLoteDto) {
    return this.lotesService.update(empresaId, id, dto);
  }

  @Permiso('lotes-series')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.lotesService.remove(empresaId, id);
  }
}
