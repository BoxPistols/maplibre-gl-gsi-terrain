import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import type { UnifiedFlightData } from './data-import-export'

/**
 * MapLibre用のThree.jsカスタムレイヤー
 * 地理座標系とThree.js座標系の変換を担当
 */
export class ThreeLayer implements maplibregl.CustomLayerInterface {
	id: string
	type: 'custom' = 'custom'
	renderingMode: '3d' = '3d'

	private map?: maplibregl.Map
	private camera?: THREE.Camera
	private scene?: THREE.Scene
	private renderer?: THREE.WebGLRenderer
	private world?: THREE.Group
	private initialized = false

	// 座標変換用のパラメータ
	private mercatorCoordinate?: maplibregl.MercatorCoordinate
	private modelTransform?: number[]

	constructor(id: string = 'three-layer') {
		this.id = id
	}

	onAdd(map: maplibregl.Map, gl: WebGLRenderingContext): void {
		this.map = map

		// Three.jsシーンの初期化
		this.scene = new THREE.Scene()
		this.camera = new THREE.Camera()
		this.world = new THREE.Group()
		this.scene.add(this.world)

		// 立体感のための照明を追加
		const ambientLight = new THREE.AmbientLight(0x404040, 0.6) // 環境光
		this.scene.add(ambientLight)

		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8) // 方向光
		directionalLight.position.set(100, 100, 50)
		this.scene.add(directionalLight)

		console.log('Added lighting for 3D depth')

		// WebGLRendererの初期化（既存のコンテキストを使用）
		this.renderer = new THREE.WebGLRenderer({
			canvas: map.getCanvas(),
			context: gl,
			antialias: true,
		})

		this.renderer.autoClear = false
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

		// 地図の中心を原点とする座標系を設定
		const center = map.getCenter()
		this.mercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat([center.lng, center.lat], 0)

		// モデル変換行列の計算 - 簡略化版
		const zoom = map.getZoom()
		const scale = Math.pow(2, zoom)
		this.modelTransform = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1]

		this.initialized = true
		console.log('ThreeLayer onAdd completed. World:', this.world, 'Scene:', this.scene)
	}

	render(gl: WebGLRenderingContext, matrix: number[]): void {
		if (!this.initialized || !this.map || !this.camera || !this.scene || !this.renderer) {
			console.log('Three.js render skipped - not initialized')
			return
		}

		console.log('Three.js rendering...', this.world?.children.length, 'objects')

		// MapLibreのカメラ情報をThree.jsカメラに同期 - 簡略化版
		const m = new THREE.Matrix4().fromArray(matrix)
		this.camera.projectionMatrix = m
		this.camera.matrixWorldInverse = new THREE.Matrix4()

		// Three.jsシーンをレンダリング
		this.renderer.resetState()
		this.renderer.render(this.scene, this.camera)
		this.map.triggerRepaint()
	}

	onRemove(): void {
		if (this.renderer) {
			this.renderer.dispose()
		}
		this.initialized = false
	}

	/**
	 * 地理座標をThree.js座標に変換
	 */
	geoToThree(lng: number, lat: number, altitude: number = 0): THREE.Vector3 {
		if (!this.map) {
			throw new Error('Layer not initialized')
		}

		// 地図の中心を基準とした相対座標に変換
		const center = this.map.getCenter()

		// 度をメートルに変換（概算）
		const x = (lng - center.lng) * 111320 * Math.cos((center.lat * Math.PI) / 180)
		const y = (lat - center.lat) * 111320
		const z = altitude

		console.log('geoToThree:', { lng, lat, altitude }, '→', { x, y, z })
		return new THREE.Vector3(x, -y, z)
	}

	/**
	 * Three.js座標を地理座標に変換
	 */
	threeToGeo(position: THREE.Vector3): { lng: number; lat: number; altitude: number } {
		if (!this.mercatorCoordinate) {
			throw new Error('Layer not initialized')
		}

		const x = position.x + this.mercatorCoordinate.x
		const y = -position.y + this.mercatorCoordinate.y
		const z = position.z + this.mercatorCoordinate.z

		const coord = new maplibregl.MercatorCoordinate(x, y, z)
		const lngLat = coord.toLngLat()

		return {
			lng: lngLat.lng,
			lat: lngLat.lat,
			altitude: z,
		}
	}

	/**
	 * Three.jsオブジェクトをシーンに追加
	 */
	addObject(object: THREE.Object3D): void {
		console.log('addObject called, world:', this.world)
		if (this.world) {
			this.world.add(object)
			console.log('Object added to world. World now has', this.world.children.length, 'children')
		} else {
			console.error('World is null, cannot add object')
		}
	}

	/**
	 * Three.jsオブジェクトをシーンから削除
	 */
	removeObject(object: THREE.Object3D): void {
		if (this.world) {
			this.world.remove(object)
		}
	}

	/**
	 * シーンをクリア
	 */
	clearScene(): void {
		if (this.world) {
			while (this.world.children.length > 0) {
				this.world.remove(this.world.children[0])
			}
		}
	}

	/**
	 * シーンオブジェクトを取得
	 */
	getScene(): THREE.Scene | undefined {
		return this.scene
	}

	/**
	 * ワールドグループを取得
	 */
	getWorld(): THREE.Group | undefined {
		return this.world
	}
}

/**
 * ドローン軌跡の3D可視化クラス
 */
export class DroneTrajectoryRenderer {
	private threeLayer: ThreeLayer
	private trajectoryGroup: THREE.Group
	private droneModels: Map<string, THREE.Object3D> = new Map()

	constructor(threeLayer: ThreeLayer) {
		console.log('DroneTrajectoryRenderer constructor called')
		this.threeLayer = threeLayer
		this.trajectoryGroup = new THREE.Group()
		console.log('Created trajectory group:', this.trajectoryGroup)
		// trajectoryGroupの追加は後で行う（initializeメソッドで）
	}

	/**
	 * レンダラーを初期化（ThreeLayerのonAdd後に呼ぶ）
	 */
	initialize(): void {
		console.log('DroneTrajectoryRenderer initialize called')
		this.threeLayer.addObject(this.trajectoryGroup)
		console.log('Trajectory group added to three layer after initialization')
	}

	/**
	 * フライトデータから3D軌跡を生成
	 */
	renderFlightPath(flightData: UnifiedFlightData[]): void {
		console.log('renderFlightPath called with', flightData.length, 'data points')

		// 既存の軌跡をクリア
		this.clearTrajectories()

		if (flightData.length === 0) {
			console.log('No flight data to render')
			return
		}

		// まず、シンプルなテストオブジェクトを追加
		this.addTestCube()

		// 軌跡ラインの生成
		const points: THREE.Vector3[] = []
		flightData.forEach((data, index) => {
			const point = this.threeLayer.geoToThree(
				data.position.longitude,
				data.position.latitude,
				data.position.altitude
			)
			console.log(`Point ${index}:`, data.position, '→', point)
			points.push(point)
		})

		// ラインジオメトリの作成 - 立体感のあるパイプライン
		const geometry = new THREE.BufferGeometry().setFromPoints(points)

		// 太いパイプライン状のラインを作成
		const tubeGeometry = new THREE.TubeGeometry(
			new THREE.CatmullRomCurve3(points),
			points.length * 2, // segments
			2, // radius
			8, // radial segments
			false // closed
		)

		const material = new THREE.MeshPhongMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.8,
			shininess: 50,
			specular: 0x222222,
			side: THREE.DoubleSide,
		})

		// パイプライン（太い立体的なライン）を追加
		const tube = new THREE.Mesh(tubeGeometry, material)
		this.trajectoryGroup.add(tube)
		console.log('Added tube to trajectory group')

		// ウェイポイントマーカーの追加
		flightData.forEach((data, index) => {
			this.addWaypointMarker(data, index)
		})
		console.log(`Added ${flightData.length} waypoint markers`)
		console.log('Total objects in trajectory group:', this.trajectoryGroup.children.length)
	}

	/**
	 * ウェイポイントマーカーを追加
	 */
	private addWaypointMarker(data: UnifiedFlightData, index: number): void {
		const position = this.threeLayer.geoToThree(
			data.position.longitude,
			data.position.latitude,
			data.position.altitude
		)

		// マーカーの形状（立体的な球体）- より大きく見やすく
		const geometry = new THREE.SphereGeometry(8, 32, 32) // より高解像度で大きなマーカー
		const material = new THREE.MeshPhongMaterial({
			color: this.getMarkerColor(data.flight?.action),
			transparent: true,
			opacity: 0.9,
			shininess: 100,
			specular: 0x444444,
		})

		const marker = new THREE.Mesh(geometry, material)
		marker.position.copy(position)
		marker.userData = { flightData: data, index }

		this.trajectoryGroup.add(marker)
	}

	/**
	 * アクションに応じたマーカー色を取得
	 */
	private getMarkerColor(action?: string): number {
		switch (action) {
			case 'takeoff':
				return 0x00ff00 // 緑
			case 'land':
				return 0xff0000 // 赤
			case 'hover':
				return 0xffff00 // 黄
			case 'photo':
			case 'video':
				return 0x0000ff // 青
			default:
				return 0xffffff // 白
		}
	}

	/**
	 * ドローンモデルを追加
	 */
	addDroneModel(id: string, position: { lng: number; lat: number; altitude: number }): void {
		// シンプルなドローンモデル（箱型）
		const geometry = new THREE.BoxGeometry(0.0002, 0.0002, 0.0001)
		const material = new THREE.MeshBasicMaterial({ color: 0xff6600 })
		const drone = new THREE.Mesh(geometry, material)

		const threePosition = this.threeLayer.geoToThree(position.lng, position.lat, position.altitude)
		drone.position.copy(threePosition)

		this.trajectoryGroup.add(drone)
		this.droneModels.set(id, drone)
	}

	/**
	 * ドローンモデルの位置を更新
	 */
	updateDronePosition(id: string, position: { lng: number; lat: number; altitude: number }): void {
		const drone = this.droneModels.get(id)
		if (drone) {
			const threePosition = this.threeLayer.geoToThree(
				position.lng,
				position.lat,
				position.altitude
			)
			drone.position.copy(threePosition)
		}
	}

	/**
	 * 軌跡をクリア
	 */
	clearTrajectories(): void {
		while (this.trajectoryGroup.children.length > 0) {
			this.trajectoryGroup.remove(this.trajectoryGroup.children[0])
		}
		this.droneModels.clear()
	}

	/**
	 * テスト用のキューブを追加（publicメソッド）
	 */
	addTestCube(): void {
		console.log('Adding test cube to DroneTrajectoryRenderer...')

		// 大きなテストキューブを中央に配置
		const geometry = new THREE.BoxGeometry(50, 50, 50)
		const material = new THREE.MeshPhongMaterial({
			color: 0xff0000,
			transparent: true,
			opacity: 0.7,
			shininess: 100,
			specular: 0x444444,
		})
		const cube = new THREE.Mesh(geometry, material)
		cube.position.set(0, 0, 50) // 少し上に配置

		this.trajectoryGroup.add(cube)
		console.log('Test cube added at position:', cube.position)
		console.log('Trajectory group now has', this.trajectoryGroup.children.length, 'children')
	}

	/**
	 * 軌跡グループを取得
	 */
	getTrajectoryGroup(): THREE.Group {
		return this.trajectoryGroup
	}
}

/**
 * Three.jsレイヤーとレンダラーを作成するヘルパー関数
 */
export function createThreeVisualization(): {
	layer: ThreeLayer
	renderer: DroneTrajectoryRenderer
} {
	const layer = new ThreeLayer()
	const renderer = new DroneTrajectoryRenderer(layer)

	return { layer, renderer }
}
