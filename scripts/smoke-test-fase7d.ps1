# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7d (AdminSaaS)
#
# Requiere: servidor corriendo, seed (Fase 1 + 7d) aplicado.
# Re-ejecutable: usa un sufijo de hora para codigo/ruc/email unicos.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7d.ps1
# ════════════════════════════════════════════════════════════════

$base = "http://localhost:3000/api"

function Show-Step($titulo) {
    Write-Host "`n=== $titulo ===" -ForegroundColor Cyan
}

function Invoke-Api {
    param($Uri, $Method = "Get", $Body = $null, $Token = $null)
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($Body) {
            $json = $Body | ConvertTo-Json -Depth 6
            return Invoke-RestMethod -Uri $Uri -Method $Method -Body $json -ContentType "application/json" -Headers $headers
        } else {
            return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers
        }
    } catch {
        Write-Host "  ERROR -> STATUS:" $_.Exception.Response.StatusCode.value__ -ForegroundColor Red
        Write-Host "  " $_.ErrorDetails.Message -ForegroundColor Red
        throw
    }
}

$sufijo = Get-Date -Format "HHmmss"

# LOGIN PLATFORMADMIN -------------------------------------------------
Show-Step "0) Login como PlatformAdmin (/api/admin/auth/login - NO el login de tenant)"
$loginAdmin = Invoke-Api -Uri "$base/admin/auth/login" -Method Post -Body @{
    email = "admin@stockpro.dev"; password = "AdminSaaS2026!"
}
$adminToken = $loginAdmin.data.accessToken
Write-Host "  admin:" $loginAdmin.data.admin.email

# SEPARACION DE AUTENTICACION (la prueba mas importante) --------------------
Show-Step "1) Verificar que un JWT de TENANT (dlnorte) es RECHAZADO en /admin/* (debe fallar con 401)"
$empresaDlnorte = Invoke-Api -Uri "$base/empresas/dlnorte"
$loginTenant = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaDlnorte.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$tenantToken = $loginTenant.data.accessToken
try {
    Invoke-Api -Uri "$base/admin/negocios" -Token $tenantToken
    Write-Host "  ADVERTENCIA DE SEGURIDAD: el JWT de tenant NO deberia funcionar aqui" -ForegroundColor Yellow
} catch { Write-Host "  OK: el JWT de tenant fue rechazado en rutas de admin (separacion funciona)" -ForegroundColor Green }

Show-Step "2) Verificar que el JWT de PlatformAdmin es RECHAZADO en rutas de tenant (debe fallar con 401)"
try {
    Invoke-Api -Uri "$base/usuarios" -Token $adminToken
    Write-Host "  ADVERTENCIA DE SEGURIDAD: el JWT de admin NO deberia funcionar aqui" -ForegroundColor Yellow
} catch { Write-Host "  OK: el JWT de admin fue rechazado en rutas de tenant (separacion funciona en ambos sentidos)" -ForegroundColor Green }

# NEGOCIOS ------------------------------------------------------------
Show-Step "3) Listar negocios - deben aparecer dlnorte y acme (cross-tenant real)"
$negocios = Invoke-Api -Uri "$base/admin/negocios" -Token $adminToken
Write-Host "  total de negocios:" $negocios.data.Count "(esperado: >= 2)"

Show-Step "4) Crear un negocio NUEVO (bootstrap completo: Empresa + Usuario admin inicial)"
$nuevoNegocio = Invoke-Api -Uri "$base/admin/negocios" -Method Post -Token $adminToken -Body @{
    codigo = "f7d-$sufijo"; nombre = "Negocio Fase7d SAC"; ruc = "20888888880"
    plan = "basico"; adminNombre = "Admin F7D"; adminEmail = "admin@f7d-$sufijo.demo"; adminPassword = "Negocio2026!"
}
Write-Host "  negocio creado:" $nuevoNegocio.data.codigo "usuario admin:" $nuevoNegocio.data.usuarioAdminInicial.email

Show-Step "5) Probar el circulo completo: login real como el nuevo tenant recien creado"
$empresaNueva = Invoke-Api -Uri "$base/empresas/f7d-$sufijo"
$loginNuevoTenant = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaNueva.data.id; email = "admin@f7d-$sufijo.demo"; password = "Negocio2026!"
}
Write-Host "  login exitoso con el usuario recien creado, rol:" $loginNuevoTenant.data.usuario.rol.codigo "(esperado: admin)"

Show-Step "6) Editar el negocio (plan + fecha de vencimiento proxima)"
$vencimientoProximo = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
$negocioEditado = Invoke-Api -Uri "$base/admin/negocios/$($nuevoNegocio.data.id)" -Method Put -Token $adminToken -Body @{
    plan = "profesional"; fechaVencimiento = $vencimientoProximo
}
Write-Host "  plan actualizado:" $negocioEditado.data.plan "(esperado: profesional)"

# PLANES ----------------------------------------------------------------
Show-Step "7) Listar planes del catalogo (creados por el seed)"
$planes = Invoke-Api -Uri "$base/admin/planes" -Token $adminToken
Write-Host "  cantidad de planes:" $planes.data.Count "(esperado: 4)"

# RENOVACIONES ------------------------------------------------------------
Show-Step "8) Registrar una renovacion de pago para el negocio nuevo"
$renovacion = Invoke-Api -Uri "$base/admin/renovaciones" -Method Post -Token $adminToken -Body @{
    empresaId = $nuevoNegocio.data.id; planId = "profesional"; monto = 99; ciclo = "mensual"
    metodoPago = "tarjeta"; periodoInicio = (Get-Date).ToString("yyyy-MM-dd"); periodoFin = $vencimientoProximo
}
Write-Host "  renovacion creada, estado:" $renovacion.data.estado "(esperado: PAGADO)"

Show-Step "9) Anular la renovacion (soft - nunca DELETE fisico)"
$renovacionAnulada = Invoke-Api -Uri "$base/admin/renovaciones/$($renovacion.data.id)/anular" -Method Post -Token $adminToken
Write-Host "  estado tras anular:" $renovacionAnulada.data.estado "(esperado: ANULADO)"

# ALERTAS -----------------------------------------------------------------
Show-Step "10) Crear regla de alerta (30 dias antes) y consultar vencimientos proximos"
Invoke-Api -Uri "$base/admin/alertas" -Method Post -Token $adminToken -Body @{
    diasAntes = 30; canales = @("email", "sistema"); asunto = "Tu plan vence pronto"; mensaje = "Renueva ya"
} | Out-Null

$vencimientos = Invoke-Api -Uri "$base/admin/alertas/vencimientos-proximos" -Token $adminToken
$nuestroNegocioEnAlertas = $vencimientos.data | Where-Object { $_.empresaId -eq $nuevoNegocio.data.id }
Write-Host "  nuestro negocio (vence en 10 dias) aparece en vencimientos proximos?" ($null -ne $nuestroNegocioEnAlertas) "(esperado: True)"

# LANDING -----------------------------------------------------------------
Show-Step "11) Configurar Landing Page (singleton JSON) y volver a leerla"
Invoke-Api -Uri "$base/admin/landing" -Method Put -Token $adminToken -Body @{
    data = @{ sitio = @{ nombre = "StockPro" }; hero = @{ titulo = "Gestiona tu inventario" } }
} | Out-Null
$landing = Invoke-Api -Uri "$base/admin/landing" -Token $adminToken
Write-Host "  titulo guardado:" $landing.data.data.hero.titulo

# SOFT-DELETE DE NEGOCIO -------------------------------------------------
Show-Step "12) Desactivar (soft-delete) el negocio de prueba"
$negocioDesactivado = Invoke-Api -Uri "$base/admin/negocios/$($nuevoNegocio.data.id)" -Method Delete -Token $adminToken
Write-Host "  activo:" $negocioDesactivado.data.activo "estado:" $negocioDesactivado.data.estado "(esperado: False / cancelado)"

Write-Host "`nSmoke test Fase 7d completo." -ForegroundColor Green
