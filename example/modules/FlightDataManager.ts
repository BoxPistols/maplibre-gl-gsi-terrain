/**
 * フライトデータ管理モジュール
 * フライトプランのインポート/エクスポート、検証、変換機能
 */

import type { FlightPlanData, FlightPlanPhase } from './types'

export class FlightDataManager {
	/**
	 * フライトプランをJSONファイルとしてエクスポート
	 */
	static exportToJSON(plan: FlightPlanData): void {
		const jsonContent = JSON.stringify(plan, null, 2)
		const blob = new Blob([jsonContent], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${plan.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	/**
	 * フライトプランをCSVファイルとしてエクスポート
	 */
	static exportToCSV(plan: FlightPlanData): void {
		const headers = [
			'phase',
			'action',
			'duration_ms',
			'longitude',
			'latitude',
			'altitude_m',
			'pitch_deg',
			'bearing_deg',
			'zoom',
		]

		const rows = plan.phases.map(phase => [
			phase.phase,
			phase.action,
			phase.duration.toString(),
			phase.position[0].toString(),
			phase.position[1].toString(),
			phase.position[2].toString(),
			(phase.pitch ?? 60).toString(),
			(phase.bearing ?? 0).toString(),
			(phase.zoom ?? 17).toString(),
		])

		const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${plan.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	/**
	 * フライトプランをGPX形式でエクスポート（GPS互換）
	 */
	static exportToGPX(plan: FlightPlanData): void {
		const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MapLibre GSI Flight Simulator"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${this.escapeXml(plan.name)}</name>
    <desc>${this.escapeXml(plan.description)}</desc>
    <time>${plan.created}</time>
  </metadata>
  <trk>
    <name>${this.escapeXml(plan.name)}</name>
    <trkseg>
${plan.phases
	.map(
		phase => `      <trkpt lat="${phase.position[1]}" lon="${phase.position[0]}">
        <ele>${phase.position[2]}</ele>
        <name>${this.escapeXml(phase.phase)}</name>
        <desc>${this.escapeXml(phase.action)}</desc>
      </trkpt>`
	)
	.join('\n')}
    </trkseg>
  </trk>
</gpx>`

		const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${plan.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.gpx`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	/**
	 * JSONファイルからフライトプランをインポート
	 */
	static async importFromJSON(): Promise<FlightPlanData> {
		return new Promise((resolve, reject) => {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.json'
			input.onchange = e => {
				const file = (e.target as HTMLInputElement).files?.[0]
				if (file) {
					const reader = new FileReader()
					reader.onload = e => {
						try {
							const planData: FlightPlanData = JSON.parse(e.target?.result as string)
							const validatedPlan = this.validateFlightPlan(planData)
							resolve(validatedPlan)
						} catch (error) {
							reject(new Error('無効なフライトプランファイルです'))
						}
					}
					reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
					reader.readAsText(file)
				} else {
					reject(new Error('ファイルが選択されていません'))
				}
			}
			input.click()
		})
	}

	/**
	 * CSVファイルからフライトプランをインポート
	 */
	static async importFromCSV(): Promise<FlightPlanData> {
		return new Promise((resolve, reject) => {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.csv'
			input.onchange = e => {
				const file = (e.target as HTMLInputElement).files?.[0]
				if (file) {
					const reader = new FileReader()
					reader.onload = e => {
						try {
							const csvContent = e.target?.result as string
							const planData = this.parseCSV(csvContent, file.name)
							const validatedPlan = this.validateFlightPlan(planData)
							resolve(validatedPlan)
						} catch (error) {
							reject(new Error('無効なCSVファイルです'))
						}
					}
					reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
					reader.readAsText(file)
				} else {
					reject(new Error('ファイルが選択されていません'))
				}
			}
			input.click()
		})
	}

	/**
	 * フライトプランをバリデーション
	 */
	static validateFlightPlan(plan: FlightPlanData): FlightPlanData {
		if (!plan.name || typeof plan.name !== 'string') {
			throw new Error('フライトプラン名が無効です')
		}

		if (!plan.phases || !Array.isArray(plan.phases)) {
			throw new Error('フライトフェーズが無効です')
		}

		if (plan.phases.length === 0) {
			throw new Error('フライトフェーズが空です')
		}

		// 各フェーズをバリデーション
		plan.phases.forEach((phase, index) => {
			if (!phase.phase || !phase.action) {
				throw new Error(`フェーズ${index + 1}の名前またはアクションが無効です`)
			}

			if (!phase.position || phase.position.length !== 3) {
				throw new Error(`フェーズ${index + 1}の位置座標が無効です`)
			}

			if (typeof phase.duration !== 'number' || phase.duration <= 0) {
				throw new Error(`フェーズ${index + 1}の継続時間が無効です`)
			}

			// 経度の範囲チェック (-180 ~ 180)
			if (phase.position[0] < -180 || phase.position[0] > 180) {
				throw new Error(`フェーズ${index + 1}の経度が範囲外です`)
			}

			// 緯度の範囲チェック (-90 ~ 90)
			if (phase.position[1] < -90 || phase.position[1] > 90) {
				throw new Error(`フェーズ${index + 1}の緯度が範囲外です`)
			}

			// 高度の範囲チェック (0 ~ 10000m)
			if (phase.position[2] < 0 || phase.position[2] > 10000) {
				throw new Error(`フェーズ${index + 1}の高度が範囲外です`)
			}
		})

		// デフォルト値を設定
		return {
			name: plan.name,
			description: plan.description || '',
			created: plan.created || new Date().toISOString(),
			phases: plan.phases,
			totalDuration: plan.totalDuration || plan.phases.reduce((sum, p) => sum + p.duration, 0),
		}
	}

	/**
	 * CSV文字列をパース
	 */
	private static parseCSV(csvContent: string, fileName: string): FlightPlanData {
		const lines = csvContent.trim().split('\n')
		if (lines.length < 2) {
			throw new Error('CSVファイルが空です')
		}

		const headers = lines[0].split(',').map(h => h.trim())
		const phases: FlightPlanPhase[] = []

		for (let i = 1; i < lines.length; i++) {
			const values = lines[i].split(',').map(v => v.trim())

			if (values.length < headers.length) {
				continue // 空行をスキップ
			}

			const phase: FlightPlanPhase = {
				phase: values[0] || `フェーズ${i}`,
				action: values[1] || '',
				duration: parseInt(values[2]) || 3000,
				position: [parseFloat(values[3]), parseFloat(values[4]), parseFloat(values[5])],
				pitch: values[6] ? parseFloat(values[6]) : 60,
				bearing: values[7] ? parseFloat(values[7]) : 0,
				zoom: values[8] ? parseFloat(values[8]) : 17,
			}

			phases.push(phase)
		}

		return {
			name: fileName.replace(/\.csv$/, ''),
			description: 'CSVからインポート',
			created: new Date().toISOString(),
			phases,
			totalDuration: phases.reduce((sum, p) => sum + p.duration, 0),
		}
	}

	/**
	 * XMLエスケープ
	 */
	private static escapeXml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;')
	}

	/**
	 * フライトプランの統計情報を計算
	 */
	static calculateStatistics(plan: FlightPlanData): {
		totalDistance: number
		totalDuration: number
		averageSpeed: number
		maxAltitude: number
		minAltitude: number
		phaseCount: number
	} {
		let totalDistance = 0
		let maxAltitude = 0
		let minAltitude = Infinity

		// すべてのフェーズの高度を収集
		plan.phases.forEach(phase => {
			maxAltitude = Math.max(maxAltitude, phase.position[2])
			minAltitude = Math.min(minAltitude, phase.position[2])
		})

		// フェーズ間の距離を計算
		for (let i = 0; i < plan.phases.length - 1; i++) {
			const current = plan.phases[i].position
			const next = plan.phases[i + 1].position

			// 2点間の距離を計算（Haversine式）
			const distance = this.calculateDistance(
				current[1],
				current[0],
				next[1],
				next[0],
				current[2],
				next[2]
			)
			totalDistance += distance
		}

		const totalDuration = plan.totalDuration / 1000 // 秒に変換
		const averageSpeed = totalDuration > 0 ? totalDistance / totalDuration : 0

		return {
			totalDistance,
			totalDuration,
			averageSpeed,
			maxAltitude,
			minAltitude: minAltitude === Infinity ? 0 : minAltitude,
			phaseCount: plan.phases.length,
		}
	}

	/**
	 * 2点間の3D距離を計算（Haversine式 + 高度差）
	 */
	private static calculateDistance(
		lat1: number,
		lon1: number,
		lat2: number,
		lon2: number,
		alt1: number,
		alt2: number
	): number {
		const R = 6371000 // 地球の半径（メートル）
		const φ1 = (lat1 * Math.PI) / 180
		const φ2 = (lat2 * Math.PI) / 180
		const Δφ = ((lat2 - lat1) * Math.PI) / 180
		const Δλ = ((lon2 - lon1) * Math.PI) / 180

		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

		const horizontalDistance = R * c
		const verticalDistance = alt2 - alt1

		// 3D距離（ピタゴラスの定理）
		return Math.sqrt(horizontalDistance * horizontalDistance + verticalDistance * verticalDistance)
	}
}
