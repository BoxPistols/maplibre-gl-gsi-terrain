import type { AddProtocolAction, RasterDEMSourceSpecification } from 'maplibre-gl'
import type maplibregl from 'maplibre-gl'
import { workerCode } from './worker'

const loadImage = async (src: string, signal: AbortSignal): Promise<ImageBitmap | null> => {
	let response: Response
	try {
		response = await fetch(src, { signal })
	} catch (e) {
		if (!signal.aborted) {
			console.error(`[gsi-terrain] Failed to fetch tile from ${src}:`, e)
		}
		return null
	}
	if (!response.ok) {
		console.error(
			`[gsi-terrain] Tile response not OK: ${response.status} ${response.statusText} (${src})`
		)
		return null
	}
	try {
		return await createImageBitmap(await response.blob())
	} catch (e) {
		// GSIエンドポイントは HTTP 200 で HTML エラーページを返すことがあり、
		// その場合 createImageBitmap が reject する。ここで吸収して null を返し、
		// loadImage の失敗パスを一本化する。
		if (!signal.aborted) {
			console.error(`[gsi-terrain] Failed to decode tile image from ${src}:`, e)
		}
		return null
	}
}

/** AbortError を環境非依存で生成する */
const makeAbortError = (): Error => {
	if (typeof DOMException !== 'undefined') {
		return new DOMException('Request aborted', 'AbortError') as unknown as Error
	}
	const err = new Error('Request aborted')
	err.name = 'AbortError'
	return err
}

type PendingRequest = {
	resolve: (value: { data: Uint8Array }) => void
	reject: (reason?: unknown) => void
	timeout: ReturnType<typeof setTimeout>
	signal: AbortSignal
	onAbort: () => void
}

/**
 * Web Worker と 1:1 でやり取りし、GSI標高PNGを terrarium エンコードへ再変換する。
 * - リクエストは URL ではなく採番IDで管理する（同一URLの同時リクエストが競合しないように）
 * - 各リクエストにタイムアウトを設け、応答が来なくても pendingRequests がリークしない
 * - Worker が error イベントで落ちた場合は自動で再生成する（回数上限つき）
 */
export class WorkerProtocol {
	private worker: Worker
	private workerUrl: string | null
	private pendingRequests = new Map<number, PendingRequest>()
	private nextRequestId = 0
	private terminated = false
	private respawnTimestamps: number[] = []

	static readonly REQUEST_TIMEOUT_MS = 30_000
	private static readonly MAX_RESPAWNS = 3
	private static readonly RESPAWN_WINDOW_MS = 60_000

	constructor(worker: Worker, workerUrl: string | null = null) {
		this.worker = worker
		this.workerUrl = workerUrl
		this.worker.addEventListener('message', this.handleMessage)
		this.worker.addEventListener('error', this.handleError)
	}

	/** テスト・診断用: 未解決リクエスト数 */
	get pendingCount(): number {
		return this.pendingRequests.size
	}

	async request(url: string, controller: AbortController): Promise<{ data: Uint8Array }> {
		if (this.terminated) {
			return Promise.reject(new Error('GSI terrain worker is unavailable'))
		}

		const image = await loadImage(url, controller.signal)
		if (!image) {
			return Promise.reject(new Error(`Failed to load image: ${url}`))
		}

		// loadImage 中に abort された場合は Worker へ送らず即座に後始末する
		if (controller.signal.aborted) {
			image.close?.()
			return Promise.reject(makeAbortError())
		}

		const id = this.nextRequestId++
		return new Promise<{ data: Uint8Array }>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.settle(id, undefined, new Error(`GSI DEM tile request timed out: ${url}`))
			}, WorkerProtocol.REQUEST_TIMEOUT_MS)

			// onabort への代入だと他のハンドラを上書きしてしまうため addEventListener を使う
			const onAbort = () => this.settle(id, undefined, makeAbortError())
			controller.signal.addEventListener('abort', onAbort, { once: true })

			this.pendingRequests.set(id, { resolve, reject, timeout, signal: controller.signal, onAbort })

			try {
				// ImageBitmap は transferable。転送してコピーを回避する
				this.worker.postMessage({ id, image, url }, [image])
			} catch (e) {
				this.settle(id, undefined, e instanceof Error ? e : new Error(String(e)))
			}
		})
	}

	/** 保留中リクエストを解決/棄却し、タイマーとリスナーを確実に後始末する */
	private settle(id: number, value?: { data: Uint8Array }, error?: unknown): void {
		const request = this.pendingRequests.get(id)
		if (!request) return
		this.pendingRequests.delete(id)
		clearTimeout(request.timeout)
		request.signal.removeEventListener('abort', request.onAbort)
		if (error !== undefined) {
			request.reject(error)
		} else if (value) {
			request.resolve(value)
		}
	}

	private handleMessage = (e: MessageEvent) => {
		const { id, buffer, error } = e.data as { id: number; buffer?: ArrayBuffer; error?: string }
		if (error) {
			this.settle(id, undefined, new Error(error))
		} else if (buffer) {
			this.settle(id, { data: new Uint8Array(buffer) })
		}
	}

	private handleError = (e: ErrorEvent) => {
		console.error('[gsi-terrain] worker error:', e.message)
		for (const id of [...this.pendingRequests.keys()]) {
			this.settle(id, undefined, new Error('Worker error occurred'))
		}
		this.respawn()
	}

	/** Worker を作り直す。短時間に連続クラッシュした場合は諦めて無効化する */
	private respawn(): void {
		const now = Date.now()
		this.respawnTimestamps = this.respawnTimestamps.filter(
			t => now - t < WorkerProtocol.RESPAWN_WINDOW_MS
		)
		this.respawnTimestamps.push(now)

		this.worker.removeEventListener('message', this.handleMessage)
		this.worker.removeEventListener('error', this.handleError)
		try {
			this.worker.terminate()
		} catch {
			/* noop */
		}
		if (this.workerUrl) {
			URL.revokeObjectURL(this.workerUrl)
			this.workerUrl = null
		}

		if (this.respawnTimestamps.length > WorkerProtocol.MAX_RESPAWNS) {
			console.error(
				'[gsi-terrain] worker crashed repeatedly; disabling GSI DEM re-encoding for this session'
			)
			this.terminated = true
			return
		}

		try {
			const spawned = spawnWorker()
			this.worker = spawned.worker
			this.workerUrl = spawned.url
			this.worker.addEventListener('message', this.handleMessage)
			this.worker.addEventListener('error', this.handleError)
		} catch (err) {
			console.error('[gsi-terrain] failed to respawn worker; disabling re-encoding:', err)
			this.terminated = true
		}
	}

	/** テスト用途などで明示的に破棄する */
	dispose(): void {
		this.terminated = true
		for (const id of [...this.pendingRequests.keys()]) {
			this.settle(id, undefined, new Error('WorkerProtocol disposed'))
		}
		this.worker.removeEventListener('message', this.handleMessage)
		this.worker.removeEventListener('error', this.handleError)
		try {
			this.worker.terminate()
		} catch {
			/* noop */
		}
		if (this.workerUrl) {
			URL.revokeObjectURL(this.workerUrl)
			this.workerUrl = null
		}
	}
}

/** Worker を Blob URL から生成する。URL は WorkerProtocol 側で破棄時に revoke する */
const spawnWorker = (): { worker: Worker; url: string } => {
	const blob = new Blob([workerCode], { type: 'application/javascript' })
	const url = URL.createObjectURL(blob)
	return { worker: new Worker(url), url }
}

// import 時に副作用を起こさないよう、Worker は初回利用時に遅延生成する
// （これにより SSR / Node / テスト環境でも terrain.ts を安全に import できる）
let workerProtocol: WorkerProtocol | null = null
const getWorkerProtocol = (): WorkerProtocol => {
	if (!workerProtocol) {
		const spawned = spawnWorker()
		workerProtocol = new WorkerProtocol(spawned.worker, spawned.url)
	}
	return workerProtocol
}

type Options = {
	attribution?: string
	maxzoom?: number
	minzoom?: number
	tileUrl?: string
}

/**
 * 地理院標高タイルを利用したtype=raster-demのsourceを返す
 * @param addProtocol
 * @param options
 * @returns {RasterDEMSourceSpecification} - source
 * @example
 * const gsiTerrainSource = useGsiTerrainSource(maplibreGl.addProtocol);
 * const map = new Map({
 *  container: 'app',
 *  style: {
 *    version: 8,
 *    sources: {
 *      terrain: gsiTerrainSource,
 *    },
 *    terrain: {
 *      source: 'terrain',
 *      exaggeration: 1.2,
 *    },
 *  },
 * });
 *
 * const seamlessTerrainSource = useGsiTerrainSource(maplibreGl.addProtocol, {
 *   tileUrl: 'https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png',
 *   minzoom: 1,
 *   maxzoom: 17,
 *   attribution: '<a href="https://gbank.gsj.jp/seamless/elev/">産総研シームレス標高タイル</a>',
 * });
 */
export const useGsiTerrainSource = (
	addProtocol: typeof maplibregl.addProtocol,
	options: Options = {}
): RasterDEMSourceSpecification => {
	const protocolName = 'gsidem'
	const protocolAction = getGsiDemProtocolAction(protocolName)
	addProtocol(protocolName, protocolAction)

	const tileUrl = options.tileUrl ?? 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'

	return {
		type: 'raster-dem',
		tiles: [`gsidem://${tileUrl}`],
		tileSize: 256,
		encoding: 'terrarium',
		minzoom: options.minzoom ?? 1,
		maxzoom: options.maxzoom ?? 14,
		attribution:
			options.attribution ??
			'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
	}
}

/**
 * gsidem プロトコル付きURLから実際のタイルURLを取り出す（純粋関数・テスト可能）
 * - 旧形式 `gsidem://https://...` と新形式 `gsidem:https://...` の両方に対応
 * - URL正規化で崩れた `https///` `https//` 等を `https://` に修復する
 */
export const normalizeGsiUrl = (customProtocol: string, url: string): string => {
	const protocolPattern = new RegExp(`^${customProtocol}:(?://)?`)
	const withoutProtocol = url.replace(protocolPattern, '')
	return withoutProtocol.replace(/^(https?)\/{2,}/, '$1://')
}

/**
 * 地理院標高タイルを利用してtype=raster-demのsourceを生成するためのProtocolActionを返す
 * @param customProtocol - 任意のプロトコル名（例: 'gsidem'）
 * @returns {AddProtocolAction} - ProtocolAction
 * @example
 * const protocolAction = getGsiDemProtocolAction('gsidem');
 * addProtocol('gsidem', protocolAction);
 * const rasterDemSource = {
 *   type: 'raster-dem',
 *   tiles: ['gsidem://https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
 *   tileSize: 256,
 *   minzoom: 1,
 *   maxzoom: 14,
 *   attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
 * };
 * const map = new Map({container: 'app', style: {sources: {terrain: gsiTerrainSource}}});
 */
export const getGsiDemProtocolAction = (customProtocol: string): AddProtocolAction => {
	return (params, abortController) => {
		const url = normalizeGsiUrl(customProtocol, params.url)
		return getWorkerProtocol().request(url, abortController)
	}
}
