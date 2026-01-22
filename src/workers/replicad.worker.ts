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
      // Translate the 2D drawing by the offset before sketching on the face
      const translatedDrawing = drawing.translate(offsetX, offsetY);
      return translatedDrawing.sketchOnFace(face, "original");
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
      normal: [number, number, number];
    };
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

          // Check if the face is planar and extract plane info
          let isPlanar = false;
          let plane: { origin: [number, number, number]; xDir: [number, number, number]; normal: [number, number, number] } | undefined;

          try {
            // Check geometry type - "PLANE" indicates a planar face
            const geomType = face.geomType;
            console.log('[Worker] Face', index, 'geomType:', geomType);

            if (geomType === 'PLANE') {
              isPlanar = true;

              const center = face.center;
              if (center) {
                // Get the normal at the center
                let normal: [number, number, number] = [0, 0, 1];
                if (typeof face.normalAt === 'function') {
                  const normalVec = face.normalAt(center);
                  normal = [normalVec.x, normalVec.y, normalVec.z];
                }

                // Calculate origin as world origin (0,0,0) projected onto the plane
                // This makes sketch coordinates match world XY coordinates better
                // For plane N·(X-P)=0, projecting origin: origin_proj = N * (N·P)
                const ndotp = normal[0] * center.x + normal[1] * center.y + normal[2] * center.z;
                const origin: [number, number, number] = [
                  normal[0] * ndotp,
                  normal[1] * ndotp,
                  normal[2] * ndotp,
                ];

                // Calculate xDir (perpendicular to normal)
                // Use a reference vector to compute xDir
                let refVec: [number, number, number] = [1, 0, 0];
                // If normal is parallel to X axis, use Y as reference
                if (Math.abs(normal[0]) > 0.9) {
                  refVec = [0, 1, 0];
                }

                // xDir = normalize(refVec - (refVec . normal) * normal)
                const dot = refVec[0] * normal[0] + refVec[1] * normal[1] + refVec[2] * normal[2];
                let xDir: [number, number, number] = [
                  refVec[0] - dot * normal[0],
                  refVec[1] - dot * normal[1],
                  refVec[2] - dot * normal[2],
                ];
                const len = Math.sqrt(xDir[0] ** 2 + xDir[1] ** 2 + xDir[2] ** 2);
                if (len > 0.0001) {
                  xDir = [xDir[0] / len, xDir[1] / len, xDir[2] / len];
                }

                plane = { origin, xDir, normal };
                console.log('[Worker] Face', index, 'plane info:', plane);
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
