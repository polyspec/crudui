import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Import Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Polyspec styles (Limepie 호환) — shipped with the package
import '@polyspec/generator-react/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
