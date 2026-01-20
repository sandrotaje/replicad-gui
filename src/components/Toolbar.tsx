import { useStore } from '../store/useStore';
import type { StandardPlane, SketchTool } from '../types';

export function Toolbar() {
  const currentTool = useStore((state) => state.currentTool);
  const setCurrentTool = useStore((state) => state.setCurrentTool);
  const elements = useStore((state) => state.elements);
  const extrusionHeight = useStore((state) => state.extrusionHeight);
  const setExtrusionHeight = useStore((state) => state.setExtrusionHeight);
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
    fontWeight: 500,
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
    fontWeight: 500,
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

  return (
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

      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: '#313244',
        }}
      />

      {/* Extrusion Height */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ color: '#a6adc8', fontSize: '13px' }}>
          Extrude:
        </label>
        <input
          type="number"
          value={extrusionHeight}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value > 0) {
              setExtrusionHeight(value);
            }
          }}
          style={{
            width: '50px',
            padding: '5px 8px',
            border: '1px solid #313244',
            borderRadius: '4px',
            backgroundColor: '#1e1e2e',
            color: '#cdd6f4',
            fontSize: '13px',
          }}
        />
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
}
