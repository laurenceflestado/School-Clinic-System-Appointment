const router = require('express').Router();
const ctrl = require('../controllers/notifications.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('NURSE', 'ADMIN'));
router.get('/', ctrl.list);
router.post('/:id/read', ctrl.markRead);

module.exports = router;
