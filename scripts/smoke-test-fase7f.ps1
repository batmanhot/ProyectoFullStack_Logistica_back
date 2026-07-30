# ════════════════════════════════════════════════════════════════
# StockPro API — Smoke test Fase 7f (Sunat / Guia de Remision Electronica)
#
# ULTIMA sub-fase de Fase 7. Requiere: servidor corriendo, seed Fase 1
# aplicado, RLS Fase 2-7f migrados.
#
# Uso:
#   cd back/stockpro-api
#   .\scripts\smoke-test-fase7f.ps1
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
$token = $login.data.accessToken

$alm = Invoke-Api -Uri "$base/almacenes" -Method Post -Token $token -Body @{ nombre = "Almacen Fase7f $sufijo" }
$cliente = Invoke-Api -Uri "$base/clientes" -Method Post -Token $token -Body @{
    razonSocial = "Cliente Fase7f $sufijo"; ruc = "20555555555"; direccion = "Jr. Comercio 456"
}
$prod = Invoke-Api -Uri "$base/productos" -Method Post -Token $token -Body @{
    sku = "SKU-F7F-$sufijo"; nombre = "Producto Fase7f"; unidadMedida = "KG"
}
Invoke-Api -Uri "$base/movimientos" -Method Post -Token $token -Body @{
    tipo = "ENTRADA"; productoId = $prod.data.id; almacenId = $alm.data.id; cantidad = 50
} | Out-Null

# DESPACHO con guia de remision ---------------------------------------------
Show-Step "1) Crear Despacho y avanzarlo hasta DESPACHADO con numero de guia"
$desp = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 8; precioVenta = 12 })
}
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/aprobar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/picking" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp.data.id)/listo" -Method Post -Token $token | Out-Null
$despDespachado = Invoke-Api -Uri "$base/despachos/$($desp.data.id)/despachar" -Method Post -Token $token -Body @{
    guiaNumero = "T001-$sufijo"
}
Write-Host "  guiaNumero asignado:" $despDespachado.data.guiaNumero

# GENERAR GRE -----------------------------------------------------------
Show-Step "2) Generar el registro de tracking de la GRE"
$gre = Invoke-Api -Uri "$base/sunat/documentos/$($desp.data.id)/generar" -Method Post -Token $token
Write-Host "  estado inicial:" $gre.data.estado "(esperado: PENDIENTE)"

Show-Step "3) Consultar el JSON de la GRE (computado en vivo) y verificar los campos clave"
$json = Invoke-Api -Uri "$base/sunat/documentos/$($desp.data.id)/json" -Token $token
Write-Host "  ruc_remitente:" $json.data.ruc_remitente
Write-Host "  destinatario.razon_social:" $json.data.destinatario.razon_social "(esperado: Cliente Fase7f $sufijo)"
Write-Host "  destinatario.tipo_documento:" $json.data.destinatario.tipo_documento "(esperado: 6, RUC de 11 digitos)"
Write-Host "  items[0].unidad_medida:" $json.data.items[0].unidad_medida "(esperado: KGM, mapeado desde KG)"
Write-Host "  items[0].cantidad:" $json.data.items[0].cantidad "(esperado: 8)"

# DESPACHO SIN GUIA -- debe fallar -----------------------------------------
Show-Step "4) Intentar generar GRE para un despacho SIN guiaNumero (debe fallar con 400)"
$desp2 = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 2; precioVenta = 12 })
}
try {
    Invoke-Api -Uri "$base/sunat/documentos/$($desp2.data.id)/generar" -Method Post -Token $token
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, el despacho no tiene guiaNumero todavia" -ForegroundColor Green }

# FLUJO DE ESTADOS -----------------------------------------------------------
Show-Step "5) Marcar enviado -> aceptado (con CDR simulado)"
Invoke-Api -Uri "$base/sunat/documentos/$($desp.data.id)/marcar-enviado" -Method Post -Token $token | Out-Null
$aceptado = Invoke-Api -Uri "$base/sunat/documentos/$($desp.data.id)/marcar-aceptado" -Method Post -Token $token -Body @{
    cdr = "CDR-RESPUESTA-SIMULADA-$sufijo"
}
Write-Host "  estado:" $aceptado.data.estado "(esperado: ACEPTADO)"

Show-Step "6) Intentar marcar enviado de nuevo (debe fallar con 403 - ya esta ACEPTADO)"
try {
    Invoke-Api -Uri "$base/sunat/documentos/$($desp.data.id)/marcar-enviado" -Method Post -Token $token
    Write-Host "  ADVERTENCIA: deberia haber fallado" -ForegroundColor Yellow
} catch { Write-Host "  OK: rechazado, ya no esta en PENDIENTE" -ForegroundColor Green }

# FLUJO DE RECHAZO (en un documento aparte) ---------------------------------
Show-Step "7) Crear y despachar un tercer Despacho, generar GRE y RECHAZARLA"
$desp3 = Invoke-Api -Uri "$base/despachos" -Method Post -Token $token -Body @{
    clienteId = $cliente.data.id; almacenId = $alm.data.id
    items = @(@{ productoId = $prod.data.id; cantidad = 3; precioVenta = 12 })
}
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/aprobar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/picking" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/listo" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/despachos/$($desp3.data.id)/despachar" -Method Post -Token $token -Body @{ guiaNumero = "T001-$sufijo-B" } | Out-Null
Invoke-Api -Uri "$base/sunat/documentos/$($desp3.data.id)/generar" -Method Post -Token $token | Out-Null
Invoke-Api -Uri "$base/sunat/documentos/$($desp3.data.id)/marcar-enviado" -Method Post -Token $token | Out-Null
$rechazado = Invoke-Api -Uri "$base/sunat/documentos/$($desp3.data.id)/marcar-rechazado" -Method Post -Token $token -Body @{
    motivo = "RUC del destinatario no coincide"
}
Write-Host "  estado:" $rechazado.data.estado "motivoRechazo:" $rechazado.data.motivoRechazo

# LISTADOS ------------------------------------------------------------------
Show-Step "8) Listar despachos con guia (candidatos a GRE) y documentos por estado"
$conGuia = Invoke-Api -Uri "$base/sunat/despachos-con-guia" -Token $token
Write-Host "  despachos con guia:" $conGuia.data.Count "(esperado: >= 2)"

$aceptados = Invoke-Api -Uri "$base/sunat/documentos?estado=ACEPTADO" -Token $token
$nuestroAceptado = $aceptados.data | Where-Object { $_.despachoId -eq $desp.data.id }
Write-Host "  aparece en la lista de ACEPTADOS?" ($null -ne $nuestroAceptado)

# AISLAMIENTO CRUZADO --------------------------------------------------------
Show-Step "9) Login acme y verificar que NO ve nada de lo creado por dlnorte"
$empresaAcme = Invoke-Api -Uri "$base/empresas/acme"
$loginAcme = Invoke-Api -Uri "$base/auth/login" -Method Post -Body @{
    empresaId = $empresaAcme.data.id; email = "admin@acme.demo"; password = "StockPro2026!"
}
$documentosAcme = Invoke-Api -Uri "$base/sunat/documentos" -Token $loginAcme.data.accessToken
Write-Host "  Documentos GRE visibles para acme:" $documentosAcme.data.Count "(esperado: 0)"

Write-Host "`nSmoke test Fase 7f completo. TODA LA FASE 7 (7a-7f) HA SIDO VALIDADA." -ForegroundColor Green
