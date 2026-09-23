// Copy of the Doctors page (§4.8, OVERRIDES O1: plain English). Every key starts with 'doctors.'.
// COPY = labels, answers, empty states, table headers, takeaways; DEFS = { short, long?, template? }
// for the (i) hints (hintKey 'doctors.<key>').

export const COPY = {
  'doctors.title': 'Doctors',
  'doctors.question': 'Who uses Dr.Filler, who pays, and what does each doctor cost us?',

  // --- Answer (§4.8) ------------------------------------------------------------------------------
  'doctors.answer': 'Active doctors: {active}, paying: {paying}. {top} made {share} of the costs.',
  'doctors.answer.noCost': 'Active doctors: {active}, paying: {paying}.',
  'doctors.answer.funnel': 'Since the start, {registered} signed up, {used} made at least one request and {bought} bought credits.',
  'doctors.empty': 'No doctor made a request from {from} to {to}.',

  // --- Tiles -----------------------------------------------------------------------------------------
  'doctors.tile.active': 'Active doctors',
  'doctors.tile.active.sub': 'of {n} signed up',
  'doctors.tile.new': 'New doctors',
  'doctors.tile.new.sub': '{n} made a request',
  'doctors.tile.paying': 'Paying doctors',
  'doctors.tile.paying.sub': '{n} paying in total',
  'doctors.tile.topShare': 'Busiest doctor’s share of costs',

  // --- Costs by account type -------------------------------------------------------------------------
  'doctors.byClass.title': 'Costs by account type',
  'doctors.byClass.internal': 'Mine and test',
  'doctors.byClass.gifted': 'Gift',
  'doctors.byClass.free': 'Free 15',
  'doctors.byClass.paid': 'Paying',
  'doctors.byClass.other': 'Other',
  'doctors.byClass.lead.internal': 'Your own and test accounts made {share} of the costs.',
  'doctors.byClass.lead.gifted': 'Gift accounts made {share} of the costs — they do not pay for it.',
  'doctors.byClass.lead.free': 'Accounts on the 15 free credits made {share} of the costs.',
  'doctors.byClass.lead.paid': 'Paying doctors made {share} of the costs.',
  'doctors.byClass.lead.other': 'Deleted and unknown accounts made {share} of the costs.',
  'doctors.byClass.none': 'No costs in this period.',

  // --- The doctor's path -----------------------------------------------------------------------------
  'doctors.funnel.title': 'The doctor’s path',
  'doctors.funnel.registered': 'Signed up',
  'doctors.funnel.used': 'Made a request',
  'doctors.funnel.active30': 'Recently active',
  'doctors.funnel.bought': 'Bought credits',
  'doctors.funnel.unit': 'doctors',

  // --- "Is this your account?" ------------------------------------------------------------------------
  'doctors.suggestion': '{name} made {share} of all forms. Is this your account?',
  'doctors.suggestion.yes': 'Mark as mine',
  'doctors.suggestion.no': 'No',

  // --- Plan line -------------------------------------------------------------------------------------
  'doctors.planLine': 'In the plan ({scenario}), one doctor costs {plan} a month. The busiest doctor now costs {top} a month.',
  'doctors.planLine.noTop': 'In the plan ({scenario}), one doctor costs {plan} a month.',
  'doctors.planLine.edit': 'Change the plan',

  // --- Table -----------------------------------------------------------------------------------------
  'doctors.table.title': 'Doctors',
  'doctors.view.label': 'Which doctors',
  'doctors.view.active': 'Active',
  'doctors.view.all': 'All ({n})',
  'doctors.search.label': 'Search doctors',
  'doctors.search.placeholder': 'Email, code or specialty',
  'doctors.columns.more': 'More columns',
  'doctors.columns.fewer': 'Fewer columns',
  'doctors.col.doctor': 'Doctor',
  'doctors.col.type': 'Type',
  'doctors.col.specialty': 'Specialty',
  'doctors.col.forms': 'Forms',
  'doctors.col.recording': 'Recording',
  'doctors.col.runs': 'History summaries',
  'doctors.col.cost': 'Costs',
  'doctors.col.costMonth': 'Costs per month',
  'doctors.col.costShare': 'Share of costs',
  'doctors.col.income': 'Income',
  'doctors.col.result': 'Result',
  'doctors.col.balance': 'Credits left',
  'doctors.col.counter': 'Recording counter',
  'doctors.col.last': 'Last active',
  'doctors.col.since': 'With us since',
  'doctors.col.mine': 'Mine / test',
  'doctors.table.emptyActive': 'No doctor made a request in this period. “All” lists every account.',
  'doctors.table.emptySearch': 'No doctor matches “{q}”.',
  'doctors.noAccount': 'No account',
  'doctors.last.never': 'never',
  'doctors.last.title': 'Last request: {when}',

  // --- Mine / test toggle and email ------------------------------------------------------------------
  'doctors.mine.aria': '{name} is my own or test account',
  'doctors.mine.locked': 'Set on the server',
  'doctors.mine.onTitle': 'Counted as your own or test account. Untick to count it as a doctor again.',
  'doctors.mine.offTitle': 'Tick if this is your own or a test account, so the switch can hide it.',
  'doctors.mine.lockedTitle': 'Marked on the server. It cannot be changed here.',
  'doctors.mine.savedOn': 'Saved. “Without my and test accounts” now hides this account; “All accounts” shows it again.',
  'doctors.mine.savedOff': 'Saved. This account counts as a doctor again.',
  'doctors.mine.error': 'Not saved: {reason} Please try again.',
  'doctors.email.show': 'Show email',
  'doctors.email.error': 'Could not show the email: {reason}',

  // --- Notes -----------------------------------------------------------------------------------------
  'doctors.note.noIncome': 'Stripe is not connected, so “Income” and “Result” are empty. Paying doctors are guessed from their balances.',
  'doctors.note.shortPeriod': '“Costs per month” needs at least {days} days. Pick a longer period to see it.',
  'doctors.note.oneDoctor': 'One doctor made {share} of the costs, so the averages on this panel mostly describe one person.',
  'doctors.note.fixed': 'Server costs ({fixed}) are not split between doctors. So the doctors’ results add up to more than the total result.',
  'doctors.note.deleted': 'Deleted accounts keep their history in one line, “Deleted account”.',

  // --- Export ----------------------------------------------------------------------------------------
  'doctors.export.table': 'Doctors',
  'doctors.export.byClass': 'Costs by account type',
  'doctors.export.funnel': 'The doctor’s path',
};

export const DEFS = {
  'doctors.active': { short: 'Doctors who made at least one request in the period.' },
  'doctors.new': { short: 'Accounts that signed up in the period.' },
  'doctors.paying': {
    short: 'Active doctors who have bought credits at least once.',
    long: 'Bought means there is a payment in Stripe. While Stripe is not connected, we guess it from the balance (indirect).',
  },
  'doctors.topShare': {
    short: 'How much of the costs came from the one busiest doctor.',
    template: 'How much of the costs came from the one busiest doctor: {name}.',
    long: 'If it is more than half, every average on this panel mostly describes one person.',
  },
  'doctors.byClass': {
    short: 'Who creates the costs: paying doctors or free accounts.',
    long:
      'Paying: there is a payment. Gift: credits were added by hand, the old plan, or “purchase not found” (the balance looks bought, but Stripe has no payment). Free 15: only the 15 credits every new account gets. Mine and test: marked in the table below. Server costs are not split by account.',
  },
  'doctors.table': {
    short: 'Each doctor: what they did, what they brought in and what they cost.',
    long:
      'Doctors are shown by email; without one, as “Doctor NN”, numbered by signup date. The code next to it (D-XXXX) never changes. “Income” is what the doctor’s payments brought in after the Stripe fee, refunds and VAT. “Result” is income minus costs; server costs are not split between doctors. “Recording counter” is recorded minutes not charged yet: every full 10 minutes costs 1 credit.',
  },
  'doctors.costPerMonth': {
    short: 'A doctor’s costs, recalculated to one month.',
    long: 'Compare it with the plan: the plan is a doctor who records every visit the way it is set in Settings.',
  },
  'doctors.funnel': {
    short: 'How many doctors got from signing up to buying credits (since the start).',
    long: 'Recently active: made a request in the last 30 days. Bought credits: paid through Stripe at least once.',
  },
};
