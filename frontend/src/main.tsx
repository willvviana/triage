// main.tsx
// App entrypoint. Wraps the entire tree in a BrowserRouter so any
// component below can use <Link>, useNavigate, useParams, etc.
//
// Why BrowserRouter at the root, not per-page:
//   The router must be a single ancestor of every component that uses
//   routing hooks. Mounting it at the root means App.tsx, pages, and
//   every child component can route. Mounting it inside a page would
//   make routing state local to that page — wrong for a multi-page app.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);