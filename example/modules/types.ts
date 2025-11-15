/**
 * 型定義モジュール
 * フライトシミュレーターで使用する全ての型定義
 */

import type { DroneObject } from '../../src/data-import-export'

export type { DroneObject }

/**
 * フライトプランのフェーズ
 */
export interface FlightPlanPhase {
	phase: string
	action: string
	duration: number
	position: [number, number, number] // [経度, 緯度, 高度]
	pitch?: number // カメラピッチ角度
	bearing?: number // カメラ方位角
	zoom?: number // ズームレベル
}

/**
 * フライトプランデータ
 */
export interface FlightPlanData {
	name: string
	description: string
	created: string
	phases: FlightPlanPhase[]
	totalDuration: number
}

/**
 * フライトログエントリ
 */
export interface FlightLogEntry {
	timestamp: string
	phase: string
	action: string
	details: string
	type: 'info' | 'success' | 'error' | 'warning'
}

/**
 * マップスタイル定義
 */
export interface MapStyle {
	id: string
	name: string
	description: string
	thumbnail?: string
	styleUrl?: string
	styleObject?: any
}

/**
 * ドローンの物理状態
 */
export interface DronePhysicsState {
	position: [number, number, number] // [経度, 緯度, 高度]
	velocity: [number, number, number] // [x, y, z] 速度ベクトル
	acceleration: [number, number, number] // [x, y, z] 加速度ベクトル
	rotation: [number, number, number] // [roll, pitch, yaw] 回転角度（度）
	angularVelocity: [number, number, number] // 角速度
}

/**
 * ゲームコントローラー入力
 */
export interface GameControllerInput {
	leftStick: { x: number; y: number } // -1.0 to 1.0
	rightStick: { x: number; y: number } // -1.0 to 1.0
	throttle: number // 0.0 to 1.0
	buttons: {
		takeoff: boolean
		land: boolean
		hover: boolean
		turbo: boolean
	}
}

/**
 * キーボード入力状態
 */
export interface KeyboardState {
	forward: boolean
	backward: boolean
	left: boolean
	right: boolean
	up: boolean
	down: boolean
	rotateLeft: boolean
	rotateRight: boolean
	turbo: boolean
}

/**
 * カメラ設定
 */
export interface CameraSettings {
	center: [number, number]
	zoom: number
	pitch: number
	bearing: number
	duration?: number
	easing?: (t: number) => number
}

/**
 * フライトコントローラー設定
 */
export interface FlightControllerConfig {
	maxSpeed: number // 最大速度 (m/s)
	maxAltitude: number // 最大高度 (m)
	minAltitude: number // 最小高度 (m)
	acceleration: number // 加速度 (m/s²)
	deceleration: number // 減速度 (m/s²)
	rotationSpeed: number // 回転速度 (度/s)
	physicsEnabled: boolean // 物理演算有効/無効
	collisionDetection: boolean // 衝突検知有効/無効
}

/**
 * タッチ入力状態（仮想ジョイスティック）
 */
export interface TouchState {
	active: boolean
	startX: number
	startY: number
	currentX: number
	currentY: number
	deltaX: number
	deltaY: number
	touchId: number | null
}

/**
 * 仮想ジョイスティック設定
 */
export interface VirtualJoystickConfig {
	maxDistance: number // ジョイスティックの最大移動距離（px）
	deadzone: number // デッドゾーン（0.0-1.0）
	sensitivity: number // 感度（0.1-5.0）
	returnSpeed: number // 元に戻る速度（0.0-1.0）
}

/**
 * モバイルタッチコントロール入力
 */
export interface MobileTouchInput {
	leftJoystick: { x: number; y: number } // 移動用（-1.0 to 1.0）
	rightJoystick: { x: number; y: number } // 回転・高度用（-1.0 to 1.0）
	buttons: {
		turbo: boolean
		center: boolean
	}
}
