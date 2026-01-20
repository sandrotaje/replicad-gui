import { create } from 'zustand';
import type {
  SketchElement,
  RectangleElement,
  MeshData,
  ShapeData,
  SelectionMode,
  SketchPlane,
  FacePlane,
  SketchTool,
  Point,
} from '../types';
import { parseElementsFromCode, parseExtrusionHeightFromCode } from '../utils/codeParser';

// Type for adding elements - uses discriminated union properly
type NewElement = Omit<RectangleElement, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'circle' }, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'line' }, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'hline' }, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'vline' }, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'arc' }, 'plane' | 'selected'> |
  Omit<SketchElement & { type: 'spline' }, 'plane' | 'selected'>;

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

  // 3D Selection state
  selectionMode: SelectionMode;
  selectedFaceIndices: Set<number>;
  selectedEdgeIndices: Set<number>;
  hoveredFaceIndex: number | null;
  hoveredEdgeIndex: number | null;

  // Extrusion state
  extrusionHeight: number;

  // Sketch plane state (current plane for new elements)
  sketchPlane: SketchPlane;

  // Sync tracking (to prevent infinite loops)
  lastUpdateSource: UpdateSource;

  // Actions
  addElement: (element: NewElement) => void;
  updateElement: (id: string, updates: Partial<SketchElement>) => void;
  moveElement: (id: string, delta: Point) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string, multiSelect?: boolean) => void;
  deselectAll: () => void;
  setCurrentTool: (tool: SketchTool) => void;

  // Updates from sketch (will regenerate code)
  updateFromSketch: (elements: SketchElement[], extrusionHeight?: number) => void;

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

  // Legacy compatibility (for gradual migration)
  rectangles: RectangleElement[];
  selectedRectangleIds: Set<string>;
  addRectangle: (rect: Omit<RectangleElement, 'plane' | 'selected' | 'type'>) => void;
  updateRectangle: (id: string, updates: Partial<RectangleElement>) => void;
  removeRectangle: (id: string) => void;
  selectRectangle: (id: string, multiSelect?: boolean) => void;
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
function generateElementCode(
  element: SketchElement,
  shapeName: string,
  extrusionHeight: number,
  planeVarName: string | null
): string {
  const isStandardPlane = typeof element.plane === 'string';
  const standardPlane = isStandardPlane ? (element.plane as string) : null;

  const getTranslateOffset = (centerX: number, centerY: number): string => {
    if (isStandardPlane) {
      return standardPlane === 'XY'
        ? `[${centerX.toFixed(2)}, ${centerY.toFixed(2)}, 0]`
        : standardPlane === 'XZ'
          ? `[${centerX.toFixed(2)}, 0, ${centerY.toFixed(2)}]`
          : `[0, ${centerX.toFixed(2)}, ${centerY.toFixed(2)}]`;
    } else {
      const facePlane = element.plane as FacePlane;
      const [dx, dy, dz] = facePlane.xDir;
      const [nx, ny, nz] = facePlane.normal;
      const yDirX = ny * dz - nz * dy;
      const yDirY = nz * dx - nx * dz;
      const yDirZ = nx * dy - ny * dx;
      const translateX = centerX * dx + centerY * yDirX;
      const translateY = centerX * dy + centerY * yDirY;
      const translateZ = centerX * dz + centerY * yDirZ;
      return `[${translateX.toFixed(2)}, ${translateY.toFixed(2)}, ${translateZ.toFixed(2)}]`;
    }
  };

  const planeArg = isStandardPlane ? `"${standardPlane}"` : planeVarName;

  switch (element.type) {
    case 'rectangle': {
      const width = Math.abs(element.end.x - element.start.x);
      const height = Math.abs(element.end.y - element.start.y);
      const centerX = (element.start.x + element.end.x) / 2;
      const centerY = (element.start.y + element.end.y) / 2;
      return `  const ${shapeName} = drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})
    .sketchOnPlane(${planeArg})
    .extrude(${extrusionHeight})
    .translate(${getTranslateOffset(centerX, centerY)});`;
    }

    case 'circle': {
      const { center, radius } = element;
      return `  const ${shapeName} = drawCircle(${radius.toFixed(2)})
    .sketchOnPlane(${planeArg})
    .extrude(${extrusionHeight})
    .translate(${getTranslateOffset(center.x, center.y)});`;
    }

    case 'line': {
      // Lines are wireframes, not extrudable unless closed
      const { start, end } = element;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      return `  // Line from (${start.x.toFixed(2)}, ${start.y.toFixed(2)}) to (${end.x.toFixed(2)}, ${end.y.toFixed(2)})
  const ${shapeName} = draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}])
    .line(${dx.toFixed(2)}, ${dy.toFixed(2)})
    .done()
    .sketchOnPlane(${planeArg});`;
    }

    case 'hline': {
      const { start, length } = element;
      return `  // Horizontal line from (${start.x.toFixed(2)}, ${start.y.toFixed(2)}), length ${length.toFixed(2)}
  const ${shapeName} = draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}])
    .hLine(${length.toFixed(2)})
    .done()
    .sketchOnPlane(${planeArg});`;
    }

    case 'vline': {
      const { start, length } = element;
      return `  // Vertical line from (${start.x.toFixed(2)}, ${start.y.toFixed(2)}), length ${length.toFixed(2)}
  const ${shapeName} = draw([${start.x.toFixed(2)}, ${start.y.toFixed(2)}])
    .vLine(${length.toFixed(2)})
    .done()
    .sketchOnPlane(${planeArg});`;
    }

    case 'arc': {
      const { center, radius, startAngle, endAngle } = element;
      const startX = center.x + radius * Math.cos(startAngle);
      const startY = center.y + radius * Math.sin(startAngle);
      const endX = center.x + radius * Math.cos(endAngle);
      const endY = center.y + radius * Math.sin(endAngle);
      // Use three-point arc: start, middle, end
      const midAngle = (startAngle + endAngle) / 2;
      const midX = center.x + radius * Math.cos(midAngle);
      const midY = center.y + radius * Math.sin(midAngle);
      return `  // Arc centered at (${center.x.toFixed(2)}, ${center.y.toFixed(2)}), radius ${radius.toFixed(2)}
  const ${shapeName} = draw([${startX.toFixed(2)}, ${startY.toFixed(2)}])
    .threePointsArcTo([${endX.toFixed(2)}, ${endY.toFixed(2)}], [${midX.toFixed(2)}, ${midY.toFixed(2)}])
    .done()
    .sketchOnPlane(${planeArg});`;
    }

    case 'spline': {
      if (element.points.length < 2) {
        return `  // Spline with insufficient points
  const ${shapeName} = null;`;
      }
      const [first, ...rest] = element.points;
      const splinePoints = rest.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
      return `  // Spline through ${element.points.length} points
  const ${shapeName} = draw([${first.x.toFixed(2)}, ${first.y.toFixed(2)}])
    .smoothSplineTo(${splinePoints})
    .done()
    .sketchOnPlane(${planeArg});`;
    }
  }
}

function generateReplicadCode(elements: SketchElement[], extrusionHeight: number): string {
  if (elements.length === 0) {
    return `// Draw shapes on the sketcher
function main() {
  return null;
}
`;
  }

  // Group elements by their plane
  const planeGroups = new Map<string, { plane: SketchPlane; elems: SketchElement[] }>();

  for (const elem of elements) {
    const key = getPlaneKey(elem.plane);
    if (!planeGroups.has(key)) {
      planeGroups.set(key, { plane: elem.plane, elems: [] });
    }
    planeGroups.get(key)!.elems.push(elem);
  }

  const allShapeNames: string[] = [];
  const codeBlocks: string[] = [];
  let shapeCounter = 1;

  // Generate code for each plane group
  for (const [, { plane, elems }] of planeGroups) {
    const isStandardPlane = typeof plane === 'string';

    // Generate plane definition for face planes
    let planeVarName: string | null = null;
    if (!isStandardPlane) {
      const facePlane = plane as FacePlane;
      planeVarName = `facePlane${facePlane.faceIndex}`;
      codeBlocks.push(`  // Plane for face ${facePlane.faceIndex}
  const ${planeVarName} = new Plane(
    [${facePlane.origin.map((n) => n.toFixed(4)).join(', ')}],
    [${facePlane.xDir.map((n) => n.toFixed(4)).join(', ')}],
    [${facePlane.normal.map((n) => n.toFixed(4)).join(', ')}]
  );`);
    }

    for (const elem of elems) {
      const shapeName = `shape${shapeCounter}`;

      // Only add extrudable shapes to the fusion list
      const isExtrudable = elem.type === 'rectangle' || elem.type === 'circle';
      if (isExtrudable) {
        allShapeNames.push(shapeName);
      }

      const elemCode = generateElementCode(elem, shapeName, extrusionHeight, planeVarName);
      codeBlocks.push(elemCode);
      shapeCounter++;
    }
  }

  // Combine all extrudable shapes
  let fuseCode: string;
  if (allShapeNames.length === 0) {
    fuseCode = `\n  return null; // No extrudable shapes`;
  } else if (allShapeNames.length === 1) {
    fuseCode = `\n  return ${allShapeNames[0]};`;
  } else {
    fuseCode = `\n  // Combine all shapes
  let result = ${allShapeNames[0]};
${allShapeNames.slice(1).map((name) => `  result = result.fuse(${name});`).join('\n')}
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

  // 3D Selection state
  selectionMode: 'none',
  selectedFaceIndices: new Set(),
  selectedEdgeIndices: new Set(),
  hoveredFaceIndex: null,
  hoveredEdgeIndex: null,

  extrusionHeight: 10,
  sketchPlane: 'XY' as SketchPlane,
  lastUpdateSource: null,

  // Legacy compatibility - derived from elements
  get rectangles() {
    return get().elements.filter((e): e is RectangleElement => e.type === 'rectangle');
  },
  get selectedRectangleIds() {
    return get().selectedElementIds;
  },

  // Actions
  addElement: (elemWithoutPlane: NewElement) => {
    const state = get();
    const newElement = {
      ...elemWithoutPlane,
      plane: state.sketchPlane,
      selected: false,
    } as SketchElement;
    const newElements = [...state.elements, newElement];
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
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
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  moveElement: (id, delta) => {
    const state = get();
    const newElements = state.elements.map((e) =>
      e.id === id ? moveElementByDelta(e, delta) : e
    );
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  removeElement: (id) => {
    const state = get();
    const newElements = state.elements.filter((e) => e.id !== id);
    const newSelectedIds = new Set(state.selectedElementIds);
    newSelectedIds.delete(id);
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      selectedElementIds: newSelectedIds,
      code,
      lastUpdateSource: 'sketch',
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
  updateFromSketch: (elements, extrusionHeight) => {
    const state = get();
    const newExtrusionHeight = extrusionHeight ?? state.extrusionHeight;
    const code = generateReplicadCode(elements, newExtrusionHeight);
    set({
      elements,
      extrusionHeight: newExtrusionHeight,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  // Update from code changes
  updateFromCode: (code) => {
    const state = get();
    const elements = parseElementsFromCode(code, state.sketchPlane);
    const extrusionHeight = parseExtrusionHeightFromCode(code);

    set({
      code,
      elements,
      selectedElementIds: new Set(),
      ...(extrusionHeight !== null ? { extrusionHeight } : {}),
      lastUpdateSource: 'code',
    });
  },

  setMeshData: (meshData) => set({ meshData }),
  setShapeData: (shapeData) =>
    set({
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
    const code = generateReplicadCode(state.elements, height);
    set({
      extrusionHeight: height,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  // Sketch plane actions
  setSketchPlane: (plane) => {
    // Just change the active plane for new elements, don't regenerate code
    set({ sketchPlane: plane });
  },

  sketchOnFace: (faceIndex) => {
    const state = get();
    const face = state.shapeData?.individualFaces.find((f) => f.faceIndex === faceIndex);
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

    // Just set the new plane as active - existing elements keep their planes
    set({
      sketchPlane: facePlane,
      // Clear 3D selection
      selectionMode: 'none',
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
    });
  },

  // 3D Selection actions
  setSelectionMode: (mode) =>
    set({
      selectionMode: mode,
      // Clear selection when mode changes
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
      hoveredFaceIndex: null,
      hoveredEdgeIndex: null,
    }),

  selectFace: (index, multiSelect = false) =>
    set((state) => {
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

  selectEdge: (index, multiSelect = false) =>
    set((state) => {
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

  clearSelection: () =>
    set({
      selectedFaceIndices: new Set(),
      selectedEdgeIndices: new Set(),
      hoveredFaceIndex: null,
      hoveredEdgeIndex: null,
    }),

  // Legacy compatibility methods
  addRectangle: (rect) => {
    const state = get();
    const newElement: RectangleElement = {
      ...rect,
      type: 'rectangle',
      plane: state.sketchPlane,
      selected: false,
    };
    const newElements = [...state.elements, newElement];
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  updateRectangle: (id, updates) => {
    const state = get();
    const newElements = state.elements.map((e) =>
      e.id === id && e.type === 'rectangle' ? { ...e, ...updates } : e
    );
    const code = generateReplicadCode(newElements, state.extrusionHeight);
    set({
      elements: newElements,
      code,
      lastUpdateSource: 'sketch',
    });
  },

  removeRectangle: (id) => {
    get().removeElement(id);
  },

  selectRectangle: (id, multiSelect) => {
    get().selectElement(id, multiSelect);
  },
}));

// Export helpers for use elsewhere
export { planesEqual, getPlaneKey, getElementCenter };
