# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 3 (Productos, Lotes, Inventario, Movimientos, Kardex)
# Requiere: servidor corriendo, seed de Fase 1 aplicado, RLS de Fase 2 y 3 migrados.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase3.ps1
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
Show-Step "0) Login dlnorte y preparar catalogos base"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$token = $login.data.accessToken

$cat = Invoke-Api -Uri "$base/categorias" -Method Post -Token $token -Body @{ nombre = "Abarrotes Fase3" }
$almOrigen = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Origen F3" }
$almDestino = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Destino F3" }

# PRODUCTO ----------------------------------------------------------------
Show-Step "1) Crear producto"
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{
    sku = "SKU-F3-001"; nombre = "Arroz Extra 5kg"; categoriaId = $cat.data.id
    stockMinimo = 10; stockMaximo = 500; precioCompra = 15; precioVenta = 22
}
Write-Host "  stockActual inicial:" $prod.data.stockActual "(esperado: 0)"

Show-Step "2) Producto con stockMinimo > stockMaximo (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{
        sku = "SKU-F3-BAD"; nombre = "Producto Invalido"; stockMinimo = 100; stockMaximo = 10
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por rango de stock invalido" -ForegroundColor Green }

# LOTE ----------------------------------------------------------------
Show-Step "3) Crear lote para el producto"
$lote = Invoke-Api -Uri "$base/lotes" -Method Post -Token $token -Body @{
    productoId = $prod.data.id; numero = "LOTE-001"; cantidadOriginal = 100
}
$lote.data | Format-List

# ENTRADA ----------------------------------------------------------------
Show-Step "4) Movimiento ENTRADA de 100 unidades (con lote)"
$entrada = Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $almOrigen.data.id
    loteId = $lote.data.id; cantidad = 100; costoUnitario = 15; motivo = "Compra inicial"
}
$prodTrasEntrada = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras ENTRADA:" $prodTrasEntrada.data.stockActual "(esperado: 100)"

$inv = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
$inv.data | Format-Table almacenId, cantidad

# SALIDA con stock insuficiente -------------------------------------------
Show-Step "5) SALIDA de 500 (mas de lo disponible) - debe fallar con 400"
try {
    Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
        tipo = "SALIDA"; productoId = $prod.data.id; almacenId = $almOrigen.data.id; cantidad = 500
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por stock insuficiente" -ForegroundColor Green }

# SALIDA valida ----------------------------------------------------------
Show-Step "6) SALIDA de 20 unidades (stock suficiente)"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "SALIDA"; productoId = $prod.data.id; almacenId = $almOrigen.data.id
    loteId = $lote.data.id; cantidad = 20; motivo = "Venta"
} | Out-Null
$prodTrasSalida = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras SALIDA:" $prodTrasSalida.data.stockActual "(esperado: 80)"

# AJUSTE incremento y decremento ------------------------------------------
Show-Step "7) AJUSTE incremento de 5 (se encontro stock adicional)"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "AJUSTE"; productoId = $prod.data.id; almacenId = $almOrigen.data.id
    cantidad = 5; direccion = "incremento"; motivo = "Conteo fisico"
} | Out-Null

Show-Step "8) AJUSTE decremento de 3 (merma) - verificar que Movimiento.cantidad quede NEGATIVA"
$ajusteDec = Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "AJUSTE"; productoId = $prod.data.id; almacenId = $almOrigen.data.id
    cantidad = 3; direccion = "decremento"; motivo = "Merma"
}
Write-Host "  Movimiento.cantidad guardada:" $ajusteDec.data.cantidad "(esperado: -3)"

$prodTrasAjustes = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras ajustes (+5, -3):" $prodTrasAjustes.data.stockActual "(esperado: 82)"

Show-Step "9) AJUSTE sin 'direccion' (debe fallar con 400 - es obligatoria para AJUSTE)"
try {
    Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
        tipo = "AJUSTE"; productoId = $prod.data.id; almacenId = $almOrigen.data.id; cantidad = 1
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por falta de direccion" -ForegroundColor Green }

# TRANSFERENCIA ------------------------------------------------------------
Show-Step "10) TRANSFERENCIA de 30 unidades entre almacenes"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "TRANSFERENCIA"; productoId = $prod.data.id
    almacenId = $almOrigen.data.id; almacenDestinoId = $almDestino.data.id; cantidad = 30
} | Out-Null

$prodTrasTransfer = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras TRANSFERENCIA (debe ser igual que antes, 82):" $prodTrasTransfer.data.stockActual

$invTrasTransfer = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
$invTrasTransfer.data | Format-Table almacenId, cantidad

Show-Step "11) TRANSFERENCIA con mismo almacen origen y destino (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
        tipo = "TRANSFERENCIA"; productoId = $prod.data.id
        almacenId = $almOrigen.data.id; almacenDestinoId = $almOrigen.data.id; cantidad = 1
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por origen=destino" -ForegroundColor Green }

# DEVOLUCION ----------------------------------------------------------------
Show-Step "12) DEVOLUCION de 10 unidades (debe sumar stock)"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "DEVOLUCION"; productoId = $prod.data.id; almacenId = $almOrigen.data.id
    cantidad = 10; motivo = "Cliente devolvio producto"
} | Out-Null
$prodTrasDevolucion = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras DEVOLUCION (+10):" $prodTrasDevolucion.data.stockActual "(esperado: 92)"

# KARDEX --------------------------------------------------------------------
Show-Step "13) Kardex completo del producto (saldo corrido)"
$kardex = Invoke-Api -Uri "$base/kardex?productoId=$($prod.data.id)" -Token $token
$kardex.data | Format-Table tipo, delta, saldoAcumulado, fecha

Show-Step "14) Kardex filtrado solo por el almacen origen"
$kardexOrigen = Invoke-Api -Uri "$base/kardex?productoId=$($prod.data.id)&almacenId=$($almOrigen.data.id)" -Token $token
$kardexOrigen.data | Format-Table tipo, delta, saldoAcumulado

# AISLAMIENTO CRUZADO ------------------------------------------------------
Show-Step "15) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$prodAcme = Invoke-Api -Uri "$base/productos?incluirInactivos=true" -Token $tokenAcme
$movAcme  = Invoke-Api -Uri "$base/movimientos" -Token $tokenAcme
$invAcme  = Invoke-Api -Uri "$base/inventario" -Token $tokenAcme
$loteAcme = Invoke-Api -Uri "$base/lotes" -Token $tokenAcme

Write-Host "  Productos visibles para acme:  " $prodAcme.data.Count "(esperado: 0)"
Write-Host "  Movimientos visibles para acme:" $movAcme.data.Count "(esperado: 0)"
Write-Host "  Inventario visible para acme:  " $invAcme.data.Count "(esperado: 0)"
Write-Host "  Lotes visibles para acme:      " $loteAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 3 completo." -ForegroundColor Green
