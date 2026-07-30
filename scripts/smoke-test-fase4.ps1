# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 4 (Clientes, Ordenes de Compra,
# Cotizaciones/RFQ, Proformas, Cuentas por Cobrar)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2/3/4 migrados,
# y haber corrido smoke-test-fase3.ps1 al menos una vez (o tener ya un
# producto/almacen creados manualmente) — este script crea sus propios
# catalogos base para no depender de estado previo.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase4.ps1
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

$prov = Invoke-Api -Uri "$base/proveedores" -Method Post -Token $token -Body @{ razonSocial = "Proveedor Fase4 SAC"; ruc = "20999999991" }
$prov2 = Invoke-Api -Uri "$base/proveedores" -Method Post -Token $token -Body @{ razonSocial = "Proveedor Fase4 Dos SAC"; ruc = "20999999992" }
$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase4" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{ sku = "SKU-F4-001"; nombre = "Producto Fase4" }

# CLIENTES --------------------------------------------------------------
Show-Step "1) Crear cliente"
$cliente = Invoke-Api -Uri "$base/clientes" -Method Post -Token $token -Body @{ razonSocial = "Cliente Fase4 SAC"; ruc = "20888888881" }
$cliente.data | Format-List

# ORDENES DE COMPRA -------------------------------------------------------
Show-Step "2) Crear Orden de Compra con 1 item"
$oc = Invoke-Api -Uri "$base/ordenes-compra" -Method Post -Token $token -Body @{
    proveedorId = $prov.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 100; costoUnitario = 10 })
}
Write-Host "  numero:" $oc.data.numero "subtotal:" $oc.data.subtotal "igv:" $oc.data.igv "total:" $oc.data.total

Show-Step "3) Recibir 60 de 100 (recepcion PARCIAL) - debe generar Movimiento ENTRADA real"
$itemId = $oc.data.items[0].id
$ocParcial = Invoke-Api -Uri "$base/ordenes-compra/$($oc.data.id)/recibir" -Method Post -Token $token -Body @{
    items = @(@{ ordenCompraItemId = $itemId; cantidad = 60 })
}
Write-Host "  estado tras recibir 60/100:" $ocParcial.data.estado "(esperado: PARCIAL)"

$prodTrasRecepcion = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual del producto tras recepcion:" $prodTrasRecepcion.data.stockActual "(esperado: 60 - prueba que el Movimiento fue REAL)"

Show-Step "4) Intentar recibir mas de lo pendiente (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/ordenes-compra/$($oc.data.id)/recibir" -Method Post -Token $token -Body @{
        items = @(@{ ordenCompraItemId = $itemId; cantidad = 100 })
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por exceder lo pendiente" -ForegroundColor Green }

Show-Step "5) Recibir el resto (40) - debe quedar RECIBIDA"
$ocCompleta = Invoke-Api -Uri "$base/ordenes-compra/$($oc.data.id)/recibir" -Method Post -Token $token -Body @{
    items = @(@{ ordenCompraItemId = $itemId; cantidad = 40 })
}
Write-Host "  estado final:" $ocCompleta.data.estado "(esperado: RECIBIDA)"

$prodFinal = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual final:" $prodFinal.data.stockActual "(esperado: 100)"

# COTIZACIONES (RFQ) ------------------------------------------------------
Show-Step "6) Crear Cotizacion (RFQ) solicitando 20 unidades del producto"
$cot = Invoke-Api -Uri "$base/cotizaciones" -Method Post -Token $token -Body @{
    items = @(@{ productoId = $prod.data.id; cantidad = 20 })
}
Write-Host "  numero:" $cot.data.numero "estado:" $cot.data.estado "(esperado: BORRADOR)"

Show-Step "7) Proveedor 1 responde a 12 c/u"
$resp1 = Invoke-Api -Uri "$base/cotizaciones/$($cot.data.id)/respuestas" -Method Post -Token $token -Body @{
    proveedorId = $prov.data.id; tiempoEntrega = 5
    items = @(@{ productoId = $prod.data.id; precioUnitario = 12 })
}
Write-Host "  respuesta 1 total:" $resp1.data.total "(esperado: 240 = 12 x 20)"

Show-Step "8) Proveedor 2 responde a 10 c/u"
$resp2 = Invoke-Api -Uri "$base/cotizaciones/$($cot.data.id)/respuestas" -Method Post -Token $token -Body @{
    proveedorId = $prov2.data.id; tiempoEntrega = 8
    items = @(@{ productoId = $prod.data.id; precioUnitario = 10 })
}
Write-Host "  respuesta 2 total:" $resp2.data.total "(esperado: 200 = 10 x 20)"

$cotRespondida = Invoke-Api -Uri "$base/cotizaciones/$($cot.data.id)" -Token $token
Write-Host "  estado tras 2 respuestas:" $cotRespondida.data.estado "(esperado: RESPONDIDA)"

Show-Step "9) Proveedor 1 intenta responder de nuevo (debe fallar con 409)"
try {
    Invoke-Api -Uri "$base/cotizaciones/$($cot.data.id)/respuestas" -Method Post -Token $token -Body @{
        proveedorId = $prov.data.id
        items = @(@{ productoId = $prod.data.id; precioUnitario = 11 })
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, proveedor ya habia respondido" -ForegroundColor Green }

Show-Step "10) Marcar al Proveedor 2 (mas barato) como ganador"
$adjudicada = Invoke-Api -Uri "$base/cotizaciones/$($cot.data.id)/respuestas/$($resp2.data.id)/ganadora" -Method Put -Token $token
Write-Host "  estado:" $adjudicada.data.estado "(esperado: ADJUDICADA)"
$ganadoras = $adjudicada.data.respuestas | Where-Object { $_.ganadora -eq $true }
Write-Host "  cantidad de respuestas marcadas ganadora:" $ganadoras.Count "(esperado: 1, exclusividad)"

# PROFORMAS ----------------------------------------------------------------
Show-Step "11) Crear Proforma (cotizacion de VENTA) a un cliente"
$prof = Invoke-Api -Uri "$base/proformas" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 5; precioUnitario = 25 })
}
Write-Host "  numero:" $prof.data.numero "total:" $prof.data.total "(esperado subtotal 125, total 147.5)"

# CUENTAS POR COBRAR --------------------------------------------------------
Show-Step "12) Crear Cuenta por Cobrar al cliente"
$cxc = Invoke-Api -Uri "$base/cuentas-por-cobrar" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; monto = 1000; diasCredito = 30
}
Write-Host "  numero:" $cxc.data.numero "saldo inicial:" $cxc.data.saldo "(esperado: 1000)"

Show-Step "13) Registrar pago parcial de 400"
$pago1 = Invoke-Api -Uri "$base/cuentas-por-cobrar/$($cxc.data.id)/pagos" -Method Post -Token $token -Body @{
    monto = 400; metodo = "transferencia"
}
$cxcParcial = Invoke-Api -Uri "$base/cuentas-por-cobrar/$($cxc.data.id)" -Token $token
Write-Host "  saldo tras pago de 400:" $cxcParcial.data.saldo "estado:" $cxcParcial.data.estado "(esperado: 600 / PARCIAL)"

Show-Step "14) Intentar pagar mas del saldo pendiente (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/cuentas-por-cobrar/$($cxc.data.id)/pagos" -Method Post -Token $token -Body @{ monto = 9999 }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por exceder el saldo" -ForegroundColor Green }

Show-Step "15) Pagar el resto (600) - debe quedar COBRADA"
Invoke-Api -Uri "$base/cuentas-por-cobrar/$($cxc.data.id)/pagos" -Method Post -Token $token -Body @{ monto = 600 } | Out-Null
$cxcFinal = Invoke-Api -Uri "$base/cuentas-por-cobrar/$($cxc.data.id)" -Token $token
Write-Host "  saldo final:" $cxcFinal.data.saldo "estado:" $cxcFinal.data.estado "(esperado: 0 / COBRADA)"
Write-Host "  cantidad de pagos registrados:" $cxcFinal.data.pagos.Count "(esperado: 2)"

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "16) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$clientesAcme = Invoke-Api -Uri "$base/clientes?incluirInactivos=true" -Token $tokenAcme
$ocAcme = Invoke-Api -Uri "$base/ordenes-compra" -Token $tokenAcme
$cotAcme = Invoke-Api -Uri "$base/cotizaciones" -Token $tokenAcme
$profAcme = Invoke-Api -Uri "$base/proformas" -Token $tokenAcme
$cxcAcme = Invoke-Api -Uri "$base/cuentas-por-cobrar" -Token $tokenAcme

Write-Host "  Clientes visibles para acme:        " $clientesAcme.data.Count "(esperado: 0)"
Write-Host "  Ordenes de compra visibles para acme:" $ocAcme.data.Count "(esperado: 0)"
Write-Host "  Cotizaciones visibles para acme:     " $cotAcme.data.Count "(esperado: 0)"
Write-Host "  Proformas visibles para acme:        " $profAcme.data.Count "(esperado: 0)"
Write-Host "  CxC visibles para acme:              " $cxcAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 4 completo." -ForegroundColor Green
