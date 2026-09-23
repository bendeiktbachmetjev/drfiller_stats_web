import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../copy/index.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * A render fault in one page must not take the header and the other pages down with it.
 * Keyed by section in AdminShell, so switching pages always starts clean.
 * (Error boundaries have to be classes; React logs the error itself.)
 */
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-auto mt-8 p-8 text-center bg-surface rounded-card border border-line/60 shadow-card">
        <div className="w-14 h-14 rounded-[20px] bg-bad-tint mx-auto flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-bad" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-extrabold text-ink">{t('common.pageError.title')}</h1>
        <p className="mt-1 text-sm font-medium text-ink-soft">{t('common.pageError.body')}</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className={`mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-line bg-surface text-ink-soft hover:bg-line/20 transition-colors ${RING}`}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }
}
