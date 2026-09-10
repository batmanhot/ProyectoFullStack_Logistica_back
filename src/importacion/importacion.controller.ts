import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ImportacionService } from './importacion.service';
import { ImportarDto } from './dto/importar.dto';

/**
 * Configuración → Importar Datos: carga en lote de datos maestros
 * (clientes, proveedores, categorías, almacenes). El cliente parsea el Excel;
 * acá se valida y se hace el upsert transaccional. Ver ImportacionService.
 */
@Permiso('configuracion')
@Controller('importacion')
export class ImportacionController {
  constructor(private readonly importacion: ImportacionService) {}

  @Get(':entidad/plantilla')
  plantilla(@Param('entidad') entidad: string) {
    return this.importacion.plantilla(entidad);
  }

  /** Vista previa — valida y clasifica cada fila, sin escribir nada. */
  @Post(':entidad/previsualizar')
  previsualizar(
    @TenantId() empresaId: string,
    @Param('entidad') entidad: string,
    @Body() dto: ImportarDto,
  ) {
    return this.importacion.procesar(empresaId, entidad, dto.filas, true);
  }

  /** Confirma — upsert en una transacción (todo o nada). */
  @Post(':entidad')
  importar(
    @TenantId() empresaId: string,
    @Param('entidad') entidad: string,
    @Body() dto: ImportarDto,
  ) {
    return this.importacion.procesar(empresaId, entidad, dto.filas, false);
  }
}
