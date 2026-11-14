'use strict';

const router = require('express').Router();
const c = require('../controllers/botController');
const { validate, validateObjectId } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const v = require('../validators');

router.get('/public', c.publicConfig); // no auth: header text, timezone, booking limits
router.use(authenticate, authorize('admin'));
router.get('/', c.list);
router.post('/', validate(v.createBot), c.create);
router.get('/:id', validateObjectId('id'), c.getOne);
router.put('/:id', validateObjectId('id'), validate(v.updateBot), c.update);
router.delete('/:id', validateObjectId('id'), c.remove);

module.exports = router;
