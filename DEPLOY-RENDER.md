# Despliegue en Render — StockPro API + PostgreSQL (plan FREE)

Runbook para (re)crear el backend y la base en Render. Pensado para el
**plan free**, así que asume que:

- La Postgres se **borra sola a los ~30 días** → hay que rehacer este
  runbook cada vez (ver §7).
- El web service se **duerme** tras 15 min sin tráfico.
- **No hay `preDeployCommand`** → las migraciones se corren a mano desde tu
  PC contra la URL externa de la base.

Nombres fijos (los del deploy anterior):

| Recurso | Nombre |
|---|---|
| Web Service | `stockpro-api` → `https://stockpro-api.onrender.com` |
| PostgreSQL | `stockpro-db` (databaseName `stockpro`, user `stockpro`) |

Repo backend: `github.com/batmanhot/ProyectoFullStack_Logistica_back` · branch `main`.

---

## 0. Una sola vez: preparar valores

```bash
cd back/stockpro-api

# Contraseña fuerte para el rol de aplicación (guárdala, se usa en 2 lados)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

# (Opcional) par VAPID para notificaciones push
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Asegurate de que `render.yaml`, `Dockerfile`, y los scripts `migrate:deploy`
/ `db:app-role` estén **commiteados y pusheados** a `main` (Render deploya
desde GitHub).

---

## 1. Crear los servicios con el Blueprint

1. Dashboard de Render → **New +** → **Blueprint**.
2. Conectar el repo `ProyectoFullStack_Logistica_back`, branch `main`.
3. Render detecta `render.yaml` y propone crear **`stockpro-db`** (Postgres
   free) y **`stockpro-api`** (web service Docker free).
4. Pide las env vars marcadas `sync: false`. Podés dejarlas vacías ahora y
   completarlas en el §4 (el web service va a crash-loopear hasta entonces,
   es normal).
5. **Apply**. La base se crea en segundos; el web service arranca a
   compilar la imagen Docker (varios minutos: compila TS, `prisma
   generate`, instala Chromium para los PDF).

> Si Render rechaza `region: virginia` para la base free, cambiá `region`
> en `render.yaml` (a `oregon`, p. ej.) **en los dos bloques** — deben
> coincidir — y volvé a aplicar.

---

## 2. Migraciones + rol RLS + seed (desde tu PC)

En free no se puede usar el Shell de Render mientras el service no arranca,
así que esto se hace local contra la **External Database URL**.

En la página de `stockpro-db` en Render, copiá la **External Database URL**
(termina en `...-a.virginia-postgres.render.com/stockpro`). Agregale
`?sslmode=require` si no lo trae.

```bash
cd back/stockpro-api
npm install   # si no lo hiciste

export DATABASE_URL="postgresql://stockpro:<PASS>@<HOST-EXTERNO>/stockpro?sslmode=require"

# 2.1 — Esquema + RLS + extensión pg_trgm (todo va en las migraciones)
npm run migrate:deploy

# 2.2 — Rol de aplicación restringido (para que RLS aplique de verdad)
export STOCKPRO_APP_DB_PASSWORD="<la-contraseña-fuerte-del-§0>"
npm run db:app-role
#   → ✓ Rol stockpro_app creado/actualizado
#   → ✓ Privilegios GRANT/ALTER DEFAULT PRIVILEGES aplicados

# 2.3 — Datos base: roles, planes, PlatformAdmin, landing (SIN tenants demo)
export SEED_DEMO_TENANTS="false"
export PLATFORM_ADMIN_EMAIL="<tu-email-superadmin>"
export PLATFORM_ADMIN_PASSWORD="<contraseña-fuerte-superadmin>"
npm run prisma:seed
```

`db:app-role` deja cubiertas también las tablas de migraciones futuras
(`ALTER DEFAULT PRIVILEGES`), así que en deploys siguientes solo hace falta
repetir el **2.1**.

---

## 3. Armar `APP_DATABASE_URL`

Es la **Internal Database URL** de `stockpro-db` (la que usa el web service,
red privada de Render) pero cambiando usuario y contraseña:

```
postgresql://stockpro_app:<STOCKPRO_APP_DB_PASSWORD>@<HOST-INTERNO>/stockpro
```

El `<HOST-INTERNO>` sale de la Internal URL (sin `.virginia-postgres...`,
suele ser `dpg-xxxxx-a`).

---

## 4. Completar env vars del web service

En Render → `stockpro-api` → **Environment**:

| Variable | Valor |
|---|---|
| `APP_DATABASE_URL` | la del §3 (`stockpro_app@...`) |
| `FRONTEND_URL` | URL pública del frontend (ej. `https://stockpro.vercel.app`) — **obligatoria**, sin ella el server no arranca |
| `PLATFORM_ADMIN_EMAIL` | el mismo del §2.3 |
| `PLATFORM_ADMIN_PASSWORD` | la misma del §2.3 |
| `VAPID_*`, `SMTP_*` | opcionales — vacías si no las usás aún |

`DATABASE_URL` ya la inyecta Render desde la base (blueprint). Los 4
secretos JWT se autogeneraron.

Guardar → Render redeploya. Esta vez debe quedar **Live**.

---

## 5. Verificar

```bash
curl https://stockpro-api.onrender.com/api/health
# → {"data":{"status":"ok"},"error":null}
```

- Logs de `stockpro-api` sin `JWT_SECRET ... placeholder` ni
  `FRONTEND_URL no está definida`.
- Login SuperAdmin:
  ```
  POST https://stockpro-api.onrender.com/api/admin/auth/login
  { "email": "<PLATFORM_ADMIN_EMAIL>", "password": "<PLATFORM_ADMIN_PASSWORD>" }
  ```
- Login de un usuario de tenant: solo ve datos de su empresa (RLS activo →
  la app conectó como `stockpro_app`, no como dueño).

---

## 6. Frontend

Apuntar el frontend a la API nueva y redeployar:

```
VITE_API_URL=https://stockpro-api.onrender.com/api
```

(y `VITE_VAPID_PUBLIC_KEY` = `VAPID_PUBLIC_KEY` del backend, si usás push).

---

## 7. Cuando Render borre la base (~30 días)

Se pierde la **base** (datos + rol `stockpro_app`). El web service y el
`render.yaml` siguen. Para revivir:

1. Blueprint → **re-apply** (recrea `stockpro-db`). O crear la Postgres a
   mano con el mismo nombre `stockpro-db` / databaseName `stockpro` / user
   `stockpro`.
2. Repetir **§2 completo** (migrate + db:app-role + seed) contra la nueva
   External URL — con la **misma** `STOCKPRO_APP_DB_PASSWORD` de antes para
   no tener que tocar `APP_DATABASE_URL`.
3. En `stockpro-api` → Environment: actualizar `DATABASE_URL` (si la
   creaste a mano) y `APP_DATABASE_URL` (host nuevo). Si el blueprint
   gestiona la base, `DATABASE_URL` se actualiza sola.
4. Manual Deploy del web service. Verificar §5.

> Los datos reales cargados por la consola SuperAdmin **no se recuperan** —
> free tier no tiene backups. Si el proyecto deja de ser demo, pasar la
> Postgres a plan de pago (~US$6/mes) y esto se termina.

---

## 8. Gotchas

- **RLS silenciosamente inactivo**: si por error ponés la URL del rol dueño
  en `APP_DATABASE_URL`, la app funciona pero **sin aislamiento entre
  tenants**. Confirmá que `APP_DATABASE_URL` usa `stockpro_app`.
- **External vs Internal URL**: comandos desde tu PC → External; env vars
  del web service → Internal. No mezclar.
- **Primer request lento**: el service free se duerme; la primera llamada
  tras inactividad tarda ~30-50 s en despertar. No es un bug.
- **Chromium / memoria**: generar PDF (Puppeteer) levanta Chromium; en los
  512 MB del free puede quedar justo y matar el proceso. Si pasa, es señal
  de que toca plan de pago.
- **`region` de la base free**: si `virginia` no está disponible para free,
  cambiala en los dos bloques del `render.yaml` y reaplica.
