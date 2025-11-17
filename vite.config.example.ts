import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
	root: './example',
	base: '/',
	publicDir: false,
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
	plugins: [
		{
			name: 'copy-data-folder',
			writeBundle() {
				const sourceDir = join(__dirname, 'example', 'data')
				const targetDir = join(__dirname, 'demo', 'data')

				// ターゲットディレクトリを作成
				mkdirSync(targetDir, { recursive: true })

				// dataフォルダの内容をコピー
				const files = readdirSync(sourceDir)
				files.forEach((file: string) => {
					const sourcePath = join(sourceDir, file)
					const targetPath = join(targetDir, file)
					if (statSync(sourcePath).isFile()) {
						copyFileSync(sourcePath, targetPath)
					}
				})
			},
		},
	],
})
