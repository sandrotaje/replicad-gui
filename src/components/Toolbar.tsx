import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import type { SketchFeature, ExtrusionFeature, CutFeature, ChamferFeature, FilletFeature, ShellFeature, SweepFeature, Feature, StandardPlane } from '../types';
import { isSolidFeature } from '../types';
import { exportToSTL } from '../utils/stlExporter';
import { DepthPromptDialog, type OperationDirection } from './DepthPromptDialog';
import { BevelDialog, type BevelType } from './BevelDialog';
import { SweepDialog } from './SweepDialog';
import { showToast } from '../utils/toast';

// Undo/Redo button styles
const undoRedoButtonStyle = (enabled: boolean) => ({
  padding: '6px 10px',
  border: '1px solid #45475a',
  borderRadius: '6px',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontWeight: 500 as const,
  fontSize: '14px',
  backgroundColor: 'transparent',
  color: enabled ? '#cdd6f4' : '#45475a',
  opacity: enabled ? 1 : 0.5,
  transition: 'all 0.2s',
});

interface ToolbarProps {
  isMobile?: boolean;
  toolsOpen?: boolean;
  setToolsOpen?: (open: boolean) => void;
}

export function Toolbar({ isMobile = false, toolsOpen = false, setToolsOpen }: ToolbarProps) {
  // Legacy store (for 3D selection and shape data)
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);
  const selectedEdgeIndices = useStore((state) => state.selectedEdgeIndices);
  const shapeData = useStore((state) => state.shapeData);

  // Depth prompt dialog state
  const [showDepthDialog, setShowDepthDialog] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<'extrude' | 'cut' | null>(null);

  // Bevel dialog state
  const [showBevelDialog, setShowBevelDialog] = useState(false);
  const [pendingBevelType, setPendingBevelType] = useState<BevelType | null>(null);

  // Sweep dialog state
  const [showSweepDialog, setShowSweepDialog] = useState(false);

  // Plane picker state
  const [showPlanePicker, setShowPlanePicker] = useState(false);
  const [planeOffset, setPlaneOffset] = useState(0);

  // Sketch undo/redo
  const sketchUndo = useStore((state) => state.sketchUndo);
  const sketchRedo = useStore((state) => state.sketchRedo);
  const canSketchUndo = useStore((state) => state.canSketchUndo);
  const canSketchRedo = useStore((state) => state.canSketchRedo);

  // Feature store
  const features = useFeatureStore((state) => state.features);
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const addFeature = useFeatureStore((state) => state.addFeature);
  const startEditingSketch = useFeatureStore((state) => state.startEditingSketch);
  const stopEditingSketch = useFeatureStore((state) => state.stopEditingSketch);
  const generateUniqueName = useFeatureStore((state) => state.generateUniqueName);

  // Check if a planar face is selected (use shapeData from useStore, same as Viewer3D)
  const selectedPlanarFace = (() => {
    if (selectedFaceIndices.size !== 1 || !shapeData) return null;
    const faceIndex = Array.from(selectedFaceIndices)[0];
    const face = shapeData.individualFaces.find(f => f.faceIndex === faceIndex);
    return face?.isPlanar ? face : null;
  })();

  // Get the currently editing sketch
  const editingSketch = editingSketchId
    ? features.find(f => f.id === editingSketchId) as SketchFeature | undefined
    : undefined;

  // Count extrudable elements in the current sketch (standalone shapes + closed profiles)
  const standaloneExtrudableCount = editingSketch
    ? editingSketch.elements.filter(e => e.type === 'rectangle' || e.type === 'circle').length
    : 0;
  const closedProfileCount = editingSketch?.closedProfiles?.length ?? 0;
  const extrudableElementCount = standaloneExtrudableCount + closedProfileCount;

  const featureButtonStyle = (color: string = '#89b4fa') => ({
    padding: '8px 14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600 as const,
    fontSize: '13px',
    transition: 'all 0.15s ease',
    backgroundColor: color,
    color: '#1e1e2e',
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
  });

  const disabledButtonStyle = () => ({
    ...featureButtonStyle('#45475a'),
    cursor: 'not-allowed' as const,
    opacity: 0.5,
    color: '#6c7086',
  });

  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return;
    e.currentTarget.style.filter = 'brightness(1.15)';
    e.currentTarget.style.transform = 'translateY(-1px)';
    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
  };
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.filter = '';
    e.currentTarget.style.transform = '';
    e.currentTarget.style.boxShadow = '';
  };
  const activeIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return;
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.filter = 'brightness(0.95)';
  };

  // Feature handlers
  const handleNewSketch = () => {
    setShowPlanePicker(true);
  };

  const handlePlaneSelected = (plane: StandardPlane) => {
    setShowPlanePicker(false);
    setPlaneOffset(0);
    const sketchFeatureData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: { type: 'standard', plane, offset: planeOffset },
      elements: [],
      isClosed: false,
      isCollapsed: false,
      constraints: [],
    };
    const sketchId = addFeature(sketchFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    startEditingSketch(sketchId);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleSketchOnFace = () => {
    if (!selectedPlanarFace) return;

    // Get face boundary from shape data
    const faceIndex = selectedPlanarFace.faceIndex;
    const boundaryPoints = selectedPlanarFace.boundaryPoints2D || [];

    // Find the last 3D-generating feature (extrusion or cut) to reference
    const solidFeatures = features.filter(f => isSolidFeature(f.type));
    const lastSolidFeature = solidFeatures[solidFeatures.length - 1] as Feature | undefined;

    if (!lastSolidFeature) {
      console.warn('Cannot sketch on face: No solid features (extrusion/cut) found. Create an extrusion first.');
      return;
    }

    const sketchFeatureData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: {
        type: 'face',
        parentFeatureId: lastSolidFeature.id,
        faceIndex,
        boundaryPoints,
      },
      elements: [],
      isClosed: false,
      isCollapsed: false,
      constraints: [],
    };
    const sketchId = addFeature(sketchFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    startEditingSketch(sketchId);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleExtrude = () => {
    if (!editingSketchId || extrudableElementCount === 0) return;
    setPendingOperation('extrude');
    setShowDepthDialog(true);
  };

  const handleCut = () => {
    if (!editingSketchId || extrudableElementCount === 0) return;

    // Cut requires existing geometry
    if (!features.some(f => isSolidFeature(f.type))) {
      console.warn('Cannot cut: No existing geometry to cut from');
      return;
    }

    setPendingOperation('cut');
    setShowDepthDialog(true);
  };

  const handleDepthConfirm = (depth: number, direction: OperationDirection, throughAll: boolean) => {
    if (!editingSketchId || !pendingOperation) return;

    if (pendingOperation === 'extrude') {
      const hasExistingExtrusions = features.some(f => isSolidFeature(f.type));
      const extrusionFeatureData: Omit<ExtrusionFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
        type: 'extrusion',
        name: generateUniqueName('extrusion'),
        sketchId: editingSketchId,
        depth,
        direction: direction === 'both' ? 'normal' : direction,
        operation: hasExistingExtrusions ? 'fuse' : 'new',
        isCollapsed: false,
      };
      addFeature(extrusionFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    } else if (pendingOperation === 'cut') {
      const cutFeatureData: Omit<CutFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
        type: 'cut',
        name: generateUniqueName('cut'),
        sketchId: editingSketchId,
        depth: throughAll ? 'through' : depth,
        direction,
        isCollapsed: false,
      };
      addFeature(cutFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    }

    setShowDepthDialog(false);
    setPendingOperation(null);
    stopEditingSketch();
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleDepthCancel = () => {
    setShowDepthDialog(false);
    setPendingOperation(null);
  };

  // Find the last solid feature (extrusion or cut) for bevel operations
  const getLastSolidFeatureId = (): string | null => {
    const solidFeatures = features.filter(f => isSolidFeature(f.type));
    return solidFeatures.length > 0 ? solidFeatures[solidFeatures.length - 1].id : null;
  };

  const handleFillet = () => {
    if (!shapeData) return;
    setPendingBevelType('fillet');
    setShowBevelDialog(true);
  };

  const handleChamfer = () => {
    if (!shapeData) return;
    setPendingBevelType('chamfer');
    setShowBevelDialog(true);
  };

  const handleBevelConfirm = (value: number, allEdges: boolean) => {
    if (!pendingBevelType) return;

    const targetFeatureId = getLastSolidFeatureId();
    if (!targetFeatureId) {
      console.warn('Cannot add bevel: No solid features found');
      return;
    }

    const edgeIndices = allEdges ? [] : Array.from(selectedEdgeIndices);

    if (pendingBevelType === 'fillet') {
      const filletFeatureData: Omit<FilletFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
        type: 'fillet',
        name: generateUniqueName('fillet'),
        targetFeatureId,
        edgeIndices,
        allEdges,
        radius: value,
        isCollapsed: false,
      };
      addFeature(filletFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    } else {
      const chamferFeatureData: Omit<ChamferFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
        type: 'chamfer',
        name: generateUniqueName('chamfer'),
        targetFeatureId,
        edgeIndices,
        allEdges,
        distance: value,
        isCollapsed: false,
      };
      addFeature(chamferFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    }

    setShowBevelDialog(false);
    setPendingBevelType(null);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleBevelCancel = () => {
    setShowBevelDialog(false);
    setPendingBevelType(null);
  };

  const handleFinishSketch = () => {
    stopEditingSketch();
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const hasSolidGeometry = features.some(f => isSolidFeature(f.type));

  const lastSolidFeature = (() => {
    const solidFeatures = features.filter(f => isSolidFeature(f.type));
    return solidFeatures[solidFeatures.length - 1];
  })();

  const handleShell = () => {
    if (!lastSolidFeature) return;

    const faceIndices = Array.from(selectedFaceIndices);

    const shellFeatureData: Omit<ShellFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'shell',
      name: generateUniqueName('shell'),
      targetFeatureId: lastSolidFeature.id,
      thickness: 1,
      faceIndices,
      isCollapsed: false,
    };
    addFeature(shellFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  // Sweep handlers
  const handleSweep = () => {
    setShowSweepDialog(true);
  };

  const handleSweepConfirm = (profileSketchId: string, pathSketchId: string, operation: 'new' | 'fuse' | 'cut') => {
    const sweepFeatureData: Omit<SweepFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sweep',
      name: generateUniqueName('sweep'),
      profileSketchId,
      pathSketchId,
      operation,
      isCollapsed: false,
    };
    addFeature(sweepFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    setShowSweepDialog(false);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleSweepCancel = () => {
    setShowSweepDialog(false);
  };

  const handleLoft = () => {
    const sketches = features.filter(f => f.type === 'sketch');
    if (sketches.length < 2) return;
    const profileIds = sketches.slice(-2).map(s => s.id);
    addFeature({
      type: 'loft',
      name: generateUniqueName('loft'),
      profileSketchIds: profileIds,
      operation: 'new',
    } as any);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleLinearPattern = () => {
    const solidFeatures = features.filter(f => f.type !== 'sketch');
    if (solidFeatures.length === 0) return;
    const sourceId = solidFeatures[solidFeatures.length - 1].id;
    addFeature({
      type: 'linearPattern',
      name: generateUniqueName('linearPattern'),
      sourceFeatureId: sourceId,
      direction: [1, 0, 0],
      count: 3,
      spacing: 30,
    } as any);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handlePolarPattern = () => {
    const solidFeatures = features.filter(f => f.type !== 'sketch');
    if (solidFeatures.length === 0) return;
    const sourceId = solidFeatures[solidFeatures.length - 1].id;
    addFeature({
      type: 'polarPattern',
      name: generateUniqueName('polarPattern'),
      sourceFeatureId: sourceId,
      axis: [0, 0, 1],
      axisOrigin: [0, 0, 0],
      count: 6,
      totalAngle: 360,
    } as any);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  // Check if sweep is available (need at least one sketch with a closed profile and one with an open path)
  const hasSketchWithClosedProfile = features.some((f) => {
    if (f.type !== 'sketch') return false;
    const s = f as SketchFeature;
    // Standalone closed shapes (rectangle, circle) or chained closed profiles
    const hasStandalone = s.elements.some(e => e.type === 'rectangle' || e.type === 'circle');
    const hasChainedProfiles = (s.closedProfiles?.length ?? 0) > 0;
    return hasStandalone || hasChainedProfiles;
  });
  const hasSketchWithOpenPath = features.some(
    (f) => f.type === 'sketch' && ((f as SketchFeature).openPaths?.length ?? 0) > 0
  );
  const hasSweepEligibleSketches = hasSketchWithClosedProfile && hasSketchWithOpenPath;

  const handleExportSTL = () => {
    if (!shapeData) return;
    exportToSTL(shapeData, 'model.stl');
    showToast('Exported model.stl', 'success');
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  // Mobile tools drawer
  const renderMobileToolsDrawer = () => (
    <div className={`toolbar-tools-drawer ${toolsOpen ? 'mobile-open' : ''}`}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <span style={{ fontWeight: 500, fontSize: '16px' }}>Tools</span>
        <button
          onClick={() => setToolsOpen?.(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#cdd6f4',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
        >
          X
        </button>
      </div>

      {/* Feature Tools */}
      <div className="tool-section">
        <span className="section-label">Features</span>
        <button
          style={featureButtonStyle('#a6e3a1')}
          onClick={handleNewSketch}
          title="Create a new sketch on XY plane (S)"
        >
          + New Sketch
        </button>
        {selectedPlanarFace && (
          <button
            style={featureButtonStyle('#f9e2af')}
            onClick={handleSketchOnFace}
            title="Create a sketch on the selected face"
          >
            Sketch on Face
          </button>
        )}
        {!editingSketchId && hasSolidGeometry && (
          <button
            style={featureButtonStyle('#cba6f7')}
            onClick={handleShell}
            title="Shell the solid (hollow out with selected faces removed)"
          >
            Shell
          </button>
        )}
        {!editingSketchId && hasSweepEligibleSketches && (
          <button
            style={featureButtonStyle('#94e2d5')}
            onClick={handleSweep}
            title="Sweep a profile along a path"
          >
            Sweep
          </button>
        )}
        {!editingSketchId && features.filter(f => f.type === 'sketch').length >= 2 && (
          <button
            style={featureButtonStyle('#f5c2e7')}
            onClick={handleLoft}
            title="Create loft between sketches"
          >
            Loft
          </button>
        )}
        {!editingSketchId && hasSolidGeometry && (
          <>
            <button
              style={featureButtonStyle('#89dceb')}
              onClick={handleLinearPattern}
              title="Create linear pattern"
            >
              Lin. Pattern
            </button>
            <button
              style={featureButtonStyle('#f9e2af')}
              onClick={handlePolarPattern}
              title="Create polar pattern"
            >
              Polar Pattern
            </button>
          </>
        )}
        {editingSketchId && (
          <>
            <button
              style={extrudableElementCount > 0 ? featureButtonStyle('#89b4fa') : disabledButtonStyle()}
              onClick={handleExtrude}
              disabled={extrudableElementCount === 0}
              title="Extrude the current sketch (E)"
            >
              Extrude
            </button>
            <button
              style={extrudableElementCount > 0 && features.some(f => isSolidFeature(f.type))
                ? featureButtonStyle('#f38ba8')
                : disabledButtonStyle()}
              onClick={handleCut}
              disabled={extrudableElementCount === 0 || !features.some(f => isSolidFeature(f.type))}
              title="Cut using the current sketch (X)"
            >
              Cut
            </button>
            <button
              style={{
                ...featureButtonStyle('#6c7086'),
                backgroundColor: '#313244',
                color: '#cdd6f4',
              }}
              onClick={handleFinishSketch}
              title="Finish editing without creating a feature (Esc)"
            >
              Finish Sketch
            </button>

            {/* Undo/Redo buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                style={{
                  ...undoRedoButtonStyle(canSketchUndo()),
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={sketchUndo}
                disabled={!canSketchUndo()}
                title="Undo (Cmd/Ctrl+Z)"
              >
                ↩ Undo
              </button>
              <button
                style={{
                  ...undoRedoButtonStyle(canSketchRedo()),
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={sketchRedo}
                disabled={!canSketchRedo()}
                title="Redo (Cmd/Ctrl+Shift+Z)"
              >
                ↪ Redo
              </button>
            </div>
          </>
        )}

        {/* Bevel tools (only show when not editing sketch and shape exists) */}
        {!editingSketchId && shapeData && (
          <>
            <button
              style={featureButtonStyle('#cba6f7')}
              onClick={handleFillet}
              title="Add fillet (rounded edges)"
            >
              Fillet
            </button>
            <button
              style={featureButtonStyle('#fab387')}
              onClick={handleChamfer}
              title="Add chamfer (angled edges)"
            >
              Chamfer
            </button>
          </>
        )}
      </div>

      {/* Export Section */}
      <div className="tool-section">
        <span className="section-label">Export</span>
        <button
          style={shapeData ? featureButtonStyle('#94e2d5') : disabledButtonStyle()}
          onClick={handleExportSTL}
          disabled={!shapeData}
          title="Export model as STL file"
        >
          Export STL
        </button>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #313244' }}>
        <span style={{ color: '#6c7086', fontSize: '12px' }}>
          {features.length} feature{features.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  // Keyboard shortcut badge
  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <span style={{
      fontSize: '10px',
      padding: '1px 5px',
      borderRadius: 3,
      backgroundColor: 'rgba(0,0,0,0.25)',
      color: 'inherit',
      fontWeight: 700,
      letterSpacing: '0.5px',
      marginLeft: 2,
    }}>
      {children}
    </span>
  );

  // Desktop toolbar
  const renderDesktopToolbar = () => (
    <div className="toolbar-desktop" style={{ display: 'flex', gap: '10px', flex: 1, alignItems: 'center' }}>
      {/* Feature Buttons */}
      <button
        style={featureButtonStyle('#a6e3a1')}
        onClick={handleNewSketch}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={activeIn}
        title="Create a new sketch on XY plane (S)"
      >
        + Sketch <Kbd>S</Kbd>
      </button>

      {selectedPlanarFace && !editingSketchId && (
        <button
          style={featureButtonStyle('#f9e2af')}
          onClick={handleSketchOnFace}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onMouseDown={activeIn}
          title="Create a sketch on the selected face"
        >
          Sketch on Face
        </button>
      )}

      {!editingSketchId && hasSolidGeometry && (
        <button
          style={featureButtonStyle('#cba6f7')}
          onClick={handleShell}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onMouseDown={activeIn}
          title="Shell the solid (hollow out with selected faces removed)"
        >
          Shell
        </button>
      )}

      {!editingSketchId && hasSweepEligibleSketches && (
        <button
          style={featureButtonStyle('#94e2d5')}
          onClick={handleSweep}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onMouseDown={activeIn}
          title="Sweep a profile along a path"
        >
          Sweep
        </button>
      )}

      {!editingSketchId && features.filter(f => f.type === 'sketch').length >= 2 && (
        <button
          style={featureButtonStyle('#f5c2e7')}
          onClick={handleLoft}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onMouseDown={activeIn}
          title="Create loft between sketches"
        >
          Loft
        </button>
      )}

      {!editingSketchId && hasSolidGeometry && (
        <>
          <button
            style={featureButtonStyle('#89dceb')}
            onClick={handleLinearPattern}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            title="Create linear pattern"
          >
            Lin. Pattern
          </button>
          <button
            style={featureButtonStyle('#f9e2af')}
            onClick={handlePolarPattern}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            title="Create polar pattern"
          >
            Polar Pattern
          </button>
        </>
      )}

      {editingSketchId && (
        <>
          <button
            style={extrudableElementCount > 0 ? featureButtonStyle('#89b4fa') : disabledButtonStyle()}
            onClick={handleExtrude}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            disabled={extrudableElementCount === 0}
            title="Extrude the current sketch (E)"
          >
            Extrude <Kbd>E</Kbd>
          </button>
          <button
            style={extrudableElementCount > 0 && features.some(f => isSolidFeature(f.type))
              ? featureButtonStyle('#f38ba8')
              : disabledButtonStyle()}
            onClick={handleCut}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            disabled={extrudableElementCount === 0 || !features.some(f => isSolidFeature(f.type))}
            title="Cut using the current sketch (X)"
          >
            Cut <Kbd>X</Kbd>
          </button>
          <button
            style={{
              padding: '8px 12px',
              border: '1px solid #45475a',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
              backgroundColor: 'transparent',
              color: '#a6adc8',
              transition: 'all 0.15s ease',
            }}
            onClick={handleFinishSketch}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#313244'; e.currentTarget.style.color = '#cdd6f4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#a6adc8'; }}
            title="Finish editing without creating a feature (Esc)"
          >
            Finish <Kbd>Esc</Kbd>
          </button>

          {/* Undo/Redo buttons */}
          <div
            style={{
              width: '1px',
              height: '24px',
              backgroundColor: '#313244',
              marginLeft: '4px',
            }}
          />
          <button
            style={undoRedoButtonStyle(canSketchUndo())}
            onClick={sketchUndo}
            onMouseEnter={(e) => { if (canSketchUndo()) { e.currentTarget.style.backgroundColor = '#45475a'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            disabled={!canSketchUndo()}
            title="Undo (Cmd/Ctrl+Z)"
          >
            ↩
          </button>
          <button
            style={undoRedoButtonStyle(canSketchRedo())}
            onClick={sketchRedo}
            onMouseEnter={(e) => { if (canSketchRedo()) { e.currentTarget.style.backgroundColor = '#45475a'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            disabled={!canSketchRedo()}
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            ↪
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Bevel tools (only show when not editing sketch and shape exists) */}
      {!editingSketchId && shapeData && (
        <>
          <button
            style={featureButtonStyle('#cba6f7')}
            onClick={handleFillet}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            title="Add fillet (rounded edges)"
          >
            Fillet
          </button>
          <button
            style={featureButtonStyle('#fab387')}
            onClick={handleChamfer}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={activeIn}
            title="Add chamfer (angled edges)"
          >
            Chamfer
          </button>
        </>
      )}

      {/* Export */}
      <button
        style={shapeData ? featureButtonStyle('#94e2d5') : disabledButtonStyle()}
        onClick={handleExportSTL}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={activeIn}
        disabled={!shapeData}
        title="Export model as STL file"
      >
        Export STL
      </button>

      {/* Status */}
      <span style={{ color: '#6c7086', fontSize: '12px' }}>
        {features.length} feature{features.length !== 1 ? 's' : ''}
        {editingSketchId && editingSketch && (
          <span style={{
            marginLeft: '8px',
            color: '#a6e3a1',
            padding: '2px 8px',
            backgroundColor: 'rgba(166, 227, 161, 0.12)',
            borderRadius: '4px',
            fontSize: '12px',
          }}>
            Editing: {editingSketch.name}
          </span>
        )}
      </span>
    </div>
  );

  // Mobile toolbar
  const renderMobileToolbar = () => (
    <div className="toolbar-mobile" style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
      <button
        className="mobile-menu-btn"
        onClick={() => setToolsOpen?.(!toolsOpen)}
        style={{
          padding: '8px 12px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: toolsOpen ? '#89b4fa' : '#313244',
          color: toolsOpen ? '#1e1e2e' : '#cdd6f4',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        = Menu
      </button>

      {/* Editing indicator */}
      {editingSketchId && editingSketch && (
        <div style={{
          padding: '6px 10px',
          backgroundColor: '#313244',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#a6e3a1',
        }}>
          {editingSketch.name}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Count (compact) */}
      <span style={{ color: '#6c7086', fontSize: '11px' }}>
        {features.length} feat
      </span>
    </div>
  );

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          backgroundColor: '#181825',
          borderBottom: '1px solid #313244',
          flexWrap: 'wrap',
        }}
      >
        {isMobile ? renderMobileToolbar() : renderDesktopToolbar()}
      </div>
      {isMobile && renderMobileToolsDrawer()}

      {/* Depth prompt dialog */}
      <DepthPromptDialog
        isOpen={showDepthDialog}
        operationType={pendingOperation || 'extrude'}
        onConfirm={handleDepthConfirm}
        onCancel={handleDepthCancel}
      />

      {/* Bevel dialog */}
      <BevelDialog
        isOpen={showBevelDialog}
        bevelType={pendingBevelType || 'fillet'}
        selectedEdgeCount={selectedEdgeIndices.size}
        onConfirm={handleBevelConfirm}
        onCancel={handleBevelCancel}
      />

      {/* Sweep dialog */}
      <SweepDialog
        isOpen={showSweepDialog}
        onConfirm={handleSweepConfirm}
        onCancel={handleSweepCancel}
      />

      {/* Plane picker dialog */}
      {showPlanePicker && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => { setShowPlanePicker(false); setPlaneOffset(0); }}
        >
          <div
            style={{
              backgroundColor: '#1e1e2e',
              border: '1px solid #45475a',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '280px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              animation: 'dialog-in 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#cdd6f4', marginBottom: '16px' }}>
              Select Sketch Plane
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['XY', 'XZ', 'YZ'] as StandardPlane[]).map((plane) => {
                const planeColors: Record<string, string> = { XY: '#a6e3a1', XZ: '#89b4fa', YZ: '#cba6f7' };
                const color = planeColors[plane] || '#cdd6f4';
                return (
                  <button
                    key={plane}
                    onClick={() => handlePlaneSelected(plane)}
                    style={{
                      flex: 1,
                      padding: '14px 20px',
                      border: `1px solid ${color}40`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '15px',
                      backgroundColor: `${color}15`,
                      color,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${color}30`;
                      e.currentTarget.style.borderColor = color;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${color}20`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${color}15`;
                      e.currentTarget.style.borderColor = `${color}40`;
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    {plane}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: '16px' }}>
              <label style={{ fontSize: '12px', color: '#a6adc8', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                Offset from plane
              </label>
              <input
                type="number"
                value={planeOffset}
                onChange={(e) => setPlaneOffset(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#181825',
                  border: '1px solid #45475a',
                  borderRadius: '6px',
                  color: '#cdd6f4',
                  fontSize: '14px',
                  boxSizing: 'border-box' as const,
                  outline: 'none',
                }}
                step="1"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
