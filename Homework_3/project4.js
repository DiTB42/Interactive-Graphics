// This function takes the projection matrix, the translation, and two rotation angles (in radians) as input arguments.
// The two rotations are applied around x and y axes.
// It returns the combined 4x4 transformation matrix as an array in column-major order.
// The given projection matrix is also a 4x4 matrix stored as an array in column-major order.
// You can use the MatrixMult function defined in project4.html to multiply two 4x4 matrices in the same format.
function GetModelViewProjection( projectionMatrix, translationX, translationY, translationZ, rotationX, rotationY )
{
	// Rotation matrices (row-major)
	let rotateX = [
		1, 0, 0, 0,
		0, Math.cos(rotationX), Math.sin(rotationX), 0,
		0, -Math.sin(rotationX), Math.cos(rotationX), 0,
		0, 0, 0, 1
	];

	let rotateY = [
		Math.cos(rotationY), 0, -Math.sin(rotationY), 0,
		0, 1, 0, 0,
		Math.sin(rotationY), 0, Math.cos(rotationY), 0,
		0, 0, 0, 1
	];

	let translate = [
		1, 0, 0, translationX,
		0, 1, 0, translationY,
		0, 0, 1, translationZ,
		0, 0, 0, 1
	];

	function transpose(m) {
		let r = [];
		for (let i = 0; i < 4; i++)
			for (let j = 0; j < 4; j++)
				r.push(m[j * 4 + i]);
		return r;
	}

	var mvp = MatrixMult(
		projectionMatrix,
		MatrixMult(
			transpose(translate),
			MatrixMult(
				transpose(rotateX),
				transpose(rotateY)
			)
		)
	);

	return mvp;
}


// [TO-DO] Complete the implementation of the following class.

class MeshDrawer
{
	// The constructor is a good place for taking care of the necessary initializations.
	constructor()
	{
		this.prog = InitShaderProgram(meshVS, meshFS);
		this.mvpLoc = gl.getUniformLocation(this.prog, 'mvp');
		this.yzSwapLoc = gl.getUniformLocation(this.prog, 'yzSwap');
		this.showTexLoc = gl.getUniformLocation(this.prog, 'showTex');

		this.posLoc = gl.getAttribLocation(this.prog, 'pos');
		this.texLoc = gl.getAttribLocation(this.prog, 'texCoord');

		this.vertBuffer = gl.createBuffer();
		this.texBuffer = gl.createBuffer();

		this.numTriangles = 0;

		this.yzMatrix = [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1
		];
	}
	
	// This method is called every time the user opens an OBJ file.
	// The arguments of this function is an array of 3D vertex positions
	// and an array of 2D texture coordinates.
	// Every item in these arrays is a floating point value, representing one
	// coordinate of the vertex position or texture coordinate.
	// Every three consecutive elements in the vertPos array forms one vertex
	// position and every three consecutive vertex positions form a triangle.
	// Similarly, every two consecutive elements in the texCoords array
	// form the texture coordinate of a vertex.
	// Note that this method can be called multiple times.
	setMesh( vertPos, texCoords )
	{
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertPos), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

		this.numTriangles = vertPos.length / 3;
	}
	
	// This method is called when the user changes the state of the
	// "Swap Y-Z Axes" checkbox. 
	// The argument is a boolean that indicates if the checkbox is checked.
	swapYZ( swap )
	{
		if (swap) {
			this.yzMatrix = [
				1, 0, 0, 0,
				0, 0, 1, 0,
				0, 1, 0, 0,
				0, 0, 0, 1
			];
		} else {
			this.yzMatrix = [
				1, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, 0, 1
			];
		}
	}
	
	// This method is called to draw the triangular mesh.
	// The argument is the transformation matrix, the same matrix returned
	// by the GetModelViewProjection function above.
	draw( trans )
	{
		gl.useProgram(this.prog);

		gl.uniformMatrix4fv(this.mvpLoc, false, trans);
		gl.uniformMatrix4fv(this.yzSwapLoc, false, this.yzMatrix);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
		gl.enableVertexAttribArray(this.posLoc);
		gl.vertexAttribPointer(this.posLoc, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
		gl.enableVertexAttribArray(this.texLoc);
		gl.vertexAttribPointer(this.texLoc, 2, gl.FLOAT, false, 0, 0);

		gl.drawArrays(gl.TRIANGLES, 0, this.numTriangles);
	}
	
	// This method is called to set the texture of the mesh.
	// The argument is an HTML IMG element containing the texture data.
	setTexture( img )
	{
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
		gl.generateMipmap(gl.TEXTURE_2D);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.useProgram(this.prog);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		const samplerLoc = gl.getUniformLocation(this.prog, 'tex');
		gl.uniform1i(samplerLoc, 0);
		this.showTexture(true);
	}
	
	// This method is called when the user changes the state of the
	// "Show Texture" checkbox. 
	// The argument is a boolean that indicates if the checkbox is checked.
	showTexture( show )
	{
		gl.useProgram(this.prog);
		gl.uniform1i(this.showTexLoc, show);
	}
}

// Vertex and fragment shaders
const meshVS = `
attribute vec3 pos;
attribute vec2 texCoord;

uniform mat4 mvp;
uniform mat4 yzSwap;

varying vec2 v_texCoord;

void main() {
    // Pass texture coordinates to the fragment shader
    v_texCoord = texCoord;

    // Apply transformation to vertex position
    gl_Position = mvp * yzSwap * vec4(pos, 1.0);
}`;

const meshFS = `
precision mediump float;

uniform bool showTex;
uniform sampler2D tex;

varying vec2 v_texCoord;

void main() {
    if (showTex) {
        // Use the interpolated texture coordinate to sample the texture
        gl_FragColor = texture2D(tex, v_texCoord);
    } else {
        // Fallback color (white)
        gl_FragColor = vec4(1,gl_FragCoord.z*gl_FragCoord.z,0,1);
    }
}`;
