import { CircuitBreaker } from './circuitbreaker.js';
import { ServiceUnavailableError } from './errors.js';
import { createChildLogger } from './logger.js';

export class LoadBalancer {
  #backends;
  #breakers = new Map();
  #metrics = new Map();
  #currentIndex = 0;
  #logger;

  constructor(backends, circuitBreakerOptions = {}) {
    this.#logger = createChildLogger({ component: 'load-balancer' });

    this.#backends = backends.map((b) => ({
      ...b,
      activeConnections: 0,
    }));

    this.#backends.forEach((b) => {
      this.#breakers.set(b.id, new CircuitBreaker(b.id, circuitBreakerOptions));
      this.#metrics.set(b.id, {
        requests: 0,
        failures: 0,
        totalLatency: 0,
        avgLatency: 0,
      });
    });
  }

  #isAvailable(backend) {
    const breaker = this.#breakers.get(backend.id);
    const metrics = this.#metrics.get(backend.id);

    return (
      !breaker.isOpen &&
      backend.activeConnections < backend.maxConnections &&
      metrics.failures < backend.maxConnections
    );
  }

  get nextTarget() {
    const available = this.#backends.filter((b) => this.#isAvailable(b));

    if (available.length === 0) {
      this.#logger.error('No healthy backends available');
      throw new ServiceUnavailableError('No healthy backends available');
    }

    const totalWeight = available.reduce((sum, b) => sum + b.weight, 0);
    let attempts = 0;

    while (attempts < available.length) {
      const backend = available[this.#currentIndex % available.length];
      this.#currentIndex = (this.#currentIndex + 1) % available.length;

      if (backend.weight > 0) {
        backend.activeConnections++;
        return {
          target: backend.url,
          backendId: backend.id,
          weight: backend.weight,
        };
      }

      attempts++;
    }

    throw new ServiceUnavailableError('No backends with weight > 0');
  }

  releaseConnection(backendId) {
    const backend = this.#backends.find((b) => b.id === backendId);
    if (backend && backend.activeConnections > 0) {
      backend.activeConnections--;
    }
  }

  recordSuccess(backendId, latency) {
    this.#breakers.get(backendId).recordSuccess();
    this.releaseConnection(backendId);

    const metrics = this.#metrics.get(backendId);
    metrics.requests++;
    metrics.totalLatency += latency;
    metrics.avgLatency = metrics.totalLatency / metrics.requests;
  }

  recordFailure(backendId) {
    this.#breakers.get(backendId).recordFailure();
    this.releaseConnection(backendId);

    const metrics = this.#metrics.get(backendId);
    metrics.requests++;
    metrics.failures++;
  }

  get status() {
    return this.#backends.map((b) => ({
      id: b.id,
      url: b.url,
      activeConnections: b.activeConnections,
      maxConnections: b.maxConnections,
      weight: b.weight,
      breaker: this.#breakers.get(b.id).metrics,
      metrics: this.#metrics.get(b.id),
    }));
  }
}
