import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useStore } from '../store/useStore';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { IndividualFace, IndividualEdge } from '../types';
import { SketchOverlay3D } from './SketchOverlay3D';

// Colors
const FACE_COLOR = '#89b4fa';
const FACE_HOVER_COLOR = '#b4befe';
const FACE_SELECTED_COLOR = '#f9e2af';
const EDGE_COLOR = '#313244';
const EDGE_HOVER_COLOR = '#fab387';
const EDGE_SELECTED_COLOR = '#f9e2af';

// Helper to find which group a triangle/line belongs to
function findGroupIndex(index: number, groups: { start: number; count: number }[]): number {
  for (let i = 0; i < groups.length; i++) {
    const { start, count } = groups[i];
    if (index >= start && index < start + count) {
      return i;
    }
  }
  return -1;
}

// Component for a single selectable face mesh
function SelectableFace({
  face,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onUnhover,
}: {
  face: IndividualFace;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onHover: (e: ThreeEvent<PointerEvent>) => void;
  onUnhover: () => void;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(face.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(face.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(face.triangles, 1));
    return geo;
  }, [face]);

  const color = isSelected ? FACE_SELECTED_COLOR : isHovered ? FACE_HOVER_COLOR : FACE_COLOR;

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={onSelect}
      onPointerOver={onHover}
      onPointerOut={onUnhover}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.2}
        roughness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Use individual face meshes for selection (always active)
function IndividualFaceMeshes() {
  const shapeData = useStore((state) => state.shapeData);
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);
  const hoveredFaceIndex = useStore((state) => state.hoveredFaceIndex);
  const selectFace = useStore((state) => state.selectFace);
  const setHoveredFace = useStore((state) => state.setHoveredFace);

  if (!shapeData || shapeData.individualFaces.length === 0) return null;

  return (
    <group>
      {shapeData.individualFaces.map((face) => (
        <SelectableFace
          key={face.faceIndex}
          face={face}
          isSelected={selectedFaceIndices.has(face.faceIndex)}
          isHovered={hoveredFaceIndex === face.faceIndex}
          onSelect={(e) => {
            e.stopPropagation();
            selectFace(face.faceIndex, e.nativeEvent.shiftKey);
          }}
          onHover={(e) => {
            e.stopPropagation();
            setHoveredFace(face.faceIndex);
          }}
          onUnhover={() => {
            setHoveredFace(null);
          }}
        />
      ))}
    </group>
  );
}

// Group-based mesh for when faceGroups are available (always selectable)
function GroupBasedMesh() {
  const shapeData = useStore((state) => state.shapeData);
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);
  const hoveredFaceIndex = useStore((state) => state.hoveredFaceIndex);
  const selectFace = useStore((state) => state.selectFace);
  const setHoveredFace = useStore((state) => state.setHoveredFace);

  const { geometry, faceGroups } = useMemo(() => {
    if (!shapeData) return { geometry: null, faceGroups: [] };

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(shapeData.mesh.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(shapeData.mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(shapeData.mesh.triangles, 1));

    const groups = shapeData.mesh.faceGroups;
    if (groups && groups.length > 0) {
      groups.forEach(({ start, count }) => {
        geo.addGroup(start, count, 0);
      });
    } else {
      geo.addGroup(0, shapeData.mesh.triangles.length, 0);
    }

    return { geometry: geo, faceGroups: groups || [] };
  }, [shapeData]);

  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ color: FACE_COLOR, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: FACE_HOVER_COLOR, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: FACE_SELECTED_COLOR, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide }),
  ], []);

  useEffect(() => {
    if (!geometry || faceGroups.length === 0) return;

    geometry.groups.forEach((group, groupIndex) => {
      const faceId = faceGroups[groupIndex]?.faceId ?? groupIndex;
      if (selectedFaceIndices.has(faceId)) {
        group.materialIndex = 2;
      } else if (hoveredFaceIndex === faceId) {
        group.materialIndex = 1;
      } else {
        group.materialIndex = 0;
      }
    });
    (geometry as unknown as { groupsNeedUpdate: boolean }).groupsNeedUpdate = true;
  }, [geometry, faceGroups, selectedFaceIndices, hoveredFaceIndex]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!faceGroups.length) return;
    e.stopPropagation();

    if (e.faceIndex != null) {
      const triangleStart = e.faceIndex * 3;
      const groupIndex = findGroupIndex(triangleStart, faceGroups);
      if (groupIndex >= 0) {
        setHoveredFace(faceGroups[groupIndex].faceId);
      }
    }
  }, [faceGroups, setHoveredFace]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!faceGroups.length) return;
    e.stopPropagation();

    if (e.faceIndex != null) {
      const triangleStart = e.faceIndex * 3;
      const groupIndex = findGroupIndex(triangleStart, faceGroups);
      if (groupIndex >= 0) {
        selectFace(faceGroups[groupIndex].faceId, e.nativeEvent.shiftKey);
      }
    }
  }, [faceGroups, selectFace]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      material={materials}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={handlePointerMove}
      onPointerOut={() => setHoveredFace(null)}
      onClick={handleClick}
    />
  );
}

// Simple mesh when selection is not active
function SimpleMesh() {
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

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={FACE_COLOR} metalness={0.2} roughness={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Component for individual edge with tube for picking
function SelectableEdge({
  edge,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onUnhover,
}: {
  edge: IndividualEdge;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onHover: (e: ThreeEvent<PointerEvent>) => void;
  onUnhover: () => void;
}) {
  const { lineGeometry, tubeGeometry } = useMemo(() => {
    // Transform coordinates from CAD (Z-up) to Three.js (Y-up)
    const positions = edge.vertices;
    const transformed = new Float32Array(positions.length);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i < positions.length; i += 3) {
      transformed[i] = positions[i];
      transformed[i + 1] = positions[i + 2];
      transformed[i + 2] = -positions[i + 1];
      points.push(new THREE.Vector3(transformed[i], transformed[i + 1], transformed[i + 2]));
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(transformed, 3));

    // Create tube geometry for picking (invisible but clickable)
    let tubeGeo: THREE.TubeGeometry | null = null;
    if (points.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(points);
      tubeGeo = new THREE.TubeGeometry(curve, Math.max(2, points.length), 1.5, 8, false);
    }

    return { lineGeometry: lineGeo, tubeGeometry: tubeGeo };
  }, [edge]);

  const color = isSelected ? EDGE_SELECTED_COLOR : isHovered ? EDGE_HOVER_COLOR : EDGE_COLOR;

  return (
    <group>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color={color} linewidth={isSelected || isHovered ? 3 : 1.5} />
      </lineSegments>
      {tubeGeometry && (
        <mesh
          geometry={tubeGeometry}
          visible={false}
          onClick={onSelect}
          onPointerOver={onHover}
          onPointerOut={onUnhover}
        >
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
    </group>
  );
}

// Individual edge meshes (always selectable)
function IndividualEdgeMeshes() {
  const shapeData = useStore((state) => state.shapeData);
  const selectedEdgeIndices = useStore((state) => state.selectedEdgeIndices);
  const hoveredEdgeIndex = useStore((state) => state.hoveredEdgeIndex);
  const selectEdge = useStore((state) => state.selectEdge);
  const setHoveredEdge = useStore((state) => state.setHoveredEdge);

  if (!shapeData || shapeData.individualEdges.length === 0) return null;

  return (
    <group>
      {shapeData.individualEdges.map((edge) => (
        <SelectableEdge
          key={edge.edgeIndex}
          edge={edge}
          isSelected={selectedEdgeIndices.has(edge.edgeIndex)}
          isHovered={hoveredEdgeIndex === edge.edgeIndex}
          onSelect={(e) => {
            e.stopPropagation();
            selectEdge(edge.edgeIndex, e.nativeEvent.shiftKey);
          }}
          onHover={(e) => {
            e.stopPropagation();
            setHoveredEdge(edge.edgeIndex);
          }}
          onUnhover={() => {
            setHoveredEdge(null);
          }}
        />
      ))}
    </group>
  );
}

function CameraFit() {
  const shapeData = useStore((state) => state.shapeData);
  const { camera, controls } = useThree();
  const prevShapeDataRef = useRef(shapeData);

  useEffect(() => {
    if (!shapeData || shapeData === prevShapeDataRef.current) return;
    prevShapeDataRef.current = shapeData;

    // Build bounding box from all face vertices (CAD Z-up → Three.js Y-up)
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const face of shapeData.individualFaces) {
      const verts = face.vertices;
      for (let i = 0; i < verts.length; i += 3) {
        v.set(verts[i], verts[i + 2], -verts[i + 1]);
        box.expandByPoint(v);
      }
    }

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 2.5;

    // Position camera at isometric angle from center
    const offset = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
    camera.position.copy(center).add(offset);
    camera.lookAt(center);

    if (controls) {
      (controls as any).target.copy(center);
      (controls as any).update();
    }
  }, [shapeData, camera, controls]);

  return null;
}

function SimpleEdges() {
  const shapeData = useStore((state) => state.shapeData);

  const geometry = useMemo(() => {
    if (!shapeData || !shapeData.edges.lines.length) return null;

    const positions = shapeData.edges.lines;
    const transformed = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      transformed[i] = positions[i];
      transformed[i + 1] = positions[i + 2];
      transformed[i + 2] = -positions[i + 1];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(transformed, 3));
    return geo;
  }, [shapeData]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={EDGE_COLOR} linewidth={1.5} />
    </lineSegments>
  );
}

function Scene() {
  const shapeData = useStore((state) => state.shapeData);
  const clearSelection = useStore((state) => state.clearSelection);

  const handleBackgroundClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Determine which components to render based on available data
  // Selection is always active for both faces and edges
  const hasIndividualFaces = shapeData && shapeData.individualFaces.length > 0;
  const hasFaceGroups = shapeData && shapeData.mesh.faceGroups.length > 0;
  const hasIndividualEdges = shapeData && shapeData.individualEdges.length > 0;

  const renderFaces = () => {
    // Always render selectable faces when available
    if (hasIndividualFaces) {
      return <IndividualFaceMeshes />;
    } else if (hasFaceGroups) {
      return <GroupBasedMesh />;
    }
    return <SimpleMesh />;
  };

  const renderEdges = () => {
    // Always render selectable edges when available
    if (hasIndividualEdges) {
      return <IndividualEdgeMeshes />;
    }
    return <SimpleEdges />;
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -10, -10]} intensity={0.3} />

      {shapeData && renderFaces()}
      {shapeData && renderEdges()}
      <SketchOverlay3D />

      <mesh visible={false} onClick={handleBackgroundClick} position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10000, 10000]} />
        <meshBasicMaterial />
      </mesh>

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

      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI} />
      <CameraFit />
      <Environment preset="studio" />
    </>
  );
}

export function Viewer3D() {
  const isEvaluating = useStore((state) => state.isEvaluating);
  const error = useStore((state) => state.error);
  const meshData = useStore((state) => state.meshData);
  const shapeData = useStore((state) => state.shapeData);
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);
  const selectedEdgeIndices = useStore((state) => state.selectedEdgeIndices);

  const hasSelection = selectedFaceIndices.size > 0 || selectedEdgeIndices.size > 0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [100, 100, 100], fov: 50, near: 0.1, far: 10000 }}
        style={{ background: '#1e1e2e' }}
      >
        <Scene />
      </Canvas>

      {shapeData && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            backgroundColor: 'rgba(30, 30, 46, 0.9)',
            padding: '8px 12px',
            borderRadius: '6px',
            color: '#cdd6f4',
            fontSize: '12px',
          }}
        >
          {hasSelection ? (
            <>
              <div style={{ color: '#a6adc8' }}>
                {selectedFaceIndices.size > 0 && `${selectedFaceIndices.size} face(s)`}
                {selectedFaceIndices.size > 0 && selectedEdgeIndices.size > 0 && ', '}
                {selectedEdgeIndices.size > 0 && `${selectedEdgeIndices.size} edge(s)`}
                {' selected'}
              </div>
              <div style={{ color: '#6c7086', fontSize: '11px', marginTop: '4px' }}>
                Shift+click for multi-select
              </div>
            </>
          ) : (
            <div style={{ color: '#6c7086' }}>
              Click to select faces or edges
            </div>
          )}
        </div>
      )}

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
