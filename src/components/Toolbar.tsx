import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import type { SketchFeature, ExtrusionFeature, CutFeature, Feature } from '../types';
import { exportToSTL } from '../utils/stlExporter';
import { DepthPromptDialog, type OperationDirection } from './DepthPromptDialog';

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
  const shapeData = useStore((state) => state.shapeData);

  // Depth prompt dialog state
  const [showDepthDialog, setShowDepthDialog] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<'extrude' | 'cut' | null>(null);

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
    transition: 'all 0.2s',
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

  // Feature handlers
  const handleNewSketch = () => {
    const sketchFeatureData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: { type: 'standard', plane: 'XY', offset: 0 },
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
    const solidFeatures = features.filter(f => f.type === 'extrusion' || f.type === 'cut');
    const lastSolidFeature = solidFeatures[solidFeatures.length - 1] as ExtrusionFeature | CutFeature | undefined;

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
    const hasExistingExtrusions = features.some(f => f.type === 'extrusion');
    if (!hasExistingExtrusions) {
      console.warn('Cannot cut: No existing geometry to cut from');
      return;
    }

    setPendingOperation('cut');
    setShowDepthDialog(true);
  };

  const handleDepthConfirm = (depth: number, direction: OperationDirection, throughAll: boolean) => {
    if (!editingSketchId || !pendingOperation) return;

    if (pendingOperation === 'extrude') {
      const hasExistingExtrusions = features.some(f => f.type === 'extrusion');
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

  const handleFinishSketch = () => {
    stopEditingSketch();
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleExportSTL = () => {
    if (!shapeData) return;
    exportToSTL(shapeData, 'model.stl');
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
              style={extrudableElementCount > 0 && features.some(f => f.type === 'extrusion')
                ? featureButtonStyle('#f38ba8')
                : disabledButtonStyle()}
              onClick={handleCut}
              disabled={extrudableElementCount === 0 || !features.some(f => f.type === 'extrusion')}
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

  // Desktop toolbar
  const renderDesktopToolbar = () => (
    <div className="toolbar-desktop" style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
      {/* Feature Buttons */}
      <button
        style={featureButtonStyle('#a6e3a1')}
        onClick={handleNewSketch}
        title="Create a new sketch on XY plane (S)"
      >
        + Sketch
      </button>

      {selectedPlanarFace && !editingSketchId && (
        <button
          style={featureButtonStyle('#f9e2af')}
          onClick={handleSketchOnFace}
          title="Create a sketch on the selected face"
        >
          Sketch on Face
        </button>
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
            style={extrudableElementCount > 0 && features.some(f => f.type === 'extrusion')
              ? featureButtonStyle('#f38ba8')
              : disabledButtonStyle()}
            onClick={handleCut}
            disabled={extrudableElementCount === 0 || !features.some(f => f.type === 'extrusion')}
            title="Cut using the current sketch (X)"
          >
            Cut
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
            }}
            onClick={handleFinishSketch}
            title="Finish editing without creating a feature (Esc)"
          >
            Finish
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
            disabled={!canSketchUndo()}
            title="Undo (Cmd/Ctrl+Z)"
          >
            ↩
          </button>
          <button
            style={undoRedoButtonStyle(canSketchRedo())}
            onClick={sketchRedo}
            disabled={!canSketchRedo()}
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            ↪
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Export */}
      <button
        style={shapeData ? featureButtonStyle('#94e2d5') : disabledButtonStyle()}
        onClick={handleExportSTL}
        disabled={!shapeData}
        title="Export model as STL file"
      >
        Export STL
      </button>

      {/* Status */}
      <span style={{ color: '#6c7086', fontSize: '12px' }}>
        {features.length} feature{features.length !== 1 ? 's' : ''}
        {editingSketchId && editingSketch && (
          <span style={{ marginLeft: '8px', color: '#a6e3a1' }}>
            (Editing: {editingSketch.name})
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
    </>
  );
}
