import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vite';

// Vite sirve /models en desarrollo; también lo copiamos al compilar.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'copy-models',
    writeBundle(options) {
      cpSync('models', `${options.dir}/models`, { recursive: true });
      // Descarga comprimida explícita: funciona también con Nixpacks sin tocar Nginx.
      const obj = readFileSync('models/building.obj');
      const compressed = gzipSync(obj, { level: 6 });
      writeFileSync(`${options.dir}/models/building.obj.gz`, compressed);
      console.log(`OBJ: ${(obj.length / 1e6).toFixed(1)} MB → ${(compressed.length / 1e6).toFixed(1)} MB`);
    },
  }],
});
