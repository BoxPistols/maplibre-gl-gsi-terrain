import { defineConfig } from 'vite'

export default defineConfig({
	root: './example',
	base: '/',
	server: {
		fs: {
			allow: ['..'],
		},
	},
	esbuild: {
		target: 'es2020',
	},
	optimizeDeps: {
		include: ['maplibre-gl'],
		esbuildOptions: {
			target: 'es2020',
		},
	},
	build: {
		outDir: '../demo',
		target: 'es2020',
		rollupOptions: {
			input: {
				index: 'example/index.html',
			},
		},
	},
})
