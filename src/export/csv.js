// CSV export for Lithuanian Excel: ';' delimiter, decimal comma, CRLF, UTF-8 BOM on download (SimuFlow).
// toCsv and csvFilename are pure (they run in the Node tests); downloadCsv is the only
// function here that touches the browser, and only when called.

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

let vilnius = null;

// Instants are written as Vilnius wall-clock time, whatever the browser's zone.
const toLocalDate = (value) => {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return { day: value, time: '00:00' };
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  vilnius ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vilnius', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  });
  const parts = vilnius.formatToParts(d);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    day: `${get('year')}-${pad2(get('month'))}-${pad2(get('day'))}`,
    time: `${pad2(get('hour'))}:${pad2(get('minute'))}`,
  };
};

// Spreadsheet formula injection: a text cell must not start with = + - @ (or tab / CR).
const guardFormula = (text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const quoteIfNeeded = (text, delimiter) =>
  (text.includes(delimiter) || /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

const formatNumber = (value, decimal) => {
  let text = String(value);
  if (/e/i.test(text)) text = value.toFixed(10).replace(/\.?0+$/, '');
  return text.replace('.', decimal);
};

const formatCell = (value, type, decimal) => {
  if (value === null || value === undefined) return '';
  if (type === 'date' || type === 'datetime') {
    const local = toLocalDate(value);
    if (local) return type === 'date' ? local.day : `${local.day} ${local.time}`;
    return guardFormula(String(value));
  }
  if (type === 'int' || type === 'num' || type === 'pct') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '';
      return formatNumber(type === 'int' ? Math.round(value) : value, decimal);
    }
    return guardFormula(String(value)); // a placeholder such as "—" stays text
  }
  // A real number can never be a formula, whatever column it sits in.
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value, decimal) : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return guardFormula(value.join(', '));
  return guardFormula(String(value));
};

// rows: objects; columns: [{ key, header, type: 'text'|'int'|'num'|'pct'|'date'|'datetime' }].
// Percentages are plain numbers (their header ends in _pct); dates are ISO YYYY-MM-DD.
// No BOM here — downloadCsv adds it.
export const toCsv = (rows, columns, options = {}) => {
  const { delimiter = ';', decimal = ',', eol = '\r\n' } = options;
  const cols = columns || [];
  const lines = [cols.map((col) => quoteIfNeeded(guardFormula(String(col.header ?? col.key)), delimiter))];
  (rows || []).forEach((row) => {
    lines.push(cols.map((col) => quoteIfNeeded(formatCell(row?.[col.key], col.type, decimal), delimiter)));
  });
  return lines.map((cells) => cells.join(delimiter)).join(eol) + eol;
};

const slug = (text) => String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const dayBefore = (dateStr) => {
  const d = new Date(Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)) - 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

// drfiller_{section}_{table}_{from}_{to}.csv — `to` is the last day INCLUDED in the period.
export const csvFilename = (section, table, period) =>
  `drfiller_${slug(section)}_${slug(table)}_${period.from}_${dayBefore(period.to)}.csv`;

// Browser only. The BOM makes Excel read UTF-8 (ė, š, ž) correctly.
export const downloadCsv = (filename, csv) => {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
