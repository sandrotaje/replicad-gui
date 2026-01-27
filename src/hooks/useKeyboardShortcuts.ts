import { useEffect, useCallback } from 'react';
import { useFeatureStore } from '../store/useFeatureStore';
import type { Feature, SketchFeature, ExtrusionFeature, CutFeature } from '../types';

/**
 * Hook for handling keyboard shortcuts throughout the application.
 *
 * Shortcuts:
 * - Ctrl/Cmd + Z: Undo
 * - Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
 * - Ctrl/Cmd + S: Save project to localStorage
 * - Delete/Backspace: Delete active feature (with confirmation)
 * - Escape: Stop editing sketch, deselect active feature
 * - S: Start new sketch (when not editing)
 * - E: Extrude current sketch (when editing a sketch with elements)
 * - X: Cut with current sketch (when editing a sketch with elements)
 */
export function useKeyboardShortcuts() {
  const undo = useFeatureStore((state) => state.undo);
  const redo = useFeatureStore((state) => state.redo);
  const canUndo = useFeatureStore((state) => state.canUndo);
  const canRedo = useFeatureStore((state) => state.canRedo);
  const deleteFeature = useFeatureStore((state) => state.deleteFeature);
  const activeFeatureId = useFeatureStore((state) => state.activeFeatureId);
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const setActiveFeature = useFeatureStore((state) => state.setActiveFeature);
  const stopEditingSketch = useFeatureStore((state) => state.stopEditingSketch);
  const startEditingSketch = useFeatureStore((state) => state.startEditingSketch);
  const addFeature = useFeatureStore((state) => state.addFeature);
  const generateUniqueName = useFeatureStore((state) => state.generateUniqueName);
  const features = useFeatureStore((state) => state.features);
  const saveToLocalStorage = useFeatureStore((state) => state.saveToLocalStorage);

  /**
   * Check if the currently focused element is an input field (text input, textarea, etc.)
   * to avoid triggering shortcuts while typing.
   */
  const isInputFocused = useCallback((): boolean => {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    const tagName = activeElement.tagName.toLowerCase();

    // Check for input and textarea elements
    if (tagName === 'input' || tagName === 'textarea') {
      return true;
    }

    // Check for contenteditable elements
    if (activeElement.getAttribute('contenteditable') === 'true') {
      return true;
    }

    // Check for elements with role="textbox"
    if (activeElement.getAttribute('role') === 'textbox') {
      return true;
    }

    return false;
  }, []);

  /**
   * Get the currently editing sketch if available
   */
  const getEditingSketch = useCallback((): SketchFeature | null => {
    if (!editingSketchId) return null;
    const sketch = features.find((f) => f.id === editingSketchId);
    return sketch?.type === 'sketch' ? (sketch as SketchFeature) : null;
  }, [editingSketchId, features]);

  /**
   * Handle creating a new sketch on XY plane
   */
  const handleNewSketch = useCallback(() => {
    const sketchData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: { type: 'standard', plane: 'XY', offset: 0 },
      elements: [],
      isClosed: false,
      isCollapsed: false,
      constraints: [],
    };
    const sketchId = addFeature(sketchData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    startEditingSketch(sketchId);
  }, [addFeature, generateUniqueName, startEditingSketch]);

  /**
   * Handle extruding the current sketch
   */
  const handleExtrude = useCallback(() => {
    const editingSketch = getEditingSketch();
    if (!editingSketch) return;

    // Check if there are extrudable elements (rectangles, circles, or closed profiles)
    const standaloneExtrudables = editingSketch.elements.filter(
      (e) => e.type === 'rectangle' || e.type === 'circle'
    );
    const closedProfileCount = editingSketch.closedProfiles?.length ?? 0;

    if (standaloneExtrudables.length === 0 && closedProfileCount === 0) {
      console.log('[Keyboard] Cannot extrude: No extrudable elements or closed profiles in sketch');
      return;
    }

    // Determine if this is the first solid or should fuse with existing
    const hasExistingExtrusions = features.some((f) => f.type === 'extrusion');

    const extrusionData: Omit<ExtrusionFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'extrusion',
      name: generateUniqueName('extrusion'),
      sketchId: editingSketchId!,
      depth: 10, // Default depth
      direction: 'normal',
      operation: hasExistingExtrusions ? 'fuse' : 'new',
      isCollapsed: false,
    };
    addFeature(extrusionData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);

    stopEditingSketch();
  }, [getEditingSketch, features, editingSketchId, generateUniqueName, addFeature, stopEditingSketch]);

  /**
   * Handle cutting with the current sketch
   */
  const handleCut = useCallback(() => {
    const editingSketch = getEditingSketch();
    if (!editingSketch) return;

    // Check if there are extrudable elements (rectangles, circles, or closed profiles)
    const standaloneExtrudables = editingSketch.elements.filter(
      (e) => e.type === 'rectangle' || e.type === 'circle'
    );
    const closedProfileCount = editingSketch.closedProfiles?.length ?? 0;

    if (standaloneExtrudables.length === 0 && closedProfileCount === 0) {
      console.log('[Keyboard] Cannot cut: No extrudable elements or closed profiles in sketch');
      return;
    }

    // Cut requires existing geometry
    const hasExistingExtrusions = features.some((f) => f.type === 'extrusion');
    if (!hasExistingExtrusions) {
      console.log('[Keyboard] Cannot cut: No existing geometry to cut from');
      return;
    }

    const cutData: Omit<CutFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'cut',
      name: generateUniqueName('cut'),
      sketchId: editingSketchId!,
      depth: 10, // Default depth
      direction: 'normal',
      isCollapsed: false,
    };
    addFeature(cutData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);

    stopEditingSketch();
  }, [getEditingSketch, features, editingSketchId, generateUniqueName, addFeature, stopEditingSketch]);

  /**
   * Handle deleting the active feature with confirmation
   */
  const handleDeleteFeature = useCallback(() => {
    if (!activeFeatureId) return;

    const feature = features.find((f) => f.id === activeFeatureId);
    if (!feature) return;

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete "${feature.name}"?\n\nThis action can be undone with Ctrl+Z.`
    );

    if (confirmed) {
      deleteFeature(activeFeatureId);
    }
  }, [activeFeatureId, features, deleteFeature]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (modKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
          console.log('[Keyboard] Undo triggered');
        }
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (modKey && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (canRedo()) {
          redo();
          console.log('[Keyboard] Redo triggered');
        }
        return;
      }

      // Save: Ctrl/Cmd + S
      if (modKey && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        saveToLocalStorage();
        console.log('[Keyboard] Project saved');
        return;
      }

      // Skip single-key shortcuts if input is focused
      if (isInputFocused()) {
        return;
      }

      // Delete/Backspace: Delete active feature (with confirmation)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not editing (to allow backspace in inputs)
        if (activeFeatureId && !editingSketchId) {
          e.preventDefault();
          handleDeleteFeature();
          return;
        }
      }

      // Escape: Stop editing / deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editingSketchId) {
          stopEditingSketch();
          console.log('[Keyboard] Stopped editing sketch');
        } else if (activeFeatureId) {
          setActiveFeature(null);
          console.log('[Keyboard] Deselected feature');
        }
        return;
      }

      // S: Start new sketch (when not editing)
      if (e.key.toLowerCase() === 's' && !modKey && !e.shiftKey && !e.altKey) {
        if (!editingSketchId) {
          e.preventDefault();
          handleNewSketch();
          console.log('[Keyboard] Started new sketch');
        }
        return;
      }

      // E: Extrude current sketch (when editing a sketch with elements)
      if (e.key.toLowerCase() === 'e' && !modKey && !e.shiftKey && !e.altKey) {
        if (editingSketchId) {
          e.preventDefault();
          handleExtrude();
          console.log('[Keyboard] Extrude triggered');
        }
        return;
      }

      // X: Cut with current sketch (when editing a sketch with elements)
      if (e.key.toLowerCase() === 'x' && !modKey && !e.shiftKey && !e.altKey) {
        if (editingSketchId) {
          e.preventDefault();
          handleCut();
          console.log('[Keyboard] Cut triggered');
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    activeFeatureId,
    editingSketchId,
    setActiveFeature,
    stopEditingSketch,
    isInputFocused,
    handleNewSketch,
    handleExtrude,
    handleCut,
    handleDeleteFeature,
    saveToLocalStorage,
  ]);
}

export default useKeyboardShortcuts;
