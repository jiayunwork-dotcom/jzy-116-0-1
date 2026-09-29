/**
 * Request validation. All queue parameters go through the same checks so the
 * analytical and simulation paths can never disagree about what is legal:
 *   - arrivalRate / serviceRate must be positive finite numbers
 *   - capacity must be a positive integer (it counts everyone in system,
 *     including the customer in service)
 *   - simulation additionally requires an integer seed and at least one
 *     stop condition (maxCustomers / maxTime)
 */

import type { AnalyticalInput } from './analytical.js';
import type { SimulationInput } from './simulation.js';

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, `'${field}' must be a positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `'${field}' must be a positive integer`);
  }
  return value;
}

export function parseQueueParams(body: unknown): AnalyticalInput {
  if (body === null || typeof body !== 'object') {
    throw new HttpError(400, 'request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  const arrivalRate = positiveNumber(b.arrivalRate, 'arrivalRate');
  const serviceRate = positiveNumber(b.serviceRate, 'serviceRate');
  const capacity = positiveInteger(b.capacity, 'capacity');
  return { arrivalRate, serviceRate, capacity };
}

export function parseSimulationParams(body: unknown): SimulationInput {
  const base = parseQueueParams(body);
  const b = body as Record<string, unknown>;

  const seed = b.seed;
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new HttpError(400, "'seed' must be an integer");
  }

  let maxCustomers: number | undefined;
  if (b.maxCustomers !== undefined) {
    maxCustomers = positiveInteger(b.maxCustomers, 'maxCustomers');
  }

  let maxTime: number | undefined;
  if (b.maxTime !== undefined) {
    maxTime = positiveNumber(b.maxTime, 'maxTime');
  }

  if (maxCustomers === undefined && maxTime === undefined) {
    throw new HttpError(400, "at least one of 'maxCustomers' or 'maxTime' is required");
  }

  return { ...base, seed, maxCustomers, maxTime };
}
