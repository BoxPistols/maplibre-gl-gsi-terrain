/**
 * ゲームコントローラーモジュール
 * キーボードとゲームパッドによる直感的なドローン操作
 */

import type { Map } from 'maplibre-gl'
import type { KeyboardState, GameControllerInput } from './types'
import { DroneModel } from './DroneModel'

export class GameController {
	private map: Map
	private droneModel: DroneModel
	private keyboardState: KeyboardState
	private gamepadIndex: number | null = null
	private updateInterval: number | null = null
	private readonly updateRate = 1000 / 60 // 60 FPS

	// 操作設定
	private readonly controls = {
		forward: ['w', 'ArrowUp'],
		backward: ['s', 'ArrowDown'],
		left: ['a', 'ArrowLeft'],
		right: ['d', 'ArrowRight'],
		up: ['Space'],
		down: ['Shift'],
		rotateLeft: ['q'],
		rotateRight: ['e'],
		turbo: ['Control'],
	}

	// 操作パラメータ
	private readonly params = {
		moveSpeed: 0.0001, // 経度/緯度の移動速度
		altitudeSpeed: 2.0, // 高度変化速度 (m/s)
		rotationSpeed: 2.0, // 回転速度 (度/s)
		turboMultiplier: 2.0, // ターボ時の速度倍率
	}

	constructor(map: Map, droneModel: DroneModel) {
		this.map = map
		this.droneModel = droneModel
		this.keyboardState = {
			forward: false,
			backward: false,
			left: false,
			right: false,
			up: false,
			down: false,
			rotateLeft: false,
			rotateRight: false,
			turbo: false,
		}

		this.setupEventListeners()
		this.detectGamepad()
	}

	/**
	 * イベントリスナーを設定
	 */
	private setupEventListeners(): void {
		// キーボードイベント
		document.addEventListener('keydown', this.handleKeyDown.bind(this))
		document.addEventListener('keyup', this.handleKeyUp.bind(this))

		// ゲームパッド接続イベント
		window.addEventListener('gamepadconnected', this.handleGamepadConnected.bind(this))
		window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected.bind(this))
	}

	/**
	 * キーダウンイベントハンドラー
	 */
	private handleKeyDown(event: KeyboardEvent): void {
		const key = event.key.toLowerCase()

		if (this.controls.forward.includes(key) || this.controls.forward.includes(event.key)) {
			this.keyboardState.forward = true
			event.preventDefault()
		}
		if (this.controls.backward.includes(key) || this.controls.backward.includes(event.key)) {
			this.keyboardState.backward = true
			event.preventDefault()
		}
		if (this.controls.left.includes(key) || this.controls.left.includes(event.key)) {
			this.keyboardState.left = true
			event.preventDefault()
		}
		if (this.controls.right.includes(key) || this.controls.right.includes(event.key)) {
			this.keyboardState.right = true
			event.preventDefault()
		}
		if (this.controls.up.includes(event.key)) {
			this.keyboardState.up = true
			event.preventDefault()
		}
		if (this.controls.down.includes(event.key)) {
			this.keyboardState.down = true
			event.preventDefault()
		}
		if (this.controls.rotateLeft.includes(key)) {
			this.keyboardState.rotateLeft = true
			event.preventDefault()
		}
		if (this.controls.rotateRight.includes(key)) {
			this.keyboardState.rotateRight = true
			event.preventDefault()
		}
		if (this.controls.turbo.includes(event.key)) {
			this.keyboardState.turbo = true
			event.preventDefault()
		}
	}

	/**
	 * キーアップイベントハンドラー
	 */
	private handleKeyUp(event: KeyboardEvent): void {
		const key = event.key.toLowerCase()

		if (this.controls.forward.includes(key) || this.controls.forward.includes(event.key)) {
			this.keyboardState.forward = false
		}
		if (this.controls.backward.includes(key) || this.controls.backward.includes(event.key)) {
			this.keyboardState.backward = false
		}
		if (this.controls.left.includes(key) || this.controls.left.includes(event.key)) {
			this.keyboardState.left = false
		}
		if (this.controls.right.includes(key) || this.controls.right.includes(event.key)) {
			this.keyboardState.right = false
		}
		if (this.controls.up.includes(event.key)) {
			this.keyboardState.up = false
		}
		if (this.controls.down.includes(event.key)) {
			this.keyboardState.down = false
		}
		if (this.controls.rotateLeft.includes(key)) {
			this.keyboardState.rotateLeft = false
		}
		if (this.controls.rotateRight.includes(key)) {
			this.keyboardState.rotateRight = false
		}
		if (this.controls.turbo.includes(event.key)) {
			this.keyboardState.turbo = false
		}
	}

	/**
	 * ゲームパッド接続ハンドラー
	 */
	private handleGamepadConnected(event: GamepadEvent): void {
		console.log('ゲームパッド接続:', event.gamepad.id)
		this.gamepadIndex = event.gamepad.index
	}

	/**
	 * ゲームパッド切断ハンドラー
	 */
	private handleGamepadDisconnected(event: GamepadEvent): void {
		console.log('ゲームパッド切断:', event.gamepad.id)
		if (this.gamepadIndex === event.gamepad.index) {
			this.gamepadIndex = null
		}
	}

	/**
	 * ゲームパッドの検出
	 */
	private detectGamepad(): void {
		const gamepads = navigator.getGamepads()
		for (let i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				this.gamepadIndex = i
				console.log('ゲームパッド検出:', gamepads[i]?.id)
				break
			}
		}
	}

	/**
	 * ゲームパッド入力を取得
	 */
	private getGamepadInput(): GameControllerInput | null {
		if (this.gamepadIndex === null) {
			return null
		}

		const gamepads = navigator.getGamepads()
		const gamepad = gamepads[this.gamepadIndex]

		if (!gamepad) {
			return null
		}

		// スタンダードゲームパッドマッピング
		return {
			leftStick: {
				x: gamepad.axes[0] || 0, // 左スティック横
				y: gamepad.axes[1] || 0, // 左スティック縦
			},
			rightStick: {
				x: gamepad.axes[2] || 0, // 右スティック横
				y: gamepad.axes[3] || 0, // 右スティック縦
			},
			throttle: gamepad.buttons[7]?.value || 0, // R2トリガー
			buttons: {
				takeoff: gamepad.buttons[0]?.pressed || false, // A/×ボタン
				land: gamepad.buttons[1]?.pressed || false, // B/○ボタン
				hover: gamepad.buttons[2]?.pressed || false, // X/□ボタン
				turbo: gamepad.buttons[6]?.pressed || false, // L2トリガー
			},
		}
	}

	/**
	 * コントロールを有効化
	 */
	enable(): void {
		if (this.updateInterval !== null) {
			return
		}

		this.updateInterval = window.setInterval(() => {
			this.update()
		}, this.updateRate)

		console.log('ゲームコントローラー有効化')
	}

	/**
	 * コントロールを無効化
	 */
	disable(): void {
		if (this.updateInterval !== null) {
			clearInterval(this.updateInterval)
			this.updateInterval = null
		}

		// 状態をリセット
		this.keyboardState = {
			forward: false,
			backward: false,
			left: false,
			right: false,
			up: false,
			down: false,
			rotateLeft: false,
			rotateRight: false,
			turbo: false,
		}

		console.log('ゲームコントローラー無効化')
	}

	/**
	 * 更新ループ
	 */
	private update(): void {
		const deltaTime = this.updateRate / 1000 // 秒単位

		// ゲームパッド入力を取得
		const gamepadInput = this.getGamepadInput()

		// 移動ベクトルを計算
		let moveX = 0
		let moveY = 0
		let moveZ = 0
		let rotate = 0

		// キーボード入力を処理
		if (this.keyboardState.forward) moveY += 1
		if (this.keyboardState.backward) moveY -= 1
		if (this.keyboardState.left) moveX -= 1
		if (this.keyboardState.right) moveX += 1
		if (this.keyboardState.up) moveZ += 1
		if (this.keyboardState.down) moveZ -= 1
		if (this.keyboardState.rotateLeft) rotate -= 1
		if (this.keyboardState.rotateRight) rotate += 1

		// ゲームパッド入力を処理
		if (gamepadInput) {
			// デッドゾーン処理
			const deadzone = 0.15
			const leftX = Math.abs(gamepadInput.leftStick.x) > deadzone ? gamepadInput.leftStick.x : 0
			const leftY = Math.abs(gamepadInput.leftStick.y) > deadzone ? gamepadInput.leftStick.y : 0
			const rightX =
				Math.abs(gamepadInput.rightStick.x) > deadzone ? gamepadInput.rightStick.x : 0

			moveX += leftX
			moveY -= leftY // Y軸を反転
			rotate += rightX

			// スロットル（高度）
			if (gamepadInput.throttle > 0.1) {
				moveZ += gamepadInput.throttle
			}
		}

		// ターボ補正
		const speedMultiplier = this.keyboardState.turbo || gamepadInput?.buttons.turbo ? this.params.turboMultiplier : 1.0

		// ドローンの現在位置を取得
		const currentState = this.droneModel.getPhysicsState()
		const currentPos = currentState.position
		const currentRotation = currentState.rotation

		// カメラの向きを考慮した移動
		const bearing = this.map.getBearing()
		const bearingRad = (bearing * Math.PI) / 180

		// 回転行列を適用
		const rotatedX = moveX * Math.cos(bearingRad) - moveY * Math.sin(bearingRad)
		const rotatedY = moveX * Math.sin(bearingRad) + moveY * Math.cos(bearingRad)

		// 新しい位置を計算
		const newLng = currentPos[0] + rotatedX * this.params.moveSpeed * speedMultiplier
		const newLat = currentPos[1] + rotatedY * this.params.moveSpeed * speedMultiplier
		const newAlt = currentPos[2] + moveZ * this.params.altitudeSpeed * deltaTime * speedMultiplier

		// 高度制限
		const clampedAlt = Math.max(5, Math.min(500, newAlt))

		// ドローンの位置を更新
		this.droneModel.updatePosition([newLng, newLat, clampedAlt])

		// 回転を更新
		const newYaw = currentRotation[2] + rotate * this.params.rotationSpeed
		this.droneModel.updateRotation([currentRotation[0], currentRotation[1], newYaw])

		// 物理演算を更新
		this.droneModel.updatePhysics(deltaTime)

		// カメラを追従
		if (moveX !== 0 || moveY !== 0 || moveZ !== 0 || rotate !== 0) {
			this.map.setCenter([newLng, newLat])

			// 回転も反映
			if (rotate !== 0) {
				this.map.setBearing(bearing + rotate * this.params.rotationSpeed)
			}
		}
	}

	/**
	 * キーボード状態を取得
	 */
	getKeyboardState(): KeyboardState {
		return { ...this.keyboardState }
	}

	/**
	 * ゲームパッドが接続されているかチェック
	 */
	isGamepadConnected(): boolean {
		return this.gamepadIndex !== null
	}

	/**
	 * 操作パラメータを更新
	 */
	updateParams(params: Partial<typeof this.params>): void {
		Object.assign(this.params, params)
	}

	/**
	 * コントロールマッピングを取得（ヘルプ表示用）
	 */
	getControlsHelp(): string {
		return `
【キーボード操作】
  W / ↑       : 前進
  S / ↓       : 後退
  A / ←       : 左移動
  D / →       : 右移動
  Space       : 上昇
  Shift       : 下降
  Q           : 左回転
  E           : 右回転
  Ctrl        : ターボ

【ゲームパッド操作】
  左スティック  : 移動
  右スティック  : 回転
  R2トリガー    : 上昇
  L2トリガー    : ターボ
  Aボタン      : 離陸
  Bボタン      : 着陸
		`
	}
}
