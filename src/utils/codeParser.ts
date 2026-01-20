import type { Rectangle, SketchPlane } from '../types';

/**
 * Parse replicad code to extract rectangle definitions
 * This is a simple regex-based parser that extracts drawRectangle calls
 */
export function parseRectanglesFromCode(code: string, defaultPlane: SketchPlane = 'XY'): Rectangle[] {
  const rectangles: Rectangle[] = [];

  // Match patterns like: drawRectangle(width, height)...sketchOnPlane(...)...translate([x, y, z])
  // This captures the plane specification and translate coordinates
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
      // Face plane - use default plane for now as we can't easily reconstruct face plane info
      plane = defaultPlane;
      centerX = tx;
      centerY = ty;
    }

    // Convert center + dimensions to start/end points
    const rect: Rectangle = {
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
    };

    rectangles.push(rect);
  }

  return rectangles;
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
