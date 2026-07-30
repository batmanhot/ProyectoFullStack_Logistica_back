import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
