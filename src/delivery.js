import * as THREE from 'three';

/**
 * Delivery system: places a pizzeria building and one active destination marker
 * (a glowing beam pillar). The player picks up a pizza by entering the pizzeria
 * radius, then drops off by entering the destination radius.
 */
export class DeliverySystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.state = 'pickup';   // 'pickup' | 'deliver'
    this.cash = 0;
    this.totalDeliveries = 0;
    this.streak = 0;
    this.bestStreak = 0;

    // Per-delivery state
    this.deliveryDeadline = 0; // timestamp seconds
    this.deliveryReward = 0;
    this.now = 0;

    this.pickupRadius = 8;
    this.dropoffRadius = 8;

    // Build the pizzeria.
    this.pizzeria = this._buildPizzeria();
    this.scene.add(this.pizzeria);

    // Beam markers
    this.pickupMarker = this._buildBeam(0xffb37b);
    this.dropMarker = this._buildBeam(0x66ddff);
    this.scene.add(this.pickupMarker);
    this.scene.add(this.dropMarker);

    this.dropMarker.visible = false;
    this.destination = null;

    // Position pickup marker at the pizzeria.
    this.pickupMarker.position.set(this.pizzeriaPos.x, 0, this.pizzeriaPos.z);

    // Choose a starting destination right away when first pickup happens.
  }

  _buildPizzeria() {
    // Place pizzeria at a roadside near the origin (block (4,4) center-ish).
    const block = this.world.blockSize;
    const half = (this.world.gridSize * block) / 2;
    const cx = -half + 4 * block + block / 2;
    const cz = -half + 4 * block + block / 2;
    this.pizzeriaPos = { x: cx, z: cz - block * 0.35 }; // closer to a road edge

    const group = new THREE.Group();
    group.name = 'Pizzeria';

    // Building body - red and white, with sign
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8221a, roughness: 0.7 })
    );
    body.position.set(this.pizzeriaPos.x, 3, this.pizzeriaPos.z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(10.05, 1.2, 8.05),
      new THREE.MeshStandardMaterial({ color: 0xfff5e0 })
    );
    stripe.position.set(this.pizzeriaPos.x, 4.0, this.pizzeriaPos.z);
    group.add(stripe);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.5, 8.5),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    roof.position.set(this.pizzeriaPos.x, 6.25, this.pizzeriaPos.z);
    group.add(roof);

    // Big PIZZA sign - emissive red box
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfff5e0, emissive: 0xff8030, emissiveIntensity: 0.7 })
    );
    sign.position.set(this.pizzeriaPos.x, 7.2, this.pizzeriaPos.z + 4.0);
    group.add(sign);

    // Front "windows"
    for (const offset of [-2.5, 2.5]) {
      const w = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.8),
        new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffaa44, emissiveIntensity: 0.7 })
      );
      w.position.set(this.pizzeriaPos.x + offset, 2.3, this.pizzeriaPos.z + 4.001);
      group.add(w);
    }

    // Door
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x2a1a08 })
    );
    door.position.set(this.pizzeriaPos.x, 1.2, this.pizzeriaPos.z + 4.002);
    group.add(door);

    // Floating pizza emoji as billboard (using sprite-ish approach: a plane that always faces camera).
    // Skip for simplicity - use a sphere "pizza" on the roof.
    const pizzaSphere = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 0.18, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd97a, roughness: 0.7 })
    );
    pizzaSphere.position.set(this.pizzeriaPos.x, 8.6, this.pizzeriaPos.z);
    pizzaSphere.userData.float = true;
    group.add(pizzaSphere);
    this._floatPizza = pizzaSphere;

    // Register as obstacle (avoid driving through it).
    this.world.obstacles.push({
      minX: this.pizzeriaPos.x - 5, maxX: this.pizzeriaPos.x + 5,
      minZ: this.pizzeriaPos.z - 4, maxZ: this.pizzeriaPos.z + 4,
      kind: 'pizzeria',
    });

    return group;
  }

  _buildBeam(color) {
    const group = new THREE.Group();

    // Big glowing ground pad (the "step here" target). 8m radius matches dropoffRadius.
    const padRadius = 8;
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(padRadius, 48),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    group.add(pad);

    // Bright inner pad (so even if outer fades into ground it's visible)
    const innerPad = new THREE.Mesh(
      new THREE.CircleGeometry(padRadius * 0.55, 36),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    innerPad.rotation.x = -Math.PI / 2;
    innerPad.position.y = 0.06;
    group.add(innerPad);

    // Outer ring outline
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(padRadius - 0.4, padRadius, 48),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.08;
    group.add(outerRing);

    // Pillar of light (transparent cylinder) - taller for visibility from far away
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    beam.position.y = 30;
    group.add(beam);

    // Inner brighter core
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    core.position.y = 30;
    group.add(core);

    // Pulsing ring above the ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.2, 24),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    group.userData.color = color;
    group.userData.ring = ring;
    group.userData.outerRing = outerRing;
    return group;
  }

  pickupAt(player) {
    const dx = player.position.x - this.pizzeriaPos.x;
    const dz = player.position.z - this.pizzeriaPos.z;
    return dx * dx + dz * dz < this.pickupRadius * this.pickupRadius;
  }

  dropAt(player) {
    if (!this.destination) return false;
    const dx = player.position.x - this.destination.x;
    const dz = player.position.z - this.destination.z;
    return dx * dx + dz * dz < this.dropoffRadius * this.dropoffRadius;
  }

  /** Pick a new destination and switch to delivery mode. */
  newDestination(player) {
    const from = { x: player.position.x, z: player.position.z };
    let candidate = this.world.randomRoadPoint(from, 80);
    candidate = this.world.snapToNearestRoad(candidate.x, candidate.z);

    this.destination = candidate;
    this.dropMarker.position.set(candidate.x, 0, candidate.z);
    this.dropMarker.visible = true;
    this.pickupMarker.visible = false;
    this.state = 'deliver';

    // Distance and difficulty.
    const dx = candidate.x - player.position.x;
    const dz = candidate.z - player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Streak-based difficulty: as streak rises, deadlines get tighter and
    // rewards get bigger, so the game becomes more challenging the longer you play.
    // Streak 0 -> easy 1.0x, every 2 streak shaves ~10% off the time, floored at 0.45x.
    const tightness = Math.max(0.45, 1 - this.streak * 0.05);
    // Multiplier ramps up: 1.0x, 1.25x, 1.5x, ... capped at 4x.
    const multiplier = Math.min(4, 1 + this.streak * 0.25);

    this.deliveryDeadline = this.now + Math.max(20, (dist / 7) * tightness);
    this.deliveryReward = Math.round((20 + dist * 0.3) * multiplier);
    this.deliveryMultiplier = multiplier;
  }

  /** Switch back to pickup state at pizzeria. */
  returnToPickup() {
    this.state = 'pickup';
    this.destination = null;
    this.dropMarker.visible = false;
    this.pickupMarker.visible = true;
  }

  /** Returns one of: 'pickedup', 'delivered', 'expired', or null. */
  update(dt, player, audio) {
    this.now += dt;

    // Animate floating pizza on roof
    if (this._floatPizza) {
      this._floatPizza.position.y = 8.6 + Math.sin(this.now * 2) * 0.2;
      this._floatPizza.rotation.y += dt * 0.6;
    }

    // Animate beam pulse (scale ring)
    const pulse = 1 + Math.sin(this.now * 4) * 0.18;
    const opacityPulse = 0.7 + Math.sin(this.now * 4) * 0.2;
    if (this.state === 'pickup' && this.pickupMarker.userData.ring) {
      this.pickupMarker.userData.ring.scale.set(pulse, pulse, pulse);
      if (this.pickupMarker.userData.outerRing) {
        this.pickupMarker.userData.outerRing.material.opacity = opacityPulse;
      }
    }
    if (this.state === 'deliver' && this.dropMarker.userData.ring) {
      this.dropMarker.userData.ring.scale.set(pulse, pulse, pulse);
      if (this.dropMarker.userData.outerRing) {
        this.dropMarker.userData.outerRing.material.opacity = opacityPulse;
      }
    }

    // State transitions
    if (this.state === 'pickup') {
      if (this.pickupAt(player)) {
        this.newDestination(player);
        if (audio) audio.pickup();
        return 'pickedup';
      }
    } else if (this.state === 'deliver') {
      if (this.dropAt(player)) {
        this.cash += this.deliveryReward;
        this.totalDeliveries++;
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.returnToPickup();
        if (audio) audio.delivery();
        return 'delivered';
      }
      // Time expired -> fail
      if (this.now > this.deliveryDeadline) {
        this.streak = 0;
        this.returnToPickup();
        if (audio) audio.fail();
        return 'expired';
      }
    }
    return null;
  }

  get target() {
    if (this.state === 'pickup') return this.pizzeriaPos;
    return this.destination;
  }

  get title() {
    return this.state === 'pickup' ? 'Head to Pizzeria' : 'Deliver Pizza';
  }

  get subtitle() {
    if (this.state === 'pickup') {
      const next = Math.min(4, 1 + this.streak * 0.25);
      const m = next > 1.01 ? ` • ${next.toFixed(2)}x next delivery` : '';
      return `Pick up a hot pizza${m}`;
    }
    const left = Math.max(0, this.deliveryDeadline - this.now);
    const mult = this.deliveryMultiplier && this.deliveryMultiplier > 1.01
      ? ` • ${this.deliveryMultiplier.toFixed(2)}x`
      : '';
    return `Reward: $${this.deliveryReward}${mult} • ${left.toFixed(0)}s left`;
  }

  timeLeft() {
    if (this.state !== 'deliver') return null;
    return Math.max(0, this.deliveryDeadline - this.now);
  }
}
