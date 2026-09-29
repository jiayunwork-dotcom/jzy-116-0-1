/**
 * Regression / property tests for the queue accounting service.
 *
 * Locked-in properties:
 *   1. rho < 1, large capacity: mean queue length -> M/M/1 closed form
 *      L = rho / (1 - rho)  (the canonical textbook case).
 *   2. Long simulation with a fixed seed: empirical blocking ratio, mean
 *      queue length and utilization all land within tolerance of the
 *      analytical values.
 *   3. Blocking probability is non-increasing as capacity grows.
 *   4. Keeping rho fixed (scale arrival and service rates by the same
 *      factor) leaves the steady-state distribution unchanged.
 *   5. Same seed -> bit-identical simulation results.
 *   6. Invalid inputs are rejected with 400.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { analyticalModel } from '../src/analytical.js';
import { simulateQueue } from '../src/simulation.js';
import { app } from '../src/app.js';

// ---------------------------------------------------------------------------
// Analytical steady-state
// ---------------------------------------------------------------------------

describe('analytical M/M/1/N model', () => {
  it('r == 1 degenerates to the uniform distribution', () => {
    const result = analyticalModel({ arrivalRate: 2, serviceRate: 2, capacity: 5 });
    assert.equal(result.probabilities.length, 6);
    for (const p of result.probabilities) {
      assert.ok(Math.abs(p - 1 / 6) < 1e-12, `expected uniform p=1/6, got ${p}`);
    }
    assert.ok(Math.abs(result.blockingProbability - 1 / 6) < 1e-12);
    // Uniform on 0..5: mean = 2.5
    assert.ok(Math.abs(result.meanNumberInSystem - 2.5) < 1e-12);
    assert.ok(Math.abs(result.utilization - 5 / 6) < 1e-12);
  });

  it('blocking probability is non-increasing as capacity grows', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let capacity = 1; capacity <= 40; capacity++) {
      const result = analyticalModel({ arrivalRate: 0.9, serviceRate: 1, capacity });
      assert.ok(
        result.blockingProbability <= previous + 1e-12,
        `blocking increased at capacity ${capacity}: ${previous} -> ${result.blockingProbability}`,
      );
      previous = result.blockingProbability;
    }
  });

  it('scale invariance: same rho with proportionally scaled rates gives the same distribution', () => {
    const base = analyticalModel({ arrivalRate: 0.7, serviceRate: 1, capacity: 12 });
    const scaled = analyticalModel({ arrivalRate: 70, serviceRate: 100, capacity: 12 });
    for (let n = 0; n <= 12; n++) {
      assert.ok(
        Math.abs((base.probabilities[n] as number) - (scaled.probabilities[n] as number)) < 1e-10,
        `probability mismatch at state ${n}`,
      );
    }
    assert.ok(Math.abs(base.meanNumberInSystem - scaled.meanNumberInSystem) < 1e-10);
  });

  it('regression: rho < 1 with large capacity approaches M/M/1 L = rho/(1-rho)', () => {
    const rho = 0.5;
    const result = analyticalModel({ arrivalRate: rho, serviceRate: 1, capacity: 200 });
    assert.ok(result.blockingProbability < 1e-6, `blocking should vanish, got ${result.blockingProbability}`);
    assert.ok(
      Math.abs(result.meanNumberInSystem - rho / (1 - rho)) < 1e-6,
      `expected L=${rho / (1 - rho)}, got ${result.meanNumberInSystem}`,
    );
  });

  it('utilization identity: lambda_eff / mu == 1 - p_0', () => {
    const result = analyticalModel({ arrivalRate: 3, serviceRate: 2, capacity: 8 });
    assert.ok(Math.abs(result.utilization - (1 - (result.probabilities[0] as number))) < 1e-12);
    assert.ok(Math.abs(result.effectiveArrivalRate - 3 * (1 - result.blockingProbability)) < 1e-12);
  });

  it('zero effective arrival rate is handled without Infinity or NaN', () => {
    const result = analyticalModel({ arrivalRate: 0, serviceRate: 1, capacity: 5 });
    assert.equal(result.effectiveArrivalRate, 0);
    assert.equal(result.meanResidenceTime, 0);
    assert.ok(Number.isFinite(result.meanNumberInSystem));
    assert.equal(result.blockingProbability, 0);
  });

  it('probabilities sum to 1 for both stable and unstable regimes', () => {
    for (const params of [
      { arrivalRate: 0.3, serviceRate: 1, capacity: 7 },
      { arrivalRate: 2, serviceRate: 1, capacity: 7 },
      { arrivalRate: 1, serviceRate: 1, capacity: 7 },
    ]) {
      const result = analyticalModel(params);
      const sum = result.probabilities.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-12, `probabilities sum to ${sum}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Discrete-event simulation
// ---------------------------------------------------------------------------

describe('discrete-event simulation', () => {
  it('is deterministic: the same seed produces identical results twice', () => {
    const config = { arrivalRate: 0.8, serviceRate: 1, capacity: 10, seed: 42, maxCustomers: 20000 };
    const first = simulateQueue(config);
    const second = simulateQueue(config);
    assert.deepEqual(first, second);
  });

  it('matches the analytical blocking probability within tolerance (long run)', () => {
    const params = { arrivalRate: 0.8, serviceRate: 1, capacity: 12 };
    const analytical = analyticalModel(params);
    const simulation = simulateQueue({ ...params, seed: 12345, maxTime: 200000 });

    assert.ok(
      Math.abs(simulation.blockingRatio - analytical.blockingProbability) < 0.02,
      `blocking: simulation=${simulation.blockingRatio} analytical=${analytical.blockingProbability}`,
    );
  });

  it('matches mean queue length and utilization within tolerance (long run)', () => {
    const params = { arrivalRate: 0.8, serviceRate: 1, capacity: 12 };
    const analytical = analyticalModel(params);
    const simulation = simulateQueue({ ...params, seed: 12345, maxTime: 200000 });

    assert.ok(
      Math.abs(simulation.meanNumberInSystem - analytical.meanNumberInSystem) < 0.2,
      `mean number: simulation=${simulation.meanNumberInSystem} analytical=${analytical.meanNumberInSystem}`,
    );
    assert.ok(
      Math.abs(simulation.utilization - analytical.utilization) < 0.02,
      `utilization: simulation=${simulation.utilization} analytical=${analytical.utilization}`,
    );
  });

  it('counts blocked arrivals and preserves arrivals = blocked + served', () => {
    const simulation = simulateQueue({
      arrivalRate: 10,
      serviceRate: 1,
      capacity: 3,
      seed: 7,
      maxCustomers: 5000,
    });
    assert.ok(simulation.blocked > 0, 'overloaded system should block arrivals');
    assert.equal(simulation.arrivals, simulation.blocked + simulation.served);
    assert.ok(simulation.blockingRatio > 0.5);
  });

  it('respects the maxTime stop condition and ends exactly at the horizon', () => {
    const simulation = simulateQueue({
      arrivalRate: 1,
      serviceRate: 1,
      capacity: 5,
      seed: 99,
      maxTime: 5000,
    });
    assert.equal(simulation.simulatedTime, 5000);
    assert.ok(simulation.arrivals > 0);
  });

  it('respects the maxCustomers stop condition', () => {
    const simulation = simulateQueue({
      arrivalRate: 1,
      serviceRate: 1,
      capacity: 5,
      seed: 99,
      maxCustomers: 3000,
    });
    assert.equal(simulation.arrivals, 3000);
    assert.ok(simulation.simulatedTime > 0);
  });
});

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

describe('HTTP API', () => {
  let baseUrl: string;
  let server: ReturnType<typeof app.listen>;

  before(() => {
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
  });

  it('GET /health reports the model', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string; model: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.model, 'M/M/1/N');
  });

  it('POST /api/analytical returns the steady-state results', async () => {
    const response = await fetch(`${baseUrl}/api/analytical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrivalRate: 0.8, serviceRate: 1, capacity: 12 }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      probabilities: number[];
      blockingProbability: number;
      utilization: number;
    };
    assert.equal(body.probabilities.length, 13);
    assert.ok(body.blockingProbability > 0);
    assert.ok(body.utilization > 0);
  });

  it('POST /api/simulate returns empirical counters', async () => {
    const response = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrivalRate: 0.8, serviceRate: 1, capacity: 12, seed: 1, maxTime: 2000 }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      blockingRatio: number;
      meanNumberInSystem: number;
      utilization: number;
    };
    assert.ok(body.blockingRatio >= 0 && body.blockingRatio <= 1);
    assert.ok(body.meanNumberInSystem >= 0);
    assert.ok(body.utilization >= 0 && body.utilization <= 1);
  });

  it('POST /api/compare returns both sides with differences', async () => {
    const response = await fetch(`${baseUrl}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrivalRate: 0.8, serviceRate: 1, capacity: 12, seed: 1, maxTime: 5000 }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      analytical: unknown;
      simulation: unknown;
      comparison: {
        blockingProbability: { analytical: number; simulation: number; absoluteDifference: number };
        meanNumberInSystem: { absoluteDifference: number };
        utilization: { absoluteDifference: number };
      };
    };
    assert.ok(body.analytical);
    assert.ok(body.simulation);
    assert.ok(body.comparison.blockingProbability.absoluteDifference >= 0);
    assert.ok(body.comparison.meanNumberInSystem.absoluteDifference >= 0);
    assert.ok(body.comparison.utilization.absoluteDifference >= 0);
  });

  const invalidCases: Array<[Record<string, unknown>, string]> = [
    [{ arrivalRate: -1, serviceRate: 1, capacity: 5 }, 'non-positive arrival rate'],
    [{ arrivalRate: 0, serviceRate: 1, capacity: 5 }, 'zero arrival rate'],
    [{ arrivalRate: 1, serviceRate: 0, capacity: 5 }, 'zero service rate'],
    [{ arrivalRate: 1, serviceRate: 1, capacity: 0 }, 'zero capacity'],
    [{ arrivalRate: 1, serviceRate: 1, capacity: 2.5 }, 'non-integer capacity'],
    [{ arrivalRate: 1, serviceRate: 1, capacity: -2 }, 'negative capacity'],
    [{ arrivalRate: 1, serviceRate: 1, capacity: 5, seed: 'x', maxTime: 10 }, 'non-integer seed'],
    [{ arrivalRate: 1, serviceRate: 1, capacity: 5, seed: 1 }, 'missing stop condition'],
  ];

  for (const [payload, label] of invalidCases) {
    it(`rejects invalid input: ${label}`, async () => {
      const response = await fetch(`${baseUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.ok(typeof body.error === 'string' && body.error.length > 0);
    });
  }

  it('returns 404 for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    assert.equal(response.status, 404);
  });
});
