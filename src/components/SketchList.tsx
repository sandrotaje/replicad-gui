import { useStore, getPlaneKey, planesEqual } from '../store/useStore';
import type { SketchPlane, FacePlane, SketchElement } from '../types';

interface SketchGroup {
  plane: SketchPlane;
  elements: SketchElement[];
}

interface SketchListProps {
  hideMobileHeader?: boolean;
}

function getPlaneName(plane: SketchPlane): string {
  if (typeof plane === 'string') {
    return `${plane} Plane`;
  }
  return `Face ${(plane as FacePlane).faceIndex}`;
}

function getElementSummary(elements: SketchElement[]): string {
  const counts: Record<string, number> = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([type, count]) => {
    const plural = count !== 1 ? 's' : '';
    return `${count} ${type}${plural}`;
  });

  return parts.join(', ');
}

export function SketchList({ hideMobileHeader = false }: SketchListProps) {
  const elements = useStore((state) => state.elements);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const setSketchPlane = useStore((state) => state.setSketchPlane);

  // Group elements by plane
  const sketchGroups: SketchGroup[] = [];
  const seenPlanes = new Map<string, SketchGroup>();

  for (const elem of elements) {
    const key = getPlaneKey(elem.plane);
    if (seenPlanes.has(key)) {
      seenPlanes.get(key)!.elements.push(elem);
    } else {
      const group = { plane: elem.plane, elements: [elem] };
      seenPlanes.set(key, group);
      sketchGroups.push(group);
    }
  }

  if (sketchGroups.length === 0) {
    return (
      <div className="sketch-list">
        {!hideMobileHeader && <div className="sketch-list-header">Sketches</div>}
        <div className="sketch-list-empty">
          No sketches yet. Draw shapes on the canvas to create sketches.
        </div>
      </div>
    );
  }

  return (
    <div className="sketch-list">
      {!hideMobileHeader && <div className="sketch-list-header">Sketches</div>}
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
                {getElementSummary(group.elements)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
