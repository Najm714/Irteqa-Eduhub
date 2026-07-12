// ============================================================
// نظام الدردشة العائم - Chat Widget
// النسخة النهائية مع WebSocket
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // التكوين الأساسي
    // ============================================================
    const CONFIG = {
        apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:5000' 
            : 'https://irteqa-eduhub.onrender.com',
        wsUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'ws://localhost:5000'
            : 'wss://irteqa-eduhub.onrender.com',
        autoOpenDelay: 3000,
        notificationSound: true,
        maxFileSize: 20 * 1024 * 1024,
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
        ],
        reconnectAttempts: 5,
        reconnectDelay: 3000,
        heartbeatInterval: 30000
    };

    // ============================================================
    // الحالة العامة
    // ============================================================
    let state = {
        messages: [],
        unreadCount: 0,
        isOpen: false,
        isInitialized: false,
        pendingFile: null,
        isTyping: false,
        isConnected: false,
        ws: null,
        reconnectCount: 0,
        heartbeatTimer: null,
        user: {
            id: null,
            name: 'زائر',
            role: 'client', // 'admin' or 'client'
            avatar: 'ز'
        },
        admin: {
            id: 'admin',
            name: 'الدعم الفني',
            avatar: 'ا',
            online: true
        },
        currentClientId: null, // للمدير - معرف العميل الحالي
        clients: [] // قائمة العملاء المتصلين
    };

    // ============================================================
    // DOM Elements
    // ============================================================
    let elements = {};

    // ============================================================
    // WebSocket Manager
    // ============================================================
    const WSManager = {
        // ✅ الاتصال بالخادم
        connect: function() {
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                console.log('⚠️ WebSocket متصل بالفعل');
                return;
            }

            const wsUrl = `${CONFIG.wsUrl}?userId=${state.user.id || 'guest'}&role=${state.user.role}`;
            console.log('🔌 محاولة الاتصال بـ WebSocket:', wsUrl);

            try {
                state.ws = new WebSocket(wsUrl);

                state.ws.onopen = function() {
                    console.log('✅ تم الاتصال بـ WebSocket');
                    state.isConnected = true;
                    state.reconnectCount = 0;
                    
                    // بدء نبضات القلب
                    startHeartbeat();
                    
                    // إرسال رسالة ترحيب
                    sendWSMessage({
                        type: 'system',
                        action: 'connect',
                        userId: state.user.id,
                        role: state.user.role,
                        name: state.user.name
                    });
                    
                    // تحديث واجهة المستخدم
                    updateConnectionStatus(true);
                    showToast('🟢 تم الاتصال بالخادم', 'success');
                };

                state.ws.onmessage = function(event) {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('📩 رسالة من الخادم:', data);
                        handleWSMessage(data);
                    } catch (error) {
                        console.error('❌ خطأ في معالجة الرسالة:', error);
                    }
                };

                state.ws.onclose = function() {
                    console.log('❌ تم قطع الاتصال بـ WebSocket');
                    state.isConnected = false;
                    stopHeartbeat();
                    updateConnectionStatus(false);
                    
                    // محاولة إعادة الاتصال
                    reconnectWS();
                };

                state.ws.onerror = function(error) {
                    console.error('❌ خطأ في WebSocket:', error);
                };

            } catch (error) {
                console.error('❌ فشل الاتصال بـ WebSocket:', error);
                reconnectWS();
            }
        },

        // ✅ قطع الاتصال
        disconnect: function() {
            if (state.ws) {
                stopHeartbeat();
                state.ws.close();
                state.ws = null;
                state.isConnected = false;
                console.log('🔌 تم قطع الاتصال بـ WebSocket');
            }
        },

        // ✅ إرسال رسالة
        send: function(data) {
            if (state.isConnected && state.ws && state.ws.readyState === WebSocket.OPEN) {
                sendWSMessage(data);
                return true;
            } else {
                console.warn('⚠️ غير متصل بالخادم، محاولة إعادة الاتصال...');
                WSManager.connect();
                // محاولة الإرسال بعد 1 ثانية
                setTimeout(() => {
                    if (state.isConnected) {
                        sendWSMessage(data);
                    }
                }, 1000);
                return false;
            }
        },

        // ✅ الحالة
        isConnected: function() {
            return state.isConnected && state.ws && state.ws.readyState === WebSocket.OPEN;
        }
    };

    // ============================================================
    // دوال مساعدة لـ WebSocket
    // ============================================================
    function sendWSMessage(data) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify(data));
        } else {
            console.warn('⚠️ WebSocket غير جاهز للإرسال');
        }
    }

    function reconnectWS() {
        if (state.reconnectCount >= CONFIG.reconnectAttempts) {
            console.log('❌ فشل إعادة الاتصال بعد عدة محاولات');
            showToast('⚠️ لا يمكن الاتصال بالخادم، حاول تحديث الصفحة', 'error');
            return;
        }

        state.reconnectCount++;
        const delay = CONFIG.reconnectDelay * state.reconnectCount;
        console.log(`🔄 محاولة إعادة الاتصال ${state.reconnectCount}/${CONFIG.reconnectAttempts} بعد ${delay/1000} ثانية`);
        
        setTimeout(() => {
            WSManager.connect();
        }, delay);
    }

    function startHeartbeat() {
        stopHeartbeat();
        state.heartbeatTimer = setInterval(() => {
            if (state.isConnected) {
                sendWSMessage({
                    type: 'system',
                    action: 'heartbeat',
                    timestamp: new Date().toISOString()
                });
            }
        }, CONFIG.heartbeatInterval);
    }

    function stopHeartbeat() {
        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }
    }

    function updateConnectionStatus(connected) {
        const statusEl = elements.status;
        if (statusEl) {
            if (connected) {
                statusEl.innerHTML = '<span class="dot online"></span> متصل الآن';
            } else {
                statusEl.innerHTML = '<span class="dot offline"></span> غير متصل';
            }
        }
    }

    // ============================================================
    // معالجة الرسائل الواردة من WebSocket
    // ============================================================
    function handleWSMessage(data) {
        switch(data.type) {
            case 'notification':
                // ✅ إشعار من عميل
                if (state.user.role === 'admin') {
                    handleAdminNotification(data);
                }
                break;

            case 'reply':
                // ✅ رد من مدير
                if (state.user.role === 'client') {
                    handleClientReply(data);
                }
                break;

            case 'message':
                // ✅ رسالة دردشة
                if (data.sender === 'client' && state.user.role === 'admin') {
                    handleAdminNotification(data);
                } else if (data.sender === 'admin' && state.user.role === 'client') {
                    handleClientReply(data);
                }
                break;

            case 'typing':
                // ✅ مؤشر الكتابة
                if (state.user.role === 'admin') {
                    showTypingIndicator(data.userId);
                }
                break;

            case 'clients':
                // ✅ تحديث قائمة العملاء (للمدير)
                if (state.user.role === 'admin') {
                    state.clients = data.clients || [];
                    updateClientsList();
                }
                break;

            case 'system':
                // ✅ رسائل النظام
                if (data.action === 'welcome') {
                    console.log('👋 مرحباً بك في نظام الدردشة');
                }
                if (data.action === 'user_connected') {
                    showToast(`🟢 ${data.userName || 'مستخدم'} متصل الآن`, 'info');
                    if (state.user.role === 'admin') {
                        playNotificationSound();
                    }
                }
                if (data.action === 'user_disconnected') {
                    showToast(`🔴 ${data.userName || 'مستخدم'} غير متصل`, 'info');
                }
                break;

            default:
                console.log('📩 رسالة غير معروفة:', data);
        }
    }

    // ============================================================
    // معالجة إشعارات المدير
    // ============================================================
    function handleAdminNotification(data) {
        // ✅ إشعار صوتي
        playNotificationSound();
        
        // ✅ إشعار منبثق
        const senderName = data.userName || data.sender || 'عميل';
        const messageText = data.message || data.text || 'رسالة جديدة';
        
        showNotification(
            `📩 رسالة من ${senderName}`,
            messageText
        );
        
        // ✅ إضافة الإشعار إلى قائمة الإشعارات
        state.unreadCount++;
        updateBadge();
        
        // ✅ إذا كانت الدردشة مفتوحة، عرض الرسالة فوراً
        if (state.isOpen) {
            const newMsg = {
                id: Date.now(),
                sender: 'client',
                userName: senderName,
                text: messageText,
                file: data.file || null,
                time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            };
            state.messages.push(newMsg);
            renderMessages();
            saveMessages();
        }
        
        // ✅ تحديث قائمة العملاء للمدير
        if (data.userId && !state.clients.find(c => c.id === data.userId)) {
            state.clients.push({
                id: data.userId,
                name: senderName,
                online: true
            });
            updateClientsList();
        }
    }

    // ============================================================
    // معالجة ردود المدير للعميل
    // ============================================================
    function handleClientReply(data) {
        // ✅ إضافة الرد إلى الدردشة
        const newMsg = {
            id: Date.now(),
            sender: 'admin',
            text: data.message || data.text || 'رد من الدعم الفني',
            file: data.file || null,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        };
        
        state.messages.push(newMsg);
        saveMessages();
        renderMessages();
        
        // ✅ إشعار للعميل
        if (!state.isOpen) {
            state.unreadCount++;
            updateBadge();
            showNotification('📩 رد من الدعم الفني', newMsg.text);
            playNotificationSound();
        }
        
        // ✅ التمرير للأسفل
        scrollToBottom();
    }

    // ============================================================
    // مؤشر الكتابة
    // ============================================================
    let typingTimeout = null;

    function showTypingIndicator(userId) {
        // إخفاء المؤشر بعد 3 ثوانٍ
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            hideTypingIndicator();
        }, 3000);
        
        // عرض المؤشر في الدردشة
        const container = elements.messages;
        let typingEl = container.querySelector('.widget-typing');
        if (!typingEl) {
            typingEl = document.createElement('div');
            typingEl.className = 'widget-typing';
            typingEl.innerHTML = `
                <span></span><span></span><span></span>
                <span style="font-size:0.7rem;margin-right:6px;color:var(--text-muted);">
                    ${userId ? `العميل يكتب...` : 'جاري الكتابة...'}
                </span>
            `;
            container.appendChild(typingEl);
            scrollToBottom();
        }
    }

    function hideTypingIndicator() {
        const typingEl = elements.messages.querySelector('.widget-typing');
        if (typingEl) {
            typingEl.remove();
        }
    }

    // ============================================================
    // تحديث قائمة العملاء (للمدير)
    // ============================================================
    function updateClientsList() {
        // يمكن إضافة قائمة منسدلة للعملاء في واجهة المدير
        console.log('👥 العملاء المتصلون:', state.clients);
    }

    // ============================================================
    // تهيئة الدردشة
    // ============================================================
    function init() {
        if (state.isInitialized) return;
        
        // ✅ تحديد هوية المستخدم
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('user') || 'null');
        
        if (userData) {
            state.user.id = userData.id || userData._id || 'user_' + Date.now();
            state.user.name = userData.name || 'مستخدم';
            state.user.role = userData.role || 'client';
            state.user.avatar = state.user.name.charAt(0) || 'م';
        } else {
            state.user.id = 'guest_' + Date.now();
            state.user.name = 'زائر';
            state.user.role = 'client';
            state.user.avatar = 'ز';
        }
        
        // ✅ إنشاء عناصر الدردشة
        createWidgetElements();
        
        // ✅ تحميل الرسائل من localStorage (للمتابعة)
        loadMessages();
        
        // ✅ إعداد المستمعات
        setupEventListeners();
        
        // ✅ تحديث الشارة
        updateBadge();
        
        // ✅ الاتصال بـ WebSocket
        WSManager.connect();
        
        state.isInitialized = true;
        
        console.log('💬 نظام الدردشة العائم جاهز!');
        console.log('👤 المستخدم:', state.user);
        console.log('📋 عدد الرسائل:', state.messages.length);
        console.log('🔔 عدد الإشعارات:', state.unreadCount);
        
        // ✅ فتح تلقائي للمستخدم الجديد
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
        
        const isAdmin = state.user.role === 'admin';
        const adminName = isAdmin ? 'لوحة المدير' : 'الدعم الفني';
        const adminAvatar = isAdmin ? 'م' : 'ا';
        const adminColor = isAdmin ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #7C3AED, #EC4899)';
        
        popup.innerHTML = `
            <div class="chat-widget-header" style="background: ${adminColor};">
                <div class="info">
                    <div class="avatar" id="widgetAvatar" style="background: rgba(255,255,255,0.2);">${adminAvatar}</div>
                    <div class="details">
                        <div class="name" id="widgetName">${adminName}</div>
                        <div class="status" id="widgetStatus">
                            <span class="dot online"></span> متصل الآن
                        </div>
                    </div>
                </div>
                <div class="header-actions">
                    ${isAdmin ? `
                        <button class="clients-btn" onclick="window.chatWidget.showClients()" title="العملاء">
                            <i class="fas fa-users"></i>
                        </button>
                    ` : ''}
                    <button class="minimize-btn" onclick="window.chatWidget.minimize()" title="تصغير">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="close-btn" onclick="window.chatWidget.close()" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="chat-widget-messages" id="widgetMessages">
                <div class="widget-empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>مرحباً! كيف يمكنني مساعدتك؟</p>
                    <span>${isAdmin ? 'أنت مدير، يمكنك الرد على العملاء' : 'اكتب رسالتك وسيتم الرد عليك من قبل الدعم الفني'}</span>
                </div>
            </div>

            <div class="chat-widget-input">
                <button class="attach-btn" onclick="window.chatWidget.attachFile()" title="إرفاق ملف">
                    <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="widgetInput" placeholder="${isAdmin ? 'اكتب ردك...' : 'اكتب رسالتك...'}" 
                       autocomplete="off" />
                <button class="send-btn" id="widgetSendBtn" disabled onclick="window.chatWidget.sendMessage()">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>

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
            init: init,
            toggle: toggleChat,
            open: openChat,
            close: closeChat,
            minimize: minimizeChat,
            sendMessage: sendMessage,
            attachFile: triggerFileUpload,
            downloadFile: downloadFile,
            markAsRead: markAsRead,
            getUnreadCount: getUnreadCount,
            setUser: setUser,
            addMessage: addMessage,
            getMessages: getMessages,
            clearMessages: clearMessages,
            showClients: showClients,
            getConnectionStatus: getConnectionStatus
        };
    }

    // ============================================================
    // أنماط الدردشة (مضمنة)
    // ============================================================
    function addWidgetStyles() {
        // تم تضمين الأنماط في chat-widget.css
        // هذا الكود هنا للتوثيق
        console.log('🎨 تم تحميل أنماط الدردشة');
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
                    <span>${state.user.role === 'admin' ? 'أنت مدير، يمكنك الرد على العملاء' : 'اكتب رسالتك وسيتم الرد عليك من قبل الدعم الفني'}</span>
                </div>
            `;
            return;
        }

        state.messages.forEach((msg) => {
            const div = document.createElement('div');
            const isAdmin = msg.sender === 'admin';
            div.className = `msg ${isAdmin ? 'sent' : 'received'}`;

            let content = msg.text || '';

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

            const senderLabel = isAdmin ? 'أنت' : (msg.userName || 'العميل');
            content += `<span class="time">${senderLabel} • ${msg.time || 'الآن'}</span>`;
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

        const sender = state.user.role === 'admin' ? 'admin' : 'client';
        
        const newMsg = {
            id: Date.now(),
            sender: sender,
            userName: state.user.name,
            text: text || '📎 ملف مرفق',
            time: time,
            file: state.pendingFile || null,
            timestamp: now.toISOString()
        };

        // ✅ إضافة الرسالة محلياً
        state.messages.push(newMsg);
        state.pendingFile = null;
        saveMessages();
        renderMessages();

        elements.input.value = '';
        elements.sendBtn.disabled = true;

        // ✅ إرسال عبر WebSocket
        const wsData = {
            type: 'message',
            sender: sender,
            userId: state.user.id,
            userName: state.user.name,
            text: text || '📎 ملف مرفق',
            file: state.pendingFile || null,
            time: time
        };
        
        WSManager.send(wsData);

        // ✅ إذا كان المرسل مديراً، إرسال إشعار للعميل المحدد
        if (sender === 'admin' && state.currentClientId) {
            WSManager.send({
                type: 'reply',
                userId: state.currentClientId,
                message: text || '📎 ملف مرفق',
                file: state.pendingFile || null
            });
        }

        // ✅ إشعار صوتي
        playNotificationSound();
    }

    // ============================================================
    // إضافة رسالة من الخارج
    // ============================================================
    function addMessage(text, sender = 'admin', file = null) {
        const now = new Date();
        const time = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        const newMsg = {
            id: Date.now(),
            sender: sender,
            userName: sender === 'admin' ? 'الدعم الفني' : state.user.name,
            text: text,
            time: time,
            file: file || null,
            timestamp: now.toISOString()
        };

        state.messages.push(newMsg);
        saveMessages();
        renderMessages();

        // ✅ إرسال عبر WebSocket
        WSManager.send({
            type: 'message',
            sender: sender,
            userId: state.user.id,
            text: text,
            file: file || null
        });

        if (!state.isOpen) {
            state.unreadCount++;
            updateBadge();
            saveMessages();
            playNotificationSound();
            showNotification(`📩 رسالة من ${sender === 'admin' ? 'الدعم الفني' : 'عميل'}`, text);
        }

        return newMsg;
    }

    // ============================================================
    // جلب جميع الرسائل
    // ============================================================
    function getMessages() {
        return state.messages;
    }

    // ============================================================
    // مسح جميع الرسائل
    // ============================================================
    function clearMessages() {
        if (!confirm('هل أنت متأكد من مسح جميع الرسائل؟')) return;
        state.messages = [];
        state.unreadCount = 0;
        saveMessages();
        renderMessages();
        updateBadge();
        showToast('🗑️ تم مسح جميع الرسائل', 'info');
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

        if (file.size > CONFIG.maxFileSize) {
            showToast(`❌ حجم الملف كبير جداً. الحد الأقصى ${CONFIG.maxFileSize / 1024 / 1024}MB`, 'error');
            event.target.value = '';
            return;
        }

        if (!CONFIG.allowedFileTypes.includes(file.type)) {
            showToast('❌ نوع الملف غير مدعوم', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            state.pendingFile = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result
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
    // عرض العملاء (للمدير)
    // ============================================================
    function showClients() {
        if (state.user.role !== 'admin') return;
        
        const clientList = state.clients.map(c => 
            `🟢 ${c.name || c.id} ${c.online ? '(متصل)' : '(غير متصل)'}`
        ).join('\n');
        
        alert(`👥 العملاء المتصلون:\n\n${clientList || 'لا يوجد عملاء متصلون'}`);
    }

    // ============================================================
    // حالة الاتصال
    // ============================================================
    function getConnectionStatus() {
        return {
            connected: state.isConnected,
            ws: state.ws,
            reconnectCount: state.reconnectCount
        };
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
        } else {
            badge.style.display = 'none';
        }
    }

    function getUnreadCount() {
        return state.unreadCount;
    }

    function markAsRead() {
        state.unreadCount = 0;
        updateBadge();
        saveMessages();
    }

    // ============================================================
    // تعيين المستخدم
    // ============================================================
    function setUser(user) {
        if (user) {
            state.user = { ...state.user, ...user };
            // إعادة الاتصال بـ WebSocket
            WSManager.disconnect();
            WSManager.connect();
        }
    }

    // ============================================================
    // إشعار منبثق
    // ============================================================
    function showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📩 منصة ارتقاء', {
                body: message || 'لديك رسالة جديدة',
                icon: 'https://irteqa-eduhub.onrender.com/favicon.ico'
            });
        }

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
    // مستمعي الأحداث
    // ============================================================
    function setupEventListeners() {
        elements.btn.addEventListener('click', toggleChat);

        elements.input.addEventListener('input', function() {
            const btn = elements.sendBtn;
            btn.disabled = !this.value.trim() && !state.pendingFile;
            
            // إرسال مؤشر الكتابة
            if (state.isConnected) {
                WSManager.send({
                    type: 'typing',
                    isTyping: this.value.trim().length > 0
                });
            }
        });

        elements.input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        elements.fileInput.addEventListener('change', handleFileUpload);

        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 5000);
        }

        // ✅ استقبال الإشعارات من WebSocket
        // يتم التعامل معها في handleWSMessage
    }

    // ============================================================
    // التهيئة
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // تصدير الدوال
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
        addMessage: addMessage,
        getMessages: getMessages,
        clearMessages: clearMessages,
        showClients: showClients,
        getConnectionStatus: getConnectionStatus,
        WSManager: WSManager,
        state: state
    };

    console.log('💬 Chat Widget initialized successfully!');
    console.log('👤 المستخدم:', state.user);
    console.log('🔌 WebSocket:', WSManager.isConnected() ? '🟢 متصل' : '🔴 غير متصل');
    console.log('📖 استخدم window.ChatWidget للتحكم في الدردشة');

})();