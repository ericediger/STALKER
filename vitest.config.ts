import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    globals: true,
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.spec.ts',
      'apps/**/__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});

export default vitestConfig;
