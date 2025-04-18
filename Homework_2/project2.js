// Returns a 3x3 transformation matrix as an array of 9 values in column-major order.
// The transformation first applies scale, then rotation, and finally translation.
// The given rotation value is in degrees.

function GetTransform(positionX, positionY, rotation, scale) 
{
	const radians = rotation * Math.PI / 180;

	const cos = Math.cos(radians);
	const sin = Math.sin(radians);

	// Scale matrix
	const scaleMatrix = Array(
		scale, 0,     0,
		0,     scale, 0,
		0,     0,     1
	);

	// Rotation matrix
	const rotationMatrix = Array(
		cos,  -sin, 0,
		sin,   cos, 0,
		0,     0,   1
	);

	// Translation matrix
	const translationMatrix = Array(
		1, 0, 0,
		0, 1, 0,
		positionX, positionY, 1
	);

	// Multiply matrices: translation * rotation * scale
	function multiply3x3(a, b) {
		const result = new Array(9);
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				result[col * 3 + row] =
					a[0 * 3 + row] * b[col * 3 + 0] +
					a[1 * 3 + row] * b[col * 3 + 1] +
					a[2 * 3 + row] * b[col * 3 + 2];
			}
		}
		return result;
	}

	const scaleThenRotate = multiply3x3(rotationMatrix, scaleMatrix);
	const finalTransform = multiply3x3(translationMatrix, scaleThenRotate);

	return Array(...finalTransform);
}

// Returns a 3x3 transformation matrix as an array of 9 values in column-major order.
// The arguments are transformation matrices in the same format.
// The returned transformation first applies trans1 and then trans2.
function ApplyTransform(trans1, trans2) 
{
	function multiply3x3(a, b) {
		const result = new Array(9);
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				result[col * 3 + row] =
					a[0 * 3 + row] * b[col * 3 + 0] +
					a[1 * 3 + row] * b[col * 3 + 1] +
					a[2 * 3 + row] * b[col * 3 + 2];
			}
		}
		return result;
	}

	const combined = multiply3x3(trans2, trans1);
	return Array(...combined);
}
