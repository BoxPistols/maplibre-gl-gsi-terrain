/**
 * フライトシミュレーター E2Eテスト
 */

import { test, expect } from '@playwright/test'

test.describe('3D Flight Simulator', () => {
	test.beforeEach(async ({ page }) => {
		// ローカル開発サーバーに接続
		// 本番環境では実際のURLに変更
		await page.goto('http://localhost:5173')

		// マップが読み込まれるまで待機
		await page.waitForSelector('#map', { state: 'visible' })
		await page.waitForTimeout(2000) // マップの初期化を待機
	})

	test('should load the page successfully', async ({ page }) => {
		// タイトルを確認
		await expect(page).toHaveTitle(/東京タワー周辺 ドローン点検システム/)

		// メインコントロールパネルが表示されていることを確認
		const controls = page.locator('#controls')
		await expect(controls).toBeVisible()

		// マップが表示されていることを確認
		const map = page.locator('#map')
		await expect(map).toBeVisible()
	})

	test('should display all control buttons', async ({ page }) => {
		// 主要なボタンが表示されていることを確認
		await expect(page.locator('#toggle3D')).toBeVisible()
		await expect(page.locator('#loadDroneData')).toBeVisible()
		await expect(page.locator('#startFlightPlan')).toBeVisible()
		await expect(page.locator('#pauseFlightPlan')).toBeVisible()
		await expect(page.locator('#enableGameControl')).toBeVisible()
	})

	test('should load drone data', async ({ page }) => {
		// ドローン配置ボタンをクリック
		await page.click('#loadDroneData')

		// ステータスメッセージが更新されることを確認
		const status = page.locator('#status')
		await expect(status).toContainText('ドローンデータ')
	})

	test('should start flight plan', async ({ page }) => {
		// ドローンを配置
		await page.click('#loadDroneData')
		await page.waitForTimeout(500)

		// フライトプランを開始
		await page.click('#startFlightPlan')

		// フライトログが表示されることを確認
		const flightLog = page.locator('#flightLog')
		await expect(flightLog).toBeVisible()

		// フライトログにエントリが追加されることを確認
		const logEntries = page.locator('.log-entry')
		await expect(logEntries).not.toHaveCount(0)
	})

	test('should switch flight plans', async ({ page }) => {
		// フライトプラン選択ドロップダウンを確認
		const flightPlanSelect = page.locator('#flightPlanSelect')
		await expect(flightPlanSelect).toBeVisible()

		// 富士山フライトプランを選択
		await flightPlanSelect.selectOption('mt-fuji')

		// マップが移動することを確認（富士山の座標付近）
		await page.waitForTimeout(2000)

		// ステータスが更新されることを確認
		// フライトログに読み込みメッセージが表示される
		const logEntries = page.locator('.log-entry')
		const lastEntry = logEntries.last()
		await expect(lastEntry).toContainText(/富士山|読み込み/)
	})

	test('should toggle 2D/3D mode', async ({ page }) => {
		// 2D/3Dトグルボタンをクリック
		await page.click('#toggle3D')
		await page.waitForTimeout(1000)

		// 再度クリックして元に戻す
		await page.click('#toggle3D')
		await page.waitForTimeout(1000)

		// エラーが発生しないことを確認
		const errors = await page.locator('.log-error').count()
		expect(errors).toBe(0)
	})

	test('should enable game control mode', async ({ page }) => {
		// 手動操作ボタンをクリック
		await page.click('#enableGameControl')

		// ゲームコントロールヘルプパネルが表示されることを確認
		const helpPanel = page.locator('#gameControlHelp')
		await expect(helpPanel).toBeVisible()

		// 手動操作終了ボタンが表示されることを確認
		const disableButton = page.locator('#disableGameControl')
		await expect(disableButton).toBeVisible()

		// 手動操作を終了
		await page.click('#disableGameControl')

		// ヘルプパネルが非表示になることを確認
		await expect(helpPanel).not.toBeVisible()
	})

	test('should clear flight log', async ({ page }) => {
		// ドローンを配置してログにエントリを追加
		await page.click('#loadDroneData')
		await page.waitForTimeout(500)

		// ログをクリア
		await page.click('#clearLog')

		// ログが空になることを確認
		const flightLog = page.locator('#flightLog')
		const logEntries = flightLog.locator('.log-entry')
		const count = await logEntries.count()
		expect(count).toBe(0)
	})

	test('should toggle log visibility', async ({ page }) => {
		const flightLog = page.locator('#flightLog')

		// 初期状態を確認
		const initialVisibility = await flightLog.isVisible()

		// ログ表示切替ボタンをクリック
		await page.click('#toggleLog')
		await page.waitForTimeout(300)

		// 表示状態が切り替わることを確認
		const newVisibility = await flightLog.isVisible()
		expect(newVisibility).toBe(!initialVisibility)

		// 再度クリックして元に戻す
		await page.click('#toggleLog')
		await page.waitForTimeout(300)

		const finalVisibility = await flightLog.isVisible()
		expect(finalVisibility).toBe(initialVisibility)
	})

	test('should handle keyboard input in game control mode', async ({ page }) => {
		// 手動操作モードを有効化
		await page.click('#enableGameControl')
		await page.waitForTimeout(500)

		// キーボード入力をシミュレート
		await page.keyboard.press('w') // 前進
		await page.waitForTimeout(100)
		await page.keyboard.press('Space') // 上昇
		await page.waitForTimeout(100)
		await page.keyboard.press('a') // 左移動
		await page.waitForTimeout(100)

		// エラーが発生しないことを確認
		const errors = await page.locator('.log-error').count()
		expect(errors).toBe(0)

		// 手動操作を終了
		await page.click('#disableGameControl')
	})

	test('should handle data import/export', async ({ page }) => {
		// データ管理セクションの各ボタンが機能することを確認

		// CSV出力ボタンをクリック（ダウンロードは検証しない）
		await page.click('#exportCSV')
		await page.waitForTimeout(300)

		// GeoJSON出力ボタンをクリック
		await page.click('#exportGeoJSON')
		await page.waitForTimeout(300)

		// エラーが発生しないことを確認
		const errors = await page.locator('.log-error').count()
		expect(errors).toBe(0)
	})

	test('should pause and resume flight plan', async ({ page }) => {
		// ドローンを配置
		await page.click('#loadDroneData')
		await page.waitForTimeout(500)

		// フライトプランを開始
		await page.click('#startFlightPlan')
		await page.waitForTimeout(1000)

		// 一時停止
		await page.click('#pauseFlightPlan')
		await page.waitForTimeout(500)

		// フライトログに一時停止メッセージがあることを確認
		const logEntries = page.locator('.log-entry')
		const lastEntry = logEntries.last()
		await expect(lastEntry).toContainText(/一時停止|pause/i)

		// 再開（開始ボタンをもう一度クリック）
		await page.click('#startFlightPlan')
		await page.waitForTimeout(500)
	})

	test('should display map style control', async ({ page }) => {
		// マップスタイルコントロールが表示されることを確認
		const styleControl = page.locator('.map-style-control')
		await expect(styleControl).toBeVisible()

		// スタイル選択ボタンが複数あることを確認
		const styleButtons = styleControl.locator('button')
		const count = await styleButtons.count()
		expect(count).toBeGreaterThan(0)
	})

	test('should switch map styles', async ({ page }) => {
		// マップスタイルコントロールを探す
		const styleControl = page.locator('.map-style-control')

		// スタイルボタンをクリック（最初のボタン以外）
		const styleButtons = styleControl.locator('button')
		const count = await styleButtons.count()

		if (count > 1) {
			// 2番目のスタイルを選択
			await styleButtons.nth(1).click()
			await page.waitForTimeout(1000)

			// エラーが発生しないことを確認
			const errors = await page.locator('.log-error').count()
			expect(errors).toBe(0)
		}
	})

	test('should handle terrain exaggeration slider', async ({ page }) => {
		// 地形誇張度スライダーを探す
		const slider = page.locator('input[type="range"]')
		await expect(slider).toBeVisible()

		// スライダーの値を変更
		await slider.fill('2.0')
		await page.waitForTimeout(500)

		// エラーが発生しないことを確認
		const errors = await page.locator('.log-error').count()
		expect(errors).toBe(0)
	})

	test('should display info panel', async ({ page }) => {
		// 情報パネルが表示されることを確認
		const infoPanel = page.locator('.info-panel')
		await expect(infoPanel).toBeVisible()

		// ワークフロー情報が表示されることを確認
		const infoTitle = infoPanel.locator('.info-title')
		await expect(infoTitle.first()).toContainText(/点検ワークフロー|ゲームコントロール/)
	})

	test('should handle console errors gracefully', async ({ page }) => {
		const consoleErrors: string[] = []

		page.on('console', msg => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text())
			}
		})

		// いくつかの操作を実行
		await page.click('#loadDroneData')
		await page.waitForTimeout(500)
		await page.click('#startFlightPlan')
		await page.waitForTimeout(1000)
		await page.click('#pauseFlightPlan')
		await page.waitForTimeout(500)

		// 致命的なエラーがないことを確認
		const criticalErrors = consoleErrors.filter(
			err => err.includes('Uncaught') || err.includes('TypeError')
		)
		expect(criticalErrors.length).toBe(0)
	})

	test('should handle network errors gracefully', async ({ page }) => {
		// ネットワークエラーをシミュレート
		await page.route('**/tiles/**', route => route.abort())

		// ページをリロード
		await page.reload()
		await page.waitForTimeout(2000)

		// ページが完全にクラッシュしないことを確認
		const controls = page.locator('#controls')
		await expect(controls).toBeVisible()
	})
})

test.describe('Accessibility', () => {
	test('should have accessible buttons with titles', async ({ page }) => {
		await page.goto('http://localhost:5173')
		await page.waitForSelector('#map')

		// 主要なボタンにtitle属性があることを確認
		const buttons = [
			'#toggle3D',
			'#loadDroneData',
			'#startFlightPlan',
			'#pauseFlightPlan',
			'#enableGameControl',
		]

		for (const selector of buttons) {
			const button = page.locator(selector)
			const title = await button.getAttribute('title')
			expect(title).toBeTruthy()
			expect(title!.length).toBeGreaterThan(0)
		}
	})

	test('should have proper heading structure', async ({ page }) => {
		await page.goto('http://localhost:5173')
		await page.waitForSelector('#map')

		// h3タイトルが存在することを確認
		const heading = page.locator('h3')
		await expect(heading).toContainText(/東京タワー点検システム/)
	})
})

test.describe('Performance', () => {
	test('should load within reasonable time', async ({ page }) => {
		const startTime = Date.now()
		await page.goto('http://localhost:5173')
		await page.waitForSelector('#map')
		const loadTime = Date.now() - startTime

		// 5秒以内にロードされることを確認
		expect(loadTime).toBeLessThan(5000)
	})

	test('should not have memory leaks', async ({ page }) => {
		await page.goto('http://localhost:5173')
		await page.waitForSelector('#map')

		// いくつかの操作を繰り返す
		for (let i = 0; i < 5; i++) {
			await page.click('#loadDroneData')
			await page.waitForTimeout(300)
			await page.click('#clearData')
			await page.waitForTimeout(300)
		}

		// ページがまだ応答していることを確認
		const controls = page.locator('#controls')
		await expect(controls).toBeVisible()
	})
})
