import { Controller, Get, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { InventarioService } from './inventario.service';

// Sin @Permiso: este controller es un único GET de solo lectura (stock por
// producto/almacén), sin ningún endpoint de escritura que proteger — mismo
// criterio que Almacenes/Categorías/Proyectos (Hallazgo Alto #7, auditoría
// 2026-07-29). Encontrado 2026-09-12: Despachos.jsx y PedidosInternos/
// index.jsx (entre otros) necesitan el stock por almacén para roles que no
// tienen el módulo 'inventario' completo (Despachador, Chofer, Solicitante,
// y ahora también Admin/Gerente de Operaciones tras el Alcance de roles
// 2026-09-11) — con @Permiso a nivel de clase quedaban en 403 silencioso.
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
