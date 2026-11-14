'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

// Same families the front-end offers: Photo, Document, Video.
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp'];
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.mkv', '.3gp', '.avi'];
const DOC_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.txt'];

const isSupported = (originalName, mimeType) => {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (IMAGE_EXT.includes(ext)) return mime.startsWith('image/');
  if (VIDEO_EXT.includes(ext)) return mime.startsWith('video/');
  if (ext === '.pdf') return mime === 'application/pdf';
  return DOC_EXT.includes(ext); // dwg/dxf/office files have inconsistent MIME types
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${ext}`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, files: env.MAX_FILES_PER_REQUEST },
  fileFilter: (req, file, cb) => {
    // Unsupported types are not stored; the bot answers "file type is not supported here".
    req.rejectedFiles = req.rejectedFiles || [];
    // Multer decodes names as latin1; restore UTF-8 file names.
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (isSupported(file.originalname, file.mimetype)) return cb(null, true);
    req.rejectedFiles.push({ originalName: file.originalname.slice(0, 255), mimeType: file.mimetype, size: 0 });
    return cb(null, false);
  },
});

module.exports = { uploadFiles: uploader.array('files', env.MAX_FILES_PER_REQUEST), isSupported };
