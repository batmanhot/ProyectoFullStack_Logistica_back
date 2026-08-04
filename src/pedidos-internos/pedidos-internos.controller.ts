import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { PedidosInternosService } from './pedidos-internos.service';
import { CreatePedidoInternoDto } from './dto/create-pedido-interno.dto';
import { UpdatePedidoInternoDto } from './dto/update-pedido-interno.dto';
import { AprobarPedidoDto, RechazarPedidoDto } from './dto/aprobar-rechazar.dto';

@Permiso('pedidos-internos')
@Controller('pedidos-internos')
export class PedidosInternosController {
  constructor(private readonly pedidosInternosService: PedidosInternosService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('areaId') areaId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.pedidosInternosService.findAll(empresaId, { areaId, estado });
  }

  /**
   * Catálogo mínimo (id/sku/nombre/unidad — sin costos ni stock) de productos
   * activos para armar la solicitud. El rol 'solicitante' no tiene el permiso
   * 'inventario' que exige GET /productos, pero sí necesita elegir qué pedir;
   * esta ruta vive gateada por el mismo @Permiso('pedidos-internos') del
   * controller, así que no amplía lo que ese rol puede ver. Debe declararse
   * antes de ':id' para que Nest no la confunda con un id de pedido.
   */
  @Get('productos-disponibles')
  productosDisponibles(@TenantId() empresaId: string) {
    return this.pedidosInternosService.productosDisponibles(empresaId);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.pedidosInternosService.findOne(empresaId, id);
  }

  @Post()
  create(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: CreatePedidoInternoDto,
  ) {
    return this.pedidosInternosService.create(empresaId, user.sub, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePedidoInternoDto,
  ) {
    return this.pedidosInternosService.update(empresaId, id, dto);
  }

  @Post(':id/enviar')
  enviar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.pedidosInternosService.enviar(empresaId, id);
  }

  @Post(':id/aprobar')
  aprobar(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: AprobarPedidoDto,
  ) {
    return this.pedidosInternosService.aprobar(empresaId, id, user.sub, dto);
  }

  @Post(':id/rechazar')
  rechazar(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: RechazarPedidoDto,
  ) {
    return this.pedidosInternosService.rechazar(empresaId, id, user.sub, dto);
  }

  @Post(':id/picking')
  marcarPicking(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.pedidosInternosService.marcarPicking(empresaId, id);
  }

  /** Genera Movimientos SALIDA reales por cada ítem. */
  @Post(':id/entregar')
  entregar(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.pedidosInternosService.entregar(empresaId, id, user.sub);
  }

  @Post(':id/confirmar-recibo')
  confirmarRecibo(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.pedidosInternosService.confirmarRecibo(empresaId, id);
  }
}
