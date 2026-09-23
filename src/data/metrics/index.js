// Metric registry (F0-owned; page agents never edit it). One pure compute function per page:
// compute<Name>(ds, period, scope, opts) → AreaResult (SPEC §4.0). useMetric('<id>') looks names up here.
import { computeOverview } from './overview.js';
import { computeMoney } from './money.js';
import { computeCosts } from './costs.js';
import { computeRequests } from './requests.js';
import { computeRecording } from './recording.js';
import { computeModels } from './models.js';
import { computePrices } from './prices.js';
import { computeDoctors } from './doctors.js';
import { computeSettings } from './settings.js';

export const COMPUTE = Object.freeze({
  overview: computeOverview,
  money: computeMoney,
  costs: computeCosts,
  requests: computeRequests,
  recording: computeRecording,
  models: computeModels,
  prices: computePrices,
  doctors: computeDoctors,
  settings: computeSettings,
});

