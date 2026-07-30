# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7c (Empaque)
#
# Requiere: servidor corriendo, seed Fase 1 aplicado, RLS Fase 2-7c migrados.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7c.ps1
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

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase7c $sufijo" }
$cliente = Invoke-Api -Uri "$base/clientes" -Method Post -Token $token -Body @{ razonSocial = "Cliente Fase7c $sufijo" }
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{ sku = "SKU-F7C-$sufijo"; nombre = "Producto Fase7c" }
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 50
} | Out-Null

Show-Step "1) Crear Despacho (PEDIDO)"
$desp = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 5; precioVenta = 10 })
}
Write-Host "  numero:" $desp.data.numero "estado:" $desp.data.estado "(esperado: PEDIDO)"

# CATALOGO ------------------------------------------------------------
Show-Step "2) Consultar catalogo de tipos de caja"
$tipos = Invoke-Api -Uri "$base/empaques/tipos-caja" -Token $token
Write-Host "  cantidad de tipos:" $tipos.data.Count "(esperado: 8)"

# UPSERT EMPAQUE --------------------------------------------------------
Show-Step "3) Guardar borrador de empaque (sin confirmar)"
$empBorrador = Invoke-Api -Uri "$base/empaques/$($desp.data.id)" -Method Put -Token $token -Body @{
    tipoCajaId = "c4"; bultos = 2; pesoTotal = 12.5; instrucciones = "No apilar"; fragil = $true
}
Write-Host "  estado:" $empBorrador.data.estado "(esperado: PENDIENTE)"

Show-Step "4) Consultar el empaque del despacho"
$empGet = Invoke-Api -Uri "$base/empaques/$($desp.data.id)" -Token $token
Write-Host "  tipoCajaId:" $empGet.data.tipoCajaId "bultos:" $empGet.data.bultos "fragil:" $empGet.data.fragil

Show-Step "5) Listar empaques con estadoEmpaque=pendiente - debe aparecer nuestro despacho"
$listaPendientes = Invoke-Api -Uri "$base/empaques?estadoEmpaque=pendiente" -Token $token
$enLista = $listaPendientes.data | Where-Object { $_.id -eq $desp.data.id }
Write-Host "  aparece en pendientes?" ($null -ne $enLista) "(esperado: True)"

Show-Step "6) Confirmar el empaque (debe ACTUALIZAR el mismo registro, no crear uno nuevo)"
$empConfirmado = Invoke-Api -Uri "$base/empaques/$($desp.data.id)" -Method Put -Token $token -Body @{
    tipoCajaId = "c4"; bultos = 2; pesoTotal = 12.5; confirmar = $true
}
Write-Host "  estado:" $empConfirmado.data.estado "(esperado: CONFIRMADO)"
Write-Host "  mismo id que el borrador?" ($empConfirmado.data.id -eq $empBorrador.data.id) "(esperado: True)"

Show-Step "7) Listar empaques con estadoEmpaque=confirmado"
$listaConfirmados = Invoke-Api -Uri "$base/empaques?estadoEmpaque=confirmado" -Token $token
$enListaConf = $listaConfirmados.data | Where-Object { $_.id -eq $desp.data.id }
Write-Host "  aparece en confirmados?" ($null -ne $enListaConf) "(esperado: True)"

# VALIDACION DE ESTADO DEL DESPACHO -----------------------------------------
Show-Step "8) Avanzar el despacho hasta ENTREGADO"
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/aprobar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/picking" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/listo" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/despachar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/entregar" -Method Post -Token $token | Out-Null

Show-Step "9) Intentar editar el empaque de un despacho ya ENTREGADO (debe fallar con 403)"
try {
    Invoke-Api -Uri "$base/empaques/$($desp.data.id)" -Method Put -Token $token -Body @{ tipoCajaId = "c1" }
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, el despacho ya no esta activo" -ForegroundColor Green }

Show-Step "10) Listar empaques activos - el despacho YA NO debe aparecer (esta ENTREGADO)"
$listaActivos = Invoke-Api -Uri "$base/empaques" -Token $token
$siguePresente = $listaActivos.data | Where-Object { $_.id -eq $desp.data.id }
Write-Host "  sigue en la lista de activos?" ($null -ne $siguePresente) "(esperado: False)"

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "11) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$tokenAcme = $loginAcme.data.accessToken

$empaquesAcme = Invoke-Api -Uri "$base/empaques?estadoEmpaque=confirmado" -Token $tokenAcme
Write-Host "  Empaques confirmados visibles para acme:" $empaquesAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 7c completo." -ForegroundColor Green
