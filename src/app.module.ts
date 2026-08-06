import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RolesModule } from './roles/roles.module';
import { CategoriasModule } from './categorias/categorias.module';
import { AlmacenesModule } from './almacenes/almacenes.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ProductosModule } from './productos/productos.module';
import { LotesModule } from './lotes/lotes.module';
import { InventarioModule } from './inventario/inventario.module';
import { MovimientosModule } from './movimientos/movimientos.module';
import { ClientesModule } from './clientes/clientes.module';
import { OrdenesCompraModule } from './ordenes-compra/ordenes-compra.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { ProformasModule } from './proformas/proformas.module';
import { CuentasPorCobrarModule } from './cuentas-por-cobrar/cuentas-por-cobrar.module';
import { TransportistasModule } from './transportistas/transportistas.module';
import { DespachosModule } from './despachos/despachos.module';
import { RutasModule } from './rutas/rutas.module';
import { AreasInternasModule } from './areas-internas/areas-internas.module';
import { PedidosInternosModule } from './pedidos-internos/pedidos-internos.module';
import { InventarioFisicoModule } from './inventario-fisico/inventario-fisico.module';
import { FlotaModule } from './flota/flota.module';
import { ReportesModule } from './reportes/reportes.module';
import { EmpaquesModule } from './empaques/empaques.module';
import { PickingModule } from './picking/picking.module';
import { AdminAuthModule } from './admin/auth/admin-auth.module';
import { NegociosModule } from './admin/negocios/negocios.module';
import { PlanesModule } from './admin/planes/planes.module';
import { RenovacionesModule } from './admin/renovaciones/renovaciones.module';
import { AlertasModule } from './admin/alertas/alertas.module';
import { LandingModule } from './admin/landing/landing.module';
import { PortalModule } from './portal/portal.module';
import { PortalProveedorModule } from './portal-proveedor/portal-proveedor.module';
import { FacturasB2BModule } from './facturas-b2b/facturas-b2b.module';
import { SunatModule } from './sunat/sunat.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { PublicModule } from './public/public.module';
import { ListasPreciosModule } from './listas-precios/listas-precios.module';
import { DatosModule } from './datos/datos.module';
import { PanelAuditoriaModule } from './panel-auditoria/panel-auditoria.module';
import { IncidenciasModule } from './incidencias/incidencias.module';
import { PushModule } from './push/push.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Hallazgo Crítico #4 (auditoría 2026-07-29): sin rate limiting no había
    // ningún freno a fuerza bruta / credential stuffing. Límite global
    // razonable acá; los 3 endpoints de login usan @Throttle con un límite
    // más estricto (ver auth.controller.ts / admin-auth.controller.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // Habilita @Cron en IncidenciasService — purga diaria de incidencias resueltas.
    ScheduleModule.forRoot(),
    PrismaModule,
    // Fase 1
    AuthModule,
    UsuariosModule,
    RolesModule,
    // Fase 2 — Catálogos maestros
    CategoriasModule,
    AlmacenesModule,
    UbicacionesModule,
    ProveedoresModule,
    // Fase 3 — Inventario core
    ProductosModule,
    LotesModule,
    InventarioModule,
    MovimientosModule,
    // Fase 4 — Clientes, Órdenes de Compra, Cotizaciones (RFQ), Proformas, CxC
    ClientesModule,
    OrdenesCompraModule,
    CotizacionesModule,
    ProformasModule,
    CuentasPorCobrarModule,
    // Fase 5 — Despachos, Transportistas, Rutas, Stock Reservado
    TransportistasModule,
    DespachosModule,
    RutasModule,
    // Fase 6 — Áreas Internas, Pedidos Internos, Inventario Físico
    AreasInternasModule,
    PedidosInternosModule,
    InventarioFisicoModule,
    // Fase 7a — Flota
    FlotaModule,
    // Fase 7b — Reportes (Financiero/KPIs) + reubicación de Ubicaciones (Mapa de Almacén)
    ReportesModule,
    // Fase 7c — Empaque
    EmpaquesModule,
    // Módulo de Picking — 2026-07-31 (docs/PROPUESTA-MODULO-PICKING.md)
    PickingModule,
    // Fase 7d — AdminSaaS (auth cross-tenant separada — ver PlatformAdminGuard)
    AdminAuthModule,
    NegociosModule,
    PlanesModule,
    RenovacionesModule,
    AlertasModule,
    LandingModule,
    // Fase 7e — Portal de Clientes (auth separada — ver PortalClienteGuard) + Facturas B2B
    PortalModule,
    PortalProveedorModule,
    FacturasB2BModule,
    // Fase 7f — Sunat (Guía de Remisión Electrónica) — ÚLTIMA sub-fase de Fase 7
    SunatModule,
    // Fase 8 — Auditoría y Configuración de empresa
    AuditoriaModule,
    PanelAuditoriaModule,
    // Registro de Incidencias — propuesta aprobada 2026-07-31 (ver informe en conversación)
    IncidenciasModule,
    // Fase 2 vista móvil (2026-08-05) — Web Push de alertas críticas, cron cada 30min
    PushModule,
    ConfiguracionModule,
    // Fase 9 — Endpoints públicos (landing + planes sin auth) para la landing page pública
    PublicModule,
    // Fase 9 — Listas de Precios (multi-tenant)
    ListasPreciosModule,
    // Datos / Reset — limpiar operativos y restaurar demo
    DatosModule,
    // Envío real de documentos por correo (Compartir → Correo), 2026-08-06
    EmailModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
