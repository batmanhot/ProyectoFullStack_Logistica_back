import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { TransportistasService } from './transportistas.service';
import { CreateTransportistaDto } from './dto/create-transportista.dto';
import { UpdateTransportistaDto } from './dto/update-transportista.dto';

@Permiso('transportes')
@Controller('transportistas')
export class TransportistasController {
  constructor(private readonly transportistasService: TransportistasService) {}

  @Get()
  findAll(@TenantId() empresaId: string, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.transportistasService.findAll(empresaId, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.transportistasService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateTransportistaDto) {
    return this.transportistasService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransportistaDto,
  ) {
    return this.transportistasService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.transportistasService.remove(empresaId, id);
  }
}
