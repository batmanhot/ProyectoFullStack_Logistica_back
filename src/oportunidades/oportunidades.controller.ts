import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { OportunidadesService } from './oportunidades.service';
import { CreateOportunidadDto } from './dto/create-oportunidad.dto';
import { UpdateOportunidadDto } from './dto/update-oportunidad.dto';
import { RegistrarActividadDto } from './dto/registrar-actividad.dto';
import { CambiarEstadoOportunidadDto } from './dto/cambiar-estado.dto';
import { VincularProformaDto } from './dto/vincular-proforma.dto';
import { EstadoOportunidad } from '@prisma/client';

@Permiso('oportunidades')
@Controller('oportunidades')
export class OportunidadesController {
  constructor(private readonly oportunidadesService: OportunidadesService) {}

  @Get()
  async findAll(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Query('estado') estado?: EstadoOportunidad,
    @Query('responsableId') responsableId?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.findAll(empresaId, actor, { estado, responsableId, clienteId });
  }

  @Get('responsables')
  responsables(@TenantId() empresaId: string) {
    return this.oportunidadesService.responsables(empresaId);
  }

  @Get('rendimiento')
  rendimiento(@TenantId() empresaId: string) {
    return this.oportunidadesService.rendimientoPorVendedor(empresaId);
  }

  @Get(':id')
  async findOne(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Param('id') id: string,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.findOne(empresaId, actor, id);
  }

  @Post()
  async create(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Body() dto: CreateOportunidadDto,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.create(empresaId, actor, dto);
  }

  @Put(':id')
  async update(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Param('id') id: string,
    @Body() dto: UpdateOportunidadDto,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.update(empresaId, actor, id, dto);
  }

  @Patch(':id/estado')
  async cambiarEstado(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Param('id') id: string,
    @Body() dto: CambiarEstadoOportunidadDto,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.cambiarEstado(empresaId, actor, id, dto);
  }

  @Post(':id/actividades')
  async registrarActividad(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Body() dto: RegistrarActividadDto,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.registrarActividad(empresaId, actor, id, user.sub, dto);
  }

  @Post(':id/vincular-proforma')
  async vincularProforma(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string; rolId: string },
    @Param('id') id: string,
    @Body() dto: VincularProformaDto,
  ) {
    const actor = await this.oportunidadesService.resolverActor(empresaId, user.sub, user.rolId);
    return this.oportunidadesService.vincularProforma(empresaId, actor, id, dto);
  }
}
