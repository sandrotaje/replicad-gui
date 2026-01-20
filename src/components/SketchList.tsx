import { useStore, getPlaneKey, planesEqual } from '../store/useStore';
import type { SketchPlane, FacePlane } from '../types';

interface SketchGroup {
  plane: SketchPlane;
  count: number;
}

function getPlaneName(plane: SketchPlane): string {
  if (typeof plane === 'string') {
    return `${plane} Plane`;
  }
  return `Face ${(plane as FacePlane).faceIndex}`;
}

export function SketchList() {
  const rectangles = useStore((state) => state.rectangles);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const setSketchPlane = useStore((state) => state.setSketchPlane);

  // Group rectangles by plane
  const sketchGroups: SketchGroup[] = [];
  const seenPlanes = new Map<string, SketchGroup>();

  for (const rect of rectangles) {
    const key = getPlaneKey(rect.plane);
    if (seenPlanes.has(key)) {
      seenPlanes.get(key)!.count++;
    } else {
      const group = { plane: rect.plane, count: 1 };
      seenPlanes.set(key, group);
      sketchGroups.push(group);
    }
  }

  if (sketchGroups.length === 0) {
    return (
      <div className="sketch-list">
        <div className="sketch-list-header">Sketches</div>
        <div className="sketch-list-empty">
          No sketches yet. Draw rectangles on the canvas to create sketches.
        </div>
      </div>
    );
  }

  return (
    <div className="sketch-list">
      <div className="sketch-list-header">Sketches</div>
      <div className="sketch-list-items">
        {sketchGroups.map((group) => {
          const isActive = planesEqual(group.plane, sketchPlane);
          return (
            <button
              key={getPlaneKey(group.plane)}
              className={`sketch-list-item ${isActive ? 'active' : ''}`}
              onClick={() => setSketchPlane(group.plane)}
            >
              <span className="sketch-list-item-name">
                {getPlaneName(group.plane)}
              </span>
              <span className="sketch-list-item-count">
                {group.count} rect{group.count !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
