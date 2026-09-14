import { createChildLogger } from './logger.js';

const logger = createChildLogger({ component: 'health-checker' });

export class HealthChecker {
  #balancer;
  #interval;
  #timeout;
  #path;

  constructor(balancer, options = {}) {
    this.#balancer = balancer;
    this.#interval = options.interval || 30000;
    this.#timeout = options.timeout || 5000;
    this.#path = options.path || '/health';
  }

  async #checkBackend(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);

    try {
      const res = await fetch(`${url}${this.#path}`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async #runChecks() {
    const status = this.#balancer.status;

    await Promise.allSettled(
      status.map(async (backend) => {
        const healthy = await this.#checkBackend(backend.url);
        if (healthy) {
          this.#balancer.markHealthy(backend.id);
        } else {
          this.#balancer.markUnhealthy(backend.id);
        }
      })
    );
  }

  start() {
    this.#runChecks().catch((err) => {
      logger.error({ err }, 'Health check failed');
    });
    this.#interval = setInterval(() => {
      this.#runChecks().catch((err) => {
        logger.error({ err }, 'Health check failed');
      });
    }, this.#interval);
  }

  stop() {
    clearInterval(this.#interval);
  }
}
