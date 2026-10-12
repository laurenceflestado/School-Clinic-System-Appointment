const router = require('express').Router();
const ctrl = require('../controllers/services.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.get('/', ctrl.list); // public: needed by the booking page
router.post('/', authenticate, requireRole('ADMIN'), ctrl.create);
router.put('/:id', authenticate, requireRole('ADMIN'), ctrl.update);

module.exports = router;
