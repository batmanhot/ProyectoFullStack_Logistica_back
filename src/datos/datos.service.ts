import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DatosService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Limpiar datos operativos ────────────────────────────────────────────────
  // Elimina todo lo transaccional pero conserva: Empresa, Categoria, Almacen,
  // Ubicacion, AreaInterna, Usuario, Rol, Permiso.
  async limpiarOperativos(empresaId: string) {
    // ~25 deleteMany secuenciales — el timeout default de Prisma (5s) no alcanza.
    await this.prisma.withTenant(empresaId, (tx) => this.borrarOperativos(tx, empresaId), { timeout: 30000 });
    return { ok: true, mensaje: 'Datos operativos eliminados correctamente' };
  }

  // ── Restaurar datos demo ────────────────────────────────────────────────────
  // 1) Limpia TODO (incluyendo categorias, almacenes, areas, ubicaciones)
  // 2) Re-siembra datos demo listos para presentación
  async restaurarDemo(empresaId: string) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      await this.borrarOperativos(tx, empresaId);
      // Estructura de catálogos también
      await tx.ubicacion.deleteMany({ where: { almacen: { empresaId } } });
      await tx.areaInterna.deleteMany({ where: { empresaId } });
      await tx.almacen.deleteMany({ where: { empresaId } });
      await tx.categoria.deleteMany({ where: { empresaId } });
    }, { timeout: 30000 });
    await this.sembrarDemo(empresaId);
    return { ok: true, mensaje: 'Datos demo restaurados correctamente' };
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
    }, { timeout: 30000 });
  }

  // ── Borrado operativo compartido ────────────────────────────────────────────
  private async borrarOperativos(tx: PrismaClient, empresaId: string) {
    // Nivel 1 — tablas hijo sin empresaId propio (orden crítico por FKs)
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

    // Nivel 2 — cabeceras con empresaId
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

    // Nivel 3 — maestros operativos
    await tx.movimiento.deleteMany({ where: { empresaId } });
    // LoteProducto e Inventario no tienen empresaId propio — se filtran por producto
    await tx.loteProducto.deleteMany({ where: { producto: { empresaId } } });
    await tx.inventario.deleteMany({ where: { producto: { empresaId } } });
    await tx.transportista.deleteMany({ where: { empresaId } });
    await tx.cliente.deleteMany({ where: { empresaId } });
    await tx.producto.deleteMany({ where: { empresaId } });
    await tx.proveedor.deleteMany({ where: { empresaId } });
    await tx.auditoria.deleteMany({ where: { empresaId } });
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
    // DESPACHOS (12) — cubre los 7 estados de EstadoDespacho + alimenta
    // Rutas/CxC/SUNAT abajo. Solo los DESPACHADO/ENTREGADO consumen stock
    // real (Movimiento SALIDA); PEDIDO/APROBADO/PICKING/LISTO solo reservan.
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
    await tx.despacho.create({
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
    await tx.despacho.create({
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
