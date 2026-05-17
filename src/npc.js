import * as THREE from 'three';

/**
 * NPC system: spawns and updates pedestrians (walking on sidewalks) and
 * traffic vehicles (driving on roads). Lightweight, no real AI - they
 * just follow road/sidewalk lanes and turn at intersections.
 */
export class NPCSystem {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.pedestrianCount = opts.pedestrianCount ?? 28;
    this.vehicleCount = opts.vehicleCount ?? 14;

    this.pedestrians = [];
    this.vehicles = [];

    this.group = new THREE.Group();
    this.group.name = 'NPCs';
    scene.add(this.group);

    this._spawnPedestrians();
    this._spawnVehicles();
  }

  // ----------------------------------------------------------- pedestrians
  _spawnPedestrians() {
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;
    const sidewalkOffset = this.world.roadWidth / 2 + 1.4; // walk on sidewalk

    const palette = [
      0xff6f3c, 0x66ddff, 0xffd97a, 0x9c4dff, 0x44cc88,
      0xff5577, 0x4488ff, 0xeeeeee, 0x222244, 0xff9944,
    ];

    for (let i = 0; i < this.pedestrianCount; i++) {
      const horizontal = Math.random() < 0.5;
      const lineIdx = Math.floor(Math.random() * (grid + 1));
      const linePos = -half + lineIdx * block;
      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const along = (Math.random() - 0.5) * grid * block * 0.9;

      const pos = horizontal
        ? { x: along, z: linePos + sideSign * sidewalkOffset }
        : { x: linePos + sideSign * sidewalkOffset, z: along };

      const dir = Math.random() < 0.5 ? 1 : -1;
      const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);

      const color = palette[Math.floor(Math.random() * palette.length)];
      const mesh = this._buildPedestrian(color);
      mesh.position.set(pos.x, 0, pos.z);
      mesh.rotation.y = heading;
      this.group.add(mesh);

      this.pedestrians.push({
        mesh,
        horizontal,
        line: linePos,
        sideSign,
        along,
        dir,
        speed: 0.9 + Math.random() * 0.6,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _buildPedestrian(color) {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.95 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    // legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.12, 0.28, 0);
    legL.castShadow = true;
    legL.name = 'legL';
    root.add(legL);
    const legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(0.12, 0.28, 0);
    legR.castShadow = true;
    legR.name = 'legR';
    root.add(legR);

    // shoes
    const shoeGeo = new THREE.BoxGeometry(0.22, 0.08, 0.28);
    const shoeL = new THREE.Mesh(shoeGeo, shoes);
    shoeL.position.set(-0.12, 0.04, 0.04);
    root.add(shoeL);
    const shoeR = new THREE.Mesh(shoeGeo, shoes);
    shoeR.position.set(0.12, 0.04, 0.04);
    root.add(shoeR);

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), shirt);
    torso.position.set(0, 0.85, 0);
    torso.castShadow = true;
    root.add(torso);

    // arms
    const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-0.27, 0.85, 0);
    armL.castShadow = true;
    armL.name = 'armL';
    root.add(armL);
    const armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set(0.27, 0.85, 0);
    armR.castShadow = true;
    armR.name = 'armR';
    root.add(armR);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skin);
    head.position.set(0, 1.32, 0);
    head.castShadow = true;
    root.add(head);

    // hair (random) - parented to head so position is local
    if (Math.random() < 0.7) {
      const hairColors = [0x222222, 0x6b3a18, 0xc8a45a, 0x442211, 0x111111];
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8),
        new THREE.MeshStandardMaterial({ color: hairColors[Math.floor(Math.random() * hairColors.length)], roughness: 1 })
      );
      hair.position.set(0, 0.03, 0);
      head.add(hair);
    }

    return root;
  }

  _updatePedestrians(dt) {
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;
    const limit = half - 2;

    for (const p of this.pedestrians) {
      p.along += p.speed * p.dir * dt;

      // Turn around at edges
      if (p.along > limit) { p.along = limit; p.dir = -1; p.mesh.rotation.y = p.horizontal ? -Math.PI / 2 : Math.PI; }
      if (p.along < -limit) { p.along = -limit; p.dir = 1; p.mesh.rotation.y = p.horizontal ? Math.PI / 2 : 0; }

      const x = p.horizontal ? p.along : p.line + p.sideSign * (this.world.roadWidth / 2 + 1.4);
      const z = p.horizontal ? p.line + p.sideSign * (this.world.roadWidth / 2 + 1.4) : p.along;
      p.mesh.position.x = x;
      p.mesh.position.z = z;

      // Walk animation: swing legs/arms
      p.bobPhase += dt * p.speed * 6;
      const swing = Math.sin(p.bobPhase) * 0.5;
      const legL = p.mesh.getObjectByName('legL');
      const legR = p.mesh.getObjectByName('legR');
      const armL = p.mesh.getObjectByName('armL');
      const armR = p.mesh.getObjectByName('armR');
      if (legL) legL.rotation.x = swing;
      if (legR) legR.rotation.x = -swing;
      if (armL) armL.rotation.x = -swing * 0.7;
      if (armR) armR.rotation.x = swing * 0.7;
      // tiny vertical bob
      p.mesh.position.y = Math.abs(Math.sin(p.bobPhase)) * 0.04;
    }
  }

  // ----------------------------------------------------------- vehicles
  _spawnVehicles() {
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;
    const laneOffset = this.world.roadWidth / 4; // right lane

    for (let i = 0; i < this.vehicleCount; i++) {
      const horizontal = Math.random() < 0.5;
      const lineIdx = Math.floor(Math.random() * (grid + 1));
      const linePos = -half + lineIdx * block;
      const dir = Math.random() < 0.5 ? 1 : -1;
      // Right-lane convention: drive on the right side of the road relative to direction
      // For horizontal road: dir>0 means +X, right-side lane is +Z (sideSign=+1) ... we'll just pick consistent based on dir.
      const sideSign = horizontal ? (dir > 0 ? 1 : -1) : (dir > 0 ? -1 : 1);
      const along = (Math.random() - 0.5) * grid * block * 0.9;

      const isMotorbike = Math.random() < 0.3;
      const mesh = isMotorbike ? this._buildMotorbike() : this._buildCar();
      const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);

      const x = horizontal ? along : linePos + sideSign * laneOffset;
      const z = horizontal ? linePos + sideSign * laneOffset : along;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      this.group.add(mesh);

      this.vehicles.push({
        mesh,
        horizontal,
        line: linePos,
        sideSign,
        along,
        dir,
        speed: isMotorbike ? 7 + Math.random() * 4 : 5 + Math.random() * 4,
        laneOffset,
        isMotorbike,
        wheels: mesh.userData.wheels || [],
      });
    }
  }

  _buildCar() {
    const root = new THREE.Group();
    const colors = [0xc8221a, 0x2266dd, 0x44aa66, 0xeeeeee, 0x222222, 0xffaa22, 0x884466, 0x5566aa];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.8 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe8a0, emissiveIntensity: 0.8 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.6 });

    // chassis
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 4.0), bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    // cabin (slightly shorter, on top, towards rear)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.0), bodyMat);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    root.add(cabin);

    // front + rear windshield
    const wsFront = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 0.05), glassMat);
    wsFront.position.set(0, 1.15, 0.8);
    wsFront.rotation.x = 0.15;
    root.add(wsFront);
    const wsBack = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 0.05), glassMat);
    wsBack.position.set(0, 1.15, -1.2);
    wsBack.rotation.x = -0.15;
    root.add(wsBack);

    // headlights
    for (const sx of [-0.55, 0.55]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), lightMat);
      hl.position.set(sx, 0.7, 2.0);
      root.add(hl);
    }
    // tail lights
    for (const sx of [-0.55, 0.55]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), tailMat);
      tl.position.set(sx, 0.7, -2.0);
      root.add(tl);
    }

    // wheels (4)
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 14);
    const wheelOffsets = [
      [-0.85, 0.34,  1.25],
      [ 0.85, 0.34,  1.25],
      [-0.85, 0.34, -1.25],
      [ 0.85, 0.34, -1.25],
    ];
    const wheels = [];
    for (const [x, y, z] of wheelOffsets) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      w.castShadow = true;
      root.add(w);
      wheels.push(w);
    }
    root.userData.wheels = wheels;
    return root;
  }

  _buildMotorbike() {
    const root = new THREE.Group();
    const colors = [0x222222, 0xff6f3c, 0x3380ff, 0xc8221a, 0xffd97a];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.9 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.4 });

    // tank/frame
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 1.0), bodyMat);
    tank.position.set(0, 0.78, 0);
    tank.castShadow = true;
    root.add(tank);

    // engine
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.55), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    engine.position.set(0, 0.45, -0.05);
    root.add(engine);

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12);
    const wF = new THREE.Mesh(wheelGeo, tireMat);
    wF.rotation.z = Math.PI / 2;
    wF.position.set(0, 0.34, 0.85);
    wF.castShadow = true;
    root.add(wF);
    const wR = new THREE.Mesh(wheelGeo, tireMat);
    wR.rotation.z = Math.PI / 2;
    wR.position.set(0, 0.34, -0.95);
    wR.castShadow = true;
    root.add(wR);

    // simple rider
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.28), new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.85 }));
    torso.position.set(0, 1.35, -0.1);
    torso.rotation.x = -0.2;
    torso.castShadow = true;
    root.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), helmet);
    head.position.set(0, 1.78, 0.05);
    head.castShadow = true;
    root.add(head);

    root.userData.wheels = [wF, wR];
    return root;
  }

  _updateVehicles(dt) {
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;
    const limit = half - 4;

    for (const v of this.vehicles) {
      v.along += v.speed * v.dir * dt;

      // Wrap around end of road (so traffic feels continuous)
      if (v.along > limit) v.along = -limit;
      if (v.along < -limit) v.along = limit;

      const x = v.horizontal ? v.along : v.line + v.sideSign * v.laneOffset;
      const z = v.horizontal ? v.line + v.sideSign * v.laneOffset : v.along;
      v.mesh.position.x = x;
      v.mesh.position.z = z;

      // Spin wheels
      const spin = (v.speed * dt) / 0.34;
      for (const w of v.wheels) {
        w.rotation.x -= spin;
      }
    }
  }

  update(dt) {
    this._updatePedestrians(dt);
    this._updateVehicles(dt);
  }

  /**
   * Returns the first NPC whose circular collider intersects (x,z) within
   * the given player radius, or null. Vehicles get a slightly larger radius
   * than pedestrians.
   */
  collide(x, z, playerRadius = 0.7) {
    // Pedestrians: ~0.4m radius
    for (const p of this.pedestrians) {
      const dx = x - p.mesh.position.x;
      const dz = z - p.mesh.position.z;
      const r = playerRadius + 0.4;
      if (dx * dx + dz * dz < r * r) return { kind: 'pedestrian', target: p };
    }
    // Vehicles: motorbike ~0.7m, car ~1.4m
    for (const v of this.vehicles) {
      const dx = x - v.mesh.position.x;
      const dz = z - v.mesh.position.z;
      const vr = v.isMotorbike ? 0.7 : 1.4;
      const r = playerRadius + vr;
      if (dx * dx + dz * dz < r * r) return { kind: v.isMotorbike ? 'motorbike' : 'car', target: v };
    }
    return null;
  }

  /** Knock an NPC slightly out of the way after a soft hit so the player isn't stuck. */
  nudge(npcHit, fromX, fromZ) {
    if (!npcHit) return;
    const t = npcHit.target;
    const dx = t.mesh.position.x - fromX;
    const dz = t.mesh.position.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const push = 0.6;
    t.mesh.position.x += (dx / len) * push;
    t.mesh.position.z += (dz / len) * push;
    if (npcHit.kind === 'pedestrian') {
      // Reverse pedestrian direction so they walk away
      t.dir = -t.dir;
    }
  }
}
