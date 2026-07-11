import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
	getGsiDemProtocolAction,
	normalizeGsiUrl,
	useGsiTerrainSource,
	WorkerProtocol,
} from './terrain'

/**
 * テスト用の偽 Worker。
 * postMessage されたメッセージを記録し、emit() でメッセージ/エラーイベントを注入できる。
 */
class FakeWorker {
	static instances: FakeWorker[] = []
	private listeners: Record<string, Set<(e: unknown) => void>> = {
		message: new Set(),
		error: new Set(),
	}
	sent: Array<{ id: number; url: string; image: unknown }> = []
	terminated = false

	constructor() {
		FakeWorker.instances.push(this)
	}

	addEventListener(type: string, cb: (e: unknown) => void) {
		;(this.listeners[type] ??= new Set()).add(cb)
	}
	removeEventListener(type: string, cb: (e: unknown) => void) {
		this.listeners[type]?.delete(cb)
	}
	postMessage(msg: { id: number; url: string; image: unknown }) {
		this.sent.push(msg)
	}
	terminate() {
		this.terminated = true
	}
	emit(type: 'message' | 'error', payload: unknown) {
		for (const cb of this.listeners[type] ?? []) cb(payload)
	}
}

const makeProtocol = () => {
	const fake = new FakeWorker()
	const wp = new WorkerProtocol(fake as unknown as Worker)
	return { fake, wp }
}

const okFetch = () =>
	vi.fn(async () => ({
		ok: true,
		status: 200,
		statusText: 'OK',
		blob: async () => new Blob([new Uint8Array([0])]),
	}))

beforeEach(() => {
	FakeWorker.instances = []
	vi.spyOn(console, 'error').mockImplementation(() => {})
	// respawn 経路が本物の Worker/Blob URL を作らないようにする
	vi.stubGlobal('Worker', FakeWorker)
	if (typeof URL.createObjectURL !== 'function') {
		;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'
	} else {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
	}
	if (typeof URL.revokeObjectURL !== 'function') {
		;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
	} else {
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
	}
	vi.stubGlobal(
		'createImageBitmap',
		vi.fn(async () => ({ width: 256, height: 256, close: vi.fn() }))
	)
	vi.stubGlobal('fetch', okFetch())
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe('normalizeGsiUrl', () => {
	test('旧形式 gsidem:// を剥がす', () => {
		expect(normalizeGsiUrl('gsidem', 'gsidem://https://h/1/2/3.png')).toBe('https://h/1/2/3.png')
	})
	test('新形式 gsidem: を剥がす', () => {
		expect(normalizeGsiUrl('gsidem', 'gsidem:https://h/1/2/3.png')).toBe('https://h/1/2/3.png')
	})
	test('正規化で崩れた https/// を修復', () => {
		expect(normalizeGsiUrl('gsidem', 'gsidem://https///h/1.png')).toBe('https://h/1.png')
	})
	test('正規化で崩れた https// を修復', () => {
		expect(normalizeGsiUrl('gsidem', 'gsidem://https//h/1.png')).toBe('https://h/1.png')
	})
	test('クエリ文字列付きURLを破壊しない（回帰）', () => {
		expect(normalizeGsiUrl('gsidem', 'gsidem://https://h/1/2/3.png?a=b&c=d')).toBe(
			'https://h/1/2/3.png?a=b&c=d'
		)
	})
	test('カスタムプロトコル名', () => {
		expect(normalizeGsiUrl('mydem', 'mydem://https://h/x.png')).toBe('https://h/x.png')
	})
})

describe('useGsiTerrainSource', () => {
	test('デフォルトで terrarium raster-dem ソースを返し addProtocol を1回呼ぶ', () => {
		const addProtocol = vi.fn()
		const src = useGsiTerrainSource(addProtocol as never)
		expect(addProtocol).toHaveBeenCalledTimes(1)
		expect(addProtocol).toHaveBeenCalledWith('gsidem', expect.any(Function))
		expect(src.type).toBe('raster-dem')
		expect(src.encoding).toBe('terrarium')
		expect(src.tileSize).toBe(256)
		expect(src.tiles?.[0]).toContain('gsidem://https://cyberjapandata.gsi.go.jp')
		expect(src.minzoom).toBe(1)
		expect(src.maxzoom).toBe(14)
	})

	test('オプションが反映される', () => {
		const src = useGsiTerrainSource(vi.fn() as never, {
			tileUrl: 'https://x/{z}/{y}/{x}.png',
			minzoom: 3,
			maxzoom: 17,
			attribution: 'attr',
		})
		expect(src.tiles?.[0]).toBe('gsidem://https://x/{z}/{y}/{x}.png')
		expect(src.minzoom).toBe(3)
		expect(src.maxzoom).toBe(17)
		expect(src.attribution).toBe('attr')
	})
})

describe('WorkerProtocol', () => {
	test('正常系: Worker 応答で resolve し pending が空に戻る', async () => {
		const { fake, wp } = makeProtocol()
		const p = wp.request('https://host/1/2/3.png', new AbortController())
		await vi.waitFor(() => expect(fake.sent.length).toBe(1))

		const sent = fake.sent[0]
		expect(sent.url).toBe('https://host/1/2/3.png')
		const buffer = new Uint8Array([1, 2, 3]).buffer
		fake.emit('message', { data: { id: sent.id, url: sent.url, buffer } })

		const result = await p
		expect(Array.from(result.data)).toEqual([1, 2, 3])
		expect(wp.pendingCount).toBe(0)
	})

	test('同一URLの同時2リクエストが独立して両方 resolve する', async () => {
		const { fake, wp } = makeProtocol()
		const url = 'https://host/same.png'
		const p1 = wp.request(url, new AbortController())
		const p2 = wp.request(url, new AbortController())
		await vi.waitFor(() => expect(fake.sent.length).toBe(2))

		const [m1, m2] = fake.sent
		expect(m1.id).not.toBe(m2.id)
		// 応答順を入れ替えても取り違えない
		fake.emit('message', { data: { id: m2.id, buffer: new Uint8Array([22]).buffer } })
		fake.emit('message', { data: { id: m1.id, buffer: new Uint8Array([11]).buffer } })

		expect(Array.from((await p1).data)).toEqual([11])
		expect(Array.from((await p2).data)).toEqual([22])
		expect(wp.pendingCount).toBe(0)
	})

	test('Error 以外の文字列エラー応答でも reject する', async () => {
		const { fake, wp } = makeProtocol()
		const p = wp.request('https://host/x.png', new AbortController())
		await vi.waitFor(() => expect(fake.sent.length).toBe(1))
		fake.emit('message', { data: { id: fake.sent[0].id, error: 'boom' } })
		await expect(p).rejects.toThrow('boom')
		expect(wp.pendingCount).toBe(0)
	})

	test('worker error イベントで全 pending を reject する', async () => {
		const { fake, wp } = makeProtocol()
		const p1 = wp.request('https://host/a.png', new AbortController())
		const p2 = wp.request('https://host/b.png', new AbortController())
		await vi.waitFor(() => expect(fake.sent.length).toBe(2))

		fake.emit('error', { message: 'crashed' })
		await expect(p1).rejects.toThrow('Worker error occurred')
		await expect(p2).rejects.toThrow('Worker error occurred')
		expect(wp.pendingCount).toBe(0)
	})

	test('worker error 後に自動再生成され、後続リクエストが成功する', async () => {
		const { fake, wp } = makeProtocol()
		const p1 = wp.request('https://host/a.png', new AbortController())
		await vi.waitFor(() => expect(fake.sent.length).toBe(1))
		fake.emit('error', { message: 'crashed' })
		await expect(p1).rejects.toThrow()

		// respawn で新しい FakeWorker が生成されている
		expect(FakeWorker.instances.length).toBe(2)
		const newWorker = FakeWorker.instances[1]
		expect(fake.terminated).toBe(true)

		const p2 = wp.request('https://host/c.png', new AbortController())
		await vi.waitFor(() => expect(newWorker.sent.length).toBe(1))
		// 応答は再生成された新しい worker から届く
		newWorker.emit('message', {
			data: { id: newWorker.sent[0].id, buffer: new Uint8Array([9]).buffer },
		})
		expect(Array.from((await p2).data)).toEqual([9])
	})

	test('abort でリクエストが AbortError になり後始末される', async () => {
		const { fake, wp } = makeProtocol()
		const controller = new AbortController()
		const p = wp.request('https://host/x.png', controller)
		await vi.waitFor(() => expect(fake.sent.length).toBe(1))

		controller.abort()
		await expect(p).rejects.toMatchObject({ name: 'AbortError' })
		expect(wp.pendingCount).toBe(0)

		// 後から Worker 応答が来ても二重解決しない（例外が出ないこと）
		expect(() =>
			fake.emit('message', { data: { id: fake.sent[0].id, buffer: new Uint8Array([1]).buffer } })
		).not.toThrow()
	})

	test('応答が来ない場合はタイムアウトで reject し pending を解放する', async () => {
		vi.useFakeTimers()
		const { wp } = makeProtocol()
		const p = wp.request('https://host/slow.png', new AbortController())
		// タイマー発火前に reject ハンドラを付けておく（unhandled rejection を防ぐ）
		const assertion = expect(p).rejects.toThrow(/timed out/)
		await vi.advanceTimersByTimeAsync(WorkerProtocol.REQUEST_TIMEOUT_MS + 1)
		await assertion
		expect(wp.pendingCount).toBe(0)
	})

	test('fetch 失敗時は "Failed to load image" で reject する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down')
			})
		)
		const { wp } = makeProtocol()
		await expect(wp.request('https://host/x.png', new AbortController())).rejects.toThrow(
			'Failed to load image'
		)
		expect(wp.pendingCount).toBe(0)
	})

	test('HTTP非OK応答も "Failed to load image" で reject する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				blob: async () => new Blob(),
			}))
		)
		const { wp } = makeProtocol()
		await expect(wp.request('https://host/x.png', new AbortController())).rejects.toThrow(
			'Failed to load image'
		)
	})

	test('HTTP200でも画像デコード失敗時は reject する（HTMLエラーページ対策）', async () => {
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => {
				throw new Error('not an image')
			})
		)
		const { wp } = makeProtocol()
		await expect(wp.request('https://host/x.png', new AbortController())).rejects.toThrow(
			'Failed to load image'
		)
	})
})

describe('getGsiDemProtocolAction', () => {
	test('protocol action は正規化済みURLで request を呼ぶ', async () => {
		const action = getGsiDemProtocolAction('gsidem')
		// getWorkerProtocol は本物の Worker(=stub された FakeWorker) を生成する
		const controller = new AbortController()
		const promise = action(
			{ url: 'gsidem://https://host/9/8/7.png' } as never,
			controller
		) as Promise<{ data: Uint8Array }>

		// 生成された内部 Worker を捕まえて応答する
		await vi.waitFor(() => expect(FakeWorker.instances.length).toBeGreaterThan(0))
		const internal = FakeWorker.instances[FakeWorker.instances.length - 1]
		await vi.waitFor(() => expect(internal.sent.length).toBe(1))
		expect(internal.sent[0].url).toBe('https://host/9/8/7.png')
		internal.emit('message', {
			data: { id: internal.sent[0].id, buffer: new Uint8Array([7]).buffer },
		})
		const result = await promise
		expect(Array.from(result.data)).toEqual([7])
	})
})
