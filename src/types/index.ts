export interface Point {
  x: number;
  y: number;
}

export type StandardPlane = 'XY' | 'XZ' | 'YZ';

export interface FacePlane {
  type: 'face';
  faceIndex: number;
  // Face dimensions for coordinate transformation
  faceWidth?: number;
  faceHeight?: number;
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
  committed: boolean; // When true, element is extruded; when false, it's just a 2D sketch
  depth: number; // Extrusion depth for this element (set when committed)
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

// Group of elements forming a closed profile (for extrusion/cutting)
export interface ClosedProfileGroup {
  id: string;
  elementIds: string[];  // Ordered list of element IDs forming the closed loop
  isClosed: boolean;     // Validated as actually closed
}

// Group of elements forming an open path (for sweep paths)
export interface OpenPathGroup {
  id: string;
  elementIds: string[];  // Ordered list of element IDs forming the open path
}

// Tool types for the sketcher
export type SketchTool =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arc'
  | 'spline';

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

export interface Point3D {
  x: number;
  y: number;
  z: number;
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
    yDir: [number, number, number];
    normal: [number, number, number];
    // Face bounds in 2D (local coordinate system) for offset calculation
    // Replicad's sketchOnFace uses UV origin (typically a corner), not center
    bounds2D?: { minX: number; minY: number; maxX: number; maxY: number };
  };
  // 3D boundary points from outerWire (in world coordinates)
  boundary3D?: Point3D[];
  // 2D boundary points in face local coordinates (for sketch display)
  boundaryPoints2D?: Point[];
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

export interface SelectionState {
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

// ============ CONSTRAINT SOLVER TYPES ============

// Solver primitives (point-reference model)
export interface SolverPoint {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
  elementId: string;      // Which SketchElement this belongs to
  role: 'start' | 'end' | 'center' | 'corner' | 'control';
}

export interface SolverLine {
  id: string;
  p1: string;  // Point ID
  p2: string;  // Point ID
}

export interface SolverCircle {
  id: string;
  center: string;  // Point ID
  radius: number;
}

export const ConstraintType = {
  HORIZONTAL: 'HORIZONTAL',
  VERTICAL: 'VERTICAL',
  DISTANCE: 'DISTANCE',
  COINCIDENT: 'COINCIDENT',
  FIXED: 'FIXED',
  EQUAL_LENGTH: 'EQUAL_LENGTH',
  RADIUS: 'RADIUS',
  ANGLE: 'ANGLE',
  PARALLEL: 'PARALLEL',
  TANGENT: 'TANGENT',
  MIDPOINT: 'MIDPOINT'
} as const;

export type ConstraintType = typeof ConstraintType[keyof typeof ConstraintType];

export interface Constraint {
  id: string;
  type: ConstraintType;
  points: string[];
  lines: string[];
  circles: string[];
  value?: number;
}

// ============ FEATURE TYPES ============

export type FeatureType =
  | 'sketch'
  | 'extrusion'
  | 'cut'
  | 'chamfer'
  | 'fillet'
  | 'revolve'
  | 'shell'
  | 'sweep';

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
  isClosed: boolean;               // Is the sketch a closed profile? (legacy, for single-element profiles)
  closedProfiles?: ClosedProfileGroup[];  // Detected closed profiles from chained elements
  openPaths?: OpenPathGroup[];            // Detected open paths (for sweep paths)
  constraints: Constraint[];       // Geometric constraints
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
  edgeIndices: number[];           // Which edges (empty if allEdges is true)
  allEdges?: boolean;              // Apply to all edges
  distance: number;                // Chamfer distance
}

// Fillet Feature
export interface FilletFeature extends FeatureBase {
  type: 'fillet';
  targetFeatureId: string;         // Which feature to fillet
  edgeIndices: number[];           // Which edges (empty if allEdges is true)
  allEdges?: boolean;              // Apply to all edges
  radius: number;                  // Fillet radius
}

// Sweep Feature - sweeps a profile along a path
export interface SweepFeature extends FeatureBase {
  type: 'sweep';
  profileSketchId: string;         // Sketch with closed profile (cross-section)
  pathSketchId: string;            // Sketch with open path (trajectory)
  operation: 'new' | 'fuse' | 'cut';  // How to combine with existing geometry
}

// Shell Feature
export interface ShellFeature extends FeatureBase {
  type: 'shell';
  targetFeatureId: string;         // Which feature to shell
  thickness: number;               // Wall thickness
  faceIndices: number[];           // Faces to remove (open)
}

// Union of all feature types
export type Feature =
  | SketchFeature
  | ExtrusionFeature
  | CutFeature
  | ChamferFeature
  | FilletFeature
  | SweepFeature
  | ShellFeature;

// ============ HISTORY/SNAPSHOT TYPES ============

export interface Snapshot {
  id: string;
  label: string;
  timestamp: number;
  features: Feature[];
}

export interface HistoryState {
  snapshots: Snapshot[];
  currentSnapshotIndex: number;
  maxSnapshots: number;
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
