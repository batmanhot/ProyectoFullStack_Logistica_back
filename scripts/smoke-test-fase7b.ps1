# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7b (Mapa de Almacen: reubicacion +
# Reportes: Financiero/KPIs Operativos)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-7a migrados.
# No hay RLS nuevo en Fase 7b (no se agregaron tablas).
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7b.ps1
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

# Login + catalogos base ----------------------------------------------
Show-Step "0) Login dlnorte y preparar catalogos base"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$token = $login.data.accessToken
$sufijo = Get-Date -Format "HHmmss"

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase7b $sufijo" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{
    sku = "SKU-F7B-$sufijo"; nombre = "Producto Fase7b"; precioCompra = 10; precioVenta = 18
}
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 100
} | Out-Null

# MAPA DE ALMACEN — reubicacion ------------------------------------------
Show-Step "1) Crear ubicacion dentro del almacen"
$ubic = Invoke-Api -Uri "$base/ubicaciones" -Method Post -Token $token -Body @{
    almacenId = $alm.data.id; codigo = "A-01-$sufijo"; tipo = "Estanteria"; zona = "Picking"; capacidadMax = 50
}
Write-Host "  ubicacion creada:" $ubic.data.codigo

Show-Step "2) Asignar 40 unidades a la ubicacion (debe descontar del bucket sin asignar)"
$asignacion = Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/asignar" -Method Post -Token $token -Body @{
    productoId = $prod.data.id; cantidad = 40
}
Write-Host "  cantidadReubicada:" $asignacion.data.cantidadReubicada "(esperado: 40)"

$invUbic = Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/inventario" -Token $token
Write-Host "  productos en la ubicacion:" $invUbic.data.Count "cantidad:" $invUbic.data[0].cantidad "(esperado: 1 / 40)"

$ubicTrasAsignar = Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)" -Token $token
Write-Host "  capacidadActual recalculada:" $ubicTrasAsignar.data.capacidadActual "(esperado: 1, un SKU distinto)"

Show-Step "3) Intentar asignar mas de lo disponible (quedan 60, pedir 100 - debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/asignar" -Method Post -Token $token -Body @{
        productoId = $prod.data.id; cantidad = 100
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por stock disponible insuficiente" -ForegroundColor Green }

Show-Step "4) Liberar 15 unidades de vuelta al bucket general"
Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/liberar" -Method Post -Token $token -Body @{
    productoId = $prod.data.id; cantidad = 15
} | Out-Null
$invUbicTrasLiberar = Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/inventario" -Token $token
Write-Host "  cantidad restante en la ubicacion:" $invUbicTrasLiberar.data[0].cantidad "(esperado: 25)"

Show-Step "5) Intentar liberar mas de lo que hay en la ubicacion (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/ubicaciones/$($ubic.data.id)/liberar" -Method Post -Token $token -Body @{
        productoId = $prod.data.id; cantidad = 999
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, no hay esa cantidad en la ubicacion" -ForegroundColor Green }

# REPORTES ------------------------------------------------------------------
Show-Step "6) Generar una SALIDA para que los reportes tengan datos"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "SALIDA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 10; costoUnitario = 10
} | Out-Null

Show-Step "7) Consultar reporte Financiero (3 meses)"
$financiero = Invoke-Api -Uri "$base/reportes/financiero?meses=3" -Token $token
$mesActual = $financiero.data.meses[-1]
Write-Host "  ingresos mes actual:" $mesActual.ingresos "(esperado: 180 = 10 unidades x precioVenta 18)"
Write-Host "  costoVentas mes actual:" $mesActual.costoVentas "(esperado: 100 = 10 unidades x costoUnitario 10)"
Write-Host "  valorInventario:" $financiero.data.valorInventario "(>0 esperado)"

Show-Step "8) Consultar reporte KPIs Operativos (30 dias)"
$kpis = Invoke-Api -Uri "$base/reportes/kpis-operativos?dias=30" -Token $token
Write-Host "  fillRate:" $kpis.data.fillRate "otif:" $kpis.data.otif "perfectOrder:" $kpis.data.perfectOrder

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "9) Login acme y verificar que los reportes NO incluyen datos de dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$financieroAcme = Invoke-Api -Uri "$base/reportes/financiero?meses=3" -Token $tokenAcme
$mesActualAcme = $financieroAcme.data.meses[-1]
Write-Host "  ingresos de acme (no deben incluir los 180 de dlnorte):" $mesActualAcme.ingresos

Write-Host "`nSmoke test Fase 7b completo." -ForegroundColor Green
