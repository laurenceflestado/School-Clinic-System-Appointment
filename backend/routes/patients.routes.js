const router = require('express').Router();
const ctrl = require('../controllers/patients.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate, requireRole('NURSE', 'ADMIN'));
router.get('/', ctrl.search);
router.get('/:id/medical-records', requireRole('NURSE'), ctrl.medicalRecords);

module.exports = router;
