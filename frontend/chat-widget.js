// ============================================================
// نظام الدردشة العائم - Chat Widget
// النسخة النهائية المتكاملة
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // التكوين الأساسي
    // ============================================================
    const CONFIG = {
        apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:5000/api' 
            : 'https://irteqa-eduhub.onrender.com/api',
        autoOpenDelay: 3000,
        notificationSound: true,
        maxFileSize: 20 * 1024 * 1024, // 20MB
        allowedFileTypes: [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/avi', 'video/mov', 'video/webm',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip', 'application/x-zip-compressed',
            'text/plain'
        ]
    };

    // ============================================================
    // بيانات المحادثة
    // ============================================================
    let state = {
        messages: [],
        unreadCount: 0,
        isOpen: false,
        isInitialized: false,
        currentChatId: null,
        pendingFile: null,
        isTyping: false,
        user: {
            id: null,
            name: 'زائر',
            role: 'client'
        },
        admin: {
            id: 'admin',
            name: 'الدعم الفني',
            avatar: 'ا',
            online: true
        }
    };

    // ============================================================
    // DOM Elements
    // ============================================================
    let elements = {};

    // ============================================================
    // تهيئة الدردشة
    // ============================================================
    function init() {
        if (state.isInitialized) return;
        
        // إنشاء عناصر الدردشة
        createWidgetElements();
        
        // تحميل الرسائل من localStorage
        loadMessages();
        
        // إضافة مستمعي الأحداث
        setupEventListeners();
        
        // تحديث عدد الإشعارات
        updateBadge();
        
        state.isInitialized = true;
        
        console.log('💬 نظام الدردشة العائم جاهز!');
        console.log('📋 عدد الرسائل:', state.messages.length);
        console.log('📋 عدد الإشعارات:', state.unreadCount);
        
        // فتح تلقائي للمستخدم الجديد
        if (state.messages.length === 0) {
            setTimeout(() => {
                if (!state.isOpen) {
                    toggleChat();
                }
            }, CONFIG.autoOpenDelay);
        }
    }

    // ============================================================
    // إنشاء عناصر الدردشة
    // ============================================================
    function createWidgetElements() {
        // ✅ زر الدردشة
        const btn = document.createElement('button');
        btn.className = 'chat-widget-btn';
        btn.id = 'chatWidgetBtn';
        btn.innerHTML = `
            <i class="fas fa-comment-dots"></i>
            <span class="chat-widget-badge" id="widgetBadge" style="display:none;">0</span>
            <span class="chat-widget-ripple"></span>
        `;
        document.body.appendChild(btn);
        elements.btn = btn;

        // ✅ نافذة الدردشة
        const popup = document.createElement('div');
        popup.className = 'chat-widget-popup';
        popup.id = 'chatWidgetPopup';
        popup.innerHTML = `
            <!-- رأس النافذة -->
            <div class="chat-widget-header">
                <div class="info">
                    <div class="avatar" id="widgetAvatar">ا</div>
                    <div class="details">
                        <div class="name" id="widgetName">الدعم الفني</div>
                        <div class="status" id="widgetStatus">
                            <span class="dot online"></span> متصل الآن
                        </div>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="minimize-btn" onclick="window.chatWidget.minimize()" title="تصغير">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="close-btn" onclick="window.chatWidget.close()" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- منطقة الرسائل -->
            <div class="chat-widget-messages" id="widgetMessages">
                <div class="widget-empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>مرحباً! كيف يمكنني مساعدتك؟</p>
                    <span>ابدأ المحادثة الآن</span>
                </div>
            </div>

            <!-- منطقة الإدخال -->
            <div class="chat-widget-input">
                <button class="attach-btn" onclick="window.chatWidget.attachFile()" title="إرفاق ملف">
                    <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="widgetInput" placeholder="اكتب رسالتك..." 
                       autocomplete="off" />
                <button class="send-btn" id="widgetSendBtn" disabled onclick="window.chatWidget.sendMessage()">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>

            <!-- إدخال الملفات المخفي -->
            <input type="file" id="widgetFileInput" style="display:none" 
                   accept=".jpg,.jpeg,.png,.gif,.mp4,.avi,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" 
                   multiple />
        `;
        document.body.appendChild(popup);
        elements.popup = popup;

        // تخزين المراجع
        elements.messages = document.getElementById('widgetMessages');
        elements.input = document.getElementById('widgetInput');
        elements.sendBtn = document.getElementById('widgetSendBtn');
        elements.badge = document.getElementById('widgetBadge');
        elements.fileInput = document.getElementById('widgetFileInput');
        elements.avatar = document.getElementById('widgetAvatar');
        elements.name = document.getElementById('widgetName');
        elements.status = document.getElementById('widgetStatus');

        // ✅ إضافة الأنماط
        addWidgetStyles();

        // ✅ ربط الدوال بـ window
        window.chatWidget = {
            toggle: toggleChat,
            open: openChat,
            close: closeChat,
            minimize: minimizeChat,
            sendMessage: sendMessage,
            attachFile: triggerFileUpload,
            markAsRead: markAsRead,
            getUnreadCount: getUnreadCount,
            setUser: setUser
        };
    }

    // ============================================================
    // أنماط الدردشة
    // ============================================================
    function addWidgetStyles() {
        const style = document.createElement('style');
        style.id = 'chat-widget-styles';
        style.textContent = `
            /* ============================================================
               زر الدردشة العائم
               ============================================================ */
            .chat-widget-btn {
                position: fixed;
                bottom: 160px;
                left: 30px;
                z-index: 9998;
                width: 62px;
                height: 62px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7C3AED, #EC4899);
                color: #fff;
                border: none;
                box-shadow: 0 8px 30px rgba(124, 58, 237, 0.4);
                cursor: pointer;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
                animation: widgetPulse 2s ease-in-out infinite;
            }

            .chat-widget-btn:hover {
                transform: scale(1.1) rotate(-10deg);
                box-shadow: 0 12px 40px rgba(124, 58, 237, 0.5);
            }

            .chat-widget-btn .chat-widget-ripple {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 2px solid rgba(255, 255, 255, 0.3);
                animation: rippleEffect 2s ease-out infinite;
            }

            @keyframes rippleEffect {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(1.8); opacity: 0; }
            }

            @keyframes widgetPulse {
                0%, 100% { box-shadow: 0 8px 30px rgba(124, 58, 237, 0.4); }
                50% { box-shadow: 0 8px 50px rgba(124, 58, 237, 0.7), 0 0 80px rgba(124, 58, 237, 0.2); }
            }

            /* ============================================================
               شارة الإشعارات
               ============================================================ */
            .chat-widget-badge {
                position: absolute;
                top: -6px;
                right: -6px;
                background: #EF4444;
                color: #fff;
                min-width: 24px;
                height: 24px;
                border-radius: 50%;
                font-size: 0.65rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
                border: 2px solid #fff;
                animation: badgePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            @keyframes badgePop {
                0% { transform: scale(0); }
                70% { transform: scale(1.3); }
                100% { transform: scale(1); }
            }

            /* ============================================================
               نافذة الدردشة
               ============================================================ */
            .chat-widget-popup {
                position: fixed;
                bottom: 235px;
                left: 30px;
                width: 390px;
                height: 540px;
                background: var(--bg-card, #FFFFFF);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
                z-index: 9999;
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--border-color, #E2E8F0);
                animation: popupSlide 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                direction: rtl;
            }

            .chat-widget-popup.open {
                display: flex;
            }

            .chat-widget-popup.minimized {
                height: 60px;
            }

            .chat-widget-popup.minimized .chat-widget-messages,
            .chat-widget-popup.minimized .chat-widget-input {
                display: none;
            }

            @keyframes popupSlide {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            /* ============================================================
               رأس النافذة
               ============================================================ */
            .chat-widget-header {
                padding: 14px 18px;
                background: linear-gradient(135deg, #7C3AED, #EC4899);
                color: #fff;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
                min-height: 60px;
            }

            .chat-widget-header .info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .chat-widget-header .info .avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 1.1rem;
                flex-shrink: 0;
            }

            .chat-widget-header .info .details .name {
                font-weight: 700;
                font-size: 0.95rem;
            }

            .chat-widget-header .info .details .status {
                font-size: 0.65rem;
                opacity: 0.85;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .chat-widget-header .info .details .status .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }

            .chat-widget-header .info .details .status .dot.online {
                background: #10B981;
            }

            .chat-widget-header .info .details .status .dot.offline {
                background: #94A3B8;
            }

            .chat-widget-header .header-actions {
                display: flex;
                gap: 6px;
            }

            .chat-widget-header .header-actions button {
                background: rgba(255, 255, 255, 0.15);
                border: none;
                color: #fff;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .chat-widget-header .header-actions button:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: scale(1.05);
            }

            /* ============================================================
               منطقة الرسائل
               ============================================================ */
            .chat-widget-messages {
                flex: 1;
                overflow-y: auto;
                padding: 15px 18px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                background: var(--bg-body, #F1F5F9);
            }

            .chat-widget-messages::-webkit-scrollbar {
                width: 4px;
            }

            .chat-widget-messages::-webkit-scrollbar-thumb {
                background: var(--primary, #7C3AED);
                border-radius: 10px;
            }

            /* ============================================================
               حالة عدم وجود رسائل
               ============================================================ */
            .widget-empty-state {
                text-align: center;
                padding: 40px 20px;
                color: var(--text-muted, #94A3B8);
            }

            .widget-empty-state i {
                font-size: 3rem;
                color: var(--border-color, #E2E8F0);
                display: block;
                margin-bottom: 12px;
            }

            .widget-empty-state p {
                font-size: 0.95rem;
                font-weight: 600;
                color: var(--text-color, #0F172A);
                margin-bottom: 4px;
            }

            .widget-empty-state span {
                font-size: 0.8rem;
            }

            /* ============================================================
               الرسائل
               ============================================================ */
            .chat-widget-messages .msg {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 14px;
                font-size: 0.85rem;
                line-height: 1.6;
                animation: messageIn 0.3s ease;
                word-wrap: break-word;
            }

            @keyframes messageIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .chat-widget-messages .msg.sent {
                align-self: flex-end;
                background: linear-gradient(135deg, #7C3AED, #EC4899);
                color: #fff;
                border-bottom-left-radius: 4px;
            }

            .chat-widget-messages .msg.received {
                align-self: flex-start;
                background: var(--bg-card, #FFFFFF);
                color: var(--text-color, #0F172A);
                border-bottom-right-radius: 4px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            }

            .chat-widget-messages .msg .time {
                font-size: 0.5rem;
                opacity: 0.6;
                display: block;
                margin-top: 4px;
                direction: ltr;
            }

            .chat-widget-messages .msg .file-attachment {
                margin-top: 8px;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.8rem;
            }

            .chat-widget-messages .msg .file-attachment:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .chat-widget-messages .msg .file-attachment i {
                font-size: 1.2rem;
            }

            .chat-widget-messages .msg .file-attachment .file-name {
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .chat-widget-messages .msg .msg-image {
                max-width: 180px;
                border-radius: 10px;
                margin-top: 8px;
                cursor: pointer;
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: all 0.3s ease;
            }

            .chat-widget-messages .msg .msg-image:hover {
                transform: scale(1.02);
            }

            .chat-widget-messages .msg .msg-video {
                max-width: 200px;
                border-radius: 10px;
                margin-top: 8px;
                background: #000;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            /* ============================================================
               مؤشر الكتابة
               ============================================================ */
            .widget-typing {
                align-self: flex-start;
                padding: 8px 14px;
                background: var(--bg-card, #FFFFFF);
                border-radius: 14px;
                border-bottom-right-radius: 4px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .widget-typing span {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: var(--text-muted, #94A3B8);
                display: inline-block;
                animation: typingBounce 1.4s ease-in-out infinite;
            }

            .widget-typing span:nth-child(2) { animation-delay: 0.2s; }
            .widget-typing span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes typingBounce {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                30% { transform: translateY(-6px); opacity: 1; }
            }

            /* ============================================================
               منطقة الإدخال
               ============================================================ */
            .chat-widget-input {
                padding: 10px 14px;
                border-top: 1px solid var(--border-color, #E2E8F0);
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--bg-card, #FFFFFF);
                flex-shrink: 0;
            }

            .chat-widget-input input {
                flex: 1;
                border: none;
                background: var(--bg-body, #F1F5F9);
                padding: 10px 14px;
                border-radius: 50px;
                font-family: 'Cairo', sans-serif;
                font-size: 0.85rem;
                color: var(--text-color, #0F172A);
                outline: none;
                min-width: 50px;
            }

            .chat-widget-input input::placeholder {
                color: var(--text-muted, #94A3B8);
            }

            .chat-widget-input .attach-btn,
            .chat-widget-input .send-btn {
                background: none;
                border: none;
                color: var(--text-muted, #64748B);
                font-size: 1.1rem;
                cursor: pointer;
                transition: all 0.3s ease;
                padding: 8px;
                border-radius: 50%;
                width: 38px;
                height: 38px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .chat-widget-input .attach-btn:hover {
                background: rgba(124, 58, 237, 0.08);
                color: var(--primary, #7C3AED);
            }

            .chat-widget-input .send-btn {
                background: linear-gradient(135deg, #7C3AED, #EC4899);
                color: #fff;
            }

            .chat-widget-input .send-btn:hover:not(:disabled) {
                transform: scale(1.05);
                box-shadow: 0 5px 20px rgba(124, 58, 237, 0.3);
            }

            .chat-widget-input .send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none !important;
            }

            /* ============================================================
               إشعارات منبثقة
               ============================================================ */
            .widget-notification {
                position: fixed;
                bottom: 235px;
                left: 100px;
                background: var(--bg-card, #FFFFFF);
                padding: 12px 18px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                border: 1px solid var(--border-color, #E2E8F0);
                z-index: 9998;
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: 'Cairo', sans-serif;
                font-size: 0.85rem;
                color: var(--text-color, #0F172A);
                animation: popupSlide 0.4s ease;
                max-width: 320px;
                direction: rtl;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .widget-notification:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 50px rgba(0, 0, 0, 0.2);
            }

            .widget-notification .notif-icon {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7C3AED, #EC4899);
                color: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.9rem;
                flex-shrink: 0;
            }

            .widget-notification .notif-content {
                flex: 1;
                min-width: 0;
            }

            .widget-notification .notif-content .notif-title {
                font-weight: 700;
                font-size: 0.8rem;
            }

            .widget-notification .notif-content .notif-text {
                font-size: 0.75rem;
                color: var(--text-muted, #94A3B8);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .widget-notification .notif-close {
                background: none;
                border: none;
                color: var(--text-muted, #94A3B8);
                cursor: pointer;
                font-size: 0.8rem;
                padding: 4px;
                transition: all 0.3s ease;
            }

            .widget-notification .notif-close:hover {
                color: var(--text-color, #0F172A);
            }

            /* ============================================================
               وضع الظلام
               ============================================================ */
            [data-theme="dark"] .chat-widget-popup {
                background: #1E293B;
            }

            [data-theme="dark"] .chat-widget-messages {
                background: #0F172A;
            }

            [data-theme="dark"] .chat-widget-messages .msg.received {
                background: #1E293B;
                color: #F1F5F9;
            }

            [data-theme="dark"] .chat-widget-input {
                background: #1E293B;
                border-color: #334155;
            }

            [data-theme="dark"] .chat-widget-input input {
                background: #0F172A;
                color: #F1F5F9;
            }

            [data-theme="dark"] .widget-empty-state p {
                color: #F1F5F9;
            }

            [data-theme="dark"] .widget-notification {
                background: #1E293B;
                border-color: #334155;
                color: #F1F5F9;
            }

            [data-theme="dark"] .widget-notification .notif-text {
                color: #94A3B8;
            }

            /* ============================================================
               التجاوب
               ============================================================ */
            @media (max-width: 768px) {
                .chat-widget-popup {
                    width: calc(100% - 40px);
                    height: 460px;
                    bottom: 200px;
                    left: 20px;
                }

                .chat-widget-btn {
                    width: 52px;
                    height: 52px;
                    font-size: 1.4rem;
                    bottom: 140px;
                    left: 20px;
                }

                .chat-widget-badge {
                    min-width: 20px;
                    height: 20px;
                    font-size: 0.55rem;
                    top: -4px;
                    right: -4px;
                }

                .widget-notification {
                    bottom: 200px;
                    left: 80px;
                    max-width: 260px;
                    padding: 10px 14px;
                    font-size: 0.8rem;
                }
            }

            @media (max-width: 480px) {
                .chat-widget-popup {
                    width: calc(100% - 16px);
                    height: 420px;
                    bottom: 175px;
                    left: 8px;
                    border-radius: 16px;
                }

                .chat-widget-btn {
                    width: 46px;
                    height: 46px;
                    font-size: 1.2rem;
                    bottom: 130px;
                    left: 12px;
                }

                .chat-widget-messages {
                    padding: 12px 14px;
                }

                .chat-widget-messages .msg {
                    max-width: 90%;
                    padding: 8px 12px;
                    font-size: 0.8rem;
                }

                .chat-widget-input {
                    padding: 8px 10px;
                }

                .chat-widget-input input {
                    font-size: 0.8rem;
                    padding: 8px 12px;
                }

                .chat-widget-input .attach-btn,
                .chat-widget-input .send-btn {
                    width: 34px;
                    height: 34px;
                    font-size: 0.95rem;
                }

                .chat-widget-header {
                    padding: 10px 14px;
                    min-height: 50px;
                }

                .chat-widget-header .info .avatar {
                    width: 34px;
                    height: 34px;
                    font-size: 0.9rem;
                }

                .chat-widget-header .info .details .name {
                    font-size: 0.85rem;
                }

                .chat-widget-header .header-actions button {
                    width: 28px;
                    height: 28px;
                    font-size: 0.75rem;
                }

                .widget-notification {
                    bottom: 175px;
                    left: 60px;
                    max-width: 200px;
                    padding: 8px 12px;
                    font-size: 0.7rem;
                }

                .widget-notification .notif-icon {
                    width: 28px;
                    height: 28px;
                    font-size: 0.7rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // إدارة الحالة
    // ============================================================
    function loadMessages() {
        try {
            const saved = localStorage.getItem('chat_widget_messages');
            if (saved) {
                state.messages = JSON.parse(saved);
            }
            const unread = localStorage.getItem('chat_widget_unread');
            if (unread) {
                state.unreadCount = parseInt(unread) || 0;
            }
        } catch (e) {
            console.warn('⚠️ فشل تحميل الرسائل:', e);
        }
    }

    function saveMessages() {
        try {
            localStorage.setItem('chat_widget_messages', JSON.stringify(state.messages));
            localStorage.setItem('chat_widget_unread', String(state.unreadCount));
        } catch (e) {
            console.warn('⚠️ فشل حفظ الرسائل:', e);
        }
    }

    // ============================================================
    // فتح/إغلاق الدردشة
    // ============================================================
    function toggleChat() {
        state.isOpen ? closeChat() : openChat();
    }

    function openChat() {
        state.isOpen = true;
        elements.popup.classList.add('open');
        elements.popup.classList.remove('minimized');
        
        // تصفير الإشعارات عند الفتح
        state.unreadCount = 0;
        updateBadge();
        saveMessages();
        
        renderMessages();
        scrollToBottom();
        
        setTimeout(() => {
            elements.input.focus();
        }, 300);
    }

    function closeChat() {
        state.isOpen = false;
        elements.popup.classList.remove('open');
        elements.popup.classList.remove('minimized');
    }

    function minimizeChat() {
        elements.popup.classList.toggle('minimized');
    }

    // ============================================================
    // عرض الرسائل
    // ============================================================
    function renderMessages() {
        const container = elements.messages;
        container.innerHTML = '';

        if (state.messages.length === 0) {
            container.innerHTML = `
                <div class="widget-empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>مرحباً! كيف يمكنني مساعدتك؟</p>
                    <span>ابدأ المحادثة الآن</span>
                </div>
            `;
            return;
        }

        state.messages.forEach((msg, index) => {
            const div = document.createElement('div');
            div.className = `msg ${msg.sender === 'admin' ? 'sent' : 'received'}`;

            let content = msg.text || '';

            // عرض الملفات
            if (msg.file) {
                const isImage = msg.file.type && msg.file.type.startsWith('image/');
                const isVideo = msg.file.type && msg.file.type.startsWith('video/');

                if (isImage) {
                    content += `<img src="${msg.file.data}" class="msg-image" 
                               onclick="window.open('${msg.file.data}', '_blank')" />`;
                } else if (isVideo) {
                    content += `
                        <video controls class="msg-video" onclick="this.paused ? this.play() : this.pause()">
                            <source src="${msg.file.data}" type="${msg.file.type}" />
                        </video>
                    `;
                } else {
                    const iconMap = {
                        'pdf': 'fa-file-pdf',
                        'doc': 'fa-file-word',
                        'docx': 'fa-file-word',
                        'xls': 'fa-file-excel',
                        'xlsx': 'fa-file-excel',
                        'ppt': 'fa-file-powerpoint',
                        'pptx': 'fa-file-powerpoint',
                        'zip': 'fa-file-archive',
                        'rar': 'fa-file-archive',
                        'mp4': 'fa-file-video',
                        'avi': 'fa-file-video',
                        'mov': 'fa-file-video',
                        'txt': 'fa-file-alt'
                    };
                    const ext = msg.file.name.split('.').pop().toLowerCase();
                    const icon = iconMap[ext] || 'fa-file';
                    const fileSize = msg.file.size ? (msg.file.size / 1024).toFixed(1) : '0';

                    content += `
                        <div class="file-attachment" onclick="window.chatWidget.downloadFile('${msg.file.name}', '${msg.file.data}')">
                            <i class="fas ${icon}"></i>
                            <span class="file-name">${msg.file.name}</span>
                            <span style="font-size:0.65rem;opacity:0.7;">${fileSize} KB</span>
                            <i class="fas fa-download"></i>
                        </div>
                    `;
                }
            }

            content += `<span class="time">${msg.time || 'الآن'}</span>`;
            div.innerHTML = content;
            container.appendChild(div);
        });

        scrollToBottom();
    }

    // ============================================================
    // إرسال رسالة
    // ============================================================
    function sendMessage() {
        const text = elements.input.value.trim();
        if (!text && !state.pendingFile) return;

        const now = new Date();
        const time = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        const newMsg = {
            id: Date.now(),
            sender: 'admin',
            text: text || '📎 ملف مرفق',
            time: time,
            file: state.pendingFile || null,
            timestamp: now.toISOString()
        };

        state.messages.push(newMsg);
        state.pendingFile = null;
        
        renderMessages();
        saveMessages();
        
        elements.input.value = '';
        elements.sendBtn.disabled = true;

        // إظهار مؤشر الكتابة
        showTyping();

        // محاكاة رد من العميل
        setTimeout(() => {
            hideTyping();
            
            const replies = [
                'شكراً لتواصلك معنا، سأقوم بمساعدتك فوراً 🙏',
                'تم استلام رسالتك، سأرد عليك خلال دقائق ⏳',
                'أهلاً بك! كيف يمكنني خدمتك اليوم؟ 😊',
                'نحن هنا لمساعدتك، أخبرني بمزيد من التفاصيل 📝',
                'شكراً على سؤالك، سأبحث عن الإجابة المناسبة 🔍',
                'تم استلام طلبك، سأقوم بمعالجته بأسرع وقت 💪',
                'مرحباً! يسعدني مساعدتك، أخبرني ما تحتاجه 🌟'
            ];

            const reply = {
                id: Date.now() + 1,
                sender: 'client',
                text: replies[Math.floor(Math.random() * replies.length)],
                time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                timestamp: new Date().toISOString()
            };

            state.messages.push(reply);
            
            // زيادة الإشعارات إذا كانت النافذة مغلقة
            if (!state.isOpen) {
                state.unreadCount++;
                showNotification('📩 رسالة جديدة', reply.text);
                playNotificationSound();
            }
            
            renderMessages();
            saveMessages();
            updateBadge();
            
        }, 1500 + Math.random() * 1500);
    }

    // ============================================================
    // مؤشر الكتابة
    // ============================================================
    let typingElement = null;

    function showTyping() {
        hideTyping();
        typingElement = document.createElement('div');
        typingElement.className = 'widget-typing';
        typingElement.innerHTML = `<span></span><span></span><span></span>`;
        elements.messages.appendChild(typingElement);
        scrollToBottom();
    }

    function hideTyping() {
        if (typingElement) {
            typingElement.remove();
            typingElement = null;
        }
    }

    // ============================================================
    // إرفاق ملف
    // ============================================================
    function triggerFileUpload() {
        elements.fileInput.click();
    }

    function handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // التحقق من الحجم
        if (file.size > CONFIG.maxFileSize) {
            showToast(`❌ حجم الملف كبير جداً. الحد الأقصى ${CONFIG.maxFileSize / 1024 / 1024}MB`, 'error');
            event.target.value = '';
            return;
        }

        // التحقق من نوع الملف
        if (!CONFIG.allowedFileTypes.includes(file.type)) {
            showToast('❌ نوع الملف غير مدعوم', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');

            state.pendingFile = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                isImage: isImage,
                isVideo: isVideo
            };

            elements.input.value = `📎 ${file.name}`;
            elements.input.focus();
            elements.sendBtn.disabled = false;

            showToast(`✅ تم رفع الملف: ${file.name}`, 'success');
        };

        reader.readAsDataURL(file);
        event.target.value = '';
    }

    // ============================================================
    // تنزيل ملف
    // ============================================================
    function downloadFile(name, data) {
        const link = document.createElement('a');
        link.href = data;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`✅ تم تنزيل الملف: ${name}`, 'success');
    }

    // ============================================================
    // تحديث شارة الإشعارات
    // ============================================================
    function updateBadge() {
        const badge = elements.badge;
        if (!badge) return;

        if (state.unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount;
            // إضافة تأثير نبض
            badge.style.animation = 'badgePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        } else {
            badge.style.display = 'none';
        }
    }

    // ============================================================
    // عدد الإشعارات
    // ============================================================
    function getUnreadCount() {
        return state.unreadCount;
    }

    function markAsRead() {
        state.unreadCount = 0;
        updateBadge();
        saveMessages();
    }

    // ============================================================
    // إشعار منبثق
    // ============================================================
    function showNotification(title, message) {
        // ✅ إشعار المتصفح
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📩 منصة ارتقاء', {
                body: message || 'لديك رسالة جديدة',
                icon: 'https://irteqa-eduhub.onrender.com/favicon.ico'
            });
        }

        // ✅ إشعار داخل الصفحة
        const existing = document.querySelector('.widget-notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.className = 'widget-notification';
        notif.onclick = function() {
            this.remove();
            openChat();
        };
        notif.innerHTML = `
            <div class="notif-icon">
                <i class="fas fa-comment-dots"></i>
            </div>
            <div class="notif-content">
                <div class="notif-title">${title || '📩 رسالة جديدة'}</div>
                <div class="notif-text">${message || 'لديك رسالة جديدة من الدعم الفني'}</div>
            </div>
            <button class="notif-close" onclick="event.stopPropagation(); this.closest('.widget-notification').remove();">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(notif);

        // إزالة الإشعار تلقائياً بعد 6 ثوانٍ
        setTimeout(() => {
            if (notif.parentNode) {
                notif.style.opacity = '0';
                notif.style.transform = 'translateY(-10px)';
                notif.style.transition = 'all 0.5s ease';
                setTimeout(() => notif.remove(), 500);
            }
        }, 6000);
    }

    // ============================================================
    // Toast صغير
    // ============================================================
    function showToast(message, type = 'success') {
        const existing = document.querySelector('.widget-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'widget-toast';
        toast.textContent = message;
        
        const colors = {
            success: 'linear-gradient(135deg, #10B981, #059669)',
            error: 'linear-gradient(135deg, #EF4444, #DC2626)',
            warning: 'linear-gradient(135deg, #F59E0B, #D97706)',
            info: 'linear-gradient(135deg, #3B82F6, #2563EB)'
        };

        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '310px',
            left: '100px',
            padding: '10px 20px',
            borderRadius: '12px',
            color: '#fff',
            fontWeight: '600',
            zIndex: '9999',
            fontFamily: "'Cairo', sans-serif",
            fontSize: '0.85rem',
            background: colors[type] || colors.info,
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            animation: 'popupSlide 0.4s ease',
            maxWidth: '300px',
            direction: 'rtl'
        });

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // ============================================================
    // صوت الإشعار
    // ============================================================
    function playNotificationSound() {
        if (!CONFIG.notificationSound) return;
        try {
            const audioCtx = new(window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.12;

            oscillator.start();
            setTimeout(() => oscillator.stop(), 150);
        } catch (e) {
            // تجاهل الأخطاء
        }
    }

    // ============================================================
    // التمرير للأسفل
    // ============================================================
    function scrollToBottom() {
        setTimeout(() => {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }, 50);
    }

    // ============================================================
    // تعيين المستخدم
    // ============================================================
    function setUser(user) {
        if (user) {
            state.user = { ...state.user, ...user };
        }
    }

    // ============================================================
    // مستمعي الأحداث
    // ============================================================
    function setupEventListeners() {
        // ✅ زر الدردشة
        elements.btn.addEventListener('click', toggleChat);

        // ✅ إدخال الرسالة
        elements.input.addEventListener('input', function() {
            const btn = elements.sendBtn;
            btn.disabled = !this.value.trim() && !state.pendingFile;
        });

        // ✅ إرسال بالـ Enter
        elements.input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // ✅ رفع الملفات
        elements.fileInput.addEventListener('change', handleFileUpload);

        // ✅ إغلاق عند الضغط خارج النافذة
        document.addEventListener('click', function(e) {
            const popup = elements.popup;
            const btn = elements.btn;
            if (state.isOpen && 
                !popup.contains(e.target) && 
                !btn.contains(e.target)) {
                // لا نغلق تلقائياً، نترك المستخدم يقرر
            }
        });

        // ✅ طلب إذن الإشعارات
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 5000);
        }
    }

    // ============================================================
    // التهيئة عند تحميل الصفحة
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // تصدير الدوال للاستخدام الخارجي
    // ============================================================
    window.ChatWidget = {
        init: init,
        open: openChat,
        close: closeChat,
        toggle: toggleChat,
        minimize: minimizeChat,
        sendMessage: sendMessage,
        attachFile: triggerFileUpload,
        downloadFile: downloadFile,
        getUnreadCount: getUnreadCount,
        markAsRead: markAsRead,
        setUser: setUser,
        showNotification: showNotification,
        showToast: showToast,
        state: state
    };

    console.log('💬 Chat Widget initialized successfully!');
    console.log('📖 Use window.ChatWidget to control the widget');

})();