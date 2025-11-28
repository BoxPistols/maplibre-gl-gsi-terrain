/**
 * DebugManager - デバッグモード管理モジュール
 * フライト中のデータの動きをリアルタイムで表示し、開発者がデバッグできるようにする
 */

import type { Map as MapLibreMap } from 'maplibre-gl'
import type { DroneModel } from './DroneModel'
import type { FlightController } from './FlightController'
import type { FlightPlanPhase } from './types'

export interface DebugState {
	isEnabled: boolean
	flightStatus: 'STANDBY' | 'FLYING' | 'PAUSED' | 'COMPLETED' | 'ERROR'
	currentPhase: string
	phaseIndex: number
	totalPhases: number
	elapsedTime: number
	dronePosition: { lng: number; lat: number } | null
	droneAltitude: number
	droneHeading: number
	droneSpeed: number
	cameraCenter: { lng: number; lat: number } | null
	cameraZoom: number
	cameraPitch: number
	cameraBearing: number
	currentPhaseData: FlightPlanPhase | null
	totalObjects: number
	fps: number
	memory: number
}

export interface DebugEvent {
	time: string
	type: string
	data: string
}

export class DebugManager {
	private map: MapLibreMap | null = null
	private droneModel: DroneModel | null = null
	// Note: flightController is stored for potential future use (e.g., direct flight control from debug panel)
	private flightController: FlightController | null = null

	private state: DebugState = {
		isEnabled: false,
		flightStatus: 'STANDBY',
		currentPhase: '-',
		phaseIndex: 0,
		totalPhases: 0,
		elapsedTime: 0,
		dronePosition: null,
		droneAltitude: 0,
		droneHeading: 0,
		droneSpeed: 0,
		cameraCenter: null,
		cameraZoom: 0,
		cameraPitch: 0,
		cameraBearing: 0,
		currentPhaseData: null,
		totalObjects: 0,
		fps: 0,
		memory: 0,
	}

	private events: DebugEvent[] = []
	private maxEvents = 10
	private updateInterval: number | null = null
	private startTime: number = 0
	private frameCount = 0
	private lastFpsTime = 0

	// DOM要素
	private overlay: HTMLElement | null = null
	private toggleBtn: HTMLElement | null = null
	private closeBtn: HTMLElement | null = null
	private debugModeBtn: HTMLElement | null = null

	// イベントハンドラー参照（クリーンアップ用）
	private handleToggle: () => void
	private handleClose: () => void
	private handleToggleBtnClick: () => void

	constructor() {
		// イベントハンドラーをバインド
		this.handleToggle = () => this.toggle()
		this.handleClose = () => this.hide()
		this.handleToggleBtnClick = () => {
			if (this.overlay?.classList.contains('visible')) {
				this.hide()
			} else {
				this.show()
			}
		}

		this.initializeDOMElements()
		this.setupEventListeners()
	}

	/**
	 * DOM要素を初期化
	 */
	private initializeDOMElements(): void {
		this.overlay = document.getElementById('debugOverlay')
		this.toggleBtn = document.getElementById('debugToggleBtn')
		this.closeBtn = document.getElementById('debugOverlayClose')
	}

	/**
	 * イベントリスナーを設定
	 */
	private setupEventListeners(): void {
		// デバッグボタンのトグル（コントロールパネル内）
		this.debugModeBtn = document.getElementById('toggleDebugMode')
		if (this.debugModeBtn) {
			this.debugModeBtn.addEventListener('click', this.handleToggle)
		}

		// オーバーレイ右上の閉じるボタン
		if (this.closeBtn) {
			this.closeBtn.addEventListener('click', this.handleClose)
		}

		// フローティングトグルボタン
		if (this.toggleBtn) {
			this.toggleBtn.addEventListener('click', this.handleToggleBtnClick)
		}
	}

	/**
	 * イベントリスナーを削除
	 */
	private removeEventListeners(): void {
		if (this.debugModeBtn) {
			this.debugModeBtn.removeEventListener('click', this.handleToggle)
		}
		if (this.closeBtn) {
			this.closeBtn.removeEventListener('click', this.handleClose)
		}
		if (this.toggleBtn) {
			this.toggleBtn.removeEventListener('click', this.handleToggleBtnClick)
		}
	}

	/**
	 * マップインスタンスを設定
	 */
	setMap(map: MapLibreMap): void {
		this.map = map
	}

	/**
	 * ドローンモデルを設定
	 */
	setDroneModel(droneModel: DroneModel): void {
		this.droneModel = droneModel
	}

	/**
	 * フライトコントローラーを設定
	 */
	setFlightController(flightController: FlightController): void {
		this.flightController = flightController
	}

	/**
	 * デバッグモードを有効化
	 */
	enable(): void {
		this.state.isEnabled = true
		this.startTime = Date.now()
		this.lastFpsTime = performance.now()
		this.frameCount = 0

		// トグルボタンを表示
		if (this.toggleBtn) {
			this.toggleBtn.classList.add('active')
		}

		// 更新インターバルを開始
		this.startUpdateLoop()

		// オーバーレイを表示
		this.show()

		this.addEvent('ENABLE', 'Debug mode enabled')
		console.log('[DEBUG] Debug mode enabled')
	}

	/**
	 * デバッグモードを無効化
	 */
	disable(): void {
		this.state.isEnabled = false

		// トグルボタンを非表示
		if (this.toggleBtn) {
			this.toggleBtn.classList.remove('active')
		}

		// 更新インターバルを停止
		this.stopUpdateLoop()

		// オーバーレイを非表示
		this.hide()

		this.addEvent('DISABLE', 'Debug mode disabled')
		console.log('[DEBUG] Debug mode disabled')
	}

	/**
	 * デバッグモードをトグル
	 */
	toggle(): void {
		if (this.state.isEnabled) {
			this.disable()
		} else {
			this.enable()
		}
	}

	/**
	 * オーバーレイを表示
	 */
	show(): void {
		if (this.overlay) {
			this.overlay.classList.add('visible')
		}
	}

	/**
	 * オーバーレイを非表示
	 */
	hide(): void {
		if (this.overlay) {
			this.overlay.classList.remove('visible')
		}
	}

	/**
	 * 更新ループを開始
	 */
	private startUpdateLoop(): void {
		if (this.updateInterval) return

		this.updateInterval = window.setInterval(() => {
			this.updateState()
			this.updateDOM()
		}, 100) // 100ms間隔で更新
	}

	/**
	 * 更新ループを停止
	 */
	private stopUpdateLoop(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval)
			this.updateInterval = null
		}
	}

	/**
	 * 状態を更新
	 */
	private updateState(): void {
		// 経過時間
		this.state.elapsedTime = Date.now() - this.startTime

		// FPS計算
		this.frameCount++
		const now = performance.now()
		if (now - this.lastFpsTime >= 1000) {
			this.state.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime))
			this.frameCount = 0
			this.lastFpsTime = now
		}

		// メモリ使用量（利用可能な場合）
		if ((performance as any).memory) {
			this.state.memory = Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
		}

		// カメラ状態
		if (this.map) {
			const center = this.map.getCenter()
			this.state.cameraCenter = { lng: center.lng, lat: center.lat }
			this.state.cameraZoom = this.map.getZoom()
			this.state.cameraPitch = this.map.getPitch()
			this.state.cameraBearing = this.map.getBearing()
		}

		// ドローン状態
		if (this.droneModel) {
			// getPositionメソッドが存在する場合のみ呼び出し
			if (typeof this.droneModel.getPosition === 'function') {
				const pos = this.droneModel.getPosition()
				if (pos) {
					this.state.dronePosition = { lng: pos[0], lat: pos[1] }
					this.state.droneAltitude = pos[2] || 0
				}
			}
			// getHeadingメソッドが存在する場合のみ呼び出し
			if (typeof (this.droneModel as any).getHeading === 'function') {
				this.state.droneHeading = (this.droneModel as any).getHeading()
			}
			// getSpeedメソッドが存在する場合のみ呼び出し
			if (typeof (this.droneModel as any).getSpeed === 'function') {
				this.state.droneSpeed = (this.droneModel as any).getSpeed()
			}
		}
	}

	/**
	 * DOM要素を更新
	 */
	private updateDOM(): void {
		// フライト状態
		this.updateElement('debugFlightStatus', this.state.flightStatus, this.getStatusClass())
		this.updateElement('debugCurrentPhase', this.state.currentPhase)
		this.updateElement('debugPhaseIndex', `${this.state.phaseIndex} / ${this.state.totalPhases}`)
		this.updateElement('debugElapsedTime', this.formatTime(this.state.elapsedTime))

		// ドローン状態
		if (this.state.dronePosition) {
			this.updateElement(
				'debugDronePosition',
				`${this.state.dronePosition.lng.toFixed(6)}, ${this.state.dronePosition.lat.toFixed(6)}`
			)
		}
		this.updateElement('debugDroneAltitude', `${this.state.droneAltitude.toFixed(1)}`)
		this.updateElement('debugDroneHeading', `${this.state.droneHeading.toFixed(1)}`)
		this.updateElement('debugDroneSpeed', `${this.state.droneSpeed.toFixed(2)}`)

		// カメラ状態
		if (this.state.cameraCenter) {
			this.updateElement(
				'debugCameraCenter',
				`${this.state.cameraCenter.lng.toFixed(6)}, ${this.state.cameraCenter.lat.toFixed(6)}`
			)
		}
		this.updateElement('debugCameraZoom', `${this.state.cameraZoom.toFixed(2)}`)
		this.updateElement('debugCameraPitch', `${this.state.cameraPitch.toFixed(1)}`)
		this.updateElement('debugCameraBearing', `${this.state.cameraBearing.toFixed(1)}`)

		// フェーズデータ（HTMLシンタックスハイライト付きなのでinnerHTMLを使用）
		const phaseDataEl = document.getElementById('debugPhaseData')
		if (phaseDataEl) {
			if (this.state.currentPhaseData) {
				phaseDataEl.innerHTML = this.formatJSON(this.state.currentPhaseData)
			} else {
				phaseDataEl.textContent = '-'
			}
		}

		// 統計
		this.updateElement('debugTotalObjects', `${this.state.totalObjects}`)
		this.updateElement('debugTotalPhases', `${this.state.totalPhases}`)
		this.updateElement('debugFPS', `${this.state.fps}`)
		this.updateElement('debugMemory', `${this.state.memory}`)
	}

	/**
	 * 要素を更新
	 */
	private updateElement(id: string, value: string, className?: string): void {
		const el = document.getElementById(id)
		if (el) {
			el.textContent = value
			if (className) {
				el.className = `debug-value ${className}`
			}
		}
	}

	/**
	 * ステータスに応じたクラスを取得
	 */
	private getStatusClass(): string {
		switch (this.state.flightStatus) {
			case 'FLYING':
				return 'success'
			case 'PAUSED':
				return 'warning'
			case 'ERROR':
				return 'error'
			case 'COMPLETED':
				return 'info'
			default:
				return ''
		}
	}

	/**
	 * 時間をフォーマット
	 */
	private formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000)
		const hours = Math.floor(totalSeconds / 3600)
		const minutes = Math.floor((totalSeconds % 3600) / 60)
		const seconds = totalSeconds % 60
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
	}

	/**
	 * HTMLエスケープ（XSS対策）
	 */
	private escapeHtml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
	}

	/**
	 * JSONをフォーマット（シンタックスハイライト付き）
	 */
	private formatJSON(obj: any): string {
		const json = JSON.stringify(obj, null, 2)
		// まずHTMLエスケープしてから、シンタックスハイライトを適用
		const escaped = this.escapeHtml(json)
		return escaped
			// キー名（"key":）
			.replace(/&quot;([^&]+)&quot;:/g, '<span class="key">&quot;$1&quot;</span>:')
			// 文字列値（: "value"）
			.replace(/: &quot;([^&]*)&quot;/g, ': <span class="string">&quot;$1&quot;</span>')
			// 数値（コロン後、カンマ後、配列開始後の数値をハイライト）
			.replace(/([:,\[]\s*)(-?\d+\.?\d*)/g, '$1<span class="number">$2</span>')
			// 真偽値
			.replace(/: (true|false)/g, ': <span class="boolean">$1</span>')
			// null
			.replace(/: null/g, ': <span class="null">null</span>')
	}

	/**
	 * イベントを追加
	 */
	addEvent(type: string, data: string): void {
		const now = new Date()
		const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

		this.events.unshift({ time, type, data })

		// 最大数を超えたら古いイベントを削除
		if (this.events.length > this.maxEvents) {
			this.events = this.events.slice(0, this.maxEvents)
		}

		// DOMを更新
		this.updateEventLog()
	}

	/**
	 * イベントログのDOMを更新
	 */
	private updateEventLog(): void {
		const container = document.getElementById('debugEventLog')
		if (!container) return

		container.innerHTML = this.events
			.map(
				event => `
			<div class="debug-event">
				<span class="debug-event-time">${event.time}</span>
				<span class="debug-event-type">${event.type}</span>
				<span class="debug-event-data">${event.data}</span>
			</div>
		`
			)
			.join('')
	}

	/**
	 * フライト状態を更新
	 */
	setFlightStatus(status: DebugState['flightStatus']): void {
		this.state.flightStatus = status
		this.addEvent('STATUS', `Flight status changed to ${status}`)
	}

	/**
	 * 現在のフェーズを更新
	 */
	setCurrentPhase(phase: FlightPlanPhase, index: number, total: number): void {
		this.state.currentPhase = phase.phase
		this.state.phaseIndex = index + 1
		this.state.totalPhases = total
		this.state.currentPhaseData = phase
		this.addEvent('PHASE', `${phase.phase}: ${phase.action}`)
	}

	/**
	 * オブジェクト数を更新
	 */
	setTotalObjects(count: number): void {
		this.state.totalObjects = count
	}

	/**
	 * フェーズ総数を更新
	 */
	setTotalPhases(count: number): void {
		this.state.totalPhases = count
	}

	/**
	 * カスタムイベントをログ
	 */
	logEvent(type: string, data: string): void {
		this.addEvent(type, data)
	}

	/**
	 * デバッグモードが有効かどうか
	 */
	isEnabled(): boolean {
		return this.state.isEnabled
	}

	/**
	 * クリーンアップ
	 */
	destroy(): void {
		this.stopUpdateLoop()
		this.removeEventListeners()
		this.events = []

		// DOM参照をクリア
		this.map = null
		this.droneModel = null
		this.flightController = null
		this.overlay = null
		this.toggleBtn = null
		this.closeBtn = null
		this.debugModeBtn = null
	}
}
