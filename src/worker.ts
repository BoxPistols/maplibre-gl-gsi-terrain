// インラインWebワーカーのコードを文字列で定義
export const workerCode = `
const vsSource = \`#version 300 es
    in vec4 a_position;
    out vec2 v_tex_coord;

    void main() {
        gl_Position = a_position;
        v_tex_coord = vec2(a_position.x * 0.5 + 0.5, a_position.y * -0.5 + 0.5);
    }
\`;

const fsSource = \`#version 300 es
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform sampler2D u_height_map;
    in vec2 v_tex_coord;
    out vec4 fragColor;

    void main() {
        vec4 color = texture(u_height_map, v_tex_coord);
        vec3 rgb = color.rgb * 255.0;

        // terrariumにおける高度0の色
        vec4 zero_elevation_color = vec4(128.0, 0.0, 0.0, 255.0) / 255.0;

        // 地理院標高タイルの無効値または完全に透明なピクセルの判定
        bool is_valid = (rgb.r != 128.0 || rgb.g != 0.0 || rgb.b != 0.0) && color.a != 0.0;

        float rgb_value = dot(rgb, vec3(65536.0, 256.0, 1.0));
        float height = mix(rgb_value, rgb_value - 16777216.0, step(8388608.0, rgb_value)) * 0.01;

        // terrariumの標高値エンコード
        height += 32768.0;
        float r = floor(height / 256.0);
        float g = floor(mod(height, 256.0));
        float b = floor((height - floor(height)) * 256.0);

        // terrariumの標高値を色に変換
        fragColor = mix(
            zero_elevation_color,
            vec4(
                r / 255.0,
                g / 255.0,
                b / 255.0,
                1.0
            ),
            float(is_valid)
        );
    }
\`;

let gl = null;
let program = null;
let positionBuffer = null;
let heightMapLocation = null;
// 標高タイルは常に256x256なので、テクスチャは1枚だけ生成して使い回す
// (タイルごとに createTexture するとGPUテクスチャがリークする)
let heightMapTexture = null;

const initWebGL = (canvas) => {
	gl = canvas.getContext('webgl2');
	if (!gl) {
		throw new Error('WebGL not supported');
	}

	const loadShader = (
		gl,
		type,
		source,
	) => {
		const shader = gl.createShader(type);
		if (!shader) {
			console.error('Unable to create shader');
			return null;
		}
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(
				'An error occurred compiling the shaders: ' +
					gl.getShaderInfoLog(shader),
			);
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	};

	const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
	const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
	if (!vertexShader || !fragmentShader) {
		throw new Error('Failed to load shaders');
	}

	program = gl.createProgram();
	if (!program) {
		throw new Error('Failed to create program');
	}
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(
			'Unable to initialize the shader program: ' +
				gl.getProgramInfoLog(program),
		);
		throw new Error('Failed to link program');
	}

	positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
	const positionLocation = gl.getAttribLocation(program, 'a_position');
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

	heightMapLocation = gl.getUniformLocation(program, 'u_height_map');

	// テクスチャを1度だけ生成（以降は texImage2D で中身だけ差し替える）
	heightMapTexture = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, heightMapTexture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
};

const canvas = new OffscreenCanvas(256, 256);

// GLコンテキストロスト時は状態を破棄し、次のメッセージで再初期化させる
if (typeof canvas.addEventListener === 'function') {
	canvas.addEventListener('webglcontextlost', (event) => {
		event.preventDefault();
		gl = null;
		program = null;
		positionBuffer = null;
		heightMapLocation = null;
		heightMapTexture = null;
	});
}

self.onmessage = async (e) => {
	const { id, url, image } = e.data;

	try {
		if (!gl) {
			initWebGL(canvas);
		}

		if (!gl || !program || !positionBuffer || !heightMapLocation || !heightMapTexture) {
			throw new Error('WebGL initialization failed');
		}

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, heightMapTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

		gl.useProgram(program);
		gl.uniform1i(heightMapLocation, 0);

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		const blob = await canvas.convertToBlob();
		if (!blob) {
			throw new Error('Failed to convert canvas to blob');
		}
		const buffer = await blob.arrayBuffer();
		// buffer は transfer list で渡してコピーを回避
		self.postMessage({ id, url, buffer }, [buffer]);
	} catch (error) {
		// Error 以外（文字列・DOMException 等）が throw されても必ず応答を返す
		// （返さないと呼び出し側の Promise が永久にハングする）
		const message =
			error instanceof Error
				? error.message
				: typeof error === 'string'
					? error
					: 'Unknown worker error';
		self.postMessage({ id, url, error: message });
	} finally {
		// ImageBitmap のメモリを即時解放
		if (image && typeof image.close === 'function') {
			image.close();
		}
	}
};
`
