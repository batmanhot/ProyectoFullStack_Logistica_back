import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

// Mismo password demo que prisma/seed.ts (DEMO_PASSWORD) — se repite acá
// porque seed.ts es un script standalone, no un módulo importable por Nest.
const DEMO_PASSWORD = 'StockPro2026!';

// La Postgres free de Render es lenta y agrega latencia app→BD. `maxWait` alto
// para conseguir conexión del pool bajo carga (default 2s se queda corto);
// `timeout` alto para los lotes grandes de escritura de la re-siembra.
const TXN_OPTS = { timeout: 120_000, maxWait: 30_000 } as const;

@Injectable()
export class DatosService {
  private readonly logger = new Logger('DatosService');

  constructor(private readonly prisma: PrismaService) {}

  // ── Limpiar datos operativos ────────────────────────────────────────────────
  // Elimina todo lo transaccional pero conserva: Empresa, Categoria, Almacen,
  // Ubicacion, AreaInterna, Usuario, Rol, Permiso.
  async limpiarOperativos(empresaId: string) {
    try {
      await this.borrarOperativos(empresaId, { incluirCatalogos: false });
    } catch (e) {
      this.rethrow('Limpiar datos operativos', e);
    }
    return { ok: true, mensaje: 'Datos operativos eliminados correctamente' };
  }

  // ── Restaurar datos demo ────────────────────────────────────────────────────
  // 1) Limpia TODO (incluyendo categorias, almacenes, areas, ubicaciones)
  // 2) Re-siembra datos demo listos para presentación
  async restaurarDemo(empresaId: string) {
    try {
      await this.borrarOperativos(empresaId, { incluirCatalogos: true });
    } catch (e) {
      this.rethrow('Borrado previo a restaurar demo', e);
    }
    try {
      await this.sembrarDemo(empresaId);
    } catch (e) {
      // El borrado ya se completó — se avisa explícitamente para que el usuario
      // sepa que la empresa quedó vacía y puede reintentar solo la siembra.
      this.rethrow('Re-siembra de datos demo (el borrado sí se completó)', e);
    }
    return { ok: true, mensaje: 'Datos demo restaurados correctamente' };
  }

  /**
   * Eleva el error real (código Prisma + mensaje) a una HttpException para que
   * llegue al cliente en vez del genérico "Error interno del servidor". La
   * acción es admin-only (@Permiso('configuracion')), así que exponer el
   * detalle es aceptable y necesario para diagnosticar en Render.
   */
  private rethrow(accion: string, e: unknown): never {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    this.logger.error(`${accion} falló${code ? ` [${code}]` : ''}: ${msg}`, e instanceof Error ? e.stack : undefined);
    throw new InternalServerErrorException(`${accion} falló${code ? ` [${code}]` : ''}: ${msg}`);
  }

  // ── Borrado por niveles ────────────────────────────────────────────────────
  // Antes: una sola transacción interactiva de ~45 deleteMany. Sobre la
  // Postgres lenta de Render eso agotaba el timeout / no conseguía conexión.
  // Ahora: una transacción corta por nivel de dependencia FK (cada una fija su
  // propio contexto de tenant via withTenant). El orden ENTRE niveles se
  // mantiene porque cada withTenant hace commit antes del siguiente.
  private async borrarOperativos(empresaId: string, opts: { incluirCatalogos: boolean }) {
    await this.prisma.withTenant(empresaId, (tx) => this.borrarNivel1(tx, empresaId), TXN_OPTS);
    await this.prisma.withTenant(empresaId, (tx) => this.borrarNivel2(tx, empresaId), TXN_OPTS);
    await this.prisma.withTenant(empresaId, (tx) => this.borrarNivel3(tx, empresaId), TXN_OPTS);
    if (opts.incluirCatalogos) {
      await this.prisma.withTenant(empresaId, (tx) => this.borrarCatalogos(tx, empresaId), TXN_OPTS);
    }
  }

  // ── Dispatcher de siembra ────────────────────────────────────────────────
  // dlnorte (el tenant que se usa activamente para pruebas/demos) recibe el
  // dataset rico con variedad de estados/casuísticas; cualquier otro tenant
  // (acme, o uno nuevo que se registre) recibe el dataset mínimo original —
  // sirve de segundo tenant "limpio" para probar aislamiento.
  private async sembrarDemo(empresaId: string) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const empresa = await tx.empresa.findUnique({ where: { id: empresaId } });
      if (empresa?.codigo === 'dlnorte') await this.sembrarDlNorte(tx, empresaId);
      else await this.sembrarBasico(tx, empresaId);
    }, TXN_OPTS);
  }

  // ── Borrado operativo — Nivel 1: tablas hijo sin empresaId propio ──────────
  private async borrarNivel1(tx: PrismaClient, empresaId: string) {
    // Orden crítico por FKs
    await tx.pagoCxC.deleteMany({ where: { cuenta: { empresaId } } });
    await tx.pedidoPortalItem.deleteMany({ where: { pedidoPortal: { empresaId } } });
    await tx.proformaItem.deleteMany({ where: { proforma: { empresaId } } });
    await tx.respuestaItem.deleteMany({ where: { respuesta: { cotizacion: { empresaId } } } });
    await tx.respuestaProveedor.deleteMany({ where: { cotizacion: { empresaId } } });
    await tx.cotizacionItem.deleteMany({ where: { cotizacion: { empresaId } } });
    await tx.ordenCompraItem.deleteMany({ where: { ordenCompra: { empresaId } } });
    await tx.inventarioFisicoLinea.deleteMany({ where: { inventario: { empresaId } } });
    await tx.pedidoInternoItem.deleteMany({ where: { pedido: { empresaId } } });
    await tx.mantenimientoVehiculo.deleteMany({ where: { vehiculo: { empresaId } } });
    await tx.registroCombustible.deleteMany({ where: { vehiculo: { empresaId } } });
    // Parada referencia tanto Ruta (CASCADE) como Despacho (sin CASCADE)
    await tx.parada.deleteMany({ where: { ruta: { empresaId } } });
    // DespachoItem / Empaque: CASCADE desde Despacho; borrado explícito por orden con Producto
    await tx.despachoItem.deleteMany({ where: { despacho: { empresaId } } });
    await tx.empaque.deleteMany({ where: { despacho: { empresaId } } });
  }

  // ── Borrado operativo — Nivel 2: cabeceras con empresaId ──────────────────
  private async borrarNivel2(tx: PrismaClient, empresaId: string) {
    await tx.cuentaPorCobrar.deleteMany({ where: { empresaId } });
    await tx.pedidoPortal.deleteMany({ where: { empresaId } });
    await tx.proforma.deleteMany({ where: { empresaId } });
    await tx.cotizacion.deleteMany({ where: { empresaId } });
    await tx.inventarioFisico.deleteMany({ where: { empresaId } });
    await tx.pedidoInterno.deleteMany({ where: { empresaId } });
    await tx.guiaRemisionElectronica.deleteMany({ where: { empresaId } });
    await tx.facturaB2B.deleteMany({ where: { empresaId } });
    await tx.ruta.deleteMany({ where: { empresaId } });
    await tx.despacho.deleteMany({ where: { empresaId } });
    await tx.ordenCompra.deleteMany({ where: { empresaId } });
    await tx.vehiculoFlota.deleteMany({ where: { empresaId } });
  }

  // ── Borrado operativo — Nivel 3: maestros operativos ──────────────────────
  private async borrarNivel3(tx: PrismaClient, empresaId: string) {
    // CapaCosto/CapaCostoConsumo (costeo PEPS, gateado por Empresa.costeoAutomatico)
    // referencian Movimiento/Producto/LoteProducto SIN onDelete: Cascade en el
    // schema — hay que vaciarlas antes o el borrado de abajo viola la FK (bug
    // real: dormido hoy porque el flag está apagado por default y aún no tiene
    // toggle en el frontend, pero rompería en cuanto se active para un tenant).
    await tx.capaCostoConsumo.deleteMany({ where: { capaCosto: { empresaId } } });
    await tx.capaCosto.deleteMany({ where: { empresaId } });
    await tx.movimiento.deleteMany({ where: { empresaId } });
    // LoteProducto e Inventario no tienen empresaId propio — se filtran por producto
    await tx.loteProducto.deleteMany({ where: { producto: { empresaId } } });
    await tx.inventario.deleteMany({ where: { producto: { empresaId } } });
    await tx.transportista.deleteMany({ where: { empresaId } });
    // Oportunidades comerciales — ActividadComercial cascadea desde Oportunidad
    // (onDelete: Cascade), pero se borra explícito primero por consistencia con
    // el resto del nivel. Debe ir antes de cliente: Oportunidad.clienteId es
    // requerido (onDelete: Restrict por default) y fallaría con oportunidades vivas.
    await tx.actividadComercial.deleteMany({ where: { oportunidad: { empresaId } } });
    await tx.oportunidad.deleteMany({ where: { empresaId } });
    // Gestión de Pedidos por Proyecto — Proyecto/CDR son datos operativos
    // (referencian Cliente; los referencian Movimiento y PedidoInterno, ya
    // borrados arriba con SET NULL). Proyecto antes que CDR (Proyecto.cdrId).
    await tx.proyecto.deleteMany({ where: { empresaId } });
    await tx.cDR.deleteMany({ where: { empresaId } });
    await tx.cliente.deleteMany({ where: { empresaId } });
    await tx.producto.deleteMany({ where: { empresaId } });
    await tx.proveedor.deleteMany({ where: { empresaId } });
    await tx.auditoria.deleteMany({ where: { empresaId } });
    // ListaPicking/LineaPicking no necesitan deleteMany propio: cascadean
    // desde Despacho (onDelete: Cascade), ya borrado en el Nivel 2 de arriba.
    await tx.registroIncidencia.deleteMany({ where: { empresaId } });
  }

  // ── Borrado — Catálogos (solo en restaurarDemo, tras los 3 niveles) ───────
  private async borrarCatalogos(tx: PrismaClient, empresaId: string) {
    await tx.ubicacion.deleteMany({ where: { almacen: { empresaId } } });
    await tx.areaInterna.deleteMany({ where: { empresaId } });
    await tx.almacen.deleteMany({ where: { empresaId } });
    await tx.categoria.deleteMany({ where: { empresaId } });
  }

  // ── Seed de datos demo — dataset mínimo (cualquier tenant que no sea dlnorte) ──
  private async sembrarBasico(tx: PrismaClient, empresaId: string) {
    {
      // ── Categorías ──────────────────────────────────────────────────────────
      const [catElec, catLimp, catOfi] = await Promise.all([
        tx.categoria.create({ data: { empresaId, nombre: 'Electrónicos', descripcion: 'Equipos y accesorios tecnológicos' } }),
        tx.categoria.create({ data: { empresaId, nombre: 'Limpieza Industrial', descripcion: 'Productos de limpieza y desinfección' } }),
        tx.categoria.create({ data: { empresaId, nombre: 'Útiles de Oficina', descripcion: 'Papelería y material de escritorio' } }),
      ]);

      // ── Almacenes ───────────────────────────────────────────────────────────
      const [almCentral] = await Promise.all([
        tx.almacen.create({ data: { empresaId, nombre: 'Almacén Central' } }),
        tx.almacen.create({ data: { empresaId, nombre: 'Almacén Secundario' } }),
      ]);

      // ── Áreas internas ──────────────────────────────────────────────────────
      await Promise.all([
        tx.areaInterna.create({ data: { empresaId, nombre: 'Operaciones', codigo: 'OPS' } }),
        tx.areaInterna.create({ data: { empresaId, nombre: 'Sistemas', codigo: 'SIS' } }),
        tx.areaInterna.create({ data: { empresaId, nombre: 'Administración', codigo: 'ADM' } }),
      ]);

      // ── Proveedores ─────────────────────────────────────────────────────────
      const [provTech, provClean, provOffice] = await Promise.all([
        tx.proveedor.create({ data: { empresaId, razonSocial: 'TechDistrib S.A.C.', ruc: '20500001111', email: 'ventas@techdistrib.pe', telefono: '01-5551234' } }),
        tx.proveedor.create({ data: { empresaId, razonSocial: 'CleanPro Perú S.A.C.', ruc: '20500002222', email: 'ventas@cleanpro.pe', telefono: '01-5555678' } }),
        tx.proveedor.create({ data: { empresaId, razonSocial: 'OfficeMax Perú S.A.C.', ruc: '20500003333', email: 'ventas@officemax.pe', telefono: '01-5559012' } }),
      ]);

      // ── Productos ───────────────────────────────────────────────────────────
      const productos = await Promise.all([
        tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-001', nombre: 'Laptop HP Core i5 15.6"',          unidadMedida: 'UND', stockMinimo: 3,  stockMaximo: 30,   precioCompra: 2200, precioVenta: 2800 } }),
        tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-002', nombre: 'Mouse Inalámbrico Logitech M280',   unidadMedida: 'UND', stockMinimo: 10, stockMaximo: 200,  precioCompra: 55,   precioVenta: 85   } }),
        tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-003', nombre: 'Teclado USB Dell KB216',             unidadMedida: 'UND', stockMinimo: 10, stockMaximo: 150,  precioCompra: 65,   precioVenta: 95   } }),
        tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provClean.id,  sku: 'LIMP-001', nombre: 'Desinfectante Multiuso 5L',          unidadMedida: 'LIT', stockMinimo: 20, stockMaximo: 500,  precioCompra: 20,   precioVenta: 28   } }),
        tx.producto.create({ data: { empresaId, categoriaId: catOfi.id,  proveedorId: provOffice.id, sku: 'OFI-001',  nombre: 'Resma Papel A4 75gr x500 hojas',    unidadMedida: 'UND', stockMinimo: 50, stockMaximo: 1000, precioCompra: 13,   precioVenta: 18   } }),
        tx.producto.create({ data: { empresaId, categoriaId: catOfi.id,  proveedorId: provOffice.id, sku: 'OFI-002',  nombre: 'Lapicero Azul BIC Cristal x12',     unidadMedida: 'CJA', stockMinimo: 20, stockMaximo: 600,  precioCompra: 8,    precioVenta: 12   } }),
      ]);

      // ── Stock inicial (Inventario + Movimiento ENTRADA) ────────────────────
      const stockInicial: Array<[any, number]> = [
        [productos[0], 15], [productos[1], 80], [productos[2], 50],
        [productos[3], 200], [productos[4], 300], [productos[5], 500],
      ];
      for (const [prod, cantidad] of stockInicial) {
        await tx.inventario.create({
          data: { productoId: prod.id, almacenId: almCentral.id, cantidad, cantidadReservada: 0 },
        });
        await tx.movimiento.create({
          data: { empresaId, productoId: prod.id, almacenId: almCentral.id, tipo: 'ENTRADA', cantidad, costoUnitario: prod.precioCompra, motivo: 'Stock inicial demo' },
        });
      }

      // ── Clientes demo ───────────────────────────────────────────────────────
      const [cliLima, cliAndina] = await Promise.all([
        tx.cliente.create({ data: { empresaId, razonSocial: 'Corporación Lima E.I.R.L.', ruc: '20600001111', email: 'compras@corplima.pe', telefono: '996001001' } }),
        tx.cliente.create({ data: { empresaId, razonSocial: 'Servi Andina S.A.C.',        ruc: '20600002222', email: 'logistica@serviandina.pe', telefono: '996002002' } }),
      ]);

      // ── Transportista demo ─────────────────────────────────────────────────
      const transportista = await tx.transportista.create({
        data: { empresaId, nombre: 'Carlos Ríos Huanca', tipo: 'PROPIO', vehiculo: 'Camioneta Toyota HiLux', licencia: 'AIII', telefono: '987000001' },
      });

      // ── Resto de módulos: 1-2 ejemplos por módulo para que "Restaurar Demo"
      // deje algo visible en cada pantalla principal, no solo en Productos/Clientes.
      const [laptop, mouse, teclado, , resma, lapicero] = productos;

      // Orden de Compra RECIBIDA — restock de Laptop y Mouse (genera Movimiento
      // ENTRADA real e incrementa el Inventario ya sembrado arriba).
      const ocSubtotal = 5 * 2200 + 20 * 55; // 12,100
      const ocIgv = Math.round(ocSubtotal * 0.18 * 100) / 100;
      const ordenCompra = await tx.ordenCompra.create({
        data: {
          empresaId, numero: 'OC-00001', proveedorId: provTech.id, almacenId: almCentral.id,
          estado: 'RECIBIDA', subtotal: ocSubtotal, igv: ocIgv, total: ocSubtotal + ocIgv,
          notas: 'Reposición de stock — demo',
          items: {
            create: [
              { productoId: laptop.id, cantidad: 5,  costoUnitario: 2200, cantidadRecibida: 5 },
              { productoId: mouse.id,  cantidad: 20, costoUnitario: 55,   cantidadRecibida: 20 },
            ],
          },
        },
      });
      for (const [prod, cantidad] of [[laptop, 5], [mouse, 20]] as Array<[any, number]>) {
        const invExistente = await tx.inventario.findFirst({
          where: { productoId: prod.id, almacenId: almCentral.id, ubicacionId: null },
        });
        await tx.inventario.update({
          where: { id: invExistente!.id },
          data: { cantidad: { increment: cantidad } },
        });
        await tx.movimiento.create({
          data: { empresaId, productoId: prod.id, almacenId: almCentral.id, tipo: 'ENTRADA', cantidad, costoUnitario: prod.precioCompra, motivo: 'Recepción de compra', documento: ordenCompra.numero },
        });
      }

      // Cotización (RFQ) ADJUDICADA — dos proveedores responden, TechDistrib gana.
      const cotizacion = await tx.cotizacion.create({
        data: {
          empresaId, numero: 'COT-00001', estado: 'ADJUDICADA', notas: 'Cotización de laptops adicionales',
          items: { create: [{ productoId: laptop.id, cantidad: 10, descripcion: laptop.nombre }] },
        },
      });
      await tx.respuestaProveedor.create({
        data: {
          cotizacionId: cotizacion.id, proveedorId: provTech.id, total: 21500, tiempoEntrega: 5, ganadora: true,
          items: { create: [{ productoId: laptop.id, precioUnitario: 2150, subtotal: 21500 }] },
        },
      });
      await tx.respuestaProveedor.create({
        data: {
          cotizacionId: cotizacion.id, proveedorId: provOffice.id, total: 22800, tiempoEntrega: 10, ganadora: false,
          items: { create: [{ productoId: laptop.id, precioUnitario: 2280, subtotal: 22800 }] },
        },
      });

      // Despacho ENTREGADO a Corporación Lima — genera Movimiento SALIDA real y
      // descuenta el Inventario (igual que hace DespachosService al despachar).
      const despSubtotal = 10 * 85 + 5 * 95; // 1,325
      const despIgv = Math.round(despSubtotal * 0.18 * 100) / 100;
      const ahora = new Date();
      const haceDosDias = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);
      const despacho = await tx.despacho.create({
        data: {
          empresaId, numero: 'DESP-00001', clienteId: cliLima.id, almacenId: almCentral.id,
          transportistaId: transportista.id, estado: 'ENTREGADO',
          subtotal: despSubtotal, igv: despIgv, total: despSubtotal + despIgv,
          fechaDespacho: haceDosDias, fechaEntregado: ahora, receptorNombre: 'Recepción Corporación Lima',
          items: {
            create: [
              { productoId: mouse.id,   cantidad: 10, precioVenta: 85, costoUnitario: 55, subtotal: 850, cantidadReservada: 0 },
              { productoId: teclado.id, cantidad: 5,  precioVenta: 95, costoUnitario: 65, subtotal: 475, cantidadReservada: 0 },
            ],
          },
        },
      });
      for (const [prod, cantidad, costoUnitario] of [[mouse, 10, 55], [teclado, 5, 65]] as Array<[any, number, number]>) {
        const invExistente = await tx.inventario.findFirst({
          where: { productoId: prod.id, almacenId: almCentral.id, ubicacionId: null },
        });
        await tx.inventario.update({
          where: { id: invExistente!.id },
          data: { cantidad: { decrement: cantidad } },
        });
        await tx.movimiento.create({
          data: { empresaId, productoId: prod.id, almacenId: almCentral.id, tipo: 'SALIDA', cantidad, costoUnitario, motivo: 'Despacho a cliente', documento: despacho.numero },
        });
      }

      // Ruta COMPLETADA que cubrió el despacho anterior.
      const ruta = await tx.ruta.create({
        data: {
          empresaId, numero: 'RUTA-00001', transportistaId: transportista.id, estado: 'COMPLETADA',
          fechaSalida: haceDosDias, fechaRetorno: new Date(haceDosDias.getTime() + 4 * 60 * 60 * 1000),
          kmRecorrido: 18.5, costoViaje: 45,
        },
      });
      await tx.parada.create({
        data: {
          rutaId: ruta.id, despachoId: despacho.id, orden: 1, estado: 'ENTREGADO',
          horaLlegada: haceDosDias, horaPartida: new Date(haceDosDias.getTime() + 30 * 60 * 1000),
        },
      });

      // Cuenta por Cobrar PENDIENTE generada por el despacho anterior (crédito a 30 días).
      await tx.cuentaPorCobrar.create({
        data: {
          empresaId, numero: 'CXC-00001', clienteId: cliLima.id, despachoId: despacho.id,
          monto: despSubtotal + despIgv, saldo: despSubtotal + despIgv,
          fechaVencimiento: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000), diasCredito: 30,
        },
      });

      // Proforma ENVIADA a Servi Andina, pendiente de respuesta.
      const proSubtotal = 50 * 18 + 20 * 12; // 1,140
      const proIgv = Math.round(proSubtotal * 0.18 * 100) / 100;
      await tx.proforma.create({
        data: {
          empresaId, numero: 'PRO-00001', clienteId: cliAndina.id, estado: 'ENVIADA',
          fechaVencimiento: new Date(ahora.getTime() + 15 * 24 * 60 * 60 * 1000),
          subtotal: proSubtotal, igv: proIgv, total: proSubtotal + proIgv,
          items: {
            create: [
              { productoId: resma.id,    cantidad: 50, precioUnitario: 18, subtotal: 900 },
              { productoId: lapicero.id, cantidad: 20, precioUnitario: 12, subtotal: 240 },
            ],
          },
        },
      });

      // ── Oportunidades (3) — pipeline mínimo de Seguimiento Comercial ────────
      // Una por cada punto del embudo que deja algo visible: NUEVA, COTIZADA y
      // una GANADA de este mes (alimenta KPIs y "Rendimiento por vendedor").
      const usrComercialBasico = await tx.usuario.findFirst({
        where: { empresaId, rol: { permisos: { some: { modulo: { in: ['oportunidades', '*'] } } } } },
        orderBy: { createdAt: 'asc' },
      });
      if (usrComercialBasico) {
        const opGanadaB = await tx.oportunidad.create({
          data: {
            empresaId, codigo: 'OP-00001', clienteId: cliLima.id, responsableId: usrComercialBasico.id,
            estado: 'GANADA', probabilidad: 100, valorEstimado: 18000,
            descripcion: 'Distribución quincenal de mercadería a las tiendas del cliente',
            fuente: 'Referido', fechaEstimadaCierre: ahora, fechaCierre: ahora, fechaUltimaActividad: ahora,
          },
        });
        await tx.actividadComercial.create({
          data: { oportunidadId: opGanadaB.id, usuarioId: usrComercialBasico.id, tipo: 'NEGOCIACION', resultado: 'El cliente aceptó la propuesta y se adjudicó el servicio.' },
        });
        const opCotizB = await tx.oportunidad.create({
          data: {
            empresaId, codigo: 'OP-00002', clienteId: cliAndina.id, responsableId: usrComercialBasico.id,
            estado: 'COTIZADA', probabilidad: 60, valorEstimado: 7500,
            descripcion: 'Traslado recurrente de insumos entre almacenes, servicio mensual',
            fuente: 'Página web', fechaUltimaActividad: ahora, proximaAccion: 'Llamada de seguimiento',
          },
        });
        await tx.actividadComercial.create({
          data: { oportunidadId: opCotizB.id, usuarioId: usrComercialBasico.id, tipo: 'COTIZACION_ENVIADA', resultado: 'Se envió la cotización; pendiente de respuesta del cliente.', proximaAccion: 'Llamada de seguimiento' },
        });
        await tx.oportunidad.create({
          data: {
            empresaId, codigo: 'OP-00003', clienteId: cliLima.id, responsableId: usrComercialBasico.id,
            estado: 'NUEVA', probabilidad: 10, valorEstimado: 4200,
            descripcion: 'Consulta por transporte puntual de equipos; fecha aún por definir',
            fuente: 'Llamada en frío',
          },
        });
      }

      // ── Consumo por Proyecto (mínimo) — 1 CDR, 1 proyecto, 1 entrega + 1 pendiente ──
      const areaBasico = await tx.areaInterna.findFirst({ where: { empresaId }, orderBy: { createdAt: 'asc' } });
      const usrBasico = usrComercialBasico ?? (await tx.usuario.findFirst({ where: { empresaId }, orderBy: { createdAt: 'asc' } }));
      if (areaBasico && usrBasico) {
        const cdrBasico = await tx.cDR.create({ data: { empresaId, codigo: 'CDR-01', nombre: 'Operaciones de Campo' } });
        const pryBasico = await tx.proyecto.create({
          data: { empresaId, codigo: 'PRY-01', nombre: 'Servicio Logístico Integral', cdrId: cdrBasico.id, clienteId: cliLima.id, estado: 'EN_EJECUCION', fechaInicio: ahora },
        });
        const piEntregado = await tx.pedidoInterno.create({
          data: {
            empresaId, numero: 'PI-00001', areaId: areaBasico.id, almacenId: almCentral.id, proyectoId: pryBasico.id,
            estado: 'ENTREGADO', prioridad: 'NORMAL', usuarioSolicitaId: usrBasico.id, usuarioApruebaId: usrBasico.id, usuarioEntregaId: usrBasico.id,
            fechaAprobacion: ahora, fechaEntrega: ahora, reciboConfirmado: true, fechaReciboConfirmado: ahora,
            items: { create: [{ productoId: resma.id, cantidad: 20 }] },
          },
        });
        const invResmaB = await tx.inventario.findFirst({ where: { productoId: resma.id, almacenId: almCentral.id, ubicacionId: null } });
        if (invResmaB) await tx.inventario.update({ where: { id: invResmaB.id }, data: { cantidad: { decrement: 20 } } });
        await tx.movimiento.create({
          data: {
            empresaId, productoId: resma.id, almacenId: almCentral.id, tipo: 'SALIDA', cantidad: 20, costoUnitario: 13,
            motivo: 'Entrega de pedido interno de proyecto', documento: piEntregado.numero,
            proyectoId: pryBasico.id, pedidoInternoId: piEntregado.id, fecha: ahora,
          },
        });
        await tx.pedidoInterno.create({
          data: {
            empresaId, numero: 'PI-00002', areaId: areaBasico.id, almacenId: almCentral.id, proyectoId: pryBasico.id,
            estado: 'APROBADO', prioridad: 'NORMAL', usuarioSolicitaId: usrBasico.id, usuarioApruebaId: usrBasico.id, fechaAprobacion: ahora,
            items: { create: [{ productoId: lapicero.id, cantidad: 10 }] },
          },
        });
      }
    }
  }

  // ── Seed de datos demo — dataset RICO (solo dlnorte) ──────────────────────
  // Variedad deliberada de estados/casuísticas por módulo (ver
  // docs/PLAN-DE-PRUEBAS-QA.md y la nota de memoria del cierre de deuda
  // técnica) — no busca volumen bruto, busca que cada estado del enum de
  // cada módulo transaccional tenga al menos un ejemplo real y coherente.
  private async sembrarDlNorte(tx: PrismaClient, empresaId: string) {
    const ahora = new Date();
    const dias = (n: number) => new Date(ahora.getTime() + n * 24 * 60 * 60 * 1000);

    // ── Categorías ────────────────────────────────────────────────────────
    const [catElec, catLimp, catOfi] = await Promise.all([
      tx.categoria.create({ data: { empresaId, nombre: 'Electrónicos', descripcion: 'Equipos y accesorios tecnológicos' } }),
      tx.categoria.create({ data: { empresaId, nombre: 'Limpieza Industrial', descripcion: 'Productos de limpieza y desinfección' } }),
      tx.categoria.create({ data: { empresaId, nombre: 'Útiles de Oficina', descripcion: 'Papelería y material de escritorio' } }),
    ]);

    // ── Almacenes ─────────────────────────────────────────────────────────
    const [almCentral, almSecundario] = await Promise.all([
      tx.almacen.create({ data: { empresaId, nombre: 'Almacén Central' } }),
      tx.almacen.create({ data: { empresaId, nombre: 'Almacén Secundario' } }),
    ]);

    // ── Áreas internas ────────────────────────────────────────────────────
    const [areaOps, areaSis, areaAdm] = await Promise.all([
      tx.areaInterna.create({ data: { empresaId, nombre: 'Operaciones', codigo: 'OPS' } }),
      tx.areaInterna.create({ data: { empresaId, nombre: 'Sistemas', codigo: 'SIS' } }),
      tx.areaInterna.create({ data: { empresaId, nombre: 'Administración', codigo: 'ADM' } }),
    ]);

    // ── Proveedores ───────────────────────────────────────────────────────
    const [provTech, provClean, provOffice, provImport, provQuimica] = await Promise.all([
      tx.proveedor.create({ data: { empresaId, razonSocial: 'TechDistrib S.A.C.', ruc: '20500001111', email: 'ventas@techdistrib.pe', telefono: '01-5551234' } }),
      tx.proveedor.create({ data: { empresaId, razonSocial: 'CleanPro Perú S.A.C.', ruc: '20500002222', email: 'ventas@cleanpro.pe', telefono: '01-5555678' } }),
      tx.proveedor.create({ data: { empresaId, razonSocial: 'OfficeMax Perú S.A.C.', ruc: '20500003333', email: 'ventas@officemax.pe', telefono: '01-5559012' } }),
      tx.proveedor.create({ data: { empresaId, razonSocial: 'Importadora Andina de Tecnología S.A.C.', ruc: '20500004444', email: 'ventas@importandina.pe', telefono: '01-5553456' } }),
      tx.proveedor.create({ data: { empresaId, razonSocial: 'Química Industrial del Perú S.A.C.', ruc: '20500005555', email: 'ventas@quimicaperu.pe', telefono: '01-5557890' } }),
    ]);

    // ── Productos (18) — variedad deliberada de stock y vencimiento ────────
    // Electrónicos: 3 OK (existentes) + agotado + crítico + sobre-stock + OK
    const [elecLaptop, elecMouse, elecTeclado, elecMonitor, elecImpresora, elecSSD, elecCargador] = await Promise.all([
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-001', nombre: 'Laptop HP Core i5 15.6"',        unidadMedida: 'UND', stockMinimo: 3,  stockMaximo: 30,  precioCompra: 2200, precioVenta: 2800 } }),
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-002', nombre: 'Mouse Inalámbrico Logitech M280', unidadMedida: 'UND', stockMinimo: 10, stockMaximo: 200, precioCompra: 55,   precioVenta: 85   } }),
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-003', nombre: 'Teclado USB Dell KB216',           unidadMedida: 'UND', stockMinimo: 10, stockMaximo: 150, precioCompra: 65,   precioVenta: 95   } }),
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-004', nombre: 'Monitor LED 24" Samsung',          unidadMedida: 'UND', stockMinimo: 5,  stockMaximo: 40,  precioCompra: 450,  precioVenta: 620  } }), // AGOTADO
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provTech.id,   sku: 'ELEC-005', nombre: 'Impresora Multifuncional Epson L3250', unidadMedida: 'UND', stockMinimo: 4, stockMaximo: 20, precioCompra: 650, precioVenta: 850 } }), // CRÍTICO
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provImport.id, sku: 'ELEC-006', nombre: 'Disco SSD 480GB Kingston',          unidadMedida: 'UND', stockMinimo: 15, stockMaximo: 150, precioCompra: 120,  precioVenta: 165  } }), // SOBRE STOCK
      tx.producto.create({ data: { empresaId, categoriaId: catElec.id, proveedorId: provImport.id, sku: 'ELEC-007', nombre: 'Cargador USB-C 65W Anker',          unidadMedida: 'UND', stockMinimo: 20, stockMaximo: 300, precioCompra: 45,   precioVenta: 69   } }),
    ]);
    // Limpieza Industrial: 1 OK (existente) + 3 perecederos (vencido/por vencer/vigente) + agotado + crítico
    const [limpDesinfectante, limpAlcohol, limpDetergente, limpLejia, limpGuantes, limpPapelToalla] = await Promise.all([
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provClean.id,   sku: 'LIMP-001', nombre: 'Desinfectante Multiuso 5L',              unidadMedida: 'LIT', stockMinimo: 20, stockMaximo: 500, precioCompra: 20, precioVenta: 28 } }),
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provQuimica.id, sku: 'LIMP-002', nombre: 'Alcohol Isopropílico 70% 1L',            unidadMedida: 'LIT', stockMinimo: 30, stockMaximo: 400, precioCompra: 8,  precioVenta: 14, esPerecedero: true } }), // lote VENCIDO
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provQuimica.id, sku: 'LIMP-003', nombre: 'Detergente Industrial Biodegradable 20L', unidadMedida: 'LIT', stockMinimo: 10, stockMaximo: 100, precioCompra: 55, precioVenta: 78, esPerecedero: true } }), // lote POR VENCER
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provQuimica.id, sku: 'LIMP-004', nombre: 'Lejía Concentrada 5L',                    unidadMedida: 'LIT', stockMinimo: 20, stockMaximo: 300, precioCompra: 12, precioVenta: 19, esPerecedero: true } }), // lote VIGENTE lejano
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provClean.id,   sku: 'LIMP-005', nombre: 'Guantes de Nitrilo Talla M x100',         unidadMedida: 'CJA', stockMinimo: 15, stockMaximo: 200, precioCompra: 35, precioVenta: 52 } }), // AGOTADO
      tx.producto.create({ data: { empresaId, categoriaId: catLimp.id, proveedorId: provClean.id,   sku: 'LIMP-006', nombre: 'Papel Toalla Industrial x6 rollos',       unidadMedida: 'PAQ', stockMinimo: 25, stockMaximo: 300, precioCompra: 22, precioVenta: 32 } }), // CRÍTICO
    ]);
    // Útiles de Oficina: 2 OK (existentes) + crítico + OK + sobre-stock
    const [ofiResma, ofiLapicero, ofiArchivador, ofiGrapadora, ofiPostit] = await Promise.all([
      tx.producto.create({ data: { empresaId, categoriaId: catOfi.id, proveedorId: provOffice.id, sku: 'OFI-001', nombre: 'Resma Papel A4 75gr x500 hojas',      unidadMedida: 'UND', stockMinimo: 50, stockMaximo: 1000, precioCompra: 13, precioVenta: 18 } }),
      tx.producto.create({ data: { empresaId, categoriaId: catOfi.id, proveedorId: provOffice.id, sku: 'OFI-002', nombre: 'Lapicero Azul BIC Cristal x12',       unidadMedida: 'CJA', stockMinimo: 20, stockMaximo: 600,  precioCompra: 8,  precioVenta: 12 } }),
      tx.producto.create({ data: { empresaId, categoriaId: catOfi.id, proveedorId: provOffice.id, sku: 'OFI-003', nombre: 'Archivador Palanca Oficio Lomo Ancho', unidadMedida: 'UND', stockMinimo: 30, stockMaximo: 400,  precioCompra: 6,  precioVenta: 9.5 } }), // CRÍTICO
      tx.producto.create({ data: { empresaId, categoriaId: catOfi.id, proveedorId: provOffice.id, sku: 'OFI-004', nombre: 'Grapadora Metálica Full Strip',        unidadMedida: 'UND', stockMinimo: 10, stockMaximo: 100,  precioCompra: 15, precioVenta: 24 } }),
      tx.producto.create({ data: { empresaId, categoriaId: catOfi.id, proveedorId: provOffice.id, sku: 'OFI-005', nombre: 'Post-it Notas Adhesivas x12 blocks',   unidadMedida: 'PAQ', stockMinimo: 40, stockMaximo: 500,  precioCompra: 18, precioVenta: 27 } }), // SOBRE STOCK
    ]);

    // ── Stock inicial (Inventario + Movimiento ENTRADA) ────────────────────
    const stockInicial: Array<[any, number]> = [
      [elecLaptop, 15], [elecMouse, 80], [elecTeclado, 50], [elecMonitor, 0], [elecImpresora, 2], [elecSSD, 180], [elecCargador, 120],
      [limpDesinfectante, 200], [limpAlcohol, 150], [limpDetergente, 60], [limpLejia, 150], [limpGuantes, 0], [limpPapelToalla, 10],
      [ofiResma, 600], [ofiLapicero, 300], [ofiArchivador, 12], [ofiGrapadora, 45], [ofiPostit, 620],
    ];
    for (const [prod, cantidad] of stockInicial) {
      await tx.inventario.create({ data: { productoId: prod.id, almacenId: almCentral.id, cantidad, cantidadReservada: 0 } });
      if (cantidad > 0) {
        await tx.movimiento.create({
          data: { empresaId, productoId: prod.id, almacenId: almCentral.id, tipo: 'ENTRADA', cantidad, costoUnitario: prod.precioCompra, motivo: 'Stock inicial demo' },
        });
      }
    }

    // ── Lotes de productos perecederos (vencido / por vencer / vigente) ────
    await Promise.all([
      tx.loteProducto.create({ data: { productoId: limpAlcohol.id,     numero: 'LT-2026-A01', fechaVencimiento: dias(-10), cantidadOriginal: 150, cantidadActual: 150, estado: 'Vencido'   } }),
      tx.loteProducto.create({ data: { productoId: limpDetergente.id, numero: 'LT-2026-D01', fechaVencimiento: dias(20),  cantidadOriginal: 60,  cantidadActual: 60,  estado: 'Por Vencer' } }),
      tx.loteProducto.create({ data: { productoId: limpLejia.id,      numero: 'LT-2026-L01', fechaVencimiento: dias(200), cantidadOriginal: 150, cantidadActual: 150, estado: 'Vigente'    } }),
    ]);

    // ── Clientes (7) — variedad de condición de pago / límite de crédito ──
    const [cliLima, cliAndina, cliConstructor, cliNorte, cliAndes, cliSur, cliPacifico] = await Promise.all([
      tx.cliente.create({ data: { empresaId, razonSocial: 'Corporación Lima E.I.R.L.',       ruc: '20600001111', email: 'compras@corplima.pe',    telefono: '996001001' } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Servi Andina S.A.C.',              ruc: '20600002222', email: 'logistica@serviandina.pe', telefono: '996002002', condicionPago: '30', limiteCredito: 15000 } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Ferretería El Constructor S.A.C.', ruc: '20600003333', email: 'compras@elconstructor.pe', telefono: '996003003', condicionPago: '15', limiteCredito: 8000  } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Distribuidora Norte Perú S.A.C.',  ruc: '20600004444', email: 'compras@distnorte.pe',    telefono: '996004004', condicionPago: '60', limiteCredito: 25000 } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Comercial Andes E.I.R.L.',         ruc: '20600005555', email: 'ventas@comercialandes.pe', telefono: '996005005' } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Grupo Industrial Sur S.A.C.',      ruc: '20600006666', email: 'compras@gruposur.pe',     telefono: '996006006', condicionPago: '30', limiteCredito: 12000 } }),
      tx.cliente.create({ data: { empresaId, razonSocial: 'Suministros Pacífico S.A.C.',      ruc: '20600007777', email: 'compras@sumpacifico.pe',  telefono: '996007007', condicionPago: '30', limiteCredito: 5000  } }),
    ]);

    // ── Transportistas (3) ──────────────────────────────────────────────────
    const [transCarlos, transMiguel, transExpress] = await Promise.all([
      tx.transportista.create({ data: { empresaId, nombre: 'Carlos Ríos Huanca',   tipo: 'PROPIO',  vehiculo: 'Camioneta Toyota HiLux', licencia: 'AIII', telefono: '987000001' } }),
      tx.transportista.create({ data: { empresaId, nombre: 'Miguel Ángel Torres', tipo: 'PROPIO',  vehiculo: 'Camión NQR Isuzu',        licencia: 'AIIIb', telefono: '987000002', placa: 'ABC-123' } }),
      tx.transportista.create({ data: { empresaId, nombre: 'Trans Express S.A.C.', tipo: 'TERCERO', ruc: '20500009999', telefono: '987000003' } }),
    ]);

    // ── Usuarios demo ya sembrados por prisma/seed.ts — solo lookup ────────
    const [usrSolicitante, usrAdmin, usrAlmacenero] = await Promise.all([
      tx.usuario.findFirst({ where: { empresaId, rol: { codigo: 'solicitante' } } }),
      tx.usuario.findFirst({ where: { empresaId, rol: { codigo: 'admin' } } }),
      tx.usuario.findFirst({ where: { empresaId, rol: { codigo: 'almacenero' } } }),
    ]);

    // ── Usuario Chofer — se asegura en cada "Restaurar Demo" ───────────────
    // El rol 'chofer' depende de un Transportista (Usuario.transportistaId).
    // Como "Restaurar Demo" borra y vuelve a crear los transportistas, el
    // vínculo queda en null si no se refresca (onDelete: SetNull implícito de
    // Prisma en un campo FK opcional). Acá se garantiza, en cada reset, que
    // exista al menos un usuario Chofer demo y que CUALQUIER usuario con rol
    // Chofer en este tenant — el de acá o uno creado a mano desde Usuarios —
    // quede vinculado a un transportista válido.
    const rolChofer = await tx.rol.findFirst({ where: { codigo: 'chofer', empresaId: null } });
    if (rolChofer) {
      const usrChofer = await tx.usuario.findFirst({ where: { empresaId, rolId: rolChofer.id } });
      if (!usrChofer) {
        await tx.usuario.create({
          data: {
            empresaId, nombre: 'Chofer DL Norte', email: 'chofer@dlnorte.demo',
            passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
            rolId: rolChofer.id, transportistaId: transCarlos.id,
          },
        });
      }
      await tx.usuario.updateMany({
        where: { empresaId, rolId: rolChofer.id },
        data: { transportistaId: transCarlos.id },
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÓRDENES DE COMPRA (5 — una por cada EstadoOrdenCompra)
    // ══════════════════════════════════════════════════════════════════════
    const oc1Subtotal = 10 * 450; // Monitor — restock del agotado
    const oc1Igv = Math.round(oc1Subtotal * 0.18 * 100) / 100;
    await tx.ordenCompra.create({
      data: {
        empresaId, numero: 'OC-00001', proveedorId: provTech.id, almacenId: almCentral.id,
        estado: 'PENDIENTE', subtotal: oc1Subtotal, igv: oc1Igv, total: oc1Subtotal + oc1Igv,
        notas: 'Restock de monitores — agotados',
        items: { create: [{ productoId: elecMonitor.id, cantidad: 10, costoUnitario: 450 }] },
      },
    });

    const oc2Subtotal = 20 * 120; // SSD
    const oc2Igv = Math.round(oc2Subtotal * 0.18 * 100) / 100;
    const oc2 = await tx.ordenCompra.create({
      data: {
        empresaId, numero: 'OC-00002', proveedorId: provImport.id, almacenId: almCentral.id,
        estado: 'APROBADA', subtotal: oc2Subtotal, igv: oc2Igv, total: oc2Subtotal + oc2Igv,
        items: { create: [{ productoId: elecSSD.id, cantidad: 20, costoUnitario: 120 }] },
      },
    });

    const oc3Subtotal = 20 * 55; // Detergente — recepción parcial (10 de 20)
    const oc3Igv = Math.round(oc3Subtotal * 0.18 * 100) / 100;
    const oc3 = await tx.ordenCompra.create({
      data: {
        empresaId, numero: 'OC-00003', proveedorId: provQuimica.id, almacenId: almCentral.id,
        estado: 'PARCIAL', subtotal: oc3Subtotal, igv: oc3Igv, total: oc3Subtotal + oc3Igv,
        items: { create: [{ productoId: limpDetergente.id, cantidad: 20, costoUnitario: 55, cantidadRecibida: 10 }] },
      },
    });
    {
      const invDet = await tx.inventario.findFirst({ where: { productoId: limpDetergente.id, almacenId: almCentral.id, ubicacionId: null } });
      await tx.inventario.update({ where: { id: invDet!.id }, data: { cantidad: { increment: 10 } } });
      await tx.movimiento.create({ data: { empresaId, productoId: limpDetergente.id, almacenId: almCentral.id, tipo: 'ENTRADA', cantidad: 10, costoUnitario: 55, motivo: 'Recepción parcial de compra', documento: oc3.numero } });
    }

    const oc4Subtotal = 50 * 6; // Archivador — restock del crítico, recepción completa
    const oc4Igv = Math.round(oc4Subtotal * 0.18 * 100) / 100;
    const oc4 = await tx.ordenCompra.create({
      data: {
        empresaId, numero: 'OC-00004', proveedorId: provOffice.id, almacenId: almCentral.id,
        estado: 'RECIBIDA', subtotal: oc4Subtotal, igv: oc4Igv, total: oc4Subtotal + oc4Igv,
        items: { create: [{ productoId: ofiArchivador.id, cantidad: 50, costoUnitario: 6, cantidadRecibida: 50 }] },
      },
    });
    {
      const invArch = await tx.inventario.findFirst({ where: { productoId: ofiArchivador.id, almacenId: almCentral.id, ubicacionId: null } });
      await tx.inventario.update({ where: { id: invArch!.id }, data: { cantidad: { increment: 50 } } });
      await tx.movimiento.create({ data: { empresaId, productoId: ofiArchivador.id, almacenId: almCentral.id, tipo: 'ENTRADA', cantidad: 50, costoUnitario: 6, motivo: 'Recepción de compra', documento: oc4.numero } });
    }

    const oc5Subtotal = 30 * 35; // Guantes — se canceló antes de recibir
    const oc5Igv = Math.round(oc5Subtotal * 0.18 * 100) / 100;
    const oc5 = await tx.ordenCompra.create({
      data: {
        empresaId, numero: 'OC-00005', proveedorId: provClean.id, almacenId: almCentral.id,
        estado: 'CANCELADA', subtotal: oc5Subtotal, igv: oc5Igv, total: oc5Subtotal + oc5Igv,
        notas: 'Cancelada — proveedor sin stock',
        items: { create: [{ productoId: limpGuantes.id, cantidad: 30, costoUnitario: 35 }] },
      },
    });

    // ── Facturas B2B (3 — una por cada EstadoFacturaB2B) ───────────────────
    await Promise.all([
      tx.facturaB2B.create({ data: { empresaId, ordenCompraId: oc2.id, proveedorId: provImport.id, numero: 'FB2B-00001', monto: oc2Subtotal + oc2Igv, estado: 'ENVIADA' } }),
      tx.facturaB2B.create({ data: { empresaId, ordenCompraId: oc4.id, proveedorId: provOffice.id, numero: 'FB2B-00002', monto: oc4Subtotal + oc4Igv, estado: 'RECIBIDA' } }),
      tx.facturaB2B.create({ data: { empresaId, ordenCompraId: oc5.id, proveedorId: provClean.id,  numero: 'FB2B-00003', monto: oc5Subtotal + oc5Igv, estado: 'RECHAZADA', notas: 'Factura rechazada — la OC fue cancelada' } }),
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // COTIZACIONES / RFQ (5 — una por cada EstadoCotizacion)
    // ══════════════════════════════════════════════════════════════════════
    await tx.cotizacion.create({
      data: { empresaId, numero: 'COT-00001', estado: 'BORRADOR', notas: 'Restock de impresoras',
        items: { create: [{ productoId: elecImpresora.id, cantidad: 15, descripcion: elecImpresora.nombre }] } },
    });
    await tx.cotizacion.create({
      data: { empresaId, numero: 'COT-00002', estado: 'ENVIADA',
        items: { create: [{ productoId: ofiGrapadora.id, cantidad: 30, descripcion: ofiGrapadora.nombre }] } },
    });
    const cot3 = await tx.cotizacion.create({
      data: { empresaId, numero: 'COT-00003', estado: 'RESPONDIDA',
        items: { create: [{ productoId: elecCargador.id, cantidad: 50, descripcion: elecCargador.nombre }] } },
    });
    await Promise.all([
      tx.respuestaProveedor.create({ data: { cotizacionId: cot3.id, proveedorId: provImport.id, total: 2100, tiempoEntrega: 6,  items: { create: [{ productoId: elecCargador.id, precioUnitario: 42, subtotal: 2100 }] } } }),
      tx.respuestaProveedor.create({ data: { cotizacionId: cot3.id, proveedorId: provTech.id,   total: 2250, tiempoEntrega: 10, items: { create: [{ productoId: elecCargador.id, precioUnitario: 45, subtotal: 2250 }] } } }),
    ]);
    const cot4 = await tx.cotizacion.create({
      data: { empresaId, numero: 'COT-00004', estado: 'ADJUDICADA', notas: 'Cotización de laptops adicionales',
        items: { create: [{ productoId: elecLaptop.id, cantidad: 10, descripcion: elecLaptop.nombre }] } },
    });
    await Promise.all([
      tx.respuestaProveedor.create({ data: { cotizacionId: cot4.id, proveedorId: provTech.id,   total: 21500, tiempoEntrega: 5,  ganadora: true,  items: { create: [{ productoId: elecLaptop.id, precioUnitario: 2150, subtotal: 21500 }] } } }),
      tx.respuestaProveedor.create({ data: { cotizacionId: cot4.id, proveedorId: provOffice.id, total: 22800, tiempoEntrega: 10, ganadora: false, items: { create: [{ productoId: elecLaptop.id, precioUnitario: 2280, subtotal: 22800 }] } } }),
    ]);
    await tx.cotizacion.create({
      data: { empresaId, numero: 'COT-00005', estado: 'CANCELADA',
        items: { create: [{ productoId: limpLejia.id, cantidad: 40, descripcion: limpLejia.nombre }] } },
    });

    // ══════════════════════════════════════════════════════════════════════
    // DESPACHOS (13) — cubre los 7 estados de EstadoDespacho + alimenta
    // Rutas/CxC/SUNAT/Picking abajo. Solo los DESPACHADO/ENTREGADO consumen
    // stock real (Movimiento SALIDA); PEDIDO/APROBADO/PICKING/LISTO solo reservan.
    // DESP-00013 es un segundo caso PICKING (además de DESP-00003) para
    // poder mostrar una lista PENDIENTE sin tocar el DESP-00003 existente,
    // que varios e2e/tests ya referencian en su estado original.
    // ══════════════════════════════════════════════════════════════════════
    async function reservar(productoId: string, almacenId: string, cantidad: number) {
      const inv = await tx.inventario.findFirst({ where: { productoId, almacenId, ubicacionId: null } });
      await tx.inventario.update({ where: { id: inv!.id }, data: { cantidadReservada: { increment: cantidad } } });
    }
    async function despachar(productoId: string, almacenId: string, cantidad: number, costoUnitario: number, documento: string) {
      const inv = await tx.inventario.findFirst({ where: { productoId, almacenId, ubicacionId: null } });
      await tx.inventario.update({ where: { id: inv!.id }, data: { cantidad: { decrement: cantidad } } });
      await tx.movimiento.create({ data: { empresaId, productoId, almacenId, tipo: 'SALIDA', cantidad, costoUnitario, motivo: 'Despacho a cliente', documento } });
    }

    // DESP-00001 PEDIDO — reserva OFI-003 (crítico) y LIMP-006 (crítico)
    const d1Subtotal = 5 * 9.5 + 3 * 32;
    const d1Igv = Math.round(d1Subtotal * 0.18 * 100) / 100;
    await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00001', clienteId: cliConstructor.id, almacenId: almCentral.id, estado: 'PEDIDO',
        subtotal: d1Subtotal, igv: d1Igv, total: d1Subtotal + d1Igv,
        items: { create: [
          { productoId: ofiArchivador.id, cantidad: 5, precioVenta: 9.5, costoUnitario: 6,  subtotal: 47.5, cantidadReservada: 5 },
          { productoId: limpPapelToalla.id, cantidad: 3, precioVenta: 32, costoUnitario: 22, subtotal: 96,   cantidadReservada: 3 },
        ] },
      },
    });
    await Promise.all([reservar(ofiArchivador.id, almCentral.id, 5), reservar(limpPapelToalla.id, almCentral.id, 3)]);

    // DESP-00002 APROBADO — reserva ELEC-005 (crítico, solo queda 2 en stock)
    const d2Subtotal = 1 * 850;
    const d2Igv = Math.round(d2Subtotal * 0.18 * 100) / 100;
    await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00002', clienteId: cliNorte.id, almacenId: almCentral.id, estado: 'APROBADO',
        subtotal: d2Subtotal, igv: d2Igv, total: d2Subtotal + d2Igv,
        items: { create: [{ productoId: elecImpresora.id, cantidad: 1, precioVenta: 850, costoUnitario: 650, subtotal: 850, cantidadReservada: 1 }] },
      },
    });
    await reservar(elecImpresora.id, almCentral.id, 1);

    // DESP-00003 PICKING — reserva OFI-001 (OK, stock amplio)
    const d3Subtotal = 50 * 18;
    const d3Igv = Math.round(d3Subtotal * 0.18 * 100) / 100;
    const desp3 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00003', clienteId: cliAndes.id, almacenId: almCentral.id, estado: 'PICKING',
        subtotal: d3Subtotal, igv: d3Igv, total: d3Subtotal + d3Igv,
        items: { create: [{ productoId: ofiResma.id, cantidad: 50, precioVenta: 18, costoUnitario: 13, subtotal: 900, cantidadReservada: 50 }] },
      },
    });
    await reservar(ofiResma.id, almCentral.id, 50);

    // DESP-00004 CANCELADO
    const d4Subtotal = 20 * 28;
    const d4Igv = Math.round(d4Subtotal * 0.18 * 100) / 100;
    await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00004', clienteId: cliAndina.id, almacenId: almCentral.id, estado: 'CANCELADO',
        subtotal: d4Subtotal, igv: d4Igv, total: d4Subtotal + d4Igv, observaciones: 'Cliente canceló el pedido',
        items: { create: [{ productoId: limpDesinfectante.id, cantidad: 20, precioVenta: 28, costoUnitario: 20, subtotal: 560, cantidadReservada: 0 }] },
      },
    });

    // DESP-00005 DESPACHADO SIN GUÍA — despachado individualmente (fuera de
    // una Ruta), a propósito sin guiaNumero: ejercita el botón "Asignar guía".
    const d5Subtotal = 8 * 95;
    const d5Igv = Math.round(d5Subtotal * 0.18 * 100) / 100;
    const desp5 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00005', clienteId: cliPacifico.id, almacenId: almCentral.id, estado: 'DESPACHADO',
        subtotal: d5Subtotal, igv: d5Igv, total: d5Subtotal + d5Igv, fechaDespacho: ahora,
        items: { create: [{ productoId: elecTeclado.id, cantidad: 8, precioVenta: 95, costoUnitario: 65, subtotal: 760, cantidadReservada: 0 }] },
      },
    });
    await despachar(elecTeclado.id, almCentral.id, 8, 65, 'DESP-00005');

    // DESP-00006 / DESP-00007 LISTO — asignados a la Ruta PROGRAMADA de abajo
    const d6Subtotal = 10 * 69;
    const d6Igv = Math.round(d6Subtotal * 0.18 * 100) / 100;
    const desp6 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00006', clienteId: cliSur.id, almacenId: almCentral.id, estado: 'LISTO',
        subtotal: d6Subtotal, igv: d6Igv, total: d6Subtotal + d6Igv,
        items: { create: [{ productoId: elecCargador.id, cantidad: 10, precioVenta: 69, costoUnitario: 45, subtotal: 690, cantidadReservada: 10 }] },
      },
    });
    await reservar(elecCargador.id, almCentral.id, 10);

    const d7Subtotal = 5 * 24;
    const d7Igv = Math.round(d7Subtotal * 0.18 * 100) / 100;
    const desp7 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00007', clienteId: cliLima.id, almacenId: almCentral.id, estado: 'LISTO',
        subtotal: d7Subtotal, igv: d7Igv, total: d7Subtotal + d7Igv,
        items: { create: [{ productoId: ofiGrapadora.id, cantidad: 5, precioVenta: 24, costoUnitario: 15, subtotal: 120, cantidadReservada: 5 }] },
      },
    });
    await reservar(ofiGrapadora.id, almCentral.id, 5);

    // DESP-00008/9/10 — despachados vía la Ruta EN_RUTA de abajo (ya salieron
    // del almacén: estado DESPACHADO/ENTREGADO, con guía asignada + tracking SUNAT).
    const d8Subtotal = 2 * 2800 + 10 * 85;
    const d8Igv = Math.round(d8Subtotal * 0.18 * 100) / 100;
    const desp8 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00008', clienteId: cliLima.id, almacenId: almCentral.id, estado: 'ENTREGADO',
        subtotal: d8Subtotal, igv: d8Igv, total: d8Subtotal + d8Igv, guiaNumero: 'GR-001-0001',
        fechaDespacho: dias(-1), fechaEntregado: ahora, receptorNombre: 'Recepción Corporación Lima', transportistaId: transCarlos.id,
        items: { create: [
          { productoId: elecLaptop.id, cantidad: 2,  precioVenta: 2800, costoUnitario: 2200, subtotal: 5600, cantidadReservada: 0 },
          { productoId: elecMouse.id,  cantidad: 10, precioVenta: 85,   costoUnitario: 55,   subtotal: 850,  cantidadReservada: 0 },
        ] },
      },
    });
    await Promise.all([despachar(elecLaptop.id, almCentral.id, 2, 2200, 'DESP-00008'), despachar(elecMouse.id, almCentral.id, 10, 55, 'DESP-00008')]);

    const d9Subtotal = 30 * 18;
    const d9Igv = Math.round(d9Subtotal * 0.18 * 100) / 100;
    const desp9 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00009', clienteId: cliConstructor.id, almacenId: almCentral.id, estado: 'DESPACHADO',
        subtotal: d9Subtotal, igv: d9Igv, total: d9Subtotal + d9Igv, guiaNumero: 'GR-001-0002',
        fechaDespacho: dias(-1), transportistaId: transCarlos.id,
        items: { create: [{ productoId: ofiResma.id, cantidad: 30, precioVenta: 18, costoUnitario: 13, subtotal: 540, cantidadReservada: 0 }] },
      },
    });
    await despachar(ofiResma.id, almCentral.id, 30, 13, 'DESP-00009');

    const d10Subtotal = 15 * 28;
    const d10Igv = Math.round(d10Subtotal * 0.18 * 100) / 100;
    const desp10 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00010', clienteId: cliNorte.id, almacenId: almCentral.id, estado: 'DESPACHADO',
        subtotal: d10Subtotal, igv: d10Igv, total: d10Subtotal + d10Igv, guiaNumero: 'GR-001-0003',
        fechaDespacho: dias(-1), transportistaId: transCarlos.id,
        items: { create: [{ productoId: limpDesinfectante.id, cantidad: 15, precioVenta: 28, costoUnitario: 20, subtotal: 420, cantidadReservada: 0 }] },
      },
    });
    await despachar(limpDesinfectante.id, almCentral.id, 15, 20, 'DESP-00010');

    // DESP-00011 ENTREGADO — Ruta COMPLETADA (caso clásico, con guía).
    const d11Subtotal = 5 * 165 + 20 * 12;
    const d11Igv = Math.round(d11Subtotal * 0.18 * 100) / 100;
    const desp11 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00011', clienteId: cliAndina.id, almacenId: almCentral.id, estado: 'ENTREGADO',
        subtotal: d11Subtotal, igv: d11Igv, total: d11Subtotal + d11Igv, guiaNumero: 'GR-001-0004',
        fechaDespacho: dias(-3), fechaEntregado: dias(-3), receptorNombre: 'Recepción Servi Andina', transportistaId: transMiguel.id,
        items: { create: [
          { productoId: elecSSD.id,     cantidad: 5,  precioVenta: 165, costoUnitario: 120, subtotal: 825, cantidadReservada: 0 },
          { productoId: ofiLapicero.id, cantidad: 20, precioVenta: 12,  costoUnitario: 8,   subtotal: 240, cantidadReservada: 0 },
        ] },
      },
    });
    await Promise.all([despachar(elecSSD.id, almCentral.id, 5, 120, 'DESP-00011'), despachar(ofiLapicero.id, almCentral.id, 20, 8, 'DESP-00011')]);

    // DESP-00012 LISTO — iba a ir en la Ruta CANCELADA, no se ve afectado.
    const d12Subtotal = 10 * 19;
    const d12Igv = Math.round(d12Subtotal * 0.18 * 100) / 100;
    const desp12 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00012', clienteId: cliSur.id, almacenId: almCentral.id, estado: 'LISTO',
        subtotal: d12Subtotal, igv: d12Igv, total: d12Subtotal + d12Igv,
        items: { create: [{ productoId: limpLejia.id, cantidad: 10, precioVenta: 19, costoUnitario: 12, subtotal: 190, cantidadReservada: 10 }] },
      },
    });
    await reservar(limpLejia.id, almCentral.id, 10);

    // ══════════════════════════════════════════════════════════════════════
    // PICKING — módulo nuevo (2026-07-31, docs/PROPUESTA-MODULO-PICKING.md).
    // En producción, ListaPicking se genera automáticamente al entrar a
    // PICKING (DespachosService.iniciarPicking); acá se siembra a mano
    // porque los despachos de arriba nacen directo en su estado final.
    // Cubre los 3 EstadoListaPicking + una línea PARCIAL (trabajo a medias).
    // ══════════════════════════════════════════════════════════════════════

    // DESP-00013 PICKING (nuevo) — lista recién generada, sin asignar ni
    // empezar: el caso más común al entrar a Picking desde la UI.
    const d13Subtotal = 25 * 27 + 15 * 69;
    const d13Igv = Math.round(d13Subtotal * 0.18 * 100) / 100;
    const desp13 = await tx.despacho.create({
      data: {
        empresaId, numero: 'DESP-00013', clienteId: cliConstructor.id, almacenId: almCentral.id, estado: 'PICKING',
        subtotal: d13Subtotal, igv: d13Igv, total: d13Subtotal + d13Igv,
        items: { create: [
          { productoId: ofiPostit.id,    cantidad: 25, precioVenta: 27, costoUnitario: 18, subtotal: 675,  cantidadReservada: 25 },
          { productoId: elecCargador.id, cantidad: 15, precioVenta: 69, costoUnitario: 45, subtotal: 1035, cantidadReservada: 15 },
        ] },
      },
    });
    await Promise.all([reservar(ofiPostit.id, almCentral.id, 25), reservar(elecCargador.id, almCentral.id, 15)]);
    await tx.listaPicking.create({
      data: {
        empresaId, despachoId: desp13.id,
        lineas: { create: [
          { productoId: ofiPostit.id,    cantidadRequerida: 25 },
          { productoId: elecCargador.id, cantidadRequerida: 15 },
        ] },
      },
    });

    // DESP-00003 PICKING — lista EN_PROCESO: 30 de 50 ya pickeados (línea
    // PARCIAL). El despacho no puede pasar a LISTO hasta completar la línea
    // (PickingService.assertCompleta) — sin picking parcial a nivel despacho.
    await tx.listaPicking.create({
      data: {
        empresaId, despachoId: desp3.id, estado: 'EN_PROCESO', usuarioAsignadoId: usrAlmacenero?.id, fechaInicio: dias(-0.2),
        lineas: { create: [{ productoId: ofiResma.id, cantidadRequerida: 50, cantidadPickeada: 30, estado: 'PARCIAL' }] },
      },
    });

    // Listas COMPLETADAS — despachos que ya avanzaron más allá de Picking
    // (LISTO/DESPACHADO/ENTREGADO): la trazabilidad de picking ya cerrada.
    const listasCompletas: Array<{ despachoId: string; items: Array<{ productoId: string; cantidad: number }>; inicio: Date; fin: Date }> = [
      { despachoId: desp5.id,  items: [{ productoId: elecTeclado.id,        cantidad: 8  }],                                                     inicio: dias(-1.3), fin: dias(-1.1) },
      { despachoId: desp6.id,  items: [{ productoId: elecCargador.id,       cantidad: 10 }],                                                     inicio: dias(-0.5), fin: dias(-0.3) },
      { despachoId: desp7.id,  items: [{ productoId: ofiGrapadora.id,       cantidad: 5  }],                                                     inicio: dias(-0.5), fin: dias(-0.3) },
      { despachoId: desp8.id,  items: [{ productoId: elecLaptop.id, cantidad: 2 }, { productoId: elecMouse.id, cantidad: 10 }],                   inicio: dias(-1.3), fin: dias(-1.1) },
      { despachoId: desp9.id,  items: [{ productoId: ofiResma.id,           cantidad: 30 }],                                                     inicio: dias(-1.3), fin: dias(-1.1) },
      { despachoId: desp10.id, items: [{ productoId: limpDesinfectante.id,  cantidad: 15 }],                                                     inicio: dias(-1.3), fin: dias(-1.1) },
      { despachoId: desp11.id, items: [{ productoId: elecSSD.id, cantidad: 5 }, { productoId: ofiLapicero.id, cantidad: 20 }],                    inicio: dias(-3.3), fin: dias(-3.1) },
      { despachoId: desp12.id, items: [{ productoId: limpLejia.id,          cantidad: 10 }],                                                     inicio: dias(-0.5), fin: dias(-0.2) },
    ];
    for (const { despachoId, items, inicio, fin } of listasCompletas) {
      await tx.listaPicking.create({
        data: {
          empresaId, despachoId, estado: 'COMPLETADA', usuarioAsignadoId: usrAlmacenero?.id, fechaInicio: inicio, fechaFin: fin,
          lineas: { create: items.map(({ productoId, cantidad }) => ({
            productoId, cantidadRequerida: cantidad, cantidadPickeada: cantidad, estado: 'COMPLETA' as const,
          })) },
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // RUTAS (4 — una por cada EstadoRuta)
    // ══════════════════════════════════════════════════════════════════════

    // RUTA-00001 PROGRAMADA — con almacén de origen, sin iniciar (despachos LISTO).
    const ruta1 = await tx.ruta.create({
      data: { empresaId, numero: 'RUTA-00001', transportistaId: transExpress.id, almacenId: almCentral.id, estado: 'PROGRAMADA', fechaSalida: dias(1) },
    });
    await Promise.all([
      tx.parada.create({ data: { rutaId: ruta1.id, despachoId: desp6.id, orden: 1, estado: 'PENDIENTE' } }),
      tx.parada.create({ data: { rutaId: ruta1.id, despachoId: desp7.id, orden: 2, estado: 'PENDIENTE' } }),
    ]);

    // RUTA-00002 EN_RUTA — 3 paradas en 3 estados distintos (incluye FALLIDO,
    // sin ejemplo hasta ahora en los datos demo).
    const ruta2 = await tx.ruta.create({
      data: { empresaId, numero: 'RUTA-00002', transportistaId: transCarlos.id, almacenId: almCentral.id, estado: 'EN_RUTA', fechaSalida: dias(-1) },
    });
    await Promise.all([
      tx.parada.create({ data: { rutaId: ruta2.id, despachoId: desp8.id,  orden: 1, estado: 'ENTREGADO', horaLlegada: dias(-1), horaPartida: dias(-1) } }),
      tx.parada.create({ data: { rutaId: ruta2.id, despachoId: desp9.id,  orden: 2, estado: 'EN_CAMINO' } }),
      tx.parada.create({ data: { rutaId: ruta2.id, despachoId: desp10.id, orden: 3, estado: 'FALLIDO', horaLlegada: dias(-1), horaPartida: dias(-1), observacion: 'Cliente ausente — reprogramar entrega' } }),
    ]);

    // RUTA-00003 COMPLETADA — caso clásico.
    const ruta3 = await tx.ruta.create({
      data: { empresaId, numero: 'RUTA-00003', transportistaId: transMiguel.id, almacenId: almCentral.id, estado: 'COMPLETADA', fechaSalida: dias(-3), fechaRetorno: dias(-3), kmRecorrido: 18.5, costoViaje: 45 },
    });
    await tx.parada.create({ data: { rutaId: ruta3.id, despachoId: desp11.id, orden: 1, estado: 'ENTREGADO', horaLlegada: dias(-3), horaPartida: dias(-3) } });

    // RUTA-00004 CANCELADA — el despacho asignado queda intacto en LISTO.
    const ruta4 = await tx.ruta.create({
      data: { empresaId, numero: 'RUTA-00004', transportistaId: transExpress.id, estado: 'CANCELADA', fechaSalida: dias(2) },
    });
    await tx.parada.create({ data: { rutaId: ruta4.id, despachoId: desp12.id, orden: 1, estado: 'PENDIENTE' } });

    // ══════════════════════════════════════════════════════════════════════
    // SUNAT / GUÍA DE REMISIÓN ELECTRÓNICA (3 — una por cada estado, ligadas
    // a los despachos de la Ruta EN_RUTA que ya tienen guiaNumero)
    // ══════════════════════════════════════════════════════════════════════
    await Promise.all([
      tx.guiaRemisionElectronica.create({ data: { empresaId, despachoId: desp8.id,  estado: 'ACEPTADO', fechaEnvio: dias(-1), fechaRespuesta: dias(-1), cdr: 'CDR-DEMO-0001' } }),
      tx.guiaRemisionElectronica.create({ data: { empresaId, despachoId: desp9.id,  estado: 'ENVIADO',  fechaEnvio: dias(-1) } }),
      tx.guiaRemisionElectronica.create({ data: { empresaId, despachoId: desp10.id, estado: 'PENDIENTE' } }),
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // CUENTAS POR COBRAR (4 — una por cada EstadoCxC)
    // ══════════════════════════════════════════════════════════════════════
    await tx.cuentaPorCobrar.create({
      data: { empresaId, numero: 'CXC-00001', clienteId: cliLima.id, despachoId: desp8.id, monto: d8Subtotal + d8Igv, saldo: d8Subtotal + d8Igv, fechaVencimiento: dias(30), diasCredito: 30, estado: 'PENDIENTE' },
    });
    const cxc2 = await tx.cuentaPorCobrar.create({
      data: { empresaId, numero: 'CXC-00002', clienteId: cliConstructor.id, despachoId: desp9.id, monto: d9Subtotal + d9Igv, saldo: (d9Subtotal + d9Igv) / 2, fechaVencimiento: dias(15), diasCredito: 15, estado: 'PARCIAL' },
    });
    await tx.pagoCxC.create({ data: { cuentaId: cxc2.id, monto: (d9Subtotal + d9Igv) / 2, metodo: 'transferencia', notas: 'Primer abono' } });
    await tx.cuentaPorCobrar.create({
      data: { empresaId, numero: 'CXC-00003', clienteId: cliNorte.id, monto: 1200, saldo: 0, fechaVencimiento: dias(-20), diasCredito: 30, estado: 'COBRADA' },
    });
    await tx.cuentaPorCobrar.create({
      data: { empresaId, numero: 'CXC-00004', clienteId: cliPacifico.id, monto: 950, saldo: 950, fechaEmision: dias(-45), fechaVencimiento: dias(-15), diasCredito: 30, estado: 'VENCIDA' },
    });

    // ══════════════════════════════════════════════════════════════════════
    // PROFORMAS (5 — una por cada EstadoProforma)
    // ══════════════════════════════════════════════════════════════════════
    const pf1Subtotal = 20 * 12;
    await tx.proforma.create({
      data: { empresaId, numero: 'PRO-00001', clienteId: cliAndina.id, estado: 'BORRADOR', subtotal: pf1Subtotal, igv: Math.round(pf1Subtotal * 0.18 * 100) / 100, total: pf1Subtotal * 1.18,
        items: { create: [{ productoId: ofiLapicero.id, cantidad: 20, precioUnitario: 12, subtotal: 240 }] } },
    });
    const pf2Subtotal = 10 * 24;
    await tx.proforma.create({
      data: { empresaId, numero: 'PRO-00002', clienteId: cliConstructor.id, estado: 'ENVIADA', fechaVencimiento: dias(15), subtotal: pf2Subtotal, igv: Math.round(pf2Subtotal * 0.18 * 100) / 100, total: pf2Subtotal * 1.18,
        items: { create: [{ productoId: ofiGrapadora.id, cantidad: 10, precioUnitario: 24, subtotal: 240 }] } },
    });
    const pf3Subtotal = 3 * 620;
    await tx.proforma.create({
      data: { empresaId, numero: 'PRO-00003', clienteId: cliNorte.id, estado: 'ACEPTADA', fechaVencimiento: dias(10), subtotal: pf3Subtotal, igv: Math.round(pf3Subtotal * 0.18 * 100) / 100, total: pf3Subtotal * 1.18,
        items: { create: [{ productoId: elecMonitor.id, cantidad: 3, precioUnitario: 620, subtotal: 1860 }] } },
    });
    const pf4Subtotal = 5 * 52;
    await tx.proforma.create({
      data: { empresaId, numero: 'PRO-00004', clienteId: cliAndes.id, estado: 'RECHAZADA', fechaVencimiento: dias(5), subtotal: pf4Subtotal, igv: Math.round(pf4Subtotal * 0.18 * 100) / 100, total: pf4Subtotal * 1.18,
        items: { create: [{ productoId: limpGuantes.id, cantidad: 5, precioUnitario: 52, subtotal: 260 }] } },
    });
    const pf5Subtotal = 8 * 165;
    await tx.proforma.create({
      data: { empresaId, numero: 'PRO-00005', clienteId: cliSur.id, estado: 'VENCIDA', fechaVencimiento: dias(-5), subtotal: pf5Subtotal, igv: Math.round(pf5Subtotal * 0.18 * 100) / 100, total: pf5Subtotal * 1.18,
        items: { create: [{ productoId: elecSSD.id, cantidad: 8, precioUnitario: 165, subtotal: 1320 }] } },
    });

    // ══════════════════════════════════════════════════════════════════════
    // PORTAL B2B (5 — una por cada EstadoPedidoPortal)
    // ══════════════════════════════════════════════════════════════════════
    const pp1Subtotal = 15 * 85;
    await tx.pedidoPortal.create({
      data: { empresaId, numero: 'PP-00001', clienteId: cliLima.id, estado: 'NUEVO', subtotal: pp1Subtotal, igv: Math.round(pp1Subtotal * 0.18 * 100) / 100, total: pp1Subtotal * 1.18, fechaEntregaDeseada: dias(7),
        items: { create: [{ productoId: elecMouse.id, cantidad: 15, precioUnitario: 85, subtotal: 1275 }] } },
    });
    const pp2Subtotal = 8 * 69;
    await tx.pedidoPortal.create({
      data: { empresaId, numero: 'PP-00002', clienteId: cliAndina.id, estado: 'REVISANDO', subtotal: pp2Subtotal, igv: Math.round(pp2Subtotal * 0.18 * 100) / 100, total: pp2Subtotal * 1.18,
        items: { create: [{ productoId: elecCargador.id, cantidad: 8, precioUnitario: 69, subtotal: 552 }] } },
    });
    const pp3Subtotal = 30 * 18;
    await tx.pedidoPortal.create({
      data: { empresaId, numero: 'PP-00003', clienteId: cliConstructor.id, estado: 'APROBADO', subtotal: pp3Subtotal, igv: Math.round(pp3Subtotal * 0.18 * 100) / 100, total: pp3Subtotal * 1.18,
        items: { create: [{ productoId: ofiResma.id, cantidad: 30, precioUnitario: 18, subtotal: 540 }] } },
    });
    const pp4Subtotal = 10 * 52;
    await tx.pedidoPortal.create({
      data: { empresaId, numero: 'PP-00004', clienteId: cliNorte.id, estado: 'RECHAZADO', motivoRechazo: 'Producto sin stock disponible', subtotal: pp4Subtotal, igv: Math.round(pp4Subtotal * 0.18 * 100) / 100, total: pp4Subtotal * 1.18,
        items: { create: [{ productoId: limpGuantes.id, cantidad: 10, precioUnitario: 52, subtotal: 520 }] } },
    });
    const pp5Subtotal = 2 * 2800 + 10 * 85;
    await tx.pedidoPortal.create({
      data: { empresaId, numero: 'PP-00005', clienteId: cliLima.id, estado: 'CONVERTIDO', despachoId: desp8.id, subtotal: pp5Subtotal, igv: Math.round(pp5Subtotal * 0.18 * 100) / 100, total: pp5Subtotal * 1.18,
        items: { create: [
          { productoId: elecLaptop.id, cantidad: 2,  precioUnitario: 2800, subtotal: 5600 },
          { productoId: elecMouse.id,  cantidad: 10, precioUnitario: 85,   subtotal: 850 },
        ] } },
    });

    // ══════════════════════════════════════════════════════════════════════
    // PEDIDOS INTERNOS (7 — una por cada EstadoPedidoInterno, ENTREGADO x2
    // para cubrir reciboConfirmado true/false)
    // ══════════════════════════════════════════════════════════════════════
    if (usrSolicitante && usrAdmin && usrAlmacenero) {
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00001', areaId: areaSis.id, almacenId: almCentral.id, estado: 'BORRADOR', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id,
          items: { create: [{ productoId: elecCargador.id, cantidad: 5 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00002', areaId: areaOps.id, almacenId: almCentral.id, estado: 'ENVIADO', prioridad: 'URGENTE', usuarioSolicitaId: usrSolicitante.id, fechaRequerida: dias(3),
          items: { create: [{ productoId: limpDesinfectante.id, cantidad: 10 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00003', areaId: areaAdm.id, almacenId: almCentral.id, estado: 'APROBADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, fechaAprobacion: dias(-1),
          items: { create: [{ productoId: ofiResma.id, cantidad: 20 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00004', areaId: areaOps.id, almacenId: almCentral.id, estado: 'PICKING', prioridad: 'CRITICO', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, fechaAprobacion: dias(-1),
          items: { create: [{ productoId: elecTeclado.id, cantidad: 3 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00005', areaId: areaSis.id, almacenId: almCentral.id, estado: 'ENTREGADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
          fechaAprobacion: dias(-3), fechaEntrega: dias(-2), reciboConfirmado: true, fechaReciboConfirmado: dias(-1),
          items: { create: [{ productoId: elecCargador.id, cantidad: 8 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00006', areaId: areaOps.id, almacenId: almCentral.id, estado: 'ENTREGADO', prioridad: 'URGENTE', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
          fechaAprobacion: dias(-2), fechaEntrega: dias(-1), reciboConfirmado: false,
          items: { create: [{ productoId: ofiGrapadora.id, cantidad: 4 }] } },
      });
      await tx.pedidoInterno.create({
        data: { empresaId, numero: 'PI-00007', areaId: areaAdm.id, almacenId: almCentral.id, estado: 'RECHAZADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, motivoRechazo: 'Presupuesto no disponible este mes',
          items: { create: [{ productoId: elecMonitor.id, cantidad: 2 }] } },
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // GESTIÓN DE PEDIDOS POR PROYECTO (Fase 4, 2026-09-04) — alimenta el
    // reporte "Consumo por Proyecto". 3 CDR y 4 Proyectos (uno CERRADO) de
    // clientes contratantes + pedidos internos de proyecto ENTREGADOS que
    // generan SALIDA valorizada (con proyectoId + pedidoInternoId en el
    // Movimiento, igual que hace PedidosInternosService.entregar), repartidos
    // en 3 meses (julio/agosto/septiembre) para que "Comparativo mensual"
    // tenga 3 barras, más 3 pedidos abiertos como "pendientes por despachar".
    // Septiembre en curso: S/ 15,130 en 4 movimientos.
    // ══════════════════════════════════════════════════════════════════════
    if (usrSolicitante && usrAdmin && usrAlmacenero) {
      const [cdrMina, cdrObras] = await Promise.all([
        tx.cDR.create({ data: { empresaId, codigo: 'CDR-MINA',  nombre: 'Gerencia de Mina',        responsable: 'Ing. Residente de Mina' } }),
        tx.cDR.create({ data: { empresaId, codigo: 'CDR-OBRAS', nombre: 'Gerencia Obras Civiles', responsable: 'Ing. Residente de Obras' } }),
      ]);
      const [pryBocamina, pryTajo] = await Promise.all([
        tx.proyecto.create({ data: { empresaId, codigo: 'PRY-02', nombre: 'AMPLIACION DE AVANCES BOCAMINA NORTE', cdrId: cdrMina.id,  clienteId: cliAndes.id, estado: 'EN_EJECUCION', fechaInicio: dias(-45) } }),
        tx.proyecto.create({ data: { empresaId, codigo: 'PRY-01', nombre: 'Ampliacion Tajo Norte',                cdrId: cdrObras.id, clienteId: cliAndes.id, estado: 'EN_EJECUCION', fechaInicio: dias(-60) } }),
      ]);

      // Réplica del efecto de PedidosInternosService.entregar(): descuenta
      // inventario y deja una SALIDA valorizada trazada al pedido y al proyecto.
      const consumoProyecto = async (
        productoId: string, cantidad: number, costoUnitario: number,
        proyectoId: string, pedidoInternoId: string, numeroPedido: string, fecha: Date,
      ) => {
        const inv = await tx.inventario.findFirst({ where: { productoId, almacenId: almCentral.id, ubicacionId: null } });
        if (inv) await tx.inventario.update({ where: { id: inv.id }, data: { cantidad: { decrement: cantidad } } });
        await tx.movimiento.create({
          data: {
            empresaId, productoId, almacenId: almCentral.id, tipo: 'SALIDA', cantidad, costoUnitario,
            motivo: 'Entrega de pedido interno de proyecto', documento: numeroPedido,
            proyectoId, pedidoInternoId, fecha,
          },
        });
      };

      // PI-00008 · PRY-02 · Operaciones · ENTREGADO — 1 salida de S/ 15,000
      const pi8 = await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00008', areaId: areaOps.id, almacenId: almCentral.id, proyectoId: pryBocamina.id,
          estado: 'ENTREGADO', prioridad: 'URGENTE', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
          fechaAprobacion: dias(-3), fechaEntrega: dias(-2), reciboConfirmado: true, fechaReciboConfirmado: dias(-1),
          notasSolicitud: 'Insumos para el frente de avance de bocamina norte',
          items: { create: [{ productoId: elecSSD.id, cantidad: 100 }] },
        },
      });
      await consumoProyecto(elecSSD.id, 100, 150, pryBocamina.id, pi8.id, pi8.numero, dias(-2));

      // PI-00009 · PRY-01 · Operaciones · ENTREGADO — 1 salida de S/ 40
      const pi9 = await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00009', areaId: areaOps.id, almacenId: almCentral.id, proyectoId: pryTajo.id,
          estado: 'ENTREGADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
          fechaAprobacion: dias(-4), fechaEntrega: dias(-3), reciboConfirmado: true, fechaReciboConfirmado: dias(-2),
          notasSolicitud: 'Material de escritorio para la caseta de obra del tajo norte',
          items: { create: [{ productoId: ofiLapicero.id, cantidad: 5 }] },
        },
      });
      await consumoProyecto(ofiLapicero.id, 5, 8, pryTajo.id, pi9.id, pi9.numero, dias(-3));

      // PI-00010 · PRY-01 · Administración · PICKING — pendiente por despachar
      await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00010', areaId: areaAdm.id, almacenId: almCentral.id, proyectoId: pryTajo.id,
          estado: 'PICKING', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id,
          fechaAprobacion: dias(-1),
          notasSolicitud: 'Reposición de útiles para la oficina técnica del proyecto',
          items: { create: [{ productoId: ofiResma.id, cantidad: 10 }, { productoId: ofiLapicero.id, cantidad: 3 }] },
        },
      });

      // PI-00011 · PRY-01 · Administración · ENTREGADO — 2 salidas por S/ 90 (50 + 40)
      const pi11 = await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00011', areaId: areaAdm.id, almacenId: almCentral.id, proyectoId: pryTajo.id,
          estado: 'ENTREGADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
          fechaAprobacion: dias(-5), fechaEntrega: dias(-4), reciboConfirmado: false,
          notasSolicitud: 'Papelería para el cierre documentario de la valorización mensual',
          items: { create: [{ productoId: ofiResma.id, cantidad: 5 }, { productoId: ofiLapicero.id, cantidad: 5 }] },
        },
      });
      await consumoProyecto(ofiResma.id,    5, 10, pryTajo.id, pi11.id, pi11.numero, dias(-4));
      await consumoProyecto(ofiLapicero.id, 5,  8, pryTajo.id, pi11.id, pi11.numero, dias(-4));

      // ── Historial de 3 meses (backfill julio/agosto) ───────────────────
      // 1 CDR y 2 proyectos más (uno CERRADO) + una tanda de pedidos
      // ENTREGADOS repartidos por mes, para dar volumen al comparativo
      // mensual y a las vistas Por Proyecto / Por CDR / Por Área.
      const cdrPlanta = await tx.cDR.create({ data: { empresaId, codigo: 'CDR-PLANTA', nombre: 'Gerencia de Planta', responsable: 'Jefe de Mantenimiento' } });
      const [pryPlanta, pryCampamento] = await Promise.all([
        tx.proyecto.create({ data: { empresaId, codigo: 'PRY-03', nombre: 'Mantenimiento Planta Concentradora', cdrId: cdrPlanta.id, clienteId: cliSur.id,   estado: 'EN_EJECUCION', fechaInicio: dias(-80) } }),
        tx.proyecto.create({ data: { empresaId, codigo: 'PRY-04', nombre: 'Habilitacion Campamento Km 12',       cdrId: cdrObras.id,  clienteId: cliNorte.id, estado: 'CERRADO',      fechaInicio: dias(-110), fechaFin: dias(-20) } }),
      ]);

      // Día fijo de un mes N meses atrás (mediodía; sin aritmética de días que
      // cruce fin de mes).
      const fechaMes = (mesesAtras: number, dia: number) =>
        new Date(ahora.getFullYear(), ahora.getMonth() - mesesAtras, dia, 12, 0, 0);

      const backfill: Array<{
        numero: string; proyectoId: string; areaId: string; mesesAtras: number; dia: number;
        prioridad: 'NORMAL' | 'URGENTE' | 'CRITICO'; nota: string;
        items: Array<{ productoId: string; cantidad: number; costoUnitario: number }>;
      }> = [
        // ── Julio ──
        { numero: 'PI-00012', proyectoId: pryBocamina.id,   areaId: areaOps.id, mesesAtras: 2, dia: 8,  prioridad: 'URGENTE', nota: 'Suministros para el frente de avance — quincena 1',
          items: [{ productoId: ofiPostit.id, cantidad: 40, costoUnitario: 28 }, { productoId: elecCargador.id, cantidad: 8, costoUnitario: 62 }] },
        { numero: 'PI-00013', proyectoId: pryTajo.id,       areaId: areaAdm.id, mesesAtras: 2, dia: 12, prioridad: 'NORMAL', nota: 'Papelería para la oficina técnica del tajo',
          items: [{ productoId: ofiResma.id, cantidad: 25, costoUnitario: 12 }, { productoId: ofiLapicero.id, cantidad: 12, costoUnitario: 9 }] },
        { numero: 'PI-00014', proyectoId: pryPlanta.id,     areaId: areaOps.id, mesesAtras: 2, dia: 17, prioridad: 'NORMAL', nota: 'Limpieza industrial para parada de planta',
          items: [{ productoId: limpDesinfectante.id, cantidad: 22, costoUnitario: 22 }, { productoId: limpDetergente.id, cantidad: 5, costoUnitario: 80 }] },
        { numero: 'PI-00015', proyectoId: pryBocamina.id,   areaId: areaOps.id, mesesAtras: 2, dia: 23, prioridad: 'URGENTE', nota: 'Repuestos y consumibles — quincena 2',
          items: [{ productoId: elecSSD.id, cantidad: 10, costoUnitario: 135 }, { productoId: ofiPostit.id, cantidad: 30, costoUnitario: 27 }] },
        { numero: 'PI-00016', proyectoId: pryCampamento.id, areaId: areaAdm.id, mesesAtras: 2, dia: 26, prioridad: 'NORMAL', nota: 'Habilitación de módulos administrativos',
          items: [{ productoId: ofiResma.id, cantidad: 20, costoUnitario: 13 }, { productoId: ofiLapicero.id, cantidad: 10, costoUnitario: 8 }] },
        { numero: 'PI-00017', proyectoId: pryPlanta.id,     areaId: areaSis.id, mesesAtras: 2, dia: 29, prioridad: 'NORMAL', nota: 'Equipamiento para la sala de control',
          items: [{ productoId: elecCargador.id, cantidad: 9, costoUnitario: 60 }, { productoId: limpLejia.id, cantidad: 10, costoUnitario: 19 }] },
        // ── Agosto ──
        { numero: 'PI-00018', proyectoId: pryBocamina.id,   areaId: areaOps.id, mesesAtras: 1, dia: 5,  prioridad: 'URGENTE', nota: 'Suministros para el frente de avance — quincena 1',
          items: [{ productoId: ofiPostit.id, cantidad: 45, costoUnitario: 28 }, { productoId: elecCargador.id, cantidad: 8, costoUnitario: 61 }] },
        { numero: 'PI-00019', proyectoId: pryTajo.id,       areaId: areaAdm.id, mesesAtras: 1, dia: 9,  prioridad: 'NORMAL', nota: 'Papelería para la oficina técnica del tajo',
          items: [{ productoId: ofiResma.id, cantidad: 22, costoUnitario: 12 }, { productoId: ofiLapicero.id, cantidad: 12, costoUnitario: 9 }] },
        { numero: 'PI-00020', proyectoId: pryPlanta.id,     areaId: areaOps.id, mesesAtras: 1, dia: 14, prioridad: 'NORMAL', nota: 'Limpieza industrial — mantenimiento programado',
          items: [{ productoId: limpDesinfectante.id, cantidad: 26, costoUnitario: 23 }, { productoId: limpDetergente.id, cantidad: 6, costoUnitario: 79 }] },
        { numero: 'PI-00021', proyectoId: pryBocamina.id,   areaId: areaOps.id, mesesAtras: 1, dia: 19, prioridad: 'URGENTE', nota: 'Repuestos y consumibles — quincena 2',
          items: [{ productoId: elecSSD.id, cantidad: 12, costoUnitario: 132 }, { productoId: ofiPostit.id, cantidad: 35, costoUnitario: 28 }] },
        { numero: 'PI-00022', proyectoId: pryCampamento.id, areaId: areaAdm.id, mesesAtras: 1, dia: 22, prioridad: 'NORMAL', nota: 'Cierre de habilitación del campamento',
          items: [{ productoId: ofiResma.id, cantidad: 24, costoUnitario: 13 }, { productoId: ofiLapicero.id, cantidad: 10, costoUnitario: 8 }] },
        { numero: 'PI-00023', proyectoId: pryPlanta.id,     areaId: areaSis.id, mesesAtras: 1, dia: 27, prioridad: 'NORMAL', nota: 'Ampliación de la sala de control',
          items: [{ productoId: elecCargador.id, cantidad: 10, costoUnitario: 60 }, { productoId: limpLejia.id, cantidad: 12, costoUnitario: 19 }] },
      ];
      for (const pi of backfill) {
        const cab = await tx.pedidoInterno.create({
          data: {
            empresaId, numero: pi.numero, areaId: pi.areaId, almacenId: almCentral.id, proyectoId: pi.proyectoId,
            estado: 'ENTREGADO', prioridad: pi.prioridad,
            usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, usuarioEntregaId: usrAlmacenero.id,
            fechaAprobacion: fechaMes(pi.mesesAtras, pi.dia - 2),
            fechaEntrega: fechaMes(pi.mesesAtras, pi.dia),
            reciboConfirmado: true, fechaReciboConfirmado: fechaMes(pi.mesesAtras, pi.dia + 1),
            notasSolicitud: pi.nota,
            items: { create: pi.items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })) },
          },
        });
        for (const it of pi.items) {
          await consumoProyecto(it.productoId, it.cantidad, it.costoUnitario, pi.proyectoId, cab.id, cab.numero, fechaMes(pi.mesesAtras, pi.dia));
        }
      }

      // Dos pendientes más del mes en curso (además de PI-00010) para que
      // "Pendientes por despachar" no se vea con un único registro.
      await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00024', areaId: areaOps.id, almacenId: almCentral.id, proyectoId: pryPlanta.id,
          estado: 'PICKING', prioridad: 'URGENTE', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, fechaAprobacion: dias(-2),
          notasSolicitud: 'Insumos de limpieza para la próxima parada de planta',
          items: { create: [{ productoId: ofiPostit.id, cantidad: 20 }, { productoId: limpDesinfectante.id, cantidad: 10 }] },
        },
      });
      await tx.pedidoInterno.create({
        data: {
          empresaId, numero: 'PI-00025', areaId: areaOps.id, almacenId: almCentral.id, proyectoId: pryBocamina.id,
          estado: 'APROBADO', prioridad: 'NORMAL', usuarioSolicitaId: usrSolicitante.id, usuarioApruebaId: usrAdmin.id, fechaAprobacion: dias(-1),
          notasSolicitud: 'Repuestos para el frente de avance — pendiente de picking',
          items: { create: [{ productoId: elecSSD.id, cantidad: 6 }, { productoId: elecCargador.id, cantidad: 8 }] },
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // OPORTUNIDADES COMERCIALES (16) — módulo Seguimiento Comercial (Fase 10).
    // Cubre las 4 etapas abiertas del pipeline + cierres GANADA / PERDIDA /
    // CANCELADA, repartidas entre 4 vendedores (Admin, Ejecutivo Comercial,
    // Carla y Gerente de Operaciones) para poblar también "Rendimiento por
    // vendedor" con casos contrastados: ganadas y perdidas por vendedor,
    // conversión distinta por persona, y un vendedor (Gerente) solo con
    // pipeline. Semáforo de seguimiento variado: sin actividad / al día /
    // 3-5 días / 12 días sin seguimiento. Se usan las 7 empresas cliente y
    // toda la gama de `fuente` y de `TipoActividadComercial`. Los campos
    // denormalizados (fechaUltimaActividad / proximaAccion / fechaProximaAccion)
    // se fijan a mano acá porque las actividades se siembran directo, sin pasar
    // por OportunidadesService.registrarActividad.
    // ══════════════════════════════════════════════════════════════════════
    const [usrComercial, usrCarla, usrGerente] = await Promise.all([
      tx.usuario.findFirst({ where: { empresaId, email: 'comercial@dlnorte.demo' } }),
      tx.usuario.findFirst({ where: { empresaId, email: 'comercial2@dlnorte.demo' } }),
      tx.usuario.findFirst({ where: { empresaId, email: 'gerente@dlnorte.demo' } }),
    ]);
    if (usrAdmin && usrComercial && usrCarla) {
      // Metas mensuales: Carla la supera (S/ 1,000 vs S/ 7,500 ganados este
      // mes → verde), el Ejecutivo no la alcanza (S/ 5,000 vs S/ 3,400 → rojo),
      // y Admin / Gerente quedan "Sin meta" — el ranking muestra los 3 casos.
      await tx.usuario.update({ where: { id: usrCarla.id }, data: { metaVentasMensual: 1000 } });
      await tx.usuario.update({ where: { id: usrComercial.id }, data: { metaVentasMensual: 5000 } });

      // ── OP-00001 · GANADA (Admin) — cerrada hace 5 días, dentro del mes ──
      const opGanada = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00001', clienteId: cliNorte.id, responsableId: usrAdmin.id,
          estado: 'GANADA', probabilidad: 100, valorEstimado: 52000,
          descripcion: 'Servicio de distribución mensual a 8 sucursales en el norte del país',
          necesidad: 'Tercerizar el reparto con entregas dos veces por semana y SLA de 24 h',
          fuente: 'Referido', fechaEstimadaCierre: dias(-3), fechaCierre: dias(-5),
          fechaUltimaActividad: dias(-6),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opGanada.id, usuarioId: usrAdmin.id, tipo: 'REUNION',            fecha: dias(-20), resultado: 'Reunión inicial: se levantó el requerimiento de reparto y los volúmenes por sucursal.' },
          { oportunidadId: opGanada.id, usuarioId: usrAdmin.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-12), resultado: 'Se envió la propuesta con tarifa por punto de entrega y SLA comprometido.' },
          { oportunidadId: opGanada.id, usuarioId: usrAdmin.id, tipo: 'NEGOCIACION',         fecha: dias(-6),  resultado: 'Ajuste de tarifa por volumen; el cliente confirmó la adjudicación.' },
        ],
      });

      // ── OP-00002 · EN NEGOCIACIÓN (Admin) — al día ──────────────────────
      const opNego = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00002', clienteId: cliSur.id, responsableId: usrAdmin.id,
          estado: 'EN_NEGOCIACION', probabilidad: 80, valorEstimado: 13200,
          descripcion: 'Requiere traslado de dos toneladas de insumos entre planta y almacén central',
          necesidad: 'Flete recurrente semanal con unidad de 3 t y maniobras de carga incluidas',
          fuente: 'Cliente recurrente', fechaEstimadaCierre: dias(7),
          fechaUltimaActividad: dias(-1), proximaAccion: 'Visita a instalaciones', fechaProximaAccion: dias(3),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opNego.id, usuarioId: usrAdmin.id, tipo: 'LLAMADA',            fecha: dias(-8), resultado: 'El cliente pidió cotización formal para un flete recurrente.' },
          { oportunidadId: opNego.id, usuarioId: usrAdmin.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-4), resultado: 'Propuesta enviada; el cliente solicitó revisar el precio por maniobras.' },
          { oportunidadId: opNego.id, usuarioId: usrAdmin.id, tipo: 'NEGOCIACION',        fecha: dias(-1), resultado: 'Acuerdo verbal sobre la tarifa; pendiente la visita para cerrar condiciones.', proximaAccion: 'Visita a instalaciones', fechaProximaAccion: dias(3) },
        ],
      });

      // ── OP-00003 · CALIFICADA (Admin) — 5 días sin seguimiento ──────────
      const opCalif = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00003', clienteId: cliSur.id, responsableId: usrAdmin.id,
          estado: 'CALIFICADA', probabilidad: 30, valorEstimado: 6000,
          descripcion: 'Importación de escobillas de carbón 2/4" x 0.5" para motores de aspiradoras industriales',
          necesidad: 'Lote de prueba de 500 unidades con posibilidad de compra recurrente',
          fuente: 'Página web', fechaEstimadaCierre: dias(25),
          fechaUltimaActividad: dias(-5), proximaAccion: 'Reunión en línea', fechaProximaAccion: dias(2),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opCalif.id, usuarioId: usrAdmin.id, tipo: 'EMAIL',   fecha: dias(-9), resultado: 'El cliente detalló la especificación técnica de la escobilla y el consumo mensual.' },
          { oportunidadId: opCalif.id, usuarioId: usrAdmin.id, tipo: 'LLAMADA',  fecha: dias(-5), resultado: 'Se confirmó necesidad real y presupuesto; queda coordinar la reunión para presentar la propuesta.', proximaAccion: 'Reunión en línea', fechaProximaAccion: dias(2) },
        ],
      });

      // ── OP-00004 · NUEVA (Ejecutivo Comercial) — sin actividad ──────────
      await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00004', clienteId: cliAndes.id, responsableId: usrComercial.id,
          estado: 'NUEVA', probabilidad: 10, valorEstimado: 12652,
          descripcion: 'Transporte de materiales de construcción a una obra en las afueras de la ciudad',
          necesidad: 'Dos viajes de volquete con material granular; fecha por confirmar',
          fuente: 'Llamada en frío', fechaEstimadaCierre: dias(18),
        },
      });

      // ── OP-00005 · NUEVA (Carla) — al día, con el primer seguimiento ────
      const opNueva5 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00005', clienteId: cliAndina.id, responsableId: usrCarla.id,
          estado: 'NUEVA', probabilidad: 10, valorEstimado: 16000,
          descripcion: 'Suministro de carbones para motores de scoop en operación minera',
          necesidad: 'Abastecimiento trimestral con entrega en mina; requiere ficha técnica y certificado',
          fuente: 'Feria / Evento', fechaEstimadaCierre: dias(30),
          fechaUltimaActividad: dias(-1), proximaAccion: 'Seguir el contacto', fechaProximaAccion: dias(4),
        },
      });
      await tx.actividadComercial.create({
        data: { oportunidadId: opNueva5.id, usuarioId: usrCarla.id, tipo: 'WHATSAPP', fecha: dias(-1), resultado: 'Primer contacto tras la feria; el cliente pidió la ficha técnica y algunas referencias.', proximaAccion: 'Seguir el contacto', fechaProximaAccion: dias(4) },
      });

      // ── OP-00006 · COTIZADA (Carla) — al día ────────────────────────────
      const opCotiz = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00006', clienteId: cliPacifico.id, responsableId: usrCarla.id,
          estado: 'COTIZADA', probabilidad: 60, valorEstimado: 2800,
          descripcion: 'Transporte de tres toneladas de productos terminados a un centro de distribución',
          necesidad: 'Servicio puntual con recojo en planta y entrega el mismo día',
          fuente: 'Referido', fechaEstimadaCierre: dias(10),
          fechaUltimaActividad: dias(-2), proximaAccion: 'Llamada de cierre', fechaProximaAccion: dias(1),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opCotiz.id, usuarioId: usrCarla.id, tipo: 'LLAMADA',            fecha: dias(-6), resultado: 'El cliente detalló el volumen y la ventana de entrega requerida.' },
          { oportunidadId: opCotiz.id, usuarioId: usrCarla.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-2), resultado: 'Cotización enviada; el cliente la está evaluando y responde esta semana.', proximaAccion: 'Llamada de cierre', fechaProximaAccion: dias(1) },
        ],
      });

      // ── OP-00007 · PERDIDA (Ejecutivo Comercial) — cerrada hace 8 días ──
      const opPerdida7 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00007', clienteId: cliConstructor.id, responsableId: usrComercial.id,
          estado: 'PERDIDA', probabilidad: 0, valorEstimado: 4200,
          descripcion: 'Reparto quincenal de material de ferretería a tres tiendas de la ciudad',
          necesidad: 'Distribución con unidad ligera y ventana de entrega antes de las 9 a. m.',
          fuente: 'Página web', fechaEstimadaCierre: dias(-10), fechaCierre: dias(-8),
          motivoPerdida: 'Precio no competitivo', fechaUltimaActividad: dias(-9),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opPerdida7.id, usuarioId: usrComercial.id, tipo: 'LLAMADA',            fecha: dias(-18), resultado: 'El cliente describió el circuito de reparto y los horarios de recepción de cada tienda.' },
          { oportunidadId: opPerdida7.id, usuarioId: usrComercial.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-13), resultado: 'Se envió la propuesta con tarifa por punto de entrega.' },
          { oportunidadId: opPerdida7.id, usuarioId: usrComercial.id, tipo: 'NEGOCIACION',         fecha: dias(-9),  resultado: 'El cliente adjudicó el servicio a otro proveedor con una tarifa 15 % menor.' },
        ],
      });

      // ── OP-00008 · PERDIDA (Admin) — cerrada hace 15 días ──────────────
      const opPerdida8 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00008', clienteId: cliLima.id, responsableId: usrAdmin.id,
          estado: 'PERDIDA', probabilidad: 0, valorEstimado: 9800,
          descripcion: 'Transporte de maquinaria menor entre dos sedes del cliente en Lima',
          necesidad: 'Servicio con plataforma y maniobras de izaje; fecha única',
          fuente: 'Referido', fechaEstimadaCierre: dias(-12), fechaCierre: dias(-15),
          motivoPerdida: 'El cliente pospuso el proyecto', fechaUltimaActividad: dias(-16),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opPerdida8.id, usuarioId: usrAdmin.id, tipo: 'REUNION',            fecha: dias(-28), resultado: 'Se relevó el detalle de la maquinaria, pesos y accesos a cada sede.' },
          { oportunidadId: opPerdida8.id, usuarioId: usrAdmin.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-20), resultado: 'Propuesta enviada con plataforma cama baja y cuadrilla de maniobras.' },
          { oportunidadId: opPerdida8.id, usuarioId: usrAdmin.id, tipo: 'EMAIL',              fecha: dias(-16), resultado: 'El cliente comunicó que congeló la inversión y el traslado queda sin fecha.' },
        ],
      });

      // ── OP-00009 · GANADA (Carla) — cerrada este mes, supera su meta ───
      const opGanada9 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00009', clienteId: cliAndina.id, responsableId: usrCarla.id,
          estado: 'GANADA', probabilidad: 100, valorEstimado: 7500,
          descripcion: 'Traslado mensual de repuestos desde el almacén central a la unidad minera',
          necesidad: 'Dos entregas al mes en mina con manifiesto y seguimiento GPS',
          fuente: 'Feria / Evento', fechaEstimadaCierre: dias(-2), fechaCierre: dias(-4),
          fechaUltimaActividad: dias(-4),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opGanada9.id, usuarioId: usrCarla.id, tipo: 'VISITA',             fecha: dias(-16), resultado: 'Visita al almacén del cliente para dimensionar volúmenes y frecuencia.' },
          { oportunidadId: opGanada9.id, usuarioId: usrCarla.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-10), resultado: 'Propuesta con tarifa mensual cerrada y ventana de entrega garantizada.' },
          { oportunidadId: opGanada9.id, usuarioId: usrCarla.id, tipo: 'NEGOCIACION',         fecha: dias(-4),  resultado: 'El cliente aceptó la tarifa y firmó la orden de servicio.' },
        ],
      });

      // ── OP-00010 · GANADA (Ejecutivo Comercial) — cerrada este mes ─────
      const opGanada10 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00010', clienteId: cliPacifico.id, responsableId: usrComercial.id,
          estado: 'GANADA', probabilidad: 100, valorEstimado: 3400,
          descripcion: 'Servicio puntual de transporte de producto terminado a feria comercial',
          necesidad: 'Recojo en planta y entrega el mismo día en el recinto ferial',
          fuente: 'Llamada en frío', fechaEstimadaCierre: dias(-9), fechaCierre: dias(-10),
          fechaUltimaActividad: dias(-10),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opGanada10.id, usuarioId: usrComercial.id, tipo: 'WHATSAPP',           fecha: dias(-15), resultado: 'El cliente pidió cotización rápida para un traslado con fecha fija.' },
          { oportunidadId: opGanada10.id, usuarioId: usrComercial.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-12), resultado: 'Cotización enviada el mismo día; el cliente confirmó por correo.' },
        ],
      });

      // ── OP-00011 · GANADA (Admin) — cerrada el mes pasado ─────────────
      // Suma al "Valor ganado" acumulado y a la conversión, pero NO al
      // "Valor ganado del mes" del ranking (fechaCierre < inicio de mes).
      const opGanada11 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00011', clienteId: cliSur.id, responsableId: usrAdmin.id,
          estado: 'GANADA', probabilidad: 100, valorEstimado: 21000,
          descripcion: 'Contrato trimestral de distribución de insumos a cuatro plantas del grupo',
          necesidad: 'Ruta fija tres veces por semana con SLA de 24 h y reporte semanal',
          fuente: 'Cliente recurrente', fechaEstimadaCierre: dias(-35), fechaCierre: dias(-38),
          fechaUltimaActividad: dias(-38),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opGanada11.id, usuarioId: usrAdmin.id, tipo: 'REUNION',            fecha: dias(-55), resultado: 'Reunión con el área de logística del grupo para definir alcance y volúmenes.' },
          { oportunidadId: opGanada11.id, usuarioId: usrAdmin.id, tipo: 'VIDEOLLAMADA',       fecha: dias(-48), resultado: 'Revisión de rutas y puntos de entrega con los jefes de planta.' },
          { oportunidadId: opGanada11.id, usuarioId: usrAdmin.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-44), resultado: 'Propuesta trimestral enviada con escalonamiento por volumen.' },
          { oportunidadId: opGanada11.id, usuarioId: usrAdmin.id, tipo: 'NEGOCIACION',         fecha: dias(-38), resultado: 'Se cerró el contrato tras ajustar el reporte semanal solicitado.' },
        ],
      });

      // ── OP-00013 · CALIFICADA (Carla) — al día ────────────────────────
      const opCalif13 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00013', clienteId: cliConstructor.id, responsableId: usrCarla.id,
          estado: 'CALIFICADA', probabilidad: 30, valorEstimado: 5600,
          descripcion: 'Abastecimiento de escobillas y carbones para el taller de mantenimiento del cliente',
          necesidad: 'Compra recurrente mensual con stock de seguridad en el almacén del proveedor',
          fuente: 'LinkedIn', fechaEstimadaCierre: dias(22),
          fechaUltimaActividad: dias(-2), proximaAccion: 'Enviar propuesta', fechaProximaAccion: dias(3),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opCalif13.id, usuarioId: usrCarla.id, tipo: 'EMAIL',   fecha: dias(-6), resultado: 'El cliente compartió el listado de referencias y el consumo histórico.' },
          { oportunidadId: opCalif13.id, usuarioId: usrCarla.id, tipo: 'LLAMADA',  fecha: dias(-2), resultado: 'Se confirmó presupuesto y periodicidad; queda preparar la propuesta formal.', proximaAccion: 'Enviar propuesta', fechaProximaAccion: dias(3) },
        ],
      });

      // ── OP-00014 · COTIZADA (Ejecutivo Comercial) — 3 días sin seguimiento ──
      const opCotiz14 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00014', clienteId: cliLima.id, responsableId: usrComercial.id,
          estado: 'COTIZADA', probabilidad: 60, valorEstimado: 8900,
          descripcion: 'Transporte semanal de mercadería paletizada a un centro de distribución en Lima',
          necesidad: 'Unidad de 3.5 t con estibadores; ventana de descarga de 6 a 8 a. m.',
          fuente: 'Referido', fechaEstimadaCierre: dias(12),
          fechaUltimaActividad: dias(-3), proximaAccion: 'Llamada de seguimiento', fechaProximaAccion: dias(1),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opCotiz14.id, usuarioId: usrComercial.id, tipo: 'LLAMADA',              fecha: dias(-9), resultado: 'El cliente detalló volúmenes semanales y restricciones de horario del CD.' },
          { oportunidadId: opCotiz14.id, usuarioId: usrComercial.id, tipo: 'COTIZACION_ENVIADA',   fecha: dias(-6), resultado: 'Cotización enviada con tarifa semanal y opción de unidad dedicada.' },
          { oportunidadId: opCotiz14.id, usuarioId: usrComercial.id, tipo: 'COTIZACION_MODIFICADA', fecha: dias(-3), resultado: 'El cliente pidió reemplazar la unidad dedicada por servicio compartido; se recalculó la tarifa.', proximaAccion: 'Llamada de seguimiento', fechaProximaAccion: dias(1) },
        ],
      });

      // ── OP-00016 · CANCELADA (Carla) — cerrada hace 6 días ────────────
      const opCancel16 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00016', clienteId: cliPacifico.id, responsableId: usrCarla.id,
          estado: 'CANCELADA', probabilidad: 0, valorEstimado: 3000,
          descripcion: 'Traslado único de mobiliario de oficina a la nueva sede del cliente',
          necesidad: 'Servicio con furgón y embalaje básico; fecha tentativa fin de mes',
          fuente: 'Feria / Evento', fechaEstimadaCierre: dias(-4), fechaCierre: dias(-6),
          observaciones: 'El cliente canceló la mudanza por una reestructuración interna; retomaría el próximo trimestre.',
          fechaUltimaActividad: dias(-7),
        },
      });
      await tx.actividadComercial.create({
        data: { oportunidadId: opCancel16.id, usuarioId: usrCarla.id, tipo: 'LLAMADA', fecha: dias(-7), resultado: 'El cliente avisó que se posterga la mudanza; se cierra la oportunidad sin costo.' },
      });
    }

    // ── Oportunidades del Gerente de Operaciones — solo pipeline, sin cierres.
    // Le dan presencia en "Rendimiento por vendedor" (abiertas + pipeline) sin
    // ganadas ni perdidas, para contrastar con los vendedores que ya cerraron.
    if (usrGerente) {
      // ── OP-00012 · EN NEGOCIACIÓN (Gerente) — 12 días sin seguimiento ──
      const opNego12 = await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00012', clienteId: cliNorte.id, responsableId: usrGerente.id,
          estado: 'EN_NEGOCIACION', probabilidad: 80, valorEstimado: 18500,
          descripcion: 'Operación logística tercerizada para la campaña de fin de año del distribuidor',
          necesidad: 'Refuerzo de flota por tres meses con coordinador dedicado en sitio',
          fuente: 'Cliente recurrente', fechaEstimadaCierre: dias(9),
          fechaUltimaActividad: dias(-12), proximaAccion: 'Retomar contacto — propuesta pendiente de respuesta', fechaProximaAccion: dias(-2),
        },
      });
      await tx.actividadComercial.createMany({
        data: [
          { oportunidadId: opNego12.id, usuarioId: usrGerente.id, tipo: 'REUNION',            fecha: dias(-25), resultado: 'Reunión de arranque: se dimensionó la campaña y el refuerzo de flota requerido.' },
          { oportunidadId: opNego12.id, usuarioId: usrGerente.id, tipo: 'VIDEOLLAMADA',       fecha: dias(-18), resultado: 'Revisión del plan de rutas y del perfil del coordinador en sitio.' },
          { oportunidadId: opNego12.id, usuarioId: usrGerente.id, tipo: 'COTIZACION_ENVIADA', fecha: dias(-12), resultado: 'Propuesta enviada por los tres meses; el cliente quedó de revisarla con gerencia.', proximaAccion: 'Retomar contacto — propuesta pendiente de respuesta', fechaProximaAccion: dias(-2) },
        ],
      });

      // ── OP-00015 · NUEVA (Gerente) — sin actividad ───────────────────
      await tx.oportunidad.create({
        data: {
          empresaId, codigo: 'OP-00015', clienteId: cliAndes.id, responsableId: usrGerente.id,
          estado: 'NUEVA', probabilidad: 10, valorEstimado: 6400,
          descripcion: 'Transporte de agregados a una obra vial en las afueras de la ciudad',
          necesidad: 'Cuatro viajes de volquete con material seleccionado; cronograma por definir',
          fuente: 'Llamada en frío', fechaEstimadaCierre: dias(20),
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // REGISTRO DE INCIDENCIAS (7) — módulo nuevo (2026-07-31). Simula errores
    // reales que HttpExceptionFilter habría capturado y persistido, con
    // variedad de severidad/módulo/estado para que el panel no se vea vacío
    // en la demo. usuarioNombre replica lo que arma el filtro real (email,
    // no nombre — ver http-exception.filter.ts).
    // ══════════════════════════════════════════════════════════════════════
    await Promise.all([
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAdmin?.id, usuarioNombre: usrAdmin?.email, modulo: 'despachos',
          opcion: 'POST /api/despachos', codigoError: 500, severidad: 'CRITICO',
          mensaje: 'Connection timeout to database',
          stackTrace: 'PrismaClientKnownRequestError: Connection timeout\n    at PrismaClient._request (prisma-client)\n    at DespachosService.create (despachos.service.ts:88)',
          contexto: { body: { clienteId: cliNorte.id, almacenId: almCentral.id }, query: {} },
          timestamp: dias(-4),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAlmacenero?.id, usuarioNombre: usrAlmacenero?.email, modulo: 'picking',
          opcion: 'PATCH /api/despachos/DESP-00003/picking/lin-x/confirmar', codigoError: 500, severidad: 'ALTO',
          mensaje: 'Invalid `tx.lineaPicking.update()` invocation: Record to update not found.',
          stackTrace: 'PrismaClientKnownRequestError: \n    at PickingService.confirmarLinea (picking.service.ts:115)',
          contexto: { body: { cantidad: 30 }, query: {} },
          timestamp: dias(-2),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAdmin?.id, usuarioNombre: usrAdmin?.email, modulo: 'productos',
          opcion: 'PUT /api/productos/elec-005', codigoError: 500, severidad: 'ALTO',
          mensaje: "Cannot read properties of null (reading 'precioVenta')",
          contexto: { body: { precioVenta: null }, query: {} },
          resuelto: true, notaResolucion: 'Se agregó validación en el DTO para rechazar precioVenta nulo antes de llegar al service.',
          timestamp: dias(-6),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAdmin?.id, usuarioNombre: usrAdmin?.email, modulo: 'reportes',
          opcion: 'GET /api/reportes/financiero', codigoError: 500, severidad: 'MEDIO',
          mensaje: 'Unexpected token u in JSON at position 0',
          contexto: { query: { desde: '2026-01-01', hasta: '2026-07-31' } },
          timestamp: dias(-1),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAdmin?.id, usuarioNombre: usrAdmin?.email, modulo: 'sunat',
          opcion: 'POST /api/sunat/DESP-00009/enviar', codigoError: 500, severidad: 'CRITICO',
          mensaje: 'ECONNREFUSED — no se pudo conectar al servicio de SUNAT',
          resuelto: true, notaResolucion: 'Certificado digital vencido — se renovó y quedó operativo.',
          timestamp: dias(-10),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAlmacenero?.id, usuarioNombre: usrAlmacenero?.email, modulo: 'configuracion',
          opcion: 'PATCH /api/configuracion', codigoError: 500, severidad: 'BAJO',
          mensaje: 'Cannot convert undefined or null to object',
          resuelto: true, notaResolucion: 'Campo opcional mal inicializado en el frontend — no afectaba datos guardados.',
          timestamp: dias(-8),
        },
      }),
      tx.registroIncidencia.create({
        data: {
          empresaId, usuarioId: usrAdmin?.id, usuarioNombre: usrAdmin?.email, modulo: 'inventario',
          opcion: 'POST /api/inventario/ajustes', codigoError: 500, severidad: 'MEDIO',
          mensaje: 'Invalid `tx.inventario.update()` invocation: An operation failed because it depends on one or more records that were required but not found.',
          contexto: { body: { productoId: elecMonitor.id, almacenId: almCentral.id, cantidad: -5 } },
          timestamp: dias(-3),
        },
      }),
    ]);

    // ── Sincronizar Producto.stockActual ────────────────────────────────────
    // Campo cacheado en Producto que algunas pantallas leen directo (ej.
    // Alertas.jsx: `p.stockActual <= 0` / `p.stockActual < p.stockMinimo`) en
    // vez de sumar Inventario — hay que mantenerlo sincronizado con el total
    // real después de todos los movimientos de arriba (stock inicial, OC
    // recibidas, despachos consumidos).
    const inventarios = await tx.inventario.findMany({ where: { producto: { empresaId } } });
    const totalPorProducto = new Map<string, number>();
    for (const inv of inventarios) {
      totalPorProducto.set(inv.productoId, (totalPorProducto.get(inv.productoId) ?? 0) + Number(inv.cantidad));
    }
    await Promise.all(
      Array.from(totalPorProducto.entries()).map(([productoId, cantidad]) =>
        tx.producto.update({ where: { id: productoId }, data: { stockActual: cantidad } }),
      ),
    );
  }
}
