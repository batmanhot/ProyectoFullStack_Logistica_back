import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PortalService } from '../portal/portal.service';

@Permiso('clientes')
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly portalService: PortalService,
  ) {}

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

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateClienteDto) {
    return this.clientesService.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.clientesService.remove(empresaId, id);
  }

  /**
   * Genera el link de acceso al Portal de Clientes (Fase 7e) — un JWT
   * firmado de larga duración, no la contraseña del cliente (no existe).
   */
  @Post(':id/portal-link')
  generarPortalLink(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.portalService.generarLink(empresaId, id);
  }
}
