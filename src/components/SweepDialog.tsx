import React, { useState } from 'react';
import { useFeatureStore } from '../store/useFeatureStore';
import type { SketchFeature, SweepFeature } from '../types';

interface SweepDialogProps {
  isOpen: boolean;
  editFeature?: SweepFeature;
  onConfirm: (profileSketchId: string, pathSketchId: string, operation: 'new' | 'fuse' | 'cut') => void;
  onCancel: () => void;
}

export const SweepDialog: React.FC<SweepDialogProps> = ({
  isOpen,
  editFeature,
  onConfirm,
  onCancel,
}) => {
  const features = useFeatureStore((state) => state.features);

  const profileSketches = features.filter(
    (f): f is SketchFeature => {
      if (f.type !== 'sketch') return false;
      const s = f as SketchFeature;
      const hasStandalone = s.elements.some(e => e.type === 'rectangle' || e.type === 'circle');
      const hasChainedProfiles = (s.closedProfiles?.length ?? 0) > 0;
      return hasStandalone || hasChainedProfiles;
    }
  );

  const pathSketches = features.filter(
    (f): f is SketchFeature =>
      f.type === 'sketch' &&
      ((f as SketchFeature).openPaths?.length ?? 0) > 0
  );

  const [profileSketchId, setProfileSketchId] = useState(
    editFeature?.profileSketchId || profileSketches[0]?.id || ''
  );
  const [pathSketchId, setPathSketchId] = useState(
    editFeature?.pathSketchId || pathSketches[0]?.id || ''
  );
  const [operation, setOperation] = useState<'new' | 'fuse' | 'cut'>(
    editFeature?.operation || 'new'
  );

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!profileSketchId || !pathSketchId) return;
    onConfirm(profileSketchId, pathSketchId, operation);
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
    minWidth: '320px',
    maxWidth: '400px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  };

  const fieldStyle: React.CSSProperties = { marginBottom: '16px' };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: '#a6adc8',
    marginBottom: '6px',
    fontWeight: 500,
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    borderRadius: '4px',
    color: '#cdd6f4',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'pointer',
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

  const canConfirm = profileSketchId && pathSketchId && profileSketchId !== pathSketchId;

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Enter' && canConfirm) handleConfirm();
        if (e.key === 'Escape') onCancel();
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#cdd6f4',
          marginBottom: '16px',
        }}>
          {editFeature ? 'Edit Sweep' : 'Create Sweep'}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Profile Sketch (closed shape)</label>
          {profileSketches.length === 0 ? (
            <div style={{ color: '#f38ba8', fontSize: '12px' }}>
              No sketches with closed profiles found. Draw a closed shape first.
            </div>
          ) : (
            <select
              value={profileSketchId}
              onChange={(e) => setProfileSketchId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select profile sketch...</option>
              {profileSketches.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Path Sketch (open path)</label>
          {pathSketches.length === 0 ? (
            <div style={{ color: '#f38ba8', fontSize: '12px' }}>
              No sketches with open paths found. Draw an open path (line, arc, or spline) on a different plane.
            </div>
          ) : (
            <select
              value={pathSketchId}
              onChange={(e) => setPathSketchId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select path sketch...</option>
              {pathSketches.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
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

        {profileSketchId && pathSketchId && profileSketchId === pathSketchId && (
          <div style={{ color: '#f38ba8', fontSize: '12px', marginBottom: '12px' }}>
            Profile and path must be different sketches.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={buttonStyle(false)} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{
              ...buttonStyle(true),
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
            onClick={canConfirm ? handleConfirm : undefined}
          >
            {editFeature ? 'Save Changes' : 'Create Sweep'}
          </button>
        </div>
      </div>
    </div>
  );
};
