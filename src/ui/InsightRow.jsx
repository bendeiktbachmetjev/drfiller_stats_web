import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Info, Sparkles } from 'lucide-react';

const ROW_CLASS = 'flex items-start gap-3.5 p-3 -mx-3 rounded-[16px]';
// Only a row that goes somewhere reacts to the pointer.
const LINK_CLASS =
  'hover:bg-line/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const TONES = {
  neutral: { chip: 'bg-brand/10', icon: 'text-brand', fallback: Sparkles },
  attention: { chip: 'bg-warn-tint', icon: 'text-warn', fallback: AlertTriangle },
  quiet: { chip: 'bg-line/30', icon: 'text-ink-soft', fallback: Info },
  good: { chip: 'bg-brand/10', icon: 'text-brand', fallback: Sparkles },
};

// 'money' → '/money'; full paths pass through.
const toPath = (to) => (typeof to === 'string' && !to.startsWith('/') ? `/${to}` : to);

// `icon` is a lucide component (preferred, sized here) or an already built element.
const renderIcon = (icon, className) => {
  if (React.isValidElement(icon)) return icon;
  return React.createElement(icon, { className, 'aria-hidden': true });
};

/**
 * One computed sentence with an icon chip. `parts` is `[{ t, b? }]`; parts marked `b` are
 * set in bold. Text is rendered as text, never as HTML. `children` may replace `parts`.
 */
export default function InsightRow({ icon, tone = 'neutral', parts = [], to, children }) {
  const style = TONES[tone] || TONES.neutral;

  const content = (
    <>
      <span className={`shrink-0 w-9 h-9 rounded-[12px] flex items-center justify-center ${style.chip}`}>
        {renderIcon(icon || style.fallback, `w-[18px] h-[18px] ${style.icon}`)}
      </span>
      <span className="min-w-0 pt-2 text-sm font-semibold leading-snug text-ink-soft">
        {children ??
          parts.map((part, index) =>
            part.b ? (
              <strong key={index} className="font-extrabold text-ink">
                {part.t}
              </strong>
            ) : (
              <React.Fragment key={index}>{part.t}</React.Fragment>
            ),
          )}
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={toPath(to)} className={`${ROW_CLASS} ${LINK_CLASS}`}>
        {content}
        {/* Phones have no hover: the arrow says the row leads somewhere. */}
        <ChevronRight className="ml-auto self-center w-4 h-4 text-ink-mute shrink-0" aria-hidden="true" />
      </Link>
    );
  }
  return <div className={ROW_CLASS}>{content}</div>;
}
