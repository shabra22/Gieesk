/* ═══════════════════════════════════════════════════════════════
   GIEESK — Atmospheric FX Layer
   ───────────────────────────────────────────────────────────────
   Cuisine-driven particle systems that layer over the ingredient
   field: steam, embers, blossoms, snow, sand, ocean mist, spice
   sparkle, water droplets, and out-of-focus bokeh.

   All GPU-instanced Points with a shared shader. One draw call per
   effect type. No external assets.
═══════════════════════════════════════════════════════════════ */
window.GieesKFX = (function () {
  'use strict';

  /* Each effect defines its own physics + look.
     rise/fall, drift, spin, colour, size, softness, blend. */
  var EFFECTS = {
    steam: {                      // rises, expands, fades — over hot dishes
      count: 90, col: [0xE8E2D6, 0xFFFFFF, 0xD8D0C0],
      size: [14, 34], life: [3.2, 6.5],
      vy: [0.55, 1.15], vx: 0.18, swirl: 0.9,
      grow: 1.9, opacity: 0.16, soft: 3.2
    },
    ember: {                      // glowing motes near grilled food
      count: 70, col: [0xFF7A2A, 0xFFC048, 0xFF4A18],
      size: [2.0, 5.5], life: [2.0, 4.5],
      vy: [0.7, 1.6], vx: 0.34, swirl: 1.6,
      grow: 0.7, opacity: 0.85, soft: 2.0, glow: true
    },
    blossom: {                    // cherry petals — Japanese cuisine
      count: 55, col: [0xFFC9DA, 0xFFE0EA, 0xF7A8C4],
      size: [7, 15], life: [5.0, 9.0],
      vy: [-0.42, -0.16], vx: 0.55, swirl: 2.4,
      grow: 1.0, opacity: 0.7, soft: 1.6, flutter: true
    },
    snow: {                       // Nordic cuisine
      count: 110, col: [0xFFFFFF, 0xE6F0FA, 0xCFE2F2],
      size: [3, 8], life: [6.0, 11.0],
      vy: [-0.34, -0.12], vx: 0.28, swirl: 1.1,
      grow: 1.0, opacity: 0.6, soft: 2.4
    },
    sand: {                       // Middle Eastern — becomes spice
      count: 130, col: [0xD9B071, 0xC69A5A, 0xEBCB94],
      size: [1.6, 4.2], life: [3.5, 7.0],
      vy: [-0.1, 0.16], vx: 0.95, swirl: 1.3,
      grow: 1.0, opacity: 0.5, soft: 2.0
    },
    mist: {                       // ocean spray — seafood
      count: 70, col: [0xCFE6EC, 0xA8D2E0, 0xEAF6F8],
      size: [18, 44], life: [4.0, 8.0],
      vy: [0.1, 0.45], vx: 0.5, swirl: 0.7,
      grow: 1.6, opacity: 0.11, soft: 3.6
    },
    spice: {                      // sparkling spice dust in the light
      count: 150, col: [0xE8A03A, 0xD4652A, 0xF0C86A, 0xB8452A],
      size: [1.2, 3.4], life: [2.5, 5.5],
      vy: [-0.2, 0.28], vx: 0.42, swirl: 1.8,
      grow: 1.0, opacity: 0.9, soft: 1.7, twinkle: true
    },
    droplet: {                    // refractive water beads
      count: 60, col: [0xCFE8F0, 0xFFFFFF, 0xAFD8E4],
      size: [2.5, 6.5], life: [3.0, 6.0],
      vy: [-0.5, -0.18], vx: 0.2, swirl: 0.5,
      grow: 1.0, opacity: 0.75, soft: 1.5, glow: true
    },
    bokeh: {                      // large out-of-focus orbs — the "photo" feel
      count: 40, col: [0xC9963A, 0xD8845A, 0xE8C63A, 0x8FBF6A],
      size: [40, 110], life: [7.0, 14.0],
      vy: [-0.12, 0.12], vx: 0.15, swirl: 0.3,
      grow: 1.0, opacity: 0.09, soft: 4.5, ring: true
    }
  };

  var VERT = [
    'attribute float aSize; attribute float aSeed; attribute float aLife;',
    'attribute vec3 aCol;',
    'varying vec3 vC; varying float vA; varying float vSeed; varying float vLife;',
    'uniform float uPR; uniform float uTime;',
    'void main(){',
    '  vC = aCol; vSeed = aSeed; vLife = aLife;',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  float d = -mv.z;',
    // fade in near camera, fade out at distance
    '  vA = smoothstep(0.4,5.0,d) * (1.0 - smoothstep(34.0,58.0,d));',
    '  gl_PointSize = aSize * uPR * (26.0/max(d,0.6));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec3 vC; varying float vA; varying float vSeed; varying float vLife;',
    'uniform float uOpacity; uniform float uSoft; uniform float uTime;',
    'uniform float uTwinkle; uniform float uRing; uniform float uGlow;',
    'void main(){',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float r = length(uv) * 2.0;',
    '  if (r > 1.0) discard;',
    '  float a = pow(1.0 - r, uSoft);',
    // ring = bokeh: bright rim, hollow centre (real lens character)
    '  if (uRing > 0.5) {',
    '    float rim = smoothstep(0.55,0.94,r) * (1.0-smoothstep(0.94,1.0,r));',
    '    a = mix(a*0.35, rim, 0.72);',
    '  }',
    // twinkle = spice catching the light
    '  if (uTwinkle > 0.5) {',
    '    a *= 0.45 + 0.55*abs(sin(uTime*2.6 + vSeed*24.0));',
    '  }',
    '  vec3 col = vC;',
    '  if (uGlow > 0.5) col += vC * (1.0-r) * 0.9;',   // hot core
    '  gl_FragColor = vec4(col, a * vA * vLife * uOpacity);',
    '}'
  ].join('\n');

  /* ── Build one Points system per effect ───────────────────────── */
  function createSystem(THREE, name, scale, bounds) {
    var def = EFFECTS[name];
    if (!def) return null;
    var n = Math.max(6, Math.round(def.count * scale));

    var pos  = new Float32Array(n * 3);
    var col  = new Float32Array(n * 3);
    var size = new Float32Array(n);
    var seed = new Float32Array(n);
    var lifeA= new Float32Array(n);
    var parts = [];

    for (var i = 0; i < n; i++) {
      var c = new THREE.Color(def.col[(Math.random()*def.col.length)|0]);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
      size[i] = def.size[0] + Math.random()*(def.size[1]-def.size[0]);
      seed[i] = Math.random();
      lifeA[i]= 0;
      parts.push(spawn(def, bounds, {}, true));
      pos[i*3]=parts[i].x; pos[i*3+1]=parts[i].y; pos[i*3+2]=parts[i].z;
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    g.setAttribute('aCol',     new THREE.BufferAttribute(col,3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(size,1));
    g.setAttribute('aSeed',    new THREE.BufferAttribute(seed,1));
    g.setAttribute('aLife',    new THREE.BufferAttribute(lifeA,1));

    var m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: (name==='steam'||name==='mist') ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uPR      : { value: 1 },
        uTime    : { value: 0 },
        uOpacity : { value: 0 },
        uSoft    : { value: def.soft },
        uTwinkle : { value: def.twinkle ? 1 : 0 },
        uRing    : { value: def.ring    ? 1 : 0 },
        uGlow    : { value: def.glow    ? 1 : 0 }
      }
    });

    var pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.userData = { name:name, def:def, parts:parts, n:n,
                     opacity:0, target:0, baseSize:size.slice() };
    return pts;
  }

  function spawn(def, b, p, initial) {
    p = p || {};
    var ang = Math.random()*Math.PI*2;
    var rad = Math.pow(Math.random(), 0.55) * b.r;
    p.x = Math.cos(ang)*rad;

    // Choose the spawn edge from NET drift, not just vy[0].
    // Effects like spice/sand straddle zero (some rise, some fall) —
    // those get seeded through the middle so they fill the volume
    // instead of piling against one edge.
    var netV = (def.vy[0] + def.vy[1]) * 0.5;
    var span = b.yMax - b.yMin;
    if (Math.abs(netV) < 0.08) {
      p.y = b.yMin + Math.random()*span;              // bidirectional: fill volume
    } else if (netV > 0) {
      p.y = b.yMin + Math.random()*span*(initial?1:0.35);   // rises from below
    } else {
      p.y = b.yMax - Math.random()*span*(initial?1:0.25);   // falls from above
    }

    p.z = b.zFar + Math.random()*(b.zNear-b.zFar);
    p.vy = def.vy[0] + Math.random()*(def.vy[1]-def.vy[0]);
    p.vx = (Math.random()-0.5)*def.vx;
    p.phase = Math.random()*6.28;
    p.swirlF= 0.2 + Math.random()*0.5;
    p.maxLife = def.life[0] + Math.random()*(def.life[1]-def.life[0]);
    p.age = initial ? Math.random()*p.maxLife : 0;
    p.spin = (Math.random()-0.5)*2;
    return p;
  }

  function update(sys, dt, t, camZ, bounds, mouse) {
    var ud = sys.userData, def = ud.def, parts = ud.parts;
    var pos  = sys.geometry.attributes.position.array;
    var life = sys.geometry.attributes.aLife.array;
    var sizeA= sys.geometry.attributes.aSize.array;

    for (var i = 0; i < ud.n; i++) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.maxLife) spawn(def, bounds, p, false);

      var k = p.age / p.maxLife;               // 0→1 through life

      // vertical motion + horizontal swirl on invisible air currents
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin(t*p.swirlF + p.phase) * def.swirl * dt;
      p.z += 0.12 * dt;

      // petals & snow flutter side to side
      if (def.flutter) p.x += Math.sin(t*2.1 + p.phase)*0.9*dt;

      // recycle past camera
      if (p.z > camZ + 5) p.z -= (bounds.zNear - bounds.zFar);

      pos[i*3]   = p.x + mouse.x * 0.7;
      pos[i*3+1] = p.y + mouse.y * 0.5;
      pos[i*3+2] = p.z;

      // fade in at birth, out at death
      life[i] = Math.min(1, k*6) * (1 - Math.pow(k, 2.2));

      // steam & mist expand as they rise
      if (def.grow !== 1.0) sizeA[i] = ud.baseSize[i] * (1 + (def.grow-1)*k);
    }

    sys.geometry.attributes.position.needsUpdate = true;
    sys.geometry.attributes.aLife.needsUpdate    = true;
    if (def.grow !== 1.0) sys.geometry.attributes.aSize.needsUpdate = true;

    sys.material.uniforms.uTime.value    = t;
    sys.material.uniforms.uOpacity.value = ud.opacity * def.opacity;
  }

  return {
    EFFECTS: EFFECTS,
    create : createSystem,
    update : update,
    list   : Object.keys(EFFECTS)
  };
})();
