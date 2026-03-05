# Replicad GUI

> A parametric CAD application combining visual 2D sketching with code-driven 3D modeling

**Replicad GUI** is a browser-based parametric CAD editor built on [Replicad](https://replicad.xyz) (OpenCASCADE/WASM). Design 3D models through an intuitive combination of 2D sketching, a full-featured feature tree, and generated JavaScript code.

[Live Demo](https://sandrotaje.github.io/replicad-gui/)

## Features

### 2D Sketcher
- Drawing tools: rectangles, circles, lines (free/horizontal/vertical), arcs, and splines
- Geometric constraint solver (coincident, parallel, perpendicular, tangent, equal, fixed, distance, angle)
- Auto-constraint detection as you draw
- Closed profile and open path detection for extrusion/sweep operations

### 3D Modeling Operations
- **Extrude** — push a closed profile into a 3D solid (new body, fuse, or cut)
- **Cut** — subtract material using a sketch profile, with through-all support
- **Sweep** — sweep a closed profile along an open path
- **Loft** — blend between multiple sketch profiles
- **Revolve** — revolve a profile around an axis
- **Shell** — hollow out a solid by removing selected faces
- **Chamfer / Fillet** — bevel or round selected edges
- **Linear Pattern** — repeat a feature along a direction
- **Polar Pattern** — repeat a feature around an axis

### Sketch Planes
- Standard planes: XY, XZ, YZ
- Sketch on any planar face of an existing solid

### Workflow
- Parametric feature tree with dependency tracking and dirty propagation
- Undo / redo (snapshot-based, up to 30 levels)
- Real-time 3D preview powered by Three.js
- Sketch wireframe overlay in the 3D view with per-sketch visibility toggle
- STL export for 3D printing
- Generated replicad JavaScript code view (Monaco editor)
- Auto-save to localStorage

### View Modes
- Split view (sketcher + 3D side by side)
- Sketcher only
- 3D only

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
git clone https://github.com/sandrotaje/replicad-gui.git
cd replicad-gui
npm install
npm run dev
```

Visit `http://localhost:5173` to start designing.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + S` | Save |
| `Delete` / `Backspace` | Delete feature |
| `Escape` | Stop editing / deselect |
| `S` | New sketch |
| `E` | Extrude |
| `X` | Cut |

## Tech Stack

- **React 19** + **TypeScript** (strict)
- **Replicad** — CAD kernel (OpenCASCADE WASM)
- **Three.js** / React Three Fiber — 3D rendering
- **Zustand** — state management
- **Monaco Editor** — code view
- **Vite** — build tooling

## Build

```bash
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build
npm run lint     # ESLint
```

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

This project is open source and available under the MIT License.

## Resources

- [Replicad Documentation](https://replicad.xyz/docs)
- [Replicad Examples](https://replicad.xyz/examples)
- [Live Demo](https://sandrotaje.github.io/replicad-gui/)

---

Built with [Replicad](https://replicad.xyz)
