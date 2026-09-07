import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { CdrService } from './cdr.service';
import { CreateCdrDto } from './dto/create-cdr.dto';
import { UpdateCdrDto } from './dto/update-cdr.dto';

@Controller('cdr')
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  // Lectura abierta a cualquier usuario autenticado — igual que
  // AreaInterna/Almacenes: Proyectos.jsx y el selector de Pedidos Internos
  // necesitan listar CDR sin exigir el permiso de gestión.
  @Get()
  findAll(@TenantId() empresaId: string, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.cdrService.findAll(empresaId, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cdrService.findOne(empresaId, id);
  }

  // Solo Admin/Owner gestionan el catálogo (decisión del cliente,
  // 2026-09-04) — sin @SoloRoles: al no otorgarle 'proyectos' a ningún otro
  // rol en el seed, el permiso de módulo ya alcanza (PermisosGuard deja
  // pasar el comodín '*' de Owner/Admin, y nadie más lo tiene).
  @Permiso('proyectos')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateCdrDto) {
    return this.cdrService.create(empresaId, dto);
  }

  @Permiso('proyectos')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateCdrDto) {
    return this.cdrService.update(empresaId, id, dto);
  }

  @Permiso('proyectos')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cdrService.remove(empresaId, id);
  }
}
