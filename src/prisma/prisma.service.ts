import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Los IDs del schema son cuid() — esta validación es una capa extra
// antes de interpolar el valor en SET LOCAL (Postgres no admite bind
// parameters en comandos SET, así que la sanitización es obligatoria).
const SAFE_ID_PATTERN = /^[a-z0-9]+$/i;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // La app en tiempo de ejecución se conecta con APP_DATABASE_URL — un rol
    // sin superusuario y sin ser dueño de las tablas (ver prisma/create-app-role.ts),
    // condición necesaria para que Row-Level Security aplique de verdad (hallazgo
    // Crítico #1 de la auditoría de seguridad 2026-07-29). `prisma migrate` y
    // `prisma:seed` siguen usando DATABASE_URL (el rol dueño de las tablas) porque
    // necesitan DDL y el seed de roles base no pasa por SET LOCAL app.current_tenant.
    const url = process.env.APP_DATABASE_URL;
    if (!url) {
      throw new Error(
        'APP_DATABASE_URL no está definida. La app no debe conectarse con el rol ' +
          'dueño de las tablas (DATABASE_URL) — ver prisma/create-app-role.ts.',
      );
    }
    super({ datasources: { db: { url } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Centraliza el SET LOCAL app.current_tenant que activa las políticas
   * de Row-Level Security (ver prisma/sql/enable_rls_fase1.sql).
   * Ningún service debe llamar SET LOCAL directamente — siempre a través
   * de este método, para garantizar aislamiento uniforme entre módulos.
   */
  async withTenant<T>(
    empresaId: string,
    fn: (tx: PrismaClient) => Promise<T>,
    opts?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    if (!SAFE_ID_PATTERN.test(empresaId)) {
      throw new BadRequestException('Identificador de empresa inválido');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${empresaId}'`);
      return fn(tx as PrismaClient);
    }, opts);
  }
}
