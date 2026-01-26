/**
 * Closed Figure Detection Utility
 *
 * This module provides functions to detect when a set of sketch elements
 * (lines, arcs, splines) form closed profiles that can be extruded or cut.
 */

import type { SketchElement, Point } from '../types';

// ============ Types ============

export interface Endpoint {
  x: number;
  y: number;
  elementId: string;
  isStart: boolean; // true = start point, false = end point
}

export interface ClosedProfileGroup {
  id: string;
  elementIds: string[];  // Ordered list of element IDs forming the closed loop
  isClosed: boolean;     // Validated as actually closed
}

// ============ Constants ============

// Tolerance for point coincidence (in world units)
const POINT_TOLERANCE = 0.5;

// ============ Helper Functions ============

/**
 * Check if two points are coincident within a tolerance
 */
export function pointsEqual(a: Point, b: Point, tolerance: number = POINT_TOLERANCE): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

/**
 * Get the start and end points for a chainable element
 * Returns null for non-chainable elements (rectangle, circle)
 */
export function getElementEndpoints(element: SketchElement): { start: Point; end: Point } | null {
  switch (element.type) {
    case 'line':
      return {
        start: { ...element.start },
        end: { ...element.end },
      };

    case 'hline':
      return {
        start: { ...element.start },
        end: {
          x: element.start.x + element.length,
          y: element.start.y,
        },
      };

    case 'vline':
      return {
        start: { ...element.start },
        end: {
          x: element.start.x,
          y: element.start.y + element.length,
        },
      };

    case 'arc': {
      const { center, radius, startAngle, endAngle } = element;
      return {
        start: {
          x: center.x + radius * Math.cos(startAngle),
          y: center.y + radius * Math.sin(startAngle),
        },
        end: {
          x: center.x + radius * Math.cos(endAngle),
          y: center.y + radius * Math.sin(endAngle),
        },
      };
    }

    case 'spline': {
      if (element.points.length < 2) return null;
      return {
        start: { ...element.points[0] },
        end: { ...element.points[element.points.length - 1] },
      };
    }

    // Rectangle and circle are not chainable - they're already closed
    case 'rectangle':
    case 'circle':
      return null;

    default:
      return null;
  }
}

/**
 * Check if an element is chainable (can be part of a chain that forms a closed profile)
 */
export function isChainableElement(element: SketchElement): boolean {
  return ['line', 'hline', 'vline', 'arc', 'spline'].includes(element.type);
}

/**
 * Build an adjacency map for chainable elements based on endpoint coincidence
 * Returns a map: elementId -> array of { elementId, connectsAtStart, connectsAtEnd }
 */
function buildAdjacencyMap(
  elements: SketchElement[]
): Map<string, Array<{ elementId: string; atMyStart: boolean; atTheirStart: boolean }>> {
  const adjacency = new Map<string, Array<{ elementId: string; atMyStart: boolean; atTheirStart: boolean }>>();

  // Initialize empty arrays for each element
  for (const elem of elements) {
    adjacency.set(elem.id, []);
  }

  // Compare all pairs of elements
  for (let i = 0; i < elements.length; i++) {
    const elemA = elements[i];
    const endpointsA = getElementEndpoints(elemA);
    if (!endpointsA) continue;

    for (let j = i + 1; j < elements.length; j++) {
      const elemB = elements[j];
      const endpointsB = getElementEndpoints(elemB);
      if (!endpointsB) continue;

      // Check all combinations of endpoint connections
      // A.start -> B.start
      if (pointsEqual(endpointsA.start, endpointsB.start)) {
        adjacency.get(elemA.id)!.push({ elementId: elemB.id, atMyStart: true, atTheirStart: true });
        adjacency.get(elemB.id)!.push({ elementId: elemA.id, atMyStart: true, atTheirStart: true });
      }
      // A.start -> B.end
      if (pointsEqual(endpointsA.start, endpointsB.end)) {
        adjacency.get(elemA.id)!.push({ elementId: elemB.id, atMyStart: true, atTheirStart: false });
        adjacency.get(elemB.id)!.push({ elementId: elemA.id, atMyStart: false, atTheirStart: true });
      }
      // A.end -> B.start
      if (pointsEqual(endpointsA.end, endpointsB.start)) {
        adjacency.get(elemA.id)!.push({ elementId: elemB.id, atMyStart: false, atTheirStart: true });
        adjacency.get(elemB.id)!.push({ elementId: elemA.id, atMyStart: true, atTheirStart: false });
      }
      // A.end -> B.end
      if (pointsEqual(endpointsA.end, endpointsB.end)) {
        adjacency.get(elemA.id)!.push({ elementId: elemB.id, atMyStart: false, atTheirStart: false });
        adjacency.get(elemB.id)!.push({ elementId: elemA.id, atMyStart: false, atTheirStart: false });
      }
    }
  }

  return adjacency;
}

/**
 * Find all connected components (chains) of elements
 * Uses union-find to group connected elements
 */
function findConnectedComponents(
  elements: SketchElement[],
  adjacency: Map<string, Array<{ elementId: string; atMyStart: boolean; atTheirStart: boolean }>>
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const elem of elements) {
    if (visited.has(elem.id)) continue;

    // BFS to find all elements in this component
    const component: string[] = [];
    const queue = [elem.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      component.push(currentId);

      // Add neighbors to queue
      const neighbors = adjacency.get(currentId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.elementId)) {
          queue.push(neighbor.elementId);
        }
      }
    }

    if (component.length > 0) {
      components.push(component);
    }
  }

  return components;
}

/**
 * Check if a component forms a closed loop
 * A closed loop requires:
 * 1. Each element has exactly 2 connections (or is connected to itself for a single element)
 * 2. The chain can be traversed from start to finish and ends where it started
 */
function isClosedLoop(
  componentIds: string[],
  elements: SketchElement[],
  adjacency: Map<string, Array<{ elementId: string; atMyStart: boolean; atTheirStart: boolean }>>
): boolean {
  if (componentIds.length === 0) return false;

  // Single element special case: check if start == end (like a closed spline)
  if (componentIds.length === 1) {
    const elem = elements.find(e => e.id === componentIds[0]);
    if (!elem) return false;
    const endpoints = getElementEndpoints(elem);
    if (!endpoints) return false;
    return pointsEqual(endpoints.start, endpoints.end);
  }

  const componentSet = new Set(componentIds);

  // For a closed loop, every element must have exactly 2 connections
  // (one at each end) to other elements in the component
  for (const elemId of componentIds) {
    const neighbors = adjacency.get(elemId) || [];
    const componentNeighbors = neighbors.filter(n => componentSet.has(n.elementId));

    // Must have exactly 2 connections (one at start, one at end)
    if (componentNeighbors.length !== 2) return false;

    // Check that connections are at different ends
    const atStartConnections = componentNeighbors.filter(n => n.atMyStart);
    const atEndConnections = componentNeighbors.filter(n => !n.atMyStart);

    if (atStartConnections.length !== 1 || atEndConnections.length !== 1) return false;
  }

  return true;
}

/**
 * Order elements in a closed chain from start to end
 * Returns elements in order where element[i].end connects to element[i+1].start
 */
export function orderChainElements(
  componentIds: string[],
  _elements: SketchElement[],
  adjacency: Map<string, Array<{ elementId: string; atMyStart: boolean; atTheirStart: boolean }>>
): string[] {
  if (componentIds.length === 0) return [];
  if (componentIds.length === 1) return componentIds;

  const componentSet = new Set(componentIds);
  const orderedIds: string[] = [];
  const visited = new Set<string>();

  // Start with the first element
  let currentId = componentIds[0];
  let enteredAtStart = true; // We "enter" the first element at its start

  while (!visited.has(currentId)) {
    visited.add(currentId);
    orderedIds.push(currentId);

    // Find the next element (connected at the opposite end from where we entered)
    const neighbors = adjacency.get(currentId) || [];
    const componentNeighbors = neighbors.filter(n => componentSet.has(n.elementId));

    // We exit from the end opposite to where we entered
    const exitAtMyStart: boolean = !enteredAtStart;
    const nextConnection = componentNeighbors.find(n => n.atMyStart === exitAtMyStart) as { elementId: string; atMyStart: boolean; atTheirStart: boolean } | undefined;

    if (!nextConnection) break;
    if (visited.has(nextConnection.elementId)) break;

    currentId = nextConnection.elementId;
    enteredAtStart = nextConnection.atTheirStart;
  }

  return orderedIds;
}

/**
 * Main function: Detect closed profiles from a list of sketch elements
 * Returns groups of element IDs that form closed loops
 */
export function detectClosedProfiles(elements: SketchElement[]): ClosedProfileGroup[] {
  // Filter to chainable elements only
  const chainableElements = elements.filter(isChainableElement);

  if (chainableElements.length === 0) {
    return [];
  }

  // Build adjacency map
  const adjacency = buildAdjacencyMap(chainableElements);

  // Find connected components
  const components = findConnectedComponents(chainableElements, adjacency);

  // Check each component for being a closed loop
  const closedProfiles: ClosedProfileGroup[] = [];

  for (const componentIds of components) {
    if (isClosedLoop(componentIds, chainableElements, adjacency)) {
      // Order the elements in the chain
      const orderedIds = orderChainElements(componentIds, chainableElements, adjacency);

      closedProfiles.push({
        id: crypto.randomUUID(),
        elementIds: orderedIds,
        isClosed: true,
      });
    }
  }

  return closedProfiles;
}

/**
 * Get the drawing starting point for a closed profile
 * Returns the start point of the first element in the ordered chain
 */
export function getProfileStartPoint(
  profile: ClosedProfileGroup,
  elements: SketchElement[]
): Point | null {
  if (profile.elementIds.length === 0) return null;

  const firstId = profile.elementIds[0];
  const firstElement = elements.find(e => e.id === firstId);
  if (!firstElement) return null;

  const endpoints = getElementEndpoints(firstElement);
  if (!endpoints) return null;

  return endpoints.start;
}

/**
 * Calculate the approximate center of a closed profile
 * Useful for positioning when extruding
 */
export function getProfileCenter(
  profile: ClosedProfileGroup,
  elements: SketchElement[]
): Point {
  const points: Point[] = [];

  for (const elemId of profile.elementIds) {
    const elem = elements.find(e => e.id === elemId);
    if (!elem) continue;

    const endpoints = getElementEndpoints(elem);
    if (endpoints) {
      points.push(endpoints.start);
      points.push(endpoints.end);
    }
  }

  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);

  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}
