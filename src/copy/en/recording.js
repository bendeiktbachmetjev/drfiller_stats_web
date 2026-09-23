// Copy of the Recording page (SPEC §4.5, in plain English per OVERRIDES O1).
// Every key starts with 'recording.'. COPY = labels, answers, empty states, table headers, takeaways;
// DEFS = { short, long?, template? } for (i) hints (hintKey 'recording.<key>').

export const COPY = {
  'recording.title': 'Recording',
  'recording.question': 'How much do we record, what does it cost, and does 1 credit per 10 minutes cover it?',

  // --- Answer ------------------------------------------------------------------------------------------
  'recording.answer.thin':
    'Soniox has worked since 22 Sep; live recording and per-minute billing since 23 Sep. Recordings so far, all accounts: {n} — too early to draw conclusions.',
  'recording.answer.none': 'Nothing was recorded in this period.',
  'recording.answer.volume': 'Recorded {minutes}: conversations {live}, dictations {dict}. Costs {cost}; doctors paid about {credits} for it.',
  'recording.answer.unit': '10 minutes of conversation cost us {cost10}. The credit for them brings {net1}, so we keep {left}.',
  'recording.answer.unitLoss': '10 minutes of conversation cost us {cost10}. The credit for them brings only {net1}, so we lose {loss}.',
  'recording.answer.limit':
    'Soniox allows {limit} conversations at once. That is enough for about {mean} doctors who record every visit, or {safe} if nobody should ever hear “busy”.',

  // --- Sections ----------------------------------------------------------------------------------------
  'recording.section.business': 'How much and at what price',
  'recording.section.businessHint': 'Minutes, costs and credits. They follow the account switch at the top.',
  'recording.section.service': 'How recording works',
  'recording.section.serviceHint': 'Conversations, Soniox and its limit. Your own account is real load too, so all accounts count here.',

  // --- Tiles -------------------------------------------------------------------------------------------
  'recording.tile.minutes': 'Minutes recorded',
  'recording.tile.minutesSub': 'of which conversations {live}',
  'recording.tile.cost': 'Recording costs',
  'recording.tile.costSub': '10 min of conversation — {cost10}',
  'recording.tile.credits': 'Credits for recording',
  'recording.tile.creditsNoCompare': 'billed differently before 23 Sep',
  'recording.tile.margin10': 'Kept from 10 minutes',
  'recording.tile.margin10Sub': 'we keep {left} of each credit',
  'recording.tile.conversations': 'Conversations',
  'recording.tile.conversationsSub': 'on average {min}',
  'recording.tile.sonioxShare': 'Dictations through Soniox',
  'recording.tile.sonioxShareSub': 'counted since 22 Sep, 17:00',
  'recording.tile.peak': 'Most at once',
  'recording.tile.peakValue': '{n} of {limit}',
  'recording.tile.peakSub': 'the busiest moment of the period',
  'recording.tile.carried': 'Recorded, not yet charged',
  'recording.tile.carriedSub': 'as of today',

  // --- Right now strip ---------------------------------------------------------------------------------
  'recording.live.open': 'conversations running',
  'recording.live.openValue': '{n} of {limit}',
  'recording.live.started': 'started today',
  'recording.live.minutes': 'minutes recorded today',

  // --- Plan --------------------------------------------------------------------------------------------
  'recording.plan.title': 'Recording at scale',
  'recording.plan.hint': 'Now next to the plan, per month.',
  'recording.row.recordingCost': 'Recording costs',
  'recording.row.recordingIncome': 'Income from recording (credits for minutes)',

  // --- Minutes chart -----------------------------------------------------------------------------------
  'recording.chart.title': 'Minutes of recording',
  'recording.series.live': 'Conversation',
  'recording.series.dictationSoniox': 'Dictation via Soniox',
  'recording.series.dictationOpenai': 'Dictation via OpenAI',
  'recording.thin': 'Soniox since 22 Sep 2026, live recording since 23 Sep 2026. So far {n} recordings — a chart needs 20. Every recording is listed below.',
  'recording.thin.action': 'Show all time',
  'recording.take.switch': 'On 22 Sep dictation moved from OpenAI to Soniox. OpenAI is now only the backup.',
  'recording.take.openaiHigh': 'OpenAI took {share} of dictations since 22 Sep — Soniox may be having trouble.',
  'recording.col.bucket': 'Period',
  'recording.col.minutes': 'Minutes',

  // --- Every recording (under a thin chart) ------------------------------------------------------------
  'recording.recordings.title': 'Every recording since 22 Sep',
  'recording.recordings.empty': 'No recordings since 22 Sep 2026 in this period.',
  'recording.col.when': 'When',
  'recording.col.doctor': 'Doctor',
  'recording.col.what': 'What',
  'recording.col.via': 'Through',
  'recording.col.length': 'Length',
  'recording.what.live': 'conversation',
  'recording.what.dictation': 'dictation',
  'recording.via.soniox': 'Soniox',
  'recording.via.openai': 'OpenAI (backup)',
  'recording.unit.recording.one': 'recording',
  'recording.unit.recording.other': 'recordings',

  // --- Who transcribes ---------------------------------------------------------------------------------
  'recording.providers.title': 'Who transcribes',
  'recording.providers.soniox': 'Soniox',
  'recording.providers.openai': 'OpenAI, backup',
  'recording.providers.per10': '{price} per 10 min',
  'recording.providers.empty': 'No recordings since 22 Sep 2026 in this period.',

  // --- Soniox limit ------------------------------------------------------------------------------------
  'recording.limit.title': 'Soniox limit: when we hit it',
  'recording.limit.col.doctors': 'Doctors',
  'recording.limit.col.mean': 'On average at once',
  'recording.limit.col.p95': 'At most at once',
  'recording.limit.col.limit': 'Limit',
  'recording.limit.col.enough': 'Enough?',
  'recording.limit.row.now': 'Now (actual): {n}',
  'recording.limit.row.n': '{n} doctors',
  'recording.limit.yes': 'yes',
  'recording.limit.no': 'no — ask Soniox to raise the limit',

  // --- Conversations -----------------------------------------------------------------------------------
  'recording.sessions.title': 'Conversations',
  'recording.sessions.empty': 'No conversations in this period. Live recording started on 23 Sep 2026.',
  'recording.col.speakers': 'Speakers',
  'recording.col.reconnects': 'Reconnects',
  'recording.col.wait': 'Waited after “Stop”',
  'recording.col.credits': 'Credits, estimate',
  'recording.col.confirmed': 'Soniox confirmed',

  // --- Recording charges -------------------------------------------------------------------------------
  'recording.meter.title': 'Recording charges',
  'recording.meter.none': 'The server will log recording charges after its update. Until then we count them from minutes.',
  'recording.meter.empty': 'No recording charges in this period.',
  'recording.col.source': 'From',
  'recording.col.added': 'Added, min',
  'recording.col.charged': 'Credits charged',
  'recording.col.bank': 'Left on the counter, min',
  'recording.meter.source.dictation': 'dictation',
  'recording.meter.source.live_finish': 'end of a conversation',
  'recording.meter.source.live_reconcile': 'check against Soniox',
  'recording.meter.source.settle': 'with a form',

  // --- OpenAI backup dictations ------------------------------------------------------------------------
  'recording.openai.title': 'Dictations through the backup OpenAI (since 22 Sep)',
  'recording.openai.empty': 'Since 22 Sep not a single dictation went to OpenAI.',
  'recording.col.lengthEstimate': 'Length, estimate',
  'recording.col.waited': 'Waited',
  'recording.col.reason': 'Reason',
  'recording.openai.notRecorded': 'not recorded',

  // --- Check against Soniox ----------------------------------------------------------------------------
  'recording.reconcile.title': 'Check against Soniox',
  'recording.reconcile.empty': 'No Soniox usage in this period yet.',
  'recording.col.day': 'Day',
  'recording.col.ourMin': 'Our minutes',
  'recording.col.sonioxMin': 'Soniox minutes',
  'recording.col.ourEur': 'Our costs',
  'recording.col.sonioxEur': 'Soniox costs',
  'recording.col.diffMin': 'Difference',

  // --- Empty page and notes ----------------------------------------------------------------------------
  'recording.empty': 'No recordings in {range}.',
  'recording.showMore': 'Show {n} more (of {total})',
  'recording.emptyHint': 'Dictation went through OpenAI until 22 Sep 2026; Soniox since then, and live conversations since 23 Sep 2026.',
  'recording.note.clientMinutes': 'Conversation minutes come from the extension. Soniox confirms them every 30 minutes, for billing only.',
  'recording.note.before':
    'Before 23 Sep 2026, 11:23 the first dictation after a form was free, and a second one in a row cost 1 credit. Those credits are worked out from the log (estimate).',
  'recording.note.bytes': 'Old OpenAI dictations have no length. We estimate it from the file size.',
};

export const DEFS = {
  'recording.minutes': {
    short: 'How many minutes of sound we turned into text: dictations plus conversations.',
    long: 'Soniox reports the length itself. Old OpenAI dictations have no length, so we estimate it from the file size. The extension reports the length of a conversation.',
  },
  'recording.cost': {
    short: 'What turning speech into text cost in this period, at list price.',
    template: 'What turning speech into text cost in this period, at list price. We convert dollars at the ECB rate: $1 = €{fx} on {date}.',
    long: 'Soniox: $0.10 per hour of audio file, $0.12 per hour of live conversation. OpenAI (backup): $0.003 per minute — 1.8 times more than Soniox.',
  },
  'recording.credits': {
    short: 'Every full 10 minutes of recording = 1 credit. Dictation and conversation share one counter, and leftover minutes carry over.',
    long: 'This works since 23 Sep 2026, 11:23. Until the server logs the charges themselves, we work them out from minutes for each doctor (estimate). Before that date the old rule applied (a second dictation in a row cost 1 credit); those credits are also worked out from the log.',
  },
  'recording.margin10': {
    short: 'What we keep from 1 credit for 10 minutes of conversation, after all costs.',
    template: 'What we keep from 1 credit for 10 minutes of conversation, after all costs. The conversation text in the form counts as {tpm} tokens per minute.',
    long: 'Costs: 10 minutes of live Soniox plus the conversation text that goes into the form (the tokens-per-minute assumption from Settings). The pack and VAT come from Settings. This number follows the plan, not the period.',
  },
  'recording.conversations': {
    short: 'How many visits were recorded with the “Pokalbis” card — a live recording of the conversation.',
    long: 'Works since 23 Sep 2026. The sound goes from the browser straight to Soniox; our server only sees the result.',
  },
  'recording.sonioxShare': {
    short: 'How many dictations Soniox transcribed. The rest went to the backup OpenAI.',
    long: 'Counted since 22 Sep, 17:00 (Vilnius time), when Soniox was switched on. If this share drops, Soniox is having trouble.',
  },
  'recording.peak': {
    short: 'How many conversations ran at the same time in the busiest moment, out of the Soniox limit.',
    long: 'We take the start of a conversation as “end minus length” (estimate). Soniox allows 10 at once by default; it can raise the limit on request.',
  },
  'recording.carried': {
    short: 'Recorded, not yet charged: minutes waiting on the doctors’ counters.',
    long: 'Usually a remainder under 10 minutes; it is charged when the next minutes add up. If a doctor ran out of credits, the debt also sits here and is charged at the next recording or form. This is the state today, not for the period.',
  },
  'recording.minutesChart': {
    short: 'Conversations through Soniox, dictations through Soniox and dictations through OpenAI.',
    long: 'Until 22 Sep 2026 OpenAI was the only way to turn dictation into text; since then it is only the backup.',
  },
  'recording.plan': {
    short: 'Recording costs and the income from recording credits, now and at scale.',
    long: 'The recording costs here are Soniox and OpenAI only; the conversation text inside the form is counted with the forms. Plan columns use the assumptions from Settings.',
  },
  'recording.recordingCost': {
    short: 'Soniox and OpenAI, per month.',
  },
  'recording.recordingIncome': {
    short: 'Credits doctors pay for recorded minutes, at the net price of one credit.',
    long: 'Now: income is not split by feature, so the cell is empty. Plan columns: visits × recorded minutes ÷ 10 × the net price of one credit from Settings.',
  },
  'recording.providers': {
    short: 'Which share of the minutes went to Soniox and which to the backup OpenAI.',
    long: 'OpenAI costs 1.8 times more. On the 1500 pack with VAT, 10 minutes through OpenAI lose money. Counted since 22 Sep 2026, 17:00.',
  },
  'recording.limit': {
    short: 'How many conversations will run at once as the number of doctors grows.',
    long: 'With the default assumptions each doctor records about 0.7 of an hour in the busiest hour. On average the limit of 10 is enough for 14 such doctors, but then in about 4 of 10 busy hours someone hears “busy”. To keep that rarer than 1 hour in 20, the limit is enough for about 11 doctors. “At most at once” is the number that 19 of 20 busy hours stay at or under.',
  },
  'recording.sessions': {
    short: 'Every recorded conversation: length, speakers, reconnects.',
    long: '“Soniox confirmed” is the minutes by Soniox’s own numbers, when Soniox is connected to the stats. Credits are the minutes ÷ 10; leftovers carry over on the counter.',
  },
  'recording.meter': {
    short: 'Every charge on the recording counter.',
  },
  'recording.openai': {
    short: 'Dictations that Soniox did not take, so the backup OpenAI transcribed them.',
    long: 'OpenAI has no exact length, so it is estimated. The reason is logged only after the server update.',
  },
  'recording.reconcile': {
    short: 'Our minutes and costs next to Soniox’s own numbers, by day.',
    long: 'Soniox gives data for the last 90 days only. Hover a cost to see it in dollars.',
  },
  'recording.recordings': {
    short: 'Every dictation and conversation since Soniox was switched on.',
  },
};
