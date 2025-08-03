import React, { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
	parseDroneCSV,
	parseGeoJSON,
	type DroneObject,
	type UnifiedFlightData,
} from '../src/data-import-export'
import {
	createThreeVisualization,
	type ThreeLayer,
	type DroneTrajectoryRenderer,
} from '../src/three-layer'

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
	const [is3D, setIs3D] = useState(true)
	const [enable3DVisualization, setEnable3DVisualization] = useState(false)
	const [status, setStatus] = useState('システム準備中...')
	const [dragOver, setDragOver] = useState(false)
	const [showControlPanel, setShowControlPanel] = useState(true)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// Three.js関連のref
	const threeLayer = useRef<ThreeLayer | null>(null)
	const trajectoryRenderer = useRef<DroneTrajectoryRenderer | null>(null)

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
			image.src = params.url.replace('gsidem://', '')
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
						tiles: ['gsidem://https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
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
			setup3DVisualization()
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

	// 3D可視化のセットアップ
	const setup3DVisualization = useCallback(() => {
		if (!map.current) return

		const { layer, renderer } = createThreeVisualization()
		threeLayer.current = layer
		trajectoryRenderer.current = renderer

		// マップにThree.jsレイヤーを追加
		if (enable3DVisualization) {
			map.current.addLayer(layer)
		}
	}, [enable3DVisualization])

	// 3D表示の切り替え
	const toggle3DVisualization = useCallback(() => {
		if (!map.current || !threeLayer.current) return

		if (enable3DVisualization) {
			// 3D表示を無効化
			if (map.current.getLayer(threeLayer.current.id)) {
				map.current.removeLayer(threeLayer.current.id)
			}
			setEnable3DVisualization(false)
		} else {
			// 3D表示を有効化
			map.current.addLayer(threeLayer.current)
			setEnable3DVisualization(true)
			// 既存のデータがあれば3D表示
			if (loadedObjects.length > 0) {
				render3DTrajectory()
			}
		}
	}, [enable3DVisualization, loadedObjects])

	// 3D軌跡のレンダリング
	const render3DTrajectory = useCallback(() => {
		if (!trajectoryRenderer.current || !enable3DVisualization) return

		// DroneObjectをUnifiedFlightDataに変換
		const flightData: UnifiedFlightData[] = loadedObjects.map((obj, index) => ({
			id: obj.id,
			name: obj.name,
			type: 'waypoint',
			source: obj.source,
			position: {
				longitude: obj.longitude,
				latitude: obj.latitude,
				altitude: obj.altitude,
			},
			flight: {
				action: obj.type === 'drone' ? 'waypoint' : 'hover',
				sequenceNumber: index,
			},
		}))

		trajectoryRenderer.current.renderFlightPath(flightData)
	}, [loadedObjects, enable3DVisualization])

	// (マップレイヤー設定、イベント設定、オブジェクト表示更新は変更なし)
	const setupMapLayers = useCallback(() => {
		/* ... */
	}, [])
	const setupMapEvents = useCallback(() => {
		/* ... */
	}, [])
	const updateDisplay = useCallback(() => {
		/* ... */
	}, [loadedObjects])
	useEffect(() => {
		updateDisplay()
		// 3D表示が有効な場合は3D軌跡も更新
		if (enable3DVisualization) {
			render3DTrajectory()
		}
	}, [loadedObjects, updateDisplay, enable3DVisualization, render3DTrajectory])
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

	// サンプルフライトプランのダウンロード
	const downloadSampleFlightPlan = useCallback(() => {
		const sampleData = {
			name: '3D高度テストフライト',
			description: 'Three.js 3D可視化テスト用のサンプルフライトプラン',
			phases: [
				{
					phase: '離陸',
					action: 'takeoff',
					duration: 5,
					position: [139.6917, 35.6895, 50],
				},
				{
					phase: '上昇',
					action: 'move',
					duration: 10,
					position: [139.692, 35.69, 150],
				},
				{
					phase: '高高度移動',
					action: 'move',
					duration: 15,
					position: [139.693, 35.691, 250],
				},
				{
					phase: '撮影ポイント',
					action: 'photo',
					duration: 8,
					position: [139.6935, 35.6915, 300],
				},
				{
					phase: '低高度移動',
					action: 'move',
					duration: 12,
					position: [139.6925, 35.6905, 100],
				},
				{
					phase: 'ホバリング',
					action: 'hover',
					duration: 5,
					position: [139.692, 35.69, 80],
				},
				{
					phase: '着陸',
					action: 'land',
					duration: 8,
					position: [139.6917, 35.6895, 0],
				},
			],
			totalDuration: 63,
		}

		const blob = new Blob([JSON.stringify(sampleData, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'sample-3d-flight.json'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)

		setStatus('3Dサンプルフライトプランをダウンロードしました')
	}, [])

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
			style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}
		>
			<div ref={mapContainer} style={{ flex: 1, minHeight: 0 }} />

			{/* 浮動3Dコントロールパネル */}
			<div
				style={{
					position: 'absolute',
					top: '20px',
					right: '20px',
					background: 'rgba(255, 255, 255, 0.95)',
					padding: '15px',
					borderRadius: '10px',
					boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
					zIndex: 1000,
					minWidth: '200px',
				}}
			>
				<div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
					🌐 3D表示コントロール
				</div>
				<button
					onClick={toggle3DVisualization}
					style={{
						width: '100%',
						padding: '12px 20px',
						background: enable3DVisualization ? '#4CAF50' : '#FF9800',
						color: 'white',
						border: 'none',
						borderRadius: '6px',
						cursor: 'pointer',
						fontSize: '14px',
						fontWeight: 'bold',
						boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
						transition: 'all 0.3s ease',
					}}
					onMouseOver={e => {
						e.currentTarget.style.transform = 'scale(1.05)'
					}}
					onMouseOut={e => {
						e.currentTarget.style.transform = 'scale(1)'
					}}
				>
					{enable3DVisualization ? '🌐 3D表示 ON' : '🗺️ 3D表示 OFF'}
				</button>
				<div
					style={{
						marginTop: '10px',
						padding: '8px',
						background: enable3DVisualization ? '#E8F5E8' : '#FFF3E0',
						borderRadius: '4px',
						fontSize: '12px',
						color: '#666',
					}}
				>
					{enable3DVisualization ? '高度情報を3D空間で表示中' : '通常の2D表示モード'}
				</div>
			</div>

			{/* 浮動サンプルデータパネル */}
			<div
				style={{
					position: 'absolute',
					top: '20px',
					left: '20px',
					background: 'rgba(255, 255, 255, 0.95)',
					padding: '15px',
					borderRadius: '10px',
					boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
					zIndex: 1000,
					minWidth: '250px',
				}}
			>
				<div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
					📂 サンプルデータ
				</div>
				<button
					onClick={downloadSampleFlightPlan}
					style={{
						width: '100%',
						padding: '10px 16px',
						background: '#2196F3',
						color: 'white',
						border: 'none',
						borderRadius: '6px',
						cursor: 'pointer',
						fontSize: '13px',
						fontWeight: 'bold',
						boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
						marginBottom: '8px',
					}}
				>
					📥 3D軌跡サンプルをダウンロード
				</button>
				<div
					style={{
						fontSize: '11px',
						color: '#666',
						lineHeight: '1.4',
					}}
				>
					高度50m→300m→0mの3D軌跡テストデータです。ダウンロード後、下部パネルにドラッグ&ドロップしてください。
				</div>
			</div>

			{/* パネル表示切り替えボタン */}
			<div
				style={{
					position: 'absolute',
					bottom: '20px',
					right: '20px',
					zIndex: 1000,
				}}
			>
				<button
					onClick={() => setShowControlPanel(!showControlPanel)}
					style={{
						padding: '12px',
						background: 'rgba(0, 0, 0, 0.8)',
						color: 'white',
						border: 'none',
						borderRadius: '50%',
						cursor: 'pointer',
						fontSize: '16px',
						width: '50px',
						height: '50px',
						boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
						transition: 'all 0.3s ease',
					}}
					title={showControlPanel ? 'パネルを隠す' : 'パネルを表示'}
				>
					{showControlPanel ? '📐' : '🔧'}
				</button>
			</div>

			{showControlPanel && (
				<div
					style={{
						height: '350px',
						overflowY: 'auto',
						padding: '20px',
						background: '#f5f5f5',
						borderTop: '1px solid #ddd',
					}}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '15px',
							padding: '10px',
							background: '#ffffff',
							borderRadius: '8px',
							border: '1px solid #ddd',
						}}
					>
						<h3 style={{ margin: 0 }}>✈️ フライトプランナー</h3>
						<button
							onClick={toggle3DVisualization}
							style={{
								padding: '10px 20px',
								background: enable3DVisualization ? '#4CAF50' : '#FF9800',
								color: 'white',
								border: '2px solid transparent',
								borderRadius: '6px',
								cursor: 'pointer',
								fontSize: '14px',
								fontWeight: 'bold',
								boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
								minWidth: '140px',
							}}
						>
							{enable3DVisualization ? '🌐 3D ON' : '🗺️ 3D OFF'}
						</button>
					</div>

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
						{enable3DVisualization && (
							<span style={{ marginLeft: '10px', color: '#4CAF50', fontWeight: 'bold' }}>
								3D可視化モード
							</span>
						)}
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
						<div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
							サンプルデータが必要な場合：
							<button
								onClick={e => {
									e.stopPropagation()
									downloadSampleFlightPlan()
								}}
								style={{
									marginLeft: '8px',
									padding: '4px 8px',
									background: '#2196F3',
									color: 'white',
									border: 'none',
									borderRadius: '4px',
									cursor: 'pointer',
									fontSize: '11px',
								}}
							>
								📥 3Dサンプルをダウンロード
							</button>
						</div>
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
						<button
							onClick={stopFlightPlan}
							disabled={currentPhaseIndex === -1}
							style={buttonStyle}
						>
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
			)}
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
