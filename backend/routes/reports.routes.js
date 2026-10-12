const router = require('express').Router();
const ctrl = require('../controllers/reports.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('ADMIN'));
router.get('/summary', ctrl.summary);
router.get('/audit', ctrl.audit);

module.exports = router;
