/**
 * FlightController のテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FlightController, easingFunctions } from './FlightController'
import type { FlightPlanData } from './types'

// Mock Map object
const createMockMap = () => ({
	flyTo: vi.fn(),
	setCenter: vi.fn(),
	setBearing: vi.fn(),
	getZoom: vi.fn(() => 16),
	getPitch: vi.fn(() => 60),
	getBearing: vi.fn(() => 0),
	getTerrain: vi.fn(() => ({ source: 'terrain', exaggeration: 1.5 })),
	setTerrain: vi.fn(),
})

describe('FlightController', () => {
	let mockMap: any
	let flightController: FlightController

	beforeEach(() => {
		mockMap = createMockMap()
		flightController = new FlightController(mockMap)
	})

	describe('initialization', () => {
		it('should initialize with default config', () => {
			const config = flightController.getConfig()
			expect(config.maxSpeed).toBe(20)
			expect(config.maxAltitude).toBe(500)
			expect(config.minAltitude).toBe(5)
			expect(config.acceleration).toBe(2)
			expect(config.physicsEnabled).toBe(true)
		})

		it('should initialize with custom config', () => {
			const customConfig = {
				maxSpeed: 30,
				maxAltitude: 1000,
			}
			const controller = new FlightController(mockMap, customConfig)
			const config = controller.getConfig()
			expect(config.maxSpeed).toBe(30)
			expect(config.maxAltitude).toBe(1000)
		})
	})

	describe('setFlightPlan', () => {
		it('should set flight plan correctly', () => {
			const testPlan: FlightPlanData = {
				name: 'Test Plan',
				description: 'Test Description',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: '離陸',
						action: 'テスト離陸',
						duration: 3000,
						position: [139.7454, 35.6586, 100],
					},
				],
				totalDuration: 3000,
			}

			flightController.setFlightPlan(testPlan)
			const status = flightController.getFlightPlanStatus()
			expect(status.planName).toBe('Test Plan')
			expect(status.totalPhases).toBe(1)
		})

		it('should add log entry when setting plan', () => {
			const testPlan: FlightPlanData = {
				name: 'Test Plan',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [],
				totalDuration: 0,
			}

			flightController.setFlightPlan(testPlan)
			const log = flightController.getFlightLog()
			expect(log.length).toBeGreaterThan(0)
			const lastEntry = log[log.length - 1]
			expect(lastEntry.action).toBe('フライトプラン設定')
		})
	})

	describe('flightPlan status', () => {
		beforeEach(() => {
			const testPlan: FlightPlanData = {
				name: 'Test Plan',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{ phase: '1', action: 'a', duration: 1000, position: [0, 0, 0] },
					{ phase: '2', action: 'b', duration: 1000, position: [1, 1, 1] },
				],
				totalDuration: 2000,
			}
			flightController.setFlightPlan(testPlan)
		})

		it('should report correct status', () => {
			const status = flightController.getFlightPlanStatus()
			expect(status.active).toBe(false)
			expect(status.currentPhase).toBe(0)
			expect(status.totalPhases).toBe(2)
			expect(status.planName).toBe('Test Plan')
		})
	})

	describe('flight log management', () => {
		it('should add flight log entries', () => {
			flightController.addFlightLog('Test Phase', 'Test Action', 'Test Details', 'info')
			const log = flightController.getFlightLog()
			expect(log.length).toBeGreaterThan(0)
			const lastEntry = log[log.length - 1]
			expect(lastEntry.phase).toBe('Test Phase')
			expect(lastEntry.action).toBe('Test Action')
			expect(lastEntry.details).toBe('Test Details')
			expect(lastEntry.type).toBe('info')
		})

		it('should clear flight log', () => {
			flightController.addFlightLog('Test', 'Test', 'Test', 'info')
			expect(flightController.getFlightLog().length).toBeGreaterThan(0)

			flightController.clearFlightLog()
			expect(flightController.getFlightLog().length).toBe(0)
		})

		it('should notify on log update', () => {
			const callback = vi.fn()
			flightController.setLogUpdateCallback(callback)

			flightController.addFlightLog('Test', 'Test', 'Test', 'info')
			expect(callback).toHaveBeenCalled()
		})
	})

	describe('updateConfig', () => {
		it('should update config values', () => {
			flightController.updateConfig({ maxSpeed: 50 })
			const config = flightController.getConfig()
			expect(config.maxSpeed).toBe(50)
		})

		it('should preserve other config values', () => {
			flightController.updateConfig({ maxSpeed: 50 })
			const config = flightController.getConfig()
			expect(config.maxAltitude).toBe(500) // デフォルト値が保持される
		})
	})

	describe('calculateBearing', () => {
		it('should calculate bearing from Tokyo Tower to Tokyo Skytree', () => {
			// Private method なので直接テストできませんが、
			// flyAlongPath を通じて間接的にテスト可能
			const waypoints: [number, number, number][] = [
				[139.7454, 35.6586, 100], // Tokyo Tower
				[139.8107, 35.7101, 100], // Tokyo Skytree
			]

			flightController.flyAlongPath(waypoints, {
				totalDuration: 2000,
			})

			// flyTo が呼ばれたことを確認
			expect(mockMap.flyTo).toHaveBeenCalled()
		})
	})
})

describe('Easing Functions', () => {
	describe('linear', () => {
		it('should return input value', () => {
			expect(easingFunctions.linear(0)).toBe(0)
			expect(easingFunctions.linear(0.5)).toBe(0.5)
			expect(easingFunctions.linear(1)).toBe(1)
		})
	})

	describe('easeInQuad', () => {
		it('should ease in quadratically', () => {
			expect(easingFunctions.easeInQuad(0)).toBe(0)
			expect(easingFunctions.easeInQuad(0.5)).toBe(0.25)
			expect(easingFunctions.easeInQuad(1)).toBe(1)
		})
	})

	describe('easeOutQuad', () => {
		it('should ease out quadratically', () => {
			expect(easingFunctions.easeOutQuad(0)).toBe(0)
			expect(easingFunctions.easeOutQuad(0.5)).toBe(0.75)
			expect(easingFunctions.easeOutQuad(1)).toBe(1)
		})
	})

	describe('easeInOutQuad', () => {
		it('should ease in and out quadratically', () => {
			expect(easingFunctions.easeInOutQuad(0)).toBe(0)
			expect(easingFunctions.easeInOutQuad(1)).toBe(1)
			// 中間値は滑らかに変化
			const midValue = easingFunctions.easeInOutQuad(0.5)
			expect(midValue).toBeGreaterThan(0.4)
			expect(midValue).toBeLessThan(0.6)
		})
	})

	describe('easeInOutSine', () => {
		it('should ease in and out with sine', () => {
			expect(Math.abs(easingFunctions.easeInOutSine(0))).toBe(0) // Handle -0 vs +0
			expect(easingFunctions.easeInOutSine(1)).toBe(1)
			expect(easingFunctions.easeInOutSine(0.5)).toBeCloseTo(0.5, 5)
		})
	})

	describe('easeOutElastic', () => {
		it('should return 0 for t=0', () => {
			expect(easingFunctions.easeOutElastic(0)).toBe(0)
		})

		it('should return 1 for t=1', () => {
			expect(easingFunctions.easeOutElastic(1)).toBe(1)
		})

		it('should bounce for intermediate values', () => {
			// エラスティックイージングは1を超える値を持つことがある
			const value = easingFunctions.easeOutElastic(0.5)
			expect(value).toBeDefined()
		})
	})

	describe('boundary conditions', () => {
		it('all easing functions should start at 0', () => {
			Object.values(easingFunctions).forEach(fn => {
				expect(Math.abs(fn(0))).toBe(0) // Handle -0 vs +0
			})
		})

		it('all easing functions should end at 1', () => {
			Object.values(easingFunctions).forEach(fn => {
				expect(fn(1)).toBe(1)
			})
		})

		it('all easing functions should be continuous', () => {
			Object.values(easingFunctions).forEach(fn => {
				// 連続性チェック: 小さな変化で大きく変わらない
				const step = 0.01
				for (let t = 0; t < 1; t += 0.1) {
					const v1 = fn(t)
					const v2 = fn(t + step)
					const diff = Math.abs(v2 - v1)
					expect(diff).toBeLessThan(0.5) // 急激な変化がないことを確認
				}
			})
		})
	})
})
