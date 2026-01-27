import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore, planesEqual, getElementCenter, getPlaneOrientation } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import { extractSolverPrimitives } from '../utils/sketchToSolver';
import { detectAutoConstraints } from '../utils/autoConstraints';
import FloatingConstraints from './FloatingConstraints';
import {
  SelectIcon,
  RectangleIcon,
  CircleIcon,
  LineIcon,
  ArcIcon,
  SplineIcon,
} from './icons/ToolIcons';
import {
  ConstraintType,
  type Point,
  type SketchElement,
  type SketchFeature,
  type RectangleElement,
  type LineElement,
  type HLineElement,
  type VLineElement,
  type SketchTool,
  type Constraint,
  type SolverPoint,
  type SolverLine,
  type SolverCircle,
} from '../types';
import {
  detectClosedProfiles,
  getElementEndpoints,
} from '../utils/closedFigureDetection';

const GRID_SIZE = 10;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// Drawing state for multi-step tools
interface DrawingState {
  tool: SketchTool;
  step: number;
  points: Point[];
}

// Dimension editing state
interface DimensionEdit {
  elementId: string;
  dimension: string;
  position: Point;
  value: string; // Store as string to allow intermediate input states
}

export function Sketcher() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Basic drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [offset, _setOffset] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Multi-step drawing state (for arc, spline)
  const [drawingState, setDrawingState] = useState<DrawingState | null>(null);

  // Drag state for moving elements or points
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragElementId, setDragElementId] = useState<string | null>(null);
  const [dragPointId, setDragPointId] = useState<string | null>(null); // e.g., "elementId_start" or "elementId_end"

  // Dimension editing state
  const [dimensionEdit, setDimensionEdit] = useState<DimensionEdit | null>(null);

  // Touch state for pinch-to-zoom
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const lastTapRef = useRef<number>(0);

  // Store access
  const elements = useStore((state) => state.elements);
  const currentTool = useStore((state) => state.currentTool);
  const addElement = useStore((state) => state.addElement);
  const moveElement = useStore((state) => state.moveElement);
  const updateElement = useStore((state) => state.updateElement);
  const selectElement = useStore((state) => state.selectElement);
  const deselectAll = useStore((state) => state.deselectAll);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const shapeData = useStore((state) => state.shapeData);
  const faceOutline = useStore((state) => state.faceOutline);
  const setCurrentTool = useStore((state) => state.setCurrentTool);

  // Constraint selection state from store
  const selectedPointIds = useStore((state) => state.selectedPointIds);
  const selectedLineIds = useStore((state) => state.selectedLineIds);
  const selectedCircleIds = useStore((state) => state.selectedCircleIds);
  const selectPoint = useStore((state) => state.selectPoint);
  const selectLine = useStore((state) => state.selectLine);
  const selectCircle = useStore((state) => state.selectCircle);
  const clearConstraintSelection = useStore((state) => state.clearConstraintSelection);
  const removeElement = useStore((state) => state.removeElement);

  // Feature store access for constraint operations
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const addConstraint = useFeatureStore((state) => state.addConstraint);
  const solveConstraints = useFeatureStore((state) => state.solveConstraints);
  const featureById = useFeatureStore((state) => state.featureById);

  // Get existing constraints from current sketch
  const existingConstraints = useMemo(() => {
    if (!editingSketchId) return [];
    const feature = featureById.get(editingSketchId);
    if (!feature || feature.type !== 'sketch') return [];
    return (feature as SketchFeature).constraints;
  }, [editingSketchId, featureById]);

  // Get current plane's orientation
  const currentOrientation = useMemo(
    () => getPlaneOrientation(sketchPlane, shapeData),
    [sketchPlane, shapeData]
  );

  // Filter elements by current plane
  const currentPlaneElements = useMemo(
    () => elements.filter((e) => planesEqual(e.plane, sketchPlane)),
    [elements, sketchPlane]
  );

  // Detect closed profiles whenever current plane elements change
  const detectedClosedProfiles = useMemo(
    () => detectClosedProfiles(currentPlaneElements),
    [currentPlaneElements]
  );

  // Notify store of detected closed profiles for feature sync
  const setDetectedClosedProfiles = useStore((state) => state.setDetectedClosedProfiles);
  useEffect(() => {
    setDetectedClosedProfiles?.(detectedClosedProfiles);
  }, [detectedClosedProfiles, setDetectedClosedProfiles]);

  // Extract solver primitives from current plane elements for point/line/circle hit detection
  const solverPrimitives = useMemo(
    () => extractSolverPrimitives(currentPlaneElements),
    [currentPlaneElements]
  );
  // Elements on parallel planes (same orientation, different plane - shown dimmed)
  // For standard planes: show elements from same orientation
  // For face planes: show elements from standard planes with same orientation
  const otherPlaneElements = useMemo(
    () => elements.filter((e) => {
      // Skip elements on the exact same plane
      if (planesEqual(e.plane, sketchPlane)) return false;

      // Get orientations
      const elemOrientation = getPlaneOrientation(e.plane, shapeData);

      // If current plane is a standard plane, show elements from same orientation
      if (typeof sketchPlane === 'string') {
        return elemOrientation === sketchPlane;
      }

      // If current plane is a face plane, show elements from standard planes
      // with the same orientation as the face (if we can determine it)
      if (currentOrientation && elemOrientation === currentOrientation) {
        return true;
      }

      // If we can't determine face orientation, don't show other elements
      // (safer than showing wrong projections)
      return false;
    }),
    [elements, sketchPlane, shapeData, currentOrientation]
  );

  // Coordinate transformations
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const x = (screenX - rect.left - centerX) / scale - offset.x;
      const y = -(screenY - rect.top - centerY) / scale - offset.y; // Flip Y axis

      return { x: snapToGrid(x), y: snapToGrid(y) };
    },
    [scale, offset]
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const x = (worldX + offset.x) * scale + centerX;
      const y = -(worldY + offset.y) * scale + centerY; // Flip Y axis

      return { x, y };
    },
    [scale, offset]
  );

  // Apply auto-constraints for a newly added element
  const applyAutoConstraints = useCallback(
    (newElement: SketchElement) => {
      if (!editingSketchId) return;

      const result = detectAutoConstraints(
        newElement,
        currentPlaneElements,
        existingConstraints
      );

      if (result.constraints.length > 0) {
        console.log('[Sketcher] Auto-constraints detected:', result.description);

        // Add each detected constraint
        for (const constraintData of result.constraints) {
          addConstraint(editingSketchId, constraintData);
        }

        // Solve constraints to apply them
        solveConstraints(editingSketchId);
      }
    },
    [editingSketchId, currentPlaneElements, existingConstraints, addConstraint, solveConstraints]
  );

  // Hit testing for elements
  const hitTestElement = useCallback(
    (point: Point, element: SketchElement): boolean => {
      const tolerance = 5 / scale; // 5 pixels in world units

      switch (element.type) {
        case 'rectangle': {
          const minX = Math.min(element.start.x, element.end.x);
          const maxX = Math.max(element.start.x, element.end.x);
          const minY = Math.min(element.start.y, element.end.y);
          const maxY = Math.max(element.start.y, element.end.y);
          return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        }
        case 'circle': {
          const dist = Math.sqrt(
            (point.x - element.center.x) ** 2 + (point.y - element.center.y) ** 2
          );
          return dist <= element.radius + tolerance;
        }
        case 'line': {
          // Point-to-line-segment distance
          const dx = element.end.x - element.start.x;
          const dy = element.end.y - element.start.y;
          const len2 = dx * dx + dy * dy;
          if (len2 === 0) return Math.hypot(point.x - element.start.x, point.y - element.start.y) <= tolerance;

          let t = ((point.x - element.start.x) * dx + (point.y - element.start.y) * dy) / len2;
          t = Math.max(0, Math.min(1, t));

          const nearX = element.start.x + t * dx;
          const nearY = element.start.y + t * dy;
          const dist = Math.hypot(point.x - nearX, point.y - nearY);
          return dist <= tolerance;
        }
        case 'hline': {
          const endX = element.start.x + element.length;
          const minX = Math.min(element.start.x, endX);
          const maxX = Math.max(element.start.x, endX);
          return (
            point.x >= minX - tolerance &&
            point.x <= maxX + tolerance &&
            Math.abs(point.y - element.start.y) <= tolerance
          );
        }
        case 'vline': {
          const endY = element.start.y + element.length;
          const minY = Math.min(element.start.y, endY);
          const maxY = Math.max(element.start.y, endY);
          return (
            point.y >= minY - tolerance &&
            point.y <= maxY + tolerance &&
            Math.abs(point.x - element.start.x) <= tolerance
          );
        }
        case 'arc': {
          const dist = Math.sqrt(
            (point.x - element.center.x) ** 2 + (point.y - element.center.y) ** 2
          );
          if (Math.abs(dist - element.radius) > tolerance) return false;

          // Check if angle is within arc range
          let angle = Math.atan2(point.y - element.center.y, point.x - element.center.x);
          let startAngle = element.startAngle;
          let endAngle = element.endAngle;

          // Normalize angles
          while (endAngle < startAngle) endAngle += Math.PI * 2;
          while (angle < startAngle) angle += Math.PI * 2;

          return angle >= startAngle && angle <= endAngle;
        }
        case 'spline': {
          // Check distance to each segment
          for (let i = 0; i < element.points.length - 1; i++) {
            const p1 = element.points[i];
            const p2 = element.points[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len2 = dx * dx + dy * dy;

            if (len2 === 0) {
              if (Math.hypot(point.x - p1.x, point.y - p1.y) <= tolerance) return true;
              continue;
            }

            let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2;
            t = Math.max(0, Math.min(1, t));

            const nearX = p1.x + t * dx;
            const nearY = p1.y + t * dy;
            if (Math.hypot(point.x - nearX, point.y - nearY) <= tolerance) return true;
          }
          return false;
        }
      }
    },
    [scale]
  );

  // Hit testing for solver points (within 8px threshold accounting for scale)
  const hitTestPoint = useCallback(
    (worldPoint: Point, solverPoint: SolverPoint): boolean => {
      const threshold = 8 / scale; // 8 pixels in world units
      const dx = worldPoint.x - solverPoint.x;
      const dy = worldPoint.y - solverPoint.y;
      return Math.sqrt(dx * dx + dy * dy) <= threshold;
    },
    [scale]
  );

  // Hit testing for solver lines (within 8px threshold)
  const hitTestSolverLine = useCallback(
    (worldPoint: Point, solverLine: SolverLine, points: SolverPoint[]): boolean => {
      const threshold = 8 / scale;
      const p1 = points.find((p) => p.id === solverLine.p1);
      const p2 = points.find((p) => p.id === solverLine.p2);
      if (!p1 || !p2) return false;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(worldPoint.x - p1.x, worldPoint.y - p1.y) <= threshold;

      let t = ((worldPoint.x - p1.x) * dx + (worldPoint.y - p1.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));

      const nearX = p1.x + t * dx;
      const nearY = p1.y + t * dy;
      return Math.hypot(worldPoint.x - nearX, worldPoint.y - nearY) <= threshold;
    },
    [scale]
  );

  // Hit testing for solver circles (within 8px of the circumference)
  const hitTestSolverCircle = useCallback(
    (worldPoint: Point, solverCircle: SolverCircle, points: SolverPoint[]): boolean => {
      const threshold = 8 / scale;
      const center = points.find((p) => p.id === solverCircle.center);
      if (!center) return false;

      const dist = Math.sqrt(
        (worldPoint.x - center.x) ** 2 + (worldPoint.y - center.y) ** 2
      );
      // Check if near the circumference OR inside the circle
      return Math.abs(dist - solverCircle.radius) <= threshold || dist <= solverCircle.radius;
    },
    [scale]
  );

  // Find what solver primitive was clicked (point, line, or circle)
  const findClickedPrimitive = useCallback(
    (worldPoint: Point): { type: 'point' | 'line' | 'circle'; id: string } | null => {
      const { points, lines, circles } = solverPrimitives;

      // Check points first (highest priority - smallest target)
      for (const pt of points) {
        if (hitTestPoint(worldPoint, pt)) {
          return { type: 'point', id: pt.id };
        }
      }

      // Check circles next (before lines to prioritize center points)
      for (const circle of circles) {
        if (hitTestSolverCircle(worldPoint, circle, points)) {
          return { type: 'circle', id: circle.id };
        }
      }

      // Check lines last
      for (const line of lines) {
        if (hitTestSolverLine(worldPoint, line, points)) {
          return { type: 'line', id: line.id };
        }
      }

      return null;
    },
    [solverPrimitives, hitTestPoint, hitTestSolverLine, hitTestSolverCircle]
  );

  // Draw a single element
  const drawElement = useCallback(
    (ctx: CanvasRenderingContext2D, element: SketchElement, isOtherPlane: boolean) => {
      const isSelected = element.selected;

      if (isOtherPlane) {
        ctx.fillStyle = 'rgba(88, 91, 112, 0.15)';
        ctx.strokeStyle = '#585b70';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
      } else {
        ctx.fillStyle = isSelected ? 'rgba(137, 180, 250, 0.3)' : 'rgba(166, 227, 161, 0.3)';
        ctx.strokeStyle = isSelected ? '#89b4fa' : '#a6e3a1';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([]);
      }

      switch (element.type) {
        case 'rectangle': {
          const start = worldToScreen(element.start.x, element.start.y);
          const end = worldToScreen(element.end.x, element.end.y);
          const width = end.x - start.x;
          const height = end.y - start.y;

          ctx.fillRect(start.x, start.y, width, height);
          ctx.strokeRect(start.x, start.y, width, height);

          // Draw dimensions
          if (!isOtherPlane) {
            const rectWidth = Math.abs(element.end.x - element.start.x);
            const rectHeight = Math.abs(element.end.y - element.start.y);
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            ctx.fillText(
              `${rectWidth.toFixed(0)} x ${rectHeight.toFixed(0)}`,
              (start.x + end.x) / 2 - 20,
              (start.y + end.y) / 2 + 4
            );
          }
          break;
        }

        case 'circle': {
          const center = worldToScreen(element.center.x, element.center.y);
          const radiusScreen = element.radius * scale;

          ctx.beginPath();
          ctx.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw radius dimension
          if (!isOtherPlane) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            ctx.fillText(`r=${element.radius.toFixed(0)}`, center.x + 5, center.y - 5);
          }
          break;
        }

        case 'line': {
          const start = worldToScreen(element.start.x, element.start.y);
          const end = worldToScreen(element.end.x, element.end.y);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          // Draw length dimension
          if (!isOtherPlane) {
            const length = Math.sqrt(
              (element.end.x - element.start.x) ** 2 + (element.end.y - element.start.y) ** 2
            );
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            ctx.fillText(`L=${length.toFixed(0)}`, (start.x + end.x) / 2 + 5, (start.y + end.y) / 2 - 5);
          }
          break;
        }

        case 'hline': {
          const start = worldToScreen(element.start.x, element.start.y);
          const end = worldToScreen(element.start.x + element.length, element.start.y);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          // Draw length dimension
          if (!isOtherPlane) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            ctx.fillText(`L=${Math.abs(element.length).toFixed(0)}`, (start.x + end.x) / 2, start.y - 8);
          }
          break;
        }

        case 'vline': {
          const start = worldToScreen(element.start.x, element.start.y);
          const end = worldToScreen(element.start.x, element.start.y + element.length);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          // Draw length dimension
          if (!isOtherPlane) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            ctx.fillText(`L=${Math.abs(element.length).toFixed(0)}`, start.x + 8, (start.y + end.y) / 2);
          }
          break;
        }

        case 'arc': {
          const center = worldToScreen(element.center.x, element.center.y);
          const radiusScreen = element.radius * scale;

          ctx.beginPath();
          // Note: canvas arc uses clockwise angles, but we flip Y axis
          ctx.arc(center.x, center.y, radiusScreen, -element.startAngle, -element.endAngle, true);
          ctx.stroke();

          // Draw radius and angle dimensions
          if (!isOtherPlane) {
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '11px monospace';
            const angleDeg = Math.abs(element.endAngle - element.startAngle) * (180 / Math.PI);
            ctx.fillText(`r=${element.radius.toFixed(0)}, ${angleDeg.toFixed(0)}°`, center.x + 5, center.y - 5);
          }
          break;
        }

        case 'spline': {
          if (element.points.length < 2) break;

          ctx.beginPath();
          const firstScreen = worldToScreen(element.points[0].x, element.points[0].y);
          ctx.moveTo(firstScreen.x, firstScreen.y);

          // Draw smooth curve through points using quadratic curves
          for (let i = 1; i < element.points.length; i++) {
            const curr = worldToScreen(element.points[i].x, element.points[i].y);
            if (i === 1) {
              ctx.lineTo(curr.x, curr.y);
            } else {
              const prev = worldToScreen(element.points[i - 1].x, element.points[i - 1].y);
              const midX = (prev.x + curr.x) / 2;
              const midY = (prev.y + curr.y) / 2;
              ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
            }
          }
          // Draw to the last point
          if (element.points.length > 2) {
            const last = worldToScreen(
              element.points[element.points.length - 1].x,
              element.points[element.points.length - 1].y
            );
            ctx.lineTo(last.x, last.y);
          }
          ctx.stroke();

          // Draw control points
          if (!isOtherPlane) {
            ctx.fillStyle = isSelected ? '#89b4fa' : '#a6e3a1';
            element.points.forEach((p) => {
              const screen = worldToScreen(p.x, p.y);
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          break;
        }
      }

      ctx.setLineDash([]);
    },
    [worldToScreen, scale]
  );

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#313244';
    ctx.lineWidth = 1;

    const gridStep = GRID_SIZE * scale;
    const origin = worldToScreen(0, 0);

    // Vertical lines
    for (let x = origin.x % gridStep; x < canvas.width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = origin.y % gridStep; y < canvas.height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Determine axis labels based on current plane
    let horizontalAxis = 'X';
    let verticalAxis = 'Y';
    if (typeof sketchPlane === 'string') {
      if (sketchPlane === 'XZ') {
        horizontalAxis = 'X';
        verticalAxis = 'Z';
      } else if (sketchPlane === 'YZ') {
        horizontalAxis = 'Y';
        verticalAxis = 'Z';
      }
    }

    // Draw axes
    ctx.strokeStyle = '#585b70';
    ctx.lineWidth = 2;

    // Horizontal axis
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(canvas.width, origin.y);
    ctx.stroke();

    // Vertical axis
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 12px monospace';

    // Horizontal axis label (right side)
    ctx.fillText(horizontalAxis, canvas.width - 20, origin.y - 8);

    // Vertical axis label (top)
    ctx.fillText(verticalAxis, origin.x + 8, 20);

    // Draw face boundary if we're sketching on a face
    // This helps users understand where they're sketching relative to the face
    if (faceOutline && faceOutline.length >= 3) {
      ctx.save();

      // Draw semi-transparent filled area showing the face
      ctx.fillStyle = 'rgba(100, 150, 255, 0.1)'; // Light blue transparent
      ctx.beginPath();
      const firstPoint = worldToScreen(faceOutline[0].x, faceOutline[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < faceOutline.length; i++) {
        const point = worldToScreen(faceOutline[i].x, faceOutline[i].y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fill();

      // Draw dashed outline around the face boundary
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)'; // Blue dashed line
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < faceOutline.length; i++) {
        const point = worldToScreen(faceOutline[i].x, faceOutline[i].y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.stroke();

      // Draw origin marker (cross) at face center
      // The face outline is shifted so (0,0) is at the corner, so we need to compute the center
      const minX = Math.min(...faceOutline.map(p => p.x));
      const maxX = Math.max(...faceOutline.map(p => p.x));
      const minY = Math.min(...faceOutline.map(p => p.y));
      const maxY = Math.max(...faceOutline.map(p => p.y));
      const faceCenterX = (minX + maxX) / 2;
      const faceCenterY = (minY + maxY) / 2;
      const originScreen = worldToScreen(faceCenterX, faceCenterY);

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)'; // Red for origin cross
      ctx.lineWidth = 1.5;

      // Draw cross marker
      const crossSize = 10;
      ctx.beginPath();
      ctx.moveTo(originScreen.x - crossSize, originScreen.y);
      ctx.lineTo(originScreen.x + crossSize, originScreen.y);
      ctx.moveTo(originScreen.x, originScreen.y - crossSize);
      ctx.lineTo(originScreen.x, originScreen.y + crossSize);
      ctx.stroke();

      // Draw small circle at origin
      ctx.beginPath();
      ctx.arc(originScreen.x, originScreen.y, 3, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(100, 150, 255, 0.9)';
      ctx.font = '10px monospace';
      ctx.fillText('Face boundary', firstPoint.x + 4, firstPoint.y - 8);

      ctx.restore();
    }

    // Draw elements from other planes with same orientation (dimmed)
    otherPlaneElements.forEach((elem) => drawElement(ctx, elem, true));

    // Draw closed profile highlights (before elements so elements appear on top)
    if (detectedClosedProfiles.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(166, 227, 161, 0.15)'; // Light green transparent
      ctx.strokeStyle = 'rgba(166, 227, 161, 0.5)'; // Green outline
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (const profile of detectedClosedProfiles) {
        // Collect all the points along the profile
        const profilePoints: Point[] = [];

        for (const elemId of profile.elementIds) {
          const elem = currentPlaneElements.find((e) => e.id === elemId);
          if (!elem) continue;

          const endpoints = getElementEndpoints(elem);
          if (endpoints) {
            // Add start point if it's the first or not close to the last added point
            if (
              profilePoints.length === 0 ||
              Math.hypot(
                endpoints.start.x - profilePoints[profilePoints.length - 1].x,
                endpoints.start.y - profilePoints[profilePoints.length - 1].y
              ) > 0.5
            ) {
              profilePoints.push(endpoints.start);
            }
            profilePoints.push(endpoints.end);
          }
        }

        // Draw the filled polygon
        if (profilePoints.length >= 3) {
          ctx.beginPath();
          const first = worldToScreen(profilePoints[0].x, profilePoints[0].y);
          ctx.moveTo(first.x, first.y);

          for (let i = 1; i < profilePoints.length; i++) {
            const pt = worldToScreen(profilePoints[i].x, profilePoints[i].y);
            ctx.lineTo(pt.x, pt.y);
          }

          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Draw elements on current plane
    currentPlaneElements.forEach((elem) => drawElement(ctx, elem, false));

    // Draw solver points for constraint selection
    const { points: solverPoints } = solverPrimitives;
    for (const pt of solverPoints) {
      const screenPt = worldToScreen(pt.x, pt.y);
      const isSelected = selectedPointIds.includes(pt.id);

      // Draw point
      ctx.beginPath();
      if (isSelected) {
        // Selected points: larger, blue
        ctx.fillStyle = '#89b4fa';
        ctx.arc(screenPt.x, screenPt.y, 6, 0, Math.PI * 2);
      } else {
        // Unselected points: smaller, gray
        ctx.fillStyle = '#6c7086';
        ctx.arc(screenPt.x, screenPt.y, 4, 0, Math.PI * 2);
      }
      ctx.fill();

      // Draw a subtle outline for visibility
      ctx.strokeStyle = isSelected ? '#1e66f5' : '#45475a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Highlight selected lines
    const { lines: solverLines } = solverPrimitives;
    for (const line of solverLines) {
      if (selectedLineIds.includes(line.id)) {
        const p1 = solverPoints.find((p) => p.id === line.p1);
        const p2 = solverPoints.find((p) => p.id === line.p2);
        if (p1 && p2) {
          const screen1 = worldToScreen(p1.x, p1.y);
          const screen2 = worldToScreen(p2.x, p2.y);

          ctx.beginPath();
          ctx.strokeStyle = '#89b4fa';
          ctx.lineWidth = 4;
          ctx.moveTo(screen1.x, screen1.y);
          ctx.lineTo(screen2.x, screen2.y);
          ctx.stroke();
        }
      }
    }

    // Highlight selected circles
    const { circles: solverCircles } = solverPrimitives;
    for (const circle of solverCircles) {
      if (selectedCircleIds.includes(circle.id)) {
        const center = solverPoints.find((p) => p.id === circle.center);
        if (center) {
          const screenCenter = worldToScreen(center.x, center.y);
          const screenRadius = circle.radius * scale;

          ctx.beginPath();
          ctx.strokeStyle = '#89b4fa';
          ctx.lineWidth = 4;
          ctx.arc(screenCenter.x, screenCenter.y, screenRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Draw preview for current drawing operation
    if (isDrawing && startPoint && currentPoint) {
      ctx.fillStyle = 'rgba(250, 179, 135, 0.3)';
      ctx.strokeStyle = '#fab387';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      switch (currentTool) {
        case 'rectangle': {
          const start = worldToScreen(startPoint.x, startPoint.y);
          const end = worldToScreen(currentPoint.x, currentPoint.y);
          const width = end.x - start.x;
          const height = end.y - start.y;

          ctx.fillRect(start.x, start.y, width, height);
          ctx.strokeRect(start.x, start.y, width, height);

          // Show dimensions
          const widthVal = Math.abs(currentPoint.x - startPoint.x);
          const heightVal = Math.abs(currentPoint.y - startPoint.y);
          ctx.fillStyle = '#cdd6f4';
          ctx.font = '12px monospace';
          ctx.fillText(`${widthVal} x ${heightVal}`, (start.x + end.x) / 2 - 20, (start.y + end.y) / 2);
          break;
        }

        case 'circle': {
          const center = worldToScreen(startPoint.x, startPoint.y);
          const radius = Math.sqrt(
            (currentPoint.x - startPoint.x) ** 2 + (currentPoint.y - startPoint.y) ** 2
          );
          const radiusScreen = radius * scale;

          ctx.beginPath();
          ctx.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#cdd6f4';
          ctx.font = '12px monospace';
          ctx.fillText(`r = ${radius.toFixed(0)}`, center.x + radiusScreen + 5, center.y);
          break;
        }

        case 'line': {
          const start = worldToScreen(startPoint.x, startPoint.y);
          const end = worldToScreen(currentPoint.x, currentPoint.y);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          const length = Math.sqrt(
            (currentPoint.x - startPoint.x) ** 2 + (currentPoint.y - startPoint.y) ** 2
          );
          ctx.fillStyle = '#cdd6f4';
          ctx.font = '12px monospace';
          ctx.fillText(`L = ${length.toFixed(0)}`, (start.x + end.x) / 2 + 5, (start.y + end.y) / 2 - 5);
          break;
        }

      }

      ctx.setLineDash([]);
    }

    // Draw multi-step drawing preview
    if (drawingState) {
      ctx.fillStyle = 'rgba(250, 179, 135, 0.3)';
      ctx.strokeStyle = '#fab387';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (drawingState.tool === 'arc' && drawingState.points.length >= 1) {
        // Arc preview: show center, then radius line
        const center = worldToScreen(drawingState.points[0].x, drawingState.points[0].y);
        ctx.fillStyle = '#fab387';
        ctx.beginPath();
        ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
        ctx.fill();

        if (currentPoint) {
          const radius = Math.sqrt(
            (currentPoint.x - drawingState.points[0].x) ** 2 +
              (currentPoint.y - drawingState.points[0].y) ** 2
          );

          if (drawingState.points.length === 1) {
            // Show radius line
            const endScreen = worldToScreen(currentPoint.x, currentPoint.y);
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(endScreen.x, endScreen.y);
            ctx.stroke();

            ctx.fillStyle = '#cdd6f4';
            ctx.font = '12px monospace';
            ctx.fillText(`r = ${radius.toFixed(0)}`, center.x + 10, center.y - 10);
          } else if (drawingState.points.length >= 2) {
            // Show arc with current end angle
            const storedRadius = Math.sqrt(
              (drawingState.points[1].x - drawingState.points[0].x) ** 2 +
                (drawingState.points[1].y - drawingState.points[0].y) ** 2
            );
            const storedRadiusScreen = storedRadius * scale;
            const startAngle = Math.atan2(
              drawingState.points[1].y - drawingState.points[0].y,
              drawingState.points[1].x - drawingState.points[0].x
            );

            if (drawingState.points.length === 2) {
              // Show start angle line and prompt for end angle
              const startEndScreen = worldToScreen(
                drawingState.points[0].x + storedRadius * Math.cos(startAngle),
                drawingState.points[0].y + storedRadius * Math.sin(startAngle)
              );
              ctx.beginPath();
              ctx.moveTo(center.x, center.y);
              ctx.lineTo(startEndScreen.x, startEndScreen.y);
              ctx.stroke();

              // Preview arc to current mouse position
              const endAngle = Math.atan2(
                currentPoint.y - drawingState.points[0].y,
                currentPoint.x - drawingState.points[0].x
              );

              ctx.beginPath();
              ctx.arc(center.x, center.y, storedRadiusScreen, -startAngle, -endAngle, true);
              ctx.stroke();
            }
          }
        }
      } else if (drawingState.tool === 'spline' && drawingState.points.length >= 1) {
        // Spline preview: show points and connecting lines
        ctx.fillStyle = '#fab387';
        drawingState.points.forEach((p) => {
          const screen = worldToScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Draw lines between points
        if (drawingState.points.length >= 2) {
          ctx.beginPath();
          const first = worldToScreen(drawingState.points[0].x, drawingState.points[0].y);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < drawingState.points.length; i++) {
            const p = worldToScreen(drawingState.points[i].x, drawingState.points[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }

        // Draw line to current mouse position
        if (currentPoint && drawingState.points.length >= 1) {
          const last = worldToScreen(
            drawingState.points[drawingState.points.length - 1].x,
            drawingState.points[drawingState.points.length - 1].y
          );
          const curr = worldToScreen(currentPoint.x, currentPoint.y);
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
        }
      }

      ctx.setLineDash([]);
    }

    // Draw origin marker
    ctx.fillStyle = '#f38ba8';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [
    currentPlaneElements,
    otherPlaneElements,
    detectedClosedProfiles,
    faceOutline,
    isDrawing,
    startPoint,
    currentPoint,
    drawingState,
    worldToScreen,
    scale,
    currentTool,
    drawElement,
    sketchPlane,
    solverPrimitives,
    selectedPointIds,
    selectedLineIds,
    selectedCircleIds,
  ]);

  // Canvas resize
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Focus input when dimension edit starts (only on initial open, not on value changes)
  const dimensionEditKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (dimensionEdit && inputRef.current) {
      const editKey = `${dimensionEdit.elementId}-${dimensionEdit.dimension}`;
      if (dimensionEditKeyRef.current !== editKey) {
        inputRef.current.focus();
        inputRef.current.select();
        dimensionEditKeyRef.current = editKey;
      }
    } else {
      dimensionEditKeyRef.current = null;
    }
  }, [dimensionEdit]);

  // Mouse down handler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToWorld(e.clientX, e.clientY);

    // Prevent drawing when not editing a sketch (selection is still allowed)
    if (!editingSketchId && currentTool !== 'select') {
      console.log('[Sketcher] Drawing disabled - not editing a sketch');
      return;
    }

    // Debug logging for constraint selection
    console.log('[Sketcher] MouseDown:', {
      currentTool,
      worldPoint: point,
      solverPrimitives: {
        pointCount: solverPrimitives.points.length,
        lineCount: solverPrimitives.lines.length,
        circleCount: solverPrimitives.circles.length,
      },
      currentPlaneElementsCount: currentPlaneElements.length,
    });

    if (currentTool === 'select') {
      // Check for constraint primitive hit (point, line, circle)
      const clickedPrimitive = findClickedPrimitive(point);
      console.log('[Sketcher] Clicked primitive:', clickedPrimitive);

      // Check if there's an element under the click
      const clickedElement = currentPlaneElements.find((elem) => hitTestElement(point, elem));

      // SHIFT+click: Select primitives for constraints
      if (e.shiftKey && clickedPrimitive) {
        // Handle constraint primitive selection with shift key
        if (clickedPrimitive.type === 'point') {
          selectPoint(clickedPrimitive.id, true);
        } else if (clickedPrimitive.type === 'line') {
          selectLine(clickedPrimitive.id, true);
        } else if (clickedPrimitive.type === 'circle') {
          selectCircle(clickedPrimitive.id, true);
        }
        return;
      }

      // Normal click on element
      if (clickedElement) {
        if (clickedElement.selected) {
          // Already selected - check if clicking on a specific point to drag it
          if (clickedPrimitive && clickedPrimitive.type === 'point') {
            // Dragging a specific point (changes shape)
            setIsDragging(true);
            setDragStart(point);
            setDragElementId(clickedElement.id);
            setDragPointId(clickedPrimitive.id); // e.g., "elementId_start"
            clearConstraintSelection();
          } else {
            // Dragging the whole element (preserves shape)
            setIsDragging(true);
            setDragStart(point);
            setDragElementId(clickedElement.id);
            setDragPointId(null);
            clearConstraintSelection();
          }
        } else {
          // Not selected - select it and also select its primitive for constraints
          selectElement(clickedElement.id, false);
          clearConstraintSelection();

          // Also select the clicked primitive for potential constraint operations
          if (clickedPrimitive) {
            if (clickedPrimitive.type === 'point') {
              selectPoint(clickedPrimitive.id, false);
            } else if (clickedPrimitive.type === 'line') {
              selectLine(clickedPrimitive.id, false);
            } else if (clickedPrimitive.type === 'circle') {
              selectCircle(clickedPrimitive.id, false);
            }
          }
        }
      } else {
        // Clicked on empty space
        deselectAll();
        clearConstraintSelection();
      }
    } else if (currentTool === 'arc') {
      // Multi-step arc drawing
      if (!drawingState) {
        // First click: set center
        setDrawingState({ tool: 'arc', step: 0, points: [point] });
      } else if (drawingState.step === 0) {
        // Second click: set radius (end of radius line)
        setDrawingState({
          ...drawingState,
          step: 1,
          points: [...drawingState.points, point],
        });
      } else if (drawingState.step === 1) {
        // Third click: set start angle
        setDrawingState({
          ...drawingState,
          step: 2,
          points: [...drawingState.points, point],
        });
      } else if (drawingState.step === 2) {
        // Fourth click: complete arc
        const center = drawingState.points[0];
        const radiusPoint = drawingState.points[1];
        const radius = Math.sqrt(
          (radiusPoint.x - center.x) ** 2 + (radiusPoint.y - center.y) ** 2
        );
        const startAngle = Math.atan2(
          drawingState.points[2].y - center.y,
          drawingState.points[2].x - center.x
        );
        const endAngle = Math.atan2(point.y - center.y, point.x - center.x);

        const newElement = {
          type: 'arc' as const,
          id: crypto.randomUUID(),
          center,
          radius,
          startAngle,
          endAngle,
        };
        addElement(newElement);
        applyAutoConstraints(newElement as SketchElement);
        setDrawingState(null);
      }
    } else if (currentTool === 'spline') {
      // Multi-step spline drawing
      if (!drawingState) {
        setDrawingState({ tool: 'spline', step: 0, points: [point] });
      } else {
        // Add point to spline
        setDrawingState({
          ...drawingState,
          points: [...drawingState.points, point],
        });
      }
    } else {
      // Single-step tools (rectangle, circle, line, hline, vline)
      setIsDrawing(true);
      setStartPoint(point);
      setCurrentPoint(point);
    }
  };

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToWorld(e.clientX, e.clientY);

    if (isDragging && dragStart && dragElementId) {
      if (dragPointId) {
        // Dragging a specific point - update just that point
        const element = elements.find(e => e.id === dragElementId);
        if (element) {
          // Parse point ID to get the role (e.g., "elementId_start" -> "start")
          const role = dragPointId.split('_').pop();

          if (element.type === 'line') {
            if (role === 'start') {
              updateElement(dragElementId, { start: { x: point.x, y: point.y } });
            } else if (role === 'end') {
              updateElement(dragElementId, { end: { x: point.x, y: point.y } });
            }
          } else if (element.type === 'rectangle') {
            const rect = element as RectangleElement;
            // For rectangles, dragging corners adjusts the bounds
            if (role === 'start' || role === 'corner0') {
              updateElement(dragElementId, {
                start: { x: Math.min(point.x, rect.end.x), y: Math.min(point.y, rect.end.y) },
                end: { x: Math.max(point.x, rect.end.x), y: Math.max(point.y, rect.end.y) }
              });
            } else if (role === 'end' || role === 'corner2') {
              updateElement(dragElementId, {
                start: { x: Math.min(rect.start.x, point.x), y: Math.min(rect.start.y, point.y) },
                end: { x: Math.max(rect.start.x, point.x), y: Math.max(rect.start.y, point.y) }
              });
            }
          } else if (element.type === 'circle') {
            // For circles, dragging center moves it
            updateElement(dragElementId, { center: { x: point.x, y: point.y } });
          } else if (element.type === 'hline') {
            const hline = element as HLineElement;
            if (role === 'start') {
              // Moving start point changes position and length
              const endX = hline.start.x + hline.length;
              updateElement(dragElementId, {
                start: { x: point.x, y: point.y },
                length: endX - point.x
              });
            } else if (role === 'end') {
              // Moving end point changes length
              updateElement(dragElementId, { length: point.x - hline.start.x });
            }
          } else if (element.type === 'vline') {
            const vline = element as VLineElement;
            if (role === 'start') {
              const endY = vline.start.y + vline.length;
              updateElement(dragElementId, {
                start: { x: point.x, y: point.y },
                length: endY - point.y
              });
            } else if (role === 'end') {
              updateElement(dragElementId, { length: point.y - vline.start.y });
            }
          }

          // Solve constraints in real-time during point drag
          if (editingSketchId) {
            solveConstraints(editingSketchId);
          }
        }
        // Don't update dragStart for point dragging - we use absolute position
      } else {
        // Move the whole element (preserving shape)
        const delta = {
          x: point.x - dragStart.x,
          y: point.y - dragStart.y,
        };
        moveElement(dragElementId, delta);
        setDragStart(point);
      }
    } else if (isDrawing) {
      setCurrentPoint(point);
    } else if (drawingState) {
      setCurrentPoint(point);
    }
  };

  // Mouse up handler
  const handleMouseUp = () => {
    if (isDragging) {
      // After dragging, re-solve constraints to maintain them
      if (editingSketchId) {
        solveConstraints(editingSketchId);
      }
      setIsDragging(false);
      setDragStart(null);
      setDragElementId(null);
      setDragPointId(null);
      return;
    }

    if (isDrawing && startPoint && currentPoint) {
      switch (currentTool) {
        case 'rectangle': {
          const width = Math.abs(currentPoint.x - startPoint.x);
          const height = Math.abs(currentPoint.y - startPoint.y);
          if (width > 0 && height > 0) {
            const newElement = {
              type: 'rectangle' as const,
              id: crypto.randomUUID(),
              start: {
                x: Math.min(startPoint.x, currentPoint.x),
                y: Math.min(startPoint.y, currentPoint.y),
              },
              end: {
                x: Math.max(startPoint.x, currentPoint.x),
                y: Math.max(startPoint.y, currentPoint.y),
              },
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }

        case 'circle': {
          const radius = Math.sqrt(
            (currentPoint.x - startPoint.x) ** 2 + (currentPoint.y - startPoint.y) ** 2
          );
          if (radius > 0) {
            const newElement = {
              type: 'circle' as const,
              id: crypto.randomUUID(),
              center: startPoint,
              radius,
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }

        case 'line': {
          const dx = currentPoint.x - startPoint.x;
          const dy = currentPoint.y - startPoint.y;
          if (dx !== 0 || dy !== 0) {
            const newElement = {
              type: 'line' as const,
              id: crypto.randomUUID(),
              start: startPoint,
              end: currentPoint,
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }
      }
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  // Right-click handler (for finishing spline)
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (drawingState?.tool === 'spline' && drawingState.points.length >= 2) {
      // Finish spline
      const newElement = {
        type: 'spline' as const,
        id: crypto.randomUUID(),
        points: drawingState.points,
      };
      addElement(newElement);
      applyAutoConstraints(newElement as SketchElement);
      setDrawingState(null);
    }
  };

  // Double-click handler (for dimension editing)
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToWorld(e.clientX, e.clientY);

    // Find clicked element
    const clickedElement = currentPlaneElements.find((elem) => hitTestElement(point, elem));

    if (clickedElement) {
      // Open dimension edit for this element
      const center = getElementCenter(clickedElement);
      const screenPos = worldToScreen(center.x, center.y);

      let value = '';
      let dimension = '';

      switch (clickedElement.type) {
        case 'rectangle': {
          // Determine which dimension to edit based on click position
          const rectCenterX = (clickedElement.start.x + clickedElement.end.x) / 2;
          const rectCenterY = (clickedElement.start.y + clickedElement.end.y) / 2;
          const rectWidth = Math.abs(clickedElement.end.x - clickedElement.start.x);
          const rectHeight = Math.abs(clickedElement.end.y - clickedElement.start.y);

          // Calculate relative position within the rectangle (0-1 range)
          const relX = Math.abs(point.x - rectCenterX) / (rectWidth / 2);
          const relY = Math.abs(point.y - rectCenterY) / (rectHeight / 2);

          // If click is relatively more horizontal (closer to left/right edges), edit width
          // If click is relatively more vertical (closer to top/bottom edges), edit height
          if (relX > relY) {
            value = rectWidth.toFixed(0);
            dimension = 'width';
          } else {
            value = rectHeight.toFixed(0);
            dimension = 'height';
          }
          break;
        }
        case 'circle':
          value = clickedElement.radius.toFixed(0);
          dimension = 'radius';
          break;
        case 'line': {
          const length = Math.sqrt(
            (clickedElement.end.x - clickedElement.start.x) ** 2 +
              (clickedElement.end.y - clickedElement.start.y) ** 2
          );
          value = length.toFixed(0);
          dimension = 'length';
          break;
        }
        case 'hline':
        case 'vline':
          value = Math.abs(clickedElement.length).toFixed(0);
          dimension = 'length';
          break;
        case 'arc':
          value = clickedElement.radius.toFixed(0);
          dimension = 'radius';
          break;
        default:
          return;
      }

      setDimensionEdit({
        elementId: clickedElement.id,
        dimension,
        position: { x: screenPos.x, y: screenPos.y },
        value,
      });
    }
  };

  // Handle dimension input change
  const handleDimensionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!dimensionEdit) return;
    // Store as string to allow intermediate input states (empty, partial numbers)
    setDimensionEdit({ ...dimensionEdit, value: e.target.value });
  };

  // Handle dimension input submit
  const handleDimensionSubmit = () => {
    if (!dimensionEdit) return;

    const element = elements.find((e) => e.id === dimensionEdit.elementId);
    if (!element) {
      setDimensionEdit(null);
      return;
    }

    // Parse the string value to a number
    const newValue = parseFloat(dimensionEdit.value);
    if (isNaN(newValue) || newValue <= 0) {
      setDimensionEdit(null);
      return;
    }

    // Update element based on type and dimension
    switch (element.type) {
      case 'rectangle': {
        const rect = element as RectangleElement;
        const centerX = (rect.start.x + rect.end.x) / 2;
        const centerY = (rect.start.y + rect.end.y) / 2;

        if (dimensionEdit.dimension === 'width') {
          const halfWidth = newValue / 2;
          updateElement(element.id, {
            start: { x: centerX - halfWidth, y: rect.start.y },
            end: { x: centerX + halfWidth, y: rect.end.y },
          });
        } else if (dimensionEdit.dimension === 'height') {
          const halfHeight = newValue / 2;
          updateElement(element.id, {
            start: { x: rect.start.x, y: centerY - halfHeight },
            end: { x: rect.end.x, y: centerY + halfHeight },
          });
        }
        break;
      }

      case 'circle': {
        updateElement(element.id, { radius: newValue });
        break;
      }

      case 'line': {
        const line = element as LineElement;
        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        if (currentLength > 0) {
          const scale = newValue / currentLength;
          updateElement(element.id, {
            end: {
              x: line.start.x + dx * scale,
              y: line.start.y + dy * scale,
            },
          });
        }
        break;
      }

      case 'hline': {
        const hline = element as HLineElement;
        const sign = hline.length >= 0 ? 1 : -1;
        updateElement(element.id, { length: sign * newValue });
        break;
      }

      case 'vline': {
        const vline = element as VLineElement;
        const sign = vline.length >= 0 ? 1 : -1;
        updateElement(element.id, { length: sign * newValue });
        break;
      }

      case 'arc': {
        updateElement(element.id, { radius: newValue });
        break;
      }
    }

    setDimensionEdit(null);
  };

  // Handle dimension input key press
  const handleDimensionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleDimensionSubmit();
    } else if (e.key === 'Escape') {
      setDimensionEdit(null);
    }
  };

  // Wheel handler for zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 10));
  };

  // Touch event handlers for mobile support
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      // Pinch-to-zoom start
      e.preventDefault();
      setLastTouchDistance(getTouchDistance(e.touches));
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const point = screenToWorld(touch.clientX, touch.clientY);

      // Check for double-tap (for dimension editing)
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap detected
        const clickedElement = currentPlaneElements.find((elem) => hitTestElement(point, elem));
        if (clickedElement) {
          const center = getElementCenter(clickedElement);
          const screenPos = worldToScreen(center.x, center.y);

          let value = '';
          let dimension = '';

          switch (clickedElement.type) {
            case 'rectangle': {
              const rectWidth = Math.abs(clickedElement.end.x - clickedElement.start.x);
              value = rectWidth.toFixed(0);
              dimension = 'width';
              break;
            }
            case 'circle':
              value = clickedElement.radius.toFixed(0);
              dimension = 'radius';
              break;
            case 'line': {
              const length = Math.sqrt(
                (clickedElement.end.x - clickedElement.start.x) ** 2 +
                  (clickedElement.end.y - clickedElement.start.y) ** 2
              );
              value = length.toFixed(0);
              dimension = 'length';
              break;
            }
            case 'hline':
            case 'vline':
              value = Math.abs(clickedElement.length).toFixed(0);
              dimension = 'length';
              break;
            case 'arc':
              value = clickedElement.radius.toFixed(0);
              dimension = 'radius';
              break;
            default:
              return;
          }

          setDimensionEdit({
            elementId: clickedElement.id,
            dimension,
            position: { x: screenPos.x, y: screenPos.y },
            value,
          });
          return;
        }
      }
      lastTapRef.current = now;

      // Prevent drawing when not editing a sketch (selection is still allowed)
      if (!editingSketchId && currentTool !== 'select') {
        return;
      }

      // Same logic as mouse down
      if (currentTool === 'select') {
        const clickedElement = currentPlaneElements.find((elem) => hitTestElement(point, elem));

        if (clickedElement) {
          if (clickedElement.selected) {
            setIsDragging(true);
            setDragStart(point);
            setDragElementId(clickedElement.id);
          } else {
            selectElement(clickedElement.id, false);
          }
        } else {
          deselectAll();
        }
      } else if (currentTool === 'arc') {
        if (!drawingState) {
          setDrawingState({ tool: 'arc', step: 0, points: [point] });
        } else if (drawingState.step === 0) {
          setDrawingState({
            ...drawingState,
            step: 1,
            points: [...drawingState.points, point],
          });
        } else if (drawingState.step === 1) {
          setDrawingState({
            ...drawingState,
            step: 2,
            points: [...drawingState.points, point],
          });
        } else if (drawingState.step === 2) {
          const center = drawingState.points[0];
          const radiusPoint = drawingState.points[1];
          const radius = Math.sqrt(
            (radiusPoint.x - center.x) ** 2 + (radiusPoint.y - center.y) ** 2
          );
          const startAngle = Math.atan2(
            drawingState.points[2].y - center.y,
            drawingState.points[2].x - center.x
          );
          const endAngle = Math.atan2(point.y - center.y, point.x - center.x);

          addElement({
            type: 'arc',
            id: crypto.randomUUID(),
            center,
            radius,
            startAngle,
            endAngle,
          });
          setDrawingState(null);
        }
      } else if (currentTool === 'spline') {
        if (!drawingState) {
          setDrawingState({ tool: 'spline', step: 0, points: [point] });
        } else {
          setDrawingState({
            ...drawingState,
            points: [...drawingState.points, point],
          });
        }
      } else {
        setIsDrawing(true);
        setStartPoint(point);
        setCurrentPoint(point);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      e.preventDefault();
      const newDistance = getTouchDistance(e.touches);
      if (lastTouchDistance !== null) {
        const scaleFactor = newDistance / lastTouchDistance;
        setScale((prev) => Math.min(Math.max(prev * scaleFactor, 0.1), 10));
      }
      setLastTouchDistance(newDistance);
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const point = screenToWorld(touch.clientX, touch.clientY);

      if (isDragging && dragStart && dragElementId) {
        const delta = {
          x: point.x - dragStart.x,
          y: point.y - dragStart.y,
        };
        moveElement(dragElementId, delta);
        setDragStart(point);
      } else if (isDrawing) {
        setCurrentPoint(point);
      } else if (drawingState) {
        setCurrentPoint(point);
      }
    }
  };

  const handleTouchEnd = (_e: React.TouchEvent<HTMLCanvasElement>) => {
    setLastTouchDistance(null);

    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragElementId(null);
      return;
    }

    if (isDrawing && startPoint && currentPoint) {
      switch (currentTool) {
        case 'rectangle': {
          const width = Math.abs(currentPoint.x - startPoint.x);
          const height = Math.abs(currentPoint.y - startPoint.y);
          if (width > 0 && height > 0) {
            const newElement = {
              type: 'rectangle' as const,
              id: crypto.randomUUID(),
              start: {
                x: Math.min(startPoint.x, currentPoint.x),
                y: Math.min(startPoint.y, currentPoint.y),
              },
              end: {
                x: Math.max(startPoint.x, currentPoint.x),
                y: Math.max(startPoint.y, currentPoint.y),
              },
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }

        case 'circle': {
          const radius = Math.sqrt(
            (currentPoint.x - startPoint.x) ** 2 + (currentPoint.y - startPoint.y) ** 2
          );
          if (radius > 0) {
            const newElement = {
              type: 'circle' as const,
              id: crypto.randomUUID(),
              center: startPoint,
              radius,
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }

        case 'line': {
          const dx = currentPoint.x - startPoint.x;
          const dy = currentPoint.y - startPoint.y;
          if (dx !== 0 || dy !== 0) {
            const newElement = {
              type: 'line' as const,
              id: crypto.randomUUID(),
              start: startPoint,
              end: currentPoint,
            };
            addElement(newElement);
            applyAutoConstraints(newElement as SketchElement);
          }
          break;
        }
      }
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  // Long press handler for finishing spline on mobile
  const handleLongPress = useCallback(() => {
    if (drawingState?.tool === 'spline' && drawingState.points.length >= 2) {
      const newElement = {
        type: 'spline' as const,
        id: crypto.randomUUID(),
        points: drawingState.points,
      };
      addElement(newElement);
      applyAutoConstraints(newElement as SketchElement);
      setDrawingState(null);
    }
  }, [drawingState, addElement, applyAutoConstraints]);

  // Escape key to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawingState) {
          setDrawingState(null);
        }
        if (isDrawing) {
          setIsDrawing(false);
          setStartPoint(null);
          setCurrentPoint(null);
        }
        if (dimensionEdit) {
          setDimensionEdit(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingState, isDrawing, dimensionEdit]);

  // Calculate initial value for constraints that need input
  const calculateInitialConstraintValue = useCallback(
    (type: ConstraintType): number => {
      const { points, lines, circles } = solverPrimitives;

      switch (type) {
        case ConstraintType.DISTANCE: {
          // Distance between two points
          if (selectedPointIds.length === 2) {
            const p1 = points.find((p) => p.id === selectedPointIds[0]);
            const p2 = points.find((p) => p.id === selectedPointIds[1]);
            if (p1 && p2) {
              return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            }
          }
          // Length of a line
          if (selectedLineIds.length === 1) {
            const line = lines.find((l) => l.id === selectedLineIds[0]);
            if (line) {
              const p1 = points.find((p) => p.id === line.p1);
              const p2 = points.find((p) => p.id === line.p2);
              if (p1 && p2) {
                return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
              }
            }
          }
          return 10;
        }
        case ConstraintType.RADIUS: {
          if (selectedCircleIds.length === 1) {
            const circle = circles.find((c) => c.id === selectedCircleIds[0]);
            if (circle) {
              return circle.radius;
            }
          }
          return 10;
        }
        case ConstraintType.ANGLE: {
          if (selectedLineIds.length === 1) {
            const line = lines.find((l) => l.id === selectedLineIds[0]);
            if (line) {
              const p1 = points.find((p) => p.id === line.p1);
              const p2 = points.find((p) => p.id === line.p2);
              if (p1 && p2) {
                return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
              }
            }
          }
          if (selectedLineIds.length === 2) {
            // Angle between two lines
            const l1 = lines.find((l) => l.id === selectedLineIds[0]);
            const l2 = lines.find((l) => l.id === selectedLineIds[1]);
            if (l1 && l2) {
              const p1a = points.find((p) => p.id === l1.p1);
              const p1b = points.find((p) => p.id === l1.p2);
              const p2a = points.find((p) => p.id === l2.p1);
              const p2b = points.find((p) => p.id === l2.p2);
              if (p1a && p1b && p2a && p2b) {
                const v1x = p1b.x - p1a.x;
                const v1y = p1b.y - p1a.y;
                const v2x = p2b.x - p2a.x;
                const v2y = p2b.y - p2a.y;
                const dot = v1x * v2x + v1y * v2y;
                const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
                const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
                if (mag1 > 0 && mag2 > 0) {
                  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
                }
              }
            }
          }
          return 0;
        }
        default:
          return 0;
      }
    },
    [solverPrimitives, selectedPointIds, selectedLineIds, selectedCircleIds]
  );

  // Handle applying a constraint
  const handleApplyConstraint = useCallback(
    (type: ConstraintType, needsInput: boolean) => {
      // Only allow constraint application when editing a sketch
      if (!editingSketchId) {
        console.warn('Cannot apply constraint: not editing a sketch');
        return;
      }

      let value: number | undefined;

      if (needsInput) {
        const initialValue = calculateInitialConstraintValue(type);
        const input = prompt('Enter value:', initialValue.toFixed(2));
        if (input === null) return;
        value = parseFloat(input);
        if (isNaN(value)) {
          console.warn('Invalid value entered');
          return;
        }
      }

      // Create the constraint object
      const constraint: Omit<Constraint, 'id'> = {
        type,
        points: [...selectedPointIds],
        lines: [...selectedLineIds],
        circles: [...selectedCircleIds],
        value,
      };

      // Add constraint to the feature store
      addConstraint(editingSketchId, constraint);

      // Solve constraints
      solveConstraints(editingSketchId);

      // Clear selection
      clearConstraintSelection();
    },
    [
      editingSketchId,
      selectedPointIds,
      selectedLineIds,
      selectedCircleIds,
      addConstraint,
      solveConstraints,
      clearConstraintSelection,
      calculateInitialConstraintValue,
    ]
  );

  // Handle deleting selected primitives
  const handleDeleteSelected = useCallback(() => {
    // Find elements that contain the selected primitives and delete them
    const elementsToDelete = new Set<string>();

    // For selected points, find their parent elements
    for (const pointId of selectedPointIds) {
      // Point ID format is "{elementId}_{role}"
      const elementId = pointId.split('_').slice(0, -1).join('_');
      if (elementId) {
        elementsToDelete.add(elementId);
      }
    }

    // For selected lines, find their parent elements
    for (const lineId of selectedLineIds) {
      // Line ID format is "{elementId}_line" or "{elementId}_edge{n}_line"
      const parts = lineId.replace('_line', '').split('_edge');
      const elementId = parts[0];
      if (elementId) {
        elementsToDelete.add(elementId);
      }
    }

    // For selected circles, find their parent elements
    for (const circleId of selectedCircleIds) {
      // Circle ID format is "{elementId}_circle"
      const elementId = circleId.replace('_circle', '');
      if (elementId) {
        elementsToDelete.add(elementId);
      }
    }

    // Delete the elements
    Array.from(elementsToDelete).forEach((elementId) => {
      removeElement(elementId);
    });

    // Clear selection
    clearConstraintSelection();
  }, [selectedPointIds, selectedLineIds, selectedCircleIds, removeElement, clearConstraintSelection]);

  // Cursor style based on tool
  const getCursor = () => {
    if (currentTool === 'select') {
      return isDragging ? 'grabbing' : 'default';
    }
    return 'crosshair';
  };

  // Tool definitions for floating toolbar
  const tools: { tool: SketchTool; icon: React.ReactNode; title: string }[] = [
    { tool: 'select', icon: <SelectIcon size={18} />, title: 'Select (V)' },
    { tool: 'rectangle', icon: <RectangleIcon size={18} />, title: 'Rectangle (R)' },
    { tool: 'circle', icon: <CircleIcon size={18} />, title: 'Circle (C)' },
    { tool: 'line', icon: <LineIcon size={18} />, title: 'Line (L)' },
    { tool: 'arc', icon: <ArcIcon size={18} />, title: 'Arc (A)' },
    { tool: 'spline', icon: <SplineIcon size={18} />, title: 'Spline (S)' },
  ];

  // Floating toolbar button style
  const toolButtonStyle = (isActive: boolean) => ({
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    backgroundColor: isActive ? '#89b4fa' : 'transparent',
    color: isActive ? '#1e1e2e' : '#cdd6f4',
  });

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: getCursor(), touchAction: 'none' }}
      />

      {/* Dimension edit input overlay */}
      {dimensionEdit && (
        <div
          style={{
            position: 'absolute',
            left: dimensionEdit.position.x - 40,
            top: dimensionEdit.position.y - 12,
            zIndex: 100,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*\.?[0-9]*"
            value={dimensionEdit.value}
            onChange={handleDimensionChange}
            onBlur={handleDimensionSubmit}
            onKeyDown={handleDimensionKeyDown}
            style={{
              width: '80px',
              padding: '4px 8px',
              border: '2px solid #89b4fa',
              borderRadius: '4px',
              backgroundColor: '#1e1e2e',
              color: '#cdd6f4',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* No sketch editing overlay */}
      {!editingSketchId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '16px 24px',
            backgroundColor: 'rgba(30, 30, 46, 0.95)',
            borderRadius: '8px',
            border: '1px solid #45475a',
            color: '#cdd6f4',
            fontSize: '14px',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>
            No sketch selected
          </div>
          <div style={{ fontSize: '12px', color: '#a6adc8' }}>
            Create a new sketch or edit an existing one to start drawing
          </div>
        </div>
      )}

      {/* Floating toolbar - only show when editing a sketch */}
      {editingSketchId && (
        <div
          style={{
            position: 'absolute',
            left: '16px',
            bottom: '16px',
            display: 'flex',
            gap: '4px',
            padding: '6px',
            backgroundColor: 'rgba(30, 30, 46, 0.95)',
            borderRadius: '10px',
            border: '1px solid #45475a',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {tools.map(({ tool, icon, title }) => (
            <button
              key={tool}
              style={toolButtonStyle(currentTool === tool)}
              onClick={() => setCurrentTool(tool)}
              title={title}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Tool hint overlay */}
      {drawingState && (
        <div
          style={{
            position: 'absolute',
            bottom: drawingState.tool === 'spline' && drawingState.points.length >= 2 ? 120 : 70,
            left: 16,
            padding: '8px 12px',
            backgroundColor: 'rgba(30, 30, 46, 0.9)',
            borderRadius: '6px',
            color: '#cdd6f4',
            fontSize: '12px',
          }}
        >
          {drawingState.tool === 'arc' && (
            <>
              {drawingState.step === 0 && 'Click to set radius'}
              {drawingState.step === 1 && 'Click to set start angle'}
              {drawingState.step === 2 && 'Click to set end angle'}
            </>
          )}
          {drawingState.tool === 'spline' && (
            <>Click to add points. Right-click to finish.</>
          )}
        </div>
      )}

      {/* Finish spline button for mobile */}
      {drawingState?.tool === 'spline' && drawingState.points.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            bottom: 70,
            left: 16,
            right: 16,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <button
            onClick={handleLongPress}
            style={{
              padding: '8px 12px',
              border: '2px solid #89b4fa',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              backgroundColor: '#89b4fa',
              color: '#1e1e2e',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
            }}
            title="Finish drawing spline"
          >
            Finish Spline
          </button>
        </div>
      )}

      {/* Floating constraints panel - shown when primitives are selected */}
      {/* Debug: show selection state */}
      {(selectedPointIds.length > 0 || selectedLineIds.length > 0 || selectedCircleIds.length > 0) && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: 8, fontSize: 12, zIndex: 1000 }}>
          Points: {selectedPointIds.join(', ') || 'none'}<br/>
          Lines: {selectedLineIds.join(', ') || 'none'}<br/>
          Circles: {selectedCircleIds.join(', ') || 'none'}
        </div>
      )}
      <FloatingConstraints
        selectedPointIds={selectedPointIds}
        selectedLineIds={selectedLineIds}
        selectedCircleIds={selectedCircleIds}
        onApplyConstraint={handleApplyConstraint}
        onDelete={handleDeleteSelected}
      />
    </div>
  );
}
