import { useStore } from '../store/useStore';

export function Toolbar() {
  const currentTool = useStore((state) => state.currentTool);
  const setCurrentTool = useStore((state) => state.setCurrentTool);
  const rectangles = useStore((state) => state.rectangles);
  const extrusionHeight = useStore((state) => state.extrusionHeight);
  const setExtrusionHeight = useStore((state) => state.setExtrusionHeight);
  const selectionMode = useStore((state) => state.selectionMode);
  const setSelectionMode = useStore((state) => state.setSelectionMode);
  const shapeData = useStore((state) => state.shapeData);

  const buttonStyle = (isActive: boolean) => ({
    padding: '8px 16px',
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 16px',
        backgroundColor: '#181825',
        borderBottom: '1px solid #313244',
      }}
    >
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          style={buttonStyle(currentTool === 'select')}
          onClick={() => setCurrentTool('select')}
          title="Select Tool (S)"
        >
          ↖ Select
        </button>
        <button
          style={buttonStyle(currentTool === 'rectangle')}
          onClick={() => setCurrentTool('rectangle')}
          title="Rectangle Tool (R)"
        >
          ▢ Rectangle
        </button>
      </div>

      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: '#313244',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ color: '#a6adc8', fontSize: '13px' }}>
          Extrusion Height:
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
            width: '60px',
            padding: '6px 8px',
            border: '1px solid #313244',
            borderRadius: '4px',
            backgroundColor: '#1e1e2e',
            color: '#cdd6f4',
            fontSize: '13px',
          }}
        />
      </div>

      {shapeData && (
        <>
          <div
            style={{
              width: '1px',
              height: '24px',
              backgroundColor: '#313244',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ color: '#a6adc8', fontSize: '13px' }}>
              3D Select:
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
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      <span style={{ color: '#6c7086', fontSize: '12px' }}>
        {rectangles.length} rectangle{rectangles.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
