import React, { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { parseDroneCSV, parseGeoJSON, type DroneObject } from '../src/data-import-export'

// フライトプランの型定義
interface FlightPlanPhase {
	phase: string
	action: string
	duration: number
	position: [number, number, number]
}

interface FlightPlan {
	name: string
	description: string
	phases: FlightPlanPhase[]
	totalDuration: number
}

const DroneDataSystem: React.FC<{ className?: string }> = ({ className = '' }) => {
	const mapContainer = useRef<HTMLDivElement>(null)
	const map = useRef<maplibregl.Map | null>(null)
	const [loadedObjects, setLoadedObjects] = useState<DroneObject[]>([])
	const [is3D] = useState(true)
	const [,] = useState(false)
	const [status, setStatus] = useState('システム準備中...')
	const [dragOver, setDragOver] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// フライトプラン関連のstate
	const [flightPlan, setFlightPlan] = useState<FlightPlan | null>(null)
	const [currentPhaseIndex, setCurrentPhaseIndex] = useState(-1)
	const flightTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	// (地理院DEM変換関数は変更なし)
	const gsidem2terrainrgb = useCallback(
		(r: number, g: number, b: number): [number, number, number] => {
			let height = r * 655.36 + g * 2.56 + b * 0.01
			if (r === 128 && g === 0 && b === 0) height = 0
			else if (r >= 128) height -= 167772.16
			height += 100000
			height *= 10
			const tB = (height / 256 - Math.floor(height / 256)) * 256
			const tG = (Math.floor(height / 256) / 256 - Math.floor(Math.floor(height / 256) / 256)) * 256
			const tR =
				(Math.floor(Math.floor(height / 256) / 256) / 256 -
					Math.floor(Math.floor(Math.floor(height / 256) / 256) / 256)) *
				256
			return [tR, tG, tB]
		},
		[]
	)

	// (マップ初期化は変更なし)
	useEffect(() => {
		if (!mapContainer.current || map.current) return
		maplibregl.addProtocol('gsidem', (params, callback) => {
			const image = new Image()
			image.crossOrigin = ''
			image.onload = () => {
				const canvas = document.createElement('canvas')
				canvas.width = image.width
				canvas.height = image.height
				const context = canvas.getContext('2d')!
				context.drawImage(image, 0, 0)
				const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
				for (let i = 0; i < imageData.data.length / 4; i++) {
					const tRGB = gsidem2terrainrgb(
						imageData.data[i * 4],
						imageData.data[i * 4 + 1],
						imageData.data[i * 4 + 2]
					)
					imageData.data[i * 4] = tRGB[0]
					imageData.data[i * 4 + 1] = tRGB[1]
					imageData.data[i * 4 + 2] = tRGB[2]
				}
				context.putImageData(imageData, 0, 0)
				canvas.toBlob(blob => blob!.arrayBuffer().then(arr => callback(null, arr, null, null)))
			}
			image.onerror = () => callback(new Error('DEM読み込みエラー'))
			// Handle both old format (gsidem://https://...) and new format (gsidem:https://...)
			image.src = params.url.replace(/^gsidem:(?:\/\/)?/, '')
			return { cancel: () => {} }
		})

		setStatus('マップ初期化中...')
		map.current = new maplibregl.Map({
			container: mapContainer.current,
			maxPitch: 85,
			center: [138.69, 35.3],
			zoom: 12,
			pitch: 70,
			style: {
				version: 8,
				sources: {
					gsi: {
						type: 'raster',
						tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
						attribution: '地理院タイル',
					},
					gsidem: {
						type: 'raster-dem',
						tiles: ['gsidem:https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
						tileSize: 256,
						maxzoom: 14,
					},
					'objects-3d': {
						type: 'geojson',
						data: { type: 'FeatureCollection', features: [] },
					},
					'drone-trails': {
						type: 'geojson',
						data: { type: 'FeatureCollection', features: [] },
					},
				},
				layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
				terrain: { source: 'gsidem', exaggeration: 1.2 },
			},
		})

		map.current.on('load', () => {
			setupMapLayers()
			setupMapEvents()
			setStatus('システム準備完了')
		})
		map.current.on('error', e => {
			console.error('MapLibreエラー:', e)
			setStatus('マップエラー発生')
		})
		return () => {
			if (map.current) map.current.remove()
		}
	}, [gsidem2terrainrgb])

	// (マップレイヤー設定、イベント設定、オブジェクト表示更新は変更なし)
	const setupMapLayers = useCallback(() => {
		/* ... */
	}, [])
	const setupMapEvents = useCallback(() => {
		/* ... */
	}, [drawMode])
	const updateDisplay = useCallback(() => {
		/* ... */
	}, [loadedObjects])
	useEffect(() => {
		updateDisplay()
	}, [loadedObjects, updateDisplay])
	const showObjectInfo = useCallback((e: maplibregl.MapMouseEvent) => {
		/* ... */
	}, [])
	const addObjectAtLocation = useCallback(
		(lngLat: maplibregl.LngLat) => {
			/* ... */
		},
		[loadedObjects.length]
	)

	// ファイル処理をフライトプラン対応に修正
	const handleFiles = useCallback(
		async (files: FileList) => {
			setStatus('ファイル処理中...')
			for (const file of Array.from(files)) {
				try {
					const content = await file.text()
					if (file.name.endsWith('.json')) {
						const data = JSON.parse(content)
						if (data.phases && Array.isArray(data.phases)) {
							setFlightPlan(data as FlightPlan)
							setStatus(`フライトプラン読み込み完了: ${data.name}`)
							// ドローンを初期位置に配置
							const firstPhase = data.phases[0]
							const drone: DroneObject = {
								id: 'flight_drone_01',
								name: '実行ドローン',
								longitude: firstPhase.position[0],
								latitude: firstPhase.position[1],
								altitude: firstPhase.position[2],
								type: 'drone',
								source: 'flight-plan',
							}
							setLoadedObjects([drone])
							map.current?.flyTo({
								center: firstPhase.position,
								zoom: 15,
								pitch: 70,
							})
							return // 他のファイル処理をスキップ
						}
					}
					// 他のCSV/GeoJSON処理
					let objects: DroneObject[] = []
					if (file.name.endsWith('.csv')) objects = parseDroneCSV(content, file.name)
					else if (file.name.endsWith('.geojson')) objects = parseGeoJSON(content, file.name)

					const newObjects = objects.filter(
						newObj =>
							!loadedObjects.some(
								existing =>
									Math.abs(existing.longitude - newObj.longitude) < 0.00001 &&
									Math.abs(existing.latitude - newObj.latitude) < 0.00001
							)
					)
					setLoadedObjects(prev => [...prev, ...newObjects])
				} catch (error) {
					console.error('ファイル処理エラー:', error)
					setStatus(`ファイル処理エラー: ${(error as Error).message}`)
				}
			}
			setStatus(`${files.length}ファイルの処理完了`)
		},
		[loadedObjects]
	)

	// フライトプラン実行エンジン
	const executeFlightPlan = useCallback(() => {
		if (!flightPlan || currentPhaseIndex !== -1) {
			setStatus(
				currentPhaseIndex !== -1 ? 'フライト実行中です' : '実行するフライトプランがありません'
			)
			return
		}
		setCurrentPhaseIndex(0)
	}, [flightPlan, currentPhaseIndex])

	// 位相実行の副作用
	useEffect(() => {
		if (currentPhaseIndex === -1 || !flightPlan || !map.current) return

		if (currentPhaseIndex >= flightPlan.phases.length) {
			setStatus('フライトプラン完了')
			setCurrentPhaseIndex(-1)
			if (flightTimeoutRef.current) clearTimeout(flightTimeoutRef.current)
			return
		}

		const phase = flightPlan.phases[currentPhaseIndex]
		setStatus(`実行中: ${phase.phase} - ${phase.action}`)

		// ドローンオブジェクトを更新
		setLoadedObjects(prev =>
			prev.map(obj =>
				obj.id === 'flight_drone_01'
					? {
							...obj,
							longitude: phase.position[0],
							latitude: phase.position[1],
							altitude: phase.position[2],
						}
					: obj
			)
		)

		// 地図をドローンに追従
		map.current.flyTo({
			center: phase.position,
			duration: phase.duration * 0.8, // アニメーション時間
			essential: true,
		})

		// 次のフェーズへ
		flightTimeoutRef.current = setTimeout(() => {
			setCurrentPhaseIndex(prevIndex => prevIndex + 1)
		}, phase.duration)
	}, [currentPhaseIndex, flightPlan])

	// 実行停止処理
	const stopFlightPlan = useCallback(() => {
		if (flightTimeoutRef.current) clearTimeout(flightTimeoutRef.current)
		setCurrentPhaseIndex(-1)
		setStatus('フライトプランを停止しました')
	}, [])

	// (ドラッグ＆ドロップ、データクリア、2D/3D切替、描画モードは変更なし)
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setDragOver(true)
	}, [])
	const handleDragLeave = useCallback(() => {
		setDragOver(false)
	}, [])
	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragOver(false)
			if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
		},
		[handleFiles]
	)
	const clearAllData = useCallback(
		() => {
			/* ... */
		},
		[
			/* ... */
		]
	)
	const toggle3D = useCallback(() => {
		/* ... */
	}, [is3D])
	const enableDrawMode = useCallback(() => {
		/* ... */
	}, [drawMode])
	const removeObject = useCallback((objectId: string) => {
		/* ... */
	}, [])
	const focusOnObject = useCallback(
		(objectId: string) => {
			/* ... */
		},
		[loadedObjects]
	)
	const stats = React.useMemo(() => {
		/* ... */
	}, [loadedObjects])
	const sortedObjects = React.useMemo(() => {
		/* ... */
	}, [loadedObjects])

	return (
		<div
			className={`drone-data-system ${className}`}
			style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
		>
			<div ref={mapContainer} style={{ flex: 1, minHeight: 0 }} />

			<div
				style={{
					height: '350px',
					overflowY: 'auto',
					padding: '20px',
					background: '#f5f5f5',
					borderTop: '1px solid #ddd',
				}}
			>
				<h3>✈️ フライトプランナー</h3>

				<div
					style={{
						margin: '10px 0',
						padding: '10px',
						background: '#e8f4f8',
						borderRadius: '5px',
						fontSize: '14px',
					}}
				>
					{status}
				</div>

				<div
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => fileInputRef.current?.click()}
					style={{
						border: `2px dashed ${dragOver ? '#007cba' : '#ccc'}`,
						background: dragOver ? '#e3f2fd' : 'transparent',
						padding: '20px',
						textAlign: 'center',
						margin: '10px 0',
						cursor: 'pointer',
						transition: 'all 0.3s',
						borderRadius: '5px',
					}}
				>
					📂 フライトプラン(JSON)や他のデータ(CSV)をドロップ
				</div>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept=".csv,.json,.geojson"
					style={{ display: 'none' }}
					onChange={e => e.target.files && handleFiles(e.target.files)}
				/>

				<div style={{ marginBottom: '15px' }}>
					<button
						onClick={executeFlightPlan}
						disabled={!flightPlan || currentPhaseIndex !== -1}
						style={buttonStyle}
					>
						🚁 フライトプラン開始
					</button>
					<button onClick={stopFlightPlan} disabled={currentPhaseIndex === -1} style={buttonStyle}>
						⏹️ フライト停止
					</button>
					<button onClick={clearAllData} style={buttonStyle}>
						🗑️ データクリア
					</button>
					<button onClick={toggle3D} style={buttonStyle}>
						🔄 2D/3D切り替え
					</button>
				</div>

				{flightPlan && (
					<div>
						<h4>実行中のプラン: {flightPlan.name}</h4>
						<ul>
							{flightPlan.phases.map((phase, index) => (
								<li
									key={index}
									style={{
										fontWeight: index === currentPhaseIndex ? 'bold' : 'normal',
										color: index < currentPhaseIndex ? 'gray' : 'black',
									}}
								>
									{phase.phase}: {phase.action}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</div>
	)
}

const buttonStyle: React.CSSProperties = {
	padding: '8px 16px',
	margin: '5px',
	cursor: 'pointer',
	background: '#007cba',
	color: 'white',
	border: 'none',
	borderRadius: '3px',
	transition: 'all 0.3s',
}

// (getTypeBadgeStyleはここでは不要なので省略)

export default DroneDataSystem
