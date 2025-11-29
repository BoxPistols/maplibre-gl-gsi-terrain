#!/usr/bin/env node
/**
 * SVGからapple-touch-icon（PNG）を生成するスクリプト
 * sharpを使用してSVGをPNGに変換
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function generateIcon() {
	const svgPath = join(__dirname, '../example/apple-touch-icon.svg')
	const pngPath = join(__dirname, '../example/apple-touch-icon.png')

	// SVGファイルを読み込み
	const svgBuffer = readFileSync(svgPath)

	// sharpでPNGに変換（180x180）
	await sharp(svgBuffer).resize(180, 180).png().toFile(pngPath)

	console.log(`✅ Generated: ${pngPath}`)
}

generateIcon().catch(console.error)
