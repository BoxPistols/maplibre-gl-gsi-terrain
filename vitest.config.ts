import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: [
			'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
			'example/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
		],
		exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
		environment: 'happy-dom',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*', 'example/modules/**/*'],
			exclude: ['src/**/*.{test,spec}.*', 'example/**/*.{test,spec}.*'],
		},
	},
})
