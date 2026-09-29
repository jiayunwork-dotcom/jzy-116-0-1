/**
 * Analytical steady-state model of the M/M/1/N queue.
 *
 * State definition (shared with the simulation engine!):
 *   n = number of customers in the system, n = 0..capacity,
 *   where `capacity` INCLUDES the customer currently in service.
 *   State n == capacity means the system is full: arrivals are blocked
 *   ("blocked calls cleared").
 *
 * Steady-state distribution is geometric with traffic intensity
 *   r = arrivalRate / serviceRate:
 *     p_n = p_0 * r^n,  n = 0..N
 *   with the r == 1 case degenerating to the uniform distribution
 *   p_n = 1 / (N + 1).
 *
 * From this:
 *   blocking probability   P_block = p_N (PASTA: arrivals see time averages)
 *   effective arrival rate lambda_eff = arrivalRate * (1 - P_block)
 *   utilization            rho      = lambda_eff / serviceRate
 *   mean number in system  L        = sum_n n * p_n
 *   mean residence time    W        = L / lambda_eff
 *     (defined as 0 when lambda_eff == 0, to avoid dividing by zero)
 */

export interface AnalyticalInput {
  arrivalRate: number;
  serviceRate: number;
  capacity: number;
}

export interface AnalyticalResult {
  arrivalRate: number;
  serviceRate: number;
  capacity: number;
  /** traffic intensity r = arrivalRate / serviceRate */
  trafficIntensity: number;
  /** steady-state probabilities p_0 .. p_capacity */
  probabilities: number[];
  /** probability an arriving customer is blocked = p_N */
  blockingProbability: number;
  /** arrival rate that actually enters the system: lambda * (1 - p_N) */
  effectiveArrivalRate: number;
  /** server utilization = lambda_eff / mu (also = 1 - p_0) */
  utilization: number;
  /** mean number of customers in the system L = sum n p_n */
  meanNumberInSystem: number;
  /** mean residence (sojourn) time W = L / lambda_eff; 0 when lambda_eff == 0 */
  meanResidenceTime: number;
}

export function analyticalModel(input: AnalyticalInput): AnalyticalResult {
  const { arrivalRate: lambda, serviceRate: mu, capacity: nMax } = input;

  // --- Steady-state probabilities -----------------------------------------
  const probabilities = new Array<number>(nMax + 1);
  const r = lambda / mu;

  if (lambda === 0) {
    // Nothing ever arrives: system stays empty.
    probabilities[0] = 1;
    for (let n = 1; n <= nMax; n++) probabilities[n] = 0;
  } else if (r === 1) {
    // Geometric series degenerates to the uniform distribution.
    const p = 1 / (nMax + 1);
    for (let n = 0; n <= nMax; n++) probabilities[n] = p;
  } else if (r < 1) {
    // Standard geometric form: p_n = (1 - r) / (1 - r^(N+1)) * r^n
    const p0 = (1 - r) / (1 - Math.pow(r, nMax + 1));
    let rn = 1;
    for (let n = 0; n <= nMax; n++) {
      probabilities[n] = p0 * rn;
      rn *= r;
    }
  } else {
    // r > 1: compute weights relative to the fullest state for numerical
    // stability: w_n = r^(n - N), so w_N = 1 and sum is well behaved.
    const logR = Math.log(r);
    let sum = 0;
    for (let n = 0; n <= nMax; n++) {
      const w = Math.exp((n - nMax) * logR);
      probabilities[n] = w;
      sum += w;
    }
    for (let n = 0; n <= nMax; n++) {
      probabilities[n] = (probabilities[n] as number) / sum;
    }
  }

  // --- Derived performance measures ---------------------------------------
  const blockingProbability = probabilities[nMax] as number;
  const effectiveArrivalRate = lambda * (1 - blockingProbability);
  const utilization = effectiveArrivalRate / mu;

  let meanNumberInSystem = 0;
  for (let n = 0; n <= nMax; n++) {
    meanNumberInSystem += n * (probabilities[n] as number);
  }

  // Mean residence time via Little's law. When the effective arrival rate is
  // zero (no customers ever enter), define W = 0 rather than dividing by zero.
  const meanResidenceTime =
    effectiveArrivalRate > 0 ? meanNumberInSystem / effectiveArrivalRate : 0;

  return {
    arrivalRate: lambda,
    serviceRate: mu,
    capacity: nMax,
    trafficIntensity: r,
    probabilities,
    blockingProbability,
    effectiveArrivalRate,
    utilization,
    meanNumberInSystem,
    meanResidenceTime,
  };
}
