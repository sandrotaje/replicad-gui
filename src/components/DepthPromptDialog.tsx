import { useState, useEffect, useRef } from 'react';

export type OperationDirection = 'normal' | 'reverse' | 'both';

interface DepthPromptDialogProps {
  isOpen: boolean;
  operationType: 'extrude' | 'cut';
  onConfirm: (depth: number, direction: OperationDirection, throughAll: boolean) => void;
  onCancel: () => void;
}

export function DepthPromptDialog({ isOpen, operationType, onConfirm, onCancel }: DepthPromptDialogProps) {
  const [depth, setDepth] = useState('10');
  const [direction, setDirection] = useState<OperationDirection>('normal');
  const [throughAll, setThroughAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDepth('10');
      setDirection('normal');
      setThroughAll(false);
      // Focus input after a brief delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

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
  }, [isOpen, depth, direction, throughAll]);

  const handleConfirm = () => {
    const depthValue = parseFloat(depth);
    if (isNaN(depthValue) || depthValue <= 0) {
      return;
    }
    onConfirm(depthValue, direction, throughAll);
  };

  if (!isOpen) return null;

  const isExtrude = operationType === 'extrude';

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
          {isExtrude ? 'Extrude' : 'Cut'} Settings
        </h3>

        {/* Depth input */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#a6adc8',
              fontSize: '13px',
            }}
          >
            Depth
          </label>
          <input
            ref={inputRef}
            type="number"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            disabled={throughAll}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #45475a',
              borderRadius: '6px',
              backgroundColor: throughAll ? '#313244' : '#181825',
              color: throughAll ? '#6c7086' : '#cdd6f4',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Direction dropdown */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#a6adc8',
              fontSize: '13px',
            }}
          >
            Direction
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as OperationDirection)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #45475a',
              borderRadius: '6px',
              backgroundColor: '#181825',
              color: '#cdd6f4',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="normal">Normal</option>
            <option value="reverse">Reverse</option>
            {!isExtrude && <option value="both">Both directions</option>}
          </select>
        </div>

        {/* Through all checkbox (cut only) */}
        {!isExtrude && (
          <div style={{ marginBottom: '20px' }}>
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
                type="checkbox"
                checked={throughAll}
                onChange={(e) => setThroughAll(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: '#89b4fa',
                  cursor: 'pointer',
                }}
              />
              Through all
            </label>
          </div>
        )}

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
              backgroundColor: isExtrude ? '#89b4fa' : '#f38ba8',
              color: '#1e1e2e',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isExtrude ? 'Extrude' : 'Cut'}
          </button>
        </div>
      </div>
    </div>
  );
}
