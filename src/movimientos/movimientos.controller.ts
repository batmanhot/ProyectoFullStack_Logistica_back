import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TipoMovimiento } from '@prisma/client';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { MovimientosService } from './movimientos.service';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';

@Controller()
export class MovimientosController {
  constructor(private readonly movimientosService: MovimientosService) {}

  @Get('movimientos')
  findAll(
    @TenantId() empresaId: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('tipo') tipo?: TipoMovimiento,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.movimientosService.findAll(empresaId, { productoId, almacenId, tipo, desde, hasta });
  }

  @Get('movimientos/:id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.movimientosService.findOne(empresaId, id);
  }

  // Hallazgo Alto #7 (auditoría 2026-07-29): sin esto, cualquier usuario
  // autenticado (sin importar su rol) podía fabricar movimientos de stock.
  @Permiso('movimientos')
  @Post('movimientos')
  create(@TenantId() empresaId: string, @Body() dto: CreateMovimientoDto) {
    return this.movimientosService.create(empresaId, dto);
  }

  /** GET /api/kardex?productoId=&almacenId=&desde=&hasta= */
  @Get('kardex')
  kardex(
    @TenantId() empresaId: string,
    @Query('productoId') productoId: string,
    @Query('almacenId') almacenId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.movimientosService.kardex(empresaId, productoId, almacenId, desde, hasta);
  }
}
