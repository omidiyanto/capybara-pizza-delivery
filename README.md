# 🛵 Capybara Pizza Delivery 🍕

A 3D open-world pizza delivery game where a chubby capybara rides a sport-bike around a procedurally generated city, picking up pies from the pizzeria and dropping them off at marked destinations before the clock runs out.

Built with **Three.js + Vite** as a fully end-to-end web app — no external assets, everything is procedurally generated meshes.

![game screenshot placeholder](./preview.png)

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

The `dist/` output is a self-contained static site you can host on any CDN (Netlify, Vercel, GitHub Pages, S3, etc.).

## How to play

| Action | Keys |
| --- | --- |
| Throttle | `W` or `↑` |
| Brake / reverse | `S` or `↓` |
| Steer | `A` `D` or `←` `→` |
| Hand-brake / drift | `Space` |
| Boost (limited) | `Shift` |
| Switch camera | `C` |
| Reset bike if stuck | `R` |
| Toggle big map | `M` |

You start outside the **pizzeria** (the red building with a glowing 🍕 sign). Drive into the orange light beam to pick up an order, then a blue beam appears at the customer location. Deliver before the timer runs out. Each delivery and pickup adds time to your shift; the shift ends when the timer hits zero.

## Architecture

```
src/
├── main.js          # Entry point; bootstraps the Game
├── game.js          # Scene, lighting, sky, animation loop, HUD glue
├── world.js         # Procedural city: roads, buildings, parks, perimeter
├── motorcycle.js    # Bike mesh + arcade physics + capybara rider
├── capybara.js      # Stylized capybara model assembled from primitives
├── camera.js        # Smooth chase camera with multiple modes
├── input.js         # Keyboard + mobile-friendly input layer
├── delivery.js      # Pizzeria + destination markers + delivery state
├── minimap.js       # 2D canvas minimap (small + big modes)
├── audio.js         # Procedural WebAudio engine sound + UI blips
├── style.css        # All UI / overlays / HUD styles
└── utils/math.js    # Tiny math helpers (lerp, damp, RNG, etc.)
```

### Design notes

- **No external assets** — every mesh is built from `BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, etc., so the entire game is one bundle.
- **Arcade vehicle model** — speed, throttle, steering, lean, and boost are tuned for fun, not realism.
- **Procedural city** is laid out on a grid with sidewalks, parks, lamp posts, and buildings of varied heights. A perimeter forest + low hills give a sense of horizon.
- **Sky** uses a custom 3-color gradient shader on an inverted sphere.
- **Audio** is synthesized at runtime using oscillators in WebAudio, so there are no audio files to ship.

## Browser support

Tested in modern Chromium, Firefox, and Safari. Requires WebGL2 and ES modules. Mobile works but a keyboard is recommended.
