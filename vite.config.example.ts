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
		target: 'esnext',
		supported: {
			'class-field': true,
			'class-static-field': true,
		},
	},
	optimizeDeps: {
		include: ['maplibre-gl'],
		esbuildOptions: {
			target: 'esnext',
			supported: {
				'class-field': true,
				'class-static-field': true,
			},
		},
	},
	build: {
		outDir: '../demo',
		target: 'esnext',
		rollupOptions: {
			input: {
				index: 'example/index.html',
			},
		},
	},
})
