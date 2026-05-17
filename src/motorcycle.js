import * as THREE from 'three';
import { createCapybara } from './capybara.js';

/**
 * Builds a stylized motorcycle (sport-bike inspired) with a capybara rider on top.
 * Returns a THREE.Group rooted at the bike's center of mass (ground level).
 *
 * The structure exposes named children so the player controller can animate
 * wheels, handlebars, lean, and the pizza box.
 */
export function createMotorcycle() {
  const root = new THREE.Group();
  root.name = 'Motorcycle';

  // Materials
  const bodyRed = new THREE.MeshStandardMaterial({
    color: 0xc8221a, roughness: 0.4, metalness: 0.4,
  });
  const bodyBlack = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c, roughness: 0.6, metalness: 0.4,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xcfd2d5, roughness: 0.25, metalness: 0.95,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111114, roughness: 0.95, metalness: 0,
  });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffe8a0, emissiveIntensity: 0.9,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.8,
  });

  // ---- Wheels ----
  const wheelRadius = 0.34;
  const wheelThickness = 0.18;

  function makeWheel() {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius, wheelThickness * 0.5, 10, 22),
      tireMat
    );
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius - 0.06, wheelRadius - 0.06, wheelThickness * 0.85, 16),
      chromeMat
    );
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);

    // Spokes
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, wheelRadius * 1.3, wheelThickness * 0.3),
        chromeMat
      );
      spoke.rotation.x = (Math.PI / 5) * i;
      wheel.add(spoke);
    }
    return wheel;
  }

  // Front wheel uses a steering pivot so steering (Y) and spinning (X) don't compound.
  const frontSteer = new THREE.Group();
  frontSteer.name = 'FrontSteer';
  frontSteer.position.set(0, wheelRadius, 0.85);
  root.add(frontSteer);

  const frontWheel = makeWheel();
  frontWheel.name = 'FrontWheel';
  frontSteer.add(frontWheel);

  const rearWheel = makeWheel();
  rearWheel.name = 'RearWheel';
  rearWheel.position.set(0, wheelRadius, -0.95);
  root.add(rearWheel);

  // ---- Frame ----
  // Main fuel tank body
  const tank = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.30, 0.85),
    bodyRed
  );
  tank.position.set(0, 0.78, 0);
  tank.castShadow = true;
  root.add(tank);

  // Front fairing (the pointy nose with headlight)
  const fairing = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.55, 8),
    bodyRed
  );
  fairing.rotation.x = Math.PI / 2;
  fairing.position.set(0, 0.85, 0.52);
  fairing.castShadow = true;
  root.add(fairing);

  // Rear cowl
  const cowl = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.4, 8),
    bodyRed
  );
  cowl.rotation.x = -Math.PI / 2;
  cowl.position.set(0, 0.78, -0.65);
  cowl.castShadow = true;
  root.add(cowl);

  // Seat (where the capybara sits)
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.10, 0.55),
    seatMat
  );
  seat.position.set(0, 0.95, -0.30);
  seat.castShadow = true;
  root.add(seat);

  // Engine block (between wheels)
  const engine = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.32, 0.55),
    bodyBlack
  );
  engine.position.set(0, 0.45, -0.05);
  engine.castShadow = true;
  root.add(engine);

  // Exhaust pipe
  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.7, 12),
    chromeMat
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.18, 0.32, -0.6);
  exhaust.castShadow = true;
  root.add(exhaust);

  // Chain guard / rear swingarm
  const swingarm = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.7),
    bodyBlack
  );
  swingarm.position.set(0.12, 0.30, -0.5);
  root.add(swingarm);

  // Mudguard front
  const frontFender = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.45),
    bodyRed
  );
  frontFender.position.set(0, 0.55, 0.85);
  root.add(frontFender);

  // ---- Handlebars (steerable) ----
  const handleRoot = new THREE.Group();
  handleRoot.name = 'Handlebars';
  handleRoot.position.set(0, 0.95, 0.55);
  root.add(handleRoot);

  const fork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8),
    chromeMat
  );
  fork.position.set(0, -0.15, 0);
  handleRoot.add(fork);

  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),
    bodyBlack
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.05, 0);
  handleRoot.add(bar);

  for (const sx of [-0.24, 0.24]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10),
      seatMat
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(sx, 0.05, 0);
    handleRoot.add(grip);
  }

  // Headlight
  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    headlightMat
  );
  headlight.rotation.x = -Math.PI / 2;
  headlight.position.set(0, 0.85, 0.78);
  root.add(headlight);

  // Tail light
  const tailLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.05, 0.04),
    tailLightMat
  );
  tailLight.position.set(0, 0.78, -0.85);
  root.add(tailLight);

  // ---- Pizza delivery box mounted behind the seat ----
  const pizzaBox = new THREE.Group();
  pizzaBox.name = 'PizzaBox';
  const boxBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffd97a, roughness: 0.6 })
  );
  boxBody.castShadow = true;
  pizzaBox.add(boxBody);
  // Pizza logo top stripe
  const logo = new THREE.Mesh(
    new THREE.BoxGeometry(0.51, 0.05, 0.21),
    new THREE.MeshStandardMaterial({ color: 0xc8221a })
  );
  logo.position.y = 0.13;
  pizzaBox.add(logo);

  pizzaBox.position.set(0, 1.18, -0.65);
  root.add(pizzaBox);

  // ---- Rider (capybara) ----
  const rider = createCapybara();
  rider.name = 'Rider';
  rider.scale.setScalar(0.95);
  rider.position.set(0, 1.18, -0.18);
  root.add(rider);

  // Lean group: we lean the whole bike when turning. Use a parent group.
  const leanGroup = new THREE.Group();
  leanGroup.name = 'LeanGroup';
  // We'll re-parent the whole "root" inside this lean group at runtime. For
  // simplicity, we directly tilt the bike's z rotation.

  return root;
}

/**
 * Player controller that turns input into bike motion using a simple but
 * good-feeling vehicle model. Designed for arcade feel, not full physics.
 */
export class Motorcycle {
  constructor(world) {
    this.world = world;
    this.mesh = createMotorcycle();
    this.position = new THREE.Vector3();
    this.heading = 0;        // yaw (radians)
    this.speed = 0;          // m/s along forward axis
    this.steerAngle = 0;     // current visual handle steer (radians)
    this.targetSteer = 0;
    this.lean = 0;           // current lean (radians, around forward axis)
    this.boostFuel = 1.0;    // 0..1
    this.bestStreak = 0;     // tracked externally, stored for convenience.
    this.npcs = null;        // optional NPC system for collisions; set externally

    // Tunables
    this.maxSpeed = 22;       // m/s ~ 80 km/h
    this.boostMaxSpeed = 30;  // m/s ~ 108 km/h
    this.accel = 14;
    this.brake = 30;
    this.naturalDecel = 4;
    this.reverseMax = -6;
    this.steerRate = 2.8;     // how fast steerAngle approaches target
    this.maxSteer = 0.55;     // radians
    this.turnGain = 1.6;      // how strongly steering affects heading

    // Debug refs
    this.frontWheel = this.mesh.getObjectByName('FrontWheel');
    this.frontSteer = this.mesh.getObjectByName('FrontSteer');
    this.rearWheel = this.mesh.getObjectByName('RearWheel');
    this.handlebars = this.mesh.getObjectByName('Handlebars');
    this.rider = this.mesh.getObjectByName('Rider');
    this.pizzaBox = this.mesh.getObjectByName('PizzaBox');

    // Engine pseudo-state
    this.engineRpm = 0;       // 0..1 for HUD/audio
    this.gear = 1;
  }

  setPosition(x, z, heading = 0) {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  /** Forward unit vector in world coordinates. */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /**
   * Update with delta time `dt` (seconds), throttle ([-1, 1]), steer ([-1, 1]),
   * handbrake (bool), boost (bool).
   */
  update(dt, throttle, steerInput, handbrake, boost) {
    // Boost fuel regen / drain
    let boostActive = boost && this.boostFuel > 0.02 && Math.abs(this.speed) > 4 && throttle > 0;
    if (boostActive) {
      this.boostFuel = Math.max(0, this.boostFuel - dt * 0.35);
    } else {
      this.boostFuel = Math.min(1, this.boostFuel + dt * 0.10);
    }

    const maxFwd = boostActive ? this.boostMaxSpeed : this.maxSpeed;

    // ---- Apply throttle / brake ----
    if (throttle > 0) {
      // Throttle increases speed up to maxFwd
      const accel = this.accel * (boostActive ? 1.8 : 1) * throttle;
      // Reduce acceleration as we approach top speed
      const factor = Math.max(0, 1 - this.speed / maxFwd);
      this.speed += accel * factor * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) {
        // Brake
        this.speed -= this.brake * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        // Reverse slowly
        this.speed += throttle * this.accel * 0.5 * dt;
        if (this.speed < this.reverseMax) this.speed = this.reverseMax;
      }
    } else {
      // Natural drag
      const decel = this.naturalDecel * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - decel);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + decel);
    }

    // Handbrake: rapidly reduce speed and increase grip-loss feel.
    if (handbrake) {
      const decel = this.brake * 0.7 * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - decel);
    }

    // ---- Steering ----
    this.targetSteer = steerInput * this.maxSteer;
    const steerSmooth = 1 - Math.pow(0.001, dt);
    this.steerAngle += (this.targetSteer - this.steerAngle) * steerSmooth;

    // Heading change: more responsive at higher speeds, but with a floor.
    const speedAbs = Math.abs(this.speed);
    const turnSpeedFactor = Math.min(1, speedAbs / 6); // no turning at standstill
    const turnDir = Math.sign(this.speed) || 1;
    this.heading -= this.steerAngle * this.turnGain * turnSpeedFactor * dt * turnDir;

    // ---- Lean (visual only) ----
    // Lean to inside of turn proportional to steer * speed.
    const targetLean = -this.steerAngle * Math.min(1, speedAbs / 12) * 0.7;
    this.lean += (targetLean - this.lean) * (1 - Math.pow(0.001, dt));

    // ---- Move ----
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const nextX = this.position.x + fwdX * this.speed * dt;
    const nextZ = this.position.z + fwdZ * this.speed * dt;

    // Collision: if next position hits an obstacle or NPC, slide along axis.
    let blocked = false;
    let npcHit = null;

    const checkBlock = (cx, cz) => {
      if (this.world.collide(cx, cz, 0.7)) return true;
      if (this.npcs) {
        const hit = this.npcs.collide(cx, cz, 0.7);
        if (hit) { npcHit = hit; return true; }
      }
      return false;
    };

    if (checkBlock(nextX, this.position.z)) {
      blocked = true;
    } else {
      this.position.x = nextX;
    }
    if (checkBlock(this.position.x, nextZ)) {
      blocked = true;
    } else {
      this.position.z = nextZ;
    }
    if (blocked) {
      // Bounce back / lose speed dramatically
      this.speed *= 0.35;
      // Push NPC out of the way so player isn't stuck
      if (npcHit && this.npcs) {
        this.npcs.nudge(npcHit, this.position.x, this.position.z);
      }
    }

    // Keep inside world bounds (soft wall).
    const half = this.world.halfSize - 4;
    if (this.position.x > half) { this.position.x = half; this.speed *= 0.5; }
    if (this.position.x < -half) { this.position.x = -half; this.speed *= 0.5; }
    if (this.position.z > half) { this.position.z = half; this.speed *= 0.5; }
    if (this.position.z < -half) { this.position.z = -half; this.speed *= 0.5; }

    // ---- Update visuals ----
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.heading, this.lean);

    // Wheels rotate based on speed
    const wheelSpin = this.speed * dt / 0.34; // r=0.34
    if (this.frontWheel) this.frontWheel.rotation.x -= wheelSpin;
    if (this.rearWheel) this.rearWheel.rotation.x -= wheelSpin;

    // Handlebar rotation
    if (this.handlebars) {
      this.handlebars.rotation.y = this.steerAngle;
    }
    // Front wheel steer visual: rotate the pivot, NOT the wheel itself,
    // so the spin axis stays clean and the wheel doesn't deform.
    if (this.frontSteer) {
      this.frontSteer.rotation.y = this.steerAngle;
    }

    // Rider lean (subtle counter to bike lean for stability illusion)
    if (this.rider) {
      this.rider.rotation.z = -this.lean * 0.15;
      this.rider.rotation.x = -0.05 - Math.min(0.2, speedAbs / 60);
    }

    // RPM for HUD/audio
    const targetRpm = Math.min(1, speedAbs / maxFwd) * (boostActive ? 1.0 : 0.85);
    this.engineRpm += (targetRpm - this.engineRpm) * 0.12;
    this.gear = Math.max(1, Math.min(6, Math.floor((speedAbs / maxFwd) * 6) + 1));
  }
}
