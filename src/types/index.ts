export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  id: string;
  start: Point;
  end: Point;
  selected: boolean;
}

export interface SketchElement {
  type: 'rectangle';
  id: string;
  data: Rectangle;
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
