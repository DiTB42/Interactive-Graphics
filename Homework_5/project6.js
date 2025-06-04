var raytraceFS = `
struct Ray {
	vec3 pos;
	vec3 dir;
};

struct Material {
	vec3  k_d;
	vec3  k_s;
	float n;
};

struct Sphere {
	vec3     center;
	float    radius;
	Material mtl;
};

struct Light {
	vec3 position;
	vec3 intensity;
};

struct HitInfo {
	float    t;
	vec3     position;
	vec3     normal;
	Material mtl;
};

uniform Sphere spheres[ NUM_SPHERES ];
uniform Light  lights [ NUM_LIGHTS  ];
uniform samplerCube envMap;
uniform int bounceLimit;

bool IntersectRay( inout HitInfo info, Ray ray );

// Shades the given point and returns the computed color.
vec3 Shade( Material mtl, vec3 position, vec3 normal, vec3 view )
{
	vec3 color = vec3(0,0,0);
	for ( int i=0; i<NUM_LIGHTS; ++i ) {
		vec3 lightDir = normalize(lights[i].position - position);
		Ray shadowRay;
		shadowRay.pos = position + lightDir * 0.001;
		shadowRay.dir = lightDir;

		HitInfo shadowHit;
		if (IntersectRay(shadowHit, shadowRay)) {
			color += mtl.k_d * 0.01;
		} else {
			vec3 h = normalize(lightDir + view);
			float diff = max(dot(normal, lightDir), 0.0);
			float spec = pow(max(dot(normal, h), 0.0), mtl.n);
			color += lights[i].intensity * (mtl.k_d * diff + mtl.k_s * spec);
		}
	}
	return color;
}

// Intersects the given ray with all spheres in the scene
// and updates the given HitInfo using the information of the sphere
// that first intersects with the ray.
// Returns true if an intersection is found.
bool IntersectRay( inout HitInfo info, Ray ray )
{
	ray.dir = normalize(ray.dir);
	info.t = 1e30;
	bool foundHit = false;

	for ( int i = 0; i < NUM_SPHERES; ++i ) {
		vec3 oc = ray.pos - spheres[i].center;
		float a = dot(ray.dir, ray.dir);
		float b = 2.0 * dot(ray.dir, oc);
		float c = dot(oc, oc) - spheres[i].radius * spheres[i].radius;
		float delta = b * b - 4.0 * a * c;

		if (delta >= 0.0) {
			float t = (-b - sqrt(delta)) / (2.0 * a);
			if (t >= 0.0 && t <= info.t) {
				foundHit = true;
				info.t = t;
				info.position = ray.pos + t * ray.dir;
				info.normal = normalize((info.position - spheres[i].center) / spheres[i].radius);
				info.mtl = spheres[i].mtl;
			}
		}
	}
	return foundHit;
}

// Given a ray, returns the shaded color where the ray intersects a sphere.
// If the ray does not hit a sphere, returns the environment color.
vec4 RayTracer( Ray ray )
{
	HitInfo info;
	if ( IntersectRay( info, ray ) ) {
		vec3 view = normalize( -ray.dir );
		vec3 shadedColor = Shade( info.mtl, info.position, info.normal, view );

		vec3 k_s = info.mtl.k_s;
		for ( int bounce = 0; bounce < MAX_BOUNCES; ++bounce ) {
			if ( bounce >= bounceLimit ) break;
			if ( info.mtl.k_s.r + info.mtl.k_s.g + info.mtl.k_s.b <= 0.0 ) break;

			Ray r;
			HitInfo h;
			r.pos = info.position + 0.001 * info.normal;
			r.dir = reflect(ray.dir, info.normal);

			if ( IntersectRay( h, r ) ) {
				vec3 viewDir = normalize(-r.dir);
				shadedColor += k_s * Shade(h.mtl, h.position, h.normal, viewDir);
				k_s *= h.mtl.k_s;
				info = h;
				ray = r;
			} else {
				shadedColor += k_s * textureCube( envMap, r.dir.xzy ).rgb;
				break;
			}
		}
		return vec4( shadedColor, 1 );
	} else {
		return vec4( textureCube( envMap, ray.dir.xzy ).rgb, 0 );
	}
}
`;
