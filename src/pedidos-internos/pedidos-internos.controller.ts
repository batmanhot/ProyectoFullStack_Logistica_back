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
