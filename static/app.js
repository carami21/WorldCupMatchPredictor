/* ═══════════════════════════════════════════════════════════════════
   FIFA World Cup 2026 — Match Predictor – Frontend
   ═══════════════════════════════════════════════════════════════════ */

const API = window.location.origin;
let ALL_TEAMS = [];

// ─── Three.js Soccer Ball ──────────────────────────────────────────
(function initBall() {
  const container = document.getElementById('ball-container');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Lighting — key + fill + rim for a realistic leather look
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const key = new THREE.DirectionalLight(0xfff8f0, 1.3);
  key.position.set(4, 6, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd0e8ff, 0.35);
  fill.position.set(-4, 2, 3);
  scene.add(fill);

  const rim = new THREE.PointLight(0xf5c518, 0.5, 18);
  rim.position.set(0, -4, 2);
  scene.add(rim);

  // ── Build equirectangular soccer ball texture ──────────────────
  // Pentagons placed at the 12 icosahedron face-center positions in UV space.
  // U = longitude / 2π  (0→1 wraps around sphere)
  // V = latitude / π    (0=north pole, 1=south pole)
  const W = 2048, H = 1024;
  const tc = document.createElement('canvas');
  tc.width = W; tc.height = H;
  const ctx = tc.getContext('2d');

  // Ivory leather base
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, W, H);

  // Leather grain
  for (let i = 0; i < 80000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }

  // 12 pentagon centres in UV (u,v) — icosahedron vertices
  const phi = (1 + Math.sqrt(5)) / 2; // golden ratio
  const icosa = [
    [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
    [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1],
  ].map(([x, y, z]) => {
    const len = Math.sqrt(x*x + y*y + z*z);
    const nx = x/len, ny = y/len, nz = z/len;
    const lat = Math.acos(Math.max(-1, Math.min(1, ny)));   // 0..π
    const lon = Math.atan2(nz, nx) + Math.PI;               // 0..2π
    return { u: lon / (2 * Math.PI), v: lat / Math.PI };
  });

  // Pentagon radius in UV-pixels — large enough to tile properly
  const PR = 175;

  // Draw each pentagon (and a mirrored copy for the seam)
  function drawPentagon(u, v, r) {
    const cx = u * W, cy = v * H;
    [-1, 0, 1].forEach(wrap => {
      const ox = cx + wrap * W;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i / 5) - Math.PI / 2;
        const px = ox + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Gradient fill: dark center fading to deep-black edge
      const grd = ctx.createRadialGradient(ox, cy, 0, ox, cy, r);
      grd.addColorStop(0, '#2a2a2a');
      grd.addColorStop(1, '#0d0d0d');
      ctx.fillStyle = grd;
      ctx.fill();

      // Seam highlight
      ctx.strokeStyle = 'rgba(200,200,200,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  // Draw connecting seam lines between nearby pentagons
  function seamLine(u1, v1, u2, v2) {
    ctx.beginPath();
    ctx.moveTo(u1 * W, v1 * H);
    ctx.lineTo(u2 * W, v2 * H);
    ctx.strokeStyle = 'rgba(80,80,80,0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Seams first (behind pentagons)
  for (let i = 0; i < icosa.length; i++) {
    for (let j = i + 1; j < icosa.length; j++) {
      const du = Math.abs(icosa[i].u - icosa[j].u);
      const dv = Math.abs(icosa[i].v - icosa[j].v);
      const dist = Math.sqrt(Math.min(du, 1 - du) ** 2 + dv ** 2);
      if (dist < 0.38) seamLine(icosa[i].u, icosa[i].v, icosa[j].u, icosa[j].v);
    }
  }

  icosa.forEach(({ u, v }) => drawPentagon(u, v, PR));

  const ballTex = new THREE.CanvasTexture(tc);
  ballTex.wrapS = THREE.RepeatWrapping;

  // Bump map from seams only
  const bc = document.createElement('canvas');
  bc.width = 1024; bc.height = 512;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, 1024, 512);
  icosa.forEach(({ u, v }) => {
    const cx = u * 1024, cy = v * 512;
    bx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i / 5) - Math.PI / 2;
      const px = cx + 86 * Math.cos(a), py = cy + 86 * Math.sin(a);
      i === 0 ? bx.moveTo(px, py) : bx.lineTo(px, py);
    }
    bx.closePath();
    bx.strokeStyle = '#404040';
    bx.lineWidth = 5;
    bx.stroke();
  });
  const bumpTex = new THREE.CanvasTexture(bc);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshPhysicalMaterial({
      map: ballTex,
      bumpMap: bumpTex,
      bumpScale: 0.04,
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
      reflectivity: 0.55,
    })
  );
  scene.add(ball);

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

    // Roll rightward and downward, shrink and fade
    ball.position.x = -1.2 + pct * 7;
    ball.position.y = 0.3 - pct * 3.2;
    const s = 1 - pct * 0.3;
    ball.scale.setScalar(s);

    // Rolling rotation driven by scroll + slow idle spin
    ball.rotation.z = -(scrollY * 0.008);
    ball.rotation.x =  (scrollY * 0.003);
    ball.rotation.y += 0.003;

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
