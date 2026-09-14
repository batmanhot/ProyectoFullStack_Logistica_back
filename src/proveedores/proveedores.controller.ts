import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { PortalProveedorService } from '../portal-proveedor/portal-proveedor.service';

@Controller('proveedores')
export class ProveedoresController {
  constructor(
    private readonly proveedoresService: ProveedoresService,
    private readonly portalProveedorService: PortalProveedorService,
  ) {}

  // La lectura queda abierta (se consulta desde muchas pantallas — Inventario,
  // Entradas, Órdenes de Compra, Cotizaciones, Devoluciones — para cualquier
  // rol autenticado, mismo patrón que Almacenes/Categorías/Proyectos,
  // Hallazgo Alto #7 de la auditoría 2026-07-29). Antes tenía @Permiso a
  // nivel de clase: un Almacenero (permiso 'inventario'/'entradas' pero sin
  // 'proveedores') se topaba con un 403 silencioso al listar proveedores y
  // veía el selector vacío ("Sin proveedor") pese a haber proveedores
  // registrados — bug real reportado 2026-09-12.
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

  @Permiso('proveedores')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(empresaId, dto);
  }

  @Permiso('proveedores')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.proveedoresService.update(empresaId, id, dto);
  }

  @Permiso('proveedores')
  @SoloRoles('gerente-operaciones')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.proveedoresService.remove(empresaId, id);
  }

  /**
   * Genera el link de acceso al Portal de Proveedores B2B — un JWT
   * firmado de larga duración, no la contraseña del proveedor (no existe).
   * Sigue exigiendo 'proveedores' (a diferencia de la lectura): crea un
   * acceso externo, no es un simple catálogo de referencia.
   */
  @Permiso('proveedores')
  @Post(':id/portal-link')
  generarPortalLink(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.portalProveedorService.generarLink(empresaId, id);
  }
}
