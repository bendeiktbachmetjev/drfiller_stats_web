import React from 'react';
import { Card, CardHeader } from '../../ui/index.js';

/**
 * A card with a title row around a table or a list (the tables of §4.6 that are not a chart twin).
 *   title, icon, hintKey  as in CardHeader (hintKey: DEFS short as the subtitle, long in the (i))
 *   id                    anchor for SectionNav / alert links
 */
export default function TableCard({ id, title, icon, hintKey, right, children, className = '' }) {
  return (
    <Card id={id} padding="none" className={['min-w-0 p-4 sm:p-6 lg:p-8', className].filter(Boolean).join(' ')}>
      <CardHeader title={title} icon={icon} hintKey={hintKey} right={right} />
      {children}
    </Card>
  );
}
