import React from 'react';
import { useRequests } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Requests page (§4.4). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/requests/.
 */
export default function RequestsPage() {
  const metric = useRequests();
  return <PageLayout id="requests" metric={metric} sources={['usage', 'config']} />;
}
