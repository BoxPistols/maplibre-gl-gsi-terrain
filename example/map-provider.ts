/**
 * Map Provider Abstraction Layer
 * MapLibre GL と Mapbox GL の実行時切り替えをサポート
 */

import type maplibregl from 'maplibre-gl'
import type mapboxgl from 'mapbox-gl'

export type MapProvider = 'maplibre' | 'mapbox'

export interface MapInstance {
	Map: typeof maplibregl.Map | typeof mapboxgl.Map
	GeoJSONSource: typeof maplibregl.GeoJSONSource | typeof mapboxgl.GeoJSONSource
	LngLat: typeof maplibregl.LngLat | typeof mapboxgl.LngLat
	addProtocol: typeof maplibregl.addProtocol | typeof mapboxgl.addProtocol
}

export interface MapProviderConfig {
	provider: MapProvider
	mapboxAccessToken?: string
}

/**
 * マッププロバイダーをロード
 */
export async function loadMapProvider(config: MapProviderConfig): Promise<MapInstance> {
	console.log(`マッププロバイダーをロード中: ${config.provider}`)

	if (config.provider === 'mapbox') {
		const mapboxgl = await import('mapbox-gl')
		await import('mapbox-gl/dist/mapbox-gl.css')

		// Mapbox アクセストークンの設定
		if (config.mapboxAccessToken) {
			mapboxgl.default.accessToken = config.mapboxAccessToken
			console.log('Mapbox アクセストークンを設定しました')
		} else {
			console.warn('Mapbox アクセストークンが未設定です')
		}

		return {
			Map: mapboxgl.default.Map as any,
			GeoJSONSource: mapboxgl.default.GeoJSONSource as any,
			LngLat: mapboxgl.default.LngLat as any,
			addProtocol: mapboxgl.default.addProtocol as any,
		}
	} else {
		// MapLibre (デフォルト)
		const maplibregl = await import('maplibre-gl')
		await import('maplibre-gl/dist/maplibre-gl.css')

		return {
			Map: maplibregl.default.Map as any,
			GeoJSONSource: maplibregl.default.GeoJSONSource as any,
			LngLat: maplibregl.default.LngLat as any,
			addProtocol: maplibregl.default.addProtocol as any,
		}
	}
}

/**
 * 利用可能なマッププロバイダーのリスト
 */
export const AVAILABLE_PROVIDERS: { value: MapProvider; label: string; description: string }[] = [
	{
		value: 'maplibre',
		label: 'MapLibre GL',
		description: 'オープンソース地図ライブラリ（推奨）',
	},
	{
		value: 'mapbox',
		label: 'Mapbox GL',
		description: '商用地図サービス（要アクセストークン）',
	},
]

/**
 * ローカルストレージから設定を読み込み
 */
export function loadProviderConfig(): MapProviderConfig {
	const savedProvider = localStorage.getItem('mapProvider') as MapProvider | null
	const savedToken = localStorage.getItem('mapboxAccessToken')

	return {
		provider: savedProvider || 'maplibre',
		mapboxAccessToken: savedToken || undefined,
	}
}

/**
 * ローカルストレージに設定を保存
 */
export function saveProviderConfig(config: MapProviderConfig): void {
	localStorage.setItem('mapProvider', config.provider)
	if (config.mapboxAccessToken) {
		localStorage.setItem('mapboxAccessToken', config.mapboxAccessToken)
	} else {
		localStorage.removeItem('mapboxAccessToken')
	}
	console.log('マッププロバイダー設定を保存しました:', config.provider)
}
