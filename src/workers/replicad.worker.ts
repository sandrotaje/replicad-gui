import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC } from 'replicad';
import * as replicad from 'replicad';

let isInitialized = false;

async function init() {
  if (isInitialized) return;

  console.log('[Worker] Initializing OpenCascade...');
  console.log('[Worker] WASM URL:', opencascadeWasm);

  const OC = await (opencascade as (options: { locateFile: () => string }) => Promise<unknown>)({
    locateFile: () => opencascadeWasm,
  });

  console.log('[Worker] OpenCascade loaded, setting OC...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOC(OC as any);
  isInitialized = true;
  console.log('[Worker] Initialization complete');
}

function evaluateCode(code: string) {
  console.log('[Worker] Evaluating code:', code);

  // Create a function from the code that has access to replicad
  const wrappedCode = `
    const {
      draw,
      drawRectangle,
      drawRoundedRectangle,
      drawCircle,
      drawEllipse,
      drawPolysides,
      makeBox,
      makeCylinder,
      makeSphere,
      Plane
    } = replicad;

    // Helper function to sketch on a face with offset positioning
    // Usage: sketchOnFace(drawing, shape, faceIndex, offsetX, offsetY)
    function sketchOnFace(drawing, shape, faceIndex, offsetX = 0, offsetY = 0) {
      const face = shape.faces[faceIndex];
      if (!face) {
        throw new Error('Face not found at index ' + faceIndex);
      }
      // Translate the 2D drawing by the offset, then sketch on the face
      // Using no mode parameter (defaults to "bounds" behavior which properly places the sketch on the face)
      const translatedDrawing = drawing.translate(offsetX, offsetY);
      return translatedDrawing.sketchOnFace(face);
    }

    ${code}

    return main();
  `;

  console.log('[Worker] Wrapped code:', wrappedCode);

  const fn = new Function('replicad', wrappedCode);
  const result = fn(replicad);
  console.log('[Worker] Evaluation result:', result);
  return result;
}

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

// ============ Vector Math Helpers ============

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
}

/**
 * Compute the dot product of two 3D vectors
 */
function dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Compute the cross product of two 3D vectors
 */
function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Normalize a 3D vector to unit length
 */
function normalize(v: Point3D): Point3D {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) {
    return { x: 0, y: 0, z: 1 }; // Default to Z axis if zero vector
  }
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  };
}

/**
 * Compute consistent xAxis and yAxis perpendicular to a given normal.
 * This creates a right-handed coordinate system on the face.
 */
function computeFaceAxes(normal: Point3D): { xAxis: Point3D; yAxis: Point3D } {
  // Use a reference vector to compute xAxis perpendicular to normal
  // Choose reference based on which axis normal is closest to
  const refVector: Point3D = Math.abs(normal.z) < 0.9
    ? { x: 0, y: 0, z: 1 }
    : { x: 1, y: 0, z: 0 };

  // xAxis = normalize(refVector × normal)
  const xAxis = normalize(cross(refVector, normal));

  // yAxis = normalize(normal × xAxis) - right-handed system
  const yAxis = normalize(cross(normal, xAxis));

  return { xAxis, yAxis };
}

/**
 * Project a 3D point to 2D face-local coordinates.
 * The 2D coordinates are relative to the face origin using xAxis and yAxis.
 */
function projectToFaceCoords(
  point: Point3D,
  origin: Point3D,
  xAxis: Point3D,
  yAxis: Point3D
): Point2D {
  // Compute relative position from origin
  const relative: Point3D = {
    x: point.x - origin.x,
    y: point.y - origin.y,
    z: point.z - origin.z,
  };

  // Project onto xAxis and yAxis
  return {
    x: dot(relative, xAxis),
    y: dot(relative, yAxis),
  };
}

interface ReplicadMesh {
  vertices: number[];
  normals: number[];
  triangles: number[];
  faceGroups?: FaceGroup[];
}

interface ReplicadEdges {
  lines: number[];
  edgeGroups?: EdgeGroup[];
}

interface ReplicadShape {
  mesh?: (options?: { tolerance?: number; angularTolerance?: number }) => ReplicadMesh;
  meshEdges?: (options?: { tolerance?: number; angularTolerance?: number }) => ReplicadEdges;
  faces?: unknown[];
  edges?: unknown[];
}

function extractShapeData(shape: unknown) {
  console.log('[Worker] Extracting full shape data...');

  if (!shape || typeof shape !== 'object') {
    console.log('[Worker] Shape is null or not an object');
    return null;
  }

  const replicadShape = shape as ReplicadShape;
  console.log('[Worker] Shape prototype:', Object.getPrototypeOf(replicadShape)?.constructor?.name);

  // Log all enumerable keys
  console.log('[Worker] Shape keys (own):', Object.keys(replicadShape));

  // Log prototype methods/properties
  const protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(replicadShape) || {});
  console.log('[Worker] Shape prototype properties:', protoProps);

  // Store faces/edges in variables (they might be getters)
  const shapeFaces = replicadShape.faces;
  const shapeEdges = replicadShape.edges;

  console.log('[Worker] faces type:', typeof shapeFaces);
  console.log('[Worker] faces value:', shapeFaces);
  console.log('[Worker] Is faces array:', Array.isArray(shapeFaces));
  console.log('[Worker] faces length:', Array.isArray(shapeFaces) ? shapeFaces.length : 'N/A');

  console.log('[Worker] edges type:', typeof shapeEdges);
  console.log('[Worker] Is edges array:', Array.isArray(shapeEdges));
  console.log('[Worker] edges length:', Array.isArray(shapeEdges) ? shapeEdges.length : 'N/A');

  if (typeof replicadShape.mesh !== 'function') {
    console.log('[Worker] Shape does not have mesh function');
    return null;
  }

  // Get mesh with face groups
  const mesh = replicadShape.mesh({ tolerance: 0.1, angularTolerance: 30 });
  console.log('[Worker] Mesh result keys:', Object.keys(mesh));
  console.log('[Worker] Mesh faceGroups:', mesh.faceGroups);
  console.log('[Worker] Full mesh object:', JSON.stringify(mesh, (_key, value) => {
    if (Array.isArray(value) && value.length > 10) {
      return `Array(${value.length})`;
    }
    return value;
  }, 2));

  // Get edges with edge groups
  let edgesData: ReplicadEdges | null = null;
  if (typeof replicadShape.meshEdges === 'function') {
    edgesData = replicadShape.meshEdges({ tolerance: 0.1, angularTolerance: 30 });
    console.log('[Worker] Edges result keys:', Object.keys(edgesData));
    console.log('[Worker] Edge groups:', edgesData.edgeGroups);
  }

  // Use face groups from mesh if available
  const faceGroups: FaceGroup[] = mesh.faceGroups || [];

  // Use edge groups from meshEdges if available
  const edgeGroups: EdgeGroup[] = edgesData?.edgeGroups || [];

  // Extract individual face meshes for selection (always do this for reliable face selection)
  const individualFaces: Array<{
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
      bounds2D?: { minX: number; minY: number; maxX: number; maxY: number };
    };
    boundary3D?: Point3D[];
    boundaryPoints2D?: Point2D[];
  }> = [];

  // Always mesh individual faces for selection support
  if (Array.isArray(shapeFaces) && shapeFaces.length > 0) {
    console.log('[Worker] Meshing', shapeFaces.length, 'individual faces for selection...');
    const faces = shapeFaces as Array<{
      mesh: (options?: { tolerance?: number; angularTolerance?: number }) => {
        vertices: number[];
        normals: number[];
        triangles: number[];
      };
      geomType?: string;
      center?: { x: number; y: number; z: number };
      normalAt?: (point?: { x: number; y: number; z: number }) => { x: number; y: number; z: number };
      UVBox?: [number, number, number, number];
      pointOnSurface?: (u: number, v: number) => { x: number; y: number; z: number };
      outerWire?: () => {
        edges: Array<{
          meshEdges?: (options?: { tolerance?: number }) => { lines: number[] };
          startPoint?: { x: number; y: number; z: number };
          endPoint?: { x: number; y: number; z: number };
        }>;
      };
    }>;

    faces.forEach((face, index) => {
      try {
        console.log('[Worker] Meshing face', index, 'type:', typeof face, 'has mesh:', typeof face?.mesh);
        if (face && typeof face.mesh === 'function') {
          const faceMesh = face.mesh({ tolerance: 0.1, angularTolerance: 30 });
          console.log('[Worker] Face', index, 'mesh result:', {
            vertices: faceMesh.vertices?.length,
            normals: faceMesh.normals?.length,
            triangles: faceMesh.triangles?.length,
          });

          // Initialize face data
          let isPlanar = false;
          let plane: {
            origin: [number, number, number];
            xDir: [number, number, number];
            yDir: [number, number, number];
            normal: [number, number, number];
            bounds2D?: { minX: number; minY: number; maxX: number; maxY: number };
          } | undefined;
          let boundary3D: Point3D[] | undefined;
          let boundaryPoints2D: Point2D[] | undefined;

          try {
            // Check geometry type - "PLANE" indicates a planar face
            const geomType = face.geomType;
            console.log('[Worker] Face', index, 'geomType:', geomType);

            if (geomType === 'PLANE') {
              isPlanar = true;

              const center = face.center;
              if (center) {
                // Get the normal at the center point
                let normalVec: Point3D = { x: 0, y: 0, z: 1 };
                if (typeof face.normalAt === 'function') {
                  const n = face.normalAt(center);
                  normalVec = { x: n.x, y: n.y, z: n.z };
                }

                // Compute face coordinate axes using helper function
                const { xAxis, yAxis } = computeFaceAxes(normalVec);

                // Use face center as the origin
                const origin: Point3D = { x: center.x, y: center.y, z: center.z };

                // Compute 2D bounds by projecting face mesh vertices
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                const vertices = faceMesh.vertices;
                for (let vi = 0; vi < vertices.length; vi += 3) {
                  const vertex: Point3D = {
                    x: vertices[vi],
                    y: vertices[vi + 1],
                    z: vertices[vi + 2]
                  };
                  const local = projectToFaceCoords(vertex, origin, xAxis, yAxis);
                  minX = Math.min(minX, local.x);
                  minY = Math.min(minY, local.y);
                  maxX = Math.max(maxX, local.x);
                  maxY = Math.max(maxY, local.y);
                }
                const bounds2D = { minX, minY, maxX, maxY };

                // Store plane data with all axis information
                plane = {
                  origin: [origin.x, origin.y, origin.z],
                  xDir: [xAxis.x, xAxis.y, xAxis.z],
                  yDir: [yAxis.x, yAxis.y, yAxis.z],
                  normal: [normalVec.x, normalVec.y, normalVec.z],
                  bounds2D
                };

                console.log('[Worker] Face', index, 'PLANE DATA:', {
                  'face.center (3D)': center,
                  'origin': origin,
                  'normal': normalVec,
                  'xAxis': xAxis,
                  'yAxis': yAxis,
                  'bounds2D': bounds2D,
                  'face dimensions': {
                    width: maxX - minX,
                    height: maxY - minY
                  }
                });

                // Extract actual face boundary from outerWire
                if (typeof face.outerWire === 'function') {
                  try {
                    const wire = face.outerWire();
                    if (wire && Array.isArray(wire.edges)) {
                      // Collect all 3D boundary points from wire edges
                      const rawBoundary3D: Point3D[] = [];

                      for (const edge of wire.edges) {
                        if (edge && typeof edge.meshEdges === 'function') {
                          // Use meshEdges for accurate edge tessellation
                          const edgeMesh = edge.meshEdges({ tolerance: 0.05 });
                          if (edgeMesh.lines && edgeMesh.lines.length > 0) {
                            // meshEdges returns pairs of points (line segments)
                            for (let ei = 0; ei < edgeMesh.lines.length; ei += 3) {
                              rawBoundary3D.push({
                                x: edgeMesh.lines[ei],
                                y: edgeMesh.lines[ei + 1],
                                z: edgeMesh.lines[ei + 2]
                              });
                            }
                          }
                        } else if (edge?.startPoint && edge?.endPoint) {
                          // Fallback: use edge start/end points directly
                          rawBoundary3D.push({
                            x: edge.startPoint.x,
                            y: edge.startPoint.y,
                            z: edge.startPoint.z
                          });
                          rawBoundary3D.push({
                            x: edge.endPoint.x,
                            y: edge.endPoint.y,
                            z: edge.endPoint.z
                          });
                        }
                      }

                      if (rawBoundary3D.length > 0) {
                        // Remove duplicate 3D points
                        const seen3D = new Set<string>();
                        boundary3D = [];
                        for (const pt of rawBoundary3D) {
                          const key = `${pt.x.toFixed(6)},${pt.y.toFixed(6)},${pt.z.toFixed(6)}`;
                          if (!seen3D.has(key)) {
                            seen3D.add(key);
                            boundary3D.push(pt);
                          }
                        }

                        // Project 3D boundary to 2D using face coordinate system
                        const seen2D = new Set<string>();
                        boundaryPoints2D = [];
                        const faceHeight = maxY - minY;

                        for (const pt of boundary3D) {
                          // Project to face-local coordinates
                          const local = projectToFaceCoords(pt, origin, xAxis, yAxis);

                          // Shift so (0,0) is at the corner (using bounds)
                          const shiftedX = local.x - minX;
                          // Flip Y to match sketch display (Y up) vs Replicad's coordinate system
                          const shiftedY = faceHeight - (local.y - minY);

                          const key = `${shiftedX.toFixed(4)},${shiftedY.toFixed(4)}`;
                          if (!seen2D.has(key)) {
                            seen2D.add(key);
                            boundaryPoints2D.push({ x: shiftedX, y: shiftedY });
                          }
                        }

                        console.log('[Worker] Face', index, 'extracted boundary:', {
                          '3D points': boundary3D.length,
                          '2D points': boundaryPoints2D.length
                        });
                      }
                    }
                  } catch (wireError) {
                    console.warn('[Worker] Failed to extract outerWire for face', index, wireError);
                  }
                }
              }
            } else {
              // Non-planar face - try to extract boundary anyway for visualization
              // This provides an approximation of the face outline
              if (typeof face.outerWire === 'function') {
                try {
                  const wire = face.outerWire();
                  if (wire && Array.isArray(wire.edges) && wire.edges.length > 0) {
                    const rawBoundary3D: Point3D[] = [];

                    for (const edge of wire.edges) {
                      if (edge && typeof edge.meshEdges === 'function') {
                        const edgeMesh = edge.meshEdges({ tolerance: 0.05 });
                        if (edgeMesh.lines && edgeMesh.lines.length > 0) {
                          for (let ei = 0; ei < edgeMesh.lines.length; ei += 3) {
                            rawBoundary3D.push({
                              x: edgeMesh.lines[ei],
                              y: edgeMesh.lines[ei + 1],
                              z: edgeMesh.lines[ei + 2]
                            });
                          }
                        }
                      }
                    }

                    if (rawBoundary3D.length > 0) {
                      // Store 3D boundary even for non-planar faces
                      const seen3D = new Set<string>();
                      boundary3D = [];
                      for (const pt of rawBoundary3D) {
                        const key = `${pt.x.toFixed(6)},${pt.y.toFixed(6)},${pt.z.toFixed(6)}`;
                        if (!seen3D.has(key)) {
                          seen3D.add(key);
                          boundary3D.push(pt);
                        }
                      }
                      console.log('[Worker] Face', index, '(non-planar) extracted', boundary3D.length, '3D boundary points');
                    }
                  }
                } catch (wireError) {
                  console.warn('[Worker] Failed to extract outerWire for non-planar face', index, wireError);
                }
              }
            }
          } catch (planeError) {
            console.warn('[Worker] Failed to extract plane info for face', index, planeError);
          }

          individualFaces.push({
            faceIndex: index,
            vertices: new Float32Array(faceMesh.vertices),
            normals: new Float32Array(faceMesh.normals),
            triangles: new Uint32Array(faceMesh.triangles),
            isPlanar,
            plane,
            boundary3D,
            boundaryPoints2D,
          });
        }
      } catch (e) {
        console.warn('[Worker] Failed to mesh face', index, e);
      }
    });
    console.log('[Worker] Successfully meshed', individualFaces.length, 'faces');
  } else {
    console.log('[Worker] No faces to mesh, shapeFaces:', shapeFaces);
  }

  // Extract individual edge lines for selection (always do this for reliable edge selection)
  const individualEdges: Array<{
    edgeIndex: number;
    vertices: Float32Array;
  }> = [];

  // Always mesh individual edges for selection support
  if (Array.isArray(shapeEdges) && shapeEdges.length > 0) {
    console.log('[Worker] Meshing', shapeEdges.length, 'individual edges for selection...');
    const edges = shapeEdges as Array<{
      meshEdges?: (options?: { tolerance?: number }) => { lines: number[] };
      startPoint?: { x: number; y: number; z: number };
      endPoint?: { x: number; y: number; z: number };
    }>;

    edges.forEach((edge, index) => {
      try {
        if (edge && typeof edge.meshEdges === 'function') {
          const edgeMesh = edge.meshEdges({ tolerance: 0.1 });
          if (edgeMesh.lines && edgeMesh.lines.length > 0) {
            individualEdges.push({
              edgeIndex: index,
              vertices: new Float32Array(edgeMesh.lines),
            });
          }
        } else if (edge && edge.startPoint && edge.endPoint) {
          individualEdges.push({
            edgeIndex: index,
            vertices: new Float32Array([
              edge.startPoint.x, edge.startPoint.y, edge.startPoint.z,
              edge.endPoint.x, edge.endPoint.y, edge.endPoint.z,
            ]),
          });
        }
      } catch (e) {
        console.warn('[Worker] Failed to mesh edge', index, e);
      }
    });
    console.log('[Worker] Successfully meshed', individualEdges.length, 'edges');
  } else {
    console.log('[Worker] No edges to mesh, shapeEdges:', shapeEdges);
  }

  const meshData = {
    vertices: new Float32Array(mesh.vertices),
    normals: new Float32Array(mesh.normals),
    triangles: new Uint32Array(mesh.triangles),
    faceGroups,
  };

  const edgesResult = {
    lines: edgesData ? new Float32Array(edgesData.lines) : new Float32Array(0),
    edgeGroups,
  };

  console.log('[Worker] Shape data extracted:', {
    meshVertices: meshData.vertices.length,
    faceGroupCount: meshData.faceGroups.length,
    individualFaceCount: individualFaces.length,
    edgeLineCount: edgesResult.lines.length / 6,
    edgeGroupCount: edgesResult.edgeGroups.length,
    individualEdgeCount: individualEdges.length,
  });

  return {
    mesh: meshData,
    edges: edgesResult,
    individualFaces,
    individualEdges,
  };
}

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
