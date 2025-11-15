import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './tests/e2e',
	/* 並列実行の最大ワーカー数 */
	fullyParallel: true,
	/* CI環境でのみfail fast */
	forbidOnly: !!process.env.CI,
	/* リトライ回数 */
	retries: process.env.CI ? 2 : 0,
	/* 並列ワーカー数 */
	workers: process.env.CI ? 1 : undefined,
	/* レポーター */
	reporter: 'html',
	/* 共通設定 */
	use: {
		/* ベースURL */
		baseURL: 'http://localhost:5173',
		/* スクリーンショット */
		screenshot: 'only-on-failure',
		/* ビデオ */
		video: 'retain-on-failure',
		/* トレース */
		trace: 'on-first-retry',
	},

	/* プロジェクト設定（ブラウザ） */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},

		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},

		/* モバイルビューポート */
		// {
		//   name: 'Mobile Chrome',
		//   use: { ...devices['Pixel 5'] },
		// },
		// {
		//   name: 'Mobile Safari',
		//   use: { ...devices['iPhone 12'] },
		// },
	],

	/* 開発サーバー */
	webServer: {
		command: 'pnpm dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120 * 1000,
	},
})
