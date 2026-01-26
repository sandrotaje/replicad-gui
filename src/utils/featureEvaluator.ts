/**
 * FeatureEvaluator - Generates replicad code from a feature tree
 *
 * This module is responsible for converting the feature-based parametric model
 * into executable replicad JavaScript code.
 */

import type {
  Feature,
  SketchFeature,
  ExtrusionFeature,
  CutFeature,
  ChamferFeature,
  FilletFeature,
  SketchElement,
  Point,
  ShapeData,
} from '../types';

// ============ Result Types ============

export interface FeatureResult {
  geometry: unknown;
  faceCount: number;
  edgeCount: number;
  faceBoundaries: Map<number, Point[]>;
}

export interface EvaluationResult {
  code: string;
  shapeData: ShapeData | null;
  featureResults: Map<string, FeatureResult>;
  errors: Map<string, string>;
}

// ============ Helper Functions ============

/**
 * Sanitize a feature name to be used as a JavaScript variable name
 */
function toVariableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
}

/**
 * Get the dependencies for a feature
 * Returns an array of feature IDs that this feature depends on
 */
function getFeatureDependencies(feature: Feature): string[] {
  const deps: string[] = [];

  switch (feature.type) {
    case 'sketch':
      // Sketch on face depends on parent feature
      if (feature.reference.type === 'face') {
        deps.push(feature.reference.parentFeatureId);
      }
      break;

    case 'extrusion':
    case 'cut':
      // Extrusion/Cut depends on its sketch
      deps.push(feature.sketchId);
      // If operation is 'fuse' or 'cut', also depends on previous result
      // (handled implicitly by using 'result' variable)
      break;

    case 'chamfer':
    case 'fillet':
      // Chamfer/Fillet depends on target feature
      deps.push(feature.targetFeatureId);
      break;
  }

  return deps;
}

// ============ FeatureEvaluator Class ============

export class FeatureEvaluator {
  /**
   * Generate replicad drawing code for a single sketch element
   */
  private generateElementDrawingCode(element: SketchElement): string {
    switch (element.type) {
      case 'rectangle': {
        const width = Math.abs(element.end.x - element.start.x);
        const height = Math.abs(element.end.y - element.start.y);
        return `drawRectangle(${width.toFixed(2)}, ${height.toFixed(2)})`;
      }

      case 'circle': {
        return `drawCircle(${element.radius.toFixed(2)})`;
      }

      case 'line': {
        const dx = element.end.x - element.start.x;
        const dy = element.end.y - element.start.y;
        return `draw([${element.start.x.toFixed(2)}, ${element.start.y.toFixed(2)}]).line(${dx.toFixed(2)}, ${dy.toFixed(2)}).done()`;
      }

      case 'hline': {
        return `draw([${element.start.x.toFixed(2)}, ${element.start.y.toFixed(2)}]).hLine(${element.length.toFixed(2)}).done()`;
      }

      case 'vline': {
        return `draw([${element.start.x.toFixed(2)}, ${element.start.y.toFixed(2)}]).vLine(${element.length.toFixed(2)}).done()`;
      }

      case 'arc': {
        const { center, radius, startAngle, endAngle } = element;
        const startX = center.x + radius * Math.cos(startAngle);
        const startY = center.y + radius * Math.sin(startAngle);
        const endX = center.x + radius * Math.cos(endAngle);
        const endY = center.y + radius * Math.sin(endAngle);
        const midAngle = (startAngle + endAngle) / 2;
        const midX = center.x + radius * Math.cos(midAngle);
        const midY = center.y + radius * Math.sin(midAngle);
        return `draw([${startX.toFixed(2)}, ${startY.toFixed(2)}]).threePointsArcTo([${endX.toFixed(2)}, ${endY.toFixed(2)}], [${midX.toFixed(2)}, ${midY.toFixed(2)}]).done()`;
      }

      case 'spline': {
        if (element.points.length < 2) {
          return `null /* Spline with insufficient points */`;
        }
        const [first, ...rest] = element.points;
        const splinePoints = rest.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
        return `draw([${first.x.toFixed(2)}, ${first.y.toFixed(2)}]).smoothSplineTo(${splinePoints}).done()`;
      }

      default:
        return `null /* Unknown element type */`;
    }
  }

  /**
   * Get the center point for positioning an element when sketching on a face
   */
  private getElementCenter(element: SketchElement): Point {
    switch (element.type) {
      case 'rectangle':
        return {
          x: (element.start.x + element.end.x) / 2,
          y: (element.start.y + element.end.y) / 2,
        };
      case 'circle':
        return element.center;
      case 'line':
        return {
          x: (element.start.x + element.end.x) / 2,
          y: (element.start.y + element.end.y) / 2,
        };
      case 'hline':
        return {
          x: element.start.x + element.length / 2,
          y: element.start.y,
        };
      case 'vline':
        return {
          x: element.start.x,
          y: element.start.y + element.length / 2,
        };
      case 'arc':
        return element.center;
      case 'spline': {
        if (element.points.length === 0) return { x: 0, y: 0 };
        const sumX = element.points.reduce((acc, p) => acc + p.x, 0);
        const sumY = element.points.reduce((acc, p) => acc + p.y, 0);
        return {
          x: sumX / element.points.length,
          y: sumY / element.points.length,
        };
      }
    }
  }

  /**
   * Check if an element is extrudable (closed profile)
   */
  private isExtrudable(element: SketchElement): boolean {
    return element.type === 'rectangle' || element.type === 'circle';
  }

  /**
   * Generate replicad code for a sketch feature
   * Returns the drawing code for all extrudable elements in the sketch as an array
   */
  generateSketchCode(sketch: SketchFeature): string {
    if (sketch.elements.length === 0) {
      return '[]';
    }

    const extrudableElements = sketch.elements.filter((e) => this.isExtrudable(e));

    if (extrudableElements.length === 0) {
      // No extrudable elements, return empty array
      return '[]';
    }

    // Return array of drawing codes for all extrudable elements
    const elementCodes = extrudableElements.map((e) => this.generateElementDrawingCode(e));
    return `[${elementCodes.join(', ')}]`;
  }

  /**
   * Get the center points for all extrudable elements in a sketch
   */
  private getExtrudableElementCenters(sketch: SketchFeature): Point[] {
    const extrudableElements = sketch.elements.filter((e) => this.isExtrudable(e));
    return extrudableElements.map((e) => this.getElementCenter(e));
  }

  /**
   * Generate replicad code for an extrusion feature
   * Handles multiple elements in a sketch by extruding each and combining them
   * @param extrusion The extrusion feature
   * @param sketchVarName Variable name of the sketch drawing array
   * @param resultVarName Variable name to assign the result to
   * @param features All features (for looking up parent feature for face sketches)
   * @returns Generated code string (may be multiple lines)
   */
  generateExtrusionCode(
    extrusion: ExtrusionFeature,
    sketchVarName: string,
    resultVarName: string,
    features: Feature[]
  ): string {
    // Find the sketch to get its reference info
    const sketch = features.find((f) => f.id === extrusion.sketchId) as SketchFeature | undefined;
    if (!sketch) {
      return `// ERROR: Sketch ${extrusion.sketchId} not found`;
    }

    const depth = extrusion.direction === 'reverse' ? -extrusion.depth : extrusion.depth;
    const depthStr = depth.toFixed(2);

    // Get centers for all extrudable elements (for face sketches)
    const centers = this.getExtrudableElementCenters(sketch);
    if (centers.length === 0) {
      return `// ERROR: No extrudable elements in sketch`;
    }

    const lines: string[] = [];

    // For face sketches with multiple elements and 'cut' operation,
    // we need to build all shapes BEFORE modifying the solid (face indices change after cuts)
    if (sketch.reference.type === 'face' && centers.length > 1 && extrusion.operation === 'cut') {
      const faceIndex = sketch.reference.faceIndex;
      const cutVarName = `${sketchVarName}_cutShape`;

      // Build first cut shape
      const firstCenter = centers[0];
      lines.push(`let ${cutVarName} = sketchOnFace(${sketchVarName}[0], ${resultVarName}, ${faceIndex}, ${firstCenter.x.toFixed(2)}, ${firstCenter.y.toFixed(2)}).extrude(${depthStr});`);

      // Fuse remaining cut shapes (all using original result for face reference)
      for (let i = 1; i < centers.length; i++) {
        const center = centers[i];
        lines.push(`${cutVarName} = ${cutVarName}.fuse(sketchOnFace(${sketchVarName}[${i}], ${resultVarName}, ${faceIndex}, ${center.x.toFixed(2)}, ${center.y.toFixed(2)}).extrude(${depthStr}));`);
      }

      // Apply single cut with combined shape
      lines.push(`${resultVarName} = ${resultVarName}.cut(${cutVarName});`);
    } else {
      // Standard plane or single element or fuse/new operation
      for (let i = 0; i < centers.length; i++) {
        const center = centers[i];
        let sketchOnCode: string;

        if (sketch.reference.type === 'standard') {
          const plane = sketch.reference.plane;
          sketchOnCode = `${sketchVarName}[${i}].sketchOnPlane("${plane}")`;
        } else {
          const faceIndex = sketch.reference.faceIndex;
          sketchOnCode = `sketchOnFace(${sketchVarName}[${i}], ${resultVarName}, ${faceIndex}, ${center.x.toFixed(2)}, ${center.y.toFixed(2)})`;
        }

        const extrudeCode = `${sketchOnCode}.extrude(${depthStr})`;

        if (i === 0) {
          // First element
          switch (extrusion.operation) {
            case 'new':
              lines.push(`${resultVarName} = ${extrudeCode};`);
              break;
            case 'fuse':
              lines.push(`${resultVarName} = ${resultVarName}.fuse(${extrudeCode});`);
              break;
            case 'cut':
              lines.push(`${resultVarName} = ${resultVarName}.cut(${extrudeCode});`);
              break;
            default:
              lines.push(`${resultVarName} = ${extrudeCode};`);
          }
        } else {
          // Subsequent elements - always fuse with the result for 'new' and 'fuse', cut for 'cut'
          if (extrusion.operation === 'cut') {
            lines.push(`${resultVarName} = ${resultVarName}.cut(${extrudeCode});`);
          } else {
            lines.push(`${resultVarName} = ${resultVarName}.fuse(${extrudeCode});`);
          }
        }
      }
    }

    return lines.join('\n  ');
  }

  /**
   * Generate replicad code for a cut feature
   * Similar to extrusion but always performs a cut operation
   * Handles multiple elements in a sketch by cutting each
   * @param cut The cut feature
   * @param sketchVarName Variable name of the sketch drawing array
   * @param resultVarName Variable name to assign the result to
   * @param features All features (for looking up sketch info)
   * @returns Generated code string (may be multiple lines)
   */
  generateCutCode(
    cut: CutFeature,
    sketchVarName: string,
    resultVarName: string,
    features: Feature[]
  ): string {
    // Find the sketch to get its reference info
    const sketch = features.find((f) => f.id === cut.sketchId) as SketchFeature | undefined;
    if (!sketch) {
      return `// ERROR: Sketch ${cut.sketchId} not found`;
    }

    // Determine depth
    let depthValue: number;
    if (cut.depth === 'through') {
      // Use a large value for through-all cuts
      depthValue = 1000;
    } else {
      depthValue = cut.depth;
    }

    // Handle direction
    // NOTE: For cuts, we typically want to cut INTO the solid
    // When sketching on a face, the face normal points outward
    // So 'normal' direction for a cut should use NEGATIVE depth to cut inward
    let depth: number;
    const isOnFace = sketch.reference.type === 'face';

    switch (cut.direction) {
      case 'normal':
        // For face sketches, 'normal' cuts INTO the solid (negative depth)
        // For standard planes, 'normal' is positive
        depth = isOnFace ? -depthValue : depthValue;
        break;
      case 'reverse':
        // Opposite of normal
        depth = isOnFace ? depthValue : -depthValue;
        break;
      case 'both':
        // For both directions, we'll need two operations
        // For now, just use the inward direction
        depth = isOnFace ? -depthValue : depthValue;
        break;
      default:
        depth = isOnFace ? -depthValue : depthValue;
    }

    const depthStr = depth.toFixed(2);

    // Get centers for all extrudable elements
    const centers = this.getExtrudableElementCenters(sketch);
    if (centers.length === 0) {
      return `// ERROR: No extrudable elements in sketch`;
    }

    const lines: string[] = [];

    // For face sketches with multiple elements, we need to build all cut shapes
    // BEFORE modifying the solid, because face indices change after each cut.
    // We fuse all cut shapes together and then cut once.
    if (sketch.reference.type === 'face' && centers.length > 1) {
      const faceIndex = sketch.reference.faceIndex;
      const cutVarName = `${sketchVarName}_cutShape`;

      // Build first cut shape
      const firstCenter = centers[0];
      lines.push(`let ${cutVarName} = sketchOnFace(${sketchVarName}[0], ${resultVarName}, ${faceIndex}, ${firstCenter.x.toFixed(2)}, ${firstCenter.y.toFixed(2)}).extrude(${depthStr});`);

      // Fuse remaining cut shapes (all using original result for face reference)
      for (let i = 1; i < centers.length; i++) {
        const center = centers[i];
        lines.push(`${cutVarName} = ${cutVarName}.fuse(sketchOnFace(${sketchVarName}[${i}], ${resultVarName}, ${faceIndex}, ${center.x.toFixed(2)}, ${center.y.toFixed(2)}).extrude(${depthStr}));`);
      }

      // Apply single cut with combined shape
      lines.push(`${resultVarName} = ${resultVarName}.cut(${cutVarName});`);
    } else {
      // Standard plane or single element - original approach works fine
      for (let i = 0; i < centers.length; i++) {
        const center = centers[i];
        let sketchOnCode: string;

        if (sketch.reference.type === 'standard') {
          const plane = sketch.reference.plane;
          sketchOnCode = `${sketchVarName}[${i}].sketchOnPlane("${plane}")`;
        } else {
          const faceIndex = sketch.reference.faceIndex;
          sketchOnCode = `sketchOnFace(${sketchVarName}[${i}], ${resultVarName}, ${faceIndex}, ${center.x.toFixed(2)}, ${center.y.toFixed(2)})`;
        }

        const extrudeCode = `${sketchOnCode}.extrude(${depthStr})`;
        lines.push(`${resultVarName} = ${resultVarName}.cut(${extrudeCode});`);
      }
    }

    return lines.join('\n  ');
  }

  /**
   * Generate replicad code for a chamfer feature
   */
  generateChamferCode(
    chamfer: ChamferFeature,
    resultVarName: string
  ): string {
    if (chamfer.edgeIndices.length === 0) {
      return `// Chamfer: No edges selected`;
    }

    // Use edge finder to select edges
    const edgeSelectors = chamfer.edgeIndices
      .map((idx) => `(e, i) => i === ${idx}`)
      .join(' || ');

    return `${resultVarName} = ${resultVarName}.chamfer(${chamfer.distance.toFixed(2)}, (e) => { let i = 0; return ${resultVarName}.edges.some((edge, idx) => { if ((${edgeSelectors})(edge, idx)) { i = idx; return true; } return false; }) ? [${resultVarName}.edges[i]] : []; });`;
  }

  /**
   * Generate replicad code for a fillet feature
   */
  generateFilletCode(
    fillet: FilletFeature,
    resultVarName: string
  ): string {
    if (fillet.edgeIndices.length === 0) {
      return `// Fillet: No edges selected`;
    }

    // Use edge finder to select edges
    const edgeSelectors = fillet.edgeIndices
      .map((idx) => `(e, i) => i === ${idx}`)
      .join(' || ');

    return `${resultVarName} = ${resultVarName}.fillet(${fillet.radius.toFixed(2)}, (e) => { let i = 0; return ${resultVarName}.edges.some((edge, idx) => { if ((${edgeSelectors})(edge, idx)) { i = idx; return true; } return false; }) ? [${resultVarName}.edges[i]] : []; });`;
  }

  /**
   * Topologically sort features so dependencies come before dependents
   * Uses Kahn's algorithm for topological sorting
   */
  topologicalSort(features: Feature[]): Feature[] {
    if (features.length === 0) return [];

    // Build adjacency list and in-degree count
    const featureMap = new Map<string, Feature>();
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    for (const feature of features) {
      featureMap.set(feature.id, feature);
      inDegree.set(feature.id, 0);
      adjacencyList.set(feature.id, []);
    }

    // Build graph
    for (const feature of features) {
      const deps = getFeatureDependencies(feature);
      for (const depId of deps) {
        if (featureMap.has(depId)) {
          // depId -> feature.id (dependency points to dependent)
          adjacencyList.get(depId)!.push(feature.id);
          inDegree.set(feature.id, (inDegree.get(feature.id) || 0) + 1);
        }
      }
    }

    // Find all features with no dependencies (in-degree 0)
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Process queue
    const result: Feature[] = [];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const feature = featureMap.get(currentId)!;
      result.push(feature);

      // Reduce in-degree for dependents
      for (const dependentId of adjacencyList.get(currentId) || []) {
        const newDegree = (inDegree.get(dependentId) || 0) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    // Check for cycles
    if (result.length !== features.length) {
      console.warn('Circular dependency detected in features, falling back to creation order');
      // Return features sorted by createdAt as fallback
      return [...features].sort((a, b) => a.createdAt - b.createdAt);
    }

    return result;
  }

  /**
   * Generate complete replicad code for all features
   * @param features Array of all features
   * @returns Complete JavaScript code string with main() function
   */
  generateFullCode(features: Feature[]): string {
    if (features.length === 0) {
      return `// No features defined
function main() {
  return null;
}
`;
    }

    // Sort features topologically
    const orderedFeatures = this.topologicalSort(features);

    // Track variable names for each feature
    const featureVarNames = new Map<string, string>();
    const lines: string[] = [];
    let resultInitialized = false;

    // Process each feature
    for (const feature of orderedFeatures) {
      const varName = toVariableName(feature.name);
      featureVarNames.set(feature.id, varName);

      lines.push(`  // ${feature.name}`);

      switch (feature.type) {
        case 'sketch': {
          // Generate sketch drawing code
          const sketchCode = this.generateSketchCode(feature);
          lines.push(`  const ${varName} = ${sketchCode};`);
          break;
        }

        case 'extrusion': {
          const sketchVarName = featureVarNames.get(feature.sketchId);
          if (!sketchVarName) {
            lines.push(`  // ERROR: Sketch for extrusion not found`);
            break;
          }

          // Determine if this is the first shape (operation 'new') or combining with existing
          if (!resultInitialized || feature.operation === 'new') {
            // First extrusion or explicit 'new' - create result
            const extrusionCode = this.generateExtrusionCode(
              feature,
              sketchVarName,
              'result',
              orderedFeatures
            );
            // Replace assignment to handle 'new' operation
            if (feature.operation === 'new' && resultInitialized) {
              lines.push(`  ${extrusionCode.replace('result = result.', 'result = ')}`);
            } else {
              lines.push(`  let ${extrusionCode}`);
              resultInitialized = true;
            }
          } else {
            const extrusionCode = this.generateExtrusionCode(
              feature,
              sketchVarName,
              'result',
              orderedFeatures
            );
            lines.push(`  ${extrusionCode}`);
          }
          break;
        }

        case 'cut': {
          const sketchVarName = featureVarNames.get(feature.sketchId);
          if (!sketchVarName) {
            lines.push(`  // ERROR: Sketch for cut not found`);
            break;
          }

          if (!resultInitialized) {
            lines.push(`  // ERROR: Cannot cut without existing geometry`);
            break;
          }

          const cutCode = this.generateCutCode(
            feature,
            sketchVarName,
            'result',
            orderedFeatures
          );
          lines.push(`  ${cutCode}`);
          break;
        }

        case 'chamfer': {
          if (!resultInitialized) {
            lines.push(`  // ERROR: Cannot chamfer without existing geometry`);
            break;
          }

          const chamferCode = this.generateChamferCode(feature, 'result');
          lines.push(`  ${chamferCode}`);
          break;
        }

        case 'fillet': {
          if (!resultInitialized) {
            lines.push(`  // ERROR: Cannot fillet without existing geometry`);
            break;
          }

          const filletCode = this.generateFilletCode(feature, 'result');
          lines.push(`  ${filletCode}`);
          break;
        }
      }

      lines.push('');
    }

    // Build final code
    // If no geometry was created (only sketches without extrusions), return null
    const returnStatement = resultInitialized ? 'return result;' : 'return null;';
    const code = `// Generated from feature tree
function main() {
${lines.join('\n')}
  ${returnStatement}
}
`;

    return code;
  }

  /**
   * Generate code for features up to (and including) a specific feature
   * Useful for feature rollback/preview
   * @param features All features
   * @param upToId Feature ID to stop at
   * @returns Generated code string
   */
  generateCodeUpTo(features: Feature[], upToId: string): string {
    // Sort features topologically
    const orderedFeatures = this.topologicalSort(features);

    // Find index of target feature
    const targetIndex = orderedFeatures.findIndex((f) => f.id === upToId);
    if (targetIndex === -1) {
      return this.generateFullCode([]);
    }

    // Include all features up to and including target
    const includedFeatures = orderedFeatures.slice(0, targetIndex + 1);

    return this.generateFullCode(includedFeatures);
  }

  /**
   * Extract face boundaries from shape data for sketching on faces
   * @param shapeData The shape data from the worker
   * @returns Map of face index to 2D boundary points
   */
  extractFaceBoundaries(shapeData: ShapeData): Map<number, Point[]> {
    const boundaries = new Map<number, Point[]>();

    for (const face of shapeData.individualFaces) {
      if (face.boundaryPoints2D && face.boundaryPoints2D.length > 0) {
        boundaries.set(face.faceIndex, face.boundaryPoints2D);
      }
    }

    return boundaries;
  }
}

// Export singleton instance for convenience
export const featureEvaluator = new FeatureEvaluator();
