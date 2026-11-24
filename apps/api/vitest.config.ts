import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Tests d'intégration de l'API.
 *
 * NestJS s'appuie massivement sur `emitDecoratorMetadata` : sans lui, les types
 * injectés ne sont pas résolus et `ConfigService` arrive indéfini. Vite/esbuild
 * ne produit pas ces métadonnées, d'où la transformation par SWC (même
 * configuration que la compilation Nest).
 */
export default defineConfig({
  resolve: {
    alias: { '@memo/shared': resolve(__dirname, '../../packages/shared/src/index.ts') },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./test/setup.ts'],
  },
});
