import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ProformasService } from './proformas.service';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { UpdateProformaDto } from './dto/update-proforma.dto';
import { ConvertirDespachoDto } from './dto/convertir-despacho.dto';

@Permiso('proformas')
@Controller('proformas')
export class ProformasController {
  constructor(private readonly proformasService: ProformasService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.proformasService.findAll(empresaId, { clienteId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proformasService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProformaDto) {
    return this.proformasService.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateProformaDto) {
    return this.proformasService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proformasService.remove(empresaId, id);
  }

  /** Convierte una Proforma ACEPTADA en un Despacho real (con reserva de stock) vía DespachosService. */
  @Post(':id/convertir-despacho')
  convertirADespacho(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ConvertirDespachoDto,
  ) {
    return this.proformasService.convertirADespacho(empresaId, id, dto);
  }
}
