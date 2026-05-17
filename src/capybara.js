import * as THREE from 'three';

/**
 * Builds a stylized capybara out of grouped primitives.
 * Returns a THREE.Group rooted at the capybara's hip.
 *
 * The group is sized so the capybara is ~0.55m tall when sitting upright
 * (matching a realistic-ish capybara). It's posed leaning forward to "ride".
 */
export function createCapybara() {
  const root = new THREE.Group();
  root.name = 'Capybara';

  const furColor = 0x6f4c2c;
  const furDark = 0x4f3318;
  const noseColor = 0x2a1a0e;
  const eyeColor = 0x111111;

  const furMat = new THREE.MeshStandardMaterial({
    color: furColor, roughness: 0.95, metalness: 0,
  });
  const furDarkMat = new THREE.MeshStandardMaterial({
    color: furDark, roughness: 1, metalness: 0,
  });
  const noseMat = new THREE.MeshStandardMaterial({ color: noseColor, roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.5 });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xfff7d6, roughness: 0.4 });

  // Body: a stretched rounded box (using a sphere stretched).
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 14),
    furMat
  );
  body.scale.set(1.0, 0.85, 1.6);
  body.position.set(0, 0, 0);
  body.castShadow = true;
  root.add(body);

  // Belly (lighter)
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9e7148, roughness: 1 })
  );
  belly.scale.set(0.9, 0.6, 1.4);
  belly.position.set(0, -0.18, 0);
  root.add(belly);

  // Head group (front of body, up). Will animate independently if needed.
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.55);
  root.add(head);

  // Head main shape: rounded box-ish
  const headMain = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    furMat
  );
  headMain.scale.set(1.0, 0.8, 1.1);
  headMain.castShadow = true;
  head.add(headMain);

  // Snout
  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 10),
    furDarkMat
  );
  snout.scale.set(0.9, 0.7, 1.0);
  snout.position.set(0, -0.05, 0.22);
  snout.castShadow = true;
  head.add(snout);

  // Nose
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    noseMat
  );
  nose.position.set(0, 0.0, 0.36);
  head.add(nose);

  // Two front teeth
  for (const sx of [-0.04, 0.04]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), teethMat);
    tooth.position.set(sx, -0.09, 0.34);
    head.add(tooth);
  }

  // Eyes
  for (const sx of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
    eye.position.set(sx, 0.06, 0.21);
    head.add(eye);
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    shine.position.set(sx + 0.012, 0.072, 0.235);
    head.add(shine);
  }

  // Ears (small)
  for (const sx of [-0.18, 0.18]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      furMat
    );
    ear.scale.set(0.6, 0.4, 0.5);
    ear.position.set(sx, 0.18, 0.05);
    head.add(ear);
  }

  // Legs (4 stubby cylinders) - tucked under for riding pose.
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.28, 8);
  const legPositions = [
    [-0.20, -0.32, 0.40],
    [ 0.20, -0.32, 0.40],
    [-0.22, -0.32, -0.42],
    [ 0.22, -0.32, -0.42],
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, furDarkMat);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    root.add(leg);
  }

  // Tiny rump tail nub
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    furDarkMat
  );
  tail.position.set(0, 0.05, -0.65);
  root.add(tail);

  // A little helmet (orange) with goggles strap
  const helmet = new THREE.Group();
  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.7),
    new THREE.MeshStandardMaterial({ color: 0xff6f3c, roughness: 0.5, metalness: 0.1 })
  );
  helmetShell.scale.set(1, 0.85, 1.05);
  helmetShell.castShadow = true;
  helmet.add(helmetShell);

  // visor strip
  const visor = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.025, 8, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.2 })
  );
  visor.rotation.x = Math.PI / 2;
  visor.rotation.z = Math.PI;
  visor.position.set(0, 0.05, 0.05);
  helmet.add(visor);

  helmet.position.set(0, 0.20, 0);
  head.add(helmet);

  // Lean the whole capybara forward slightly (riding pose).
  root.rotation.x = -0.05;

  return root;
}
