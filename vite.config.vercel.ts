import { defineConfig } from 'vite';

export default defineConfig({
  root: './example',
  base: '/',
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    outDir: '../demo',
    minify: 'esbuild',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        index: 'example/index.html',
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
}); 