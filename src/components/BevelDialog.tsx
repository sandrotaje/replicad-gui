import { useState, useEffect, useRef } from 'react';

export type BevelType = 'fillet' | 'chamfer';

interface BevelDialogProps {
  isOpen: boolean;
  bevelType: BevelType;
  selectedEdgeCount: number;
  onConfirm: (value: number, allEdges: boolean) => void;
  onCancel: () => void;
}

export function BevelDialog({
  isOpen,
  bevelType,
  selectedEdgeCount,
  onConfirm,
  onCancel,
}: BevelDialogProps) {
  const [value, setValue] = useState('2');
  const [allEdges, setAllEdges] = useState(selectedEdgeCount === 0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setValue('2');
      setAllEdges(selectedEdgeCount === 0);
      // Focus input after a brief delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, selectedEdgeCount]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, value, allEdges]);

  const handleConfirm = () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return;
    }
    onConfirm(numValue, allEdges);
  };

  if (!isOpen) return null;

  const isFillet = bevelType === 'fillet';
  const title = isFillet ? 'Fillet' : 'Chamfer';
  const valueLabel = isFillet ? 'Radius' : 'Distance';
  const buttonColor = isFillet ? '#cba6f7' : '#fab387';

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
          {title} Settings
        </h3>

        {/* Edge selection mode */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#a6adc8',
              fontSize: '13px',
            }}
          >
            Apply to
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: selectedEdgeCount > 0 ? '#cdd6f4' : '#6c7086',
                fontSize: '14px',
                cursor: selectedEdgeCount > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedEdgeCount > 0 ? 1 : 0.5,
              }}
            >
              <input
                type="radio"
                name="edgeSelection"
                checked={!allEdges}
                onChange={() => setAllEdges(false)}
                disabled={selectedEdgeCount === 0}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: buttonColor,
                  cursor: selectedEdgeCount > 0 ? 'pointer' : 'not-allowed',
                }}
              />
              Selected edges ({selectedEdgeCount} selected)
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
            onClick={handleConfirm}
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
            Apply {title}
          </button>
        </div>
      </div>
    </div>
  );
}
