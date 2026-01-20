import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore, planesEqual, getElementCenter, getPlaneKey } from '../store/useStore';
import type {
  Point,
  SketchElement,
  RectangleElement,
  LineElement,
  HLineElement,
  VLineElement,
  SketchTool,
} from '../types';

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

  // Drag state for moving elements
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragElementId, setDragElementId] = useState<string | null>(null);

  // Dimension editing state
  const [dimensionEdit, setDimensionEdit] = useState<DimensionEdit | null>(null);

  // Store access
  const elements = useStore((state) => state.elements);
  const currentTool = useStore((state) => state.currentTool);
  const addElement = useStore((state) => state.addElement);
  const moveElement = useStore((state) => state.moveElement);
  const updateElement = useStore((state) => state.updateElement);
  const selectElement = useStore((state) => state.selectElement);
  const deselectAll = useStore((state) => state.deselectAll);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const extrusionHeight = useStore((state) => state.extrusionHeight);
  const setExtrusionHeight = useStore((state) => state.setExtrusionHeight);
  const planeOperations = useStore((state) => state.planeOperations);
  const setPlaneOperation = useStore((state) => state.setPlaneOperation);

  // Get current plane's operation type
  const currentPlaneKey = getPlaneKey(sketchPlane);
  const currentOperation = planeOperations.get(currentPlaneKey) || 'extrude';

  // Filter elements by current plane
  const currentPlaneElements = useMemo(
    () => elements.filter((e) => planesEqual(e.plane, sketchPlane)),
    [elements, sketchPlane]
  );

  // Elements on other planes (shown dimmed)
  const otherPlaneElements = useMemo(
    () => elements.filter((e) => !planesEqual(e.plane, sketchPlane)),
    [elements, sketchPlane]
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

    // Draw axes
    ctx.strokeStyle = '#585b70';
    ctx.lineWidth = 2;

    // X axis
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(canvas.width, origin.y);
    ctx.stroke();

    // Y axis
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();

    // Draw elements from other planes (dimmed)
    otherPlaneElements.forEach((elem) => drawElement(ctx, elem, true));

    // Draw elements on current plane
    currentPlaneElements.forEach((elem) => drawElement(ctx, elem, false));

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

        case 'hline': {
          const start = worldToScreen(startPoint.x, startPoint.y);
          const end = worldToScreen(currentPoint.x, startPoint.y);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          const length = currentPoint.x - startPoint.x;
          ctx.fillStyle = '#cdd6f4';
          ctx.font = '12px monospace';
          ctx.fillText(`L = ${Math.abs(length).toFixed(0)}`, (start.x + end.x) / 2, start.y - 10);
          break;
        }

        case 'vline': {
          const start = worldToScreen(startPoint.x, startPoint.y);
          const end = worldToScreen(startPoint.x, currentPoint.y);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          const length = currentPoint.y - startPoint.y;
          ctx.fillStyle = '#cdd6f4';
          ctx.font = '12px monospace';
          ctx.fillText(`L = ${Math.abs(length).toFixed(0)}`, start.x + 10, (start.y + end.y) / 2);
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
    isDrawing,
    startPoint,
    currentPoint,
    drawingState,
    worldToScreen,
    scale,
    currentTool,
    drawElement,
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

    if (currentTool === 'select') {
      // Check if clicking on a selected element for dragging
      const clickedElement = currentPlaneElements.find((elem) => hitTestElement(point, elem));

      if (clickedElement) {
        if (clickedElement.selected) {
          // Start dragging
          setIsDragging(true);
          setDragStart(point);
          setDragElementId(clickedElement.id);
        } else {
          selectElement(clickedElement.id, e.shiftKey);
        }
      } else {
        deselectAll();
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
      // Move the element
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
  };

  // Mouse up handler
  const handleMouseUp = () => {
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
            addElement({
              type: 'rectangle',
              id: crypto.randomUUID(),
              start: {
                x: Math.min(startPoint.x, currentPoint.x),
                y: Math.min(startPoint.y, currentPoint.y),
              },
              end: {
                x: Math.max(startPoint.x, currentPoint.x),
                y: Math.max(startPoint.y, currentPoint.y),
              },
            });
          }
          break;
        }

        case 'circle': {
          const radius = Math.sqrt(
            (currentPoint.x - startPoint.x) ** 2 + (currentPoint.y - startPoint.y) ** 2
          );
          if (radius > 0) {
            addElement({
              type: 'circle',
              id: crypto.randomUUID(),
              center: startPoint,
              radius,
            });
          }
          break;
        }

        case 'line': {
          const dx = currentPoint.x - startPoint.x;
          const dy = currentPoint.y - startPoint.y;
          if (dx !== 0 || dy !== 0) {
            addElement({
              type: 'line',
              id: crypto.randomUUID(),
              start: startPoint,
              end: currentPoint,
            });
          }
          break;
        }

        case 'hline': {
          const length = currentPoint.x - startPoint.x;
          if (length !== 0) {
            addElement({
              type: 'hline',
              id: crypto.randomUUID(),
              start: startPoint,
              length,
            });
          }
          break;
        }

        case 'vline': {
          const length = currentPoint.y - startPoint.y;
          if (length !== 0) {
            addElement({
              type: 'vline',
              id: crypto.randomUUID(),
              start: startPoint,
              length,
            });
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
      addElement({
        type: 'spline',
        id: crypto.randomUUID(),
        points: drawingState.points,
      });
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

  // Cursor style based on tool
  const getCursor = () => {
    if (currentTool === 'select') {
      return isDragging ? 'grabbing' : 'default';
    }
    return 'crosshair';
  };

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
        style={{ cursor: getCursor() }}
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

      {/* Tool hint overlay */}
      {drawingState && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 10,
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

      {/* Extrusion controls panel */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '10px 16px',
          backgroundColor: 'rgba(24, 24, 37, 0.95)',
          borderRadius: '8px',
          border: '1px solid #313244',
        }}
      >
        <button
          onClick={() => setPlaneOperation(currentPlaneKey, 'extrude')}
          style={{
            padding: '8px 16px',
            border: currentOperation === 'extrude' ? '2px solid #a6e3a1' : '2px solid transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            backgroundColor: currentOperation === 'extrude' ? '#a6e3a1' : '#313244',
            color: currentOperation === 'extrude' ? '#1e1e2e' : '#cdd6f4',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
          title="Extrude sketch upward (add material)"
        >
          <span style={{ fontSize: '16px' }}>↑</span>
          Extrude
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#a6adc8', fontSize: '13px' }}>
            Depth:
          </label>
          <input
            type="number"
            value={extrusionHeight}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value > 0) {
                setExtrusionHeight(value);
              }
            }}
            style={{
              width: '60px',
              padding: '6px 10px',
              border: '1px solid #313244',
              borderRadius: '4px',
              backgroundColor: '#1e1e2e',
              color: '#cdd6f4',
              fontSize: '13px',
              textAlign: 'center',
            }}
          />
        </div>

        <button
          onClick={() => setPlaneOperation(currentPlaneKey, 'cut')}
          style={{
            padding: '8px 16px',
            border: currentOperation === 'cut' ? '2px solid #f38ba8' : '2px solid transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            backgroundColor: currentOperation === 'cut' ? '#f38ba8' : '#313244',
            color: currentOperation === 'cut' ? '#1e1e2e' : '#cdd6f4',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
          title="Cut sketch downward (remove material)"
        >
          <span style={{ fontSize: '16px' }}>↓</span>
          Cut
        </button>
      </div>
    </div>
  );
}
