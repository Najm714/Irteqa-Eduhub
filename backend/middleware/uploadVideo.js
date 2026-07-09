// backend/middleware/uploadVideo.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// إنشاء مجلد الفيديوهات إذا لم يكن موجوداً
const videosDir = path.join(__dirname, '../uploads/videos');
if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, videosDir);
    },
    filename: function (req, file, cb) {
        // ✅ استخدام اسم فريد للملف
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'video-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'video/mp4', 
        'video/mpeg', 
        'video/quicktime', 
        'video/x-msvideo', 
        'video/webm',
        'video/x-matroska'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('❌ نوع الملف غير مدعوم. يرجى رفع فيديو بصيغة MP4, AVI, MOV, WEBM أو MKV'), false);
    }
};

const uploadVideo = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB
    }
});

module.exports = uploadVideo;