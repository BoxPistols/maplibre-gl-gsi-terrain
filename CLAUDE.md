# Claude Code Guidelines for maplibre-gl-gsi-terrain

This document provides guidelines for AI agents (Claude Code, GitHub Copilot, etc.) working on this project.

## Package Manager

**CRITICAL: This project uses pnpm exclusively.**

- **ALWAYS** use `pnpm` commands, never `npm` or `yarn`
- In `package.json` scripts, use `pnpm run <script>`, not `npm run` or `yarn run`
- This applies to all scripts including `vercel-build`, `prepare`, and any other custom scripts

### Why this matters

The project is deployed on Vercel and uses pnpm. Using `npm run` in scripts will cause build failures:

```
Error: Command "vite build" exited with 127
sh: line 1: vite: command not found
```

### Correct examples

```json
{
  "scripts": {
    "vercel-build": "pnpm run build:example",
    "prepare": "pnpm run build",
    "build:example": "pnpm run generate:icons && vite build -c vite.config.example.ts"
  }
}
```

### Incorrect examples (DO NOT USE)

```json
{
  "scripts": {
    "vercel-build": "npm run build:example",
    "prepare": "npm run build"
  }
}
```

## iOS/Mobile Development

When modifying CSS for mobile views:

- **ALWAYS** consider iPhone Safe Area (home indicator, notch)
- Use `env(safe-area-inset-bottom)` for bottom padding on fixed/absolute positioned elements
- Use `env(safe-area-inset-top)` for top padding if needed
- The viewport meta tag must include `viewport-fit=cover`

### Example

```css
.footer {
  position: fixed;
  bottom: 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}
```

## Testing Requirements

Before committing changes:

1. Run `pnpm test:ci` - Unit tests
2. Run `pnpm type-check` - TypeScript validation
3. Run `pnpm lint` - ESLint checks
4. Run `pnpm build` - Build verification

Or use `pnpm ci:check` to run all checks at once.

## Project Structure

- `src/` - Library source code
- `example/` - Demo application
- `demo/` - Built demo output (for Vercel deployment)
- `dist/` - Built library output

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build library |
| `pnpm build:example` | Build demo application |
| `pnpm test:ci` | Run unit tests |
| `pnpm test:all` | Run all tests (unit, modules, e2e) |
| `pnpm lint` | Run linting |
| `pnpm fix` | Auto-fix formatting and linting |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm ci:check` | Run all CI checks |

## Configuration Files

- `vercel.json` - Vercel deployment configuration (uses pnpm)
- `package.json` - Project configuration (all scripts must use pnpm)
- `vite.config.ts` - Library build configuration
- `vite.config.example.ts` - Demo build configuration
