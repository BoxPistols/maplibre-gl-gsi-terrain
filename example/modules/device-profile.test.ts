import { describe, expect, test, vi } from 'vitest'
import { applyDeviceAttributes, detectDeviceProfile } from './device-profile'

/** matchMedia を、マッチさせたいクエリ集合から組み立てる */
const mm = (matching: string[]) => (q: string) => ({ matches: matching.includes(q) })

const COARSE = '(hover: none) and (pointer: coarse)'
const NARROW = '(max-width: 768px)'

describe('detectDeviceProfile', () => {
	test('デスクトップ（マウス・広幅）は desktop', () => {
		const p = detectDeviceProfile({
			matchMedia: mm([]),
			navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0 },
			innerWidth: 1440,
		})
		expect(p.kind).toBe('desktop')
		expect(p.isTouch).toBe(false)
		expect(p.isNarrow).toBe(false)
		expect(p.render.enableTerrain).toBe(true)
		expect(p.render.antialias).toBe(true)
		expect(p.render.pixelRatio).toBeUndefined()
	})

	test('iPhone（タッチ・狭幅・UA）は mobile で軽量レンダリング', () => {
		const p = detectDeviceProfile({
			matchMedia: mm([COARSE, NARROW]),
			navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 },
			innerWidth: 390,
			devicePixelRatio: 3,
		})
		expect(p.kind).toBe('mobile')
		expect(p.isTouch).toBe(true)
		expect(p.render.enableTerrain).toBe(false)
		expect(p.render.antialias).toBe(false)
		expect(p.render.pixelRatio).toBe(2) // 3 だが2に制限
		expect(p.render.maxTileCacheSize).toBe(50)
	})

	test('狭いデスクトップ窓（タッチ無し）は desktop 扱い（誤判定しない）', () => {
		const p = detectDeviceProfile({
			matchMedia: mm([NARROW]), // 狭いが hover:none ではない
			navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 },
			innerWidth: 700,
		})
		expect(p.isNarrow).toBe(true)
		expect(p.kind).toBe('desktop') // タッチが無いので mobile にしない
	})

	test('タッチ対応の広幅デスクトップ（2-in-1等, UAはPC）は desktop', () => {
		const p = detectDeviceProfile({
			matchMedia: mm([]), // hover 可能
			navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10 },
			innerWidth: 1920,
		})
		expect(p.isTouch).toBe(true)
		expect(p.kind).toBe('desktop') // 狭幅でもモバイルUAでもない
	})

	test('iPad（タッチ・モバイルUA・広めの幅）は mobile', () => {
		const p = detectDeviceProfile({
			matchMedia: mm([COARSE]),
			navigator: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)', maxTouchPoints: 5 },
			innerWidth: 1024,
			devicePixelRatio: 2,
		})
		expect(p.kind).toBe('mobile') // UAでモバイル
	})

	test('prefers-reduced-motion を反映', () => {
		const p = detectDeviceProfile({
			matchMedia: mm(['(prefers-reduced-motion: reduce)']),
			navigator: { userAgent: 'x', maxTouchPoints: 0 },
			innerWidth: 1440,
		})
		expect(p.prefersReducedMotion).toBe(true)
	})
})

describe('applyDeviceAttributes', () => {
	test('data-device / data-touch を付与', () => {
		const root = { setAttribute: vi.fn() }
		applyDeviceAttributes(
			{
				kind: 'mobile',
				isTouch: true,
				isNarrow: true,
				prefersReducedMotion: false,
				render: {} as never,
			},
			root
		)
		expect(root.setAttribute).toHaveBeenCalledWith('data-device', 'mobile')
		expect(root.setAttribute).toHaveBeenCalledWith('data-touch', 'true')
	})
})
