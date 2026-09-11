import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  let prisma: any;
  let service: ReportesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ReportesService(prisma);
  });

  describe('financiero', () => {
    it('retorna estructura completa con meses, totales, topRentables y valorInventario', async () => {
      const txMock = {
        movimiento: {
          findMany: vi.fn()
            .mockResolvedValueOnce([
              // SALIDA mes
              { cantidad: 5, costoUnitario: 100, producto: { precioVenta: 200 } },
            ])
            .mockResolvedValueOnce([]), // DEVOLUCION mes
        },
        ordenCompra: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { total: 500 } }),
        },
        producto: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'p1', sku: 'SKU1', nombre: 'Prod 1', stockActual: 10, precioCompra: 50, precioVenta: 100 },
          ]),
        },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.financiero('e1', 1);

      expect(r).toHaveProperty('meses');
      expect(r).toHaveProperty('totales');
      expect(r).toHaveProperty('valorInventario');
      expect(r).toHaveProperty('topRentables');
      expect(Array.isArray(r.meses)).toBe(true);
      expect(r.meses).toHaveLength(1);
    });

    it('calcula ingresos = cantidad × precioVenta de salidas', async () => {
      const txMock = {
        movimiento: {
          findMany: vi.fn()
            .mockResolvedValueOnce([
              { cantidad: 2, costoUnitario: 100, producto: { precioVenta: 300 } },
            ])
            .mockResolvedValueOnce([]),
        },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      expect(r.meses[0].ingresos).toBe(600);
    });

    it('valorInventario = stockActual × precioCompra de cada producto activo', async () => {
      const txMock = {
        movimiento: { findMany: vi.fn().mockResolvedValue([]) },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'p1', sku: 'X', nombre: 'X', stockActual: 10, precioCompra: 50, precioVenta: 100 },
            { id: 'p2', sku: 'Y', nombre: 'Y', stockActual: 5,  precioCompra: 80, precioVenta: 150 },
          ]),
        },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      // 10×50 + 5×80 = 500+400 = 900
      expect(r.valorInventario).toBe(900);
    });

    it('devuelve tendenciaIngresos null cuando no hay mes anterior', async () => {
      const txMock = {
        movimiento: { findMany: vi.fn().mockResolvedValue([]) },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      expect(r.tendenciaIngresos).toBeNull();
    });
  });

  describe('kpisOperativos', () => {
    function makeDespacho(estado: string, clienteId = 'cli1', total = 1000, fechaEntregado?: Date) {
      return {
        estado,
        clienteId,
        total,
        fecha: new Date('2025-06-01'),
        fechaEntrega: new Date('2025-06-10'),
        fechaEntregado: fechaEntregado ?? null,
        cliente: { razonSocial: 'Cliente Uno' },
      };
    }

    it('devuelve estructura completa con KPIs, semanas y topClientes', async () => {
      const txMock = {
        despacho: {
          findMany: vi.fn()
            .mockResolvedValueOnce([makeDespacho('ENTREGADO')]) // período
            .mockResolvedValue([]), // 8 llamadas de semanas
        },
        movimiento: {
          count:    vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.kpisOperativos('e1', 30);

      expect(r).toHaveProperty('fillRate');
      expect(r).toHaveProperty('otif');
      expect(r).toHaveProperty('tasaError');
      expect(r).toHaveProperty('perfectOrder');
      expect(r).toHaveProperty('despachosPorSemana');
      expect(r.despachosPorSemana).toHaveLength(8);
      expect(r).toHaveProperty('topClientes');
    });

    it('fillRate = 100% cuando todos los despachos son ENTREGADO', async () => {
      const txMock = {
        despacho: {
          findMany: vi.fn()
            .mockResolvedValueOnce([makeDespacho('ENTREGADO'), makeDespacho('ENTREGADO')])
            .mockResolvedValue([]),
        },
        movimiento: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.kpisOperativos('e1', 30);
      expect(r.fillRate).toBe(100);
    });

    it('fillRate = 0 cuando no hay despachos en el período', async () => {
      const txMock = {
        despacho: { findMany: vi.fn().mockResolvedValue([]) },
        movimiento: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.kpisOperativos('e1', 30);
      expect(r.fillRate).toBe(0);
      expect(r.cycleTime).toBeNull();
      expect(r.leadTimeAvg).toBeNull();
    });
  });

  describe('panoramaAlmacenes', () => {
    function makeTx(over: any = {}) {
      return {
        almacen: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'a1', nombre: 'Central', activo: true, ciudad: 'Lima', region: 'Lima', direccion: 'Av 1', pais: 'Perú', latitud: null, longitud: null, responsable: 'Ana', telefono: null },
            { id: 'a2', nombre: 'Sur', activo: true, ciudad: null, region: null, direccion: null, pais: null, latitud: null, longitud: null, responsable: null, telefono: null },
          ]),
        },
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { almacenId: 'a1', cantidad: 10, cantidadReservada: 3, producto: { id: 'p1', sku: 'S1', nombre: 'Prod 1', precioCompra: 50, stockMinimo: 4, estado: 'Activo' } },
            { almacenId: 'a1', cantidad: 2,  cantidadReservada: 0, producto: { id: 'p2', sku: 'S2', nombre: 'Prod 2', precioCompra: 20, stockMinimo: 5, estado: 'Activo' } },
            { almacenId: 'a2', cantidad: 0,  cantidadReservada: 0, producto: { id: 'p3', sku: 'S3', nombre: 'Prod 3', precioCompra: 30, stockMinimo: 3, estado: 'Activo' } },
          ]),
        },
        movimiento: {
          groupBy: vi.fn()
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 7 } }])      // movs 7d
            .mockResolvedValueOnce([{ almacenId: 'a1', _max: { fecha: new Date('2026-09-09') } }]) // última actividad
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 3 }, _sum: { cantidad: 120 } }]), // entradas mes en curso (Recepción)
          findMany: vi.fn().mockResolvedValue([
            { cantidad: 4, costoUnitario: 15 },
            { cantidad: 2, costoUnitario: 10 },
          ]), // salidas de Pedido Interno del mes (consumo interno valorizado)
        },
        listaPicking: {
          findMany: vi.fn().mockResolvedValue([
            { despacho: { almacenId: 'a1' } },
            { despacho: { almacenId: 'a1' } },
          ]), // picking COMPLETADA del mes en curso (Picking)
        },
        despacho: {
          findMany: vi.fn().mockResolvedValue([                                     // despachos 3m
            { fecha: new Date(), total: 1000, clienteId: 'c1', almacenId: 'a1', cliente: { razonSocial: 'Cliente Uno' },
              items: [{ productoId: 'p1', cantidad: 8, subtotal: 400, producto: { sku: 'S1', nombre: 'Prod 1' } }] },
            { fecha: new Date(), total: 500,  clienteId: 'c1', almacenId: 'a1', cliente: { razonSocial: 'Cliente Uno' }, items: [] },
            { fecha: new Date(), total: 300,  clienteId: 'c2', almacenId: 'a2', cliente: { razonSocial: 'Cliente Dos' },
              items: [{ productoId: 'p2', cantidad: 3, subtotal: 60, producto: { sku: 'S2', nombre: 'Prod 2' } }] },
          ]),
          groupBy: vi.fn()
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 5 } }])       // despachos del mes en curso (Despacho)
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 2 } }]),      // Despacho en PEDIDO (Pendientes Aprobación)
        },
        pedidoInterno: {
          groupBy: vi.fn()
            .mockResolvedValueOnce([{ almacenId: 'a2', _count: { _all: 1 } }])       // PedidoInterno en ENVIADO (Pendientes Aprobación)
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 2 } }]),      // PedidoInterno ENTREGADO del mes (flujo paralelo a Despacho)
        },
        loteProducto: { findMany: vi.fn().mockResolvedValue([{ productoId: 'p1' }]) },
        ...over,
      };
    }

    it('agrega por almacén: valor de inventario, SKUs, criticidad y actividad', async () => {
      const txMock = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.panoramaAlmacenes('e1');

      expect(r.almacenes).toHaveLength(2);
      const a1: any = r.almacenes.find((x: any) => x.id === "a1");
      // 10×50 + 2×20 = 540
      expect(a1.valorInventario).toBe(540);
      expect(a1.skus).toBe(2);
      expect(a1.criticos).toBe(1);      // p2: 2 <= min 5
      expect(a1.agotados).toBe(0);
      expect(a1.porVencer30d).toBe(1);  // p1 con lote por vencer y stock > 0
      expect(a1.movimientos7d).toBe(7);
      expect(a1.productosCriticos).toHaveLength(1);

      const a2: any = r.almacenes.find((x: any) => x.id === "a2");
      expect(a2.agotados).toBe(1);      // p3: 0 con min 3
      expect(a2.movimientos7d).toBe(0);
    });

    it('consolida totales y cuenta almacenes sin ubicación', async () => {
      const txMock = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.panoramaAlmacenes('e1');

      expect(r.consolidado.almacenes).toBe(2);
      expect(r.consolidado.almacenesActivos).toBe(2);
      expect(r.consolidado.sinUbicacion).toBe(1);   // a2
      expect(r.consolidado.valorInventario).toBe(540);
      expect(r.consolidado.skus).toBe(2);           // p1, p2 (p3 en 0 no cuenta)
      expect(r.consolidado.criticos).toBe(1);
      expect(r.consolidado.agotados).toBe(1);
    });

    it('arma despachos mensuales, top clientes, top productos y stock por agotarse', async () => {
      const txMock = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r: any = await service.panoramaAlmacenes('e1');

      expect(r.despachosMensuales).toHaveLength(3);
      expect(r.consolidado.despachado3m).toBe(1800); // 1000 + 500 + 300

      // Despachos valorizados abiertos por almacén de salida — TODOS los
      // almacenes, ordenados de mayor a menor.
      expect(r.despachosPorAlmacen).toEqual([
        { id: 'a1', nombre: 'Central', activo: true, valor: 1500, despachos: 2 },
        { id: 'a2', nombre: 'Sur', activo: true, valor: 300, despachos: 1 },
      ]);
      expect(r.almacenes.find((x: any) => x.id === 'a1').despachado3m).toBe(1500);

      // Clientes y productos, abiertos por almacén — cada tarjeta trae su
      // propio total (de TODOS sus clientes/productos, no solo los listados).
      expect(r.topClientesPorAlmacen).toHaveLength(2)
      const clientesA1 = r.topClientesPorAlmacen.find((x: any) => x.almacenId === 'a1')
      expect(clientesA1).toMatchObject({ almacenNombre: 'Central', totalPedidos: 2, totalValor: 1500 })
      expect(clientesA1.filas[0]).toMatchObject({ nombre: 'Cliente Uno', pedidos: 2, valor: 1500 })

      const productosA1 = r.topProductosPorAlmacen.find((x: any) => x.almacenId === 'a1')
      // subtotal 400 + 18% IGV = 472 — mismo criterio que Despacho.total,
      // para que cuadre con "Despachos valorizados".
      expect(productosA1).toMatchObject({ almacenNombre: 'Central', totalUnidades: 8, totalValor: 472 })
      expect(productosA1.filas[0]).toMatchObject({ sku: 'S1', unidades: 8, valor: 472 })

      // p1: stock 10 − reservado 3 = disponible 7 > min 4 → sano, fuera.
      // p2: disponible 2 ≤ min 5 → crítico, entra.  p3: disponible 0 → agotado.
      const skusEnAlerta = r.porAgotarse.map((p: any) => p.sku);
      expect(skusEnAlerta).toContain('S2');
      expect(skusEnAlerta).toContain('S3');
      expect(skusEnAlerta).not.toContain('S1');
      const s3 = r.porAgotarse.find((p: any) => p.sku === 'S3');
      expect(s3.estado).toBe('agotado');

      // Cada fila trae también su desglose por almacén (para diferenciar
      // "dónde" está el faltante sin abrir una tabla aparte).
      expect(s3.porAlmacen).toEqual([
        { almacenId: 'a2', almacenNombre: 'Sur', activo: true, disponible: 0 },
      ]);
    });

    it('desglosa "stock por agotarse" por almacén cuando el producto vive en varios', async () => {
      const txMock = makeTx({
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { almacenId: 'a1', cantidad: 10, cantidadReservada: 3, producto: { id: 'p1', sku: 'S1', nombre: 'Prod 1', precioCompra: 50, stockMinimo: 4, estado: 'Activo' } },
            { almacenId: 'a1', cantidad: 2,  cantidadReservada: 0, producto: { id: 'p2', sku: 'S2', nombre: 'Prod 2', precioCompra: 20, stockMinimo: 5, estado: 'Activo' } },
            { almacenId: 'a2', cantidad: 1,  cantidadReservada: 0, producto: { id: 'p2', sku: 'S2', nombre: 'Prod 2', precioCompra: 20, stockMinimo: 5, estado: 'Activo' } },
            { almacenId: 'a2', cantidad: 0,  cantidadReservada: 0, producto: { id: 'p3', sku: 'S3', nombre: 'Prod 3', precioCompra: 30, stockMinimo: 3, estado: 'Activo' } },
          ]),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r: any = await service.panoramaAlmacenes('e1');

      const s2 = r.porAgotarse.find((p: any) => p.sku === 'S2');
      expect(s2.disponible).toBe(3);   // 2 (a1) + 1 (a2)
      expect(s2.almacenes).toBe(2);
      // Ordenado de mayor a menor disponible, no por orden de inserción.
      expect(s2.porAlmacen).toEqual([
        { almacenId: 'a1', almacenNombre: 'Central', activo: true, disponible: 2 },
        { almacenId: 'a2', almacenNombre: 'Sur',     activo: true, disponible: 1 },
      ]);
    });

    it('el comparativo por almacén incluye los que despacharon 0', async () => {
      const txMock = makeTx({
        despacho: {
          findMany: vi.fn().mockResolvedValue([
            { fecha: new Date(), total: 800, clienteId: 'c1', almacenId: 'a1', cliente: { razonSocial: 'Cliente Uno' }, items: [] },
          ]),
          groupBy: vi.fn()
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 5 } }])
            .mockResolvedValueOnce([{ almacenId: 'a1', _count: { _all: 2 } }]),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r: any = await service.panoramaAlmacenes('e1');
      expect(r.despachosPorAlmacen).toHaveLength(2);
      expect(r.despachosPorAlmacen.find((a: any) => a.id === 'a2')).toMatchObject({ valor: 0, despachos: 0 });
    });

    it('flujoOperativoPorAlmacen: cuenta Recepción/Picking/Despacho/Pendientes Aprobación por almacén, mes en curso', async () => {
      const txMock = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r: any = await service.panoramaAlmacenes('e1');

      expect(r.flujoOperativoMes).toBeTruthy();
      expect(r.flujoOperativoPorAlmacen).toHaveLength(2);
      const a1 = r.flujoOperativoPorAlmacen.find((x: any) => x.id === 'a1');
      // entradas mes mock: 3 movimientos, 120 unidades; picking: 2 listas; despachos mes: 5;
      // pedidos internos ENTREGADOS del mes: 2 (a1); pendientes: 2 despachos en PEDIDO
      // (pedidoInterno.groupBy solo trae a2).
      expect(a1).toMatchObject({
        nombre: 'Central', recepcion: 3, recepcionUnidades: 120, picking: 2, despacho: 5,
        pedidosInternos: 2, pendientesAprobacion: 2, pendientesDespacho: 2, pendientesPedidoInterno: 0,
      });
      // a2 no tiene entradas, picking, despachos ni pedidos internos entregados del mes en
      // el mock — todo en 0 salvo el pedido interno ENVIADO que sí lo trae el mock de
      // pedidoInterno.groupBy. Separados (no solo el total) para que el frontend enlace
      // cada uno a su propia pantalla.
      const a2 = r.flujoOperativoPorAlmacen.find((x: any) => x.id === 'a2');
      expect(a2).toMatchObject({
        nombre: 'Sur', recepcion: 0, recepcionUnidades: 0, picking: 0, despacho: 0,
        pedidosInternos: 0, pendientesAprobacion: 1, pendientesDespacho: 0, pendientesPedidoInterno: 1,
      });

      // Consumo interno del mes, valorizado a costo (4×15 + 2×10 = 80) — a
      // propósito separado de `despachado3m` (ingreso a precio de venta).
      expect(r.consumoInternoMes).toBe(80);
    });

    it('ignora productos inactivos', async () => {
      const txMock = makeTx({
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { almacenId: 'a1', cantidad: 10, producto: { id: 'p1', sku: 'S1', nombre: 'Prod 1', precioCompra: 50, stockMinimo: 4, estado: 'Inactivo' } },
          ]),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.panoramaAlmacenes('e1');
      const a1: any = r.almacenes.find((x: any) => x.id === "a1");
      expect(a1.valorInventario).toBe(0);
      expect(a1.skus).toBe(0);
    });
  });
});
