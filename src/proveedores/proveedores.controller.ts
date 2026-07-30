import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { PortalProveedorService } from '../portal-proveedor/portal-proveedor.service';

@Permiso('proveedores')
@Controller('proveedores')
export class ProveedoresController {
  constructor(
    private readonly proveedoresService: ProveedoresService,
    private readonly portalProveedorService: PortalProveedorService,
  ) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.proveedoresService.findAll(empresaId, busqueda, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proveedoresService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.proveedoresService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proveedoresService.remove(empresaId, id);
  }

  /**
   * Genera el link de acceso al Portal de Proveedores B2B — un JWT
   * firmado de larga duración, no la contraseña del proveedor (no existe).
   */
  @Post(':id/portal-link')
  generarPortalLink(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.portalProveedorService.generarLink(empresaId, id);
  }
}
