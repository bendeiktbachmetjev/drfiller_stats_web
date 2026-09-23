import React, { useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown, X } from 'lucide-react';
import { usePeriod } from '../context/AnalyticsContext.jsx';
import { STATS_START } from '../data/constants.js';
import { addDays } from '../data/period.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import MenuPanel from './MenuPanel.jsx';
import Segmented from './Segmented.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const TRIGGER_CLASS = `inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink whitespace-nowrap hover:bg-line/20 transition-colors ${RING}`;
const ROW_CLASS = `w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-left text-[13px] font-semibold text-ink hover:bg-line/25 transition-colors ${RING}`;
const GROUP_LABEL_CLASS = 'text-xs font-bold text-ink-soft';
const DATE_INPUT_CLASS =
  'flex-1 min-w-0 h-9 px-2.5 rounded-[12px] border border-line bg-surface text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent';
const CLOSE_CLASS = `sf-hit w-6 h-6 -mr-1 flex items-center justify-center rounded-full text-ink-soft hover:bg-line/25 hover:text-ink transition-colors ${RING}`;
const APPLY_CLASS =
  'shrink-0 h-9 px-4 rounded-full text-xs font-bold text-white bg-brand hover:bg-brand-strong transition-colors disabled:bg-line disabled:text-ink-soft disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

// The form opens on the range that is on screen (end shown inclusive), so a small change is two clicks.
const initialRange = (period) => {
  if (!period) return { from: '', to: '' };
  const end = period.preset === 'custom' ? period.to : period.effTo;
  return { from: period.from, to: addDays(end, -1) };
};

// Mounted only while the popover is open, so its state starts fresh from the current period.
function CustomRangeForm({ period, selected, standalone, onApply, onClose }) {
  const today = period?.today ?? '';
  const [from, setFrom] = useState(() => initialRange(period).from);
  const [to, setTo] = useState(() => initialRange(period).to);

  const complete = Boolean(from && to);
  const inverted = complete && from > to;
  const inFuture = (from && from > today) || (to && to > today);
  const beforeStart = (from && from < STATS_START) || (to && to < STATS_START);
  let problem = null;
  if (inverted) problem = t('common.custom.inverted');
  else if (inFuture) problem = t('common.custom.future');
  else if (beforeStart) problem = t('common.custom.beforeStart', { date: fmt.date(STATS_START) });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (complete && !problem) onApply(from, to);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={standalone ? 'px-3 pt-2 pb-2' : 'mt-1.5 pt-3 border-t border-line/50 px-3 pb-2'}>
      <div className="mb-2 flex items-center justify-between">
        <span className={GROUP_LABEL_CLASS}>
          {t('common.custom.title')}
          {selected && <span className="sr-only"> {t('common.custom.selected')}</span>}
        </span>
        <span className="flex items-center gap-1">
          {selected && <Check className="w-4 h-4 text-brand" aria-hidden="true" />}
          {standalone && (
            <button type="button" aria-label={t('common.close')} onClick={onClose} className={CLOSE_CLASS}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label={t('common.custom.start')}
          data-autofocus={standalone ? '' : undefined}
          value={from}
          min={STATS_START}
          max={today || undefined}
          aria-invalid={inverted || undefined}
          onChange={(event) => setFrom(event.target.value)}
          className={DATE_INPUT_CLASS}
        />
        <input
          type="date"
          aria-label={t('common.custom.end')}
          value={to}
          min={STATS_START}
          max={today || undefined}
          aria-invalid={inverted || undefined}
          onChange={(event) => setTo(event.target.value)}
          className={DATE_INPUT_CLASS}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p role="alert" className="min-w-0 text-xs font-medium text-bad">
          {problem}
        </p>
        <button type="submit" disabled={!complete || Boolean(problem)} className={APPLY_CLASS}>
          {t('common.apply')}
        </button>
      </div>
    </form>
  );
}

/**
 * Period choice for the filter row (§3.3).
 *   variant      'pill' (default): one pill that opens the presets as a list plus the custom-date form. It keeps
 *                the filter row to one line next to the ‹ › stepper, the scope switch and the chips (§3.2).
 *                'segmented': all presets side by side (SimuFlow), "Custom dates" opens the date form.
 *   namesPeriod  the pill names the month, year or custom dates ('Sep 2026') instead of the preset — for phones,
 *                where the stepper lives in the Filters sheet. (`pillOnly` is the old name of this switch.)
 */
export default function PeriodPicker({ variant = 'pill', namesPeriod = false, pillOnly = false }) {
  const { period, presets = [], setPreset, setCustom, stepper, shortLabel } = usePeriod();
  const [panel, setPanel] = useState(null); // null | 'list' | 'custom'
  const anchorRef = useRef(null);
  const pillRef = useRef(null);
  const segmentedRef = useRef(null);
  const segmented = variant === 'segmented' && !pillOnly;
  const named = namesPeriod || pillOnly;

  const currentPreset = period?.preset;
  const presetLabel = presets.find((preset) => preset.id === currentPreset)?.label ?? t('common.period');
  const currentLabel = named && (stepper || currentPreset === 'custom') && shortLabel ? shortLabel : presetLabel;
  const listPresets = presets.filter((preset) => preset.id !== 'custom');
  const options = presets.map((preset) => ({
    value: preset.id,
    label: preset.label,
    icon: preset.id === 'custom' ? CalendarRange : undefined,
  }));

  const close = () => setPanel(null);
  const toggle = (kind, anchor) => {
    anchorRef.current = anchor;
    setPanel((open) => (open === kind ? null : kind));
  };
  const choosePreset = (id) => {
    setPreset(id);
    close();
  };
  const handleSegmentedChange = (id) => {
    if (id === 'custom') toggle('custom', segmentedRef.current);
    else choosePreset(id);
  };
  const applyCustom = (from, to) => {
    if (setCustom(from, to) !== false) close();
  };

  return (
    <>
      {segmented && (
        <div ref={segmentedRef} className="inline-flex">
          <Segmented size="md" ariaLabel={t('common.period')} options={options} value={currentPreset} onChange={handleSegmentedChange} />
        </div>
      )}

      {!segmented && (
        <button
          ref={pillRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={panel === 'list'}
          onClick={() => toggle('list', pillRef.current)}
          className={TRIGGER_CLASS}
        >
          <CalendarRange className="w-4 h-4 text-brand" aria-hidden="true" />
          <span className="sr-only">{t('common.period')}: </span>
          {currentLabel}
          <ChevronDown className="w-4 h-4 text-ink-mute" aria-hidden="true" />
        </button>
      )}

      <MenuPanel
        open={panel !== null}
        anchorRef={anchorRef}
        onClose={close}
        width="w-[288px]"
        align={panel === 'custom' ? 'end' : 'start'}
        ariaLabel={panel === 'custom' ? t('common.custom.title') : t('common.period.choose')}
      >
        {panel === 'list' &&
          listPresets.map((preset) => {
            const selected = preset.id === currentPreset;
            return (
              <button
                key={preset.id}
                type="button"
                aria-current={selected ? 'true' : undefined}
                data-autofocus={selected ? '' : undefined}
                onClick={() => choosePreset(preset.id)}
                className={ROW_CLASS}
              >
                {preset.label}
                {selected && <Check className="w-4 h-4 text-brand" aria-hidden="true" />}
              </button>
            );
          })}
        <CustomRangeForm period={period} selected={currentPreset === 'custom'} standalone={panel === 'custom'} onApply={applyCustom} onClose={close} />
      </MenuPanel>
    </>
  );
}
