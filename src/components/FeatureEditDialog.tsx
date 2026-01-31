import React, { useState, useEffect } from 'react';
import type { ExtrusionFeature, CutFeature, ShellFeature, LoftFeature, LinearPatternFeature, PolarPatternFeature } from '../types';

type EditableFeature = ExtrusionFeature | CutFeature | ShellFeature | LoftFeature | LinearPatternFeature | PolarPatternFeature;

interface FeatureEditDialogProps {
  feature: EditableFeature;
  onSave: (updates: Partial<EditableFeature>) => void;
  onCancel: () => void;
}

export const FeatureEditDialog: React.FC<FeatureEditDialogProps> = ({
  feature,
  onSave,
  onCancel,
}) => {
  const [depthStr, setDepthStr] = useState<string>(
    feature.type === 'extrusion' || feature.type === 'cut' ? String(feature.depth) : '0'
  );
  const [direction, setDirection] = useState<'normal' | 'reverse' | 'both' | 'symmetric'>(
    (feature.type === 'extrusion' || feature.type === 'cut') ? feature.direction : 'normal'
  );
  const [operation, setOperation] = useState<'new' | 'fuse' | 'cut'>(
    feature.type === 'extrusion' ? feature.operation
      : feature.type === 'loft' ? feature.operation
      : 'cut'
  );
  const [thicknessStr, setThicknessStr] = useState<string>(
    feature.type === 'shell' ? String(feature.thickness) : '1'
  );

  // Linear pattern state
  const [linDirX, setLinDirX] = useState<string>(
    feature.type === 'linearPattern' ? String(feature.direction[0]) : '1'
  );
  const [linDirY, setLinDirY] = useState<string>(
    feature.type === 'linearPattern' ? String(feature.direction[1]) : '0'
  );
  const [linDirZ, setLinDirZ] = useState<string>(
    feature.type === 'linearPattern' ? String(feature.direction[2]) : '0'
  );
  const [linCount, setLinCount] = useState<string>(
    feature.type === 'linearPattern' ? String(feature.count) : '3'
  );
  const [linSpacing, setLinSpacing] = useState<string>(
    feature.type === 'linearPattern' ? String(feature.spacing) : '30'
  );

  // Polar pattern state
  const [polAxisX, setPolAxisX] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axis[0]) : '0'
  );
  const [polAxisY, setPolAxisY] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axis[1]) : '0'
  );
  const [polAxisZ, setPolAxisZ] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axis[2]) : '1'
  );
  const [polOriginX, setPolOriginX] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axisOrigin[0]) : '0'
  );
  const [polOriginY, setPolOriginY] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axisOrigin[1]) : '0'
  );
  const [polOriginZ, setPolOriginZ] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.axisOrigin[2]) : '0'
  );
  const [polCount, setPolCount] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.count) : '6'
  );
  const [polTotalAngle, setPolTotalAngle] = useState<string>(
    feature.type === 'polarPattern' ? String(feature.totalAngle) : '360'
  );

  // Reset form when feature changes
  useEffect(() => {
    if (feature.type === 'shell') {
      setThicknessStr(String(feature.thickness));
    } else if (feature.type === 'extrusion' || feature.type === 'cut') {
      setDepthStr(String(feature.depth));
      setDirection(feature.direction);
      if (feature.type === 'extrusion') {
        setOperation(feature.operation);
      }
    } else if (feature.type === 'loft') {
      setOperation(feature.operation);
    } else if (feature.type === 'linearPattern') {
      setLinDirX(String(feature.direction[0]));
      setLinDirY(String(feature.direction[1]));
      setLinDirZ(String(feature.direction[2]));
      setLinCount(String(feature.count));
      setLinSpacing(String(feature.spacing));
    } else if (feature.type === 'polarPattern') {
      setPolAxisX(String(feature.axis[0]));
      setPolAxisY(String(feature.axis[1]));
      setPolAxisZ(String(feature.axis[2]));
      setPolOriginX(String(feature.axisOrigin[0]));
      setPolOriginY(String(feature.axisOrigin[1]));
      setPolOriginZ(String(feature.axisOrigin[2]));
      setPolCount(String(feature.count));
      setPolTotalAngle(String(feature.totalAngle));
    }
  }, [feature]);

  const handleSave = () => {
    if (feature.type === 'shell') {
      const t = parseFloat(thicknessStr);
      if (isNaN(t) || t <= 0) return;
      onSave({ thickness: t } as Partial<ShellFeature>);
      return;
    }
    if (feature.type === 'loft') {
      onSave({ operation } as Partial<LoftFeature>);
      return;
    }
    if (feature.type === 'linearPattern') {
      const dx = parseFloat(linDirX) || 0;
      const dy = parseFloat(linDirY) || 0;
      const dz = parseFloat(linDirZ) || 0;
      const count = parseInt(linCount) || 2;
      const spacing = parseFloat(linSpacing) || 10;
      onSave({
        direction: [dx, dy, dz],
        count,
        spacing,
      } as Partial<LinearPatternFeature>);
      return;
    }
    if (feature.type === 'polarPattern') {
      const ax = parseFloat(polAxisX) || 0;
      const ay = parseFloat(polAxisY) || 0;
      const az = parseFloat(polAxisZ) || 1;
      const ox = parseFloat(polOriginX) || 0;
      const oy = parseFloat(polOriginY) || 0;
      const oz = parseFloat(polOriginZ) || 0;
      const count = parseInt(polCount) || 2;
      const totalAngle = parseFloat(polTotalAngle) || 360;
      onSave({
        axis: [ax, ay, az],
        axisOrigin: [ox, oy, oz],
        count,
        totalAngle,
      } as Partial<PolarPatternFeature>);
      return;
    }
    let depth: number | 'through';
    if (depthStr.toLowerCase() === 'through') {
      depth = 'through';
    } else {
      const d = parseFloat(depthStr);
      if (isNaN(d) || d <= 0) return;
      depth = d;
    }
    if (feature.type === 'extrusion') {
      const updates: Partial<ExtrusionFeature> = {
        depth: depth as number,
        direction: direction as ExtrusionFeature['direction'],
        operation,
      };
      onSave(updates);
    } else {
      const updates: Partial<CutFeature> = {
        depth,
        direction: direction as CutFeature['direction'],
      };
      onSave(updates);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '300px',
    maxWidth: '400px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  };

  const headerStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#cdd6f4',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '16px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: '#a6adc8',
    marginBottom: '6px',
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    borderRadius: '4px',
    color: '#cdd6f4',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  };

  const buttonStyle = (primary: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '13px',
    backgroundColor: primary ? '#89b4fa' : '#313244',
    color: primary ? '#1e1e2e' : '#cdd6f4',
    transition: 'opacity 0.2s',
  });

  const smallInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: '30%',
    display: 'inline-block',
    marginRight: '4px',
  };

  const getIcon = () => {
    switch (feature.type) {
      case 'extrusion': return '⬆️';
      case 'cut': return '✂️';
      case 'shell': return '🥚';
      case 'loft': return '🔀';
      case 'linearPattern': return '➡️';
      case 'polarPattern': return '🔄';
    }
  };

  const renderFields = () => {
    if (feature.type === 'shell') {
      return (
        <div style={fieldStyle}>
          <label style={labelStyle}>Wall Thickness</label>
          <input
            type="text"
            inputMode="numeric"
            value={thicknessStr}
            onChange={(e) => setThicknessStr(e.target.value)}
            style={inputStyle}
          />
        </div>
      );
    }

    if (feature.type === 'loft') {
      return (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Profile Sketches</label>
            <div style={{ color: '#6c7086', fontSize: '13px' }}>
              {feature.profileSketchIds.length} profiles selected
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Operation</label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as 'new' | 'fuse' | 'cut')}
              style={selectStyle}
            >
              <option value="new">New solid</option>
              <option value="fuse">Fuse with existing</option>
              <option value="cut">Cut from existing</option>
            </select>
          </div>
        </>
      );
    }

    if (feature.type === 'linearPattern') {
      return (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Direction (X, Y, Z)</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" value={linDirX} onChange={(e) => setLinDirX(e.target.value)} style={smallInputStyle} step="0.1" />
              <input type="number" value={linDirY} onChange={(e) => setLinDirY(e.target.value)} style={smallInputStyle} step="0.1" />
              <input type="number" value={linDirZ} onChange={(e) => setLinDirZ(e.target.value)} style={smallInputStyle} step="0.1" />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Count</label>
            <input type="number" value={linCount} onChange={(e) => setLinCount(e.target.value)} style={inputStyle} min="2" step="1" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Spacing</label>
            <input type="number" value={linSpacing} onChange={(e) => setLinSpacing(e.target.value)} style={inputStyle} step="1" />
          </div>
        </>
      );
    }

    if (feature.type === 'polarPattern') {
      return (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Axis (X, Y, Z)</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" value={polAxisX} onChange={(e) => setPolAxisX(e.target.value)} style={smallInputStyle} step="0.1" />
              <input type="number" value={polAxisY} onChange={(e) => setPolAxisY(e.target.value)} style={smallInputStyle} step="0.1" />
              <input type="number" value={polAxisZ} onChange={(e) => setPolAxisZ(e.target.value)} style={smallInputStyle} step="0.1" />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Axis Origin (X, Y, Z)</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input type="number" value={polOriginX} onChange={(e) => setPolOriginX(e.target.value)} style={smallInputStyle} step="1" />
              <input type="number" value={polOriginY} onChange={(e) => setPolOriginY(e.target.value)} style={smallInputStyle} step="1" />
              <input type="number" value={polOriginZ} onChange={(e) => setPolOriginZ(e.target.value)} style={smallInputStyle} step="1" />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Count</label>
            <input type="number" value={polCount} onChange={(e) => setPolCount(e.target.value)} style={inputStyle} min="2" step="1" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Total Angle (degrees)</label>
            <input type="number" value={polTotalAngle} onChange={(e) => setPolTotalAngle(e.target.value)} style={inputStyle} step="15" />
          </div>
        </>
      );
    }

    // Extrusion / Cut
    return (
      <>
        <div style={fieldStyle}>
          <label style={labelStyle}>
            Depth {feature.type === 'cut' && '(or "through")'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={depthStr}
            onChange={(e) => setDepthStr(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'normal' | 'reverse' | 'both' | 'symmetric')}
            style={selectStyle}
          >
            <option value="normal">Normal (forward)</option>
            <option value="reverse">Reverse (backward)</option>
            {feature.type === 'extrusion' && (
              <option value="symmetric">Symmetric (both ways)</option>
            )}
            {feature.type === 'cut' && (
              <option value="both">Both directions</option>
            )}
          </select>
        </div>

        {feature.type === 'extrusion' && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Operation</label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as 'new' | 'fuse' | 'cut')}
              style={selectStyle}
            >
              <option value="new">New solid</option>
              <option value="fuse">Fuse with existing</option>
              <option value="cut">Cut from existing</option>
            </select>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onCancel();
      }}>
        <div style={headerStyle}>
          <span>{getIcon()}</span>
          <span>Edit {feature.name}</span>
        </div>

        {renderFields()}

        {/* Buttons */}
        <div style={buttonContainerStyle}>
          <button
            style={buttonStyle(false)}
            onClick={onCancel}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Cancel
          </button>
          <button
            style={buttonStyle(true)}
            onClick={handleSave}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeatureEditDialog;
