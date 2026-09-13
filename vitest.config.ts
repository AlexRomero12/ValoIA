import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El standalone de Next copia el proyecto (tracing de fs): no repetir tests.
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  },
});
