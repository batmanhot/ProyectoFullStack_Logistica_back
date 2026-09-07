import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ProyectosService } from './proyectos.service';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { UpdateProyectoDto } from './dto/update-proyecto.dto';

@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  // Lectura abierta a cualquier usuario autenticado — el selector opcional
  // de Pedidos Internos lo necesita incluso para el rol 'solicitante' (que
  // solo tiene el permiso 'pedidos-internos'), mismo criterio que
  // AreaInterna/Almacenes.
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('incluirInactivos') incluirInactivos?: string,
    @Query('estado') estado?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.proyectosService.findAll(empresaId, { incluirInactivos: incluirInactivos === 'true', estado, clienteId });
  }

  // Fase 4 — reporte de consumo por proyecto. Permiso propio
  // ('reportes-proyecto'), distinto de 'proyectos' (gestión del catálogo):
  // Gerente de Operaciones puede ver el reporte sin poder crear/editar/
  // eliminar proyectos o CDR. Debe declararse antes de ':id' para que Nest
  // no lo confunda con un id de proyecto.
  @Permiso('reportes-proyecto')
  @Get('reporte-consumo')
  reporteConsumo(
    @TenantId() empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('proyectoId') proyectoId?: string,
    @Query('cdrId') cdrId?: string,
    @Query('areaId') areaId?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.proyectosService.reporteConsumo(empresaId, { desde, hasta, proyectoId, cdrId, areaId, clienteId });
  }

  @Permiso('reportes-proyecto')
  @Get('pendientes-por-despachar')
  pendientesPorDespachar(
    @TenantId() empresaId: string,
    @Query('proyectoId') proyectoId?: string,
    @Query('cdrId') cdrId?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.proyectosService.pendientesPorDespachar(empresaId, { proyectoId, cdrId, areaId });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proyectosService.findOne(empresaId, id);
  }

  // Solo Admin/Owner gestionan el catálogo (decisión del cliente, 2026-09-04).
  @Permiso('proyectos')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProyectoDto) {
    return this.proyectosService.create(empresaId, dto);
  }

  @Permiso('proyectos')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateProyectoDto) {
    return this.proyectosService.update(empresaId, id, dto);
  }

  @Permiso('proyectos')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proyectosService.remove(empresaId, id);
  }
}
