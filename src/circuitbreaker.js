import { createChildLogger } from './logger.js';

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

export class CircuitBreaker {
  #state = STATES.CLOSED;
  #failureCount = 0;
  #successCount = 0;
  #lastFailureTime = 0;
  #options;
  #logger;

  constructor(backendId, options = {}) {
    this.#options = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTime: options.recoveryTime || 30000,
      halfOpenRequests: options.halfOpenRequests || 3,
    };
    this.#logger = createChildLogger({ component: 'circuit-breaker', backendId });
  }

  get state() {
    return this.#state;
  }

  get isOpen() {
    if (this.#state === STATES.OPEN) {
      if (Date.now() - this.#lastFailureTime >= this.#options.recoveryTime) {
        this.#transitionTo(STATES.HALF_OPEN);
        return false;
      }
      return true;
    }
    return false;
  }

  #transitionTo(newState) {
    this.#logger.info({ from: this.#state, to: newState }, 'Circuit state transition');
    this.#state = newState;

    if (newState === STATES.HALF_OPEN) {
      this.#successCount = 0;
    }
  }

  recordSuccess() {
    if (this.#state === STATES.HALF_OPEN) {
      this.#successCount++;
      if (this.#successCount >= this.#options.halfOpenRequests) {
        this.#failureCount = 0;
        this.#transitionTo(STATES.CLOSED);
      }
    } else {
      this.#failureCount = 0;
    }
  }

  recordFailure() {
    this.#failureCount++;
    this.#lastFailureTime = Date.now();

    if (this.#state === STATES.HALF_OPEN) {
      this.#transitionTo(STATES.OPEN);
      return;
    }

    if (this.#failureCount >= this.#options.failureThreshold) {
      this.#transitionTo(STATES.OPEN);
    }
  }

  get metrics() {
    return {
      state: this.#state,
      failureCount: this.#failureCount,
      successCount: this.#successCount,
      lastFailureTime: this.#lastFailureTime,
    };
  }
}
