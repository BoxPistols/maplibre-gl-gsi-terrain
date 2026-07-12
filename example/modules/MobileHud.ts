/**
 * MobileHud — iPhone向けゲーム風HUD
 *
 * 3Dゲームのように、画面上部にテレメトリ（海抜/対地/方位）、
 * 画面下部中央に大きな開始/一時停止ボタンとフェーズ進行を表示する。
 * すべてのタップターゲットは 44px 以上、Safe Area に対応（styles/app.css）。
 *
 * 毎フレーム呼ばれても DOM を作り直さず textContent の差分更新のみ行う
 * （モバイルのパフォーマンス最適化）。
 */

import type { ElevationTriple } from './elevation'

export interface MobileHudOptions {
	/** 開始/一時停止ボタン。現在の実行状態に応じて呼び分けは呼び出し側で行う */
	onStartPause: () => void
}

export interface HudFlightState {
	active: boolean
	phaseIndex: number | null
	totalPhases: number
	planName: string
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

const chip = (label: string): { wrap: HTMLElement; value: HTMLElement } => {
	const wrap = el('div', 'hud-chip')
	wrap.appendChild(el('span', 'hud-chip-label', label))
	const value = el('span', 'hud-chip-value ui-mono', '--')
	wrap.appendChild(value)
	return { wrap, value }
}

export class MobileHud {
	private root: HTMLElement
	private aslValue: HTMLElement
	private aglValue: HTMLElement
	private headingValue: HTMLElement
	private startPauseBtn: HTMLButtonElement
	private planLabel: HTMLElement
	private phaseLabel: HTMLElement

	// 前回表示値（差分更新でDOM書き込みを減らす）
	private lastAsl = ''
	private lastAgl = ''
	private lastHeading = ''

	constructor(container: HTMLElement, opts: MobileHudOptions) {
		this.root = el('div', 'mobile-hud')
		this.root.setAttribute('data-testid', 'mobile-hud')

		// 上部テレメトリ（ゲームのステータスバー風）
		const telemetry = el('div', 'hud-telemetry')
		const asl = chip('海抜')
		const agl = chip('対地')
		const heading = chip('方位')
		this.aslValue = asl.value
		this.aglValue = agl.value
		this.headingValue = heading.value
		telemetry.append(asl.wrap, agl.wrap, heading.wrap)

		// 下部アクションバー
		const bar = el('div', 'hud-bar')
		const info = el('div', 'hud-info')
		this.planLabel = el('div', 'hud-plan', '—')
		this.phaseLabel = el('div', 'hud-phase ui-mono', '')
		info.append(this.planLabel, this.phaseLabel)

		this.startPauseBtn = el('button', 'hud-start ui-tap', '▶ 開始') as HTMLButtonElement
		this.startPauseBtn.type = 'button'
		this.startPauseBtn.setAttribute('aria-label', 'フライト開始')
		this.startPauseBtn.addEventListener('click', () => opts.onStartPause())

		bar.append(info, this.startPauseBtn)
		this.root.append(telemetry, bar)
		container.appendChild(this.root)
	}

	/** フライト実行状態の反映（ボタン表示・フェーズ進行） */
	setFlightState(state: HudFlightState): void {
		this.planLabel.textContent = state.planName || '—'
		if (state.active && state.phaseIndex !== null) {
			this.phaseLabel.textContent = `PHASE ${state.phaseIndex + 1}/${state.totalPhases}`
			this.startPauseBtn.textContent = '⏸ 一時停止'
			this.startPauseBtn.setAttribute('aria-label', 'フライト一時停止')
			this.startPauseBtn.classList.add('flying')
		} else {
			this.phaseLabel.textContent =
				state.phaseIndex !== null && state.phaseIndex > 0
					? `PAUSED ${state.phaseIndex + 1}/${state.totalPhases}`
					: ''
			this.startPauseBtn.textContent = '▶ 開始'
			this.startPauseBtn.setAttribute('aria-label', 'フライト開始')
			this.startPauseBtn.classList.remove('flying')
		}
	}

	/** テレメトリ更新（毎フレーム呼び出し可。差分のみ書き込む） */
	setTelemetry(elev: ElevationTriple | null, heading: number | null): void {
		const asl = elev ? `${elev.asl.toFixed(0)}m` : '--'
		const agl = elev ? `${elev.agl.toFixed(0)}m` : '--'
		const hdg =
			heading !== null && Number.isFinite(heading) ? `${((heading % 360) + 360) % 360 | 0}°` : '--'
		if (asl !== this.lastAsl) {
			this.aslValue.textContent = asl
			this.lastAsl = asl
		}
		if (agl !== this.lastAgl) {
			this.aglValue.textContent = agl
			this.lastAgl = agl
		}
		if (hdg !== this.lastHeading) {
			this.headingValue.textContent = hdg
			this.lastHeading = hdg
		}
	}

	destroy(): void {
		this.root.remove()
	}
}
