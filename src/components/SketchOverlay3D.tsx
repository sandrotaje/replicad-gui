import { useMemo } from 'react';
import * as THREE from 'three';
import { useFeatureStore } from '../store/useFeatureStore';
import { useStore } from '../store/useStore';
import type { SketchFeature, SketchElement, Point } from '../types';

const SKETCH_LINE_COLOR = '#a6e3a1';

/**
 * Convert a 2D sketch point to 3D CAD coordinates based on the sketch plane,
 * then apply the CAD→Three.js transform (x, y, z) → (x, z, -y).
 */
function toThreeJS(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}

function point2DToThreeJS(
  p: Point,
  sketch: SketchFeature,
  faceOrigin?: THREE.Vector3,
  faceXDir?: THREE.Vector3,
  faceYDir?: THREE.Vector3,
): THREE.Vector3 {
  if (sketch.reference.type === 'face' && faceOrigin && faceXDir && faceYDir) {
    // Face plane: origin + p.x * xDir + p.y * yDir (already in CAD coords)
    const cadPt = faceOrigin.clone()
      .addScaledVector(faceXDir, p.x)
      .addScaledVector(faceYDir, p.y);
    return toThreeJS(cadPt.x, cadPt.y, cadPt.z);
  }

  const ref = sketch.reference;
  if (ref.type !== 'standard') return toThreeJS(0, 0, 0);

  const offset = ref.offset || 0;
  switch (ref.plane) {
    case 'XY': return toThreeJS(p.x, p.y, offset);
    case 'XZ': return toThreeJS(p.x, offset, p.y);
    case 'YZ': return toThreeJS(offset, p.x, p.y);
  }
}

function elementToPoints(el: SketchElement, sketch: SketchFeature, faceOrigin?: THREE.Vector3, faceXDir?: THREE.Vector3, faceYDir?: THREE.Vector3): THREE.Vector3[][] {
  const convert = (p: Point) => point2DToThreeJS(p, sketch, faceOrigin, faceXDir, faceYDir);
  const segments: THREE.Vector3[][] = [];

  switch (el.type) {
    case 'line':
      segments.push([convert(el.start), convert(el.end)]);
      break;

    case 'hline':
      segments.push([
        convert(el.start),
        convert({ x: el.start.x + el.length, y: el.start.y }),
      ]);
      break;

    case 'vline':
      segments.push([
        convert(el.start),
        convert({ x: el.start.x, y: el.start.y + el.length }),
      ]);
      break;

    case 'rectangle': {
      const corners = [
        { x: el.start.x, y: el.start.y },
        { x: el.end.x, y: el.start.y },
        { x: el.end.x, y: el.end.y },
        { x: el.start.x, y: el.end.y },
      ];
      for (let i = 0; i < 4; i++) {
        segments.push([convert(corners[i]), convert(corners[(i + 1) % 4])]);
      }
      break;
    }

    case 'circle': {
      const pts: THREE.Vector3[] = [];
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        pts.push(convert({
          x: el.center.x + el.radius * Math.cos(angle),
          y: el.center.y + el.radius * Math.sin(angle),
        }));
      }
      segments.push(pts);
      break;
    }

    case 'arc': {
      const pts: THREE.Vector3[] = [];
      const steps = 48;
      let start = el.startAngle;
      let end = el.endAngle;
      if (end < start) end += Math.PI * 2;
      for (let i = 0; i <= steps; i++) {
        const angle = start + (i / steps) * (end - start);
        pts.push(convert({
          x: el.center.x + el.radius * Math.cos(angle),
          y: el.center.y + el.radius * Math.sin(angle),
        }));
      }
      segments.push(pts);
      break;
    }

    case 'spline': {
      if (el.points.length >= 2) {
        const pts = el.points.map(convert);
        segments.push(pts);
      }
      break;
    }
  }

  return segments;
}

function SketchLines({ sketch }: { sketch: SketchFeature }) {
  const shapeData = useStore((state) => state.shapeData);

  const geometry = useMemo(() => {
    let faceOrigin: THREE.Vector3 | undefined;
    let faceXDir: THREE.Vector3 | undefined;
    let faceYDir: THREE.Vector3 | undefined;

    if (sketch.reference.type === 'face' && shapeData) {
      const faceIndex = sketch.reference.faceIndex;
      const face = shapeData.individualFaces.find((f) => f.faceIndex === faceIndex);
      if (face?.plane) {
        faceOrigin = new THREE.Vector3(...face.plane.origin);
        faceXDir = new THREE.Vector3(...face.plane.xDir);
        faceYDir = new THREE.Vector3(...face.plane.yDir);
      }
    }

    const allPoints: number[] = [];
    for (const el of sketch.elements) {
      const segments = elementToPoints(el, sketch, faceOrigin, faceXDir, faceYDir);
      for (const seg of segments) {
        // Convert polyline to line segments pairs
        for (let i = 0; i < seg.length - 1; i++) {
          allPoints.push(seg[i].x, seg[i].y, seg[i].z);
          allPoints.push(seg[i + 1].x, seg[i + 1].y, seg[i + 1].z);
        }
      }
    }

    if (allPoints.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPoints, 3));
    return geo;
  }, [sketch, shapeData]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={SKETCH_LINE_COLOR} linewidth={1.5} />
    </lineSegments>
  );
}

export function SketchOverlay3D() {
  const features = useFeatureStore((state) => state.features);

  const visibleSketches = useMemo(
    () => features.filter((f): f is SketchFeature => f.type === 'sketch' && f.showIn3D === true),
    [features],
  );

  if (visibleSketches.length === 0) return null;

  return (
    <group>
      {visibleSketches.map((sketch) => (
        <SketchLines key={sketch.id} sketch={sketch} />
      ))}
    </group>
  );
}
