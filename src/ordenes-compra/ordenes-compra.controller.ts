import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { OrdenesCompraService } from './ordenes-compra.service';
import { CreateOrdenCompraDto } from './dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from './dto/update-orden-compra.dto';
import { RecibirOrdenCompraDto } from './dto/recibir-orden-compra.dto';

@Permiso('ordenes')
@Controller('ordenes-compra')
export class OrdenesCompraController {
  constructor(private readonly ordenesCompraService: OrdenesCompraService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.ordenesCompraService.findAll(empresaId, { proveedorId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.ordenesCompraService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateOrdenCompraDto) {
    return this.ordenesCompraService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrdenCompraDto,
  ) {
    return this.ordenesCompraService.update(empresaId, id, dto);
  }

  /** Recepción de mercadería — genera Movimientos ENTRADA reales. */
  @Post(':id/recibir')
  recibir(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: RecibirOrdenCompraDto,
  ) {
    return this.ordenesCompraService.recibir(empresaId, id, dto);
  }
}
