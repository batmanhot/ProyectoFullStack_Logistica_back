import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { entornoBloqueaAccesoRapido } from '../../common/acceso-rapido.util';
import { UpdatePlataformaConfigDto } from './dto/update-plataforma-config.dto';

@Injectable()
export class PlataformaConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Siempre exactamente UNA fila (singleton) — se crea con los defaults si no existe. */
  private async fila() {
    const existente = await this.prisma.plataformaConfig.findFirst();
    if (existente) return existente;
    return this.prisma.plataformaConfig.create({ data: {} });
  }

  /**
   * Config para el panel SuperAdmin. `bloqueadoPorEntorno` = el switch existe
   * pero no tendrá efecto porque el despliegue no habilitó el acceso rápido
   * (producción sin ALLOW_DEMO_LOGIN=true) — la UI lo muestra deshabilitado.
   */
  async get() {
    const fila = await this.fila();
    return { ...fila, bloqueadoPorEntorno: entornoBloqueaAccesoRapido() };
  }

  async update(dto: UpdatePlataformaConfigDto) {
    const fila = await this.fila();
    const actualizada = await this.prisma.plataformaConfig.update({
      where: { id: fila.id },
      data: {
        ...(dto.accesoRapidoTarjetas !== undefined && { accesoRapidoTarjetas: dto.accesoRapidoTarjetas }),
        ...(dto.retencionAuditoriaDias !== undefined && { retencionAuditoriaDias: dto.retencionAuditoriaDias }),
      },
    });
    return { ...actualizada, bloqueadoPorEntorno: entornoBloqueaAccesoRapido() };
  }
}
