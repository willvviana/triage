// App.tsx
// TEMPORARY: raw fetch test.
//
// This file will be replaced with the real app shell (router, layout,
// pages) in the next step. Its only job right now is to prove that:
//   1. The React app can reach the backend
//   2. The fetch wrapper returns the shape we typed in types/ticket.ts
//   3. We can render real DB data on screen
//
// If this shows raw JSON with 3 real tickets, the frontend/backend
// wiring is done. Everything after this is UI work.

import { useEffect, useState } from 'react';
import { fetchTickets } from './api/client';
import type { TicketListResponse } from './types/ticket';

function App() {
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Note: no cleanup / abort handling here. This is a test component
    // that runs once on mount. The real components will handle
    // unmount-during-fetch properly.
    fetchTickets({ limit: 3 })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 20, color: 'red', fontFamily: 'monospace' }}>
        <h1>Error</h1>
        <pre>{error}</pre>
        <p>Is the backend running on http://127.0.0.1:3001?</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 20, fontFamily: 'monospace' }}>Loading...</div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Triage — wiring test</h1>
      <p>
        Showing {data.tickets.length} of {data.pagination.total} tickets
      </p>
      <pre style={{ background: '#f4f4f4', padding: 12, overflow: 'auto' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default App;