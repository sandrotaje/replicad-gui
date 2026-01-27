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
  const lastFeatureElementsRef = useRef<string>('');

  // Feature store state
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const features = useFeatureStore((state) => state.features);
  const updateFeature = useFeatureStore((state) => state.updateFeature);
  const addSketchElement = useFeatureStore((state) => state.addSketchElement);

  // Legacy store state
  const legacyElements = useStore((state) => state.elements);
  const detectedClosedProfiles = useStore((state) => state.detectedClosedProfiles);

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
    // Also clear sketch history when starting a new editing session
    useStore.setState({
      elements: sketchElements,
      lastUpdateSource: null,
      sketchHistory: {
        undoStack: [],
        redoStack: [],
        maxHistorySize: 50,
      },
    });

    // Track what we synced - use FULL element data, not just IDs
    const elementsJson = JSON.stringify(sketchElements);
    lastSyncedElementsRef.current = elementsJson;
    lastFeatureElementsRef.current = elementsJson;

    syncInProgressRef.current = false;
  }, [editingSketchId]); // Only re-run when editing starts/stops

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

  // Sync from feature store to legacy store when feature elements change
  // This handles constraint solving and other feature-side updates
  useEffect(() => {
    if (!editingSketch || syncInProgressRef.current) return;

    const featureElementsJson = JSON.stringify(editingSketch.elements);

    // Skip if feature store hasn't changed
    if (featureElementsJson === lastFeatureElementsRef.current) {
      return;
    }

    // Update our feature tracking
    const previousFeatureJson = lastFeatureElementsRef.current;
    lastFeatureElementsRef.current = featureElementsJson;

    // If this is the first time we're seeing this feature, don't sync
    // (initial sync is handled by the first effect)
    if (previousFeatureJson === '') {
      return;
    }

    // Check if the change came from the feature store (not from our sync to it)
    // This is detected when feature elements differ from what we last synced to legacy
    if (featureElementsJson !== lastSyncedElementsRef.current) {
      // Feature store changed independently (e.g., constraint solving), sync back to legacy store
      syncInProgressRef.current = true;

      useStore.setState({
        elements: editingSketch.elements,
        lastUpdateSource: null,
      });

      lastSyncedElementsRef.current = featureElementsJson;
      syncInProgressRef.current = false;
    }
  }, [editingSketch]);

  // Clean up when editing stops
  useEffect(() => {
    return () => {
      // When editing stops, clear the legacy store
      if (!editingSketchId) {
        // Clear elements, face outline, and sketch history
        useStore.setState({
          elements: [],
          lastUpdateSource: null,
          faceOutline: null,
          sketchHistory: {
            undoStack: [],
            redoStack: [],
            maxHistorySize: 50,
          },
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
