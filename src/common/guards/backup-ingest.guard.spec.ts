import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupIngestGuard } from './backup-ingest.guard';

function ctx(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

const TOKEN = 'un-token-de-servicio-suficientemente-largo-1234567890';

describe('BackupIngestGuard', () => {
  let guard: BackupIngestGuard;
  const original = process.env.BACKUP_INGEST_TOKEN;

  beforeEach(() => {
    guard = new BackupIngestGuard();
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.BACKUP_INGEST_TOKEN = original;
  });

  it('rechaza si BACKUP_INGEST_TOKEN no está configurado o es débil', () => {
    process.env.BACKUP_INGEST_TOKEN = 'corto';
    expect(() => guard.canActivate(ctx({ 'x-backup-token': 'corto' }))).toThrow(UnauthorizedException);
  });

  it('rechaza si no viene el header', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('rechaza un token incorrecto (misma longitud)', () => {
    const malo = 'X'.repeat(TOKEN.length);
    expect(() => guard.canActivate(ctx({ 'x-backup-token': malo }))).toThrow(UnauthorizedException);
  });

  it('rechaza un token incorrecto (otra longitud)', () => {
    expect(() => guard.canActivate(ctx({ 'x-backup-token': TOKEN + 'extra' }))).toThrow(UnauthorizedException);
  });

  it('acepta el token exacto', () => {
    expect(guard.canActivate(ctx({ 'x-backup-token': TOKEN }))).toBe(true);
  });
});
