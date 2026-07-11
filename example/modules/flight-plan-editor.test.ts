import { describe, expect, test } from 'vitest'
import type { FlightPlanPhase } from './types'
import {
	addWaypoint,
	createWaypoint,
	haversineMeters,
	moveWaypoint,
	planStats,
	removeWaypoint,
	setWaypointAltitude,
	updateWaypoint,
	waypointElevation,
} from './flight-plan-editor'

const wp = (lng: number, lat: number, asl: number, duration = 3000): FlightPlanPhase => ({
	phase: 'p',
	action: 'move',
	duration,
	position: [lng, lat, asl],
})

const basePlan = (): FlightPlanPhase[] => [
	wp(139.7454, 35.6586, 100),
	wp(139.746, 35.659, 150),
	wp(139.747, 35.66, 200),
]

describe('createWaypoint', () => {
	test('AGL指定: ground+agl が position[2](海抜) になる', () => {
		const w = createWaypoint(139.7, 35.6, { agl: 80 }, 120)
		expect(w.position).toEqual([139.7, 35.6, 200])
		expect(w.action).toBe('move')
		expect(w.duration).toBe(3000)
	})

	test('ASL指定はそのまま海抜になる', () => {
		const w = createWaypoint(139.7, 35.6, { asl: 250 }, 120)
		expect(w.position[2]).toBe(250)
	})

	test('経度緯度は範囲にクランプ、NaN duration は既定値', () => {
		const w = createWaypoint(999, -999, { agl: 50 }, 0, { duration: NaN })
		expect(w.position[0]).toBe(180)
		expect(w.position[1]).toBe(-90)
		expect(w.duration).toBe(3000)
	})
})

describe('addWaypoint / removeWaypoint / moveWaypoint', () => {
	test('末尾追加と位置指定挿入', () => {
		const plan = basePlan()
		const w = wp(1, 1, 1)
		expect(addWaypoint(plan, w).length).toBe(4)
		expect(addWaypoint(plan, w)[3]).toBe(w)
		expect(addWaypoint(plan, w, 0)[0]).toBe(w)
		expect(addWaypoint(plan, w, 99)[3]).toBe(w) // 範囲外は末尾へ
		expect(plan.length).toBe(3) // 元配列は不変
	})

	test('削除', () => {
		const plan = basePlan()
		const next = removeWaypoint(plan, 1)
		expect(next.length).toBe(2)
		expect(next[1].position[2]).toBe(200)
		expect(removeWaypoint(plan, 99).length).toBe(3) // 範囲外は無視
	})

	test('並べ替え', () => {
		const plan = basePlan()
		const next = moveWaypoint(plan, 0, 2)
		expect(next.map(p => p.position[2])).toEqual([150, 200, 100])
		expect(moveWaypoint(plan, 0, 0)).toEqual(plan)
		expect(moveWaypoint(plan, -1, 2)).toEqual(plan)
	})
})

describe('updateWaypoint', () => {
	test('部分更新（duration クランプ・座標クランプ）', () => {
		const plan = basePlan()
		const next = updateWaypoint(plan, 1, { duration: 5, position: [200, 91, 300] })
		expect(next[1].duration).toBe(100) // 最小100ms
		expect(next[1].position).toEqual([180, 90, 300])
		expect(plan[1].duration).toBe(3000) // 不変
	})

	test('position[2] が NaN なら元の高度を維持', () => {
		const next = updateWaypoint(basePlan(), 0, { position: [139.7, 35.6, NaN] })
		expect(next[0].position[2]).toBe(100)
	})

	test('範囲外 index は無視', () => {
		expect(updateWaypoint(basePlan(), 9, { duration: 1 })).toEqual(basePlan())
	})
})

describe('setWaypointAltitude / waypointElevation（標高・海抜・対地のCRUD整合）', () => {
	test('AGL 設定で ASL が ground+agl に更新される', () => {
		const next = setWaypointAltitude(basePlan(), 0, { agl: 60 }, 40)
		expect(next[0].position[2]).toBe(100) // 40+60
	})

	test('ASL 設定はそのまま反映', () => {
		const next = setWaypointAltitude(basePlan(), 0, { asl: 500 }, 40)
		expect(next[0].position[2]).toBe(500)
	})

	test('waypointElevation は不変条件を満たす3値を返す', () => {
		const t = waypointElevation(wp(139.7, 35.6, 250), 100)
		expect(t).toEqual({ ground: 100, asl: 250, agl: 150 })
	})

	test('地表より低い ASL は AGL=0 にクランプ（地中禁止）', () => {
		const t = waypointElevation(wp(139.7, 35.6, 50), 100)
		expect(t.agl).toBe(0)
		expect(t.asl).toBe(100)
	})
})

describe('planStats / haversineMeters', () => {
	test('ハバサイン: 東京タワー→スカイツリーは約8.2km', () => {
		const d = haversineMeters([139.7454, 35.6586], [139.8107, 35.7101])
		expect(d).toBeGreaterThan(7500)
		expect(d).toBeLessThan(9000)
	})

	test('統計: 件数・合計時間・3D距離', () => {
		const plan = [wp(139.7, 35.6, 0, 1000), wp(139.7, 35.6, 300, 2000)] // 真上に300m
		const s = planStats(plan)
		expect(s.waypointCount).toBe(2)
		expect(s.totalDurationMs).toBe(3000)
		expect(s.totalDistanceM).toBe(300) // 水平0 + 垂直300
	})

	test('空プランは0', () => {
		expect(planStats([])).toEqual({ waypointCount: 0, totalDurationMs: 0, totalDistanceM: 0 })
	})
})
