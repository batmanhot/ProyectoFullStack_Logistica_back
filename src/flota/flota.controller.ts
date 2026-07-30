import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { FlotaService } from './flota.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { CreateMantenimientoDto } from './dto/create-mantenimiento.dto';
import { UpdateMantenimientoDto } from './dto/update-mantenimiento.dto';
import { CreateCombustibleDto } from './dto/create-combustible.dto';

@Permiso('flota')
@Controller('flota')
export class FlotaController {
  constructor(private readonly flotaService: FlotaService) {}

  // ── Vehículos ──────────────────────────────────────────────────
  @Get('vehiculos')
  findAllVehiculos(
    @TenantId() empresaId: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.flotaService.findAllVehiculos(empresaId, incluirInactivos === 'true');
  }

  @Get('vehiculos/:id')
  findOneVehiculo(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.flotaService.findOneVehiculo(empresaId, id);
  }

  @Post('vehiculos')
  createVehiculo(@TenantId() empresaId: string, @Body() dto: CreateVehiculoDto) {
    return this.flotaService.createVehiculo(empresaId, dto);
  }

  @Put('vehiculos/:id')
  updateVehiculo(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVehiculoDto,
  ) {
    return this.flotaService.updateVehiculo(empresaId, id, dto);
  }

  @Delete('vehiculos/:id')
  removeVehiculo(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.flotaService.removeVehiculo(empresaId, id);
  }

  // ── Mantenimientos ─────────────────────────────────────────────
  @Get('mantenimientos')
  findMantenimientos(
    @TenantId() empresaId: string,
    @Query('vehiculoId') vehiculoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.flotaService.findMantenimientos(empresaId, { vehiculoId, desde, hasta });
  }

  @Post('vehiculos/:id/mantenimientos')
  registrarMantenimiento(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string } | undefined,
    @Param('id') id: string,
    @Body() dto: CreateMantenimientoDto,
  ) {
    return this.flotaService.registrarMantenimiento(empresaId, id, user?.sub, dto);
  }

  @Put('mantenimientos/:id')
  updateMantenimiento(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMantenimientoDto,
  ) {
    return this.flotaService.updateMantenimiento(empresaId, id, dto);
  }

  @Delete('mantenimientos/:id')
  removeMantenimiento(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.flotaService.removeMantenimiento(empresaId, id);
  }

  // ── Combustible ────────────────────────────────────────────────
  @Get('combustible')
  findCombustible(
    @TenantId() empresaId: string,
    @Query('vehiculoId') vehiculoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.flotaService.findCombustible(empresaId, { vehiculoId, desde, hasta });
  }

  @Post('combustible')
  registrarCombustible(@TenantId() empresaId: string, @Body() dto: CreateCombustibleDto) {
    return this.flotaService.registrarCombustible(empresaId, dto);
  }

  // ── Alertas ────────────────────────────────────────────────────
  @Get('alertas')
  alertas(@TenantId() empresaId: string) {
    return this.flotaService.alertas(empresaId);
  }
}
