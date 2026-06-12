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

  const _underglow = document.getElementById('ball-underglow');
  const _glowPt    = new THREE.Vector3();

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

    // Track underglow to the bottom of the globe — fades out as globe swipes away
    if (_underglow) {
      _glowPt.set(globe.position.x, globe.position.y - globe.scale.x * 1.06, globe.position.z);
      _glowPt.project(camera);
      _underglow.style.left      = ((_glowPt.x + 1) * 50) + '%';
      _underglow.style.top       = ((-_glowPt.y + 1) * 50) + '%';
      _underglow.style.opacity   = Math.max(0, 1 - pct * 2.5);
      _underglow.style.transform = 'translateX(-50%) scale(' + globe.scale.x + ')';
    }
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
/* ═══════════════════════════════════════════════════════════════════
   DANGER ZONE / xG ANALYSIS  —  append to bottom of app.js
   Self-contained: tries the live /api/xg/* endpoints first, falls back
   to a deterministic mock (incl. a vectorised model surface) so the
   section works standalone before Flask is wired up.
   Uses its own XG_TEAMS array — never touches ALL_TEAMS.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const XG_API = (typeof API !== 'undefined') ? API : window.location.origin;
  let XG_TEAMS = [];

  const WC2022 = [
    'Argentina','Australia','Belgium','Brazil','Cameroon','Canada','Costa Rica',
    'Croatia','Denmark','Ecuador','England','France','Germany','Ghana','Iran',
    'Japan','Mexico','Morocco','Netherlands','Poland','Portugal','Qatar',
    'Saudi Arabia','Senegal','Serbia','South Korea','Spain','Switzerland',
    'Tunisia','United States','Uruguay','Wales'
  ];

  /* ───────── deterministic RNG ───────── */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ───────── squads ───────── */
  const SQUADS = {
    'Argentina':    ['Lionel Andrés Messi Cuccittini','Julián Álvarez','Lautaro Javier Martínez','Ángel Fabián Di María Hernández','Enzo Fernandez','Alexis Mac Allister','Rodrigo Javier De Paul'],
    'Australia':    ['Mitchell Thomas Duke','Fran Karačić','Jackson Irvine','Riley McGree','Aziz Eraltay Behich','Craig Goodwin','Aaron Mooy'],
    'Belgium':      ['Kevin De Bruyne','Michy Batshuayi Tunga','Romelu Lukaku Menama','Yannick Ferreira Carrasco','Dries Mertens','Thomas Meunier','Amadou Onana'],
    'Brazil':       ['Neymar da Silva Santos Junior','Carlos Henrique Casimiro','Vinícius José Paixão de Oliveira Júnior','Raphael Dias Belloli','Richarlison de Andrade','Antony Matheus dos Santos','Rodrygo Silva de Goes'],
    'Cameroon':     ['Vincent Paté Aboubakar','Pierre Kunde Malong','Jean-Eric Maxim Choupo-Moting','Bryan Mbeumo','Karl Brillant Toko Ekambi','André-Frank Zambo Anguissa','Christopher Wooh'],
    'Canada':       ['Jonathan David','Tajon Buchanan','David Junior Hoilett','Alphonso Davies','Cyle Larin','Stephen Antunes Eustáquio','Alistair Johnston'],
    'Costa Rica':   ['Keysher Fuller Spence','Yeltsin Ignacio Tejeda Valverde','Francisco Javier Calvo Quesada','Gerson Torres Barrantes','Jewison Bennette','Joel Nathaniel Campbell Samuels','Juan Pablo Vargas Campos'],
    'Croatia':      ['Ivan Perišić','Andrej Kramarić','Mislav Oršić','Marko Livaja','Luka Modrić','Nikola Vlašić','Lovro Majer'],
    'Denmark':      ['Andreas Evald Cornelius','Andreas Skov Olsen','Christian Dannemann Eriksen','Joachim Andersen','Kasper Dolberg','Jesper Lindstrøm','Alexander Hartmann Bah'],
    'Ecuador':      ['Enner Remberto Valencia Lastra','Angelo Smit Preciado Quiñónez','Michael Steveen Estrada Martínez','Moisés Isaac Caicedo Corozo','Gonzalo Jordy Plata Jiménez','Pervis Josué Estupiñán Tenorio','Romario Andrés Ibarra Mina'],
    'England':      ['Harry Kane','Marcus Rashford','Bukayo Saka','Jude Bellingham','Phil Foden','Harry Maguire','Mason Mount'],
    'France':       ['Kylian Mbappé Lottin','Olivier Giroud','Adrien Rabiot','Ousmane Dembélé','Aurélien Djani Tchouaméni','Antoine Griezmann','Theo Bernard François Hernández'],
    'Germany':      ['Serge Gnabry','Jamal Musiala','Niclas Füllkrug','Joshua Kimmich','Antonio Rüdiger','Kai Havertz','İlkay Gündoğan'],
    'Ghana':        ['Mohammed Kudus','Osman Bukari','Iñaki Williams Arthuer','Mohamed Salisu','Thomas Teye Partey','Alidu Seidu','André Ayew Pelé'],
    'Iran':         ['Ahmad Nourollahi','Mehdi Taremi','Sardar Azmoun','Alireza Jahanbakhsh','Saeid Ezatolahi Afagh','Mehdi Torabi','Morteza Pouraliganji'],
    'Japan':        ['Takuma Asano','Daichi Kamada','Wataru Endo','Ritsu Doan','Hidemasa Morita','Ko Itakura','Daizen Maeda'],
    'Mexico':       ['Luis Gerardo Chávez Magallón','Ernesto Alexis Vega Rojas','Hirving Rodrigo Lozano Bahena','Henry Josué Martín Mex','Orbelín Pineda Alvarado','Carlos Uriel Antuna Romero','César Jasib Montes Castro'],
    'Morocco':      ['Youssef En-Nesyri','Hakim Ziyech','Sofiane Boufal','Azzedine Ounahi','Achraf Hakimi Mouh','Noussair Mazraoui','Abdelhamid Sabiri'],
    'Netherlands':  ['Memphis Depay','Cody Mathès Gakpo','Daley Blind','Steven Berghuis','Virgil van Dijk','Denzel Dumfries','Frenkie de Jong'],
    'Poland':       ['Robert Lewandowski','Jakub Kamiński','Kamil Glik','Piotr Zieliński','Krystian Bielik','Arkadiusz Milik','Grzegorz Krychowiak'],
    'Portugal':     ['João Félix Sequeira','Cristiano Ronaldo dos Santos Aveiro','Bruno Miguel Borges Fernandes','Gonçalo Matias Ramos','Rafael Alexandre Conceição Leão','Kléper Laveran Lima Ferreira','Otávio Edmilson da Silva Monteiro'],
    'Qatar':        ['Abdelkarim Hassan Al Haj Fadlalla','Almoez Ali Zainalabiddin Abdulla','Mohammed Muntari','Akram Hassan Afif','Ismaeel Mohammad Mohammad','Pedro Miguel Correia','Abdulaziz Hatem Mohammed Abdullah'],
    'Saudi Arabia': ['Mohammed Kanoo','Salem Mohammed Al Dawsari','Saleh Khalid Al Shehri','Abdulelah Saad Hameed Al-Malki','Firas Tariq Nasser Al Albirakan','Mohammed Al Burayk','Nawaf Shaker Al Abid'],
    'Senegal':      ['Ismaïla Sarr','Boulaye Dia','Cheikh Ahmadou Bamba Mbacke Dieng','Idrissa Gana Gueye','Pape Gueye','Pape Matar Sarr','Famara Diedhiou'],
    'Serbia':       ['Aleksandar Mitrović','Dušan Vlahović','Nikola Milenković','Sergej Milinković-Savić','Luka Jović','Nemanja Radonjić','Strahinja Pavlović'],
    'South Korea':  ['Heung-Min Son','Gue-Sung Cho','Hee-Chan Hwang','In-Beom Hwang','Kang-In Lee','Jin-Su Kim','Min Jae Kim'],
    'Spain':        ['Daniel Olmo Carvajal','Marco Asensio Willemsen','Álvaro Borja Morata Martín','Carlos Soler Barragán','Ferrán Torres García','Jordi Alba Ramos','Pablo Sarabia García'],
    'Switzerland':  ['Breel-Donald Embolo','Granit Xhaka','Manuel Obafemi Akanji','Xherdan Shaqiri','Remo Freuler','Ruben Vargas','Djibril Sow'],
    'Tunisia':      ['Youssef Msakni','Wahbi Khazri','Mohamed Dräger','Issam Jebali','Aïssa Bilal Laïdouni','Ellyes Joris Skhiri','Anis Ben Slimane'],
    'United States':['Christian Pulisic','Haji Wright','Sergino Dest','Timothy Weah','Weston McKennie','Joshua Sargent','Yunus Dimoara Musah'],
    'Uruguay':      ['Federico Santiago Valverde Dipetta','Darwin Gabriel Núñez Ribeiro','Edinson Roberto Cavani Gómez','Giorgian Daniel De Arrascaeta Benedetti','José María Giménez de Vargas','Rodrigo Bentancur Colmán','Luis Alberto Suárez Díaz'],
    'Wales':        ['Kieffer Roberto Francisco Moore','Ben Davies','Brennan Johnson','Neco Williams','Harry Wilson','Joe Allen','Aaron Ramsey']
  };
  const GENERIC = ['Diallo','Petrović','Hansen','Costa','Nakamura','Okafor','Ramírez','Novák','Andersen','Haddad','Kovač','Mendoza','Suárez','Tahir','Lindqvist','Bauer','Moreno','Iqbal','Sørensen','Vargas'];
  function squadFor(team, rng) {
    if (SQUADS[team]) return SQUADS[team].slice();
    const pool = GENERIC.slice(), out = [];
    for (let i = 0; i < 7; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }

  /* ───────── the model (drives both the surface and per-shot xG) ───────── */
  function goalAngle(x, y) {
    const v1x = 120 - x, v1y = 36 - y, v2x = 120 - x, v2y = 44 - y;
    const cross = Math.abs(v1x * v2y - v1y * v2x);
    const dot = v1x * v2x + v1y * v2y;
    return Math.atan2(cross, dot); // radians; bigger = wider view of goal
  }
  function modelXG(x, y, p) {
    const ang = goalAngle(x, y), d = Math.hypot(120 - x, 40 - y);
    let z;
    if (p.shot_type === 'Free Kick') z = -1.5 + 1.0 * ang - 0.045 * d;
    else z = -0.55 + 2.0 * ang - 0.10 * d;
    if (p.body_part === 'Head') z -= 1.2 + 0.04 * d;
    else if (p.body_part === 'Left Foot') z -= 0.08;
    if (p.under_pressure) z -= 0.55;
    return 1 / (1 + Math.exp(-z));
  }

  /* ───────── shot generation ───────── */
  const _shotCache = {};
  function genShots(team) {
    if (_shotCache[team]) return _shotCache[team];
    const rng = mulberry32(hashStr(team));
    const squad = squadFor(team, rng);
    const weights = squad.map((_, i) => Math.pow(0.72, i));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const pickPlayer = () => { let r = rng() * wSum; for (let i = 0; i < squad.length; i++) { r -= weights[i]; if (r <= 0) return squad[i]; } return squad[0]; };
    const TYPES = ['Open Play','Open Play','Open Play','Open Play','From Corner','Free Kick','Counter'];
    const BODY = ['Right Foot','Right Foot','Left Foot','Head','Head','Other'];
    const count = 42 + Math.floor(rng() * 64);
    const shots = [];
    for (let i = 0; i < count; i++) {
      const type = TYPES[Math.floor(rng() * TYPES.length)];
      let xg = +(0.02 + Math.pow(rng(), 3.3) * 0.58).toFixed(3);
      const depth = 4 + (1 - xg) * (6 + rng() * 42);
      const x = +Math.min(119, Math.max(61, 120 - depth)).toFixed(1);
      const spread = (0.22 + (1 - xg) * 0.78) * 34;
      const y = +Math.min(74, Math.max(6, 40 + (rng() - 0.5) * 2 * spread)).toFixed(1);
      const body = type === 'From Corner' && rng() < 0.5 ? 'Head' : BODY[Math.floor(rng() * BODY.length)];
      const dx = 120 - x, dy = 40 - y;
      shots.push({
        x, y, xg, is_goal: rng() < xg * 0.95 ? 1 : 0,
        player: pickPlayer(), minute: 1 + Math.floor(rng() * 94),
        shot_type: type, body_part: body,
        distance: +(Math.hypot(dx, dy) * 0.9144).toFixed(1),
        angle: +(goalAngle(x, y) * 180 / Math.PI).toFixed(1)
      });
    }
    _shotCache[team] = shots;
    return shots;
  }
  function genTeam(team) {
    const shots = genShots(team);
    const total_shots = shots.length;
    const total_xg = +shots.reduce((a, s) => a + s.xg, 0).toFixed(2);
    const actual_goals = shots.reduce((a, s) => a + s.is_goal, 0);
    const matches_played = Math.max(3, Math.min(7, Math.round(total_shots / 15)));
    const agg = {};
    shots.forEach(s => { const p = (agg[s.player] = agg[s.player] || { player: s.player, shots: 0, goals: 0, xg: 0 }); p.shots++; p.goals += s.is_goal; p.xg += s.xg; });
    const top_players = Object.values(agg)
      .map(p => ({ player: p.player, shots: p.shots, goals: p.goals, xg: +p.xg.toFixed(3), xg_per_shot: +(p.xg / p.shots).toFixed(3) }))
      .sort((a, b) => b.xg - a.xg);
    return { team, matches_played, total_shots, total_xg, actual_goals, xg_overperformance: +(actual_goals - total_xg).toFixed(2), shots_per_game: +(total_shots / matches_played).toFixed(1), xg_per_shot: +(total_xg / total_shots).toFixed(3), top_players };
  }
  function genDangerZones(p) {
    const x_vals = [], y_vals = [], grid = [];
    for (let x = 61; x <= 119; x++) x_vals.push(x);
    for (let y = 0; y <= 80; y += 2) y_vals.push(y);
    for (let r = 0; r < y_vals.length; r++) {
      const row = [];
      for (let c = 0; c < x_vals.length; c++) row.push(+modelXG(x_vals[c], y_vals[r], p).toFixed(4));
      grid.push(row);
    }
    return { grid, x_vals, y_vals, cols: x_vals.length, rows: y_vals.length, params: p };
  }

  /* ───────── mock router ───────── */
  function mockResponse(path) {
    if (path === '/api/xg/teams') return { teams: WC2022, count: WC2022.length };
    if (path.indexOf('/api/xg/danger-zones') === 0) {
      const q = new URLSearchParams(path.split('?')[1] || '');
      return genDangerZones({
        body_part: q.get('body_part') || 'Right Foot',
        shot_type: q.get('shot_type') || 'Open Play',
        under_pressure: q.get('under_pressure') === 'true',
        technique: q.get('technique') || 'Normal'
      });
    }
    let m;
    if ((m = path.match(/^\/api\/xg\/team\/(.+)$/))) return genTeam(decodeURIComponent(m[1]));
    if ((m = path.match(/^\/api\/xg\/shots\/(.+)$/))) { const t = decodeURIComponent(m[1]), s = genShots(t); return { team: t, shots: s, count: s.length }; }
    return {};
  }
  async function xgGet(path) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(XG_API + path, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('bad status');
      return await res.json();
    } catch (e) { return mockResponse(path); }
  }

  /* ───────── colour scale (shared by surface + shots) ───────── */
  const STOPS = [
    [0.00, [10, 30, 60]], [0.05, [20, 80, 120]], [0.15, [100, 60, 140]],
    [0.25, [180, 50, 80]], [0.40, [220, 80, 30]], [0.60, [245, 197, 24]]
  ];
  function colorRGB(v) {
    if (v <= STOPS[0][0]) return STOPS[0][1];
    if (v >= STOPS[STOPS.length - 1][0]) return STOPS[STOPS.length - 1][1];
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        const [v0, c0] = STOPS[i - 1], [v1, c1] = STOPS[i];
        const t = (v - v0) / (v1 - v0);
        return [Math.round(c0[0] + (c1[0] - c0[0]) * t), Math.round(c0[1] + (c1[1] - c0[1]) * t), Math.round(c0[2] + (c1[2] - c0[2]) * t)];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  /* ───────── soccer ball ───────── */
  function soccerBallSVG() {
    const pent = (ox, oy, r, rot) => { const p = []; for (let i = 0; i < 5; i++) { const a = (-90 + rot + i * 72) * Math.PI / 180; p.push(`${(ox + r * Math.cos(a)).toFixed(1)},${(oy + r * Math.sin(a)).toFixed(1)}`); } return p.join(' '); };
    let rim = '', seams = '';
    for (let k = 0; k < 5; k++) { const ang = -54 + k * 72, a = ang * Math.PI / 180; rim += `<polygon points="${pent(100 + 70 * Math.cos(a), 100 + 70 * Math.sin(a), 22, ang - 90)}" fill="#16161f"/>`; }
    for (let i = 0; i < 5; i++) { const a = (-90 + i * 72) * Math.PI / 180; seams += `<line x1="${(100 + 27 * Math.cos(a)).toFixed(1)}" y1="${(100 + 27 * Math.sin(a)).toFixed(1)}" x2="${(100 + 92 * Math.cos(a)).toFixed(1)}" y2="${(100 + 92 * Math.sin(a)).toFixed(1)}" stroke="#c9ccd4" stroke-width="1.6"/>`; }
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="xgBallShade" cx="38%" cy="32%" r="72%"><stop offset="0%" stop-color="#ffffff"/><stop offset="62%" stop-color="#eef0f3"/><stop offset="100%" stop-color="#c4c9d2"/></radialGradient><radialGradient id="xgBallHi" cx="34%" cy="26%" r="40%"><stop offset="0%" stop-color="rgba(255,255,255,.9)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient><clipPath id="xgBallClip"><circle cx="100" cy="100" r="95"/></clipPath></defs><circle cx="100" cy="100" r="95" fill="url(#xgBallShade)" stroke="#b6bcc6" stroke-width="1"/><g clip-path="url(#xgBallClip)">${rim}${seams}<polygon points="${pent(100, 100, 27, 0)}" fill="#16161f"/></g><circle cx="100" cy="100" r="42" fill="rgba(255,255,255,.94)"/><circle cx="100" cy="100" r="42" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="1"/><circle cx="100" cy="100" r="95" fill="url(#xgBallHi)"/></svg>`;
  }
  function renderBall(value) {
    document.getElementById('xg-ball').innerHTML = soccerBallSVG() + `<div class="xg-ball-num"><span id="xg-goals">${value}</span><em>GOALS</em></div>`;
  }

  /* ───────── canvas state ───────── */
  let DZ = null, bgTile = null, curShots = [], drawn = [];

  function buildBgTile() {
    if (!DZ) { bgTile = null; return; }
    const { cols, rows } = DZ;

    // 2D Gaussian smooth — removes XGBoost step-function noise so the surface
    // transitions cleanly between zones instead of spiking at cell boundaries
    const sig = 1.8, rad = Math.ceil(sig * 2.5);
    const kw = [];
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++)
        kw.push([dy, dx, Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig))]);
    const ksum = kw.reduce((a, k) => a + k[2], 0);
    const sg = DZ.grid.map((row, r) => row.map((_, c) => {
      let v = 0;
      for (const [dy, dx, w] of kw)
        v += DZ.grid[Math.max(0, Math.min(rows - 1, r + dy))]
                    [Math.max(0, Math.min(cols - 1, c + dx))] * w;
      return v / ksum;
    }));

    // 4× super-sampled tile via bilinear interpolation — source tile is 236×164
    // instead of 59×41, so browser only needs to upscale ~5× instead of ~23×,
    // which eliminates the mushy blurry appearance
    const tW = cols * 4, tH = rows * 4;
    const off = document.createElement('canvas');
    off.width = tW; off.height = tH;
    const octx = off.getContext('2d');
    const img = octx.createImageData(tW, tH);
    for (let py = 0; py < tH; py++) {
      for (let px = 0; px < tW; px++) {
        const fc = (px + 0.5) * cols / tW - 0.5;
        const fr = (py + 0.5) * rows / tH - 0.5;
        const c0 = Math.max(0, Math.min(cols - 2, Math.floor(fc)));
        const r0 = Math.max(0, Math.min(rows - 2, Math.floor(fr)));
        const tx = Math.max(0, Math.min(1, fc - c0));
        const ty = Math.max(0, Math.min(1, fr - r0));
        const v = sg[r0][c0]     * (1 - tx) * (1 - ty) +
                  sg[r0][c0 + 1] * tx        * (1 - ty) +
                  sg[r0 + 1][c0] * (1 - tx) * ty        +
                  sg[r0 + 1][c0 + 1] * tx   * ty;
        const [R, G, B] = colorRGB(v);
        const i = (py * tW + px) * 4;
        img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    bgTile = off;
  }

  function drawScene() {
    const canvas = document.getElementById('xg-heatmap');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = x => (x - 60) / 60 * W, py = y => y / 80 * H;
    const scale = Math.max(0.7, Math.min(1.4, W / 860));

    // LAYER 1 — model danger surface, coordinate-aligned so hot zone ends AT the goal line
    ctx.fillStyle = 'rgb(10,30,60)'; ctx.fillRect(0, 0, W, H);
    if (bgTile) {
      // grid covers x=61..119; map rightmost cell to x=120 (goal line = W)
      const tx0 = px(DZ.x_vals[0]);
      const tx1 = px(DZ.x_vals[DZ.cols - 1] + 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.86;
      ctx.drawImage(bgTile, 0, 0, bgTile.width, bgTile.height, tx0, 0, tx1 - tx0, H);
      ctx.globalAlpha = 1;
    }

    // pitch markings — drawn above heatmap so they stay readable
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.fillStyle   = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(1, H); ctx.stroke();                          // half-way line
    const pax = px(102); ctx.strokeRect(pax, py(18), W - pax - 1, py(62) - py(18));             // penalty box
    const g6  = px(114); ctx.strokeRect(g6,  py(30), W - g6  - 1, py(50) - py(30));             // 6-yard box
    ctx.beginPath(); ctx.arc(px(108), py(40), 2.4 * scale, 0, Math.PI * 2); ctx.fill();         // pen spot
    ctx.beginPath(); ctx.ellipse(px(108), py(40), 10 / 60 * W, 10 / 80 * H, 0,                  // pen arc
      126.87 * Math.PI / 180, 233.13 * Math.PI / 180); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4 * scale;                        // goal bar
    ctx.beginPath(); ctx.moveTo(W - 1, py(36)); ctx.lineTo(W - 1, py(44)); ctx.stroke();

    // LAYER 2 — actual shots (smaller radius so clusters stay readable)
    drawn = [];
    curShots.forEach(s => {
      const cx = px(s.x), cy = py(s.y);
      const r = (2 + s.xg * 5.5) * scale;   // max ≈ 10.5px at scale=1.4, vs old 25px
      const [R, G, B] = colorRGB(s.xg);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${R},${G},${B},0.82)`; ctx.fill();
      ctx.lineWidth = 1.2 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      if (s.is_goal) {
        ctx.beginPath(); ctx.arc(cx, cy, r + 2.5 * scale, 0, Math.PI * 2);
        ctx.lineWidth = 2 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(9 * scale)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('★', cx, cy - r - 2.5 * scale - 1);
      }
      drawn.push({ cx, cy, r, shot: s });
    });
  }

  /* ───────── count-up ───────── */
  function animateCount(el, to, dur) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    const start = performance.now();
    const step = now => { const t = Math.min(1, (now - start) / dur); el.textContent = Math.round((1 - Math.pow(1 - t, 3)) * to); if (t < 1) requestAnimationFrame(step); else el.textContent = to; };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = to; }, dur + 80);
  }

  /* ───────── dropdown ───────── */
  function setupXgDropdown(input, dropdown, onSelect) {
    let idx = -1;
    const render = () => {
      const q = input.value.toLowerCase().trim();
      const matches = (q ? XG_TEAMS.filter(t => t.toLowerCase().includes(q)) : XG_TEAMS).slice(0, 14);
      if (!matches.length) { dropdown.classList.remove('open'); return; }
      idx = -1;
      dropdown.innerHTML = matches.map(t => `<div class="team-option">${t}</div>`).join('');
      dropdown.classList.add('open');
      dropdown.querySelectorAll('.team-option').forEach(opt => opt.addEventListener('mousedown', e => { e.preventDefault(); input.value = opt.textContent; dropdown.classList.remove('open'); if (onSelect) onSelect(opt.textContent); }));
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', e => {
      const opts = dropdown.querySelectorAll('.team-option'); if (!opts.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, opts.length - 1); opts.forEach((o, i) => o.classList.toggle('active', i === idx)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); opts.forEach((o, i) => o.classList.toggle('active', i === idx)); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); input.value = opts[idx].textContent; dropdown.classList.remove('open'); if (onSelect) onSelect(opts[idx].textContent); }
    });
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 150));
  }

  /* ───────── render team data ───────── */
  function renderTeam(data, shotsData) {
    renderBall(data.actual_goals);
    animateCount(document.getElementById('xg-goals'), data.actual_goals, 1100);
    document.getElementById('xg-total').textContent = data.total_xg.toFixed(2);
    const delta = +(data.actual_goals - data.total_xg).toFixed(2);
    const dEl = document.getElementById('xg-delta');
    if (delta > 0.05) { dEl.className = 'xg-delta over'; dEl.textContent = `+${delta.toFixed(2)} above xG ↑`; }
    else if (delta < -0.05) { dEl.className = 'xg-delta under'; dEl.textContent = `${delta.toFixed(2)} below xG ↓`; }
    else { dEl.className = 'xg-delta even'; dEl.textContent = 'Exactly on xG'; }
    document.getElementById('xg-matches').textContent = `${data.team} · ${data.matches_played} matches`;

    document.getElementById('xg-shots').textContent = data.total_shots;
    document.getElementById('xg-spg').textContent = data.shots_per_game.toFixed(1);
    document.getElementById('xg-xgps').textContent = data.xg_per_shot.toFixed(3);

    const maxV = Math.max(data.total_xg, data.actual_goals) || 1;
    requestAnimationFrame(() => {
      document.getElementById('xg-vsfill').style.width = (data.total_xg / maxV * 100) + '%';
      document.getElementById('xg-vstick').style.left = `calc(${data.actual_goals / maxV * 100}% - 1.5px)`;
    });
    document.getElementById('xg-vslabel').innerHTML = `xG <b class="exp">${data.total_xg.toFixed(2)}</b> vs Goals <b class="act">${data.actual_goals}</b>`;

    const tb = document.getElementById('xg-leaderboard');
    tb.innerHTML = data.top_players.slice(0, 10).map((p, i) => {
      const vse = +(p.goals - p.xg).toFixed(2);
      const cls = vse > 0.05 ? 'over' : (vse < -0.05 ? 'under' : '');
      const sign = vse > 0 ? '+' : '';
      return `<tr>
        <td class="${i === 0 ? 'rank-1' : ''}">${i + 1}</td>
        <td class="pl-cell">${p.player}</td>
        <td>${p.shots}</td>
        <td>${p.goals}</td>
        <td class="xg-cell">${p.xg.toFixed(2)}</td>
        <td>${p.xg_per_shot.toFixed(3)}</td>
        <td class="vse ${cls}">${sign}${vse.toFixed(2)}</td>
      </tr>`;
    }).join('');

    curShots = shotsData.shots || [];
    drawScene();
    document.getElementById('xg-board').classList.remove('hidden');
    const hint = document.getElementById('xg-canvas-hint');
    if (hint) { hint.textContent = `${data.team} · ${curShots.length} shots over the surface`; }
  }

  /* ───────── tooltip ───────── */
  function initTooltip() {
    const canvas = document.getElementById('xg-heatmap');
    const tip = document.getElementById('xg-tooltip');
    const wrap = canvas.parentElement;
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = null, bestD = Infinity;
      drawn.forEach(d => { const dist = Math.hypot(d.cx - mx, d.cy - my); if (dist < Math.max(14, d.r) && dist < bestD) { bestD = dist; best = d; } });
      if (!best) { tip.classList.remove('show'); return; }
      const s = best.shot;
      tip.innerHTML = `<div class="tt-player">${s.player}</div>` +
        `<div class="tt-meta">${s.shot_type} · ${s.body_part} · min ${s.minute}</div>` +
        `<div class="tt-xg tt-meta">xG: <b>${s.xg.toFixed(2)}</b> · ${s.is_goal ? '<span class="tt-goal">⚽ GOAL</span>' : 'No goal'}</div>`;
      tip.classList.add('show');
      let tx = best.cx + 14, ty = best.cy - 10;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      if (tx + tw > wrap.clientWidth) tx = best.cx - tw - 14;
      if (ty < 0) ty = best.cy + 14;
      if (ty + th > wrap.clientHeight) ty = wrap.clientHeight - th - 4;
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    });
    canvas.addEventListener('mouseleave', () => tip.classList.remove('show'));
  }

  /* ───────── context controls ───────── */
  function currentParams() {
    const get = g => { const el = document.querySelector(`.xg-pillset[data-group="${g}"] .xg-pill.on`); return el ? el.dataset.val : null; };
    return {
      body_part: get('body_part') || 'Right Foot',
      shot_type: get('shot_type') || 'Open Play',
      under_pressure: get('under_pressure') === 'true'
    };
  }
  async function loadDangerZones() {
    const p = currentParams();
    const qs = `?body_part=${encodeURIComponent(p.body_part)}&shot_type=${encodeURIComponent(p.shot_type)}&under_pressure=${p.under_pressure}`;
    const canvas = document.getElementById('xg-heatmap');
    canvas.style.opacity = '0.5';
    DZ = await xgGet('/api/xg/danger-zones' + qs);
    buildBgTile();
    drawScene();
    requestAnimationFrame(() => { canvas.style.opacity = '1'; });
    setTimeout(() => { canvas.style.opacity = '1'; }, 120);
  }

  /* ───────── init ───────── */
  async function initXG() {
    const section = document.getElementById('xg-section');
    if (!section) return;
    const input = document.getElementById('xg-team');
    const dropdown = document.getElementById('xg-dropdown');
    const errEl = document.getElementById('xg-error');

    renderBall('—');
    XG_TEAMS = WC2022.slice();
    xgGet('/api/xg/teams').then(t => { if (t && t.teams && t.teams.length) XG_TEAMS = t.teams; }).catch(() => {});

    let busy = false;
    async function analyze(team) {
      team = (team || input.value).trim();
      errEl.textContent = '';
      if (!team) { errEl.textContent = 'Please select a team.'; return; }
      if (busy) return; busy = true;
      try {
        const [data, shots] = await Promise.all([
          xgGet('/api/xg/team/' + encodeURIComponent(team)),
          xgGet('/api/xg/shots/' + encodeURIComponent(team))
        ]);
        if (!data || !data.team) { errEl.textContent = 'No xG data for that team.'; return; }
        input.value = data.team;
        renderTeam(data, shots);
      } catch (e) { errEl.textContent = 'Could not load xG data. Make sure the API is running.'; }
      finally { busy = false; }
    }
    setupXgDropdown(input, dropdown, team => analyze(team));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !dropdown.classList.contains('open')) analyze(); });

    // context pills
    document.querySelectorAll('.xg-pillset').forEach(set => {
      set.querySelectorAll('.xg-pill').forEach(pill => pill.addEventListener('click', () => {
        if (pill.classList.contains('on')) return;
        set.querySelectorAll('.xg-pill').forEach(p => p.classList.remove('on'));
        pill.classList.add('on');
        loadDangerZones();
      }));
    });

    initTooltip();
    if (window.ResizeObserver) { new ResizeObserver(() => drawScene()).observe(document.getElementById('xg-heatmap').parentElement); }
    else window.addEventListener('resize', drawScene);

    // danger-zone surface loads immediately — section looks alive with no team
    await loadDangerZones();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initXG);
  else initXG();
})();
