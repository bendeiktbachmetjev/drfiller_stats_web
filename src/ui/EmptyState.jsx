import React from 'react';
import { Inbox } from 'lucide-react';
import { usePeriod } from '../context/AnalyticsContext.jsx';
import { t } from '../copy/index.js';

const ACTION_CLASS =
  'mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-line bg-surface text-ink-soft hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const SIZES = {
  md: {
    wrapper: 'flex flex-col items-center justify-center text-center px-6 py-10',
    box: 'w-14 h-14 rounded-[20px] bg-line/25 flex items-center justify-center mb-4',
    icon: 'w-6 h-6 text-ink-mute',
  },
  sm: {
    wrapper: 'flex flex-col items-center justify-center text-center px-6 py-6',
    box: 'w-10 h-10 rounded-[14px] bg-line/25 flex items-center justify-center mb-3',
    icon: 'w-5 h-5 text-ink-mute',
  },
};

// `icon` is a lucide component (preferred, sized here) or an already built element.
const renderIcon = (icon, className) => {
  if (React.isValidElement(icon)) return icon;
  return React.createElement(icon || Inbox, { className, 'aria-hidden': true });
};

function ActionButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className={ACTION_CLASS}>
      {label}
    </button>
  );
}

// The standard way out of an empty period: "Show 30 days", or "Show all time" when 30 days is what
// is already empty. On "All time" there is nothing wider to offer.
function WidenPeriodAction() {
  const { period, setPreset } = usePeriod();
  if (!period || period.preset === 'allTime') return null;
  const onLast30 = period.preset === 'last30';
  return (
    <ActionButton
      label={onLast30 ? t('common.empty.allTime') : t('common.empty.widen')}
      onClick={() => setPreset(onLast30 ? 'allTime' : 'last30')}
    />
  );
}

/**
 * Intentional-looking "nothing here" block. `action` is `{ label, onClick }`, or the string
 * 'widen' for the standard wider-period button. `minHeight` (px) keeps the height of the
 * chart or list it stands in for, so the card does not jump.
 */
export default function EmptyState({ icon, title, hint, action, size = 'md', minHeight, className = '' }) {
  const classes = SIZES[size] || SIZES.md;

  return (
    <div
      className={[classes.wrapper, className].filter(Boolean).join(' ')}
      style={minHeight ? { minHeight } : undefined}
    >
      <div className={classes.box}>{renderIcon(icon, classes.icon)}</div>
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs font-medium text-ink-soft max-w-xs">{hint}</p>}
      {action === 'widen' && <WidenPeriodAction />}
      {action && typeof action === 'object' && action.label && (
        <ActionButton label={action.label} onClick={action.onClick} />
      )}
    </div>
  );
}
