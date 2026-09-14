import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { Aprobacion } from '../common/decorators/aprobacion.decorator';
import { DespachosService } from './despachos.service';
import { CreateDespachoDto } from './dto/create-despacho.dto';
import { UpdateDespachoDto } from './dto/update-despacho.dto';
import { DespacharDto } from './dto/despachar.dto';
import { EntregarDto } from './dto/entregar.dto';
import { AsignarGuiaDto } from './dto/asignar-guia.dto';

// Sin @Permiso a nivel de clase (antes 'despachos' cubría todo el
// controller) — Admin Tenant necesita poder aprobar Despachos SIN el resto
// del módulo (crear, picking, despachar, etc.), así que cada endpoint
// declara su propio permiso, mismo patrón que proyectos.controller.ts
// ('reportes-proyecto' vs 'proyectos'). findAll/findOne aceptan el permiso
// completo O el angosto de aprobar, para que quien solo aprueba pueda ver
// la lista/detalle de todos modos.
@Controller('despachos')
export class DespachosController {
  constructor(private readonly despachosService: DespachosService) {}

  @Permiso(['despachos', 'despachos-aprobar'])
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: string,
    @Query('transportistaId') transportistaId?: string,
  ) {
    return this.despachosService.findAll(empresaId, { clienteId, estado, transportistaId });
  }

  @Permiso(['despachos', 'despachos-aprobar'])
  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.findOne(empresaId, id);
  }

  @Permiso('despachos')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateDespachoDto) {
    return this.despachosService.create(empresaId, dto);
  }

  @Permiso('despachos')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateDespachoDto) {
    return this.despachosService.update(empresaId, id, dto);
  }

  // #11b: por defecto lo aprueba cualquiera con el permiso 'despachos' (lista
  // vacía en ReglaAprobacion). El tenant puede restringirlo en Configuración
  // → Aprobaciones. 'despachos-aprobar' es el permiso angosto: Admin Tenant
  // aprueba sin tener el módulo completo.
  @Permiso(['despachos', 'despachos-aprobar'])
  @Aprobacion('DESPACHO')
  @Post(':id/aprobar')
  aprobar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.aprobar(empresaId, id);
  }

  @Permiso('despachos')
  @Post(':id/picking')
  iniciarPicking(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.iniciarPicking(empresaId, id);
  }

  @Permiso('despachos')
  @Post(':id/listo')
  marcarListo(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.marcarListo(empresaId, id);
  }

  /** Genera Movimientos SALIDA reales y libera la reserva de stock. */
  @Permiso('despachos')
  @Post(':id/despachar')
  despachar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: DespacharDto) {
    return this.despachosService.despachar(empresaId, id, dto);
  }

  @Permiso('despachos')
  @Post(':id/entregar')
  entregar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: EntregarDto) {
    return this.despachosService.entregar(empresaId, id, dto);
  }

  @Permiso('despachos')
  @Post(':id/cancelar')
  cancelar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.cancelar(empresaId, id);
  }

  /** Asigna guiaNumero a un despacho que salió sin ella (p. ej. despachado vía Ruta). */
  @Permiso('despachos')
  @Put(':id/guia')
  asignarGuia(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: AsignarGuiaDto) {
    return this.despachosService.asignarGuia(empresaId, id, dto.guiaNumero);
  }
}
