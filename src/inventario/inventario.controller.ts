import { Controller, Get, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { InventarioService } from './inventario.service';

@Permiso('inventario')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.inventarioService.findAll(empresaId, { productoId, almacenId });
  }
}
