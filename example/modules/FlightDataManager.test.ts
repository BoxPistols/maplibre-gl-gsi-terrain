/**
 * FlightDataManager のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { FlightDataManager } from './FlightDataManager'
import type { FlightPlanData, FlightPlanPhase } from './types'

describe('FlightDataManager', () => {
	let testFlightPlan: FlightPlanData

	beforeEach(() => {
		testFlightPlan = {
			name: 'Test Flight Plan',
			description: 'Test Description',
			created: '2024-01-15T10:00:00Z',
			phases: [
				{
					phase: '離陸',
					action: 'テスト離陸',
					duration: 3000,
					position: [139.7454, 35.6586, 100],
					pitch: 60,
					bearing: 0,
					zoom: 16,
				},
				{
					phase: '移動',
					action: 'テスト移動',
					duration: 4000,
					position: [139.747, 35.658, 120],
					pitch: 65,
					bearing: 45,
					zoom: 16,
				},
				{
					phase: '着陸',
					action: 'テスト着陸',
					duration: 3000,
					position: [139.7454, 35.6586, 50],
					pitch: 45,
					bearing: 0,
					zoom: 16,
				},
			],
			totalDuration: 10000,
		}
	})

	describe('validateFlightPlan', () => {
		it('should validate a correct flight plan', () => {
			const validated = FlightDataManager.validateFlightPlan(testFlightPlan)
			expect(validated).toBeDefined()
			expect(validated.name).toBe('Test Flight Plan')
			expect(validated.phases.length).toBe(3)
		})

		it('should throw error for missing name', () => {
			const invalidPlan = { ...testFlightPlan, name: '' }
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan as FlightPlanData)).toThrow(
				'フライトプラン名が無効です'
			)
		})

		it('should throw error for missing phases', () => {
			const invalidPlan = { ...testFlightPlan, phases: [] }
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan)).toThrow(
				'フライトフェーズが空です'
			)
		})

		it('should throw error for invalid longitude', () => {
			const invalidPlan = { ...testFlightPlan }
			invalidPlan.phases[0].position = [200, 35.6586, 100] // 経度が範囲外
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan)).toThrow(
				'フェーズ1の経度が範囲外です'
			)
		})

		it('should throw error for invalid latitude', () => {
			const invalidPlan = { ...testFlightPlan }
			invalidPlan.phases[0].position = [139.7454, 100, 100] // 緯度が範囲外
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan)).toThrow(
				'フェーズ1の緯度が範囲外です'
			)
		})

		it('should throw error for invalid altitude', () => {
			const invalidPlan = { ...testFlightPlan }
			invalidPlan.phases[0].position = [139.7454, 35.6586, 15000] // 高度が範囲外
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan)).toThrow(
				'フェーズ1の高度が範囲外です'
			)
		})

		it('should throw error for invalid duration', () => {
			const invalidPlan = { ...testFlightPlan }
			invalidPlan.phases[0].duration = -1000 // 負の継続時間
			expect(() => FlightDataManager.validateFlightPlan(invalidPlan)).toThrow(
				'フェーズ1の継続時間が無効です'
			)
		})

		it('should set default values for optional fields', () => {
			const minimalPlan = {
				name: 'Minimal Plan',
				phases: [
					{
						phase: 'Test',
						action: 'Test Action',
						duration: 3000,
						position: [139.7454, 35.6586, 100] as [number, number, number],
					},
				],
			}
			const validated = FlightDataManager.validateFlightPlan(minimalPlan as FlightPlanData)
			expect(validated.description).toBe('')
			expect(validated.created).toBeDefined()
			expect(validated.totalDuration).toBe(3000)
		})
	})

	describe('calculateStatistics', () => {
		it('should calculate correct statistics', () => {
			const stats = FlightDataManager.calculateStatistics(testFlightPlan)

			expect(stats.phaseCount).toBe(3)
			expect(stats.totalDuration).toBe(10)
			expect(stats.totalDistance).toBeGreaterThan(0)
			expect(stats.averageSpeed).toBeGreaterThan(0)
			expect(stats.maxAltitude).toBe(120)
			expect(stats.minAltitude).toBe(50)
		})

		it('should handle single phase plan', () => {
			const singlePhasePlan: FlightPlanData = {
				name: 'Single Phase',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: 'Test',
						action: 'Test Action',
						duration: 3000,
						position: [139.7454, 35.6586, 100],
					},
				],
				totalDuration: 3000,
			}

			const stats = FlightDataManager.calculateStatistics(singlePhasePlan)

			expect(stats.phaseCount).toBe(1)
			expect(stats.totalDistance).toBe(0) // 1フェーズのみなので距離は0
			expect(stats.maxAltitude).toBe(100)
			expect(stats.minAltitude).toBe(100)
		})

		it('should calculate distance correctly', () => {
			const stats = FlightDataManager.calculateStatistics(testFlightPlan)

			// 東京タワー周辺の移動なので、距離は数百メートル程度
			expect(stats.totalDistance).toBeGreaterThan(100)
			expect(stats.totalDistance).toBeLessThan(10000)
		})

		it('should calculate average speed correctly', () => {
			const stats = FlightDataManager.calculateStatistics(testFlightPlan)

			// 平均速度は距離/時間
			const expectedSpeed = stats.totalDistance / stats.totalDuration
			expect(stats.averageSpeed).toBeCloseTo(expectedSpeed, 5)
		})

		it('should handle zero duration', () => {
			const zeroDurationPlan: FlightPlanData = {
				name: 'Zero Duration',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: 'Test',
						action: 'Test Action',
						duration: 0,
						position: [139.7454, 35.6586, 100],
					},
				],
				totalDuration: 0,
			}

			const stats = FlightDataManager.calculateStatistics(zeroDurationPlan)

			expect(stats.averageSpeed).toBe(0)
		})
	})

	describe('Distance calculation', () => {
		it('should calculate horizontal distance correctly', () => {
			// 東京タワーから東京スカイツリーまでの距離（約7.5km）
			const tokyoTower: FlightPlanData = {
				name: 'Distance Test',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: 'Start',
						action: 'Tokyo Tower',
						duration: 1000,
						position: [139.7454, 35.6586, 100],
					},
					{
						phase: 'End',
						action: 'Tokyo Skytree',
						duration: 1000,
						position: [139.8107, 35.7101, 100],
					},
				],
				totalDuration: 2000,
			}

			const stats = FlightDataManager.calculateStatistics(tokyoTower)

			// 約8.2km (Haversine formula with same altitude)
			expect(stats.totalDistance).toBeGreaterThan(8000)
			expect(stats.totalDistance).toBeLessThan(8500)
		})

		it('should calculate 3D distance correctly', () => {
			// 垂直方向の移動も含む
			const verticalPlan: FlightPlanData = {
				name: 'Vertical Test',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: 'Low',
						action: 'Low altitude',
						duration: 1000,
						position: [139.7454, 35.6586, 0],
					},
					{
						phase: 'High',
						action: 'High altitude',
						duration: 1000,
						position: [139.7454, 35.6586, 1000],
					},
				],
				totalDuration: 2000,
			}

			const stats = FlightDataManager.calculateStatistics(verticalPlan)

			// 垂直距離は1000m
			expect(stats.totalDistance).toBe(1000)
		})

		it('should calculate combined 3D distance correctly', () => {
			// 水平と垂直の両方を移動
			const combinedPlan: FlightPlanData = {
				name: 'Combined Test',
				description: '',
				created: '2024-01-15T10:00:00Z',
				phases: [
					{
						phase: 'Start',
						action: 'Start point',
						duration: 1000,
						position: [139.7454, 35.6586, 0],
					},
					{
						phase: 'End',
						action: 'End point',
						duration: 1000,
						position: [139.747, 35.658, 100],
					},
				],
				totalDuration: 2000,
			}

			const stats = FlightDataManager.calculateStatistics(combinedPlan)

			// 水平距離と垂直距離の合成
			expect(stats.totalDistance).toBeGreaterThan(100)
			expect(stats.totalDistance).toBeLessThan(500)
		})
	})
})
