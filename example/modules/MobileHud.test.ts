import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MobileHud } from './MobileHud'

const mount = () => {
	const container = document.createElement('div')
	document.body.appendChild(container)
	const onStartPause = vi.fn()
	const hud = new MobileHud(container, { onStartPause })
	return { container, hud, onStartPause }
}

beforeEach(() => {
	document.body.innerHTML = ''
})

describe('MobileHud', () => {
	test('テレメトリチップ3種と開始ボタンが描画される', () => {
		const { container } = mount()
		expect(container.querySelectorAll('.hud-chip').length).toBe(3)
		const btn = container.querySelector('.hud-start') as HTMLButtonElement
		expect(btn.textContent).toBe('▶ 開始')
	})

	test('開始/一時停止ボタンでコールバックが呼ばれる', () => {
		const { container, onStartPause } = mount()
		;(container.querySelector('.hud-start') as HTMLButtonElement).click()
		expect(onStartPause).toHaveBeenCalledTimes(1)
	})

	test('setFlightState(飛行中) でボタンが一時停止表示・フェーズ進行を表示', () => {
		const { container, hud } = mount()
		hud.setFlightState({ active: true, phaseIndex: 2, totalPhases: 8, planName: '富士山周遊' })
		const btn = container.querySelector('.hud-start') as HTMLButtonElement
		expect(btn.textContent).toBe('⏸ 一時停止')
		expect(btn.classList.contains('flying')).toBe(true)
		expect(container.querySelector('.hud-phase')!.textContent).toBe('PHASE 3/8')
		expect(container.querySelector('.hud-plan')!.textContent).toBe('富士山周遊')
	})

	test('setFlightState(一時停止) で PAUSED 表示に戻る', () => {
		const { container, hud } = mount()
		hud.setFlightState({ active: true, phaseIndex: 2, totalPhases: 8, planName: 'p' })
		hud.setFlightState({ active: false, phaseIndex: 2, totalPhases: 8, planName: 'p' })
		expect((container.querySelector('.hud-start') as HTMLButtonElement).textContent).toBe('▶ 開始')
		expect(container.querySelector('.hud-phase')!.textContent).toBe('PAUSED 3/8')
	})

	test('setTelemetry で海抜/対地/方位が更新され、null では -- 表示', () => {
		const { container, hud } = mount()
		hud.setTelemetry({ ground: 20, asl: 150.6, agl: 130.6 }, 275.7)
		const values = container.querySelectorAll('.hud-chip-value')
		expect(values[0].textContent).toBe('151m')
		expect(values[1].textContent).toBe('131m')
		expect(values[2].textContent).toBe('275°')

		hud.setTelemetry(null, null)
		expect(values[0].textContent).toBe('--')
		expect(values[2].textContent).toBe('--')
	})

	test('方位は 0-359 に正規化される（負値・360超）', () => {
		const { container, hud } = mount()
		hud.setTelemetry(null, -90)
		expect(container.querySelectorAll('.hud-chip-value')[2].textContent).toBe('270°')
		hud.setTelemetry(null, 450)
		expect(container.querySelectorAll('.hud-chip-value')[2].textContent).toBe('90°')
	})

	test('destroy でDOMから除去される', () => {
		const { container, hud } = mount()
		hud.destroy()
		expect(container.querySelector('.mobile-hud')).toBeNull()
	})
})
