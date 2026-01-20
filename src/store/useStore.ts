import { create } from 'zustand';
import type { Rectangle, MeshData, ShapeData, SelectionMode } from '../types';
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

  // Sync tracking (to prevent infinite loops)
  lastUpdateSource: UpdateSource;

  // Actions
  addRectangle: (rect: Rectangle) => void;
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

  // 3D Selection actions
  setSelectionMode: (mode: SelectionMode) => void;
  selectFace: (index: number, multiSelect?: boolean) => void;
  selectEdge: (index: number, multiSelect?: boolean) => void;
  setHoveredFace: (index: number | null) => void;
  setHoveredEdge: (index: number | null) => void;
  clearSelection: () => void;
}

function generateReplicadCode(rectangles: Rectangle[], extrusionHeight: number): string {
  if (rectangles.length === 0) {
    return `// Draw rectangles on the sketcher
function main() {
  return null;
}
`;
  }

  const rectCode = rectangles.map((rect, index) => {
    const width = Math.abs(rect.end.x - rect.start.x);
    const height = Math.abs(rect.end.y - rect.start.y);
    const centerX = (rect.start.x + rect.end.x) / 2;
    const centerY = (rect.start.y + rect.end.y) / 2;

    return `  // Rectangle ${index + 1}
  const rect${index + 1} = drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})
    .sketchOnPlane("XY")
    .extrude(${extrusionHeight})
    .translate([${centerX.toFixed(2)}, ${centerY.toFixed(2)}, 0]);`;
  }).join('\n\n');

  const fuseCode = rectangles.length > 1
    ? `\n\n  // Combine all shapes\n  let result = rect1;\n${rectangles.slice(1).map((_, i) => `  result = result.fuse(rect${i + 2});`).join('\n')}\n  return result;`
    : `\n\n  return rect1;`;

  return `// Available: drawRectangle, drawCircle, drawRoundedRectangle, draw, makeBox, etc.
function main() {
${rectCode}${fuseCode}
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
  lastUpdateSource: null,

  // Actions
  addRectangle: (rect) => {
    const state = get();
    const newRectangles = [...state.rectangles, rect];
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
    const rectangles = parseRectanglesFromCode(code);
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
