import { useState } from 'react';
import { Sketcher, CodeEditor, Viewer3D, Toolbar } from './components';
import './App.css';

type ViewMode = 'split' | 'sketcher' | '3d';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showCode, setShowCode] = useState(true);

  return (
    <div className="app">
      <Toolbar />

      <div className="view-controls">
        <div className="view-tabs">
          <button
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => setViewMode('split')}
          >
            Split View
          </button>
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
        <button
          className={`code-toggle ${showCode ? 'active' : ''}`}
          onClick={() => setShowCode(!showCode)}
        >
          {showCode ? '◀ Hide Code' : '▶ Show Code'}
        </button>
      </div>

      <div className="main-content">
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

        {showCode && (
          <div className="code-panel">
            <CodeEditor />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
