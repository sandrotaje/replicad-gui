# Parametric CAD with History - Implementation Plan

## Overview

Transform the current sketch-based CAD into a true parametric CAD with:
- **Feature-based history tree** - Every operation is a feature in an ordered tree
- **Sketch on plane or face** - Sketches can start on standard planes or existing faces
- **Face boundary visualization** - When sketching on a face, show the boundary in 2D
- **Undo/Redo** - Full command pattern implementation
- **Dependency tracking** - Features know what they depend on
- **Lazy re-evaluation** - Only recompute dirty features

---

## Task Breakdown for Parallel Implementation

### TASK 1: Type Definitions (No Dependencies)
**File:** `src/types/index.ts`
**Assignee:** Agent 1

Add the following new types:

```typescript
// ============ FEATURE TYPES ============

export type FeatureType =
  | 'sketch'
  | 'extrusion'
  | 'cut'
  | 'chamfer'
  | 'fillet'
  | 'revolve';

export interface FeatureBase {
  id: string;
  type: FeatureType;
  name: string;                    // User-friendly name (e.g., "Sketch 1", "Extrude 1")
  createdAt: number;               // Timestamp for ordering
  isValid: boolean;                // Did evaluation succeed?
  errorMessage?: string;           // Error if invalid
  isDirty: boolean;                // Needs re-evaluation?
  isCollapsed: boolean;            // UI state for tree view
}

// Reference to where a sketch is placed
export interface SketchPlaneReference {
  type: 'standard';
  plane: StandardPlane;            // 'XY' | 'XZ' | 'YZ'
  offset: number;                  // Offset along normal
}

export interface SketchFaceReference {
  type: 'face';
  parentFeatureId: string;         // Which feature's face
  faceIndex: number;               // Which face on that feature
  boundaryPoints: Point[];         // 2D boundary for display (cached)
}

export type SketchReference = SketchPlaneReference | SketchFaceReference;

// Sketch Feature - contains 2D elements
export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  reference: SketchReference;      // Where the sketch lives
  elements: SketchElement[];       // 2D sketch elements (existing type)
  isClosed: boolean;               // Is the sketch a closed profile?
}

// Extrusion Feature - extrudes a sketch
export interface ExtrusionFeature extends FeatureBase {
  type: 'extrusion';
  sketchId: string;                // Which sketch to extrude
  depth: number;                   // Extrusion depth
  direction: 'normal' | 'reverse'; // Direction relative to sketch plane
  operation: 'new' | 'fuse' | 'cut'; // How to combine with existing geometry
}

// Cut Feature - cuts using a sketch profile
export interface CutFeature extends FeatureBase {
  type: 'cut';
  sketchId: string;                // Which sketch defines the cut profile
  depth: number | 'through';       // Depth or through-all
  direction: 'normal' | 'reverse' | 'both';
}

// Chamfer Feature
export interface ChamferFeature extends FeatureBase {
  type: 'chamfer';
  targetFeatureId: string;         // Which feature to chamfer
  edgeIndices: number[];           // Which edges
  distance: number;                // Chamfer distance
}

// Fillet Feature
export interface FilletFeature extends FeatureBase {
  type: 'fillet';
  targetFeatureId: string;         // Which feature to fillet
  edgeIndices: number[];           // Which edges
  radius: number;                  // Fillet radius
}

// Union of all feature types
export type Feature =
  | SketchFeature
  | ExtrusionFeature
  | CutFeature
  | ChamferFeature
  | FilletFeature;

// ============ HISTORY/COMMAND TYPES ============

export type CommandType =
  | 'addFeature'
  | 'deleteFeature'
  | 'updateFeature'
  | 'reorderFeature'
  | 'addSketchElement'
  | 'updateSketchElement'
  | 'deleteSketchElement';

export interface Command {
  id: string;
  type: CommandType;
  timestamp: number;
  // Stores state needed for undo/redo
  payload: {
    before: unknown;               // State before command
    after: unknown;                // State after command
    featureId?: string;            // Affected feature
    elementId?: string;            // Affected element (for sketch commands)
  };
}

export interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  maxHistorySize: number;          // Limit memory usage
}

// ============ FEATURE STORE STATE ============

export interface FeatureStoreState {
  // Feature tree (ordered by creation)
  features: Feature[];

  // Quick lookup
  featureById: Map<string, Feature>;

  // Dependency graph: featureId -> IDs of features that depend on it
  dependents: Map<string, Set<string>>;

  // Currently active/editing feature
  activeFeatureId: string | null;

  // Currently editing sketch (if activeFeature is a sketch)
  editingSketchId: string | null;

  // Cached evaluation results: featureId -> geometry
  geometryCache: Map<string, unknown>;

  // The final combined shape after all features
  finalShape: ShapeData | null;

  // History for undo/redo
  history: HistoryState;
}
```

**Acceptance Criteria:**
- [ ] All types compile without errors
- [ ] Types are exported from index.ts
- [ ] Existing SketchElement types preserved and compatible

---

### TASK 2: Feature Store Implementation (Depends on: Task 1)
**File:** `src/store/useFeatureStore.ts` (NEW FILE)
**Assignee:** Agent 2

Create a new Zustand store for feature management:

```typescript
import { create } from 'zustand';
import { Feature, SketchFeature, ExtrusionFeature, Command, FeatureStoreState } from '../types';

interface FeatureStoreActions {
  // Feature CRUD
  addFeature: (feature: Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>) => string;
  updateFeature: (id: string, updates: Partial<Feature>) => void;
  deleteFeature: (id: string) => void;
  reorderFeature: (id: string, newIndex: number) => void;

  // Sketch element operations (delegates to feature)
  addSketchElement: (featureId: string, element: SketchElement) => void;
  updateSketchElement: (featureId: string, elementId: string, updates: Partial<SketchElement>) => void;
  deleteSketchElement: (featureId: string, elementId: string) => void;

  // Active/editing state
  setActiveFeature: (id: string | null) => void;
  startEditingSketch: (sketchId: string) => void;
  stopEditingSketch: () => void;

  // Dependency management
  getDependencies: (featureId: string) => string[];
  getDependents: (featureId: string) => string[];

  // Evaluation
  markDirty: (featureId: string) => void;
  markDirtyWithDependents: (featureId: string) => void;
  evaluateFeatures: () => Promise<void>;
  getEvaluationOrder: () => string[];  // Topological sort

  // History/Undo-Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Utility
  getFeatureByName: (name: string) => Feature | undefined;
  generateUniqueName: (type: FeatureType) => string;
}

export const useFeatureStore = create<FeatureStoreState & FeatureStoreActions>((set, get) => ({
  // Initial state
  features: [],
  featureById: new Map(),
  dependents: new Map(),
  activeFeatureId: null,
  editingSketchId: null,
  geometryCache: new Map(),
  finalShape: null,
  history: {
    undoStack: [],
    redoStack: [],
    maxHistorySize: 50,
  },

  // Implement all actions...
}));
```

**Key Implementation Details:**

1. **Dependency Tracking:**
   - When adding an extrusion, add entry: `dependents[sketchId].add(extrusionId)`
   - When adding sketch on face, add entry: `dependents[parentFeatureId].add(sketchId)`

2. **Topological Sort for Evaluation:**
   ```typescript
   getEvaluationOrder(): string[] {
     const visited = new Set<string>();
     const result: string[] = [];

     const visit = (id: string) => {
       if (visited.has(id)) return;
       visited.add(id);

       // Visit dependencies first
       const feature = get().featureById.get(id);
       const deps = get().getDependencies(id);
       deps.forEach(depId => visit(depId));

       result.push(id);
     };

     get().features.forEach(f => visit(f.id));
     return result;
   }
   ```

3. **Command Recording:**
   - Wrap every mutation in a command
   - Store before/after state
   - Push to undo stack, clear redo stack

**Acceptance Criteria:**
- [ ] Features can be added, updated, deleted
- [ ] Dependency graph updates automatically
- [ ] Undo/redo works for all operations
- [ ] Topological sort returns correct order
- [ ] Dirty marking propagates to dependents

---

### TASK 3: Feature Evaluator / Code Generator (Depends on: Task 1, Task 2)
**File:** `src/utils/featureEvaluator.ts` (NEW FILE)
**Assignee:** Agent 3

Generate replicad code from feature tree:

```typescript
export interface EvaluationResult {
  code: string;                    // Generated replicad code
  shapeData: ShapeData | null;     // Resulting geometry
  featureResults: Map<string, {    // Per-feature results
    geometry: unknown;
    faceCount: number;
    edgeCount: number;
    faceBoundaries: Map<number, Point[]>;  // faceIndex -> 2D boundary
  }>;
  errors: Map<string, string>;     // featureId -> error message
}

export class FeatureEvaluator {
  /**
   * Generate replicad code for a single sketch feature
   */
  generateSketchCode(sketch: SketchFeature): string {
    // Convert sketch elements to replicad drawing commands
    // Handle both standard planes and face references
  }

  /**
   * Generate replicad code for an extrusion feature
   */
  generateExtrusionCode(extrusion: ExtrusionFeature, sketchVarName: string): string {
    // Generate extrude() call with correct depth and operation
  }

  /**
   * Generate complete code for all features up to a given feature
   */
  generateCodeUpTo(features: Feature[], upToId: string): string {
    // Generate code for all features up to and including upToId
    // Use topological order
  }

  /**
   * Generate complete code for all features
   */
  generateFullCode(features: Feature[]): string {
    const lines: string[] = [
      'function main() {',
      '  let result = null;',
    ];

    // Sort features topologically
    const ordered = this.topologicalSort(features);

    for (const feature of ordered) {
      // Generate code based on feature type
      // Track variable names for each feature result
    }

    lines.push('  return result;');
    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Extract face boundaries for sketching
   * Called after evaluation to get 2D boundaries for each face
   */
  extractFaceBoundaries(shapeData: ShapeData): Map<number, Point[]> {
    // For each face, project boundary to 2D coordinates
    // Uses face normal and origin to create local coordinate system
  }
}
```

**Code Generation Examples:**

```javascript
// Sketch on XY plane → Extrusion
function main() {
  // Sketch_1
  const sketch_1 = drawRectangle(100, 50);

  // Extrude_1 (depends on Sketch_1)
  let result = sketch_1.sketchOnPlane("XY").extrude(20);

  // Sketch_2 on face 0 of Extrude_1
  const sketch_2 = drawCircle(15);

  // Cut_1 (depends on Sketch_2)
  result = result.cut(
    sketch_2.sketchOnFace(result, 0, 0, 0).extrude(20)
  );

  return result;
}
```

**Acceptance Criteria:**
- [ ] Generates valid replicad code from feature tree
- [ ] Handles sketch on plane and sketch on face
- [ ] Generates correct boolean operations (fuse/cut)
- [ ] Extracts face boundaries for 2D display
- [ ] Handles evaluation errors gracefully

---

### TASK 4: Worker Updates for Face Boundaries (Depends on: Task 1)
**File:** `src/workers/replicad.worker.ts`
**Assignee:** Agent 4

Update the worker to return face boundary data:

```typescript
// Add to existing IndividualFace interface or create new response
interface FaceBoundaryData {
  faceIndex: number;
  // 3D boundary points (from outerWire)
  boundary3D: { x: number; y: number; z: number }[];
  // 2D boundary in face local coordinates
  boundary2D: Point[];
  // Face local coordinate system
  origin: { x: number; y: number; z: number };
  xAxis: { x: number; y: number; z: number };
  yAxis: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

// Update extractIndividualFaces to include boundary data
function extractIndividualFaces(shape: ReplicadShape): IndividualFace[] {
  const faces: IndividualFace[] = [];

  if (shape.faces) {
    shape.faces.forEach((face, index) => {
      // Existing mesh extraction...

      // NEW: Extract boundary from outerWire
      const outerWire = face.outerWire();
      const edges = outerWire.edges;
      const boundaryPoints3D: Point3D[] = [];

      edges.forEach(edge => {
        // Get edge vertices
        const start = edge.startPoint();
        const end = edge.endPoint();
        boundaryPoints3D.push({ x: start.x, y: start.y, z: start.z });
      });

      // Project to 2D using face coordinate system
      const origin = face.center;
      const normal = face.normalAt(origin);
      const { xAxis, yAxis } = computeFaceAxes(normal);

      const boundary2D = boundaryPoints3D.map(p => {
        const local = projectToFaceCoords(p, origin, xAxis, yAxis);
        return { x: local.x, y: local.y };
      });

      faces.push({
        faceIndex: index,
        mesh: faceMesh,
        isPlanar: face.geomType === 'PLANE',
        planeInfo: { origin, xDir: xAxis, normal },
        boundaryPoints: boundary2D,  // ADD THIS
        boundary3D: boundaryPoints3D, // ADD THIS
      });
    });
  }

  return faces;
}

// Helper: Compute consistent face axes
function computeFaceAxes(normal: Point3D): { xAxis: Point3D; yAxis: Point3D } {
  // Use reference vector to compute xAxis perpendicular to normal
  const refVector = Math.abs(normal.z) < 0.9
    ? { x: 0, y: 0, z: 1 }
    : { x: 1, y: 0, z: 0 };

  const xAxis = normalize(cross(refVector, normal));
  const yAxis = normalize(cross(normal, xAxis));

  return { xAxis, yAxis };
}

// Helper: Project 3D point to face 2D coordinates
function projectToFaceCoords(
  point: Point3D,
  origin: Point3D,
  xAxis: Point3D,
  yAxis: Point3D
): Point {
  const relative = {
    x: point.x - origin.x,
    y: point.y - origin.y,
    z: point.z - origin.z,
  };

  return {
    x: dot(relative, xAxis),
    y: dot(relative, yAxis),
  };
}
```

**Acceptance Criteria:**
- [ ] Each face includes 2D boundary points
- [ ] Boundary is in face-local coordinates (origin at face center)
- [ ] Non-planar faces handled gracefully (empty boundary or approximation)
- [ ] Coordinate system consistent with sketchOnFace API

---

### TASK 5: Sketcher Updates - Face Boundary Display (Depends on: Task 1, Task 4)
**File:** `src/components/Sketcher.tsx`
**Assignee:** Agent 5

Update Sketcher to display face boundaries when sketching on a face:

```typescript
// Add to component state or props
interface SketcherProps {
  // ... existing props
  faceBoundary?: Point[];          // 2D boundary points for current face
  faceOrigin?: Point;              // Face center in sketch coordinates
}

// In the render/draw function:
const drawFaceBoundary = (ctx: CanvasRenderingContext2D) => {
  if (!faceBoundary || faceBoundary.length < 3) return;

  ctx.save();

  // Draw filled background (semi-transparent)
  ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
  ctx.beginPath();
  const first = worldToScreen(faceBoundary[0]);
  ctx.moveTo(first.x, first.y);
  faceBoundary.slice(1).forEach(p => {
    const screen = worldToScreen(p);
    ctx.lineTo(screen.x, screen.y);
  });
  ctx.closePath();
  ctx.fill();

  // Draw boundary outline
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  faceBoundary.slice(1).forEach(p => {
    const screen = worldToScreen(p);
    ctx.lineTo(screen.x, screen.y);
  });
  ctx.closePath();
  ctx.stroke();

  // Draw origin marker (face center)
  if (faceOrigin) {
    const origin = worldToScreen(faceOrigin);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.lineWidth = 1;

    // Cross marker
    const size = 10;
    ctx.beginPath();
    ctx.moveTo(origin.x - size, origin.y);
    ctx.lineTo(origin.x + size, origin.y);
    ctx.moveTo(origin.x, origin.y - size);
    ctx.lineTo(origin.x, origin.y + size);
    ctx.stroke();
  }

  ctx.restore();
};

// Update main draw function to include boundary
const draw = () => {
  // Clear canvas...

  // Draw grid...

  // NEW: Draw face boundary first (behind elements)
  if (isSketchingOnFace) {
    drawFaceBoundary(ctx);
  }

  // Draw sketch elements...
};
```

**Additional Updates:**

1. **Coordinate Display:** Show coordinates relative to face center when sketching on face
2. **Snap to Boundary:** Optional snap to boundary edges/vertices
3. **Visual Indicator:** Show which face is being sketched on in the UI

**Acceptance Criteria:**
- [ ] Face boundary displayed as dashed outline
- [ ] Face area filled with semi-transparent color
- [ ] Origin (face center) marked
- [ ] Boundary only shown when actively sketching on a face
- [ ] Coordinates displayed relative to face center

---

### TASK 6: Feature Tree UI Component (Depends on: Task 1, Task 2)
**File:** `src/components/FeatureTree.tsx` (NEW FILE)
**Assignee:** Agent 6

Create a visual feature tree component:

```typescript
import React from 'react';
import { useFeatureStore } from '../store/useFeatureStore';
import { Feature, SketchFeature, ExtrusionFeature } from '../types';

// Icons for feature types
const FeatureIcon: React.FC<{ type: Feature['type'] }> = ({ type }) => {
  switch (type) {
    case 'sketch': return <SketchIcon />;
    case 'extrusion': return <ExtrudeIcon />;
    case 'cut': return <CutIcon />;
    case 'chamfer': return <ChamferIcon />;
    case 'fillet': return <FilletIcon />;
  }
};

interface FeatureItemProps {
  feature: Feature;
  isActive: boolean;
  isEditing: boolean;
  depth: number;  // Indentation level based on dependencies
  onSelect: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const FeatureItem: React.FC<FeatureItemProps> = ({
  feature,
  isActive,
  isEditing,
  depth,
  onSelect,
  onDoubleClick,
  onContextMenu,
}) => {
  return (
    <div
      className={`feature-item ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''} ${!feature.isValid ? 'invalid' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <FeatureIcon type={feature.type} />
      <span className="feature-name">{feature.name}</span>
      {!feature.isValid && (
        <span className="error-indicator" title={feature.errorMessage}>⚠️</span>
      )}
      {feature.isDirty && (
        <span className="dirty-indicator">●</span>
      )}
    </div>
  );
};

export const FeatureTree: React.FC = () => {
  const {
    features,
    activeFeatureId,
    editingSketchId,
    setActiveFeature,
    startEditingSketch,
    deleteFeature,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useFeatureStore();

  const handleDoubleClick = (feature: Feature) => {
    if (feature.type === 'sketch') {
      startEditingSketch(feature.id);
    }
    // For other types, could open parameter editor
  };

  const handleContextMenu = (e: React.MouseEvent, feature: Feature) => {
    e.preventDefault();
    // Show context menu with: Edit, Delete, Rename, etc.
  };

  return (
    <div className="feature-tree">
      <div className="feature-tree-header">
        <h3>Features</h3>
        <div className="history-buttons">
          <button onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">↩</button>
          <button onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">↪</button>
        </div>
      </div>

      <div className="feature-list">
        {features.map((feature, index) => (
          <FeatureItem
            key={feature.id}
            feature={feature}
            isActive={feature.id === activeFeatureId}
            isEditing={feature.id === editingSketchId}
            depth={calculateDepth(feature, features)}
            onSelect={() => setActiveFeature(feature.id)}
            onDoubleClick={() => handleDoubleClick(feature)}
            onContextMenu={(e) => handleContextMenu(e, feature)}
          />
        ))}
      </div>

      {features.length === 0 && (
        <div className="empty-state">
          No features yet. Start by creating a sketch.
        </div>
      )}
    </div>
  );
};

// Helper: Calculate visual depth based on dependencies
function calculateDepth(feature: Feature, allFeatures: Feature[]): number {
  // Sketches on standard planes: depth 0
  // Features depending on other features: parent depth + 1
  if (feature.type === 'sketch') {
    const sketch = feature as SketchFeature;
    if (sketch.reference.type === 'standard') return 0;
    // Sketch on face: find parent and add 1
    const parentId = sketch.reference.parentFeatureId;
    const parent = allFeatures.find(f => f.id === parentId);
    if (parent) return calculateDepth(parent, allFeatures) + 1;
  }
  if (feature.type === 'extrusion' || feature.type === 'cut') {
    const sketchId = (feature as ExtrusionFeature).sketchId;
    const sketch = allFeatures.find(f => f.id === sketchId);
    if (sketch) return calculateDepth(sketch, allFeatures);
  }
  return 0;
}
```

**Styling (add to CSS):**
```css
.feature-tree {
  width: 250px;
  border-right: 1px solid #333;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.feature-item:hover {
  background: #2a2a2a;
}

.feature-item.active {
  background: #2a2a2a;
  border-left-color: #4a9eff;
}

.feature-item.editing {
  background: #3a3a3a;
  border-left-color: #4aff4a;
}

.feature-item.invalid {
  opacity: 0.7;
  color: #ff6b6b;
}
```

**Acceptance Criteria:**
- [ ] Shows all features in creation order
- [ ] Visual indentation based on dependencies
- [ ] Active feature highlighted
- [ ] Editing state indicated
- [ ] Invalid features marked with warning
- [ ] Undo/Redo buttons functional
- [ ] Double-click to edit sketch
- [ ] Context menu for delete/rename

---

### TASK 7: Integrate Feature Store with App (Depends on: Task 2, Task 3, Task 5, Task 6)
**File:** `src/App.tsx`, `src/components/Toolbar.tsx`
**Assignee:** Agent 7

Update the main app to use the new feature store:

**App.tsx Changes:**
```typescript
import { FeatureTree } from './components/FeatureTree';
import { useFeatureStore } from './store/useFeatureStore';

export const App: React.FC = () => {
  const {
    editingSketchId,
    features,
    activeFeatureId,
    finalShape,
  } = useFeatureStore();

  // Get the current sketch being edited
  const editingSketch = editingSketchId
    ? features.find(f => f.id === editingSketchId) as SketchFeature
    : null;

  // Get face boundary if sketching on face
  const faceBoundary = editingSketch?.reference.type === 'face'
    ? editingSketch.reference.boundaryPoints
    : null;

  return (
    <div className="app">
      {/* Feature Tree on left */}
      <FeatureTree />

      {/* Main content area */}
      <div className="main-content">
        {editingSketchId ? (
          <Sketcher
            sketch={editingSketch}
            faceBoundary={faceBoundary}
            onElementAdd={...}
            onElementUpdate={...}
          />
        ) : (
          <Viewer3D
            shapeData={finalShape}
            onFaceSelect={handleFaceSelect}
          />
        )}
      </div>

      {/* 3D preview when editing sketch (split view) */}
      {editingSketchId && (
        <div className="preview-3d">
          <Viewer3D shapeData={finalShape} />
        </div>
      )}
    </div>
  );
};
```

**Toolbar.tsx Changes:**
```typescript
// Add feature creation buttons
const handleNewSketch = () => {
  const sketchId = addFeature({
    type: 'sketch',
    name: generateUniqueName('sketch'),
    reference: { type: 'standard', plane: 'XY', offset: 0 },
    elements: [],
    isClosed: false,
  });
  startEditingSketch(sketchId);
};

const handleSketchOnFace = () => {
  if (selectedFaceIndex === null || !activeFeatureId) return;

  // Get face boundary from current shape
  const faceBoundary = getFaceBoundary(activeFeatureId, selectedFaceIndex);

  const sketchId = addFeature({
    type: 'sketch',
    name: generateUniqueName('sketch'),
    reference: {
      type: 'face',
      parentFeatureId: activeFeatureId,
      faceIndex: selectedFaceIndex,
      boundaryPoints: faceBoundary,
    },
    elements: [],
    isClosed: false,
  });
  startEditingSketch(sketchId);
};

const handleExtrude = () => {
  if (!editingSketchId) return;

  addFeature({
    type: 'extrusion',
    name: generateUniqueName('extrusion'),
    sketchId: editingSketchId,
    depth: 10,  // Default depth
    direction: 'normal',
    operation: features.length === 1 ? 'new' : 'fuse',
  });

  stopEditingSketch();
};
```

**Acceptance Criteria:**
- [ ] Feature tree visible on left side
- [ ] Sketcher opens when editing a sketch
- [ ] 3D view shows when not editing
- [ ] Face selection creates new sketch on face
- [ ] Extrude button creates extrusion feature
- [ ] All state flows through feature store

---

### TASK 8: Keyboard Shortcuts and Polish (Depends on: All above)
**File:** `src/hooks/useKeyboardShortcuts.ts` (NEW FILE)
**Assignee:** Agent 8

Add keyboard shortcuts and UX polish:

```typescript
import { useEffect } from 'react';
import { useFeatureStore } from '../store/useFeatureStore';

export const useKeyboardShortcuts = () => {
  const { undo, redo, deleteFeature, activeFeatureId } = useFeatureStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }

      // Delete/Backspace: Delete active feature
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeFeatureId) {
        e.preventDefault();
        deleteFeature(activeFeatureId);
      }

      // Escape: Deselect / stop editing
      if (e.key === 'Escape') {
        stopEditingSketch();
        setActiveFeature(null);
      }

      // S: New sketch
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        // Start new sketch
      }

      // E: Extrude
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
        // Extrude current sketch
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteFeature, activeFeatureId]);
};
```

**Additional Polish:**
- [ ] Loading states during evaluation
- [ ] Error messages in toast/notification
- [ ] Confirmation dialog for delete
- [ ] Feature rename inline editing
- [ ] Drag to reorder features (optional)

---

## Dependency Graph

```
Task 1 (Types)
    ↓
    ├──→ Task 2 (Feature Store)
    │        ↓
    │        ├──→ Task 3 (Evaluator)
    │        │        ↓
    │        │        └──→ Task 7 (Integration)
    │        │                    ↓
    │        │                    └──→ Task 8 (Polish)
    │        └──→ Task 6 (Feature Tree UI)
    │                    ↓
    │                    └──→ Task 7 (Integration)
    │
    └──→ Task 4 (Worker Updates)
             ↓
             └──→ Task 5 (Sketcher Boundary)
                        ↓
                        └──→ Task 7 (Integration)
```

## Parallel Execution Plan

**Phase 1 (Can run in parallel):**
- Task 1: Types

**Phase 2 (After Phase 1, can run in parallel):**
- Task 2: Feature Store
- Task 4: Worker Updates

**Phase 3 (After Phase 2, can run in parallel):**
- Task 3: Evaluator (needs Task 2)
- Task 5: Sketcher Boundary (needs Task 4)
- Task 6: Feature Tree UI (needs Task 2)

**Phase 4:**
- Task 7: Integration (needs Tasks 3, 5, 6)

**Phase 5:**
- Task 8: Polish (needs Task 7)

---

## Migration Strategy

1. **Create new files alongside existing ones** - Don't break current functionality
2. **Feature flag for new system** - Toggle between old and new stores
3. **Migrate incrementally** - Start with sketch → extrude flow
4. **Remove old code after validation** - Clean up once new system proven

---

## Testing Checklist

- [ ] Create sketch on XY plane → Extrude → Verify 3D
- [ ] Create sketch on face → Extrude → Verify stacked geometry
- [ ] Undo/Redo through multiple operations
- [ ] Edit sketch after extrusion → Verify re-evaluation
- [ ] Delete feature → Verify dependents marked invalid
- [ ] Reorder features → Verify correct evaluation order
- [ ] Face boundary displays correctly when sketching on face
- [ ] Multiple sketches on different planes work correctly
