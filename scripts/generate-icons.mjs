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

// 定数定義
const SOURCE_SVG = join(__dirname, '../example/apple-touch-icon.svg')
const OUTPUT_PNG = join(__dirname, '../example/apple-touch-icon.png')
const ICON_SIZE = 180

async function generateIcon() {
	// SVGファイルを読み込み
	const svgBuffer = readFileSync(SOURCE_SVG)

	// sharpでPNGに変換
	await sharp(svgBuffer).resize(ICON_SIZE, ICON_SIZE).png().toFile(OUTPUT_PNG)

	console.log(`✅ Generated: ${OUTPUT_PNG}`)
}

generateIcon().catch(console.error)
