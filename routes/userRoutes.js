'use strict';

const router = require('express').Router();
const c = require('../controllers/userController');
const { validate, validateObjectId } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const v = require('../validators');

router.use(authenticate);
router.get('/me', c.me); // must stay above /:id
router.patch('/me', validate(v.updateUser), c.updateMe);
router.get('/', authorize('admin'), validate(v.listUsers, 'query'), c.list);
router.get('/:id', authorize('admin'), validateObjectId('id'), c.getOne);
router.patch('/:id', authorize('admin'), validateObjectId('id'), validate(v.adminUpdateUser), c.update);
router.delete('/:id', authorize('admin'), validateObjectId('id'), c.remove);

module.exports = router;
