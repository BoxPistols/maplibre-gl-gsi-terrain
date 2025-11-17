import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
	clearData,
	convertDroneObjectToUnified,
	convertUnifiedToDroneObject,
	createFlightMission,
	downloadFile,
	exportDroneDataToCSV,
	exportDroneDataToGeoJSON,
	exportFlightMissionToKML,
	exportUnifiedFlightDataToCSV,
	exportUnifiedFlightDataToGeoJSON,
	generateSampleDroneData,
	importDataFromFile,
	parseDroneCSV,
	parseFlightMissionJSON,
	parseGeoJSON,
	parseUnifiedFlightDataCSV,
	parseUnifiedFlightDataGeoJSON,
	type DroneObject,
	type UnifiedFlightData,
} from '../src/data-import-export'
import { getGsiDemProtocolAction } from '../src/terrain.ts'

// 新しいモジュールをインポート
import { MapStyleManager } from './modules/MapStyleManager'
import { FlightController } from './modules/FlightController'
import { DroneModel } from './modules/DroneModel'
import { GameController } from './modules/GameController'
import { TouchController } from './modules/TouchController'
import type { FlightPlanData, FlightPlanPhase } from './modules/types'

// サンプルデータの定義
const SAMPLE_FLIGHT_DATA = `id,name,type,source,longitude,latitude,altitude,relativeAltitude,timestamp,duration,speed,heading,action,waypointId,sequenceNumber,batteryLevel,signalStrength,gpsAccuracy,temperature,humidity,windSpeed,windDirection,missionId,operatorId,aircraftModel,aircraftSerial,description
flight_001,東京タワー点検1,waypoint,manual,139.7454,35.6586,100,50,2024-01-15T10:00:00Z,30,5,0,takeoff,1,1,85,-45,2,25,60,3,180,mission_001,operator_001,DJI_Mavic_3,SN001,東京タワー点検開始
flight_002,東京タワー点検2,waypoint,manual,139.7456,35.6588,120,70,2024-01-15T10:01:00Z,45,8,90,hover,2,2,82,-48,1.5,24,58,2.5,175,mission_001,operator_001,DJI_Mavic_3,SN001,東京タワー点検中
flight_003,東京タワー点検3,waypoint,manual,139.7458,35.6590,150,100,2024-01-15T10:02:00Z,60,6,180,move,3,3,79,-50,2,23,55,3,170,mission_001,operator_001,DJI_Mavic_3,SN001,東京タワー点検完了`

const SAMPLE_TRAJECTORY_DATA = `id,name,type,source,longitude,latitude,altitude,relativeAltitude,timestamp,duration,speed,heading,action,waypointId,sequenceNumber,batteryLevel,signalStrength,gpsAccuracy,temperature,humidity,windSpeed,windDirection,missionId,operatorId,aircraftModel,aircraftSerial,description
trajectory_001,軌跡点1,trajectory_point,auto,139.7450,35.6580,50,0,2024-01-15T09:55:00Z,10,3,0,takeoff,1,1,90,-40,1,26,65,1,180,trajectory_001,operator_001,DJI_Mavic_3,SN001,自動飛行開始
trajectory_002,軌跡点2,trajectory_point,auto,139.7452,35.6582,75,25,2024-01-15T09:56:00Z,15,5,45,move,2,2,88,-42,1.2,25,63,1.5,175,trajectory_001,operator_001,DJI_Mavic_3,SN001,自動飛行中
trajectory_003,軌跡点3,trajectory_point,auto,139.7454,35.6584,100,50,2024-01-15T09:57:00Z,20,7,90,move,3,3,85,-45,1.5,24,60,2,170,trajectory_001,operator_001,DJI_Mavic_3,SN001,自動飛行中
trajectory_004,軌跡点4,trajectory_point,auto,139.7456,35.6586,125,75,2024-01-15T09:58:00Z,25,6,135,move,4,4,82,-48,1.8,23,57,2.5,165,trajectory_001,operator_001,DJI_Mavic_3,SN001,自動飛行中
trajectory_005,軌跡点5,trajectory_point,auto,139.7458,35.6588,150,100,2024-01-15T09:59:00Z,30,4,180,land,5,5,79,-50,2,22,55,3,160,trajectory_001,operator_001,DJI_Mavic_3,SN001,自動飛行終了`

// グローバルエラーハンドラー
window.addEventListener('error', e => {
	console.error('グローバルエラー:', e.error || e.message)
	alert(
		`致命的なエラーが発生しました:\n${e.error?.message || e.message}\n\nページをリロードしてください。`
	)
})

window.addEventListener('unhandledrejection', e => {
	console.error('未処理のPromise拒否:', e.reason)
	alert(`非同期エラーが発生しました:\n${e.reason}\n\nページをリロードしてください。`)
})

console.log('🚀 アプリケーション起動中...')

// 地理院DEM設定
const protocolAction = getGsiDemProtocolAction('gsidem')
maplibregl.addProtocol('gsidem', protocolAction)
const gsiTerrainSource = {
	type: 'raster-dem' as const,
	tiles: ['gsidem://https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png'],
	tileSize: 256,
	encoding: 'terrarium' as const,
	minzoom: 1,
	maxzoom: 14, // 地理院DEMタイルは最大14まで提供
	attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
}

// 地図初期化
const map = new maplibregl.Map({
	container: 'map',
	zoom: 15,
	center: [139.7454, 35.6586], // 東京タワー
	minZoom: 5,
	maxZoom: 18,
	pitch: 60,
	maxPitch: 85,
	style: {
		version: 8,
		sources: {
			seamlessphoto: {
				type: 'raster',
				tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
				maxzoom: 18,
				tileSize: 256,
				attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
			},
			terrain: gsiTerrainSource,
			'drone-objects': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'drone-connections': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'altitude-lines': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'drawing-polygon': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'selected-object': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'flight-plan-waypoints': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
			'flight-plan-path': {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			},
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

// マップエラーハンドリング
map.on('error', e => {
	console.error('マップエラー:', e)
	const errorMessage = e.error?.message || 'マップのロードに失敗しました'
	alert(`エラーが発生しました: ${errorMessage}\n\nコンソールで詳細を確認してください。`)
	updateStatus(`エラー: ${errorMessage}`)
})

console.log('マップ初期化完了 - loadイベント待機中...')

// グローバル変数
let loadedObjects: DroneObject[] = []
let is3D = true
let drawMode = false
let polygonDrawingMode = false
let editMode = false
let selectedObject: DroneObject | null = null
let isDragging = false
let dragStartPos: [number, number] | null = null
let currentPolygonPoints: [number, number][] = []
let droneSimulationInterval: number | null = null
let sampleDataLoaded = false

// 新しいモジュールのインスタンス
let mapStyleManager: MapStyleManager
let flightController: FlightController
let droneModel: DroneModel
let gameController: GameController
let touchController: TouchController
let gameControlActive = false
let touchControlActive = false

// フライトログ管理
interface FlightLogEntry {
	timestamp: string
	phase: string
	action: string
	details: string
	type: 'info' | 'success' | 'error' | 'warning'
	// 位置情報（オプショナル）
	position?: {
		latitude: number
		longitude: number
		altitude: number
	}
	// カメラ情報（オプショナル）
	camera?: {
		bearing: number
		pitch: number
		zoom: number
	}
}

let flightLog: FlightLogEntry[] = []
let flightPlanActive = false
let currentFlightPhase = 0

// 動的フライトプラン管理
let currentFlightPlan: FlightPlanPhase[] = []
let currentFlightPlanName = ''
let currentFlightPlanDescription = ''

// デフォルトのフライトプラン定義（東京タワー）
const defaultFlightPlan: FlightPlanPhase[] = [
	{
		phase: '離陸',
		action: '東京タワー南側から離陸開始',
		duration: 3000,
		position: [139.7454, 35.6586, 100],
	},
	{
		phase: '外側旋回1',
		action: '北東角へ移動・ホバリング',
		duration: 4000,
		position: [139.7456, 35.6588, 150],
	},
	{
		phase: '外側旋回2',
		action: '北西角へ移動・ホバリング',
		duration: 4000,
		position: [139.7452, 35.6588, 150],
	},
	{
		phase: '外側旋回3',
		action: '南西角へ移動・ホバリング',
		duration: 4000,
		position: [139.7452, 35.6584, 150],
	},
	{
		phase: '外側旋回4',
		action: '南東角へ移動・ホバリング',
		duration: 4000,
		position: [139.7456, 35.6584, 150],
	},
	{
		phase: '内側旋回1',
		action: '内側北東へ移動・詳細撮影',
		duration: 3000,
		position: [139.7455, 35.6587, 120],
	},
	{
		phase: '内側旋回2',
		action: '内側北西へ移動・詳細撮影',
		duration: 3000,
		position: [139.7453, 35.6587, 120],
	},
	{
		phase: '内側旋回3',
		action: '内側南西へ移動・詳細撮影',
		duration: 3000,
		position: [139.7453, 35.6585, 120],
	},
	{
		phase: '内側旋回4',
		action: '内側南東へ移動・詳細撮影',
		duration: 3000,
		position: [139.7455, 35.6585, 120],
	},
	{
		phase: '中心部撮影',
		action: '東京タワー中心部で詳細撮影',
		duration: 5000,
		position: [139.7454, 35.6586, 200],
	},
	{
		phase: '着陸',
		action: '離陸地点に戻って着陸',
		duration: 3000,
		position: [139.7454, 35.6586, 0],
	},
]

// 初期化時にデフォルトプランを設定
currentFlightPlan = defaultFlightPlan
currentFlightPlanName = '東京タワー点検フライトプラン'
currentFlightPlanDescription = '東京タワー周辺の包括的点検フライトプラン'

// Toast通知システム
const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
	const toast = document.createElement('div')
	toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'rgba(34, 197, 94, 0.9)' : type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)'};
        backdrop-filter: blur(4px);
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        border: 1px solid ${type === 'success' ? 'rgba(34, 197, 94, 0.3)' : type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'};
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
    `
	toast.textContent = message
	document.body.appendChild(toast)

	// アニメーション開始
	setTimeout(() => {
		toast.style.transform = 'translateX(0)'
		toast.style.opacity = '1'
	}, 100)

	// 自動で消える
	setTimeout(() => {
		toast.style.transform = 'translateX(100%)'
		toast.style.opacity = '0'
		setTimeout(() => {
			if (document.body.contains(toast)) {
				document.body.removeChild(toast)
			}
		}, 300)
	}, 3000)
}

// フライトログ管理機能
const addFlightLog = (
	phase: string,
	action: string,
	details: string,
	type: 'info' | 'success' | 'error' | 'warning' = 'info',
	position?: { latitude: number; longitude: number; altitude: number },
	camera?: { bearing: number; pitch: number; zoom: number }
) => {
	const now = new Date()
	const timestamp = now.toLocaleTimeString('ja-JP')

	const logEntry: FlightLogEntry = {
		timestamp,
		phase,
		action,
		details,
		type,
		...(position && { position }),
		...(camera && { camera }),
	}

	flightLog.push(logEntry)
	updateFlightLogDisplay()

	// ログが多すぎる場合は古いものを削除
	if (flightLog.length > 50) {
		flightLog = flightLog.slice(-30)
	}
}

const updateFlightLogDisplay = () => {
	const statusContainer = document.getElementById('flightStatus')
	const logContainer = document.getElementById('flightLog')
	const logScrollContainer = document.getElementById('flightLogContainer')

	if (!statusContainer || !logContainer || !logScrollContainer) return

	// ステータスバーの更新
	statusContainer.innerHTML = ''
	if (flightPlanActive && currentFlightPlan.length > 0) {
		const statusBar = document.createElement('div')
		statusBar.className = 'flight-status-bar'
		statusBar.innerHTML = `
			<div class="status-indicator active">
				<span class="status-dot"></span>
				<span class="status-text">フライト実行中</span>
			</div>
			<div class="current-phase">
				<span class="phase-label">現在:</span>
				<span class="phase-name">${currentFlightPlan[currentFlightPhase]?.phase || '待機中'}</span>
				<span class="phase-number">(${currentFlightPhase + 1}/${currentFlightPlan.length})</span>
			</div>
		`
		statusContainer.appendChild(statusBar)
	} else if (currentFlightPlan.length > 0) {
		const statusBar = document.createElement('div')
		statusBar.className = 'flight-status-bar'
		statusBar.innerHTML = `
			<div class="status-indicator standby">
				<span class="status-dot"></span>
				<span class="status-text">待機中</span>
			</div>
			<div class="current-phase">
				<span class="phase-label">フライトプラン:</span>
				<span class="phase-name">${currentFlightPlanName}</span>
			</div>
		`
		statusContainer.appendChild(statusBar)
	}

	// ログエントリの更新
	logContainer.innerHTML = ''
	flightLog.forEach((entry, index) => {
		const logEntry = document.createElement('div')
		const isLatest = index === flightLog.length - 1
		const isRecent = index >= flightLog.length - 3

		logEntry.className = `log-entry ${isLatest ? 'log-entry-latest' : ''} ${isRecent ? 'log-entry-recent' : ''}`

		const timestamp = document.createElement('span')
		timestamp.className = 'log-timestamp'
		timestamp.textContent = entry.timestamp

		const phase = document.createElement('span')
		phase.className = 'log-phase'
		phase.textContent = entry.phase

		const action = document.createElement('span')
		action.className = `log-action ${entry.type}`
		action.textContent = entry.action

		const details = document.createElement('span')
		details.className = 'log-details'
		details.textContent = entry.details

		// 最新のログにインジケーターを追加
		if (isLatest) {
			const indicator = document.createElement('span')
			indicator.className = 'latest-indicator'
			indicator.textContent = '●'
			logEntry.insertBefore(indicator, logEntry.firstChild)
		}

		logEntry.appendChild(timestamp)
		logEntry.appendChild(phase)
		logEntry.appendChild(action)
		logEntry.appendChild(details)

		// 位置情報とカメラ情報を追加表示
		if (entry.position || entry.camera) {
			const extendedInfo = document.createElement('div')
			extendedInfo.className = 'log-extended-info'

			if (entry.position) {
				const positionInfo = document.createElement('div')
				positionInfo.className = 'log-position-info'
				positionInfo.innerHTML = `
					<span class="info-label">位置:</span>
					<span class="info-value">緯度 ${entry.position.latitude.toFixed(6)}°</span>
					<span class="info-value">経度 ${entry.position.longitude.toFixed(6)}°</span>
					<span class="info-value">高度 ${entry.position.altitude.toFixed(1)}m</span>
				`
				extendedInfo.appendChild(positionInfo)
			}

			if (entry.camera) {
				const cameraInfo = document.createElement('div')
				cameraInfo.className = 'log-camera-info'
				cameraInfo.innerHTML = `
					<span class="info-label">カメラ:</span>
					<span class="info-value">方位 ${entry.camera.bearing.toFixed(1)}°</span>
					<span class="info-value">チルト ${entry.camera.pitch}°</span>
					<span class="info-value">ズーム ${entry.camera.zoom}</span>
				`
				extendedInfo.appendChild(cameraInfo)
			}

			logEntry.appendChild(extendedInfo)
		}

		logContainer.appendChild(logEntry)
	})

	// 最新のログまでスクロール（スクロールコンテナに対して実行）
	setTimeout(() => {
		logScrollContainer.scrollTop = logScrollContainer.scrollHeight
	}, 50) // 少し遅延させてDOMの更新を待つ
}

const clearFlightLog = () => {
	flightLog = []
	updateFlightLogDisplay()
	addFlightLog('システム', 'ログクリア', 'フライトログをクリアしました', 'info')
}

const exportFlightLog = () => {
	const logText = flightLog
		.map(entry => {
			const base = `${entry.timestamp},${entry.phase},${entry.action},${entry.details},${entry.type}`
			const lat = entry.position?.latitude.toFixed(6) || ''
			const lng = entry.position?.longitude.toFixed(6) || ''
			const alt = entry.position?.altitude.toFixed(1) || ''
			const bearing = entry.camera?.bearing.toFixed(1) || ''
			const pitch = entry.camera?.pitch || ''
			const zoom = entry.camera?.zoom || ''
			return `${base},${lat},${lng},${alt},${bearing},${pitch},${zoom}`
		})
		.join('\n')

	const headers =
		'timestamp,phase,action,details,type,latitude,longitude,altitude,bearing,pitch,zoom\n'
	const csvContent = headers + logText

	const blob = new Blob([csvContent], { type: 'text/csv' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `tokyo_tower_flight_log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)

	addFlightLog(
		'システム',
		'ログエクスポート',
		'フライトログをCSVファイルでエクスポートしました',
		'success'
	)
}

// ステータス更新
const updateStatus = (message: string) => {
	const statusElement = document.getElementById('status')
	if (statusElement) {
		statusElement.textContent = message
	}
	console.log('Status:', message)
}

// レイヤー設定
const setupLayers = () => {
	// 高度表示ライン
	map.addLayer({
		id: 'altitude-lines-layer',
		type: 'line',
		source: 'altitude-lines',
		paint: {
			'line-color': '#ffaa00',
			'line-width': 1,
			'line-opacity': 0.4,
		},
	})

	// 多角形レイヤー
	map.addLayer({
		id: 'polygon-fill-layer',
		type: 'fill',
		source: 'drone-objects',
		filter: ['==', ['get', 'type'], 'polygon'],
		paint: {
			'fill-color': '#ff6b6b',
			'fill-opacity': 0.3,
		},
	})

	map.addLayer({
		id: 'polygon-stroke-layer',
		type: 'line',
		source: 'drone-objects',
		filter: ['==', ['get', 'type'], 'polygon'],
		paint: {
			'line-color': '#ff6b6b',
			'line-width': 2,
			'line-opacity': 0.8,
		},
	})

	// ドローンオブジェクト（3D）
	map.addLayer({
		id: 'drone-objects-3d',
		type: 'circle',
		source: 'drone-objects',
		filter: ['!=', ['get', 'type'], 'polygon'],
		paint: {
			'circle-radius': [
				'interpolate',
				['linear'],
				['zoom'],
				10,
				['interpolate', ['linear'], ['get', 'altitude'], 50, 3, 300, 8],
				18,
				['interpolate', ['linear'], ['get', 'altitude'], 50, 6, 300, 16],
			],
			'circle-color': [
				'match',
				['get', 'type'],
				'drone',
				'#ff4444',
				'building',
				'#44ff44',
				'sensor',
				'#4444ff',
				'base',
				'#ffaa00',
				'weather',
				'#ff44ff',
				'manual',
				'#888888',
				'flight',
				'#ff6b6b',
				'#cccccc',
			],
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.9,
		},
	})

	// ドローンオブジェクト（2D）
	map.addLayer({
		id: 'drone-objects-2d',
		type: 'circle',
		source: 'drone-objects',
		filter: ['!=', ['get', 'type'], 'polygon'],
		layout: { visibility: 'none' },
		paint: {
			'circle-radius': 6,
			'circle-color': [
				'match',
				['get', 'type'],
				'drone',
				'#ff4444',
				'building',
				'#44ff44',
				'sensor',
				'#4444ff',
				'base',
				'#ffaa00',
				'weather',
				'#ff44ff',
				'manual',
				'#888888',
				'flight',
				'#ff6b6b',
				'#cccccc',
			],
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.9,
		},
	})

	// 接続線
	map.addLayer({
		id: 'drone-connections',
		type: 'line',
		source: 'drone-connections',
		paint: {
			'line-color': '#00ff00',
			'line-width': 2,
			'line-opacity': 0.7,
			'line-dasharray': [2, 2],
		},
	})

	// ラベル
	map.addLayer({
		id: 'drone-labels',
		type: 'symbol',
		source: 'drone-objects',
		layout: {
			'text-field': [
				'format',
				['get', 'name'],
				{},
				'\n',
				{},
				['concat', ['to-string', ['get', 'altitude']], 'm'],
				{ 'font-scale': 0.8 },
			],
			'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
			'text-size': 12,
			'text-offset': [0, -2],
			'text-anchor': 'bottom',
		},
		paint: {
			'text-color': '#ffffff',
			'text-halo-color': '#000000',
			'text-halo-width': 1,
		},
	})

	// 多角形描画レイヤー
	map.addLayer({
		id: 'polygon-fill',
		type: 'fill',
		source: 'drawing-polygon',
		paint: {
			'fill-color': '#ff6b6b',
			'fill-opacity': 0.3,
		},
	})

	map.addLayer({
		id: 'polygon-stroke',
		type: 'line',
		source: 'drawing-polygon',
		paint: {
			'line-color': '#ff6b6b',
			'line-width': 3,
			'line-opacity': 0.8,
		},
	})

	map.addLayer({
		id: 'polygon-points',
		type: 'circle',
		source: 'drawing-polygon',
		paint: {
			'circle-radius': 6,
			'circle-color': '#ff6b6b',
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
		},
	})

	// 選択オブジェクトのハイライト表示
	map.addLayer({
		id: 'selected-object-highlight',
		type: 'fill',
		source: 'selected-object',
		paint: {
			'fill-color': '#00ff00',
			'fill-opacity': 0.2,
		},
	})

	map.addLayer({
		id: 'selected-object-stroke',
		type: 'line',
		source: 'selected-object',
		paint: {
			'line-color': '#00ff00',
			'line-width': 4,
			'line-opacity': 0.8,
		},
	})

	map.addLayer({
		id: 'selected-object-points',
		type: 'circle',
		source: 'selected-object',
		paint: {
			'circle-radius': 8,
			'circle-color': '#00ff00',
			'circle-stroke-width': 3,
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.9,
		},
	})

	// フライトプランパス（線）
	map.addLayer({
		id: 'flight-plan-path-layer',
		type: 'line',
		source: 'flight-plan-path',
		paint: {
			'line-color': '#00ffff',
			'line-width': 3,
			'line-opacity': 0.8,
		},
		layout: {
			'line-cap': 'round',
			'line-join': 'round',
		},
	})

	// フライトプランウェイポイント（マーカー）
	map.addLayer({
		id: 'flight-plan-waypoints-layer',
		type: 'circle',
		source: 'flight-plan-waypoints',
		paint: {
			'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 18, 12],
			'circle-color': '#00ffff',
			'circle-stroke-width': 3,
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.9,
		},
	})

	// フライトプランウェイポイントラベル
	map.addLayer({
		id: 'flight-plan-waypoint-labels',
		type: 'symbol',
		source: 'flight-plan-waypoints',
		layout: {
			'text-field': ['get', 'name'],
			'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
			'text-size': 12,
			'text-offset': [0, -2],
			'text-anchor': 'bottom',
		},
		paint: {
			'text-color': '#00ffff',
			'text-halo-color': '#000000',
			'text-halo-width': 2,
		},
	})
}

// フライトプラン可視化更新
const updateFlightPlanVisualization = (flightPlan: FlightPlanPhase[]) => {
	const setGeoJsonSourceData = (sourceId: string, features: GeoJSON.Feature[]) => {
		const source = map.getSource(sourceId)
		if (source?.type === 'geojson') {
			;(source as maplibregl.GeoJSONSource).setData({
				type: 'FeatureCollection',
				features: features,
			})
		}
	}

	if (!flightPlan || flightPlan.length === 0) {
		// フライトプランがない場合は空のデータを設定
		setGeoJsonSourceData('flight-plan-waypoints', [])
		setGeoJsonSourceData('flight-plan-path', [])
		return
	}

	// ウェイポイントのGeoJSON作成
	const waypointFeatures = flightPlan.map((phase, index) => ({
		type: 'Feature' as const,
		geometry: {
			type: 'Point' as const,
			coordinates: [phase.position[0], phase.position[1]],
		},
		properties: {
			id: `waypoint-${index}`,
			name: `WP${index + 1}: ${phase.phase}`,
			phase: phase.phase,
			action: phase.action,
			altitude: phase.position[2],
			sequenceNumber: index + 1,
		},
	}))

	// パス（線）のGeoJSON作成
	const pathCoordinates = flightPlan.map(phase => [
		phase.position[0],
		phase.position[1],
		phase.position[2],
	])

	const pathFeature = {
		type: 'Feature' as const,
		geometry: {
			type: 'LineString' as const,
			coordinates: pathCoordinates,
		},
		properties: {
			id: 'flight-path',
			name: 'Flight Path',
		},
	}

	// マップソースを更新
	setGeoJsonSourceData('flight-plan-waypoints', waypointFeatures)
	setGeoJsonSourceData('flight-plan-path', [pathFeature])

	console.log(
		`フライトプラン可視化を更新: ${flightPlan.length}個のウェイポイント、パス長: ${pathCoordinates.length}`
	)
}

// 表示更新
const updateDisplay = () => {
	// オブジェクト表示
	const features = loadedObjects.map(obj => {
		const extendedObj = obj as DroneObject & { geometry?: any; area?: number } // 拡張プロパティアクセス用

		if (obj.type === 'polygon' && extendedObj.geometry) {
			// 多角形の場合は保存されたgeometryを使用
			const feature = {
				type: 'Feature' as const,
				geometry: extendedObj.geometry,
				properties: {
					id: obj.id,
					name: obj.name,
					altitude: obj.altitude,
					type: obj.type,
					area: extendedObj.area || 0,
				},
			}
			console.log('多角形フィーチャー作成:', feature)
			return feature
		} else {
			// 点の場合は従来通り
			return {
				type: 'Feature' as const,
				geometry: {
					type: 'Point' as const,
					coordinates: [obj.longitude, obj.latitude],
				},
				properties: {
					id: obj.id,
					name: obj.name,
					altitude: obj.altitude,
					type: obj.type,
				},
			}
		}
	})

	console.log('updateDisplay: 全フィーチャー:', features)

	const geoJSONData = {
		type: 'FeatureCollection' as const,
		features: features,
	}

	console.log('drone-objectsソースに設定するデータ:', geoJSONData)
	;(map.getSource('drone-objects') as maplibregl.GeoJSONSource)?.setData(geoJSONData)

	// 高度ライン表示
	const altitudeFeatures = loadedObjects.map(obj => ({
		type: 'Feature' as const,
		geometry: {
			type: 'LineString' as const,
			coordinates: [
				[obj.longitude, obj.latitude],
				[obj.longitude, obj.latitude],
			],
		},
		properties: {
			altitude: obj.altitude,
		},
	}))

	;(map.getSource('altitude-lines') as maplibregl.GeoJSONSource)?.setData({
		type: 'FeatureCollection',
		features: altitudeFeatures,
	})

	// 接続線表示
	updateConnections()

	console.log(`表示更新: ${loadedObjects.length}個のオブジェクト`)
}

// 接続線更新
const updateConnections = () => {
	if (loadedObjects.length < 2) {
		;(map.getSource('drone-connections') as maplibregl.GeoJSONSource)?.setData({
			type: 'FeatureCollection',
			features: [],
		})
		return
	}

	// タイプ別にグループ化して接続線作成
	const typeGroups: { [key: string]: DroneObject[] } = {}
	loadedObjects.forEach(obj => {
		if (!typeGroups[obj.type]) typeGroups[obj.type] = []
		typeGroups[obj.type].push(obj)
	})

	const connectionFeatures: Array<{
		type: 'Feature'
		geometry: {
			type: 'LineString'
			coordinates: [number, number][]
		}
		properties: {
			type: string
		}
	}> = []
	Object.values(typeGroups).forEach(objects => {
		if (objects.length >= 2) {
			const coordinates: [number, number][] = objects.map(obj => [obj.longitude, obj.latitude])
			connectionFeatures.push({
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: coordinates,
				},
				properties: {
					type: 'connection',
				},
			})
		}
	})
	;(map.getSource('drone-connections') as maplibregl.GeoJSONSource)?.setData({
		type: 'FeatureCollection',
		features: connectionFeatures,
	})
}

// 多角形描画関数
const handlePolygonClick = (lngLat: maplibregl.LngLat) => {
	const point: [number, number] = [lngLat.lng, lngLat.lat]

	// 3点以上ある場合、始点に近いかチェック
	if (currentPolygonPoints.length >= 3) {
		const firstPoint = currentPolygonPoints[0]
		const distance = Math.sqrt(
			Math.pow((point[0] - firstPoint[0]) * 111000, 2) +
				Math.pow((point[1] - firstPoint[1]) * 111000, 2)
		)

		// 100m以内なら多角形を完成
		if (distance < 100) {
			completePolygon()
			return
		}
	}

	currentPolygonPoints.push(point)
	updatePolygonDisplay()

	showToast(
		`頂点${currentPolygonPoints.length}を追加 (${currentPolygonPoints.length >= 3 ? '始点をクリックして完成' : ''})`,
		'info'
	)
}

const updatePolygonDisplay = () => {
	const features: (
		| PointFeature
		| {
				type: 'Feature'
				geometry: {
					type: 'LineString'
					coordinates: [number, number][]
				}
				properties: {
					type: string
				}
		  }
	)[] = []

	// 現在の点を表示
	type PointFeature = {
		type: 'Feature'
		geometry: {
			type: 'Point'
			coordinates: [number, number]
		}
		properties: {
			index: number
			isFirst: boolean
		}
	}

	currentPolygonPoints.forEach((point, index) => {
		const feature: PointFeature = {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: point,
			},
			properties: {
				index,
				isFirst: index === 0,
			},
		}
		features.push(feature)
	})

	// 3点以上あれば線も表示
	if (currentPolygonPoints.length >= 2) {
		const lineCoords = [...currentPolygonPoints]
		// 描画中は最後の点から最初の点への線も表示（3点以上の場合）
		if (currentPolygonPoints.length >= 3) {
			lineCoords.push(currentPolygonPoints[0])
		}

		features.push({
			type: 'Feature' as const,
			geometry: {
				type: 'LineString' as const,
				coordinates: lineCoords,
			},
			properties: {
				type: 'drawing-line',
			},
		})
	}

	;(map.getSource('drawing-polygon') as maplibregl.GeoJSONSource).setData({
		type: 'FeatureCollection',
		features: features,
	})
}

const completePolygon = () => {
	if (currentPolygonPoints.length < 3) {
		showToast('多角形を作成するには最低3点が必要です', 'warning')
		return
	}

	// 多角形を閉じる
	const closedPoints = [...currentPolygonPoints, currentPolygonPoints[0]]

	// 面積計算 (概算)
	const area = calculatePolygonArea(currentPolygonPoints)

	// 多角形オブジェクトとして保存
	const polygonObject = {
		id: `polygon_${Date.now()}`,
		name: `検査エリア_${loadedObjects.filter(obj => obj.type === 'polygon').length + 1}`,
		longitude: currentPolygonPoints[0][0], // 中心点代表座標
		latitude: currentPolygonPoints[0][1],
		altitude: 0,
		type: 'polygon' as const,
		source: 'polygon_draw',
		geometry: {
			type: 'Polygon',
			coordinates: [closedPoints],
		},
		area: area,
	} as DroneObject & { geometry: any; area: number }

	loadedObjects.push(polygonObject)
	console.log('多角形オブジェクトを追加:', polygonObject)
	console.log('現在のloadedObjects:', loadedObjects)

	resetPolygonDrawing()
	updateDisplay()

	showToast(`多角形「${polygonObject.name}」を作成しました (面積: ${area.toFixed(0)}㎡)`, 'success')
}

const calculatePolygonArea = (coordinates: [number, number][]): number => {
	// Shoelace formula for polygon area calculation
	let area = 0
	const n = coordinates.length

	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n
		area += coordinates[i][0] * coordinates[j][1]
		area -= coordinates[j][0] * coordinates[i][1]
	}

	// 度から平方メートルへの概算変換（緯度35度付近）
	area = Math.abs(area) / 2
	const metersPerDegree = 111000 // 概算値
	return area * metersPerDegree * metersPerDegree
}

const resetPolygonDrawing = () => {
	currentPolygonPoints = []
	;(map.getSource('drawing-polygon') as maplibregl.GeoJSONSource).setData({
		type: 'FeatureCollection',
		features: [],
	})
}

// オブジェクト選択機能
const selectObject = (lngLat: maplibregl.LngLat) => {
	const point = map.project(lngLat)
	const tolerance = 20 // クリック許容範囲（ピクセル）

	// 最も近いオブジェクトを探す
	let closestObject: DroneObject | null = null
	let minDistance = Infinity

	loadedObjects.forEach(obj => {
		const objPoint = map.project([obj.longitude, obj.latitude])
		const distance = Math.sqrt(
			Math.pow(point.x - objPoint.x, 2) + Math.pow(point.y - objPoint.y, 2)
		)

		if (distance < tolerance && distance < minDistance) {
			minDistance = distance
			closestObject = obj
		}
	})

	if (closestObject) {
		selectedObject = closestObject
		updateSelectedObjectDisplay()
		showToast(`「${(closestObject as DroneObject).name}」を選択しました`, 'info')
		return true
	} else {
		deselectObject()
		return false
	}
}

const deselectObject = () => {
	selectedObject = null
	updateSelectedObjectDisplay()
}

const updateSelectedObjectDisplay = () => {
	if (!selectedObject) {
		;(map.getSource('selected-object') as maplibregl.GeoJSONSource).setData({
			type: 'FeatureCollection',
			features: [],
		})
		return
	}

	const features: any[] = []

	if (selectedObject.type === 'polygon') {
		// 多角形の場合は形状を表示
		const polygonData = selectedObject as any // 拡張プロパティアクセス用
		if (polygonData.geometry && polygonData.geometry.coordinates) {
			features.push({
				type: 'Feature' as const,
				geometry: polygonData.geometry,
				properties: {
					id: selectedObject.id,
					type: 'selected-polygon',
				},
			})

			// 各頂点も表示
			polygonData.geometry.coordinates[0]
				.slice(0, -1)
				.forEach((coord: [number, number], index: number) => {
					features.push({
						type: 'Feature' as const,
						geometry: {
							type: 'Point' as const,
							coordinates: coord,
						},
						properties: {
							id: selectedObject!.id,
							type: 'selected-vertex',
							vertexIndex: index,
						},
					})
				})
		}
	} else {
		// 点の場合
		features.push({
			type: 'Feature' as const,
			geometry: {
				type: 'Point' as const,
				coordinates: [selectedObject.longitude, selectedObject.latitude],
			},
			properties: {
				id: selectedObject.id,
				type: 'selected-point',
			},
		})
	}

	;(map.getSource('selected-object') as maplibregl.GeoJSONSource).setData({
		type: 'FeatureCollection',
		features: features,
	})
}

// マップ操作制御関数
const disableMapInteraction = () => {
	map.dragPan.disable()
	map.scrollZoom.disable()
	map.boxZoom.disable()
	map.dragRotate.disable()
	map.keyboard.disable()
	map.doubleClickZoom.disable()
	map.touchZoomRotate.disable()
}

const enableMapInteraction = () => {
	map.dragPan.enable()
	map.scrollZoom.enable()
	map.boxZoom.enable()
	map.dragRotate.enable()
	map.keyboard.enable()
	map.doubleClickZoom.enable()
	map.touchZoomRotate.enable()
}

// オブジェクト移動機能
const startDragObject = (lngLat: maplibregl.LngLat) => {
	if (!selectedObject) return false

	isDragging = true
	dragStartPos = [lngLat.lng, lngLat.lat]
	map.getCanvas().style.cursor = 'grabbing'

	// オブジェクトドラッグ中はマップ操作を無効化
	disableMapInteraction()

	return true
}

const dragObject = (lngLat: maplibregl.LngLat) => {
	if (!isDragging || !selectedObject || !dragStartPos) return

	const deltaLng = lngLat.lng - dragStartPos[0]
	const deltaLat = lngLat.lat - dragStartPos[1]

	if (selectedObject.type === 'polygon') {
		// 多角形の場合は全頂点を移動
		const polygonData = selectedObject as any
		if (polygonData.geometry && polygonData.geometry.coordinates) {
			polygonData.geometry.coordinates[0] = polygonData.geometry.coordinates[0].map(
				(coord: [number, number]) => [coord[0] + deltaLng, coord[1] + deltaLat]
			)
		}
	}

	// オブジェクトの基準座標を更新
	selectedObject.longitude += deltaLng
	selectedObject.latitude += deltaLat

	dragStartPos = [lngLat.lng, lngLat.lat]
	updateDisplay()
	updateSelectedObjectDisplay()
}

const endDragObject = () => {
	if (isDragging && selectedObject) {
		isDragging = false
		dragStartPos = null
		map.getCanvas().style.cursor = editMode ? 'crosshair' : ''

		// マップ操作を再有効化
		enableMapInteraction()

		showToast(`「${selectedObject.name}」を移動しました`, 'success')
	}
}

// オブジェクト削除機能
const deleteSelectedObject = () => {
	if (!selectedObject) {
		showToast('削除するオブジェクトが選択されていません', 'warning')
		return
	}

	const objectName = selectedObject.name
	const confirmed = confirm(`「${objectName}」を削除しますか？`)

	if (confirmed) {
		loadedObjects = loadedObjects.filter(obj => obj.id !== selectedObject!.id)
		deselectObject()
		updateDisplay()
		showToast(`「${objectName}」を削除しました`, 'success')
	}
}

// オブジェクト追加
const addObjectAtLocation = (lngLat: maplibregl.LngLat) => {
	const newObject: DroneObject = {
		id: `manual_${Date.now()}`,
		name: `点検ポイント_${loadedObjects.filter(obj => obj.type === 'manual').length + 1}`,
		longitude: lngLat.lng,
		latitude: lngLat.lat,
		altitude: 150 + Math.random() * 100,
		type: 'manual',
		source: 'manual_draw',
	}

	loadedObjects.push(newObject)
	updateDisplay()
	showToast(`点検ポイントを追加: ${newObject.name}`, 'success')
}

// 2D/3D切り替え
const toggle3D = () => {
	is3D = !is3D
	if (is3D) {
		map.easeTo({ pitch: 60, duration: 1000 })
		map.setLayoutProperty('drone-objects-3d', 'visibility', 'visible')
		map.setLayoutProperty('drone-objects-2d', 'visibility', 'none')
		updateStatus('3D表示に切り替え')
	} else {
		map.easeTo({ pitch: 0, duration: 1000 })
		map.setLayoutProperty('drone-objects-3d', 'visibility', 'none')
		map.setLayoutProperty('drone-objects-2d', 'visibility', 'visible')
		updateStatus('2D表示に切り替え')
	}
}

// イベントハンドラー設定
const setupEventHandlers = () => {
	// ポイントデータ読み込み
	document.getElementById('loadPoints')?.addEventListener('click', async () => {
		try {
			const response = await fetch('./data/mock-3d-data.csv')
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

			const csvContent = await response.text()
			const blob = new Blob([csvContent], { type: 'text/csv' })
			const file = new File([blob], 'sample-points.csv', {
				type: 'text/csv',
			})

			await importDataFromFile(file, map, 'points')
			showToast('ポイントデータを読み込みました', 'success')
		} catch (error) {
			console.error('データ読み込みエラー:', error)
			showToast('データの読み込みに失敗しました', 'error')
		}
	})

	// メッシュデータ読み込み
	document.getElementById('loadMesh')?.addEventListener('click', async () => {
		try {
			const response = await fetch('./data/mock-mesh-data.csv')
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

			const csvContent = await response.text()
			const blob = new Blob([csvContent], { type: 'text/csv' })
			const file = new File([blob], 'sample-mesh.csv', {
				type: 'text/csv',
			})

			await importDataFromFile(file, map, 'mesh')
			showToast('メッシュデータを読み込みました', 'success')
		} catch (error) {
			console.error('データ読み込みエラー:', error)
			showToast('データの読み込みに失敗しました', 'error')
		}
	})

	// 建物点検データ読み込み
	document.getElementById('loadBuilding')?.addEventListener('click', async () => {
		try {
			console.log('建物点検データ読み込み開始')

			const [pointsResponse, meshResponse] = await Promise.all([
				fetch('./data/mock-building-inspection-points.csv'),
				fetch('./data/mock-building-inspection-mesh.csv'),
			])

			console.log('レスポンス確認:', {
				points: {
					ok: pointsResponse.ok,
					status: pointsResponse.status,
				},
				mesh: { ok: meshResponse.ok, status: meshResponse.status },
			})

			if (!pointsResponse.ok || !meshResponse.ok) {
				throw new Error(
					`建物点検データの読み込みに失敗しました: HTTP error! status: points=${pointsResponse.status}, mesh=${meshResponse.status}`
				)
			}

			const [pointsContent, meshContent] = await Promise.all([
				pointsResponse.text(),
				meshResponse.text(),
			])

			console.log('CSV内容確認:', {
				pointsLength: pointsContent.length,
				meshLength: meshContent.length,
				pointsPreview: pointsContent.substring(0, 200),
				meshPreview: meshContent.substring(0, 200),
			})

			const pointsBlob = new Blob([pointsContent], {
				type: 'text/csv',
			})
			const pointsFile = new File([pointsBlob], 'building-points.csv', {
				type: 'text/csv',
			})
			await importDataFromFile(pointsFile, map, 'building-inspection')

			const meshBlob = new Blob([meshContent], { type: 'text/csv' })
			const meshFile = new File([meshBlob], 'building-mesh.csv', {
				type: 'text/csv',
			})
			await importDataFromFile(meshFile, map, 'building-inspection-mesh')

			showToast('建物点検データを読み込みました', 'success')
		} catch (error) {
			console.error('建物点検データ読み込みエラー:', error)
			showToast(
				`建物点検データの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
				'error'
			)
		}
	})

	// ドローン点検データ読み込み
	document.getElementById('loadDroneData')?.addEventListener('click', () => {
		if (!sampleDataLoaded) {
			const sampleData = generateSampleDroneData([139.7454, 35.6586])
			loadedObjects.push(...sampleData)
			updateDisplay()
			sampleDataLoaded = true
			updateStatus(`東京タワー点検データ読み込み完了: ${sampleData.length}オブジェクト`)
			showToast('東京タワー周辺点検ドローンを配置しました', 'success')
		} else {
			showToast('点検ドローンは既に配置済みです', 'info')
		}
	})

	// 飛行シミュレーション
	document.getElementById('startSimulation')?.addEventListener('click', () => {
		if (droneSimulationInterval) {
			clearInterval(droneSimulationInterval)
			droneSimulationInterval = null
			updateStatus('シミュレーション停止')
			return
		}

		if (loadedObjects.length === 0) {
			showToast('シミュレーションするドローンがありません', 'error')
			return
		}

		updateStatus('ドローンシミュレーション開始')
		droneSimulationInterval = setInterval(() => {
			loadedObjects.forEach(obj => {
				if (obj.type === 'drone') {
					obj.longitude += (Math.random() - 0.5) * 0.0002
					obj.latitude += (Math.random() - 0.5) * 0.0002
					obj.altitude += (Math.random() - 0.5) * 10
					obj.altitude = Math.max(50, Math.min(400, obj.altitude))
				}
			})
			updateDisplay()
		}, 1000) as any
	})

	// 描画モード切り替え
	document.getElementById('toggleDrawMode')?.addEventListener('click', () => {
		drawMode = !drawMode

		if (drawMode) {
			polygonDrawingMode = false // 他のモードを無効化
			const polygonButton = document.getElementById('togglePolygonMode')
			if (polygonButton) {
				polygonButton.textContent = '多角形作成'
			}
			resetPolygonDrawing()
		}

		const button = document.getElementById('toggleDrawMode')
		if (button) {
			button.textContent = drawMode ? 'ポイント作成停止' : 'ポイント作成'
		}
		map.getCanvas().style.cursor = drawMode ? 'crosshair' : ''
		updateStatus(
			drawMode ? '描画モード有効 - マップをクリックして点検ポイントを追加' : '描画モード無効'
		)
		showToast(drawMode ? '描画モードを有効にしました' : '描画モードを無効にしました', 'info')
	})

	// 多角形描画モード切り替え
	document.getElementById('togglePolygonMode')?.addEventListener('click', () => {
		polygonDrawingMode = !polygonDrawingMode

		if (polygonDrawingMode) {
			drawMode = false // 他のモードを無効化
			const drawButton = document.getElementById('toggleDrawMode')
			if (drawButton) {
				drawButton.textContent = '描画モード'
			}
		} else {
			// 多角形描画停止時は描画中のデータのみクリア（完成した多角形は保持）
			resetPolygonDrawing()
		}

		const button = document.getElementById('togglePolygonMode')
		if (button) {
			button.textContent = polygonDrawingMode ? '多角形作成停止' : '多角形作成'
		}
		map.getCanvas().style.cursor = polygonDrawingMode ? 'crosshair' : ''
		updateStatus(
			polygonDrawingMode
				? '多角形描画モード有効 - クリックして頂点を追加、始点をクリックして完成'
				: '多角形描画モード無効'
		)
		showToast(
			polygonDrawingMode ? '多角形描画モードを有効にしました' : '多角形描画モードを無効にしました',
			'info'
		)
	})

	// 編集モード切り替え
	document.getElementById('toggleEditMode')?.addEventListener('click', () => {
		editMode = !editMode

		if (editMode) {
			drawMode = false
			polygonDrawingMode = false
			const drawButton = document.getElementById('toggleDrawMode')
			const polygonButton = document.getElementById('togglePolygonMode')
			if (drawButton) drawButton.textContent = 'ポイント作成'
			if (polygonButton) polygonButton.textContent = '多角形作成'
			resetPolygonDrawing()
		} else {
			deselectObject()
		}

		const button = document.getElementById('toggleEditMode')
		if (button) {
			button.textContent = editMode ? 'オブジェクト編集停止' : 'オブジェクト編集'
		}
		map.getCanvas().style.cursor = editMode ? 'crosshair' : ''
		updateStatus(
			editMode
				? '編集モード有効 - オブジェクトをクリックして選択、ドラッグで移動、Deleteキーで削除'
				: '編集モード無効'
		)
		showToast(editMode ? '編集モードを有効にしました' : '編集モードを無効にしました', 'info')
	})

	// CSVインポート
	document.getElementById('importCSV')?.addEventListener('click', () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.csv'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (file) {
				try {
					updateStatus('CSVファイル読み込み中...')
					const csvContent = await file.text()
					const importedObjects = parseDroneCSV(csvContent, file.name)

					if (importedObjects.length > 0) {
						loadedObjects.push(...importedObjects)
						updateDisplay()
						updateStatus(`CSV読み込み完了: ${importedObjects.length}個のオブジェクト`)
						showToast(
							`CSVから${importedObjects.length}個のオブジェクトをインポートしました`,
							'success'
						)
						addFlightLog(
							'データ管理',
							'CSVインポート',
							`${file.name}から${importedObjects.length}個のオブジェクトを読み込み`,
							'success'
						)
					} else {
						showToast('CSVファイルからデータを読み込めませんでした', 'warning')
						addFlightLog('データ管理', 'CSVインポート', 'CSVファイルの読み込みに失敗', 'warning')
					}
				} catch (error) {
					console.error('CSVインポートエラー:', error)
					showToast('CSVファイルの読み込みに失敗しました', 'error')
					addFlightLog('データ管理', 'CSVインポートエラー', `${file.name}の読み込みに失敗`, 'error')
					updateStatus('CSVインポートエラー')
				}
			}
		}
		input.click()
	})

	// GeoJSONインポート
	document.getElementById('importGeoJSON')?.addEventListener('click', () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.geojson,.json'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (file) {
				try {
					updateStatus('GeoJSONファイル読み込み中...')
					const jsonContent = await file.text()
					const importedObjects = parseGeoJSON(jsonContent, file.name)

					if (importedObjects.length > 0) {
						loadedObjects.push(...importedObjects)
						updateDisplay()
						updateStatus(`GeoJSON読み込み完了: ${importedObjects.length}個のオブジェクト`)
						showToast(
							`GeoJSONから${importedObjects.length}個のオブジェクトをインポートしました`,
							'success'
						)
						addFlightLog(
							'データ管理',
							'GeoJSONインポート',
							`${file.name}から${importedObjects.length}個のオブジェクトを読み込み`,
							'success'
						)
					} else {
						showToast('GeoJSONファイルからデータを読み込めませんでした', 'warning')
						addFlightLog(
							'データ管理',
							'GeoJSONインポート',
							'GeoJSONファイルの読み込みに失敗',
							'warning'
						)
					}
				} catch (error) {
					console.error('GeoJSONインポートエラー:', error)
					showToast('GeoJSONファイルの読み込みに失敗しました', 'error')
					addFlightLog(
						'データ管理',
						'GeoJSONインポートエラー',
						`${file.name}の読み込みに失敗`,
						'error'
					)
					updateStatus('GeoJSONインポートエラー')
				}
			}
		}
		input.click()
	})

	// CSVエクスポート
	document.getElementById('exportCSV')?.addEventListener('click', () => {
		if (loadedObjects.length > 0) {
			const csv = exportDroneDataToCSV(loadedObjects)
			downloadFile(csv, 'tokyo_tower_drone_data.csv', 'text/csv')
			updateStatus('CSV書き出し完了')
			showToast('CSVファイルをダウンロードしました', 'success')
		} else {
			showToast('エクスポートするデータがありません', 'error')
		}
	})

	// GeoJSONエクスポート
	document.getElementById('exportGeoJSON')?.addEventListener('click', () => {
		if (loadedObjects.length > 0) {
			const geojson = exportDroneDataToGeoJSON(loadedObjects)
			downloadFile(geojson, 'tokyo_tower_drone_data.geojson', 'application/geo+json')
			updateStatus('GeoJSON書き出し完了')
			showToast('GeoJSONファイルをダウンロードしました', 'success')
		} else {
			showToast('エクスポートするデータがありません', 'error')
		}
	})

	// データクリア
	document.getElementById('clearData')?.addEventListener('click', () => {
		if (
			loadedObjects.length > 0 &&
			confirm(`${loadedObjects.length}個のオブジェクトを全て削除しますか？`)
		) {
			loadedObjects = []
			updateDisplay()
			clearData(map)
			sampleDataLoaded = false
			if (droneSimulationInterval) {
				clearInterval(droneSimulationInterval)
				droneSimulationInterval = null
			}
			updateStatus('全データクリア完了')
			showToast('全てのデータをクリアしました', 'info')
		}
	})

	// 2D/3D切り替え
	document.getElementById('toggle3D')?.addEventListener('click', () => {
		toggle3D()
		const button = document.getElementById('toggle3D')
		if (button) {
			button.textContent = is3D ? '2D表示' : '3D表示'
		}
		showToast(is3D ? '3D表示に切り替えました' : '2D表示に切り替えました', 'info')
	})

	// フライトログクリア
	document.getElementById('clearLog')?.addEventListener('click', () => {
		clearFlightLog()
	})

	// フライトログエクスポート
	document.getElementById('exportLog')?.addEventListener('click', () => {
		exportFlightLog()
	})

	// フライトプラン管理
	document.getElementById('startFlightPlan')?.addEventListener('click', () => {
		startFlightPlan()
	})

	document.getElementById('pauseFlightPlan')?.addEventListener('click', () => {
		pauseFlightPlan()
	})

	document.getElementById('exportFlightPlan')?.addEventListener('click', () => {
		exportFlightPlan()
	})

	document.getElementById('importFlightPlan')?.addEventListener('click', () => {
		importFlightPlan()
	})

	// モバイル用フライトプラン管理（既存の関数を再利用）
	document.getElementById('startFlightPlanMobile')?.addEventListener('click', () => {
		startFlightPlan()
	})

	document.getElementById('pauseFlightPlanMobile')?.addEventListener('click', () => {
		pauseFlightPlan()
	})

	document.getElementById('exportFlightPlanMobile')?.addEventListener('click', () => {
		exportFlightPlan()
	})

	document.getElementById('importFlightPlanMobile')?.addEventListener('click', () => {
		importFlightPlan()
	})

	document.getElementById('enableGameControlMobile')?.addEventListener('click', () => {
		// enableGameControlボタンと同じ処理
		const desktopButton = document.getElementById('enableGameControl') as HTMLButtonElement
		if (desktopButton) {
			desktopButton.click() // 既存のボタンをクリックして同じ処理を実行
		}
	})

	// モバイル用フライトプランセレクト（デスクトップと同期）
	const flightPlanSelectMobile = document.getElementById('flightPlanSelectMobile') as HTMLSelectElement
	const flightPlanSelectDesktop = document.getElementById('flightPlanSelect') as HTMLSelectElement

	if (flightPlanSelectMobile && flightPlanSelectDesktop) {
		// モバイルセレクトが変更されたらデスクトップセレクトも同期
		flightPlanSelectMobile.addEventListener('change', () => {
			flightPlanSelectDesktop.value = flightPlanSelectMobile.value
			// デスクトップセレクトのchangeイベントを発火
			const event = new Event('change', { bubbles: true })
			flightPlanSelectDesktop.dispatchEvent(event)
		})

		// デスクトップセレクトが変更されたらモバイルセレクトも同期
		flightPlanSelectDesktop.addEventListener('change', () => {
			flightPlanSelectMobile.value = flightPlanSelectDesktop.value
		})
	}

	// フライトログ表示切替
	document.getElementById('toggleLog')?.addEventListener('click', () => {
		const flightLogContainer = document.getElementById('flightLogContainer') as HTMLElement
		const toggleButton = document.getElementById('toggleLog') as HTMLButtonElement

		console.log('Toggleボタンがクリックされました')
		console.log('FlightLogContainer要素:', flightLogContainer)
		console.log('Toggleボタン要素:', toggleButton)
		console.log(
			'現在のFlightLogContainer表示状態:',
			flightLogContainer?.classList.contains('visible')
		)

		if (flightLogContainer && toggleButton) {
			// ログリストの表示状態を判定
			const isCurrentlyVisible = flightLogContainer.classList.contains('visible')

			console.log('現在の表示状態:', isCurrentlyVisible)

			if (isCurrentlyVisible) {
				// ログリストを非表示にする
				flightLogContainer.classList.remove('visible')
				flightLogContainer.classList.add('hidden')
				toggleButton.textContent = 'ログ表示'
				addFlightLog('システム', 'ログ表示切替', 'ログ表示を無効にしました', 'info')
				console.log('ログリストを非表示にしました')
			} else {
				// ログリストを表示にする
				flightLogContainer.classList.remove('hidden')
				flightLogContainer.classList.add('visible')
				toggleButton.textContent = 'ログ非表示'
				addFlightLog('システム', 'ログ表示切替', 'ログ表示を有効にしました', 'info')
				console.log('ログリストを表示にしました')
			}
		} else {
			console.error('FlightLogContainerまたはToggleボタンが見つかりません')
		}
	})

	// UnifiedFlightDataインポート
	document.getElementById('importFlightData')?.addEventListener('click', () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.csv,.json,.geojson'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (file) {
				try {
					updateStatus('フライトデータ読み込み中...')
					const content = await file.text()
					let importedData: UnifiedFlightData[] = []

					if (file.name.endsWith('.csv')) {
						importedData = parseUnifiedFlightDataCSV(content)
					} else if (file.name.endsWith('.json') || file.name.endsWith('.geojson')) {
						importedData = parseUnifiedFlightDataGeoJSON(content)
					}

					if (importedData.length > 0) {
						// UnifiedFlightDataをDroneObjectに変換して追加
						const convertedObjects = importedData.map(data => convertUnifiedToDroneObject(data))
						loadedObjects.push(...convertedObjects)
						updateDisplay()
						updateStatus(`フライトデータ読み込み完了: ${importedData.length}個のオブジェクト`)
						showToast(
							`フライトデータから${importedData.length}個のオブジェクトをインポートしました`,
							'success'
						)
						addFlightLog(
							'データ管理',
							'フライトデータインポート',
							`${file.name}から${importedData.length}個のオブジェクトを読み込み`,
							'success'
						)
					} else {
						showToast('フライトデータファイルからデータを読み込めませんでした', 'warning')
						addFlightLog(
							'データ管理',
							'フライトデータインポート',
							'ファイルの読み込みに失敗',
							'warning'
						)
					}
				} catch (error) {
					console.error('フライトデータインポートエラー:', error)
					showToast('フライトデータファイルの読み込みに失敗しました', 'error')
					addFlightLog(
						'データ管理',
						'フライトデータインポートエラー',
						`${file.name}の読み込みに失敗`,
						'error'
					)
					updateStatus('フライトデータインポートエラー')
				}
			}
		}
		input.click()
	})

	// フライトミッションインポート
	document.getElementById('importMission')?.addEventListener('click', () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (file) {
				try {
					updateStatus('フライトミッション読み込み中...')
					const content = await file.text()
					const mission = parseFlightMissionJSON(content)

					if (mission && mission.waypoints && mission.waypoints.length > 0) {
						// ミッションの各ウェイポイントをDroneObjectとして追加
						const waypointObjects: DroneObject[] = mission.waypoints.map((waypoint, index) => ({
							id: `mission_waypoint_${index + 1}`,
							name: `ミッション_${mission.name}_WP${index + 1}`,
							longitude: waypoint.position.longitude,
							latitude: waypoint.position.latitude,
							altitude: waypoint.position.altitude,
							type: 'flight',
							source: `mission_${file.name}`,
						}))

						loadedObjects.push(...waypointObjects)
						updateDisplay()
						updateStatus(
							`フライトミッション読み込み完了: ${mission.waypoints.length}個のウェイポイント`
						)
						showToast(
							`ミッション「${mission.name}」から${mission.waypoints.length}個のウェイポイントをインポートしました`,
							'success'
						)
						addFlightLog(
							'データ管理',
							'ミッションインポート',
							`${mission.name}: ${mission.waypoints.length}個のウェイポイント`,
							'success'
						)

						// 地図をミッション開始地点に移動
						const firstWaypoint = mission.waypoints[0]
						map.flyTo({
							center: [firstWaypoint.position.longitude, firstWaypoint.position.latitude],
							zoom: 16,
							duration: 2000,
						})
					} else {
						showToast('フライトミッションファイルからデータを読み込めませんでした', 'warning')
						addFlightLog(
							'データ管理',
							'ミッションインポート',
							'ファイルの読み込みに失敗',
							'warning'
						)
					}
				} catch (error) {
					console.error('フライトミッションインポートエラー:', error)
					showToast('フライトミッションファイルの読み込みに失敗しました', 'error')
					addFlightLog(
						'データ管理',
						'ミッションインポートエラー',
						`${file.name}の読み込みに失敗`,
						'error'
					)
					updateStatus('フライトミッションインポートエラー')
				}
			}
		}
		input.click()
	})

	// サンプルフライトデータ読み込み
	document.getElementById('loadSampleFlightData')?.addEventListener('click', async () => {
		try {
			updateStatus('サンプルフライトデータ読み込み中...')

			// インラインサンプルデータを使用
			const importedData = parseUnifiedFlightDataCSV(SAMPLE_FLIGHT_DATA)

			if (importedData.length > 0) {
				const convertedObjects = importedData.map(data => convertUnifiedToDroneObject(data))
				loadedObjects.push(...convertedObjects)
				updateDisplay()
				updateStatus(`サンプルフライトデータ読み込み完了: ${importedData.length}個のオブジェクト`)
				showToast(
					`サンプルフライトデータから${importedData.length}個のオブジェクトを読み込みました`,
					'success'
				)
				addFlightLog(
					'データ管理',
					'サンプルフライトデータ',
					`${importedData.length}個のオブジェクトを読み込み`,
					'success'
				)
			} else {
				showToast('サンプルフライトデータの読み込みに失敗しました', 'error')
				addFlightLog('データ管理', 'サンプルフライトデータ', 'データの読み込みに失敗', 'error')
			}
		} catch (error) {
			console.error('サンプルフライトデータ読み込みエラー:', error)
			showToast('サンプルフライトデータの読み込みに失敗しました', 'error')
			addFlightLog(
				'データ管理',
				'サンプルフライトデータエラー',
				`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
				'error'
			)
			updateStatus('サンプルフライトデータ読み込みエラー')
		}
	})

	// サンプル軌跡データ読み込み
	document.getElementById('loadSampleTrajectory')?.addEventListener('click', async () => {
		try {
			updateStatus('サンプル軌跡データ読み込み中...')

			// インラインサンプルデータを使用
			const importedData = parseUnifiedFlightDataCSV(SAMPLE_TRAJECTORY_DATA)

			if (importedData.length > 0) {
				const trajectoryData = importedData
					.filter(data => data.timestamp)
					.sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())

				const convertedObjects = trajectoryData.map((data, index) => {
					const obj = convertUnifiedToDroneObject(data)
					obj.name = `軌跡点_${index + 1}`
					obj.type = 'flight'
					return obj
				})

				loadedObjects.push(...convertedObjects)
				updateDisplay()
				updateStatus(`サンプル軌跡データ読み込み完了: ${trajectoryData.length}個の軌跡点`)
				showToast(
					`サンプル軌跡データから${trajectoryData.length}個の軌跡点を読み込みました`,
					'success'
				)
				addFlightLog(
					'データ管理',
					'サンプル軌跡データ',
					`${trajectoryData.length}個の軌跡点を読み込み`,
					'success'
				)

				// 軌跡の開始地点に地図を移動
				if (trajectoryData.length > 0) {
					const firstPoint = trajectoryData[0]
					map.flyTo({
						center: [firstPoint.position.longitude, firstPoint.position.latitude],
						zoom: 16,
						duration: 2000,
					})
				}
			} else {
				showToast('サンプル軌跡データの読み込みに失敗しました', 'error')
				addFlightLog('データ管理', 'サンプル軌跡データ', 'データの読み込みに失敗', 'error')
			}
		} catch (error) {
			console.error('サンプル軌跡データ読み込みエラー:', error)
			showToast('サンプル軌跡データの読み込みに失敗しました', 'error')
			addFlightLog(
				'データ管理',
				'サンプル軌跡データエラー',
				`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
				'error'
			)
			updateStatus('サンプル軌跡データ読み込みエラー')
		}
	})

	// UnifiedFlightDataエクスポート
	document.getElementById('exportFlightData')?.addEventListener('click', () => {
		if (loadedObjects.length > 0) {
			// DroneObjectをUnifiedFlightDataに変換
			const unifiedData = loadedObjects.map(obj => convertDroneObjectToUnified(obj))

			// 複数形式での一括エクスポート
			try {
				// CSV形式
				const csvData = exportUnifiedFlightDataToCSV(unifiedData)
				downloadFile(csvData, 'unified_flight_data.csv', 'text/csv')

				// GeoJSON形式
				const geoJsonData = exportUnifiedFlightDataToGeoJSON(unifiedData)
				downloadFile(geoJsonData, 'unified_flight_data.geojson', 'application/geo+json')

				updateStatus('フライトデータエクスポート完了')
				showToast('フライトデータをCSVとGeoJSON形式でエクスポートしました', 'success')
				addFlightLog(
					'データ管理',
					'フライトデータエクスポート',
					`${unifiedData.length}個のオブジェクトをエクスポート`,
					'success'
				)
			} catch (error) {
				console.error('フライトデータエクスポートエラー:', error)
				showToast('フライトデータのエクスポートに失敗しました', 'error')
				addFlightLog(
					'データ管理',
					'フライトデータエクスポートエラー',
					'エクスポートに失敗',
					'error'
				)
			}
		} else {
			showToast('エクスポートするフライトデータがありません', 'warning')
			addFlightLog(
				'データ管理',
				'フライトデータエクスポート',
				'エクスポートするデータがありません',
				'warning'
			)
		}
	})

	// フライトミッションエクスポート
	document.getElementById('exportMission')?.addEventListener('click', () => {
		if (loadedObjects.length > 0) {
			// DroneObjectからフライトミッションを作成
			const flightTypeObjects = loadedObjects.filter(
				obj => obj.type === 'flight' || obj.type === 'drone'
			)

			if (flightTypeObjects.length > 0) {
				try {
					const unifiedFlightData: UnifiedFlightData[] = flightTypeObjects.map(obj =>
						convertDroneObjectToUnified(obj)
					)
					if (unifiedFlightData.length === 0) return
					const home = unifiedFlightData[0].position
					const mission = createFlightMission('Generated_Mission', unifiedFlightData, {
						longitude: home.longitude,
						latitude: home.latitude,
						altitude: home.altitude,
					})
					// KML形式でエクスポート
					const kmlData = exportFlightMissionToKML(mission)
					downloadFile(
						kmlData,
						`flight_mission_${new Date().toISOString().slice(0, 10)}.kml`,
						'application/vnd.google-earth.kml+xml'
					)

					// JSON形式でもエクスポート
					const jsonData = JSON.stringify(mission, null, 2)
					downloadFile(
						jsonData,
						`flight_mission_${new Date().toISOString().slice(0, 10)}.json`,
						'application/json'
					)

					updateStatus('フライトミッションエクスポート完了')
					showToast('フライトミッションをKMLとJSON形式でエクスポートしました', 'success')
					addFlightLog(
						'データ管理',
						'ミッションエクスポート',
						`${mission.waypoints.length}個のウェイポイント`,
						'success'
					)
				} catch (error) {
					console.error('フライトミッションエクスポートエラー:', error)
					showToast('フライトミッションのエクスポートに失敗しました', 'error')
					addFlightLog('データ管理', 'ミッションエクスポートエラー', 'エクスポートに失敗', 'error')
				}
			} else {
				showToast('フライト関連のオブジェクトがありません', 'warning')
				addFlightLog(
					'データ管理',
					'ミッションエクスポート',
					'フライトオブジェクトが見つかりません',
					'warning'
				)
			}
		} else {
			showToast('エクスポートするデータがありません', 'warning')
			addFlightLog(
				'データ管理',
				'ミッションエクスポート',
				'エクスポートするデータがありません',
				'warning'
			)
		}
	})

	// 軌跡データインポート
	document.getElementById('importTrajectory')?.addEventListener('click', () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.csv,.json,.geojson'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (file) {
				try {
					updateStatus('軌跡データ読み込み中...')
					const content = await file.text()
					let importedData: UnifiedFlightData[] = []

					if (file.name.endsWith('.csv')) {
						importedData = parseUnifiedFlightDataCSV(content)
					} else if (file.name.endsWith('.json') || file.name.endsWith('.geojson')) {
						importedData = parseUnifiedFlightDataGeoJSON(content)
					}

					// 軌跡データとして処理（時系列ソート）
					const trajectoryData = importedData
						.filter(data => data.timestamp)
						.sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())

					if (trajectoryData.length > 0) {
						const convertedObjects = trajectoryData.map((data, index) => {
							const obj = convertUnifiedToDroneObject(data)
							obj.name = `軌跡点_${index + 1}`
							obj.type = 'flight'
							return obj
						})

						loadedObjects.push(...convertedObjects)
						updateDisplay()
						updateStatus(`軌跡データ読み込み完了: ${trajectoryData.length}個の軌跡点`)
						showToast(
							`軌跡データから${trajectoryData.length}個の軌跡点をインポートしました`,
							'success'
						)
						addFlightLog(
							'データ管理',
							'軌跡データインポート',
							`${file.name}から${trajectoryData.length}個の軌跡点を読み込み`,
							'success'
						)

						// 軌跡の開始地点に地図を移動
						if (trajectoryData.length > 0) {
							const firstPoint = trajectoryData[0]
							map.flyTo({
								center: [firstPoint.position.longitude, firstPoint.position.latitude],
								zoom: 16,
								duration: 2000,
							})
						}
					} else {
						showToast('軌跡データファイルからデータを読み込めませんでした', 'warning')
						addFlightLog(
							'データ管理',
							'軌跡データインポート',
							'ファイルの読み込みに失敗',
							'warning'
						)
					}
				} catch (error) {
					console.error('軌跡データインポートエラー:', error)
					showToast('軌跡データファイルの読み込みに失敗しました', 'error')
					addFlightLog(
						'データ管理',
						'軌跡データインポートエラー',
						`${file.name}の読み込みに失敗`,
						'error'
					)
					updateStatus('軌跡データインポートエラー')
				}
			}
		}
		input.click()
	})

	// 軌跡データエクスポート
	document.getElementById('exportTrajectory')?.addEventListener('click', () => {
		if (loadedObjects.length > 0) {
			// フライト関連のオブジェクトのみを軌跡として処理
			const trajectoryObjects = loadedObjects.filter(
				obj => obj.type === 'flight' || obj.type === 'drone'
			)

			if (trajectoryObjects.length > 0) {
				try {
					// 軌跡データとしてタイムスタンプを付与
					const trajectoryData = trajectoryObjects.map((obj, index) => {
						const unified = convertDroneObjectToUnified(obj)
						// タイムスタンプがない場合は順序に基づいて付与
						if (!unified.timestamp) {
							unified.timestamp = new Date(Date.now() + index * 10000).toISOString() // 10秒間隔
						}
						unified.type = 'trajectory_point'
						return unified
					})

					// CSV形式でエクスポート
					const csvData = exportUnifiedFlightDataToCSV(trajectoryData)
					downloadFile(csvData, 'flight_trajectory.csv', 'text/csv')

					// GeoJSON形式でもエクスポート
					const geoJsonData = exportUnifiedFlightDataToGeoJSON(trajectoryData)
					downloadFile(geoJsonData, 'flight_trajectory.geojson', 'application/geo+json')

					updateStatus('軌跡データエクスポート完了')
					showToast('軌跡データをCSVとGeoJSON形式でエクスポートしました', 'success')
					addFlightLog(
						'データ管理',
						'軌跡データエクスポート',
						`${trajectoryData.length}個の軌跡点をエクスポート`,
						'success'
					)
				} catch (error) {
					console.error('軌跡データエクスポートエラー:', error)
					showToast('軌跡データのエクスポートに失敗しました', 'error')
					addFlightLog('データ管理', '軌跡データエクスポートエラー', 'エクスポートに失敗', 'error')
				}
			} else {
				showToast('軌跡として出力できるデータがありません', 'warning')
				addFlightLog(
					'データ管理',
					'軌跡データエクスポート',
					'軌跡データが見つかりません',
					'warning'
				)
			}
		} else {
			showToast('エクスポートするデータがありません', 'warning')
			addFlightLog(
				'データ管理',
				'軌跡データエクスポート',
				'エクスポートするデータがありません',
				'warning'
			)
		}
	})

	// キーボードショートカット機能を削除（Vercelデプロイではファイルアクセスが制限されるため）
}

// フライトプラン管理機能
const startFlightPlan = () => {
	if (flightPlanActive) {
		addFlightLog('システム', 'フライトプラン', 'フライトプランは既に実行中です', 'warning')
		return
	}

	if (currentFlightPlan.length === 0) {
		addFlightLog('エラー', 'フライトプラン', '実行可能なフライトプランがありません', 'error')
		return
	}

	flightPlanActive = true
	currentFlightPhase = 0

	addFlightLog('システム', 'フライトプラン開始', `${currentFlightPlanName}を開始します`, 'success')
	updateFlightLogDisplay() // ステータスバーを更新

	// ドローンオブジェクトを作成または更新
	let drone = loadedObjects.find(obj => obj.type === 'drone')
	if (!drone) {
		const droneObject: DroneObject = {
			id: 'inspection-drone-1',
			name: `${currentFlightPlanName}ドローン`,
			longitude: currentFlightPlan[0].position[0],
			latitude: currentFlightPlan[0].position[1],
			altitude: 0,
			type: 'drone',
			source: 'flight-plan',
		}
		loadedObjects.push(droneObject)
	} else {
		// 既存のドローンの名前と位置を更新
		drone.name = `${currentFlightPlanName}ドローン`
		drone.longitude = currentFlightPlan[0].position[0]
		drone.latitude = currentFlightPlan[0].position[1]
		drone.altitude = 0
	}
	updateDisplay()

	executeFlightPhase()
}

const executeFlightPhase = () => {
	if (!flightPlanActive || currentFlightPhase >= currentFlightPlan.length) {
		completeFlightPlan()
		return
	}

	const phase = currentFlightPlan[currentFlightPhase]
	const drone = loadedObjects.find(obj => obj.type === 'drone')

	if (!drone) {
		addFlightLog('エラー', 'ドローン不在', '点検ドローンが見つかりません', 'error')
		return
	}

	// ドローンの位置を更新
	drone.longitude = phase.position[0]
	drone.latitude = phase.position[1]
	drone.altitude = phase.position[2]

	// 次のwaypointへの方位を計算（FPV視点のため）
	let bearing = 0
	if (currentFlightPhase < currentFlightPlan.length - 1) {
		const nextPhase = currentFlightPlan[currentFlightPhase + 1]
		bearing = calculateBearing(
			[phase.position[0], phase.position[1]],
			[nextPhase.position[0], nextPhase.position[1]]
		)
	} else {
		// 最後のwaypointの場合は現在のbearingを維持
		bearing = phase.bearing ?? 0
	}

	// カメラパラメータを取得
	const zoom = phase.zoom ?? 18
	const pitch = phase.pitch ?? 70

	// 詳細な位置情報とカメラ情報を含めたログを記録
	addFlightLog(
		phase.phase,
		'実行中',
		phase.action,
		'info',
		{
			latitude: drone.latitude,
			longitude: drone.longitude,
			altitude: drone.altitude,
		},
		{
			bearing: Math.round(bearing * 100) / 100, // 小数点2桁に丸める
			pitch: pitch,
			zoom: zoom,
		}
	)

	// FPV（ドローン目線）カメラ設定
	map.flyTo({
		center: [drone.longitude, drone.latitude],
		zoom: zoom,
		pitch: pitch, // ドローン視点で前方下向き
		bearing: bearing, // 次のwaypointへ向かう方向
		duration: phase.duration,
	})

	updateDisplay()

	// 次のフェーズへ
	setTimeout(() => {
		currentFlightPhase++
		updateFlightLogDisplay() // フェーズ変更時にログ表示を更新
		executeFlightPhase()
	}, phase.duration)
}

// 2点間の方位角を計算（ドローンの進行方向を決定）
const calculateBearing = (start: [number, number], end: [number, number]): number => {
	const startLat = (start[1] * Math.PI) / 180
	const startLng = (start[0] * Math.PI) / 180
	const endLat = (end[1] * Math.PI) / 180
	const endLng = (end[0] * Math.PI) / 180

	const y = Math.sin(endLng - startLng) * Math.cos(endLat)
	const x =
		Math.cos(startLat) * Math.sin(endLat) -
		Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng)

	const bearingRad = Math.atan2(y, x)
	const bearingDeg = (bearingRad * 180) / Math.PI
	return (bearingDeg + 360) % 360
}

const pauseFlightPlan = () => {
	if (!flightPlanActive) {
		addFlightLog('システム', 'フライトプラン', 'フライトプランは実行されていません', 'warning')
		return
	}

	flightPlanActive = false
	addFlightLog(
		'システム',
		'フライトプラン一時停止',
		`フェーズ${currentFlightPhase + 1}で一時停止しました`,
		'warning'
	)
	updateFlightLogDisplay() // ステータスバーを更新
}

const completeFlightPlan = () => {
	flightPlanActive = false
	addFlightLog(
		'システム',
		'フライトプラン完了',
		`${currentFlightPlanName}が完了しました`,
		'success'
	)
	updateFlightLogDisplay() // ステータスバーを更新
	showToast('フライトプランが完了しました', 'success')
}

const exportFlightPlan = () => {
	const planData: FlightPlanData = {
		name: currentFlightPlanName,
		description: currentFlightPlanDescription,
		created: new Date().toISOString(),
		phases: currentFlightPlan,
		totalDuration: currentFlightPlan.reduce((sum, phase) => sum + phase.duration, 0),
	}

	const jsonContent = JSON.stringify(planData, null, 2)
	const blob = new Blob([jsonContent], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${currentFlightPlanName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)

	addFlightLog(
		'システム',
		'フライトプランエクスポート',
		'フライトプランをJSONファイルでエクスポートしました',
		'success'
	)
}

const importFlightPlan = () => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.json'
	input.onchange = e => {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (file) {
			const reader = new FileReader()
			reader.onload = e => {
				try {
					const planData: FlightPlanData = JSON.parse(e.target?.result as string)

					// フライトプランの検証
					if (!planData.name || !planData.phases || !Array.isArray(planData.phases)) {
						throw new Error('無効なフライトプランファイルです')
					}

					// 現在のフライトプランを更新
					currentFlightPlan = planData.phases
					currentFlightPlanName = planData.name
					currentFlightPlanDescription = planData.description || ''

					// FlightControllerに設定
					flightController.setFlightPlan(planData)

					// フライトプランの可視化を更新
					updateFlightPlanVisualization(planData.phases)

					addFlightLog(
						'システム',
						'フライトプランインポート',
						`${planData.name}をインポートしました`,
						'success'
					)
					showToast('フライトプランをインポートしました', 'success')

					// 地図をフライトプランの開始位置に移動
					if (planData.phases.length > 0) {
						const startPosition = planData.phases[0].position
						map.flyTo({
							center: [startPosition[0], startPosition[1]],
							zoom: 16,
							duration: 2000,
						})
					}
				} catch (error) {
					addFlightLog(
						'エラー',
						'フライトプランインポート',
						'ファイルの読み込みに失敗しました',
						'error'
					)
					showToast('フライトプランの読み込みに失敗しました', 'error')
				}
			}
			reader.readAsText(file)
		}
	}
	input.click()
}

// エッフェル塔関連の関数・ショートカットは削除

// ファイル読み込み機能を削除（Vercelデプロイではファイルアクセスが制限されるため）

// 地図のクリックイベント
map.on('click', e => {
	// ドラッグ直後のクリックイベントを無視
	if (isDragging) {
		return
	}

	if (polygonDrawingMode) {
		handlePolygonClick(e.lngLat)
	} else if (drawMode) {
		addObjectAtLocation(e.lngLat)
	} else if (editMode) {
		const objectSelected = selectObject(e.lngLat)
		// オブジェクトが選択されなかった場合は選択解除
		if (!objectSelected) {
			deselectObject()
		}
	}
})

// マウスダウンイベント（ドラッグ開始）
map.on('mousedown', e => {
	if (editMode) {
		// クリック位置でオブジェクトを検出
		const point = map.project(e.lngLat)
		const tolerance = 20

		let objectFound = false
		loadedObjects.forEach(obj => {
			const objPoint = map.project([obj.longitude, obj.latitude])
			const distance = Math.sqrt(
				Math.pow(point.x - objPoint.x, 2) + Math.pow(point.y - objPoint.y, 2)
			)

			if (distance < tolerance) {
				objectFound = true
				if (selectedObject && selectedObject.id === obj.id) {
					// 既に選択されているオブジェクトをクリックした場合、ドラッグ開始
					startDragObject(e.lngLat)
					e.preventDefault()
				}
			}
		})

		// オブジェクトがない場所でのマウスダウンの場合は通常のマップ操作を許可
		if (!objectFound && isDragging) {
			endDragObject()
		}
	}
})

// マウス移動イベント（ドラッグ中）
map.on('mousemove', e => {
	if (editMode && isDragging) {
		e.preventDefault()
		dragObject(e.lngLat)
	}
})

// マウスアップイベント（ドラッグ終了）
map.on('mouseup', e => {
	if (editMode && isDragging) {
		e.preventDefault()
		endDragObject()
	}
})

// キーボードイベント（削除キー）
document.addEventListener('keydown', e => {
	if (e.key === 'Delete' || e.key === 'Backspace') {
		if (editMode && selectedObject) {
			e.preventDefault()
			deleteSelectedObject()
		}
	}
	if (e.key === 'Escape') {
		if (editMode) {
			deselectObject()
		}
	}
})

// 地図の読み込み完了
map.on('load', () => {
	console.log('map.on("load") イベント開始')

	try {
		setupLayers()
		console.log('setupLayers() 完了')
	} catch (error) {
		console.error('setupLayers() エラー:', error)
	}

	try {
		setupEventHandlers()
		console.log('setupEventHandlers() 完了')
	} catch (error) {
		console.error('setupEventHandlers() エラー:', error)
	}

	updateStatus('地図読み込み完了 - 東京タワー周辺のドローン点検を開始してください')
	console.log('システム準備完了')

	// 新しいモジュールの初期化
	try {
		// MapStyleManagerの初期化（コントロールは非表示）
		mapStyleManager = new MapStyleManager(map, gsiTerrainSource)
		// const styleControl = mapStyleManager.createStyleControl()
		// document.body.appendChild(styleControl)
		console.log('MapStyleManager初期化完了')

		// FlightControllerの初期化
		flightController = new FlightController(map)
		flightController.setLogUpdateCallback(log => {
			// FlightControllerのログをグローバルflightLogに同期
			flightLog = log
			updateFlightLogDisplay()
		})
		console.log('FlightController初期化完了')

		// DroneModelの初期化（東京タワーの座標）
		droneModel = new DroneModel(map, [139.7454, 35.6586, 100])
		console.log('DroneModel初期化完了')

		// GameControllerの初期化
		gameController = new GameController(map, droneModel)
		console.log('GameController初期化完了')

		// TouchControllerの初期化（モバイル用）
		touchController = new TouchController(map, droneModel)
		console.log('TouchController初期化完了')

		// モバイルデバイスの場合は自動でタッチコントロールを有効化
		if (isMobileDevice()) {
			touchController.enable()
			touchControlActive = true
			console.log('モバイルデバイスを検出: タッチコントロール有効')
		}

		// デフォルトフライトプランを設定
		const defaultPlan: FlightPlanData = {
			name: '東京タワー点検フライト',
			description: '東京タワー周辺を体系的に点検',
			created: new Date().toISOString(),
			totalDuration: 39000,
			phases: currentFlightPlan,
		}
		flightController.setFlightPlan(defaultPlan)
		updateFlightPlanVisualization(defaultPlan.phases)

		addFlightLog(
			'システム',
			'拡張機能',
			'マップスタイル切り替え、ゲームコントロール機能を有効化',
			'success'
		)
	} catch (error) {
		console.error('新しいモジュールの初期化エラー:', error)
		addFlightLog('エラー', 'モジュール初期化', '一部の拡張機能が利用できません', 'error')
	}

	// フライトログ初期化
	addFlightLog('システム', '初期化', '東京タワー点検システムが起動しました', 'success')
	addFlightLog('システム', '準備完了', 'フライトプランとリアルタイムログ機能が利用可能です', 'info')

	// Footerを初期表示状態にする（より確実な処理）
	setTimeout(() => {
		const flightLogContainer = document.getElementById('flightLogContainer') as HTMLElement
		const toggleButton = document.getElementById('toggleLog') as HTMLButtonElement

		if (flightLogContainer && toggleButton) {
			// ログリストを表示状態に設定
			flightLogContainer.classList.remove('hidden')
			flightLogContainer.classList.add('visible')
			toggleButton.textContent = 'ログ非表示'
			console.log('ログリストを初期表示状態に設定しました')
		} else {
			console.error('FlightLogContainerまたはToggleボタンの初期化に失敗しました')
		}
	}, 100) // 少し遅延させて確実にDOMが準備されるようにする

	// ===== 新しいUIコントロールのイベントリスナー =====
	// すべてのイベントリスナーをmap.on('load')内で設定

	try {
		// フライトプラン選択ドロップダウン
		const flightPlanSelect = document.getElementById('flightPlanSelect') as HTMLSelectElement
		if (flightPlanSelect) {
			flightPlanSelect.addEventListener('change', async e => {
				const planId = (e.target as HTMLSelectElement).value

				if (planId === 'custom') {
					// カスタムフライトプランのインポート
					const importButton = document.getElementById('importFlightPlan') as HTMLButtonElement
					if (importButton) {
						importButton.click()
					}
					return
				}

				// プリセットフライトプランを読み込み
				try {
					const fileMap: Record<string, string> = {
						'mt-fuji': './data/mt-fuji-flight-plan.json',
						'tokyo-skytree': './data/tokyo-skytree-flight-plan.json',
						'kyoto-kinkakuji': './data/kyoto-kinkakuji-flight-plan.json',
					}

					if (planId === 'tokyo-tower') {
						// デフォルトプランを再設定
						const defaultPlan: FlightPlanData = {
							name: '東京タワー点検フライト',
							description: '東京タワー周辺を体系的に点検',
							created: new Date().toISOString(),
							totalDuration: 39000,
							phases: defaultFlightPlan,
						}

						// グローバル変数を更新
						currentFlightPlan = defaultPlan.phases
						currentFlightPlanName = defaultPlan.name
						currentFlightPlanDescription = defaultPlan.description

						// 既存のドローンの名前も更新
						const existingDrone = loadedObjects.find(obj => obj.type === 'drone')
						if (existingDrone) {
							existingDrone.name = `${defaultPlan.name}ドローン`
							updateDisplay()
						}

						flightController.setFlightPlan(defaultPlan)
						updateFlightPlanVisualization(defaultPlan.phases)
						showToast('東京タワー点検フライトプランを読み込みました', 'success')

						// カメラを東京タワーに移動
						map.flyTo({
							center: [139.7454, 35.6586],
							zoom: 16,
							pitch: 60,
							bearing: 0,
							duration: 2000,
						})
					} else {
						const filePath = fileMap[planId]
						if (!filePath) {
							showToast('フライトプランが見つかりません', 'error')
							return
						}

						const response = await fetch(filePath)
						if (!response.ok) {
							throw new Error('ファイルの読み込みに失敗しました')
						}
						const planData: FlightPlanData = await response.json()

						// グローバル変数を更新
						currentFlightPlan = planData.phases
						currentFlightPlanName = planData.name
						currentFlightPlanDescription = planData.description

						// 既存のドローンの名前も更新
						const existingDrone = loadedObjects.find(obj => obj.type === 'drone')
						if (existingDrone) {
							existingDrone.name = `${planData.name}ドローン`
							updateDisplay()
						}

						flightController.setFlightPlan(planData)
						updateFlightPlanVisualization(planData.phases)
						showToast(`${planData.name}を読み込みました`, 'success')

						// カメラを開始位置に移動
						const startPosition = planData.phases[0].position
						map.flyTo({
							center: [startPosition[0], startPosition[1]],
							zoom: planData.phases[0].zoom || 16,
							pitch: planData.phases[0].pitch || 60,
							bearing: planData.phases[0].bearing || 0,
							duration: 2000,
						})
					}
				} catch (error) {
					console.error('フライトプラン読み込みエラー:', error)
					const errorMessage = error instanceof Error ? error.message : 'Unknown error'
					showToast(`フライトプランの読み込みに失敗しました: ${errorMessage}`, 'error')
					addFlightLog('エラー', 'フライトプラン読み込み', `${errorMessage}`, 'error')
				}
			})
		}

		// ゲームコントロール有効化ボタン
		const enableGameControlButton = document.getElementById(
			'enableGameControl'
		) as HTMLButtonElement
		if (enableGameControlButton) {
			enableGameControlButton.addEventListener('click', () => {
				if (!gameController) {
					showToast('ゲームコントローラーが初期化されていません', 'error')
					return
				}

				gameController.enable()
				gameControlActive = true

				// モバイルデバイスの場合はタッチコントロールも有効化
				if (isMobileDevice()) {
					touchController.enable()
					touchControlActive = true
				}

				// ヘルプパネルを表示
				const helpPanel = document.getElementById('gameControlHelp') as HTMLElement
				if (helpPanel) {
					helpPanel.style.display = 'block'
				}

				const controlMethod = isMobileDevice()
					? 'タッチジョイスティック'
					: 'キーボード/ゲームパッド'
				showToast('手動操作モードを有効化しました', 'success')
				addFlightLog('ゲームコントロール', '有効化', `${controlMethod}で操作可能です`, 'info')

				// ボタンの状態を変更
				enableGameControlButton.style.opacity = '0.5'
				enableGameControlButton.style.cursor = 'not-allowed'
			})
		}

		// ゲームコントロール無効化ボタン
		const disableGameControlButton = document.getElementById(
			'disableGameControl'
		) as HTMLButtonElement
		if (disableGameControlButton) {
			disableGameControlButton.addEventListener('click', () => {
				if (!gameController) {
					return
				}

				gameController.disable()
				gameControlActive = false

				// ヘルプパネルを非表示
				const helpPanel = document.getElementById('gameControlHelp') as HTMLElement
				if (helpPanel) {
					helpPanel.style.display = 'none'
				}

				showToast('手動操作モードを無効化しました', 'info')
				addFlightLog('ゲームコントロール', '無効化', '手動操作を終了しました', 'info')

				// ボタンの状態を復元
				const enableButton = document.getElementById('enableGameControl') as HTMLButtonElement
				if (enableButton) {
					enableButton.style.opacity = '1'
					enableButton.style.cursor = 'pointer'
				}

				// モバイルデバイスの場合はタッチコントロールも無効化
				if (isMobileDevice() && touchControlActive) {
					touchController.disable()
					touchControlActive = false
				}
			})
		}
	} catch (error) {
		console.error('イベントリスナー設定エラー:', error)
		console.error('一部のボタンが動作しない可能性があります')
	}

	// Info panel toggle with localStorage persistence
	const infoPanelToggle = document.getElementById('infoPanelToggle') as HTMLButtonElement
	const infoPanel = document.getElementById('infoPanel') as HTMLElement
	if (infoPanelToggle && infoPanel) {
		// localStorageから状態を復元（デフォルトはvisible）
		const savedInfoPanelState = localStorage.getItem('infoPanelVisible')
		if (savedInfoPanelState === 'false') {
			infoPanel.classList.remove('visible')
			infoPanelToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
				<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
				<path d="M12 16v-4m0-4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>`
		}

		infoPanelToggle.addEventListener('click', () => {
			const isVisible = infoPanel.classList.contains('visible')
			infoPanel.classList.toggle('visible')

			// localStorageに状態を保存
			localStorage.setItem('infoPanelVisible', (!isVisible).toString())

			// SVGアイコンを切り替え
			if (isVisible) {
				infoPanelToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
					<path d="M12 16v-4m0-4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>`
			} else {
				infoPanelToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>`
			}
		})
	}

	// Flight plan panel toggle with localStorage persistence
	const flightPlanToggle = document.getElementById('flightPlanToggle') as HTMLButtonElement
	const flightPlanExport = document.getElementById('flightPlanExport') as HTMLElement
	if (flightPlanToggle && flightPlanExport) {
		// localStorageから状態を復元（デフォルトはvisible）
		const savedFlightPlanState = localStorage.getItem('flightPlanVisible')
		if (savedFlightPlanState === 'false') {
			flightPlanExport.classList.remove('visible')
			flightPlanToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
				<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor"/>
			</svg>`
		}

		flightPlanToggle.addEventListener('click', () => {
			const isVisible = flightPlanExport.classList.contains('visible')
			flightPlanExport.classList.toggle('visible')

			// localStorageに状態を保存
			localStorage.setItem('flightPlanVisible', (!isVisible).toString())

			// SVGアイコンを切り替え
			if (isVisible) {
				flightPlanToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor"/>
				</svg>`
			} else {
				flightPlanToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>`
			}
		})
	}

	// Controls panel toggle with localStorage persistence
	const controlsToggle = document.getElementById('controlsToggle') as HTMLButtonElement
	const controls = document.getElementById('controls') as HTMLElement

	if (controlsToggle && controls) {
		// localStorageから状態を復元（デフォルトは非表示）
		const savedControlsState = localStorage.getItem('controlsVisible')
		if (savedControlsState === 'true') {
			controls.classList.add('visible')
			controlsToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
				<path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round"/>
			</svg>`
		}

		controlsToggle.addEventListener('click', () => {
			const isVisible = controls.classList.contains('visible')
			controls.classList.toggle('visible')

			// localStorageに状態を保存
			localStorage.setItem('controlsVisible', (!isVisible).toString())

			// アイコンを切り替え
			if (isVisible) {
				controlsToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
					<path d="M3 12h18M3 6h18M3 18h18" stroke-width="2" stroke-linecap="round"/>
				</svg>`
			} else {
				controlsToggle.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
					<path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round"/>
				</svg>`
			}
		})
	}

	// Help modal toggle
	const helpButton = document.getElementById('helpButton') as HTMLButtonElement
	const helpModalOverlay = document.getElementById('helpModalOverlay') as HTMLElement
	const helpModalClose = document.getElementById('helpModalClose') as HTMLButtonElement

	if (helpButton && helpModalOverlay) {
		helpButton.addEventListener('click', () => {
			helpModalOverlay.classList.add('visible')
		})
	}

	if (helpModalClose && helpModalOverlay) {
		helpModalClose.addEventListener('click', () => {
			helpModalOverlay.classList.remove('visible')
		})

		// クリックでモーダルを閉じる
		helpModalOverlay.addEventListener('click', e => {
			if (e.target === helpModalOverlay) {
				helpModalOverlay.classList.remove('visible')
			}
		})
	}

	console.log('map.on("load") 処理完了')
}) // map.on('load')の終了

/**
 * モバイルデバイスかどうかを判定
 */
function isMobileDevice(): boolean {
	// タッチサポートチェック
	const hasTouchScreen =
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		(navigator as any).msMaxTouchPoints > 0

	// ユーザーエージェントチェック
	const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent
	)

	// 画面サイズチェック
	const isSmallScreen = window.innerWidth <= 768

	return (hasTouchScreen && isMobileUA) || (hasTouchScreen && isSmallScreen)
}
