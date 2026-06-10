/* ═══════════════════════════════════════════════════════════════════
   FIFA World Cup 2026 — Match Predictor – Frontend
   ═══════════════════════════════════════════════════════════════════ */

const API = window.location.origin;
let ALL_TEAMS = [];

// ─── 3D Soccer Ball (Three.js) ─────────────────────────────────────
(function initBall() {
  const container = document.getElementById('ball-container');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
  keyLight.position.set(3, 5, 4);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc4d8ff, 0.4);
  fillLight.position.set(-3, 2, -2);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xf5c518, 0.6, 20);
  rimLight.position.set(0, -3, 3);
  scene.add(rimLight);

  // Soccer ball — use Higgsfield-generated texture on a sphere
  const ballGeo = new THREE.SphereGeometry(1, 64, 64);

  // Load the Higgsfield-generated soccer ball as a texture
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  const ballTexture = loader.load(
    'https://d8j0ntlcm91z4.cloudfront.net/user_3ExTZ9Vq14Pkl2Niqqh4XjCKsoZ/hf_20260610_201403_485a5271-928f-421a-851c-5caaa9d95c12.png'
  );

  // Create seam bump map procedurally
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 1024;
  bumpCanvas.height = 1024;
  const bCtx = bumpCanvas.getContext('2d');
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 1024, 1024);

  const pentagons = [
    { x: 512, y: 512, r: 140 },
    { x: 200, y: 200, r: 120 },
    { x: 824, y: 200, r: 120 },
    { x: 200, y: 824, r: 120 },
    { x: 824, y: 824, r: 120 },
    { x: 100, y: 512, r: 110 },
    { x: 924, y: 512, r: 110 },
    { x: 512, y: 100, r: 110 },
    { x: 512, y: 924, r: 110 },
  ];
  pentagons.forEach(p => {
    bCtx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      bCtx.lineTo(p.x + p.r * Math.cos(angle), p.y + p.r * Math.sin(angle));
    }
    bCtx.closePath();
    bCtx.strokeStyle = '#555';
    bCtx.lineWidth = 6;
    bCtx.stroke();
  });
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);

  const ballMat = new THREE.MeshPhysicalMaterial({
    map: ballTexture,
    bumpMap: bumpTexture,
    bumpScale: 0.03,
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    reflectivity: 0.6,
    envMapIntensity: 1.0,
  });

  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  scene.add(ball);

  // Scroll state
  let scrollY = 0;
  let targetScrollY = 0;
  let ballBaseY = 0.3;
  let rollAngle = 0;

  window.addEventListener('scroll', () => {
    targetScrollY = window.scrollY;
  }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);

    scrollY += (targetScrollY - scrollY) * 0.08;

    const scrollPct = scrollY / (window.innerHeight * 0.8);
    const clampedPct = Math.min(Math.max(scrollPct, 0), 1);

    // Ball position: moves right and down as you scroll
    ball.position.x = -1 + clampedPct * 6;
    ball.position.y = ballBaseY - clampedPct * 3;

    // Scale shrinks slightly
    const s = 1 - clampedPct * 0.3;
    ball.scale.set(s, s, s);

    // Rolling rotation
    rollAngle = scrollY * 0.008;
    ball.rotation.z = -rollAngle;
    ball.rotation.x = rollAngle * 0.4;

    // Idle spin when not scrolling
    ball.rotation.y += 0.003;

    // Opacity / visibility via camera distance
    camera.position.z = 5 + clampedPct * 3;

    // Fade container
    const opacity = 1 - clampedPct * 1.2;
    container.style.opacity = Math.max(0, opacity);

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
