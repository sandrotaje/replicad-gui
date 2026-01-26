/**
 * Hook to synchronize the legacy store with the feature store when editing a sketch.
 *
 * This bridge allows the existing Sketcher component to work with the new feature-based system
 * by syncing elements between the two stores.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import type { SketchFeature, SketchElement, FacePlane } from '../types';

export function useFeatureSketchSync() {
  const syncInProgressRef = useRef(false);
  const lastSyncedElementsRef = useRef<string>('');

  // Feature store state
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const features = useFeatureStore((state) => state.features);
  const updateFeature = useFeatureStore((state) => state.updateFeature);
  const addSketchElement = useFeatureStore((state) => state.addSketchElement);

  // Legacy store state
  const legacyElements = useStore((state) => state.elements);

  // Get the current editing sketch from the feature store
  const editingSketch = editingSketchId
    ? (features.find((f) => f.id === editingSketchId) as SketchFeature | undefined)
    : undefined;

  // Sync from feature store to legacy store when editing starts
  useEffect(() => {
    if (!editingSketch) return;

    syncInProgressRef.current = true;

    // Set up the legacy store's sketch plane based on the feature's reference
    if (editingSketch.reference.type === 'standard') {
      useStore.getState().setSketchPlane(editingSketch.reference.plane);
    } else {
      // Face sketch - construct FacePlane and set faceOutline from cached data
      const faceRef = editingSketch.reference;
      const boundaryPoints = faceRef.boundaryPoints;

      // Calculate dimensions from boundary (boundary is centered around 0,0)
      const minX = Math.min(...boundaryPoints.map(p => p.x));
      const maxX = Math.max(...boundaryPoints.map(p => p.x));
      const minY = Math.min(...boundaryPoints.map(p => p.y));
      const maxY = Math.max(...boundaryPoints.map(p => p.y));

      const facePlane: FacePlane = {
        type: 'face',
        faceIndex: faceRef.faceIndex,
        faceWidth: maxX - minX,
        faceHeight: maxY - minY,
      };

      useStore.setState({
        sketchPlane: facePlane,
        faceOutline: boundaryPoints,
      });
    }

    // Clear legacy elements and load sketch elements
    // This is a one-time sync when editing starts
    const sketchElements = editingSketch.elements;

    // Store the elements directly in the legacy store
    // We need to update the store state directly to avoid triggering code regeneration
    useStore.setState({
      elements: sketchElements,
      lastUpdateSource: null,
    });

    // Track what we synced - use FULL element data, not just IDs
    lastSyncedElementsRef.current = JSON.stringify(sketchElements);

    syncInProgressRef.current = false;
  }, [editingSketchId]); // Only re-run when editing starts/stops

  // Get detected closed profiles from the legacy store
  const detectedClosedProfiles = useStore((state) => state.detectedClosedProfiles);

  // Sync from legacy store to feature store when elements change
  useEffect(() => {
    if (!editingSketchId || syncInProgressRef.current) return;

    // Check if elements actually changed (compare FULL element data, not just IDs)
    // This ensures dimension changes and other updates are detected
    const currentElementsJson = JSON.stringify(legacyElements);
    if (currentElementsJson === lastSyncedElementsRef.current) {
      return; // No change in elements
    }

    // Update the feature store with the new elements
    const currentSketch = features.find((f) => f.id === editingSketchId) as SketchFeature | undefined;
    if (!currentSketch) return;

    // Find new elements that aren't in the feature store yet
    const existingElementIds = new Set(currentSketch.elements.map((e) => e.id));
    const newElements = legacyElements.filter((e) => !existingElementIds.has(e.id));

    // Add new elements to the feature store
    newElements.forEach((element) => {
      addSketchElement(editingSketchId, element);
    });

    // Update the feature with all current elements
    // This ensures deletions and updates are synced
    updateFeature(editingSketchId, {
      elements: legacyElements as SketchElement[],
    });

    lastSyncedElementsRef.current = currentElementsJson;
  }, [editingSketchId, legacyElements, features, addSketchElement, updateFeature]);

  // Sync closed profiles from legacy store to feature store
  useEffect(() => {
    if (!editingSketchId || syncInProgressRef.current) return;

    // Update the feature store with detected closed profiles
    const currentSketch = features.find((f) => f.id === editingSketchId) as SketchFeature | undefined;
    if (!currentSketch) return;

    // Only update if profiles have actually changed
    const currentProfilesJson = JSON.stringify(currentSketch.closedProfiles || []);
    const newProfilesJson = JSON.stringify(detectedClosedProfiles);
    if (currentProfilesJson !== newProfilesJson) {
      updateFeature(editingSketchId, {
        closedProfiles: detectedClosedProfiles,
      });
    }
  }, [editingSketchId, detectedClosedProfiles, features, updateFeature]);

  // Clean up when editing stops
  useEffect(() => {
    return () => {
      // When editing stops, clear the legacy store
      if (!editingSketchId) {
        // Clear elements and face outline
        useStore.setState({
          elements: [],
          lastUpdateSource: null,
          faceOutline: null,
        });
        lastSyncedElementsRef.current = '';
      }
    };
  }, [editingSketchId]);

  return {
    editingSketch,
    isEditing: !!editingSketchId,
  };
}
