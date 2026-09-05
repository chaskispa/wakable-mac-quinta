import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';

// Vite sirve /models en desarrollo; también lo copiamos al compilar.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'copy-models',
    writeBundle(options) {
      cpSync('models', `${options.dir}/models`, { recursive: true });
    },
  }],
});
