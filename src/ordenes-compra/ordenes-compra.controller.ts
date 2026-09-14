import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { OrdenesCompraService } from './ordenes-compra.service';
import { CreateOrdenCompraDto } from './dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from './dto/update-orden-compra.dto';
import { RecibirOrdenCompraDto } from './dto/recibir-orden-compra.dto';
import { CreateGastoImportacionDto } from './dto/create-gasto-importacion.dto';
import { ActualizarEstadoLogisticoDto } from './dto/actualizar-estado-logistico.dto';

@Controller('ordenes-compra')
export class OrdenesCompraController {
  constructor(private readonly ordenesCompraService: OrdenesCompraService) {}

  // Lectura abierta — mismo criterio que Almacenes/Categorías/Proveedores/
  // Productos (Hallazgo Alto #7, auditoría 2026-07-29). Encontrado
  // 2026-09-12: Alertas.jsx calcula "OC pendiente hace X días" para
  // cualquier rol que no sea chofer/ejecutivo-comercial/coordinador-
  // transporte/contable — eso incluye Admin y Gerente de Operaciones (ya no
  // tienen 'ordenes' desde el Alcance de roles 2026-09-11), Supervisor y
  // Despachador (nunca lo tuvieron): con @Permiso a nivel de clase, esos
  // roles perdían en silencio las alertas de compras sin ningún aviso.
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

  @Permiso('ordenes')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateOrdenCompraDto) {
    return this.ordenesCompraService.create(empresaId, dto);
  }

  @Permiso('ordenes')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrdenCompraDto,
  ) {
    return this.ordenesCompraService.update(empresaId, id, dto);
  }

  /** Recepción de mercadería — genera Movimientos ENTRADA reales. */
  @Permiso('ordenes')
  @Post(':id/recibir')
  recibir(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: RecibirOrdenCompraDto,
  ) {
    return this.ordenesCompraService.recibir(empresaId, id, dto);
  }

  /** Módulo de Importación — agrega un gasto (flete, seguro, aduana...) a la OC. */
  @Permiso('ordenes')
  @Post(':id/gastos-importacion')
  agregarGasto(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: CreateGastoImportacionDto,
  ) {
    return this.ordenesCompraService.agregarGastoImportacion(empresaId, id, dto);
  }

  @Permiso('ordenes')
  @Delete(':id/gastos-importacion/:gastoId')
  eliminarGasto(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('gastoId') gastoId: string,
  ) {
    return this.ordenesCompraService.eliminarGastoImportacion(empresaId, id, gastoId);
  }

  /** Avanza el estado logístico (EN_ORIGEN → ... → NACIONALIZADA); nacionalizar calcula el landed cost. */
  @Permiso('ordenes')
  @Patch(':id/estado-logistico')
  actualizarEstadoLogistico(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarEstadoLogisticoDto,
  ) {
    return this.ordenesCompraService.actualizarEstadoLogistico(empresaId, id, dto);
  }
}
