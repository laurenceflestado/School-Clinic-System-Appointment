const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const rateLimit = require('../middleware/ratelimit.middleware');

router.post('/login', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.staffLogin);
router.post('/patient/register', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.patientRegister);
router.post('/patient/login', rateLimit({ windowMs: 60_000, max: 10 }), ctrl.patientLogin);
router.get('/me', authenticate, ctrl.me);
router.post('/change-password', authenticate, ctrl.changePassword);

module.exports = router;
