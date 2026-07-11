import { describe, expect, test, vi } from 'vitest'
import {
	formatElevation,
	isValidElevation,
	makeElevation,
	queryGroundElevation,
	resolveElevation,
	safeNumber,
	setAgl,
	setAsl,
	setGround,
} from './elevation'

describe('elevation model 不変条件 asl = ground + agl', () => {
	test('makeElevation: AGL指定から ASL を計算', () => {
		const t = makeElevation(150, { agl: 100 })
		expect(t).toEqual({ ground: 150, agl: 100, asl: 250 })
		expect(isValidElevation(t)).toBe(true)
	})

	test('makeElevation: ASL指定から AGL を計算', () => {
		const t = makeElevation(150, { asl: 250 })
		expect(t).toEqual({ ground: 150, agl: 100, asl: 250 })
	})

	test('makeElevation: AGL は既定で 0 未満にクランプ（地中禁止）', () => {
		const t = makeElevation(200, { asl: 150 }) // asl < ground
		expect(t.agl).toBe(0)
		expect(t.asl).toBe(200) // ground へ引き上げ
		expect(isValidElevation(t)).toBe(true)
	})

	test('makeElevation: minAgl を指定できる（負の高度も許可）', () => {
		const t = makeElevation(0, { asl: -30 }, { minAgl: -Infinity })
		expect(t.agl).toBe(-30)
		expect(t.asl).toBe(-30)
	})
})

describe('elevation CRUD 更新', () => {
	test('setAgl: AGL変更で ASL 追従', () => {
		let t = makeElevation(100, { agl: 50 })
		t = setAgl(t, 120)
		expect(t).toEqual({ ground: 100, agl: 120, asl: 220 })
	})

	test('setAsl: ASL変更で AGL 追従', () => {
		let t = makeElevation(100, { agl: 50 })
		t = setAsl(t, 300)
		expect(t).toEqual({ ground: 100, agl: 200, asl: 300 })
	})

	test('setGround keep=agl: 地形追従（対地維持・海抜変化）', () => {
		// 標高100mの上を対地50m(海抜150m)で飛行 → 標高300mの尾根へ移動
		let t = makeElevation(100, { agl: 50 })
		t = setGround(t, 300, 'agl')
		expect(t).toEqual({ ground: 300, agl: 50, asl: 350 })
	})

	test('setGround keep=asl: 海抜維持（対地変化）', () => {
		let t = makeElevation(100, { agl: 50 }) // asl 150
		t = setGround(t, 120, 'asl')
		expect(t.asl).toBe(150)
		expect(t.agl).toBe(30)
	})

	test('setGround keep=asl: 尾根が海抜より高いと対地は0にクランプ', () => {
		let t = makeElevation(100, { asl: 150 })
		t = setGround(t, 200, 'asl') // ground > asl
		expect(t.agl).toBe(0)
		expect(t.asl).toBe(200)
	})
})

describe('NaN/不正値ガード', () => {
	test('safeNumber', () => {
		expect(safeNumber(NaN)).toBe(0)
		expect(safeNumber(Infinity)).toBe(0)
		expect(safeNumber('x' as unknown)).toBe(0)
		expect(safeNumber(5)).toBe(5)
		expect(safeNumber(undefined, 42)).toBe(42)
	})

	test('makeElevation は NaN 入力でも有限な値を返す', () => {
		const t = makeElevation(NaN, { agl: NaN })
		expect(isValidElevation(t)).toBe(true)
		expect(t).toEqual({ ground: 0, agl: 0, asl: 0 })
	})
})

describe('queryGroundElevation', () => {
	test('terrain から標高を取得', () => {
		const map = { queryTerrainElevation: vi.fn(() => 123.456) }
		expect(queryGroundElevation(map, 139.7, 35.6)).toBe(123.456)
		expect(map.queryTerrainElevation).toHaveBeenCalledWith([139.7, 35.6])
	})

	test('terrain 無効(null)なら null', () => {
		const map = { queryTerrainElevation: vi.fn(() => null) }
		expect(queryGroundElevation(map as never, 139.7, 35.6)).toBeNull()
	})

	test('queryTerrainElevation が例外を投げても null', () => {
		const map = {
			queryTerrainElevation: vi.fn(() => {
				throw new Error('terrain not ready')
			}),
		}
		expect(queryGroundElevation(map as never, 139.7, 35.6)).toBeNull()
	})

	test('不正座標なら null', () => {
		const map = { queryTerrainElevation: vi.fn(() => 100) }
		expect(queryGroundElevation(map, NaN, 35.6)).toBeNull()
		expect(map.queryTerrainElevation).not.toHaveBeenCalled()
	})
})

describe('resolveElevation', () => {
	test('terrain 取得成功時は標高を反映', () => {
		const map = { queryTerrainElevation: vi.fn(() => 300) }
		const t = resolveElevation(map, 139.7, 35.6, { agl: 80 })
		expect(t).toEqual({ ground: 300, agl: 80, asl: 380 })
	})

	test('terrain 取得不可時は ground=0（海面基準）', () => {
		const map = { queryTerrainElevation: vi.fn(() => null) }
		const t = resolveElevation(map as never, 139.7, 35.6, { asl: 120 })
		expect(t).toEqual({ ground: 0, agl: 120, asl: 120 })
	})
})

test('formatElevation', () => {
	expect(formatElevation({ ground: 150, agl: 100, asl: 250 })).toBe(
		'海抜 250.0m / 対地 100.0m（標高 150.0m）'
	)
})
