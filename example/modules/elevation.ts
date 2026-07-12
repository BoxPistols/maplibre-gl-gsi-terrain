/**
 * 3D標高モデル
 *
 * ドローンの高度を、地表の標高・海抜高度・相対高度の3値で一貫して扱う。
 *
 *   不変条件:  asl = ground + agl
 *
 *   - ground (標高): 地表面の標高。平均海面(ジオイド)からの地表の高さ [m]。
 *                    GSI DEM から map.queryTerrainElevation() で取得する。
 *   - asl    (海抜高度 / MSL): 平均海面からの機体の高さ (Above Sea Level) [m]。
 *   - agl    (相対高度 / AGL): 地表からの機体の高さ (Above Ground Level) [m]。
 *
 * DJI等のフライト計画と同様、ユーザーは AGL（対地高度）でも ASL（海抜）でも
 * 入力でき、地表標高を介してもう一方が常に整合するようにする。
 */

/**
 * map.queryTerrainElevation を持つ最小構造。
 * MapLibre / Mapbox どちらの Map（およびそれらの union 型）も受けられるよう、
 * 特定ライブラリの型に縛らない構造的インターフェースにする。
 */
export type TerrainQueryable = {
	queryTerrainElevation?: (lngLat: [number, number]) => number | null | undefined
}

export interface ElevationTriple {
	/** 標高: 地表面の海抜 [m] */
	ground: number
	/** 海抜高度 (MSL): 平均海面からの機体高度 [m] */
	asl: number
	/** 相対高度 (AGL): 地表からの機体高度 [m] */
	agl: number
}

/** ドラッグ等で地表標高が変わったときに、どちらの値を維持するか */
export type KeepMode = 'agl' | 'asl'

/** 非有限値(NaN/Infinity)を安全な数値に丸める */
export const safeNumber = (n: unknown, fallback = 0): number =>
	typeof n === 'number' && Number.isFinite(n) ? n : fallback

const round = (v: number, digits = 3): number => {
	const f = 10 ** digits
	return Math.round(v * f) / f
}

const normalize = (t: ElevationTriple): ElevationTriple => ({
	ground: round(t.ground),
	asl: round(t.asl),
	agl: round(t.agl),
})

/**
 * 地表標高と、AGL または ASL の一方から一貫した ElevationTriple を作る。
 * agl は既定で 0 未満にならないようにクランプする（地中に潜らせない）。
 */
export const makeElevation = (
	ground: number,
	alt: { agl: number } | { asl: number },
	opts: { minAgl?: number } = {}
): ElevationTriple => {
	const g = safeNumber(ground)
	const minAgl = opts.minAgl ?? 0
	if ('agl' in alt) {
		const agl = Math.max(minAgl, safeNumber(alt.agl))
		return normalize({ ground: g, agl, asl: g + agl })
	}
	const asl = safeNumber(alt.asl)
	const agl = Math.max(minAgl, asl - g)
	// agl をクランプした場合は asl も整合させる
	return normalize({ ground: g, agl, asl: g + agl })
}

/** 相対高度(AGL)を設定し、ASLを再計算する */
export const setAgl = (
	t: ElevationTriple,
	agl: number,
	opts: { minAgl?: number } = {}
): ElevationTriple => makeElevation(t.ground, { agl }, opts)

/** 海抜高度(ASL)を設定し、AGLを再計算する */
export const setAsl = (
	t: ElevationTriple,
	asl: number,
	opts: { minAgl?: number } = {}
): ElevationTriple => makeElevation(t.ground, { asl }, opts)

/**
 * 地表標高が変化したとき（=機体が別の地形の上へ移動したとき）に更新する。
 *  - keep='agl': 対地高度を維持（地形追従。ASLが変わる）— フライト計画の既定
 *  - keep='asl': 海抜高度を維持（AGLが変わる）
 */
export const setGround = (
	t: ElevationTriple,
	ground: number,
	keep: KeepMode = 'agl',
	opts: { minAgl?: number } = {}
): ElevationTriple =>
	keep === 'agl'
		? makeElevation(ground, { agl: t.agl }, opts)
		: makeElevation(ground, { asl: t.asl }, opts)

/** 値が有限で不変条件 asl≈ground+agl を満たすか */
export const isValidElevation = (t: ElevationTriple): boolean =>
	Number.isFinite(t.ground) &&
	Number.isFinite(t.asl) &&
	Number.isFinite(t.agl) &&
	Math.abs(t.asl - (t.ground + t.agl)) < 1e-6

/**
 * 指定座標の地表標高を GSI DEM (terrain) から取得する。
 * terrain が無効/未読込の場合や座標が範囲外の場合は null を返す。
 */
export const queryGroundElevation = (
	map: TerrainQueryable,
	lng: number,
	lat: number
): number | null => {
	if (typeof map?.queryTerrainElevation !== 'function') return null
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
	try {
		const elev = map.queryTerrainElevation([lng, lat])
		return typeof elev === 'number' && Number.isFinite(elev) ? round(elev) : null
	} catch {
		return null
	}
}

/**
 * 座標と高度指定から ElevationTriple を解決する。
 * 地表標高が取得できない場合は ground=0（海面基準）として扱う。
 */
export const resolveElevation = (
	map: TerrainQueryable,
	lng: number,
	lat: number,
	alt: { agl: number } | { asl: number },
	opts: { minAgl?: number } = {}
): ElevationTriple => {
	const ground = queryGroundElevation(map, lng, lat) ?? 0
	return makeElevation(ground, alt, opts)
}

/** 表示用の短い整形（例: "海抜 152.3m / 対地 100.0m"） */
export const formatElevation = (t: ElevationTriple): string =>
	`海抜 ${t.asl.toFixed(1)}m / 対地 ${t.agl.toFixed(1)}m（標高 ${t.ground.toFixed(1)}m）`
