/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  initOpenCascade,
  ocModelingAlgorithms,
} from 'opencascade.js';

// OpenCascade instance
let oc: any = null;
let isInitialized = false;

async function init() {
  if (isInitialized) return;

  console.log('[Worker] Initializing OpenCascade.js...');

  oc = await initOpenCascade({
    libs: [ocModelingAlgorithms],
  });

  isInitialized = true;
  console.log('[Worker] OpenCascade.js initialized');
}

// Helper to create a gp_Pnt
function makePnt(x: number, y: number, z: number) {
  return new oc.gp_Pnt_3(x, y, z);
}

// Helper to create a gp_Vec
function makeVec(x: number, y: number, z: number) {
  return new oc.gp_Vec_4(x, y, z);
}

// Helper to create a gp_Dir
function makeDir(x: number, y: number, z: number) {
  return new oc.gp_Dir_4(x, y, z);
}

// Plane definitions
type PlaneType = 'XY' | 'XZ' | 'YZ';

function getPlaneAxes(plane: PlaneType): { origin: any; normal: any; xDir: any } {
  const origin = makePnt(0, 0, 0);
  switch (plane) {
    case 'XY':
      return { origin, normal: makeDir(0, 0, 1), xDir: makeDir(1, 0, 0) };
    case 'XZ':
      return { origin, normal: makeDir(0, 1, 0), xDir: makeDir(1, 0, 0) };
    case 'YZ':
      return { origin, normal: makeDir(1, 0, 0), xDir: makeDir(0, 1, 0) };
    default:
      return { origin, normal: makeDir(0, 0, 1), xDir: makeDir(1, 0, 0) };
  }
}

// Transform 2D point to 3D based on plane
function point2Dto3D(x: number, y: number, plane: PlaneType): { x: number; y: number; z: number } {
  switch (plane) {
    case 'XY':
      return { x, y, z: 0 };
    case 'XZ':
      return { x, y: 0, z: y };
    case 'YZ':
      return { x: 0, y: x, z: y };
    default:
      return { x, y, z: 0 };
  }
}

// Get extrusion vector based on plane
function getExtrusionVec(plane: PlaneType, depth: number) {
  switch (plane) {
    case 'XY':
      return makeVec(0, 0, depth);
    case 'XZ':
      return makeVec(0, depth, 0);
    case 'YZ':
      return makeVec(depth, 0, 0);
    default:
      return makeVec(0, 0, depth);
  }
}

// Create a wire from points (closed polygon)
function makeWireFromPoints(points: { x: number; y: number; z: number }[]): any {
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    const edge = new oc.BRepBuilderAPI_MakeEdge_3(
      makePnt(p1.x, p1.y, p1.z),
      makePnt(p2.x, p2.y, p2.z)
    );

    if (edge.IsDone()) {
      wireBuilder.Add_1(edge.Edge());
    }
    edge.delete();
  }

  if (!wireBuilder.IsDone()) {
    wireBuilder.delete();
    throw new Error('Failed to create wire');
  }

  const wire = wireBuilder.Wire();
  wireBuilder.delete();
  return wire;
}

// Create a face from a wire
function makeFaceFromWire(wire: any): any {
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);

  if (!faceBuilder.IsDone()) {
    faceBuilder.delete();
    throw new Error('Failed to create face from wire');
  }

  const face = faceBuilder.Face();
  faceBuilder.delete();
  return face;
}

// Extrude a face along a vector
function extrudeFace(face: any, vec: any): any {
  const prism = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
  prism.Build(new oc.Message_ProgressRange_1());

  if (!prism.IsDone()) {
    prism.delete();
    throw new Error('Failed to extrude face');
  }

  const shape = prism.Shape();
  prism.delete();
  return shape;
}

// Boolean fuse (union)
function fuseShapes(shape1: any, shape2: any): any {
  const fuse = new oc.BRepAlgoAPI_Fuse_3(shape1, shape2, new oc.Message_ProgressRange_1());
  fuse.Build(new oc.Message_ProgressRange_1());

  if (!fuse.IsDone()) {
    fuse.delete();
    throw new Error('Failed to fuse shapes');
  }

  const result = fuse.Shape();
  fuse.delete();
  return result;
}

// Boolean cut (difference)
function cutShapes(shape1: any, shape2: any): any {
  const cut = new oc.BRepAlgoAPI_Cut_3(shape1, shape2, new oc.Message_ProgressRange_1());
  cut.Build(new oc.Message_ProgressRange_1());

  if (!cut.IsDone()) {
    cut.delete();
    throw new Error('Failed to cut shapes');
  }

  const result = cut.Shape();
  cut.delete();
  return result;
}

// ============================================================================
// High-level drawing API (similar to replicad)
// ============================================================================

interface DrawingState {
  points: { x: number; y: number }[];
  currentPoint: { x: number; y: number };
}

class Drawing {
  private state: DrawingState;
  private plane: PlaneType = 'XY';
  private translation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(startX: number, startY: number) {
    this.state = {
      points: [{ x: startX, y: startY }],
      currentPoint: { x: startX, y: startY },
    };
  }

  line(dx: number, dy: number): Drawing {
    const newX = this.state.currentPoint.x + dx;
    const newY = this.state.currentPoint.y + dy;
    this.state.points.push({ x: newX, y: newY });
    this.state.currentPoint = { x: newX, y: newY };
    return this;
  }

  lineTo(x: number, y: number): Drawing {
    this.state.points.push({ x, y });
    this.state.currentPoint = { x, y };
    return this;
  }

  hLine(length: number): Drawing {
    return this.line(length, 0);
  }

  vLine(length: number): Drawing {
    return this.line(0, length);
  }

  close(): Drawing {
    // Wire will be closed automatically when creating
    return this;
  }

  translate(x: number, y: number, z: number = 0): Drawing {
    this.translation = { x, y, z };
    return this;
  }

  sketchOnPlane(plane: PlaneType): Drawing {
    this.plane = plane;
    return this;
  }

  // Build the wire and face
  private buildFace(): any {
    // Convert 2D points to 3D
    const points3D = this.state.points.map((p) => {
      const p3d = point2Dto3D(p.x, p.y, this.plane);
      return {
        x: p3d.x + this.translation.x,
        y: p3d.y + this.translation.y,
        z: p3d.z + this.translation.z,
      };
    });

    const wire = makeWireFromPoints(points3D);
    const face = makeFaceFromWire(wire);
    wire.delete();
    return face;
  }

  extrude(depth: number): ShapeWrapper {
    const face = this.buildFace();
    const vec = getExtrusionVec(this.plane, depth);
    const solid = extrudeFace(face, vec);
    face.delete();
    vec.delete();
    return new ShapeWrapper(solid);
  }
}

// Rectangle drawing
class RectangleDrawing {
  private width: number;
  private height: number;
  private plane: PlaneType = 'XY';
  private translation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  translate(x: number, y: number, z: number = 0): RectangleDrawing {
    this.translation = { x, y, z };
    return this;
  }

  sketchOnPlane(plane: PlaneType): RectangleDrawing {
    this.plane = plane;
    return this;
  }

  private buildFace(): any {
    // Center the rectangle
    const halfW = this.width / 2;
    const halfH = this.height / 2;

    const points2D = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    const points3D = points2D.map((p) => {
      const p3d = point2Dto3D(p.x, p.y, this.plane);
      return {
        x: p3d.x + this.translation.x,
        y: p3d.y + this.translation.y,
        z: p3d.z + this.translation.z,
      };
    });

    const wire = makeWireFromPoints(points3D);
    const face = makeFaceFromWire(wire);
    wire.delete();
    return face;
  }

  extrude(depth: number): ShapeWrapper {
    const face = this.buildFace();
    const vec = getExtrusionVec(this.plane, depth);
    const solid = extrudeFace(face, vec);
    face.delete();
    vec.delete();
    return new ShapeWrapper(solid);
  }
}

// Circle drawing
class CircleDrawing {
  private radius: number;
  private plane: PlaneType = 'XY';
  private translation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor(radius: number) {
    this.radius = radius;
  }

  translate(x: number, y: number, z: number = 0): CircleDrawing {
    this.translation = { x, y, z };
    return this;
  }

  sketchOnPlane(plane: PlaneType): CircleDrawing {
    this.plane = plane;
    return this;
  }

  private buildFace(): any {
    // Get plane axes
    const axes = getPlaneAxes(this.plane);

    // Create the center point with translation
    const center = makePnt(
      this.translation.x + axes.origin.X(),
      this.translation.y + axes.origin.Y(),
      this.translation.z + axes.origin.Z()
    );

    // Create circle axis
    const ax2 = new oc.gp_Ax2_3(center, axes.normal, axes.xDir);

    // Create circle
    const circle = new oc.gp_Circ_2(ax2, this.radius);

    // Make edge from circle
    const edge = new oc.BRepBuilderAPI_MakeEdge_8(circle);
    if (!edge.IsDone()) {
      edge.delete();
      circle.delete();
      ax2.delete();
      center.delete();
      throw new Error('Failed to create circle edge');
    }

    // Make wire from edge
    const wireBuilder = new oc.BRepBuilderAPI_MakeWire_2(edge.Edge());
    if (!wireBuilder.IsDone()) {
      edge.delete();
      circle.delete();
      ax2.delete();
      center.delete();
      wireBuilder.delete();
      throw new Error('Failed to create wire from circle');
    }

    const wire = wireBuilder.Wire();

    // Make face from wire
    const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
    if (!faceBuilder.IsDone()) {
      edge.delete();
      circle.delete();
      ax2.delete();
      center.delete();
      wireBuilder.delete();
      faceBuilder.delete();
      throw new Error('Failed to create face from circle');
    }

    const face = faceBuilder.Face();

    // Cleanup
    edge.delete();
    circle.delete();
    ax2.delete();
    center.delete();
    wireBuilder.delete();
    faceBuilder.delete();

    return face;
  }

  extrude(depth: number): ShapeWrapper {
    const face = this.buildFace();
    const vec = getExtrusionVec(this.plane, depth);
    const solid = extrudeFace(face, vec);
    face.delete();
    vec.delete();
    return new ShapeWrapper(solid);
  }
}

// API functions similar to replicad
function draw(startPoint: [number, number]): Drawing {
  return new Drawing(startPoint[0], startPoint[1]);
}

function drawRectangle(width: number, height: number): RectangleDrawing {
  return new RectangleDrawing(width, height);
}

function drawCircle(radius: number): CircleDrawing {
  return new CircleDrawing(radius);
}

// Shape wrapper class for boolean operations and mesh extraction
class ShapeWrapper {
  public shape: any;
  private _faces: any[] | null = null;
  private _edges: any[] | null = null;

  constructor(shape: any) {
    this.shape = shape;
  }

  fuse(other: ShapeWrapper | any): ShapeWrapper {
    const otherShape = other instanceof ShapeWrapper ? other.shape : other;
    const result = fuseShapes(this.shape, otherShape);
    return new ShapeWrapper(result);
  }

  cut(other: ShapeWrapper | any): ShapeWrapper {
    const otherShape = other instanceof ShapeWrapper ? other.shape : other;
    const result = cutShapes(this.shape, otherShape);
    return new ShapeWrapper(result);
  }

  get faces(): any[] {
    if (this._faces) return this._faces;
    this._faces = [];

    const explorer = new oc.TopExp_Explorer_2(
      this.shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current());
      this._faces.push(face);
      explorer.Next();
    }
    explorer.delete();

    return this._faces;
  }

  get edges(): any[] {
    if (this._edges) return this._edges;
    this._edges = [];

    const explorer = new oc.TopExp_Explorer_2(
      this.shape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      this._edges.push(edge);
      explorer.Next();
    }
    explorer.delete();

    return this._edges;
  }

  mesh(options: { tolerance?: number; angularTolerance?: number } = {}): {
    vertices: number[];
    normals: number[];
    triangles: number[];
  } {
    const tolerance = options.tolerance ?? 0.1;
    const angularTolerance = options.angularTolerance ?? 30;
    const angularToleranceRad = (angularTolerance * Math.PI) / 180;

    // Create mesh
    const mesher = new oc.BRepMesh_IncrementalMesh_2(
      this.shape,
      tolerance,
      false,
      angularToleranceRad,
      false
    );
    mesher.Perform(new oc.Message_ProgressRange_1());

    const vertices: number[] = [];
    const normals: number[] = [];
    const triangles: number[] = [];

    let vertexOffset = 0;

    // Iterate faces
    const faceExplorer = new oc.TopExp_Explorer_2(
      this.shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
      const face = oc.TopoDS.Face_1(faceExplorer.Current());
      const location = new oc.TopLoc_Location_1();

      const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);

      if (!triangulation.IsNull()) {
        const tri = triangulation.get();
        const nbNodes = tri.NbNodes();
        const nbTriangles = tri.NbTriangles();

        // Check face orientation
        const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

        // Get transformation
        const transform = location.Transformation();

        // Extract vertices and normals
        for (let i = 1; i <= nbNodes; i++) {
          const node = tri.Node(i);
          const transformedNode = node.Transformed(transform);

          vertices.push(transformedNode.X(), transformedNode.Y(), transformedNode.Z());

          // Compute normal (simple approach: we'll compute per-vertex normals later)
          // For now, use face normal approximation
          if (tri.HasNormals()) {
            const normal = tri.Normal(i);
            if (isReversed) {
              normals.push(-normal.X(), -normal.Y(), -normal.Z());
            } else {
              normals.push(normal.X(), normal.Y(), normal.Z());
            }
          } else {
            // Default normal (will be computed from face)
            normals.push(0, 0, 1);
          }
        }

        // Extract triangles
        for (let i = 1; i <= nbTriangles; i++) {
          const triangle = tri.Triangle(i);
          const n1 = triangle.Value(1) - 1 + vertexOffset;
          let n2 = triangle.Value(2) - 1 + vertexOffset;
          let n3 = triangle.Value(3) - 1 + vertexOffset;

          if (isReversed) {
            // Swap winding order
            [n2, n3] = [n3, n2];
          }

          triangles.push(n1, n2, n3);
        }

        vertexOffset += nbNodes;
      }

      location.delete();
      faceExplorer.Next();
    }

    faceExplorer.delete();
    mesher.delete();

    return { vertices, normals, triangles };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  meshEdges(_options: { tolerance?: number } = {}): { lines: number[] } {
    const lines: number[] = [];

    const edgeExplorer = new oc.TopExp_Explorer_2(
      this.shape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (edgeExplorer.More()) {
      const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
      const location = new oc.TopLoc_Location_1();

      const curve = oc.BRep_Tool.Polygon3D(edge, location);

      if (!curve.IsNull()) {
        const poly = curve.get();
        const nbNodes = poly.NbNodes();
        const transform = location.Transformation();

        for (let i = 1; i < nbNodes; i++) {
          const p1 = poly.Nodes().Value(i).Transformed(transform);
          const p2 = poly.Nodes().Value(i + 1).Transformed(transform);

          lines.push(p1.X(), p1.Y(), p1.Z());
          lines.push(p2.X(), p2.Y(), p2.Z());
        }
      } else {
        // Try to get curve directly
        const first = { current: 0 };
        const last = { current: 0 };
        const curveHandle = oc.BRep_Tool.Curve_2(edge, first, last);

        if (!curveHandle.IsNull()) {
          const curve3d = curveHandle.get();
          const steps = 10;
          const delta = (last.current - first.current) / steps;
          const transform = location.Transformation();

          for (let i = 0; i < steps; i++) {
            const t1 = first.current + i * delta;
            const t2 = first.current + (i + 1) * delta;

            const p1 = curve3d.Value(t1).Transformed(transform);
            const p2 = curve3d.Value(t2).Transformed(transform);

            lines.push(p1.X(), p1.Y(), p1.Z());
            lines.push(p2.X(), p2.Y(), p2.Z());
          }
        }
      }

      location.delete();
      edgeExplorer.Next();
    }

    edgeExplorer.delete();
    return { lines };
  }
}


// ============================================================================
// Code evaluation
// ============================================================================

// sketchOnFace helper function (used for face planes)
function sketchOnFace(
  drawing: RectangleDrawing | CircleDrawing | Drawing,
  _shape: ShapeWrapper,
  _faceIndex: number,
  offsetX: number = 0,
  offsetY: number = 0
): RectangleDrawing | CircleDrawing | Drawing {
  // For now, just translate the drawing on the XY plane
  // A full implementation would project onto the face's plane
  return drawing.translate(offsetX, offsetY, 0);
}

function evaluateCode(code: string) {
  console.log('[Worker] Evaluating code:', code);

  // Create a context with all the API functions
  const apiContext = {
    draw,
    drawRectangle,
    drawCircle,
    sketchOnFace,
    ShapeWrapper,
  };

  // Wrap the code to provide access to API functions
  const wrappedCode = `
    const { draw, drawRectangle, drawCircle, sketchOnFace, ShapeWrapper } = this;

    ${code}

    return main();
  `;

  try {
    const fn = new Function(wrappedCode);
    const result = fn.call(apiContext);
    console.log('[Worker] Evaluation result:', result);

    // Ensure result is wrapped in ShapeWrapper
    if (result === null || result === undefined) {
      return null;
    }
    if (result instanceof ShapeWrapper) {
      return result;
    }
    // Try to wrap raw shapes
    return new ShapeWrapper(result);
  } catch (error) {
    console.error('[Worker] Code evaluation error:', error);
    throw error;
  }
}

// ============================================================================
// Shape data extraction
// ============================================================================

interface FaceGroup {
  start: number;
  count: number;
  faceId: number;
}

interface EdgeGroup {
  start: number;
  count: number;
  edgeId: number;
}

function extractShapeData(shape: ShapeWrapper) {
  console.log('[Worker] Extracting shape data...');

  // Get mesh data
  const meshData = shape.mesh({ tolerance: 0.1, angularTolerance: 30 });
  const edgesData = shape.meshEdges({ tolerance: 0.1 });

  // Extract individual faces for selection
  const individualFaces: Array<{
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
  }> = [];

  const faces = shape.faces;
  faces.forEach((face: any, index: number) => {
    try {
      const faceWrapper = new ShapeWrapper(face);
      const faceMesh = faceWrapper.mesh({ tolerance: 0.1, angularTolerance: 30 });

      // Detect planar face
      let isPlanar = false;
      let plane: { origin: [number, number, number]; xDir: [number, number, number]; normal: [number, number, number] } | undefined;

      try {
        const surface = oc.BRep_Tool.Surface_2(face);
        if (!surface.IsNull()) {
          const surf = surface.get();
          // Check if it's a plane
          if (surf.DynamicType().Name() === 'Geom_Plane') {
            isPlanar = true;
            const gpPlane = (surf as any).Pln();
            const ax3 = gpPlane.Position();
            const loc = ax3.Location();
            const dir = ax3.Direction();
            const xdir = ax3.XDirection();

            plane = {
              origin: [loc.X(), loc.Y(), loc.Z()],
              xDir: [xdir.X(), xdir.Y(), xdir.Z()],
              normal: [dir.X(), dir.Y(), dir.Z()],
            };
          }
        }
      } catch (e) {
        console.warn('[Worker] Failed to get plane info for face', index, e);
      }

      individualFaces.push({
        faceIndex: index,
        vertices: new Float32Array(faceMesh.vertices),
        normals: new Float32Array(faceMesh.normals),
        triangles: new Uint32Array(faceMesh.triangles),
        isPlanar,
        plane,
      });
    } catch (e) {
      console.warn('[Worker] Failed to mesh face', index, e);
    }
  });

  // Extract individual edges for selection
  const individualEdges: Array<{
    edgeIndex: number;
    vertices: Float32Array;
  }> = [];

  const edges = shape.edges;
  edges.forEach((edge: any, index: number) => {
    try {
      const edgeWrapper = new ShapeWrapper(edge);
      const edgeMesh = edgeWrapper.meshEdges({ tolerance: 0.1 });

      if (edgeMesh.lines.length > 0) {
        individualEdges.push({
          edgeIndex: index,
          vertices: new Float32Array(edgeMesh.lines),
        });
      }
    } catch (e) {
      console.warn('[Worker] Failed to mesh edge', index, e);
    }
  });

  const faceGroups: FaceGroup[] = [];
  const edgeGroups: EdgeGroup[] = [];

  console.log('[Worker] Shape data extracted:', {
    meshVertices: meshData.vertices.length,
    individualFaceCount: individualFaces.length,
    edgeLineCount: edgesData.lines.length / 6,
    individualEdgeCount: individualEdges.length,
  });

  return {
    mesh: {
      vertices: new Float32Array(meshData.vertices),
      normals: new Float32Array(meshData.normals),
      triangles: new Uint32Array(meshData.triangles),
      faceGroups,
    },
    edges: {
      lines: new Float32Array(edgesData.lines),
      edgeGroups,
    },
    individualFaces,
    individualEdges,
  };
}

// ============================================================================
// Message handler
// ============================================================================

self.onmessage = async (event) => {
  const { type, code } = event.data;
  console.log('[Worker] Received message:', type);

  if (type === 'init') {
    try {
      await init();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('[Worker] Init error:', error);
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to initialize OpenCascade',
      });
    }
  }

  if (type === 'evaluate') {
    try {
      if (!isInitialized) {
        console.log('[Worker] Not initialized, initializing now...');
        await init();
      }

      const result = evaluateCode(code);

      if (result === null) {
        console.log('[Worker] Result is null, sending empty result');
        self.postMessage({ type: 'result', meshData: null, shapeData: null });
        return;
      }

      const shapeData = extractShapeData(result);

      if (shapeData) {
        console.log('[Worker] Sending shape data');

        // Collect all transferable buffers
        const transferables: Transferable[] = [
          shapeData.mesh.vertices.buffer,
          shapeData.mesh.normals.buffer,
          shapeData.mesh.triangles.buffer,
          shapeData.edges.lines.buffer,
        ];

        // Add individual face buffers
        shapeData.individualFaces.forEach((face) => {
          transferables.push(face.vertices.buffer);
          transferables.push(face.normals.buffer);
          transferables.push(face.triangles.buffer);
        });

        // Add individual edge buffers
        shapeData.individualEdges.forEach((edge) => {
          transferables.push(edge.vertices.buffer);
        });

        self.postMessage(
          {
            type: 'result',
            meshData: {
              vertices: shapeData.mesh.vertices,
              normals: shapeData.mesh.normals,
              triangles: shapeData.mesh.triangles,
            },
            shapeData,
          },
          { transfer: transferables }
        );
      } else {
        console.log('[Worker] No shape data extracted');
        self.postMessage({ type: 'result', meshData: null, shapeData: null });
      }
    } catch (error) {
      console.error('[Worker] Evaluation error:', error);
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Evaluation failed',
      });
    }
  }
};
