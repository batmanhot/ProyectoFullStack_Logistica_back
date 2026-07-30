import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AreasInternasService } from './areas-internas.service';
import { CreateAreaInternaDto } from './dto/create-area-interna.dto';
import { UpdateAreaInternaDto } from './dto/update-area-interna.dto';

@Controller('areas-internas')
export class AreasInternasController {
  constructor(private readonly areasInternasService: AreasInternasService) {}

  @Get()
  findAll(@TenantId() empresaId: string, @Query('incluirInactivas') incluirInactivas?: string) {
    return this.areasInternasService.findAll(empresaId, incluirInactivas === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.areasInternasService.findOne(empresaId, id);
  }

  // Hallazgo Alto #7 (auditoría 2026-07-29): la lectura queda abierta —
  // PedidosInternos.jsx la consulta para el selector de área incluso para
  // el rol 'solicitante' (que solo tiene el permiso 'pedidos-internos') —
  // pero gestionar la estructura de áreas de la empresa requiere permiso propio.
  @Permiso('areas-internas')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateAreaInternaDto) {
    return this.areasInternasService.create(empresaId, dto);
  }

  @Permiso('areas-internas')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAreaInternaDto,
  ) {
    return this.areasInternasService.update(empresaId, id, dto);
  }

  @Permiso('areas-internas')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.areasInternasService.remove(empresaId, id);
  }
}
