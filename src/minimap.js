/**
 * Renders a top-down minimap onto a canvas element using the world's
 * road grid + obstacles + player + destination markers.
 *
 * Two render modes:
 *   - small (round HUD): zoomed in, rotated to align with player's heading
 *   - big (full overlay): static top-down whole world
 */
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.size = 180;
    this._setupSize();
  }

  _setupSize() {
    const dpr = window.devicePixelRatio || 1;
    const cssSize = this.canvas.clientWidth || this.size;
    this.canvas.width = cssSize * dpr;
    this.canvas.height = cssSize * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this._cssSize = cssSize;
  }

  /** Render small round minimap. */
  drawSmall(player, destination, pizzeria) {
    if (this.canvas.clientWidth !== this._cssSize) this._setupSize();
    const ctx = this.ctx;
    const size = this._cssSize;
    const cx = size / 2, cy = size / 2;
    // World units shown on map (radius)
    const viewRadius = 100;

    // Round clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = '#0a1230';
    ctx.fillRect(0, 0, size, size);

    // Translate so player is at center; rotate so player's heading is up.
    ctx.translate(cx, cy);
    ctx.rotate(-player.heading); // bike +Z is forward; canvas Y down means rotation flips.

    const scale = (size / 2) / viewRadius;

    // Roads
    ctx.strokeStyle = '#3a455e';
    ctx.lineWidth = 4;
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;

    for (let i = 0; i <= grid; i++) {
      const lp = -half + i * block;
      // Horizontal (along X)
      ctx.beginPath();
      ctx.moveTo((-half - player.position.x) * scale, (lp - player.position.z) * scale);
      ctx.lineTo((half - player.position.x) * scale, (lp - player.position.z) * scale);
      ctx.stroke();
      // Vertical (along Z)
      ctx.beginPath();
      ctx.moveTo((lp - player.position.x) * scale, (-half - player.position.z) * scale);
      ctx.lineTo((lp - player.position.x) * scale, (half - player.position.z) * scale);
      ctx.stroke();
    }

    // Buildings (light rectangles)
    ctx.fillStyle = 'rgba(180, 190, 220, 0.18)';
    for (const o of this.world.obstacles) {
      if (o.kind !== 'building') continue;
      const w = (o.maxX - o.minX) * scale;
      const h = (o.maxZ - o.minZ) * scale;
      const x = ((o.minX + o.maxX) / 2 - player.position.x) * scale - w / 2;
      const z = ((o.minZ + o.maxZ) / 2 - player.position.z) * scale - h / 2;
      ctx.fillRect(x, z, w, h);
    }

    // Pizzeria marker
    if (pizzeria) {
      this._drawIcon(ctx, pizzeria.x - player.position.x, pizzeria.z - player.position.z, scale, '#ffb37b', '🍕');
    }

    // Destination marker
    if (destination) {
      this._drawIcon(ctx, destination.x - player.position.x, destination.z - player.position.z, scale, '#66ddff', '◆');
      // Arrow pointing toward destination from player if outside view
      const dx = (destination.x - player.position.x) * scale;
      const dz = (destination.z - player.position.z) * scale;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > size / 2 - 6) {
        const ang = Math.atan2(dx, dz);
        const r = size / 2 - 12;
        const ax = Math.sin(ang) * r;
        const az = Math.cos(ang) * r;
        ctx.fillStyle = '#66ddff';
        ctx.beginPath();
        ctx.moveTo(ax, az);
        ctx.lineTo(ax - Math.sin(ang + 2.6) * 6, az - Math.cos(ang + 2.6) * 6);
        ctx.lineTo(ax - Math.sin(ang - 2.6) * 6, az - Math.cos(ang - 2.6) * 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Player triangle (always pointing up)
    ctx.rotate(player.heading); // unrotate to draw player in screen space
    ctx.fillStyle = '#ffaa55';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 6);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawIcon(ctx, dx, dz, scale, color, glyph) {
    const x = dx * scale;
    const z = dz * scale;
    ctx.save();
    ctx.translate(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** Big static top-down map render (not rotated). */
  drawBig(canvas, player, destination, pizzeria) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.clientWidth || 600;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const size = cssSize;
    const worldSize = this.world.size + 40;
    const scale = size / worldSize;
    const offX = size / 2;
    const offZ = size / 2;

    ctx.fillStyle = '#0a1230';
    ctx.fillRect(0, 0, size, size);

    // Buildings as filled rects
    ctx.fillStyle = 'rgba(180, 190, 220, 0.30)';
    for (const o of this.world.obstacles) {
      if (o.kind !== 'building') continue;
      const x = offX + o.minX * scale;
      const z = offZ + o.minZ * scale;
      const w = (o.maxX - o.minX) * scale;
      const h = (o.maxZ - o.minZ) * scale;
      ctx.fillRect(x, z, w, h);
    }

    // Roads
    ctx.strokeStyle = '#4d597a';
    ctx.lineWidth = Math.max(2, this.world.roadWidth * scale);
    const grid = this.world.gridSize;
    const block = this.world.blockSize;
    const half = (grid * block) / 2;
    for (let i = 0; i <= grid; i++) {
      const lp = -half + i * block;
      ctx.beginPath();
      ctx.moveTo(offX + -half * scale, offZ + lp * scale);
      ctx.lineTo(offX + half * scale, offZ + lp * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offX + lp * scale, offZ + -half * scale);
      ctx.lineTo(offX + lp * scale, offZ + half * scale);
      ctx.stroke();
    }

    // Pizzeria
    if (pizzeria) {
      ctx.fillStyle = '#ffb37b';
      ctx.beginPath();
      ctx.arc(offX + pizzeria.x * scale, offZ + pizzeria.z * scale, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = '12px sans-serif';
      ctx.fillText('🍕', offX + pizzeria.x * scale - 6, offZ + pizzeria.z * scale + 4);
    }

    // Destination
    if (destination) {
      ctx.fillStyle = '#66ddff';
      ctx.beginPath();
      ctx.arc(offX + destination.x * scale, offZ + destination.z * scale, 8, 0, Math.PI * 2);
      ctx.fill();

      // Line from player to destination
      ctx.strokeStyle = 'rgba(102, 221, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(offX + player.position.x * scale, offZ + player.position.z * scale);
      ctx.lineTo(offX + destination.x * scale, offZ + destination.z * scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Player triangle
    ctx.save();
    ctx.translate(offX + player.position.x * scale, offZ + player.position.z * scale);
    ctx.rotate(-player.heading);
    ctx.fillStyle = '#ffaa55';
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(-7, 8); ctx.lineTo(7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
}
