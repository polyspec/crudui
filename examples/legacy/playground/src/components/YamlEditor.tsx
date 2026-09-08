import React, { useCallback } from 'react';
import Editor, { OnChange } from '@monaco-editor/react';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({ value, onChange }) => {
  const handleChange: OnChange = useCallback(
    (newValue) => {
      onChange(newValue || '');
    },
    [onChange]
  );

  return (
    <div className="editor-container">
      <Editor
        height="100%"
        defaultLanguage="yaml"
        value={value}
        onChange={handleChange}
        theme="vs-light"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          automaticLayout: true,
          folding: true,
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  );
};
