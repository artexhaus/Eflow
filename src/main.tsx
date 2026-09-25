import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// App does its own routing (sign-in, onboarding, dashboard, and the public
// /privacy, /terms and /refunds pages), so every path renders it. App also
// provides the auth context itself.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
