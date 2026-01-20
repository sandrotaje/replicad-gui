import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { Point, Rectangle } from '../types';

const GRID_SIZE = 10;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function Sketcher() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [offset, _setOffset] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const rectangles = useStore((state) => state.rectangles);
  const currentTool = useStore((state) => state.currentTool);
  const addRectangle = useStore((state) => state.addRectangle);
  const selectRectangle = useStore((state) => state.selectRectangle);
  const deselectAll = useStore((state) => state.deselectAll);

  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const x = (screenX - rect.left - centerX) / scale - offset.x;
    const y = -(screenY - rect.top - centerY) / scale - offset.y; // Flip Y axis

    return { x: snapToGrid(x), y: snapToGrid(y) };
  }, [scale, offset]);

  const worldToScreen = useCallback((worldX: number, worldY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const x = (worldX + offset.x) * scale + centerX;
    const y = -(worldY + offset.y) * scale + centerY; // Flip Y axis

    return { x, y };
  }, [scale, offset]);

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

    // Draw rectangles
    rectangles.forEach((rect) => {
      const start = worldToScreen(rect.start.x, rect.start.y);
      const end = worldToScreen(rect.end.x, rect.end.y);

      const width = end.x - start.x;
      const height = end.y - start.y;

      ctx.fillStyle = rect.selected ? 'rgba(137, 180, 250, 0.3)' : 'rgba(166, 227, 161, 0.3)';
      ctx.fillRect(start.x, start.y, width, height);

      ctx.strokeStyle = rect.selected ? '#89b4fa' : '#a6e3a1';
      ctx.lineWidth = rect.selected ? 3 : 2;
      ctx.strokeRect(start.x, start.y, width, height);
    });

    // Draw current rectangle being drawn
    if (isDrawing && startPoint && currentPoint) {
      const start = worldToScreen(startPoint.x, startPoint.y);
      const end = worldToScreen(currentPoint.x, currentPoint.y);

      const width = end.x - start.x;
      const height = end.y - start.y;

      ctx.fillStyle = 'rgba(250, 179, 135, 0.3)';
      ctx.fillRect(start.x, start.y, width, height);

      ctx.strokeStyle = '#fab387';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(start.x, start.y, width, height);
      ctx.setLineDash([]);

      // Show dimensions
      const widthVal = Math.abs(currentPoint.x - startPoint.x);
      const heightVal = Math.abs(currentPoint.y - startPoint.y);
      ctx.fillStyle = '#cdd6f4';
      ctx.font = '12px monospace';
      ctx.fillText(`${widthVal} x ${heightVal}`, (start.x + end.x) / 2 - 20, (start.y + end.y) / 2);
    }

    // Draw origin marker
    ctx.fillStyle = '#f38ba8';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [rectangles, isDrawing, startPoint, currentPoint, worldToScreen, scale]);

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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToWorld(e.clientX, e.clientY);

    if (currentTool === 'rectangle') {
      setIsDrawing(true);
      setStartPoint(point);
      setCurrentPoint(point);
    } else if (currentTool === 'select') {
      // Check if clicking on a rectangle
      const clickedRect = rectangles.find((rect) => {
        const minX = Math.min(rect.start.x, rect.end.x);
        const maxX = Math.max(rect.start.x, rect.end.x);
        const minY = Math.min(rect.start.y, rect.end.y);
        const maxY = Math.max(rect.start.y, rect.end.y);
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      });

      if (clickedRect) {
        selectRectangle(clickedRect.id, e.shiftKey);
      } else {
        deselectAll();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && currentTool === 'rectangle') {
      const point = screenToWorld(e.clientX, e.clientY);
      setCurrentPoint(point);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && startPoint && currentPoint && currentTool === 'rectangle') {
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      if (width > 0 && height > 0) {
        const newRect: Rectangle = {
          id: crypto.randomUUID(),
          start: {
            x: Math.min(startPoint.x, currentPoint.x),
            y: Math.min(startPoint.y, currentPoint.y),
          },
          end: {
            x: Math.max(startPoint.x, currentPoint.x),
            y: Math.max(startPoint.y, currentPoint.y),
          },
          selected: false,
        };
        addRectangle(newRect);
      }
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 10));
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: currentTool === 'rectangle' ? 'crosshair' : 'default' }}
      />
    </div>
  );
}
