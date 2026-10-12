// Simple in-memory sliding-window limiter per IP+route. Good enough for a
// single-process school clinic deployment; swap for a shared store if this
// ever runs behind a load balancer.

const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || [];
    const fresh = bucket.filter((t) => now - t < windowMs);
    if (fresh.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    fresh.push(now);
    buckets.set(key, fresh);
    next();
  };
}

module.exports = rateLimit;
