#!/bin/bash
# SessionStart hook for maplibre-gl-gsi-terrain
# This script runs when a new Claude Code session starts

set -e

echo "🚀 Starting maplibre-gl-gsi-terrain session..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
else
  echo "✅ Dependencies already installed"
fi

# Display project information
echo ""
echo "📍 Project: maplibre-gl-gsi-terrain"
echo "🌏 MapLibre GL JS terrain control for GSI DEM"
echo ""
echo "Available commands:"
echo "  /test         - Run unit tests"
echo "  /build        - Build library"
echo "  /lint         - Run linting checks"
echo "  /fix          - Auto-fix formatting and linting"
echo "  /type-check   - Run TypeScript type checking"
echo "  /ci-check     - Run all CI checks"
echo "  /security-audit - Run security audit on dependencies"
echo "  /status       - Show project status and health"
echo ""
echo "Ready to code! 🎉"
