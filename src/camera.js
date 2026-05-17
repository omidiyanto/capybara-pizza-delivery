import * as THREE from 'three';
import { damp, dampAngle } from './utils/math.js';

/**
 * Smooth chase camera that follows a target with springy positioning.
 * Supports two modes: "chase" (default behind) and "hood" (close third-person).
 */
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.modes = ['chase', 'far', 'hood'];
    this.modeIndex = 0;

    // current smoothed values
    this._pos = new THREE.Vector3(0, 5, -10);
    this._look = new THREE.Vector3();
    this._heading = 0;

    this._tmp = new THREE.Vector3();
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
  }

  get mode() { return this.modes[this.modeIndex]; }

  config() {
    switch (this.mode) {
      case 'chase':
        return { dist: 6.5, height: 3.0, lookAhead: 4, smoothing: 0.18, headingSmooth: 0.15 };
      case 'far':
        return { dist: 10, height: 5.0, lookAhead: 6, smoothing: 0.25, headingSmooth: 0.22 };
      case 'hood':
        return { dist: 2.5, height: 2.0, lookAhead: 8, smoothing: 0.10, headingSmooth: 0.05 };
    }
  }

  update(target, heading, speed, dt) {
    const { dist, height, lookAhead, smoothing, headingSmooth } = this.config();

    // Smooth the target heading so the camera doesn't snap when bike yaws.
    this._heading = dampAngle(this._heading, heading, headingSmooth, dt);

    const fwdX = Math.sin(this._heading);
    const fwdZ = Math.cos(this._heading);
    // Pull camera back further at high speed (FOV-ish dolly).
    const speedFactor = Math.min(1, Math.abs(speed) / 22);
    const dynDist = dist + speedFactor * 1.2;
    const desiredX = target.x - fwdX * dynDist;
    const desiredZ = target.z - fwdZ * dynDist;
    const desiredY = target.y + height;

    this._pos.x = damp(this._pos.x, desiredX, smoothing, dt);
    this._pos.y = damp(this._pos.y, desiredY, smoothing, dt);
    this._pos.z = damp(this._pos.z, desiredZ, smoothing, dt);

    const lookX = target.x + fwdX * lookAhead;
    const lookZ = target.z + fwdZ * lookAhead;
    const lookY = target.y + 1.0;
    this._look.x = damp(this._look.x, lookX, smoothing * 0.6, dt);
    this._look.y = damp(this._look.y, lookY, smoothing * 0.6, dt);
    this._look.z = damp(this._look.z, lookZ, smoothing * 0.6, dt);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);

    // Slight FOV pulse on boost / speed.
    const targetFov = 65 + speedFactor * 10;
    this.camera.fov = damp(this.camera.fov, targetFov, 0.35, dt);
    this.camera.updateProjectionMatrix();
  }
}
