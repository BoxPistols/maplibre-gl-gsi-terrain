/**
 * フライトプラン編集モデル（PC: DJI Flight Hub 風プランニングの中核）
 *
 * FlightPlanPhase[] に対する純粋な CRUD 操作を提供する。
 * すべての操作は新しい配列を返し（イミュータブル）、UI から独立して
 * ユニットテストできる。高度は elevation モデル（標高/海抜/対地）と
 * 統合し、position[2] は常に海抜高度(ASL)として扱う。
 */

import type { FlightPlanPhase } from './types'
import { makeElevation, safeNumber, type ElevationTriple } from './elevation'

/** 座標・時間のバリデーション用クランプ */
const clampLng = (lng: number): number => Math.max(-180, Math.min(180, safeNumber(lng)))
const clampLat = (lat: number): number => Math.max(-90, Math.min(90, safeNumber(lat)))
const clampDuration = (ms: number): number => Math.max(100, Math.round(safeNumber(ms, 3000)))

/** index が配列範囲内か */
const inRange = (phases: readonly FlightPlanPhase[], index: number): boolean =>
	Number.isInteger(index) && index >= 0 && index < phases.length

/** ウェイポイントを新規作成する。alt は AGL か ASL のどちらかで指定 */
export const createWaypoint = (
	lng: number,
	lat: number,
	alt: { agl: number } | { asl: number },
	ground: number,
	opts: Partial<
		Pick<FlightPlanPhase, 'phase' | 'action' | 'duration' | 'pitch' | 'zoom' | 'bearing'>
	> = {}
): FlightPlanPhase => {
	const elev = makeElevation(ground, alt)
	return {
		phase: opts.phase ?? 'ウェイポイント',
		action: opts.action ?? 'move',
		duration: clampDuration(opts.duration ?? 3000),
		position: [clampLng(lng), clampLat(lat), elev.asl],
		...(opts.pitch !== undefined ? { pitch: opts.pitch } : {}),
		...(opts.zoom !== undefined ? { zoom: opts.zoom } : {}),
		...(opts.bearing !== undefined ? { bearing: opts.bearing } : {}),
	}
}

/** ウェイポイントを挿入する（index 省略時は末尾）。範囲外 index は末尾に丸める */
export const addWaypoint = (
	phases: readonly FlightPlanPhase[],
	wp: FlightPlanPhase,
	index?: number
): FlightPlanPhase[] => {
	const next = [...phases]
	const at =
		index === undefined || !Number.isInteger(index)
			? next.length
			: Math.max(0, Math.min(next.length, index))
	next.splice(at, 0, wp)
	return next
}

/**
 * ウェイポイントの部分更新。位置・時間は NaN ガード＋クランプされる。
 * 範囲外 index は無視して元の配列を返す。
 */
export const updateWaypoint = (
	phases: readonly FlightPlanPhase[],
	index: number,
	patch: Partial<FlightPlanPhase>
): FlightPlanPhase[] => {
	if (!inRange(phases, index)) return [...phases]
	const current = phases[index]
	const merged: FlightPlanPhase = { ...current, ...patch }
	if (patch.position) {
		merged.position = [
			clampLng(patch.position[0]),
			clampLat(patch.position[1]),
			safeNumber(patch.position[2], current.position[2]),
		]
	}
	if (patch.duration !== undefined) merged.duration = clampDuration(patch.duration)
	return phases.map((p, i) => (i === index ? merged : p))
}

/** ウェイポイントを削除する。範囲外 index は無視 */
export const removeWaypoint = (
	phases: readonly FlightPlanPhase[],
	index: number
): FlightPlanPhase[] =>
	inRange(phases, index) ? phases.filter((_, i) => i !== index) : [...phases]

/** ウェイポイントを from から to へ並べ替える */
export const moveWaypoint = (
	phases: readonly FlightPlanPhase[],
	from: number,
	to: number
): FlightPlanPhase[] => {
	if (!inRange(phases, from) || !inRange(phases, to) || from === to) return [...phases]
	const next = [...phases]
	const [wp] = next.splice(from, 1)
	next.splice(to, 0, wp)
	return next
}

/**
 * ウェイポイントの高度を AGL または ASL で設定する。
 * position[2](=ASL) を elevation モデルで整合させて更新する。
 */
export const setWaypointAltitude = (
	phases: readonly FlightPlanPhase[],
	index: number,
	alt: { agl: number } | { asl: number },
	ground: number
): FlightPlanPhase[] => {
	if (!inRange(phases, index)) return [...phases]
	const elev = makeElevation(ground, alt)
	return updateWaypoint(phases, index, {
		position: [phases[index].position[0], phases[index].position[1], elev.asl],
	})
}

/** ウェイポイントの高度3値（標高/海抜/対地）を得る */
export const waypointElevation = (phase: FlightPlanPhase, ground: number): ElevationTriple =>
	makeElevation(ground, { asl: safeNumber(phase.position[2]) })

/** 2点間の水平距離 [m]（ハバサイン） */
export const haversineMeters = (a: [number, number], b: [number, number]): number => {
	const R = 6371000
	const toRad = (d: number) => (d * Math.PI) / 180
	const dLat = toRad(b[1] - a[1])
	const dLng = toRad(b[0] - a[0])
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
	return 2 * R * Math.asin(Math.sqrt(s))
}

export interface PlanStats {
	waypointCount: number
	totalDurationMs: number
	/** 経路長 [m]（水平距離＋高度差を含む3D距離） */
	totalDistanceM: number
}

/** プラン全体の統計（DJI風のサマリー表示用） */
export const planStats = (phases: readonly FlightPlanPhase[]): PlanStats => {
	let dist = 0
	for (let i = 1; i < phases.length; i++) {
		const prev = phases[i - 1].position
		const cur = phases[i].position
		const horizontal = haversineMeters([prev[0], prev[1]], [cur[0], cur[1]])
		const vertical = safeNumber(cur[2]) - safeNumber(prev[2])
		dist += Math.sqrt(horizontal ** 2 + vertical ** 2)
	}
	return {
		waypointCount: phases.length,
		totalDurationMs: phases.reduce((sum, p) => sum + safeNumber(p.duration), 0),
		totalDistanceM: Math.round(dist),
	}
}
