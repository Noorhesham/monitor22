import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './j.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import './index.css'; // Import Tailwind CSS

// Remove the inline style approach since we're using Tailwind now
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SettingsProvider>
      <Dashboard />
    </SettingsProvider>
  </React.StrictMode>
); 