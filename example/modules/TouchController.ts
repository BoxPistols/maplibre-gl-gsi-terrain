/**
 * タッチコントローラーモジュール
 * モバイルデバイスでの仮想ジョイスティック操作を実現
 */

import type { Map } from 'maplibre-gl'
import type { TouchState, VirtualJoystickConfig, MobileTouchInput } from './types'
import { DroneModel } from './DroneModel'

export class TouchController {
	private map: Map
	private droneModel: DroneModel
	private leftJoystick: TouchState
	private rightJoystick: TouchState
	private updateInterval: number | null = null
	private readonly updateRate = 1000 / 60 // 60 FPS

	// UI要素
	private leftJoystickContainer: HTMLElement | null = null
	private leftJoystickKnob: HTMLElement | null = null
	private rightJoystickContainer: HTMLElement | null = null
	private rightJoystickKnob: HTMLElement | null = null

	// 仮想ジョイスティック設定
	private config: VirtualJoystickConfig = {
		maxDistance: 60, // ジョイスティックの最大移動距離（px）
		deadzone: 0.15, // デッドゾーン
		sensitivity: 1.5, // 感度
		returnSpeed: 0.2, // 元に戻る速度
	}

	// 操作パラメータ
	private readonly params = {
		moveSpeed: 0.0001, // 経度/緯度の移動速度
		altitudeSpeed: 2.0, // 高度変化速度 (m/s)
		rotationSpeed: 2.0, // 回転速度 (度/s)
	}

	constructor(map: Map, droneModel: DroneModel) {
		this.map = map
		this.droneModel = droneModel

		// タッチ状態を初期化
		this.leftJoystick = this.createTouchState()
		this.rightJoystick = this.createTouchState()

		this.setupJoystickUI()
		this.setupEventListeners()
	}

	/**
	 * タッチ状態オブジェクトを作成
	 */
	private createTouchState(): TouchState {
		return {
			active: false,
			startX: 0,
			startY: 0,
			currentX: 0,
			currentY: 0,
			deltaX: 0,
			deltaY: 0,
			touchId: null,
		}
	}

	/**
	 * 仮想ジョイスティックUIをセットアップ
	 */
	private setupJoystickUI(): void {
		// 左ジョイスティック（移動用）
		this.leftJoystickContainer = document.getElementById('leftJoystick')
		this.leftJoystickKnob = document.getElementById('leftJoystickKnob')

		// 右ジョイスティック（回転・高度用）
		this.rightJoystickContainer = document.getElementById('rightJoystick')
		this.rightJoystickKnob = document.getElementById('rightJoystickKnob')

		if (!this.leftJoystickContainer || !this.rightJoystickContainer) {
			console.warn('仮想ジョイスティックのUI要素が見つかりません')
		}
	}

	/**
	 * イベントリスナーをセットアップ
	 */
	private setupEventListeners(): void {
		// 左ジョイスティック
		if (this.leftJoystickContainer) {
			this.leftJoystickContainer.addEventListener(
				'touchstart',
				this.handleTouchStart.bind(this, 'left'),
				{ passive: false }
			)
			this.leftJoystickContainer.addEventListener(
				'touchmove',
				this.handleTouchMove.bind(this, 'left'),
				{ passive: false }
			)
			this.leftJoystickContainer.addEventListener(
				'touchend',
				this.handleTouchEnd.bind(this, 'left'),
				{ passive: false }
			)
		}

		// 右ジョイスティック
		if (this.rightJoystickContainer) {
			this.rightJoystickContainer.addEventListener(
				'touchstart',
				this.handleTouchStart.bind(this, 'right'),
				{ passive: false }
			)
			this.rightJoystickContainer.addEventListener(
				'touchmove',
				this.handleTouchMove.bind(this, 'right'),
				{ passive: false }
			)
			this.rightJoystickContainer.addEventListener(
				'touchend',
				this.handleTouchEnd.bind(this, 'right'),
				{ passive: false }
			)
		}
	}

	/**
	 * タッチ開始イベントハンドラー
	 */
	private handleTouchStart(side: 'left' | 'right', event: TouchEvent): void {
		event.preventDefault()

		const touch = event.touches[0]
		if (!touch) return

		const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick
		const container = side === 'left' ? this.leftJoystickContainer : this.rightJoystickContainer

		if (!container) return

		const rect = container.getBoundingClientRect()
		const centerX = rect.left + rect.width / 2
		const centerY = rect.top + rect.height / 2

		joystick.active = true
		joystick.touchId = touch.identifier
		joystick.startX = centerX
		joystick.startY = centerY
		joystick.currentX = touch.clientX
		joystick.currentY = touch.clientY
		this.updateJoystickDelta(joystick)
		this.updateJoystickUI(side)
	}

	/**
	 * タッチ移動イベントハンドラー
	 */
	private handleTouchMove(side: 'left' | 'right', event: TouchEvent): void {
		event.preventDefault()

		const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick
		if (!joystick.active || joystick.touchId === null) return

		// タッチIDが一致するタッチを探す
		const touch = Array.from(event.touches).find(t => t.identifier === joystick.touchId)
		if (!touch) return

		joystick.currentX = touch.clientX
		joystick.currentY = touch.clientY
		this.updateJoystickDelta(joystick)
		this.updateJoystickUI(side)
	}

	/**
	 * タッチ終了イベントハンドラー
	 */
	private handleTouchEnd(side: 'left' | 'right', event: TouchEvent): void {
		event.preventDefault()

		const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick

		joystick.active = false
		joystick.touchId = null
		joystick.deltaX = 0
		joystick.deltaY = 0
		this.updateJoystickUI(side)
	}

	/**
	 * ジョイスティックのデルタ値を更新
	 */
	private updateJoystickDelta(joystick: TouchState): void {
		let dx = joystick.currentX - joystick.startX
		let dy = joystick.currentY - joystick.startY

		// 最大距離でクランプ
		const distance = Math.sqrt(dx * dx + dy * dy)
		if (distance > this.config.maxDistance) {
			const angle = Math.atan2(dy, dx)
			dx = Math.cos(angle) * this.config.maxDistance
			dy = Math.sin(angle) * this.config.maxDistance
		}

		// -1.0 ~ 1.0 に正規化
		joystick.deltaX = dx / this.config.maxDistance
		joystick.deltaY = dy / this.config.maxDistance

		// デッドゾーン適用
		if (Math.abs(joystick.deltaX) < this.config.deadzone) joystick.deltaX = 0
		if (Math.abs(joystick.deltaY) < this.config.deadzone) joystick.deltaY = 0
	}

	/**
	 * ジョイスティックUIを更新
	 */
	private updateJoystickUI(side: 'left' | 'right'): void {
		const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick
		const knob = side === 'left' ? this.leftJoystickKnob : this.rightJoystickKnob

		if (!knob) return

		if (joystick.active) {
			const offsetX = joystick.deltaX * this.config.maxDistance
			const offsetY = joystick.deltaY * this.config.maxDistance
			knob.style.transform = `translate(${offsetX}px, ${offsetY}px)`
			knob.style.opacity = '1'
		} else {
			knob.style.transform = 'translate(0, 0)'
			knob.style.opacity = '0.5'
		}
	}

	/**
	 * タッチコントロールを有効化
	 */
	enable(): void {
		if (this.updateInterval !== null) return

		// ジョイスティックを表示
		if (this.leftJoystickContainer) {
			this.leftJoystickContainer.style.display = 'flex'
		}
		if (this.rightJoystickContainer) {
			this.rightJoystickContainer.style.display = 'flex'
		}

		// 定期的に入力を処理
		this.updateInterval = window.setInterval(() => {
			this.processInput()
		}, this.updateRate)
	}

	/**
	 * タッチコントロールを無効化
	 */
	disable(): void {
		if (this.updateInterval !== null) {
			clearInterval(this.updateInterval)
			this.updateInterval = null
		}

		// ジョイスティックを非表示
		if (this.leftJoystickContainer) {
			this.leftJoystickContainer.style.display = 'none'
		}
		if (this.rightJoystickContainer) {
			this.rightJoystickContainer.style.display = 'none'
		}

		// 状態をリセット
		this.leftJoystick = this.createTouchState()
		this.rightJoystick = this.createTouchState()
	}

	/**
	 * 入力を処理してドローンを操作
	 */
	private processInput(): void {
		const input = this.getInput()

		// ドローンの現在位置を取得
		const currentPosition = this.droneModel.getPosition()
		let [lng, lat, alt] = currentPosition

		// 左ジョイスティック: 前後左右の移動
		const deltaTime = this.updateRate / 1000
		const speedMultiplier = this.config.sensitivity

		// 前後移動（Y軸）
		const forward = -input.leftJoystick.y // Y軸は反転
		lat += forward * this.params.moveSpeed * speedMultiplier

		// 左右移動（X軸）
		const strafe = input.leftJoystick.x
		lng += strafe * this.params.moveSpeed * speedMultiplier

		// 右ジョイスティック: 回転と高度
		// Y軸で高度変更
		const vertical = -input.rightJoystick.y // Y軸は反転
		alt += vertical * this.params.altitudeSpeed * deltaTime * speedMultiplier

		// X軸でカメラ回転
		const rotation = input.rightJoystick.x
		const currentBearing = this.map.getBearing()
		const newBearing = currentBearing + rotation * this.params.rotationSpeed * speedMultiplier

		// ドローンの位置を更新
		this.droneModel.setPosition([lng, lat, alt])

		// カメラを更新
		this.map.easeTo({
			center: [lng, lat],
			bearing: newBearing,
			duration: this.updateRate,
		})
	}

	/**
	 * 現在の入力状態を取得
	 */
	getInput(): MobileTouchInput {
		return {
			leftJoystick: {
				x: this.leftJoystick.deltaX,
				y: this.leftJoystick.deltaY,
			},
			rightJoystick: {
				x: this.rightJoystick.deltaX,
				y: this.rightJoystick.deltaY,
			},
			buttons: {
				turbo: false,
				center: false,
			},
		}
	}

	/**
	 * タッチコントロールが有効かどうか
	 */
	isEnabled(): boolean {
		return this.updateInterval !== null
	}

	/**
	 * 設定を更新
	 */
	updateConfig(config: Partial<VirtualJoystickConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * クリーンアップ
	 */
	destroy(): void {
		this.disable()

		// イベントリスナーを削除
		if (this.leftJoystickContainer) {
			this.leftJoystickContainer.replaceWith(this.leftJoystickContainer.cloneNode(true))
		}
		if (this.rightJoystickContainer) {
			this.rightJoystickContainer.replaceWith(this.rightJoystickContainer.cloneNode(true))
		}
	}
}
