# Path Planning Studio

Advanced autonomous racing trajectory planner with cone-based tracks, RRT* + QP racing line optimisation, and real-time telemetry in a 3D scene.

This repo contains a standalone front-end built with React, TypeScript and Vite. It is designed for Formula Student / autonomous racing experiments, but can be reused for any cone-based track.

---

## Features

- **Cone-based track editor**
  - Import track layouts from CSV (blue / yellow / orange cones).
  - Edit cones directly in the 3D view (drag, move, re-shape the circuit).
  - Start / finish and car start cones supported.

- **3D visualisation**
  - `@react-three/fiber` + `three.js` rendering.
  - Multiple camera modes: orbit, chase, cockpit, helicopter.
  - Day / night toggle and simple world environment.

- **Trajectory generation**
  - Centerline generation from blue / yellow cones with dynamic track width.
  - Conversion to a dense path (`PathPoint[]`) with curvature and arc-length.
  - Real-time update of the path when cones are edited.

- **Racing line optimisation (offline)**
  Optimisers are implemented in `services/mathUtils.ts` and selectable from the UI:
  - `Laplacian`: smooths the centerline with a simple Laplacian filter.
  - `RRT` (RRT* shortcutting): stochastic search for shorter, valid shortcuts along the track.
  - `QP` (biharmonic smoothing / minimum curvature): minimises curvature while staying inside the track.
  - `Hybrid`: blends QP with Laplacian for a compromise between curvature and distance.
  - `RRT_QP`: pipeline RRT* + QP (first shortcut, then smooth the result).
  - `Local`: small-horizon local planner around the car (5-cone window) for more “online” behaviour.

- **Simulation, ghost and telemetry**
  - Car follows the selected trajectory with a simple longitudinal model (velocity, accel / brake).
  - Ghost car showing the “fastest” precomputed RRT_QP lap.
  - Live G-G diagram (lateral vs longitudinal g).
  - Velocity and g-force charts along the lap using Recharts.

---

## Demo (GIFs)

Create a `docs/` (or `assets/`) folder and export three GIFs from screen recordings of the app. The README assumes the following filenames; you can change them if you prefer.

### 1. RRT* + QP racing line (main GIF)

File: `docs/demo-rrtqp.gif`

```markdown
![RRT* + QP racing line](docs/demo-rrtqp.gif)
```

**Idea for the video**

- Load one of your cone tracks.
- Select the **RRT_QP** optimiser.
- Enable the **ghost car** and **AI race mode**.
- Show the car completing a full lap on the RRT* + QP racing line, with:
  - the trajectory coloured by accel / brake,
  - the G-G diagram and speed chart updating on the side,
  - a couple of camera changes (helicopter → chase → cockpit).

This GIF is the “hero” demo of the project.

---

### 2. Track editor & centerline generation

File: `docs/demo-editor.gif`

```markdown
![Track editor and centerline](docs/demo-editor.gif)
```

**Idea for the video**

- Start from an empty (or very simple) track.
- Import a CSV of cones or place a few cones manually.
- Drag some cones to change the width and shape of a corner.
- Show, in real time:
  - the centerline being recomputed,
  - the asphalt / road mesh updating,
  - the baseline trajectory moving with your edits.
- Finish by pressing play so the car drives one short section on the updated track.

Goal: this GIF showcases the **interactive editor** and the link between cone layout and generated path.

---

### 3. Site overview / UI tour

File: `docs/demo-site.gif`


![Path Planning Studio – site overview](docs/demo-site.gif)


**Idea for the video**

- Start on the **landing page**:
  - briefly show the project name and the main call-to-action.
- Load a track from CSV or pick an example track.
- In a single smooth sequence:
  - show the 3D scene with cones and the centerline,
  - open the side panel with optimiser / simulation settings,
  - switch camera modes once (e.g. orbit → chase),
  - start a lap and let the car drive a few corners.
- Keep the HUD visible (speed, g-forces, charts) so visitors understand that:
  - the app is interactive,
  - multiple views and tools exist in the same interface.

Goal: this GIF is a **high-level product tour** that quickly shows what the site looks like and what you can do with it.

---

## Online deployment

Path Planning Studio is also deployed on the web using **Google Cloud Run**.

- Live URL (production): https://path-planning-studio-974707427282.us-west1.run.app/

You can open this link directly in a browser to:
- try the track editor and trajectory planners without installing anything locally,
- record the three demo GIFs described above using your favourite screen capture tool.

---

## Getting started (local)

### Prerequisites

- Node.js (recommended: 20.x or newer)
- npm (comes with Node)

### Install and run

```bash
# Install dependencies
npm install

# Run dev server (Vite)
npm run dev
```

By default Vite serves on `http://localhost:5173` (or the port shown in your terminal).

### Environment variables

There is a `.env.local` file with:

```bash
GEMINI_API_KEY=PLACEHOLDER_API_KEY
```

Right now the UI does not call any external LLM, so you can leave this as a dummy value.  
It is only wired into `vite.config.ts` as `process.env.GEMINI_API_KEY`.

---

## Project structure

At the root of the repo:

- `index.html` – Vite entry page, Tailwind CDN, fonts.
- `index.tsx` – React entry point.
- `App.tsx` – main application container, view routing, state management.
- `components/`
  - `Scene3D.tsx` – 3D scene, cones, paths, car and cameras.
  - `Car.tsx` – car model, kinematics and suspension / body roll effects.
  - `TrackObjects.tsx` – cone meshes and track geometry.
  - `UIOverlay.tsx` – controls, charts, G-G diagram and HUD.
  - `LandingPage.tsx` – landing / home page with track selector.
  - `AlgorithmsPage.tsx` – explanatory view for optimisation modes.
  - `SimulationsPage.tsx` – space for more scenario-based demos.
- `services/`
  - `mathUtils.ts` – CSV parsing, centerline and all trajectory optimisers (Laplacian, RRT*, QP, Hybrid, RRT_QP, Local).
- `types.ts` – shared TypeScript types (cones, paths, metadata, cameras, optimiser modes).
- `constants.ts` – physics parameters and visual colours for cones / paths.
- `vite.config.ts` – Vite configuration and environment variable mapping.
- `package.json` – dependencies and npm scripts.

---

## Typical workflow

1. Start the dev server (`npm run dev`) or open the online demo URL.
2. On the landing page, choose or import a track (CSV of blue / yellow / orange cones).
3. Adjust the layout in the editor if needed (drag cones, tweak corners).
4. Select an optimiser (NONE / Laplacian / RRT / QP / Hybrid / RRT_QP / Local).
5. Enable ghost and AI race mode if you want comparisons.
6. Press play to launch a lap and inspect:
   - the trajectory in 3D,
   - the G-G diagram,
   - the longitudinal charts.

Record your screen for the three scenarios described in the **Demo** section and export them as GIFs to complete the README.
