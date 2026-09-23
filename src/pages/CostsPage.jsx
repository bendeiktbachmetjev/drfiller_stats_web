import React from 'react';
import { useCosts } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Costs page (§4.3). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/costs/.
 */
export default function CostsPage() {
  const metric = useCosts();
  return <PageLayout id="costs" metric={metric} sources={['usage', 'config', 'costs']} />;
}
