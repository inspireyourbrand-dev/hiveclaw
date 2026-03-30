/**
 * Governor Mode — API Budget Protection Middleware
 *
 * Prevents runaway API costs by throttling concurrent requests,
 * enforcing minimum delays between calls, and implementing
 * a 3-tier exponential backoff when rate limits are hit.
 *
 * Tiers:
 *   1. Cooldown (60s)   — first rate limit hit
 *   2. Extended (15min)  — repeated rate limit hits
 *   3. Offline           — circuit breaker, manual reset required
 *
 * @module gateway/middleware/governor
 */

class Governor {
  constructor(config = {}) {
    this.maxConcurrent = config.maxConcurrent || 1;
    this.minDelayMs = config.minDelayMs || 2000;
    this.backoffTiers = config.backoffTiers || ['60000', '900000', 'offline'];

    this.activeCalls = 0;
    this.totalCalls = 0;
    this.throttled = false;
    this.backoffTier = 0;
    this.lastCallTime = 0;
    this.rateLimitHits = 0;
    this.circuitOpen = false;

    this._queue = [];
  }

  get state() {
    return {
      activeCalls: this.activeCalls,
      totalCalls: this.totalCalls,
      throttled: this.throttled,
      backoffTier: this.backoffTier,
      rateLimitHits: this.rateLimitHits,
      circuitOpen: this.circuitOpen,
      queueLength: this._queue.length,
    };
  }

  /**
   * Express middleware that gates API-bound requests
   */
  middleware() {
    return async (req, res, next) => {
      // Skip non-API routes
      if (!req.path.startsWith('/api/')) return next();

      // Circuit breaker
      if (this.circuitOpen) {
        return res.status(503).json({
          error: 'Governor: Circuit breaker OPEN — API calls suspended',
          tier: 3,
          action: 'POST /api/v1/governor/reset to resume',
        });
      }

      // Concurrency gate
      if (this.activeCalls >= this.maxConcurrent) {
        this.throttled = true;
        return new Promise((resolve, reject) => {
          this._queue.push(async () => {
            this.throttled = this._queue.length > 0;
            try {
              await this._processRequest(req, res, next);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });
      }

      await this._processRequest(req, res, next);
    };
  }

  async _processRequest(req, res, next) {
    // Minimum delay enforcement
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < this.minDelayMs) {
      await new Promise(r => setTimeout(r, this.minDelayMs - elapsed));
    }

    this.activeCalls++;
    this.totalCalls++;
    this.lastCallTime = Date.now();

    // Wrap response to detect rate limit responses
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      this.activeCalls--;
      this._drainQueue();

      // Check for rate limit indicators
      if (res.statusCode === 429) {
        this._handleRateLimit();
      }

      return originalJson(body);
    };

    next();
  }

  _handleRateLimit() {
    this.rateLimitHits++;
    this.backoffTier = Math.min(this.backoffTier + 1, this.backoffTiers.length);

    const tierValue = this.backoffTiers[this.backoffTier - 1];

    if (tierValue === 'offline') {
      this.circuitOpen = true;
      console.warn('[Governor] CIRCUIT BREAKER OPEN — all API calls suspended');
      return;
    }

    const delayMs = parseInt(tierValue);
    this.throttled = true;
    console.warn(`[Governor] Rate limit hit — backoff tier ${this.backoffTier} (${delayMs}ms)`);

    setTimeout(() => {
      this.throttled = false;
      this._drainQueue();
    }, delayMs);
  }

  _drainQueue() {
    if (this._queue.length > 0 && this.activeCalls < this.maxConcurrent && !this.throttled) {
      const nextFn = this._queue.shift();
      Promise.resolve(nextFn()).catch(err => {
        console.error('[Governor] Queued request failed:', err.message);
      });
    }
  }

  /**
   * Reset the circuit breaker (manual recovery)
   */
  reset() {
    this.circuitOpen = false;
    this.backoffTier = 0;
    this.throttled = false;
    this.rateLimitHits = 0;
    this._drainQueue();
    console.log('[Governor] Circuit breaker RESET — API calls resumed');
  }
}

export default Governor;
