-- ═══════════════════════════════════════════════════════════════════
-- Backups pasaron de bucket R2 (nunca provisionado) a carpeta local en
-- la PC del usuario vía runner self-hosted (2026-09-15, ver
-- docs/BACKUP-RESTORE.md §8). `backups.service.ts::destinoRegion()` ya
-- no devuelve el placeholder fijo "Object Storage · Sudamérica (Lima)"
-- para respaldos NUEVOS — pero cada fila snapshotea ese texto en
-- destinoRegion al crearse, así que las filas viejas se quedarían
-- mostrando el placeholder falso para siempre sin este backfill.
--
-- Corrige solo las filas que todavía tienen el string exacto del
-- placeholder (nunca hubo BACKUP_STORAGE_BUCKET configurado, así que
-- ningún respaldo real usó un bucket real — no hay riesgo de pisar un
-- destino verdadero).
-- ═══════════════════════════════════════════════════════════════════
UPDATE "respaldos_negocio"
SET "destinoRegion" = 'Almacenamiento local (equipo del operador)'
WHERE "destinoRegion" = 'Object Storage · Sudamérica (Lima)';
