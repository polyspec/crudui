import React, { useState, useCallback } from 'react';
import { YamlEditor } from './components/YamlEditor';
import { FormPreview } from './components/FormPreview';
import { OutputPanel } from './components/OutputPanel';
import { exampleSpecs, defaultSpec } from './specs/examples';
import type { FormData, FormErrors } from '@limepie/form-react';

type PlaygroundLanguage = 'ko' | 'en';

function App() {
  // State
  const [spec, setSpec] = useState<string>(defaultSpec);
  const [language, setLanguage] = useState<PlaygroundLanguage>('ko');
  const [formData, setFormData] = useState<FormData>({});
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // Handle example selection
  const handleExampleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const example = exampleSpecs.find((ex) => ex.id === e.target.value);
      if (example) {
        setSpec(example.spec);
        setFormData({});
        setFormErrors({});
      }
    },
    []
  );

  // Handle language toggle
  const handleLanguageChange = useCallback((lang: PlaygroundLanguage) => {
    setLanguage(lang);
  }, []);

  // Handle spec change
  const handleSpecChange = useCallback((newSpec: string) => {
    setSpec(newSpec);
  }, []);

  // Handle form data change
  const handleDataChange = useCallback((data: FormData) => {
    setFormData(data);
  }, []);

  // Handle form errors change
  const handleErrorsChange = useCallback((errors: FormErrors) => {
    setFormErrors(errors);
  }, []);

  // Export JSON
  const handleExport = useCallback(() => {
    const json = JSON.stringify(formData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'form-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [formData]);

  return (
    <div className="playground-container">
      {/* Header */}
      <header className="playground-header">
        <h1>Form Spec Playground</h1>
        <div className="header-controls">
          {/* Example Selector */}
          <select
            className="control-select"
            onChange={handleExampleChange}
            defaultValue="contact"
          >
            {exampleSpecs.map((example) => (
              <option key={example.id} value={example.id}>
                {example.name[language]}
              </option>
            ))}
          </select>

          {/* Language Toggle */}
          <div className="language-toggle">
            <button
              className={language === 'ko' ? 'active' : ''}
              onClick={() => handleLanguageChange('ko')}
            >
              KO
            </button>
            <button
              className={language === 'en' ? 'active' : ''}
              onClick={() => handleLanguageChange('en')}
            >
              EN
            </button>
          </div>

          {/* Export Button */}
          <button className="btn btn-secondary" onClick={handleExport}>
            {language === 'ko' ? 'JSON 내보내기' : 'Export JSON'}
          </button>
        </div>
      </header>

      {/* Main Panels */}
      <main className="playground-main">
        {/* Left Panel - YAML Editor */}
        <div className="panel panel-left">
          <div className="panel-header">
            <h2>{language === 'ko' ? 'YAML 스펙' : 'YAML Spec'}</h2>
          </div>
          <div className="panel-content">
            <YamlEditor value={spec} onChange={handleSpecChange} />
          </div>
        </div>

        {/* Right Panel - Form Preview */}
        <div className="panel panel-right">
          <div className="panel-header">
            <h2>{language === 'ko' ? '폼 미리보기' : 'Form Preview'}</h2>
          </div>
          <div className="panel-content">
            <FormPreview
              spec={spec}
              language={language}
              onDataChange={handleDataChange}
              onErrorsChange={handleErrorsChange}
            />
          </div>
        </div>
      </main>

      {/* Bottom Panel - Output */}
      <div className="playground-bottom">
        <OutputPanel
          spec={spec}
          data={formData}
          errors={formErrors}
          language={language}
        />
      </div>
    </div>
  );
}

export default App;
