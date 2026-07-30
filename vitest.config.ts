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
      thresholds: {
        statements: 60,
        branches: 65,
        functions: 68,
        lines: 60,
      },
    },
  },
});
