import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('incluirInactivas') incluirInactivas?: string,
  ) {
    return this.categoriasService.findAll(empresaId, busqueda, incluirInactivas === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.categoriasService.findOne(empresaId, id);
  }

  // Hallazgo Alto #7 (auditoría 2026-07-29): igual criterio que Almacenes —
  // lectura abierta, mutación con permiso explícito.
  @Permiso('categorias')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateCategoriaDto) {
    return this.categoriasService.create(empresaId, dto);
  }

  @Permiso('categorias')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.categoriasService.update(empresaId, id, dto);
  }

  /** Soft-delete (sección acordada: nunca borrar la fila). */
  @Permiso('categorias')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.categoriasService.remove(empresaId, id);
  }
}
