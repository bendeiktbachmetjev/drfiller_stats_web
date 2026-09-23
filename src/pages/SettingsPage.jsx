import React from 'react';
import { useSettingsMetric } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Settings page (§4.9). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/settings/.
 */
export default function SettingsPage() {
  const metric = useSettingsMetric();
  return <PageLayout id="settings" metric={metric} sources={['settings', 'config']} />;
}
