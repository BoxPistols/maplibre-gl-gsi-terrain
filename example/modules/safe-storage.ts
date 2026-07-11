/**
 * localStorage 安全ラッパー
 *
 * Safari プライベートモード・Cookie無効・サンドボックス iframe など、
 * localStorage へのアクセスが SecurityError を投げる環境でもアプリが
 * 起動時にクラッシュしない（白画面にならない）ようにするための薄いラッパー。
 * 利用不可の場合はメモリ上のフォールバックに退避する。
 */

const memoryFallback = new Map<string, string>()

const storageAvailable: boolean = (() => {
	try {
		const testKey = '__gsi_storage_test__'
		localStorage.setItem(testKey, testKey)
		localStorage.removeItem(testKey)
		return true
	} catch {
		return false
	}
})()

export const safeStorage = {
	get(key: string): string | null {
		if (!storageAvailable) return memoryFallback.get(key) ?? null
		try {
			return localStorage.getItem(key)
		} catch {
			return memoryFallback.get(key) ?? null
		}
	},

	set(key: string, value: string): void {
		if (!storageAvailable) {
			memoryFallback.set(key, value)
			return
		}
		try {
			localStorage.setItem(key, value)
		} catch {
			// クォータ超過などは黙ってメモリに退避
			memoryFallback.set(key, value)
		}
	},

	remove(key: string): void {
		memoryFallback.delete(key)
		if (!storageAvailable) return
		try {
			localStorage.removeItem(key)
		} catch {
			/* noop */
		}
	},

	/** テスト・診断用: ネイティブ localStorage が利用可能か */
	get isAvailable(): boolean {
		return storageAvailable
	},
}
