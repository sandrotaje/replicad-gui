import React from 'react';
import { ConstraintType } from '../types';

interface FloatingConstraintsProps {
  selectedPointIds: string[];
  selectedLineIds: string[];
  selectedCircleIds: string[];
  onApplyConstraint: (type: ConstraintType, needsInput: boolean) => void;
  onDelete: () => void;
}

interface ConstraintOption {
  type: ConstraintType;
  icon: string;
  label: string;
  needsInput: boolean;
}

const FloatingConstraints: React.FC<FloatingConstraintsProps> = ({
  selectedPointIds,
  selectedLineIds,
  selectedCircleIds,
  onApplyConstraint,
  onDelete,
}) => {
  const availableConstraints = React.useMemo(() => {
    const constraints: ConstraintOption[] = [];

    const numPoints = selectedPointIds.length;
    const numLines = selectedLineIds.length;
    const numCircles = selectedCircleIds.length;

    // Nothing selected
    if (numPoints === 0 && numLines === 0 && numCircles === 0) {
      return constraints;
    }

    // 1 point selected
    if (numPoints === 1 && numLines === 0 && numCircles === 0) {
      constraints.push({
        type: ConstraintType.FIXED,
        icon: '⚓',
        label: 'Fix Point',
        needsInput: false,
      });
    }

    // 2 points selected
    if (numPoints === 2 && numLines === 0 && numCircles === 0) {
      constraints.push(
        {
          type: ConstraintType.COINCIDENT,
          icon: '⦿',
          label: 'Coincident',
          needsInput: false,
        },
        {
          type: ConstraintType.HORIZONTAL,
          icon: '—',
          label: 'Horizontal',
          needsInput: false,
        },
        {
          type: ConstraintType.VERTICAL,
          icon: '|',
          label: 'Vertical',
          needsInput: false,
        },
        {
          type: ConstraintType.DISTANCE,
          icon: '📏',
          label: 'Distance',
          needsInput: true,
        }
      );
    }

    // 1 line selected
    if (numPoints === 0 && numLines === 1 && numCircles === 0) {
      constraints.push(
        {
          type: ConstraintType.HORIZONTAL,
          icon: '—',
          label: 'Horizontal',
          needsInput: false,
        },
        {
          type: ConstraintType.VERTICAL,
          icon: '|',
          label: 'Vertical',
          needsInput: false,
        },
        {
          type: ConstraintType.DISTANCE,
          icon: '📏',
          label: 'Length',
          needsInput: true,
        },
        {
          type: ConstraintType.ANGLE,
          icon: '∠',
          label: 'Angle',
          needsInput: true,
        }
      );
    }

    // 2 lines selected
    if (numPoints === 0 && numLines === 2 && numCircles === 0) {
      constraints.push(
        {
          type: ConstraintType.PARALLEL,
          icon: '//',
          label: 'Parallel',
          needsInput: false,
        },
        {
          type: ConstraintType.EQUAL_LENGTH,
          icon: '=',
          label: 'Equal Length',
          needsInput: false,
        },
        {
          type: ConstraintType.ANGLE,
          icon: '∠',
          label: 'Angle Between',
          needsInput: true,
        }
      );
    }

    // 1 circle selected
    if (numPoints === 0 && numLines === 0 && numCircles === 1) {
      constraints.push(
        {
          type: ConstraintType.RADIUS,
          icon: 'R',
          label: 'Radius',
          needsInput: true,
        },
        {
          type: ConstraintType.FIXED,
          icon: '⚓',
          label: 'Fix Center',
          needsInput: false,
        }
      );
    }

    // 2 circles selected
    if (numPoints === 0 && numLines === 0 && numCircles === 2) {
      constraints.push(
        {
          type: ConstraintType.TANGENT,
          icon: 'T',
          label: 'Tangent',
          needsInput: false,
        },
        {
          type: ConstraintType.COINCIDENT,
          icon: '⦿',
          label: 'Concentric',
          needsInput: false,
        },
        {
          type: ConstraintType.DISTANCE,
          icon: '📏',
          label: 'Distance',
          needsInput: true,
        }
      );
    }

    // 1 line + 1 circle
    if (numPoints === 0 && numLines === 1 && numCircles === 1) {
      constraints.push(
        {
          type: ConstraintType.TANGENT,
          icon: 'T',
          label: 'Tangent',
          needsInput: false,
        },
        {
          type: ConstraintType.DISTANCE,
          icon: '📏',
          label: 'Distance',
          needsInput: true,
        }
      );
    }

    // 1 point + 1 circle
    if (numPoints === 1 && numLines === 0 && numCircles === 1) {
      constraints.push(
        {
          type: ConstraintType.TANGENT,
          icon: 'T',
          label: 'Point on Circle',
          needsInput: false,
        },
        {
          type: ConstraintType.COINCIDENT,
          icon: '⦿',
          label: 'Center',
          needsInput: false,
        }
      );
    }

    // 1 point + 1 line
    if (numPoints === 1 && numLines === 1 && numCircles === 0) {
      constraints.push(
        {
          type: ConstraintType.COINCIDENT,
          icon: '⦿',
          label: 'Point on Line',
          needsInput: false,
        },
        {
          type: ConstraintType.MIDPOINT,
          icon: 'M',
          label: 'Midpoint',
          needsInput: false,
        }
      );
    }

    return constraints;
  }, [selectedPointIds.length, selectedLineIds.length, selectedCircleIds.length]);

  // Return null if nothing is selected
  if (availableConstraints.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        zIndex: 100,
      }}
    >
      {/* Constraint buttons */}
      {availableConstraints.map((constraint) => (
        <div key={constraint.type} style={{ position: 'relative' }}>
          <button
            onClick={() => onApplyConstraint(constraint.type, constraint.needsInput)}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: 'rgba(30, 30, 46, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              fontSize: 18,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
            title={constraint.label}
          >
            {constraint.icon}
          </button>
        </div>
      ))}

      {/* Separator */}
      {availableConstraints.length > 0 && (
        <div style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          fontSize: 18,
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
        title="Delete"
      >
        🗑
      </button>
    </div>
  );
};

export default FloatingConstraints;
