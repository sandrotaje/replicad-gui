import type {
  Point,
  SketchElement,
  SolverPoint,
  Constraint,
  LineElement,
  ArcElement,
} from '../types';
import { ConstraintType } from '../types';
import { extractSolverPrimitives } from './sketchToSolver';

// Tolerance for coincidence detection (in world units)
// Using half the grid size ensures snapped points are detected
const COINCIDENCE_TOLERANCE = 5;

// Angle threshold for horizontal/vertical detection (in radians)
// About 5 degrees
const ANGLE_THRESHOLD = Math.PI / 36;

/**
 * Check if two points are coincident within tolerance
 */
function arePointsCoincident(p1: Point, p2: Point, tolerance = COINCIDENCE_TOLERANCE): boolean {
  const dx = Math.abs(p1.x - p2.x);
  const dy = Math.abs(p1.y - p2.y);
  return dx <= tolerance && dy <= tolerance;
}

/**
 * Check if a line is nearly horizontal
 */
function isNearlyHorizontal(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // If the line is too short, don't constrain it
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 10) return false;

  // Check angle from horizontal
  const angle = Math.abs(Math.atan2(dy, dx));
  return angle < ANGLE_THRESHOLD || Math.abs(angle - Math.PI) < ANGLE_THRESHOLD;
}

/**
 * Check if a line is nearly vertical
 */
function isNearlyVertical(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // If the line is too short, don't constrain it
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 10) return false;

  // Check angle from vertical
  const angle = Math.abs(Math.atan2(dy, dx));
  const verticalAngle = Math.abs(angle - Math.PI / 2);
  const verticalAngleNeg = Math.abs(angle + Math.PI / 2);
  return verticalAngle < ANGLE_THRESHOLD || verticalAngleNeg < ANGLE_THRESHOLD;
}

/**
 * Find existing points that are coincident with a given point
 */
function findCoincidentExistingPoints(
  point: Point,
  existingPoints: SolverPoint[],
  excludeElementId: string
): SolverPoint[] {
  return existingPoints.filter(
    (ep) =>
      ep.elementId !== excludeElementId &&
      arePointsCoincident(point, { x: ep.x, y: ep.y })
  );
}

/**
 * Check if a constraint already exists between two points
 */
function hasExistingCoincidentConstraint(
  pointId1: string,
  pointId2: string,
  existingConstraints: Constraint[]
): boolean {
  return existingConstraints.some(
    (c) =>
      c.type === ConstraintType.COINCIDENT &&
      c.points.length === 2 &&
      ((c.points[0] === pointId1 && c.points[1] === pointId2) ||
        (c.points[0] === pointId2 && c.points[1] === pointId1))
  );
}

/**
 * Check if a horizontal constraint already exists for a line
 */
function hasExistingHorizontalConstraint(
  lineId: string,
  existingConstraints: Constraint[]
): boolean {
  return existingConstraints.some(
    (c) =>
      c.type === ConstraintType.HORIZONTAL &&
      c.lines.length === 1 &&
      c.lines[0] === lineId
  );
}

/**
 * Check if a vertical constraint already exists for a line
 */
function hasExistingVerticalConstraint(
  lineId: string,
  existingConstraints: Constraint[]
): boolean {
  return existingConstraints.some(
    (c) =>
      c.type === ConstraintType.VERTICAL &&
      c.lines.length === 1 &&
      c.lines[0] === lineId
  );
}

export interface AutoConstraintResult {
  constraints: Omit<Constraint, 'id'>[];
  description: string[];
}

/**
 * Detect auto-constraints for a newly added element
 *
 * This analyzes the new element against existing sketch elements and returns
 * constraints that should be automatically applied:
 * - Coincidence: when endpoints match existing points
 * - Horizontal/Vertical: when lines are nearly axis-aligned
 */
export function detectAutoConstraints(
  newElement: SketchElement,
  existingElements: SketchElement[],
  existingConstraints: Constraint[]
): AutoConstraintResult {
  const constraints: Omit<Constraint, 'id'>[] = [];
  const descriptions: string[] = [];

  // Extract solver primitives from existing elements
  const { points: existingPoints } = extractSolverPrimitives(existingElements);

  switch (newElement.type) {
    case 'line': {
      const line = newElement as LineElement;
      const lineId = `${newElement.id}_line`;
      const startPointId = `${newElement.id}_start`;
      const endPointId = `${newElement.id}_end`;

      // Check for coincident start point
      const coincidentStart = findCoincidentExistingPoints(
        line.start,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentStart) {
        if (!hasExistingCoincidentConstraint(startPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [startPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: start to ${existingPoint.role}`);
        }
      }

      // Check for coincident end point
      const coincidentEnd = findCoincidentExistingPoints(
        line.end,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentEnd) {
        if (!hasExistingCoincidentConstraint(endPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [endPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: end to ${existingPoint.role}`);
        }
      }

      // Check for horizontal/vertical (mutually exclusive)
      if (!hasExistingHorizontalConstraint(lineId, existingConstraints) &&
          !hasExistingVerticalConstraint(lineId, existingConstraints)) {
        if (isNearlyHorizontal(line.start, line.end)) {
          constraints.push({
            type: ConstraintType.HORIZONTAL,
            points: [],
            lines: [lineId],
            circles: [],
          });
          descriptions.push('Horizontal');
        } else if (isNearlyVertical(line.start, line.end)) {
          constraints.push({
            type: ConstraintType.VERTICAL,
            points: [],
            lines: [lineId],
            circles: [],
          });
          descriptions.push('Vertical');
        }
      }
      break;
    }

    case 'arc': {
      const arc = newElement as ArcElement;
      const startPointId = `${newElement.id}_start`;
      const endPointId = `${newElement.id}_end`;
      const centerPointId = `${newElement.id}_center`;

      // Calculate arc start and end points
      const arcStart: Point = {
        x: arc.center.x + arc.radius * Math.cos(arc.startAngle),
        y: arc.center.y + arc.radius * Math.sin(arc.startAngle),
      };
      const arcEnd: Point = {
        x: arc.center.x + arc.radius * Math.cos(arc.endAngle),
        y: arc.center.y + arc.radius * Math.sin(arc.endAngle),
      };

      // Check for coincident arc start
      const coincidentArcStart = findCoincidentExistingPoints(
        arcStart,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentArcStart) {
        if (!hasExistingCoincidentConstraint(startPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [startPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: arc start to ${existingPoint.role}`);
        }
      }

      // Check for coincident arc end
      const coincidentArcEnd = findCoincidentExistingPoints(
        arcEnd,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentArcEnd) {
        if (!hasExistingCoincidentConstraint(endPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [endPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: arc end to ${existingPoint.role}`);
        }
      }

      // Check for coincident arc center
      const coincidentCenter = findCoincidentExistingPoints(
        arc.center,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentCenter) {
        if (!hasExistingCoincidentConstraint(centerPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [centerPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: arc center to ${existingPoint.role}`);
        }
      }
      break;
    }

    case 'rectangle': {
      // Rectangles have 4 corners - check each for coincidence
      const rect = newElement as import('../types').RectangleElement;
      const corners: Point[] = [
        { x: rect.start.x, y: rect.start.y },
        { x: rect.end.x, y: rect.start.y },
        { x: rect.end.x, y: rect.end.y },
        { x: rect.start.x, y: rect.end.y },
      ];

      // Check each corner - note: rectangle corners all use 'corner' role
      // so we can't easily distinguish them, but we can still detect coincidences
      corners.forEach((corner, _index) => {
        const coincidentCorner = findCoincidentExistingPoints(
          corner,
          existingPoints,
          newElement.id
        );

        for (const existingPoint of coincidentCorner) {
          // Rectangle corners all have the same point ID format, which limits
          // constraint tracking. Skip for now to avoid duplicates.
          // TODO: Improve rectangle point ID handling
          descriptions.push(`Coincident: rectangle corner to ${existingPoint.role}`);
        }
      });
      break;
    }

    case 'circle': {
      const circle = newElement as import('../types').CircleElement;
      const centerPointId = `${newElement.id}_center`;

      // Check for coincident center
      const coincidentCenter = findCoincidentExistingPoints(
        circle.center,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentCenter) {
        if (!hasExistingCoincidentConstraint(centerPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [centerPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: circle center to ${existingPoint.role}`);
        }
      }
      break;
    }

    case 'hline':
    case 'vline': {
      // HLine and VLine are already constrained by their type
      // But we can still detect coincident endpoints
      const hv = newElement as import('../types').HLineElement | import('../types').VLineElement;
      const startPointId = `${newElement.id}_start`;
      const endPointId = `${newElement.id}_end`;

      // Calculate end point
      const endPoint: Point =
        newElement.type === 'hline'
          ? { x: hv.start.x + hv.length, y: hv.start.y }
          : { x: hv.start.x, y: hv.start.y + hv.length };

      // Check for coincident start
      const coincidentStart = findCoincidentExistingPoints(
        hv.start,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentStart) {
        if (!hasExistingCoincidentConstraint(startPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [startPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: ${newElement.type} start to ${existingPoint.role}`);
        }
      }

      // Check for coincident end
      const coincidentEnd = findCoincidentExistingPoints(
        endPoint,
        existingPoints,
        newElement.id
      );

      for (const existingPoint of coincidentEnd) {
        if (!hasExistingCoincidentConstraint(endPointId, existingPoint.id, existingConstraints)) {
          constraints.push({
            type: ConstraintType.COINCIDENT,
            points: [endPointId, existingPoint.id],
            lines: [],
            circles: [],
          });
          descriptions.push(`Coincident: ${newElement.type} end to ${existingPoint.role}`);
        }
      }
      break;
    }

    case 'spline': {
      const spline = newElement as import('../types').SplineElement;

      // Check first and last control points for coincidence
      if (spline.points.length >= 2) {
        const firstPoint = spline.points[0];
        const lastPoint = spline.points[spline.points.length - 1];

        const coincidentFirst = findCoincidentExistingPoints(
          firstPoint,
          existingPoints,
          newElement.id
        );

        for (const existingPoint of coincidentFirst) {
          descriptions.push(`Coincident: spline start to ${existingPoint.role}`);
        }

        const coincidentLast = findCoincidentExistingPoints(
          lastPoint,
          existingPoints,
          newElement.id
        );

        for (const existingPoint of coincidentLast) {
          descriptions.push(`Coincident: spline end to ${existingPoint.role}`);
        }
      }
      break;
    }
  }

  return { constraints, description: descriptions };
}
