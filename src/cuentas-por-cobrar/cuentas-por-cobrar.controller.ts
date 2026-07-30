import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';
import { CreateCuentaPorCobrarDto } from './dto/create-cuenta-por-cobrar.dto';
import { UpdateCuentaPorCobrarDto } from './dto/update-cuenta-por-cobrar.dto';
import { CreatePagoDto } from './dto/create-pago.dto';

@Permiso('cxc')
@Controller('cuentas-por-cobrar')
export class CuentasPorCobrarController {
  constructor(private readonly cuentasPorCobrarService: CuentasPorCobrarService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.cuentasPorCobrarService.findAll(empresaId, { clienteId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cuentasPorCobrarService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateCuentaPorCobrarDto) {
    return this.cuentasPorCobrarService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCuentaPorCobrarDto,
  ) {
    return this.cuentasPorCobrarService.update(empresaId, id, dto);
  }

  @Post(':id/pagos')
  registrarPago(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: CreatePagoDto,
  ) {
    return this.cuentasPorCobrarService.registrarPago(empresaId, id, dto);
  }
}
