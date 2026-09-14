import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PortalService } from '../portal/portal.service';

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly portalService: PortalService,
  ) {}

  // Lectura abierta — mismo criterio y mismo motivo que Proveedores/
  // Almacenes/Categorías/Proyectos (Hallazgo Alto #7, auditoría 2026-07-29):
  // Despachos.jsx necesita listar clientes para roles que operan despachos
  // (Almacenero, Despachador, Chofer) pero no gestionan el catálogo de
  // Clientes — con @Permiso a nivel de clase quedaban con el selector vacío.
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.clientesService.findAll(empresaId, busqueda, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.clientesService.findOne(empresaId, id);
  }

  @Permiso('clientes')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateClienteDto) {
    return this.clientesService.create(empresaId, dto);
  }

  @Permiso('clientes')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(empresaId, id, dto);
  }

  @Permiso('clientes')
  @SoloRoles('gerente-operaciones')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.clientesService.remove(empresaId, id);
  }

  /**
   * Genera el link de acceso al Portal de Clientes (Fase 7e) — un JWT
   * firmado de larga duración, no la contraseña del cliente (no existe).
   * Sigue exigiendo 'clientes' (a diferencia de la lectura): crea un acceso
   * externo, no es un simple catálogo de referencia.
   */
  @Permiso('clientes')
  @Post(':id/portal-link')
  generarPortalLink(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.portalService.generarLink(empresaId, id);
  }
}
