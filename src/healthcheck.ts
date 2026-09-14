import { createChildLogger } from './logger.js';
import type { LoadBalancer } from './loadbalancer.js';
import type { HealthCheckOptions } from './config.js';

const logger = createChildLogger({ component: 'health-checker' });

export class HealthChecker {
  #balancer: LoadBalancer;
  #interval: ReturnType<typeof setInterval> | undefined;
  #timeout: number;
  #path: string;
  #checkInterval: number;

  constructor(balancer: LoadBalancer, options: Partial<HealthCheckOptions> = {}) {
    this.#balancer = balancer;
    this.#checkInterval = options.interval || 30000;
    this.#timeout = options.timeout || 5000;
    this.#path = options.path || '/health';
  }

  async #checkBackend(url: string): Promise<boolean> {
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

  async #runChecks(): Promise<void> {
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

  start(): void {
    this.#runChecks().catch((err) => {
      logger.error({ err }, 'Health check failed');
    });
    this.#interval = setInterval(() => {
      this.#runChecks().catch((err) => {
        logger.error({ err }, 'Health check failed');
      });
    }, this.#checkInterval);
  }

  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
    }
  }
}
