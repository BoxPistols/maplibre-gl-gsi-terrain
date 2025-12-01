#!/usr/bin/env node

/**
 * This script checks that package.json does not contain npm or yarn commands.
 * This is a safeguard against accidentally introducing npm/yarn dependencies
 * in a pnpm-only project.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const packageJsonPath = join(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const errors = []

// Check that packageManager field exists and specifies pnpm
if (!packageJson.packageManager) {
	errors.push('Missing "packageManager" field in package.json')
} else if (!packageJson.packageManager.startsWith('pnpm@')) {
	errors.push(`Invalid packageManager: "${packageJson.packageManager}" (must start with "pnpm@")`)
}

// Check scripts for npm/yarn usage
if (packageJson.scripts) {
	for (const [name, script] of Object.entries(packageJson.scripts)) {
		// Check for npm run, npm install, etc.
		if (/\bnpm\s+(run|install|ci|exec|start|test|build)\b/i.test(script)) {
			errors.push(`Script "${name}" uses npm: "${script}"`)
		}
		// Check for yarn commands
		if (/\byarn\s+(run|install|add|exec|start|test|build)?\b/i.test(script)) {
			errors.push(`Script "${name}" uses yarn: "${script}"`)
		}
	}
}

if (errors.length > 0) {
	console.error('\n❌ Package manager check failed!\n')
	console.error('This project uses pnpm exclusively. The following issues were found:\n')
	errors.forEach(error => console.error(`  • ${error}`))
	console.error('\nPlease fix these issues and try again.\n')
	process.exit(1)
}

console.log('✅ Package manager check passed')
