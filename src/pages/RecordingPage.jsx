import React from 'react';
import { useRecording } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Recording page (§4.5). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/recording/.
 */
export default function RecordingPage() {
  const metric = useRecording();
  return <PageLayout id="recording" metric={metric} sources={['usage', 'soniox', 'config']} />;
}
