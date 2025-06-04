function GetModelViewMatrix( translationX, translationY, translationZ, rotationX, rotationY )
{
	const cosX = Math.cos(rotationX), sinX = Math.sin(rotationX);
	const cosY = Math.cos(rotationY), sinY = Math.sin(rotationY);

	const rotX = [
		1,    0,     0, 0,
		0, cosX, -sinX, 0,
		0, sinX,  cosX, 0,
		0,    0,     0, 1
	];

	const rotY = [
		cosY, 0, sinY, 0,
		   0, 1,    0, 0,
	   -sinY, 0, cosY, 0,
		   0, 0,    0, 1
	];

	const trans = [
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		translationX, translationY, translationZ, 1
	];

	return MatrixMult(trans, MatrixMult(rotY, rotX));
}


class MeshDrawer
{
	constructor()
	{
		this.shaderProgram = InitShaderProgram(vertexShader, fragmentShader);
		this.positionBuffer = gl.createBuffer();
		this.texCoordBuffer = gl.createBuffer();
		this.normalBuffer = gl.createBuffer();

		this.aPosition = gl.getAttribLocation(this.shaderProgram, "aPosition");
		this.aTexCoord = gl.getAttribLocation(this.shaderProgram, "aTexCoord");
		this.aNormal   = gl.getAttribLocation(this.shaderProgram, "aNormal");

		this.uMV        = gl.getUniformLocation(this.shaderProgram, "uMV");
		this.uMVP       = gl.getUniformLocation(this.shaderProgram, "uMVP");
		this.uNormal    = gl.getUniformLocation(this.shaderProgram, "uNormal");
		this.uSwapYZ    = gl.getUniformLocation(this.shaderProgram, "uSwapYZ");
		this.uShowTex   = gl.getUniformLocation(this.shaderProgram, "uShowTexture");
		this.uShiny     = gl.getUniformLocation(this.shaderProgram, "uAlpha");
		this.uLightDir  = gl.getUniformLocation(this.shaderProgram, "uLightDir");
		this.uSampler   = gl.getUniformLocation(this.shaderProgram, "uTex");

		this.texture = gl.createTexture();
		this.triangleCount = 0;
	}
	
	setMesh( vertPos, texCoords, normals )
	{
		this.triangleCount = vertPos.length / 3;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertPos), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
	}
	
	swapYZ( swap )
	{
		gl.useProgram(this.shaderProgram);
		gl.uniform1i(this.uSwapYZ, swap);
	}
	
	draw( matrixMVP, matrixMV, matrixNormal )
	{
		gl.useProgram(this.shaderProgram);

		gl.uniformMatrix4fv(this.uMVP, false, matrixMVP);
		gl.uniformMatrix4fv(this.uMV, false, matrixMV);
		gl.uniformMatrix3fv(this.uNormal, false, matrixNormal);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.aPosition);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.vertexAttribPointer(this.aTexCoord, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.aTexCoord);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
		gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.aNormal);

		gl.drawArrays(gl.TRIANGLES, 0, this.triangleCount);
	}
	
	setTexture( img )
	{
		gl.useProgram(this.shaderProgram);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.uniform1i(this.uSampler, 0);
		this.showTexture(true);
	}
	
	showTexture( show )
	{
		gl.useProgram(this.shaderProgram);
		gl.uniform1i(this.uShowTex, show);
	}
	
	setLightDir( x, y, z )
	{
		gl.useProgram(this.shaderProgram);
		const len = Math.sqrt(x*x + y*y + z*z);
		gl.uniform3f(this.uLightDir, x/len, y/len, z/len);
	}
	
	setShininess( shininess )
	{
		gl.useProgram(this.shaderProgram);
		gl.uniform1f(this.uShiny, shininess);
	}
}


// GLSL Shader Code
const vertexShader = `
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
	vView = uMV * vec4(pos, 1.0);
	gl_Position = uMVP * vec4(pos, 1.0);
	vTexCoord = aTexCoord;
	vNormal = uNormal * aNormal;
}
`;

const fragmentShader = `
precision mediump float;

uniform bool uShowTexture;
uniform float uAlpha;
uniform vec3 uLightDir;
uniform sampler2D uTex;

varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec4 vView;

void main() {
	vec3 norm = normalize(vNormal);
	vec3 light = normalize(uLightDir);
	vec3 viewDir = normalize(-vView.xyz);
	vec3 halfVec = normalize(light + viewDir);

	vec3 Kd = vec3(1.0), Ks = vec3(1.0), lightIntensity = vec3(1.0);

	if (uShowTexture)
		Kd = texture2D(uTex, vTexCoord).rgb;

	float diff = max(dot(norm, light), 0.0);
	float spec = pow(max(dot(norm, halfVec), 0.0), uAlpha);

	vec3 color = lightIntensity * (Kd * diff + Ks * spec);
	gl_FragColor = vec4(color, 1.0);
}
`;


// Final SimTimeStep
function SimTimeStep(dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution) {
	const N = positions.length;
	const forces = new Array(N);
	for (let i = 0; i < N; i++) {
		forces[i] = new Vec3(0, 0, 0);
	}

	for (const s of springs) {
		const i = s.p0, j = s.p1;
		const pi = positions[i], pj = positions[j];
		const vi = velocities[i], vj = velocities[j];

		const dx = pj.sub(pi);
		const dv = vj.sub(vi);
		const len = dx.len();
		const dir = len > 1e-8 ? dx.div(len) : new Vec3(0,0,0);

		const Fspring = dir.mul(stiffness * (len - s.rest));
		const Fdamp = dir.mul(damping * dv.dot(dir));
		const F = Fspring.add(Fdamp);

		forces[i].inc(F);
		forces[j].dec(F);
	}

	for (let i = 0; i < N; i++) {
		const acc = forces[i].div(particleMass).add(gravity);
		velocities[i].inc(acc.mul(dt));
		positions[i].inc(velocities[i].copy().mul(dt));
	}

	for (let i = 0; i < N; i++) {
		const p = positions[i], v = velocities[i];
		for (const axis of ['x', 'y', 'z']) {
			if (p[axis] < -1) {
				p[axis] = -1;
				if (v[axis] < 0) v[axis] *= -restitution;
			}
			if (p[axis] > 1) {
				p[axis] = 1;
				if (v[axis] > 0) v[axis] *= -restitution;
			}
		}
	}
}
