import { useStore } from '../store/useStore';
import type { StandardPlane, SketchTool } from '../types';

interface ToolbarProps {
  isMobile?: boolean;
  toolsOpen?: boolean;
  setToolsOpen?: (open: boolean) => void;
}

export function Toolbar({ isMobile = false, toolsOpen = false, setToolsOpen }: ToolbarProps) {
  const currentTool = useStore((state) => state.currentTool);
  const setCurrentTool = useStore((state) => state.setCurrentTool);
  const elements = useStore((state) => state.elements);
  const selectionMode = useStore((state) => state.selectionMode);
  const setSelectionMode = useStore((state) => state.setSelectionMode);
  const shapeData = useStore((state) => state.shapeData);
  const sketchPlane = useStore((state) => state.sketchPlane);
  const setSketchPlane = useStore((state) => state.setSketchPlane);
  const sketchOnFace = useStore((state) => state.sketchOnFace);
  const selectedFaceIndices = useStore((state) => state.selectedFaceIndices);

  const isStandardPlane = typeof sketchPlane === 'string';
  const currentStandardPlane = isStandardPlane ? sketchPlane : null;

  // Check if a planar face is selected
  const selectedPlanarFace = (() => {
    if (selectedFaceIndices.size !== 1 || !shapeData) return null;
    const faceIndex = Array.from(selectedFaceIndices)[0];
    const face = shapeData.individualFaces.find(f => f.faceIndex === faceIndex);
    return face?.isPlanar ? face : null;
  })();

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

  // Tool definitions with icons and labels
  const tools: { tool: SketchTool; icon: string; label: string; title: string }[] = [
    { tool: 'select', icon: '↖', label: 'Select', title: 'Select Tool (V)' },
    { tool: 'rectangle', icon: '▢', label: 'Rect', title: 'Rectangle Tool (R)' },
    { tool: 'circle', icon: '○', label: 'Circle', title: 'Circle Tool (C)' },
    { tool: 'line', icon: '/', label: 'Line', title: 'Line Tool (L)' },
    { tool: 'hline', icon: '―', label: 'H-Line', title: 'Horizontal Line Tool (H)' },
    { tool: 'vline', icon: '|', label: 'V-Line', title: 'Vertical Line Tool (Shift+V)' },
    { tool: 'arc', icon: '⌒', label: 'Arc', title: 'Arc Tool (A)' },
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
          ✕
        </button>
      </div>

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

      {shapeData && (
        <div className="tool-section">
          <span className="section-label">3D Selection</span>
          <button
            style={smallButtonStyle(selectionMode === 'face')}
            onClick={() => setSelectionMode(selectionMode === 'face' ? 'none' : 'face')}
            title="Select Faces (F)"
          >
            Select Faces
          </button>
          <button
            style={smallButtonStyle(selectionMode === 'edge')}
            onClick={() => setSelectionMode(selectionMode === 'edge' ? 'none' : 'edge')}
            title="Select Edges (E)"
          >
            Select Edges
          </button>
          {selectedPlanarFace && (
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
          )}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #313244' }}>
        <span style={{ color: '#6c7086', fontSize: '12px' }}>
          {totalElements} element{totalElements !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  // Desktop toolbar
  const renderDesktopToolbar = () => (
    <div className="toolbar-desktop" style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
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

      {/* 3D Selection (only show when shape exists) */}
      {shapeData && (
        <>
          <div
            style={{
              width: '1px',
              height: '24px',
              backgroundColor: '#313244',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ color: '#a6adc8', fontSize: '13px' }}>
              3D:
            </label>
            <button
              style={smallButtonStyle(selectionMode === 'face')}
              onClick={() => setSelectionMode(selectionMode === 'face' ? 'none' : 'face')}
              title="Select Faces (F)"
            >
              Face
            </button>
            <button
              style={smallButtonStyle(selectionMode === 'edge')}
              onClick={() => setSelectionMode(selectionMode === 'edge' ? 'none' : 'edge')}
              title="Select Edges (E)"
            >
              Edge
            </button>
            {selectedPlanarFace && (
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
            )}
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Element Count */}
      <span style={{ color: '#6c7086', fontSize: '12px' }}>
        {totalElements} element{totalElements !== 1 ? 's' : ''}
        {totalElements > 0 && (
          <span style={{ marginLeft: '4px' }}>
            ({Object.entries(elementCounts)
              .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
              .join(', ')})
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
        ☰ Tools
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

      {/* Quick plane indicator */}
      <div style={{
        padding: '6px 10px',
        backgroundColor: '#313244',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#a6e3a1',
      }}>
        {isStandardPlane ? currentStandardPlane : `Face ${(sketchPlane as { faceIndex: number }).faceIndex}`}
      </div>

      <div style={{ flex: 1 }} />

      {/* Element count (compact) */}
      <span style={{ color: '#6c7086', fontSize: '11px' }}>
        {totalElements} elem
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
