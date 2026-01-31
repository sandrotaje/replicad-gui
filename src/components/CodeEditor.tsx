import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { useFeatureStore } from '../store/useFeatureStore';
import { featureEvaluator } from '../utils/featureEvaluator';
import { useReplicadWorker } from '../hooks';

export function CodeEditor() {
  const features = useFeatureStore((state) => state.features);
  const generatedCode = featureEvaluator.generateFullCode(features);
  const isEvaluating = useStore((state) => state.isEvaluating);
  const { evaluate } = useReplicadWorker();

  // Code mode state
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [editableCode, setEditableCode] = useState('');

  const handleExportToCode = useCallback(() => {
    setEditableCode(generatedCode);
    setIsCodeMode(true);
  }, [generatedCode]);

  const handleBackToFeatures = useCallback(() => {
    setIsCodeMode(false);
    setEditableCode('');
  }, []);

  const handleRunCode = useCallback(() => {
    if (editableCode.trim()) {
      evaluate(editableCode);
    }
  }, [editableCode, evaluate]);

  const displayCode = isCodeMode ? editableCode : generatedCode;

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
          gap: '8px',
        }}
      >
        <span style={{ color: '#cdd6f4', fontWeight: 500, fontSize: '13px' }}>
          {isCodeMode ? 'Code Mode' : 'Replicad Code'}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
            </span>
          )}
          {isCodeMode ? (
            <>
              <button
                onClick={handleRunCode}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#a6e3a1',
                  color: '#1e1e2e',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Run
              </button>
              <button
                onClick={handleBackToFeatures}
                style={{
                  padding: '4px 10px',
                  border: '1px solid #45475a',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: '#a6adc8',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            </>
          ) : (
            <button
              onClick={handleExportToCode}
              style={{
                padding: '4px 10px',
                border: '1px solid #45475a',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: '#a6adc8',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Export generated code to an editable editor"
            >
              Export to Code
            </button>
          )}
        </div>
      </div>

      {isCodeMode && (
        <div
          style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(243, 139, 168, 0.1)',
            borderBottom: '1px solid rgba(243, 139, 168, 0.2)',
            fontSize: '11px',
            color: '#f38ba8',
          }}
        >
          Code mode: changes here won't sync back to features
        </div>
      )}

      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={displayCode}
          onChange={isCodeMode ? (value) => setEditableCode(value || '') : undefined}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8 },
            readOnly: !isCodeMode,
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
