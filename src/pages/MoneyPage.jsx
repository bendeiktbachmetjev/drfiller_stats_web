import React from 'react';
import { useMoney } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Money page (§4.2). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/money/.
 */
export default function MoneyPage() {
  const metric = useMoney();
  return <PageLayout id="money" metric={metric} vatChip sources={['usage', 'revenue', 'config']} />;
}
