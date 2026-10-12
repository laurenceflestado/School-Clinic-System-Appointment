const router = require('express').Router();
const ctrl = require('../controllers/appointments.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const rateLimit = require('../middleware/ratelimit.middleware');

router.post('/', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.book); // public
router.get('/status/:reference', rateLimit({ windowMs: 60_000, max: 30 }), ctrl.statusByReference); // public
router.post('/:reference/cancel', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.cancelByReference); // public

router.get('/mine', authenticate, requireRole('PATIENT'), ctrl.mine);

router.get('/', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.list);
router.post('/:id/approve', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.approve);
router.post('/:id/reject', authenticate, requireRole('NURSE', 'ADMIN'), ctrl.reject);
router.post('/:id/reassign', authenticate, requireRole('ADMIN'), ctrl.reassign);

module.exports = router;
