import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import type { StandardPlane, SketchTool, SketchFeature, ExtrusionFeature, CutFeature, Feature } from '../types';

interface ToolbarProps {
  isMobile?: boolean;
  toolsOpen?: boolean;
  setToolsOpen?: (open: boolean) => void;
  useFeatureMode?: boolean;
}

export function Toolbar({ isMobile = false, toolsOpen = false, setToolsOpen, useFeatureMode = false }: ToolbarProps) {
  // Legacy store
  const currentTool = useStore((state) => state.currentTool);
  const setCurrentTool = useStore((state) => state.setCurrentTool);
  const elements = useStore((state) => state.elements);
  const shapeData = useStore((state) => state.shapeData);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const setSketchPlane = useStore((state) => state.setSketchPlane);
  const sketchOnFace = useStore((state) => state.sketchOnFace);
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);

  // Feature store
  const features = useFeatureStore((state) => state.features);
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const addFeature = useFeatureStore((state) => state.addFeature);
  const startEditingSketch = useFeatureStore((state) => state.startEditingSketch);
  const stopEditingSketch = useFeatureStore((state) => state.stopEditingSketch);
  const generateUniqueName = useFeatureStore((state) => state.generateUniqueName);
  const finalShape = useFeatureStore((state) => state.finalShape);

  const isStandardPlane = typeof sketchPlane === 'string';
  const currentStandardPlane = isStandardPlane ? sketchPlane : null;

  // Check if a planar face is selected (for feature mode)
  const selectedPlanarFace = (() => {
    const dataToUse = useFeatureMode ? finalShape : shapeData;
    if (selectedFaceIndices.size !== 1 || !dataToUse) return null;
    const faceIndex = Array.from(selectedFaceIndices)[0];
    const face = dataToUse.individualFaces.find(f => f.faceIndex === faceIndex);
    return face?.isPlanar ? face : null;
  })();

  // Get the currently editing sketch (for feature mode)
  const editingSketch = editingSketchId
    ? features.find(f => f.id === editingSketchId) as SketchFeature | undefined
    : undefined;

  // Count extrudable elements in the current sketch (feature mode)
  const extrudableElementCount = editingSketch
    ? editingSketch.elements.filter(e => e.type === 'rectangle' || e.type === 'circle').length
    : 0;

  const buttonStyle = (isActive: boolean) => ({
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500 as const,
    fontSize: '13px',
    transition: 'all 0.2s',
    backgroundColor: isActive ? '#89b4fa' : '#313244',
    color: isActive ? '#1e1e2e' : '#cdd6f4',
  });

  const smallButtonStyle = (isActive: boolean) => ({
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500 as const,
    fontSize: '12px',
    transition: 'all 0.2s',
    backgroundColor: isActive ? '#a6e3a1' : '#313244',
    color: isActive ? '#1e1e2e' : '#cdd6f4',
  });

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

  // Tool definitions with icons and labels
  const tools: { tool: SketchTool; icon: string; label: string; title: string }[] = [
    { tool: 'select', icon: '?', label: 'Select', title: 'Select Tool (V)' },
    { tool: 'rectangle', icon: '?', label: 'Rect', title: 'Rectangle Tool (R)' },
    { tool: 'circle', icon: '?', label: 'Circle', title: 'Circle Tool (C)' },
    { tool: 'line', icon: '/', label: 'Line', title: 'Line Tool (L)' },
    { tool: 'hline', icon: '-', label: 'H-Line', title: 'Horizontal Line Tool (H)' },
    { tool: 'vline', icon: '|', label: 'V-Line', title: 'Vertical Line Tool (Shift+V)' },
    { tool: 'arc', icon: '(', label: 'Arc', title: 'Arc Tool (A)' },
    { tool: 'spline', icon: '~', label: 'Spline', title: 'Spline Tool (S)' },
  ];

  // Count elements by type
  const elementCounts = elements.reduce((acc, el) => {
    acc[el.type] = (acc[el.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalElements = elements.length;

  const handleToolSelect = (tool: SketchTool) => {
    setCurrentTool(tool);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  // Feature mode handlers
  const handleNewSketch = () => {
    const sketchFeatureData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: { type: 'standard', plane: 'XY', offset: 0 },
      elements: [],
      isClosed: false,
      isCollapsed: false,
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

    // Find the last extrusion feature to reference
    const extrusionFeatures = features.filter(f => f.type === 'extrusion');
    const lastExtrusion = extrusionFeatures[extrusionFeatures.length - 1] as ExtrusionFeature | undefined;

    if (!lastExtrusion) {
      console.warn('Cannot sketch on face: No extrusion features found');
      return;
    }

    const sketchFeatureData: Omit<SketchFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'sketch',
      name: generateUniqueName('sketch'),
      reference: {
        type: 'face',
        parentFeatureId: lastExtrusion.id,
        faceIndex,
        boundaryPoints,
      },
      elements: [],
      isClosed: false,
      isCollapsed: false,
    };
    const sketchId = addFeature(sketchFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);
    startEditingSketch(sketchId);
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleExtrude = () => {
    if (!editingSketchId || extrudableElementCount === 0) return;

    // Determine if this is the first solid or should fuse with existing
    const hasExistingExtrusions = features.some(f => f.type === 'extrusion');

    const extrusionFeatureData: Omit<ExtrusionFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'extrusion',
      name: generateUniqueName('extrusion'),
      sketchId: editingSketchId,
      depth: 10, // Default depth
      direction: 'normal',
      operation: hasExistingExtrusions ? 'fuse' : 'new',
      isCollapsed: false,
    };
    addFeature(extrusionFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);

    stopEditingSketch();
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleCut = () => {
    if (!editingSketchId || extrudableElementCount === 0) return;

    // Cut requires existing geometry
    const hasExistingExtrusions = features.some(f => f.type === 'extrusion');
    if (!hasExistingExtrusions) {
      console.warn('Cannot cut: No existing geometry to cut from');
      return;
    }

    const cutFeatureData: Omit<CutFeature, 'id' | 'createdAt' | 'isValid' | 'isDirty'> = {
      type: 'cut',
      name: generateUniqueName('cut'),
      sketchId: editingSketchId,
      depth: 10, // Default depth
      direction: 'normal',
      isCollapsed: false,
    };
    addFeature(cutFeatureData as Omit<Feature, 'id' | 'createdAt' | 'isValid' | 'isDirty'>);

    stopEditingSketch();
    if (isMobile && setToolsOpen) {
      setToolsOpen(false);
    }
  };

  const handleFinishSketch = () => {
    stopEditingSketch();
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

      {/* Feature Mode Tools */}
      {useFeatureMode && (
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
            </>
          )}
        </div>
      )}

      <div className="tool-section">
        <span className="section-label">Drawing Tools</span>
        {tools.map(({ tool, icon, label, title }) => (
          <button
            key={tool}
            style={{
              ...buttonStyle(currentTool === tool),
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onClick={() => handleToolSelect(tool)}
            title={title}
          >
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {!useFeatureMode && (
        <div className="tool-section">
          <span className="section-label">Sketch Plane</span>
          {(['XY', 'XZ', 'YZ'] as StandardPlane[]).map((plane) => (
            <button
              key={plane}
              style={smallButtonStyle(currentStandardPlane === plane)}
              onClick={() => setSketchPlane(plane)}
              title={`Sketch on ${plane} plane`}
            >
              {plane} Plane
            </button>
          ))}
          {!isStandardPlane && (
            <span style={{ color: '#f9e2af', fontSize: '12px', fontStyle: 'italic', padding: '8px' }}>
              Currently: Face {(sketchPlane as { faceIndex: number }).faceIndex}
            </span>
          )}
        </div>
      )}

      {!useFeatureMode && shapeData && selectedPlanarFace && (
        <div className="tool-section">
          <span className="section-label">3D Selection</span>
          <button
            style={{
              padding: '12px 16px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '12px',
              backgroundColor: '#f9e2af',
              color: '#1e1e2e',
            }}
            onClick={() => sketchOnFace(selectedPlanarFace.faceIndex)}
            title="Sketch on selected face"
          >
            Sketch on Face
          </button>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #313244' }}>
        <span style={{ color: '#6c7086', fontSize: '12px' }}>
          {useFeatureMode
            ? `${features.length} feature${features.length !== 1 ? 's' : ''}`
            : `${totalElements} element${totalElements !== 1 ? 's' : ''}`
          }
        </span>
      </div>
    </div>
  );

  // Desktop toolbar
  const renderDesktopToolbar = () => (
    <div className="toolbar-desktop" style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
      {/* Feature Mode Buttons */}
      {useFeatureMode && (
        <>
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
            </>
          )}

          <div
            style={{
              width: '1px',
              height: '24px',
              backgroundColor: '#313244',
            }}
          />
        </>
      )}

      {/* Drawing Tools */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {tools.map(({ tool, icon, label, title }) => (
          <button
            key={tool}
            style={buttonStyle(currentTool === tool)}
            onClick={() => setCurrentTool(tool)}
            title={title}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {!useFeatureMode && (
        <>
          <div
            style={{
              width: '1px',
              height: '24px',
              backgroundColor: '#313244',
            }}
          />

          {/* Plane Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ color: '#a6adc8', fontSize: '13px' }}>
              Plane:
            </label>
            {(['XY', 'XZ', 'YZ'] as StandardPlane[]).map((plane) => (
              <button
                key={plane}
                style={smallButtonStyle(currentStandardPlane === plane)}
                onClick={() => setSketchPlane(plane)}
                title={`Sketch on ${plane} plane`}
              >
                {plane}
              </button>
            ))}
            {!isStandardPlane && (
              <span style={{ color: '#f9e2af', fontSize: '12px', fontStyle: 'italic' }}>
                Face {(sketchPlane as { faceIndex: number }).faceIndex}
              </span>
            )}
          </div>

          {/* Sketch on Face button (only show when planar face is selected) */}
          {shapeData && selectedPlanarFace && (
            <>
              <div
                style={{
                  width: '1px',
                  height: '24px',
                  backgroundColor: '#313244',
                }}
              />

              <button
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '12px',
                  backgroundColor: '#f9e2af',
                  color: '#1e1e2e',
                }}
                onClick={() => sketchOnFace(selectedPlanarFace.faceIndex)}
                title="Sketch on selected face"
              >
                Sketch on Face
              </button>
            </>
          )}
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Status */}
      <span style={{ color: '#6c7086', fontSize: '12px' }}>
        {useFeatureMode ? (
          <>
            {features.length} feature{features.length !== 1 ? 's' : ''}
            {editingSketchId && editingSketch && (
              <span style={{ marginLeft: '8px', color: '#a6e3a1' }}>
                (Editing: {editingSketch.name})
              </span>
            )}
          </>
        ) : (
          <>
            {totalElements} element{totalElements !== 1 ? 's' : ''}
            {totalElements > 0 && (
              <span style={{ marginLeft: '4px' }}>
                ({Object.entries(elementCounts)
                  .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
                  .join(', ')})
              </span>
            )}
          </>
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
        = Tools
      </button>

      {/* Current tool indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        backgroundColor: '#313244',
        borderRadius: '6px',
        fontSize: '13px',
      }}>
        <span style={{ color: '#89b4fa' }}>
          {tools.find(t => t.tool === currentTool)?.icon}
        </span>
        <span style={{ color: '#cdd6f4' }}>
          {tools.find(t => t.tool === currentTool)?.label}
        </span>
      </div>

      {/* Feature mode: editing indicator */}
      {useFeatureMode && editingSketchId && editingSketch && (
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

      {/* Legacy mode: Quick plane indicator */}
      {!useFeatureMode && (
        <div style={{
          padding: '6px 10px',
          backgroundColor: '#313244',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#a6e3a1',
        }}>
          {isStandardPlane ? currentStandardPlane : `Face ${(sketchPlane as { faceIndex: number }).faceIndex}`}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Count (compact) */}
      <span style={{ color: '#6c7086', fontSize: '11px' }}>
        {useFeatureMode
          ? `${features.length} feat`
          : `${totalElements} elem`
        }
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
    </>
  );
}
