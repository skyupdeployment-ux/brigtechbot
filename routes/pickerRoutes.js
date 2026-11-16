'use strict';

const router = require('express').Router();
const c = require('../controllers/pickerController');
const { validate } = require('../middleware/validate');
const v = require('../validators');

router.get('/app.js', c.script); // keep above /:token
router.get('/:token', c.page);
router.get('/:token/info', c.info);
router.post('/:token/submit', validate(v.pickDateTime), c.submit);

module.exports = router;
