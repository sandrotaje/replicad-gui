import { create } from 'zustand';
import type {
  Feature,
  SketchFeature,
  Command,
  CommandType,
  FeatureStoreState,
  HistoryState,
  FeatureType,
  SketchElement,
  ShapeData,
  Constraint,
} from '../types';
import { useStore as useLegacyStore } from './useStore';
import { extractSolverPrimitives, applySolvedPositions } from '../utils/sketchToSolver';
import { ConstraintSolver } from '../utils/constraintSolver';

/**
 * Clear the legacy store's 3D data (shapeData, meshData)
 * Called when project is cleared or loaded to ensure 3D view updates
 */
function clearLegacy3DData() {
  const legacyState = useLegacyStore.getState();
  legacyState.setShapeData(null);
  legacyState.setMeshData(null);
}

// ============ LOCAL STORAGE PERSISTENCE ============

const STORAGE_KEY = 'replicad-cad-project';

interface SavedProjectData {
  version: number;
  savedAt: number;
  features: Feature[];
}

/**
 * Serialize features to JSON for localStorage
 */
function serializeProject(features: Feature[]): string {
  const data: SavedProjectData = {
    version: 1,
    savedAt: Date.now(),
    features,
  };
  return JSON.stringify(data);
}

/**
 * Deserialize features from localStorage JSON
 */
function deserializeProject(json: string): SavedProjectData | null {
  try {
    const data = JSON.parse(json) as SavedProjectData;
    if (!data.version || !Array.isArray(data.features)) {
      console.warn('Invalid project data format');
      return null;
    }
    return data;
  } catch (e) {
    console.error('Failed to parse project data:', e);
    return null;
  }
}

/**
 * Rebuild derived state (featureById, dependents) from features array
 */
function rebuildDerivedState(features: Feature[]) {
  const featureById = new Map<string, Feature>();
  const dependents = new Map<string, Set<string>>();

  for (const feature of features) {
    featureById.set(feature.id, feature);

    // Build dependents map
    const deps = getFeatureDependencies(feature);
    for (const depId of deps) {
      if (!dependents.has(depId)) {
        dependents.set(depId, new Set());
      }
      dependents.get(depId)!.add(feature.id);
    }
  }

  return { featureById, dependents };
}

// ============ ACTION INTERFACE ============

interface FeatureStoreActions {
  // Feature CRUD
  addFeature: (feature: Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>) => string;
  updateFeature: (id: string, updates: Partial<Feature>) => void;
  deleteFeature: (id: string) => void;
  reorderFeature: (id: string, newIndex: number) => void;

  // Sketch element operations (delegates to feature)
  addSketchElement: (featureId: string, element: SketchElement) => void;
  updateSketchElement: (featureId: string, elementId: string, updates: Partial<SketchElement>) => void;
  deleteSketchElement: (featureId: string, elementId: string) => void;

  // Constraint management
  addConstraint: (sketchId: string, constraint: Omit<Constraint, 'id'>) => void;
  removeConstraint: (sketchId: string, constraintId: string) => void;
  updateConstraintValue: (sketchId: string, constraintId: string, value: number) => void;
  solveConstraints: (sketchId: string) => void;

  // Active/editing state
  setActiveFeature: (id: string | null) => void;
  startEditingSketch: (sketchId: string) => void;
  stopEditingSketch: () => void;

  // Dependency management
  getDependencies: (featureId: string) => string[];
  getDependents: (featureId: string) => string[];

  // Evaluation
  markDirty: (featureId: string) => void;
  markDirtyWithDependents: (featureId: string) => void;
  evaluateFeatures: () => Promise<void>;
  getEvaluationOrder: () => string[];

  // History/Undo-Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Utility
  getFeatureByName: (name: string) => Feature | undefined;
  generateUniqueName: (type: FeatureType) => string;

  // Cache management
  setFinalShape: (shape: ShapeData | null) => void;
  setGeometryCache: (featureId: string, geometry: unknown) => void;
  clearGeometryCache: () => void;

  // Persistence
  saveToLocalStorage: () => boolean;
  loadFromLocalStorage: () => boolean;
  clearProject: () => void;
  hasSavedProject: () => boolean;
  getSavedProjectInfo: () => { savedAt: number; featureCount: number } | null;
}

// ============ HELPER FUNCTIONS ============

/**
 * Get the dependencies for a feature (what features it depends on)
 */
function getFeatureDependencies(feature: Feature): string[] {
  const deps: string[] = [];

  switch (feature.type) {
    case 'sketch':
      // Sketches on faces depend on the parent feature
      if (feature.reference.type === 'face') {
        deps.push(feature.reference.parentFeatureId);
      }
      break;

    case 'extrusion':
    case 'cut':
      // Extrusions and cuts depend on their sketch
      deps.push(feature.sketchId);
      break;

    case 'chamfer':
    case 'fillet':
    case 'shell':
      // Chamfer, fillet, and shell depend on their target feature
      deps.push(feature.targetFeatureId);
      break;
  }

  return deps;
}

/**
 * Create a command for undo/redo
 */
function createCommand(
  type: CommandType,
  payload: Command['payload']
): Command {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Deep clone a feature for storing in command history
 */
function cloneFeature(feature: Feature): Feature {
  return JSON.parse(JSON.stringify(feature));
}

// ============ STORE IMPLEMENTATION ============

export const useFeatureStore = create<FeatureStoreState & FeatureStoreActions>((set, get) => ({
  // ============ INITIAL STATE ============
  features: [],
  featureById: new Map(),
  dependents: new Map(),
  activeFeatureId: null,
  editingSketchId: null,
  geometryCache: new Map(),
  finalShape: null,
  history: {
    undoStack: [],
    redoStack: [],
    maxHistorySize: 50,
  },

  // ============ FEATURE CRUD ============

  addFeature: (featureData) => {
    const id = crypto.randomUUID();
    const now = Date.now();

    const newFeature: Feature = {
      ...featureData,
      id,
      createdAt: now,
      isValid: true,
      isDirty: true,
    } as Feature;

    set((state) => {
      // Add to features array
      const newFeatures = [...state.features, newFeature];

      // Update featureById map
      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(id, newFeature);

      // Update dependents map
      const newDependents = new Map(state.dependents);
      const deps = getFeatureDependencies(newFeature);
      for (const depId of deps) {
        if (!newDependents.has(depId)) {
          newDependents.set(depId, new Set());
        }
        newDependents.get(depId)!.add(id);
      }

      // Create command for undo
      const command = createCommand('addFeature', {
        before: null,
        after: cloneFeature(newFeature),
        featureId: id,
      });

      // Update history
      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [], // Clear redo stack on new action
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        dependents: newDependents,
        history: newHistory,
      };
    });

    return id;
  },

  updateFeature: (id, updates) => {
    const state = get();
    const feature = state.featureById.get(id);

    if (!feature) {
      console.warn(`Feature not found: ${id}`);
      return;
    }

    set((state) => {
      const oldFeature = cloneFeature(feature);

      const updatedFeature: Feature = {
        ...feature,
        ...updates,
        isDirty: true,
      } as Feature;

      // Update features array
      const newFeatures = state.features.map((f) =>
        f.id === id ? updatedFeature : f
      );

      // Update featureById map
      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(id, updatedFeature);

      // Rebuild dependents if dependencies changed
      const oldDeps = getFeatureDependencies(feature);
      const newDeps = getFeatureDependencies(updatedFeature);
      const newDependents = new Map(state.dependents);

      // Remove from old dependencies
      for (const depId of oldDeps) {
        if (newDependents.has(depId)) {
          newDependents.get(depId)!.delete(id);
        }
      }

      // Add to new dependencies
      for (const depId of newDeps) {
        if (!newDependents.has(depId)) {
          newDependents.set(depId, new Set());
        }
        newDependents.get(depId)!.add(id);
      }

      // Create command for undo
      const command = createCommand('updateFeature', {
        before: oldFeature,
        after: cloneFeature(updatedFeature),
        featureId: id,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        dependents: newDependents,
        history: newHistory,
      };
    });
  },

  deleteFeature: (id) => {
    const state = get();
    const feature = state.featureById.get(id);

    if (!feature) {
      console.warn(`Feature not found: ${id}`);
      return;
    }

    set((state) => {
      // Store feature for undo
      const deletedFeature = cloneFeature(feature);

      // Remove from features array
      const newFeatures = state.features.filter((f) => f.id !== id);

      // Remove from featureById map
      const newFeatureById = new Map(state.featureById);
      newFeatureById.delete(id);

      // Update dependents map - remove this feature from dependencies
      const newDependents = new Map(state.dependents);
      const deps = getFeatureDependencies(feature);
      for (const depId of deps) {
        if (newDependents.has(depId)) {
          newDependents.get(depId)!.delete(id);
        }
      }

      // Also remove this feature's entry from dependents map
      newDependents.delete(id);

      // Mark all features that depended on this one as invalid
      const dependentIds = state.dependents.get(id) || new Set();
      for (const depId of dependentIds) {
        const depFeature = newFeatureById.get(depId);
        if (depFeature) {
          const invalidFeature: Feature = {
            ...depFeature,
            isValid: false,
            errorMessage: `Depends on deleted feature: ${feature.name}`,
          } as Feature;
          const idx = newFeatures.findIndex((f) => f.id === depId);
          if (idx >= 0) {
            newFeatures[idx] = invalidFeature;
          }
          newFeatureById.set(depId, invalidFeature);
        }
      }

      // Remove from geometry cache
      const newGeometryCache = new Map(state.geometryCache);
      newGeometryCache.delete(id);

      // Clear active/editing if this was the active feature
      const newActiveFeatureId = state.activeFeatureId === id ? null : state.activeFeatureId;
      const newEditingSketchId = state.editingSketchId === id ? null : state.editingSketchId;

      // Create command for undo
      const command = createCommand('deleteFeature', {
        before: deletedFeature,
        after: null,
        featureId: id,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        dependents: newDependents,
        geometryCache: newGeometryCache,
        activeFeatureId: newActiveFeatureId,
        editingSketchId: newEditingSketchId,
        history: newHistory,
      };
    });
  },

  reorderFeature: (id, newIndex) => {
    const state = get();
    const currentIndex = state.features.findIndex((f) => f.id === id);

    if (currentIndex === -1) {
      console.warn(`Feature not found: ${id}`);
      return;
    }

    if (newIndex === currentIndex) return;

    set((state) => {
      const newFeatures = [...state.features];
      const [removed] = newFeatures.splice(currentIndex, 1);
      newFeatures.splice(newIndex, 0, removed);

      // Mark all features after the minimum index as dirty
      const minIndex = Math.min(currentIndex, newIndex);
      for (let i = minIndex; i < newFeatures.length; i++) {
        newFeatures[i] = { ...newFeatures[i], isDirty: true } as Feature;
      }

      // Update featureById map with dirty flags
      const newFeatureById = new Map(state.featureById);
      for (let i = minIndex; i < newFeatures.length; i++) {
        newFeatureById.set(newFeatures[i].id, newFeatures[i]);
      }

      // Create command for undo
      const command = createCommand('reorderFeature', {
        before: currentIndex,
        after: newIndex,
        featureId: id,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  // ============ SKETCH ELEMENT OPERATIONS ============

  addSketchElement: (featureId, element) => {
    const state = get();
    const feature = state.featureById.get(featureId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${featureId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const oldElements = [...sketchFeature.elements];
    const newElements = [...sketchFeature.elements, element];

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: newElements,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

      // Create command for undo
      const command = createCommand('addSketchElement', {
        before: oldElements,
        after: newElements,
        featureId,
        elementId: element.id,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  updateSketchElement: (featureId, elementId, updates) => {
    const state = get();
    const feature = state.featureById.get(featureId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${featureId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const elementIndex = sketchFeature.elements.findIndex((e) => e.id === elementId);

    if (elementIndex === -1) {
      console.warn(`Sketch element not found: ${elementId}`);
      return;
    }

    const oldElements = [...sketchFeature.elements];
    const newElements = sketchFeature.elements.map((e) =>
      e.id === elementId ? { ...e, ...updates } as SketchElement : e
    );

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: newElements,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

      // Create command for undo
      const command = createCommand('updateSketchElement', {
        before: oldElements,
        after: newElements,
        featureId,
        elementId,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  deleteSketchElement: (featureId, elementId) => {
    const state = get();
    const feature = state.featureById.get(featureId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${featureId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const oldElements = [...sketchFeature.elements];
    const newElements = sketchFeature.elements.filter((e) => e.id !== elementId);

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: newElements,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

      // Create command for undo
      const command = createCommand('deleteSketchElement', {
        before: oldElements,
        after: newElements,
        featureId,
        elementId,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  // ============ ACTIVE/EDITING STATE ============

  setActiveFeature: (id) => {
    set({ activeFeatureId: id });
  },

  startEditingSketch: (sketchId) => {
    const state = get();
    const feature = state.featureById.get(sketchId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${sketchId}`);
      return;
    }

    set({
      editingSketchId: sketchId,
      activeFeatureId: sketchId,
    });
  },

  stopEditingSketch: () => {
    set({ editingSketchId: null });
  },

  // ============ DEPENDENCY MANAGEMENT ============

  getDependencies: (featureId) => {
    const state = get();
    const feature = state.featureById.get(featureId);

    if (!feature) return [];

    return getFeatureDependencies(feature);
  },

  getDependents: (featureId) => {
    const state = get();
    const dependentSet = state.dependents.get(featureId);

    return dependentSet ? Array.from(dependentSet) : [];
  },

  // ============ EVALUATION ============

  markDirty: (featureId) => {
    set((state) => {
      const feature = state.featureById.get(featureId);
      if (!feature) return state;

      const updatedFeature = { ...feature, isDirty: true } as Feature;

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

      return {
        features: newFeatures,
        featureById: newFeatureById,
      };
    });
  },

  markDirtyWithDependents: (featureId) => {
    const state = get();

    // Get all features that need to be marked dirty (this feature + all dependents recursively)
    const toMark = new Set<string>();
    const queue = [featureId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (toMark.has(id)) continue;
      toMark.add(id);

      const dependents = state.dependents.get(id);
      if (dependents) {
        queue.push(...dependents);
      }
    }

    set((state) => {
      const newFeatures = state.features.map((f) =>
        toMark.has(f.id) ? { ...f, isDirty: true } as Feature : f
      );

      const newFeatureById = new Map(state.featureById);
      for (const id of toMark) {
        const feature = newFeatureById.get(id);
        if (feature) {
          newFeatureById.set(id, { ...feature, isDirty: true } as Feature);
        }
      }

      return {
        features: newFeatures,
        featureById: newFeatureById,
      };
    });
  },

  evaluateFeatures: async () => {
    // This is a placeholder - actual evaluation will be implemented
    // by the FeatureEvaluator in Task 3
    console.log('evaluateFeatures called - implementation pending');
  },

  getEvaluationOrder: () => {
    const state = get();
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      // Visit dependencies first
      const feature = state.featureById.get(id);
      if (feature) {
        const deps = getFeatureDependencies(feature);
        deps.forEach((depId) => visit(depId));
      }

      result.push(id);
    };

    state.features.forEach((f) => visit(f.id));
    return result;
  },

  // ============ HISTORY/UNDO-REDO ============

  undo: () => {
    const state = get();
    const { undoStack, redoStack, maxHistorySize } = state.history;

    if (undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    const newRedoStack = [...redoStack, command].slice(-maxHistorySize);

    set((state) => {
      let newFeatures = [...state.features];
      let newFeatureById = new Map(state.featureById);
      let newDependents = new Map(state.dependents);

      switch (command.type) {
        case 'addFeature': {
          // Undo add = delete
          const featureId = command.payload.featureId!;
          const feature = newFeatureById.get(featureId);
          if (feature) {
            newFeatures = newFeatures.filter((f) => f.id !== featureId);
            newFeatureById.delete(featureId);

            // Clean up dependents
            const deps = getFeatureDependencies(feature);
            for (const depId of deps) {
              if (newDependents.has(depId)) {
                newDependents.get(depId)!.delete(featureId);
              }
            }
            newDependents.delete(featureId);
          }
          break;
        }

        case 'deleteFeature': {
          // Undo delete = restore
          const feature = command.payload.before as Feature;
          newFeatures.push(feature);
          newFeatureById.set(feature.id, feature);

          // Restore dependencies
          const deps = getFeatureDependencies(feature);
          for (const depId of deps) {
            if (!newDependents.has(depId)) {
              newDependents.set(depId, new Set());
            }
            newDependents.get(depId)!.add(feature.id);
          }
          break;
        }

        case 'updateFeature': {
          // Undo update = restore previous state
          const featureId = command.payload.featureId!;
          const oldFeature = command.payload.before as Feature;
          const currentFeature = newFeatureById.get(featureId);

          const idx = newFeatures.findIndex((f) => f.id === featureId);
          if (idx >= 0) {
            newFeatures[idx] = oldFeature;
          }
          newFeatureById.set(featureId, oldFeature);

          // Update dependents if dependencies changed
          if (currentFeature) {
            const oldDeps = getFeatureDependencies(currentFeature);
            for (const depId of oldDeps) {
              if (newDependents.has(depId)) {
                newDependents.get(depId)!.delete(featureId);
              }
            }
          }
          const newDeps = getFeatureDependencies(oldFeature);
          for (const depId of newDeps) {
            if (!newDependents.has(depId)) {
              newDependents.set(depId, new Set());
            }
            newDependents.get(depId)!.add(featureId);
          }
          break;
        }

        case 'reorderFeature': {
          // Undo reorder = move back to original position
          const featureId = command.payload.featureId!;
          const oldIndex = command.payload.before as number;
          const currentIndex = newFeatures.findIndex((f) => f.id === featureId);

          if (currentIndex >= 0 && oldIndex !== currentIndex) {
            const [removed] = newFeatures.splice(currentIndex, 1);
            newFeatures.splice(oldIndex, 0, removed);
          }
          break;
        }

        case 'addSketchElement':
        case 'updateSketchElement':
        case 'deleteSketchElement': {
          // Restore previous elements array
          const featureId = command.payload.featureId!;
          const oldElements = command.payload.before as SketchElement[];
          const feature = newFeatureById.get(featureId);

          if (feature && feature.type === 'sketch') {
            const updatedFeature: SketchFeature = {
              ...(feature as SketchFeature),
              elements: oldElements,
              isDirty: true,
            };
            const idx = newFeatures.findIndex((f) => f.id === featureId);
            if (idx >= 0) {
              newFeatures[idx] = updatedFeature;
            }
            newFeatureById.set(featureId, updatedFeature);
          }
          break;
        }
      }

      return {
        features: newFeatures,
        featureById: newFeatureById,
        dependents: newDependents,
        history: {
          ...state.history,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
        },
      };
    });
  },

  redo: () => {
    const state = get();
    const { undoStack, redoStack, maxHistorySize } = state.history;

    if (redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    const newUndoStack = [...undoStack, command].slice(-maxHistorySize);

    set((state) => {
      let newFeatures = [...state.features];
      let newFeatureById = new Map(state.featureById);
      let newDependents = new Map(state.dependents);

      switch (command.type) {
        case 'addFeature': {
          // Redo add = add again
          const feature = command.payload.after as Feature;
          newFeatures.push(feature);
          newFeatureById.set(feature.id, feature);

          // Add dependencies
          const deps = getFeatureDependencies(feature);
          for (const depId of deps) {
            if (!newDependents.has(depId)) {
              newDependents.set(depId, new Set());
            }
            newDependents.get(depId)!.add(feature.id);
          }
          break;
        }

        case 'deleteFeature': {
          // Redo delete = delete again
          const featureId = command.payload.featureId!;
          const feature = newFeatureById.get(featureId);

          if (feature) {
            newFeatures = newFeatures.filter((f) => f.id !== featureId);
            newFeatureById.delete(featureId);

            // Clean up dependents
            const deps = getFeatureDependencies(feature);
            for (const depId of deps) {
              if (newDependents.has(depId)) {
                newDependents.get(depId)!.delete(featureId);
              }
            }
            newDependents.delete(featureId);
          }
          break;
        }

        case 'updateFeature': {
          // Redo update = apply new state
          const featureId = command.payload.featureId!;
          const newFeature = command.payload.after as Feature;
          const currentFeature = newFeatureById.get(featureId);

          const idx = newFeatures.findIndex((f) => f.id === featureId);
          if (idx >= 0) {
            newFeatures[idx] = newFeature;
          }
          newFeatureById.set(featureId, newFeature);

          // Update dependents
          if (currentFeature) {
            const oldDeps = getFeatureDependencies(currentFeature);
            for (const depId of oldDeps) {
              if (newDependents.has(depId)) {
                newDependents.get(depId)!.delete(featureId);
              }
            }
          }
          const newDeps = getFeatureDependencies(newFeature);
          for (const depId of newDeps) {
            if (!newDependents.has(depId)) {
              newDependents.set(depId, new Set());
            }
            newDependents.get(depId)!.add(featureId);
          }
          break;
        }

        case 'reorderFeature': {
          // Redo reorder = move to new position
          const featureId = command.payload.featureId!;
          const newIndex = command.payload.after as number;
          const currentIndex = newFeatures.findIndex((f) => f.id === featureId);

          if (currentIndex >= 0 && newIndex !== currentIndex) {
            const [removed] = newFeatures.splice(currentIndex, 1);
            newFeatures.splice(newIndex, 0, removed);
          }
          break;
        }

        case 'addSketchElement':
        case 'updateSketchElement':
        case 'deleteSketchElement': {
          // Apply new elements array
          const featureId = command.payload.featureId!;
          const newElements = command.payload.after as SketchElement[];
          const feature = newFeatureById.get(featureId);

          if (feature && feature.type === 'sketch') {
            const updatedFeature: SketchFeature = {
              ...(feature as SketchFeature),
              elements: newElements,
              isDirty: true,
            };
            const idx = newFeatures.findIndex((f) => f.id === featureId);
            if (idx >= 0) {
              newFeatures[idx] = updatedFeature;
            }
            newFeatureById.set(featureId, updatedFeature);
          }
          break;
        }
      }

      return {
        features: newFeatures,
        featureById: newFeatureById,
        dependents: newDependents,
        history: {
          ...state.history,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
        },
      };
    });
  },

  canUndo: () => {
    return get().history.undoStack.length > 0;
  },

  canRedo: () => {
    return get().history.redoStack.length > 0;
  },

  // ============ UTILITY ============

  getFeatureByName: (name) => {
    const state = get();
    return state.features.find((f) => f.name === name);
  },

  generateUniqueName: (type) => {
    const state = get();

    // Get display name for type
    const typeNames: Record<FeatureType, string> = {
      sketch: 'Sketch',
      extrusion: 'Extrude',
      cut: 'Cut',
      chamfer: 'Chamfer',
      fillet: 'Fillet',
      revolve: 'Revolve',
      shell: 'Shell',
    };

    const baseName = typeNames[type] || type;

    // Find highest existing number for this type
    let maxNum = 0;
    const pattern = new RegExp(`^${baseName} (\\d+)$`);

    for (const feature of state.features) {
      const match = feature.name.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `${baseName} ${maxNum + 1}`;
  },

  // ============ CONSTRAINT MANAGEMENT ============

  addConstraint: (sketchId, constraintData) => {
    const state = get();
    const feature = state.featureById.get(sketchId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${sketchId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const constraintId = crypto.randomUUID();
    const newConstraint: Constraint = {
      ...constraintData,
      id: constraintId,
    };

    const newConstraints = [...sketchFeature.constraints, newConstraint];

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: newConstraints,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

      // Create command for undo
      const command = createCommand('updateFeature', {
        before: cloneFeature(sketchFeature),
        after: cloneFeature(updatedFeature),
        featureId: sketchId,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  removeConstraint: (sketchId, constraintId) => {
    const state = get();
    const feature = state.featureById.get(sketchId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${sketchId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const newConstraints = sketchFeature.constraints.filter((c) => c.id !== constraintId);

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: newConstraints,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

      // Create command for undo
      const command = createCommand('updateFeature', {
        before: cloneFeature(sketchFeature),
        after: cloneFeature(updatedFeature),
        featureId: sketchId,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  updateConstraintValue: (sketchId, constraintId, value) => {
    const state = get();
    const feature = state.featureById.get(sketchId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${sketchId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;
    const newConstraints = sketchFeature.constraints.map((c) =>
      c.id === constraintId ? { ...c, value } : c
    );

    set((state) => {
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: newConstraints,
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

      // Create command for undo
      const command = createCommand('updateFeature', {
        before: cloneFeature(sketchFeature),
        after: cloneFeature(updatedFeature),
        featureId: sketchId,
      });

      const newHistory: HistoryState = {
        ...state.history,
        undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
        redoStack: [],
      };

      return {
        features: newFeatures,
        featureById: newFeatureById,
        history: newHistory,
      };
    });
  },

  solveConstraints: (sketchId) => {
    const state = get();
    const feature = state.featureById.get(sketchId);

    if (!feature || feature.type !== 'sketch') {
      console.warn(`Sketch feature not found: ${sketchId}`);
      return;
    }

    const sketchFeature = feature as SketchFeature;

    try {
      // Step 1: Extract solver primitives from sketch elements
      const { points, lines, circles } = extractSolverPrimitives(sketchFeature.elements);

      // Step 2: Solve constraints
      const solverResult = ConstraintSolver.solve(
        points,
        sketchFeature.constraints,
        lines,
        circles
      );

      // Step 3: Apply solved positions back to elements
      const updatedElements = applySolvedPositions(
        sketchFeature.elements,
        solverResult.points,
        solverResult.circles
      );

      // Step 4: Update sketch with solved elements
      set((state) => {
        const updatedFeature: SketchFeature = {
          ...sketchFeature,
          elements: updatedElements,
          isDirty: true,
        };

        const newFeatures = state.features.map((f) =>
          f.id === sketchId ? updatedFeature : f
        );

        const newFeatureById = new Map(state.featureById);
        newFeatureById.set(sketchId, updatedFeature);

        // Create command for undo
        const command = createCommand('updateFeature', {
          before: cloneFeature(sketchFeature),
          after: cloneFeature(updatedFeature),
          featureId: sketchId,
        });

        const newHistory: HistoryState = {
          ...state.history,
          undoStack: [...state.history.undoStack, command].slice(-state.history.maxHistorySize),
          redoStack: [],
        };

        return {
          features: newFeatures,
          featureById: newFeatureById,
          history: newHistory,
        };
      });

      console.log(`[Feature Store] Constraints solved for sketch: ${sketchId}`);
    } catch (error) {
      console.error('[Feature Store] Failed to solve constraints:', error);
      // Mark feature as invalid
      set((state) => {
        const invalidFeature: SketchFeature = {
          ...sketchFeature,
          isValid: false,
          errorMessage: `Constraint solver error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };

        const newFeatures = state.features.map((f) =>
          f.id === sketchId ? invalidFeature : f
        );

        const newFeatureById = new Map(state.featureById);
        newFeatureById.set(sketchId, invalidFeature);

        return {
          features: newFeatures,
          featureById: newFeatureById,
        };
      });
    }
  },

  // ============ CACHE MANAGEMENT ============

  setFinalShape: (shape) => {
    set({ finalShape: shape });
  },

  setGeometryCache: (featureId, geometry) => {
    set((state) => {
      const newCache = new Map(state.geometryCache);
      newCache.set(featureId, geometry);
      return { geometryCache: newCache };
    });
  },

  clearGeometryCache: () => {
    set({ geometryCache: new Map() });
  },

  // ============ PERSISTENCE ============

  saveToLocalStorage: () => {
    try {
      const state = get();
      const json = serializeProject(state.features);
      localStorage.setItem(STORAGE_KEY, json);
      console.log('[Feature Store] Project saved to localStorage');
      return true;
    } catch (e) {
      console.error('[Feature Store] Failed to save project:', e);
      return false;
    }
  },

  loadFromLocalStorage: () => {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) {
        console.log('[Feature Store] No saved project found');
        return false;
      }

      const data = deserializeProject(json);
      if (!data) {
        return false;
      }

      // Clear legacy store's 3D data first (will be re-evaluated from loaded features)
      clearLegacy3DData();

      // Rebuild derived state from features
      const { featureById, dependents } = rebuildDerivedState(data.features);

      set({
        features: data.features,
        featureById,
        dependents,
        activeFeatureId: null,
        editingSketchId: null,
        geometryCache: new Map(),
        finalShape: null,
        history: {
          undoStack: [],
          redoStack: [],
          maxHistorySize: 50,
        },
      });

      console.log(`[Feature Store] Loaded project with ${data.features.length} features`);
      return true;
    } catch (e) {
      console.error('[Feature Store] Failed to load project:', e);
      return false;
    }
  },

  clearProject: () => {
    // Clear legacy store's 3D data first
    clearLegacy3DData();

    set({
      features: [],
      featureById: new Map(),
      dependents: new Map(),
      activeFeatureId: null,
      editingSketchId: null,
      geometryCache: new Map(),
      finalShape: null,
      history: {
        undoStack: [],
        redoStack: [],
        maxHistorySize: 50,
      },
    });
    console.log('[Feature Store] Project cleared');
  },

  hasSavedProject: () => {
    return localStorage.getItem(STORAGE_KEY) !== null;
  },

  getSavedProjectInfo: () => {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return null;

      const data = deserializeProject(json);
      if (!data) return null;

      return {
        savedAt: data.savedAt,
        featureCount: data.features.length,
      };
    } catch {
      return null;
    }
  },
}));

// Export helper function for getting feature dependencies
export { getFeatureDependencies };
