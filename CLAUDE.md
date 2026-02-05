# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on localhost:5173
npm run build    # TypeScript check (tsc -b) + Vite build
npm run lint     # ESLint (flat config, TS + React hooks plugins)
npm run preview  # Preview production build
```

No test framework is currently configured. Validate changes with `npm run build` and `npm run lint`.

## Project Overview

A **parametric CAD application** combining visual 2D sketching with code-driven 3D modeling using [Replicad](https://replicad.xyz) (OpenCASCADE/WASM wrapper). Built with React 19, TypeScript (strict), Three.js, Zustand, and Vite.

## Directory Structure

```
src/
├── components/          # React UI components
│   ├── icons/           # SVG tool icons (ToolIcons.tsx)
│   ├── Sketcher.tsx     # 2D drawing canvas (~2,350 lines, largest component)
│   ├── Viewer3D.tsx     # Three.js 3D viewer with face/edge selection
│   ├── FeatureTree.tsx  # Feature list/tree sidebar UI
│   ├── Toolbar.tsx      # Top menu bar with operations
│   ├── FeatureEditDialog.tsx   # Feature parameter editing modal
│   ├── DepthPromptDialog.tsx   # Extrusion/cut depth input
│   ├── BevelDialog.tsx         # Chamfer creation dialog
│   ├── BevelEditDialog.tsx     # Chamfer/fillet parameter editing
│   ├── SweepDialog.tsx         # Sweep feature setup
│   ├── FloatingConstraints.tsx # Constraint visualization panel
│   ├── SketchOverlay3D.tsx     # Sketch wireframe in 3D view
│   ├── CodeEditor.tsx          # Monaco editor (read-only code view)
│   └── index.ts
├── hooks/
│   ├── useFeatureSketchSync.ts # Syncs sketch editing ↔ feature store
│   ├── useReplicadWorker.ts    # Web Worker communication
│   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
│   └── index.ts
├── store/
│   ├── useFeatureStore.ts  # Primary parametric feature tree (~1,238 lines)
│   └── useStore.ts         # Sketch editing state (~1,090 lines)
├── types/
│   └── index.ts            # All TypeScript interfaces (~442 lines)
├── utils/
│   ├── featureEvaluator.ts      # Feature tree → replicad JS code (~1,291 lines)
│   ├── constraintSolver.ts      # 2D constraint solver (Gauss-Newton)
│   ├── closedFigureDetection.ts # Profile grouping & element chaining
│   ├── autoConstraints.ts       # Auto-detect geometric constraints
│   ├── sketchToSolver.ts        # Sketch elements → solver primitives
│   ├── codeParser.ts            # Reverse-parse JS code → sketch elements
│   └── stlExporter.ts           # Export 3D geometry to STL
├── workers/
│   └── replicad.worker.ts  # Replicad evaluation in background thread (~740 lines)
├── App.tsx                  # Root component (layout, view modes, orchestration)
└── main.tsx                 # Entry point
```

## Core Data Flow

```
Sketcher (2D drawing)
    ↓ useFeatureSketchSync (bidirectional sync)
useFeatureStore (parametric feature tree)
    ↓ featureEvaluator.generateFullCode()
Generated JavaScript Code (replicad API calls)
    ↓ useReplicadWorker → Web Worker message
replicad.worker.ts (OpenCASCADE WASM evaluation)
    ↓ ShapeData result
useStore.shapeData (mesh + individual faces/edges)
    ↓
Viewer3D (Three.js rendering)
```

## Two-Store Architecture

### `useFeatureStore` — Parametric feature tree (primary)

| State | Purpose |
|-------|---------|
| `features[]` | Ordered array of Feature objects |
| `featureById` | Quick lookup map |
| `dependents` | Dependency graph for dirty propagation |
| `editingSketchId` | Currently editing sketch ID |
| `finalShape` | Final 3D geometry after all features |
| `history` | Undo/redo snapshots (max 30) |

Key actions: `addFeature`, `updateFeature`, `deleteFeature`, `reorderFeature`, `markDirtyWithDependents`, `startEditingSketch`, `stopEditingSketch`, `undo`, `redo`, `saveToLocalStorage`, `loadFromLocalStorage`.

Persistence: localStorage key `'replicad-cad-project'`, versioned JSON format (v2 with snapshots).

### `useStore` — Immediate sketch editing state

| State | Purpose |
|-------|---------|
| `elements[]` | 2D sketch elements being drawn/edited |
| `shapeData` | 3D geometry from worker |
| `selectedFaceIndices` / `selectedEdgeIndices` | 3D selection state |
| `currentTool` | Active sketch tool |
| `sketchPlane` | Current XY/XZ/YZ or face plane |
| `detectedClosedProfiles` / `detectedOpenPaths` | Auto-detected profiles |

The `useFeatureSketchSync` hook synchronizes between stores when editing a sketch, using a `syncInProgressRef` to prevent infinite loops.

## Feature System

Features form a dependency tree, topologically sorted before code generation. Modifying a sketch marks all dependent features as dirty.

### Feature Types

| Type | Key Properties | Description |
|------|---------------|-------------|
| `SketchFeature` | `elements[]`, `constraints[]`, `reference` (standard or face plane) | 2D elements on a plane |
| `ExtrusionFeature` | `sketchId`, `depth`, `direction`, `operation` (new/fuse/cut) | Extrudes a sketch profile |
| `CutFeature` | `sketchId`, `depth` (number or 'through'), `direction` | Cuts using sketch profile |
| `SweepFeature` | `profileSketchId`, `pathSketchId`, `operation` | Sweeps profile along path |
| `ChamferFeature` | `targetFeatureId`, `edgeIndices[]`, `distance` | Chamfers selected edges |
| `FilletFeature` | `targetFeatureId`, `edgeIndices[]`, `radius` | Fillets selected edges |
| `ShellFeature` | `targetFeatureId`, `thickness`, `faceIndices[]` | Hollows a solid |
| `LoftFeature` | `profileSketchIds[]`, `operation` | Lofts between profiles |
| `LinearPatternFeature` | `sourceFeatureId`, `direction`, `count`, `spacing` | Linear array pattern |
| `PolarPatternFeature` | `sourceFeatureId`, `axis`, `count`, `totalAngle` | Circular array pattern |
| `RevolveFeature` | Sketch revolution around axis | Revolve a profile |

### Sketch Planes

- **Standard planes**: `'XY' | 'XZ' | 'YZ'` — uses `sketchOnPlane()`
- **Face planes**: `{ type: 'face', faceIndex, ... }` — uses `sketchOnFace()` helper injected into worker

### Sketch Element Types

`RectangleElement`, `CircleElement`, `LineElement`, `HLineElement`, `VLineElement`, `ArcElement`, `SplineElement` — all extend `SketchElementBase` with `{ id, plane, selected, operation, committed, depth }`.

### Cut Direction Note

When cutting from a face sketch, the face normal points outward. `generateCutCode()` uses **negative depth** for "normal" direction to cut INTO the solid.

## Code Generation (`featureEvaluator.ts`)

Converts the feature tree into executable replicad JavaScript:

1. Topologically sorts features by dependencies
2. Generates sketch drawing commands (`drawRectangle`, `drawCircle`, line/arc/spline drawing)
3. Chains operations (`.extrude()`, `.fuse()`, `.cut()`)
4. Wraps in `function main() { ... }` returning the final shape
5. Feature variable names are sanitized to valid JS identifiers (lowercase with underscores)

## Web Worker Protocol (`replicad.worker.ts`)

```
Main Thread → Worker:  { type: 'init' }           // Load WASM
Main Thread → Worker:  { type: 'evaluate', code }  // Run code
Worker → Main Thread:  { type: 'ready' }           // WASM loaded
Worker → Main Thread:  { type: 'result', shapeData }
Worker → Main Thread:  { type: 'error', error }
```

The worker meshes each face individually, extracts planar face info (origin, axes, normal, bounds), and projects boundaries to 2D for face-plane sketching.

## Adding New Feature Types

1. Add type interface to `src/types/index.ts`
2. Add code generation case in `featureEvaluator.ts`
3. Add dependency tracking in `getFeatureDependencies()`
4. Add UI in `FeatureTree.tsx` and `FeatureEditDialog.tsx`
5. Add toolbar action in `Toolbar.tsx` if needed

## Key Conventions

### TypeScript
- **Strict mode** enabled with `noUnusedLocals`, `noUnusedParameters`
- Target ES2022, module ESNext, JSX react-jsx
- All types in `src/types/index.ts` (discriminated unions for features)
- ESLint flat config with `typescript-eslint` + `react-hooks` + `react-refresh`

### React Patterns
- Functional components only, no class components
- Zustand stores accessed directly via hooks
- Heavy use of `useMemo` / `useCallback` for performance
- Component files contain inline `React.CSSProperties` style objects

### Styling
- **Catppuccin Mocha** dark theme (dark purples/blues)
- Inline React style objects, no CSS modules or CSS-in-JS library
- Responsive: mobile breakpoint at 768px
- App has three view modes: `split` (sketcher + 3D), `sketcher`, `3d`

### Naming
- PascalCase for components, camelCase for functions/variables
- Feature auto-naming: `{TypeName} {Counter}` (e.g., "Sketch 1", "Extrude 2")
- Console logs prefixed with `[Feature Mode]`, `[Worker]`, etc.

### State Management (Zustand)
```typescript
const useMyStore = create<State & Actions>((set, get) => ({
  value: initial,
  action: (param) => set((state) => ({ value: newValue })),
}));
```

## Keyboard Shortcuts (`useKeyboardShortcuts.ts`)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo (sketch or feature level) |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + S` | Save to localStorage |
| `Delete` / `Backspace` | Delete active feature |
| `Escape` | Stop editing / deselect |
| `S` | Start new sketch |
| `E` | Extrude current sketch |
| `X` | Cut with current sketch |

## Build & Deploy

- **Vite** with `base: '/replicad-gui/'` (GitHub Pages)
- Worker format: ES modules
- `replicad-opencascadejs` excluded from optimizeDeps (loaded as WASM)
- WASM files included via `assetsInclude: ['**/*.wasm']`

## Debugging

- Console logs prefixed with `[Feature Mode]` show generated code
- `useFeatureStore.getState()` in browser console to inspect feature tree
- `shapeData.individualFaces` contains per-face geometry with 2D boundaries
- Worker errors surface as `{ type: 'error', error }` messages
