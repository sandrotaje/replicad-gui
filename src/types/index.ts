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

export interface WorkerMessage {
  type: 'init' | 'evaluate' | 'ready' | 'result' | 'error';
  code?: string;
  meshData?: MeshData;
  error?: string;
}
