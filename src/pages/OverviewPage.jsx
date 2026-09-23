import React from 'react';
import { useOverview } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Overview page (§4.1). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/overview/.
 */
export default function OverviewPage() {
  const metric = useOverview();
  return <PageLayout id="overview" metric={metric} vatChip sources={['usage', 'revenue', 'config']} />;
}
