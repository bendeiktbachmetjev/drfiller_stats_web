// Copy of the Overview page (§4.1, OVERRIDES O1: plain English). Every key starts with 'overview.'.
// COPY = labels, answers, facts, notes and the empty state; DEFS = { short, long?, template? } for the (i).

export const COPY = {
  'overview.title': 'Overview',
  'overview.question': 'Is everything OK, and are we making money?',
  'overview.kpis': 'Headline numbers',

  // Verdict (AnswerBlock): the first matching line, then the plan line. {period} is common.period.*.
  'overview.verdict.revenueOff': "Income is not visible: Stripe is not connected or didn't answer. Costs {period}: {cost}.",
  'overview.verdict.plus': 'We made {result} {period}: income {income}, costs {cost}.',
  'overview.verdict.noIncomeAll': 'We lost {cost} {period}: there were no payments. All the costs went to {freeWho}.',
  'overview.verdict.noIncome': 'We lost {cost} {period}: there were no payments. {freeShare} of the costs went to {freeWho}.',
  'overview.verdict.minus': 'We lost {loss} {period}: income of {income} did not cover costs of {cost}.',
  'overview.verdict.plan': 'On the plan ({scenario}): about {r0} a month at {s0} doctors, {r1} at {s1}.',
  'overview.freeWho.internal': 'your own and test accounts and doctors on gifted credits',
  'overview.freeWho.gifted': 'doctors on gifted and free credits',

  // Tiles (labels are the owner's questions)
  'overview.tile.result': 'Are we making money?',
  'overview.tile.cost': 'Where does the money go?',
  'overview.tile.payers': 'Who pays?',
  'overview.tile.work': 'How much work?',
  'overview.tile.health': 'Is everything working?',
  'overview.result.sub': 'Costs are at list price; the real invoice is smaller for now.',
  'overview.result.off': 'Income is not visible: Stripe is not connected.',
  'overview.payers.sub': 'paying doctors cause {share} of costs',
  'overview.payers.unit': 'active doctors pay',
  'overview.cost.sub': 'costs at list price',
  'overview.health.ok': 'Yes',
  'overview.health.slow': 'Some delays',
  'overview.health.bad': 'Often slow or failing',
  'overview.health.sub': 'usually {usual}; {over15} of {forms} over 15 s',
  'overview.health.sub.failures': '{failures} failed {requests}; usually {usual}',
  'overview.split.form': 'Forms',
  'overview.split.recording': 'Recording',
  'overview.split.anamnesis': 'Medical history',
  'overview.split.fixed': 'Server',

  // The plan row (ScaleProjection, compact)
  'overview.scale.title': 'Now and on the plan',
  'overview.scale.row': 'Result per month',

  // In short (≤ 2 facts)
  'overview.short.title': 'In short',
  'overview.fact.units':
    'From each form we keep {cents} ({pct} of what a credit brings in), from 10 minutes of conversation {cents2} ({pct2}).',
  'overview.fact.formCostUp.size': 'A form got more expensive: {prev} → {cur}. The request grew to {pages} of text.',
  'overview.fact.formCostUp.era': 'A form got more expensive: {prev} → {cur}. The reason is a different model: {era}.',
  'overview.fact.formCostUp.longer': 'A form got more expensive: {prev} → {cur}. The model started writing longer answers.',
  'overview.fact.topDoctor': '{share} of the costs come from one doctor ({name}). All the averages mostly describe this doctor.',
  'overview.fact.freeCredits':
    'Doctors hold {credits} gifted and free credits. If they spend them on forms, that is ≈ {costForms} of our costs.',
  'overview.era': '{model}, {where}',

  // Right now (the quiet line at the very bottom)
  'overview.now': 'Right now: {n} {conversations} running · last form {ago}.',
  'overview.now.noForm': 'Right now: {n} {conversations} running · no forms today yet.',
  'overview.now.waiting': 'Right now: —',

  // Notes and the empty state
  'overview.note.vertexEra':
    'This period includes the week of 26 Aug – 1 Sep, when the main model was Gemini 3.7 Flash through Google Cloud in the EU. That is why speed and price are worse than usual.',
  'overview.note.limited': 'Only the last 90 days are shown: the history is too big for one load.',
  'overview.empty': 'No requests from {from} to {to}.',

  // Export
  'overview.export.summary': 'Headline numbers',
};

export const DEFS = {
  'overview.result': {
    short: 'Income minus costs for the period.',
    long: 'Income is what doctors paid through Stripe, after the Stripe fee, refunds and VAT (if the company pays it). Costs are Google’s models, speech-to-text (Soniox, OpenAI) and our share of the Railway server, at the vendors’ list prices. The list price is an upper limit: right now promo credits cover most of Google’s invoice. We convert dollars at the ECB rate: $1 = €0.8724 on 22 Sep 2026.',
  },
  'overview.cost': {
    short: 'What we owe vendors for the period: Google, Soniox, OpenAI and the server.',
    long: 'Counted at list price: how much text or sound was sent × the price from the price table. Models charge for tokens — small pieces of text of 3–4 letters. The Railway server is our share of the monthly bill for the days of the period. Costs growing together with the work is not bad in itself; what matters is the result.',
  },
  'overview.payers': {
    short: 'How many active doctors have bought credits at least once.',
    long: 'Active means the doctor made at least one request in the period. “Bought” means there is a payment in Stripe (while Stripe is not connected, we look for signs of a purchase in the balance; that is indirect). Under the number: the share of costs spent on these doctors; the rest is free work.',
  },
  'overview.work': {
    short: 'How many forms doctors got in the period.',
    long: 'A form is one press of “Generuoti” with a finished result. We count only the successful ones: a failed attempt does not take a credit.',
  },
  'overview.health': {
    short: '“Yes” — forms come fast and without failures; “Some delays” — some forms took longer than 15 s or a few requests failed; “Often slow or failing” — doctors often waited or saw errors. Counts all traffic.',
    long: '“Yes”: under 2% of forms took longer than 15 s, the backup model answered under 1% of the time and no request failed. “Often slow or failing”: at least 3 failed requests that are also at least 0.5% of all requests, or 5% of forms over 15 s. The word looks only at the normal model setup, so test days and the Google Cloud EU week (26 Aug – 1 Sep) do not keep it red; the numbers under it still count every form. A form is usually ready in 4–7 s; over 25 s almost always means the main model did not make it in time and the backup model answered. The “Without my and test accounts” switch does not apply here: your own account is real load too.',
  },
  'overview.scale': {
    short: 'Result per month now and on the plan.',
    template: 'Result per month now and on the plan: {visits} visits per doctor.',
    long: '“Now” is the real result of the period, converted to one month. The plan uses the price of a form and of a minute of recording over the last 30 days (current model setup) × the planned amount of work. It is a “what if” calculation, not a promise; the assumptions are in Settings. The full table is on the Money page.',
  },
  'overview.now': {
    short: 'What is happening right now, all accounts.',
    long: 'A conversation without “Stop” counts as open until its time limit runs out, so the number can be a little higher than the real one.',
  },
};
