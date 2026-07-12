import { afterEach, describe, expect, test, vi } from 'vitest'

/**
 * Phase 1-3 の検証:
 * localStorage が SecurityError を投げる環境（Safariプライベート等）でも
 * 起動時にクラッシュせず、メモリフォールバックで動作すること。
 * storageAvailable はモジュール読み込み時に確定するため、各ケースで
 * localStorage をスタブしてから動的 import する。
 */

afterEach(() => {
	vi.resetModules()
	vi.unstubAllGlobals()
})

describe('safeStorage', () => {
	test('localStorage が例外を投げても get/set/remove が落ちない', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('SecurityError')
			},
			setItem: () => {
				throw new Error('SecurityError')
			},
			removeItem: () => {
				throw new Error('SecurityError')
			},
		})
		vi.resetModules()
		const { safeStorage } = await import('./safe-storage')

		expect(safeStorage.isAvailable).toBe(false)
		expect(() => safeStorage.set('k', 'v')).not.toThrow()
		// 利用不可のときはメモリフォールバックに退避される
		expect(safeStorage.get('k')).toBe('v')
		expect(() => safeStorage.remove('k')).not.toThrow()
		expect(safeStorage.get('k')).toBeNull()
	})

	test('localStorage が使える場合は実ストレージに保存する', async () => {
		const store = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => {
				store.set(k, v)
			},
			removeItem: (k: string) => {
				store.delete(k)
			},
		})
		vi.resetModules()
		const { safeStorage } = await import('./safe-storage')

		expect(safeStorage.isAvailable).toBe(true)
		safeStorage.set('a', '1')
		expect(store.get('a')).toBe('1')
		expect(safeStorage.get('a')).toBe('1')
		safeStorage.remove('a')
		expect(store.has('a')).toBe(false)
		expect(safeStorage.get('a')).toBeNull()
	})
})
