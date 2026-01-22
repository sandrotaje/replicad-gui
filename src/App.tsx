import { useState, useEffect } from 'react';
import { Sketcher, CodeEditor, Viewer3D, Toolbar, SketchList } from './components';
import './App.css';

type ViewMode = 'split' | 'sketcher' | '3d';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showCode, setShowCode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sketchListOpen, setSketchListOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

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
    setSketchListOpen(false);
    setCodeOpen(false);
    setToolsOpen(false);
  };

  const anyDrawerOpen = sketchListOpen || codeOpen || toolsOpen;

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
          {/* Mobile drawer toggle for sketch list */}
          {isMobile && (
            <button
              className="mobile-drawer-toggle"
              onClick={() => setSketchListOpen(!sketchListOpen)}
            >
              ☰ Sketches
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
            {showCode ? '◀ Hide Code' : '▶ Show Code'}
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
        {isMobile ? (
          <div className={`sketch-list-drawer ${sketchListOpen ? 'mobile-open' : ''}`}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #313244',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#181825'
            }}>
              <span style={{ fontWeight: 500 }}>Sketches</span>
              <button
                onClick={() => setSketchListOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cdd6f4',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>
            <SketchList hideMobileHeader />
          </div>
        ) : (
          <SketchList />
        )}

        <div className={`views-container ${viewMode}`}>
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
        </div>

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
                  ✕
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
