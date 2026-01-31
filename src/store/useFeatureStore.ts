import { create } from 'zustand';
import type {
  Feature,
  SketchFeature,
  Snapshot,
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
  snapshots?: Snapshot[];
  currentSnapshotIndex?: number;
}

/**
 * Serialize features and snapshots to JSON for localStorage
 */
function serializeProject(features: Feature[], history: HistoryState): string {
  const data: SavedProjectData = {
    version: 2,
    savedAt: Date.now(),
    features,
    snapshots: history.snapshots,
    currentSnapshotIndex: history.currentSnapshotIndex,
  };
  return JSON.stringify(data);
}

/**
 * Deserialize features from localStorage JSON (supports v1 and v2)
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
  rollbackToFeature: (featureId: string) => void;
  rollbackToSnapshot: (index: number) => void;

  // Utility
  getFeatureByName: (name: string) => Feature | undefined;
  generateUniqueName: (type: FeatureType) => string;

  // Sketch 3D visibility
  toggleSketch3DVisibility: (featureId: string) => void;

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

    case 'sweep':
      deps.push(feature.profileSketchId);
      deps.push(feature.pathSketchId);
      break;

    case 'chamfer':
    case 'fillet':
    case 'shell':
      // Chamfer, fillet, and shell depend on their target feature
      deps.push(feature.targetFeatureId);
      break;

    case 'loft':
      deps.push(...feature.profileSketchIds);
      break;

    case 'linearPattern':
    case 'polarPattern':
      deps.push(feature.sourceFeatureId);
      break;
  }

  return deps;
}

/**
 * Deep clone features array for snapshot storage
 */
function cloneFeatures(features: Feature[]): Feature[] {
  return JSON.parse(JSON.stringify(features));
}

/**
 * Push a snapshot of the current features state onto the history.
 * Discards any snapshots after currentSnapshotIndex (forward history).
 * Caps total snapshots at maxSnapshots.
 */
function pushSnapshot(history: HistoryState, features: Feature[], label: string): HistoryState {
  const { snapshots, currentSnapshotIndex, maxSnapshots } = history;

  // Discard future snapshots (after current index)
  const kept = snapshots.slice(0, currentSnapshotIndex + 1);

  const newSnapshot: Snapshot = {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    features: cloneFeatures(features),
  };

  kept.push(newSnapshot);

  // Cap at maxSnapshots, trimming oldest
  const trimmed = kept.length > maxSnapshots ? kept.slice(kept.length - maxSnapshots) : kept;

  return {
    snapshots: trimmed,
    currentSnapshotIndex: trimmed.length - 1,
    maxSnapshots,
  };
}

/**
 * Restore features from a snapshot at given index.
 * Returns the new state slice to merge.
 */
function restoreSnapshot(snapshots: Snapshot[], index: number): {
  features: Feature[];
  featureById: Map<string, Feature>;
  dependents: Map<string, Set<string>>;
  geometryCache: Map<string, unknown>;
  finalShape: null;
  activeFeatureId: null;
  editingSketchId: null;
} {
  const snapshot = snapshots[index];
  const features = cloneFeatures(snapshot.features);

  // Mark all restored features as dirty to trigger re-evaluation
  const dirtyFeatures = features.map((f) => ({ ...f, isDirty: true } as Feature));

  const { featureById, dependents } = rebuildDerivedState(dirtyFeatures);

  return {
    features: dirtyFeatures,
    featureById,
    dependents,
    geometryCache: new Map(),
    finalShape: null,
    activeFeatureId: null,
    editingSketchId: null,
  };
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
    snapshots: [],
    currentSnapshotIndex: -1,
    maxSnapshots: 30,
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
      // Snapshot current state before mutation
      const newHistory = pushSnapshot(state.history, state.features, `Add ${newFeature.name || newFeature.type}`);

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
      // Snapshot current state before mutation
      const newHistory = pushSnapshot(state.history, state.features, `Update ${feature.name}`);

      const updatedFeature: Feature = {
        ...feature,
        ...updates,
        isDirty: true,
      } as Feature;

      const newFeatures = state.features.map((f) =>
        f.id === id ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(id, updatedFeature);

      // Rebuild dependents if dependencies changed
      const oldDeps = getFeatureDependencies(feature);
      const newDeps = getFeatureDependencies(updatedFeature);
      const newDependents = new Map(state.dependents);

      for (const depId of oldDeps) {
        if (newDependents.has(depId)) {
          newDependents.get(depId)!.delete(id);
        }
      }
      for (const depId of newDeps) {
        if (!newDependents.has(depId)) {
          newDependents.set(depId, new Set());
        }
        newDependents.get(depId)!.add(id);
      }

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
      // Snapshot current state before mutation
      const newHistory = pushSnapshot(state.history, state.features, `Delete ${feature.name}`);

      const newFeatures = state.features.filter((f) => f.id !== id);

      const newFeatureById = new Map(state.featureById);
      newFeatureById.delete(id);

      const newDependents = new Map(state.dependents);
      const deps = getFeatureDependencies(feature);
      for (const depId of deps) {
        if (newDependents.has(depId)) {
          newDependents.get(depId)!.delete(id);
        }
      }
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

      const newGeometryCache = new Map(state.geometryCache);
      newGeometryCache.delete(id);

      const newActiveFeatureId = state.activeFeatureId === id ? null : state.activeFeatureId;
      const newEditingSketchId = state.editingSketchId === id ? null : state.editingSketchId;

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
      // Snapshot current state before mutation
      const newHistory = pushSnapshot(state.history, state.features, 'Reorder feature');

      const newFeatures = [...state.features];
      const [removed] = newFeatures.splice(currentIndex, 1);
      newFeatures.splice(newIndex, 0, removed);

      const minIndex = Math.min(currentIndex, newIndex);
      for (let i = minIndex; i < newFeatures.length; i++) {
        newFeatures[i] = { ...newFeatures[i], isDirty: true } as Feature;
      }

      const newFeatureById = new Map(state.featureById);
      for (let i = minIndex; i < newFeatures.length; i++) {
        newFeatureById.set(newFeatures[i].id, newFeatures[i]);
      }

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

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Add sketch element');

      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: [...sketchFeature.elements, element],
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

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
    if (!sketchFeature.elements.some((e) => e.id === elementId)) {
      console.warn(`Sketch element not found: ${elementId}`);
      return;
    }

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Update sketch element');

      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: sketchFeature.elements.map((e) =>
          e.id === elementId ? { ...e, ...updates } as SketchElement : e
        ),
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

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

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Delete sketch element');

      const sketchFeature = feature as SketchFeature;
      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        elements: sketchFeature.elements.filter((e) => e.id !== elementId),
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);

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
    const { currentSnapshotIndex } = state.history;

    if (currentSnapshotIndex < 0) return;

    set((state) => {
      const newIndex = state.history.currentSnapshotIndex - 1;

      if (newIndex < 0) {
        // Undo to empty state (before first snapshot)
        return {
          features: [],
          featureById: new Map(),
          dependents: new Map(),
          geometryCache: new Map(),
          finalShape: null,
          activeFeatureId: null,
          editingSketchId: null,
          history: {
            ...state.history,
            currentSnapshotIndex: -1,
          },
        };
      }

      const restored = restoreSnapshot(state.history.snapshots, newIndex);
      return {
        ...restored,
        history: {
          ...state.history,
          currentSnapshotIndex: newIndex,
        },
      };
    });
  },

  redo: () => {
    const { history } = get();

    if (history.currentSnapshotIndex >= history.snapshots.length - 1) return;

    set((state) => {
      const newIndex = state.history.currentSnapshotIndex + 1;
      const restored = restoreSnapshot(state.history.snapshots, newIndex);
      return {
        ...restored,
        history: {
          ...state.history,
          currentSnapshotIndex: newIndex,
        },
      };
    });
  },

  canUndo: () => {
    return get().history.currentSnapshotIndex >= 0;
  },

  canRedo: () => {
    const { snapshots, currentSnapshotIndex } = get().history;
    return currentSnapshotIndex < snapshots.length - 1;
  },

  rollbackToFeature: (featureId) => {
    const state = get();
    const { snapshots } = state.history;

    // Search snapshots in reverse for the last one containing this feature as the final feature
    let targetIndex = -1;
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const snap = snapshots[i];
      const lastFeature = snap.features[snap.features.length - 1];
      if (lastFeature && lastFeature.id === featureId) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      // Fallback: find any snapshot containing the feature
      for (let i = snapshots.length - 1; i >= 0; i--) {
        if (snapshots[i].features.some((f) => f.id === featureId)) {
          targetIndex = i;
          break;
        }
      }
    }

    if (targetIndex === -1) {
      console.warn(`No snapshot found containing feature: ${featureId}`);
      return;
    }

    get().rollbackToSnapshot(targetIndex);
  },

  rollbackToSnapshot: (index) => {
    const state = get();
    const { snapshots } = state.history;

    if (index < 0 || index >= snapshots.length) {
      console.warn(`Invalid snapshot index: ${index}`);
      return;
    }

    set((state) => {
      const restored = restoreSnapshot(state.history.snapshots, index);
      return {
        ...restored,
        history: {
          ...state.history,
          currentSnapshotIndex: index,
        },
      };
    });
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
      sweep: 'Sweep',
      loft: 'Loft',
      linearPattern: 'Linear Pattern',
      polarPattern: 'Polar Pattern',
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

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Add constraint');

      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: [...sketchFeature.constraints, newConstraint],
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

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

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Remove constraint');

      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: sketchFeature.constraints.filter((c) => c.id !== constraintId),
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

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

    set((state) => {
      const newHistory = pushSnapshot(state.history, state.features, 'Update constraint');

      const updatedFeature: SketchFeature = {
        ...sketchFeature,
        constraints: sketchFeature.constraints.map((c) =>
          c.id === constraintId ? { ...c, value } : c
        ),
        isDirty: true,
      };

      const newFeatures = state.features.map((f) =>
        f.id === sketchId ? updatedFeature : f
      );

      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(sketchId, updatedFeature);

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
        const newHistory = pushSnapshot(state.history, state.features, 'Solve constraints');

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

  // ============ SKETCH 3D VISIBILITY ============

  toggleSketch3DVisibility: (featureId) => {
    const state = get();
    const feature = state.featureById.get(featureId);
    if (!feature || feature.type !== 'sketch') return;

    const sketch = feature as SketchFeature;
    const updatedFeature: SketchFeature = {
      ...sketch,
      showIn3D: !sketch.showIn3D,
    };

    set((state) => {
      const newFeatures = state.features.map((f) =>
        f.id === featureId ? updatedFeature : f
      );
      const newFeatureById = new Map(state.featureById);
      newFeatureById.set(featureId, updatedFeature);
      return { features: newFeatures, featureById: newFeatureById };
    });
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
      const json = serializeProject(state.features, state.history);
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

      // Restore snapshots if available (v2), otherwise start fresh
      const history: HistoryState = data.snapshots && data.currentSnapshotIndex !== undefined
        ? {
            snapshots: data.snapshots,
            currentSnapshotIndex: data.currentSnapshotIndex,
            maxSnapshots: 30,
          }
        : {
            snapshots: [],
            currentSnapshotIndex: -1,
            maxSnapshots: 30,
          };

      set({
        features: data.features,
        featureById,
        dependents,
        activeFeatureId: null,
        editingSketchId: null,
        geometryCache: new Map(),
        finalShape: null,
        history,
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
        snapshots: [],
        currentSnapshotIndex: -1,
        maxSnapshots: 30,
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
