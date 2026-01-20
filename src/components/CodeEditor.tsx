import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { useReplicadWorker } from '../hooks/useReplicadWorker';

export function CodeEditor() {
  const code = useStore((state) => state.code);
  const updateFromCode = useStore((state) => state.updateFromCode);
  const isEvaluating = useStore((state) => state.isEvaluating);

  const { evaluate } = useReplicadWorker();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeRef = useRef(code);

  // Auto-evaluate code when it changes (debounced)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // Only auto-evaluate if the code contains a main function and doesn't return null
      if (code.includes('function main()') && !code.includes('return null')) {
        evaluate(code);
      }
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [code, evaluate]);

  const handleChange = (value: string | undefined) => {
    if (value !== undefined && value !== lastCodeRef.current) {
      lastCodeRef.current = value;
      updateFromCode(value);
    }
  };

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
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8 },
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
