/**
 * PlanPanel — PC用フライトプランエディタ（DJI Flight Hub 2 風）
 *
 * ウェイポイントの一覧・タイムライン・統計を表示し、
 * 座標(経度/緯度)と高度(海抜ASL/対地AGL)・所要時間をインライン編集できる。
 * 追加・複製・削除・並べ替えに対応し、変更は onChange で通知する。
 *
 * DOM は createElement + textContent で構築する（innerHTML への
 * 動的文字列注入はしない）。スタイルは styles/app.css の .plan-* を使う。
 */

import type { FlightPlanPhase } from './types'
import {
	addWaypoint,
	moveWaypoint,
	planStats,
	removeWaypoint,
	setWaypointAltitude,
	updateWaypoint,
	waypointElevation,
} from './flight-plan-editor'
import { safeNumber } from './elevation'

export interface PlanPanelOptions {
	/** 指定座標の地表標高 [m]。terrain 未読込なら null */
	getGround: (lng: number, lat: number) => number | null
	/** プラン変更時（編集・追加・削除・並べ替え） */
	onChange: (phases: FlightPlanPhase[]) => void
	/** 行クリックでそのウェイポイントへ地図を移動 */
	onFlyTo?: (index: number, phase: FlightPlanPhase) => void
}

const el = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string
): HTMLElementTagNameMap[K] => {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text !== undefined) node.textContent = text
	return node
}

const numInput = (
	className: string,
	value: number,
	step: number,
	title: string,
	onCommit: (v: number) => void
): HTMLInputElement => {
	const input = el('input', className) as HTMLInputElement
	input.type = 'number'
	input.step = String(step)
	input.value = String(value)
	input.title = title
	input.setAttribute('aria-label', title)
	input.addEventListener('change', () => {
		const v = parseFloat(input.value)
		if (Number.isFinite(v)) onCommit(v)
		else input.value = String(value) // 不正入力は元に戻す
	})
	// 行クリック(flyTo)と競合しないようにする
	input.addEventListener('click', e => e.stopPropagation())
	return input
}

const iconButton = (
	label: string,
	title: string,
	onClick: () => void,
	className = 'plan-btn'
): HTMLButtonElement => {
	const btn = el('button', className, label) as HTMLButtonElement
	btn.type = 'button'
	btn.title = title
	btn.setAttribute('aria-label', title)
	btn.addEventListener('click', e => {
		e.stopPropagation()
		onClick()
	})
	return btn
}

export class PlanPanel {
	private root: HTMLElement
	private opts: PlanPanelOptions
	private phases: FlightPlanPhase[] = []
	private planName = ''
	private activeIndex: number | null = null

	private headerStats: HTMLElement
	private timeline: HTMLElement
	private list: HTMLElement

	constructor(container: HTMLElement, opts: PlanPanelOptions) {
		this.opts = opts
		this.root = el('div', 'plan-panel')
		this.root.setAttribute('data-testid', 'plan-panel')

		const header = el('div', 'plan-header')
		header.appendChild(el('div', 'plan-header-title', 'ウェイポイント'))
		this.headerStats = el('div', 'plan-stats')
		header.appendChild(this.headerStats)

		this.timeline = el('div', 'plan-timeline')
		this.timeline.setAttribute('role', 'img')
		this.timeline.setAttribute('aria-label', 'フライトタイムライン')

		this.list = el('div', 'plan-list')

		const footer = el('div', 'plan-footer')
		footer.appendChild(
			iconButton(
				'＋ ウェイポイント追加',
				'末尾にウェイポイントを追加',
				() => this.addAtEnd(),
				'plan-btn plan-btn-add'
			)
		)

		this.root.append(header, this.timeline, this.list, footer)
		container.appendChild(this.root)
	}

	/** プランを差し替えて全体を再描画する */
	setPlan(name: string, phases: readonly FlightPlanPhase[]): void {
		this.planName = name
		this.phases = [...phases]
		this.activeIndex = null
		this.render()
	}

	/** 実行中フェーズのハイライト（null で解除） */
	setActivePhase(index: number | null): void {
		this.activeIndex = index
		// 再構築せず class の付け替えのみ（実行中の入力値を消さない）
		const rows = this.list.querySelectorAll('.plan-row')
		rows.forEach((row, i) => row.classList.toggle('active', i === index))
		const segs = this.timeline.querySelectorAll('.plan-seg')
		segs.forEach((seg, i) => {
			seg.classList.toggle('active', i === index)
			seg.classList.toggle('done', index !== null && i < index)
		})
	}

	getPhases(): FlightPlanPhase[] {
		return [...this.phases]
	}

	/** 構造変更（追加・削除・並べ替え）: 全再描画してから通知 */
	private commitStructural(next: FlightPlanPhase[]): void {
		this.phases = next
		this.render()
		this.opts.onChange([...next])
	}

	/**
	 * 値編集: 行を作り直さず、派生表示（標高/対地/海抜・統計・タイムライン）だけ
	 * 更新する。行を再構築しないため入力フォーカスが失われず、連続編集できる。
	 */
	private applyEdit(index: number, next: FlightPlanPhase[]): void {
		this.phases = next
		this.opts.onChange([...next])
		this.refreshDerived(index)
	}

	private groundAt(lng: number, lat: number): number {
		return this.opts.getGround(lng, lat) ?? 0
	}

	private addAtEnd(): void {
		const last = this.phases[this.phases.length - 1]
		// 既存の最終WPを少し北東にずらして複製（無ければ東京タワー基準）
		const base: FlightPlanPhase = last ?? {
			phase: 'WP',
			action: 'move',
			duration: 3000,
			position: [139.7454, 35.6586, 150],
		}
		const wp: FlightPlanPhase = {
			...base,
			phase: `WP${this.phases.length + 1}`,
			position: [base.position[0] + 0.0006, base.position[1] + 0.0004, base.position[2]],
		}
		this.commitStructural(addWaypoint(this.phases, wp))
	}

	private render(): void {
		this.renderStatsAndTimeline(true)
		// 一覧（全行を作り直す）
		this.list.textContent = ''
		this.phases.forEach((p, i) => this.list.appendChild(this.buildRow(p, i)))
	}

	/** 統計ヘッダとタイムラインを更新。rebuild=false のときは既存segを流用（フォーカス保持時） */
	private renderStatsAndTimeline(rebuild: boolean): void {
		const stats = planStats(this.phases)
		this.headerStats.textContent = `${this.planName} ・ ${stats.waypointCount} WP ・ ${(stats.totalDurationMs / 1000).toFixed(0)}s ・ ${(stats.totalDistanceM / 1000).toFixed(2)}km`

		const total = Math.max(1, stats.totalDurationMs)
		const segs = this.timeline.querySelectorAll('.plan-seg')
		if (rebuild || segs.length !== this.phases.length) {
			this.timeline.textContent = ''
			this.phases.forEach((p, i) => {
				const seg = el('div', 'plan-seg')
				seg.style.flexGrow = String(Math.max(1, safeNumber(p.duration)) / total)
				seg.title = `${i + 1}. ${p.phase}（${(p.duration / 1000).toFixed(1)}s）`
				if (this.activeIndex === i) seg.classList.add('active')
				this.timeline.appendChild(seg)
			})
		} else {
			this.phases.forEach((p, i) => {
				const seg = segs[i] as HTMLElement
				seg.style.flexGrow = String(Math.max(1, safeNumber(p.duration)) / total)
				seg.title = `${i + 1}. ${p.phase}（${(p.duration / 1000).toFixed(1)}s）`
			})
		}
	}

	/** 値編集後、行 index の派生表示（標高/対地/海抜, 経緯度, 時間）を再構築せず更新する */
	private refreshDerived(index: number): void {
		const row = this.list.querySelector(`[data-testid="plan-row-${index}"]`)
		const p = this.phases[index]
		if (row && p) {
			const ground = this.groundAt(p.position[0], p.position[1])
			const elev = waypointElevation(p, ground)
			const active = document.activeElement
			const set = (sel: string, val: string) => {
				const inp = row.querySelector(sel) as HTMLInputElement | null
				// 編集中の入力欄は上書きしない（タイプ中の値を消さない）
				if (inp && inp !== active) inp.value = val
			}
			set('.plan-input-lng', String(p.position[0]))
			set('.plan-input-lat', String(p.position[1]))
			set('.plan-input-agl', String(Math.round(elev.agl * 10) / 10))
			set('.plan-input-asl', String(Math.round(elev.asl * 10) / 10))
			set('.plan-input-dur', String(p.duration / 1000))
			const g = row.querySelector('.plan-ground')
			if (g) g.textContent = elev.ground.toFixed(1)
		}
		this.renderStatsAndTimeline(false)
	}

	private buildRow(p: FlightPlanPhase, i: number): HTMLElement {
		const ground = this.groundAt(p.position[0], p.position[1])
		const elev = waypointElevation(p, ground)

		const row = el('div', 'plan-row')
		row.setAttribute('data-testid', `plan-row-${i}`)
		if (this.activeIndex === i) row.classList.add('active')
		row.addEventListener('click', () => this.opts.onFlyTo?.(i, p))

		// 行ヘッダ: 番号・フェーズ名・操作ボタン
		const head = el('div', 'plan-row-head')
		head.appendChild(el('span', 'plan-row-index', String(i + 1)))
		head.appendChild(el('span', 'plan-row-name', p.phase))
		const actions = el('span', 'plan-row-actions')
		actions.append(
			iconButton('↑', '上へ移動', () => this.commitStructural(moveWaypoint(this.phases, i, i - 1))),
			iconButton('↓', '下へ移動', () => this.commitStructural(moveWaypoint(this.phases, i, i + 1))),
			iconButton(
				'✕',
				'このウェイポイントを削除',
				() => this.commitStructural(removeWaypoint(this.phases, i)),
				'plan-btn plan-btn-danger'
			)
		)
		head.appendChild(actions)

		// 編集グリッド: 経度/緯度/対地AGL/海抜ASL/時間 ＋ 標高(読み取り専用)
		const grid = el('div', 'plan-row-grid')

		const field = (labelText: string, input: HTMLInputElement | HTMLElement) => {
			const wrap = el('label', 'plan-field')
			wrap.appendChild(el('span', 'plan-field-label', labelText))
			wrap.appendChild(input)
			return wrap
		}

		// 各 onCommit は closure の p ではなく常に this.phases[i]（最新状態）を読む。
		// これにより連続編集で兄弟座標を巻き戻さない（データ破壊防止）。
		grid.appendChild(
			field(
				'経度',
				numInput('plan-input plan-input-lng', p.position[0], 0.0001, `WP${i + 1} 経度`, v => {
					const cur = this.phases[i]
					this.applyEdit(
						i,
						updateWaypoint(this.phases, i, { position: [v, cur.position[1], cur.position[2]] })
					)
				})
			)
		)
		grid.appendChild(
			field(
				'緯度',
				numInput('plan-input plan-input-lat', p.position[1], 0.0001, `WP${i + 1} 緯度`, v => {
					const cur = this.phases[i]
					this.applyEdit(
						i,
						updateWaypoint(this.phases, i, { position: [cur.position[0], v, cur.position[2]] })
					)
				})
			)
		)
		grid.appendChild(
			field(
				'対地 AGL [m]',
				numInput(
					'plan-input plan-input-agl',
					Math.round(elev.agl * 10) / 10,
					1,
					`WP${i + 1} 対地高度`,
					v => {
						const cur = this.phases[i]
						this.applyEdit(
							i,
							setWaypointAltitude(
								this.phases,
								i,
								{ agl: v },
								this.groundAt(cur.position[0], cur.position[1])
							)
						)
					}
				)
			)
		)
		grid.appendChild(
			field(
				'海抜 ASL [m]',
				numInput(
					'plan-input plan-input-asl',
					Math.round(elev.asl * 10) / 10,
					1,
					`WP${i + 1} 海抜高度`,
					v => {
						const cur = this.phases[i]
						this.applyEdit(
							i,
							setWaypointAltitude(
								this.phases,
								i,
								{ asl: v },
								this.groundAt(cur.position[0], cur.position[1])
							)
						)
					}
				)
			)
		)
		grid.appendChild(
			field(
				'時間 [s]',
				numInput('plan-input plan-input-dur', p.duration / 1000, 0.5, `WP${i + 1} 所要時間`, v =>
					this.applyEdit(i, updateWaypoint(this.phases, i, { duration: v * 1000 }))
				)
			)
		)
		const groundRead = el('span', 'plan-ground ui-mono', `${elev.ground.toFixed(1)}`)
		grid.appendChild(field('標高 [m]', groundRead))

		row.append(head, grid)
		return row
	}
}
