import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

describe('PrismaService.withTenant', () => {
  it('rechaza un empresaId con caracteres no seguros antes de tocar la base de datos (defensa contra inyección en SET LOCAL)', async () => {
    const service = new PrismaService();
    await expect(
      service.withTenant("abc'; DROP TABLE usuarios; --", async () => null),
    ).rejects.toThrow(BadRequestException);
  });
});
