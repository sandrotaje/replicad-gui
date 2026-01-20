import type {
  SketchElement,
  RectangleElement,
  CircleElement,
  LineElement,
  HLineElement,
  VLineElement,
  ArcElement,
  SplineElement,
  SketchPlane,
  OperationType,
} from '../types';

/**
 * Parse replicad code to extract sketch element definitions
 * This is a regex-based parser that extracts various shape definitions
 */
export function parseElementsFromCode(code: string, defaultPlane: SketchPlane = 'XY'): SketchElement[] {
  const elements: SketchElement[] = [];

  // Parse rectangles
  parseRectangles(code, defaultPlane, elements);

  // Parse circles
  parseCircles(code, defaultPlane, elements);

  // Parse lines (draw().line())
  parseLines(code, defaultPlane, elements);

  // Parse horizontal lines (draw().hLine())
  parseHLines(code, defaultPlane, elements);

  // Parse vertical lines (draw().vLine())
  parseVLines(code, defaultPlane, elements);

  // Parse arcs (threePointsArcTo)
  parseArcs(code, defaultPlane, elements);

  // Parse splines (smoothSplineTo)
  parseSplines(code, defaultPlane, elements);

  return elements;
}

/**
 * Parse rectangle definitions from code
 */
function parseRectangles(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: drawRectangle(width, height)...sketchOnPlane(...)...translate([x, y, z])
  const rectPattern = /drawRectangle\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)[^;]*\.translate\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)/g;

  let match;
  while ((match = rectPattern.exec(code)) !== null) {
    const width = parseFloat(match[1]);
    const height = parseFloat(match[2]);
    const planeStr = match[3];
    const tx = parseFloat(match[4]);
    const ty = parseFloat(match[5]);
    const tz = parseFloat(match[6]);

    // Determine which plane and calculate centerX/centerY
    let plane: SketchPlane;
    let centerX: number;
    let centerY: number;

    if (planeStr === '"XY"') {
      plane = 'XY';
      centerX = tx;
      centerY = ty;
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
      centerX = tx;
      centerY = tz;
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
      centerX = ty;
      centerY = tz;
    } else {
      // Face plane - use default plane for now
      plane = defaultPlane;
      centerX = tx;
      centerY = ty;
    }

    // Convert center + dimensions to start/end points
    const rect: RectangleElement = {
      type: 'rectangle',
      id: crypto.randomUUID(),
      start: {
        x: centerX - width / 2,
        y: centerY - height / 2,
      },
      end: {
        x: centerX + width / 2,
        y: centerY + height / 2,
      },
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(rect);
  }
}

/**
 * Parse circle definitions from code
 */
function parseCircles(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: drawCircle(radius)...sketchOnPlane(...)...translate([x, y, z])
  const circlePattern = /drawCircle\s*\(\s*([\d.]+)\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)[^;]*\.translate\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)/g;

  let match;
  while ((match = circlePattern.exec(code)) !== null) {
    const radius = parseFloat(match[1]);
    const planeStr = match[2];
    const tx = parseFloat(match[3]);
    const ty = parseFloat(match[4]);
    const tz = parseFloat(match[5]);

    let plane: SketchPlane;
    let centerX: number;
    let centerY: number;

    if (planeStr === '"XY"') {
      plane = 'XY';
      centerX = tx;
      centerY = ty;
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
      centerX = tx;
      centerY = tz;
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
      centerX = ty;
      centerY = tz;
    } else {
      plane = defaultPlane;
      centerX = tx;
      centerY = ty;
    }

    const circle: CircleElement = {
      type: 'circle',
      id: crypto.randomUUID(),
      center: { x: centerX, y: centerY },
      radius,
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(circle);
  }
}

/**
 * Parse line definitions from code
 */
function parseLines(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: draw([x, y]).line(dx, dy).done().sketchOnPlane(...)
  const linePattern = /draw\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)\s*\.line\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)/g;

  let match;
  while ((match = linePattern.exec(code)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const dx = parseFloat(match[3]);
    const dy = parseFloat(match[4]);
    const planeStr = match[5];

    let plane: SketchPlane;
    if (planeStr === '"XY"') {
      plane = 'XY';
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
    } else {
      plane = defaultPlane;
    }

    const line: LineElement = {
      type: 'line',
      id: crypto.randomUUID(),
      start: { x: startX, y: startY },
      end: { x: startX + dx, y: startY + dy },
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(line);
  }
}

/**
 * Parse horizontal line definitions from code
 */
function parseHLines(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: draw([x, y]).hLine(length).done().sketchOnPlane(...)
  const hlinePattern = /draw\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)\s*\.hLine\s*\(\s*([-\d.]+)\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)/g;

  let match;
  while ((match = hlinePattern.exec(code)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const length = parseFloat(match[3]);
    const planeStr = match[4];

    let plane: SketchPlane;
    if (planeStr === '"XY"') {
      plane = 'XY';
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
    } else {
      plane = defaultPlane;
    }

    const hline: HLineElement = {
      type: 'hline',
      id: crypto.randomUUID(),
      start: { x: startX, y: startY },
      length,
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(hline);
  }
}

/**
 * Parse vertical line definitions from code
 */
function parseVLines(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: draw([x, y]).vLine(length).done().sketchOnPlane(...)
  const vlinePattern = /draw\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)\s*\.vLine\s*\(\s*([-\d.]+)\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)/g;

  let match;
  while ((match = vlinePattern.exec(code)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const length = parseFloat(match[3]);
    const planeStr = match[4];

    let plane: SketchPlane;
    if (planeStr === '"XY"') {
      plane = 'XY';
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
    } else {
      plane = defaultPlane;
    }

    const vline: VLineElement = {
      type: 'vline',
      id: crypto.randomUUID(),
      start: { x: startX, y: startY },
      length,
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(vline);
  }
}

/**
 * Parse arc definitions from code
 */
function parseArcs(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: draw([sx, sy]).threePointsArcTo([ex, ey], [mx, my]).done().sketchOnPlane(...)
  const arcPattern = /draw\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)\s*\.threePointsArcTo\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*,\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)/g;

  let match;
  while ((match = arcPattern.exec(code)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const endX = parseFloat(match[3]);
    const endY = parseFloat(match[4]);
    const midX = parseFloat(match[5]);
    const midY = parseFloat(match[6]);
    const planeStr = match[7];

    let plane: SketchPlane;
    if (planeStr === '"XY"') {
      plane = 'XY';
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
    } else {
      plane = defaultPlane;
    }

    // Calculate center and radius from three points
    // Using circumcenter formula
    const ax = startX, ay = startY;
    const bx = midX, by = midY;
    const cx = endX, cy = endY;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) continue; // Points are collinear

    const centerX = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const centerY = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2);

    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(endY - centerY, endX - centerX);

    const arc: ArcElement = {
      type: 'arc',
      id: crypto.randomUUID(),
      center: { x: centerX, y: centerY },
      radius,
      startAngle,
      endAngle,
      selected: false,
      plane,
      operation: 'extrude' as OperationType,
    };

    elements.push(arc);
  }
}

/**
 * Parse spline definitions from code
 */
function parseSplines(code: string, defaultPlane: SketchPlane, elements: SketchElement[]): void {
  // Match patterns like: draw([x, y]).smoothSplineTo([x1, y1], [x2, y2], ...).done().sketchOnPlane(...)
  const splinePattern = /draw\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]\s*\)\s*\.smoothSplineTo\s*\(([^)]+)\)[^;]*\.sketchOnPlane\s*\(\s*("XY"|"XZ"|"YZ"|[a-zA-Z0-9_]+)\s*\)/g;

  let match;
  while ((match = splinePattern.exec(code)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const pointsStr = match[3];
    const planeStr = match[4];

    let plane: SketchPlane;
    if (planeStr === '"XY"') {
      plane = 'XY';
    } else if (planeStr === '"XZ"') {
      plane = 'XZ';
    } else if (planeStr === '"YZ"') {
      plane = 'YZ';
    } else {
      plane = defaultPlane;
    }

    // Parse points from the arguments
    const pointPattern = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/g;
    const points = [{ x: startX, y: startY }];

    let pointMatch;
    while ((pointMatch = pointPattern.exec(pointsStr)) !== null) {
      points.push({
        x: parseFloat(pointMatch[1]),
        y: parseFloat(pointMatch[2]),
      });
    }

    if (points.length >= 2) {
      const spline: SplineElement = {
        type: 'spline',
        id: crypto.randomUUID(),
        points,
        selected: false,
        plane,
        operation: 'extrude' as OperationType,
      };

      elements.push(spline);
    }
  }
}

/**
 * Extract extrusion height from code
 */
export function parseExtrusionHeightFromCode(code: string): number | null {
  // Match pattern like: .extrude(10)
  const extrudePattern = /\.extrude\s*\(\s*([\d.]+)\s*\)/;
  const match = code.match(extrudePattern);

  if (match) {
    return parseFloat(match[1]);
  }

  return null;
}

// Legacy export for backward compatibility
export function parseRectanglesFromCode(code: string, defaultPlane: SketchPlane = 'XY'): SketchElement[] {
  return parseElementsFromCode(code, defaultPlane).filter(e => e.type === 'rectangle');
}
