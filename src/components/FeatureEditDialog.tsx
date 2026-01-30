import React, { useState, useEffect } from 'react';
import type { ExtrusionFeature, CutFeature, ShellFeature } from '../types';

type EditableFeature = ExtrusionFeature | CutFeature | ShellFeature;

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
    feature.type === 'shell' ? '0' : String(feature.depth)
  );
  const [direction, setDirection] = useState<'normal' | 'reverse' | 'both'>(
    feature.type === 'shell' ? 'normal' : feature.direction
  );
  const [operation, setOperation] = useState<'new' | 'fuse' | 'cut'>(
    feature.type === 'extrusion' ? feature.operation : 'cut'
  );
  const [thicknessStr, setThicknessStr] = useState<string>(
    feature.type === 'shell' ? String(feature.thickness) : '1'
  );

  // Reset form when feature changes
  useEffect(() => {
    if (feature.type === 'shell') {
      setThicknessStr(String(feature.thickness));
    } else {
      setDepthStr(String(feature.depth));
      setDirection(feature.direction);
      if (feature.type === 'extrusion') {
        setOperation(feature.operation);
      }
    }
  }, [feature]);

  const handleSave = () => {
    if (feature.type === 'shell') {
      const t = parseFloat(thicknessStr);
      if (isNaN(t) || t <= 0) return;
      onSave({ thickness: t } as Partial<ShellFeature>);
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
    const updates: Partial<ExtrusionFeature | CutFeature> = {
      depth,
      direction,
    };
    if (feature.type === 'extrusion') {
      (updates as Partial<ExtrusionFeature>).operation = operation;
    }
    onSave(updates);
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

  const getIcon = () => {
    switch (feature.type) {
      case 'extrusion': return '⬆️';
      case 'cut': return '✂️';
      case 'shell': return '🥚';
    }
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

        {feature.type === 'shell' ? (
          /* Shell-specific fields */
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
        ) : (
          <>
            {/* Depth */}
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

            {/* Direction */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'normal' | 'reverse' | 'both')}
                style={selectStyle}
              >
                <option value="normal">Normal (forward)</option>
                <option value="reverse">Reverse (backward)</option>
                {feature.type === 'cut' && (
                  <option value="both">Both directions</option>
                )}
              </select>
            </div>

            {/* Operation (extrusion only) */}
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
        )}

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
