import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sketcher, CodeEditor, Viewer3D, Toolbar, FeatureTree } from './components';
import { useFeatureStore } from './store/useFeatureStore';
import { useStore } from './store/useStore';
import { featureEvaluator } from './utils/featureEvaluator';
import { useReplicadWorker, useFeatureSketchSync, useKeyboardShortcuts } from './hooks';
import type { SketchFeature } from './types';
import './App.css';

type ViewMode = 'split' | 'sketcher' | '3d';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showCode, setShowCode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [featureTreeOpen, setFeatureTreeOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Feature store
  const features = useFeatureStore((state) => state.features);
  const editingSketchId = useFeatureStore((state) => state.editingSketchId);
  const setFinalShape = useFeatureStore((state) => state.setFinalShape);

  // Legacy store - for backward compatibility
  // Note: legacyCode and setShapeData are not directly used but provide the store connection

  // Worker for evaluation
  const { evaluate } = useReplicadWorker();

  // Sync legacy store with feature store when editing a sketch
  useFeatureSketchSync();

  // Enable keyboard shortcuts when in feature mode
  useKeyboardShortcuts();

  // Get the current sketch being edited
  const editingSketch = useMemo(() => {
    if (!editingSketchId) return null;
    return features.find((f) => f.id === editingSketchId) as SketchFeature | null;
  }, [editingSketchId, features]);

  // Note: Face boundary is available from editingSketch.reference.boundaryPoints when needed

  // Generate and evaluate code when features change
  const evaluateFeatures = useCallback(() => {
    const code = featureEvaluator.generateFullCode(features);
    console.log('[Feature Mode] Generated code:', code);

    // Send to worker for evaluation
    evaluate(code);
  }, [features, evaluate]);

  // Trigger evaluation when features change
  useEffect(() => {
    if (features.length > 0) {
      // Debounce evaluation
      const timer = setTimeout(() => {
        evaluateFeatures();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [features, evaluateFeatures]);

  // Sync shape data from legacy store to feature store
  const shapeData = useStore((state) => state.shapeData);
  useEffect(() => {
    if (shapeData) {
      setFinalShape(shapeData);
    }
  }, [shapeData, setFinalShape]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // On mobile, default to sketcher view instead of split
      if (mobile && viewMode === 'split') {
        setViewMode('sketcher');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [viewMode]);

  // Close drawers when clicking backdrop
  const closeAllDrawers = () => {
    setFeatureTreeOpen(false);
    setCodeOpen(false);
    setToolsOpen(false);
  };

  const anyDrawerOpen = featureTreeOpen || codeOpen || toolsOpen;

  // Render the main content
  const renderMainContent = () => {
    return (
      <>
        {/* Feature Tree on left (desktop only) */}
        {!isMobile && <FeatureTree />}

        {/* Main views area */}
        <div className={`views-container ${viewMode}`}>
          {/* Show Sketcher when editing a sketch, otherwise show normal view modes */}
          {editingSketchId ? (
            <>
              {/* When editing sketch, always show the sketcher */}
              <div className="view-panel sketcher-panel">
                <div className="panel-header">
                  2D Sketcher - {editingSketch?.name || 'Editing Sketch'}
                </div>
                <Sketcher />
              </div>
              {/* Show 3D preview alongside when in split mode */}
              {viewMode === 'split' && (
                <div className="view-panel viewer-panel">
                  <div className="panel-header">3D Preview</div>
                  <Viewer3D />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Normal view modes when not editing */}
              {(viewMode === 'split' || viewMode === 'sketcher') && (
                <div className="view-panel sketcher-panel">
                  <div className="panel-header">2D Sketcher</div>
                  <Sketcher />
                </div>
              )}
              {(viewMode === 'split' || viewMode === '3d') && (
                <div className="view-panel viewer-panel">
                  <div className="panel-header">3D Preview</div>
                  <Viewer3D />
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="app">
      {/* Mobile backdrop */}
      <div
        className={`mobile-backdrop ${anyDrawerOpen ? 'visible' : ''}`}
        onClick={closeAllDrawers}
      />

      <Toolbar
        isMobile={isMobile}
        toolsOpen={toolsOpen}
        setToolsOpen={setToolsOpen}
      />

      <div className="view-controls">
        <div className="view-tabs">
          {/* Mobile drawer toggle for feature tree */}
          {isMobile && (
            <button
              className="mobile-drawer-toggle"
              onClick={() => setFeatureTreeOpen(!featureTreeOpen)}
            >
              Features
            </button>
          )}
          {!isMobile && (
            <button
              data-view="split"
              className={viewMode === 'split' ? 'active' : ''}
              onClick={() => setViewMode('split')}
            >
              Split View
            </button>
          )}
          <button
            className={viewMode === 'sketcher' ? 'active' : ''}
            onClick={() => setViewMode('sketcher')}
          >
            2D Sketcher
          </button>
          <button
            className={viewMode === '3d' ? 'active' : ''}
            onClick={() => setViewMode('3d')}
          >
            3D View
          </button>
        </div>
        {!isMobile && (
          <button
            className={`code-toggle ${showCode ? 'active' : ''}`}
            onClick={() => setShowCode(!showCode)}
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>
        )}
        {isMobile && (
          <button
            className="mobile-drawer-toggle"
            onClick={() => setCodeOpen(!codeOpen)}
          >
            {'</>'} Code
          </button>
        )}
      </div>

      <div className="main-content">
        {/* Mobile feature tree drawer */}
        {isMobile && (
          <div className={`sketch-list-drawer ${featureTreeOpen ? 'mobile-open' : ''}`}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #313244',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#181825'
            }}>
              <span style={{ fontWeight: 500 }}>Features</span>
              <button
                onClick={() => setFeatureTreeOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cdd6f4',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                X
              </button>
            </div>
            <FeatureTree />
          </div>
        )}

        {renderMainContent()}

        {(showCode || (isMobile && codeOpen)) && (
          <div className={`code-panel ${isMobile && codeOpen ? 'mobile-open' : ''}`}>
            {isMobile && (
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #313244',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#181825'
              }}>
                <span style={{ fontWeight: 500 }}>Code Editor</span>
                <button
                  onClick={() => setCodeOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#cdd6f4',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '4px 8px'
                  }}
                >
                  X
                </button>
              </div>
            )}
            <CodeEditor />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
