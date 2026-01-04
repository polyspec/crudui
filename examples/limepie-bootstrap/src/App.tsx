import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ContactPage } from './pages/ContactPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { ProductPage } from './pages/ProductPage';
import { LimepieComparePage } from './pages/LimepieComparePage';
import './App.css';

type Language = 'ko' | 'en';

function Navigation({ language, onLanguageChange }: { language: Language; onLanguageChange: (lang: Language) => void }) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary sticky-top">
      <div className="container">
        <Link to="/" className="navbar-brand fw-bold">
          Limepie Bootstrap
        </Link>

        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link to="/contact" className={`nav-link ${isActive('/contact') ? 'active' : ''}`}>
                {language === 'ko' ? '문의' : 'Contact'}
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/registration" className={`nav-link ${isActive('/registration') ? 'active' : ''}`}>
                {language === 'ko' ? '회원가입' : 'Registration'}
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/product" className={`nav-link ${isActive('/product') ? 'active' : ''}`}>
                {language === 'ko' ? '상품' : 'Product'}
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/compare" className={`nav-link ${isActive('/compare') ? 'active' : ''}`}>
                {language === 'ko' ? 'Limepie 비교' : 'Limepie Compare'}
              </Link>
            </li>
          </ul>

          <div className="btn-group">
            <button
              className={`btn btn-sm ${language === 'ko' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => onLanguageChange('ko')}
            >
              한국어
            </button>
            <button
              className={`btn btn-sm ${language === 'en' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => onLanguageChange('en')}
            >
              English
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function AppContent() {
  const [language, setLanguage] = useState<Language>('ko');

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navigation language={language} onLanguageChange={setLanguage} />

      <main className="flex-grow-1 py-4">
        <div className="container">
          <Routes>
            <Route path="/" element={<HomePage language={language} />} />
            <Route path="/contact" element={<ContactPage language={language} />} />
            <Route path="/registration" element={<RegistrationPage language={language} />} />
            <Route path="/product" element={<ProductPage language={language} />} />
            <Route path="/compare" element={<LimepieComparePage language={language} />} />
          </Routes>
        </div>
      </main>

      <footer className="bg-light border-top py-4 mt-auto">
        <div className="container text-center text-muted">
          <p className="mb-1">
            {language === 'ko'
              ? 'Limepie 스타일 Bootstrap 5 폼 데모'
              : 'Limepie-style Bootstrap 5 Form Demo'}
          </p>
          <p className="mb-0">
            <a href="https://github.com/limepie/form-generator" target="_blank" rel="noopener noreferrer" className="text-primary">
              GitHub
            </a>
          </p>
        </div>
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
