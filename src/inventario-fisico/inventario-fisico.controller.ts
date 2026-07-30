import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { InventarioFisicoService } from './inventario-fisico.service';
import { CreateInventarioFisicoDto } from './dto/create-inventario-fisico.dto';
import { ActualizarLineaDto } from './dto/actualizar-linea.dto';

@Permiso('inv-fisico')
@Controller('inventario-fisico')
export class InventarioFisicoController {
  constructor(private readonly inventarioFisicoService: InventarioFisicoService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('almacenId') almacenId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.inventarioFisicoService.findAll(empresaId, { almacenId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.inventarioFisicoService.findOne(empresaId, id);
  }

  @Post()
  create(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateInventarioFisicoDto,
  ) {
    return this.inventarioFisicoService.create(empresaId, user.sub, dto);
  }

  @Put(':id/lineas/:productoId')
  actualizarLinea(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('productoId') productoId: string,
    @Body() dto: ActualizarLineaDto,
  ) {
    return this.inventarioFisicoService.actualizarLinea(empresaId, id, productoId, dto);
  }

  /** Genera Movimientos AJUSTE reales por cada diferencia. */
  @Post(':id/cerrar')
  cerrar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.inventarioFisicoService.cerrar(empresaId, id);
  }
}
