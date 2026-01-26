import type { ShapeData } from '../types';

/**
 * Exports ShapeData mesh to binary STL format
 * Binary STL is more compact than ASCII STL
 */
export function exportToSTL(shapeData: ShapeData, filename: string = 'model.stl'): void {
  const { mesh } = shapeData;
  const { vertices, triangles } = mesh;

  // Calculate number of triangles
  const numTriangles = triangles.length / 3;

  // Binary STL format:
  // - 80 bytes header
  // - 4 bytes: number of triangles (uint32)
  // - For each triangle (50 bytes each):
  //   - 12 bytes: normal vector (3x float32)
  //   - 36 bytes: 3 vertices (9x float32)
  //   - 2 bytes: attribute byte count (uint16, usually 0)

  const bufferSize = 80 + 4 + (numTriangles * 50);
  const buffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer);

  // Write header (80 bytes) - can contain any text
  const header = 'Binary STL exported from Replicad GUI';
  for (let i = 0; i < 80; i++) {
    dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Write number of triangles
  dataView.setUint32(80, numTriangles, true); // little-endian

  let offset = 84;

  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i] * 3;
    const i1 = triangles[i + 1] * 3;
    const i2 = triangles[i + 2] * 3;

    // Get vertices
    const v0 = [vertices[i0], vertices[i0 + 1], vertices[i0 + 2]];
    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];

    // Calculate face normal from vertices using cross product
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0],
    ];

    // Normalize the normal vector
    const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }

    // Write normal (3x float32)
    dataView.setFloat32(offset, normal[0], true);
    dataView.setFloat32(offset + 4, normal[1], true);
    dataView.setFloat32(offset + 8, normal[2], true);
    offset += 12;

    // Write vertices (9x float32)
    dataView.setFloat32(offset, v0[0], true);
    dataView.setFloat32(offset + 4, v0[1], true);
    dataView.setFloat32(offset + 8, v0[2], true);
    offset += 12;

    dataView.setFloat32(offset, v1[0], true);
    dataView.setFloat32(offset + 4, v1[1], true);
    dataView.setFloat32(offset + 8, v1[2], true);
    offset += 12;

    dataView.setFloat32(offset, v2[0], true);
    dataView.setFloat32(offset + 4, v2[1], true);
    dataView.setFloat32(offset + 8, v2[2], true);
    offset += 12;

    // Write attribute byte count (uint16, always 0)
    dataView.setUint16(offset, 0, true);
    offset += 2;
  }

  // Create blob and trigger download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, filename);
}

/**
 * Exports ShapeData mesh to ASCII STL format
 * Larger file size but human-readable
 */
export function exportToSTLAscii(shapeData: ShapeData, filename: string = 'model.stl'): void {
  const { mesh } = shapeData;
  const { vertices, triangles } = mesh;

  const lines: string[] = [];
  lines.push('solid model');

  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i] * 3;
    const i1 = triangles[i + 1] * 3;
    const i2 = triangles[i + 2] * 3;

    // Get vertices
    const v0 = [vertices[i0], vertices[i0 + 1], vertices[i0 + 2]];
    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];

    // Calculate face normal
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0],
    ];

    const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }

    lines.push(`  facet normal ${normal[0]} ${normal[1]} ${normal[2]}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${v0[0]} ${v0[1]} ${v0[2]}`);
    lines.push(`      vertex ${v1[0]} ${v1[1]} ${v1[2]}`);
    lines.push(`      vertex ${v2[0]} ${v2[1]} ${v2[2]}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }

  lines.push('endsolid model');

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  downloadBlob(blob, filename);
}

/**
 * Helper to trigger a file download in the browser
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
