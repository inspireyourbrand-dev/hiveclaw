/**
 * HiveClaw Authentication Middleware
 *
 * Provides API key authentication for external access to HiveClaw APIs.
 * Local requests (127.0.0.1 / ::1) are trusted by default.
 *
 * Set HIVECLAW_API_KEY in .env to require authentication.
 *
 * @module gateway/middleware/auth
 */

class Auth {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.HIVECLAW_API_KEY || null;
    this.trustLocal = config.trustLocal !== false;
  }

  middleware() {
    return (req, res, next) => {
      // No API key configured = open access (local-first default)
      if (!this.apiKey) return next();

      // Trust local connections
      if (this.trustLocal) {
        const ip = req.ip || req.connection.remoteAddress;
        if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
          return next();
        }
      }

      // Check API key
      const provided = req.headers['x-api-key'] || req.query.apiKey;
      if (provided === this.apiKey) return next();

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid X-API-Key header required for remote access',
      });
    };
  }
}

export default Auth;
