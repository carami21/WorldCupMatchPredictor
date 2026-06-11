/* ═══════════════════════════════════════════════════════════════════
   FIFA World Cup 2026 — Match Predictor – Frontend
   ═══════════════════════════════════════════════════════════════════ */

const API = window.location.origin;
let ALL_TEAMS = [];

// ─── Three.js World Cup Golden Globe ──────────────────────────────
(function initBall() {
  const container = document.getElementById('ball-container');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Dramatic trophy-style lighting
  scene.add(new THREE.AmbientLight(0xfff5cc, 0.3));

  const key = new THREE.DirectionalLight(0xfffbe8, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffe880, 0.5);
  fill.position.set(-4, 1, 2);
  scene.add(fill);

  // Strong overhead spot — the trophy's signature crown highlight
  const spot = new THREE.PointLight(0xffffff, 3.5, 12);
  spot.position.set(0, 4, 2);
  scene.add(spot);

  const rim = new THREE.PointLight(0xffd700, 1.0, 10);
  rim.position.set(-2, -3, 3);
  scene.add(rim);

  // ── Gold globe texture (equirectangular 2048×1024) ─────────────
  // lon: −180→180 maps to u: 0→1   lat: 90→−90 maps to v: 0→1
  const W = 2048, H = 1024;
  const tc = document.createElement('canvas');
  tc.width = W; tc.height = H;
  const ctx = tc.getContext('2d');

  // Rich gold base gradient (dark at poles, bright at equator)
  const baseGrad = ctx.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0,    '#7a5200');
  baseGrad.addColorStop(0.25, '#c8860a');
  baseGrad.addColorStop(0.5,  '#f0c040');
  baseGrad.addColorStop(0.75, '#c8860a');
  baseGrad.addColorStop(1,    '#7a5200');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle gold noise for texture variation
  for (let i = 0; i < 60000; i++) {
    const v = Math.random() > 0.5 ? 0.08 : -0.06;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 200 : 0},0,${Math.abs(v) * 0.4})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // Helper: convert (lon °, lat °) → canvas (x, y)
  function ll(lon, lat) {
    return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  }

  // Draw continent as filled + stroked path
  function drawContinent(pts, label) {
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const [x, y] = ll(lon, lat);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    // Dark embossed gold fill
    ctx.fillStyle = 'rgba(90, 50, 0, 0.55)';
    ctx.fill();
    // Bright ridge line — the emboss highlight
    ctx.strokeStyle = 'rgba(255, 230, 100, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // ── Simplified continent outlines (lon, lat) ──────────────────
  const continents = [
    // North America
    [[-168,72],[-140,74],[-110,76],[-85,73],[-65,68],[-55,60],
     [-53,47],[-66,44],[-70,42],[-75,35],[-80,25],[-88,16],
     [-83,9],[-77,8],[-62,11],[-60,6],[-52,4],[-52,10],
     [-58,15],[-74,18],[-84,22],[-90,18],[-97,22],[-105,20],
     [-110,27],[-117,32],[-120,34],[-123,49],[-130,55],
     [-140,60],[-152,60],[-163,60],[-168,66]],
    // South America
    [[-82,8],[-77,8],[-62,11],[-60,6],[-50,4],[-48,0],
     [-50,-5],[-36,-5],[-35,-8],[-38,-12],[-40,-20],
     [-43,-23],[-48,-28],[-52,-33],[-58,-38],[-62,-42],
     [-65,-46],[-67,-52],[-68,-56],[-65,-56],[-63,-52],
     [-60,-50],[-55,-46],[-50,-30],[-48,-28],[-45,-24],
     [-42,-22],[-48,-15],[-50,-5],[-58,2],[-62,6],[-72,10],[-77,8]],
    // Europe
    [[-10,36],[-5,36],[0,40],[3,43],[8,44],[14,44],[20,42],
     [26,41],[28,42],[30,46],[29,50],[24,55],[20,56],
     [18,58],[16,58],[14,56],[10,55],[8,57],[5,58],
     [2,51],[-2,49],[-5,48],[-8,44],[-8,40],[-10,36]],
    // Scandinavia
    [[5,58],[8,57],[10,55],[12,56],[14,56],[16,58],[18,60],
     [20,62],[22,65],[26,70],[28,72],[24,72],[18,70],
     [14,68],[12,65],[8,62],[5,60],[5,58]],
    // Africa
    [[-18,16],[-16,20],[-18,24],[-14,28],[-8,32],[-2,35],
     [4,37],[8,36],[12,34],[16,32],[20,30],[24,28],
     [28,24],[34,22],[38,18],[42,14],[44,10],[42,4],
     [40,0],[38,-4],[36,-8],[34,-12],[32,-16],[28,-22],
     [24,-26],[20,-28],[18,-34],[20,-36],[26,-34],[30,-32],
     [32,-28],[34,-24],[36,-20],[38,-16],[40,-12],[40,-4],
     [36,2],[30,4],[24,4],[20,6],[16,4],[12,4],[8,4],
     [4,4],[0,6],[-4,5],[-8,6],[-12,8],[-16,12],[-18,16]],
    // Asia (simplified)
    [[26,42],[30,46],[34,48],[38,50],[44,52],[50,54],
     [56,56],[60,58],[66,60],[72,62],[78,60],[82,56],
     [88,52],[94,50],[100,50],[106,52],[110,54],[116,50],
     [122,48],[128,44],[132,40],[136,36],[138,34],[136,30],
     [130,26],[124,22],[120,20],[116,22],[112,20],[106,16],
     [100,12],[98,8],[100,4],[104,2],[108,2],[112,4],
     [108,8],[110,14],[116,18],[118,24],[116,28],[112,32],
     [106,32],[102,28],[96,26],[90,24],[84,20],[80,14],
     [76,10],[72,8],[68,8],[64,12],[60,14],[56,14],
     [52,10],[50,14],[46,16],[42,14],[38,14],[34,12],
     [30,12],[26,16],[22,18],[24,22],[26,26],[28,32],
     [26,38],[26,42]],
    // Indian subcontinent
    [[66,24],[72,24],[76,22],[78,18],[80,14],[80,10],
     [78,8],[76,8],[72,8],[68,8],[66,12],[64,16],[66,20],[66,24]],
    // Australia
    [[114,-22],[118,-20],[122,-18],[128,-14],[132,-12],
     [136,-12],[138,-16],[136,-20],[132,-22],[136,-24],
     [138,-28],[136,-32],[132,-34],[128,-36],[122,-34],
     [116,-34],[114,-30],[112,-26],[114,-22]],
    // Greenland
    [[-52,82],[-28,84],[-18,78],[-16,72],[-24,68],
     [-32,66],[-44,66],[-52,68],[-56,72],[-56,78],[-52,82]],
    // Japan
    [[130,34],[132,34],[134,34],[136,36],[138,38],[140,40],
     [142,42],[140,44],[138,44],[136,40],[134,38],[132,36],[130,34]],
  ];

  continents.forEach(pts => drawContinent(pts));

  // Latitude/longitude grid lines for the globe look
  ctx.strokeStyle = 'rgba(180, 120, 0, 0.18)';
  ctx.lineWidth = 1;
  for (let lat = -80; lat <= 80; lat += 20) {
    ctx.beginPath();
    ctx.moveTo(0, (90 - lat) / 180 * H);
    ctx.lineTo(W, (90 - lat) / 180 * H);
    ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath();
    ctx.moveTo((lon + 180) / 360 * W, 0);
    ctx.lineTo((lon + 180) / 360 * W, H);
    ctx.stroke();
  }

  const globeTex = new THREE.CanvasTexture(tc);
  globeTex.wrapS = THREE.RepeatWrapping;

  // Bump map — continents raised above oceans
  const bc = document.createElement('canvas');
  bc.width = 1024; bc.height = 512;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#606060'; // ocean: mid-gray
  bx.fillRect(0, 0, 1024, 512);

  function drawBump(pts) {
    bx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * 1024;
      const y = (90 - lat) / 180 * 512;
      i === 0 ? bx.moveTo(x, y) : bx.lineTo(x, y);
    });
    bx.closePath();
    bx.fillStyle = '#c0c0c0'; // land raised (lighter = higher)
    bx.fill();
  }
  continents.forEach(pts => drawBump(pts));
  const bumpTex = new THREE.CanvasTexture(bc);

  // ── Gold material ──────────────────────────────────────────────
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 128),
    new THREE.MeshPhysicalMaterial({
      map:               globeTex,
      bumpMap:           bumpTex,
      bumpScale:         0.06,
      color:             new THREE.Color(1.0, 0.82, 0.18),
      metalness:         0.88,
      roughness:         0.12,
      clearcoat:         1.0,
      clearcoatRoughness:0.08,
      reflectivity:      1.0,
      envMapIntensity:   0.6,
    })
  );
  scene.add(globe);

  // ── Scroll animation ───────────────────────────────────────────
  let scrollY = 0, targetScrollY = 0;

  window.addEventListener('scroll', () => { targetScrollY = window.scrollY; }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    scrollY += (targetScrollY - scrollY) * 0.08;
    const pct = Math.min(Math.max(scrollY / (window.innerHeight * 0.8), 0), 1);

    globe.position.x = -1.2 + pct * 7;
    globe.position.y =  0.3 - pct * 3.2;
    globe.scale.setScalar(1 - pct * 0.3);

    globe.rotation.y += 0.004;
    globe.rotation.x  =  scrollY * 0.003;

    camera.position.z = 4.5 + pct * 2.5;
    container.style.opacity = Math.max(0, 1 - pct * 1.2).toString();

    renderer.render(scene, camera);
  }
  animate();
})();

// ─── Load Teams ────────────────────────────────────────────────────
async function loadTeams() {
  try {
    const res = await fetch(`${API}/api/teams`);
    const data = await res.json();
    ALL_TEAMS = data.teams || [];
  } catch {
    console.error('Failed to load teams');
  }
}

// ─── Dropdown Logic ────────────────────────────────────────────────
function setupDropdown(input, dropdown, onSelect) {
  let selectedIdx = -1;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { dropdown.classList.remove('open'); return; }
    const matches = ALL_TEAMS.filter(t => t.toLowerCase().includes(q)).slice(0, 12);
    if (!matches.length) { dropdown.classList.remove('open'); return; }

    selectedIdx = -1;
    dropdown.innerHTML = matches.map(t =>
      `<div class="team-option">${t}</div>`
    ).join('');
    dropdown.classList.add('open');

    dropdown.querySelectorAll('.team-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = opt.textContent;
        dropdown.classList.remove('open');
        if (onSelect) onSelect(opt.textContent);
      });
    });
  });

  input.addEventListener('keydown', e => {
    const opts = dropdown.querySelectorAll('.team-option');
    if (!opts.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, opts.length - 1);
      opts.forEach((o, i) => o.classList.toggle('active', i === selectedIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      opts.forEach((o, i) => o.classList.toggle('active', i === selectedIdx));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      input.value = opts[selectedIdx].textContent;
      dropdown.classList.remove('open');
      if (onSelect) onSelect(opts[selectedIdx].textContent);
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });
}

// ─── Single Match Prediction ───────────────────────────────────────
function initPredictor() {
  const homeInput = document.getElementById('home-team');
  const awayInput = document.getElementById('away-team');
  const homeDD = document.getElementById('home-dropdown');
  const awayDD = document.getElementById('away-dropdown');
  const btn = document.getElementById('predict-btn');
  const errEl = document.getElementById('predict-error');

  setupDropdown(homeInput, homeDD);
  setupDropdown(awayInput, awayDD);

  btn.addEventListener('click', async () => {
    errEl.textContent = '';
    const home = homeInput.value.trim();
    const away = awayInput.value.trim();
    const neutral = document.getElementById('neutral-venue').checked;

    if (!home || !away) {
      errEl.textContent = 'Please select both teams.';
      return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
      const res = await fetch(`${API}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, away, neutral }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Prediction failed.';
        return;
      }

      showResults(data);
    } catch {
      errEl.textContent = 'Network error. Make sure the API is running.';
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('results').classList.add('hidden');
    homeInput.value = '';
    awayInput.value = '';
    window.scrollTo({ top: document.getElementById('predictor').offsetTop - 40, behavior: 'smooth' });
  });
}

function showResults(d) {
  document.getElementById('res-home').textContent = d.home;
  document.getElementById('res-away').textContent = d.away;
  document.getElementById('res-label').textContent = `Prediction: ${d.prediction_label}`;

  document.getElementById('prob-home-label').textContent = `${d.home} Win`;
  document.getElementById('prob-away-label').textContent = `${d.away} Win`;

  const p = d.probabilities;
  setTimeout(() => {
    document.getElementById('prob-home-bar').style.width = `${p.home_win * 100}%`;
    document.getElementById('prob-draw-bar').style.width = `${p.draw * 100}%`;
    document.getElementById('prob-away-bar').style.width = `${p.away_win * 100}%`;
  }, 50);

  document.getElementById('prob-home-pct').textContent = `${(p.home_win * 100).toFixed(1)}%`;
  document.getElementById('prob-draw-pct').textContent = `${(p.draw * 100).toFixed(1)}%`;
  document.getElementById('prob-away-pct').textContent = `${(p.away_win * 100).toFixed(1)}%`;

  document.getElementById('stat-home-elo').textContent = d.home_elo;
  document.getElementById('stat-away-elo').textContent = d.away_elo;
  document.getElementById('stat-home-form').textContent = `${(d.home_form * 100).toFixed(0)}%`;
  document.getElementById('stat-away-form').textContent = `${(d.away_form * 100).toFixed(0)}%`;
  document.getElementById('stat-home-goals').textContent = d.home_goals_avg.toFixed(2);
  document.getElementById('stat-away-goals').textContent = d.away_goals_avg.toFixed(2);
  document.getElementById('stat-home-conc').textContent = d.home_goals_conceded_avg.toFixed(2);
  document.getElementById('stat-away-conc').textContent = d.away_goals_conceded_avg.toFixed(2);

  const resultsEl = document.getElementById('results');
  resultsEl.classList.remove('hidden');
  setTimeout(() => {
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ─── Group Stage Simulator ─────────────────────────────────────────
function initGroupSim() {
  const inputs = document.querySelectorAll('.group-team');
  const dropdowns = document.querySelectorAll('.group-dropdown');
  const btn = document.getElementById('group-btn');
  const errEl = document.getElementById('group-error');

  inputs.forEach((input, i) => {
    setupDropdown(input, dropdowns[i]);
  });

  btn.addEventListener('click', async () => {
    errEl.textContent = '';
    const teams = Array.from(inputs).map(i => i.value.trim());

    if (teams.some(t => !t)) {
      errEl.textContent = 'Please select all 4 teams.';
      return;
    }

    if (new Set(teams).size !== 4) {
      errEl.textContent = 'All 4 teams must be different.';
      return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
      const res = await fetch(`${API}/api/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Simulation failed.';
        return;
      }

      showGroupResults(data);
    } catch {
      errEl.textContent = 'Network error. Make sure the API is running.';
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });
}

function showGroupResults(d) {
  // Standings table
  const tbody = document.getElementById('standings-body');
  tbody.innerHTML = d.expected_table.map(row => `
    <tr class="${row.advances ? 'qualifies' : 'eliminated'}">
      <td>${row.rank}</td>
      <td>${row.team}</td>
      <td>${row.xpts.toFixed(2)}</td>
      <td>${row.elo}</td>
      <td>${(row.form * 100).toFixed(0)}%</td>
      <td>${row.advances ? 'Advances' : 'Eliminated'}</td>
    </tr>
  `).join('');

  // Monte Carlo bars
  const mcContainer = document.getElementById('monte-carlo-bars');
  mcContainer.innerHTML = d.monte_carlo.map(mc => `
    <div class="mc-team">
      <div class="mc-team-name">${mc.team} — ${(mc.qualify_pct * 100).toFixed(1)}% qualify</div>
      <div class="mc-bar-track">
        <div class="mc-fill-1st" style="width: ${mc.first_pct * 100}%"></div>
        <div class="mc-fill-2nd" style="width: ${mc.second_pct * 100}%"></div>
      </div>
      <div class="mc-labels">
        <span>1st: ${(mc.first_pct * 100).toFixed(1)}%</span>
        <span>2nd: ${(mc.second_pct * 100).toFixed(1)}%</span>
      </div>
    </div>
  `).join('');

  // Match predictions
  const matchesContainer = document.getElementById('group-matches');
  matchesContainer.innerHTML = d.matches.map(m => `
    <div class="group-match-card">
      <span class="gm-teams">${m.home} vs ${m.away}</span>
      <span class="gm-prediction">${m.prediction_label} (${(Math.max(m.home_win_p, m.draw_p, m.away_win_p) * 100).toFixed(0)}%)</span>
    </div>
  `).join('');

  const el = document.getElementById('group-results');
  el.classList.remove('hidden');
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTeams();
  initPredictor();
  initGroupSim();
});
