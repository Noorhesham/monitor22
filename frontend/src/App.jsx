import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import store, { persistor } from './store';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import MonitoredHeaders from './pages/MonitoredHeaders';
import Settings from './pages/Settings';

const App = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/monitored-headers" element={<MonitoredHeaders />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </PersistGate>
    </Provider>
  );
};

export default App; 