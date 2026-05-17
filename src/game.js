import * as THREE from 'three';
import { World } from './world.js';
import { Motorcycle } from './motorcycle.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';
import { DeliverySystem } from './delivery.js';
import { Audio } from './audio.js';
import { NPCSystem } from './npc.js';
import { Api } from './api.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._running = false;
    this._lastTime = 0;
    this._totalGameTime = 90; // shift length in seconds
    this._timeRemaining = this._totalGameTime;
    this._popupTimer = 0;
  }

  async init() {
    this._setupRenderer();
    this._setupScene();
    this._setupLighting();
    this._setupSky();

    // Loading progress is mostly synchronous since we're procedural.
    this._setProgress(15);
    await this._yield();

    this.world = new World(this.scene, { gridSize: 8, blockSize: 60, roadWidth: 12, seed: 24 });
    this.world.build();
    this._setProgress(55);
    await this._yield();

    this.player = new Motorcycle(this.world);
    this.scene.add(this.player.mesh);
    this.player.setPosition(0, 0, 0);
    this._setProgress(70);
    await this._yield();

    this.input = new Input();
    this.followCam = new FollowCamera(this.camera);
    this.minimap = new Minimap(document.getElementById('minimap'), this.world);
    this.bigMapCanvas = document.getElementById('bigmap-canvas');
    this.delivery = new DeliverySystem(this.scene, this.world);
    this.audio = new Audio();
    // Detect mobile/low-power device for adaptive NPC counts.
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth < 760);
    const npcCounts = isMobile
      ? { pedestrianCount: 70, vehicleCount: 40 }
      : { pedestrianCount: 160, vehicleCount: 90 };
    this.npcs = new NPCSystem(this.scene, this.world, npcCounts);
    // Let the player physically collide with pedestrians/cars.
    this.player.npcs = this.npcs;

    // 3D nav arrow that floats above the bike pointing to the current target.
    this.navArrow = this._buildNavArrow();
    this.scene.add(this.navArrow);

    this._setProgress(90);
    await this._yield();

    this._wireUI();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());

    this._setProgress(100);
    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('start-menu').classList.remove('hidden');
    }, 200);

    // Render a static frame as background while menu is up.
    this.renderer.render(this.scene, this.camera);
  }

  _yield() { return new Promise(r => setTimeout(r, 30)); }
  _setProgress(p) {
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${p}%`;
  }

  _buildNavArrow() {
    // Big floating arrow above the bike, points horizontally toward the current target.
    const group = new THREE.Group();
    group.name = 'NavArrow';

    // Pivot that rotates around Y to face the target.
    const pivot = new THREE.Group();
    group.add(pivot);
    group.userData.pivot = pivot;

    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x66ddff, transparent: true, opacity: 0.9, depthTest: false,
    });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.6), arrowMat);
    shaft.position.z = 0.3;
    pivot.add(shaft);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 4), arrowMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.6;
    pivot.add(tip);

    // Render last so it's always visible
    pivot.traverse(o => { if (o.material) o.renderOrder = 999; });
    return group;
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bd1ff);
    this.scene.fog = new THREE.Fog(0xb8d8f0, 250, 700);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1500
    );
    this.camera.position.set(0, 8, -12);
    this.camera.lookAt(0, 1, 0);
  }

  _setupLighting() {
    // Hemisphere fill
    const hemi = new THREE.HemisphereLight(0xc6e6ff, 0x4a5a40, 0.6);
    this.scene.add(hemi);

    // Sun (directional)
    const sun = new THREE.DirectionalLight(0xfff2d2, 1.2);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 80;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sun = sun;

    // Soft ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(ambient);
  }

  _setupSky() {
    // Big sphere with vertical gradient. We keep it inside-out by inverting normals.
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4a87cf) },
        midColor: { value: new THREE.Color(0xb6d8ee) },
        botColor: { value: new THREE.Color(0xfff0d0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 botColor;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col;
          if (h > 0.0) {
            col = mix(midColor, topColor, smoothstep(0.0, 0.7, h));
          } else {
            col = mix(midColor, botColor, smoothstep(0.0, -0.3, h));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  _wireUI() {
    const startBtn = document.getElementById('start-btn');
    const usernameInput = document.getElementById('username-input');
    const usernameHint = document.getElementById('username-hint');
    const signoutBtn = document.getElementById('signout-btn');
    const userBadge = document.getElementById('current-user');
    const userBadgeName = document.getElementById('current-user-name');

    // Restore persistent user (cookie-flavored localStorage); never re-prompt unless signout.
    const persistedUser = Api.loadUser();
    if (persistedUser) {
      this.user = persistedUser;
      this.username = persistedUser.username;
      // Hide input field, show "Welcome back" badge.
      const field = document.querySelector('.username-field');
      if (field) field.style.display = 'none';
      if (userBadge) userBadge.classList.remove('hidden');
      if (userBadgeName) userBadgeName.textContent = persistedUser.username;
      startBtn.disabled = false;
      startBtn.textContent = `Continue as ${persistedUser.username}`;
      this._startHeartbeat();
    }

    let checkTimer = null;
    let lastChecked = '';
    const setHint = (text, type) => {
      if (!usernameHint) return;
      usernameHint.textContent = text;
      usernameHint.classList.remove('error', 'ok', 'checking');
      if (type) usernameHint.classList.add(type);
    };

    const validateLocal = (v) => {
      if (!v) return 'Required to start the shift';
      if (v.length < 2) return 'At least 2 characters';
      if (v.length > 16) return 'Max 16 characters';
      if (!/^[A-Za-z0-9_.\- ]+$/.test(v)) return 'Letters, numbers, _ . - only';
      return null;
    };

    const runCheck = async (v) => {
      if (lastChecked === v) return;
      lastChecked = v;
      setHint('Checking availability...', 'checking');
      try {
        const r = await Api.checkUsername(v);
        if (lastChecked !== v) return; // stale
        if (r.available) {
          setHint(`✓ "${v}" is available`, 'ok');
          startBtn.disabled = false;
        } else {
          setHint(r.reason || 'Username already taken', 'error');
          startBtn.disabled = true;
        }
      } catch (e) {
        if (lastChecked !== v) return;
        setHint('Could not reach server', 'error');
        startBtn.disabled = true;
      }
    };

    const onUsernameInput = () => {
      const v = (usernameInput.value || '').trim();
      const err = validateLocal(v);
      if (err) {
        setHint(err, v ? 'error' : null);
        startBtn.disabled = true;
        clearTimeout(checkTimer);
        return;
      }
      // Debounce server check.
      clearTimeout(checkTimer);
      startBtn.disabled = true;
      setHint('...', 'checking');
      checkTimer = setTimeout(() => runCheck(v), 350);
    };

    if (usernameInput && !persistedUser) {
      usernameInput.addEventListener('input', onUsernameInput);
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !startBtn.disabled) startBtn.click();
      });
      onUsernameInput();
    }

    startBtn.addEventListener('click', async () => {
      // If already persisted, just start.
      if (this.user) {
        this._startGame();
        return;
      }
      const v = (usernameInput.value || '').trim();
      if (validateLocal(v)) { usernameInput.focus(); return; }
      startBtn.disabled = true;
      setHint('Registering...', 'checking');
      try {
        const r = await Api.register(v);
        this.user = r.user;
        this.username = r.user.username;
        Api.saveUser(this.user);
        this._startHeartbeat();
        this._startGame();
      } catch (e) {
        setHint(e.message || 'Registration failed', 'error');
        startBtn.disabled = false;
      }
    });

    if (signoutBtn) {
      signoutBtn.addEventListener('click', () => this._confirmSignout());
    }

    document.getElementById('restart-btn').addEventListener('click', () => this._startGame(true));

    // Refresh stats + leaderboard while on start menu.
    this._refreshLobby();
    this._lobbyTimer = setInterval(() => {
      const onMenu = !document.getElementById('start-menu').classList.contains('hidden')
        || !document.getElementById('game-over').classList.contains('hidden');
      if (onMenu) this._refreshLobby();
    }, 8000);

    // M to toggle big map
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && this._running) {
        const bm = document.getElementById('big-map');
        if (bm.classList.contains('hidden')) {
          bm.classList.remove('hidden');
          this.minimap.drawBig(this.bigMapCanvas, this.player, this.delivery.destination, this.delivery.pizzeriaPos);
        } else {
          bm.classList.add('hidden');
        }
      } else if (e.code === 'Escape') {
        document.getElementById('big-map').classList.add('hidden');
      } else if (e.code === 'KeyC' && this._running) {
        this.followCam.cycleMode();
      } else if (e.code === 'KeyR' && this._running) {
        // Reset player to nearest road
        const snap = this.world.snapToNearestRoad(this.player.position.x, this.player.position.z);
        this.player.setPosition(snap.x, snap.z, this.player.heading);
      }
    });

    // Click big map to close
    document.getElementById('big-map').addEventListener('click', (e) => {
      if (e.target.id === 'big-map') {
        document.getElementById('big-map').classList.add('hidden');
      }
    });
  }

  _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _startGame(restart = false) {
    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    // Show username in HUD
    const hudName = document.getElementById('hud-username');
    if (hudName && this.username) hudName.textContent = this.username;

    if (restart) {
      // Reset state
      this.delivery.cash = 0;
      this.delivery.totalDeliveries = 0;
      this.delivery.streak = 0;
      this.delivery.bestStreak = 0;
      this.delivery.returnToPickup();
      this.player.setPosition(0, 0, 0);
      this.player.boostFuel = 1;
    }
    this._timeRemaining = this._totalGameTime;
    this.delivery.now = 0;

    // Try to enable audio (browser requires user gesture).
    this.audio.enable();

    if (this.username) {
      this._showPopup(`Welcome, ${this.username}! 🍕`, 2400);
    }

    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _showPopup(text, ms = 1600) {
    const el = document.getElementById('popup');
    el.textContent = text;
    el.classList.remove('hidden');
    // Force reflow then add show
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._popupTimeout);
    this._popupTimeout = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 400);
    }, ms);
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;

    this._update(dt);
    this._render();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    // Game timer
    this._timeRemaining -= dt;
    if (this._timeRemaining <= 0) {
      this._timeRemaining = 0;
      this._endGame();
      return;
    }

    // Player
    const throttle = this.input.throttle();
    const steer = this.input.steer();
    const handbrake = this.input.handbrake();
    const boost = this.input.boost();
    this.player.update(dt, throttle, steer, handbrake, boost);

    // Camera
    this.followCam.update(this.player.position, this.player.heading, this.player.speed, dt);

    // Audio
    this.audio.setEngine(this.player.engineRpm, this.player.speed);

    // Delivery system
    const event = this.delivery.update(dt, this.player, this.audio);
    if (event === 'pickedup') {
      this._showPopup('🍕 Picked up! Time to deliver');
      // Add some bonus time for picking up so the shift can extend.
      this._timeRemaining += 5;
    } else if (event === 'delivered') {
      this._showPopup(`✓ Delivered! +$${this.delivery.deliveryReward}`);
      // Reward bonus time
      this._timeRemaining += 12;
    } else if (event === 'expired') {
      this._showPopup('⏰ Late! Streak lost');
    }

    // NPCs (pedestrians + traffic)
    this.npcs.update(dt);

    // 3D nav arrow above the bike, pointing to current target
    this._updateNavArrow(dt);

    // HUD
    this._updateHUD();

    // Minimap (small, every frame is fine)
    this.minimap.drawSmall(this.player, this.delivery.destination, this.delivery.pizzeriaPos);

    // If big map is open, redraw it too.
    const bm = document.getElementById('big-map');
    if (!bm.classList.contains('hidden')) {
      this.minimap.drawBig(this.bigMapCanvas, this.player, this.delivery.destination, this.delivery.pizzeriaPos);
    }

    this.input.clearJustPressed();
  }

  _updateNavArrow(dt) {
    if (!this.navArrow || !this.delivery) return;
    const t = this.delivery.target;
    if (!t) { this.navArrow.visible = false; return; }
    this.navArrow.visible = true;

    // Hover above bike, bob up and down
    const bob = Math.sin(this.delivery.now * 3) * 0.3;
    this.navArrow.position.set(
      this.player.position.x,
      4.5 + bob,
      this.player.position.z
    );

    // Aim arrow toward target (in XZ plane). atan2(dx, dz) gives angle around Y.
    const dx = t.x - this.player.position.x;
    const dz = t.z - this.player.position.z;
    const angle = Math.atan2(dx, dz);
    this.navArrow.userData.pivot.rotation.y = angle;

    // Color: orange for pickup, cyan for delivery
    const color = this.delivery.state === 'pickup' ? 0xffb37b : 0x66ddff;
    this.navArrow.userData.pivot.traverse(o => {
      if (o.material && o.material.color) o.material.color.setHex(color);
    });
  }

  _updateHUD() {
    document.getElementById('hud-cash').textContent = this.delivery.cash;
    document.getElementById('hud-deliveries').textContent = this.delivery.totalDeliveries;
    document.getElementById('hud-timer').textContent = Math.ceil(this._timeRemaining);
    document.getElementById('boost-fill').style.width = (this.player.boostFuel * 100).toFixed(0) + '%';

    const streakEl = document.getElementById('hud-streak');
    const multEl = document.getElementById('hud-mult');
    if (streakEl) streakEl.textContent = this.delivery.streak;
    if (multEl) {
      const m = this.delivery.deliveryMultiplier && this.delivery.state === 'deliver'
        ? this.delivery.deliveryMultiplier
        : Math.min(4, 1 + this.delivery.streak * 0.25);
      multEl.textContent = `×${m.toFixed(2)}`;
      multEl.style.color = m > 1.5 ? '#ff7a7a' : (m > 1.01 ? '#ffb37b' : 'rgba(255,255,255,0.55)');
    }

    const speedKmh = Math.abs(this.player.speed) * 3.6;
    document.getElementById('speed-num').textContent = Math.round(speedKmh);
    document.getElementById('gear-label').textContent =
      this.player.speed < -0.1 ? 'R' :
      this.player.speed < 0.1 ? 'N' : `D${this.player.gear}`;

    // Objective
    const t = this.delivery.target;
    const dx = t.x - this.player.position.x;
    const dz = t.z - this.player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    document.getElementById('obj-title').textContent = this.delivery.title;
    document.getElementById('obj-sub').textContent = this.delivery.subtitle;
    document.getElementById('obj-distance').textContent = Math.round(dist);
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  _endGame() {
    this._running = false;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('big-map').classList.add('hidden');
    const goName = document.getElementById('go-username');
    if (goName) goName.textContent = this.username || '—';
    document.getElementById('go-cash').textContent = `$${this.delivery.cash}`;
    document.getElementById('go-deliveries').textContent = this.delivery.totalDeliveries;
    document.getElementById('go-streak').textContent = this.delivery.bestStreak;
    document.getElementById('game-over').classList.remove('hidden');

    // Submit score, then refresh lobby leaderboard
    if (this.user && this.user.id) {
      Api.submitScore(this.user.id, this.delivery.cash, this.delivery.totalDeliveries, this.delivery.bestStreak)
        .catch((e) => console.warn('score submit failed:', e.message))
        .finally(() => this._refreshLobby());
    } else {
      this._refreshLobby();
    }
  }

  // ---------- Auth + lobby helpers ----------
  _startHeartbeat() {
    if (this._heartbeatTimer || !this.user) return;
    const send = () => {
      if (!this.user) return;
      Api.heartbeat(this.user.id).catch(() => {});
    };
    send();
    this._heartbeatTimer = setInterval(send, 20000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _confirmSignout() {
    const overlay = document.getElementById('signout-confirm');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const yes = document.getElementById('signout-yes');
    const no = document.getElementById('signout-no');
    const close = () => {
      overlay.classList.add('hidden');
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
    };
    const onYes = async () => {
      try { if (this.user) await Api.signout(this.user.id); } catch {}
      Api.clearUser();
      this._stopHeartbeat();
      close();
      // Reload to a clean menu state.
      window.location.reload();
    };
    const onNo = () => close();
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
  }

  async _refreshLobby() {
    try {
      const [lb, st] = await Promise.all([Api.leaderboard(8), Api.stats()]);
      const lbList = document.getElementById('leaderboard-list');
      if (lbList) {
        if (!lb.leaderboard || lb.leaderboard.length === 0) {
          lbList.innerHTML = '<li class="lb-empty">No scores yet. Be the first!</li>';
        } else {
          lbList.innerHTML = lb.leaderboard.map((row, i) => `
            <li>
              <span class="lb-rank">#${i + 1}</span>
              <span class="lb-name">${escapeHtml(row.username)}</span>
              <span class="lb-cash">$${row.best_cash}</span>
            </li>
          `).join('');
        }
      }
      const goLb = document.getElementById('go-leaderboard');
      if (goLb && lb.leaderboard) {
        goLb.innerHTML = lb.leaderboard.slice(0, 5).map((row, i) =>
          `<li><span>#${i + 1} ${escapeHtml(row.username)}</span><span>$${row.best_cash}</span></li>`
        ).join('');
      }
      const active = document.getElementById('stat-active');
      const total = document.getElementById('stat-total');
      if (active) active.textContent = st.active_users;
      if (total) total.textContent = st.total_registered;
    } catch (e) {
      // Network errors silently ignored on the lobby; user can still play locally if registered.
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
