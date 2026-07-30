# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 5 (Despachos, Transportistas, Rutas,
# Stock Reservado)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-5 migrados.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase5.ps1
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

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase5" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{ sku = "SKU-F5-001"; nombre = "Producto Fase5" }
$cliente = Invoke-Api -Uri "$base/clientes" -Method Post -Token $token -Body @{ razonSocial = "Cliente Fase5 SAC" }
$transportista = Invoke-Api -Uri "$base/transportistas" -Method Post -Token $token -Body @{ nombre = "Transportista Fase5"; tipo = "PROPIO"; placa = "ABC-123" }

Show-Step "0b) Cargar stock real (ENTRADA de 100 unidades) para poder reservar despues"
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 100
} | Out-Null

# DESPACHO 1 — ciclo completo manual -----------------------------------
Show-Step "1) Crear Despacho 1 por 30 unidades (debe RESERVAR stock, no descontar stockActual)"
$desp1 = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 30; precioVenta = 20 })
}
Write-Host "  numero:" $desp1.data.numero "estado:" $desp1.data.estado "(esperado: PEDIDO)"

$prodTrasReserva = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras reservar (NO debe cambiar):" $prodTrasReserva.data.stockActual "(esperado: 100)"

$invTrasReserva = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
Write-Host "  cantidadReservada en Inventario:" $invTrasReserva.data[0].cantidadReservada "(esperado: 30)"

Show-Step "2) Intentar crear Despacho 2 por 80 (mas de lo DISPONIBLE: 100-30=70) - debe fallar con 400"
try {
    Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
        clienteId = $cliente.data.id; almacenId = $alm.data.id
        items = @(@{ productoId = $prod.data.id; cantidad = 80; precioVenta = 20 })
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado por stock disponible insuficiente (considerando la reserva)" -ForegroundColor Green }

Show-Step "3) Avanzar Despacho 1: aprobar -> picking -> listo"
Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/aprobar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/picking" -Method Post -Token $token | Out-Null
$desp1Listo = Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/listo" -Method Post -Token $token
Write-Host "  estado:" $desp1Listo.data.estado "(esperado: LISTO)"

Show-Step "4) Despachar Despacho 1 - debe generar Movimiento SALIDA real y liberar la reserva"
$desp1Despachado = Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/despachar" -Method Post -Token $token -Body @{ guiaNumero = "G-001" }
Write-Host "  estado:" $desp1Despachado.data.estado "(esperado: DESPACHADO)"

$prodTrasDespacho = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras despachar (debe BAJAR a 70):" $prodTrasDespacho.data.stockActual

$invTrasDespacho = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
Write-Host "  cantidadReservada tras despachar (debe volver a 0):" $invTrasDespacho.data[0].cantidadReservada

Show-Step "5) Entregar Despacho 1"
$desp1Entregado = Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/entregar" -Method Post -Token $token
Write-Host "  estado:" $desp1Entregado.data.estado "(esperado: ENTREGADO)"

Show-Step "6) Intentar cancelar un despacho ya ENTREGADO (debe fallar con 403)"
try {
    Invoke-Api -Uri "$base/despachos/$($desp1.data.id)/cancelar" -Method Post -Token $token
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, ya estaba ENTREGADO" -ForegroundColor Green }

# DESPACHO 2 — cancelacion libera la reserva ----------------------------
Show-Step "7) Crear Despacho 2 por 50 unidades y CANCELARLO antes de despachar"
$desp2 = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 50; precioVenta = 20 })
}
$invConDesp2 = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
Write-Host "  cantidadReservada con Despacho 2 activo:" $invConDesp2.data[0].cantidadReservada "(esperado: 50)"

Invoke-Api -Uri "$base/despachos/$($desp2.data.id)/cancelar" -Method Post -Token $token | Out-Null
$invTrasCancelar = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $token
Write-Host "  cantidadReservada tras cancelar (debe volver a 0):" $invTrasCancelar.data[0].cantidadReservada

# RUTA — agrupa despachos y los despacha todos al iniciar -------------------
Show-Step "8) Crear Despacho 3, llevarlo a LISTO, y meterlo en una Ruta"
$desp3 = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 10; precioVenta = 20 })
}
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/aprobar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/picking" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/listo" -Method Post -Token $token | Out-Null

$ruta = Invoke-Api -Uri "$base/rutas" -Method Post -Token $token -Body @{
    transportistaId = $transportista.data.id; fechaSalida = (Get-Date).ToString("yyyy-MM-dd")
    despachoIds = @($desp3.data.id)
}
Write-Host "  numero:" $ruta.data.numero "estado:" $ruta.data.estado "(esperado: PROGRAMADA)"

Show-Step "9) Iniciar la Ruta - debe despachar el Despacho 3 automaticamente (Movimiento SALIDA real)"
$prodAntes = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
$rutaIniciada = Invoke-Api -Uri "$base/rutas/$($ruta.data.id)/iniciar" -Method Post -Token $token
Write-Host "  estado ruta:" $rutaIniciada.data.estado "(esperado: EN_RUTA)"

$desp3TrasRuta = Invoke-Api -Uri "$base/despachos/$($desp3.data.id)" -Token $token
Write-Host "  estado Despacho 3 tras iniciar ruta:" $desp3TrasRuta.data.estado "(esperado: DESPACHADO, sin llamar /despachar manualmente)"

$prodDespues = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual bajo de" $prodAntes.data.stockActual "a" $prodDespues.data.stockActual "(esperado: -10)"

Show-Step "10) Marcar la parada como ENTREGADO - debe entregar el Despacho 3 tambien"
Invoke-Api -Uri "$base/rutas/$($ruta.data.id)/paradas/$($desp3.data.id)" -Method Post -Token $token -Body @{ estado = "ENTREGADO" } | Out-Null
$desp3Entregado = Invoke-Api -Uri "$base/despachos/$($desp3.data.id)" -Token $token
Write-Host "  estado Despacho 3:" $desp3Entregado.data.estado "(esperado: ENTREGADO)"

Show-Step "11) Completar la Ruta"
$rutaCompletada = Invoke-Api -Uri "$base/rutas/$($ruta.data.id)/completar" -Method Post -Token $token -Body @{ kmRecorrido = 15.5; costoViaje = 50 }
Write-Host "  estado ruta:" $rutaCompletada.data.estado "(esperado: COMPLETADA)"

# CxC con FK real a Despacho ------------------------------------------------
Show-Step "12) Crear CuentaPorCobrar ligada al Despacho 1 (FK real, ya no referencia libre)"
$cxc = Invoke-Api -Uri "$base/cuentas-por-cobrar" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; despachoId = $desp1.data.id; monto = 600
}
Write-Host "  numero:" $cxc.data.numero "despachoId:" $cxc.data.despachoId

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "13) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$transAcme = Invoke-Api -Uri "$base/transportistas" -Token $tokenAcme
$despAcme = Invoke-Api -Uri "$base/despachos" -Token $tokenAcme
$rutasAcme = Invoke-Api -Uri "$base/rutas" -Token $tokenAcme

Write-Host "  Transportistas visibles para acme:" $transAcme.data.Count "(esperado: 0)"
Write-Host "  Despachos visibles para acme:     " $despAcme.data.Count "(esperado: 0)"
Write-Host "  Rutas visibles para acme:         " $rutasAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 5 completo." -ForegroundColor Green
