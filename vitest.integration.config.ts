import { defineConfig } from 'vitest/config';

// Suite separada de vitest.config.ts (unitarios, 100% mockeados) — esta
// corre contra un Postgres real (ver docs/PLAN-DE-PRUEBAS-QA.md, Fase 3).
// No se ejecuta en el CI de Fase 0 (necesitaría un service container de
// Postgres) — se corre a mano con `npm run test:integration` apuntando a
// un Postgres descartable ya migrado + con el rol stockpro_app creado.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // comparten el mismo Postgres — evitar contención de conexiones
  },
});
