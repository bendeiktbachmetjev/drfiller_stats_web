import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { RootErrorBoundary } from './RootErrorBoundary.jsx';
import { installChunkReload } from './app/chunkReload.js';
import './index.css';

installChunkReload();

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
