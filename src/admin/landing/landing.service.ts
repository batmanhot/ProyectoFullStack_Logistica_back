import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertLandingDto } from './dto/upsert-landing.dto';

@Injectable()
export class LandingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Siempre exactamente UNA fila (singleton) — se crea con data={} si no existe aún. */
  async get() {
    const existente = await this.prisma.landingConfig.findFirst();
    if (existente) return existente;
    return this.prisma.landingConfig.create({ data: { data: {} } });
  }

  async upsert(dto: UpsertLandingDto) {
    const data = dto.data as Prisma.InputJsonValue;
    const existente = await this.prisma.landingConfig.findFirst();
    if (existente) {
      return this.prisma.landingConfig.update({ where: { id: existente.id }, data: { data } });
    }
    return this.prisma.landingConfig.create({ data: { data } });
  }
}
