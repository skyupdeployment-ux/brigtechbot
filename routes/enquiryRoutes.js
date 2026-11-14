'use strict';

const router = require('express').Router();
const c = require('../controllers/enquiryController');
const { validate, validateObjectId } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const v = require('../validators');

router.use(authenticate);
router.get('/mine', validate(v.listEnquiries, 'query'), c.mine); // must stay above /:id
router.get('/', authorize('admin'), validate(v.listEnquiries, 'query'), c.list);
router.get('/:id', validateObjectId('id'), c.getOne);
router.patch('/:id', authorize('admin'), validateObjectId('id'), validate(v.updateEnquiry), c.update);
router.delete('/:id', authorize('admin'), validateObjectId('id'), c.remove);

module.exports = router;
