import { useState, useEffect, useRef } from 'react';
import type { ChamferFeature, FilletFeature } from '../types';

type BevelFeature = ChamferFeature | FilletFeature;

interface BevelEditDialogProps {
  feature: BevelFeature;
  onSave: (updates: Partial<BevelFeature>) => void;
  onCancel: () => void;
}

export function BevelEditDialog({ feature, onSave, onCancel }: BevelEditDialogProps) {
  const isFillet = feature.type === 'fillet';
  const initialValue = isFillet ? (feature as FilletFeature).radius : (feature as ChamferFeature).distance;

  const [value, setValue] = useState(initialValue.toString());
  const [allEdges, setAllEdges] = useState(feature.allEdges ?? false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, allEdges]);

  const handleSave = () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return;
    }

    if (isFillet) {
      onSave({ radius: numValue, allEdges } as Partial<FilletFeature>);
    } else {
      onSave({ distance: numValue, allEdges } as Partial<ChamferFeature>);
    }
  };

  const title = isFillet ? 'Edit Fillet' : 'Edit Chamfer';
  const valueLabel = isFillet ? 'Radius' : 'Distance';
  const buttonColor = isFillet ? '#cba6f7' : '#fab387';
  const edgeCount = feature.edgeIndices.length;

  return (
    <div
      style={{
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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          backgroundColor: '#1e1e2e',
          borderRadius: '12px',
          border: '1px solid #45475a',
          padding: '24px',
          minWidth: '300px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <h3
          style={{
            margin: '0 0 20px 0',
            color: '#cdd6f4',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          {title}
        </h3>

        {/* Feature name */}
        <div
          style={{
            marginBottom: '16px',
            padding: '8px 12px',
            backgroundColor: '#313244',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#a6adc8',
          }}
        >
          {feature.name}
        </div>

        {/* Edge mode info */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#a6adc8',
              fontSize: '13px',
            }}
          >
            Applied to
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: edgeCount > 0 ? '#cdd6f4' : '#6c7086',
                fontSize: '14px',
                cursor: edgeCount > 0 ? 'pointer' : 'not-allowed',
                opacity: edgeCount > 0 ? 1 : 0.5,
              }}
            >
              <input
                type="radio"
                name="edgeSelection"
                checked={!allEdges}
                onChange={() => setAllEdges(false)}
                disabled={edgeCount === 0}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: buttonColor,
                  cursor: edgeCount > 0 ? 'pointer' : 'not-allowed',
                }}
              />
              Selected edges ({edgeCount} edge{edgeCount !== 1 ? 's' : ''})
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#cdd6f4',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="edgeSelection"
                checked={allEdges}
                onChange={() => setAllEdges(true)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: buttonColor,
                  cursor: 'pointer',
                }}
              />
              All edges
            </label>
          </div>
        </div>

        {/* Value input */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#a6adc8',
              fontSize: '13px',
            }}
          >
            {valueLabel}
          </label>
          <input
            ref={inputRef}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min="0.1"
            step="0.5"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #45475a',
              borderRadius: '6px',
              backgroundColor: '#181825',
              color: '#cdd6f4',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid #45475a',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: '#a6adc8',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: buttonColor,
              color: '#1e1e2e',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
