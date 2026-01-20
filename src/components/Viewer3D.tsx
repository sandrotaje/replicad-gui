import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useStore } from '../store/useStore';
import { useMemo } from 'react';
import * as THREE from 'three';

function Mesh() {
  const meshData = useStore((state) => state.meshData);

  const geometry = useMemo(() => {
    if (!meshData) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(meshData.triangles, 1));

    return geo;
  }, [meshData]);

  if (!geometry) return null;

  // Rotate -90 degrees around X axis to convert from Z-up (CAD) to Y-up (Three.js)
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial
        color="#89b4fa"
        metalness={0.2}
        roughness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -10, -10]} intensity={0.3} />

      <Mesh />

      <Grid
        args={[200, 200]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#313244"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#585b70"
        fadeDistance={400}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={true}
      />

      <OrbitControls
        makeDefault
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
      />
      <Environment preset="studio" />
    </>
  );
}

export function Viewer3D() {
  const isEvaluating = useStore((state) => state.isEvaluating);
  const error = useStore((state) => state.error);
  const meshData = useStore((state) => state.meshData);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [100, 100, 100], fov: 50, near: 0.1, far: 10000 }}
        style={{ background: '#1e1e2e' }}
      >
        <Scene />
      </Canvas>

      {/* Status overlays */}
      {isEvaluating && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(30, 30, 46, 0.9)',
            padding: '16px 24px',
            borderRadius: '8px',
            color: '#cdd6f4',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid #89b4fa',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Evaluating...
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            right: '16px',
            backgroundColor: 'rgba(243, 139, 168, 0.1)',
            border: '1px solid #f38ba8',
            padding: '12px 16px',
            borderRadius: '8px',
            color: '#f38ba8',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {!meshData && !isEvaluating && !error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#6c7086',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎨</div>
          <div>Draw shapes in the sketcher and click "Extrude"</div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
