export interface Point {
  x: number;
  y: number;
}

export type StandardPlane = 'XY' | 'XZ' | 'YZ';

export interface FacePlane {
  type: 'face';
  faceIndex: number;
  origin: [number, number, number];
  xDir: [number, number, number];
  normal: [number, number, number];
}

export type SketchPlane = StandardPlane | FacePlane;

// Operation type for sketch elements
export type OperationType = 'extrude' | 'cut';

// Base interface for all sketch elements
export interface SketchElementBase {
  id: string;
  plane: SketchPlane;
  selected: boolean;
  operation: OperationType;
}

// Rectangle: defined by two corner points
export interface RectangleElement extends SketchElementBase {
  type: 'rectangle';
  start: Point;
  end: Point;
}

// Circle: defined by center and radius
export interface CircleElement extends SketchElementBase {
  type: 'circle';
  center: Point;
  radius: number;
}

// Line: general line from start to end
export interface LineElement extends SketchElementBase {
  type: 'line';
  start: Point;
  end: Point;
}

// Horizontal line: starts at a point, extends horizontally
export interface HLineElement extends SketchElementBase {
  type: 'hline';
  start: Point;
  length: number; // positive = right, negative = left
}

// Vertical line: starts at a point, extends vertically
export interface VLineElement extends SketchElementBase {
  type: 'vline';
  start: Point;
  length: number; // positive = up, negative = down
}

// Arc: defined by center, radius, and start/end angles (in radians)
export interface ArcElement extends SketchElementBase {
  type: 'arc';
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

// Spline: smooth curve through multiple points
export interface SplineElement extends SketchElementBase {
  type: 'spline';
  points: Point[];
}

// Union type of all sketch elements
export type SketchElement =
  | RectangleElement
  | CircleElement
  | LineElement
  | HLineElement
  | VLineElement
  | ArcElement
  | SplineElement;

// Tool types for the sketcher
export type SketchTool =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'hline'
  | 'vline'
  | 'arc'
  | 'spline';

// Legacy Rectangle type (for backward compatibility during migration)
export interface Rectangle {
  id: string;
  start: Point;
  end: Point;
  selected: boolean;
  plane: SketchPlane;
}

export interface MeshData {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
}

export interface FaceGroup {
  start: number;
  count: number;
  faceId: number;
}

export interface EdgeGroup {
  start: number;
  count: number;
  edgeId: number;
}

export interface MeshWithGroups {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  faceGroups: FaceGroup[];
}

export interface EdgesWithGroups {
  lines: Float32Array;
  edgeGroups: EdgeGroup[];
}

export interface IndividualFace {
  faceIndex: number;
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  isPlanar?: boolean;
  plane?: {
    origin: [number, number, number];
    xDir: [number, number, number];
    normal: [number, number, number];
  };
}

export interface IndividualEdge {
  edgeIndex: number;
  vertices: Float32Array;
}

export interface ShapeData {
  mesh: MeshWithGroups;
  edges: EdgesWithGroups;
  individualFaces: IndividualFace[];
  individualEdges: IndividualEdge[];
}

export type SelectionMode = 'none' | 'face' | 'edge';

export interface SelectionState {
  mode: SelectionMode;
  selectedFaceIndices: Set<number>;
  selectedEdgeIndices: Set<number>;
  hoveredFaceIndex: number | null;
  hoveredEdgeIndex: number | null;
}

export interface WorkerMessage {
  type: 'init' | 'evaluate' | 'ready' | 'result' | 'error';
  code?: string;
  meshData?: MeshData;
  shapeData?: ShapeData;
  error?: string;
}
