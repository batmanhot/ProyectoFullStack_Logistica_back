import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { TransportistasService } from './transportistas.service';
import { CreateTransportistaDto } from './dto/create-transportista.dto';
import { UpdateTransportistaDto } from './dto/update-transportista.dto';

@Controller('transportistas')
export class TransportistasController {
  constructor(private readonly transportistasService: TransportistasService) {}

  // Lectura abierta — mismo criterio que Proveedores/Clientes/Almacenes
  // (Hallazgo Alto #7, auditoría 2026-07-29): Despachos.jsx necesita listar
  // transportistas para asignar guía, incluso para roles como Almacenero que
  // operan despachos pero no tienen el módulo 'transportes' completo. Antes
  // el @Permiso a nivel de clase les dejaba el selector vacío.
  @Get()
  findAll(@TenantId() empresaId: string, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.transportistasService.findAll(empresaId, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.transportistasService.findOne(empresaId, id);
  }

  // Auditoría 2026-09-04: 'transportes' es el mismo permiso de Rutas/
  // Despachos — lo tiene también Chofer, a quien el frontend le oculta la
  // gestión de Transportistas ("no administra el módulo", ver seed.ts) pero
  // el backend no lo hacía cumplir: podía crear/editar/eliminar
  // transportistas llamando la API directo. @SoloRoles cierra ese hueco sin
  // tocarle nada a Coordinador de Transporte, que sí gestiona esto de verdad.
  // Admin (Alcance de roles 2026-09-11) gestiona este catálogo estructural
  // igual que Almacenes/Categorías/Áreas Internas/Proyectos.
  @Permiso('transportes')
  @SoloRoles('gerente-operaciones', 'coordinador-transporte', 'admin')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateTransportistaDto) {
    return this.transportistasService.create(empresaId, dto);
  }

  @Permiso('transportes')
  @SoloRoles('gerente-operaciones', 'coordinador-transporte', 'admin')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransportistaDto,
  ) {
    return this.transportistasService.update(empresaId, id, dto);
  }

  @Permiso('transportes')
  @SoloRoles('gerente-operaciones', 'coordinador-transporte', 'admin')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.transportistasService.remove(empresaId, id);
  }
}
