# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 6 (Areas Internas, Pedidos Internos,
# Inventario Fisico)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-6 migrados.
# Re-ejecutable: usa un sufijo de hora para no chocar con SKUs/codigos unicos
# de corridas anteriores.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase6.ps1
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

$sufijo = Get-Date -Format "HHmmss"  # permite re-correr el script sin chocar con SKU/codigo unico

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase6 $sufijo" }
# Categoria dedicada para AISLAR el snapshot del Inventario Fisico — dlnorte
# ya tiene productos de smoke tests anteriores (Fase 3/4/5) sin esta categoria.
$cat = Invoke-Api -Uri "$base/categorias" -Method Post -Token $token -Body @{ nombre = "Categoria Fase6 Aislada $sufijo" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{
    sku = "SKU-F6-$sufijo"; nombre = "Producto Fase6"; precioCompra = 8; categoriaId = $cat.data.id
}

Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 100
} | Out-Null

# AREAS INTERNAS ----------------------------------------------------------
Show-Step "1) Crear Area Interna"
$area = Invoke-Api -Uri "$base/areas-internas" -Method Post -Token $token -Body @{ nombre = "Mantenimiento $sufijo"; codigo = "MANT$sufijo" }
Write-Host "  area:" $area.data.nombre "(" $area.data.codigo ")"

# PEDIDO INTERNO — ciclo completo: BORRADOR -> ENVIADO -> APROBADO -> PICKING -> ENTREGADO
Show-Step "2) Crear Pedido Interno (BORRADOR) por 15 unidades"
$pedido = Invoke-Api -Uri "$base/pedidos-internos" -Method Post -Token $token -Body @{
    areaId = $area.data.id; almacenId = $alm.data.id; prioridad = "URGENTE"
    items = @(@{ productoId = $prod.data.id; cantidad = 15 })
}
Write-Host "  numero:" $pedido.data.numero "estado:" $pedido.data.estado "(esperado: BORRADOR)"

Show-Step "3) Enviar -> Aprobar -> Picking"
Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/enviar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/aprobar" -Method Post -Token $token -Body @{ notas = "Aprobado para mantenimiento" } | Out-Null
$pedidoPicking = Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/picking" -Method Post -Token $token
Write-Host "  estado:" $pedidoPicking.data.estado "(esperado: PICKING)"

Show-Step "4) Entregar - debe generar Movimiento SALIDA real (gap del frontend original, corregido aqui)"
$prodAntes = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
$pedidoEntregado = Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/entregar" -Method Post -Token $token
Write-Host "  estado:" $pedidoEntregado.data.estado "(esperado: ENTREGADO)"

$prodDespues = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual bajo de" $prodAntes.data.stockActual "a" $prodDespues.data.stockActual "(esperado: -15)"

Show-Step "5) Confirmar recibo"
$pedidoConfirmado = Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/confirmar-recibo" -Method Post -Token $token
Write-Host "  reciboConfirmado:" $pedidoConfirmado.data.reciboConfirmado "(esperado: True)"

Show-Step "6) Intentar confirmar recibo de nuevo (debe fallar con 400 - ya estaba confirmado)"
try {
    Invoke-Api -Uri "$base/pedidos-internos/$($pedido.data.id)/confirmar-recibo" -Method Post -Token $token
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, ya estaba confirmado" -ForegroundColor Green }

# PEDIDO 2 — flujo de rechazo --------------------------------------------
Show-Step "7) Crear Pedido 2 y RECHAZARLO"
$pedido2 = Invoke-Api -Uri "$base/pedidos-internos" -Method Post -Token $token -Body @{
    areaId = $area.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 5 })
}
Invoke-Api -Uri "$base/pedidos-internos/$($pedido2.data.id)/enviar" -Method Post -Token $token | Out-Null
$pedido2Rechazado = Invoke-Api -Uri "$base/pedidos-internos/$($pedido2.data.id)/rechazar" -Method Post -Token $token -Body @{ motivo = "Sin presupuesto este mes" }
Write-Host "  estado:" $pedido2Rechazado.data.estado "(esperado: RECHAZADO)"

# INVENTARIO FISICO --------------------------------------------------------
Show-Step "8) Crear Inventario Fisico filtrado por la categoria aislada (1 solo producto)"
$inv = Invoke-Api -Uri "$base/inventario-fisico" -Method Post -Token $token -Body @{ almacenId = $alm.data.id; categoriaId = $cat.data.id }
Write-Host "  numero:" $inv.data.numero "lineas:" $inv.data.lineas.Count "(esperado: 1)"

$lineaProd = $inv.data.lineas | Where-Object { $_.productoId -eq $prod.data.id }
Write-Host "  stockSistema de nuestro producto:" $lineaProd.stockSistema "(esperado: 85, ya que 100-15 del pedido entregado)"

Show-Step "9) Intentar cerrar sin contar todo (debe fallar con 400)"
try {
    Invoke-Api -Uri "$base/inventario-fisico/$($inv.data.id)/cerrar" -Method Post -Token $token
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, faltan productos por contar" -ForegroundColor Green }

Show-Step "10) Registrar conteo fisico = 90 (sobrante de +5 sobre el stockSistema de 85)"
Invoke-Api -Uri "$base/inventario-fisico/$($inv.data.id)/lineas/$($prod.data.id)" -Method Put -Token $token -Body @{ stockFisico = 90 } | Out-Null

Show-Step "11) Cerrar el inventario - debe generar Movimiento AJUSTE incremento real"
$invCerrado = Invoke-Api -Uri "$base/inventario-fisico/$($inv.data.id)/cerrar" -Method Post -Token $token
Write-Host "  estado:" $invCerrado.data.estado "(esperado: CERRADO)"

$prodTrasAjuste = Invoke-Api -Uri "$base/productos/$($prod.data.id)" -Token $token
Write-Host "  stockActual tras el ajuste:" $prodTrasAjuste.data.stockActual "(esperado: 90)"

$kardex = Invoke-Api -Uri "$base/kardex?productoId=$($prod.data.id)" -Token $token
$ultimoMov = $kardex.data[-1]
Write-Host "  ultimo Movimiento en el Kardex - tipo:" $ultimoMov.tipo "delta:" $ultimoMov.delta "(esperado: AJUSTE / +5)"

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "12) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$areasAcme = Invoke-Api -Uri "$base/areas-internas" -Token $tokenAcme
$pedidosAcme = Invoke-Api -Uri "$base/pedidos-internos" -Token $tokenAcme
$invFisicoAcme = Invoke-Api -Uri "$base/inventario-fisico" -Token $tokenAcme

Write-Host "  Areas internas visibles para acme:   " $areasAcme.data.Count "(esperado: 0)"
Write-Host "  Pedidos internos visibles para acme: " $pedidosAcme.data.Count "(esperado: 0)"
Write-Host "  Inventarios fisicos visibles para acme:" $invFisicoAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 6 completo." -ForegroundColor Green
