/* Naufragés : l'île en 3D (Three.js + modèles Blender de tools/naufrages3d/assets.py, dans img/naufrages/).
   Ce fichier ne fait que dessiner : il lit la vue du jeu (renderNaufrages lui passe v) et pose sur l'île la météo,
   le moment de la journée, les réserves, le radeau et les naufragés. Les règles ne passent jamais par ici.
   Le canevas couvre tout l'écran, derrière l'interface en verre ; la vue est décalée pour que l'île tombe dans
   l'emplacement réservé par .nf-stage (en haut sur téléphone, à gauche sur PC).
   Pas de WebGL, ou chargement raté : NF3D.off() devient vrai, et renderNaufrages garde le dessin d'avant. */
'use strict';

const NF3D = (() => {
  const V = '0.160.0', CDN = `https://cdn.jsdelivr.net/npm/three@${V}`;
  const MODELS = ['ile', 'palmier', 'buche', 'voile', 'poisson', 'jarre', 'feu', 'flamme', 'rocher', 'caisse', 'naufrage'];
  const QUIET = matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'idle', T = null, M = {}, R = null, last = null, sig = '', raf = 0, lastFrame = 0, hostEl = null;

  function webgl() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
  }

  // ------------------------------------------------------------ chargement : Three.js depuis jsDelivr, puis les modèles
  async function boot() {
    state = 'loading';
    try {
      T = await import(`${CDN}/build/three.module.js`);
      const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js`);
      const loader = new GLTFLoader();
      const get = n => new Promise((ok, ko) => loader.load(`img/naufrages/${n}.glb?v=${ASSET_V}`, g => ok(g.scene), undefined, ko));
      (await Promise.all(MODELS.map(async n => [n, await get(n)]))).forEach(([n, o]) => { M[n] = o; });
      build();
      state = 'ready';
      // l'écran est redessiné : il remplace le dessin d'attente par l'emplacement de l'île, et accroche le canevas
      if (view?.nf && typeof renderNaufrages === 'function') renderNaufrages(view.nf);
    } catch (e) {
      console.warn('Naufragés 3D indisponible :', e);
      state = 'off';
      if (view?.nf && typeof renderNaufrages === 'function') renderNaufrages(view.nf);   // retour au dessin d'avant
    }
  }

  // ------------------------------------------------------------ la scène fixe : ciel, mer, lagon, île, palmiers, rochers, feu, épave
  function build() {
    const canvas = document.createElement('canvas'); canvas.className = 'nf3d-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 300);
    const skyCanvas = document.createElement('canvas'); skyCanvas.width = 2; skyCanvas.height = 256;
    const skyTex = new T.CanvasTexture(skyCanvas); skyTex.colorSpace = T.SRGBColorSpace;
    scene.add(new T.Mesh(new T.SphereGeometry(120, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false })));
    scene.fog = new T.Fog('#cfeaf5', 45, 110);
    const hemi = new T.HemisphereLight('#e8f6ff', '#d9b77d', 1.05); scene.add(hemi);
    const sun = new T.DirectionalLight('#fff3dc', 2.2);
    sun.position.set(-6, 11, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 }); sun.shadow.bias = -0.0008;
    scene.add(sun);
    const fire = new T.PointLight('#ff9a3c', 6, 7, 1.6); fire.position.set(0.4, 0.9, 0.6); scene.add(fire);

    const seaGeo = new T.PlaneGeometry(90, 90, 80, 80); seaGeo.rotateX(-Math.PI / 2);
    const seaBase = seaGeo.attributes.position.array.slice();
    const seaMat = new T.MeshStandardMaterial({ color: '#2aa7c9', roughness: 0.35, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.94 });
    const sea = new T.Mesh(seaGeo, seaMat); sea.receiveShadow = true; scene.add(sea);
    const lagonMat = new T.MeshStandardMaterial({ color: '#5fd3df', roughness: 0.3, transparent: true, opacity: 0.55 });
    const lagon = new T.Mesh(new T.CircleGeometry(1, 48), lagonMat); lagon.rotation.x = -Math.PI / 2; lagon.scale.set(6.2, 4.6, 1); lagon.position.y = -0.03; scene.add(lagon);

    const shade = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
    const island = shade(M.ile.clone(true)); scene.add(island);
    const ray = new T.Raycaster();
    const ground = (x, z) => { ray.set(new T.Vector3(x, 10, z), new T.Vector3(0, -1, 0)); const h = ray.intersectObject(island, true)[0]; return h ? h.point.y : 0; };
    const put = (name, x, z, { y = null, ry = 0, s = 1, rx = 0, rz = 0, into = scene } = {}) => {
      const o = shade(M[name].clone(true)); o.position.set(x, y ?? ground(x, z), z); o.rotation.set(rx, ry, rz); o.scale.setScalar(s); into.add(o); return o;
    };
    const palm = put('palmier', -2.2, -0.7, { s: 1.25, ry: 0.4 }); put('palmier', -3.0, 0.9, { s: 0.85, ry: 2.1 });
    put('rocher', 2.9, -1.9, { s: 0.9, ry: 1 }); put('rocher', -3.6, -1.4, { s: 0.6, ry: 2 }); put('rocher', 3.7, 1.6, { s: 0.5 });
    put('feu', 0.4, 0.6, { s: 0.85 });
    const flame = put('flamme', 0.4, 0.6, { y: ground(0.4, 0.6) + 0.04, s: 0.85 });
    put('caisse', 3.6, -0.6, { y: 0.0, ry: 0.5, rz: 0.25, s: 1.1 });
    const dyn = new T.Group(); scene.add(dyn);                         // ce qui change d'un tour à l'autre
    const raft = new T.Group(); raft.position.set(5.0, 0.02, 2.3); raft.rotation.y = -0.55; scene.add(raft);
    const sky = new T.Group(); scene.add(sky);                         // nuages et pluie
    const labels = el('div', 'nf3d-labels'); labels.setAttribute('aria-hidden', 'true');
    R = { canvas, renderer, scene, camera, skyCanvas, skyTex, hemi, sun, fire, sea, seaGeo, seaBase, seaMat, lagonMat, island, ground, put, palm, flame, dyn, raft, sky, labels, people: [], rain: null, wave: 0.08, storm: false, t0: performance.now() };
    addEventListener('resize', () => { if (R) { size(); paint(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
    size();
  }

  // ------------------------------------------------------------ l'état du jour sur l'île
  const hue = name => [...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
  function apply(v, force) {
    const key = JSON.stringify([v.phase, v.weather, v.day, v.food, v.water, v.wood, v.seats, v.alive, v.players.map(p => [p.id, p.name, p.alive, p.sick, p.winner, p.me])]);
    if (!force && key === sig) return;
    sig = key;
    const storm = v.weather === 'ouragan', w = storm ? 4 : (v.weather ?? 0), evening = v.phase === 'dusk' || v.phase === 'vote';
    const wet = storm || w >= 2;
    // le ciel et la lumière : grand soleil, nuages, averses, pluie battante, ouragan ; plus chaud le soir
    const SKY = storm ? ['#283646', '#5c6b78'] : evening ? (wet ? ['#4a5568', '#c9a27e'] : ['#3b4a7a', '#f6a96b']) : [['#68bff0', '#d8f1fb'], ['#8cb9d6', '#dbe8ee'], ['#7d8b96', '#c4ccd2'], ['#5f6c77', '#aab4bb']][w];
    const g = R.skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, SKY[0]); gr.addColorStop(0.55, SKY[1]); gr.addColorStop(1, SKY[1]); g.fillStyle = gr; g.fillRect(0, 0, 2, 256); R.skyTex.needsUpdate = true;
    R.scene.fog.color.set(storm ? '#3c4955' : evening ? '#d9a987' : wet ? '#a9b4bb' : '#cfeaf5');
    R.hemi.color.set(storm ? '#8796a6' : evening ? '#ffd2a6' : wet ? '#c7d0d6' : '#e8f6ff'); R.hemi.intensity = storm ? 0.7 : evening ? 0.75 : wet ? 0.9 : 1.05;
    R.sun.color.set(evening ? '#ffb070' : '#fff3dc'); R.sun.intensity = storm ? 0.55 : evening ? 1.1 : [2.3, 1.7, 1.0, 0.8][w];
    R.sun.position.set(evening ? -10 : -6, evening ? 4 : 11, 7);
    R.fire.userData.base = evening || storm ? 13 : wet ? 9 : 6;
    R.renderer.toneMappingExposure = storm ? 0.85 : evening ? 0.95 : 1.05;
    R.seaMat.color.set(storm ? '#24566a' : evening ? '#2f7f98' : wet ? '#3b8ea3' : '#2aa7c9');
    R.lagonMat.opacity = storm ? 0.25 : 0.55;
    R.wave = storm ? 0.26 : [0.07, 0.1, 0.14, 0.18][w]; R.storm = storm;
    // les nuages et la pluie
    R.sky.clear(); R.rain = null;
    const cloudMat = new T.MeshStandardMaterial({ color: storm ? '#4d5965' : wet ? '#d6dbdf' : '#ffffff', roughness: 1, flatShading: true });
    for (let c = 0; c < (storm ? 8 : [1, 4, 6, 7][w]); c++) {
      const grp = new T.Group();
      for (let k = 0; k < 5; k++) { const s = new T.Mesh(new T.IcosahedronGeometry(0.9 + ((c * 7 + k * 3) % 6) / 10, 0), cloudMat); s.position.set(k * 0.9 - 1.8, (k % 2) * 0.35, (k % 3) * 0.25); grp.add(s); }
      grp.position.set(-12 + c * 5.5, 7.5 + (c % 3) * 0.6, -14 - (c % 4) * 2); R.sky.add(grp);
    }
    if (wet) {
      const n = storm ? 2200 : w >= 3 ? 1700 : 1100, geo = new T.BufferGeometry(), p = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - .5) * 26, y = Math.random() * 12, z = (Math.random() - .5) * 20; p.set([x, y, z, x - (storm ? 0.25 : 0.04), y - 0.45, z], i * 6); }
      geo.setAttribute('position', new T.BufferAttribute(p, 3));
      R.rain = new T.LineSegments(geo, new T.LineBasicMaterial({ color: '#dfeaf0', transparent: true, opacity: storm ? 0.55 : 0.4 })); R.sky.add(R.rain);
    }
    // les réserves sur la plage : un poisson et une jarre par ration (12 au plus, le reste se devine)
    R.dyn.clear();
    const fish = Math.min(v.food, 12), jars = Math.min(v.water, 12);
    for (let i = 0; i < fish; i++) R.put('poisson', 0.9 + (i % 4) * 0.3, -0.9 + (Math.floor(i / 4) % 2) * 0.06, { y: R.ground(1.2, -0.9) + 0.05 + Math.floor(i / 4) * 0.09, rx: Math.PI / 2, rz: (i % 2) * 0.4 - 0.2, into: R.dyn });
    for (let i = 0; i < jars; i++) R.put('jarre', 2.0 + (i % 4) * 0.28, -0.25 + Math.floor(i / 4) * 0.3, { s: 0.62, ry: i, into: R.dyn });
    // le radeau : une rangée de bûches par bout de bois (les places « corde », plus claires, ne coûtent pas de bois)
    R.raft.clear();
    const per = v.woodPerSeat || 4, logs = Math.min(v.wood, 40), rope = Math.max(0, v.seats - Math.floor(v.wood / per));
    const logAt = (i, light) => {
      const b = M.buche.clone(true); b.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (light) { m.material = m.material.clone(); m.material.color.offsetHSL(0, -0.1, 0.18); } } });
      b.scale.set(1.8, 1, 1); b.position.set(0, 0.05, -1.6 + i * 0.23); R.raft.add(b);
    };
    for (let i = 0; i < logs; i++) logAt(i, false);
    for (let i = 0; i < rope * per; i++) logAt(logs + i, true);
    if (v.seats >= v.alive && v.alive > 0) { const s = M.voile.clone(true); s.position.set(0, 0.1, -0.4); s.rotation.y = 0.6; R.raft.add(s); }
    // les naufragés : autour du feu ; malade, allongé ; à la fin, ceux qui partent sont sur le radeau
    R.people.forEach(p => p.l.remove()); R.people = [];
    const shown = v.players.filter(p => p.alive || p.winner);
    const onRaft = v.phase === 'over' ? shown.filter(p => p.winner) : [];
    const onBeach = shown.filter(p => !onRaft.includes(p));
    const place = (p, x, z, into, ry) => {
      const [e, nm] = typeof tbSplit === 'function' ? tbSplit(p) : ['', p.name];
      const o = R.put('naufrage', x, z, { ry, s: 0.8, into, y: into === R.raft ? 0.12 : null });
      o.traverse(m => { if (m.isMesh && m.material.name === 'Corps') { m.material = m.material.clone(); m.material.color.setHSL(hue(p.name) / 360, 0.62, 0.52); } });
      if (p.sick && v.phase !== 'over') { o.rotation.z = Math.PI / 2; o.position.y += 0.13; }
      const l = el('div', 'nf3d-label' + (p.me ? ' me' : '') + (p.sick ? ' sick' : ''), `<span class="e">${esc(e)}</span><span class="n">${esc(nm)}${p.sick && v.phase !== 'over' ? ' · malade' : ''}</span>`);
      R.labels.appendChild(l); R.people.push({ o, l, sick: p.sick && v.phase !== 'over', into });
    };
    onBeach.forEach((p, k) => { const a = Math.PI * 0.05 + k * (Math.PI * 2 / Math.max(onBeach.length, 1)) * 0.92, x = 0.4 + Math.cos(a) * 1.9, z = 0.55 + Math.sin(a) * 1.3; place(p, x, z, R.dyn, Math.atan2(0.4 - x, 0.55 - z)); });
    onRaft.forEach((p, k) => place(p, 0.3 * ((k % 2) ? 1 : -1), -1.2 + k * 0.5, R.raft, Math.PI / 2));
    R.raft.position.set(onRaft.length ? 7.2 : 5.0, 0.02, onRaft.length ? 3.4 : 2.3);
    paint(); loop();
  }

  // ------------------------------------------------------------ dessin : la vue suit l'emplacement réservé dans la page
  function size() { R.renderer.setSize(innerWidth, innerHeight, false); R.camera.aspect = innerWidth / innerHeight; frame(); }
  function frame() {
    const st = document.querySelector('#nf-main .nf-stage');
    const r = st?.getBoundingClientRect();
    const desk = innerWidth >= 1100;
    const cx = r ? r.left + r.width / 2 : innerWidth / 2, cy = r ? r.top + r.height / 2 : innerHeight * 0.3;
    if (desk) { R.camera.fov = 30; R.camera.position.set(1.4, 13.5, 24); R.camera.lookAt(1.2, 0.0, 0.8); }
    else { R.camera.fov = 32; R.camera.position.set(1.0, 30, 41.5); R.camera.lookAt(1.0, 0.0, 1.0); }
    // décale l'image pour que le centre de l'île tombe au centre de l'emplacement (il suit le défilement)
    R.camera.setViewOffset(innerWidth, innerHeight, innerWidth / 2 - cx, innerHeight / 2 - cy, innerWidth, innerHeight);
    R.camera.updateProjectionMatrix();
  }
  const tmp = { v: null };
  function paint(now = performance.now()) {
    if (!R) return;
    const t = (now - R.t0) / 1000, quiet = QUIET.matches;
    frame();
    if (!quiet) {
      const p = R.seaGeo.attributes.position.array, b = R.seaBase, W = R.wave;
      for (let i = 0; i < p.length; i += 3) p[i + 1] = -0.12 + W * (Math.sin(b[i] * 0.55 + t * 1.3) + Math.sin(b[i + 2] * 0.7 + t * 0.9) * 0.7 + Math.sin((b[i] + b[i + 2]) * 1.3 + t * 2.1) * 0.25);
      R.seaGeo.attributes.position.needsUpdate = true; R.seaGeo.computeVertexNormals();
      R.raft.position.y = 0.02 + Math.sin(t * 1.4) * W * 0.6; R.raft.rotation.z = Math.sin(t * 1.1) * W * 0.25;
      R.flame.scale.set(0.85 * (1 + Math.sin(t * 13) * 0.06), 0.85 * (1 + Math.sin(t * 9.3) * 0.14), 0.85 * (1 + Math.cos(t * 11) * 0.06));
      R.fire.intensity = (R.fire.userData.base || 6) * (0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.07);
      R.palm.rotation.z = Math.sin(t * (R.storm ? 2.2 : 0.9)) * (R.storm ? 0.09 : 0.02);
      if (R.rain) { const q = R.rain.geometry.attributes.position.array; for (let i = 0; i < q.length; i += 6) { q[i + 1] -= 0.35; q[i + 4] -= 0.35; if (q[i + 4] < -0.2) { q[i + 1] += 12; q[i + 4] += 12; } } R.rain.geometry.attributes.position.needsUpdate = true; }
      if (R.storm) R.hemi.intensity = ((t % 6.5) > 6.3) ? 2.4 : 0.7;               // un éclair de temps en temps
    } else R.fire.intensity = R.fire.userData.base || 6;
    R.renderer.render(R.scene, R.camera);
    // les étiquettes (emoji + prénom) suivent les têtes
    if (!tmp.v) tmp.v = new T.Vector3();
    R.people.forEach(({ o, l, sick }) => {
      o.getWorldPosition(tmp.v); tmp.v.y += sick ? 0.55 : 1.05; tmp.v.project(R.camera);
      l.style.transform = `translate(${((tmp.v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - tmp.v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    });
  }
  // l'animation : 30 images par seconde au plus, et rien du tout quand l'écran n'est pas visible
  function loop() {
    cancelAnimationFrame(raf);
    const step = now => {
      const screen = document.getElementById('s-naufrages');
      if (!R || document.hidden || !screen || screen.hidden || !R.canvas.isConnected) { raf = 0; return; }
      if (now - lastFrame >= 33) { lastFrame = now; paint(now); }
      raf = QUIET.matches ? 0 : requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return {
    /** À appeler à chaque rendu de l'écran : accroche le canevas et les étiquettes, et met l'île à jour. */
    update(v, host) {
      last = v; if (host) hostEl = host;
      if (state === 'idle') { if (!webgl()) { state = 'off'; return; } boot(); }
      if (state !== 'ready') return;
      if (hostEl && R.canvas.parentNode !== hostEl) hostEl.prepend(R.canvas, R.labels);   // le même canevas, déplacé : WebGL garde tout
      apply(v);
      loop();
    },
    off: () => state === 'off',
    ready: () => state === 'ready',
  };
})();
