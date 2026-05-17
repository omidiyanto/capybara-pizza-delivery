import * as THREE from 'three';
import { makeRNG, randRange, pickRandom } from './utils/math.js';

/**
 * Procedurally generates a small open-world city:
 *   - a flat ground plane with a grid of road segments
 *   - blocks filled with buildings of varied heights
 *   - parks with trees, lamp posts, and props
 *   - a perimeter forest beyond the city for "horizon"
 *
 * The world is laid out on a grid in the XZ plane (Y is up).
 */
export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.gridSize = opts.gridSize ?? 8;          // city is 8x8 blocks
    this.blockSize = opts.blockSize ?? 60;       // each block ~60m
    this.roadWidth = opts.roadWidth ?? 12;
    this.seed = opts.seed ?? 1337;
    this.rng = makeRNG(this.seed);

    /** All collidable obstacle bounding boxes (axis-aligned in XZ). */
    this.obstacles = [];
    /** Road network info for navigation. */
    this.roadCenters = []; // intersections {x, z}
    this.blocks = [];      // each block center {x, z, hasPark}
    /** Total world size, in meters. */
    this.size = (this.gridSize + 1) * this.blockSize;
    this.halfSize = this.size / 2;

    this.group = new THREE.Group();
    this.group.name = 'World';
    scene.add(this.group);
  }

  build() {
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildPerimeterForest();
    this._buildSkySprites();
  }

  // -------------------------------------------------------- ground
  _buildGround() {
    // Big flat ground plane (sandy/grass).
    const size = this.size * 4;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f6b3a,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.position.y = -0.01;
    this.group.add(mesh);

    // City "concrete" base under road grid (slight color contrast).
    const cityGeo = new THREE.PlaneGeometry(this.size, this.size);
    const cityMat = new THREE.MeshStandardMaterial({
      color: 0x6b6f72, roughness: 0.9, metalness: 0,
    });
    const city = new THREE.Mesh(cityGeo, cityMat);
    city.rotation.x = -Math.PI / 2;
    city.position.y = 0;
    city.receiveShadow = true;
    this.group.add(city);
  }

  // -------------------------------------------------------- roads
  _buildRoads() {
    // Roads run along grid lines. Block-spacing is blockSize.
    // We draw asphalt strips with lane markings.
    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e, roughness: 0.95, metalness: 0,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xfff2c8, emissive: 0x111100, roughness: 0.6,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0xa9a9ad, roughness: 0.85,
    });

    const grid = this.gridSize;
    const block = this.blockSize;
    const half = (grid * block) / 2;
    const rw = this.roadWidth;
    const swH = 0.18; // sidewalk height
    const sidewalkExtra = 2.5; // sidewalk width on each side

    // Horizontal roads (along X) at z = -half + i*block
    for (let i = 0; i <= grid; i++) {
      const z = -half + i * block;

      // Asphalt
      const road = new THREE.Mesh(new THREE.PlaneGeometry(grid * block, rw), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, z);
      road.receiveShadow = true;
      this.group.add(road);

      // Center stripe (dashed-ish). We'll just use repeated blocks.
      const dashLen = 3;
      const gap = 3;
      const total = grid * block;
      for (let x = -total / 2 + 1; x < total / 2; x += dashLen + gap) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(dashLen, 0.3), stripeMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x + dashLen / 2, 0.03, z);
        this.group.add(dash);
      }

      // Sidewalks (two strips beside the road)
      for (const sign of [-1, 1]) {
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(grid * block, swH, sidewalkExtra),
          sidewalkMat
        );
        sw.position.set(0, swH / 2, z + sign * (rw / 2 + sidewalkExtra / 2));
        sw.receiveShadow = true;
        sw.castShadow = false;
        this.group.add(sw);
      }
    }

    // Vertical roads (along Z) at x = -half + i*block
    for (let i = 0; i <= grid; i++) {
      const x = -half + i * block;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(rw, grid * block), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, 0);
      road.receiveShadow = true;
      this.group.add(road);

      const dashLen = 3, gap = 3;
      const total = grid * block;
      for (let z = -total / 2 + 1; z < total / 2; z += dashLen + gap) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, dashLen), stripeMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.03, z + dashLen / 2);
        this.group.add(dash);
      }

      for (const sign of [-1, 1]) {
        const sw = new THREE.Mesh(
          new THREE.BoxGeometry(sidewalkExtra, swH, grid * block),
          sidewalkMat
        );
        sw.position.set(x + sign * (rw / 2 + sidewalkExtra / 2), swH / 2, 0);
        sw.receiveShadow = true;
        this.group.add(sw);
      }
    }

    // Track intersections for navigation / map.
    for (let ix = 0; ix <= grid; ix++) {
      for (let iz = 0; iz <= grid; iz++) {
        this.roadCenters.push({
          x: -half + ix * block,
          z: -half + iz * block,
        });
      }
    }
  }

  // -------------------------------------------------------- blocks (buildings, parks)
  _buildBlocks() {
    const grid = this.gridSize;
    const block = this.blockSize;
    const half = (grid * block) / 2;
    const sidewalkExtra = 2.5;
    const margin = this.roadWidth / 2 + sidewalkExtra;

    // Pre-build a few reusable building materials for performance/style.
    const buildingPalettes = [
      [0xc6a988, 0x8b7355, 0xd6b598],
      [0xb0b8c3, 0x4a5160, 0x7a8290],
      [0xe0c9a6, 0xc89e6b, 0xa6804d],
      [0x9aa9c6, 0x35455e, 0x6c7a96],
      [0xc89c8a, 0x8c5f51, 0xb88273],
    ];
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xfff7c8, emissive: 0x553f10, emissiveIntensity: 0.85,
      roughness: 0.4, metalness: 0.2,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.85 });

    for (let ix = 0; ix < grid; ix++) {
      for (let iz = 0; iz < grid; iz++) {
        const cx = -half + ix * block + block / 2;
        const cz = -half + iz * block + block / 2;
        const innerSize = block - margin * 2;

        // ~18% chance to make this block a park.
        const isPark = this.rng() < 0.18;
        this.blocks.push({ x: cx, z: cz, isPark, ix, iz });

        if (isPark) {
          this._buildPark(cx, cz, innerSize);
        } else {
          this._buildBuildingsBlock(cx, cz, innerSize, buildingPalettes, windowMat, roofMat);
        }
      }
    }

    // Add lamp posts at intersections
    this._buildLampPosts();
  }

  _buildPark(cx, cz, innerSize) {
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6f3a, roughness: 1 });
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(innerSize, 0.2, innerSize),
      grassMat
    );
    grass.position.set(cx, 0.1, cz);
    grass.receiveShadow = true;
    this.group.add(grass);

    const treeCount = 4 + Math.floor(this.rng() * 6);
    for (let i = 0; i < treeCount; i++) {
      const x = cx + (this.rng() - 0.5) * (innerSize - 4);
      const z = cz + (this.rng() - 0.5) * (innerSize - 4);
      this._addTree(x, z);
    }

    // Maybe a fountain
    if (this.rng() < 0.5) {
      this._addFountain(cx, cz);
    }
  }

  _buildBuildingsBlock(cx, cz, innerSize, palettes, windowMat, roofMat) {
    // Place 1-4 buildings inside the inner square, treated as sub-grid.
    const palette = pickRandom(palettes);
    const subdivisions = 1 + Math.floor(this.rng() * 3); // 1, 2, or 3 per axis
    const cellSize = innerSize / subdivisions;
    const sub = subdivisions;

    // Track "footprint" coverage so buildings don't overlap.
    for (let sx = 0; sx < sub; sx++) {
      for (let sz = 0; sz < sub; sz++) {
        if (this.rng() < 0.15) continue; // empty lot
        const w = cellSize * (0.55 + this.rng() * 0.4);
        const d = cellSize * (0.55 + this.rng() * 0.4);
        const h = 6 + this.rng() * 28; // 6..34m height
        const x = cx - innerSize / 2 + (sx + 0.5) * cellSize + (this.rng() - 0.5) * (cellSize - w) * 0.4;
        const z = cz - innerSize / 2 + (sz + 0.5) * cellSize + (this.rng() - 0.5) * (cellSize - d) * 0.4;

        this._addBuilding(x, z, w, d, h, palette, windowMat, roofMat);
      }
    }
  }

  _addBuilding(x, z, w, d, h, palette, windowMat, roofMat) {
    const baseColor = palette[Math.floor(this.rng() * palette.length)];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.9,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.set(x, h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Window strip rows (faked as glowing planes on each face).
    const winRows = Math.max(2, Math.floor(h / 3.2));
    const winColsW = Math.max(2, Math.floor(w / 2.6));
    const winColsD = Math.max(2, Math.floor(d / 2.6));

    // Front + Back face windows (Z faces)
    {
      const stripGeo = new THREE.PlaneGeometry(w * 0.85, 0.55);
      for (let i = 0; i < winRows; i++) {
        const y = (i + 0.5) * (h / winRows);
        if (y > h - 0.6) continue;
        for (const sign of [-1, 1]) {
          const win = new THREE.Mesh(stripGeo, windowMat);
          win.position.set(x, y, z + sign * (d / 2 + 0.01));
          if (sign < 0) win.rotation.y = Math.PI;
          this.group.add(win);
        }
      }
      // Left + Right face windows (X faces)
      const stripGeoX = new THREE.PlaneGeometry(d * 0.85, 0.55);
      for (let i = 0; i < winRows; i++) {
        const y = (i + 0.5) * (h / winRows);
        if (y > h - 0.6) continue;
        for (const sign of [-1, 1]) {
          const win = new THREE.Mesh(stripGeoX, windowMat);
          win.position.set(x + sign * (w / 2 + 0.01), y, z);
          win.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
          this.group.add(win);
        }
      }
    }

    // Roof "rim"
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.02, 0.5, d * 1.02),
      roofMat
    );
    roof.position.set(x, h + 0.25, z);
    roof.castShadow = true;
    this.group.add(roof);

    // Maybe an antenna or AC unit
    if (this.rng() < 0.5) {
      const unit = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.6, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xb0b0b0 })
      );
      unit.position.set(
        x + (this.rng() - 0.5) * (w - 2),
        h + 0.6,
        z + (this.rng() - 0.5) * (d - 2)
      );
      unit.castShadow = true;
      this.group.add(unit);
    }

    // Register collision footprint
    this.obstacles.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      kind: 'building',
    });
  }

  _addTree(x, z) {
    // Trunk
    const trunkH = 1.5 + this.rng() * 1.2;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, trunkH, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 })
    );
    trunk.position.set(x, trunkH / 2, z);
    trunk.castShadow = true;
    this.group.add(trunk);

    // Foliage: 1-3 stacked spheres
    const layers = 1 + Math.floor(this.rng() * 3);
    const colors = [0x3f7a3a, 0x4f8a4a, 0x59a04a];
    for (let i = 0; i < layers; i++) {
      const r = 1.2 + this.rng() * 0.8 - i * 0.2;
      const foli = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 0),
        new THREE.MeshStandardMaterial({ color: pickRandom(colors), flatShading: true, roughness: 1 })
      );
      foli.position.set(x, trunkH + r * 0.6 + i * r * 0.6, z);
      foli.castShadow = true;
      this.group.add(foli);
    }

    this.obstacles.push({
      minX: x - 0.6, maxX: x + 0.6,
      minZ: z - 0.6, maxZ: z + 0.6,
      kind: 'tree',
    });
  }

  _addFountain(cx, cz) {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xb8b8be, roughness: 0.9 })
    );
    ring.position.set(cx, 0.4, cz);
    ring.castShadow = true;
    ring.receiveShadow = true;
    this.group.add(ring);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x6cc6ff, transparent: true, opacity: 0.85, metalness: 0.2 })
    );
    water.position.set(cx, 0.65, cz);
    this.group.add(water);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    stem.position.set(cx, 1.3, cz);
    this.group.add(stem);

    this.obstacles.push({
      minX: cx - 2.2, maxX: cx + 2.2,
      minZ: cz - 2.2, maxZ: cz + 2.2,
      kind: 'fountain',
    });
  }

  _buildLampPosts() {
    const grid = this.gridSize;
    const block = this.blockSize;
    const half = (grid * block) / 2;
    const inset = this.roadWidth / 2 + 3;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0, emissive: 0xffaa55, emissiveIntensity: 1.0,
    });

    for (let ix = 0; ix <= grid; ix++) {
      for (let iz = 0; iz <= grid; iz++) {
        const cx = -half + ix * block;
        const cz = -half + iz * block;
        // skip outside corners every other intersection
        if ((ix + iz) % 2 !== 0) continue;

        for (const [dx, dz] of [[inset, inset], [-inset, -inset]]) {
          const px = cx + dx;
          const pz = cz + dz;
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.12, 5, 6),
            poleMat
          );
          pole.position.set(px, 2.5, pz);
          pole.castShadow = true;
          this.group.add(pole);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 10, 8),
            headMat
          );
          head.position.set(px, 5, pz);
          this.group.add(head);
        }
      }
    }
  }

  // -------------------------------------------------------- environment
  _buildPerimeterForest() {
    // Trees scattered well outside the city for a horizon feel.
    const r = makeRNG(this.seed + 99);
    const count = 280;
    for (let i = 0; i < count; i++) {
      let x, z;
      // Place in an annular area.
      const ang = r() * Math.PI * 2;
      const radius = this.halfSize + 30 + r() * 350;
      x = Math.cos(ang) * radius;
      z = Math.sin(ang) * radius;
      this._addTree(x, z);
    }

    // Distant low hills via cones for parallax silhouette
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2c4030, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const ang = r() * Math.PI * 2;
      const radius = this.halfSize + 250 + r() * 300;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const h = 30 + r() * 80;
      const w = 60 + r() * 120;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(w, h, 8), hillMat);
      hill.position.set(x, h / 2, z);
      this.group.add(hill);
    }
  }

  _buildSkySprites() {
    // A few clouds (flat slabs) for a touch of depth high up.
    const r = makeRNG(this.seed + 55);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false,
    });
    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(60 + r() * 80, 16 + r() * 18),
        cloudMat
      );
      cloud.position.set((r() - 0.5) * 1200, 90 + r() * 40, (r() - 0.5) * 1200);
      cloud.rotation.x = -Math.PI / 2;
      this.group.add(cloud);
    }
  }

  // -------------------------------------------------------- collision query
  /**
   * Returns the obstacle the (x, z) point is colliding with, or null.
   * Uses simple AABB tests with a small radius for circular colliders.
   */
  collide(x, z, radius = 0.6) {
    for (const o of this.obstacles) {
      if (
        x + radius > o.minX &&
        x - radius < o.maxX &&
        z + radius > o.minZ &&
        z - radius < o.maxZ
      ) {
        return o;
      }
    }
    return null;
  }

  /** Snap a position to the nearest road centerline (for spawning destinations). */
  snapToNearestRoad(x, z) {
    // Find nearest grid line for x and for z; whichever distance is smaller wins.
    const block = this.blockSize;
    const half = (this.gridSize * block) / 2;
    const lines = [];
    for (let i = 0; i <= this.gridSize; i++) lines.push(-half + i * block);

    let bestX = lines[0];
    for (const l of lines) if (Math.abs(l - x) < Math.abs(bestX - x)) bestX = l;
    let bestZ = lines[0];
    for (const l of lines) if (Math.abs(l - z) < Math.abs(bestZ - z)) bestZ = l;

    if (Math.abs(bestX - x) < Math.abs(bestZ - z)) {
      return { x: bestX, z };
    }
    return { x, z: bestZ };
  }

  /** Pick a random point on a road far from `from`. */
  randomRoadPoint(from = null, minDist = 80) {
    for (let attempts = 0; attempts < 20; attempts++) {
      const p = this.roadCenters[Math.floor(Math.random() * this.roadCenters.length)];
      // Offset along one axis to be on a road edge, not exact intersection.
      const block = this.blockSize;
      const half = (this.gridSize * block) / 2;
      const ox = (Math.random() - 0.5) * (block - this.roadWidth);
      const oz = (Math.random() - 0.5) * (block - this.roadWidth);
      const horizontal = Math.random() < 0.5;
      const candidate = {
        x: p.x + (horizontal ? ox : 0),
        z: p.z + (horizontal ? 0 : oz),
      };
      if (Math.abs(candidate.x) > half - 4 || Math.abs(candidate.z) > half - 4) continue;
      if (from) {
        const dx = candidate.x - from.x;
        const dz = candidate.z - from.z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) continue;
      }
      return candidate;
    }
    return { x: 0, z: 0 };
  }
}
