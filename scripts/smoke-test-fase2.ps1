# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 2 (Categorías, Almacenes, Ubicaciones, Proveedores)
# Requiere: servidor corriendo, seed de Fase 1 ya aplicado, y RLS de
# Fase 2 ya migrado (ver README.md, sección "Fase 2").
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase2.ps1
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

# Login dlnorte ------------------------------------------------------
Show-Step "0) Login dlnorte"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$token = $login.data.accessToken

# CATEGORIAS ----------------------------------------------------------
Show-Step "1) Crear categoria 'Bebidas'"
$cat = Invoke-Api -Uri "$base/categorias" -Method Post -Token $token -Body @{ nombre = "Bebidas"; descripcion = "Bebidas embotelladas" }
$cat.data | Format-List

Show-Step "2) Soft-delete de la categoria (debe quedar estado=Inactivo, no desaparecer de la BD)"
$catEliminada = Invoke-Api -Uri "$base/categorias/$($cat.data.id)" -Method Delete -Token $token
Write-Host "  estado tras DELETE:" $catEliminada.data.estado "(esperado: Inactivo)"

$catsActivas = Invoke-Api -Uri "$base/categorias" -Token $token
$idsActivas = $catsActivas.data | ForEach-Object { $_.id }
Write-Host "  Aparece en listado por defecto (solo activas)?" ($idsActivas -contains $cat.data.id) "(esperado: False)"

$catsTodas = Invoke-Api -Uri "$base/categorias?incluirInactivas=true" -Token $token
$idsTodas = $catsTodas.data | ForEach-Object { $_.id }
Write-Host "  Aparece con incluirInactivas=true?" ($idsTodas -contains $cat.data.id) "(esperado: True)"

# ALMACENES -------------------------------------------------------------
Show-Step "3) Crear almacen 'Almacen Central'"
$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Central" }
$alm.data | Format-List

# UBICACIONES ----------------------------------------------------------
Show-Step "4) Crear ubicacion valida dentro del almacen"
$ubi = Invoke-Api -Uri "$base/ubicaciones" -Method Post -Token $token -Body @{
    almacenId = $alm.data.id; codigo = "A-01"; tipo = "Estanteria"; zona = "Picking"; capacidadMax = 100
}
$ubi.data | Format-List

Show-Step "5) Crear ubicacion con almacenId inexistente (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/ubicaciones" -Method Post -Token $token -Body @{
        almacenId = "no-existe-este-id"; codigo = "X-99"; tipo = "Rack"; zona = "Reserva"; capacidadMax = 10
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado y no fallo" -ForegroundColor Yellow
} catch {
    Write-Host "  OK: rechazado por almacenId invalido" -ForegroundColor Green
}

Show-Step "6) Actualizar capacidadActual por encima de capacidadMax (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/ubicaciones/$($ubi.data.id)" -Method Put -Token $token -Body @{ capacidadActual = 999 }
    Write-Host "  ADVERTENCIA: deberia haber fallado y no fallo" -ForegroundColor Yellow
} catch {
    Write-Host "  OK: rechazado por exceder capacidadMax" -ForegroundColor Green
}

# PROVEEDORES -------------------------------------------------------------
Show-Step "7) Crear proveedor con RUC invalido (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/proveedores" -Method Post -Token $token -Body @{ razonSocial = "Proveedor Test"; ruc = "123" }
    Write-Host "  ADVERTENCIA: deberia haber fallado y no fallo" -ForegroundColor Yellow
} catch {
    Write-Host "  OK: rechazado por formato de RUC invalido" -ForegroundColor Green
}

Show-Step "8) Crear proveedor con RUC valido"
$prov = Invoke-Api -Uri "$base/proveedores" -Method Post -Token $token -Body @{
    razonSocial = "Distribuidora Andina SAC"; ruc = "20123456789"; email = "ventas@andina.demo"
}
$prov.data | Format-List

Show-Step "9) Busqueda difusa por razonSocial (substring 'andina')"
$buscar = Invoke-Api -Uri "$base/proveedores?busqueda=andina" -Token $token
$buscar.data | Format-Table id, razonSocial, ruc

# AISLAMIENTO CRUZADO ------------------------------------------------------
Show-Step "10) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$catsAcme = Invoke-Api -Uri "$base/categorias?incluirInactivas=true" -Token $tokenAcme
$almAcme  = Invoke-Api -Uri "$base/almacenes?incluirInactivos=true" -Token $tokenAcme
$provAcme = Invoke-Api -Uri "$base/proveedores?incluirInactivos=true" -Token $tokenAcme

Write-Host "  Categorias visibles para acme:" $catsAcme.data.Count "(esperado: 0)"
Write-Host "  Almacenes visibles para acme: " $almAcme.data.Count "(esperado: 0)"
Write-Host "  Proveedores visibles para acme:" $provAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 2 completo." -ForegroundColor Green
