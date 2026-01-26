# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on localhost:5173
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build
```

No test framework is currently configured.

## Architecture Overview

This is a **parametric CAD application** that combines visual 2D sketching with code-driven 3D modeling using [Replicad](https://replicad.xyz) (OpenCASCADE wrapper).

### Core Data Flow

```
Sketcher (2D drawing)
    ↓ useFeatureSketchSync
Feature Store (parametric history)
    ↓ featureEvaluator.generateFullCode()
Generated JavaScript Code
    ↓ Web Worker (replicad.worker.ts)
3D Geometry (ShapeData)
    ↓
Viewer3D (Three.js rendering)
```

### Two-Store Pattern

**`useFeatureStore`** - Parametric feature tree (primary)
- `features[]` - Ordered array of Feature objects (Sketch, Extrusion, Cut, etc.)
- `dependents` - Dependency graph for invalidation
- `editingSketchId` - Currently editing sketch
- Supports undo/redo via command history

**`useStore`** - Immediate sketch editing state (legacy, still used)
- `elements[]` - 2D sketch elements being edited
- `shapeData` - 3D geometry from worker
- `selectedFaceIndices/selectedEdgeIndices` - 3D selection

The `useFeatureSketchSync` hook synchronizes between stores when editing a sketch.

### Feature System

Features form a dependency tree:
- **SketchFeature** - 2D elements on a plane (standard XY/XZ/YZ or existing face)
- **ExtrusionFeature** - Extrudes a sketch (operations: new/fuse/cut)
- **CutFeature** - Cuts geometry using sketch profile

Key behaviors:
- Features are topologically sorted before code generation
- Modifying a sketch marks dependent features as dirty
- `featureEvaluator.ts` converts feature tree → executable replicad code

### Sketch Planes

Sketches can be on:
- **Standard planes**: `'XY' | 'XZ' | 'YZ'`
- **Face planes**: `{ type: 'face', faceIndex, parentFeatureId, boundaryPoints }`

For face sketches, the code generator uses `sketchOnFace()` helper instead of `sketchOnPlane()`.

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/utils/featureEvaluator.ts` | Feature tree → replicad JavaScript code |
| `src/workers/replicad.worker.ts` | Runs replicad in background thread |
| `src/hooks/useFeatureSketchSync.ts` | Syncs sketch editing ↔ feature store |
| `src/components/Sketcher.tsx` | 2D canvas with drawing tools |
| `src/components/Viewer3D.tsx` | Three.js 3D viewer with face/edge selection |

### Cut Direction Note

When cutting from a face sketch, the face normal points outward. The `generateCutCode()` function uses **negative depth** for "normal" direction to cut INTO the solid.

## Adding New Feature Types

1. Add type interface to `src/types/index.ts`
2. Add code generation case in `featureEvaluator.ts`
3. Add dependency tracking in `getFeatureDependencies()`
4. Add UI in `FeatureTree.tsx` and `FeatureEditDialog.tsx`

## Debugging

- Console logs prefixed with `[Feature Mode]` show generated code
- `useFeatureStore.getState()` to inspect feature tree
- `shapeData.individualFaces` contains face geometry with 2D boundaries
