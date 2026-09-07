<#
═══════════════════════════════════════════════════════════════════
 StockPro API — Recreación completa de la base de datos
 (uso: tras reinstalar PostgreSQL / cambio de disco duro)

 Qué hace, en orden:
   1. Lee DATABASE_URL y APP_DATABASE_URL desde .env
   2. Verifica que PostgreSQL esté activo (pg_isready NO valida credenciales,
      solo que el servidor responda)
   3. Verifica que las credenciales de DATABASE_URL sean válidas
   4. Crea la base de datos si no existe (o la recrea con -Fresh)
   5. Genera el cliente de Prisma
   6. Aplica TODAS las migraciones en orden (prisma migrate deploy)
      -> crea tablas, enums, extensión pg_trgm y políticas RLS
   7. Crea/actualiza el rol de aplicación "stockpro_app" (RLS real)
   8. Ejecuta el seed (empresas demo, roles base, planes, admin)

 Requisitos:
   - PostgreSQL instalado y con psql/createdb/pg_isready en el PATH
     (normalmente C:\Program Files\PostgreSQL\<version>\bin)
   - npm install ya ejecutado en este proyecto (node_modules presente)

 Uso:
   cd "back\stockpro-api"
   .\scripts\recreate-db.ps1              # crea solo si no existe
   .\scripts\recreate-db.ps1 -Fresh       # DROP + CREATE (borra todo)
═══════════════════════════════════════════════════════════════════
#>

param(
    [switch]$Fresh
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n=> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   ! $msg" -ForegroundColor Yellow }

# Este script vive en scripts\, así que el proyecto (donde está .env
# y prisma\) es un nivel arriba.
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path ".env")) {
    throw "No se encontró .env en $projectRoot. Copia .env.example a .env y complétalo antes de continuar."
}

function Get-EnvValue($name) {
    $line = Get-Content ".env" | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
    if (-not $line) { throw "No se encontró la variable '$name' en .env" }
    $value = ($line -split '=', 2)[1].Trim()
    return $value.Trim('"')
}

function Parse-PgUrl($url) {
    if ($url -match 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
        return [PSCustomObject]@{
            User     = $matches[1]
            Password = $matches[2]
            HostName = $matches[3]
            Port     = $matches[4]
            Db       = $matches[5]
        }
    }
    throw "No se pudo interpretar la cadena de conexión: $url"
}

Write-Step "Leyendo configuración desde .env"
$databaseUrl    = Get-EnvValue "DATABASE_URL"
$appDatabaseUrl = Get-EnvValue "APP_DATABASE_URL"
$pg    = Parse-PgUrl $databaseUrl
$appPg = Parse-PgUrl $appDatabaseUrl
Write-Ok "DB destino: '$($pg.Db)' en $($pg.HostName):$($pg.Port) (owner: $($pg.User))"
Write-Ok "Rol de app (RLS): $($appPg.User)"

$env:PGPASSWORD = $pg.Password

# ── Verificar que PostgreSQL responda (NO valida credenciales) ─────
Write-Step "Verificando que PostgreSQL esté activo"
$isReadyOutput = & pg_isready -h $pg.HostName -p $pg.Port 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($isReadyOutput -join "`n") -ForegroundColor Red
    throw "El servicio de PostgreSQL no responde. Revisa que esté iniciado (Servicios de Windows -> postgresql-x64-18)."
}
Write-Ok "PostgreSQL activo"

# ── Verificar que las credenciales de DATABASE_URL sean válidas ────
# NOTA: llamadas DIRECTAS a psql (sin funciones intermedias con arrays
# de argumentos) para evitar cualquier ambigüedad de splatting en PowerShell.
Write-Step "Verificando credenciales de '$($pg.User)'"
$authCheck = & psql -h $pg.HostName -p $pg.Port -U $pg.User -d postgres -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($authCheck -join "`n") -ForegroundColor Red
    Write-Warn "No se pudo autenticar como '$($pg.User)'. Revisa la contraseña en DATABASE_URL (.env)."
    throw "Autenticación fallida"
}
Write-Ok "Credenciales válidas"

# ── Crear (o recrear) la base de datos ──────────────────────────────
Write-Step "Verificando la base de datos '$($pg.Db)'"
$dbCheckRaw = & psql -h $pg.HostName -p $pg.Port -U $pg.User -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($pg.Db)'" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($dbCheckRaw -join "`n") -ForegroundColor Red
    throw "No se pudo consultar pg_database"
}
$dbExists = ($dbCheckRaw -join "").Trim()

if ($dbExists -eq "1" -and $Fresh) {
    Write-Warn "Se eliminará la base de datos existente '$($pg.Db)' (-Fresh)"
    & psql -h $pg.HostName -p $pg.Port -U $pg.User -d postgres -c "DROP DATABASE `"$($pg.Db)`""
    if ($LASTEXITCODE -ne 0) { throw "No se pudo eliminar la base de datos '$($pg.Db)'" }
    $dbExists = $null
}

if ($dbExists -ne "1") {
    & createdb -h $pg.HostName -p $pg.Port -U $pg.User $pg.Db
    if ($LASTEXITCODE -ne 0) { throw "createdb falló para '$($pg.Db)'" }
    Write-Ok "Base de datos '$($pg.Db)' creada"
} else {
    Write-Warn "La base de datos '$($pg.Db)' ya existe, se reutiliza (usa -Fresh para recrearla desde cero)"
}

# ── Cliente de Prisma + migraciones ─────────────────────────────────
Write-Step "Generando cliente de Prisma"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate falló" }
Write-Ok "Cliente generado"

Write-Step "Aplicando todas las migraciones (prisma migrate deploy)"
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy falló" }
Write-Ok "Migraciones aplicadas (tablas, enums, extensión pg_trgm y políticas RLS)"

# ── Rol de aplicación para que RLS aplique de verdad ────────────────
Write-Step "Creando/actualizando el rol de aplicación '$($appPg.User)'"
$env:STOCKPRO_APP_DB_PASSWORD = $appPg.Password
npx ts-node prisma/create-app-role.ts
if ($LASTEXITCODE -ne 0) { throw "create-app-role.ts falló" }
Write-Ok "Rol '$($appPg.User)' listo (sin superusuario, sin ownership de tablas -> RLS real)"

# ── Seed ─────────────────────────────────────────────────────────────
Write-Step "Ejecutando seed (empresas demo, roles base, planes, admin)"
npx ts-node prisma/seed.ts
if ($LASTEXITCODE -ne 0) { throw "seed.ts falló" }
Write-Ok "Seed completado"

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host " Base de datos '$($pg.Db)' recreada y lista para usar." -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "Ya puedes levantar el backend con: npm run start:dev"
