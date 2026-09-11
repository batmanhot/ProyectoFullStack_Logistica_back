import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Mismo 18% que DespachosService usa para calcular Despacho.igv/total (ver
// `IGV_RATE` allá). Acá se re-declara porque `panoramaAlmacenes()` no tiene
// el IGV ya calculado por línea — DespachoItem solo guarda `subtotal` (sin
// impuesto), el IGV vive una sola vez a nivel de Despacho completo. Para que
// "Productos con más salida" sume EXACTO a "Despachos valorizados" (que sí
// usa `Despacho.total`, con IGV) hay que aplicarlo acá también.
const IGV_RATE = 0.18;

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replica Financiero.jsx — P&L mensual. Simplificaciones documentadas
   * (Fase 7b, decisión tomada sin bloquear en pregunta por ser de bajo riesgo):
   *   - Ingresos usan Producto.precioVenta ACTUAL (no histórico al momento
   *     de la venta) — igual que hacía el frontend original.
   *   - Costo de ventas usa Movimiento.costoUnitario REAL de cada salida
   *     (más preciso que el PMP por lotes del frontend viejo, que no es
   *     calculable porque LoteProducto no tiene campo de costo).
   *   - "Valor de inventario" usa Producto.precioCompra como proxy de costo,
   *     no un PMP ponderado por lotes.
   */
  async financiero(empresaId: string, meses = 6) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const hoy = new Date();
      const mesesData: Array<{
        mes: string;
        label: string;
        ingresos: number;
        costoVentas: number;
        comprasMes: number;
        devMes: number;
        margenBruto: number;
        margenPct: number;
      }> = [];

      for (let i = meses - 1; i >= 0; i--) {
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
        const clave = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
        const label = inicio.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).toUpperCase();

        const salidas = await tx.movimiento.findMany({
          where: { empresaId, tipo: 'SALIDA', fecha: { gte: inicio, lt: fin } },
          include: { producto: { select: { precioVenta: true } } },
        });
        const ingresos = salidas.reduce(
          (s, m) => s + Number(m.cantidad) * Number(m.producto.precioVenta ?? 0),
          0,
        );
        const costoVentas = salidas.reduce(
          (s, m) => s + Number(m.cantidad) * Number(m.costoUnitario ?? 0),
          0,
        );

        const ordenesAgg = await tx.ordenCompra.aggregate({
          where: {
            empresaId,
            fecha: { gte: inicio, lt: fin },
            estado: { in: ['APROBADA', 'RECIBIDA', 'PARCIAL'] },
          },
          _sum: { total: true },
        });
        const comprasMes = Number(ordenesAgg._sum.total ?? 0);

        const devolucionesMov = await tx.movimiento.findMany({
          where: { empresaId, tipo: 'DEVOLUCION', fecha: { gte: inicio, lt: fin } },
        });
        const devMes = devolucionesMov.reduce(
          (s, m) => s + Number(m.cantidad) * Number(m.costoUnitario ?? 0),
          0,
        );

        const margenBruto = ingresos - costoVentas - devMes;
        const margenPct = ingresos > 0 ? (margenBruto / ingresos) * 100 : 0;

        mesesData.push({ mes: clave, label, ingresos, costoVentas, comprasMes, devMes, margenBruto, margenPct });
      }

      const totalIngresos = mesesData.reduce((s, m) => s + m.ingresos, 0);
      const totalCosto = mesesData.reduce((s, m) => s + m.costoVentas, 0);
      const totalCompras = mesesData.reduce((s, m) => s + m.comprasMes, 0);
      const totalDev = mesesData.reduce((s, m) => s + m.devMes, 0);
      const margenBrutoTotal = totalIngresos - totalCosto - totalDev;
      const margenPctTotal = totalIngresos > 0 ? (margenBrutoTotal / totalIngresos) * 100 : 0;

      const mesActual = mesesData[mesesData.length - 1];
      const mesAnterior = mesesData[mesesData.length - 2];
      const tendenciaIngresos =
        mesAnterior && mesAnterior.ingresos > 0
          ? ((mesActual.ingresos - mesAnterior.ingresos) / mesAnterior.ingresos) * 100
          : null;

      const productos = await tx.producto.findMany({ where: { empresaId, estado: 'Activo' } });
      const valorInventario = productos.reduce(
        (s, p) => s + Number(p.stockActual) * Number(p.precioCompra ?? 0),
        0,
      );

      const topRentables = productos
        .filter((p) => p.precioVenta && Number(p.precioVenta) > 0)
        .map((p) => {
          const precioVenta = Number(p.precioVenta);
          const precioCompra = Number(p.precioCompra ?? 0);
          const margen = ((precioVenta - precioCompra) / precioVenta) * 100;
          return { id: p.id, sku: p.sku, nombre: p.nombre, precioCompra, precioVenta, margen };
        })
        .sort((a, b) => b.margen - a.margen)
        .slice(0, 5);

      return {
        meses: mesesData,
        totales: {
          totalIngresos,
          totalCosto,
          totalCompras,
          totalDev,
          margenBruto: margenBrutoTotal,
          margenPct: margenPctTotal,
        },
        tendenciaIngresos,
        valorInventario,
        topRentables,
      };
    });
  }

  /**
   * Replica KPIsOperativos.jsx. Simplificaciones documentadas (Fase 7b):
   *   - Tasa de error = Movimientos DEVOLUCION en el período / despachos
   *     ENTREGADO — Movimiento no referencia despachoId, así que no hay
   *     vínculo exacto despacho↔devolución como en el frontend viejo.
   *   - Lead time proveedor se deriva del último Movimiento ENTRADA con
   *     documento = orden.numero (no existe un campo fechaRecepcion dedicado).
   *   - "Rotación" usa valor de inventario ACTUAL, no un promedio histórico
   *     del período (no hay snapshots históricos de inventario).
   */
  async kpisOperativos(empresaId: string, dias = 30) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const hoy = new Date();
      const desde = new Date(hoy.getTime() - dias * 86400000);

      const despachosPeriodo = await tx.despacho.findMany({
        where: { empresaId, fecha: { gte: desde } },
        include: { cliente: { select: { razonSocial: true } } },
      });

      const desTotal = despachosPeriodo.length;
      const desCompletos = despachosPeriodo.filter((d) => d.estado === 'ENTREGADO');
      const desAnulados = despachosPeriodo.filter((d) => d.estado === 'CANCELADO').length;

      const fillRate = desTotal > 0 ? (desCompletos.length / desTotal) * 100 : 0;

      const conFechaCompromiso = desCompletos.filter((d) => d.fechaEntrega && d.fechaEntregado);
      const aTiempo = conFechaCompromiso.filter((d) => d.fechaEntregado! <= d.fechaEntrega!).length;
      const sinFecha = desCompletos.length - conFechaCompromiso.length; // sin penalidad (igual que el frontend real)
      const otif = desCompletos.length > 0 ? ((aTiempo + sinFecha) / desCompletos.length) * 100 : 0;

      const devolucionesPeriodo = await tx.movimiento.count({
        where: { empresaId, tipo: 'DEVOLUCION', fecha: { gte: desde } },
      });
      const tasaError = desCompletos.length > 0 ? (devolucionesPeriodo / desCompletos.length) * 100 : 0;

      const perfectOrder = (fillRate / 100) * (otif / 100) * (1 - tasaError / 100) * 100;

      const tiemposCiclo = desCompletos
        .filter((d) => d.fechaEntregado)
        .map((d) => Math.max(0, Math.round((d.fechaEntregado!.getTime() - d.fecha.getTime()) / 86400000)));
      const cycleTime =
        tiemposCiclo.length > 0 ? tiemposCiclo.reduce((s, t) => s + t, 0) / tiemposCiclo.length : null;

      const ordenesRecibidas = await tx.ordenCompra.findMany({
        where: { empresaId, estado: 'RECIBIDA', fecha: { gte: desde } },
      });
      const leadTimes: number[] = [];
      for (const oc of ordenesRecibidas) {
        const ultimoIngreso = await tx.movimiento.findFirst({
          where: { empresaId, tipo: 'ENTRADA', documento: oc.numero },
          orderBy: { fecha: 'desc' },
        });
        if (ultimoIngreso) {
          leadTimes.push(Math.max(0, Math.round((ultimoIngreso.fecha.getTime() - oc.fecha.getTime()) / 86400000)));
        }
      }
      const leadTimeAvg = leadTimes.length > 0 ? leadTimes.reduce((s, t) => s + t, 0) / leadTimes.length : null;

      const categorias = await tx.categoria.findMany({ where: { empresaId, estado: 'Activo' } });
      const rotacion: Array<{ categoria: string; rotacion: number }> = [];
      for (const cat of categorias) {
        const productosCat = await tx.producto.findMany({ where: { empresaId, categoriaId: cat.id } });
        const productoIds = productosCat.map((p) => p.id);
        if (productoIds.length === 0) continue;

        const salidasCat = await tx.movimiento.findMany({
          where: { empresaId, tipo: 'SALIDA', fecha: { gte: desde }, productoId: { in: productoIds } },
        });
        const costoVentasCat = salidasCat.reduce(
          (s, m) => s + Number(m.cantidad) * Number(m.costoUnitario ?? 0),
          0,
        );
        const valorInvCat = productosCat.reduce(
          (s, p) => s + Number(p.stockActual) * Number(p.precioCompra ?? 0),
          0,
        );
        const rot = valorInvCat > 0 ? costoVentasCat / valorInvCat : 0;
        if (rot > 0) rotacion.push({ categoria: cat.nombre, rotacion: Number(rot.toFixed(2)) });
      }
      rotacion.sort((a, b) => b.rotacion - a.rotacion);

      const semanas: Array<{ semana: string; pedidos: number; entregados: number; cancelados: number }> = [];
      for (let i = 7; i >= 0; i--) {
        const inicioSem = new Date(hoy.getTime() - (i + 1) * 7 * 86400000);
        const finSem = new Date(hoy.getTime() - i * 7 * 86400000);
        const desSem = await tx.despacho.findMany({
          where: { empresaId, createdAt: { gte: inicioSem, lt: finSem } },
        });
        semanas.push({
          semana: `S${8 - i}`,
          pedidos: desSem.length,
          entregados: desSem.filter((d) => d.estado === 'ENTREGADO').length,
          cancelados: desSem.filter((d) => d.estado === 'CANCELADO').length,
        });
      }

      const porCliente = new Map<string, { nombre: string; valor: number; pedidos: number }>();
      for (const d of desCompletos) {
        const actual = porCliente.get(d.clienteId) ?? { nombre: d.cliente.razonSocial, valor: 0, pedidos: 0 };
        actual.valor += Number(d.total);
        actual.pedidos += 1;
        porCliente.set(d.clienteId, actual);
      }
      const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 6);

      return {
        periodo: { dias, desde },
        fillRate,
        otif,
        tasaError,
        perfectOrder,
        cycleTime,
        leadTimeAvg,
        desTotal,
        desCompletos: desCompletos.length,
        desAnulados,
        devolucionesPeriodo,
        rotacionPorCategoria: rotacion,
        despachosPorSemana: semanas,
        topClientes,
      };
    });
  }

  /**
   * Torre de Control de Almacenes — una foto de supervisión por locación para quien
   * NO está en la operación diaria (Owner / Gerente de Operaciones).
   *
   * Simplificaciones deliberadas (mismo criterio que financiero/kpisOperativos):
   *   - Valor de inventario = Inventario.cantidad × Producto.precioCompra
   *     (proxy de costo, no PMP por lotes).
   *   - Criticidad solo se evalúa en productos con `stockMinimo > 0` — así una
   *     fila de Inventario en 0 de un producto que ese almacén nunca stockea
   *     no infla "agotados".
   *   - "Por vencer" cuenta productos con stock en el almacén cuyo lote vence
   *     en ≤30 días (incluye ya vencidos). LoteProducto no tiene almacenId,
   *     así que es una aproximación por producto, no por lote-en-almacén.
   */
  async panoramaAlmacenes(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const ahora = new Date();
      const hace7d = new Date(ahora.getTime() - 7 * 86400000);
      const limiteVenc = new Date(ahora.getTime() + 30 * 86400000);
      // Primer día del mes, 3 meses atrás (incluye el mes en curso) — ventana
      // de "continuidad del negocio" que mira el Owner.
      const desde3m = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1);
      // Primer día del mes EN CURSO — ventana de "Flujo de operación"
      // (distinta de `desde3m`: esa tarjeta muestra el mes calendario
      // vigente, no un acumulado de 3 meses; al día 1 de cada mes arranca
      // en cero a propósito, es "cuánto llevamos este mes").
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

      const [
        almacenes,
        inventario,
        movs7d,
        ultimaActividad,
        lotesPorVencer,
        despachos3m,
        entradasMes,
        listasPickingCompletadasMes,
        despachosMes,
        despachosPendientesAprobacion,
        pedidosInternosPendientesAprobacion,
        pedidosInternosEntregadosMes,
        movimientosConsumoInternoMes,
      ] = await Promise.all([
          tx.almacen.findMany({ where: { empresaId }, orderBy: { nombre: 'asc' } }),
          tx.inventario.findMany({
            where: { producto: { empresaId } },
            select: {
              almacenId: true,
              cantidad: true,
              cantidadReservada: true,
              producto: {
                select: { id: true, sku: true, nombre: true, precioCompra: true, stockMinimo: true, estado: true },
              },
            },
          }),
          tx.movimiento.groupBy({
            by: ['almacenId'],
            where: { empresaId, fecha: { gte: hace7d } },
            _count: { _all: true },
          }),
          tx.movimiento.groupBy({
            by: ['almacenId'],
            where: { empresaId },
            _max: { fecha: true },
          }),
          tx.loteProducto.findMany({
            where: { producto: { empresaId }, cantidadActual: { gt: 0 }, fechaVencimiento: { lte: limiteVenc } },
            select: { productoId: true },
          }),
          tx.despacho.findMany({
            where: { empresaId, estado: { not: 'CANCELADO' }, fecha: { gte: desde3m } },
            select: {
              fecha: true,
              total: true,
              clienteId: true,
              almacenId: true,
              cliente: { select: { razonSocial: true } },
              // "Productos con más salida" sale de las MISMAS líneas de
              // despacho que alimentan "Clientes más atendidos" y "Despachos
              // valorizados" — antes salía de Movimiento tipo=SALIDA, que
              // también junta pedidos internos entregados, salidas manuales
              // (merma/consumo interno) y devoluciones a proveedor, además
              // de valorizar a COSTO en vez de a precio de venta. Con esto
              // los tres paneles de "Continuidad del negocio" cuadran entre
              // sí: mismo universo de despachos a clientes, mismo período.
              items: {
                select: {
                  productoId: true,
                  cantidad: true,
                  subtotal: true,
                  producto: { select: { sku: true, nombre: true } },
                },
              },
            },
          }),
          // Flujo de Operación — "Recepción": entradas de mercadería por
          // almacén, mes calendario en curso (`inicioMes`, NO `desde3m`:
          // esta tarjeta es aparte de "Despachos valorizados", que sí sigue
          // siendo de 3 meses).
          tx.movimiento.groupBy({
            by: ['almacenId'],
            where: { empresaId, tipo: 'ENTRADA', fecha: { gte: inicioMes } },
            _count: { _all: true },
            _sum: { cantidad: true },
          }),
          // Flujo de Operación — "Picking": listas de picking COMPLETADA en
          // el mes en curso. ListaPicking no tiene almacenId propio (nace de
          // un Despacho — ver comentario del modelo en schema.prisma), se
          // llega al almacén vía `despacho.almacenId`.
          tx.listaPicking.findMany({
            where: { empresaId, estado: 'COMPLETADA', despacho: { fecha: { gte: inicioMes } } },
            select: { despacho: { select: { almacenId: true } } },
          }),
          // Flujo de Operación — "Despacho": despachos no anulados del mes en
          // curso, por almacén (distinto de `despachos3m`/`despachosPorAlmacen`,
          // que es la ventana de 3 meses de la otra tarjeta).
          tx.despacho.groupBy({
            by: ['almacenId'],
            where: { empresaId, estado: { not: 'CANCELADO' }, fecha: { gte: inicioMes } },
            _count: { _all: true },
          }),
          // Flujo de Operación — "Pendientes Aprobación": a diferencia de las
          // tres series anteriores (flujo DEL MES), esta es una FOTO del
          // backlog actual, sin filtro de fecha — Despachos en PEDIDO (aún no
          // pasan a APROBADO) y Pedidos Internos en ENVIADO (aún no pasan a
          // APROBADO), ambos con almacenId propio.
          tx.despacho.groupBy({
            by: ['almacenId'],
            where: { empresaId, estado: 'PEDIDO' },
            _count: { _all: true },
          }),
          tx.pedidoInterno.groupBy({
            by: ['almacenId'],
            where: { empresaId, estado: 'ENVIADO' },
            _count: { _all: true },
          }),
          // Flujo de Operación — "Pedidos Internos": flujo PARALELO a
          // Despacho (mismo criterio: documentos del mes en curso), pero de
          // salida a un área interna en vez de a un cliente. Se cuentan
          // PEDIDOS (documentos) entregados, no líneas — mismo criterio que
          // "Despacho" cuenta despachos, no items.
          tx.pedidoInterno.groupBy({
            by: ['almacenId'],
            where: { empresaId, estado: 'ENTREGADO', fechaEntrega: { gte: inicioMes } },
            _count: { _all: true },
          }),
          // Consumo interno del mes, valorizado a costo — de los Movimiento
          // SALIDA que entregar() genera por cada línea de Pedido Interno
          // (costoUnitario = Producto.precioCompra vigente al entregar, ver
          // PedidosInternosService.entregar). A propósito NO se suma a
          // `despachado3m`/"Despachos valorizados": ese número es ingreso a
          // precio de venta, esto es costo de consumo interno — mezclarlos
          // ensuciaría el único número de ingresos reales que hoy es limpio.
          tx.movimiento.findMany({
            where: { empresaId, tipo: 'SALIDA', pedidoInternoId: { not: null }, fecha: { gte: inicioMes } },
            select: { cantidad: true, costoUnitario: true },
          }),
        ]);

      const movs7dMap = new Map(movs7d.map((m) => [m.almacenId, m._count._all]));
      const ultimaActMap = new Map(ultimaActividad.map((m) => [m.almacenId, m._max.fecha]));
      const productosPorVencer = new Set(lotesPorVencer.map((l) => l.productoId));

      // Despachos valorizados de los últimos 3 meses, por almacén de salida.
      const despPorAlmacen = new Map<string, { valor: number; despachos: number }>();
      for (const d of despachos3m) {
        const cur = despPorAlmacen.get(d.almacenId) ?? { valor: 0, despachos: 0 };
        cur.valor += Number(d.total);
        cur.despachos += 1;
        despPorAlmacen.set(d.almacenId, cur);
      }

      type Agg = {
        valorInventario: number;
        skus: number;
        unidades: number;
        criticos: number;
        agotados: number;
        porVencer30d: number;
        productosCriticos: Array<{
          sku: string;
          nombre: string;
          cantidad: number;
          stockMinimo: number;
          estado: 'agotado' | 'critico';
        }>;
      };
      const nuevoAgg = (): Agg => ({
        valorInventario: 0,
        skus: 0,
        unidades: 0,
        criticos: 0,
        agotados: 0,
        porVencer30d: 0,
        productosCriticos: [],
      });

      const porAlmacen = new Map<string, Agg>();
      for (const alm of almacenes) porAlmacen.set(alm.id, nuevoAgg());
      const skusGlobal = new Set<string>();
      const infoAlmacen = new Map(almacenes.map((a) => [a.id, { nombre: a.nombre, activo: a.activo }]));

      // Stock consolidado por producto (todas las locaciones) — alimenta la
      // tabla "Stock por agotarse": disponible = total físico − reservado.
      // `porAlmacen` desglosa ese mismo total por locación (misma fila,
      // sin tabla aparte) — lo pide quien supervisa varios almacenes y
      // necesita saber EN CUÁL está el faltante, no solo cuántos lo tienen.
      type StockProd = {
        id: string;
        sku: string;
        nombre: string;
        stock: number;
        reservado: number;
        minimo: number;
        almacenes: number;
        porAlmacen: Array<{ almacenId: string; almacenNombre: string; activo: boolean; disponible: number }>;
      };
      const porProductoStock = new Map<string, StockProd>();

      for (const inv of inventario) {
        const agg = porAlmacen.get(inv.almacenId);
        if (!agg) continue; // fila huérfana o almacén de otro tenant (RLS ya filtra, defensivo)
        const prod = inv.producto;
        if (prod.estado !== 'Activo') continue;

        const cant = Number(inv.cantidad);
        const reservado = Number(inv.cantidadReservada ?? 0);
        const min = Number(prod.stockMinimo ?? 0);
        const precio = Number(prod.precioCompra ?? 0);

        const sp =
          porProductoStock.get(prod.id) ??
          { id: prod.id, sku: prod.sku, nombre: prod.nombre, stock: 0, reservado: 0, minimo: min, almacenes: 0, porAlmacen: [] };
        sp.stock += cant;
        sp.reservado += reservado;
        if (cant > 0) sp.almacenes += 1;
        const infoAlm = infoAlmacen.get(inv.almacenId);
        sp.porAlmacen.push({
          almacenId: inv.almacenId,
          almacenNombre: infoAlm?.nombre ?? '—',
          activo: infoAlm?.activo ?? true,
          disponible: cant - reservado,
        });
        porProductoStock.set(prod.id, sp);

        agg.valorInventario += cant * precio;
        if (cant > 0) {
          agg.unidades += cant;
          agg.skus += 1;
          skusGlobal.add(prod.id);
          if (productosPorVencer.has(prod.id)) agg.porVencer30d += 1;
        }

        if (min > 0) {
          if (cant <= 0) {
            agg.agotados += 1;
            agg.productosCriticos.push({ sku: prod.sku, nombre: prod.nombre, cantidad: cant, stockMinimo: min, estado: 'agotado' });
          } else if (cant <= min) {
            agg.criticos += 1;
            agg.productosCriticos.push({ sku: prod.sku, nombre: prod.nombre, cantidad: cant, stockMinimo: min, estado: 'critico' });
          }
        }
      }

      const almacenesOut = almacenes.map((alm) => {
        const agg = porAlmacen.get(alm.id)!;
        agg.productosCriticos.sort((a, b) =>
          a.estado === b.estado ? a.cantidad - b.cantidad : a.estado === 'agotado' ? -1 : 1,
        );
        return {
          id: alm.id,
          nombre: alm.nombre,
          activo: alm.activo,
          direccion: alm.direccion,
          ciudad: alm.ciudad,
          region: alm.region,
          pais: alm.pais,
          latitud: alm.latitud != null ? Number(alm.latitud) : null,
          longitud: alm.longitud != null ? Number(alm.longitud) : null,
          responsable: alm.responsable,
          telefono: alm.telefono,
          valorInventario: agg.valorInventario,
          skus: agg.skus,
          unidades: agg.unidades,
          criticos: agg.criticos,
          agotados: agg.agotados,
          porVencer30d: agg.porVencer30d,
          movimientos7d: movs7dMap.get(alm.id) ?? 0,
          ultimaActividad: ultimaActMap.get(alm.id) ?? null,
          despachado3m: despPorAlmacen.get(alm.id)?.valor ?? 0,
          despachos3m: despPorAlmacen.get(alm.id)?.despachos ?? 0,
          productosCriticos: agg.productosCriticos.slice(0, 5),
        };
      });

      // ── Continuidad del negocio · últimos 3 meses ──────────────────────

      // 1) Despachos valorizados por mes (los 3 meses, en orden cronológico).
      const despachosMensuales: Array<{ mes: string; valor: number; despachos: number }> = [];
      for (let i = 2; i >= 0; i--) {
        const ini = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const fin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 1);
        const delMes = despachos3m.filter((d) => d.fecha >= ini && d.fecha < fin);
        despachosMensuales.push({
          mes: ini.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).toUpperCase(),
          valor: delMes.reduce((s, d) => s + Number(d.total), 0),
          despachos: delMes.length,
        });
      }
      const despachado3m = despachosMensuales.reduce((s, m) => s + m.valor, 0);

      // Mismo total, abierto por almacén de salida — se listan TODOS los
      // almacenes (incluidos los que despacharon 0) para que el panel sea
      // comparativo entre locaciones.
      const despachosPorAlmacen = almacenesOut
        .map((a) => ({
          id: a.id,
          nombre: a.nombre,
          activo: a.activo,
          valor: a.despachado3m,
          despachos: a.despachos3m,
        }))
        .sort((a, b) => b.valor - a.valor);

      // Flujo de Operación — comparativo por almacén (Recepción/Picking/
      // Despacho/Pendientes Aprobación), MES CALENDARIO EN CURSO (ver
      // `inicioMes` arriba — distinto del `desde3m` de 3 meses que usa
      // "Despachos valorizados"). Las primeras tres series se cuentan en la
      // MISMA unidad (número de eventos: entradas registradas, listas de
      // picking cerradas, despachos no anulados) — a propósito NO se usan
      // las unidades físicas recibidas (`_sum.cantidad` de Recepción, que
      // puede superar por 100x a las otras series y aplastaría el gráfico
      // comparativo); esas unidades igual se exponen en `recepcionUnidades`
      // por si la UI quiere mostrarlas como dato secundario (tooltip).
      // "Pendientes Aprobación" es la ÚNICA serie que NO es flujo del mes:
      // es una foto del backlog actual (Despacho en PEDIDO + PedidoInterno
      // en ENVIADO), sin filtro de fecha.
      const recepcionPorAlmacen = new Map(
        entradasMes.map((m) => [m.almacenId, { movs: m._count._all, unidades: Number(m._sum.cantidad ?? 0) }]),
      );
      const pickingPorAlmacen = new Map<string, number>();
      for (const l of listasPickingCompletadasMes) {
        const id = l.despacho.almacenId;
        pickingPorAlmacen.set(id, (pickingPorAlmacen.get(id) ?? 0) + 1);
      }
      const despachoMesPorAlmacen = new Map(despachosMes.map((d) => [d.almacenId, d._count._all]));
      // Separados (no solo la suma) para que el frontend pueda enlazar cada
      // uno a SU página real — Despachos en PEDIDO viven en /despachos,
      // Pedidos Internos en ENVIADO en /pedidos-internos, no hay una sola
      // pantalla que muestre ambos juntos.
      const pendientesDespachoPorAlmacen = new Map(
        despachosPendientesAprobacion.map((d) => [d.almacenId, d._count._all]),
      );
      const pendientesPedidoInternoPorAlmacen = new Map(
        pedidosInternosPendientesAprobacion.map((p) => [p.almacenId, p._count._all]),
      );
      // Pedidos Internos ENTREGADOS del mes — serie propia, PARALELA a
      // Despacho (mismo criterio: documentos del mes, no items) pero de
      // salida a un área interna, no a un cliente.
      const pedidosInternosMesPorAlmacen = new Map(
        pedidosInternosEntregadosMes.map((p) => [p.almacenId, p._count._all]),
      );
      const flujoOperativoPorAlmacen = almacenesOut
        .map((a) => {
          const rec = recepcionPorAlmacen.get(a.id) ?? { movs: 0, unidades: 0 };
          const pendDespacho = pendientesDespachoPorAlmacen.get(a.id) ?? 0;
          const pendPedidoInterno = pendientesPedidoInternoPorAlmacen.get(a.id) ?? 0;
          return {
            id: a.id,
            nombre: a.nombre,
            activo: a.activo,
            recepcion: rec.movs,
            recepcionUnidades: rec.unidades,
            picking: pickingPorAlmacen.get(a.id) ?? 0,
            despacho: despachoMesPorAlmacen.get(a.id) ?? 0,
            pedidosInternos: pedidosInternosMesPorAlmacen.get(a.id) ?? 0,
            pendientesAprobacion: pendDespacho + pendPedidoInterno,
            pendientesDespacho: pendDespacho,
            pendientesPedidoInterno: pendPedidoInterno,
          };
        })
        .sort((a, b) =>
          b.recepcion + b.picking + b.despacho + b.pedidosInternos + b.pendientesAprobacion -
          (a.recepcion + a.picking + a.despacho + a.pedidosInternos + a.pendientesAprobacion),
        );

      // Consumo interno del mes, valorizado a costo (ver comentario de la
      // query arriba) — a propósito separado de `despachado3m`, nunca sumado.
      const consumoInternoMes = movimientosConsumoInternoMes.reduce(
        (s, m) => s + Number(m.cantidad) * Number(m.costoUnitario ?? 0),
        0,
      );

      // 2) Clientes con más pedidos atendidos — una tabla POR ALMACÉN de
      //    despacho, cada una con su propio total (de todos sus clientes,
      //    no solo los 5 que se listan) para que la tarjeta sea autónoma.
      const clientesPorAlmacenMap = new Map<
        string,
        Map<string, { id: string; nombre: string; pedidos: number; valor: number }>
      >();
      for (const d of despachos3m) {
        if (!clientesPorAlmacenMap.has(d.almacenId)) clientesPorAlmacenMap.set(d.almacenId, new Map());
        const porCliente = clientesPorAlmacenMap.get(d.almacenId)!;
        const cur =
          porCliente.get(d.clienteId) ?? { id: d.clienteId, nombre: d.cliente.razonSocial, pedidos: 0, valor: 0 };
        cur.pedidos += 1;
        cur.valor += Number(d.total);
        porCliente.set(d.clienteId, cur);
      }
      const topClientesPorAlmacen = almacenesOut
        .map((alm) => {
          const filasCompletas = [...(clientesPorAlmacenMap.get(alm.id)?.values() ?? [])].sort(
            (a, b) => b.pedidos - a.pedidos || b.valor - a.valor,
          );
          return {
            almacenId: alm.id,
            almacenNombre: alm.nombre,
            totalPedidos: filasCompletas.reduce((s, f) => s + f.pedidos, 0),
            totalValor: filasCompletas.reduce((s, f) => s + f.valor, 0),
            filas: filasCompletas.slice(0, 5),
          };
        })
        .filter((x) => x.filas.length > 0)
        .sort((a, b) => b.totalValor - a.totalValor);

      // 3) Productos con mayor salida (unidades) — de las líneas de los
      //    MISMOS despachos que arman "Clientes más atendidos" (arriba), no
      //    de Movimiento tipo=SALIDA: ese también suma pedidos internos
      //    entregados, salidas manuales (merma/consumo interno/otro) y
      //    devoluciones a proveedor — y valoriza a costo, no a precio de
      //    venta.
      //
      //    `valor` = DespachoItem.subtotal (venta, sin IGV) + 18% — para que
      //    la suma de productos de un almacén cuadre EXACTO con su
      //    "Despachos valorizados" (que usa Despacho.total, con IGV ya
      //    incluido). El IGV real de cada despacho se calcula una sola vez
      //    sobre el subtotal COMPLETO del documento (ver IGV_RATE arriba y
      //    DespachosService.crear) — DespachoItem no lo guarda por línea, así
      //    que acá se aproxima aplicando el mismo 18% a cada línea. Con
      //    redondeo a 2 decimales por despacho completo (no por línea), en
      //    despachos de una sola línea cuadra al centavo; con varias líneas
      //    puede haber una diferencia de céntimos por cómo cae el redondeo.
      const productosPorAlmacenMap = new Map<
        string,
        Map<string, { id: string; sku: string; nombre: string; unidades: number; valor: number }>
      >();
      for (const d of despachos3m) {
        if (!productosPorAlmacenMap.has(d.almacenId)) productosPorAlmacenMap.set(d.almacenId, new Map());
        const porProducto = productosPorAlmacenMap.get(d.almacenId)!;
        for (const it of d.items ?? []) {
          const cur =
            porProducto.get(it.productoId) ??
            { id: it.productoId, sku: it.producto.sku, nombre: it.producto.nombre, unidades: 0, valor: 0 };
          cur.unidades += Number(it.cantidad);
          cur.valor += Number(it.subtotal) * (1 + IGV_RATE);
          porProducto.set(it.productoId, cur);
        }
      }
      const topProductosPorAlmacen = almacenesOut
        .map((alm) => {
          const filasCompletas = [...(productosPorAlmacenMap.get(alm.id)?.values() ?? [])].sort(
            (a, b) => b.unidades - a.unidades,
          );
          return {
            almacenId: alm.id,
            almacenNombre: alm.nombre,
            totalUnidades: filasCompletas.reduce((s, f) => s + f.unidades, 0),
            totalValor: filasCompletas.reduce((s, f) => s + f.valor, 0),
            filas: filasCompletas.slice(0, 5),
          };
        })
        .filter((x) => x.filas.length > 0)
        .sort((a, b) => b.totalValor - a.totalValor);

      // 4) Stock por agotarse — productos con mínimo definido, ordenados por
      //    cobertura (disponible ÷ mínimo). "qué falta / se está acabando".
      const porAgotarse = [...porProductoStock.values()]
        .map((p) => {
          const disponible = p.stock - p.reservado;
          return {
            id: p.id,
            sku: p.sku,
            nombre: p.nombre,
            stock: p.stock,
            reservado: p.reservado,
            disponible,
            minimo: p.minimo,
            almacenes: p.almacenes,
            porAlmacen: [...p.porAlmacen].sort((a, b) => b.disponible - a.disponible),
            cobertura: p.minimo > 0 ? disponible / p.minimo : null,
            estado: disponible <= 0 ? 'agotado' : disponible <= p.minimo ? 'critico' : 'ok',
          };
        })
        .filter((p) => p.minimo > 0 && p.estado !== 'ok')
        .sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0))
        .slice(0, 12);

      const consolidado = {
        almacenes: almacenes.length,
        almacenesActivos: almacenes.filter((a) => a.activo).length,
        sinUbicacion: almacenes.filter((a) => !a.ciudad && !a.direccion).length,
        valorInventario: almacenesOut.reduce((s, a) => s + a.valorInventario, 0),
        skus: skusGlobal.size,
        unidades: almacenesOut.reduce((s, a) => s + a.unidades, 0),
        criticos: almacenesOut.reduce((s, a) => s + a.criticos, 0),
        agotados: almacenesOut.reduce((s, a) => s + a.agotados, 0),
        porVencer30d: productosPorVencer.size,
        movimientos7d: almacenesOut.reduce((s, a) => s + a.movimientos7d, 0),
        despachado3m,
      };

      return {
        generadoEn: ahora,
        consolidado,
        almacenes: almacenesOut,
        despachosMensuales,
        despachosPorAlmacen,
        flujoOperativoPorAlmacen,
        // Mismo formato que cada `mes` de `despachosMensuales` — el mes
        // calendario en curso que cubre `flujoOperativoPorAlmacen` (las
        // cuatro primeras series; "Pendientes Aprobación" es backlog actual,
        // sin fecha, ver comentario arriba).
        flujoOperativoMes: ahora.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).toUpperCase(),
        consumoInternoMes,
        topClientesPorAlmacen,
        topProductosPorAlmacen,
        porAgotarse,
      };
    });
  }
}
