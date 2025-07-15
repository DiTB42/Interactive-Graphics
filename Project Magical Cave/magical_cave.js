// GLOBAL VARIABLES 

// Core WebGL Context
let gl, canvas;
let time = 0;
let lastTime = 0;

// GL Matrix Utilities
const mat4 = glMatrix.mat4;
const quat = glMatrix.quat;
const vec3 = glMatrix.vec3;
const vec4 = glMatrix.vec4;
const mat3 = glMatrix.mat3;

// Camera System
let camera = {
  position: [0, 0, 5],
  pitch: 0,
  yaw: -Math.PI / 2,
  speed: 5,
  sensitivity: 0.002, //to the mouse movement
  keys: {}, // tracks pressed keys
};

// Reflection System
let reflectionFBO = null;               // frame buffer object, offscreen buffer to render reflection into texture instead of screen
let reflectionTextures = [null, null];  // ping pong buffering 
let currentReflectionTex = 0;           // draw into this one
let lastReflectionTex = 0;              // use as input for shader
let reflectionViewMatrix = mat4.create(); // mirror actual cam pos across water surface
let reflectionFront = [0, 0, -1];         // where cam is facing
let lastPosition = [0, 0, 0];             // last position of camera to detect movement

// Shader Programs
let shaderProgram = null;       // Dome
let floorProgram = null;        // Floor
let rockProgram = null;         // Rocks - shares floor textures
let crystalProgram = null;      // Crystals
let waterProgram = null;        // Water
let torchProgram = null;        // Torches
let fairyProgram = null;        // Fairies
let pbrProgram = null;          // Sword (PBR)
let auraProgram = null;         // Sword & torch auras
let mushroomProgram = null;     // Mushrooms
let pedestalProgram = null;     // Pedestal for sword

// PBR : physically based rendering - mimics how light behaves in the real world. Accurate light reflection equations.
// Material properties stored in textures or uniforms. 

// Cave Mesh 
let caveMesh = null;
let domeBaseRing = [];
const bumpCenters = [];
const bumpHeights = [];
const bumpRadii = [];

// Cave, floor & crystal textures
let textures = {
  cave: null,
  caveNormal: null,
  caveRoughness: null,
  caveAO: null,
  caveSpecular: null,
  caveDisplacement: null,
  crystals: null,
  floor: null, 
  floorNormal: null,
  floorRoughness: null,
  floorAO: null,           
  floorSpecular: null,      
};

// Crystals
let crystalBuffers = {};
let crystals = [];
let pointyCrystalBuffers = null;
let rockCrystalBuffers = null;
const CRYSTAL_SEGMENTS = 16;

const CRYSTAL_TINT_ACTIVE = [0.9, 0.5, 0.9];
const CRYSTAL_TINT_DIMMED = [0.4, 0.6, 1.5];
const CRYSTAL_LIGHT_COLOR_ACTIVE = [0.9, 0.5, 0.9];
const CRYSTAL_LIGHT_COLOR_DIMMED = [0.4, 0.6, 1.5];

// Floor, rocks & path
let floorBuffers = null;
let floorMesh = null;

let rockBuffers = null;
let rockMesh = null;
let rockInstances = [];
let surfaceRing = null;

let pathBuffers = null;
let pathMesh = null;

// Water
let waterBuffers = null;
let rippleDistortionTex = null;
let rippleGridSize = 0;
let rippleHeights = [];
let rippleVelocities = [];
let rippleNormals = [];
const WATER_HEIGHT = -2.48;

// Water drops
let drops = [];
let dropSources = [];
let lastDropTime = 0;
const GRAVITY = 9.8;
const DROP_RADIUS = 0.08;
const DROP_INTERVAL = 0.5;
const DROP_SPEED = 2.0;

let currentGlowPosition = null;
let currentGlowTime = 0;

// Mushrooms
let mushroomBuffers = null;
let mushrooms = [];

// Fairy System
let fairyBuffers = null;
let fairyFlapTime = 0;
let fairyAttraction = 0;
const navis = [];
const colorPool = [
  ...Array(4).fill({ base: [0.4, 0.6, 1.0], glow: [1.2, 0.8, 1.4] }),
  ...Array(3).fill({ base: [1.0, 1.0, 0.4], glow: [1.5, 0.4, 0.2] })
];

for (let i = colorPool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
}

for (let i = 0; i < 7; i++) {
  const color = colorPool[i];
  const baseRadius = 2.8 + Math.random() * 1.8;
  const baseHeight = 1.5 + Math.random() * 1.0;
  const baseSpeed = 0.1 + Math.random() * 0.5;

  navis.push({
    radius: baseRadius,
    height: baseHeight,
    speed: baseSpeed,
    speedOffset: Math.random() * Math.PI * 2,
    direction: Math.random() < 0.5 ? 1 : -1,
    baseColor: color.base,
    glowColor: color.glow,

    
    baseRadius,
    baseHeight,
    baseSpeed,
  });
}

// Torch System 
let torchBuffers = null;
let torchModelMatrices = [];
let torchLights = [];
const torchInfos = [];

// Sword & Aura
let swordBuffers = null;
let swordModelMatrix = mat4.create();
let swordY = -2.0;
let swordRotation = 0;
let swordState = 0;  // 0 = embedded, 1 = extracting, 2 = extracted
const SWORD_POSITION = [0.85, -2.0, -1.26];
const SWORD_TRIGGER_RADIUS = 2.5;
const SWORD_SCALE = 1.0;
const SWORD_FINAL_Y = -0.8;

let auraBuffer = null;

// Pedestal
let pedestalBuffers = null;
let pedestalModelMatrix = mat4.create();

// Interaction 
let yLockValue = null;
let lockCaveAccess = false;
let restrictToPath = false;

const PATH_X_MIN = 0.4;
const PATH_X_MAX = 1.4;
const PATH_Z_MIN = -2.5;
const PATH_Z_MAX = 5.0;

const RING_RADIUS_MIN = 4.0;
const RING_RADIUS_MAX = 6.8;

// Audio 
let audioAmbientPre, audioAmbientPost, audioSword, audioSwordRetract;


// SEEDS  
function makeRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = s * 16807 % 2147483647;
    return (s - 1) / 2147483646;
  };
}
// Fixed seed
const SEED = 1;
const rand = makeRandom(SEED);



////////  1. CORE INITIALIZATION ////////

function initGL() {                                          // Prepares GPU and rendering context
  canvas = document.getElementById("glCanvas");
  gl = canvas.getContext("webgl");
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  setupReflectionFramebuffer(gl.canvas.width, gl.canvas.height); // called here because low level - allocates GPU resources, ensures reflection rendering works when
                                                                 // the scene is drawn for the first time                

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
}

function setupInput() {                                      // Control camera and sword interaction, sword sound also

  document.addEventListener('keydown', (e) => {                       // event listener : fires everytime key is pressed
    camera.keys[e.key.toLowerCase()] = true;                          // pressed keys : true

    if (e.key === "z") {
      const dx = camera.position[0] - SWORD_POSITION[0];
      const dz = camera.position[2] - SWORD_POSITION[2];
      const distSq = dx * dx + dz * dz;

      if (distSq < SWORD_TRIGGER_RADIUS * SWORD_TRIGGER_RADIUS) {     // if player within radius of interaction of sword
        if (swordState === 0) {                                       
          swordState = 1; // begin extracting
           // Play sword sound
          audioSword.currentTime = 0;   // reset currentTime to ensure doesn't play midway
          audioSword.play();

          // Crossfade ambient sounds
          fadeAudio(audioAmbientPre, 0.0, 1000);
          fadeAudio(audioAmbientPost, 0.4, 1500);

        } else if (swordState === 2) {
          swordState = -1; // begin retracting
          
          // Play retract sound
          audioSwordRetract.currentTime = 0;
          audioSwordRetract.play();
        

          // Play a return sound 
          fadeAudio(audioAmbientPost, 0.0, 1000);
          fadeAudio(audioAmbientPre, 0.4, 1500);
        }
      }
    }
  });

  document.addEventListener('keyup', (e) => {                        // keyup listener : ends continuous movement
    camera.keys[e.key.toLowerCase()] = false;
  });

  canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
  document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;

  canvas.onclick = () => {
    canvas.requestPointerLock();
  };

  document.addEventListener('pointerlockchange', lockChangeAlert, false);                       // to move mouse and pointer lock
  document.addEventListener('mozpointerlockchange', lockChangeAlert, false);

  function lockChangeAlert() {
    if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas) {
      document.addEventListener("mousemove", updateMouse, false);
    } else {
      document.removeEventListener("mousemove", updateMouse, false);
    }
  }

  function updateMouse(e) {                           // update cam based on mouse movement, constraints pitch so can't look too far up or down
    camera.yaw += e.movementX * camera.sensitivity;
    camera.pitch -= e.movementY * camera.sensitivity;
    const limit = Math.PI / 2 - 0.01;
    if (camera.pitch > limit) camera.pitch = limit;
    if (camera.pitch < -limit) camera.pitch = -limit;
  }
}

function setupAudio() {                                      // Sets sound enviornment
  audioAmbientPre = new Audio('sounds/ambient_pre.wav');
  audioAmbientPre.loop = true;
  audioAmbientPre.volume = 0.4;

  audioAmbientPost = new Audio('sounds/ambient_post.wav');
  audioAmbientPost.loop = true;
  audioAmbientPost.volume = 0.0;

  audioSword = new Audio('sounds/sword_extract.wav');
  audioSword.volume = 1.0;

  audioSwordRetract = new Audio('sounds/sword_retract.wav');
  audioSwordRetract.volume = 1.0;


  // Wait for user interaction to start playback : unlock audio playback to prevent browser from messing up
  document.addEventListener('click', () => {
    audioAmbientPre.play();
    audioAmbientPost.play();
  }, { once: true });
}

function fadeAudio(audio, targetVolume, duration) {          // Avoids volume jumps, interpolates volume (smooth transition)
  const steps = 30;
  const stepTime = duration / steps;
  const startVolume = audio.volume;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    audio.volume = startVolume + (targetVolume - startVolume) * (step / steps);
    if (step >= steps) clearInterval(interval);
  }, stepTime);
}

function setupTextureInputs() {                              // Wires up file inputs so user can dynamically load textures
  document.getElementById("texCaveMaterialSet").onchange = handleCaveMaterialSet;
  document.getElementById("texCrystals").onchange = e => handleTextureFile(e, "crystals");
  document.getElementById("texFloorMaterialSet").addEventListener("change", handleFloorMaterialSet);
}

function setupReflectionFramebuffer(width, height) {         // Sets up FBO for water reflection to texture
  // Create the two textures for the ping-pong buffering
  for (let i = 0; i < 2; i++) {
    reflectionTextures[i] = gl.createTexture();
    // new empty WebGL texture object : 
    gl.bindTexture(gl.TEXTURE_2D, reflectionTextures[i]); 
    // bind it to texture_2D so all successive commands gl.tex will configure this texture 
    // allocate storage for the texture, but no data yet :
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); 
    // sets texture parameters for filtering (smooth scaling when sampling in shaders) and wrapping (prevent texture wrapping):
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // Depth buffer created to enable depth testing
  const depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer); // bind the renderbuffer
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height); // allocate storage for the depth buffer (16 bits depth , size of reflecion texture)
  // Framebuffer object to hold the textures
  reflectionFBO = gl.createFramebuffer(); // render to FBO instead of screen - CREATE FBO 
  gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionFBO); // bind the framebuffer so all subsequent commands will apply to it
  
  
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                         gl.TEXTURE_2D, reflectionTextures[0], 0);  // attach reflectionTexture[0] to the FBO color output (anything rendered while this FBO is 
                                                                    // bound will be rendered to this texture)
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,   
                           gl.RENDERBUFFER, depthBuffer);           // attach the depth buffer to the FBO so it can be used for depth testing

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('Reflection FBO incomplete:', status.toString(16));
  } // check if FBO is valid and configured

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // unbinds the FBO - subsequent rendering will go to the default framebuffer (the screen)
}

function initRippleDistortionTexture(gl) {                   // function that initializes ripple dist tex
  rippleDistortionTex = gl.createTexture();                  // creates empty WebGL texture
  gl.bindTexture(gl.TEXTURE_2D, rippleDistortionTex);        // binds tex so next commands will configure it
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rippleGridSize, rippleGridSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); // creates empty tex for dynamic distortion map
  // set texture sampling parameters 
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}



//////// 2. SHADERS AND PROGRAM SETUP ////////
// compile GLSL source into GPU-executable code, starts new GPU program, attach vert and frag shaders, links them, activates prog for drawing, 
// finds where to send vertex attributes (pos, normal, UV), gets handles to send data like matrices, textures, time (uniforms)

function setupShaders() {
  const vsSource = getShaderSource("cave-vert");
  const fsSource = getShaderSource("cave-frag");
  const vs = createShader(gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
  shaderProgram = createProgram(vs, fs);
  gl.useProgram(shaderProgram);

  // === ADD THESE ===
  shaderProgram.aPosition = gl.getAttribLocation(shaderProgram, "aPosition");
  shaderProgram.aUV = gl.getAttribLocation(shaderProgram, "aUV");
  shaderProgram.aNormal = gl.getAttribLocation(shaderProgram, "aNormal");
  shaderProgram.uModel = gl.getUniformLocation(shaderProgram, "uModel");
  shaderProgram.uAlbedo = gl.getUniformLocation(shaderProgram, "uAlbedo");
  shaderProgram.uNormal = gl.getUniformLocation(shaderProgram, "uNormal");
  shaderProgram.uRoughness = gl.getUniformLocation(shaderProgram, "uRoughness");
  shaderProgram.uAO = gl.getUniformLocation(shaderProgram, "uAO");
  shaderProgram.uSpecular = gl.getUniformLocation(shaderProgram, "uSpecular");
  shaderProgram.uUseTexture = gl.getUniformLocation(shaderProgram, "uUseTexture");
  shaderProgram.uLightColor = gl.getUniformLocation(shaderProgram, "uLightColor");
  shaderProgram.uLightDir = gl.getUniformLocation(shaderProgram, "uLightDir");
  shaderProgram.uProjection = gl.getUniformLocation(shaderProgram, "uProjection");
  shaderProgram.uView = gl.getUniformLocation(shaderProgram, "uView");
  shaderProgram.uBumpCenters = gl.getUniformLocation(shaderProgram, "uBumpCenters");
  shaderProgram.uBumpHeights = gl.getUniformLocation(shaderProgram, "uBumpHeights");
  shaderProgram.uBumpRadii = gl.getUniformLocation(shaderProgram, "uBumpRadii");
}

function setupFloorShaders() {
  const vsSource = getShaderSource("floor-vert");
  const fsSource = getShaderSource("floor-frag");
  const vs = createShader(gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl.FRAGMENT_SHADER, fsSource);

  floorProgram = createProgram(vs, fs); // ✅ use existing utility

  // Get attribute and uniform locations
  floorProgram.aPosition = gl.getAttribLocation(floorProgram, "aPosition");
  floorProgram.aUV = gl.getAttribLocation(floorProgram, "aUV");
  floorProgram.uProjection = gl.getUniformLocation(floorProgram, "uProjection");
  floorProgram.uView = gl.getUniformLocation(floorProgram, "uView");
  floorProgram.uModel = gl.getUniformLocation(floorProgram, "uModel");
  floorProgram.uAlbedo = gl.getUniformLocation(floorProgram, "uAlbedo");
  floorProgram.uNormal = gl.getUniformLocation(floorProgram, "uNormal");
  floorProgram.uRoughness = gl.getUniformLocation(floorProgram, "uRoughness");
  floorProgram.uAO = gl.getUniformLocation(floorProgram, "uAO");
  floorProgram.uSpecular = gl.getUniformLocation(floorProgram, "uSpecular");
  floorProgram.uUseTexture = gl.getUniformLocation(floorProgram, "uUseTexture");
  floorProgram.uLightDir = gl.getUniformLocation(floorProgram, "uLightDir");
  floorProgram.uLightColor = gl.getUniformLocation(floorProgram, "uLightColor");  
}

function setupRockShaders() {
  const vs = createShader(gl.VERTEX_SHADER, getShaderSource("rock-vert"));
  const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("rock-frag"));
  rockProgram = createProgram(vs, fs);

  rockProgram.aPosition = gl.getAttribLocation(rockProgram, "aPosition");
  rockProgram.uModel = gl.getUniformLocation(rockProgram, "uModel");
  rockProgram.uProjection = gl.getUniformLocation(rockProgram, "uProjection");
  rockProgram.uView = gl.getUniformLocation(rockProgram, "uView");
  rockProgram.uAlbedo = gl.getUniformLocation(rockProgram, "uAlbedo");
  rockProgram.uNormal = gl.getUniformLocation(rockProgram, "uNormal");
  rockProgram.uRoughness = gl.getUniformLocation(rockProgram, "uRoughness");
  rockProgram.uAO = gl.getUniformLocation(rockProgram, "uAO");
  rockProgram.uSpecular = gl.getUniformLocation(rockProgram, "uSpecular");
  rockProgram.uUseTexture = gl.getUniformLocation(rockProgram, "uUseTexture");
  rockProgram.uLightDir = gl.getUniformLocation(rockProgram, "uLightDir");
  rockProgram.uLightColor = gl.getUniformLocation(rockProgram, "uLightColor");
}

function setupCrystalShaders() {
  const vsSource = getShaderSource("crystal-vert");
  const fsSource = getShaderSource("crystal-frag");
  const vs = createShader(gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
  crystalProgram = createProgram(vs, fs);
  gl.useProgram(crystalProgram);

  crystalProgram.aPosition = gl.getAttribLocation(crystalProgram, "aPosition");
  crystalProgram.aUV = gl.getAttribLocation(crystalProgram, "aUV");
  crystalProgram.uProjection = gl.getUniformLocation(crystalProgram, "uProjection");
  crystalProgram.uView = gl.getUniformLocation(crystalProgram, "uView");
  crystalProgram.uModel = gl.getUniformLocation(crystalProgram, "uModel");
  crystalProgram.uTime = gl.getUniformLocation(crystalProgram, "uTime");
  crystalProgram.uCrystal = gl.getUniformLocation(crystalProgram, "uCrystal");
  crystalProgram.uUseTexture = gl.getUniformLocation(crystalProgram, "uUseTexture");
  crystalProgram.uCrystalTint = gl.getUniformLocation(crystalProgram, "uCrystalTint");
}

function setupMushroomShaders() {
  const vs = createShader(gl.VERTEX_SHADER, getShaderSource("mushroom-vert"));
  const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("mushroom-frag"));
  mushroomProgram = createProgram(vs, fs);

  mushroomProgram.aPosition = gl.getAttribLocation(mushroomProgram, "aPosition");
  mushroomProgram.aUV = gl.getAttribLocation(mushroomProgram, "aUV");
  mushroomProgram.uModel = gl.getUniformLocation(mushroomProgram, "uModel");
  mushroomProgram.uView = gl.getUniformLocation(mushroomProgram, "uView");
  mushroomProgram.uProjection = gl.getUniformLocation(mushroomProgram, "uProjection");
}

function setupFairyShader() {
  const vaoExt = gl.getExtension("OES_vertex_array_object");
  const vertSrc = document.getElementById("fairy-vert").textContent;
  const fragSrc = document.getElementById("fairy-frag").textContent;
  const vs = createShader(gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl.FRAGMENT_SHADER, fragSrc);
  fairyProgram = createProgram(vs, fs);

  // Setup VAO
  const vao = vaoExt.createVertexArrayOES();
  vaoExt.bindVertexArrayOES(vao);

  // aClosed
  gl.bindBuffer(gl.ARRAY_BUFFER, fairyBuffers.posClosed);
  const locClosed = gl.getAttribLocation(fairyProgram, "aClosed");
  gl.enableVertexAttribArray(locClosed);
  gl.vertexAttribPointer(locClosed, 3, gl.FLOAT, false, 0, 0);

  // aOpen
  gl.bindBuffer(gl.ARRAY_BUFFER, fairyBuffers.posOpen);
  const locOpen = gl.getAttribLocation(fairyProgram, "aOpen");
  gl.enableVertexAttribArray(locOpen);
  gl.vertexAttribPointer(locOpen, 3, gl.FLOAT, false, 0, 0);

  // aIsCenter
  gl.bindBuffer(gl.ARRAY_BUFFER, fairyBuffers.isCenter); // ✅ correct name
  const locTag = gl.getAttribLocation(fairyProgram, "aIsCenter");
  gl.enableVertexAttribArray(locTag);
  gl.vertexAttribPointer(locTag, 1, gl.FLOAT, false, 0, 0);

  vaoExt.bindVertexArrayOES(null);

  fairyBuffers.vao = vao;
}

function setupAuraShader() {
  const vs = createShader(gl.VERTEX_SHADER, getShaderSource("aura-vert"));
  const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("aura-frag"));
  auraProgram = createProgram(vs, fs);

  auraProgram.aPosition = gl.getAttribLocation(auraProgram, "aPosition");
  auraProgram.uModel = gl.getUniformLocation(auraProgram, "uModel");
  auraProgram.uView = gl.getUniformLocation(auraProgram, "uView");
  auraProgram.uProjection = gl.getUniformLocation(auraProgram, "uProjection");
  auraProgram.uTime = gl.getUniformLocation(auraProgram, "uTime");
  auraProgram.uAuraColor = gl.getUniformLocation(auraProgram, "uAuraColor");

  const quad = new Float32Array([
    -0.5, 0.0, -0.5,
     0.5, 0.0, -0.5,
    -0.5, 0.0,  0.5,
     0.5, 0.0,  0.5,
  ]);

  auraBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, auraBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
}



//////// 3. RESOURCE + FILE LOADING ////////

function handleTextureFile(e, key) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      textures[key] = tex;
      console.log("Loaded texture for:", key);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function loadTextureFromFile(file, key) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      textures[key] = tex;
      checkIfTexturesReady();  // ✅ call this

      console.log("Loaded texture for:", key, "from", file.name);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function checkIfTexturesReady() {
  // Wait until all needed textures are defined
  if (
    textures.cave && textures.caveNormal &&
    textures.caveRoughness && textures.caveAO &&
    textures.caveSpecular && textures.translucency && textures.floor &&
    textures.floorNormal && textures.floorRoughness &&
    textures.floorAO && textures.floorSpecular
  ) {
    texturesLoaded = true;
    console.log("All textures loaded. Reflection ready.");
  }
}

function handleCaveMaterialSet(e) {
  const files = e.target.files;

  for (let file of files) {
    const name = file.name.toLowerCase();

    if (name.includes("albedo") || name.includes("diffuse")) {
    loadTextureFromFile(file, "cave");
    
    } else if (name.includes("normal")) {
      loadTextureFromFile(file, "caveNormal");
    } else if (name.includes("rough")) {
      loadTextureFromFile(file, "caveRoughness");
    } else if (name.includes("ao") || name.includes("ambient")) {
      loadTextureFromFile(file, "caveAO");
    } else if (name.includes("specular") || name.includes("spec")) {
      loadTextureFromFile(file, "caveSpecular");
    } else if (name.includes("disp")) {
      loadTextureFromFile(file, "caveDisplacement");
    } else if (name.includes("translucency")) {
      loadTextureFromFile(file, "translucency");      
    }
  }
}

function handleFloorMaterialSet(e) {
  const files = e.target.files;

  for (let file of files) {
    const name = file.name.toLowerCase();

    if (name.includes("albedo") || name.includes("diffuse")) {
      loadTextureFromFile(file, "floor");
      
    } else if (name.includes("normal")) {
      loadTextureFromFile(file, "floorNormal");
    } else if (name.includes("rough")) {
      loadTextureFromFile(file, "floorRoughness");
    } else if (name.includes("ao") || name.includes("ambient")) {
      loadTextureFromFile(file, "floorAO");
    } else if (name.includes("specular") || name.includes("spec")) {
      loadTextureFromFile(file, "floorSpecular");
    } else if (name.includes("disp")) {
      loadTextureFromFile(file, "floorDisplacement");
    }
  }
}

function loadSwordOBJ(objText, materials) {
  const obj = parseOBJWithGroups(objText);
  const groups = {};

  for (const v of obj.vertices) {
    const key = v.material || "default";
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  const vaoExt = gl.getExtension("OES_vertex_array_object");

  // Compile unified PBR shader only
  if (!pbrProgram) {
    const vs = createShader(gl.VERTEX_SHADER, getShaderSource("pbr-vert"));
    const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("pbr-frag"));
    pbrProgram = createProgram(vs, fs);

    pbrProgram.aPosition = gl.getAttribLocation(pbrProgram, "aPosition");
    pbrProgram.aUV = gl.getAttribLocation(pbrProgram, "aUV");

    pbrProgram.uModel = gl.getUniformLocation(pbrProgram, "uModel");
    pbrProgram.uView = gl.getUniformLocation(pbrProgram, "uView");
    pbrProgram.uProjection = gl.getUniformLocation(pbrProgram, "uProjection");

    pbrProgram.uColor = gl.getUniformLocation(pbrProgram, "uColor");
    pbrProgram.uUseTexture = gl.getUniformLocation(pbrProgram, "uUseTexture");
    pbrProgram.uTex = gl.getUniformLocation(pbrProgram, "uTex");

    pbrProgram.uUseMR = gl.getUniformLocation(pbrProgram, "uUseMR");
    pbrProgram.uMetallicRoughness = gl.getUniformLocation(pbrProgram, "uMetallicRoughness");

    pbrProgram.uNormalMap = gl.getUniformLocation(pbrProgram, "uNormalMap");
    pbrProgram.uUseNormalMap = gl.getUniformLocation(pbrProgram, "uUseNormalMap");

  }

  swordBuffers = [];

  for (const matName in groups) {
    const vertexObjs = groups[matName];
    const posArray = [];
    const uvArray = [];

    for (const v of vertexObjs) {
      posArray.push(...v.position);
      uvArray.push(...v.uv);
    }

    const vao = vaoExt.createVertexArrayOES();
    vaoExt.bindVertexArrayOES(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(pbrProgram.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pbrProgram.aPosition);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(pbrProgram.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pbrProgram.aUV);

    vaoExt.bindVertexArrayOES(null);

    swordBuffers.push({
      vao,
      vertexCount: posArray.length / 3,
      textureKey: materials[matName]?.textureKey || null,
      metallicRoughnessKey: materials[matName]?.metallicRoughnessKey || null,
      normalMapKey: materials[matName]?.normalMapKey || null, 
      color: materials[matName]?.color || [1.0, 1.0, 1.0]
    });

  }

  console.log(" Sword model loaded and buffered (PBR only)");
}

function loadTorchOBJ(objText, materials) {
  const obj = parseOBJWithGroups(objText);

  const groups = {};
  for (const v of obj.vertices) {
    const key = v.material || "default";
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);  // Store the full vertex object { position, uv, material... }

  }

  let tipVertex = [0, -Infinity, 0];
  for (const groupName in groups) {
    for (const v of groups[groupName]) {
      if (v.position[1] > tipVertex[1]) {
        tipVertex = [...v.position];
      }
    }
  }

  const vaoExt = gl.getExtension("OES_vertex_array_object");

  if (!torchProgram) {
    const vs = createShader(gl.VERTEX_SHADER, getShaderSource("torch-vert"));
    const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("torch-frag"));
    torchProgram = createProgram(vs, fs);

    torchProgram.aPosition = gl.getAttribLocation(torchProgram, "aPosition");
    torchProgram.aUV = gl.getAttribLocation(torchProgram, "aUV");
    torchProgram.uModel = gl.getUniformLocation(torchProgram, "uModel");
    torchProgram.uView = gl.getUniformLocation(torchProgram, "uView");
    torchProgram.uProjection = gl.getUniformLocation(torchProgram, "uProjection");
    torchProgram.uColor = gl.getUniformLocation(torchProgram, "uColor");
    torchProgram.uUseTexture = gl.getUniformLocation(torchProgram, "uUseTexture");
    torchProgram.uTex = gl.getUniformLocation(torchProgram, "uTex");
  }

  torchBuffers = [];

  for (const matName in groups) {
    const vertexObjs = groups[matName];

    const posArray = [];
    const uvArray = [];

    for (const v of vertexObjs) {
      posArray.push(...v.position);
      uvArray.push(...v.uv);
    }

    const vao = vaoExt.createVertexArrayOES();
    vaoExt.bindVertexArrayOES(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posArray), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(torchProgram.aPosition);
    gl.vertexAttribPointer(torchProgram.aPosition, 3, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvArray), gl.STATIC_DRAW);
    if (!torchProgram.aUV)
      torchProgram.aUV = gl.getAttribLocation(torchProgram, "aUV");
    gl.enableVertexAttribArray(torchProgram.aUV);
    gl.vertexAttribPointer(torchProgram.aUV, 2, gl.FLOAT, false, 0, 0);

    vaoExt.bindVertexArrayOES(null);

    torchBuffers.push({
      vao,
      vertexCount: posArray.length / 3,
      textureKey: materials[matName]?.textureKey || null,
      color: materials[matName]?.color || [1.0, 1.0, 1.0]
    });
  }

  // Torch placement
  torchModelMatrices = [];
  
  const worldTip = vec3.create();  // Allocate once

  // Torch 1 — exact orientation from original code
  const m1 = mat4.create();
  mat4.translate(m1, m1, [1.5, 3.0, -6.2]);
  mat4.rotateX(m1, m1, Math.PI/3);
  
  mat4.scale(m1, m1, [1.0, 1.0, 1.0]);
  torchModelMatrices.push(m1);
  // === Compute light from tip of m1 ===
  vec3.transformMat4(worldTip, tipVertex, m1);

  torchLights.push({ position: vec3.clone(worldTip), color: [3.0, 1.5, 0.6], radius: 10.0 });
  const dir1 = vec3.transformMat3(vec3.create(), [0, 1, 0], mat3.fromMat4(mat3.create(), m1));
  vec3.normalize(dir1, dir1);
  torchInfos.push({ tip: vec3.clone(worldTip), dir: dir1 });

  // Torch 2 — new position, same orientation
  const m2 = mat4.create();
  mat4.translate(m2, m2, [3.9, 3.0, 4.0]);
  mat4.rotateX(m2, m2, -Math.PI/6);
  mat4.rotateZ(m2, m2, Math.PI/7);
  mat4.scale(m2, m2, [1.0, 1.0, 1.0]);
  torchModelMatrices.push(m2);

  vec3.transformMat4(worldTip, tipVertex, m2);

  torchLights.push({ position: vec3.clone(worldTip), color: [3.0, 1.5, 0.6], radius: 12.0 });
  const dir2 = vec3.transformMat3(vec3.create(), [0, 1, 0], mat3.fromMat4(mat3.create(), m2));
  vec3.normalize(dir2, dir2);
  torchInfos.push({ tip: vec3.clone(worldTip), dir: dir2 });

  // Torch 3 — new position, slight variation
  const m3 = mat4.create();
  mat4.translate(m3, m3, [-6.2, 3.0, 1.5]);
  mat4.rotateZ(m3, m3, -Math.PI/3);
  
  mat4.scale(m3, m3, [1.0, 1.0, 1.0]);
  torchModelMatrices.push(m3);

  vec3.transformMat4(worldTip, tipVertex, m3);

  torchLights.push({ position: vec3.clone(worldTip), color: [3.0, 1.5, 0.6], radius: 10.0 });
  const dir3 = vec3.transformMat3(vec3.create(), [0, 1, 0], mat3.fromMat4(mat3.create(), m3));
  vec3.normalize(dir3, dir3);
  torchInfos.push({ tip: vec3.clone(worldTip), dir: dir3 });
}

function loadPedestalOBJ(objText, materials) {
  const obj = parseOBJWithGroups(objText);
  const groups = {};

  for (const v of obj.vertices) {
    const key = v.material || "default";
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  // === SHADER SETUP (LOCAL TO PEDESTAL) ===
  const vs = createShader(gl.VERTEX_SHADER, getShaderSource("pedestal-vert"));
  const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("pedestal-frag"));
  const program = createProgram(vs, fs);


  program.aPosition = gl.getAttribLocation(program, "aPosition");
  program.aUV = gl.getAttribLocation(program, "aUV");
  program.uModel = gl.getUniformLocation(program, "uModel");
  program.uView = gl.getUniformLocation(program, "uView");
  program.uProjection = gl.getUniformLocation(program, "uProjection");
  program.uTex = gl.getUniformLocation(program, "uTex");
  program.uColor = gl.getUniformLocation(program, "uColor");
  program.uUseTexture = gl.getUniformLocation(program, "uUseTexture");
  program.uGlowStrength = gl.getUniformLocation(program, "uGlowStrength");
  program.uGlowStrength = gl.getUniformLocation(program, "uGlowStrength");
  program.uLightColor = gl.getUniformLocation(program, "uLightColor");
  program.uLightDir = gl.getUniformLocation(program, "uLightDir");

  program.uUseTorchLight = gl.getUniformLocation(program, "uUseTorchLight");
  program.uNumTorchLights = gl.getUniformLocation(program, "uNumTorchLights");
  program.uTorchPos = gl.getUniformLocation(program, "uTorchPos");
  program.uTorchColor = gl.getUniformLocation(program, "uTorchColor");
  program.uTorchRadius = gl.getUniformLocation(program, "uTorchRadius");

  program.uUseCrystalLight = gl.getUniformLocation(program, "uUseCrystalLight");
  program.uNumCrystalLights = gl.getUniformLocation(program, "uNumCrystalLights");
  program.uCrystalPos = gl.getUniformLocation(program, "uCrystalPos");
  program.uCrystalColor = gl.getUniformLocation(program, "uCrystalColor");
  program.uTime = gl.getUniformLocation(program, "uTime");
  program.uPulseOverride = gl.getUniformLocation(program, "uPulseOverride");



  pedestalProgram = program;
  pedestalBuffers = [];

  const vaoExt = gl.getExtension("OES_vertex_array_object");

  for (const matName in groups) {
    const vertexObjs = groups[matName];
    const posArray = [];
    const uvArray = [];

    for (const v of vertexObjs) {
      posArray.push(...v.position);
      uvArray.push(...v.uv);
    }

    const vao = vaoExt.createVertexArrayOES();
    vaoExt.bindVertexArrayOES(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.aPosition);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvArray), gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.aUV);

    vaoExt.bindVertexArrayOES(null);

    pedestalBuffers.push({
      vao,
      vertexCount: posArray.length / 3,
      textureKey: materials[matName]?.textureKey || null,
      color: materials[matName]?.color || [0.6, 0.6, 0.6],
    });
  }

  // Placement under the sword
  mat4.identity(pedestalModelMatrix);
  mat4.translate(pedestalModelMatrix, pedestalModelMatrix, [SWORD_POSITION[0], -2.3, SWORD_POSITION[2]]);
  mat4.scale(pedestalModelMatrix, pedestalModelMatrix, [0.002, 0.002, 0.002]);

  generatePedestalCrystals();

}

function loadFairyPair(closedText, openText) {
  const closed = parseOBJWithGroups(closedText);
  const open = parseOBJWithGroups(openText);
  const vertexCount = closed.vertices.length;
  const posClosed = new Float32Array(vertexCount * 3);
  const posOpen   = new Float32Array(vertexCount * 3);
  const isCenter  = new Float32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const vClosed = closed.vertices[i];
    const vOpen   = open.vertices[i];

    posClosed.set(vClosed.position, i * 3);
    posOpen.set(vOpen.position, i * 3);

    const name = vClosed.object?.toLowerCase() || "";
    isCenter[i] = name.includes("object_7") ? 0.0 : 1.0;
  }
  // First, compile + link shader program
  const vertSrc = document.getElementById("fairy-vert").textContent;
  const fragSrc = document.getElementById("fairy-frag").textContent;
  const vs = createShader(gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl.FRAGMENT_SHADER, fragSrc);
  fairyProgram = createProgram(vs, fs);

  // Then build VAOs using that program
  fairyBuffers = {
    center: createFairyVAO(posClosed, posOpen, isCenter, 1.0),
    wings:  createFairyVAO(posClosed, posOpen, isCenter, 0.0),
    vertexCountCenter: isCenter.filter(x => x === 1.0).length,
    vertexCountWings:  isCenter.filter(x => x === 0.0).length
  };
}

function parseOBJWithGroups(text) {               // parses raw content of obj file and builds GPU buffers
  const lines = text.trim().split('\n');
  const positions = [];
  const uvs = [];
  const vertices = [];

  let currentGroup = "";
  let currentObject = "";
  let currentMaterial = "";

  for (const line of lines) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      positions.push([parseFloat(x), parseFloat(y), parseFloat(z)]);
    } else if (line.startsWith("vt ")) {
      const [, u, v] = line.trim().split(/\s+/);
      uvs.push([parseFloat(u), parseFloat(v)]);
    } else if (line.startsWith("f ")) {
      const tokens = line.slice(2).trim().split(/\s+/);

      for (const token of tokens) {
        const [vIdx, vtIdx] = token.split("/").map(x => parseInt(x) - 1);
        vertices.push({
          position: positions[vIdx],
          uv: uvs[vtIdx],
          group: currentGroup,
          object: currentObject,
          material: currentMaterial
        });
      }
    } else if (line.startsWith("g ")) {
      currentGroup = line.slice(2).trim();
    } else if (line.startsWith("o ")) {
      currentObject = line.slice(2).trim();
    } else if (line.startsWith("usemtl ")) {
      currentMaterial = line.slice(7).trim();
    }
  }
  return { vertices };
}

function parseMTL(text) {                         // convert mtl text into structured js object
  const lines = text.split('\n');
  const materials = {};
  let current = null;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 0) continue;

    if (parts[0] === 'newmtl') {
      current = parts[1];
      materials[current] = {};
    } else if (!current) {
      continue;
    }

    const mat = materials[current];

    if (parts[0] === 'Kd') {
      mat.color = parts.slice(1).map(parseFloat);
    } else if (parts[0] === 'map_Kd') {
      mat.map_Kd = parts[1];
    } else if (parts[0] === 'map_Ke') {
      mat.map_Ke = parts[1];
    } else if (parts[0] === 'map_Pr') {
      mat.map_Pr = parts[1];
    } else if (
        parts[0] === 'map_Bump' ||
        parts[0] === 'bump' ||
        parts[0] === 'map_bump' ||
        parts[0] === 'map_normal'
      ) {
        // Grab the first image-looking argument after any optional flags
        const pathStart = parts.findIndex(p => p.match(/\.(png|jpg|jpeg)$/i));
        if (pathStart !== -1) {
          mat.map_Bump = parts.slice(pathStart).join(" ");
        }
      }
  }
  return materials;
}



//////// 4. GEOMETRY GENERATION ////////

function generateCaveDomeMesh(res = 64, radius = 6) {
  const positions = [];
  const uvs = [];
  const indices = [];

  // Generate vertices (res + 1 columns to ensure wrap)
  for (let y = 0; y <= res; y++) {
  const v = y / res;
  const theta = v * Math.PI / 2;

    for (let x = 0; x <= res; x++) {
      const u = x === res ? 0.0 : x / res;

      const phi = u * 2 * Math.PI;

      const xp = Math.cos(phi) * Math.sin(theta);
      const zp = Math.sin(phi) * Math.sin(theta);

     
      const yp = Math.cos(theta);


      const finalX = xp * radius * 1.3;
      let finalY = yp * radius * 1.8 - 2.5;
      const finalZ = zp * radius * 1.3;

      if (y === res) {
       
        domeBaseRing.push([finalX, -2.5, finalZ]);
      }

      positions.push(...roundVertex([finalX, finalY, finalZ]));

      uvs.push(u, v);
    }
  }

  // Index triangles (no % needed, res+1 handles wrap)
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const cols = res + 1;

      const i0 = y * cols + x;
      const i1 = y * cols + (x + 1);
      const i2 = (y + 1) * cols + x;
      const i3 = (y + 1) * cols + (x + 1);


      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length
  };
}

function generateRockMesh() {
  const positions = [];
  const uvs = [];
  const indices = [];

  const rings = 6;
  const segments = 8;
  const radius = 0.5;

  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;

    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;

      const noise = 1 + (rand() - 0.5) * 0.3;

      const xp = Math.sin(theta) * Math.cos(phi);
      const yp = Math.cos(theta);
      const zp = Math.sin(theta) * Math.sin(phi);

      positions.push(xp * radius * noise, yp * radius * noise, zp * radius * noise);
      uvs.push(u, v);
    }
  }

  const cols = segments + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const i0 = y * cols + x;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length
  };
}

function generateRockRing(floorRing, radiusOffset = 0.0, jitter = 0.02, count = 256) {
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const ringIndex = Math.floor(t * floorRing.length);
    const [ox, oy, oz] = floorRing[ringIndex];

    const r = Math.sqrt(ox * ox + oz * oz);
    const angle = Math.atan2(oz, ox);

    const offsetR = r + radiusOffset + (rand() - 0.5) * (jitter * 2.0);

    const rx = Math.cos(angle) * offsetR;
    const rz = Math.sin(angle) * offsetR;
    const ry = oy + 0.005 + (rand() - 0.5) * 0.015;

    // Vary scale 
    let baseScale = rand();
    if (baseScale < 0.2) baseScale *= 0.5; // very small
    else if (baseScale > 0.8) baseScale *= 1.5; // very large

    const scale = (0.3 + baseScale * 0.6) * 1.9;  

    rocks.push({ position: [rx, ry, rz], scale });
  }
  return rocks;
}

function generatePointyCrystalGeometry(segments = 6, baseRadius = 0.2, height = 1.0) {
  const positions = [];
  const indices = [];
  const uvs = [];

  // Base ring
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const x = Math.cos(angle) * baseRadius;
    const z = Math.sin(angle) * baseRadius;
    positions.push(x, 0, z);
    uvs.push((x / baseRadius + 1) / 2, (z / baseRadius + 1) / 2);
  }

  // Top ring 
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const x = Math.cos(angle) * baseRadius * 0.4;
    const z = Math.sin(angle) * baseRadius * 0.4;
    positions.push(x, height * 0.8, z);
    uvs.push((x / baseRadius + 1) / 2, (z / baseRadius + 1) / 2);
  }

  // Tip vertex
  positions.push(0, height, 0);
  uvs.push(0.5, 1.0);
  const tipIndex = 2 * segments;

  // Side faces
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = i;
    const b1 = next;
    const t0 = i + segments;
    const t1 = next + segments;

    indices.push(b0, b1, t1);
    indices.push(b0, t1, t0);
  }

  // Top faces connecting to tip
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(segments + i, tipIndex, segments + next);
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length
  };
}

function generateRockCrystalGeometry() {
  return generateRockMesh(); 
}

function generatePedestalCrystals() {
  const pedestalCenter = [SWORD_POSITION[0], -2.25, SWORD_POSITION[2]];
  const radius = 0.25;
  const count = 8;
  const yJitter = 0.02;
  const scale = 0.12;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = pedestalCenter[0] + radius * Math.cos(angle);
    const z = pedestalCenter[2] + radius * Math.sin(angle);
    const y = pedestalCenter[1] + (Math.random() * 2 - 1) * yJitter;

    crystals.push({
      position: [x, y, z],
      up: [0, 1, 0], // required for orientation
      scale: scale * (0.8 + Math.random() * 0.4),
      rotation: Math.random() * Math.PI * 2,
      type: "rock"  
    });
  }
}

function generateGrid(size = 32) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      const u = x / size;
      const v = y / size;
      positions.push(u * 6 - 3, v * 6 - 3, 0);
      uvs.push(u, v);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * (size + 1) + x;
      indices.push(i, i + 1, i + size + 1);
      indices.push(i + 1, i + size + 2, i + size + 1);
    }
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length
  };
}

for (let i = 0; i < 4; i++) {
  const angle = rand() * 2 * Math.PI;
  const radius = 4 + rand() * 2;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  bumpCenters.push(x, 0.0, z);
  bumpHeights.push(0.8 + rand() * 0.5);  // bigger
  bumpRadii.push(2.0 + rand() * 1.0);    // wide
}

function generateVolumetricFloorWithDepression(caveGeometry, {
  height = 0.6,
  radialSteps = 10,
  depressionRadius = 5.0,
  depressionDepth = 2.0,
  uvScale = 3.0
  } = {}) {
  

  // Flatten Y and extract outer radius
  const outer = domeBaseRing.map(p => roundVertex(p));
  const outerRadius = Math.max(...outer.map(([x, _, z]) => Math.hypot(x, z)));

  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = [];

  // TOP SURFACE (with central depression)
  for (let r = 0; r <= radialSteps; r++) {
    const t = r / radialSteps;
    const ringRow = [];
    
    for (let i = 0; i < outer.length; i++) {
      const [ox, oy, oz] = outer[i];
      const x = ox * (1 - t);
      const z = oz * (1 - t);
      const rXZ = Math.hypot(x, z);
      // Irregular noise-based dip
      const angle = Math.atan2(z, x);
      const noise = Math.sin(angle * 3.0 + Math.cos(x * z * 2.3)) * 0.15;
      const angled = Math.atan2(z, x);
      const wobble = Math.sin(angled * 4.0 + Math.cos(rXZ * 2.3)) * 0.6;
      const bumpyRadius = depressionRadius + wobble;
      const fade = smoothstep(0.0, bumpyRadius, rXZ);
      const bumpProfile = Math.pow(1 - fade, 0.1); 
      const dip = -depressionDepth * bumpProfile + noise * bumpProfile;
      const y = oy + dip + 0.1;

      ringRow.push([x, y, z]);
      uvs.push(x / (uvScale * outerRadius) + 0.5, z / (uvScale * outerRadius) + 0.5);
    }
    rows.push(ringRow);
  }
  // Raise flat rectangular rocky path across water
  const pathXMin = 0.5;
  const pathXMax = 1.2;  
  const pathZMin = -2.5;
  const pathZMax = 3.7;    

  const pathHeight = depressionDepth + 0.05;
  const fadeEdge = 1.0;  // smooth transition at the edges

  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < rows[r].length; i++) {
      const p = rows[r][i];
      const x = p[0], z = p[2];

      // Compute horizontal distances to edges
      const dx = Math.max(0.0, Math.max(pathXMin - x, x - pathXMax));
      const dz = Math.max(0.0, Math.max(pathZMin - z, z - pathZMax));
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Smooth raise
      const fade = smoothstep(fadeEdge, 0.0, dist);
      p[1] += fade * pathHeight;
    }
  }

  // Add top surface positions
  for (const row of rows) {
    for (const p of row) positions.push(...p);
  }

  const vertsPerRow = outer.length;

  // Triangulate top surface
  for (let y = 0; y < radialSteps; y++) {
    for (let x = 0; x < vertsPerRow - 1; x++) {
      const i0 = y * vertsPerRow + x;
      const i1 = i0 + 1;
      const i2 = i0 + vertsPerRow;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const topVertexCount = positions.length / 3;

  // Duplicate bottom
  for (let i = 0; i < topVertexCount; i++) {
    const x = positions[i * 3 + 0];
    const y = positions[i * 3 + 1] - height;
    const z = positions[i * 3 + 2];
    positions.push(x, y, z);
    uvs.push(uvs[i * 2 + 0], uvs[i * 2 + 1]);
  }

  // Side walls 
  for (let x = 0; x < vertsPerRow - 1; x++) {
    const topA = x;
    const topB = x + 1;
    const botA = topA + topVertexCount;
    const botB = topB + topVertexCount;

    indices.push(topA, botB, botA);
    indices.push(topA, topB, botB);
  }

  // Bottom cap
  const baseStart = topVertexCount;
  const center = [0, outer[0][1] - height, 0];

  const centerIdx = positions.length / 3;
  positions.push(...center);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < vertsPerRow - 1; i++) {
    const a = baseStart + i;
    const b = baseStart + i + 1;
    indices.push(centerIdx, b, a);
  }
  
  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length,
    rings: rows
    };
}

function generateMushroomGeometry(segments = 24, capRadius = 0.4, stemHeight = 0.5, capHeight = 0.2) {
  const positions = [];
  const uvs = [];
  const indices = [];

  // Generate stem (cylinder)
  for (let y = 0; y <= 1; y++) {
    const h = y * stemHeight;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * 2 * Math.PI;
      const x = Math.cos(angle) * 0.1;
      const z = Math.sin(angle) * 0.1;
      positions.push(x, h, z);
      uvs.push(i / segments, y);
    }
  }

  const cols = segments + 1;
  for (let i = 0; i < segments; i++) {
    const i0 = i;
    const i1 = i + 1;
    const i2 = i + cols;
    const i3 = i2 + 1;
    indices.push(i0, i2, i1);
    indices.push(i1, i2, i3);
  }

  const stemVertexCount = positions.length/3;  

  // Generate cap (hemisphere)
  const capSegments = 12;
  for (let y = 0; y <= capSegments; y++) {
    const v = y / capSegments;
    const theta = v * Math.PI / 2;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const angle = u * 2 * Math.PI;
      const x = Math.cos(angle) * Math.sin(theta) * capRadius;
      const yOffset = stemHeight + Math.cos(theta) * capHeight;
      const z = Math.sin(angle) * Math.sin(theta) * capRadius;
      positions.push(x, yOffset, z);
      uvs.push(u, v);
    }
  }

  const capBase = stemVertexCount;
  for (let y = 0; y < capSegments; y++) {
    for (let i = 0; i < segments; i++) {
      const i0 = capBase + y * (segments + 1) + i;
      const i1 = i0 + 1;
      const i2 = i0 + segments + 1;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length,
    capStartIndex: stemVertexCount
  };
}

function generateWaterPlane(res = 64, radius = 7.0, y = -2.48) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= res; row++) {
    for (let col = 0; col <= res; col++) {
      const x = (col / res) * radius * 2 - radius;
      const z = (row / res) * radius * 2 - radius;
      positions.push(x, y, z);
      uvs.push(col / res, row / res);
    }
  }

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const i = row * (res + 1) + col;
      indices.push(i, i + 1, i + res + 1);
      indices.push(i + 1, i + res + 2, i + res + 1);
    }
  }

  return {
    position: new Float32Array(positions),
    uv: new Float32Array(uvs),
    index: new Uint16Array(indices),
    vertexCount: indices.length,
    gridSize: res + 1,
    vertexCountTotal: (res + 1) * (res + 1),
    radius: radius
  };
}

function generateDomeCrystals(clusterCount = 30) {
  if (!caveGeometry) return;

  const pos = caveGeometry.position;
  const idx = caveGeometry.index;

  for (let i = 0; i < clusterCount; i++) {
    const triIndex = Math.floor(rand() * (idx.length / 3)) * 3;

    const i0 = idx[triIndex] * 3;
    const i1 = idx[triIndex + 1] * 3;
    const i2 = idx[triIndex + 2] * 3;

    const v0 = [pos[i0], pos[i0 + 1], pos[i0 + 2]];
    const v1 = [pos[i1], pos[i1 + 1], pos[i1 + 2]];
    const v2 = [pos[i2], pos[i2 + 1], pos[i2 + 2]];

    let u = rand(), v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }

    const rawP = [
      v0[0] + u * (v1[0] - v0[0]) + v * (v2[0] - v0[0]),
      v0[1] + u * (v1[1] - v0[1]) + v * (v2[1] - v0[1]),
      v0[2] + u * (v1[2] - v0[2]) + v * (v2[2] - v0[2]),
    ];

    const p = displaceInward(rawP);
    const y = p[1];

    const edge1 = vec3.subtract([], v1, v0);
    const edge2 = vec3.subtract([], v2, v0);
    const n = vec3.cross([], edge1, edge2);
    vec3.normalize(n, n);

    if (y > 4.0) {
      const inward = vec3.negate([], n);
      const count = 3 + Math.floor(rand() * 5);
      generateCluster(p, inward, count, "pointy");

      const tipOffset = [0, 1.0, 0]; // crystal height is ~1.0
      const dropOrigin = vec3.add([], p, tipOffset);
      dropSources.push(dropOrigin);

    } else {
      crystals.push({
        position: p,
        up: n,
        scale: 0.3 + rand() * 0.3,
        rotation: rand() * Math.PI * 2,
        type: "rock"
      });
    }
  }
}

function generateCluster(center, up, count, type = "pointy", baseScale = 1.0) {

  const isTopCluster = up[1] < -0.5;  // crude heuristic

  for (let i = 0; i < count; i++) {
    const spread = isTopCluster ? 0.2 : 0.4;  // smaller spread near dome top
    const offset = [
      (rand() - 0.5) * spread,
      isTopCluster ? 0 : (rand() - 0.5) * spread,
      (rand() - 0.5) * spread
    ];

    const pos = [
      center[0] + offset[0],
      center[1] + offset[1],
      center[2] + offset[2]
    ];

    crystals.push({
      position: pos,
      up: up,
      scale: baseScale * (0.9 + rand() * 0.12),
      rotation: rand() * Math.PI * 2,
      type: type
    });
  }
}

function getBottomRingFromCave(caveGeometry, res = 64) {
  const positions = caveGeometry.position;
  const ring = [];

  const start = res * (res + 1);
  const count = res + 1;

  for (let i = 0; i < count; i++) {
    const idx = (start + i) * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];
    ring.push([x, y, z]);
  } 
  return ring;
}



//////// 5. BUFFER SETUP ////////

function setupWater() {
  const vs = createShader(gl.VERTEX_SHADER, getShaderSource("water-vert"));
  const fs = createShader(gl.FRAGMENT_SHADER, getShaderSource("water-frag"));
  waterProgram = createProgram(vs, fs);

  // Generate mesh and get correct size info
  const mesh = generateWaterPlane();
  rippleGridSize = mesh.gridSize;
  const vertexCountTotal = mesh.vertexCountTotal;

  // Allocate ripple simulation buffers using correct size
  rippleHeights = new Float32Array(vertexCountTotal).fill(0);
  rippleVelocities = new Float32Array(vertexCountTotal).fill(0);
  rippleNormals = new Float32Array(vertexCountTotal * 3).fill(0);
  
  // tiny noise : prevents simulation from starting in an unrealistically perfect state
  for (let i = 0; i < rippleHeights.length; i++) {
    rippleHeights[i] += (Math.random() - 0.5) * 0.0001;
  }

  // Create GL buffers
  const pos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.position, gl.STATIC_DRAW);

  const uv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uv);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);

  const idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);

  const heightBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, heightBuf);
  gl.bufferData(gl.ARRAY_BUFFER, rippleHeights, gl.DYNAMIC_DRAW);

  const normalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, rippleNormals, gl.DYNAMIC_DRAW);

  // Store in waterBuffers object
  waterBuffers = {
    position: pos,
    uv: uv,
    index: idx,
    vertexCount: mesh.vertexCount,
    height: heightBuf,
    normal: normalBuf,
    radius: 7.0  
  };

  // Set shader attributes and uniforms (also reflection)
  waterProgram.aPosition = gl.getAttribLocation(waterProgram, "aPosition");
  waterProgram.aUV = gl.getAttribLocation(waterProgram, "aUV");
  waterProgram.uProjection = gl.getUniformLocation(waterProgram, "uProjection");
  waterProgram.uView = gl.getUniformLocation(waterProgram, "uView");
  waterProgram.uModel = gl.getUniformLocation(waterProgram, "uModel");
  waterProgram.uLightDir = gl.getUniformLocation(waterProgram, "uLightDir");
  waterProgram.uLightColor = gl.getUniformLocation(waterProgram, "uLightColor");
  waterProgram.uReflectionTex = gl.getUniformLocation(waterProgram, "uReflectionTex");
  waterProgram.uResolution = gl.getUniformLocation(waterProgram, "uResolution");
  waterProgram.uReflectionVP = gl.getUniformLocation(waterProgram, "uReflectionVP");
  waterProgram.uDistortionMap = gl.getUniformLocation(waterProgram, "uDistortionMap");
  waterProgram.uCameraPosition = gl.getUniformLocation(waterProgram, "uCameraPosition");
  waterProgram.aHeight = gl.getAttribLocation(waterProgram, "aHeight");
  waterProgram.uGridSpacing = gl.getUniformLocation(waterProgram, "uGridSpacing");
  waterProgram.aNormal = gl.getAttribLocation(waterProgram, "aNormal");
}

function setupCaveDomeBuffers() {
  const mesh = generateCaveDomeMesh();
  caveGeometry = mesh; // store raw vertex/index data
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.position, gl.STATIC_DRAW);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);

  caveMesh = {
    position: posBuf,
    uv: uvBuf,
    index: idxBuf,
    vertexCount: mesh.vertexCount,
  };
}

function setupFloorBuffers() {
  floorMesh= generateVolumetricFloorWithDepression(caveGeometry, {
    height: 3.0,
    res: 64,
    radialSteps: 10,
    depressionRadius: 5.0,
    depressionDepth: 2.0,  
    uvScale: 3.0
  })
  const mesh = floorMesh; // Use the generated floor mesh directly
  
  crystals= []; // Reset crystals for new floor

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.position, gl.STATIC_DRAW);

  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);

  const idxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);

  floorBuffers = {
    position: posBuffer,
    uv: uvBuffer,
    indices: idxBuffer,
    vertexCount: mesh.vertexCount
  };

  // Mushrooms along the path 
  const pathXMin = 0.5;
  const pathXMax = 1.0;
  const pathZMin = -2.2;
  const pathZMax = 3.5;

  for (let i = 0; i < 8; i++) {
    const x = pathXMin + rand() * (pathXMax - pathXMin);
    const z = pathZMin + rand() * (pathZMax - pathZMin);

    // Find closest vertex on floor for y
    let closestY = -2.5;
    let minDist = Infinity;
    const verts = floorMesh.position;
    for (let j = 0; j < verts.length; j += 3) {
      const dx = verts[j] - x;
      const dz = verts[j + 2] - z;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestY = verts[j + 1];
      }
    }

     if (minDist < 0.5 * 0.5) {  
      mushrooms.push({
        position: [x, closestY + 0.01, z],
        scale: 0.2 + rand() * 0.2,
        rotation: rand() * Math.PI * 2
      });
    }
  }

  // Crystals on water floor 
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() * 2 - 1) * 3.5;
    const z = (Math.random() * 2 - 1) * 3.5;

    // Only add inside radius
    if (Math.hypot(x, z) > 6.8) continue;

    // Sample height from floorMesh
    let closestY = WATER_HEIGHT;
    let minDist = Infinity;
    const verts = floorMesh.position;
    for (let j = 0; j < verts.length; j += 3) {
      const dx = verts[j] - x;
      const dz = verts[j + 2] - z;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestY = verts[j + 1];
      }
    }
    if (minDist < 0.5 * 0.1) { 
      crystals.push({
        position: [x, closestY + 0.01, z],
        up: [0, 1, 0],
        scale: 0.04 + Math.random() * 0.05,
        rotation: Math.random() * Math.PI * 2,
        type: "rock"
      });
    }
  }


  // Rock ring setup 
  surfaceRing = mesh.rings[0]; // outer ring of the floor top surface
  rockInstances = [];
  const occupied = new Set();  // track which indices are used for rocks

  for (let i = 0; i < surfaceRing.length; i++) {
    if (rand() < 0.65) {  // 65% chance to place a rock
      const [x, y, z] = surfaceRing[i];
      const r = Math.hypot(x, z);
      const inward = 0.4 + rand() * 0.5;
      const rx = x * (1 - inward / r);
      const rz = z * (1 - inward / r);
      const ry = y + 0.2;
      const scale = 0.9 + rand() * 0.8;

      rockInstances.push({ position: [rx, ry, rz], scale });
      occupied.add(i);  // mark index as used
    }
  }

  // Generate clusters around the surface ring
  for (let i = 0; i < surfaceRing.length; i++) {
    if (occupied.has(i)) continue;  // skip rock-filled slots

    const [x, y, z] = surfaceRing[i];
    const r = Math.hypot(x, z);
    const inward = 0.7 + rand() * 0.5;
    const rx = x * (1 - inward / r);
    const rz = z * (1 - inward / r);
    const ry = y - 0.5;

    const center = [rx, ry, rz];
    const up = [0, 1, 0];

    const clusterSize = 2 + Math.floor(rand() * 2);
    const baseScale = rand() < 0.2 ? 1.5 : 1.0;  // 20% chance to make the whole cluster bigger
    generateCluster(center, up, clusterSize, "ring", baseScale);
  }
  
  // Manual glowing crystal cluster at path start  ------ remove
  const crystalOccupancy = new Set();
  for (const c of crystals) {
    const key = `${Math.round(c.position[0] * 10)},${Math.round(c.position[2] * 10)}`;
    crystalOccupancy.add(key);
  }

  rockMesh = generateRockMesh();

  rockBuffers = {
    position: gl.createBuffer(),
    uv: gl.createBuffer(),
    index: gl.createBuffer(),
  };


  gl.bindBuffer(gl.ARRAY_BUFFER, rockBuffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, rockMesh.position, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, rockBuffers.uv);
  gl.bufferData(gl.ARRAY_BUFFER, rockMesh.uv, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rockBuffers.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, rockMesh.index, gl.STATIC_DRAW);

  rockBuffers.vertexCount = rockMesh.vertexCount;

  for (let i = 0; i < surfaceRing.length; i++) {
    if (occupied.has(i)) continue;
    const [x, y, z] = surfaceRing[i];

    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (crystalOccupancy.has(key)) continue;  // skip if a crystal is nearby

    if (rand() < 0.6) {
      const r = Math.hypot(x, z);
      const inward = 1.0 + rand() * 0.5;
      const px = x * (1 - inward / r);
      const pz = z * (1 - inward / r);
      const py = y;
      const scale = 0.2 + rand() * 0.4;

      mushrooms.push({
        position: [px, py, pz],
        scale: scale,
        rotation: rand() * Math.PI * 2
      });
    }
  }  
}

function setupCrystalBuffers() {
  const pointyMesh = generatePointyCrystalGeometry();
  const rockMeshData = generateRockCrystalGeometry();

  pointyCrystalBuffers = createMeshBuffers(pointyMesh);
  rockCrystalBuffers = createMeshBuffers(rockMeshData);
}

function setupMushroomBuffers() {
  const mushroomMesh = generateMushroomGeometry();
  mushroomBuffers = createMeshBuffers(mushroomMesh);
}

function createMeshBuffers(mesh) {
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.position, gl.STATIC_DRAW);

  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);

  const idxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);

  return {
    position: posBuffer,
    uv: uvBuffer,
    indices: idxBuffer,
    vertexCount: mesh.vertexCount
  };
  
}

function createFairyVAO(posClosed, posOpen, isCenter, centerFlag) {
  const vaoExt = gl.getExtension("OES_vertex_array_object");
  const vao = vaoExt.createVertexArrayOES();
  vaoExt.bindVertexArrayOES(vao);

  const indices = [];
  for (let i = 0; i < isCenter.length; i++) {
    if (Math.abs(isCenter[i] - centerFlag) < 0.01) {  // float check
      indices.push(i);
    }
  }

  // LOGGING: Confirm vertex count per group
  console.log(`Creating fairy VAO for centerFlag=${centerFlag}: ${indices.length} vertices`);

  const posClosedFiltered = new Float32Array(indices.length * 3);
  const posOpenFiltered = new Float32Array(indices.length * 3);
  const tagFiltered = new Float32Array(indices.length);

  for (let i = 0; i < indices.length; i++) {
    const j = indices[i];
    posClosedFiltered.set(posClosed.slice(j * 3, j * 3 + 3), i * 3);
    posOpenFiltered.set(posOpen.slice(j * 3, j * 3 + 3), i * 3);
    tagFiltered[i] = isCenter[j];  // 1.0 or 0.0
  }

  function bufferAttrib(data, attrName, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(fairyProgram, attrName);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  }

  const posA = bufferAttrib(posClosedFiltered, "aClosed", 3);
  const posB = bufferAttrib(posOpenFiltered, "aOpen", 3);
  const tag  = bufferAttrib(tagFiltered, "aIsCenter", 1);

  vaoExt.bindVertexArrayOES(null);

  return {
    vao,
    posClosed: posA,
    posOpen: posB,
    isCenter: tag,
    vertexCount: indices.length
  };
}



//////// 6. DRAWING / RENDERING ////////

// == DRAWSCENE == 
function drawScene(timestamp) {

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  // clears screen and depth buffer

  updateCamera(timestamp);    // updates camera 
  time = timestamp * 0.001;   // converts timestamp to seconds
  updateDrops(time);          // updates falling water drops

  // SWORD ANIMATION LOGIC 
  if (swordState === 1) {
    swordY += 0.008;                       // if sword is rising, move upwards by small fixed step each frame
    if (swordY >= SWORD_FINAL_Y) {         // clamp sword at its final Y position , mark state 2 as fully extracted (allow rotation and aura effects)
      swordY = SWORD_FINAL_Y;
      swordState = 2; 
    }
  } else if (swordState === -1) {          // if sword is retracting, lower it downward
    swordY -= 0.008;
    if (swordY <= -2.0) {                  // once it reaches its base, snap to min Y. Set state to embedded (0) and reset the rotation angle to 0. 
      swordY = -2.0;
      swordState = 0; 
      swordRotation = 0; 
    }
  }
  if (swordState > 0) {                    // while sword is above ground, it slowly rotates around Y. 
    swordRotation += 0.02;  
  }

  // CONSTANTS FOR SWORD EXTRACTION 
  const minY = -2.0;
  const maxY = SWORD_FINAL_Y;
  const normalizedY = Math.max(0, Math.min(1, (swordY - minY) / (maxY - minY))); // maps curr sword height to [0,1] based on range of movement, then clamps
  // Interpolates smoothly fairy attraction level based on sword position 
  fairyAttraction += (normalizedY - fairyAttraction) * 0.05; // exponential smoothing (lerp) : slowly bends fairyattr. towards normalizedY
                                                             // if sword is down (normY = 0) fairies are calm, if up (normY = 1) fairies go wild

  // GLOW WHEN DROPS HIT WATER
  if (currentGlowPosition && time - currentGlowTime < 0.1) {                                    // check if ripple glow should be visible this frame 
    gl.useProgram(waterProgram);                                                                // currentglowpos holds world-space XZ location where glow occured
    gl.uniform2fv(gl.getUniformLocation(waterProgram, "uGlowPosition"), currentGlowPosition);   // "uGlowPos" sent to frag shader to det hm glow to apply at each pixel
    gl.uniform1f(gl.getUniformLocation(waterProgram, "uGlowTime"), currentGlowTime);            // currentglowtime stores time pulse began 
  } else {                                                                                      // glow lasts 0.1s
    gl.useProgram(waterProgram);
    gl.uniform1f(gl.getUniformLocation(waterProgram, "uGlowTime"), -1.0);                       // disables glow
  }
 
  // HANDLE RIPPLE DISTORTION (used in frag to distort reflection on water)
  const normalPixels = new Uint8Array(rippleGridSize * rippleGridSize * 4);   // creates flat array to hold RGBA values 4e grid cell 
  for (let i = 0; i < rippleGridSize * rippleGridSize; i++) {                 // loops over each vertex in ripple grid, reads x and z components of vertex normal
    const x = rippleNormals[i * 3 + 0];                                       // ('cause we want only horizontal distortion)
    const z = rippleNormals[i * 3 + 2]; 
    normalPixels[i * 4 + 0] = (x * 0.5 + 0.5) * 255;                          // maps x and z from [-1, 1] to [0, 255] for storage in texture 
    normalPixels[i * 4 + 1] = (z * 0.5 + 0.5) * 255;                          // alpha channel : 255 : fully opaque
    normalPixels[i * 4 + 2] = 128;
    normalPixels[i * 4 + 3] = 255;
  }

  gl.bindTexture(gl.TEXTURE_2D, rippleDistortionTex);                         // upload the updated normalPixels to the rippleDistortionTex
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, rippleGridSize, rippleGridSize, gl.RGBA, gl.UNSIGNED_BYTE, normalPixels);
 
  gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.height);                        // push ripple data to GPU 
  gl.bufferData(gl.ARRAY_BUFFER, rippleHeights, gl.DYNAMIC_DRAW);             // send updated height values of water surface to vert shader
  gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.normal);                        
  gl.bufferData(gl.ARRAY_BUFFER, rippleNormals, gl.DYNAMIC_DRAW);             // send updated normals 


  // SHOW CAM COORDS
  const x = camera.position[0].toFixed(2);
  const y = camera.position[1].toFixed(2);
  const z = camera.position[2].toFixed(2);
  document.getElementById("cameraInfo").textContent = `X: ${x}  Y: ${y}  Z: ${z}`;

  
  // SETUP PROJECTION AND VIEW MATRIX FOR 3D RENDERING
  const projection = mat4.create();
  const view = mat4.create();
  mat4.perspective(projection, Math.PI / 3, canvas.width / canvas.height, 0.3, 30);
  const front = [                                        // computes forward direction based on pitch and yaw
    Math.cos(camera.pitch) * Math.cos(camera.yaw),
    Math.sin(camera.pitch),
    Math.cos(camera.pitch) * Math.sin(camera.yaw),
  ];
  const center = [                                       // defines target point cam is looking at                       
    camera.position[0] + front[0],
    camera.position[1] + front[1],
    camera.position[2] + front[2],
  ];
  mat4.lookAt(view, camera.position, center, [0, 1, 0]); // uses eye, center and orientation reference (up : [0,1,0]). Build a view matrix that transforms 
                                                         // world coords into camera (view) space.

  // RIPPLES UPDATE  
  updateRipples(0.016);  // fixed timestep
  updateRippleNormals(); // recalculate normals from heightmap

  // SWORD MODEL MATRIX UPDATE 
  mat4.identity(swordModelMatrix);                                                                    // start from identity matrix
  mat4.translate(swordModelMatrix, swordModelMatrix, [SWORD_POSITION[0], swordY, SWORD_POSITION[2]]); // position sword in world space 
  mat4.rotateY(swordModelMatrix, swordModelMatrix, swordRotation);                                    // apply Y rotation 
  mat4.scale(swordModelMatrix, swordModelMatrix, [SWORD_SCALE, SWORD_SCALE, SWORD_SCALE]);            // scale sword uniformely in all directions

  // DRAW CAVE
  drawCave(projection, view); 

  // DRAW FLOOR
  drawFloor(projection, view); 

  // DRAW CRYSTALS
  drawCrystals(projection, view);

  // DRAW DROPS 
  drawDrops(projection, view);

  // DRAW ROCKS 
  if (rockBuffers && rockInstances.length > 0) {     // ensures rockbuffers exist and rock instances contains at least 1 rock to draw
    drawRocks(projection, view);
  }

  // DRAW MUSHROOMS
  drawMushrooms(projection,view);

  // DRAW FAIRIES (w. animation logic)
  fairyFlapTime += 0.016;                            // ~ 60 FPS, used to compute smooth sinusoidal flapping motion
  if (fairyProgram && fairyBuffers) {
    drawAllNavis(projection,view);
  }

  // DRAW TORCHES
  drawTorches(projection,view);
  
  // DRAW SWORD
  drawSword(projection, view);

  // SWORD AURA 
  if (swordState === 2 && auraProgram && auraBuffer) {                      // if sword extracted and both aura shader program and geometry buffer exist, render aura
    gl.useProgram(auraProgram);
    const model = mat4.create();
    mat4.translate(model, model, [SWORD_POSITION[0], swordY, SWORD_POSITION[2]]);    // moves aura to sword's current position
    mat4.rotateX(model, model, Math.PI/2);                                           // makes it rotate to make vertical
    mat4.scale(model, model, [1.0, 1.0, 2.0]);                                       // scale aura

    gl.uniformMatrix4fv(auraProgram.uModel, false, model);                           // send model, view, proj matrices to shader for transforming vertex positions
    gl.uniformMatrix4fv(auraProgram.uView, false, view);
    gl.uniformMatrix4fv(auraProgram.uProjection, false, projection);
    gl.uniform1f(auraProgram.uTime, time);                                           

    gl.uniform3fv(auraProgram.uAuraColor, [0.5, 0.8, 1.0]);                          // sets aura color : light blue

    gl.bindBuffer(gl.ARRAY_BUFFER, auraBuffer);                                      // binds aura vertex buffer 
    gl.enableVertexAttribArray(auraProgram.aPosition);                               // enables and defines aPosition attribute
    gl.vertexAttribPointer(auraProgram.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);                                                             // enables additive blending
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);                                              
    gl.disable(gl.DEPTH_TEST);                                                       // disables depth test 

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);                                          // renders aura as 4 vertex quad (plane)

    gl.disable(gl.BLEND);                                                            // disable blending
    gl.enable(gl.DEPTH_TEST);                                                        // enable depth test 
  }

  //  PROMPT FOR EXTRACTION OF SWORD
  const prompt = document.getElementById("zPrompt");

  const dx = camera.position[0] - SWORD_POSITION[0];
  const dz = camera.position[2] - SWORD_POSITION[2];
  const distSq = dx * dx + dz * dz;                   // computes square distance between player and sword in XZ space

  const inRadius = distSq < SWORD_TRIGGER_RADIUS * SWORD_TRIGGER_RADIUS; // is player close enough to interact?
  const isStable = (swordState === 0 || swordState === 2);               // intermediate states are not interactable
  const swordIsLoaded = swordBuffers && swordBuffers.length > 0;         // confirms sword geom is present and loaded

  if (inRadius && isStable && swordIsLoaded) {                           // if all conditions met, show prompt
    prompt.textContent = (swordState === 2) ? " ✨ Z : Seal the power once more" : " 🌀 Z : Awaken the crystal oath";

    const swordTip = vec4.fromValues(SWORD_POSITION[0], swordY + 0.6, SWORD_POSITION[2], 1.0); // defines position of sword tip
    const mvp = mat4.create();                                                                 // transforms sword tip from world space to clip space
    mat4.multiply(mvp, projection, view);
    vec4.transformMat4(swordTip, swordTip, mvp);

    if (swordTip[3] > 0) {                      // if point in front of cam, convert from clip space to NDC (normalized device coordinates)
      swordTip[0] /= swordTip[3];
      swordTip[1] /= swordTip[3];

      const screenX = (swordTip[0] * 0.5 + 0.5) * canvas.width;           // converts NDC to pixel coords on screen 
      const screenY = (1.0 - (swordTip[1] * 0.5 + 0.5)) * canvas.height;

      prompt.style.display = "block";
      prompt.style.left = `${screenX}px`;
      prompt.style.top = `${screenY}px`;
    } else {
      prompt.style.display = "none";
    }
  } else {
    prompt.style.display = "none";
  }


  // DRAW PEDESTAL
  drawPedestal(projection, view);

  // DRAW TORCH AURAS
  drawTorchAuras(projection, view);

  // DRAW WATER
   // 1: draw water surface using the last reflection texture, apply ripple distortion to it, blend
  drawWater(projection, view, lastReflectionTex);     // uses reflection texture from previous frame 
   // 2: prepare new reflection 
  currentReflectionTex = 1 - currentReflectionTex;    // swap reflection texture index for next frame
  gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionFBO);  // bind FBO to draw into new reflection texture
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                          gl.TEXTURE_2D, reflectionTextures[currentReflectionTex], 0); // attach current reflection tex as render target
   // 3 : render reflection scene
  drawReflectionScene();                    // render scene from mirrored cam into reflection texture
   // 4 : store for next frame
  lastReflectionTex = currentReflectionTex; // marks this texture as last so it will be used in the next water draw call  

  
  requestAnimationFrame(drawScene);
 
}

// == DRAW THE REFLECTION SCENE ==
function drawReflectionScene() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionFBO);    // redirects rendering output from screen to FBO, which writes to one of the textures
  gl.viewport(0, 0, canvas.width, canvas.height);       // ensure we render to the full texture size
  gl.clearColor(0, 0, 0, 1);                            // clear reflection texture with black
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  // resets depth buffer to ensure clear rendering 
  gl.activeTexture(gl.TEXTURE11);                       // prevents water from reading the reflection tex while writing into it
  gl.bindTexture(gl.TEXTURE_2D, null);                  // texture 11 is used to sample, so we unbind it 

  const projection = mat4.create();                     // prepare projection matrix
  mat4.perspective(projection, Math.PI / 3, canvas.width / canvas.height, 0.3, 30); // same perspective as main cam : 60° FOV, canvas aspect ratio, 
                                                                                    // near plane 0.3, far 30
  const waterHeight = -2.48;      // height of the water plane, horizontal mirror plane

  // Mirror the camera position across water plane
  const eye = camera.position;                      // current camera position (eye)
  const front = [
    Math.cos(camera.pitch) * Math.cos(camera.yaw),
    Math.sin(camera.pitch),
    Math.cos(camera.pitch) * Math.sin(camera.yaw),
  ];                                                // computes the forward direction vector the cam is facing, from pitch and yaw angles

  const mirroredEye = [eye[0], 2 * waterHeight - eye[1] + 2.6, eye[2]]; // we flip the Y coord (mirrored Y) and add offset to avoid z-fighting. 
  const mirroredFront = [front[0], -front[1], front[2]];                // view direction is also flipped in Y to match the mirrored camera

  const mirroredTarget = [
    mirroredEye[0] + mirroredFront[0],
    mirroredEye[1] + mirroredFront[1],
    mirroredEye[2] + mirroredFront[2],
  ];                                                 // target point the camera is looking at, computed from mirrored eye position and forward vector

  mat4.lookAt(reflectionViewMatrix, mirroredEye, mirroredTarget, [0, 1, 0]); // creates the view matrix for the reflection camera, looking at the mirrored target point
                                                                             // used later as uniform for water rendering
  const view = reflectionViewMatrix;  // use the reflection view matrix for rendering

  // Draw the scene from this locked reflection camera (using the mirrored camera)
  drawCave(projection, view);
  drawFloor(projection, view);
  drawCrystals(projection, view);
  drawRocks(projection, view);
  drawAllNavis(projection, view);
  drawTorches(projection,view);
  drawWater(projection, view, -1); // -1 disables sampling the reflection texture, to avoid feedback while writing into it
  
  // Restore rendering back to screen :
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.finish(); // forces WebGL to finish all GPU operations (helps with timing issues)
}



function drawCave(projection, view) {
  gl.useProgram(shaderProgram);

  gl.uniformMatrix4fv(shaderProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(shaderProgram.uView, false, view);
  gl.uniform3fv(shaderProgram.uLightDir, [0.3, -1.0, 0.2]);
  gl.uniform3fv(shaderProgram.uLightColor, [1.0, 0.8, 0.8]);
  gl.uniform1i(shaderProgram.uUseTexture, textures.cave ? 1 : 0);

  if (textures.cave) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.cave);
    gl.uniform1i(shaderProgram.uAlbedo, 0);
  }
  if (textures.caveNormal) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.caveNormal);
    gl.uniform1i(shaderProgram.uNormal, 1);
  }
  if (textures.caveRoughness) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.caveRoughness);
    gl.uniform1i(shaderProgram.uRoughness, 2);
  }
  if (textures.caveAO) {
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, textures.caveAO);
    gl.uniform1i(shaderProgram.uAO, 7);
  }
  if (textures.caveSpecular) {
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, textures.caveSpecular);
    gl.uniform1i(shaderProgram.uSpecular, 8);
  }
  if (textures.translucency) {
    gl.activeTexture(gl.TEXTURE16);
    gl.bindTexture(gl.TEXTURE_2D, textures.translucency);
    gl.uniform1i(gl.getUniformLocation(shaderProgram, "uTranslucency"), 16);
    gl.uniform1i(gl.getUniformLocation(shaderProgram, "uUseTranslucency"), 1);
    
  } else {
    gl.uniform1i(gl.getUniformLocation(shaderProgram, "uUseTranslucency"), 0);
  }

  const model = mat4.create();
  gl.uniformMatrix4fv(shaderProgram.uModel, false, model);
  gl.uniform3fv(shaderProgram.uBumpCenters, new Float32Array(bumpCenters));
  gl.uniform1fv(shaderProgram.uBumpHeights, new Float32Array(bumpHeights));
  gl.uniform1fv(shaderProgram.uBumpRadii, new Float32Array(bumpRadii));

  gl.bindBuffer(gl.ARRAY_BUFFER, caveMesh.position);
  gl.vertexAttribPointer(shaderProgram.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(shaderProgram.aPosition);

  gl.bindBuffer(gl.ARRAY_BUFFER, caveMesh.uv);
  gl.vertexAttribPointer(shaderProgram.aUV, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(shaderProgram.aUV);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, caveMesh.index);

  const useTorch = torchLights.length > 0;
  gl.uniform1i(gl.getUniformLocation(shaderProgram, "uUseTorchLight"), useTorch ? 1 : 0);

  if (useTorch) {
    const maxLights = 4;
    const activeLights = torchLights.slice(0, maxLights);

    gl.uniform1i(gl.getUniformLocation(shaderProgram, "uNumTorchLights"), activeLights.length);

    for (let i = 0; i < activeLights.length; i++) {
      gl.uniform3fv(gl.getUniformLocation(shaderProgram, `uTorchPos[${i}]`), activeLights[i].position);
      gl.uniform3fv(gl.getUniformLocation(shaderProgram, `uTorchColor[${i}]`), activeLights[i].color);
      gl.uniform1f(gl.getUniformLocation(shaderProgram, `uTorchRadius[${i}]`), activeLights[i].radius);
    }
  } else {
    // Set safe defaults 
    gl.uniform1i(gl.getUniformLocation(shaderProgram, "uNumTorchLights"), 0);
  }

  const useCrystals = crystals.length > 0;
  const crystalColor = [0.4, 0.2, 1.0];
  const ringCrystals = crystals.filter(c => c.type === "ring");
  const sorted = ringCrystals.slice().sort((a, b) => {
    const angleA = Math.atan2(a.position[2], a.position[0]);
    const angleB = Math.atan2(b.position[2], b.position[0]);
    return angleA - angleB;
  });

  const maxLights = Math.min(20, sorted.length);  // avoid overflow
  const spacing = sorted.length / maxLights;

  const lightingCrystals = [];
  for (let i = 0; i < maxLights; i++) {
    const index = Math.floor(i * spacing);
    lightingCrystals.push(sorted[index]);
  }

  const crystalPositions = lightingCrystals.map(c => c.position);

  gl.uniform1i(gl.getUniformLocation(shaderProgram, "uUseCrystalLight"), useCrystals ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(shaderProgram, "uNumCrystalLights"), crystalPositions.length);
  gl.uniform3fv(gl.getUniformLocation(shaderProgram, "uCrystalColor"), getCurrentCrystalColor());
  gl.uniform1f(gl.getUniformLocation(shaderProgram, "uTime"), time);

  if (!shaderProgram.uPulseOverride) {
    shaderProgram.uPulseOverride = gl.getUniformLocation(shaderProgram, "uPulseOverride");
  }
  gl.uniform1f(shaderProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);

  for (let i = 0; i < crystalPositions.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(shaderProgram, `uCrystalPos[${i}]`), crystalPositions[i]);
  }

  gl.drawElements(gl.TRIANGLES, caveMesh.vertexCount, gl.UNSIGNED_SHORT, 0);
  gl.activeTexture(gl.TEXTURE0);  // Reset to default
  gl.bindTexture(gl.TEXTURE_2D, null); // Clear last bound texture (safety)

}

function drawFloor(projection, view) {
  gl.useProgram(floorProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, floorBuffers.position);
  gl.enableVertexAttribArray(floorProgram.aPosition);
  gl.vertexAttribPointer(floorProgram.aPosition, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, floorBuffers.uv);
  gl.enableVertexAttribArray(floorProgram.aUV);
  gl.vertexAttribPointer(floorProgram.aUV, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorBuffers.indices);

  const model = mat4.create();
  gl.uniformMatrix4fv(floorProgram.uModel, false, model);
  gl.uniformMatrix4fv(floorProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(floorProgram.uView, false, view);
  gl.uniform3fv(floorProgram.uLightDir, [0.3, -1.0, 0.2]);
  gl.uniform3fv(floorProgram.uLightColor, [1.0, 0.8, 0.8]);

  gl.uniform1i(floorProgram.uUseTexture, textures.floor ? 1 : 0);

  if (textures.floor) {
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, textures.floor);
    gl.uniform1i(floorProgram.uAlbedo, 4);
  }

  if (textures.floorNormal) {
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorNormal);
    gl.uniform1i(floorProgram.uNormal, 5);
  }

  if (textures.floorRoughness) {
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorRoughness);
    gl.uniform1i(floorProgram.uRoughness, 6);
  }

  if (textures.floorAO) {
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorAO);
    gl.uniform1i(floorProgram.uAO, 9);
  }

  if (textures.floorSpecular) {
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorSpecular);
    gl.uniform1i(floorProgram.uSpecular, 10);
  }

  const useTorch = torchLights.length > 0;
  gl.uniform1i(gl.getUniformLocation(floorProgram, "uUseTorchLight"), useTorch ? 1 : 0);

  if (useTorch) {
    const maxLights = 4;
    const activeLights = torchLights.slice(0, maxLights);

    gl.uniform1i(gl.getUniformLocation(floorProgram, "uNumTorchLights"), activeLights.length);

    for (let i = 0; i < activeLights.length; i++) {
      gl.uniform3fv(gl.getUniformLocation(floorProgram, `uTorchPos[${i}]`), activeLights[i].position);
      gl.uniform3fv(gl.getUniformLocation(floorProgram, `uTorchColor[${i}]`), activeLights[i].color);
      gl.uniform1f(gl.getUniformLocation(floorProgram, `uTorchRadius[${i}]`), activeLights[i].radius);
    }
  } else {
    gl.uniform1i(gl.getUniformLocation(floorProgram, "uNumTorchLights"), 0);
  }

  const useCrystals = crystals.length > 0;
  const crystalColor = [0.4, 0.2, 1.0];
  const ringCrystals = crystals.filter(c => c.type === "ring");
  const sorted = ringCrystals.slice().sort((a, b) => {
    const angleA = Math.atan2(a.position[2], a.position[0]);
    const angleB = Math.atan2(b.position[2], b.position[0]);
    return angleA - angleB;
  });

  const maxLights = Math.min(20, sorted.length);  // avoid overflow
  const spacing = sorted.length / maxLights;

  const lightingCrystals = [];
  for (let i = 0; i < maxLights; i++) {
    const index = Math.floor(i * spacing);
    lightingCrystals.push(sorted[index]);
  }

  const crystalPositions = lightingCrystals.map(c => c.position);

  gl.uniform1i(gl.getUniformLocation(floorProgram, "uUseCrystalLight"), useCrystals ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(floorProgram, "uNumCrystalLights"), crystalPositions.length);
  gl.uniform3fv(gl.getUniformLocation(floorProgram, "uCrystalColor"), getCurrentCrystalColor());
  gl.uniform1f(gl.getUniformLocation(floorProgram, "uTime"), time);

  if (!floorProgram.uPulseOverride) {
    floorProgram.uPulseOverride = gl.getUniformLocation(floorProgram, "uPulseOverride");
  }
  gl.uniform1f(floorProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);


  for (let i = 0; i < crystalPositions.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(floorProgram, `uCrystalPos[${i}]`), crystalPositions[i]);
  }

  gl.drawElements(gl.TRIANGLES, floorBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);
}

function drawDrops(projection, view) {
  gl.useProgram(crystalProgram);
  gl.uniformMatrix4fv(crystalProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(crystalProgram.uView, false, view);

  for (const drop of drops) {
    const model = mat4.create();
    mat4.translate(model, model, drop.position);
    mat4.scale(model, model, [DROP_RADIUS, DROP_RADIUS, DROP_RADIUS]);
    gl.uniformMatrix4fv(crystalProgram.uModel, false, model);
    gl.drawElements(gl.TRIANGLES, pointyCrystalBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);
  }
}

function drawWater(projection, view, texIndex) {

  if (!waterBuffers) return;                                                   // exits early if geometry not loaded

  gl.useProgram(waterProgram);                                                 // use the water shader program
  gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.position);
  gl.enableVertexAttribArray(waterProgram.aPosition);
  gl.vertexAttribPointer(waterProgram.aPosition, 3, gl.FLOAT, false, 0, 0);    // bind position buffer and connect to shader attribute aPosition

 if (waterProgram.aUV !== -1) {                                                // If the shader supports UVs, bind the UV buffer and connect to aUV attribute                                                                      
    gl.enableVertexAttribArray(waterProgram.aUV);                              // (used for sampling ripple dist text and reflection) 
    gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.uv);
    gl.vertexAttribPointer(waterProgram.aUV, 2, gl.FLOAT, false, 0, 0);
  }                            

  gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.height);                         // bind the height buffer (used for ripple heights)
  gl.bufferData(gl.ARRAY_BUFFER, rippleHeights, gl.DYNAMIC_DRAW);              // uploads ripple height values (CPU to GPU) 
  if (waterProgram.aHeight !== -1) {                                           // if shader supports aHeight, binds the ripple heights to that attribute
    gl.enableVertexAttribArray(waterProgram.aHeight);                          // (used to displace water mesh vertically in real time)
    gl.vertexAttribPointer(waterProgram.aHeight, 1, gl.FLOAT, false, 0, 0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, waterBuffers.normal);                         // bind the normal buffer (used for ripple normals)  
  gl.bufferData(gl.ARRAY_BUFFER, rippleNormals, gl.DYNAMIC_DRAW);              // uploads ripple normal values (CPU to GPU) - used for light and reflection
  if (waterProgram.aNormal !== -1) {                                           // if shader supports aNormal, binds the ripple normals to that attribute
    gl.enableVertexAttribArray(waterProgram.aNormal);
    gl.vertexAttribPointer(waterProgram.aNormal, 3, gl.FLOAT, false, 0, 0);    // 3 : 3 comp per vertex; gl.FLOAT : type - 32 bit float; false : not normalized;
  }                                                                            // 0 : stride (no padding); 0 : offset (start reading at beginning of buffer)

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, waterBuffers.index);                  // bind the index buffer for the water mesh (used for drawing triangles)


  const model = mat4.create();                                                 // creates identity model matrix 
  gl.uniformMatrix4fv(waterProgram.uModel, false, model);                      // uploads the model matrix to the shader
  gl.uniformMatrix4fv(waterProgram.uProjection, false, projection);            // uploads the projection matrix to the shader 
  gl.uniformMatrix4fv(waterProgram.uView, false, view);                        // uploads the view matrix to the shader (main cam view)
  gl.uniform2f(waterProgram.uResolution, canvas.width, canvas.height);         // uploads canvas resolution to shader (convert gl_FragCoord to UV space) 
  gl.uniform3fv(waterProgram.uCameraPosition, camera.position);                // sends camera 3D position to shader (used for lighting and reflection calculations)
  gl.uniform1f(gl.getUniformLocation(waterProgram, "uTime"), time);            // sends current time to shader (used for animation effects like ripples and reflections)

  // SWORD EXTRACTION DISTORTION
  if (!waterProgram.uPulseOverride) {
    waterProgram.uPulseOverride = gl.getUniformLocation(waterProgram, "uPulseOverride");
  }
  gl.uniform1f(waterProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);


  // TORCH LIGHT SETUP (LIGHTING THE WATER SURFACE)
  const useTorch = torchLights.length > 0;
  gl.uniform1i(gl.getUniformLocation(waterProgram, "uUseTorchLight"), useTorch ? 1 : 0);       // if torches present, use torch lighting 

  if (useTorch) {                                                                              // max of 4 torches                
    const maxLights = 4;
    const activeLights = torchLights.slice(0, maxLights);
    gl.uniform1i(gl.getUniformLocation(waterProgram, "uNumTorchLights"), activeLights.length); // sends the number of active torch lights to the shader

    for (let i = 0; i < activeLights.length; i++) {                                            // 4each torch sends pos, color and radius of light to shader
      gl.uniform3fv(gl.getUniformLocation(waterProgram, `uTorchPos[${i}]`), activeLights[i].position);
      gl.uniform3fv(gl.getUniformLocation(waterProgram, `uTorchColor[${i}]`), activeLights[i].color);
      gl.uniform1f(gl.getUniformLocation(waterProgram, `uTorchRadius[${i}]`), activeLights[i].radius);
    }
  } else {
    gl.uniform1i(gl.getUniformLocation(waterProgram, "uNumTorchLights"), 0);                   // if no torches, skip lighting loop
  }
  

  // BLOCK TO ENABLE RIPPLED DISTORTION EFFECT 
  // Computing reflection view matrix so the water shader knows how the reflection texture was created. Allows shader to correctly map and distort the reflection.
  gl.enable(gl.BLEND);                                 // enables blending in GPU pipeline. allows water to be partially transparent.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);  // uses alpha channel of water texture to determine how much to blend with the background.
                                                       // background gets 1 - alpha (standard alpha blending)
  if (texIndex >= 0) {                                            // checks if a valid reflection texture index is provided                                            
    gl.activeTexture(gl.TEXTURE11);                               // activates texture unit 11 for reflection texture
    gl.bindTexture(gl.TEXTURE_2D, reflectionTextures[texIndex]);  // binds the reflection texture to texture unit 11 - this will be used in the shader (sampler2D)
    gl.uniform1i(waterProgram.uReflectionTex, 11);                // tells shader uReflectionTex should use texture 11
  }                                                               
  gl.activeTexture(gl.TEXTURE12);                     // activates texture unit 12 for distortion map
  gl.bindTexture(gl.TEXTURE_2D, rippleDistortionTex); // binds the distortion texture to texture unit 12 Uencodes the normal-based distortion map for water ripples)
  gl.uniform1i(waterProgram.uDistortionMap, 12);      // tells shader uDistortionMap should use texture 12


  // CRYSTAL LIGHT SETUP (LIGHTING THE WATER SURFACE)
  const ringCrystals = crystals.filter(c => c.type === "ring");  // selects crystals of type "ring" for lighting
  const sorted = ringCrystals.slice().sort((a, b) => {           // sorts crystals by angle around the water surface, to help distribute lights evenly @ water
    const angleA = Math.atan2(a.position[2], a.position[0]);
    const angleB = Math.atan2(b.position[2], b.position[0]);
    return angleA - angleB;
  });
  const maxLights = Math.min(8, sorted.length);  // for water, limit to 8 (limits number of crystals sent to shader)
  const space = sorted.length / maxLights;       // picks evenly spaced crystals from the sorted list to evenly distribute light sources around the water surface
  const lightingCrystals = [];
  for (let i = 0; i < maxLights; i++) {
    const index = Math.floor(i * space);
    lightingCrystals.push(sorted[index]);
  }

  gl.uniform1i(gl.getUniformLocation(waterProgram, "uUseCrystalLight"), 1);                         // enables crystal lighting in the shader
  gl.uniform1i(gl.getUniformLocation(waterProgram, "uNumCrystalLights"), lightingCrystals.length);  // sends the number of crystal lights to the shader
  gl.uniform3fv(gl.getUniformLocation(waterProgram, "uCrystalColor"), getCurrentCrystalColor());    // sends the current crystal color to the shader
  gl.uniform1f(gl.getUniformLocation(waterProgram, "uTime"), time);                                 // sends the current time to the shader for animation effects

  for (let i = 0; i < lightingCrystals.length; i++) {            // iterates over the selected crystals and sends their positions to the shader
    gl.uniform3fv(gl.getUniformLocation(waterProgram, `uCrystalPos[${i}]`), lightingCrystals[i].position);
  }


  // BLOCK THAT PREPARES THE SHADER TO ACCESS THE REFLECTION TEXTURE, APPLY RIPPLE DISTORTION, blend the water visually over the scene. 
  const reflectionProjection = mat4.create();                              // creates a perspective projection matrix (matching the one in drawReflectionScene)
  mat4.perspective(reflectionProjection, Math.PI / 3, canvas.width / canvas.height, 0.3, 30); 

  const reflectionVP = mat4.create();                 // combines projection and view matrices into a single ViewProjection matrix. Used to transform world coords into
  mat4.multiply(reflectionVP, reflectionProjection, reflectionViewMatrix); // clip space, allowing the shader to match geometry with what's in the reflection tex.

  const spacing = (waterBuffers.radius * 2) / (rippleGridSize - 1);        // dist between grid points in ripple simulation
  gl.uniform1f(waterProgram.uGridSpacing, spacing);                        // sends spacing to shader 
  gl.uniformMatrix4fv(waterProgram.uReflectionVP, false, reflectionVP);    // sends the combined ViewProjection matrix to the shader

  gl.depthMask(false);  // temporarly disable depth writing to the buffer, to allow water to blend with the scene
  gl.enable(gl.BLEND);  // enable blending and sets standard alpha blending 
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.drawElements(gl.TRIANGLES, waterBuffers.vertexCount, gl.UNSIGNED_SHORT, 0); // draws the water surface using the vertex and index buffers
  gl.disable(gl.BLEND); // disables blending after drawing water, to avoid blending future objects (e.g. rocks or crystals)
  gl.depthMask(true);   // restores depth writing 
}

// DRAW CRYSTALS
function drawCrystals(projection, view) {
  gl.useProgram(crystalProgram);                                                         

  gl.uniformMatrix4fv(crystalProgram.uProjection, false, projection);   // Set proj and view matrix, pass also time uniform to crystal frag
  gl.uniformMatrix4fv(crystalProgram.uView, false, view);
  gl.uniform1f(crystalProgram.uTime, time);

  if (!crystalProgram.uPulseOverride) {                                                                     // controls pulse activation from sword
    crystalProgram.uPulseOverride = gl.getUniformLocation(crystalProgram, "uPulseOverride");
  }
  gl.uniform1f(crystalProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);

  if (!crystalProgram.uCrystalTint) {                                                                       // applies color tint to all crystals
    crystalProgram.uCrystalTint = gl.getUniformLocation(crystalProgram, "uCrystalTint");
  }
  gl.uniform3fv(crystalProgram.uCrystalTint, getCurrentCrystalTint());

  const crystalUseLoc = crystalProgram.uUseTexture || gl.getUniformLocation(crystalProgram, 'uUseTexture'); // Texture binding (only once) - get uniform locations inside shader
  const crystalTexLoc = crystalProgram.uCrystal || gl.getUniformLocation(crystalProgram, 'uCrystal');       // to bind and enable crystal texture

  if (textures.crystals && crystalUseLoc && crystalTexLoc) {                            // If a crystal tex is loaded, bind to tex 3, tell shader to use it 
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, textures.crystals);
    gl.uniform1i(crystalTexLoc, 3);
    gl.uniform1i(crystalUseLoc, 1);
  } else if (crystalUseLoc) {
    gl.uniform1i(crystalUseLoc, 0);                                                     // if missing, disable texture sampling 
  }

  for (const c of crystals) {                                                           // Per-crystal logic (loop through crystals = [])
    const bufferSet = c.type === "rock" ? rockCrystalBuffers : pointyCrystalBuffers;    // Use different geom depending on type (rock or pointy, preloaded buffers)

    gl.bindBuffer(gl.ARRAY_BUFFER, bufferSet.position);                                 // bind vertex positions and associate with aPosition
    gl.vertexAttribPointer(crystalProgram.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(crystalProgram.aPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufferSet.uv);                                       // bind UV texture coordinate
    gl.vertexAttribPointer(crystalProgram.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(crystalProgram.aUV);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferSet.indices);                          // bind index buffer to allow drawElements to ref triangle indices

    const model = mat4.create();                                                        // identity matrix, then move crystal to its world-space position
    mat4.translate(model, model, c.position);

    const axis = vec3.cross([], [0, 1, 0], c.up);                                       // compute rotation to align local crystal Y with c.up vector (tilting on cave
    const angle = Math.acos(vec3.dot([0, 1, 0], c.up));                                 // surfaces)
    if (vec3.length(axis) > 0.0001) {
      mat4.rotate(model, model, angle, axis);
    }

    mat4.rotateY(model, model, c.rotation);                                             // additional rotation around Y axis
    mat4.scale(model, model, [c.scale, c.scale, c.scale]);                              // scale crystal 

    gl.uniformMatrix4fv(crystalProgram.uModel, false, model);                           // send final model matrix to shader to transform this specific crystal 
    gl.drawElements(gl.TRIANGLES, bufferSet.vertexCount, gl.UNSIGNED_SHORT, 0);         // render crystal geometry 
  }
}

//DRAW ROCKS
function drawRocks(projection, view) {
  gl.useProgram(rockProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, rockBuffers.position);                     // binds vertex position buffer , enables aPosition
  gl.enableVertexAttribArray(rockProgram.aPosition);
  gl.vertexAttribPointer(rockProgram.aPosition, 3, gl.FLOAT, false, 0, 0);  // 3 floats per vertex

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rockBuffers.index);                // binds index buffer

  gl.uniformMatrix4fv(rockProgram.uProjection, false, projection);          // sets proj and view matrices (camera setup) for rock shader
  gl.uniformMatrix4fv(rockProgram.uView, false, view);
  gl.uniform3fv(rockProgram.uLightDir, [0.3, -1.0, 0.2]);                   // warm light
  gl.uniform3fv(rockProgram.uLightColor, [1.0, 0.8, 0.8]);                  // direction and color used in shading
  gl.uniform1i(rockProgram.uUseTexture, textures.floor ? 1 : 0);            // enables tex use if floor tex is available

  // Bind all floor-related textures for the rocks
  if (textures.floor) {
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, textures.floor);
    gl.uniform1i(rockProgram.uAlbedo, 4);
  }
  if (textures.floorNormal) {
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorNormal);
    gl.uniform1i(rockProgram.uNormal, 5);
  }
  if (textures.floorRoughness) {
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorRoughness);
    gl.uniform1i(rockProgram.uRoughness, 6);
  }
  if (textures.floorAO) {
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorAO);
    gl.uniform1i(rockProgram.uAO, 9);
  }
  if (textures.floorSpecular) {
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, textures.floorSpecular);
    gl.uniform1i(rockProgram.uSpecular, 10);
  }

  for (const rock of rockInstances) {
    const model = mat4.create();
    mat4.translate(model, model, rock.position);
    mat4.scale(model, model, [rock.scale, rock.scale, rock.scale]);
    gl.uniformMatrix4fv(rockProgram.uModel, false, model);

    // Torch lighting logic
    const useTorch = torchLights.length > 0;
    gl.uniform1i(gl.getUniformLocation(rockProgram, "uUseTorchLight"), useTorch ? 1 : 0);

    if (useTorch) {
      const maxLights = 4;
      const activeLights = torchLights.slice(0, maxLights);

      gl.uniform1i(gl.getUniformLocation(rockProgram, "uNumTorchLights"), activeLights.length);

      for (let i = 0; i < activeLights.length; i++) {
        gl.uniform3fv(gl.getUniformLocation(rockProgram, `uTorchPos[${i}]`), activeLights[i].position);
        gl.uniform3fv(gl.getUniformLocation(rockProgram, `uTorchColor[${i}]`), activeLights[i].color);
        gl.uniform1f(gl.getUniformLocation(rockProgram, `uTorchRadius[${i}]`), activeLights[i].radius);
      }
    } else {
      gl.uniform1i(gl.getUniformLocation(rockProgram, "uNumTorchLights"), 0);
    }

    // Crystal light logic
    const useCrystals = crystals.length > 0;
    const ringCrystals = crystals.filter(c => c.type === "ring" || c.type === "rock");
    const sorted = ringCrystals.slice().sort((a, b) => {
      const angleA = Math.atan2(a.position[2], a.position[0]);
      const angleB = Math.atan2(b.position[2], b.position[0]);
      return angleA - angleB;
    });

    const maxLights = Math.min(20, sorted.length);  // avoid overflow
    const spacing = sorted.length / maxLights;
    const lightingCrystals = [];
    for (let i = 0; i < maxLights; i++) {
      const index = Math.floor(i * spacing);
      lightingCrystals.push(sorted[index]);
    }

    const crystalPositions = lightingCrystals.map(c => c.position);

    gl.uniform1i(gl.getUniformLocation(rockProgram, "uUseCrystalLight"), useCrystals ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(rockProgram, "uNumCrystalLights"), crystalPositions.length);
    gl.uniform3fv(gl.getUniformLocation(rockProgram, "uCrystalColor"), getCurrentCrystalColor());
    gl.uniform1f(gl.getUniformLocation(rockProgram, "uTime"), time);

    if (!rockProgram.uPulseOverride) {
      rockProgram.uPulseOverride = gl.getUniformLocation(rockProgram, "uPulseOverride");
    }
    gl.uniform1f(rockProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);

    for (let i = 0; i < crystalPositions.length; i++) {
      gl.uniform3fv(gl.getUniformLocation(rockProgram, `uCrystalPos[${i}]`), crystalPositions[i]);
    }

    gl.drawElements(gl.TRIANGLES, rockBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);       // render rock geometry
  }
}

function drawMushrooms(projection, view) {
  if (!mushroomBuffers || !mushroomProgram) return;

  gl.useProgram(mushroomProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, mushroomBuffers.position);
  gl.vertexAttribPointer(mushroomProgram.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(mushroomProgram.aPosition);

  gl.bindBuffer(gl.ARRAY_BUFFER, mushroomBuffers.uv);
  gl.vertexAttribPointer(mushroomProgram.aUV, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(mushroomProgram.aUV);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mushroomBuffers.indices);

  gl.uniformMatrix4fv(mushroomProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(mushroomProgram.uView, false, view);
  
  for (const m of mushrooms) {
    const model = mat4.create();
    mat4.translate(model, model, m.position);
    mat4.rotateY(model, model, m.rotation);
    mat4.scale(model, model, [m.scale, m.scale, m.scale]);
    gl.uniformMatrix4fv(mushroomProgram.uModel, false, model);
    gl.drawElements(gl.TRIANGLES, mushroomBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);
  }
}

function drawAllNavis(projection, view) {
  if (!fairyProgram || !fairyBuffers) return;
  const vaoExt = gl.getExtension("OES_vertex_array_object");

  gl.useProgram(fairyProgram);

  for (let i = 0; i < navis.length; i++) {
    const navi = navis[i];
    const t = fairyFlapTime + navi.speedOffset;


    function lerp(a, b, t) {
      return a * (1 - t) + b * t;
    }

    const targetRadius = lerp(navi.baseRadius, 1.5, fairyAttraction);
    navi.radius += (targetRadius - navi.radius) * 0.05;
    const orbitRadius = navi.radius;

    const targetSpeed = lerp(navi.baseSpeed, navi.baseSpeed * 5.0, fairyAttraction);
    navi.speed += (targetSpeed - navi.speed) * 0.05;
    const orbitSpeed = navi.speed;

    const targetHeight = lerp(navi.baseHeight, swordY + 1.5, fairyAttraction);
    navi.height += (targetHeight - navi.height) * 0.05;
    const orbitHeight = navi.height;


    const orbitCenter = [
      lerp(0.0, SWORD_POSITION[0], fairyAttraction),
      0.0,
      lerp(0.0, SWORD_POSITION[2], fairyAttraction)
    ];


    const angle = t * orbitSpeed * navi.direction;

    // Orbiting position
    const x = orbitCenter[0] + Math.cos(angle) * orbitRadius;
    const z = orbitCenter[2] + Math.sin(angle) * orbitRadius;
    const y = orbitHeight + 0.5 * Math.sin(angle * 2.0);

    // Look ahead (same logic)
    const nextAngle = angle + 0.01 * navi.direction;
    const x2 = orbitCenter[0] + Math.cos(nextAngle) * orbitRadius;
    const z2 = orbitCenter[2] + Math.sin(nextAngle) * orbitRadius;
    const y2 = orbitHeight + 0.2 * Math.sin(nextAngle * 2.0);


    const dx = x2 - x;
    const dz = z2 - z;
    const forward = [dx, 0, dz];
    vec3.normalize(forward, forward);
    const baseForward = [0, 0, 1];
    const axis = vec3.cross([], baseForward, forward);
    const angleToForward = Math.acos(vec3.dot(baseForward, forward));

    const model = mat4.create();
    mat4.translate(model, model, [x, y, z]);
    if (vec3.length(axis) > 0.0001) {
      mat4.rotate(model, model, angleToForward, axis);
    }
    mat4.scale(model, model, [0.3, 0.3, 0.3]);

    // Send uniforms
    gl.uniformMatrix4fv(gl.getUniformLocation(fairyProgram, "uModel"), false, model);
    gl.uniformMatrix4fv(gl.getUniformLocation(fairyProgram, "uView"), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(fairyProgram, "uProjection"), false, projection);
    gl.uniform1f(gl.getUniformLocation(fairyProgram, "uTime"), t);
    gl.uniform1f(gl.getUniformLocation(fairyProgram, "uFlap"), 0.5 + 0.5 * Math.sin(t * 6.0));

    gl.uniform3fv(gl.getUniformLocation(fairyProgram, "uBaseColor"), navi.baseColor);
    gl.uniform3fv(gl.getUniformLocation(fairyProgram, "uGlowColor"), navi.glowColor);

    // Draw center
    vaoExt.bindVertexArrayOES(fairyBuffers.center.vao);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, fairyBuffers.center.vertexCount);

    // Draw wings
    vaoExt.bindVertexArrayOES(fairyBuffers.wings.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, fairyBuffers.wings.vertexCount);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  vaoExt.bindVertexArrayOES(null);
}

function drawTorches(projection, view) {
  if (!(torchProgram && torchBuffers && torchModelMatrices.length > 0)) return;

  const vaoExt = gl.getExtension("OES_vertex_array_object");
  gl.useProgram(torchProgram);

  gl.uniformMatrix4fv(torchProgram.uView, false, view);
  gl.uniformMatrix4fv(torchProgram.uProjection, false, projection);

  for (const modelMatrix of torchModelMatrices) {
    gl.uniformMatrix4fv(torchProgram.uModel, false, modelMatrix);

    for (const b of torchBuffers) {
      vaoExt.bindVertexArrayOES(b.vao);

      if (b.textureKey && textures[b.textureKey]) {
        gl.activeTexture(gl.TEXTURE18);
        gl.bindTexture(gl.TEXTURE_2D, textures[b.textureKey]);
        gl.uniform1i(torchProgram.uTex, 18);
        gl.uniform1i(torchProgram.uUseTexture, 1);
      } else {
        gl.uniform1i(torchProgram.uUseTexture, 0);
        gl.uniform3fv(torchProgram.uColor, b.color);
      }

      gl.drawArrays(gl.TRIANGLES, 0, b.vertexCount);
    }
  }

  vaoExt.bindVertexArrayOES(null);
}

function drawTorchAuras(projection, view) {
  if (!auraProgram || !auraBuffer || torchInfos.length === 0) return;

  gl.useProgram(auraProgram);
  gl.uniformMatrix4fv(auraProgram.uView, false, view);
  gl.uniformMatrix4fv(auraProgram.uProjection, false, projection);
  gl.uniform1f(auraProgram.uTime, time);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);

  gl.bindBuffer(gl.ARRAY_BUFFER, auraBuffer);
  gl.vertexAttribPointer(auraProgram.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(auraProgram.aPosition);

  for (let i = 0; i < torchInfos.length; i++) {
    const torch = torchInfos[i];
    const pos = vec3.clone(torch.tip);

    // True inward offset based on real tip direction (flattened to XZ)
    const inward = vec3.clone(torch.dir);
    inward[1] = 0.0;
    vec3.normalize(inward, inward);
    vec3.scaleAndAdd(pos, pos, inward, -0.05); 

    const flicker = 0.95 + 0.05 * Math.sin(time * 10.0 + i * 10.0);
    const s = 1.5 * flicker;

    const model = mat4.create();
    mat4.translate(model, model, pos);

    // Cylindrical billboard (Y-locked)
    const camRight = vec3.fromValues(view[0], view[4], view[8]);
    const camUp = vec3.fromValues(0, 1, 0);

    const dir = vec3.create();
    vec3.cross(dir, camRight, camUp);
    vec3.normalize(dir, dir);

    const rot = mat4.fromValues(
      camRight[0], camUp[0], dir[0], 0,
      camRight[1], camUp[1], dir[1], 0,
      camRight[2], camUp[2], dir[2], 0,
      0,           0,        0,      1
    );
    mat4.multiply(model, model, rot);

    const baseX = 0.5 * 0.45;
    const baseY = 0.6 * 0.45;
    const baseZ = 0.7 * 0.45;
    mat4.scale(model, model, [baseX * flicker, baseY * flicker, baseZ * flicker]);

    gl.uniformMatrix4fv(auraProgram.uModel, false, model);
    gl.uniform3fv(auraProgram.uAuraColor, [2.5, 1.3, 0.2]);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
}

function drawSword(projection, view) {
  if (!swordBuffers || !pbrProgram) return;

  const vaoExt = gl.getExtension("OES_vertex_array_object");
  gl.useProgram(pbrProgram);

  gl.uniformMatrix4fv(pbrProgram.uView, false, view);
  gl.uniformMatrix4fv(pbrProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(pbrProgram.uModel, false, swordModelMatrix);

  const glowStrength = (swordState > 0) ? (1.2 + 0.4 * Math.sin(time * 4.0)) : 0.0;
  gl.uniform1f(gl.getUniformLocation(pbrProgram, "uGlowStrength"), glowStrength);
  gl.uniform1f(gl.getUniformLocation(pbrProgram, "uTime"), time);

  // === Torch lights
  const useTorch = torchLights.length > 0;
  gl.uniform1i(gl.getUniformLocation(pbrProgram, "uUseTorchLight"), useTorch ? 1 : 0);
  const maxTorchLights = 4;
  const activeTorches = torchLights.slice(0, maxTorchLights);
  gl.uniform1i(gl.getUniformLocation(pbrProgram, "uNumTorchLights"), activeTorches.length);
  for (let i = 0; i < activeTorches.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(pbrProgram, `uTorchPos[${i}]`), activeTorches[i].position);
    gl.uniform3fv(gl.getUniformLocation(pbrProgram, `uTorchColor[${i}]`), activeTorches[i].color);
    gl.uniform1f(gl.getUniformLocation(pbrProgram, `uTorchRadius[${i}]`), activeTorches[i].radius);
  }

  // === Crystal lights
  const useCrystals = crystals.length > 0;
  const ringCrystals = crystals.filter(c => c.type === "ring" || c.type === "rock");
  const sorted = ringCrystals.slice().sort((a, b) => {
    const angleA = Math.atan2(a.position[2], a.position[0]);
    const angleB = Math.atan2(b.position[2], b.position[0]);
    return angleA - angleB;
  });

  const maxCrystalLights = Math.min(20, sorted.length);
  const spacing = sorted.length / maxCrystalLights;
  const lightingCrystals = [];
  for (let i = 0; i < maxCrystalLights; i++) {
    const index = Math.floor(i * spacing);
    lightingCrystals.push(sorted[index]);
  }

  const crystalPositions = lightingCrystals.map(c => c.position);
  gl.uniform1i(gl.getUniformLocation(pbrProgram, "uUseCrystalLight"), useCrystals ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(pbrProgram, "uNumCrystalLights"), crystalPositions.length);
  gl.uniform3fv(gl.getUniformLocation(pbrProgram, "uCrystalColor"), getCurrentCrystalColor());
  gl.uniform1f(gl.getUniformLocation(pbrProgram, "uPulseOverride"), (swordState === 2) ? 1.0 : 0.0);
  gl.uniform1f(gl.getUniformLocation(pbrProgram, "uTime"), time);
  for (let i = 0; i < crystalPositions.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(pbrProgram, `uCrystalPos[${i}]`), crystalPositions[i]);
  }

  // === Draw each part
  for (const b of swordBuffers) {
    vaoExt.bindVertexArrayOES(b.vao);

    if (b.textureKey && textures[b.textureKey]) {
      gl.activeTexture(gl.TEXTURE14);
      gl.bindTexture(gl.TEXTURE_2D, textures[b.textureKey]);
      gl.uniform1i(pbrProgram.uTex, 14);
      gl.uniform1i(pbrProgram.uUseTexture, 1);
    } else {
      gl.uniform1i(pbrProgram.uUseTexture, 0);
      gl.uniform3fv(pbrProgram.uColor, b.color);
    }

    if (b.metallicRoughnessKey && textures[b.metallicRoughnessKey]) {
      gl.activeTexture(gl.TEXTURE15);
      gl.bindTexture(gl.TEXTURE_2D, textures[b.metallicRoughnessKey]);
      gl.uniform1i(pbrProgram.uMetallicRoughness, 15);
      gl.uniform1i(pbrProgram.uUseMR, 1);
    } else {
      gl.uniform1i(pbrProgram.uUseMR, 0);
    }

    if (b.normalMapKey && textures[b.normalMapKey]) {
      gl.activeTexture(gl.TEXTURE13);
      gl.bindTexture(gl.TEXTURE_2D, textures[b.normalMapKey]);
      gl.uniform1i(pbrProgram.uNormalMap, 13);
      gl.uniform1i(pbrProgram.uUseNormalMap, 1);
    } else {
      gl.uniform1i(pbrProgram.uUseNormalMap, 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, b.vertexCount);
  }

  vaoExt.bindVertexArrayOES(null);
}

function drawPedestal(projection, view) {
  if (!pedestalBuffers || !pedestalProgram) return;

  gl.useProgram(pedestalProgram);
  const vaoExt = gl.getExtension("OES_vertex_array_object");

  gl.uniformMatrix4fv(pedestalProgram.uView, false, view);
  gl.uniformMatrix4fv(pedestalProgram.uProjection, false, projection);
  gl.uniformMatrix4fv(pedestalProgram.uModel, false, pedestalModelMatrix);
  gl.uniform1f(pedestalProgram.uGlowStrength, 0.2);  // Same as sword

 

  // Basic lighting
  gl.uniform3fv(pedestalProgram.uLightDir, [0.3, -1.0, 0.2]);
  gl.uniform3fv(pedestalProgram.uLightColor, [1.0, 0.8, 0.8]);

  // Torch lighting
  const useTorch = torchLights.length > 0;
  gl.uniform1i(gl.getUniformLocation(pedestalProgram, "uUseTorchLight"), useTorch ? 1 : 0);

  const maxTorchLights = 4;
  const activeTorches = torchLights.slice(0, maxTorchLights);

  gl.uniform1i(gl.getUniformLocation(pedestalProgram, "uNumTorchLights"), activeTorches.length);
  for (let i = 0; i < activeTorches.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(pedestalProgram, `uTorchPos[${i}]`), activeTorches[i].position);
    gl.uniform3fv(gl.getUniformLocation(pedestalProgram, `uTorchColor[${i}]`), activeTorches[i].color);
    gl.uniform1f(gl.getUniformLocation(pedestalProgram, `uTorchRadius[${i}]`), activeTorches[i].radius);
  }

  // Crystal lighting
  const useCrystals = crystals.length > 0;
  const crystalColor = [0.4, 0.2, 1.0];
  const ringCrystals = crystals.filter(c => c.type === "ring");
  const sorted = ringCrystals.slice().sort((a, b) => {
    const angleA = Math.atan2(a.position[2], a.position[0]);
    const angleB = Math.atan2(b.position[2], b.position[0]);
    return angleA - angleB;
  });

  const maxCrystalLights = Math.min(20, sorted.length);
  const spacing = sorted.length / maxCrystalLights;
  const lightingCrystals = [];
  for (let i = 0; i < maxCrystalLights; i++) {
    const index = Math.floor(i * spacing);
    lightingCrystals.push(sorted[index]);
  }

  const crystalPositions = lightingCrystals.map(c => c.position);

  gl.uniform1i(gl.getUniformLocation(pedestalProgram, "uUseCrystalLight"), useCrystals ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(pedestalProgram, "uNumCrystalLights"), crystalPositions.length);
  gl.uniform3fv(gl.getUniformLocation(pedestalProgram, "uCrystalColor"), getCurrentCrystalColor());
  gl.uniform1f(gl.getUniformLocation(pedestalProgram, "uTime"), time);

  // Pulse override for sword-activated glow
  if (!pedestalProgram.uPulseOverride) {
    pedestalProgram.uPulseOverride = gl.getUniformLocation(pedestalProgram, "uPulseOverride");
  }
  gl.uniform1f(pedestalProgram.uPulseOverride, (swordState === 2) ? 1.0 : 0.0);

  for (let i = 0; i < crystalPositions.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(pedestalProgram, `uCrystalPos[${i}]`), crystalPositions[i]);
  }

  for (const b of pedestalBuffers) {
    vaoExt.bindVertexArrayOES(b.vao);

    if (b.textureKey && textures[b.textureKey]) {
      gl.activeTexture(gl.TEXTURE17);
      gl.bindTexture(gl.TEXTURE_2D, textures[b.textureKey]);
      gl.uniform1i(pedestalProgram.uTex, 17);
      gl.uniform1i(pedestalProgram.uUseTexture, 1);
    } else {
      gl.uniform1i(pedestalProgram.uUseTexture, 0);
      gl.uniform3fv(pedestalProgram.uColor, b.color || [0.6, 0.6, 0.6]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, b.vertexCount);
  }

  vaoExt.bindVertexArrayOES(null);
}



//////// 7. PER-FRAME UPDATES ////////

// === CAMERA MOVEMENT AND INPUT HANDLING ===
function updateCamera(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  const velocity = camera.speed * delta;

  const front = [
    Math.cos(camera.pitch) * Math.cos(camera.yaw),
    Math.sin(camera.pitch),
    Math.cos(camera.pitch) * Math.sin(camera.yaw),
  ];
  const len = Math.hypot(...front);
  front[0] /= len; front[1] /= len; front[2] /= len;

  const right = [
    Math.sin(camera.yaw - Math.PI / 2),
    0,
    Math.cos(camera.yaw - Math.PI / 2),
  ];

  if (camera.keys['w']) {
    camera.position[0] += front[0] * velocity;
    camera.position[1] += 0;
    camera.position[2] += front[2] * velocity;
  }
  if (camera.keys['s']) {
    camera.position[0] -= front[0] * velocity;
    0;
    camera.position[2] -= front[2] * velocity;
  }
  
  if (lockCaveAccess) {
    const x = camera.position[0];
    const z = camera.position[2];
    const distSq = x * x + z * z;
    const ringRadius = 5.5;  // Adjust to match the outer rock ring size

    if (distSq > ringRadius * ringRadius) {
      // Revert movement to stay inside
      camera.position[0] = lastPosition[0];
      camera.position[2] = lastPosition[2];
    }
  }

  if (yLockValue === null) {
    if (camera.keys['q']) {
      camera.position[1] -= velocity;
    }
    if (camera.keys['e']) {
      camera.position[1] += velocity;
    }
  }
  if (yLockValue !== null) {
    camera.position[1] = yLockValue;
  }

  if (restrictToPath) {
    const x = camera.position[0];
    const z = camera.position[2];

    const inPath = x >= PATH_X_MIN && x <= PATH_X_MAX &&
                  z >= PATH_Z_MIN && z <= PATH_Z_MAX;

    const r = Math.sqrt(x * x + z * z);
    const inRing = r >= RING_RADIUS_MIN && r <= RING_RADIUS_MAX;

    if (!(inPath || inRing)) {
      camera.position[0] = lastPosition[0];
      camera.position[2] = lastPosition[2];
    }
  }

  const moved =
    camera.position[0] !== lastPosition[0] ||
    camera.position[1] !== lastPosition[1] ||
    camera.position[2] !== lastPosition[2];

  if (moved) {
    // Recompute front vector without pitch
    reflectionFront = [
      Math.cos(camera.yaw),
      0.0,
      Math.sin(camera.yaw)
    ];

    // Update lastPosition
    lastPosition = [...camera.position];
  }
}

function updateRipples(dt) {
  const k = 300.0;       // stiffness
  const damping = 3.0;   // damping factor

  const nextVelocities = new Float32Array(rippleVelocities.length);

  // Magical gravity ripple from sword
  if (swordY > -2.0) {
    const swordX = SWORD_POSITION[0];
    const swordZ = SWORD_POSITION[2];
    const rippleFreq = 8.0;
    const rippleAmp = 0.009;
    const radius = 2.0;

    for (let j = 0; j < rippleGridSize; j++) {
      for (let i = 0; i < rippleGridSize; i++) {
        const index = j * rippleGridSize + i;
        const x = (i / (rippleGridSize - 1)) * 14.0 - 7.0;
        const z = (j / (rippleGridSize - 1)) * 14.0 - 7.0;

        const dx = x - swordX;
        const dz = z - swordZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < radius) {
          const wave = Math.sin(dist * rippleFreq - time * 6.0) * rippleAmp * (1.0 - dist / radius);
          rippleHeights[index] += wave;
        }
      }
    }
  }


  for (let row = 1; row < rippleGridSize - 1; row++) {
    for (let col = 1; col < rippleGridSize - 1; col++) {
      const i = row * rippleGridSize + col;

      const left = i - 1;
      const right = i + 1;
      const up = i - rippleGridSize;
      const down = i + rippleGridSize;

      const laplacian =
        rippleHeights[left] +
        rippleHeights[right] +
        rippleHeights[up] +
        rippleHeights[down] -
        4 * rippleHeights[i];

      nextVelocities[i] =
        rippleVelocities[i] +
        (k * laplacian - damping * rippleVelocities[i]) * dt;
    }
  }

  for (let i = 0; i < rippleVelocities.length; i++) {
    rippleVelocities[i] = nextVelocities[i];
    rippleHeights[i] += rippleVelocities[i] * dt;

    // clamping
    if (rippleHeights[i] > 0.3) rippleHeights[i] = 0.3;
    if (rippleHeights[i] < -0.3) rippleHeights[i] = -0.3;
  }

  

}

function updateRippleNormals() {
  const size = rippleGridSize;
  const spacing = (waterBuffers.radius * 2) / (size - 1);
  const invSpacing = 1.0 / (2 * spacing);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      const left  = row * size + Math.max(col - 1, 0);
      const right = row * size + Math.min(col + 1, size - 1);
      const down  = Math.max(row - 1, 0) * size + col;
      const up    = Math.min(row + 1, size - 1) * size + col;
      const hL = rippleHeights[left];
      const hR = rippleHeights[right];
      const hD = rippleHeights[down];
      const hU = rippleHeights[up];
      const dx = (hR - hL) * invSpacing * 5.0;  
      const dz = (hU - hD) * invSpacing * 5.0;
      const nx = -dx, ny = 1.0, nz = -dz;
      const len = Math.hypot(nx, ny, nz);
      const invLen = len > 0.00001 ? 1.0 / len : 1.0;

      rippleNormals[i * 3 + 0] = nx * invLen;
      rippleNormals[i * 3 + 1] = ny * invLen;
      rippleNormals[i * 3 + 2] = nz * invLen;
    }
  }
}

function updateDrops(time) {
  if (time - lastDropTime > DROP_INTERVAL) {
    lastDropTime = time;
    const p = dropSources[Math.floor(Math.random() * dropSources.length)];
    drops.push({
      position: [...p],
      velocity: [0, -DROP_SPEED, 0],
      mass: 1.0  // uniform mass
    });

  }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];

      // Apply gravity to vertical velocity
      const scaledGravity = 2.0;
      const force = -d.mass * scaledGravity;
      const acceleration = force / d.mass;  // cancels out to -scaledGravity
      d.velocity[1] += acceleration * 0.016;

      // Update position using velocity
      d.position[1] += d.velocity[1] * 0.016;

      if (d.position[1] <= WATER_HEIGHT) {
        injectRippleAtPosition(d.position);
        drops.splice(i, 1); // remove drop
      }
    }
}

function injectRippleAtPosition(pos) {
  const radius = waterBuffers.radius || 7.0;
  const gridSize = rippleGridSize;
  const spacing = (radius * 2) / (gridSize - 1); // approximate

  // Convert world x/z to grid indices
  const gridX = Math.round((pos[0] + radius) / spacing);
  const gridZ = Math.round((pos[2] + radius) / spacing);

  const index = gridZ * gridSize + gridX;
  if (index >= 0 && index < rippleVelocities.length) {
    const radiusInCells = 2;
    for (let dz = -radiusInCells; dz <= radiusInCells; dz++) {
      for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
        const nx = gridX + dx;
        const nz = gridZ + dz;
        if (nx >= 0 && nx < gridSize && nz >= 0 && nz < gridSize) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= radiusInCells) {
            const falloff = 1.0 - dist / radiusInCells;
            const i = nz * gridSize + nx;
            const r = 0.6; // ripple radius
            const envelope = Math.exp(-4.0 * (dist / r) * (dist / r)); // Gaussian falloff
            rippleVelocities[i] += 0.8 * envelope;

          }
        }
      }
    }

  }
  
  currentGlowPosition = [pos[0], pos[2]];  // x, z
  currentGlowTime = performance.now() * 0.001;
}



//////// 8. UTILITY FUNCTIONS ////////

function getCurrentCrystalTint() {
  const lerp = fairyAttraction;
  return [
    CRYSTAL_TINT_ACTIVE[0] * (1 - lerp) + CRYSTAL_TINT_DIMMED[0] * lerp,
    CRYSTAL_TINT_ACTIVE[1] * (1 - lerp) + CRYSTAL_TINT_DIMMED[1] * lerp,
    CRYSTAL_TINT_ACTIVE[2] * (1 - lerp) + CRYSTAL_TINT_DIMMED[2] * lerp
  ];
}

function getCurrentCrystalColor() {
  const lerp = fairyAttraction;
  return [
    CRYSTAL_LIGHT_COLOR_ACTIVE[0] * (1 - lerp) + CRYSTAL_LIGHT_COLOR_DIMMED[0] * lerp,
    CRYSTAL_LIGHT_COLOR_ACTIVE[1] * (1 - lerp) + CRYSTAL_LIGHT_COLOR_DIMMED[1] * lerp,
    CRYSTAL_LIGHT_COLOR_ACTIVE[2] * (1 - lerp) + CRYSTAL_LIGHT_COLOR_DIMMED[2] * lerp
  ];
}

function roundVertex([x, y, z], precision = 1e4) {
  return [
    Math.round(x * precision) / precision,
    Math.round(y * precision) / precision,
    Math.round(z * precision) / precision,
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader error:", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function createProgram(vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program error:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function getShaderSource(id) {
  const script = document.getElementById(id);
  return script ? script.textContent.trim() : null;
}

function displaceInward(position, intensity = 1.5) {
  const inward = vec3.normalize([], [position[0], 0, position[2]]);
  return [
    position[0] - inward[0] * intensity * 0.6,
    position[1],
    position[2] - inward[2] * intensity * 0.6
  ];
}



//////// 9. DOM + EVENT LISTENERS ////////

window.onload = () => {
  initGL();
  setupShaders();
  setupCaveDomeBuffers();
  setupFloorBuffers();
  setupFloorShaders();
  setupRockShaders(); 
  setupCrystalShaders();
  generateDomeCrystals(20);   
  setupCrystalBuffers(); 
  setupMushroomBuffers();  
  setupMushroomShaders();
  setupInput();
  setupTextureInputs();
  setupWater(); 
  initRippleDistortionTexture(gl);
  setupAuraShader(); 
  setupAudio();

  requestAnimationFrame(drawScene);
};

document.getElementById("adminLockToggle").addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  yLockValue = isChecked ? -0.5 : null;
  lockCaveAccess = isChecked;
});

document.getElementById("fairyObjPairInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];

  if (files.length !== 2) {
    alert("Please select exactly two .obj files: one closed, one open.");
    return;
  }

  let closedFile = null;
  let openFile = null;

  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.includes("closed")) {
      closedFile = file;
    } else if (name.includes("open")) {
      openFile = file;
    }
  }

  const closedText = await closedFile.text();
  const openText = await openFile.text();

  loadFairyPair(closedText, openText);
  
});

document.getElementById("torchObjInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  const objFile = files.find(f => f.name.endsWith('.obj'));
  const mtlFile = files.find(f => f.name.endsWith('.mtl'));

  if (!objFile || !mtlFile) {
    alert("Upload both .obj and .mtl files.");
    return;
  }

  const [objText, mtlText] = await Promise.all([objFile.text(), mtlFile.text()]);
  const materials = parseMTL(mtlText);
  for (const matName in materials) {
    const mat = materials[matName];
    if (mat.map_Kd) {
      const texFile = files.find(f => f.name === mat.map_Kd);
      if (texFile) {
        mat.textureKey = "torch_" + matName;
        loadTextureFromFile(texFile, mat.textureKey);
        console.log("Loaded texture for", matName, "→", mat.textureKey);
      } else {
        console.warn("⚠️ Texture", mat.map_Kd, "not found for", matName);
      }
    }
  }
 
  loadTorchOBJ(objText, materials);
});

document.getElementById("swordObjInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  const objFile = files.find(f => f.name.endsWith('.obj'));
  const mtlFile = files.find(f => f.name.endsWith('.mtl'));

  if (!objFile || !mtlFile) {
    alert("Upload both .obj and .mtl files.");
    return;
  }

  const [objText, mtlText] = await Promise.all([objFile.text(), mtlFile.text()]);
  const materials = parseMTL(mtlText);

  for (const matName in materials) {
    const mat = materials[matName];

    // Load base color texture
    if (mat.map_Kd) {
      const texFile = files.find(f => f.name === mat.map_Kd.split("/").pop());
      if (texFile) {
        mat.textureKey = "sword_" + matName;
        loadTextureFromFile(texFile, mat.textureKey);
        console.log("Sword texture loaded for", matName, "→", mat.textureKey);
      } else {
        console.warn("⚠️ Sword texture", mat.map_Kd, "not found for", matName);
      }
    }

    // Load metallic–roughness texture
    if (mat.map_Pr) {
      const prFile = files.find(f => f.name === mat.map_Pr.split("/").pop());
      if (prFile) {
        mat.metallicRoughnessKey = "sword_" + matName + "_metallicRoughness";
        loadTextureFromFile(prFile, mat.metallicRoughnessKey);
        console.log("Loaded MR texture for", matName, "→", mat.metallicRoughnessKey);
      } else {
        console.warn("⚠️ Missing metallic-roughness texture for", matName);
      }
    }

    // Load normal map
    if (mat.map_Bump || mat.bump || mat.map_normal) {
      const normPath = mat.map_Bump || mat.bump || mat.map_normal;
      const normFile = files.find(f => f.name === normPath.split("/").pop());
      if (normFile) {
        mat.normalMapKey = "sword_" + matName + "_normal";
        loadTextureFromFile(normFile, mat.normalMapKey);
        console.log("Loaded normal map for", matName, "→", mat.normalMapKey);
      } else {
        console.warn("⚠️ Missing normal map for", matName);
      }
    }
  }

  loadSwordOBJ(objText, materials);
});

document.getElementById("rockObjInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  const objFile = files.find(f => f.name.endsWith('.obj'));
  const mtlFile = files.find(f => f.name.endsWith('.mtl'));

  if (!objFile || !mtlFile) {
    alert("Upload both .obj and .mtl files for the pedestal.");
    return;
  }

  const [objText, mtlText] = await Promise.all([objFile.text(), mtlFile.text()]);
  const materials = parseMTL(mtlText);

  for (const matName in materials) {
    const mat = materials[matName];

    if (mat.map_Kd) {
      const texFile = files.find(f => f.name === mat.map_Kd.split("/").pop());
      if (texFile) {
        mat.textureKey = "pedestal_" + matName;
        loadTextureFromFile(texFile, mat.textureKey);
      }
    }

    if (mat.map_bump) {
      const bumpFile = files.find(f => f.name === mat.map_bump.split("/").pop());
      if (bumpFile) {
        mat.normalMapKey = "pedestal_" + matName + "_normal";
        loadTextureFromFile(bumpFile, mat.normalMapKey);
      }
    }
  }

  loadPedestalOBJ(objText, materials);
});

