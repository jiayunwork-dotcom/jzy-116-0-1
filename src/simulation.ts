/**
 * Discrete-event simulation of the M/M/1/N queue.
 *
 * State definition is IDENTICAL to the analytical module:
 *   n = number of customers in the system, 0..capacity (capacity includes
 *   the customer in service). When n == capacity an arriving customer is
 *   discarded and counted as blocked ("blocked calls cleared").
 *
 * The event list is a binary heap ordered by event time. There are only two
 * event types:
 *   - "arrival":   a customer arrives; blocked if the system is full
 *   - "departure": a customer finishes service and leaves
 *
 * Statistical counters are time-integrals over the sample path:
 *   mean number in system = (1 / T) * integral n(t) dt
 *   utilization           = (1 / T) * integral {n(t) > 0} dt
 *   blocking ratio        = blocked arrivals / total arrivals
 */

import { Rng } from './rng.js';

export interface SimulationInput {
  arrivalRate: number;
  serviceRate: number;
  capacity: number;
  /** RNG seed; the same seed always yields the identical sample path. */
  seed: number;
  /** Stop after this many arrival events have been generated. */
  maxCustomers?: number;
  /** Stop when simulated time reaches this horizon. */
  maxTime?: number;
}

export interface SimulationResult {
  seed: number;
  /** total arrival events generated */
  arrivals: number;
  /** arrivals discarded because the system was full */
  blocked: number;
  /** arrivals that actually entered the system */
  served: number;
  /** simulated time at the end of the run */
  simulatedTime: number;
  /** empirical blocking ratio = blocked / arrivals */
  blockingRatio: number;
  /** empirical mean number in system */
  meanNumberInSystem: number;
  /** empirical server utilization */
  utilization: number;
}

interface ScheduledEvent {
  time: number;
  type: 'arrival' | 'departure';
}

/** Minimal binary heap (event list), earliest event on top. */
class EventList {
  private readonly heap: ScheduledEvent[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(event: ScheduledEvent): void {
    const heap = this.heap;
    heap.push(event);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((heap[parent] as ScheduledEvent).time <= (heap[i] as ScheduledEvent).time) break;
      [heap[parent], heap[i]] = [heap[i] as ScheduledEvent, heap[parent] as ScheduledEvent];
      i = parent;
    }
  }

  pop(): ScheduledEvent | undefined {
    const heap = this.heap;
    if (heap.length === 0) return undefined;
    const top = heap[0] as ScheduledEvent;
    const last = heap.pop() as ScheduledEvent;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < heap.length && (heap[left] as ScheduledEvent).time < (heap[smallest] as ScheduledEvent).time) {
          smallest = left;
        }
        if (right < heap.length && (heap[right] as ScheduledEvent).time < (heap[smallest] as ScheduledEvent).time) {
          smallest = right;
        }
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i] as ScheduledEvent, heap[smallest] as ScheduledEvent];
        i = smallest;
      }
    }
    return top;
  }
}

export function simulateQueue(input: SimulationInput): SimulationResult {
  const { arrivalRate: lambda, serviceRate: mu, capacity: nMax, seed } = input;
  const rng = new Rng(seed);
  const eventList = new EventList();

  let n = 0; // current number in system (0..nMax)
  let clock = 0; // current simulated time
  let lastEventTime = 0; // time of the previous event (for integration)

  let arrivals = 0;
  let blocked = 0;
  let areaNumberInSystem = 0; // integral of n(t) over time
  let busyTime = 0; // integral of 1{n(t) > 0} over time

  const scheduleArrival = (): void => {
    eventList.push({ time: clock + rng.exponential(lambda), type: 'arrival' });
  };
  const scheduleDeparture = (): void => {
    eventList.push({ time: clock + rng.exponential(mu), type: 'departure' });
  };

  scheduleArrival();

  const accumulate = (until: number): void => {
    const dt = until - lastEventTime;
    if (dt > 0) {
      areaNumberInSystem += n * dt;
      if (n > 0) busyTime += dt;
    }
    lastEventTime = until;
  };

  while (eventList.size > 0) {
    const event = eventList.pop() as ScheduledEvent;

    // Time horizon: integrate up to maxTime exactly, then stop.
    if (input.maxTime !== undefined && event.time > input.maxTime) {
      accumulate(input.maxTime);
      clock = input.maxTime;
      break;
    }

    accumulate(event.time);
    clock = event.time;

    if (event.type === 'arrival') {
      arrivals += 1;
      if (n >= nMax) {
        // Full system: reject and count.
        blocked += 1;
      } else {
        if (n === 0) {
          // Server was idle: the new customer starts service immediately.
          scheduleDeparture();
        }
        n += 1;
      }
      // Schedule the next arrival regardless (blocked arrivals are still
      // part of the arrival process).
      scheduleArrival();
    } else {
      // Departure: customer leaves; if others wait, the next one starts.
      n -= 1;
      if (n > 0) {
        scheduleDeparture();
      }
    }

    // Customer-count stop condition.
    if (input.maxCustomers !== undefined && arrivals >= input.maxCustomers) {
      break;
    }
  }

  const served = arrivals - blocked;
  const simulatedTime = clock;

  return {
    seed,
    arrivals,
    blocked,
    served,
    simulatedTime,
    blockingRatio: arrivals > 0 ? blocked / arrivals : 0,
    meanNumberInSystem: simulatedTime > 0 ? areaNumberInSystem / simulatedTime : 0,
    utilization: simulatedTime > 0 ? busyTime / simulatedTime : 0,
  };
}
