/**
 * Configuration validation tests
 * These tests ensure project configuration consistency and prevent common issues
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Project Configuration', () => {
	describe('package.json consistency', () => {
		const packageJsonPath = join(__dirname, '..', 'package.json')
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

		it('should use pnpm consistently in all scripts (not npm or yarn)', () => {
			const scripts = packageJson.scripts || {}
			const inconsistentScripts: string[] = []

			for (const [name, command] of Object.entries(scripts)) {
				const cmd = command as string
				// Check for standalone "npm run" or "yarn run" (not "pnpm run")
				// Use word boundary or start of string to avoid matching "pnpm" which contains "npm"
				if (/(?:^|[^p])npm\s+run/.test(cmd) || /yarn\s+run/.test(cmd)) {
					inconsistentScripts.push(`${name}: ${cmd}`)
				}
			}

			expect(
				inconsistentScripts,
				`Found scripts using npm/yarn instead of pnpm:\n${inconsistentScripts.join('\n')}`
			).toHaveLength(0)
		})

		it('should have vercel-build script using pnpm', () => {
			const vercelBuild = packageJson.scripts?.['vercel-build']
			if (vercelBuild) {
				// Check for standalone "npm run" (not "pnpm run")
				expect(vercelBuild).not.toMatch(/(?:^|[^p])npm\s+run/)
				expect(vercelBuild).not.toMatch(/yarn\s+run/)
				expect(vercelBuild).toContain('pnpm')
			}
		})

		it('should have prepare script using pnpm', () => {
			const prepare = packageJson.scripts?.prepare
			if (prepare) {
				// Check for standalone "npm run" (not "pnpm run")
				expect(prepare).not.toMatch(/(?:^|[^p])npm\s+run/)
				expect(prepare).not.toMatch(/yarn\s+run/)
				expect(prepare).toContain('pnpm')
			}
		})
	})

	describe('vercel.json consistency', () => {
		it('should use pnpm in vercel.json commands', () => {
			const vercelJsonPath = join(__dirname, '..', 'vercel.json')
			let vercelJson: Record<string, unknown>

			try {
				vercelJson = JSON.parse(readFileSync(vercelJsonPath, 'utf-8'))
			} catch {
				// vercel.json might not exist in all projects
				return
			}

			const buildCommand = vercelJson.buildCommand as string | undefined
			const installCommand = vercelJson.installCommand as string | undefined

			if (buildCommand) {
				expect(buildCommand).not.toContain('npm run')
				expect(buildCommand).not.toContain('yarn run')
			}

			if (installCommand) {
				expect(installCommand).toContain('pnpm')
			}
		})
	})
})
