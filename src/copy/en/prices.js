// Copy of the Prices page (§4.7, OVERRIDES O1: plain English). Every key starts with 'prices.'.
// COPY = labels, answers, table headers, notes; DEFS = { short, long?, template? } for the (i) hints.

export const COPY = {
  'prices.title': 'Prices',
  'prices.question': 'What would other models and Google Cloud (Vertex) cost, and how fast are they?',

  // --- Answer (§4.7) ---------------------------------------------------------------------------------
  'prices.answer.vertex': 'Moving to Vertex on its own makes forms neither cheaper nor faster.',
  'prices.answer.vertexBitFaster': 'Moving to Vertex on its own does not make forms cheaper; they would arrive only about {time} sooner.',
  'prices.answer.vertexSameModel': 'On Vertex the same model would cost {price}; speed: {speed}.',
  'prices.answer.picks': 'The fastest option with good quality is {fastest}. The cheapest with servers in the EU is {cheapestEu}.',
  'prices.answer.fastest': 'The fastest option with good quality is {fastest}.',
  'prices.answer.cheapestEu': 'The cheapest option with servers in the EU is {cheapestEu}.',
  'prices.answer.noForms': 'We have no forms of our own yet, so there is nothing to reprice. The test results and price lists are below.',
  'prices.benchCaveat':
    'Test on {date}: {n} requests from one computer in Lithuania, {runs} per option, on a made-up dictation. Trust the order of the options and how many times one is faster or dearer than another — not the exact seconds.',

  // --- Section chips ---------------------------------------------------------------------------------
  'prices.nav.summary': 'In short',
  'prices.nav.whatif': 'Options',
  'prices.nav.availability': 'Where models run',
  'prices.nav.findings': 'Test findings',
  'prices.nav.prices': 'Price lists',

  // --- Option names and comparison words ---------------------------------------------------------------
  'prices.name.direct': '{model} directly from Google',
  'prices.name.cloud': '{model} on {place}',
  'prices.cell.same': '≈ same',
  'prices.cell.more': '×{r}',
  'prices.cell.less': '−{p}',
  'prices.cell.speedSame': '≈ same',
  'prices.cell.slower': '{s} slower',
  'prices.cell.faster': '{s} faster',
  'prices.say.same': 'about the same',
  'prices.say.more': '{r} times as much',
  'prices.say.less': '{p} less',
  'prices.say.speedSame': 'about the same',
  'prices.say.slower': '{s} slower',
  'prices.say.faster': '{s} faster',
  'prices.vsNow.same': 'about the same as now',
  'prices.vsNow.more': '{r} times today’s price',
  'prices.vsNow.less': '{p} cheaper than now',
  'prices.tag.now': 'now',
  'prices.tag.backup': 'backup',
  'prices.word.yes': '✓',
  'prices.word.no': 'no',
  'prices.shutdownSoon': 'Google switches it off on {date}',

  // --- In short: if we move to Vertex -------------------------------------------------------------------
  'prices.vertexSummary.title': 'If we move to Vertex — in short',
  'prices.vertex.same':
    'The same model on Google Cloud (any country): price {price}, speed {speed}. It needs one setting changed — “barely thinks”. This model has no servers in the EU.',
  'prices.vertex.cheapestEu': 'The cheapest option with servers in the EU: {name}. A form costs {cost} ({vsNow}) and usually arrives in {time}.',
  'prices.vertex.cheapestEuSimpler':
    'The cheapest option with servers in the EU: {name}. A form costs {cost} ({vsNow}) and usually arrives in {time}. Its text is a little simpler.',
  'prices.vertex.bestEu':
    'The best quality with servers in the EU: {name}. A form costs {cost} ({vsNow}) and usually arrives in {time}. Forms only, compared to now: {diff0} a month at {s0} doctors, {diff1} at {s1}.',
  'prices.vertex.bestEuTie': 'Its quality is barely ahead of the next option ({runner}): both pass {checks} of {total} checks.',
  'prices.vertex.bestEuNarrow': 'Its quality is ahead of the next option ({runner}) by just one check out of {total}.',

  // --- Today, for comparison (tiles) ------------------------------------------------------------------------
  'prices.tile.form': 'One form, current setup',
  'prices.tile.speed': 'Current setup: a form usually takes',
  'prices.tile.perDoctor': 'Forms only, per doctor per month',
  'prices.tile.forms': 'Forms with the current setup',
  'prices.tile.sub.form': 'at list price',
  'prices.tile.sub.speed': 'half are faster',
  'prices.tile.sub.speedTest': 'from the test — too few of our forms',
  'prices.tile.sub.perDoctor': 'at {visits} visits a month',
  'prices.tile.sub.forms': 'last 30 days',

  // --- Options (#whatif) ---------------------------------------------------------------------------------------
  'prices.whatIf.title': 'Options',
  'prices.filter.label': 'Which options',
  'prices.filter.all': 'All',
  'prices.filter.eu': 'EU servers',
  'prices.filter.noFailures': 'No failures',
  'prices.year.label': 'Which prices',
  'prices.year.now': 'Prices 2026',
  'prices.year.2027': 'From 2027',
  'prices.whatIf.showAll': 'Show all {n} options',
  'prices.whatIf.showFewer': 'Show the main options only',
  'prices.whatIf.basePinned': 'Today’s setup stays in the list for comparison.',
  'prices.whatIf.prices2027': 'Prices from 1 Jan 2027: Gemini 3.6–3.8 Flash cost twice as much then.',
  'prices.whatIfMore.title': 'More per option',
  'prices.whatIfMore.legend': 'How to read the table',
  'prices.legend.thinking': '“Thinks a little”, “barely thinks”',
  'prices.col.option': 'Option',
  'prices.col.eu': 'EU servers',
  'prices.col.ratio': 'Price compared to now',
  'prices.col.speed': 'Speed compared to now',
  'prices.col.form': 'One form',
  'prices.col.perDoctor': 'Per doctor a month',
  'prices.col.checks': 'Checks passed',
  'prices.col.failed': 'No answer',
  'prices.col.scale': '{n} doctors, forms only',
  'prices.col.from2027': 'From 2027',
  'prices.col.usual': 'Usually arrives in',
  'prices.col.note': 'Test note',

  // Test notes, one per option (translated from the benchmark once).
  'prices.comboNote.gemini-3.1-flash-lite/direct+minimal':
    'Cheapest 3.x option, 4.5 s, decent text, both referrals written. Fills in the discharge field. Google switches it off on 7 May 2027.',
  'prices.comboNote.gemini-3.5-flash-lite/direct':
    'Today’s backup model. Fastest (4.6 s). Thinner medical history, odd wording in places (once an invented symptom word), adds symptom codes R05/R50.9 next to J18.9, sometimes no referral text; fills in the discharge field.',
  'prices.comboNote.gemini-3-flash-preview/direct':
    'Today’s setup. Full, well-built fields, correct doses, J18.9 pneumonia, good referral text. Breaks one of our rules every time: fills in the discharge field although nothing was dictated. “Thinks a little” gives no thinking here.',
  'prices.comboNote.gemini-3.1-flash-lite/direct':
    '“Thinks a little” makes it think a lot (about 3,500 tokens): 13 s, and 1 answer in 5 ran out of space and came back broken. Needs “barely thinks”.',
  'prices.comboNote.gemini-3.8-flash/direct':
    'Follows our rules best (discharge field left empty 5 of 5), J18.9, good referral text, 5.7 s — faster than today. About 1.3 times today’s cost, about 2.6 times from 1 Jan 2027.',
  'prices.comboNote.gemini-3.5-flash/direct':
    'Richest text (sick-leave dates, smoking code, follow-up date). Same discharge-field slip. About 3 times today’s cost. No thinking even with “thinks a little”.',
  'prices.comboNote.gemini-3.5-flash/direct+minimal': 'Same as with “thinks a little”: no thinking, same speed and quality.',
  'prices.comboNote.gemini-2.5-flash/global':
    'Steady 9.4 s. The 2.5 family is being retired (Google Cloud switches Flash off on 31 Mar 2027) and is closed to new users of the Google API — a dead end.',
  'prices.comboNote.gemini-3.5-flash-lite/global': '1 request in 5 got “no capacity” from Google; otherwise 6.5 s.',
  'prices.comboNote.gemini-3-flash-preview/global+minimal':
    'The same model on Google Cloud (any country) with “barely thinks”: no thinking, 6.4 s (a little faster than today), same price and quality. Any country only — it is not offered anywhere in the EU.',
  'prices.comboNote.gemini-3.1-flash-lite/global': '“Thinks a little”: about 3,200 thinking tokens, 15 s; 1 request in 5 got “no capacity”.',
  'prices.comboNote.gemini-3.8-flash/global': '5 of 5 answered, 9.6 s — 4 s slower than the same model on the Google API.',
  'prices.comboNote.gemini-3-flash-preview/global':
    'The same model on Google Cloud with today’s “thinks a little”: about 4,600 thinking tokens per request, so 19 s, 1 in 5 over 25 s, and 2.6 times the price. Do not move with this setting.',
  'prices.comboNote.gemini-3.5-flash/global': '2 of 5 requests hung until the 90 s limit; the 3 good ones took 8–18 s.',
  'prices.comboNote.gemini-3.5-flash-lite/eu': '5 of 5 answered, 5.8 s, but one took 14.5 s. The same lighter quality as on the Google API.',
  'prices.comboNote.gemini-3.1-flash-lite/eu':
    '“Thinks a little”: 2 answers in 5 ran out of space from runaway thinking and came back broken. “Barely thinks” was not measured on a full request here.',
  'prices.comboNote.gemini-3.7-flash/eu': '19 s, 2 of 5 over 25 s (today the backup model would step in). A short-term release, replaced by 3.8.',
  'prices.comboNote.gemini-3.8-flash/eu': '1 request in 5 got “no capacity”; 11.8 s, up to 24.8 s. Works, but slow and not fully reliable.',
  'prices.comboNote.gemini-3.5-flash/eu':
    '3 of 5 requests hung until the 90 s limit; the 2 good ones took 14 s. Not usable today (the same EU congestion as in August).',
  'prices.comboNote.gemini-2.5-flash/europe-west3':
    'Steady 6.3 s, 5 of 5 answered, follows the discharge rule, cheap. Google Cloud switches it off on 31 Mar 2027.',
  'prices.comboNote.gemini-3.5-flash/europe-west3':
    '5 of 5 answered, steady 7.9 s, top quality. The only EU place where 3.5 Flash worked well today (new since August). About 3.5 times today’s cost (+10% for the region).',
  'prices.comboNote.gemini-2.5-flash-lite/europe-west4':
    'Cheapest by far, 6.4 s, but clinically the weakest: once coded bronchitis instead of pneumonia, and writes “Anamnezėje nurodoma”, which our rules forbid (4 of 5). Switched off on 28 Jan 2027.',
  'prices.comboNote.gemini-2.5-flash/europe-west4': 'Steady 7.4 s, 5 of 5 answered. Google Cloud switches it off on 31 Mar 2027.',

  // --- Where each model runs (#availability) --------------------------------------------------------------
  'prices.availability.title': 'Where each model runs',
  'prices.place.direct': 'Google API (direct)',
  'prices.place.global': 'Any country',
  'prices.place.eu': 'EU only',
  'prices.place.europe-west4': 'Netherlands',
  'prices.place.europe-west1': 'Belgium',
  'prices.place.europe-west3': 'Frankfurt',
  'prices.placeIn.europe-west4': 'the Netherlands',
  'prices.placeIn.europe-west1': 'Belgium',
  'prices.placeIn.europe-west3': 'Frankfurt',
  'prices.placeShort.direct': 'the Google API',
  'prices.placeShort.global': '“any country”',
  'prices.placeShort.eu': '“EU only”',
  'prices.placeShort.europe-west4': 'the Netherlands',
  'prices.placeShort.europe-west1': 'Belgium',
  'prices.placeShort.europe-west3': 'Frankfurt',
  'prices.availability.yes': '✓ {sec}',
  'prices.availability.no': 'no',
  'prices.availability.runsIn': 'Runs in',
  'prices.availability.nowhere': 'Not available in any place we tested.',
  'prices.availability.fact.mainNoEu': 'Today’s main model, {model}, does not run anywhere in the EU.',
  'prices.availability.fact.no3x': 'No 3.x model runs in {places}.',

  // --- Test findings (#findings) -------------------------------------------------------------------------------
  'prices.findings.title': 'What the test showed',
  'prices.findings.vertexNoGain':
    'Moving to Vertex on its own does not make forms cheaper: Google Cloud “any country” costs the same as now, “EU only” {pct} more.',
  'prices.findings.fastest': 'The fastest option with good quality is {name}: it passed {checks} of {total} checks.',
  'prices.findings.fastest2027':
    'The fastest option with good quality is {name}: it passed {checks} of {total} checks. From 2027 it will cost about {times} times today’s price.',
  'prices.findings.thinking':
    'On Google Cloud today’s model needs the “barely thinks” setting. Without it a form would take about {time} and cost {times} times as much.',
  'prices.findings.failing': '{name} gave no answer in {n} of {total} test requests in {places} — not usable there today.',
  'prices.findings.failures':
    'Google Cloud left {cloudFailed} of {cloudRuns} test requests unanswered; the Google API (direct) left {directFailed} of {directRuns}.',
  'prices.findings.fallbackPlace':
    'On Google Cloud the backup model runs in the same place as the main one, so Frankfurt would need a code change.',

  // --- Price lists (#prices) --------------------------------------------------------------------------------------
  'prices.prices.title': 'Price lists',
  'prices.tab.label': 'Which price list',
  'prices.tab.models': 'Models',
  'prices.tab.transcription': 'Transcription',
  'prices.tab.payments': 'Payments',
  'prices.col.model': 'Model',
  'prices.col.inPerM': 'In, $/1M',
  'prices.col.outPerM': 'Out, $/1M',
  'prices.col.cloudEu': 'Google Cloud in the EU',
  'prices.col.formOurs': 'One of our forms',
  'prices.col.status': 'Status',
  'prices.col.source': 'Source',
  'prices.cloudEu.surcharge': '+{pct}',
  'prices.cloudEu.same': 'same price',
  'prices.cloudEu.none': 'not offered',
  'prices.from2027.none': 'no change',
  'prices.shutdown.direct': 'Google API: {date}',
  'prices.shutdown.cloud': 'Google Cloud: {date}',
  'prices.shutdown.notBefore': 'Google Cloud: not before {date}',
  'prices.shutdown.none': 'not announced',
  'prices.col.service': 'Service',
  'prices.col.perHour': '$ per hour',
  'prices.col.per10': 'Per 10 minutes',
  'prices.col.perDoctorRec': 'Per doctor per month, planned recording',
  'prices.col.euServers': 'EU servers',
  'prices.col.limit': 'Limit',
  'prices.eu.onRequest': 'on request, same price',
  'prices.limit.streams': '{n} conversations at once',
  'prices.service.oldSwitchOff': 'an older version is switched off on {date}',
  'prices.service.gpt-transcribe': 'OpenAI transcribe',
  'prices.service.gpt-4o-transcribe': 'OpenAI 4o-transcribe',
  'prices.service.gpt-live-transcribe': 'OpenAI live transcribe',
  'prices.service.gemini-3.5-transcribe': 'Gemini 3.5 Transcribe',
  'prices.service.gemini-3.5-transcribe-live': 'Gemini 3.5 Transcribe, live',
  'prices.col.method': 'How the doctor pays',
  'prices.col.fee': 'Fee',
  'prices.col.pack': 'Pack {n} ({price})',
  'prices.method.card_eea_standard': 'EU card, standard',
  'prices.method.card_eea_premium': 'EU card, premium',
  'prices.method.card_uk': 'UK card',
  'prices.method.card_international': 'Card from outside the EU',
  'prices.method.revolut_pay': 'Revolut Pay',
  'prices.method.paypal': 'PayPal',
  'prices.fee.rule': '{pct} + {fixed}',
  'prices.fee.parts': 'Stripe {stripe}, PayPal {paypal}',
  'prices.other.title': 'Tax, server and database',
  'prices.other.vatOff': 'VAT in Lithuania is {rate}. We don’t pay it, so no VAT is taken off income.',
  'prices.other.vatOn': 'VAT in Lithuania is {rate}. We pay it, so it comes off income.',
  'prices.other.railway': 'Server (Railway, {plan} plan): {usd} a month with {incl} of use included. Dr.Filler’s share: {share} ≈ {eur} a month.',
  'prices.other.firestore':
    'Database (Firestore): free up to {reads} reads and {writes} writes a day and {gib} GiB stored; above that {readPrice} per 100,000 reads and {writePrice} per 100,000 writes.',
  'prices.other.extras': 'Cards from outside the EU pay {conversion} extra for currency exchange; a payment dispute costs {dispute}.',
  'prices.checked.server': 'Prices checked on {date}. Source: the server’s price list.',
  'prices.checked.static': 'Prices checked on {date}. Source: the built-in copy from {date}.',

  // --- Notes and empty states -----------------------------------------------------------------------------------------
  'prices.note.fewForms': 'Only {n} of our forms in the last 30 days (fewer than {min}): the form size comes from Settings and the speed from the test.',
  'prices.note.setupChanged':
    'Today’s setup ({model}, {place}) is not the one in the test, so the options are compared with Gemini 3 Flash via the Google API (direct).',
  'prices.note.unknownPrice': 'Some models are missing from our price list; for them we used the test’s own prices.',
  'prices.note.noTest': 'The test results are missing, so there is nothing to compare.',
  'prices.empty.title': 'No forms of ours yet',
  'prices.empty.hint': 'Statistics start on {date}. When forms arrive, this part prices them on every option.',
  'prices.export.options': 'Options',
  'prices.export.availability': 'Where each model runs',
  'prices.export.models': 'Model prices',
  'prices.export.transcription': 'Transcription prices',
  'prices.export.payments': 'Payment fees',
};

export const DEFS = {
  'prices.vertexSummary': {
    short: 'What would change if we moved to Vertex, in three lines.',
    long: 'Vertex is the same Gemini, but through Google Cloud. There you can choose where the data is processed, for example only in the EU. Prices: our real forms of the last 30 days × the option’s price list. Speed: our usual time × how many times faster or slower the option was in the test.',
  },
  'prices.whatIf': {
    short: 'Our real forms, repriced at the prices and speed of other options. Forms only, no recording.',
    long: 'Price: our tokens × the option’s price list; on Google Cloud “EU only” and single countries add 10% for stable models. The answer size is adjusted for how much the option writes and “thinks” in the test. Speed: our usual time × how many times faster or slower the option was in the test.',
  },
  'prices.ratio': {
    short: 'How many times a form costs more or less than now.',
    long: '“≈ same” — the difference is under 10%.',
  },
  'prices.speed': {
    short: 'How much later or sooner a form would arrive than now.',
    long: '“≈ same” — the difference is under half a second.',
  },
  'prices.quality': {
    short: 'How many of 14 checks the answer passed on one made-up dictation. Not a clinical rating.',
    long: 'Checks: the answer structure is whole, all fields are there, doses and prescriptions are kept, the diagnosis has a code, the grammatical gender is right, the discharge field stays empty, and other rules of our instructions.',
  },
  'prices.benchFailures': {
    short: 'How many of the 5 test requests got no answer: “no capacity” or a hang.',
  },
  'prices.from2027': {
    short: 'The price after 1 Jan 2027: for Gemini 3.6–3.8 Flash it doubles.',
  },
  'prices.thinking': {
    short: '“Thinking” — the model’s hidden reasoning before it answers. We pay for it like for the answer.',
    long: '“Barely thinks” almost turns it off, “thinks a little” allows a little. On Google Cloud the same setting gives a different amount of it.',
  },
  'prices.availability': {
    short: 'Whether the model runs in each Google location (test on 23 Sep 2026).',
    long: '“Google API (direct)” — as now. “Any country” — Google Cloud without choosing a country. “EU only” — servers only in the EU. The Netherlands, Belgium and Frankfurt are single locations. The seconds are the reply time of a tiny test request, not of a form.',
  },
  'prices.findings': {
    short: 'What the test showed, in plain words. Money and time are counted on our own forms.',
  },
  'prices.prices': {
    short: 'Prices from the vendors’ websites. For models — $ per million tokens.',
    long: '“In, $/1M” is the price of 1 million tokens we send (the request); “Out, $/1M” of 1 million tokens the model writes back. Under the status: when Google switches the model off. We convert dollars to euros once, at the ECB rate. The (i) of every cost tile names the rate.',
  },
  'prices.transcription': {
    short: 'What recording costs with each service.',
    template: 'What recording costs with each service. Per doctor per month: all {minutes} minutes of recording from the plan in Settings, at this service’s price.',
  },
  'prices.payments': {
    short: 'What the payment provider keeps from each pack.',
    long: 'Stripe takes a share plus a fixed amount from every payment. With PayPal, PayPal takes its own fee on top of Stripe’s.',
  },
  'prices.form': {
    short: 'What one of our forms costs now at list price: last 30 days, current model setup, all accounts.',
    long: 'Forms with conversation text are left out: their extra text is counted per minute of recording. This is the same form price the plan uses everywhere.',
  },
  'prices.usual': {
    short: 'How long a form usually takes with the current setup (the median of the last 30 days).',
    long: 'Half of the forms arrive faster, half slower. Every option’s time is this number × how many times faster or slower it was in the test.',
  },
  'prices.perDoctor': {
    short: 'One form × the visits a doctor has in a month — forms only, without recording.',
    template: 'One form × {visits} visits a month (Settings) — forms only, without recording.',
    long: 'The Costs and Money pages show the whole visit, with recording; that number is bigger.',
  },
  'prices.forms': {
    short: 'How many of our forms the prices and times on this page are based on.',
    long: 'Only the main model via the Google API, last 30 days, all accounts, without conversation text. Under 20 forms we use the form size from Settings and the time from the test.',
  },
};
