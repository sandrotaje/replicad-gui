import { create } from 'zustand';
import type { Rectangle, MeshData, ShapeData, SelectionMode, SketchPlane, FacePlane } from '../types';
import { parseRectanglesFromCode, parseExtrusionHeightFromCode } from '../utils/codeParser';

type UpdateSource = 'sketch' | 'code' | null;

interface AppState {
  // Sketch state
  rectangles: Rectangle[];
  selectedRectangleIds: Set<string>;
  currentTool: 'select' | 'rectangle';

  // Code state
  code: string;

  // 3D state
  meshData: MeshData | null;
  shapeData: ShapeData | null;
  isEvaluating: boolean;
  error: string | null;

  // 3D Selection state
  selectionMode: SelectionMode;
  selectedFaceIndices: Set<number>;
  selectedEdgeIndices: Set<number>;
  hoveredFaceIndex: number | null;
  hoveredEdgeIndex: number | null;

  // Extrusion state
  extrusionHeight: number;

  // Sketch plane state (current plane for new rectangles)
  sketchPlane: SketchPlane;

  // Sync tracking (to prevent infinite loops)
  lastUpdateSource: UpdateSource;

  // Actions
  addRectangle: (rect: Omit<Rectangle, 'plane'>) => void;
  updateRectangle: (id: string, updates: Partial<Rectangle>) => void;
  removeRectangle: (id: string) => void;
  selectRectangle: (id: string, multiSelect?: boolean) => void;
  deselectAll: () => void;
  setCurrentTool: (tool: 'select' | 'rectangle') => void;

  // Updates from sketch (will regenerate code)
  updateFromSketch: (rectangles: Rectangle[], extrusionHeight?: number) => void;

  // Updates from code (will update sketch)
  updateFromCode: (code: string) => void;

  setMeshData: (meshData: MeshData | null) => void;
  setShapeData: (shapeData: ShapeData | null) => void;
  setIsEvaluating: (isEvaluating: boolean) => void;
  setError: (error: string | null) => void;
  setExtrusionHeight: (height: number) => void;

  // Sketch plane actions
  setSketchPlane: (plane: SketchPlane) => void;
  sketchOnFace: (faceIndex: number) => void;

  // 3D Selection actions
  setSelectionMode: (mode: SelectionMode) => void;
  selectFace: (index: number, multiSelect?: boolean) => void;
  selectEdge: (index: number, multiSelect?: boolean) => void;
  setHoveredFace: (index: number | null) => void;
  setHoveredEdge: (index: number | null) => void;
  clearSelection: () => void;
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

function generateReplicadCode(rectangles: Rectangle[], extrusionHeight: number): string {
  if (rectangles.length === 0) {
    return `// Draw rectangles on the sketcher
function main() {
  return null;
}
`;
  }

  // Group rectangles by their plane
  const planeGroups = new Map<string, { plane: SketchPlane; rects: Rectangle[] }>();

  for (const rect of rectangles) {
    const key = getPlaneKey(rect.plane);
    if (!planeGroups.has(key)) {
      planeGroups.set(key, { plane: rect.plane, rects: [] });
    }
    planeGroups.get(key)!.rects.push(rect);
  }

  const allShapeNames: string[] = [];
  const codeBlocks: string[] = [];
  let shapeCounter = 1;

  // Generate code for each plane group
  for (const [, { plane, rects }] of planeGroups) {
    const isStandardPlane = typeof plane === 'string';

    // Generate plane definition for face planes
    let planeVarName = '';
    if (!isStandardPlane) {
      const facePlane = plane as FacePlane;
      planeVarName = `facePlane${facePlane.faceIndex}`;
      codeBlocks.push(`  // Plane for face ${facePlane.faceIndex}
  const ${planeVarName} = new Plane(
    [${facePlane.origin.map(n => n.toFixed(4)).join(', ')}],
    [${facePlane.xDir.map(n => n.toFixed(4)).join(', ')}],
    [${facePlane.normal.map(n => n.toFixed(4)).join(', ')}]
  );`);
    }

    for (const rect of rects) {
      const shapeName = `shape${shapeCounter}`;
      allShapeNames.push(shapeName);

      const width = Math.abs(rect.end.x - rect.start.x);
      const height = Math.abs(rect.end.y - rect.start.y);
      const centerX = (rect.start.x + rect.end.x) / 2;
      const centerY = (rect.start.y + rect.end.y) / 2;

      if (isStandardPlane) {
        const standardPlane = plane as string;
        const translateOffset = standardPlane === 'XY' ? `[${centerX.toFixed(2)}, ${centerY.toFixed(2)}, 0]`
          : standardPlane === 'XZ' ? `[${centerX.toFixed(2)}, 0, ${centerY.toFixed(2)}]`
          : `[0, ${centerX.toFixed(2)}, ${centerY.toFixed(2)}]`;

        codeBlocks.push(`  // Shape ${shapeCounter} on ${standardPlane} plane
  const ${shapeName} = drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})
    .sketchOnPlane("${standardPlane}")
    .extrude(${extrusionHeight})
    .translate(${translateOffset});`);
      } else {
        // For face planes, sketchOnPlane(plane) already positions the sketch at the plane's origin
        // So the translation should only include the local offset within the plane, not the origin
        const facePlane = plane as FacePlane;
        const [dx, dy, dz] = facePlane.xDir;
        const [nx, ny, nz] = facePlane.normal;
        // Calculate Y direction as cross product of normal and xDir
        const yDirX = ny * dz - nz * dy;
        const yDirY = nz * dx - nx * dz;
        const yDirZ = nx * dy - ny * dx;

        // Translate only by the local offset (plane origin is already handled by sketchOnPlane)
        const translateX = centerX * dx + centerY * yDirX;
        const translateY = centerX * dy + centerY * yDirY;
        const translateZ = centerX * dz + centerY * yDirZ;

        codeBlocks.push(`  // Shape ${shapeCounter} on face ${facePlane.faceIndex}
  const ${shapeName} = drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})
    .sketchOnPlane(${planeVarName})
    .extrude(${extrusionHeight})
    .translate([${translateX.toFixed(2)}, ${translateY.toFixed(2)}, ${translateZ.toFixed(2)}]);`);
      }

      shapeCounter++;
    }
  }

  // Combine all shapes
  let fuseCode: string;
  if (allShapeNames.length === 1) {
    fuseCode = `\n  return ${allShapeNames[0]};`;
  } else {
    fuseCode = `\n  // Combine all shapes
  let result = ${allShapeNames[0]};
${allShapeNames.slice(1).map(name => `  result = result.fuse(${name});`).join('\n')}
  return result;`;
  }

  return `// Available: drawRectangle, drawCircle, drawRoundedRectangle, draw, makeBox, Plane, etc.
function main() {
${codeBlocks.join('\n\n')}
${fuseCode}
}
`;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  rectangles: [],
  selectedRectangleIds: new Set(),
  currentTool: 'rectangle',

  code: `// Draw rectangles on the sketcher
function main() {
  return null;
}
`,

  meshData: null,
  shapeData: null,
  isEvaluating: false,
  error: null,

  // 3D Selection state
  selectionMode: 'none',
  selectedFaceIndices: new Set(),
  selectedEdgeIndices: new Set(),
  hoveredFaceIndex: null,
  hoveredEdgeIndex: null,

  extrusionHeight: 10,
  sketchPlane: 'XY' as SketchPlane,
  lastUpdateSource: null,

  // Actions
  addRectangle: (rect) => {
    const state = get();
    // Add the current sketchPlane to the rectangle
    const newRect: Rectangle = { ...rect, plane: state.sketchPlane };
    const newRectangles = [...state.rectangles, newRect];
    const code = generateReplicadCode(newRectangles, state.extrusionHeight);
    set({
      rectangles: newRectangles,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  updateRectangle: (id, updates) => {
    const state = get();
    const newRectangles = state.rectangles.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    );
    const code = generateReplicadCode(newRectangles, state.extrusionHeight);
    set({
      rectangles: newRectangles,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  removeRectangle: (id) => {
    const state = get();
    const newRectangles = state.rectangles.filter((r) => r.id !== id);
    const newSelectedIds = new Set(state.selectedRectangleIds);
    newSelectedIds.delete(id);
    const code = generateReplicadCode(newRectangles, state.extrusionHeight);
    set({
      rectangles: newRectangles,
      selectedRectangleIds: newSelectedIds,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  selectRectangle: (id, multiSelect = false) => set((state) => {
    const newSelectedIds = multiSelect
      ? new Set(state.selectedRectangleIds)
      : new Set<string>();

    if (state.selectedRectangleIds.has(id) && multiSelect) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }

    return {
      selectedRectangleIds: newSelectedIds,
      rectangles: state.rectangles.map((r) => ({
        ...r,
        selected: newSelectedIds.has(r.id),
      })),
    };
  }),

  deselectAll: () => set((state) => ({
    selectedRectangleIds: new Set(),
    rectangles: state.rectangles.map((r) => ({ ...r, selected: false })),
  })),

  setCurrentTool: (tool) => set({ currentTool: tool }),

  // Update from sketch changes
  updateFromSketch: (rectangles, extrusionHeight) => {
    const state = get();
    const newExtrusionHeight = extrusionHeight ?? state.extrusionHeight;
    const code = generateReplicadCode(rectangles, newExtrusionHeight);
    set({
      rectangles,
      extrusionHeight: newExtrusionHeight,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  // Update from code changes
  updateFromCode: (code) => {
    const state = get();
    const rectangles = parseRectanglesFromCode(code, state.sketchPlane);
    const extrusionHeight = parseExtrusionHeightFromCode(code);

    set({
      code,
      rectangles,
      selectedRectangleIds: new Set(),
      ...(extrusionHeight !== null ? { extrusionHeight } : {}),
      lastUpdateSource: 'code',
    });
  },

  setMeshData: (meshData) => set({ meshData }),
  setShapeData: (shapeData) => set({
    shapeData,
    meshData: shapeData?.mesh ?? null,
    // Clear selection when shape changes
    selectedFaceIndices: new Set(),
    selectedEdgeIndices: new Set(),
    hoveredFaceIndex: null,
    hoveredEdgeIndex: null,
  }),
  setIsEvaluating: (isEvaluating) => set({ isEvaluating }),
  setError: (error) => set({ error }),

  setExtrusionHeight: (height) => {
    const state = get();
    const code = generateReplicadCode(state.rectangles, height);
    set({
      extrusionHeight: height,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  // Sketch plane actions
  setSketchPlane: (plane) => {
    // Just change the active plane for new rectangles, don't regenerate code
    set({ sketchPlane: plane });
  },

  sketchOnFace: (faceIndex) => {
    const state = get();
    const face = state.shapeData?.individualFaces.find(f => f.faceIndex === faceIndex);
    if (!face || !face.isPlanar || !face.plane) {
      console.warn('Cannot sketch on non-planar face or face without plane info');
      return;
    }

    const facePlane: FacePlane = {
      type: 'face',
      faceIndex,
      origin: face.plane.origin,
      xDir: face.plane.xDir,
      normal: face.plane.normal,
    };

    // Just set the new plane as active - existing rectangles keep their planes
    set({
      sketchPlane: facePlane,
      // Clear 3D selection
      selectionMode: 'none',
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
    });
  },

  // 3D Selection actions
  setSelectionMode: (mode) => set({
    selectionMode: mode,
    // Clear selection when mode changes
    selectedFaceIndices: new Set(),
    selectedEdgeIndices: new Set(),
    hoveredFaceIndex: null,
    hoveredEdgeIndex: null,
  }),

  selectFace: (index, multiSelect = false) => set((state) => {
    if (state.selectionMode !== 'face') return state;
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

  selectEdge: (index, multiSelect = false) => set((state) => {
    if (state.selectionMode !== 'edge') return state;
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

  clearSelection: () => set({
    selectedFaceIndices: new Set(),
    selectedEdgeIndices: new Set(),
    hoveredFaceIndex: null,
    hoveredEdgeIndex: null,
  }),
}));

// Export helpers for use elsewhere
export { planesEqual, getPlaneKey };
