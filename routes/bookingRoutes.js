'use strict';

const router = require('express').Router();
const c = require('../controllers/bookingController');
const { validate, validateObjectId } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators');

router.use(authenticate); // admins see all bookings, customers only their own
router.get('/', validate(v.listBookings, 'query'), c.list);
router.get('/:id', validateObjectId('id'), c.getOne);
router.patch('/:id', validateObjectId('id'), validate(v.updateBooking), c.update);
router.delete('/:id', validateObjectId('id'), c.remove);

module.exports = router;
