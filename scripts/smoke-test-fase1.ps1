# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 1 (Auth + Empresa + Usuario + Rol/Permiso)
# Corre todo el flujo de extremo a extremo contra un servidor ya levantado
# y muestra cada resultado. Pensado para reusarse después de cualquier
# cambio en Auth/Usuarios/Roles.
#
# Requiere: servidor corriendo en http://localhost:3000 (npm run start:dev)
# y el seed de Fase 1 ya aplicado (npm run prisma:seed).
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase1.ps1
# Si PowerShell bloquea la ejecución por policy:
#   powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test-fase1.ps1
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
            $json = $Body | ConvertTo-Json
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

# 1) Login dlnorte --------------------------------------------------
Show-Step "1) Paso 1 del login - buscar empresa dlnorte"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$empresa.data | Format-List

Show-Step "2) Paso 2 del login - autenticar admin@dlnorte.demo"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id
    email     = "admin@dlnorte.demo"
    password  = "StockPro2026!"
}
$accessToken  = $login.data.accessToken
$refreshToken = $login.data.refreshToken
$login.data.usuario | Format-List

Show-Step "3) Listar usuarios (debe verse SOLO dlnorte)"
$usuarios = Invoke-Api -Uri "$base/usuarios" -Token $accessToken
$usuarios.data | Format-Table id, nombre, email, activo

Show-Step "4) Refresh - rotacion de tokens"
$refresh = Invoke-Api -Uri "$base/auth/refresh" -Method Post -Body @{ refreshToken = $refreshToken }
$tokenAnterior = $accessToken
$accessToken   = $refresh.data.accessToken
$refreshToken  = $refresh.data.refreshToken
Write-Host "  Nuevo accessToken obtenido y distinto al anterior:" ($accessToken -ne $tokenAnterior)

Show-Step "5) Listar roles disponibles para dlnorte (catalogo base + custom)"
$roles = Invoke-Api -Uri "$base/roles" -Token $accessToken
$roles.data | Format-Table codigo, label, esPersonalizado
$rolAlmacenero = $roles.data | Where-Object { $_.codigo -eq "almacenero" }

Show-Step "6) Verificar permisos del rol 'almacenero'"
$permInventario = Invoke-Api -Uri "$base/permisos/verificar?rolId=$($rolAlmacenero.id)&modulo=inventario" -Token $accessToken
Write-Host "  almacenero + inventario -> permitido:" $permInventario.data.permitido "(esperado: True)"

$permUsuarios = Invoke-Api -Uri "$base/permisos/verificar?rolId=$($rolAlmacenero.id)&modulo=usuarios" -Token $accessToken
Write-Host "  almacenero + usuarios   -> permitido:" $permUsuarios.data.permitido "(esperado: False)"

Show-Step "7) Crear un usuario de prueba con rol 'almacenero'"
$nuevoUsuario = Invoke-Api -Uri "$base/usuarios" -Method Post -Token $accessToken -Body @{
    nombre   = "QA Smoke Test"
    email    = "qa.smoketest@dlnorte.demo"
    password = "TestQA2026!"
    rolId    = $rolAlmacenero.id
}
$nuevoUsuario.data | Format-List

Show-Step "8) Editar el usuario de prueba (cambiar nombre, sin tocar password)"
$editado = Invoke-Api -Uri "$base/usuarios/$($nuevoUsuario.data.id)" -Method Put -Token $accessToken -Body @{
    nombre = "QA Smoke Test (editado)"
}
$editado.data | Format-List

Show-Step "9) Login con password incorrecto (debe fallar con 401)"
try {
    Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
        empresaId = $empresa.data.id
        email     = "admin@dlnorte.demo"
        password  = "incorrecta"
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado y no fallo" -ForegroundColor Yellow
} catch {
    Write-Host "  OK: el login con password incorrecto fue rechazado" -ForegroundColor Green
}

Show-Step "10) Listar usuarios SIN token (debe fallar con 401)"
try {
    Invoke-RestMethod -Uri "$base/usuarios" -Method Get
    Write-Host "  ADVERTENCIA: deberia haber fallado y no fallo" -ForegroundColor Yellow
} catch {
    Write-Host "  OK: la ruta protegida rechazo la peticion sin token" -ForegroundColor Green
}

Show-Step "11) Limpieza - eliminar el usuario de prueba"
$eliminado = Invoke-Api -Uri "$base/usuarios/$($nuevoUsuario.data.id)" -Method Delete -Token $accessToken
$eliminado.data | Format-List

Write-Host "`nSmoke test Fase 1 completo." -ForegroundColor Green
