/* ═══════════════════════════════════════════════════════════════
   GIEESK RECIPES — Cinematic 3D Hero Experience
   ───────────────────────────────────────────────────────────────
   Interactive floating-ingredient environment. Zero external assets.

     • Procedural ingredient geometry (25 types, generated in-code)
     • Custom SSS-approximating shader: wrapped diffuse + back-scatter
       + fresnel rim + specular — mimics light through fruit flesh
     • GPU instancing — hundreds of objects, ~25 draw calls
     • Volumetric fog + additive god-ray shafts
     • Scroll-driven camera flight with eased damping
     • Depth-weighted mouse parallax
     • Section-aware palette + ingredient-mix transitions
     • DPR clamping, offscreen pause, reduced-motion support
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('heroCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isMobile = window.innerWidth < 768;
  var isLowEnd = (navigator.hardwareConcurrency || 4) <= 4;

  var QUALITY = {
    perType   : isMobile ? 5   : (isLowEnd ? 8   : 13),
    dust      : isMobile ? 260 : (isLowEnd ? 500 : 900),
    godRays   : !isMobile,
    maxDPR    : isMobile ? 1.5 : 2,
    seg       : isMobile ? 14  : 22
  };

  var W = canvas.clientWidth  || window.innerWidth;
  var H = canvas.clientHeight || window.innerHeight;

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: !isMobile, alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxDPR));
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);

  var scene  = new THREE.Scene();
  scene.fog  = new THREE.FogExp2(0x0a0a09, 0.028);
  var camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 160);
  camera.position.set(0, 0, 18);

  /* ── Cuisine journey: the scene travels the world as you scroll ─ */
  var SECTIONS = [
    { id:'kenya',    key:0xE08A2E, fill:0x2E7D4F, fog:0x0B0806,
      mix:['tomato','chili','onion','coriander','garlic','peppercorn','berry','rice'],
      fx :{ spice:1.0, ember:0.75, bokeh:0.9, droplet:0.3 } },

    { id:'ethiopia', key:0xC9603A, fill:0x8B5A2B, fog:0x0C0705,
      mix:['coffeebean','chili','cardamom','garlic','onion','peppercorn','wheat','staranise'],
      fx :{ spice:1.2, ember:0.9, steam:0.7, bokeh:0.8, sand:0.5 } },

    { id:'italy',    key:0xD9A24B, fill:0x3E9C55, fog:0x0A0A07,
      mix:['tomato','basil','garlic','lemon','onion','chili','wheat','peppercorn'],
      fx :{ steam:1.0, bokeh:1.0, spice:0.6, droplet:0.45 } },

    { id:'tanzania', key:0xB8D96A, fill:0x1D9E75, fog:0x070A0A,
      mix:['lemon','orange','mint','coriander','rice','chili','droplet','ice'],
      fx :{ mist:1.0, droplet:0.9, bokeh:0.85, spice:0.5 } },

    { id:'japan',    key:0xE8B8C8, fill:0x6A8CB8, fog:0x080809,
      mix:['rice','ice','mint','droplet','peppercorn','berry'],
      fx :{ blossom:1.2, mist:0.5, droplet:0.6, bokeh:0.7 } },

    { id:'nordic',   key:0xBFD8E8, fill:0x6E8FA8, fog:0x06080A,
      mix:['ice','droplet','berry','blueberry','wheat','rice'],
      fx :{ snow:1.3, mist:0.6, bokeh:0.6 } }
  ];

  /* ── SSS-approximating shader ───────────────────────────────── */
  var VERT = [
    'attribute vec3 iColor;',
    'attribute float iSeed;',
    'varying vec3 vN; varying vec3 vView; varying vec3 vCol;',
    'varying float vSeed; varying float vDepth;',
    'void main(){',
    '  vCol = iColor; vSeed = iSeed;',
    '  #ifdef USE_INSTANCING',
    '    vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);',
    '    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);',
    '  #else',
    '    vec4 wp = modelMatrix * vec4(position,1.0);',
    '    vN = normalize(mat3(modelMatrix) * normal);',
    '  #endif',
    '  vView = normalize(cameraPosition - wp.xyz);',
    '  vec4 mv = viewMatrix * wp;',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec3 uKey; uniform vec3 uFill;',
    'uniform vec3 uKeyDir; uniform vec3 uFillDir;',
    'uniform vec3 uFogCol; uniform float uFogDensity;',
    'uniform float uTime; uniform float uGloss;',
    'varying vec3 vN; varying vec3 vView; varying vec3 vCol;',
    'varying float vSeed; varying float vDepth;',
    'void main(){',
    '  vec3 N = normalize(vN); vec3 V = normalize(vView);',
    // wrapped diffuse — light bleeds past terminator (SSS cue)
    '  float wK = pow(dot(N,uKeyDir)*0.5+0.5, 1.35);',
    '  float wF = pow(dot(N,uFillDir)*0.5+0.5, 1.6);',
    // back-scatter — thin edges transmit light from behind
    '  float tr = pow(clamp(dot(V,-uKeyDir),0.0,1.0), 3.0);',
    // fresnel rim — wet glossy skin
    '  float fr = pow(1.0-clamp(dot(N,V),0.0,1.0), 3.2);',
    // specular lobe
    '  vec3 Hv = normalize(uKeyDir+V);',
    '  float sp = pow(clamp(dot(N,Hv),0.0,1.0), mix(28.0,96.0,uGloss));',
    // per-instance tonal variation
    '  float vy = 0.86 + 0.28*fract(sin(vSeed*91.7)*43758.5453);',
    '  vec3 col = vCol*vy*(uKey*wK*1.15 + uFill*wF*0.5);',
    '  col += vCol*uKey*tr*0.55;',
    '  col += uKey*sp*(0.35+0.45*uGloss);',
    '  col += mix(uFill,uKey,0.6)*fr*0.5;',
    '  col += vCol*0.06;',
    '  float f = 1.0 - exp(-uFogDensity*uFogDensity*vDepth*vDepth);',
    '  col = mix(col, uFogCol, clamp(f,0.0,1.0));',
    '  col = col/(col+vec3(0.72));',           // filmic-ish tone curve
    '  col = pow(col, vec3(0.4545));',
    '  gl_FragColor = vec4(col,1.0);',
    '}'
  ].join('\n');

  function makeMaterial(gloss) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uKey       : { value: new THREE.Color(0xC9963A) },
        uFill      : { value: new THREE.Color(0x1D9E75) },
        uKeyDir    : { value: new THREE.Vector3(0.55,0.68,0.48).normalize() },
        uFillDir   : { value: new THREE.Vector3(-0.62,-0.3,0.42).normalize() },
        uFogCol    : { value: new THREE.Color(0x0A0A09) },
        uFogDensity: { value: 0.028 },
        uTime      : { value: 0 },
        uGloss     : { value: gloss }
      }
    });
  }

  /* ── Procedural geometry ────────────────────────────────────── */
  var S = QUALITY.seg;

  function organicSphere(r, seg, squash, amp, freq) {
    var g = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1));
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var n = Math.sin(v.x*freq) * Math.cos(v.y*freq*1.3) * Math.sin(v.z*freq*0.8);
      v.multiplyScalar(1 + n*amp);
      v.y *= squash;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function leafGeo(len, wid) {
    var g = new THREE.PlaneGeometry(wid, len, 5, 9);
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var t = (v.y/len) + 0.5;
      v.x *= Math.sin(t*Math.PI);
      v.z += Math.cos(t*Math.PI - Math.PI/2) * len * 0.16;
      v.z += Math.abs(v.x) * 0.28;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function starAniseGeo(r) {
    var shape = new THREE.Shape(), pts = 8;
    for (var i = 0; i <= pts*2; i++) {
      var a = (i/(pts*2))*Math.PI*2, rr = (i%2===0) ? r : r*0.42;
      var x = Math.cos(a)*rr, y = Math.sin(a)*rr;
      if (i===0) shape.moveTo(x,y); else shape.lineTo(x,y);
    }
    var g = new THREE.ExtrudeGeometry(shape, {
      depth:r*0.34, bevelEnabled:true, bevelThickness:r*0.09,
      bevelSize:r*0.09, bevelSegments:2, curveSegments:2 });
    g.center(); return g;
  }

  function beanGeo(r) {
    var g = new THREE.SphereGeometry(r, 16, 12);
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.z *= 0.62; v.y *= 1.18;
      if (v.z > 0) v.z -= Math.exp(-Math.pow(v.x/(r*0.16),2)) * r * 0.3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function chiliGeo(len, r) {
    var g = new THREE.CylinderGeometry(r*0.22, r, len, 12, 8);
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var t = (v.y/len) + 0.5;
      v.x += Math.sin(t*Math.PI*0.85) * len * 0.2;
      var b = 1 + Math.sin(t*Math.PI)*0.18;
      v.x *= b; v.z *= b;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function garlicGeo(r) {
    var g = new THREE.SphereGeometry(r, 20, 14);
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var lobe = 1 + Math.cos(Math.atan2(v.z, v.x)*6)*0.07;
      v.x *= lobe; v.z *= lobe;
      var t = (v.y/r + 1)*0.5;
      if (t > 0.72) { var k=(t-0.72)/0.28; v.x*=1-k*0.72; v.z*=1-k*0.72; v.y+=k*r*0.32; }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function citrusGeo(r) {
    var g = new THREE.SphereGeometry(r, 20, 14);
    var p = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.y *= 1.32;
      var t = Math.abs(v.y)/(r*1.32);
      if (t > 0.8) v.y += Math.sign(v.y) * ((t-0.8)/0.2) * r * 0.2;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  var LIB = {
    tomato    :{g:function(){return organicSphere(0.62,S,0.82,0.035,4.2);},c:0xD8442A,s:[0.85,1.25],gl:0.85},
    orange    :{g:function(){return organicSphere(0.60,S,0.94,0.05,9.0);}, c:0xE07B22,s:[0.8,1.2], gl:0.45},
    lemon     :{g:function(){return citrusGeo(0.46);},                     c:0xE8C63A,s:[0.8,1.15],gl:0.5},
    apple     :{g:function(){return organicSphere(0.58,S,0.90,0.03,3.4);}, c:0xB4272E,s:[0.85,1.2],gl:0.9},
    strawberry:{g:function(){return organicSphere(0.40,S,1.18,0.07,11.0);},c:0xC42238,s:[0.8,1.25],gl:0.75},
    berry     :{g:function(){return organicSphere(0.24,14,0.94,0.05,8.0);},c:0x7A1E44,s:[0.8,1.4], gl:0.8},
    blueberry :{g:function(){return organicSphere(0.22,14,0.90,0.04,7.0);},c:0x3A4A8C,s:[0.8,1.4], gl:0.7},
    avocado   :{g:function(){return citrusGeo(0.48);},                     c:0x3E5B26,s:[0.9,1.2], gl:0.55},
    garlic    :{g:function(){return garlicGeo(0.42);},                     c:0xEFE6D2,s:[0.85,1.2],gl:0.35},
    onion     :{g:function(){return organicSphere(0.52,20,0.92,0.045,5.5);},c:0x8E3A6B,s:[0.85,1.2],gl:0.55},
    chili     :{g:function(){return chiliGeo(1.15,0.17);},                 c:0xCC2A1E,s:[0.85,1.2],gl:0.88},
    basil     :{g:function(){return leafGeo(0.85,0.52);},                  c:0x2F7D3E,s:[0.9,1.35],gl:0.5},
    mint      :{g:function(){return leafGeo(0.72,0.46);},                  c:0x3E9C55,s:[0.9,1.3], gl:0.55},
    coriander :{g:function(){return leafGeo(0.60,0.50);},                  c:0x4E9440,s:[0.9,1.3], gl:0.45},
    cinnamon  :{g:function(){return new THREE.CylinderGeometry(0.11,0.12,1.05,12,1);},c:0x8A4B22,s:[0.85,1.2],gl:0.3},
    vanilla   :{g:function(){return new THREE.CylinderGeometry(0.055,0.075,1.25,8,1);},c:0x3A2416,s:[0.85,1.2],gl:0.4},
    staranise :{g:function(){return starAniseGeo(0.34);},                  c:0x6B3A1E,s:[0.85,1.25],gl:0.35},
    cardamom  :{g:function(){return citrusGeo(0.15);},                     c:0x9FA86A,s:[0.85,1.3],gl:0.4},
    peppercorn:{g:function(){return organicSphere(0.11,10,0.95,0.09,16);}, c:0x2A2320,s:[0.8,1.4], gl:0.6},
    coffeebean:{g:function(){return beanGeo(0.19);},                       c:0x4A2A16,s:[0.85,1.3],gl:0.55},
    cocoabean :{g:function(){return beanGeo(0.21);},                       c:0x39251A,s:[0.85,1.3],gl:0.45},
    rice      :{g:function(){return citrusGeo(0.075);},                    c:0xF0E9D8,s:[0.8,1.4], gl:0.4},
    wheat     :{g:function(){return citrusGeo(0.09);},                     c:0xD9B871,s:[0.8,1.4], gl:0.35},
    ice       :{g:function(){return new THREE.IcosahedronGeometry(0.30,0);},c:0xBFE4EC,s:[0.85,1.25],gl:0.98},
    droplet   :{g:function(){return organicSphere(0.13,12,1.12,0.02,5);},  c:0xAFD8E0,s:[0.8,1.35],gl:0.98}
  };

  /* ── Build instanced fields ─────────────────────────────────── */
  var FIELD_R = 15, Z_FAR = -34, Z_NEAR = 12;
  var fields = [], dummy = new THREE.Object3D();

  Object.keys(LIB).forEach(function (key) {
    var def = LIB[key], count = QUALITY.perType;
    var geo = def.g(), mat = makeMaterial(def.gl);
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    var iCol = new Float32Array(count*3), iSeed = new Float32Array(count);
    var base = new THREE.Color(def.c), items = [];

    for (var i = 0; i < count; i++) {
      var c = base.clone();
      c.offsetHSL((Math.random()-0.5)*0.035, (Math.random()-0.5)*0.12, (Math.random()-0.5)*0.10);
      iCol[i*3]=c.r; iCol[i*3+1]=c.g; iCol[i*3+2]=c.b;
      iSeed[i] = Math.random()*100;
      var ang = Math.random()*Math.PI*2;
      var rad = Math.pow(Math.random(),0.62)*FIELD_R;
      items.push({
        x: Math.cos(ang)*rad, y: Math.sin(ang)*rad*0.68,
        z: Z_FAR + Math.random()*(Z_NEAR-Z_FAR),
        rx: Math.random()*6.28, ry: Math.random()*6.28, rz: Math.random()*6.28,
        vrx:(Math.random()-0.5)*0.13, vry:(Math.random()-0.5)*0.13, vrz:(Math.random()-0.5)*0.09,
        drift:(Math.random()-0.5)*0.05,
        bobA: 0.1+Math.random()*0.24, bobF: 0.16+Math.random()*0.34,
        phase: Math.random()*6.28,
        scale: def.s[0] + Math.random()*(def.s[1]-def.s[0]),
        depth: 0.3 + Math.random()*0.7
      });
    }
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iCol,3));
    geo.setAttribute('iSeed',  new THREE.InstancedBufferAttribute(iSeed,1));
    mesh.userData = { key:key, items:items, opacity:0, target:0 };
    scene.add(mesh); fields.push(mesh);
  });

  /* ── Dust motes ─────────────────────────────────────────────── */
  var dN = QUALITY.dust;
  var dustGeo = new THREE.BufferGeometry();
  var dPos = new Float32Array(dN*3), dCol = new Float32Array(dN*3), dSize = new Float32Array(dN);
  var dData = [], PAL = [0xC9963A,0xE8C63A,0xD8845A,0xFFF0D0,0x9FBF7A];

  for (var i = 0; i < dN; i++) {
    var ang = Math.random()*Math.PI*2, rad = Math.pow(Math.random(),0.5)*FIELD_R*1.35;
    var x = Math.cos(ang)*rad, y = Math.sin(ang)*rad*0.8;
    dPos[i*3]=x; dPos[i*3+1]=y; dPos[i*3+2]=Z_FAR+Math.random()*(Z_NEAR-Z_FAR);
    var cc = new THREE.Color(PAL[(Math.random()*PAL.length)|0]);
    dCol[i*3]=cc.r; dCol[i*3+1]=cc.g; dCol[i*3+2]=cc.b;
    dSize[i] = 0.9 + Math.random()*2.6;
    dData.push({bobA:0.1+Math.random()*0.3, bobF:0.2+Math.random()*0.5, phase:Math.random()*6.28, baseY:y});
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos,3));
  dustGeo.setAttribute('color',    new THREE.BufferAttribute(dCol,3));
  dustGeo.setAttribute('aSize',    new THREE.BufferAttribute(dSize,1));

  var dustMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
    uniforms:{ uOpacity:{value:0}, uPR:{value:renderer.getPixelRatio()} },
    vertexShader:[
      'attribute float aSize; varying vec3 vC; varying float vFade; uniform float uPR;',
      'void main(){ vC = color;',
      '  vec4 mv = modelViewMatrix*vec4(position,1.0); float d = -mv.z;',
      '  vFade = smoothstep(0.5,6.0,d)*(1.0-smoothstep(38.0,62.0,d));',
      '  gl_PointSize = aSize*uPR*(26.0/max(d,0.6));',
      '  gl_Position = projectionMatrix*mv; }'
    ].join('\n'),
    fragmentShader:[
      'varying vec3 vC; varying float vFade; uniform float uOpacity;',
      'void main(){ vec2 uv = gl_PointCoord-0.5; float r = length(uv);',
      '  if(r>0.5) discard;',
      '  float a = pow(1.0-r*2.0,2.4);',
      '  gl_FragColor = vec4(vC, a*vFade*uOpacity); }'
    ].join('\n')
  });
  var dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  /* ── God rays ───────────────────────────────────────────────── */
  var rays = null;
  if (QUALITY.godRays) {
    var rayMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide,
      uniforms:{ uCol:{value:new THREE.Color(0xC9963A)}, uOpacity:{value:0}, uTime:{value:0} },
      vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader:[
        'varying vec2 vUv; uniform vec3 uCol; uniform float uOpacity; uniform float uTime;',
        'void main(){',
        '  float edge = smoothstep(0.0,0.34,vUv.x)*smoothstep(1.0,0.66,vUv.x);',
        '  float fall = pow(1.0-vUv.y,1.7);',
        '  float sh = 0.85+0.15*sin(vUv.y*9.0+uTime*0.55);',
        '  gl_FragColor = vec4(uCol, edge*fall*sh*uOpacity); }'
      ].join('\n')
    });
    rays = new THREE.Group();
    for (var ri = 0; ri < 4; ri++) {
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(9,30), rayMat);
      pl.position.set(-9+ri*6.5, 5, -20-ri*3.5);
      pl.rotation.z = -0.32+ri*0.06; pl.rotation.y = 0.22;
      rays.add(pl);
    }
    rays.userData.mat = rayMat;
    scene.add(rays);
  }

  /* ── Atmospheric FX systems ─────────────────────────────────── */
  var fxSystems = {};
  if (window.GieesKFX) {
    var fxBounds = { r: FIELD_R*1.15, yMin: -13, yMax: 13, zFar: Z_FAR, zNear: Z_NEAR };
    var fxScale  = isMobile ? 0.4 : (isLowEnd ? 0.65 : 1.0);
    window.GieesKFX.list.forEach(function (name) {
      var sysm = window.GieesKFX.create(THREE, name, fxScale, fxBounds);
      if (sysm) {
        sysm.material.uniforms.uPR.value = renderer.getPixelRatio();
        scene.add(sysm);
        fxSystems[name] = sysm;
      }
    });
  }

  /* ── State ──────────────────────────────────────────────────── */
  var st = { scroll:0, scrollT:0, mx:0, my:0, mxT:0, myT:0,
             camZ:18, camZT:18, visible:true, intro:0 };

  var curKey = new THREE.Color(SECTIONS[0].key);
  var curFill= new THREE.Color(SECTIONS[0].fill);
  var curFog = new THREE.Color(SECTIONS[0].fog);
  var tA = new THREE.Color(), tB = new THREE.Color();

  // Video stays "part of the site" visually for a generous scroll depth
  // (hero + a couple of sections beyond it) then pauses decoding once
  // genuinely far down — where it's long buried under other content and
  // costing GPU/CPU for zero visible benefit. Resumes automatically on
  // the way back up. Threshold in viewport-heights, easy to tune.
  var VIDEO_PAUSE_AFTER_VH = 3;
  function onScroll() {
    var d = document.documentElement;
    var max = (d.scrollHeight - window.innerHeight) || 1;
    st.scroll = Math.min(1, Math.max(0, window.scrollY/max));
    if (window.GieesKVideo) {
      window.GieesKVideo.setScrollPaused(
        window.scrollY > window.innerHeight * VIDEO_PAUSE_AFTER_VH
      );
    }
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  if (!REDUCED) {
    window.addEventListener('pointermove', function(e){
      st.mxT = (e.clientX/window.innerWidth)*2-1;
      st.myT = (e.clientY/window.innerHeight)*2-1;
    }, {passive:true});
  }

  var heroEl = canvas.closest ? (canvas.closest('.hero') || canvas.parentElement) : canvas.parentElement;
  if ('IntersectionObserver' in window && heroEl) {
    new IntersectionObserver(function(es){ st.visible = es[0].isIntersecting; },
      {threshold:0}).observe(heroEl);
  }

  window.addEventListener('resize', function(){
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    camera.aspect = W/H; camera.updateProjectionMatrix();
    renderer.setSize(W,H);
    dustMat.uniforms.uPR.value = renderer.getPixelRatio();
  }, {passive:true});

  /* ── Cinematic video backdrop (progressive enhancement) ─────── */
  var videoOn = false;
  if (window.GieesKVideo) {
    videoOn = window.GieesKVideo.init({
      sections: SECTIONS,
      host: document.body,
      onFail: function (reason) {
        // Silent fallback — the WebGL scene already carries the page
        document.body.classList.remove('has-video-bg');
        if (window.console && reason === 'error') {
          console.info('[GieesK] Video backdrop unavailable, using 3D scene only.');
        }
      }
    });
    if (videoOn) document.body.classList.add('has-video-bg');
  }

  /* ── Ambient sound toggle (opt-in only) ─────────────────────── */
  var soundBtn = document.getElementById('heroSoundToggle');
  if (soundBtn) {
    if (!window.GieesKAudio || !window.GieesKAudio.supported()) {
      soundBtn.style.display = 'none';
    } else {
      soundBtn.addEventListener('click', function () {
        var on = window.GieesKAudio.toggle();
        soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        soundBtn.setAttribute('aria-label',
          on ? 'Disable ambient sound' : 'Enable ambient sound');
        var ic = soundBtn.querySelector('i');
        if (ic) ic.className = on ? 'ti ti-volume' : 'ti ti-volume-3';
        if (on) {
          var sf2 = st.scrollT*(SECTIONS.length-1);
          var si2 = Math.min(SECTIONS.length-2, Math.floor(sf2));
          window.GieesKAudio.setMix(
            SECTIONS[si2].id,
            SECTIONS[Math.min(si2+1, SECTIONS.length-1)].id,
            sf2-si2, 1.5);
        }
      });
      // Pause ambience when the tab loses focus
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && window.GieesKAudio.isOn()) {
          window.GieesKAudio.disable();
          soundBtn.setAttribute('aria-pressed','false');
          var ic2 = soundBtn.querySelector('i');
          if (ic2) ic2.className = 'ti ti-volume-3';
        }
      });
    }
  }

  /* ── Loop ───────────────────────────────────────────────────── */
  var clock = new THREE.Clock(), raf = null, audioAccum = 0, videoAccum = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!st.visible) return;

    var dt = Math.min(clock.getDelta(), 0.05);
    var t  = clock.elapsedTime;

    st.scrollT += (st.scroll - st.scrollT) * Math.min(1, dt*2.6);
    st.mx      += (st.mxT - st.mx) * Math.min(1, dt*2.2);
    st.my      += (st.myT - st.my) * Math.min(1, dt*2.2);
    st.intro   += (1 - st.intro)   * Math.min(1, dt*0.85);

    var sf = st.scrollT*(SECTIONS.length-1);
    var si = Math.min(SECTIONS.length-2, Math.floor(sf));
    var fr = sf - si;
    var A = SECTIONS[si], B = SECTIONS[Math.min(si+1, SECTIONS.length-1)];

    tA.set(A.key);  tB.set(B.key);  curKey.copy(tA).lerp(tB, fr);
    tA.set(A.fill); tB.set(B.fill); curFill.copy(tA).lerp(tB, fr);
    tA.set(A.fog);  tB.set(B.fog);  curFog.copy(tA).lerp(tB, fr);
    scene.fog.color.copy(curFog);

    st.camZT = 18 - st.scrollT*30;
    st.camZ += (st.camZT - st.camZ) * Math.min(1, dt*2.0);
    camera.position.z = st.camZ;
    camera.position.x += ((st.mx*2.1 + Math.sin(t*0.11)*0.5) - camera.position.x) * Math.min(1, dt*1.7);
    camera.position.y += ((-st.my*1.5 + Math.cos(t*0.09)*0.35) - camera.position.y) * Math.min(1, dt*1.7);
    camera.lookAt(st.mx*0.7, -st.my*0.5, camera.position.z - 12);
    camera.rotation.z = Math.sin(t*0.07)*0.012;

    var camZ = camera.position.z;

    for (var f = 0; f < fields.length; f++) {
      var mesh = fields[f], ud = mesh.userData;
      var inA = A.mix.indexOf(ud.key) !== -1;
      var inB = B.mix.indexOf(ud.key) !== -1;
      ud.target = Math.min(1, (inA ? (1-fr) : 0) + (inB ? fr : 0));
      ud.opacity += (ud.target - ud.opacity) * Math.min(1, dt*1.15);

      if (ud.opacity < 0.012) { mesh.visible = false; continue; }
      mesh.visible = true;

      var items = ud.items;
      for (var i2 = 0; i2 < items.length; i2++) {
        var it = items[i2];
        it.rx += it.vrx*dt; it.ry += it.vry*dt; it.rz += it.vrz*dt;

        if (it.z > camZ + 6) {
          it.z -= (Z_NEAR - Z_FAR);
          var a2 = Math.random()*Math.PI*2, r2 = Math.pow(Math.random(),0.62)*FIELD_R;
          it.x = Math.cos(a2)*r2; it.y = Math.sin(a2)*r2*0.68;
        }
        it.z += it.drift*dt;

        var px = st.mx * it.depth * 1.5;
        var py = -st.my * it.depth * 1.1;
        var bob = Math.sin(t*it.bobF + it.phase) * it.bobA;

        dummy.position.set(it.x+px, it.y+bob+py, it.z);
        dummy.rotation.set(it.rx, it.ry, it.rz);
        dummy.scale.setScalar(it.scale * ud.opacity * st.intro);
        dummy.updateMatrix();
        mesh.setMatrixAt(i2, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      var u = mesh.material.uniforms;
      u.uKey.value.copy(curKey);
      u.uFill.value.copy(curFill);
      u.uFogCol.value.copy(curFog);
      u.uTime.value = t;
    }

    var dp = dustGeo.attributes.position.array;
    for (var d2 = 0; d2 < dN; d2++) {
      var dd = dData[d2], zi = d2*3+2;
      if (dp[zi] > camZ + 6) dp[zi] -= (Z_NEAR - Z_FAR);
      dp[zi] += 0.22*dt;
      dp[d2*3+1] = dd.baseY + Math.sin(t*dd.bobF + dd.phase)*dd.bobA + (-st.my*0.6);
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustMat.uniforms.uOpacity.value = 0.55 * st.intro;

    if (rays) {
      var rm = rays.userData.mat;
      rm.uniforms.uCol.value.copy(curKey);
      rm.uniforms.uOpacity.value = 0.16 * st.intro * (1 - st.scrollT*0.45);
      rm.uniforms.uTime.value = t;
      rays.position.x = st.mx*0.9;
      rays.position.z = camZ - 30;
    }

    /* ── Atmospheric FX: cross-fade by cuisine ─────────────────── */
    if (window.GieesKFX) {
      var mouseOff = { x: st.mx, y: -st.my };
      var fxB = { r: FIELD_R*1.15, yMin:-13, yMax:13, zFar:Z_FAR, zNear:Z_NEAR };
      for (var fk in fxSystems) {
        var sysm = fxSystems[fk], fud = sysm.userData;
        var wA = (A.fx && A.fx[fk]) || 0;
        var wB = (B.fx && B.fx[fk]) || 0;
        fud.target = wA*(1-fr) + wB*fr;
        fud.opacity += (fud.target - fud.opacity) * Math.min(1, dt*0.9);
        if (fud.opacity < 0.008) { sysm.visible = false; continue; }
        sysm.visible = true;
        window.GieesKFX.update(sysm, dt, t, camZ, fxB, mouseOff);
      }
    }

    /* ── Video backdrop follows the same scroll + cuisine mood ─── */
    if (videoOn && window.GieesKVideo.isActive()) {
      window.GieesKVideo.update(st.scrollT);
      videoAccum += dt;
      if (videoAccum > 0.5) {        // throttle — CSS filter changes are costly
        videoAccum = 0;
        // Nudge the grade toward the current cuisine's key colour
        var hueShift = -6 + (curKey.r - curKey.b) * 14;
        window.GieesKVideo.setGrade({
          hueRotate: hueShift,
          saturate : 1.12 + st.scrollT * 0.10,
          brightness: 0.62 - st.scrollT * 0.06
        });
      }
    }

    /* ── Ambient soundscape follows the cuisine ────────────────── */
    if (window.GieesKAudio && window.GieesKAudio.isOn()) {
      audioAccum += dt;
      if (audioAccum > 0.4) {          // throttle — audio params are expensive
        audioAccum = 0;
        window.GieesKAudio.setMix(A.id, B.id, fr, 1.0);
      }
    }

    renderer.render(scene, camera);
  }

  if (REDUCED) {
    st.intro = 1;
    fields.forEach(function(mesh){
      var ud = mesh.userData;
      ud.opacity = SECTIONS[0].mix.indexOf(ud.key) !== -1 ? 1 : 0;
      mesh.visible = ud.opacity > 0.01;
      ud.items.forEach(function(it, i3){
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rx, it.ry, it.rz);
        dummy.scale.setScalar(it.scale * ud.opacity);
        dummy.updateMatrix();
        mesh.setMatrixAt(i3, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    dustMat.uniforms.uOpacity.value = 0.4;
    renderer.render(scene, camera);
  } else {
    frame();
  }

  document.addEventListener('visibilitychange', function(){
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    else if (!raf && !REDUCED) { clock.getDelta(); frame(); }
  });
})();
