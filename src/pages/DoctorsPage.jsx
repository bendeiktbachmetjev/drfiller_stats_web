import React from 'react';
import { useDoctors } from '../context/AnalyticsContext.jsx';
import { PageLayout } from '../ui/index.js';

/**
 * Doctors page (§4.8). Owned by its page package; F0 stub: the fixed top of the page (PageLayout)
 * with a placeholder answer. Page-private components go to src/pages/doctors/.
 */
export default function DoctorsPage() {
  const metric = useDoctors();
  return <PageLayout id="doctors" metric={metric} sources={['usage', 'revenue']} />;
}
