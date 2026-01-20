import type { Rectangle } from '../types';

/**
 * Parse replicad code to extract rectangle definitions
 * This is a simple regex-based parser that extracts drawRectangle calls
 */
export function parseRectanglesFromCode(code: string): Rectangle[] {
  const rectangles: Rectangle[] = [];

  // Match patterns like: drawRectangle(width, height)...translate([x, y, z])
  const rectPattern = /drawRectangle\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)[^;]*\.translate\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*[-\d.]+\s*\]\s*\)/g;

  let match;
  while ((match = rectPattern.exec(code)) !== null) {
    const width = parseFloat(match[1]);
    const height = parseFloat(match[2]);
    const centerX = parseFloat(match[3]);
    const centerY = parseFloat(match[4]);

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
