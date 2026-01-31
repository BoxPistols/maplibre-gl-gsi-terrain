/**
 * マップスタイル管理モジュール
 * MapBox風のインタラクティブなスタイル切り替え機能
 */

import type { Map } from 'maplibre-gl'
import type { MapStyle } from './types'

export class MapStyleManager {
	private map: Map
	private currentStyleId: string
	private styles: Map<string, MapStyle>
	private terrainSource: any

	constructor(map: Map, terrainSource: any) {
		this.map = map
		this.terrainSource = terrainSource
		this.styles = new Map()
		this.currentStyleId = 'satellite'
		this.initializeStyles()
	}

	/**
	 * デフォルトのマップスタイルを初期化
	 */
	private initializeStyles(): void {
		// 衛星写真スタイル
		this.addStyle({
			id: 'satellite',
			name: '衛星写真',
			description: '高解像度の衛星写真ビュー',
			styleObject: {
				version: 8,
				sources: {
					seamlessphoto: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
						maxzoom: 18,
						tileSize: 256,
						attribution:
							'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
					},
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'seamlessphoto',
						source: 'seamlessphoto',
						type: 'raster',
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})

		// 標準地図スタイル
		this.addStyle({
			id: 'standard',
			name: '標準地図',
			description: '詳細な地図情報を含む標準ビュー',
			styleObject: {
				version: 8,
				sources: {
					gsi_std: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
						maxzoom: 18,
						tileSize: 256,
						attribution:
							'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
					},
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'gsi_std',
						source: 'gsi_std',
						type: 'raster',
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})

		// 淡色地図スタイル
		this.addStyle({
			id: 'pale',
			name: '淡色地図',
			description: 'シンプルで見やすい淡色スタイル',
			styleObject: {
				version: 8,
				sources: {
					gsi_pale: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
						maxzoom: 18,
						tileSize: 256,
						attribution:
							'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
					},
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'gsi_pale',
						source: 'gsi_pale',
						type: 'raster',
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})

		// 白地図スタイル
		this.addStyle({
			id: 'blank',
			name: '白地図',
			description: '注記のない白地図スタイル',
			styleObject: {
				version: 8,
				sources: {
					gsi_blank: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png'],
						maxzoom: 14,
						tileSize: 256,
						attribution:
							'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
					},
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'gsi_blank',
						source: 'gsi_blank',
						type: 'raster',
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})

		// ダークモードスタイル
		this.addStyle({
			id: 'dark',
			name: 'ダークモード',
			description: '目に優しいダークスタイル',
			styleObject: {
				version: 8,
				sources: {
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'background',
						type: 'background',
						paint: {
							'background-color': '#1a1a1a',
						},
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})

		// 地形図スタイル
		this.addStyle({
			id: 'relief',
			name: '地形図',
			description: '等高線と陰影を含む詳細な地形図',
			styleObject: {
				version: 8,
				sources: {
					relief: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png'],
						maxzoom: 15,
						tileSize: 256,
						attribution:
							'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
					},
					terrain: this.terrainSource,
				},
				layers: [
					{
						id: 'relief',
						source: 'relief',
						type: 'raster',
					},
				],
				terrain: {
					source: 'terrain',
					exaggeration: 1.5,
				},
			},
		})
	}

	/**
	 * 新しいマップスタイルを追加
	 */
	addStyle(style: MapStyle): void {
		this.styles.set(style.id, style)
	}

	/**
	 * マップスタイルを取得
	 */
	getStyle(styleId: string): MapStyle | undefined {
		return this.styles.get(styleId)
	}

	/**
	 * 全てのマップスタイルを取得
	 */
	getAllStyles(): MapStyle[] {
		return Array.from(this.styles.values())
	}

	/**
	 * マップスタイルを切り替え
	 */
	switchStyle(styleId: string): void {
		const style = this.styles.get(styleId)
		if (!style) {
			console.warn(`Style not found: ${styleId}`)
			return
		}

		const currentStyle = this.map.getStyle()
		const currentSources = currentStyle.sources
		const currentLayers = currentStyle.layers

		// カスタムソースとレイヤーを保存
		const customSources: any = {}
		const customLayers: any[] = []

		// ドローン関連のソースとレイヤーを保存
		const preserveSources = [
			'drone-objects',
			'drone-connections',
			'altitude-lines',
			'drawing-polygon',
			'selected-object',
			'drone-trail',
			'flight-plan-waypoints',
			'flight-plan-path',
		]

		for (const [sourceId, source] of Object.entries(currentSources)) {
			if (preserveSources.includes(sourceId)) {
				customSources[sourceId] = source
			}
		}

		for (const layer of currentLayers) {
			if (preserveSources.some(s => layer.id.includes(s) || layer.source === s)) {
				customLayers.push(layer)
			}
		}

		// 新しいスタイルを適用
		if (style.styleObject) {
			const newStyle = JSON.parse(JSON.stringify(style.styleObject))

			// カスタムソースをマージ
			newStyle.sources = {
				...newStyle.sources,
				...customSources,
			}

			// カスタムレイヤーを追加
			if (!newStyle.layers) {
				newStyle.layers = []
			}
			newStyle.layers.push(...customLayers)

			this.map.setStyle(newStyle)
			this.currentStyleId = styleId
		}
	}

	/**
	 * 現在のスタイルIDを取得
	 */
	getCurrentStyleId(): string {
		return this.currentStyleId
	}

	/**
	 * 地形の誇張度を変更
	 */
	setTerrainExaggeration(exaggeration: number): void {
		const terrain = this.map.getTerrain()
		if (terrain) {
			this.map.setTerrain({
				source: 'terrain',
				exaggeration: exaggeration,
			})
		}
	}

	/**
	 * UIコントロールを作成して地図に追加
	 */
	createStyleControl(): HTMLElement {
		const container = document.createElement('div')
		container.className = 'maplibregl-ctrl maplibregl-ctrl-group map-style-control'
		container.style.cssText = `
			position: absolute;
			top: 10px;
			right: 10px;
			background: white;
			border-radius: 4px;
			box-shadow: 0 0 0 2px rgba(0,0,0,.1);
			padding: 10px;
			max-width: 200px;
			z-index: 1;
		`

		const title = document.createElement('div')
		title.textContent = 'マップスタイル'
		title.style.cssText = `
			font-weight: bold;
			margin-bottom: 8px;
			font-size: 12px;
			color: #333;
		`
		container.appendChild(title)

		const stylesContainer = document.createElement('div')
		stylesContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 6px;
		`

		for (const style of this.getAllStyles()) {
			const button = document.createElement('button')
			button.textContent = style.name
			button.title = style.description
			button.style.cssText = `
				padding: 8px 12px;
				border: 1px solid #ddd;
				border-radius: 4px;
				background: ${this.currentStyleId === style.id ? '#007cbf' : 'white'};
				color: ${this.currentStyleId === style.id ? 'white' : '#333'};
				cursor: pointer;
				font-size: 11px;
				transition: all 0.2s;
			`

			button.addEventListener('mouseenter', () => {
				if (this.currentStyleId !== style.id) {
					button.style.background = '#f0f0f0'
				}
			})

			button.addEventListener('mouseleave', () => {
				if (this.currentStyleId !== style.id) {
					button.style.background = 'white'
				}
			})

			button.addEventListener('click', () => {
				this.switchStyle(style.id)

				// 全てのボタンを更新
				const buttons = stylesContainer.querySelectorAll('button')
				buttons.forEach(btn => {
					const isActive = btn.textContent === style.name
					btn.style.background = isActive ? '#007cbf' : 'white'
					btn.style.color = isActive ? 'white' : '#333'
				})
			})

			stylesContainer.appendChild(button)
		}

		container.appendChild(stylesContainer)

		// 地形誇張度コントロール
		const exaggerationContainer = document.createElement('div')
		exaggerationContainer.style.cssText = `
			margin-top: 12px;
			padding-top: 8px;
			border-top: 1px solid #ddd;
		`

		const exaggerationLabel = document.createElement('label')
		exaggerationLabel.textContent = '地形誇張: 1.5x'
		exaggerationLabel.style.cssText = `
			display: block;
			font-size: 11px;
			margin-bottom: 4px;
			color: #333;
		`

		const exaggerationSlider = document.createElement('input')
		exaggerationSlider.type = 'range'
		exaggerationSlider.min = '1.0'
		exaggerationSlider.max = '3.0'
		exaggerationSlider.step = '0.1'
		exaggerationSlider.value = '1.5'
		exaggerationSlider.style.cssText = `
			width: 100%;
		`

		exaggerationSlider.addEventListener('input', e => {
			const value = parseFloat((e.target as HTMLInputElement).value)
			this.setTerrainExaggeration(value)
			exaggerationLabel.textContent = `地形誇張: ${value.toFixed(1)}x`
		})

		exaggerationContainer.appendChild(exaggerationLabel)
		exaggerationContainer.appendChild(exaggerationSlider)
		container.appendChild(exaggerationContainer)

		return container
	}
}
