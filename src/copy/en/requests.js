// Copy of the Requests page (§4.4, OVERRIDES O1: plain English). Every key starts with 'requests.'.
// COPY = labels, answers, empty states, table headers; DEFS = { short, long? } for the (i) hints
// (hintKey 'requests.<key>'). Values are filled after formatting, so placeholders hold ready text.

export const COPY = {
  'requests.title': 'Requests',
  'requests.question': 'Which requests are big, which are small, and what does each one cost?',

  // --- Answer --------------------------------------------------------------------------------------
  'requests.answer.byType':
    'The biggest requests are the medical history summary ({anam}) and a long conversation ({live}). A form costs {form}, but there are far more forms, so they take {share} of the costs.',
  'requests.answer.byTypeNoAnam':
    'The biggest request is a 15-minute conversation ({live}). A form costs {form}, but there are far more forms, so they take {share} of the costs.',
  'requests.answer.size': 'An average form sends {pages} of text to the model ({tokens} tokens).',
  'requests.answer.base.most':
    "Almost all of it is our instructions and the patient's history from the page; the doctor's own words are only about {chars} characters.",
  'requests.answer.base.part':
    "{share} of it is our instructions and the patient's history; the rest is what the doctor said or typed, about {chars} characters on average.",
  'requests.answer.empty': 'No requests from {from} to {to}.',

  // --- Sections ------------------------------------------------------------------------------------
  'requests.nav.bytype': 'What one request costs',
  'requests.nav.size': 'Size of forms',
  'requests.nav.anamnesis': 'Medical history',
  'requests.section.bytype': 'What one request costs',
  'requests.section.size': 'How big the forms are',
  'requests.section.anamnesis': 'Medical history summary',

  // --- What one request costs ----------------------------------------------------------------------
  'requests.byType.title': 'Price of one request',
  'requests.type.form': 'Form',
  'requests.type.form.unit': 'one form',
  'requests.type.dictation': 'Dictation',
  'requests.type.dictation.unit': '1 minute',
  'requests.type.live': 'Conversation',
  'requests.type.live.unit': '15 minutes',
  'requests.type.anamnesis': 'History summary',
  'requests.type.anamnesis.unit': 'one summary',
  'requests.type.summaryV1': 'Old PDF summary',
  'requests.type.summaryV1.unit': 'one summary, old way',
  'requests.type.sub': '{count} · {eur} in total',
  'requests.type.dictationCount': '{n} {unit}, {min}',
  'requests.type.forecast.form': 'no forms in this period — plan price',
  'requests.type.forecast.dictation': 'no dictations in this period — Soniox price',
  'requests.type.forecast.live': 'fewer than 20 conversations — forecast',
  'requests.type.none.anamnesis': 'no summaries in this period',
  'requests.unit.dictation.one': 'dictation',
  'requests.unit.dictation.other': 'dictations',
  'requests.unit.summary.one': 'summary',
  'requests.unit.summary.other': 'summaries',
  'requests.unit.call.one': 'call',
  'requests.unit.call.other': 'calls',

  // --- Size of forms -------------------------------------------------------------------------------
  'requests.tile.promptMean': 'Average request',
  'requests.tile.promptMean.sub': '{pages} of text',
  'requests.tile.outputMean': 'Average answer',
  'requests.tile.outputMean.sub': '{pages} of text',
  'requests.tile.baseTokens': 'Instructions + history',
  'requests.tile.baseTokens.sub': '{share} of the average request',
  'requests.tile.baseTokens.few': 'needs {needed} forms, there are {n}',
  'requests.tile.bigShare': 'Big requests',
  'requests.tile.bigShare.sub': '{share} of form costs',

  'requests.sizeBuckets.title': 'Big and small forms',
  'requests.sizeBuckets.forms': 'Share of forms',
  'requests.sizeBuckets.cost': 'Share of costs',
  'requests.size.pages.first': 'Up to {to} pages',
  'requests.size.pages.middle': '{from}–{to} pages',
  'requests.size.pages.last': 'Over {from} pages',
  'requests.size.tokens.first': 'up to {to}k tokens',
  'requests.size.tokens.middle': '{from}–{to}k tokens',
  'requests.size.tokens.last': 'over {from}k tokens',
  'requests.monthLink.lead': 'How the request grew month by month:',
  'requests.monthLink.link': 'see Costs',

  'requests.bySegment.title': 'Whose forms cost more',
  'requests.bySegment.choose': 'Group doctors',
  'requests.segment.specialty': 'By specialty',
  'requests.segment.detail': 'By form detail',
  'requests.segment.other': 'Others',
  'requests.segment.detailed': 'Detailed forms',
  'requests.segment.concise': 'Short forms',
  'requests.segment.sub': '{forms} · {doctors} · {pages}',

  'requests.priciest.title': 'The most expensive forms',
  'requests.col.when': 'When',
  'requests.col.doctor': 'Doctor',
  'requests.col.model': 'Model',
  'requests.col.pages': 'Request, pages',
  'requests.col.answer': 'Answer, tokens',
  'requests.col.words': "Doctor's words, characters",
  'requests.col.time': 'Time',
  'requests.col.price': 'Price',

  // --- Medical history summary ---------------------------------------------------------------------
  'requests.tile.anamRuns': 'Summaries made',
  'requests.tile.anamRuns.old': '{n} of them the old PDF way',
  'requests.tile.anamRuns.calls': '{n} model calls',
  'requests.tile.anamCostPerRun': 'Cost of one summary',
  'requests.tile.anamCostPerRun.sub': 'a typical summary',
  'requests.tile.anamCreditsPerRun': 'Credits per summary',
  'requests.tile.anamCreditsPerRun.sub': '{eur} for us after fees',
  'requests.tile.anamLeft': 'Kept, %',
  'requests.tile.anamLeft.sub': 'packs as in the plan',
  'requests.anamnesis.emptyTitle': 'No summaries in this period',
  'requests.anamnesis.emptyHint': 'The medical history summary started on {date}.',

  'requests.anamSteps.title': 'Where the money for summaries goes',
  'requests.step.extractFast': 'Facts: fast model',
  'requests.step.extractStrong': 'Facts: strong model',
  'requests.step.narrative': 'Final text',
  'requests.step.summary': 'Old PDF way',

  'requests.anamRunsTable.title': 'Summaries',
  'requests.anamRunsTable.latest': 'The latest {n} summaries.',
  'requests.col.start': 'Start',
  'requests.col.way': 'Way',
  'requests.col.calls': 'Calls',
  'requests.col.docs': 'Documents',
  'requests.col.facts': 'Facts',
  'requests.col.cost': 'Costs',
  'requests.col.credits': 'Credits',
  'requests.col.left': 'Kept, %',
  'requests.col.cut': 'Cut off',
  'requests.way.v1': 'old PDF',
  'requests.way.v2': 'new text',
  'requests.cut.yes': 'yes',

  // --- Notes and export ----------------------------------------------------------------------------
  'requests.note.testDay': 'Forms from 1 Sep 2026, a day of model tests, count as neither the main nor the backup model: {n}.',
  'requests.note.capped': "Forms that hit the 3,000-character limit for the doctor's text: {n}.",
  'requests.export.byType': 'Price of one request',
  'requests.export.sizeBuckets': 'Big and small forms',
  'requests.export.priciest': 'The most expensive forms',
  'requests.export.anamRuns': 'Medical history summaries',
};

export const DEFS = {
  'requests.byType': {
    short: 'The average price of one request of each kind in this period.',
    long: 'Forms and medical history summaries: from the real requests of the period. Dictation and conversation: the price of a minute × a usual length. While there are fewer than 20 conversations, the conversation price is a forecast: 15 minutes of Soniox plus the conversation text that goes into the form.',
  },
  'requests.promptMean': {
    short: 'How much text goes to the model for one form, on average.',
    long: "A token is a piece of text, 3–4 letters; a page is about 1,800 characters. It includes our instructions to the model, the patient's history from the page and the doctor's words. In spring it was about 5.5k tokens, in September about 11.6k. That is why a form now costs about twice as much.",
  },
  'requests.outputMean': {
    short: 'How much text the model writes back, on average.',
    long: "Answer text costs 6 times more than the same amount of request text. It includes the model's hidden reasoning: Google charges for it as for the answer.",
  },
  'requests.baseTokens': {
    short: 'How much text goes to the model in every form, whatever the doctor says.',
    long: "We draw a straight line: request size against the length of the doctor's words (typed, dictated or from the conversation). Where the line starts is this number. It is an estimate and needs at least 200 forms. It is our instructions plus the patient's history; we can't see the two separately yet.",
  },
  'requests.bigShare': {
    short: 'Share of forms with a request over 20k tokens (≈ 30 pages), and their share of form costs.',
    long: "A big request almost always means a long patient history from the page.",
  },
  'requests.sizeBuckets': {
    short: 'How many forms of each size there are, and what share of the money they take.',
    long: 'Grey bar: share of forms. Blue bar: share of costs. The number on the right is the share of costs, then the share of forms.',
  },
  'requests.bySegment': {
    short: 'Which specialties (or form detail settings) give the most expensive forms.',
    long: "Specialty and detail come from the doctor's current profile. If a doctor changed them, older forms land in the new group. Groups with fewer than 3 doctors are merged into “Others”. Shown only when at least two groups have 3 doctors or more.",
  },
  'requests.priciest': {
    short: 'The 20 most expensive forms of the period.',
  },
  'requests.anamRuns': {
    short: 'How many times doctors made a medical history summary.',
    long: 'A summary is a series of calls by one doctor with breaks under 10 minutes. This is an estimate: the log has no summary number, so two summaries in a row may merge into one. Each old PDF summary is one call.',
  },
  'requests.anamCostPerRun': {
    short: 'What one medical history summary typically costs us, at list price.',
    long: 'Median: half of the summaries cost less, half more. Counted over summaries made the new way; the old PDF summaries are shown separately under “What one request costs”.',
  },
  'requests.anamCreditsPerRun': {
    short: 'How many credits one summary typically takes (median).',
    long: 'The price in credits is the real cost × 1.5, from 1 to 40 credits. The sub-line shows what these credits bring us after the payment fee, with the packs from the plan.',
  },
  'requests.anamLeft': {
    short: 'What share of the payment is left after the model costs (packs as in the plan).',
    long: 'Kept = 1 − cost of a summary ÷ (its credits × what one credit brings us after fees). Packs and VAT come from Settings.',
  },
  'requests.anamSteps': {
    short: 'What the summaries of this period cost, step by step.',
    long: 'A fast model pulls the facts out of each document; hard documents go to a strong model; then one call writes the final text. The old way sent whole PDF files in one call.',
  },
  'requests.anamRunsTable': {
    short: 'Every medical history summary of the period, newest first.',
  },
};
