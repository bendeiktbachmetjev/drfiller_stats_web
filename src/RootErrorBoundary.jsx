import React from 'react';
import { t } from './copy/index.js';

// Last line of defence: a render error outside any page. Plain inline styles, so it works even
// when the stylesheet failed to load.
export class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Dr.Filler stats render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#F8F8F8', color: '#414141' }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{t('common.rootError.title')}</h1>
          <p style={{ fontSize: 14, color: '#5E5E5E', marginBottom: 12 }}>{t('common.rootError.body')}</p>
          <pre style={{ fontSize: 12, padding: 12, background: '#fff', borderRadius: 8, overflow: 'auto', border: '1px solid #DCDCDC' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      </div>
    );
  }
}

export default RootErrorBoundary;
