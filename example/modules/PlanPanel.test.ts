import { beforeEach, describe, expect, test, vi } from 'vitest'
import { PlanPanel } from './PlanPanel'
import type { FlightPlanPhase } from './types'

const plan = (): FlightPlanPhase[] => [
	{ phase: '離陸', action: 'takeoff', duration: 3000, position: [139.7454, 35.6586, 100] },
	{ phase: '周回', action: 'move', duration: 5000, position: [139.746, 35.659, 250] },
]

const mount = (getGround: (lng: number, lat: number) => number | null = () => 100) => {
	const container = document.createElement('div')
	document.body.appendChild(container)
	const onChange = vi.fn()
	const onFlyTo = vi.fn()
	const panel = new PlanPanel(container, { getGround, onChange, onFlyTo })
	return { container, panel, onChange, onFlyTo }
}

beforeEach(() => {
	document.body.innerHTML = ''
})

describe('PlanPanel 描画', () => {
	test('setPlan で行・タイムライン・統計が描画される', () => {
		const { container, panel } = mount()
		panel.setPlan('テストプラン', plan())

		expect(container.querySelectorAll('.plan-row').length).toBe(2)
		expect(container.querySelectorAll('.plan-seg').length).toBe(2)
		const stats = container.querySelector('.plan-stats')!.textContent!
		expect(stats).toContain('テストプラン')
		expect(stats).toContain('2 WP')
		expect(stats).toContain('8s')
	})

	test('標高・海抜・対地が elevation モデルで表示される（ground=100, asl=250 → agl=150）', () => {
		const { container, panel } = mount(() => 100)
		panel.setPlan('p', plan())
		const row1 = container.querySelector('[data-testid="plan-row-1"]')!
		const agl = row1.querySelector('.plan-input-agl') as HTMLInputElement
		const asl = row1.querySelector('.plan-input-asl') as HTMLInputElement
		expect(asl.value).toBe('250')
		expect(agl.value).toBe('150')
		expect(row1.querySelector('.plan-ground')!.textContent).toBe('100.0')
	})
})

describe('PlanPanel 編集（CRUD）', () => {
	test('AGL 編集で position[2]=ground+agl に更新され onChange が飛ぶ', () => {
		const { container, panel, onChange } = mount(() => 100)
		panel.setPlan('p', plan())
		const agl = container.querySelector(
			'[data-testid="plan-row-0"] .plan-input-agl'
		) as HTMLInputElement
		agl.value = '80'
		agl.dispatchEvent(new Event('change'))

		expect(onChange).toHaveBeenCalledTimes(1)
		const next = onChange.mock.calls[0][0] as FlightPlanPhase[]
		expect(next[0].position[2]).toBe(180) // 100 + 80
	})

	test('ASL 編集はそのまま海抜に反映される', () => {
		const { container, panel, onChange } = mount(() => 100)
		panel.setPlan('p', plan())
		const asl = container.querySelector(
			'[data-testid="plan-row-0"] .plan-input-asl'
		) as HTMLInputElement
		asl.value = '500'
		asl.dispatchEvent(new Event('change'))
		expect((onChange.mock.calls[0][0] as FlightPlanPhase[])[0].position[2]).toBe(500)
	})

	test('不正入力（空文字）は無視され onChange は呼ばれない', () => {
		const { container, panel, onChange } = mount()
		panel.setPlan('p', plan())
		const agl = container.querySelector(
			'[data-testid="plan-row-0"] .plan-input-agl'
		) as HTMLInputElement
		agl.value = ''
		agl.dispatchEvent(new Event('change'))
		expect(onChange).not.toHaveBeenCalled()
	})

	test('削除ボタンで行が減る', () => {
		const { container, panel, onChange } = mount()
		panel.setPlan('p', plan())
		const del = container.querySelector(
			'[data-testid="plan-row-0"] .plan-btn-danger'
		) as HTMLButtonElement
		del.click()
		expect((onChange.mock.calls[0][0] as FlightPlanPhase[]).length).toBe(1)
		expect(container.querySelectorAll('.plan-row').length).toBe(1)
	})

	test('追加ボタンで末尾に増える', () => {
		const { container, panel, onChange } = mount()
		panel.setPlan('p', plan())
		;(container.querySelector('.plan-btn-add') as HTMLButtonElement).click()
		const next = onChange.mock.calls[0][0] as FlightPlanPhase[]
		expect(next.length).toBe(3)
		expect(next[2].phase).toBe('WP3')
		expect(container.querySelectorAll('.plan-row').length).toBe(3)
	})

	test('並べ替え（↓）で順序が変わる', () => {
		const { container, panel, onChange } = mount()
		panel.setPlan('p', plan())
		const down = Array.from(
			container.querySelectorAll('[data-testid="plan-row-0"] .plan-row-actions .plan-btn')
		).find(b => b.textContent === '↓') as HTMLButtonElement
		down.click()
		const next = onChange.mock.calls[0][0] as FlightPlanPhase[]
		expect(next[0].phase).toBe('周回')
		expect(next[1].phase).toBe('離陸')
	})
})

describe('PlanPanel 実行状態', () => {
	test('setActivePhase で行とタイムラインがハイライトされる', () => {
		const { container, panel } = mount()
		panel.setPlan('p', plan())
		panel.setActivePhase(1)
		expect(
			container.querySelector('[data-testid="plan-row-1"]')!.classList.contains('active')
		).toBe(true)
		const segs = container.querySelectorAll('.plan-seg')
		expect(segs[1].classList.contains('active')).toBe(true)
		expect(segs[0].classList.contains('done')).toBe(true)
		panel.setActivePhase(null)
		expect(container.querySelectorAll('.plan-row.active').length).toBe(0)
	})

	test('行クリックで onFlyTo が呼ばれる', () => {
		const { container, panel, onFlyTo } = mount()
		panel.setPlan('p', plan())
		;(container.querySelector('[data-testid="plan-row-1"]') as HTMLElement).click()
		expect(onFlyTo).toHaveBeenCalledWith(1, expect.objectContaining({ phase: '周回' }))
	})
})
