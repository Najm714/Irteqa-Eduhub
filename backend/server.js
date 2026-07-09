// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// Middleware
// ============================================================
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// ============================================================
// خدمة الملفات الثابتة (Frontend)
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================
// إنشاء مجلدات uploads
// ============================================================
const uploadsDir = path.join(__dirname, 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const ordersDir = path.join(uploadsDir, 'orders');
const summariesDir = path.join(uploadsDir, 'summaries');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 تم إنشاء مجلد uploads');
}
if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
    console.log('📁 تم إنشاء مجلد videos');
}
if (!fs.existsSync(ordersDir)) {
    fs.mkdirSync(ordersDir, { recursive: true });
    console.log('📁 تم إنشاء مجلد orders');
}
if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
    console.log('📁 تم إنشاء مجلد summaries');
}

console.log('📁 مسار uploads:', uploadsDir);
console.log('📁 مسار videos:', videosDir);
console.log('📁 مسار summaries:', summariesDir);

// ============================================================
// خدمة الملفات الثابتة (Uploads)
// ============================================================
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads/videos', express.static(videosDir));
app.use('/uploads/orders', express.static(ordersDir));
app.use('/uploads/summaries', express.static(summariesDir));

// ============================================================
// مسار مباشر للفيديوهات (حل بديل)
// ============================================================
app.get('/uploads/videos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(videosDir, filename);
    
    console.log('📁 محاولة تحميل:', filePath);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        // محاولة البحث في مسار آخر
        const altPath = path.join(__dirname, '../uploads/videos', filename);
        console.log('📁 محاولة بديلة:', altPath);
        
        if (fs.existsSync(altPath)) {
            res.sendFile(altPath);
        } else {
            console.error('❌ الملف غير موجود:', filename);
            res.status(404).json({
                success: false,
                message: 'الملف غير موجود',
                filename: filename
            });
        }
    }
});

// ============================================================
// مسار بديل للفيديوهات (بسيط)
// ============================================================
app.get('/video/:filename', (req, res) => {
    const filePath = path.join(videosDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({
            success: false,
            message: 'الملف غير موجود'
        });
    }
});

// ============================================================
// التحقق من وجود الملفات عند بدء التشغيل
// ============================================================
if (fs.existsSync(videosDir)) {
    const files = fs.readdirSync(videosDir);
    console.log('📁 محتويات مجلد الفيديوهات:', files);
    console.log(`📁 عدد الملفات: ${files.length}`);
} else {
    console.log('⚠️ مجلد الفيديوهات غير موجود');
}

// ============================================================
// الاتصال بقاعدة البيانات
// ============================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/draseh_platform';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message));

// ============================================================
// استيراد النماذج (Models)
// ============================================================
const Video = require('./models/Video');
const Model = require('./models/Model');
const Order = require('./models/Order');
const User = require('./models/User');
const University = require('./models/University');           // ✅ تم الإضافة
const ExplanationMaterial = require('./models/ExplanationMaterial'); // ✅ تم الإضافة
const Summary = require('./models/Summary'); // ✅ إضافة نموذج الملخصات

// ============================================================
// استيراد الميدل وير
// ============================================================
const uploadVideo = require('./middleware/uploadVideo');
const upload = require('./middleware/upload');
const { protect, authorize } = require('./middleware/auth');

// ============================================================
// المسار الرئيسي
// ============================================================
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: '🚀 مرحباً بك في منصة ارتقاء - الخادم يعمل بنجاح!',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            orders: '/api/orders',
            videos: '/api/videos',
            models: '/api/models',
            users: '/api/users',
            summaries: '/api/summaries',
            health: '/api/health'
        },
        status: {
            server: 'running',
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            time: new Date().toISOString()
        }
    });
});

// ============================================================
// مسار الصحة
// ============================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'الخادم يعمل بشكل صحيح 🚀',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 1. مسارات المصادقة (AUTH)
// ============================================================

// تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مسجل بالفعل'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'user',
            isActive: true
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const jwt = require('jsonwebtoken');
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        if (!user.password) {
            return res.status(500).json({
                success: false,
                message: 'خطأ في بيانات المستخدم، يرجى التواصل مع الدعم'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || 'my_super_secret_key_123456',
            { expiresIn: '30d' }
        );

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// جلب بيانات المستخدم الحالي
app.get('/api/auth/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// مسارات الفيديوهات
// ============================================================

// رفع فيديو جديد
app.post('/api/videos/upload', protect, authorize('admin'), uploadVideo.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'يرجى اختيار فيديو'
            });
        }

        const { title, subjectId, subjectName, description } = req.body;

        if (!title || !subjectId) {
            return res.status(400).json({
                success: false,
                message: 'العنوان ومعرف المادة مطلوبان'
            });
        }

        const fileName = req.file.filename;
        const publicPath = `/uploads/videos/${fileName}`;

        const video = new Video({
            title: title,
            subjectId: parseInt(subjectId),
            subjectName: subjectName || '',
            description: description || '',
            fileName: fileName,
            filePath: publicPath,
            fileSize: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
            fileType: req.file.mimetype,
            uploadDate: new Date(),
            views: 0
        });

        await video.save();

        res.status(201).json({
            success: true,
            message: 'تم رفع الفيديو بنجاح',
            data: video
        });
    } catch (error) {
        console.error('❌ خطأ في رفع الفيديو:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب جميع الفيديوهات
app.get('/api/videos/all', async (req, res) => {
    try {
        const videos = await Video.find().sort({ uploadDate: -1 });
        res.status(200).json({
            success: true,
            data: videos
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفيديوهات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب فيديوهات مادة معينة
app.get('/api/videos/subject/:subjectId', async (req, res) => {
    try {
        const videos = await Video.find({ subjectId: parseInt(req.params.subjectId) });
        res.status(200).json({
            success: true,
            data: videos
        });
    } catch (error) {
        console.error('❌ خطأ في جلب فيديوهات المادة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف فيديو
app.delete('/api/videos/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }

        // حذف الملف من الخادم
        if (video.fileName) {
            const filePath = path.join(__dirname, '../uploads/videos', video.fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await video.deleteOne();
        res.status(200).json({
            success: true,
            message: 'تم حذف الفيديو بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الفيديو:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 2. مسارات الفيديوهات (VIDEOS)
// ============================================================

// رفع فيديو جديد
app.post('/api/videos/upload', uploadVideo.single('video'), async (req, res) => {
    try {
        console.log('📁 استلام فيديو:', req.file);
        console.log('📦 بيانات:', req.body);

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'يرجى اختيار فيديو'
            });
        }

        const { title, subjectId, subjectName, specialtyName, universityName, description } = req.body;

        if (!title || !subjectId || !subjectName) {
            return res.status(400).json({
                success: false,
                message: 'العنوان، معرف المادة، واسم المادة مطلوبون'
            });
        }

        // استخراج اسم الملف فقط
        const fileName = req.file.filename;
        
        // بناء المسار العام
        const publicPath = `/uploads/videos/${fileName}`;

        console.log('📁 اسم الملف:', fileName);
        console.log('📁 المسار العام:', publicPath);

        const video = new Video({
            title: title,
            subjectId: parseInt(subjectId),
            subjectName: subjectName,
            specialtyName: specialtyName || '',
            universityName: universityName || '',
            description: description || '',
            fileName: fileName,
            filePath: publicPath,
            fileSize: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
            fileType: req.file.mimetype,
            uploadDate: new Date(),
            views: 0
        });

        await video.save();

        console.log('✅ تم رفع الفيديو:', video.title);
        console.log('✅ المسار المخزن:', video.filePath);

        res.status(201).json({
            success: true,
            message: 'تم رفع الفيديو بنجاح',
            data: video
        });
    } catch (error) {
        console.error('❌ خطأ في رفع الفيديو:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// جلب جميع الفيديوهات
app.get('/api/videos/all', async (req, res) => {
    try {
        const videos = await Video.find().sort({ uploadDate: -1 });
        res.status(200).json({
            success: true,
            count: videos.length,
            data: videos
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفيديوهات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب فيديوهات مادة معينة
app.get('/api/videos/subject/:subjectId', async (req, res) => {
    try {
        const videos = await Video.find({ subjectId: parseInt(req.params.subjectId) });
        res.status(200).json({
            success: true,
            count: videos.length,
            data: videos
        });
    } catch (error) {
        console.error('❌ خطأ في جلب فيديوهات المادة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب فيديو محدد
app.get('/api/videos/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: video
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفيديو:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// تحديث عدد المشاهدات
app.put('/api/videos/:id/views', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: video
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث المشاهدات:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف فيديو (للمدير فقط)
app.delete('/api/videos/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }

        // حذف الملف من الخادم
        if (video.fileName) {
            const filePath = path.join(videosDir, video.fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ تم حذف الملف: ${filePath}`);
            }
        }

        await video.deleteOne();
        res.status(200).json({
            success: true,
            message: 'تم حذف الفيديو بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الفيديو:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الفيديو غير موجود'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 3. مسارات النماذج (MODELS) - تم التعديل لدعم الخدمات الجديدة
// ============================================================

// جلب جميع النماذج
app.get('/api/models', async (req, res) => {
    try {
        const models = await Model.find()
            .populate('uploadedBy', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: models.length,
            data: models
        });
    } catch (error) {
        console.error('❌ خطأ في جلب النماذج:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب نموذج محدد
app.get('/api/models/:id', async (req, res) => {
    try {
        const model = await Model.findById(req.params.id);
        if (!model) {
            return res.status(404).json({
                success: false,
                message: 'النموذج غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: model
        });
    } catch (error) {
        console.error('❌ خطأ في جلب النموذج:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// رفع نموذج جديد - ✅ تم التعديل لإزالة التحقق من mainService
app.post('/api/models', protect, authorize('admin'), async (req, res) => {
    try {
        const { 
            title, 
            category, 
            description, 
            fileName, 
            fileSize, 
            fileType, 
            fileData, 
            mainService, 
            subService 
        } = req.body;

        // التحقق من الحقول المطلوبة
        if (!title || !category || !fileName || !fileData || !mainService) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال جميع البيانات المطلوبة (العنوان، التصنيف، اسم الملف، بيانات الملف، والخدمة الرئيسية)'
            });
        }

        console.log('📦 رفع نموذج جديد:');
        console.log('  - العنوان:', title);
        console.log('  - الخدمة الرئيسية:', mainService);
        console.log('  - الخدمة الفرعية:', subService || 'غير محددة');
        console.log('  - التصنيف:', category);

        // إنشاء نموذج جديد - ✅ بدون التحقق من enum
        const model = new Model({
            title,
            category,
            description: description || '',
            fileName,
            fileSize: fileSize || '0 KB',
            fileType: fileType || 'application/octet-stream',
            fileData,
            mainService: mainService, // ✅ يقبل أي قيمة
            subService: subService || 'خدمة فرعية'
        });

        await model.save();

        console.log('✅ تم رفع النموذج بنجاح:', model.title);

        res.status(201).json({
            success: true,
            message: 'تم رفع النموذج بنجاح',
            data: model
        });
    } catch (error) {
        console.error('❌ خطأ في رفع النموذج:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message,
            details: error.errors || {}
        });
    }
});

// حذف نموذج
app.delete('/api/models/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const model = await Model.findById(req.params.id);
        if (!model) {
            return res.status(404).json({
                success: false,
                message: 'النموذج غير موجود'
            });
        }
        await model.deleteOne();
        res.status(200).json({
            success: true,
            message: 'تم حذف النموذج بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف النموذج:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 4. مسارات الطلبات (ORDERS)
// ============================================================

// جلب جميع الطلبات للمدير - مع معالجة user: null
app.get('/api/orders/admin/all', protect, authorize('admin'), async (req, res) => {
    try {
        const orders = await Order.find()
            .populate({
                path: 'user',
                select: 'name email'
            })
            .populate({
                path: 'assignedExpert',
                select: 'name email'
            })
            .sort({ createdAt: -1 });
        
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            if (!orderObj.user) {
                orderObj.user = {
                    _id: null,
                    name: 'مستخدم غير مسجل',
                    email: 'لا يوجد بريد إلكتروني'
                };
            }
            if (!orderObj.assignedExpert) {
                orderObj.assignedExpert = {
                    _id: null,
                    name: 'غير معين',
                    email: ''
                };
            }
            return orderObj;
        });
        
        res.status(200).json({
            success: true,
            count: processedOrders.length,
            data: processedOrders
        });
    } catch (error) {
        console.error('❌ خطأ في جلب جميع الطلبات:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// جلب طلبات الخبير - مع معالجة user: null
app.get('/api/orders/expert', protect, authorize('expert'), async (req, res) => {
    try {
        const orders = await Order.find({ assignedExpert: req.user.id })
            .populate({
                path: 'user',
                select: 'name email'
            })
            .populate({
                path: 'assignedExpert',
                select: 'name email'
            })
            .sort({ assignedAt: -1, createdAt: -1 });
            
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            if (!orderObj.user) {
                orderObj.user = {
                    _id: null,
                    name: 'مستخدم غير مسجل',
                    email: 'لا يوجد بريد إلكتروني'
                };
            }
            if (!orderObj.assignedExpert) {
                orderObj.assignedExpert = {
                    _id: null,
                    name: 'غير معين',
                    email: ''
                };
            }
            return orderObj;
        });

        res.status(200).json({
            success: true,
            count: processedOrders.length,
            data: processedOrders
        });
    } catch (error) {
        console.error('❌ خطأ في جلب طلبات الخبير:', error);
        if (error.name === 'CastError' || (error.message && error.message.includes('CastError'))) {
            return res.status(200).json({
                success: true,
                count: 0,
                data: []
            });
        }
        res.status(500).json({
            success: false,
            message: error.message || 'حدث خطأ في جلب الطلبات'
        });
    }
});

// جلب طلبات المستخدم
app.get('/api/orders', protect, async (req, res) => {
    try {
        const filter = req.user?.id ? { user: req.user.id } : {};
        const orders = await Order.find(filter)
            .populate({
                path: 'user',
                select: 'name email'
            })
            .sort({ createdAt: -1 });
            
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            if (!orderObj.user) {
                orderObj.user = {
                    _id: null,
                    name: 'مستخدم غير مسجل',
                    email: 'لا يوجد بريد إلكتروني'
                };
            }
            return orderObj;
        });
        
        res.status(200).json({
            success: true,
            count: processedOrders.length,
            data: processedOrders
        });
    } catch (error) {
        console.error('❌ خطأ في جلب طلبات المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', protect, async (req, res) => {
    try {
        const orderData = {
            serviceType: req.body.serviceType || 'خدمة',
            title: req.body.title || 'طلب جديد',
            description: req.body.description || '',
            deadline: req.body.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            budget: req.body.budget || 0,
            status: 'pending',
            user: req.user.id
        };
        
        const order = await Order.create(orderData);
        
        res.status(201).json({
            success: true,
            message: 'تم إنشاء الطلب بنجاح ✅',
            data: order
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء الطلب:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب طلب محدد
app.get('/api/orders/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('assignedExpert', 'name email');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user._id.toString()) || 
            (req.user.role === 'expert' && order.assignedExpert && req.user.id === order.assignedExpert._id.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لعرض هذا الطلب'
            });
        }

        res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الطلب:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// تحديث طلب
app.put('/api/orders/:id', protect, async (req, res) => {
    try {
        let order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لتعديل هذا الطلب'
            });
        }

        if (req.user.role !== 'admin') {
            delete req.body.assignedExpert;
            delete req.body.budget;
        }

        order = await Order.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'تم تحديث الطلب بنجاح ✅',
            data: order
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث الطلب:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف طلب
app.delete('/api/orders/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لحذف هذا الطلب'
            });
        }

        if (order.files && order.files.length > 0) {
            for (const file of order.files) {
                if (file.filePath && fs.existsSync(file.filePath)) {
                    try {
                        fs.unlinkSync(file.filePath);
                    } catch (err) {
                        console.error('❌ خطأ في حذف الملف:', err);
                    }
                }
            }
        }

        await order.deleteOne();

        res.status(200).json({
            success: true,
            message: 'تم حذف الطلب بنجاح 🗑️'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الطلب:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// رفع ملفات للطلب
app.post('/api/orders/:orderId/upload', protect, upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'يرجى رفع ملف واحد على الأقل'
            });
        }

        const order = await Order.findById(req.params.orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لرفع ملفات لهذا الطلب'
            });
        }

        const fileData = req.files.map(file => ({
            filename: file.originalname || file.filename,
            filePath: file.path ? file.path.replace(/\\/g, '/') : null,
            fileId: file.filename || `file_${Date.now()}`,
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadDate: new Date()
        }));

        order.files.push(...fileData);
        await order.save();

        res.status(200).json({
            success: true,
            message: `تم رفع ${req.files.length} ملف بنجاح ✅`,
            data: {
                files: fileData,
                order: order
            }
        });
    } catch (error) {
        console.error('❌ خطأ في رفع الملفات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب ملفات الطلب
app.get('/api/orders/:orderId/files', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString()) ||
            (req.user.role === 'expert' && order.assignedExpert && req.user.id === order.assignedExpert.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لعرض هذه الملفات'
            });
        }

        res.status(200).json({
            success: true,
            files: order.files || []
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الملفات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// تحميل ملف معين
app.get('/api/orders/:orderId/files/:fileIndex', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString()) ||
            (req.user.role === 'expert' && order.assignedExpert && req.user.id === order.assignedExpert.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لتحميل هذا الملف'
            });
        }

        const fileIndex = parseInt(req.params.fileIndex);
        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= order.files.length) {
            return res.status(404).json({
                success: false,
                message: 'الملف غير موجود'
            });
        }

        const file = order.files[fileIndex];
        
        const possiblePaths = [];
        
        if (file.filePath) {
            possiblePaths.push(file.filePath);
        }
        
        const uploadsDir = path.join(__dirname, 'uploads');
        const ordersUploadsDir = path.join(__dirname, 'uploads', 'orders');
        
        const possibleNames = [
            file.filename,
            file.fileId,
            `${req.params.orderId}_${file.filename}`,
            `${req.params.orderId}_${file.fileId}`
        ];
        
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            for (const f of files) {
                for (const name of possibleNames) {
                    if (f.includes(name) || name.includes(f)) {
                        possiblePaths.push(path.join(uploadsDir, f));
                        break;
                    }
                }
            }
        }
        
        if (fs.existsSync(ordersUploadsDir)) {
            const files = fs.readdirSync(ordersUploadsDir);
            for (const f of files) {
                for (const name of possibleNames) {
                    if (f.includes(name) || name.includes(f)) {
                        possiblePaths.push(path.join(ordersUploadsDir, f));
                        break;
                    }
                }
            }
        }
        
        let foundPath = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                foundPath = p;
                break;
            }
        }
        
        if (!foundPath) {
            return res.status(404).json({
                success: false,
                message: 'الملف غير موجود على الخادم'
            });
        }

        res.download(foundPath, file.filename);
    } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحميل الملف'
        });
    }
});

// تحديث حالة الطلب
app.put('/api/orders/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'in-progress', 'completed', 'revision', 'cancelled'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'حالة غير صالحة. الحالات المتاحة: ' + validStatuses.join(', ')
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (req.user.role === 'expert' && order.assignedExpert && req.user.id === order.assignedExpert.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لتحديث حالة هذا الطلب'
            });
        }

        order.status = status;
        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'name email')
            .populate('assignedExpert', 'name email');

        res.status(200).json({
            success: true,
            message: `تم تحديث حالة الطلب إلى ${status} ✅`,
            data: populatedOrder
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة الطلب:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// جلب معلومات الملفات
app.get('/api/orders/:orderId/files-info', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString()) ||
            (req.user.role === 'expert' && order.assignedExpert && req.user.id === order.assignedExpert.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لعرض معلومات الملفات'
            });
        }

        const filesInfo = (order.files || []).map((file, index) => ({
            index: index,
            filename: file.filename,
            fileId: file.fileId,
            filePath: file.filePath,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            uploadDate: file.uploadDate,
            exists: file.filePath ? fs.existsSync(file.filePath) : false
        }));

        res.status(200).json({
            success: true,
            count: filesInfo.length,
            data: filesInfo
        });
    } catch (error) {
        console.error('❌ خطأ في جلب معلومات الملفات:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// حذف ملف
app.delete('/api/orders/:orderId/files/:fileIndex', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود'
            });
        }

        const isAuthorized = 
            req.user.role === 'admin' || 
            (order.user && req.user.id === order.user.toString());

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لحذف هذا الملف'
            });
        }

        const fileIndex = parseInt(req.params.fileIndex);
        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= order.files.length) {
            return res.status(404).json({
                success: false,
                message: 'الملف غير موجود'
            });
        }

        const file = order.files[fileIndex];
        
        if (file.filePath && fs.existsSync(file.filePath)) {
            try {
                fs.unlinkSync(file.filePath);
            } catch (err) {
                console.error('❌ خطأ في حذف الملف من الخادم:', err);
            }
        }

        order.files.splice(fileIndex, 1);
        await order.save();

        res.status(200).json({
            success: true,
            message: 'تم حذف الملف بنجاح 🗑️'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الملف:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// تعيين خبير للطلب
app.put('/api/orders/:id/assign-expert', protect, authorize('admin'), async (req, res) => {
    try {
        const { expertId, notes } = req.body;
        
        if (!expertId) {
            return res.status(400).json({
                success: false,
                message: 'يرجى اختيار خبير'
            });
        }

        const expert = await User.findById(expertId);
        
        if (!expert) {
            return res.status(404).json({
                success: false,
                message: 'الخبير غير موجود'
            });
        }

        if (expert.role !== 'expert') {
            return res.status(400).json({
                success: false,
                message: 'المستخدم المحدد ليس خبيراً'
            });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            {
                assignedExpert: expertId,
                assignedAt: new Date(),
                status: 'in-progress',
                expertNotes: notes || ''
            },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'الطلب غير موجود ❌'
            });
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'name email')
            .populate('assignedExpert', 'name email');

        console.log(`✅ تم تعيين الخبير ${expert.name} للطلب ${order._id}`);

        res.status(200).json({
            success: true,
            message: `تم تعيين الخبير ${expert.name} بنجاح ✅`,
            data: populatedOrder
        });
    } catch (error) {
        console.error('❌ خطأ في تعيين الخبير:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تعيين الخبير'
        });
    }
});

// ============================================================
// نموذج الاشتراك (Subscription)
// ============================================================
const Subscription = require('./models/Subscription');

// ============================================================
// مسارات الاشتراكات
// ============================================================

// 1. إنشاء طلب اشتراك جديد (للعميل)
app.post('/api/subscriptions', async (req, res) => {
    try {
        const { name, email, phone, subscriptionType, materialId, title, price, paymentMethod, notes, userName, userEmail } = req.body;

        // التحقق من البيانات المطلوبة
        if (!name || !email || !phone || !subscriptionType || !materialId || !title || !price) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول المطلوبة غير مكتملة'
            });
        }

        // البحث عن المستخدم أو إنشاؤه
        let user = await User.findOne({ email });
        if (!user) {
            // إنشاء مستخدم جديد
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('password123', salt);
            
            user = new User({
                name: name,
                email: email,
                password: hashedPassword,
                role: 'user',
                isActive: true
            });
            await user.save();
        }

        // إنشاء طلب اشتراك جديد
        const subscription = new Subscription({
            user: user._id,
            subscriptionType: subscriptionType,
            materialId: materialId,
            title: title,
            price: price,
            phone: phone,
            paymentMethod: paymentMethod || 'card',
            status: 'pending',
            notes: notes || '',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await subscription.save();

        console.log('✅ تم إنشاء طلب اشتراك جديد:', subscription.title);

        res.status(201).json({
            success: true,
            message: 'تم إرسال طلب الاشتراك بنجاح',
            data: subscription
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء طلب الاشتراك:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. جلب جميع طلبات الاشتراك (للمدير فقط)
app.get('/api/subscriptions', protect, authorize('admin'), async (req, res) => {
    try {
        const subscriptions = await Subscription.find()
            .populate('user', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: subscriptions
        });
    } catch (error) {
        console.error('❌ خطأ في جلب طلبات الاشتراك:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. تحديث حالة الاشتراك (للمدير فقط)
app.put('/api/subscriptions/:id/status', protect, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'active', 'cancelled'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'حالة غير صالحة. الحالات المتاحة: pending, active, cancelled'
            });
        }

        const subscription = await Subscription.findByIdAndUpdate(
            req.params.id,
            { status, updatedAt: new Date() },
            { new: true }
        ).populate('user', 'name email');

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'طلب الاشتراك غير موجود'
            });
        }

        // إذا تم التفعيل، يمكن إرسال إشعار للعميل هنا
        if (status === 'active') {
            console.log(`✅ تم تفعيل اشتراك "${subscription.title}" للمستخدم ${subscription.user?.name}`);
            // يمكن إضافة كود لإرسال إيميل أو إشعار
        }

        res.status(200).json({
            success: true,
            message: `تم تحديث حالة الاشتراك إلى ${status}`,
            data: subscription
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة الاشتراك:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. حذف طلب اشتراك (للمدير فقط)
app.delete('/api/subscriptions/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'طلب الاشتراك غير موجود'
            });
        }

        await subscription.deleteOne();
        res.status(200).json({
            success: true,
            message: 'تم حذف طلب الاشتراك بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف طلب الاشتراك:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. جلب طلبات اشتراك المستخدم الحالي
app.get('/api/subscriptions/my', protect, async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ user: req.user.id })
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: subscriptions
        });
    } catch (error) {
        console.error('❌ خطأ في جلب طلبات اشتراك المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ============================================================
// 5. مسارات المستخدمين (USERS)
// ============================================================

// جلب جميع المستخدمين
app.get('/api/users', protect, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب جميع الخبراء
app.get('/api/users/experts', protect, authorize('admin'), async (req, res) => {
    try {
        const experts = await User.find({ role: 'expert' })
            .select('-password')
            .sort({ name: 1 });
        res.status(200).json({
            success: true,
            data: experts
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الخبراء:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// جلب مستخدم محدد
app.get('/api/users/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// تحديث مستخدم
app.put('/api/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const { isActive, expertise, bio, role } = req.body;
        const updateData = {};
        if (isActive !== undefined) updateData.isActive = isActive;
        if (expertise !== undefined) updateData.expertise = expertise;
        if (bio !== undefined) updateData.bio = bio;
        if (role !== undefined) updateData.role = role;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف مستخدم
app.delete('/api/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف المستخدم:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 6. مسارات الجامعات (UNIVERSITIES)
// ============================================================

// جلب جميع الجامعات
app.get('/api/universities', async (req, res) => {
    try {
        const universities = await University.find().sort({ name: 1 });
        res.status(200).json({
            success: true,
            data: universities
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الجامعات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// إضافة جامعة جديدة
app.post('/api/universities', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, icon, count } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'اسم الجامعة مطلوب' });
        }
        
        // التحقق من عدم وجود جامعة بنفس الاسم
        const existing = await University.findOne({ name });
        if (existing) {
            return res.status(400).json({ success: false, message: 'هذه الجامعة موجودة بالفعل' });
        }
        
        const university = new University({ 
            name, 
            icon: icon || 'fa-university', 
            count: count || 0 
        });
        await university.save();
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة الجامعة بنجاح',
            data: university
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة الجامعة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف جامعة
app.delete('/api/universities/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const university = await University.findById(req.params.id);
        if (!university) {
            return res.status(404).json({ success: false, message: 'الجامعة غير موجودة' });
        }
        
        // حذف جميع المواد المرتبطة بهذه الجامعة
        await ExplanationMaterial.deleteMany({ universityId: req.params.id });
        
        await university.deleteOne();
        
        res.status(200).json({
            success: true,
            message: 'تم حذف الجامعة والمواد المرتبطة بها بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الجامعة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 7. مسارات المواد التعليمية (EXPLANATIONS MATERIALS)
// ============================================================

// جلب جميع المواد
app.get('/api/explanations/materials', async (req, res) => {
    try {
        const materials = await ExplanationMaterial.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: materials
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المواد:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// إضافة مادة جديدة
app.post('/api/explanations/materials', protect, authorize('admin'), async (req, res) => {
    try {
        const { title, code, instructor, universityId, icon, videos, description, isFeatured } = req.body;
        
        if (!title || !code || !instructor || !universityId) {
            return res.status(400).json({ success: false, message: 'جميع الحقول المطلوبة غير مكتملة' });
        }
        
        // التحقق من وجود الجامعة
        const university = await University.findById(universityId);
        if (!university) {
            return res.status(404).json({ success: false, message: 'الجامعة غير موجودة' });
        }
        
        const material = new ExplanationMaterial({
            title,
            code,
            instructor,
            universityId,
            icon: icon || 'fa-book',
            videos: videos || 0,
            description: description || '',
            isFeatured: isFeatured || false
        });
        await material.save();

        // تحديث عدد المواد في الجامعة
        await University.findByIdAndUpdate(universityId, { $inc: { count: 1 } });

        res.status(201).json({
            success: true,
            message: 'تم إضافة المادة بنجاح',
            data: material
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة المادة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// حذف مادة
app.delete('/api/explanations/materials/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const material = await ExplanationMaterial.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, message: 'المادة غير موجودة' });
        }
        
        await material.deleteOne();
        
        // تحديث عدد المواد في الجامعة
        await University.findByIdAndUpdate(material.universityId, { $inc: { count: -1 } });
        
        res.status(200).json({
            success: true,
            message: 'تم حذف المادة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف المادة:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 8. مسارات الملخصات (SUMMARIES)
// ============================================================

// جلب جميع الملخصات
app.get('/api/summaries/all', async (req, res) => {
    try {
        const summaries = await Summary.find()
            .populate('uploader', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: summaries.length,
            data: summaries
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الملخصات:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// جلب ملخص محدد
app.get('/api/summaries/:id', async (req, res) => {
    try {
        const summary = await Summary.findById(req.params.id);
        if (!summary) {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }
        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الملخص:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// رفع ملخص جديد (للمدير فقط)
app.post('/api/summaries/upload', protect, authorize('admin'), async (req, res) => {
    try {
        const {
            title,
            subject,
            pages,
            size,
            fileName,
            fileSize,
            fileType,
            fileData,
            date
        } = req.body;

        // التحقق من الحقول المطلوبة
        if (!title || !subject || !pages || !size || !fileName || !fileData) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال جميع البيانات المطلوبة'
            });
        }

        // إنشاء ملخص جديد
        const summary = new Summary({
            title,
            subject,
            pages: parseInt(pages),
            size,
            fileName,
            fileSize: fileSize || (fileData.length / 1024).toFixed(2) + ' KB',
            fileType: fileType || 'application/pdf',
            fileData,
            date: date || new Date().toISOString().split('T')[0],
            downloads: 0,
            uploader: req.user.id
        });

        await summary.save();

        console.log('✅ تم رفع الملخص:', summary.title);

        res.status(201).json({
            success: true,
            message: 'تم رفع الملخص بنجاح',
            data: summary
        });
    } catch (error) {
        console.error('❌ خطأ في رفع الملخص:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// تحميل ملف الملخص
app.get('/api/summaries/download/:id', async (req, res) => {
    try {
        const summary = await Summary.findById(req.params.id);
        if (!summary) {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }

        if (!summary.fileData) {
            return res.status(404).json({
                success: false,
                message: 'الملف غير موجود'
            });
        }

        // تحديث عدد مرات التحميل
        summary.downloads = (summary.downloads || 0) + 1;
        await summary.save();

        res.status(200).json({
            success: true,
            message: 'تم تحميل الملف بنجاح',
            data: {
                fileData: summary.fileData,
                fileName: summary.fileName || 'ملخص.pdf'
            }
        });
    } catch (error) {
        console.error('❌ خطأ في تحميل الملخص:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// حذف ملخص (للمدير فقط)
app.delete('/api/summaries/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const summary = await Summary.findById(req.params.id);
        if (!summary) {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }

        await summary.deleteOne();
        console.log('🗑️ تم حذف الملخص:', summary.title);

        res.status(200).json({
            success: true,
            message: 'تم حذف الملخص بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الملخص:', error);
        if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                message: 'الملخص غير موجود'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});
// ============================================================
// 7. معالجة 404
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار المطلوب غير موجود',
        path: req.originalUrl
    });
});

// ============================================================
// 8. معالجة الأخطاء العامة
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ خطأ:', err.stack);
    res.status(500).json({
        success: false,
        message: err.message || 'حدث خطأ في الخادم'
    });
});

// ============================================================
// تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📁 مجلد الفيديوهات: ${videosDir}`);
    console.log(`📁 مجلد الطلبات: ${ordersDir}`);
    console.log(`📁 مجلد الملخصات: ${summariesDir}`);
    console.log(`🌐 بيئة التشغيل: ${process.env.NODE_ENV || 'development'}`);
});