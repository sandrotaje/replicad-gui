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
      makeSphere
    } = replicad;

    ${code}

    return main();
  `;

  console.log('[Worker] Wrapped code:', wrappedCode);

  const fn = new Function('replicad', wrappedCode);
  const result = fn(replicad);
  console.log('[Worker] Evaluation result:', result);
  return result;
}

function extractMeshData(shape: unknown) {
  console.log('[Worker] Extracting mesh data from shape:', shape);

  if (!shape || typeof shape !== 'object') {
    console.log('[Worker] Shape is null or not an object');
    return null;
  }

  // Cast to any to access replicad shape methods
  const replicadShape = shape as {
    mesh?: (options?: { tolerance?: number; angularTolerance?: number }) => {
      vertices: number[];
      normals: number[];
      triangles: number[];
    };
  };

  if (typeof replicadShape.mesh !== 'function') {
    console.log('[Worker] Shape does not have mesh function, available methods:', Object.keys(shape));
    return null;
  }

  console.log('[Worker] Calling mesh()...');
  const mesh = replicadShape.mesh({ tolerance: 0.1, angularTolerance: 30 });
  console.log('[Worker] Mesh result:', {
    verticesLength: mesh.vertices.length,
    normalsLength: mesh.normals.length,
    trianglesLength: mesh.triangles.length,
  });

  return {
    vertices: new Float32Array(mesh.vertices),
    normals: new Float32Array(mesh.normals),
    triangles: new Uint32Array(mesh.triangles),
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
        self.postMessage({ type: 'result', meshData: null });
        return;
      }

      const meshData = extractMeshData(result);

      if (meshData) {
        console.log('[Worker] Sending mesh data');
        self.postMessage(
          { type: 'result', meshData },
          {
            transfer: [
              meshData.vertices.buffer,
              meshData.normals.buffer,
              meshData.triangles.buffer,
            ],
          }
        );
      } else {
        console.log('[Worker] No mesh data extracted');
        self.postMessage({ type: 'result', meshData: null });
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
