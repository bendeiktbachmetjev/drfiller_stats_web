import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import KeyGate from './auth/KeyGate.jsx';

// The whole site sits behind the admin key; the shell and its routes render inside KeyGate.
export default function App() {
  return (
    <BrowserRouter>
      <KeyGate />
    </BrowserRouter>
  );
}
