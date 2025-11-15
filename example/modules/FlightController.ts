/**
 * フライトコントローラーモジュール
 * ゲーム風の滑らかな3Dフライトコントロール
 */

import type { Map } from 'maplibre-gl'
import type {
	FlightPlanPhase,
	FlightPlanData,
	FlightLogEntry,
	CameraSettings,
	FlightControllerConfig,
} from './types'

/**
 * イージング関数
 */
export const easingFunctions = {
	linear: (t: number) => t,
	easeInQuad: (t: number) => t * t,
	easeOutQuad: (t: number) => t * (2 - t),
	easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
	easeInCubic: (t: number) => t * t * t,
	easeOutCubic: (t: number) => --t * t * t + 1,
	easeInOutCubic: (t: number) =>
		t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
	easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
	easeOutElastic: (t: number) => {
		const c4 = (2 * Math.PI) / 3
		return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
	},
}

export class FlightController {
	private map: Map
	private config: FlightControllerConfig
	private flightLog: FlightLogEntry[] = []
	private currentFlightPlan: FlightPlanPhase[] = []
	private currentFlightPlanName = ''
	private currentFlightPlanDescription = ''
	private flightPlanActive = false
	private currentFlightPhase = 0
	private animationFrameId: number | null = null
	private onLogUpdate?: (log: FlightLogEntry[]) => void

	constructor(map: Map, config?: Partial<FlightControllerConfig>) {
		this.map = map
		this.config = {
			maxSpeed: 20, // m/s
			maxAltitude: 500, // m
			minAltitude: 5, // m
			acceleration: 2, // m/s²
			deceleration: 3, // m/s²
			rotationSpeed: 45, // 度/s
			physicsEnabled: true,
			collisionDetection: false,
			...config,
		}
	}

	/**
	 * ログ更新コールバックを設定
	 */
	setLogUpdateCallback(callback: (log: FlightLogEntry[]) => void): void {
		this.onLogUpdate = callback
	}

	/**
	 * フライトログを追加
	 */
	addFlightLog(
		phase: string,
		action: string,
		details: string,
		type: 'info' | 'success' | 'error' | 'warning' = 'info'
	): void {
		const entry: FlightLogEntry = {
			timestamp: new Date().toLocaleTimeString('ja-JP'),
			phase,
			action,
			details,
			type,
		}
		this.flightLog.push(entry)

		if (this.onLogUpdate) {
			this.onLogUpdate(this.flightLog)
		}
	}

	/**
	 * フライトログを取得
	 */
	getFlightLog(): FlightLogEntry[] {
		return this.flightLog
	}

	/**
	 * フライトログをクリア
	 */
	clearFlightLog(): void {
		this.flightLog = []
		if (this.onLogUpdate) {
			this.onLogUpdate(this.flightLog)
		}
	}

	/**
	 * フライトプランを設定
	 */
	setFlightPlan(plan: FlightPlanData): void {
		this.currentFlightPlan = plan.phases
		this.currentFlightPlanName = plan.name
		this.currentFlightPlanDescription = plan.description
		this.addFlightLog('システム', 'フライトプラン設定', `${plan.name} を読み込みました`, 'success')
	}

	/**
	 * フライトプランを開始
	 */
	startFlightPlan(): void {
		if (this.currentFlightPlan.length === 0) {
			this.addFlightLog('エラー', 'フライトプラン', 'フライトプランが設定されていません', 'error')
			return
		}

		if (this.flightPlanActive) {
			this.addFlightLog('警告', 'フライトプラン', '既にフライトプランが実行中です', 'warning')
			return
		}

		this.flightPlanActive = true
		this.currentFlightPhase = 0
		this.addFlightLog(
			'フライト開始',
			this.currentFlightPlanName,
			this.currentFlightPlanDescription,
			'success'
		)
		this.executeFlightPhase()
	}

	/**
	 * フライトプランを一時停止
	 */
	pauseFlightPlan(): void {
		this.flightPlanActive = false
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
		this.addFlightLog('フライト一時停止', '操作', 'フライトプランを一時停止しました', 'info')
	}

	/**
	 * フライトプランを再開
	 */
	resumeFlightPlan(): void {
		if (this.currentFlightPlan.length === 0) {
			this.addFlightLog('エラー', 'フライトプラン', 'フライトプランが設定されていません', 'error')
			return
		}

		this.flightPlanActive = true
		this.addFlightLog('フライト再開', '操作', 'フライトプランを再開しました', 'success')
		this.executeFlightPhase()
	}

	/**
	 * フライトプランを停止
	 */
	stopFlightPlan(): void {
		this.flightPlanActive = false
		this.currentFlightPhase = 0
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
		this.addFlightLog('フライト停止', '操作', 'フライトプランを停止しました', 'warning')
	}

	/**
	 * フライトプランのフェーズを実行
	 */
	private executeFlightPhase(): void {
		if (!this.flightPlanActive || this.currentFlightPhase >= this.currentFlightPlan.length) {
			this.completeFlightPlan()
			return
		}

		const phase = this.currentFlightPlan[this.currentFlightPhase]
		this.addFlightLog(
			phase.phase,
			phase.action,
			`フェーズ ${this.currentFlightPhase + 1} 開始`,
			'info'
		)

		// カメラ設定を構築
		const cameraSettings: CameraSettings = {
			center: [phase.position[0], phase.position[1]],
			zoom: phase.zoom ?? 17,
			pitch: phase.pitch ?? 60,
			bearing: phase.bearing ?? 0,
			duration: phase.duration,
			easing: easingFunctions.easeInOutCubic,
		}

		// カメラをアニメーション
		this.map.flyTo(cameraSettings)

		// 次のフェーズへ
		setTimeout(() => {
			this.currentFlightPhase++
			this.executeFlightPhase()
		}, phase.duration)
	}

	/**
	 * フライトプランを完了
	 */
	private completeFlightPlan(): void {
		this.flightPlanActive = false
		this.currentFlightPhase = 0
		this.addFlightLog('フライト完了', '完了', 'フライトプランが正常に完了しました', 'success')
	}

	/**
	 * 滑らかなカメラ移動（ゲーム風）
	 */
	flyToSmooth(
		target: [number, number, number],
		options?: {
			duration?: number
			zoom?: number
			pitch?: number
			bearing?: number
			easing?: keyof typeof easingFunctions
		}
	): void {
		const settings: CameraSettings = {
			center: [target[0], target[1]],
			zoom: options?.zoom ?? this.map.getZoom(),
			pitch: options?.pitch ?? this.map.getPitch(),
			bearing: options?.bearing ?? this.map.getBearing(),
			duration: options?.duration ?? 1000,
			easing: options?.easing ? easingFunctions[options.easing] : easingFunctions.easeInOutCubic,
		}

		this.map.flyTo(settings)
	}

	/**
	 * カスタムアニメーションパス
	 */
	flyAlongPath(
		waypoints: [number, number, number][],
		options?: {
			totalDuration?: number
			onProgress?: (progress: number, currentWaypoint: number) => void
			onComplete?: () => void
		}
	): void {
		if (waypoints.length < 2) {
			console.warn('At least 2 waypoints are required')
			return
		}

		const totalDuration = options?.totalDuration ?? waypoints.length * 2000
		const segmentDuration = totalDuration / (waypoints.length - 1)

		let currentSegment = 0

		const animateSegment = () => {
			if (currentSegment >= waypoints.length - 1) {
				if (options?.onComplete) {
					options.onComplete()
				}
				return
			}

			const start = waypoints[currentSegment]
			const end = waypoints[currentSegment + 1]

			// 方位を計算
			const bearing = this.calculateBearing(start, end)

			this.map.flyTo({
				center: [end[0], end[1]],
				zoom: 17,
				pitch: 60,
				bearing: bearing,
				duration: segmentDuration,
				easing: easingFunctions.easeInOutCubic,
			})

			if (options?.onProgress) {
				const progress = (currentSegment + 1) / waypoints.length
				options.onProgress(progress, currentSegment + 1)
			}

			currentSegment++

			setTimeout(() => {
				this.animationFrameId = requestAnimationFrame(animateSegment)
			}, segmentDuration)
		}

		animateSegment()
	}

	/**
	 * 2点間の方位角を計算
	 */
	private calculateBearing(start: [number, number, number], end: [number, number, number]): number {
		const startLat = (start[1] * Math.PI) / 180
		const startLng = (start[0] * Math.PI) / 180
		const endLat = (end[1] * Math.PI) / 180
		const endLng = (end[0] * Math.PI) / 180

		const y = Math.sin(endLng - startLng) * Math.cos(endLat)
		const x =
			Math.cos(startLat) * Math.sin(endLat) -
			Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng)

		const bearing = (Math.atan2(y, x) * 180) / Math.PI
		return (bearing + 360) % 360
	}

	/**
	 * 軌道飛行（円形パス）
	 */
	flyOrbit(
		center: [number, number],
		radius: number,
		altitude: number,
		options?: {
			duration?: number
			clockwise?: boolean
			startAngle?: number
			onProgress?: (angle: number) => void
		}
	): void {
		const duration = options?.duration ?? 10000
		const clockwise = options?.clockwise ?? true
		const startAngle = options?.startAngle ?? 0
		const fps = 60
		const totalFrames = (duration / 1000) * fps
		let currentFrame = 0

		const animate = () => {
			if (currentFrame >= totalFrames) {
				return
			}

			const progress = currentFrame / totalFrames
			const angle = startAngle + (clockwise ? 1 : -1) * progress * 360

			// 円形パス上の位置を計算
			const radians = (angle * Math.PI) / 180
			const lng = center[0] + (radius / 111320) * Math.cos(radians)
			const lat = center[1] + (radius / 110540) * Math.sin(radians)

			this.map.setCenter([lng, lat])
			this.map.setBearing(angle)

			if (options?.onProgress) {
				options.onProgress(angle)
			}

			currentFrame++
			this.animationFrameId = requestAnimationFrame(animate)
		}

		animate()
	}

	/**
	 * フライトプランの状態を取得
	 */
	getFlightPlanStatus(): {
		active: boolean
		currentPhase: number
		totalPhases: number
		planName: string
	} {
		return {
			active: this.flightPlanActive,
			currentPhase: this.currentFlightPhase,
			totalPhases: this.currentFlightPlan.length,
			planName: this.currentFlightPlanName,
		}
	}

	/**
	 * 設定を更新
	 */
	updateConfig(config: Partial<FlightControllerConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * 現在の設定を取得
	 */
	getConfig(): FlightControllerConfig {
		return { ...this.config }
	}
}
