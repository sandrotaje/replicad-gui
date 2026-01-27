import { create } from 'zustand';
import type {
  SketchElement,
  RectangleElement,
  MeshData,
  ShapeData,
  SketchPlane,
  FacePlane,
  SketchTool,
  Point,
  OperationType,
  ClosedProfileGroup,
} from '../types';
import { parseElementsFromCode } from '../utils/codeParser';

// Sketch undo/redo history types
interface SketchHistoryEntry {
  elements: SketchElement[];
}

interface SketchHistory {
  undoStack: SketchHistoryEntry[];
  redoStack: SketchHistoryEntry[];
  maxHistorySize: number;
}

// Re-export OperationType for convenience
export type { OperationType } from '../types';

// Type for adding elements - uses discriminated union properly
// Excludes plane, selected, operation, committed, and depth since those are set by addElement
type NewElement = Omit<RectangleElement, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'circle' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'line' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'hline' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'vline' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'arc' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'> |
  Omit<SketchElement & { type: 'spline' }, 'plane' | 'selected' | 'operation' | 'committed' | 'depth'>;

type UpdateSource = 'sketch' | 'code' | null;

interface AppState {
  // Sketch state
  elements: SketchElement[];
  selectedElementIds: Set<string>;
  currentTool: SketchTool;

  // Code state
  code: string;

  // 3D state
  meshData: MeshData | null;
  shapeData: ShapeData | null;
  isEvaluating: boolean;
  error: string | null;

  // 3D Selection state (always active for both faces and edges)
  selectedFaceIndices: Set<number>;
  selectedEdgeIndices: Set<number>;
  hoveredFaceIndex: number | null;
  hoveredEdgeIndex: number | null;

  // Constraint selection state
  selectedPointIds: string[];
  selectedLineIds: string[];
  selectedCircleIds: string[];

  // Extrusion state (per-plane)
  planeDepths: Map<string, number>; // Depth for each plane
  defaultDepth: number; // Default depth for new planes

  // Operation type per plane (extrude or cut)
  planeOperations: Map<string, OperationType>;

  // Sketch plane state (current plane for new elements)
  sketchPlane: SketchPlane;

  // Face outline for current face plane (2D points in sketch coordinates)
  faceOutline: Point[] | null;

  // Detected closed profiles from chained elements (for visual feedback and sync)
  detectedClosedProfiles: ClosedProfileGroup[];

  // Sync tracking (to prevent infinite loops)
  lastUpdateSource: UpdateSource;

  // Sketch undo/redo history
  sketchHistory: SketchHistory;

  // Actions
  addElement: (element: NewElement) => void;
  updateElement: (id: string, updates: Partial<SketchElement>) => void;
  moveElement: (id: string, delta: Point) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string, multiSelect?: boolean) => void;
  deselectAll: () => void;
  setCurrentTool: (tool: SketchTool) => void;

  // Updates from sketch (will regenerate code)
  updateFromSketch: (elements: SketchElement[]) => void;

  // Updates from code (will update sketch)
  updateFromCode: (code: string) => void;

  setMeshData: (meshData: MeshData | null) => void;
  setShapeData: (shapeData: ShapeData | null) => void;
  setIsEvaluating: (isEvaluating: boolean) => void;
  setError: (error: string | null) => void;
  setPlaneDepth: (planeKey: string, depth: number) => void;
  getCurrentPlaneDepth: () => number;

  // Sketch plane actions
  setSketchPlane: (plane: SketchPlane) => void;
  sketchOnFace: (faceIndex: number) => void;
  setPlaneOperation: (planeKey: string, operation: OperationType) => void;
  getCurrentPlaneOperation: () => OperationType;

  // 3D Selection actions (always active for both faces and edges)
  selectFace: (index: number, multiSelect?: boolean) => void;
  selectEdge: (index: number, multiSelect?: boolean) => void;
  setHoveredFace: (index: number | null) => void;
  setHoveredEdge: (index: number | null) => void;
  clearSelection: () => void;

  // Closed profile detection
  setDetectedClosedProfiles: (profiles: ClosedProfileGroup[]) => void;

  // Constraint selection actions
  selectPoint: (id: string, multiSelect?: boolean) => void;
  selectLine: (id: string, multiSelect?: boolean) => void;
  selectCircle: (id: string, multiSelect?: boolean) => void;
  clearConstraintSelection: () => void;

  // Sketch undo/redo
  sketchUndo: () => void;
  sketchRedo: () => void;
  canSketchUndo: () => boolean;
  canSketchRedo: () => boolean;
  clearSketchHistory: () => void;
}

// Helper to get a unique key for a plane (for grouping)
function getPlaneKey(plane: SketchPlane): string {
  if (typeof plane === 'string') {
    return plane;
  }
  return `face_${plane.faceIndex}`;
}

// Helper to check if two planes are the same
function planesEqual(a: SketchPlane, b: SketchPlane): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return a.faceIndex === b.faceIndex;
  }
  return false;
}

// Helper to get element center for positioning
function getElementCenter(element: SketchElement): Point {
  switch (element.type) {
    case 'rectangle':
      return {
        x: (element.start.x + element.end.x) / 2,
        y: (element.start.y + element.end.y) / 2,
      };
    case 'circle':
      return element.center;
    case 'line':
      return {
        x: (element.start.x + element.end.x) / 2,
        y: (element.start.y + element.end.y) / 2,
      };
    case 'hline':
      return {
        x: element.start.x + element.length / 2,
        y: element.start.y,
      };
    case 'vline':
      return {
        x: element.start.x,
        y: element.start.y + element.length / 2,
      };
    case 'arc':
      return element.center;
    case 'spline':
      if (element.points.length === 0) return { x: 0, y: 0 };
      const sumX = element.points.reduce((acc, p) => acc + p.x, 0);
      const sumY = element.points.reduce((acc, p) => acc + p.y, 0);
      return {
        x: sumX / element.points.length,
        y: sumY / element.points.length,
      };
  }
}

// Compute convex hull using Graham scan algorithm
function computeConvexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;

  // Find the bottom-most point (or left-most in case of tie)
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y < points[start].y ||
        (points[i].y === points[start].y && points[i].x < points[start].x)) {
      start = i;
    }
  }

  const pivot = points[start];

  // Sort points by polar angle with respect to pivot
  const sorted = points
    .filter((_, i) => i !== start)
    .map((p) => ({
      point: p,
      angle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
      dist: (p.x - pivot.x) ** 2 + (p.y - pivot.y) ** 2,
    }))
    .sort((a, b) => a.angle - b.angle || a.dist - b.dist)
    .map((item) => item.point);

  // Cross product to determine turn direction
  const cross = (o: Point, a: Point, b: Point): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Build hull
  const hull: Point[] = [pivot];
  for (const p of sorted) {
    while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
      hull.pop();
    }
    hull.push(p);
  }

  return hull;
}

// Helper to move an element by a delta
function moveElementByDelta(element: SketchElement, delta: Point): SketchElement {
  switch (element.type) {
    case 'rectangle':
      return {
        ...element,
        start: { x: element.start.x + delta.x, y: element.start.y + delta.y },
        end: { x: element.end.x + delta.x, y: element.end.y + delta.y },
      };
    case 'circle':
      return {
        ...element,
        center: { x: element.center.x + delta.x, y: element.center.y + delta.y },
      };
    case 'line':
      return {
        ...element,
        start: { x: element.start.x + delta.x, y: element.start.y + delta.y },
        end: { x: element.end.x + delta.x, y: element.end.y + delta.y },
      };
    case 'hline':
    case 'vline':
      return {
        ...element,
        start: { x: element.start.x + delta.x, y: element.start.y + delta.y },
      };
    case 'arc':
      return {
        ...element,
        center: { x: element.center.x + delta.x, y: element.center.y + delta.y },
      };
    case 'spline':
      return {
        ...element,
        points: element.points.map((p) => ({
          x: p.x + delta.x,
          y: p.y + delta.y,
        })),
      };
  }
}

// Generate code for a single element
// Uses element.depth for extrusion height (stored when element was committed)
function generateElementCode(
  element: SketchElement,
  shouldExtrude: boolean = true
): string {
  const isStandardPlane = typeof element.plane === 'string';
  const standardPlane = isStandardPlane ? (element.plane as string) : null;
  const facePlane = !isStandardPlane ? (element.plane as FacePlane) : null;

  // For cuts on faces, extrude in negative direction (into the solid)
  const isCutOnFace = !isStandardPlane && element.operation === 'cut';
  const effectiveHeight = isCutOnFace ? -element.depth : element.depth;

  // Helper to wrap drawing code with sketch method
  // For standard planes: drawX(...).sketchOnPlane("XY")
  // For face planes: sketchOnFace(drawX(...), result, faceIndex, offsetX, offsetY)
  // offsetX/Y are the element's position in sketch space (origin at corner, Y up)
  // Replicad's sketchOnFace uses center-based coordinates (origin at face center)
  const wrapWithSketch = (drawingCode: string, offsetX: number = 0, offsetY: number = 0): string => {
    if (isStandardPlane) {
      return `${drawingCode}.sketchOnPlane("${standardPlane}")`;
    } else {
      // Convert from corner-based (sketch) to center-based (Replicad) coordinates
      const faceWidth = facePlane!.faceWidth ?? 0;
      const faceHeight = facePlane!.faceHeight ?? 0;
      const centeredX = offsetX - faceWidth / 2;
      const centeredY = offsetY - faceHeight / 2;
      return `sketchOnFace(${drawingCode}, result, ${facePlane!.faceIndex}, ${centeredX.toFixed(2)}, ${centeredY.toFixed(2)})`;
    }
  };

  // Helper to add extrusion if needed
  const maybeExtrude = (sketchCode: string): string => {
    if (shouldExtrude) {
      return `${sketchCode}.extrude(${effectiveHeight.toFixed(2)})`;
    }
    return sketchCode;
  };

  switch (element.type) {
    case 'rectangle': {
      const width = Math.abs(element.end.x - element.start.x);
      const height = Math.abs(element.end.y - element.start.y);
      const centerX = (element.start.x + element.end.x) / 2;
      const centerY = (element.start.y + element.end.y) / 2;
      const drawing = `drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})`;
      return maybeExtrude(wrapWithSketch(drawing, centerX, centerY));
    }

    case 'circle': {
      const { center, radius } = element;
      const drawing = `drawCircle(${radius.toFixed(2)})`;
      return maybeExtrude(wrapWithSketch(drawing, center.x, center.y));
    }

    case 'line': {
      // Lines are wireframes, not extrudable unless closed
      const { start, end } = element;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const drawing = `draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}]).line(${dx.toFixed(2)}, ${dy.toFixed(2)}).done()`;
      return wrapWithSketch(drawing);
    }

    case 'hline': {
      const { start, length } = element;
      const drawing = `draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}]).hLine(${length.toFixed(2)}).done()`;
      return wrapWithSketch(drawing);
    }

    case 'vline': {
      const { start, length } = element;
      const drawing = `draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}]).vLine(${length.toFixed(2)}).done()`;
      return wrapWithSketch(drawing);
    }

    case 'arc': {
      const { center, radius, startAngle, endAngle } = element;
      const startX = center.x + radius * Math.cos(startAngle);
      const startY = center.y + radius * Math.sin(startAngle);
      const endX = center.x + radius * Math.cos(endAngle);
      const endY = center.y + radius * Math.sin(endAngle);
      const midAngle = (startAngle + endAngle) / 2;
      const midX = center.x + radius * Math.cos(midAngle);
      const midY = center.y + radius * Math.sin(midAngle);
      const drawing = `draw([${startX.toFixed(2)}, ${startY.toFixed(2)}]).threePointsArcTo([${endX.toFixed(2)}, ${endY.toFixed(2)}], [${midX.toFixed(2)}, ${midY.toFixed(2)}]).done()`;
      return wrapWithSketch(drawing);
    }

    case 'spline': {
      if (element.points.length < 2) {
        return `null // Spline with insufficient points`;
      }
      const [first, ...rest] = element.points;
      const splinePoints = rest.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
      const drawing = `draw([${first.x.toFixed(2)}, ${first.y.toFixed(2)}]).smoothSplineTo(${splinePoints}).done()`;
      return wrapWithSketch(drawing);
    }
  }
}

function generateReplicadCode(elements: SketchElement[]): string {
  if (elements.length === 0) {
    return `// Draw shapes on the sketcher
function main() {
  return null;
}
`;
  }

  // Filter to only committed elements for 3D generation
  const committedElements = elements.filter((e) => e.committed);

  if (committedElements.length === 0) {
    // No committed elements yet - show message but don't generate 3D
    return `// Draw shapes on the sketcher, then click Extrude or Cut to commit
function main() {
  return null;
}
`;
  }

  // Validate: First committed element must be on a standard plane
  const firstElement = committedElements[0];
  if (typeof firstElement.plane !== 'string') {
    return `// ERROR: First element must be on a standard plane (XY, XZ, or YZ)
function main() {
  return null;
}
`;
  }

  const lines: string[] = [];

  // Generate first element - this creates the initial result (always extruded)
  // Each element uses its own depth stored when committed
  const firstCode = generateElementCode(firstElement, true);
  lines.push(`  let result = ${firstCode};`);

  // Process remaining committed elements sequentially
  for (let i = 1; i < committedElements.length; i++) {
    const elem = committedElements[i];
    const elemCode = generateElementCode(elem, true);

    // Skip non-extrudable shapes for now (arc and spline are extrudable when closed)
    const isExtrudable = elem.type === 'rectangle' || elem.type === 'circle' || elem.type === 'arc' || elem.type === 'spline';
    if (!isExtrudable) {
      lines.push(`  // Skipping non-extrudable element: ${elem.type}`);
      continue;
    }

    if (elem.operation === 'cut') {
      lines.push(`\n  // Cut operation`);
      lines.push(`  result = result.cut(${elemCode});`);
    } else {
      lines.push(`\n  // Fuse operation`);
      lines.push(`  result = result.fuse(${elemCode});`);
    }
  }

  lines.push(`\n  return result;`);

  return `// Sequential shape building using sketchOnFace
function main() {
${lines.join('\n')}
}
`;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  elements: [],
  selectedElementIds: new Set(),
  currentTool: 'rectangle',

  code: `// Draw shapes on the sketcher
function main() {
  return null;
}
`,

  meshData: null,
  shapeData: null,
  isEvaluating: false,
  error: null,

  // 3D Selection state (always active)
  selectedFaceIndices: new Set(),
  selectedEdgeIndices: new Set(),
  hoveredFaceIndex: null,
  hoveredEdgeIndex: null,

  // Constraint selection state
  selectedPointIds: [],
  selectedLineIds: [],
  selectedCircleIds: [],

  planeDepths: new Map<string, number>(),
  defaultDepth: 10,
  planeOperations: new Map<string, OperationType>(),
  sketchPlane: 'XY' as SketchPlane,
  faceOutline: null,
  detectedClosedProfiles: [],
  lastUpdateSource: null,
  sketchHistory: {
    undoStack: [],
    redoStack: [],
    maxHistorySize: 50,
  },

  // Actions
  addElement: (elemWithoutPlane: NewElement) => {
    const state = get();
    const planeKey = getPlaneKey(state.sketchPlane);
    const operation = state.planeOperations.get(planeKey) || 'extrude';
    const depth = state.planeDepths.get(planeKey) ?? state.defaultDepth;
    const newElement = {
      ...elemWithoutPlane,
      plane: state.sketchPlane,
      selected: false,
      operation,
      committed: false, // New elements start as uncommitted (2D sketch only)
      depth, // Store current plane's depth (will be used when committed)
    } as SketchElement;
    const newElements = [...state.elements, newElement];
    const code = generateReplicadCode(newElements);

    // Push current state to undo stack before making changes
    const { sketchHistory } = state;
    const newUndoStack = [
      ...sketchHistory.undoStack,
      { elements: state.elements },
    ].slice(-sketchHistory.maxHistorySize);

    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...sketchHistory,
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
      },
    });
  },

  updateElement: (id, updates) => {
    const state = get();
    const newElements = state.elements.map((e) => {
      if (e.id === id) {
        const updated = { ...e, ...updates };
        return updated as typeof e;
      }
      return e;
    });
    const code = generateReplicadCode(newElements);

    // Push current state to undo stack before making changes
    const { sketchHistory } = state;
    const newUndoStack = [
      ...sketchHistory.undoStack,
      { elements: state.elements },
    ].slice(-sketchHistory.maxHistorySize);

    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...sketchHistory,
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
      },
    });
  },

  moveElement: (id, delta) => {
    const state = get();
    const newElements = state.elements.map((e) =>
      e.id === id ? moveElementByDelta(e, delta) : e
    );
    const code = generateReplicadCode(newElements);

    // Push current state to undo stack before making changes
    const { sketchHistory } = state;
    const newUndoStack = [
      ...sketchHistory.undoStack,
      { elements: state.elements },
    ].slice(-sketchHistory.maxHistorySize);

    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...sketchHistory,
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
      },
    });
  },

  removeElement: (id) => {
    const state = get();
    const newElements = state.elements.filter((e) => e.id !== id);
    const newSelectedIds = new Set(state.selectedElementIds);
    newSelectedIds.delete(id);
    const code = generateReplicadCode(newElements);

    // Push current state to undo stack before making changes
    const { sketchHistory } = state;
    const newUndoStack = [
      ...sketchHistory.undoStack,
      { elements: state.elements },
    ].slice(-sketchHistory.maxHistorySize);

    set({
      elements: newElements,
      selectedElementIds: newSelectedIds,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...sketchHistory,
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
      },
    });
  },

  selectElement: (id, multiSelect = false) =>
    set((state) => {
      const newSelectedIds = multiSelect
        ? new Set(state.selectedElementIds)
        : new Set<string>();

      if (state.selectedElementIds.has(id) && multiSelect) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }

      return {
        selectedElementIds: newSelectedIds,
        elements: state.elements.map((e) => {
          const updated = { ...e, selected: newSelectedIds.has(e.id) };
          return updated as typeof e;
        }),
      };
    }),

  deselectAll: () =>
    set((state) => ({
      selectedElementIds: new Set(),
      elements: state.elements.map((e) => {
        const updated = { ...e, selected: false };
        return updated as typeof e;
      }),
    })),

  setCurrentTool: (tool) => set({ currentTool: tool }),

  // Update from sketch changes
  updateFromSketch: (elements) => {
    const code = generateReplicadCode(elements);
    set({
      elements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  // Update from code changes
  updateFromCode: (code) => {
    const state = get();
    const elements = parseElementsFromCode(code, state.sketchPlane);

    set({
      code,
      elements,
      selectedElementIds: new Set(),
      lastUpdateSource: 'code',
    });
  },

  setMeshData: (meshData) => set({ meshData }),
  setShapeData: (shapeData) => {
    // Don't recalculate faceOutline when shape changes - it should be set by
    // startSketchOnFace or useFeatureSketchSync and preserved during editing.
    // Face indices change after features are applied, so looking up by index
    // would give the wrong face.

    set({
      shapeData,
      meshData: shapeData?.mesh ?? null,
      // Preserve existing faceOutline - don't overwrite it
      // Clear selection when shape changes
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
      hoveredFaceIndex: null,
      hoveredEdgeIndex: null,
    });
  },
  setIsEvaluating: (isEvaluating) => set({ isEvaluating }),
  setError: (error) => set({ error }),

  setPlaneDepth: (planeKey, depth) => {
    const state = get();
    const newPlaneDepths = new Map(state.planeDepths);
    newPlaneDepths.set(planeKey, depth);
    // Update depth for ALL elements on this plane (committed or not)
    // This allows real-time depth adjustment
    const newElements = state.elements.map((e) => {
      if (getPlaneKey(e.plane) === planeKey) {
        return { ...e, depth } as typeof e;
      }
      return e;
    });
    // Regenerate code with new depths
    const code = generateReplicadCode(newElements);
    set({
      planeDepths: newPlaneDepths,
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  getCurrentPlaneDepth: () => {
    const state = get();
    const planeKey = getPlaneKey(state.sketchPlane);
    return state.planeDepths.get(planeKey) ?? state.defaultDepth;
  },

  // Sketch plane actions
  setSketchPlane: (plane) => {
    // Just change the active plane for new elements, don't regenerate code
    // Clear face outline when switching to standard plane
    set({ sketchPlane: plane, faceOutline: null });
  },

  sketchOnFace: (faceIndex) => {
    const state = get();
    const face = state.shapeData?.individualFaces.find((f) => f.faceIndex === faceIndex);
    if (!face || !face.isPlanar) {
      console.warn('Cannot sketch on non-planar face');
      return;
    }

    // Compute face outline in 2D coordinates
    let faceOutline: Point[] | null = null;
    let faceWidth = 0;
    let faceHeight = 0;

    if (face.plane) {
      const { bounds2D } = face.plane;

      // Use actual boundary points from outerWire if available
      if (face.boundaryPoints2D && face.boundaryPoints2D.length >= 3) {
        faceOutline = [...face.boundaryPoints2D];

        // Get bounds from the boundary points
        const minX = Math.min(...faceOutline.map(p => p.x));
        const maxX = Math.max(...faceOutline.map(p => p.x));
        const minY = Math.min(...faceOutline.map(p => p.y));
        const maxY = Math.max(...faceOutline.map(p => p.y));

        faceWidth = maxX - minX;
        faceHeight = maxY - minY;

        console.log('[Store] Using actual boundary points from outerWire:', faceOutline.length, 'points');
      } else if (bounds2D) {
        // Fallback: use bounds2D to create a rectangular outline
        // Use raw face-local coordinates to match 3D space
        faceWidth = bounds2D.maxX - bounds2D.minX;
        faceHeight = bounds2D.maxY - bounds2D.minY;

        faceOutline = [
          { x: bounds2D.minX, y: bounds2D.minY },
          { x: bounds2D.maxX, y: bounds2D.minY },
          { x: bounds2D.maxX, y: bounds2D.maxY },
          { x: bounds2D.minX, y: bounds2D.maxY },
        ];

        console.log('[Store] Using bounds2D for rectangular outline');
      } else {
        // Last resort fallback: compute from mesh vertices with convex hull
        const { origin, xDir, normal } = face.plane;

        // Compute yDir = normal × xDir (to match Replicad's face coordinate system)
        const yDir: [number, number, number] = [
          normal[1] * xDir[2] - normal[2] * xDir[1],
          normal[2] * xDir[0] - normal[0] * xDir[2],
          normal[0] * xDir[1] - normal[1] * xDir[0],
        ];

        // Project all vertices to 2D and find unique points
        const points2D: Point[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < face.vertices.length; i += 3) {
          const vx = face.vertices[i] - origin[0];
          const vy = face.vertices[i + 1] - origin[1];
          const vz = face.vertices[i + 2] - origin[2];

          // Project onto face coordinate system
          const localX = vx * xDir[0] + vy * xDir[1] + vz * xDir[2];
          const localY = vx * yDir[0] + vy * yDir[1] + vz * yDir[2];

          // Round to avoid floating point duplicates
          const key = `${localX.toFixed(4)},${localY.toFixed(4)}`;
          if (!seen.has(key)) {
            seen.add(key);
            points2D.push({ x: localX, y: localY });
          }
        }

        // Compute convex hull to get the outline
        if (points2D.length >= 3) {
          const hull = computeConvexHull(points2D);

          // Get bounds
          const minX = Math.min(...hull.map(p => p.x));
          const maxX = Math.max(...hull.map(p => p.x));
          const minY = Math.min(...hull.map(p => p.y));
          const maxY = Math.max(...hull.map(p => p.y));

          faceWidth = maxX - minX;
          faceHeight = maxY - minY;

          // Use raw face-local coordinates to match 3D space
          faceOutline = hull;

          console.log('[Store] Fallback: using convex hull from mesh vertices');
        }
      }
    }

    const facePlane: FacePlane = {
      type: 'face',
      faceIndex,
      faceWidth,
      faceHeight,
    };

    // Set the new plane as active with the computed outline
    set({
      sketchPlane: facePlane,
      faceOutline,
      // Clear 3D selection
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
    });
  },

  setPlaneOperation: (planeKey, operation) => {
    const state = get();
    const newPlaneOperations = new Map(state.planeOperations);
    newPlaneOperations.set(planeKey, operation);
    // Get the current depth for this plane
    const depth = state.planeDepths.get(planeKey) ?? state.defaultDepth;
    // Update all uncommitted elements on this plane: set operation, depth, and commit them
    const newElements = state.elements.map((e) => {
      if (getPlaneKey(e.plane) === planeKey && !e.committed) {
        // Mark as committed when user explicitly clicks extrude/cut
        // Use the current plane's depth
        return { ...e, operation, depth, committed: true } as typeof e;
      }
      return e;
    });
    const code = generateReplicadCode(newElements);
    set({
      planeOperations: newPlaneOperations,
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  getCurrentPlaneOperation: () => {
    const state = get();
    const planeKey = getPlaneKey(state.sketchPlane);
    return state.planeOperations.get(planeKey) || 'extrude';
  },

  // 3D Selection actions (always active for both faces and edges)
  selectFace: (index, multiSelect = false) =>
    set((state) => {
      const newSelectedFaces = multiSelect
        ? new Set(state.selectedFaceIndices)
        : new Set<number>();

      if (state.selectedFaceIndices.has(index) && multiSelect) {
        newSelectedFaces.delete(index);
      } else {
        newSelectedFaces.add(index);
      }

      return { selectedFaceIndices: newSelectedFaces };
    }),

  selectEdge: (index, multiSelect = false) =>
    set((state) => {
      const newSelectedEdges = multiSelect
        ? new Set(state.selectedEdgeIndices)
        : new Set<number>();

      if (state.selectedEdgeIndices.has(index) && multiSelect) {
        newSelectedEdges.delete(index);
      } else {
        newSelectedEdges.add(index);
      }

      return { selectedEdgeIndices: newSelectedEdges };
    }),

  setHoveredFace: (index) => set({ hoveredFaceIndex: index }),
  setHoveredEdge: (index) => set({ hoveredEdgeIndex: index }),

  clearSelection: () =>
    set({
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
      hoveredFaceIndex: null,
      hoveredEdgeIndex: null,
    }),

  // Closed profile detection
  setDetectedClosedProfiles: (profiles) => set({ detectedClosedProfiles: profiles }),

  // Constraint selection actions
  selectPoint: (id, multiSelect = false) =>
    set((state) => {
      if (multiSelect) {
        // Add to selection or remove if already selected
        const alreadySelected = state.selectedPointIds.includes(id);
        const newSelectedPointIds = alreadySelected
          ? state.selectedPointIds.filter((pId) => pId !== id)
          : [...state.selectedPointIds, id];
        return { selectedPointIds: newSelectedPointIds };
      } else {
        // Single select - replace selection
        return { selectedPointIds: [id] };
      }
    }),

  selectLine: (id, multiSelect = false) =>
    set((state) => {
      if (multiSelect) {
        // Add to selection or remove if already selected
        const alreadySelected = state.selectedLineIds.includes(id);
        const newSelectedLineIds = alreadySelected
          ? state.selectedLineIds.filter((lId) => lId !== id)
          : [...state.selectedLineIds, id];
        return { selectedLineIds: newSelectedLineIds };
      } else {
        // Single select - replace selection
        return { selectedLineIds: [id] };
      }
    }),

  selectCircle: (id, multiSelect = false) =>
    set((state) => {
      if (multiSelect) {
        // Add to selection or remove if already selected
        const alreadySelected = state.selectedCircleIds.includes(id);
        const newSelectedCircleIds = alreadySelected
          ? state.selectedCircleIds.filter((cId) => cId !== id)
          : [...state.selectedCircleIds, id];
        return { selectedCircleIds: newSelectedCircleIds };
      } else {
        // Single select - replace selection
        return { selectedCircleIds: [id] };
      }
    }),

  clearConstraintSelection: () =>
    set({
      selectedPointIds: [],
      selectedLineIds: [],
      selectedCircleIds: [],
    }),

  // Sketch undo/redo
  sketchUndo: () => {
    const state = get();
    const { undoStack, redoStack, maxHistorySize } = state.sketchHistory;

    if (undoStack.length === 0) return;

    // Pop from undo stack
    const previousState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    // Push current state to redo stack
    const newRedoStack = [
      ...redoStack,
      { elements: state.elements },
    ].slice(-maxHistorySize);

    // Restore previous elements
    const code = generateReplicadCode(previousState.elements);
    set({
      elements: previousState.elements,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...state.sketchHistory,
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      },
    });
  },

  sketchRedo: () => {
    const state = get();
    const { undoStack, redoStack, maxHistorySize } = state.sketchHistory;

    if (redoStack.length === 0) return;

    // Pop from redo stack
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    // Push current state to undo stack
    const newUndoStack = [
      ...undoStack,
      { elements: state.elements },
    ].slice(-maxHistorySize);

    // Apply next state
    const code = generateReplicadCode(nextState.elements);
    set({
      elements: nextState.elements,
      code,
      lastUpdateSource: 'sketch',
      sketchHistory: {
        ...state.sketchHistory,
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      },
    });
  },

  canSketchUndo: () => {
    return get().sketchHistory.undoStack.length > 0;
  },

  canSketchRedo: () => {
    return get().sketchHistory.redoStack.length > 0;
  },

  clearSketchHistory: () => {
    set((state) => ({
      sketchHistory: {
        ...state.sketchHistory,
        undoStack: [],
        redoStack: [],
      },
    }));
  },
}));

// Helper to get the orientation of a plane (which standard plane it's parallel to)
// Returns 'XY', 'XZ', 'YZ', or null if unknown
function getPlaneOrientation(
  plane: SketchPlane,
  shapeData: ShapeData | null
): 'XY' | 'XZ' | 'YZ' | null {
  if (typeof plane === 'string') {
    return plane;
  }

  // For face planes, look up the face normal
  if (shapeData) {
    const face = shapeData.individualFaces.find((f) => f.faceIndex === plane.faceIndex);
    if (face?.plane?.normal) {
      const [nx, ny, nz] = face.plane.normal;
      const absX = Math.abs(nx);
      const absY = Math.abs(ny);
      const absZ = Math.abs(nz);

      // Determine which axis the normal is most aligned with
      // Normal along Z means XY plane, etc.
      const threshold = 0.9; // Tolerance for "aligned"
      if (absZ > threshold && absX < 0.1 && absY < 0.1) {
        return 'XY'; // Normal along Z
      } else if (absY > threshold && absX < 0.1 && absZ < 0.1) {
        return 'XZ'; // Normal along Y
      } else if (absX > threshold && absY < 0.1 && absZ < 0.1) {
        return 'YZ'; // Normal along X
      }
    }
  }

  return null; // Unknown orientation (non-axis-aligned face)
}

// Export helpers for use elsewhere
export { planesEqual, getPlaneKey, getElementCenter, getPlaneOrientation };
