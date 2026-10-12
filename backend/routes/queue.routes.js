const router = require('express').Router();
const ctrl = require('../controllers/queue.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const rateLimit = require('../middleware/ratelimit.middleware');

router.post('/checkin', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.checkin); // public

router.post('/walkin', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.walkin);
router.get('/today', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.today);
router.post('/:id/call', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.call);
router.post('/:id/no-show', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.noShow);

module.exports = router;
