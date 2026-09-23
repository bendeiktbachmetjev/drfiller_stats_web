import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ServiceChip } from './FilterBar.jsx';

const ACTION_CLASS =
  'group shrink-0 inline-flex items-center gap-1 rounded-[6px] text-[13px] font-bold text-brand hover:text-brand-strong transition-colors print:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// 'money' → '/money'; full paths pass through.
const toPath = (to) => (typeof to === 'string' && !to.startsWith('/') ? `/${to}` : to);

// The arrow is drawn as an icon, so a label written as "Money →" loses its own arrow.
const cleanLabel = (label) => (typeof label === 'string' ? label.replace(/\s*→\s*$/, '') : label);

/**
 * A page section's title with its one headline sentence (§4.0 density rule) and an optional link.
 *   service  a service section on a mixed page (§3.2): shows the "All traffic — all accounts" chip, because the
 *            account switch in the filter row does not apply to it
 */
export default function SectionTitle({ id, title, description, action, service = false }) {
  return (
    <div id={id} className="mt-12 mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {service ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
            <ServiceChip />
          </div>
        ) : (
          <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
        )}
        {description && <p className="mt-1 text-sm font-medium text-ink-soft">{description}</p>}
      </div>
      {action?.to && action.label && (
        <Link to={toPath(action.to)} className={ACTION_CLASS}>
          {cleanLabel(action.label)}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
