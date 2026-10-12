const router = require('express').Router();
const ctrl = require('../controllers/consultations.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('NURSE', 'ADMIN'));
router.post('/start', ctrl.start);
router.put('/:id', ctrl.update);
router.post('/:id/complete', ctrl.complete);

module.exports = router;
