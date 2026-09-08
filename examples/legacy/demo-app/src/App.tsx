import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ContactPage } from './pages/ContactPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { ProductPage } from './pages/ProductPage';
import { CompareValidationPage } from './pages/CompareValidationPage';
import './App.css';

type Language = 'ko' | 'en';

function Navigation({ language, onLanguageChange }: { language: Language; onLanguageChange: (lang: Language) => void }) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <Link to="/">Form Builder</Link>
      </div>

      <div className="nav-links">
        <Link to="/contact" className={isActive('/contact') ? 'active' : ''}>
          {language === 'ko' ? '문의' : 'Contact'}
        </Link>
        <Link to="/registration" className={isActive('/registration') ? 'active' : ''}>
          {language === 'ko' ? '회원가입' : 'Registration'}
        </Link>
        <Link to="/product" className={isActive('/product') ? 'active' : ''}>
          {language === 'ko' ? '상품' : 'Product'}
        </Link>
        <Link to="/compare" className={isActive('/compare') ? 'active' : ''}>
          {language === 'ko' ? '검증 비교' : 'Compare'}
        </Link>
      </div>

      <div className="nav-actions">
        <div className="language-switcher">
          <button
            className={language === 'ko' ? 'active' : ''}
            onClick={() => onLanguageChange('ko')}
          >
            한국어
          </button>
          <button
            className={language === 'en' ? 'active' : ''}
            onClick={() => onLanguageChange('en')}
          >
            English
          </button>
        </div>
      </div>
    </nav>
  );
}

function AppContent() {
  const [language, setLanguage] = useState<Language>('ko');

  return (
    <div className="app">
      <Navigation language={language} onLanguageChange={setLanguage} />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage language={language} />} />
          <Route path="/contact" element={<ContactPage language={language} />} />
          <Route path="/registration" element={<RegistrationPage language={language} />} />
          <Route path="/product" element={<ProductPage language={language} />} />
          <Route path="/compare" element={<CompareValidationPage language={language} />} />
        </Routes>
      </main>

      <footer className="main-footer">
        <p>
          {language === 'ko'
            ? 'YAML 스펙 기반 폼 빌더 데모'
            : 'YAML Spec-based Form Builder Demo'}
        </p>
        <p>
          <a href="https://github.com/limepie/form-generator" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
