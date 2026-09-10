import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { BackupIngestGuard } from '../../common/guards/backup-ingest.guard';
import { BackupsService } from './backups.service';
import { IngestarRespaldoDto, PruebaRestauracionDto, ResultadoRestauracionDto } from './dto/ingesta.dto';

/**
 * Canal de ingesta para el job externo de backups (ver docs/BACKUP-RESTORE.md).
 * Autentica por token de servicio (`X-Backup-Token`), NO por sesión de
 * SuperAdmin. El panel refleja lo que entra por acá — la app nunca ejecuta
 * pg_dump ni restaura nada.
 */
@Public()
@UseGuards(BackupIngestGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('admin/backups/ingest')
export class BackupsIngestController {
  constructor(private readonly backups: BackupsService) {}

  /** El script de restore lee la solicitud aprobada (empresa + storageKey del respaldo). */
  @Get('solicitud/:id')
  leerSolicitud(@Param('id') id: string) {
    return this.backups.leerSolicitudParaRestore(id);
  }

  /** El job terminó un respaldo (de un tenant o de toda la plataforma) y lo subió. */
  @Post('respaldo')
  ingestarRespaldo(@Body() dto: IngestarRespaldoDto) {
    return this.backups.ingestarRespaldo(dto);
  }

  /** El job de CI corrió el test de restauración y reporta el resultado. */
  @Post('test-restore')
  registrarPrueba(@Body() dto: PruebaRestauracionDto) {
    return this.backups.registrarPruebaRestauracion(dto);
  }

  /** El script `restore-tenant.mjs` terminó una restauración y cierra el ciclo en el panel. */
  @Post('restauracion-resultado')
  registrarResultado(@Body() dto: ResultadoRestauracionDto) {
    return this.backups.registrarResultadoRestauracion(dto);
  }
}
