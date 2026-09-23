import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useAnalytics, usePeriod, useScope } from '../context/AnalyticsContext.jsx';
import useIsPhone from '../context/useIsPhone.js';
import { endpointLabel, modelLabel, t } from '../copy/index.js';
import ExportMenu from './ExportMenu.jsx';
import InfoHint from './InfoHint.jsx';
import MenuPanel from './MenuPanel.jsx';
import PeriodPicker from './PeriodPicker.jsx';
import Segmented from './Segmented.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const ROUND_ICON_CLASS = `sf-hit w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-line text-ink-soft hover:bg-line/20 transition-colors disabled:text-ink-mute disabled:cursor-not-allowed disabled:hover:bg-transparent ${RING}`;
const CHIP_CLASS = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-line/40 text-xs font-semibold text-ink-soft whitespace-nowrap';
const CHIP_LINK_CLASS = `${CHIP_CLASS} hover:bg-line/60 transition-colors ${RING}`;
const FILTERS_BUTTON_CLASS = `inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-line/20 transition-colors ${RING}`;

/** «All accounts | Without my and test accounts (n)» — disabled with its hint while no account is internal (§3.4). */
export function ScopeControl() {
  const { scope, setExcludeInternal, internalCount } = useScope();
  const disabled = internalCount === 0;
  const options = [
    { value: 'all', label: t('common.scope.all') },
    { value: 'noInternal', label: disabled ? t('common.scope.noInternalShort') : t('common.scope.noInternal', { n: internalCount }) },
  ];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Segmented
        ariaLabel={t('common.scope.label')}
        options={options}
        value={scope.excludeInternal && !disabled ? 'noInternal' : 'all'}
        onChange={(value) => setExcludeInternal(value === 'noInternal')}
        disabled={disabled}
        title={disabled ? t('common.scope.disabledHint') : undefined}
      />
      {disabled && <InfoHint label={t('common.scope.label')}>{t('common.scope.disabledHint')}</InfoHint>}
    </span>
  );
}

/** Static chip of the service pages: speed, failures and load always count all accounts. */
export function ServiceChip() {
  return (
    <span className={CHIP_CLASS}>
      {t('common.scope.serviceChip')}
      <InfoHint hintKey="common.scope.service" label={t('common.scope.serviceChip')} />
    </span>
  );
}

/** "We don't pay VAT" / "We pay 21% VAT" → Settings (§3.5). */
export function VatChip() {
  const { dataset } = useAnalytics();
  const vatPayer = Boolean(dataset?.settings?.vatPayer);
  return (
    <Link to="/settings#calc" className={CHIP_LINK_CLASS}>
      {t(vatPayer ? 'common.vatChip.on' : 'common.vatChip.off')}
    </Link>
  );
}

/** "⚠ A different model was working …" when the comparison window had another setup (§3.3). */
export function CaveatChips() {
  const { compareCaveat } = usePeriod();
  if (!compareCaveat) return null;
  const era = compareCaveat.era ? `${modelLabel(compareCaveat.era.main)}, ${endpointLabel(compareCaveat.era.endpoint, compareCaveat.era.location)}` : '';
  const chips = [];
  if (compareCaveat.modelEraChanged) chips.push('common.caveat.model');
  if (compareCaveat.billingEraChanged) chips.push('common.caveat.billing');
  return chips.map((key) => (
    <span key={key} className={CHIP_CLASS}>
      {t(key)}
      <InfoHint label={t(key)}>{t('common.caveat.hint', { era: era || t('common.caveat.billing').replace(/^⚠\s*/, '') })}</InfoHint>
    </span>
  ));
}

function Stepper() {
  const { shift, canShift, stepper, label } = usePeriod();
  if (!stepper) return null;
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={t('common.period.prev')} disabled={!canShift?.prev} onClick={() => shift(-1)} className={ROUND_ICON_CLASS}>
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      <span aria-live="polite" className="text-[13px] font-bold min-w-[96px] sm:min-w-[120px] text-center text-ink">
        {label}
      </span>
      <button type="button" aria-label={t('common.period.next')} disabled={!canShift?.next} onClick={() => shift(1)} className={ROUND_ICON_CLASS}>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function RefreshButton() {
  const { status, isRefetching, refresh } = useAnalytics();
  const busy = isRefetching || status === 'loading';
  return (
    <button type="button" aria-label={t('common.refresh')} disabled={busy} onClick={() => refresh()} className={ROUND_ICON_CLASS}>
      <RefreshCw className={isRefetching ? 'w-4 h-4 animate-spin motion-reduce:animate-none' : 'w-4 h-4'} aria-hidden="true" />
    </button>
  );
}

/**
 * The ONE filter row of a page (§3.2): period ‹ › · scope control · chips · ⟳ · Export.
 * Phones: the period pill + a "Filters" button opening a bottom sheet with the scope control, the
 * chips, Export and Refresh. "Updated HH:mm" lives in the scope line, not here.
 *   usesPeriod    false on Prices and Settings (no period picker)
 *   serviceScope  service page (Models, Prices): static "All traffic — all accounts" chip instead of the switch
 *   vatChip       Overview and Money
 *   exportTables  ExportMenu tables
 *   children      extra page controls (after the scope control)
 */
export default function FilterBar({ usesPeriod = true, serviceScope = false, vatChip = false, exportTables, children }) {
  const { stepper } = usePeriod();
  const { tzWarning } = useAnalytics();
  const isPhone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);
  const filtersRef = useRef(null);

  const scopeControl = serviceScope ? <ServiceChip /> : <ScopeControl />;
  const chips = (
    <>
      {vatChip && <VatChip />}
      {usesPeriod && <CaveatChips />}
    </>
  );

  if (isPhone) {
    return (
      <div data-print="hide" className="mb-5 flex items-center gap-2 min-w-0">
        {usesPeriod && <PeriodPicker pillOnly />}
        <button ref={filtersRef} type="button" aria-label={t('common.filters')} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen((open) => !open)} className={`ml-auto ${FILTERS_BUTTON_CLASS}`}>
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          {t('common.filters')}
        </button>
        <MenuPanel open={sheetOpen} anchorRef={filtersRef} onClose={() => setSheetOpen(false)} variant="sheet" ariaLabel={t('common.filters')}>
          <div className="flex flex-col items-start gap-4 pb-2">
            {usesPeriod && stepper && <Stepper />}
            {scopeControl}
            {children}
            <div className="flex flex-wrap gap-2">{chips}</div>
            <div className="flex items-center gap-3">
              <RefreshButton />
              <ExportMenu tables={exportTables || []} />
            </div>
            {tzWarning && <p className="text-xs font-medium text-ink-soft">{t('common.tzWarning')}</p>}
          </div>
        </MenuPanel>
      </div>
    );
  }

  return (
    <div data-print="hide" className="mb-5 flex flex-wrap items-center gap-3">
      {usesPeriod && <PeriodPicker />}
      {usesPeriod && <Stepper />}
      {scopeControl}
      {children}
      {chips}
      <div className="ml-auto flex items-center gap-3">
        <RefreshButton />
        <ExportMenu tables={exportTables || []} />
      </div>
      {tzWarning && <p className="basis-full text-xs font-medium text-ink-soft">{t('common.tzWarning')}</p>}
    </div>
  );
}
