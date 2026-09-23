// Copy of the Costs page (§4.3, OVERRIDES O1: plain English). Every key starts with 'costs.'.
// COPY = labels, answers, empty states, table headers, takeaways; DEFS = { short, long?, template? }
// for the (i) hints (hintKey 'costs.<key>').

export const COPY = {
  'costs.title': 'Costs',
  'costs.question': 'How much do we spend, on what, and why is it growing?',

  // --- Answer (§4.3) ------------------------------------------------------------------------------
  'costs.answer.split': 'Costs for {period}: {cost} — {parts}.',
  'costs.part.form': 'forms {x}',
  'costs.part.anam': 'medical history summaries {x}',
  'costs.part.rec': 'recording {x}',
  'costs.part.fixed': 'server {x}',
  'costs.answer.formOnly': 'One form costs {cpf}.',
  'costs.answer.formFlat': 'One form costs {cpf}; the price has hardly changed since the previous period.',
  'costs.answer.formDown': 'One form costs {cpf} — {delta} less than in the previous period.',
  'costs.answer.formUp.size': 'One form costs {cpf} — {delta} more than in the previous period. The main reason: the request grew to {pages} of text.',
  'costs.answer.formUp.era': 'One form costs {cpf} — {delta} more than in the previous period. The main reason is a different model: {model}.',
  'costs.answer.formUp.longer': 'One form costs {cpf} — {delta} more than in the previous period. The model started writing longer answers.',
  'costs.answer.formUp.other': 'One form costs {cpf} — {delta} more than in the previous period.',
  'costs.answer.promo': 'Google’s real invoice is smaller: promo credits covered {promo} for {month}.',
  'costs.empty': 'No requests from {from} to {to}.',

  // --- Tiles -----------------------------------------------------------------------------------------
  'costs.tile.total': 'Costs',
  'costs.tile.total.sub': 'server {x}',
  'costs.tile.perForm': 'One form',
  'costs.tile.perForm.sub': '{n} {forms} in the period',
  'costs.tile.perDoctorPlan': 'Per doctor per month (plan, whole visit)',
  'costs.tile.perDoctorPlan.sub': '{n} doctors — {x}',
  'costs.tile.fixedMonth': 'Server and fixed costs, per month',
  'costs.tile.fixedMonth.invoice': 'Railway invoice for {month}',
  'costs.tile.fixedMonth.settings': 'as set in Settings',

  // --- Plan row --------------------------------------------------------------------------------------
  'costs.scale.title': 'Costs per month: now and in the plan',
  'costs.scale.row': 'Costs',

  // --- Sections --------------------------------------------------------------------------------------
  'costs.section.where': 'Where the money went',
  'costs.section.why': 'Why a form got more expensive',
  'costs.section.invoices': 'List price and real invoices',
  'costs.section.details': 'Details',
  'costs.section.details.lead': 'Costs by model, fixed costs and the Soniox check.',

  // --- Costs over time ----------------------------------------------------------------------------------
  'costs.overTime.title': 'Costs over time',
  'costs.split.label': 'Split costs',
  'costs.split.feature': 'By service',
  'costs.split.provider': 'By vendor',
  'costs.split.model': 'By model',
  'costs.splitShort.feature': 'Service',
  'costs.splitShort.provider': 'Vendor',
  'costs.splitShort.model': 'Model',
  'costs.series.form': 'Forms',
  'costs.series.recording': 'Recording',
  'costs.series.anamnesis': 'Medical history',
  'costs.series.fixed': 'Server',
  'costs.series.gemini': 'Google',
  'costs.series.soniox': 'Soniox',
  'costs.series.openai': 'OpenAI',
  'costs.series.main': 'Main model',
  'costs.series.fallback': 'Backup model',
  'costs.series.other': 'Other models',
  'costs.col.day': 'Day',
  'costs.col.week': 'Week',
  'costs.col.month': 'Month',
  'costs.col.total': 'Total',

  // --- Where the money went ---------------------------------------------------------------------------
  'costs.whereWent.title': 'Costs by service',
  'costs.where.form': 'Forms — Gemini',
  'costs.where.form.sub': '{n} {forms} · {unit} per form',
  'costs.where.anamnesis': 'Medical history — Gemini',
  'costs.where.anamnesis.sub': '{n} {runs} · {unit} per summary',
  'costs.where.live': 'Live conversation — Soniox',
  'costs.where.live.sub': '{min} · {unit} per 10 min',
  'costs.where.dictation': 'Dictation — Soniox and OpenAI',
  'costs.where.dictation.sub': '{min}, of which OpenAI {openai}',
  'costs.where.fixed': 'Server — Railway',
  'costs.where.fixed.sub': '{x} per month',
  'costs.whereShort.form': 'Forms',
  'costs.whereShort.anamnesis': 'Medical history',
  'costs.whereShort.live': 'Conversation',
  'costs.whereShort.dictation': 'Dictation',
  'costs.whereShort.fixed': 'Server',
  'costs.where.summary.one': 'summary',
  'costs.where.summary.other': 'summaries',
  'costs.where.lead': '{name}: {share} of the costs.',
  'costs.cacheSaving': 'Google’s discount for repeated text: ≈ {eur} for the period. We don’t subtract it — costs are counted at the full list price.',

  // --- Why a form got more expensive --------------------------------------------------------------------
  'costs.whyUp.price': 'Price of a form by month, cents',
  'costs.whyUp.centsPerForm': 'cents per form',
  'costs.whyUp.size': 'Request size by month, pages of text',
  'costs.whyUp.inPeriod': 'Selected period',
  'costs.whyUp.otherMonths': 'Other months',
  'costs.whyUp.pagesUnit': 'pages',
  'costs.whyUp.lead': 'By month, for all time — not only the selected period.',
  'costs.takeaway.whyUp': 'Since {fromMonth} a form has become more expensive: from {a} to {b}. The request grew from {x} to {y} pages of text.',
  'costs.col.forms': 'Forms',
  'costs.col.pricePerForm': 'Price of a form',
  'costs.col.pages': 'Pages of text',

  // --- By model ----------------------------------------------------------------------------------------
  'costs.byModel.title': 'By model',
  'costs.col.model': 'Model',
  'costs.col.role': 'Role',
  'costs.col.where': 'Where',
  'costs.col.inTok': 'Request, tokens',
  'costs.col.outTok': 'Answer, tokens',
  'costs.col.cost': 'Costs',
  'costs.col.perForm': 'Per form',
  'costs.col.share': 'Share',
  'costs.role.main': 'main',
  'costs.role.fallback': 'backup',
  'costs.role.switch': 'manual switch',
  'costs.byModel.empty': 'No forms in this period.',

  // --- Fixed costs ------------------------------------------------------------------------------------
  'costs.fixed.title': 'Fixed costs',
  'costs.col.item': 'Item',
  'costs.col.perMonth': 'Per month',
  'costs.col.forPeriod': 'For the period',
  'costs.col.source': 'Where the number comes from',
  'costs.fixed.railway': 'Railway (Dr.Filler share)',
  'costs.fixed.firestore': 'Firestore',
  'costs.fixed.other': 'Other',
  'costs.fixed.freeTier': '€0 — within the free tier',
  'costs.source.invoice': 'invoice',
  'costs.source.settings': 'entered by hand (Settings)',
  'costs.source.freeTier': 'list price',
  'costs.fixed.stripeMemo': 'Stripe fees for the period: {fee} — already taken out of income, not added here.',

  // --- Invoices -----------------------------------------------------------------------------------------
  'costs.invoices.title': 'By month',
  'costs.invoices.lead': '{month}: Google at list price {list}, we paid {paid} — promo credits covered {promo}.',
  'costs.invoices.leadNoPromo': '{month}: Google at list price {list}, the invoice was {paid}.',
  'costs.invoices.empty': 'No invoices entered yet. Press “Change” next to a month and type the sum from the Google invoice.',
  'costs.col.googleList': 'Google|at list price',
  'costs.col.googleInvoice': 'Google|invoice',
  'costs.col.promo': 'Promo|credits',
  'costs.col.googlePaid': 'Paid to|Google',
  'costs.col.railway': 'Railway|share',
  'costs.col.sonioxList': 'Soniox|at list price',
  'costs.col.sonioxInvoice': 'Soniox|invoice',
  'costs.col.openaiInvoice': 'OpenAI|invoice',
  'costs.col.other': 'Other',
  'costs.col.monthTotal': 'Total for|the month',
  'costs.invoices.change': 'Change',
  'costs.invoices.changeAria': 'Change the invoices for {month}',

  // --- Invoice editor -----------------------------------------------------------------------------------
  'costs.edit.title': 'Invoices for {month}',
  'costs.edit.lead': 'Type the sums from the invoices. Leave a field empty if there is no invoice.',
  'costs.edit.googleInvoiceEur': 'Google invoice, €',
  'costs.edit.googlePromoCreditsEur': 'Google promo credits, €',
  'costs.edit.railwayUsd': 'Railway — Dr.Filler share, $',
  'costs.edit.railwayHint': 'server + stats ≈ 29% of the whole Railway invoice (≈ $1.96 with VAT)',
  'costs.edit.sonioxInvoiceUsd': 'Soniox invoice, $',
  'costs.edit.openaiInvoiceUsd': 'OpenAI invoice, $',
  'costs.edit.otherEur': 'Other, €',
  'costs.edit.note': 'Note',
  'costs.edit.noteCount': '{n} of {max}',
  'costs.edit.approx': '≈ {eur}',
  'costs.edit.save': 'Save',
  'costs.edit.saving': 'Saving…',
  'costs.edit.cancel': 'Cancel',
  'costs.edit.badNumber': 'Enter a number from 0 to 100,000, or leave it empty.',
  'costs.edit.noteTooLong': 'At most {max} characters.',
  'costs.edit.saved': 'Saved. The numbers are recounted.',

  // --- Soniox check -------------------------------------------------------------------------------------
  'costs.soniox.title': 'Soniox: our estimate and their numbers',
  'costs.soniox.ours': 'Our estimate',
  'costs.soniox.theirs': 'Soniox’s numbers',
  'costs.soniox.diff': 'Difference',
  'costs.soniox.range': 'Compared: {range}, all accounts.',
  'costs.soniox.partial': 'Soniox gives data only for the last 90 days.',
  'costs.soniox.before': 'We have used Soniox since 22 Sep 2026, 17:00 — there is nothing to compare before that.',
  'costs.soniox.none': 'No Soniox usage in this period.',
  'costs.col.date': 'Date',

  // --- Notes --------------------------------------------------------------------------------------------
  'costs.note.vertexSurcharge': 'Forms from 26 Aug to 1 Sep went through Google Cloud in the EU: their price includes a 10% surcharge.',
  'costs.note.openaiBytes': 'OpenAI does not report the length of {n} old dictations — we count it from the file size (estimate).',
  'costs.note.unknownModel': 'The models {models} are not in the price table — we priced them as Gemini 3.5 Flash, to be safe (estimate).',

  // --- Export ---------------------------------------------------------------------------------------------
  'costs.export.series': 'Costs over time',
  'costs.export.whereWent': 'Where the money went',
  'costs.export.byModel': 'Costs by model',
  'costs.export.invoices': 'List price and invoices by month',
};

export const DEFS = {
  'costs.total': {
    short: 'What we owe Google, Soniox, OpenAI and for the server, at the vendors’ list prices.',
    long: 'Models and recording are counted per request: tokens or minutes × price. The server is a monthly sum split over the days of the period. Stripe fees are not included: they are already taken out of income. Google’s real invoice is lower right now because of promo credits. We convert dollars at the ECB rate: $1 = €0.8724 on 22 Sep 2026.',
  },
  'costs.perForm': {
    short: 'Model costs for forms ÷ the number of forms. A form is one press of “Generuoti”.',
    long: 'We pay Google for the text that goes into the model (our instructions, the medical history, the doctor’s words) and for the text it writes back (the finished form). In spring a form cost about 0.4¢, in September about 0.8¢: the request grew from about 8 to 17 pages of text.',
  },
  'costs.perDoctorPlan': {
    short: 'What one doctor costs us per month in the plan: form and recording.',
    template: 'What one doctor costs us per month in the plan: {visits} visits, form and recording.',
    long: 'The price of a form and of a minute of recording over the last 30 days (current model setup) × the plan. This is the whole visit, so the number is bigger than “forms only” on the Prices page. The assumptions are in Settings.',
  },
  'costs.fixedMonth': {
    short: 'Costs that do not depend on the number of requests, per month.',
    long: 'Railway hosts the server; our share is about $1.96 a month with VAT. Firestore and password sign-in are still within the free tier. Enter the real Railway share below, under “List price and real invoices”.',
  },
  'costs.scale': {
    short: 'Now: the real costs of the period, converted to one month. Plan: the assumptions from Settings.',
    template: 'Now: the real costs of the period, converted to one month. Plan: {visits} visits per doctor per month.',
    long: 'The plan uses the price of a form and of a minute of recording over the last 30 days (current model setup). It is a “what if” calculation, not a promise. The full table with income is on the Money page.',
  },
  'costs.overTime': {
    short: 'Costs day by day: by service, by vendor or by model.',
    long: 'Main and backup model: forms written by today’s main and backup model. Other models: older models, the medical history summary and recording. The server is the monthly Railway share spread over the days.',
  },
  'costs.whyUp': {
    short: 'The price of one form and the size of the request by month, for all time.',
    long: 'The steps in size are our changes to the instructions for the model and the medical history we started sending. A page of text is about 1,800 characters. Months with fewer than 5 forms are left out.',
  },
  'costs.whereWent': {
    short: 'Where the money went in this period and what one unit costs.',
    long: 'A medical history summary can take several calls to the model; one summary counts once. Recording is priced per minute of sound.',
  },
  'costs.byModel': {
    short: 'Costs of each model that wrote forms: forms, amount of text, money.',
    long: 'The role of a model: main, backup or a manual switch (tests). From 26 Aug to 1 Sep forms went through Google Cloud in the EU — the price there is 10% higher. Medical history summaries and recording are not in this table; they are in “Where the money went”.',
  },
  'costs.fixed': {
    short: 'Items that do not depend on the number of requests.',
    long: 'Railway: the invoice entered for the month, otherwise the sum from Settings. Firestore stays within Google’s free daily allowance.',
  },
  'costs.invoices': {
    short: 'Costs at list price next to the real invoices, by month, all accounts.',
    long: 'Google’s promo credits currently cover about 90% of the invoice. When they run out, we will pay the list price — that is why the main costs are counted at list price. Invoices are entered here by hand once a month. For Railway, enter the Dr.Filler share, not the whole invoice.',
  },
  'costs.soniox': {
    short: 'What Soniox itself counted — to check our estimate.',
    long: 'Soniox gives data for the last 90 days. Dictations at Soniox are not labelled by doctor, so we only compare the total, for all accounts.',
  },
  'costs.promoCredits': {
    short: 'Promo credits — free money from Google that currently pays the invoice.',
    long: 'When they run out, the same amount of work will cost the list price.',
  },
};
