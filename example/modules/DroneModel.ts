/**
 * 3Dドローンモデルモジュール
 * ポリゴンベースの3Dドローンを描画
 */

import type { Map, CustomLayerInterface } from 'maplibre-gl'
import type { DronePhysicsState } from './types'

export class DroneModel {
	private map: Map
	private physicsState: DronePhysicsState
	private modelMatrix: number[] = []
	private trail: [number, number, number][] = []
	private maxTrailLength = 100

	constructor(map: Map, initialPosition: [number, number, number]) {
		this.map = map
		this.physicsState = {
			position: initialPosition,
			velocity: [0, 0, 0],
			acceleration: [0, 0, 0],
			rotation: [0, 0, 0], // roll, pitch, yaw
			angularVelocity: [0, 0, 0],
		}
	}

	/**
	 * 3Dドローンレイヤーを作成（WebGL Custom Layer）
	 */
	createCustomLayer(): CustomLayerInterface {
		const droneModel = this

		return {
			id: 'drone-3d-model',
			type: 'custom',
			renderingMode: '3d',

			onAdd(map: Map, gl: WebGLRenderingContext) {
				// WebGL初期化
				// シェーダープログラムの作成
				const vertexShaderSource = `
					attribute vec3 aPosition;
					attribute vec3 aNormal;
					attribute vec3 aColor;

					uniform mat4 uModelMatrix;
					uniform mat4 uViewMatrix;
					uniform mat4 uProjectionMatrix;

					varying vec3 vColor;
					varying vec3 vNormal;

					void main() {
						gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
						vColor = aColor;
						vNormal = aNormal;
					}
				`

				const fragmentShaderSource = `
					precision mediump float;

					varying vec3 vColor;
					varying vec3 vNormal;

					void main() {
						// 簡単なライティング
						vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
						float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
						vec3 ambient = vColor * 0.3;
						vec3 finalColor = ambient + vColor * diffuse * 0.7;
						gl_FragColor = vec4(finalColor, 1.0);
					}
				`

				// シェーダーコンパイル（簡略版）
				// 実際の実装では、シェーダーコンパイルとリンクを行う
			},

			render(gl: WebGLRenderingContext, matrix: number[]) {
				// ドローンモデルの描画
				// 実際の実装では、バッファを使用してドローンの形状を描画
			},
		}
	}

	/**
	 * シンプルな3Dドローンジオメトリを生成
	 */
	static generateDroneGeometry(): {
		vertices: number[]
		normals: number[]
		colors: number[]
		indices: number[]
	} {
		const vertices: number[] = []
		const normals: number[] = []
		const colors: number[] = []
		const indices: number[] = []

		// ドローンのボディ（立方体）
		const bodySize = 1.0
		const bodyVertices = [
			// 前面
			[-bodySize, -bodySize, bodySize],
			[bodySize, -bodySize, bodySize],
			[bodySize, bodySize, bodySize],
			[-bodySize, bodySize, bodySize],
			// 背面
			[-bodySize, -bodySize, -bodySize],
			[bodySize, -bodySize, -bodySize],
			[bodySize, bodySize, -bodySize],
			[-bodySize, bodySize, -bodySize],
		]

		// プロペラアーム（4本）
		const armLength = 3.0
		const armThickness = 0.3

		// 各アームの位置
		const armPositions = [
			[armLength, 0, 0], // 右
			[-armLength, 0, 0], // 左
			[0, armLength, 0], // 前
			[0, -armLength, 0], // 後
		]

		// プロペラ（円盤）
		const propellerRadius = 1.5
		const propellerSegments = 8

		for (let i = 0; i < armPositions.length; i++) {
			const [x, y, z] = armPositions[i]

			// プロペラの頂点を生成
			for (let j = 0; j < propellerSegments; j++) {
				const angle = (j / propellerSegments) * Math.PI * 2
				const px = x + Math.cos(angle) * propellerRadius
				const py = y + Math.sin(angle) * propellerRadius
				const pz = z + armThickness

				vertices.push(px, py, pz)
				normals.push(0, 0, 1)
				colors.push(0.2, 0.2, 0.2) // 暗いグレー
			}
		}

		// ボディの色（赤）
		for (let i = 0; i < bodyVertices.length; i++) {
			const [x, y, z] = bodyVertices[i]
			vertices.push(x, y, z)
			normals.push(0, 0, 1)
			colors.push(1.0, 0.2, 0.2) // 赤
		}

		// インデックス生成（三角形）
		// 実際の実装では、適切なインデックスを生成

		return { vertices, normals, colors, indices }
	}

	/**
	 * ドローンの位置を更新
	 */
	updatePosition(position: [number, number, number]): void {
		this.physicsState.position = position

		// トレイルに追加
		this.trail.push([...position])
		if (this.trail.length > this.maxTrailLength) {
			this.trail.shift()
		}
	}

	/**
	 * ドローンの回転を更新
	 */
	updateRotation(rotation: [number, number, number]): void {
		this.physicsState.rotation = rotation
	}

	/**
	 * 物理状態を更新（物理演算）
	 */
	updatePhysics(deltaTime: number): void {
		// 速度を更新（加速度を積分）
		this.physicsState.velocity[0] += this.physicsState.acceleration[0] * deltaTime
		this.physicsState.velocity[1] += this.physicsState.acceleration[1] * deltaTime
		this.physicsState.velocity[2] += this.physicsState.acceleration[2] * deltaTime

		// 位置を更新（速度を積分）
		this.physicsState.position[0] += this.physicsState.velocity[0] * deltaTime
		this.physicsState.position[1] += this.physicsState.velocity[1] * deltaTime
		this.physicsState.position[2] += this.physicsState.velocity[2] * deltaTime

		// 空気抵抗をシミュレート（減速）
		const dragCoefficient = 0.95
		this.physicsState.velocity[0] *= dragCoefficient
		this.physicsState.velocity[1] *= dragCoefficient
		this.physicsState.velocity[2] *= dragCoefficient

		// 回転を更新
		this.physicsState.rotation[0] += this.physicsState.angularVelocity[0] * deltaTime
		this.physicsState.rotation[1] += this.physicsState.angularVelocity[1] * deltaTime
		this.physicsState.rotation[2] += this.physicsState.angularVelocity[2] * deltaTime

		// 角速度の減衰
		this.physicsState.angularVelocity[0] *= dragCoefficient
		this.physicsState.angularVelocity[1] *= dragCoefficient
		this.physicsState.angularVelocity[2] *= dragCoefficient
	}

	/**
	 * 力を加える
	 */
	applyForce(force: [number, number, number]): void {
		// F = ma, a = F/m (質量を1と仮定)
		this.physicsState.acceleration[0] = force[0]
		this.physicsState.acceleration[1] = force[1]
		this.physicsState.acceleration[2] = force[2]
	}

	/**
	 * トルク（回転力）を加える
	 */
	applyTorque(torque: [number, number, number]): void {
		this.physicsState.angularVelocity[0] += torque[0]
		this.physicsState.angularVelocity[1] += torque[1]
		this.physicsState.angularVelocity[2] += torque[2]
	}

	/**
	 * ドローンの現在位置を取得
	 */
	getPosition(): [number, number, number] {
		return [...this.physicsState.position] as [number, number, number]
	}

	/**
	 * 現在の物理状態を取得
	 */
	getPhysicsState(): DronePhysicsState {
		return { ...this.physicsState }
	}

	/**
	 * トレイルを取得
	 */
	getTrail(): [number, number, number][] {
		return [...this.trail]
	}

	/**
	 * トレイルをクリア
	 */
	clearTrail(): void {
		this.trail = []
	}

	/**
	 * GeoJSONとしてドローンの位置を返す
	 */
	toGeoJSON(): GeoJSON.Feature {
		return {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [
					this.physicsState.position[0],
					this.physicsState.position[1],
					this.physicsState.position[2],
				],
			},
			properties: {
				type: 'drone',
				rotation: this.physicsState.rotation,
				velocity: this.physicsState.velocity,
			},
		}
	}

	/**
	 * トレイルをGeoJSONとして返す
	 */
	trailToGeoJSON(): GeoJSON.Feature {
		return {
			type: 'Feature',
			geometry: {
				type: 'LineString',
				coordinates: this.trail.map(pos => [pos[0], pos[1], pos[2]]),
			},
			properties: {
				type: 'drone-trail',
			},
		}
	}
}
