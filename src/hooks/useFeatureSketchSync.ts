/**
 * Hook to synchronize the legacy store with the feature store when editing a sketch.
 *
 * This bridge allows the existing Sketcher component to work with the new feature-based system
 * by syncing elements between the two stores.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import type { SketchFeature, SketchElement, StandardPlane } from '../types';

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
    const plane: StandardPlane = editingSketch.reference.type === 'standard'
      ? editingSketch.reference.plane
      : 'XY'; // Default to XY for face sketches (the Sketcher handles coordinate transformation)

    // Use the store's setSketchPlane directly
    useStore.getState().setSketchPlane(plane);

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

  // Clean up when editing stops
  useEffect(() => {
    return () => {
      // When editing stops, clear the legacy store
      if (!editingSketchId) {
        // Clear elements but keep the plane
        useStore.setState({
          elements: [],
          lastUpdateSource: null,
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
