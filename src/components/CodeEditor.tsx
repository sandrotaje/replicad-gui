import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import { featureEvaluator } from '../utils/featureEvaluator';

export function CodeEditor() {
  // Show feature-generated code instead of legacy code
  const features = useFeatureStore((state) => state.features);
  const code = featureEvaluator.generateFullCode(features);

  const isEvaluating = useStore((state) => state.isEvaluating);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#181825',
          borderBottom: '1px solid #313244',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#cdd6f4', fontWeight: 500 }}>Replicad Code</span>
        {isEvaluating && (
          <span
            style={{
              fontSize: '11px',
              color: '#89b4fa',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#89b4fa',
                animation: 'pulse 1s infinite',
              }}
            />
            Evaluating...
          </span>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8 },
            readOnly: true, // Code is generated from features
          }}
        />
      </div>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}
      </style>
    </div>
  );
}
