import React, { useState, useCallback } from 'react';
import { useFeatureStore } from '../store/useFeatureStore';
import type {
  Feature,
  SketchFeature,
  ExtrusionFeature,
  CutFeature,
  ChamferFeature,
  FilletFeature,
} from '../types';

// ============ FEATURE ICON COMPONENT ============

interface FeatureIconProps {
  type: Feature['type'];
}

/**
 * Returns an appropriate icon/emoji for each feature type
 */
const FeatureIcon: React.FC<FeatureIconProps> = ({ type }) => {
  const iconStyle: React.CSSProperties = {
    fontSize: '14px',
    width: '20px',
    textAlign: 'center',
    flexShrink: 0,
  };

  switch (type) {
    case 'sketch':
      return <span style={iconStyle} title="Sketch">✏️</span>;
    case 'extrusion':
      return <span style={iconStyle} title="Extrusion">⬆️</span>;
    case 'cut':
      return <span style={iconStyle} title="Cut">✂️</span>;
    case 'chamfer':
      return <span style={iconStyle} title="Chamfer">📐</span>;
    case 'fillet':
      return <span style={iconStyle} title="Fillet">⭕</span>;
    default:
      // Future feature types can be added here
      return <span style={iconStyle}>•</span>;
  }
};

// ============ FEATURE ITEM COMPONENT ============

interface FeatureItemProps {
  feature: Feature;
  isActive: boolean;
  isEditing: boolean;
  depth: number;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Individual feature item in the tree
 */
const FeatureItem: React.FC<FeatureItemProps> = ({
  feature,
  isActive,
  isEditing,
  depth,
  onClick,
  onDoubleClick,
  onContextMenu,
}) => {
  const getItemStyle = (): React.CSSProperties => {
    let backgroundColor = 'transparent';
    let borderLeftColor = 'transparent';

    if (isEditing) {
      backgroundColor = '#3a3a3a';
      borderLeftColor = '#a6e3a1'; // Green for editing
    } else if (isActive) {
      backgroundColor = '#2a2a2a';
      borderLeftColor = '#89b4fa'; // Blue for active
    }

    return {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      paddingLeft: `${depth * 16 + 12}px`,
      cursor: 'pointer',
      borderLeft: `3px solid ${borderLeftColor}`,
      backgroundColor,
      color: feature.isValid ? '#cdd6f4' : '#f38ba8',
      opacity: feature.isValid ? 1 : 0.7,
      transition: 'all 0.15s ease',
      fontSize: '13px',
      userSelect: 'none',
    };
  };

  const getFeatureDetails = (): string => {
    switch (feature.type) {
      case 'sketch': {
        const sketch = feature as SketchFeature;
        const refType = sketch.reference.type === 'standard'
          ? `${sketch.reference.plane} Plane`
          : `Face`;
        const elemCount = sketch.elements.length;
        return `${refType} - ${elemCount} element${elemCount !== 1 ? 's' : ''}`;
      }
      case 'extrusion': {
        const ext = feature as ExtrusionFeature;
        return `Depth: ${ext.depth}`;
      }
      case 'cut': {
        const cut = feature as CutFeature;
        return `Depth: ${cut.depth === 'through' ? 'Through' : cut.depth}`;
      }
      case 'chamfer': {
        const chamfer = feature as ChamferFeature;
        return `Distance: ${chamfer.distance}`;
      }
      case 'fillet': {
        const fillet = feature as FilletFeature;
        return `Radius: ${fillet.radius}`;
      }
      default:
        return '';
    }
  };

  return (
    <div
      style={getItemStyle()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => {
        if (!isActive && !isEditing) {
          e.currentTarget.style.backgroundColor = '#252535';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !isEditing) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <FeatureIcon type={feature.type} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {feature.name}
        </div>
        <div style={{
          fontSize: '10px',
          color: '#6c7086',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {getFeatureDetails()}
        </div>
      </div>

      {/* Status indicators */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {!feature.isValid && (
          <span
            style={{ color: '#f38ba8', fontSize: '12px' }}
            title={feature.errorMessage || 'Invalid feature'}
          >
            ⚠
          </span>
        )}
        {feature.isDirty && feature.isValid && (
          <span
            style={{ color: '#f9e2af', fontSize: '10px' }}
            title="Needs re-evaluation"
          >
            ●
          </span>
        )}
        {isEditing && (
          <span
            style={{ color: '#a6e3a1', fontSize: '10px' }}
            title="Currently editing"
          >
            ✎
          </span>
        )}
      </div>
    </div>
  );
};

// ============ HELPER FUNCTIONS ============

/**
 * Calculate visual depth based on dependencies
 * Sketches on standard planes: depth 0
 * Features depending on other features: parent depth + 1
 */
function calculateDepth(feature: Feature, allFeatures: Feature[]): number {
  // Sketches check their reference type
  if (feature.type === 'sketch') {
    const sketch = feature as SketchFeature;
    if (sketch.reference.type === 'standard') {
      return 0;
    }
    // Sketch on face: find parent and add 1
    const parentId = sketch.reference.parentFeatureId;
    const parent = allFeatures.find((f) => f.id === parentId);
    if (parent) {
      return calculateDepth(parent, allFeatures) + 1;
    }
    return 0;
  }

  // Extrusion and cut depend on their sketch
  if (feature.type === 'extrusion' || feature.type === 'cut') {
    const sketchId = (feature as ExtrusionFeature | CutFeature).sketchId;
    const sketch = allFeatures.find((f) => f.id === sketchId);
    if (sketch) {
      // Extrusion is at the same level as its sketch
      return calculateDepth(sketch, allFeatures);
    }
    return 0;
  }

  // Chamfer and fillet depend on their target feature
  if (feature.type === 'chamfer' || feature.type === 'fillet') {
    const targetId = (feature as ChamferFeature | FilletFeature).targetFeatureId;
    const target = allFeatures.find((f) => f.id === targetId);
    if (target) {
      return calculateDepth(target, allFeatures) + 1;
    }
    return 0;
  }

  return 0;
}

// ============ CONTEXT MENU COMPONENT ============

interface ContextMenuProps {
  x: number;
  y: number;
  feature: Feature;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  feature,
  onClose,
  onDelete,
  onEdit,
}) => {
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    backgroundColor: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: '6px',
    padding: '4px 0',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    minWidth: '140px',
  };

  const menuItemStyle: React.CSSProperties = {
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#cdd6f4',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background-color 0.15s',
  };

  return (
    <>
      {/* Backdrop to close menu */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
        onClick={onClose}
      />
      <div style={menuStyle}>
        {feature.type === 'sketch' && (
          <div
            style={menuItemStyle}
            onClick={() => {
              onEdit();
              onClose();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#313244';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>✏️</span>
            <span>Edit Sketch</span>
          </div>
        )}
        <div
          style={{ ...menuItemStyle, color: '#f38ba8' }}
          onClick={() => {
            onDelete();
            onClose();
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#313244';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span>🗑️</span>
          <span>Delete</span>
        </div>
      </div>
    </>
  );
};

// ============ MAIN FEATURE TREE COMPONENT ============

export const FeatureTree: React.FC = () => {
  const features = useFeatureStore((state) => state.features);
  const activeFeatureId = useFeatureStore((state) => state.activeFeatureId);
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const setActiveFeature = useFeatureStore((state) => state.setActiveFeature);
  const startEditingSketch = useFeatureStore((state) => state.startEditingSketch);
  const deleteFeature = useFeatureStore((state) => state.deleteFeature);
  const undo = useFeatureStore((state) => state.undo);
  const redo = useFeatureStore((state) => state.redo);
  const canUndo = useFeatureStore((state) => state.canUndo);
  const canRedo = useFeatureStore((state) => state.canRedo);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    feature: Feature;
  } | null>(null);

  const handleDoubleClick = useCallback(
    (feature: Feature) => {
      if (feature.type === 'sketch') {
        startEditingSketch(feature.id);
      }
      // For other feature types, could open a parameter editor in the future
    },
    [startEditingSketch]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, feature: Feature) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        feature,
      });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDeleteFromContext = useCallback(() => {
    if (contextMenu) {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${contextMenu.feature.name}"?\n\nThis action can be undone with Ctrl+Z.`
      );
      if (confirmed) {
        deleteFeature(contextMenu.feature.id);
      }
    }
  }, [contextMenu, deleteFeature]);

  const handleEditFromContext = useCallback(() => {
    if (contextMenu && contextMenu.feature.type === 'sketch') {
      startEditingSketch(contextMenu.feature.id);
    }
  }, [contextMenu, startEditingSketch]);

  // Button styles
  const historyButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    backgroundColor: disabled ? '#1e1e2e' : '#313244',
    color: disabled ? '#45475a' : '#cdd6f4',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  });

  return (
    <div
      style={{
        width: '220px',
        minWidth: '180px',
        backgroundColor: '#181825',
        borderRight: '1px solid #313244',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid #313244',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#cdd6f4',
          }}
        >
          Features
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={undo}
            disabled={!canUndo()}
            style={historyButtonStyle(!canUndo())}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            style={historyButtonStyle(!canRedo())}
            title="Redo (Ctrl+Y)"
          >
            ↪
          </button>
        </div>
      </div>

      {/* Feature list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {features.length === 0 ? (
          <div
            style={{
              padding: '16px 12px',
              fontSize: '12px',
              color: '#6c7086',
              lineHeight: 1.6,
            }}
          >
            <div>No features yet.</div>
            <div style={{ marginTop: '8px' }}>
              Press <kbd style={{
                backgroundColor: '#313244',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}>S</kbd> to start a new sketch
            </div>
          </div>
        ) : (
          features.map((feature) => (
            <FeatureItem
              key={feature.id}
              feature={feature}
              isActive={feature.id === activeFeatureId}
              isEditing={feature.id === editingSketchId}
              depth={calculateDepth(feature, features)}
              onClick={() => setActiveFeature(feature.id)}
              onDoubleClick={() => handleDoubleClick(feature)}
              onContextMenu={(e) => handleContextMenu(e, feature)}
            />
          ))
        )}
      </div>

      {/* Footer with feature count and keyboard hints */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          fontSize: '11px',
          color: '#6c7086',
        }}
      >
        {features.length > 0 ? (
          <>
            {features.length} feature{features.length !== 1 ? 's' : ''}
            {features.some((f) => !f.isValid) && (
              <span style={{ color: '#f38ba8', marginLeft: '8px' }}>
                ({features.filter((f) => !f.isValid).length} invalid)
              </span>
            )}
          </>
        ) : null}
        {editingSketchId && (
          <div style={{ marginTop: features.length > 0 ? '4px' : 0, color: '#a6adc8' }}>
            <kbd style={{
              backgroundColor: '#313244',
              padding: '1px 4px',
              borderRadius: '2px',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}>E</kbd> Extrude
            {' '}
            <kbd style={{
              backgroundColor: '#313244',
              padding: '1px 4px',
              borderRadius: '2px',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}>X</kbd> Cut
            {' '}
            <kbd style={{
              backgroundColor: '#313244',
              padding: '1px 4px',
              borderRadius: '2px',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}>Esc</kbd> Finish
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          feature={contextMenu.feature}
          onClose={handleCloseContextMenu}
          onDelete={handleDeleteFromContext}
          onEdit={handleEditFromContext}
        />
      )}
    </div>
  );
};

export default FeatureTree;
