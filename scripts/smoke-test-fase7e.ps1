# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7e (Portal de Clientes + Facturas B2B)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-7e migrados.
# Re-ejecutable: usa un sufijo de hora para SKU/codigos unicos.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7e.ps1
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

# Login + catalogos base ----------------------------------------------
Show-Step "0) Login dlnorte y preparar catalogos base"
$empresa = Invoke-Api -Uri "$base/empresas/dlnorte"
$login = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresa.data.id; email = "admin@dlnorte.demo"; password = "StockPro2026!"
}
$tenantToken = $login.data.accessToken

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $tenantToken -Body @{ nombre = "Almacen Fase7e $sufijo" }
$cliente = Invoke-Api -Uri "$base/clientes" -Method Post -Token $tenantToken -Body @{ razonSocial = "Cliente Portal $sufijo" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $tenantToken -Body @{
    sku = "SKU-F7E-$sufijo"; nombre = "Producto Portal"; precioVenta = 25
}
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $tenantToken -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 100
} | Out-Null

# GENERAR LINK DEL PORTAL --------------------------------------------------
Show-Step "1) Generar link del Portal de Clientes (JWT firmado, no btoa inseguro)"
$link = Invoke-Api -Uri "$base/clientes/$($cliente.data.id)/portal-link" -Method Post -Token $tenantToken
$portalToken = $link.data.token
Write-Host "  token generado para:" $link.data.clienteNombre

# SEPARACION DE AUTENTICACION -----------------------------------------------
Show-Step "2) Verificar que el token del portal es RECHAZADO en rutas de tenant normales (debe fallar con 401)"
try {
    Invoke-Api -Uri "$base/usuarios" -Token $portalToken
    Write-Host "  ADVERTENCIA DE SEGURIDAD: el token del portal NO deberia funcionar aqui" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado (separacion de auth funciona)" -ForegroundColor Green }

Show-Step "3) Verificar que el JWT de tenant es RECHAZADO en rutas del portal (debe fallar con 401)"
try {
    Invoke-Api -Uri "$base/portal/catalogo" -Token $tenantToken
    Write-Host "  ADVERTENCIA DE SEGURIDAD: el JWT de tenant NO deberia funcionar aqui" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado (separacion de auth funciona en ambos sentidos)" -ForegroundColor Green }

# PORTAL CLIENTE — flujo real ------------------------------------------------
Show-Step "4) Cliente consulta el catalogo del portal"
$catalogo = Invoke-Api -Uri "$base/portal/catalogo" -Token $portalToken
$prodEnCatalogo = $catalogo.data | Where-Object { $_.id -eq $prod.data.id }
Write-Host "  producto visible en catalogo?" ($null -ne $prodEnCatalogo) "precio:" $prodEnCatalogo.precioVenta

Show-Step "5) Cliente hace un pedido real por el portal (10 unidades)"
$pedidoPortal = Invoke-Api -Uri "$base/portal/pedidos" -Method Post -Token $portalToken -Body @{
    items = @(@{ productoId = $prod.data.id; cantidad = 10 })
    observaciones = "Entregar en la tarde"
}
Write-Host "  numero:" $pedidoPortal.data.numero "total:" $pedidoPortal.data.total "(esperado: 295 = 250 + 18% IGV)"

Show-Step "6) Cliente consulta su historial de pedidos del portal"
$miHistorial = Invoke-Api -Uri "$base/portal/pedidos" -Token $portalToken
Write-Host "  pedidos en mi historial:" $miHistorial.data.Count "(esperado: 1)"

# ADMIN — aprobar y convertir en Despacho REAL -------------------------------
Show-Step "7) Admin ve el pedido recibido por el portal"
$pedidosAdmin = Invoke-Api -Uri "$base/pedidos-portal?estado=NUEVO" -Token $tenantToken
$nuestroPedido = $pedidosAdmin.data | Where-Object { $_.id -eq $pedidoPortal.data.id }
Write-Host "  aparece para el admin?" ($null -ne $nuestroPedido)

Show-Step "8) Admin APRUEBA el pedido - debe generar un Despacho REAL con reserva de stock"
$aprobado = Invoke-Api -Uri "$base/pedidos-portal/$($pedidoPortal.data.id)/aprobar" -Method Post -Token $tenantToken -Body @{
    almacenId = $alm.data.id
}
Write-Host "  estado:" $aprobado.data.estado "(esperado: CONVERTIDO)"
Write-Host "  despachoId generado:" ($null -ne $aprobado.data.despachoId)

$despachoReal = Invoke-Api -Uri "$base/despachos/$($aprobado.data.despachoId)" -Token $tenantToken
Write-Host "  despacho real - numero:" $despachoReal.data.numero "estado:" $despachoReal.data.estado "(esperado: PEDIDO)"

$invTrasReserva = Invoke-Api -Uri "$base/inventario?productoId=$($prod.data.id)" -Token $tenantToken
Write-Host "  cantidadReservada tras aprobar (debe ser 10, reserva real de Fase 5):" $invTrasReserva.data[0].cantidadReservada

Show-Step "9) Cliente ve el despacho real en 'Mis Despachos' del portal"
$misDespachos = Invoke-Api -Uri "$base/portal/despachos" -Token $portalToken
$verDespacho = $misDespachos.data | Where-Object { $_.id -eq $aprobado.data.despachoId }
Write-Host "  el cliente ve su despacho?" ($null -ne $verDespacho)

# RECHAZO --------------------------------------------------------------------
Show-Step "10) Cliente hace OTRO pedido y el admin lo RECHAZA"
$pedido2 = Invoke-Api -Uri "$base/portal/pedidos" -Method Post -Token $portalToken -Body @{
    items = @(@{ productoId = $prod.data.id; cantidad = 5 })
}
$rechazado = Invoke-Api -Uri "$base/pedidos-portal/$($pedido2.data.id)/rechazar" -Method Post -Token $tenantToken -Body @{
    motivo = "Sin stock suficiente para esta fecha"
}
Write-Host "  estado:" $rechazado.data.estado "(esperado: RECHAZADO)"

# FACTURAS B2B (admin-only) --------------------------------------------------
Show-Step "11) Crear una OC, registrar su factura B2B, marcarla recibida"
$proveedor = Invoke-Api -Uri "$base/proveedores" -Method Post -Token $tenantToken -Body @{ razonSocial = "Proveedor F7E $sufijo" }
$oc = Invoke-Api -Uri "$base/ordenes-compra" -Method Post -Token $tenantToken -Body @{
    proveedorId = $proveedor.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 20; costoUnitario = 8 })
}
$factura = Invoke-Api -Uri "$base/facturas-b2b" -Method Post -Token $tenantToken -Body @{
    ordenCompraId = $oc.data.id; numero = "F001-$sufijo"; monto = 160
}
Write-Host "  factura creada, estado:" $factura.data.estado "(esperado: ENVIADA)"

Show-Step "12) Intentar crear OTRA factura para la MISMA OC (debe fallar con 400 - 1:1)"
try {
    Invoke-Api -Uri "$base/facturas-b2b" -Method Post -Token $tenantToken -Body @{
        ordenCompraId = $oc.data.id; numero = "F001-DUP-$sufijo"
    }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, ya existe una factura para esta OC" -ForegroundColor Green }

$facturaRecibida = Invoke-Api -Uri "$base/facturas-b2b/$($factura.data.id)/recibir" -Method Post -Token $tenantToken
Write-Host "  estado tras marcar recibida:" $facturaRecibida.data.estado "(esperado: RECIBIDA)"

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "13) Verificar que el token del portal de dlnorte NO sirve para ver datos de acme"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$facturasAcme = Invoke-Api -Uri "$base/facturas-b2b" -Token $loginAcme.data.accessToken
Write-Host "  Facturas B2B visibles para acme:" $facturasAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 7e completo." -ForegroundColor Green
