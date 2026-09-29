/**
 * HTTP routing layer. Three endpoints:
 *   POST /api/analytical  - steady-state analytical results only
 *   POST /api/simulate    - one discrete-event simulation run only
 *   POST /api/compare     - both, side by side, with absolute differences
 * plus GET /health for readiness checks.
 */

import { Router } from 'express';
import { analyticalModel } from './analytical.js';
import { simulateQueue } from './simulation.js';
import { parseQueueParams, parseSimulationParams } from './validation.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: 'M/M/1/N' });
});

router.post('/api/analytical', (req, res, next) => {
  try {
    const params = parseQueueParams(req.body);
    res.json(analyticalModel(params));
  } catch (err) {
    next(err);
  }
});

router.post('/api/simulate', (req, res, next) => {
  try {
    const params = parseSimulationParams(req.body);
    res.json(simulateQueue(params));
  } catch (err) {
    next(err);
  }
});

router.post('/api/compare', (req, res, next) => {
  try {
    const params = parseSimulationParams(req.body);
    const analytical = analyticalModel(params);
    const simulation = simulateQueue(params);

    res.json({
      input: {
        arrivalRate: params.arrivalRate,
        serviceRate: params.serviceRate,
        capacity: params.capacity,
        seed: params.seed,
        maxCustomers: params.maxCustomers ?? null,
        maxTime: params.maxTime ?? null,
      },
      analytical,
      simulation,
      comparison: {
        blockingProbability: {
          analytical: analytical.blockingProbability,
          simulation: simulation.blockingRatio,
          absoluteDifference: Math.abs(
            analytical.blockingProbability - simulation.blockingRatio,
          ),
        },
        meanNumberInSystem: {
          analytical: analytical.meanNumberInSystem,
          simulation: simulation.meanNumberInSystem,
          absoluteDifference: Math.abs(
            analytical.meanNumberInSystem - simulation.meanNumberInSystem,
          ),
        },
        utilization: {
          analytical: analytical.utilization,
          simulation: simulation.utilization,
          absoluteDifference: Math.abs(analytical.utilization - simulation.utilization),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
