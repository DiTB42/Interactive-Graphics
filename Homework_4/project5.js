// This function takes the translation and two rotation angles (in radians) as input arguments.
// The two rotations are applied around x and y axes.
// It returns the combined 4x4 transformation matrix as an array in column-major order.
// You can use the MatrixMult function defined in project5.html to multiply two 4x4 matrices in the same format.
function GetModelViewMatrix(translationX, translationY, translationZ, rotationX, rotationY) {
	rotationX = -rotationX;
	rotationY = -rotationY;

	const cx = Math.cos(rotationX);
	const sx = Math.sin(rotationX);
	const cy = Math.cos(rotationY);
	const sy = Math.sin(rotationY);

	const mv = [
		cy,        sx * sy,     cx * sy,     0,
		0,         cx,          -sx,         0,
		-sy,       cy * sx,     cx * cy,     0,
		translationX, translationY, translationZ, 1
	];
	return mv;
}

// [TO-DO] Complete the implementation of the following class.
class MeshDrawer {
	constructor() {
		this.program = InitShaderProgram(meshVS, meshFS);
		this.lastSwapped = false;


		// Buffers
		this.vertexBuffer = gl.createBuffer();
		this.texCoordBuffer = gl.createBuffer();
		this.normalBuffer = gl.createBuffer();

		// Attributes
		this.posLocation = gl.getAttribLocation(this.program, 'aPosition');
		this.texLocation = gl.getAttribLocation(this.program, 'aTexCoord');
		this.normLocation = gl.getAttribLocation(this.program, 'aNormal');

		// Uniforms
		this.mv = gl.getUniformLocation(this.program, 'uMV');
		this.mvp = gl.getUniformLocation(this.program, 'uMVP');
		this.normal = gl.getUniformLocation(this.program, 'uNormal');
		this.swap = gl.getUniformLocation(this.program, 'uSwapYZ');
		this.show = gl.getUniformLocation(this.program, 'uShowTexture');
		this.sampler = gl.getUniformLocation(this.program, 'uTex');
		this.lightDir = gl.getUniformLocation(this.program, 'uLightDir');
		this.alpha = gl.getUniformLocation(this.program, 'uAlpha');

		this.texture = gl.createTexture();
		this.numTriangles = 0;
	}

	setMesh(vertPos, texCoords, normals) {
		this.numTriangles = vertPos.length / 3;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertPos), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
	}

	swapYZ(swap) {
		gl.useProgram(this.program);
		gl.uniform1i(this.swap, swap);
		this.lastSwapped = swap;
	}

	draw(matrixMVP, matrixMV, matrixNormal) {
		gl.useProgram(this.program);

		gl.uniformMatrix4fv(this.mv, false, matrixMV);
		gl.uniformMatrix4fv(this.mvp, false, matrixMVP);
		gl.uniformMatrix3fv(this.normal, false, matrixNormal);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.vertexAttribPointer(this.posLocation, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.posLocation);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.vertexAttribPointer(this.texLocation, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.texLocation);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
		gl.vertexAttribPointer(this.normLocation, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.normLocation);

		gl.drawArrays(gl.TRIANGLES, 0, this.numTriangles);
	}

	setTexture(img) {
		gl.useProgram(this.program);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(this.sampler, 0);
		this.showTexture(true);
	}

	showTexture(show) {
		gl.useProgram(this.program);
		gl.uniform1i(this.show, show);
	}

	setLightDir(x, y, z) {
		gl.useProgram(this.program);

		if (this.lastSwapped) {
			// Apply the same Y-Z swap as in the vertex shader
			const temp = y;
			y = z;
			z = temp;
		}

		const norm = Math.sqrt(x * x + y * y + z * z);
		gl.uniform3f(this.lightDir, x / norm, y / norm, z / norm);
	}


	setShininess(shininess) {
		gl.useProgram(this.program);
		gl.uniform1f(this.alpha, shininess);
	}
}


//Vertex shader
const meshVS = `
attribute vec3 aPosition;
attribute vec2 aTexCoord;
attribute vec3 aNormal;

uniform bool uSwapYZ;
uniform mat4 uMV;
uniform mat4 uMVP;
uniform mat3 uNormal;

varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec4 vView;

void main() {
	vec3 pos = aPosition;
	if (uSwapYZ) {
		pos = vec3(pos.x, pos.z, pos.y);
	}
	vNormal = uNormal * aNormal;
	vView = uMV * vec4(pos, 1.0);
	gl_Position = uMVP * vec4(pos, 1.0);
	vTexCoord = aTexCoord;
}
`;


//Fragment shader
const meshFS = `
precision mediump float;

uniform bool uShowTexture;
uniform float uAlpha;
uniform vec3 uLightDir;
uniform sampler2D uTex;

varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec4 vView;

void main() {
	vec3 normal = normalize(vNormal);
	vec3 lightDir = normalize(uLightDir);
	vec3 viewDir = normalize(-vView.xyz);
	vec3 h = normalize(lightDir + viewDir);

	vec3 Kd = vec3(1.0);
	vec3 Ks = vec3(1.0);
	vec3 lightIntensity = vec3(1.0);

	float cosTheta = max(dot(normal, lightDir), 0.0);
	float cosPhi = max(dot(normal, h), 0.0);

	vec4 texColor;
	if (uShowTexture) {
		texColor = texture2D(uTex, vTexCoord);
	} else {
		texColor = vec4(1.0, gl_FragCoord.z * gl_FragCoord.z, 0.0, 1.0);
	}

	Kd = texColor.rgb;
	vec3 blinnModel = lightIntensity * (cosTheta * Kd + Ks * pow(cosPhi, uAlpha));
	gl_FragColor = vec4(blinnModel, texColor.a);
}
`;
