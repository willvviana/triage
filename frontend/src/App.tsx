// App.tsx
// Application shell: nav bar + routed content area.
//
// This file owns the layout. It does NOT own the pages — those live in
// src/pages/. Adding a new page means: create the page file, add a
// <Route> here, add a nav link. Three small edits, no refactoring.

import { NavLink, Route, Routes } from 'react-router-dom';
import TicketsPage from './pages/TicketsPage';
import AnalysisPage from './pages/AnalysisPage';
import './App.css';

function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav-brand">Triage</div>
        <div className="app-nav-links">
          <NavLink
            to="/tickets"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link--active' : 'app-nav-link'
            }
          >
            Tickets
          </NavLink>
          <NavLink
            to="/analysis"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link--active' : 'app-nav-link'
            }
          >
            Analysis
          </NavLink>
        </div>
      </nav>

      <main className="app-main">
        <Routes>
          {/* Redirect the root to the default page. Without this, "/" 
              renders nothing and the user sees a blank screen. */}
          <Route path="/" element={<TicketsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;