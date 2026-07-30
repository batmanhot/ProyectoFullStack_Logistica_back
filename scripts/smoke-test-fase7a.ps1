# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7a (Flota: vehiculos, mantenimientos,
# combustible, alertas)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-7a migrados.
# Re-ejecutable: usa un sufijo de hora para la placa (unica por empresa).
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7a.ps1
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

# Login -----------------------------------------------------------------
Show-Step "0) Login dlnorte"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$token = $login.data.accessToken
$sufijo = Get-Date -Format "HHmmss"

# VEHICULOS -----------------------------------------------------------
Show-Step "1) Crear vehiculo"
$soatProximo = (Get-Date).AddDays(20).ToString("yyyy-MM-dd")
$vehiculo = Invoke-Api -Uri "$base/flota/vehiculos" -Method Post -Token $token -Body @{
    nombre = "Camion Fase7a"; tipo = "Camion"; placa = "F7A-$sufijo"
    kmActual = 5000; vencSoat = $soatProximo
}
Write-Host "  placa:" $vehiculo.data.placa "kmActual:" $vehiculo.data.kmActual "(esperado: 5000)"

Show-Step "2) Intentar crear otro vehiculo con la MISMA placa (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/flota/vehiculos" -Method Post -Token $token -Body @{
        nombre = "Duplicado"; tipo = "Auto"; placa = "F7A-$sufijo"
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por placa duplicada" -ForegroundColor Green }

# MANTENIMIENTOS --------------------------------------------------------
Show-Step "3) Registrar mantenimiento con km MENOR al actual (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/flota/vehiculos/$($vehiculo.data.id)/mantenimientos" -Method Post -Token $token -Body @{
        tipo = "Cambio de aceite"; kmActual = 4000
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, el km no puede retroceder" -ForegroundColor Green }

Show-Step "4) Registrar mantenimiento con km MAYOR - debe sincronizar el vehiculo"
Invoke-Api -Uri "$base/flota/vehiculos/$($vehiculo.data.id)/mantenimientos" -Method Post -Token $token -Body @{
    tipo = "Cambio de aceite"; kmActual = 5200; costo = 150; taller = "Taller Central"
} | Out-Null
$vehiculoTrasMant = Invoke-Api -Uri "$base/flota/vehiculos/$($vehiculo.data.id)" -Token $token
Write-Host "  kmActual tras mantenimiento:" $vehiculoTrasMant.data.kmActual "(esperado: 5200)"

# COMBUSTIBLE -------------------------------------------------------------
Show-Step "5) Registrar combustible con kmDespues MENOR a kmAntes (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/flota/combustible" -Method Post -Token $token -Body @{
        vehiculoId = $vehiculo.data.id; litros = 40; costo = 200; kmAntes = 5200; kmDespues = 5100
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, kmDespues no puede ser menor" -ForegroundColor Green }

Show-Step "6) Registrar combustible valido - debe calcular kmRecorridos y sincronizar el vehiculo"
$combustible = Invoke-Api -Uri "$base/flota/combustible" -Method Post -Token $token -Body @{
    vehiculoId = $vehiculo.data.id; litros = 40; costo = 200; kmAntes = 5200; kmDespues = 5450
}
Write-Host "  kmRecorridos:" $combustible.data.kmRecorridos "(esperado: 250)"

$vehiculoTrasCombustible = Invoke-Api -Uri "$base/flota/vehiculos/$($vehiculo.data.id)" -Token $token
Write-Host "  kmActual tras cargar combustible:" $vehiculoTrasCombustible.data.kmActual "(esperado: 5450)"
Write-Host "  mantenimientos registrados:" $vehiculoTrasCombustible.data.mantenimientos.Count "(esperado: 1)"
Write-Host "  cargas de combustible registradas:" $vehiculoTrasCombustible.data.registrosCombustible.Count "(esperado: 1)"

# ALERTAS -----------------------------------------------------------------
Show-Step "7) Consultar alertas - el SOAT vence en 20 dias, debe aparecer"
$alertas = Invoke-Api -Uri "$base/flota/alertas" -Token $token
$alertaVehiculo = $alertas.data | Where-Object { $_.vehiculoId -eq $vehiculo.data.id }
Write-Host "  alerta encontrada:" ($null -ne $alertaVehiculo) "tipo:" $alertaVehiculo.tipo "dias:" $alertaVehiculo.dias "(esperado: SOAT, ~20)"

# SOFT-DELETE -------------------------------------------------------------
Show-Step "8) Desactivar el vehiculo (soft-delete) - no debe aparecer en el listado por defecto"
Invoke-Api -Uri "$base/flota/vehiculos/$($vehiculo.data.id)" -Method Delete -Token $token | Out-Null
$activos = Invoke-Api -Uri "$base/flota/vehiculos" -Token $token
$siguePresente = $activos.data | Where-Object { $_.id -eq $vehiculo.data.id }
Write-Host "  sigue en el listado de activos?" ($null -ne $siguePresente) "(esperado: False)"

$todos = Invoke-Api -Uri "$base/flota/vehiculos?incluirInactivos=true" -Token $token
$sigueEnTodos = $todos.data | Where-Object { $_.id -eq $vehiculo.data.id }
Write-Host "  sigue existiendo con incluirInactivos=true?" ($null -ne $sigueEnTodos) "(esperado: True)"

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "9) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$vehiculosAcme = Invoke-Api -Uri "$base/flota/vehiculos?incluirInactivos=true" -Token $tokenAcme
$mantAcme = Invoke-Api -Uri "$base/flota/mantenimientos" -Token $tokenAcme
$combAcme = Invoke-Api -Uri "$base/flota/combustible" -Token $tokenAcme

Write-Host "  Vehiculos visibles para acme:      " $vehiculosAcme.data.Count "(esperado: 0)"
Write-Host "  Mantenimientos visibles para acme: " $mantAcme.data.Count "(esperado: 0)"
Write-Host "  Combustible visible para acme:     " $combAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 7a completo." -ForegroundColor Green
