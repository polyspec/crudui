import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Import Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Form-Spec styles (Limepie 호환)
import './styles/form-spec.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
