import { defineConfig } from 'vite';

// Vite compila el proyecto a /dist. Todo lo que está en /public (datos y staticwebapp.config.json)
// se copia tal cual a la raíz de /dist, que es lo que Azure Static Web Apps publica.
export default defineConfig({
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    open: true,
  },
});
