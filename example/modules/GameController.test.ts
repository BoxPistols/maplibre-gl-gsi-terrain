import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { GameController } from './GameController'
import type { DroneModel } from './DroneModel'

/**
 * GameController の入力ハンドラのリーク/横取り挙動を検証する。
 * 主眼は Phase 1-5 の修正:
 *  - 無効時はキーを preventDefault しない
 *  - テキスト入力中はキーを奪わない
 *  - destroy() で document/window リスナーが完全に外れる
 */

const makeDroneModel = () =>
	({
		getPhysicsState: () => ({
			position: [139.7, 35.6, 100] as [number, number, number],
			velocity: [0, 0, 0] as [number, number, number],
			rotation: [0, 0, 0] as [number, number, number],
		}),
		updatePosition: vi.fn(),
		updateRotation: vi.fn(),
		updatePhysics: vi.fn(),
	}) as unknown as DroneModel

const makeMap = () =>
	({
		getBearing: () => 0,
		setCenter: vi.fn(),
		setBearing: vi.fn(),
	}) as unknown as Map

let controller: GameController | null = null

const dispatchKey = (
	type: 'keydown' | 'keyup',
	key: string,
	target?: EventTarget
): KeyboardEvent => {
	const ev = new KeyboardEvent(type, { key, cancelable: true, bubbles: true })
	;(target ?? document).dispatchEvent(ev)
	return ev
}

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {})
	// detectGamepad が navigator.getGamepads を呼ぶため用意する
	if (typeof navigator.getGamepads !== 'function') {
		;(navigator as unknown as { getGamepads: () => unknown[] }).getGamepads = () => []
	}
	controller = new GameController(makeMap(), makeDroneModel())
})

afterEach(() => {
	controller?.destroy()
	controller = null
	document.body.innerHTML = ''
	vi.restoreAllMocks()
})

describe('GameController キー横取り', () => {
	test('無効時は W キーを preventDefault しない', () => {
		const ev = dispatchKey('keydown', 'w')
		expect(ev.defaultPrevented).toBe(false)
	})

	test('有効時は W キーを preventDefault する', () => {
		controller!.enable()
		const ev = dispatchKey('keydown', 'w')
		expect(ev.defaultPrevented).toBe(true)
	})

	test('有効→無効化すると再びキーを奪わない', () => {
		controller!.enable()
		expect(dispatchKey('keydown', 'w').defaultPrevented).toBe(true)
		controller!.disable()
		expect(dispatchKey('keydown', 'w').defaultPrevented).toBe(false)
	})

	test('有効でもテキスト入力欄フォーカス中はキーを奪わない', () => {
		controller!.enable()
		const input = document.createElement('input')
		document.body.appendChild(input)
		const ev = dispatchKey('keydown', 'w', input)
		expect(ev.defaultPrevented).toBe(false)
	})

	test('destroy() 後はリスナーが外れ、有効化してもキーを奪わない', () => {
		controller!.destroy()
		// destroy 後に enable を呼んでもリスナー自体が無いので横取りされない
		controller!.enable()
		const ev = dispatchKey('keydown', 'w')
		expect(ev.defaultPrevented).toBe(false)
		controller = null // afterEach の destroy 二重呼び出しを避ける
	})
})
