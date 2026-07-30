/**
 * Catálogo FIJO de tipos de caja/empaque — replica TIPOS_CAJA de Empaque.jsx
 * real. No es una tabla de BD (no es algo que el tenant gestione/edite),
 * es data de referencia estática expuesta vía GET /empaques/tipos-caja.
 */
export const TIPOS_CAJA = [
  { id: 'c1', label: 'Caja XS', dim: '20×15×10 cm', pesoMax: 2 },
  { id: 'c2', label: 'Caja S', dim: '30×20×15 cm', pesoMax: 5 },
  { id: 'c3', label: 'Caja M', dim: '40×30×20 cm', pesoMax: 10 },
  { id: 'c4', label: 'Caja L', dim: '50×40×30 cm', pesoMax: 20 },
  { id: 'c5', label: 'Caja XL', dim: '60×50×40 cm', pesoMax: 30 },
  { id: 'c6', label: 'Pallet', dim: '120×80×150 cm', pesoMax: 300 },
  { id: 'c7', label: 'Bolsa', dim: '40×30×0 cm', pesoMax: 3 },
  { id: 'c8', label: 'Sobre', dim: '25×18×0 cm', pesoMax: 0.5 },
] as const;

export const TIPOS_CAJA_IDS = TIPOS_CAJA.map((c) => c.id);
