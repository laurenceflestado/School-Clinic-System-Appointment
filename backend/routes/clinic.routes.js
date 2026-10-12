const router = require('express').Router();
const ctrl = require('../controllers/clinic.controller');
const rateLimit = require('../middleware/ratelimit.middleware');

router.get('/availability', rateLimit({ windowMs: 60_000, max: 60 }), ctrl.availability);

module.exports = router;
