/**
 * デバイスプロファイル（PC / モバイルの単一判定源）
 *
 * これまで判定が3系統に分裂していた:
 *   - index.html のインラインスクリプト（UA または innerWidth<=768）
 *   - CSS のブレークポイント（768px / 480px / hover:none）
 *   - index.ts の isMobileDevice()（タッチ必須）
 *
 * これを1つの `DeviceProfile` に統一する。分類は「タッチ可能かつ
 * （狭幅 or モバイルUA）」= mobile とし、狭いだけのデスクトップ窓を
 * 誤ってモバイル扱いしない（＝PC/モバイルの明確な最適化）。
 * さらにデバイス別のレンダリング/パフォーマンス設定を一元管理する。
 */

export type DeviceKind = 'desktop' | 'mobile'

export interface RenderConfig {
	/** タイルのフェードアニメーション時間 [ms] */
	fadeDuration: number
	/** raster ソースのタイルサイズ */
	tileSize: number
	/** 3D地形(terrain)を有効にするか */
	enableTerrain: boolean
	/** 地形の誇張倍率 */
	terrainExaggeration: number
	/** ドローン軌跡の描画を有効にするか */
	enableDroneTrail: boolean
	/** devicePixelRatio 上限（モバイルのみ設定, 省電力） */
	pixelRatio?: number
	/** タイルキャッシュ上限（モバイルのみ） */
	maxTileCacheSize?: number
	/** 世界地図の複製（モバイルは無効） */
	renderWorldCopies: boolean
	/** ソース間の衝突判定（モバイルは無効） */
	crossSourceCollisions: boolean
	/** リソースタイミング計測 */
	collectResourceTiming: boolean
	/** アンチエイリアス（モバイルは無効で軽量化） */
	antialias: boolean
}

export interface DeviceProfile {
	kind: DeviceKind
	/** タッチUI（ジョイスティック等）を出すべきか */
	isTouch: boolean
	/** 狭幅レイアウトか（<=768px） */
	isNarrow: boolean
	/** OSのモーション低減設定 */
	prefersReducedMotion: boolean
	render: RenderConfig
}

interface DetectEnv {
	matchMedia?: (query: string) => { matches: boolean }
	navigator?: { userAgent?: string; maxTouchPoints?: number }
	innerWidth?: number
	devicePixelRatio?: number
	ontouchstart?: unknown
}

const DESKTOP_RENDER: RenderConfig = {
	fadeDuration: 300,
	tileSize: 256,
	enableTerrain: true,
	terrainExaggeration: 1.2,
	enableDroneTrail: true,
	renderWorldCopies: true,
	crossSourceCollisions: true,
	collectResourceTiming: false,
	antialias: true,
}

const mobileRender = (devicePixelRatio: number): RenderConfig => ({
	fadeDuration: 0,
	tileSize: 512,
	enableTerrain: false,
	terrainExaggeration: 0,
	enableDroneTrail: false,
	// 高解像度ディスプレイでも最大2倍までに抑えて省電力・高フレームレート化
	pixelRatio: Math.min(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, 2),
	maxTileCacheSize: 50,
	renderWorldCopies: false,
	crossSourceCollisions: false,
	collectResourceTiming: false,
	antialias: false,
})

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

/**
 * 現在の実行環境から DeviceProfile を判定する。
 * テスト用に env を注入できる（既定は window）。
 */
export const detectDeviceProfile = (env: DetectEnv = window): DeviceProfile => {
	const mm = (q: string): boolean =>
		typeof env.matchMedia === 'function' ? !!env.matchMedia(q).matches : false

	const nav = env.navigator ?? {}
	const maxTouchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0
	const coarsePointer = mm('(hover: none) and (pointer: coarse)')
	const hasTouch = coarsePointer || maxTouchPoints > 0 || 'ontouchstart' in env

	const width = typeof env.innerWidth === 'number' ? env.innerWidth : 1024
	const isNarrow = mm('(max-width: 768px)') || width <= 768

	const isMobileUA = MOBILE_UA.test(nav.userAgent ?? '')
	const prefersReducedMotion = mm('(prefers-reduced-motion: reduce)')

	// タッチ端末で、かつ狭幅 or モバイルUA のときのみ mobile
	const kind: DeviceKind = hasTouch && (isNarrow || isMobileUA) ? 'mobile' : 'desktop'

	return {
		kind,
		isTouch: hasTouch,
		isNarrow,
		prefersReducedMotion,
		render: kind === 'mobile' ? mobileRender(env.devicePixelRatio ?? 1) : DESKTOP_RENDER,
	}
}

/**
 * ルート要素に data-device 属性を付与し、CSS が確実にデバイスを
 * 分岐できるようにする（メディアクエリだけに依存しない）。
 */
export const applyDeviceAttributes = (
	profile: DeviceProfile,
	root: { setAttribute: (name: string, value: string) => void } = document.documentElement
): void => {
	root.setAttribute('data-device', profile.kind)
	root.setAttribute('data-touch', String(profile.isTouch))
}
