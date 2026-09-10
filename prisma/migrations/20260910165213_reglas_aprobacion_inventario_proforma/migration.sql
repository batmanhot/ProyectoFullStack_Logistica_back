-- Backfill de los 2 procesos nuevos (#11b, ampliación): cada empresa existente
-- recibe la fila con rolesAprobadores = [] → día 1 idéntico (INVENTARIO_FISICO
-- lo cierra hoy cualquiera con el permiso 'inv-fisico'; PROFORMA la acepta
-- cualquiera con 'proformas'). Va en su propia migración porque los valores de
-- enum recién agregados no se pueden usar en la misma transacción que los creó.
INSERT INTO "reglas_aprobacion" ("id", "empresaId", "proceso", "rolesAprobadores", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e.id, v.proceso::"ProcesoAprobacion", ARRAY[]::text[], now(), now()
FROM "empresas" e
CROSS JOIN (VALUES ('INVENTARIO_FISICO'), ('PROFORMA')) AS v(proceso)
ON CONFLICT ("empresaId", "proceso") DO NOTHING;
