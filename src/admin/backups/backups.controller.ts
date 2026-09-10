import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { PlatformAdminPayload } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { BackupsService } from './backups.service';
import { CrearRespaldoDto } from './dto/crear-respaldo.dto';
import {
  ActualizarEstadoRespaldoDto,
  EjecutarRestauracionDto,
  RechazarRestauracionDto,
  RegistrarAprobacionDto,
  SolicitarRestauracionDto,
  VerificarIntegridadDto,
} from './dto/backups.dto';

type ReqAdmin = { platformAdmin?: PlatformAdminPayload };
const actorDe = (req: ReqAdmin) => req.platformAdmin?.email ?? 'SuperAdmin';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  // ── Respaldos ──
  @Get()
  findAll(
    @Query('estado') estado?: string,
    @Query('integridad') integridad?: string,
    @Query('empresaId') empresaId?: string,
    @Query('busqueda') busqueda?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.backups.findAll({
      estado,
      integridad,
      empresaId,
      busqueda,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('resumen')
  resumen() {
    return this.backups.resumen();
  }

  @Get('destinos')
  destinos() {
    return this.backups.destinos();
  }

  @Get('actividad')
  actividad(@Query('limite') limite?: string) {
    return this.backups.actividad({ limite: limite ? Number(limite) : undefined });
  }

  @Get('restauraciones')
  listarRestauraciones(@Query('estado') estado?: string, @Query('empresaId') empresaId?: string) {
    return this.backups.listarRestauraciones({ estado, empresaId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.backups.findOne(id);
  }

  @Post()
  crear(@Body() dto: CrearRespaldoDto, @Req() req: ReqAdmin) {
    return this.backups.crear(dto, actorDe(req));
  }

  @Patch(':id/integridad')
  verificarIntegridad(@Param('id') id: string, @Body() dto: VerificarIntegridadDto, @Req() req: ReqAdmin) {
    return this.backups.verificarIntegridad(id, dto, actorDe(req));
  }

  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() dto: ActualizarEstadoRespaldoDto, @Req() req: ReqAdmin) {
    return this.backups.actualizarEstado(id, dto, actorDe(req));
  }

  // ── Restauraciones (flujo con aprobación) ──
  @Post(':id/restauraciones')
  solicitarRestauracion(@Param('id') id: string, @Body() dto: SolicitarRestauracionDto, @Req() req: ReqAdmin) {
    return this.backups.solicitarRestauracion(id, dto, actorDe(req));
  }

  @Patch('restauraciones/:id/aprobacion')
  registrarAprobacion(@Param('id') id: string, @Body() dto: RegistrarAprobacionDto, @Req() req: ReqAdmin) {
    return this.backups.registrarAprobacion(id, dto, actorDe(req));
  }

  @Post('restauraciones/:id/ejecutar')
  ejecutarRestauracion(@Param('id') id: string, @Body() dto: EjecutarRestauracionDto, @Req() req: ReqAdmin) {
    return this.backups.ejecutarRestauracion(id, dto, actorDe(req));
  }

  @Post('restauraciones/:id/rechazar')
  rechazarRestauracion(@Param('id') id: string, @Body() dto: RechazarRestauracionDto, @Req() req: ReqAdmin) {
    return this.backups.rechazarRestauracion(id, dto, actorDe(req));
  }
}
