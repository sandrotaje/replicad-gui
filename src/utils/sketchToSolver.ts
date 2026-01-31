import type {
  SketchElement,
  SolverPoint,
  SolverLine,
  SolverCircle,
  Point,
  RectangleElement,
  CircleElement,
  LineElement,
  HLineElement,
  VLineElement,
  ArcElement,
  SplineElement,
} from '../types';

/**
 * Extract solver primitives from SketchElements
 *
 * Decomposes each element into points, lines, and circles for the solver.
 * Uses the convention: pointId = `{elementId}_{role}`
 */
export function extractSolverPrimitives(elements: SketchElement[]): {
  points: SolverPoint[];
  lines: SolverLine[];
  circles: SolverCircle[];
} {
  const lines: SolverLine[] = [];
  const circles: SolverCircle[] = [];

  // Map to track unique points and merge coincident ones
  const pointMap = new Map<string, SolverPoint>();

  // Helper to create or get point with deduplication
  const addPoint = (
    elementId: string,
    role: SolverPoint['role'],
    x: number,
    y: number,
    fixed = false
  ): string => {
    const id = `${elementId}_${role}`;

    if (!pointMap.has(id)) {
      const point: SolverPoint = {
        id,
        x,
        y,
        fixed,
        elementId,
        role,
      };
      pointMap.set(id, point);
    }

    return id;
  };

  // Helper to add line between two points
  const addLine = (elementId: string, p1Id: string, p2Id: string) => {
    lines.push({
      id: `${elementId}_line`,
      p1: p1Id,
      p2: p2Id,
    });
  };

  // Helper to add circle
  const addCircle = (elementId: string, centerId: string, radius: number) => {
    circles.push({
      id: `${elementId}_circle`,
      center: centerId,
      radius,
    });
  };

  // Process each element
  elements.forEach((element) => {
    switch (element.type) {
      case 'line': {
        const line = element as LineElement;
        const p1 = addPoint(element.id, 'start', line.start.x, line.start.y);
        const p2 = addPoint(element.id, 'end', line.end.x, line.end.y);
        addLine(element.id, p1, p2);
        break;
      }

      case 'hline': {
        const hline = element as HLineElement;
        const p1 = addPoint(element.id, 'start', hline.start.x, hline.start.y);
        const endX = hline.start.x + hline.length;
        const p2 = addPoint(element.id, 'end', endX, hline.start.y);
        addLine(element.id, p1, p2);
        break;
      }

      case 'vline': {
        const vline = element as VLineElement;
        const p1 = addPoint(element.id, 'start', vline.start.x, vline.start.y);
        const endY = vline.start.y + vline.length;
        const p2 = addPoint(element.id, 'end', vline.start.x, endY);
        addLine(element.id, p1, p2);
        break;
      }

      case 'rectangle': {
        const rect = element as RectangleElement;
        const { start, end } = rect;

        // Four corners: bottom-left, bottom-right, top-right, top-left
        const p0 = addPoint(element.id, 'corner', start.x, start.y, false);
        const p1 = addPoint(element.id, 'corner', end.x, start.y, false);
        const p2 = addPoint(element.id, 'corner', end.x, end.y, false);
        const p3 = addPoint(element.id, 'corner', start.x, end.y, false);

        // Four lines forming the rectangle
        addLine(`${element.id}_edge0`, p0, p1);
        addLine(`${element.id}_edge1`, p1, p2);
        addLine(`${element.id}_edge2`, p2, p3);
        addLine(`${element.id}_edge3`, p3, p0);
        break;
      }

      case 'circle': {
        const circle = element as CircleElement;
        const center = addPoint(element.id, 'center', circle.center.x, circle.center.y);
        addCircle(element.id, center, circle.radius);
        break;
      }

      case 'arc': {
        const arc = element as ArcElement;
        // Arc has center point and two end points
        const center = addPoint(element.id, 'center', arc.center.x, arc.center.y);

        // Calculate start and end points from angles
        const startX = arc.center.x + arc.radius * Math.cos(arc.startAngle);
        const startY = arc.center.y + arc.radius * Math.sin(arc.startAngle);
        const endX = arc.center.x + arc.radius * Math.cos(arc.endAngle);
        const endY = arc.center.y + arc.radius * Math.sin(arc.endAngle);

        addPoint(element.id, 'start', startX, startY);
        addPoint(element.id, 'end', endX, endY);

        // Add circle for the arc (solver can constrain points to lie on it)
        addCircle(element.id, center, arc.radius);

        // Note: Arc start/end points should have constraints to lie on circle
        break;
      }

      case 'spline': {
        const spline = element as SplineElement;
        // Each control point becomes a solver point
        spline.points.forEach((point, index) => {
          addPoint(element.id, `control${index}`, point.x, point.y);
        });
        // Note: Spline segments could be represented as lines between control points,
        // but for a proper spline solver we'd need curve constraints
        break;
      }

      default:
        console.warn(`Unknown element type: ${(element as any).type}`);
    }
  });

  // Convert map to array
  return {
    points: Array.from(pointMap.values()),
    lines,
    circles,
  };
}

/**
 * Apply solved positions back to SketchElements
 *
 * Takes the solver's updated point positions and updates the original elements.
 * Creates new element instances with updated coordinates.
 */
export function applySolvedPositions(
  elements: SketchElement[],
  solvedPoints: SolverPoint[],
  solvedCircles: SolverCircle[]
): SketchElement[] {
  // Create lookup maps for quick access
  const pointById = new Map<string, SolverPoint>();
  solvedPoints.forEach((p) => pointById.set(p.id, p));

  const circleById = new Map<string, SolverCircle>();
  solvedCircles.forEach((c) => circleById.set(c.id, c));

  // Helper to get point coordinates
  const getPoint = (elementId: string, role: string): Point => {
    const id = `${elementId}_${role}`;
    const solverPoint = pointById.get(id);
    if (!solverPoint) {
      throw new Error(`Point not found: ${id}`);
    }
    return { x: solverPoint.x, y: solverPoint.y };
  };

  // Helper to get circle
  const getCircle = (elementId: string): SolverCircle => {
    const id = `${elementId}_circle`;
    const circle = circleById.get(id);
    if (!circle) {
      throw new Error(`Circle not found: ${id}`);
    }
    return circle;
  };

  // Update each element
  return elements.map((element): SketchElement => {
    switch (element.type) {
      case 'line': {
        const line = element as LineElement;
        return {
          ...line,
          start: getPoint(element.id, 'start'),
          end: getPoint(element.id, 'end'),
        };
      }

      case 'hline': {
        const hline = element as HLineElement;
        const start = getPoint(element.id, 'start');
        const end = getPoint(element.id, 'end');
        return {
          ...hline,
          start,
          length: end.x - start.x,
        };
      }

      case 'vline': {
        const vline = element as VLineElement;
        const start = getPoint(element.id, 'start');
        const end = getPoint(element.id, 'end');
        return {
          ...vline,
          start,
          length: end.y - start.y,
        };
      }

      case 'rectangle': {
        const rect = element as RectangleElement;
        // Note: This is simplified - we need to track which corners are which
        // For now, reconstruct from all four corners
        const cornerIds = [`${element.id}_corner`];
        const corners = cornerIds.map((id) => pointById.get(id)).filter(Boolean);

        if (corners.length >= 2) {
          const xs = corners.map((c) => c!.x);
          const ys = corners.map((c) => c!.y);
          return {
            ...rect,
            start: { x: Math.min(...xs), y: Math.min(...ys) },
            end: { x: Math.max(...xs), y: Math.max(...ys) },
          };
        }

        return rect; // Fallback if corners not found
      }

      case 'circle': {
        const circle = element as CircleElement;
        const solvedCircle = getCircle(element.id);
        const center = pointById.get(solvedCircle.center);

        if (!center) {
          return circle;
        }

        return {
          ...circle,
          center: { x: center.x, y: center.y },
          radius: solvedCircle.radius,
        };
      }

      case 'arc': {
        const arc = element as ArcElement;
        const solvedCircle = getCircle(element.id);
        const center = pointById.get(solvedCircle.center);
        const start = getPoint(element.id, 'start');
        const end = getPoint(element.id, 'end');

        if (!center) {
          return arc;
        }

        // Recalculate angles from solved positions
        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

        return {
          ...arc,
          center: { x: center.x, y: center.y },
          radius: solvedCircle.radius,
          startAngle,
          endAngle,
        };
      }

      case 'spline': {
        const spline = element as SplineElement;
        // Update all control points
        const updatedPoints = spline.points.map((_, index) => {
          const pointId = `${element.id}_control`;
          const solverPoint = pointById.get(pointId);
          return solverPoint
            ? { x: solverPoint.x, y: solverPoint.y }
            : spline.points[index];
        });

        return {
          ...spline,
          points: updatedPoints,
        };
      }

      default:
        console.warn(`Unknown element type during solve: ${(element as any).type}`);
        return element;
    }
  });
}

/**
 * Helper function to find coincident points across elements
 * Returns pairs of point IDs that are at the same location (within tolerance)
 */
export function findCoincidentPoints(
  points: SolverPoint[],
  tolerance = 1e-6
): Array<[string, string]> {
  const coincidentPairs: Array<[string, string]> = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < tolerance * tolerance) {
        coincidentPairs.push([p1.id, p2.id]);
      }
    }
  }

  return coincidentPairs;
}

/**
 * Helper to generate automatic constraints from element geometry
 * (e.g., horizontal/vertical lines, rectangle constraints)
 */
export function extractImplicitConstraints(elements: SketchElement[]): {
  horizontalLines: string[];
  verticalLines: string[];
  rectangleConstraints: Array<{ elementId: string; cornerIds: string[] }>;
} {
  const horizontalLines: string[] = [];
  const verticalLines: string[] = [];
  const rectangleConstraints: Array<{ elementId: string; cornerIds: string[] }> = [];

  elements.forEach((element) => {
    switch (element.type) {
      case 'hline':
        horizontalLines.push(`${element.id}_line`);
        break;

      case 'vline':
        verticalLines.push(`${element.id}_line`);
        break;

      case 'line': {
        const line = element as LineElement;
        const dx = Math.abs(line.end.x - line.start.x);
        const dy = Math.abs(line.end.y - line.start.y);

        // Auto-detect if line is nearly horizontal or vertical
        if (dy < 1e-6) {
          horizontalLines.push(`${element.id}_line`);
        } else if (dx < 1e-6) {
          verticalLines.push(`${element.id}_line`);
        }
        break;
      }

      case 'rectangle': {
        // Rectangles have implicit perpendicular and parallel constraints
        const cornerIds = [
          `${element.id}_corner`,
          `${element.id}_corner`,
          `${element.id}_corner`,
          `${element.id}_corner`,
        ];
        rectangleConstraints.push({
          elementId: element.id,
          cornerIds,
        });
        break;
      }
    }
  });

  return {
    horizontalLines,
    verticalLines,
    rectangleConstraints,
  };
}
