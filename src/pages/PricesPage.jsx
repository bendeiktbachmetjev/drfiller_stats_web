import React from 'react';
import { usePrices } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Prices page (§4.7). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/prices/.
 */
export default function PricesPage() {
  const metric = usePrices();
  return <PageLayout id="prices" metric={metric} sources={['config']} />;
}
