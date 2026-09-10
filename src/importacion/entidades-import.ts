/**
 * Importación de datos maestros (Configuración → Importar Datos, 2026-09-10).
 * Registro de qué entidades se pueden cargar en lote y cómo. El navegador
 * parsea el Excel y manda las filas como JSON; ImportacionService valida acá
 * (fuente de verdad) y hace el upsert en una transacción.
 *
 * `claveNatural` = campo por el que se decide crear vs. actualizar; si esa
 * columna viene vacía se usa `claveNaturalFallback`.
 */
export type TipoCampoImport = 'texto' | 'numero' | 'booleano' | 'email' | 'ruc';

export interface CampoImport {
  columna: string; // encabezado en el Excel
  campo: string; // campo del modelo Prisma
  requerido?: boolean;
  tipo?: TipoCampoImport; // default 'texto'
  ejemplo?: string | number;
}

export interface EntidadImport {
  entidad: string;
  label: string;
  modelo: 'cliente' | 'proveedor' | 'categoria' | 'almacen';
  claveNatural: string;
  claveNaturalFallback?: string;
  campos: CampoImport[];
}

export const ENTIDADES_IMPORT: Record<string, EntidadImport> = {
  clientes: {
    entidad: 'clientes',
    label: 'Clientes',
    modelo: 'cliente',
    claveNatural: 'ruc',
    claveNaturalFallback: 'razonSocial',
    campos: [
      { columna: 'Razón Social', campo: 'razonSocial', requerido: true, ejemplo: 'Comercial San Martín S.A.C.' },
      { columna: 'RUC', campo: 'ruc', tipo: 'ruc', ejemplo: '20512345678' },
      { columna: 'Contacto', campo: 'contacto', ejemplo: 'Juan Pérez' },
      { columna: 'Teléfono', campo: 'telefono', ejemplo: '987654321' },
      { columna: 'Email', campo: 'email', tipo: 'email', ejemplo: 'ventas@sanmartin.pe' },
      { columna: 'Dirección', campo: 'direccion', ejemplo: 'Av. Industrial 123, Lima' },
      { columna: 'Condición de Pago', campo: 'condicionPago', ejemplo: 'Crédito 30 días' },
      { columna: 'Límite de Crédito', campo: 'limiteCredito', tipo: 'numero', ejemplo: 5000 },
    ],
  },
  proveedores: {
    entidad: 'proveedores',
    label: 'Proveedores',
    modelo: 'proveedor',
    claveNatural: 'ruc',
    claveNaturalFallback: 'razonSocial',
    campos: [
      { columna: 'Razón Social', campo: 'razonSocial', requerido: true, ejemplo: 'Distribuidora Andina S.A.' },
      { columna: 'RUC', campo: 'ruc', tipo: 'ruc', ejemplo: '20487654321' },
      { columna: 'Teléfono', campo: 'telefono', ejemplo: '01-4567890' },
      { columna: 'Email', campo: 'email', tipo: 'email', ejemplo: 'compras@andina.pe' },
      { columna: 'Dirección', campo: 'direccion', ejemplo: 'Jr. Comercio 456, Callao' },
    ],
  },
  categorias: {
    entidad: 'categorias',
    label: 'Categorías',
    modelo: 'categoria',
    claveNatural: 'nombre',
    campos: [
      { columna: 'Nombre', campo: 'nombre', requerido: true, ejemplo: 'Ferretería' },
      { columna: 'Descripción', campo: 'descripcion', ejemplo: 'Herramientas y materiales de construcción' },
    ],
  },
  almacenes: {
    entidad: 'almacenes',
    label: 'Almacenes',
    modelo: 'almacen',
    claveNatural: 'nombre',
    campos: [{ columna: 'Nombre', campo: 'nombre', requerido: true, ejemplo: 'Almacén Central' }],
  },
};

export const ENTIDADES_IMPORT_VALIDAS = Object.keys(ENTIDADES_IMPORT);
