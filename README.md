# StockPro API

Backend de **StockPro**, un sistema SaaS multi-tenant de gestión logística
(inventario, almacenes, compras, ventas, despachos, transporte, portal B2B,
contabilidad ligera) para PYMEs. Este documento describe la arquitectura
actual del backend: cómo está organizado, cómo funciona el multi-tenant,
autenticación/autorización, y cómo levantarlo en local.

> El frontend (React + Vite) vive en `../../front/logistica`. Este README
> cubre solo el backend.

---

## 1. Stack

| Pieza | Elección |
|---|---|
| Runtime / lenguaje | Node.js + TypeScript |
| Framework | NestJS 11, adapter **Fastify** (no Express) |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL (usa `pg_trgm` para búsqueda difusa y Row-Level Security nativa) |
| Auth | JWT firmado (`@nestjs/jwt`), **cuatro identidades distintas** (ver §3) |
| Validación | `class-validator` / `class-transformer` vía `ValidationPipe` global |
| Rate limiting | `@nestjs/throttler` |
| Cabeceras HTTP | `@fastify/helmet` |
| Tests | Vitest |

---

## 2. Arquitectura general

### 2.1 Multi-tenancy

Cada empresa cliente (`Empresa`) es un **tenant**. Prácticamente todas las
tablas de negocio tienen `empresaId` y están protegidas en dos capas:

1. **Aplicación**: cada query pasa por `PrismaService.withTenant(empresaId, fn)`
   (`src/prisma/prisma.service.ts`), que abre una transacción y ejecuta
   `SET LOCAL app.current_tenant = '<empresaId>'` antes de correr la query.
   `empresaId` siempre sale del JWT ya verificado (decorador `@TenantId()`,
   `src/common/decorators/tenant.decorator.ts`) — nunca de un body/query
   controlado por el cliente.
2. **Base de datos (Row-Level Security)**: cada tabla de negocio tiene una
   policy RLS (`prisma/sql/enable_rls_faseN.sql`) que exige que
   `empresa_id = current_setting('app.current_tenant')`. Esta es la red de
   seguridad real: si algún service olvidara filtrar por tenant, Postgres
   igual bloquea la fila.

   Para que la policy RLS aplique de verdad, la app **no** puede conectarse
   con un rol superusuario ni con el rol dueño de las tablas (ambos ignoran
   RLS). Por eso hay **dos roles de Postgres distintos**:

   | Uso | Variable | Rol Postgres |
   |---|---|---|
   | `prisma migrate`, `prisma db seed` (necesitan DDL) | `DATABASE_URL` | dueño de las tablas |
   | La API en tiempo de ejecución (`PrismaService`) | `APP_DATABASE_URL` | `stockpro_app` — sin superusuario, sin ser dueño de ninguna tabla |

   El rol `stockpro_app` se crea con `prisma/create-app-role.ts` (ver §6.3).

- `Rol.empresaId` es **nullable**: `empresaId = null` es el catálogo base de
  roles (compartido por todos los tenants); `empresaId = <id>` es un rol
  personalizado de ese tenant. La policy RLS de `roles` expone ambos.
- Tablas que **no** son multi-tenant y no pasan por `withTenant()`:
  `Empresa`, `PlatformAdmin`, `PlanSaaS`, `RenovacionPlan`,
  `ReglaAlertaVencimiento`, `LandingConfig` — su control de acceso es 100%
  a nivel de guard de ruta (`PlatformAdminGuard`), no de fila.

### 2.2 Las cuatro identidades de autenticación

No hay un solo "usuario" — hay cuatro esquemas de auth completamente
separados, cada uno con su propio secreto JWT y su propio guard:

| Identidad | Secreto (`.env`) | Guard | Uso |
|---|---|---|---|
| **Usuario de tenant** | `JWT_SECRET` / `JWT_REFRESH_SECRET` | `JwtAuthGuard` (global) | Login normal de un empleado de la empresa |
| **PlatformAdmin** | `ADMIN_JWT_SECRET` | `PlatformAdminGuard` | Panel SaaS (`/api/admin/*`) — gestiona negocios, planes, renovaciones; ve todos los tenants a la vez |
| **Portal de Clientes** | `PORTAL_JWT_SECRET` (`scope: 'portal_cliente'`) | `PortalClienteGuard` | Link de larga duración (`/portal/:token`) para que un cliente vea catálogo/haga pedidos, sin cuenta de Usuario |
| **Portal de Proveedores B2B** | `PORTAL_JWT_SECRET` (`scope: 'portal_proveedor'`) | `PortalProveedorGuard` | Igual que el anterior, para proveedores (ver OC propias, facturar) |

Un token de una identidad nunca sirve para otra (secretos distintos +
claim `scope` verificado en los guards de portal). `JwtAuthGuard` está
registrado como `APP_GUARD` global (`AuthModule`) — **todo requiere
autenticación salvo que la ruta lleve `@Public()`**.

Los tokens de los dos portales duran mucho (`PORTAL_JWT_EXPIRES_IN`,
365 días por defecto: son links que el cliente/proveedor reabre). Son
revocables: `Cliente.portalTokenVersion` / `Proveedor.portalTokenVersion`
se incrementan cada vez que se regenera el link
(`PortalService.generarLink` / `PortalProveedorService.generarLink`),
invalidando de inmediato cualquier link anterior.

Los tokens de Usuario tienen logout real: `POST /api/auth/logout`
incrementa `Usuario.tokenVersion`, lo que invalida todos los refresh
tokens emitidos hasta ese momento (el access token, de vida corta, expira
solo).

### 2.3 RBAC: roles, permisos y planes

- `Rol` tiene una lista de `Permiso.modulo` (string libre: `'inventario'`,
  `'despachos'`, `'usuarios'`, o `'*'` para acceso total).
- `PermisosGuard` (`src/common/guards/permisos.guard.ts`) lee el
  decorador `@Permiso('modulo')` en el controller/método (metadata vía
  `Reflector`). **Sin `@Permiso()` en la ruta, no hay restricción de rol**
  (rollout incremental deliberado — ver comentario en el guard). Las rutas
  de mutación sensibles sí están decoradas.
- Además del permiso de rol, `PermisosGuard` cruza contra
  `Empresa.plan → PlanSaaS.modulosIncluidos` (`permiso-plan-map.ts` mapea
  cada `modulo` granular a uno de los 9 grupos de plan). Un rol con
  permiso `'*'` (owner/admin) evita ese segundo cruce.
- Catálogo base de 10 roles + Auditor sembrado en `prisma/seed.ts`
  (`ROLES_BASE`): owner, admin, gerente-operaciones, supervisor,
  almacenero, analista-compras, ejecutivo-comercial,
  coordinador-transporte, contable-finanzas, solicitante, auditor.

### 2.4 Contrato de API

- Todas las rutas cuelgan de `/api` (`app.setGlobalPrefix('api')`).
- Toda respuesta, éxito o error, tiene el shape `{ data, error }`
  (`ResponseEnvelopeInterceptor` + `HttpExceptionFilter`). `error` nunca
  incluye el stack trace — los 500 se loguean server-side y el cliente
  recibe un mensaje genérico.
- `ValidationPipe({ whitelist: true, transform: true })` global: cualquier
  campo del body que no esté declarado en el DTO se descarta en silencio
  (protección contra mass-assignment), y los DTOs transforman tipos
  automáticamente.
- Mutaciones exitosas (POST/PUT/PATCH/DELETE) de un usuario de tenant se
  auditan automáticamente en la tabla `Auditoria` vía
  `AuditoriaInterceptor` — los services normalmente no llaman a
  `AuditoriaService.registrar()` a mano.

### 2.5 Patrones de servicio

- **Validar antes de mutar, en batch**: cuando un service necesita validar
  la existencia de varios registros relacionados (ítems de una proforma,
  de un pedido interno), traerlos con **una sola consulta**
  `findMany({ where: { id: { in: ids }, empresaId } })` y comparar contra
  el set esperado — no un `for (const item of items) { await validar(item) }`
  secuencial (N round-trips a la base y, si el loop ya mutó algo antes de
  fallar en el ítem N, deja mutaciones a medias). Patrón usado en
  `PedidosInternosService.entregar()`, `CuentasPorCobrarService` y
  `ProformasService.create()` — si aparece un `for...await` de validación
  nuevo, preferir este patrón desde el inicio.
- **`assertExists()`** (`common/utils/assert-exists.util.ts`): helper para
  el caso simple de "traer un registro por id o lanzar una excepción" —
  usarlo en vez de reimplementar el `if (!x) throw ...` a mano en cada
  service.

---

## 3. Estructura del proyecto

```
src/
├── main.ts                  # bootstrap: helmet, CORS, ValidationPipe, validación de secretos
├── app.module.ts            # registro de todos los módulos + ThrottlerModule
├── prisma/                  # PrismaService (withTenant, conexión con rol restringido)
├── common/
│   ├── decorators/          # @Public, @Permiso, @TenantId, @CurrentUser
│   ├── guards/               # JwtAuthGuard, PermisosGuard, PlatformAdminGuard,
│   │                         #   PortalClienteGuard, PortalProveedorGuard
│   ├── filters/              # HttpExceptionFilter
│   ├── interceptors/         # ResponseEnvelopeInterceptor, AuditoriaInterceptor
│   └── utils/                 # assertExists, validarEnum, validateJwtSecrets
│
│  ── Auth y núcleo (Fase 1) ──
├── auth/  usuarios/  roles/
│
│  ── Catálogos maestros (Fase 2) ──
├── categorias/  almacenes/  ubicaciones/  proveedores/
│
│  ── Inventario core (Fase 3) ──
├── productos/  lotes/  inventario/  movimientos/
│
│  ── Comercial (Fase 4) ──
├── clientes/  ordenes-compra/  cotizaciones/  proformas/  cuentas-por-cobrar/
│
│  ── Distribución (Fase 5) ──
├── transportistas/  despachos/  rutas/
│
│  ── Operación interna (Fase 6) ──
├── areas-internas/  pedidos-internos/  inventario-fisico/
│
│  ── Flota, reportes, empaque (Fase 7a-c) ──
├── flota/  reportes/  empaques/
│
│  ── Panel SaaS — auth propia (Fase 7d) ──
├── admin/
│   ├── auth/  negocios/  planes/  renovaciones/  alertas/  landing/
│
│  ── Portales externos + B2B (Fase 7e) ──
├── portal/  portal-proveedor/  facturas-b2b/
│
│  ── SUNAT / Guía de Remisión (Fase 7f) ──
├── sunat/
│
│  ── Auditoría y configuración (Fase 8) ──
├── auditoria/  panel-auditoria/  configuracion/
│
│  ── Público y utilidades (Fase 9) ──
└── public/  listas-precios/  datos/
```

Cada módulo de negocio sigue el mismo patrón: `*.module.ts`,
`*.controller.ts` (fino, sin lógica), `*.service.ts` (reglas de negocio +
acceso a datos vía `PrismaService.withTenant`), `dto/` (DTOs con
`class-validator`), `*.service.spec.ts` (tests).

---

## 4. Seguridad

Puntos ya endurecidos (auditoría de seguridad 2026-07-29, ver memoria del
proyecto para el detalle completo):

- **RLS real**: la app corre con un rol Postgres sin privilegios (§2.1),
  no con el superusuario que usan las migraciones.
- **Rate limiting**: 5 intentos/min en los 3 endpoints de login
  (`@Throttle` en `auth.controller.ts` / `admin-auth.controller.ts`),
  límite global de 120/min en el resto.
- **Cabeceras HTTP**: `@fastify/helmet` (HSTS, X-Frame-Options, CSP básica,
  etc.), `trustProxy: true` en el adapter Fastify.
- **CORS**: origin explícito (`FRONTEND_URL`, nunca reflejado), y el
  arranque falla si falta en `NODE_ENV=production`.
- **Secretos JWT**: `validateJwtSecrets()` (`common/utils/`) rechaza el
  arranque si algún secreto está vacío, es muy corto, coincide con otro
  secreto, o es un valor de plantilla de `.env.example`.
- **`demoLogin`** (acceso sin password para empresas demo en "Modo
  Desarrollo"): además del flag `Empresa.modoDesarrollo`, en
  `NODE_ENV=production` requiere explícitamente `ALLOW_DEMO_LOGIN=true`.
- **IDOR / cross-tenant**: toda consulta de `Rol` por id filtra
  `empresaId` explícito en el `WHERE` (no depende solo de RLS).

---

## 5. Puesta en marcha

### 5.1 Requisitos

- Node.js 22+
- PostgreSQL 14+ local o accesible, con la extensión `pg_trgm` disponible

### 5.2 Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión con el rol dueño de las tablas — usada por `prisma migrate` / `prisma db seed` |
| `APP_DATABASE_URL` | Conexión de la app en runtime, con el rol restringido `stockpro_app` (ver §5.3) |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Identidad Usuario de tenant |
| `ADMIN_JWT_SECRET`, `ADMIN_JWT_EXPIRES_IN` | Identidad PlatformAdmin — secreto **distinto** al de arriba |
| `PORTAL_JWT_SECRET`, `PORTAL_JWT_EXPIRES_IN` | Identidades Portal Cliente/Proveedor — secreto **distinto** a los dos anteriores |
| `PORT` | Puerto HTTP (default 3000) |
| `FRONTEND_URL` | Origin permitido por CORS — obligatorio si `NODE_ENV=production` |
| `NODE_ENV` | `production` activa las validaciones estrictas (CORS, demo-login) |
| `ALLOW_DEMO_LOGIN` | Solo necesaria si `NODE_ENV=production` y se quiere permitir el acceso demo igual |

Los 4 secretos JWT deben ser valores aleatorios reales y distintos entre
sí — el arranque falla si detecta un placeholder o una colisión. Generar
uno: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.

### 5.3 Instalación, base de datos y arranque

```bash
npm install

# 1) Migraciones (usa DATABASE_URL — rol dueño de las tablas)
npx prisma migrate dev

# 2) Rol de aplicación restringido (necesario para que RLS aplique — ver §2.1)
#    Solo la primera vez, o si se rota la contraseña:
STOCKPRO_APP_DB_PASSWORD="elige-una-contraseña-fuerte" npx ts-node prisma/create-app-role.ts
#    Copiar esa contraseña en APP_DATABASE_URL dentro de .env

# 3) Seed — empresas demo, roles base, PlatformAdmin, planes, landing page
npm run prisma:seed

# 4) Arrancar
npm run start:dev
```

> Si el servidor con `start:dev` sigue corriendo, deténlo antes de correr
> `prisma migrate dev` — Prisma puede tirar un `EPERM` en Windows al
> regenerar el cliente con el motor ya cargado.

---

## 6. Empresas y usuarios demo

El seed crea dos empresas (`dlnorte`, `acme`), ambas en plan `empresarial`
(el único que habilita los 10 roles sembrados sin que el plan bloquee
ninguno), con un usuario por rol. Password de todos: `StockPro2026!`.

| Rol | Email (dlnorte) |
|---|---|
| Administrador | `admin@dlnorte.demo` |
| Gerente de Operaciones | `gerente@dlnorte.demo` |
| Supervisor de Almacén | `supervisor@dlnorte.demo` |
| Operario de Almacén | `almacenero@dlnorte.demo` |
| Analista de Compras | `compras@dlnorte.demo` |
| Ejecutivo Comercial | `comercial@dlnorte.demo` |
| Coordinador de Transporte | `transporte@dlnorte.demo` |
| Contable / Finanzas | `contable@dlnorte.demo` |
| Auditor (solo lectura) | `auditor@dlnorte.demo` |
| Solicitante | `solicitante@dlnorte.demo` |

Mismos roles/passwords para `acme.demo`. PlatformAdmin de prueba:
`admin@stockpro.dev` / `AdminSaaS2026!` (login en `/api/admin/auth/login`,
no en el login normal).

> Estas contraseñas son solo para desarrollo local — nunca usarlas en un
> entorno expuesto a internet.

---

## 7. Scripts disponibles

```bash
npm run start:dev        # servidor con watch
npm run build             # compila a dist/
npm run start              # corre dist/main (producción)
npm run prisma:generate    # regenera el cliente Prisma
npm run prisma:migrate     # prisma migrate dev
npm run prisma:seed        # corre prisma/seed.ts
npm run prisma:studio      # explorador visual de la base
npm test                    # vitest run
npm run test:watch          # vitest en watch
npm run lint                 # eslint sobre src/ y prisma/
```

`scripts/smoke-test-faseN.ps1` — smoke tests manuales en PowerShell contra
un servidor corriendo, uno por fase de desarrollo histórica.

---

## 8. Testing

Vitest, tests unitarios por módulo (`*.service.spec.ts`), sin mocks de
base de datos reales — se prueban reglas de negocio y validaciones. Ver
`vitest.config.ts` para umbrales de cobertura.

```bash
npm test
```

---

## 9. Documentación adicional

- `../../docs/StockPro-Backend-Especificacion.md` — especificación
  funcional original (Fase 1-3).
- `../../docs/BITACORA.md`, `ESTADO-BACKEND.md` — bitácora histórica de
  desarrollo por fase.
- `prisma/schema.prisma` — fuente de verdad del modelo de datos, con
  comentarios de decisión por fase.
- `prisma/sql/enable_rls_faseN.sql` — políticas RLS, una por fase.
