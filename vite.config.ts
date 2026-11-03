import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		outDir: 'dist',
		lib: {
			entry: 'src/terrain.ts',
			name: 'terrain',
			fileName: 'terrain',
		},
	},
})
