import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts', // thin HTTP wrappers — sin lógica de negocio propia
        'src/main.ts',
        'src/**/*.dto.ts',
        'src/common/**',
      ],
      // Piso "no regresión". Valor real medido 2026-09-07:
      // stmts 68.9 / branch 63.9 / funcs 74.4 / lines 69.5 — el umbral se deja
      // ~2 pp por debajo para absorber ruido de redondeo/plataforma sin flapear,
      // pero atrapa la caída si entra un service entero sin tests. Se corre en
      // CI vía `npm run test:cov`. Subirlo al mejorar la cobertura; nunca
      // bajarlo para "arreglar" el CI.
      thresholds: {
        statements: 66,
        branches: 61,
        functions: 72,
        lines: 67,
      },
    },
  },
});
