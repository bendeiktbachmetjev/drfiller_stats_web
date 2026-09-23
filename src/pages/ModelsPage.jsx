import React from 'react';
import { useModels } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Models page (§4.6). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/models/.
 */
export default function ModelsPage() {
  const metric = useModels();
  return <PageLayout id="models" metric={metric} sources={['usage', 'config']} />;
}
