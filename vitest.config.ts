import { defineConfig } from 'vitest/config';
import path from 'path';

export const vitestConfig = defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'apps/web/src') + '/',
    },
  },
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
