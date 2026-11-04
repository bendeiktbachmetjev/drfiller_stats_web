// Copy of the Clinics page (OVERRIDES O1: plain English). Every key starts with 'clinics.'.
// COPY = labels, answers, empty states, table headers; DEFS = { short, long? } for the (i) hints.

export const COPY = {
  'clinics.title': 'Clinics',
  'clinics.question': 'Which clinics pay for their doctors, how much did each doctor use, and what do we invoice?',
  'clinics.scopeLine': '{range} · {clinic}',

  // --- Answer ------------------------------------------------------------------------------------------
  'clinics.answer.invoice': '{name}: {credits} credits from {from} to {to}. To invoice: {amount}.',
  'clinics.answer.invoiceNoPrice': '{name}: {credits} credits from {from} to {to}. Set the price of one credit to see the amount.',
  'clinics.answer.prepaid': '{name}: {credits} credits used from {from} to {to}. Credits left: {left}.',
  'clinics.answer.none': 'No clinic yet. Create one, then add its doctors.',
  'clinics.answer.pick': 'Pick a clinic to see its doctors and usage.',
  'clinics.answer.paused': '{name} is paused: its doctors use their own credits.',

  // --- Picker ------------------------------------------------------------------------------------------
  'clinics.pick.label': 'Clinic',
  'clinics.new': 'New clinic',
  'clinics.billing.invoice': 'Invoice',
  'clinics.billing.prepaid': 'Prepaid credits',
  'clinics.paused': 'Paused',
  'clinics.members': '{n} doctors',
  'clinics.empty.title': 'No clinics yet',
  'clinics.empty.hint': 'A clinic pays for the doctors you add to it: by invoice at the end of the month, or from credits it bought.',
  'clinics.demo': 'Clinics are not in the demo data. Use the mock server (npm run dev:mock) or the live site.',
  'clinics.loadError': 'The clinic list did not load. Reload the page.',

  // --- Form (new / edit) ------------------------------------------------------------------------------
  'clinics.form.newTitle': 'New clinic',
  'clinics.form.editTitle': 'Edit {name}',
  'clinics.form.name': 'Name',
  'clinics.form.namePlaceholder': 'e.g. Kauno klinika',
  'clinics.form.billing': 'How it pays',
  'clinics.form.billing.invoice': 'Invoice at month end',
  'clinics.form.billing.prepaid': 'Prepaid credits',
  'clinics.form.billingHint.invoice': 'Nothing is taken from anyone: every credit is counted, and you invoice the clinic for the month.',
  'clinics.form.billingHint.prepaid': 'The clinic buys credits; all its doctors use them. You add them below.',
  'clinics.form.price': 'Price of one credit, €',
  'clinics.form.pricePlaceholder': 'e.g. 0.04',
  'clinics.form.priceHint': 'For the invoice amount. Leave empty until the contract sets it.',
  'clinics.form.cap': 'Limit per doctor per month, credits',
  'clinics.form.capHint': 'A safety brake: a doctor who reaches it is stopped until the next month. A busy month is about 600–1,000.',
  'clinics.form.note': 'Note (optional)',
  'clinics.form.notePlaceholder': 'e.g. contract no., contact person',
  'clinics.form.active': 'The clinic pays for its doctors',
  'clinics.form.activeHint': 'Off = paused: its doctors use their own credits until you switch it on again.',
  'clinics.form.save': 'Save',
  'clinics.form.create': 'Create clinic',
  'clinics.form.cancel': 'Cancel',
  'clinics.form.bad.name': 'Enter a name (up to 120 characters).',
  'clinics.form.bad.price': 'Enter a price from 0 to 10 €, at most 4 decimals (e.g. 0.035).',
  'clinics.form.bad.cap': 'Enter a whole number from 1 to 100,000.',
  'clinics.form.saved': 'Saved.',
  'clinics.form.error': 'Not saved: {reason} Please try again.',

  // --- Header of the chosen clinic ---------------------------------------------------------------------------
  'clinics.head.price': '{price} a credit',
  'clinics.head.noPrice': 'No price set',
  'clinics.head.cap': 'limit {n} credits a doctor a month',
  'clinics.head.edit': 'Edit',
  'clinics.head.pause': 'Pause',
  'clinics.head.resume': 'Switch on',
  'clinics.head.pauseConfirm': 'Pause {name}? Its doctors will use their own credits until you switch it on again.',
  'clinics.head.delete': 'Delete',
  'clinics.head.deleteHasDoctors': 'Take the clinic’s {n} doctors out first (the button next to each doctor below).',
  'clinics.head.deleteConfirm': 'Delete {name}? It leaves the list; its usage and payments stay for your records.',
  'clinics.head.deleteCreditsLeft': 'It still has {n} credits left.',

  // --- Tiles ---------------------------------------------------------------------------------------------
  'clinics.tile.credits': 'Credits used',
  'clinics.tile.credits.sub': '{forms} forms · {minutes} recorded',
  'clinics.tile.amount': 'To invoice',
  'clinics.tile.amount.sub': 'at {price} a credit · {paid} paid for its months',
  'clinics.tile.amount.none': 'set the price of one credit',
  'clinics.tile.left': 'Credits left',
  'clinics.tile.left.sub': '{used} of {total} used since the start',
  'clinics.tile.doctors': 'Doctors',
  'clinics.tile.doctors.sub': '{n} used it in this period',
  'clinics.tile.cost': 'Costs',
  'clinics.tile.cost.sub': 'Result: {result}',

  // --- Doctors table --------------------------------------------------------------------------------------
  'clinics.doctors.title': 'Doctors of the clinic',
  'clinics.col.doctor': 'Doctor',
  'clinics.col.forms': 'Forms',
  'clinics.col.recording': 'Recording',
  'clinics.col.recordingCredits': 'Recording credits',
  'clinics.col.history': 'History credits',
  'clinics.col.refunded': 'Given back',
  'clinics.col.credits': 'Credits',
  'clinics.col.amount': 'Amount',
  'clinics.col.days': 'Days used',
  'clinics.col.remove': 'In clinic',
  'clinics.doctors.formerly': 'left the clinic',
  'clinics.doctors.empty': 'No doctors yet. Add them below or on the Doctors page.',
  'clinics.doctors.total': 'Total',
  'clinics.remove': 'Take out',
  'clinics.removeAria': 'Take {name} out of the clinic',
  'clinics.removeConfirm': 'Take {name} out of {clinic}? From now on they use their own credits.',

  // --- Add doctors -------------------------------------------------------------------------------------------
  'clinics.add.title': 'Add doctors',
  'clinics.add.lead': 'The clinic pays for a doctor from the moment you add them. Their own credits stay for later.',
  'clinics.add.search': 'Search by email or code',
  'clinics.add.none': 'No doctor matches “{q}”.',
  'clinics.add.button': 'Add',
  'clinics.add.move': 'Move here',
  'clinics.add.inOther': 'now in {clinic}',
  'clinics.add.moveConfirm': 'Move {name} from {from} to {to}?',
  'clinics.add.done': '{name} added.',
  'clinics.add.error': 'Not changed: {reason} Please try again.',

  // --- By day ------------------------------------------------------------------------------------------------
  'clinics.days.title': 'By day',
  'clinics.col.day': 'Day',
  'clinics.col.dayDoctors': 'Doctors',

  // --- Money by hand (top-ups and month payments) -------------------------------------------------
  'clinics.money.credits': 'How many credits',
  'clinics.money.other': 'Other amount',
  'clinics.money.badCredits': 'Enter a whole number from 1 to {max}.',
  'clinics.money.price': 'Paid, €',
  'clinics.money.pricePlaceholder': 'e.g. 28',
  'clinics.money.priceHint': '0 = free.',
  'clinics.money.perCredit': '{price} a credit.',
  'clinics.money.badPrice': 'Enter euros, at most 2 decimals (0 = free).',
  'clinics.money.note': 'Note (optional)',
  'clinics.money.notePlaceholder': 'e.g. invoice 12, bank transfer',
  'clinics.money.add': 'Add {n} credits',
  'clinics.money.confirm': 'Add {n} credits to {name} for {price}?',
  'clinics.money.confirmFree': 'Add {n} credits to {name} for free?',
  'clinics.money.yes': 'Yes, add',
  'clinics.money.cancel': 'Cancel',
  'clinics.money.done': 'Added {n} credits. Credits left: {left}.',
  'clinics.money.error': 'Not saved: {reason} Please try again.',

  // --- Top-ups of a prepaid clinic ---------------------------------------------------------------------
  'clinics.topups.title': 'Credits bought',
  'clinics.topups.summary': 'In this period: {credits} credits bought for {paid} (on average {avg} a credit). Its doctors used {used} credits. Left now: {left}.',
  'clinics.topups.date': 'Date',
  'clinics.topups.paid': 'Paid',
  'clinics.topups.perCredit': 'A credit',
  'clinics.topups.note': 'Note',
  'clinics.topups.empty': 'No credits bought in this period.',

  // --- Months of an invoiced clinic ------------------------------------------------------------------------
  'clinics.months.title': 'Months',
  'clinics.months.summary': '{credits} credits = {invoiced} at the clinic’s price. Paid: {paid} (on average {avg} a credit). Not paid yet: {unpaid}.',
  'clinics.months.month': 'Month',
  'clinics.months.invoiced': 'To invoice',
  'clinics.months.paid': 'Paid',
  'clinics.months.status': 'Status',
  'clinics.months.state.paid': 'Paid',
  'clinics.months.state.part': 'Paid in part',
  'clinics.months.state.open': 'Not paid',
  'clinics.months.state.none': 'No price',
  'clinics.months.mark': 'Mark paid',
  'clinics.months.edit': 'Edit',
  'clinics.months.editTitle': 'Paid for {month}',
  'clinics.months.amount': 'Paid, €',
  'clinics.months.notePlaceholder': 'e.g. bank transfer, invoice no.',
  'clinics.months.save': 'Save',
  'clinics.months.remove': 'Remove',
  'clinics.months.removeConfirm': 'Remove the payment for {month}?',

  // --- Export --------------------------------------------------------------------------------------------
  'clinics.export.doctors': 'Doctors of the clinic',
  'clinics.export.days': 'By day',

  // --- Usage loading ---------------------------------------------------------------------------------------
  'clinics.usage.loading': 'Loading the usage…',
  'clinics.usage.error': 'The usage did not load: {reason}',
  'clinics.usage.retry': 'Try again',
  'clinics.footnote': 'Credits are counted the moment a doctor of the clinic uses them, so a doctor who changed clinics shows in each one only for their own time there. Costs are for the doctors in the clinic now.',
};

export const DEFS = {
  'clinics.tile.credits': {
    short: 'Every credit the clinic’s doctors used in this period, after the ones given back for failed requests.',
    long: 'A form is 1 credit; every full 10 minutes of recording is 1 credit (the minutes add up across recordings); a history summary is 1–40 credits by its size.',
  },
  'clinics.tile.amount': {
    short: 'Credits used × the price of one credit in the clinic’s settings.',
  },
  'clinics.tile.left': {
    short: 'The clinic’s own credits. Every doctor of the clinic uses them; when they run out, the doctors are stopped until you add more.',
  },
  'clinics.tile.cost': {
    short: 'What Google and Soniox charged us for the requests of the clinic’s doctors in this period (list price).',
    long: 'It counts the doctors who are in the clinic now, also for days before they joined.',
  },
  'clinics.doctors': {
    short: 'Each doctor’s credits in this period, and the amount at the clinic’s price.',
  },
  'clinics.months': {
    short: 'Whole months — every month the period touches, in full. What the clinic’s doctors used, the amount at its price, and what it paid. Mark a month paid when the money arrives.',
  },
  'clinics.topups': {
    short: 'The credits the clinic bought, with what it paid for each lot.',
  },
};
