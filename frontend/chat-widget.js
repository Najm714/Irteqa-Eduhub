// ============================================================
// نظام الدردشة العائم - Chat Widget
// النسخة الحقيقية مع WebSocket وقاعدة بيانات
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
        wsUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'ws://localhost:5000'
            : 'wss://irteqa-eduhub.onrender.com',
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
        ]
    };

    // ============================================================
    // الحالة العامة
    // ============================================================
    let state = {
        messages: [],
        conversations: [], // قائمة المحادثات
        unreadCount: 0,
        isOpen: false,
        isInitialized: false,
        pendingFile: null,
        ws: null,
        isConnected: false,
        reconnectCount: 0,
        user: {
            id: null,
            name: 'زائر',
            role: 'client', // 'admin', 'client', 'expert'
            avatar: 'ز'
        },
        currentConversationId: null, // معرف المحادثة الحالية
        activeUsers: [] // المستخدمين النشطين
    };

    // ============================================================
    // DOM Elements
    // ============================================================
    let elements = {};

    // ============================================================
    // جلب التوكن
    // ============================================================
    function getToken() {
        return localStorage.getItem('token') || '';
    }

    // ============================================================
    // جلب معلومات المستخدم
    // ============================================================
    function getUser() {
        try {
            const userData = JSON.parse(localStorage.getItem('user') || 'null');
            if (userData) {
                return {
                    id: userData.id || userData._id || null,
                    name: userData.name || 'مستخدم',
                    role: userData.role || 'client',
                    email: userData.email || '',
                    avatar: userData.name ? userData.name.charAt(0) : 'م'
                };
            }
        } catch (e) {
            console.warn('⚠️ فشل جلب بيانات المستخدم:', e);
        }
        return null;
    }

    // ============================================================
    // تهيئة الدردشة
    // ============================================================
    function init() {
        if (state.isInitialized) return;
        
        // ✅ جلب بيانات المستخدم
        const user = getUser();
        if (user) {
            state.user = { ...state.user, ...user };
        } else {
            // مستخدم زائر
            state.user.id = 'guest_' + Date.now();
            state.user.name = 'زائر';
            state.user.role = 'client';
        }
        
        // ✅ إنشاء عناصر الدردشة
        createWidgetElements();
        
        // ✅ تحميل المحادثات من الخادم
        loadConversations();
        
        // ✅ إعداد المستمعات
        setupEventListeners();
        
        // ✅ الاتصال بـ WebSocket
        connectWebSocket();
        
        state.isInitialized = true;
        
        console.log('💬 نظام الدردشة العائم جاهز!');
        console.log('👤 المستخدم:', state.user);
        
        // ✅ فتح تلقائي بعد 3 ثوانٍ
        setTimeout(() => {
            if (!state.isOpen && state.conversations.length > 0) {
                // فتح أول محادثة
                openConversation(state.conversations[0].id);
            }
        }, CONFIG.autoOpenDelay || 3000);
    }

    // ============================================================
    // الاتصال بـ WebSocket
    // ============================================================
    function connectWebSocket() {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            console.log('⚠️ WebSocket متصل بالفعل');
            return;
        }

        const wsUrl = `${CONFIG.wsUrl}?userId=${state.user.id}&role=${state.user.role}&token=${getToken()}`;
        console.log('🔌 محاولة الاتصال بـ WebSocket:', wsUrl);

        try {
            state.ws = new WebSocket(wsUrl);

            state.ws.onopen = function() {
                console.log('✅ تم الاتصال بـ WebSocket');
                state.isConnected = true;
                state.reconnectCount = 0;
                
                // إرسال معلومات المستخدم
                sendWSMessage({
                    type: 'auth',
                    userId: state.user.id,
                    role: state.user.role,
                    token: getToken()
                });
                
                updateConnectionStatus(true);
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
                updateConnectionStatus(false);
                reconnectWS();
            };

            state.ws.onerror = function(error) {
                console.error('❌ خطأ في WebSocket:', error);
            };

        } catch (error) {
            console.error('❌ فشل الاتصال بـ WebSocket:', error);
            reconnectWS();
        }
    }

    function reconnectWS() {
        if (state.reconnectCount >= 5) {
            console.log('❌ فشل إعادة الاتصال بعد عدة محاولات');
            return;
        }

        state.reconnectCount++;
        const delay = 3000 * state.reconnectCount;
        console.log(`🔄 محاولة إعادة الاتصال ${state.reconnectCount}/5 بعد ${delay/1000} ثانية`);
        
        setTimeout(() => {
            connectWebSocket();
        }, delay);
    }

    function sendWSMessage(data) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
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
    // معالجة الرسائل من WebSocket
    // ============================================================
    function handleWSMessage(data) {
        switch(data.type) {
            case 'new_message':
                // ✅ رسالة جديدة
                if (data.conversationId === state.currentConversationId) {
                    // إضافة الرسالة إلى المحادثة الحالية
                    addMessageToConversation(data.message);
                } else {
                    // رسالة في محادثة أخرى - تحديث الإشعارات
                    state.unreadCount++;
                    updateBadge();
                    
                    // تحديث قائمة المحادثات
                    const conv = state.conversations.find(c => c.id === data.conversationId);
                    if (conv) {
                        conv.lastMessage = data.message.text;
                        conv.lastMessageTime = data.message.createdAt;
                        conv.unreadCount = (conv.unreadCount || 0) + 1;
                    }
                    renderConversations();
                    
                    // إشعار صوتي
                    playNotificationSound();
                    
                    // إشعار منبثق
                    if (!state.isOpen) {
                        showNotification(
                            `📩 رسالة من ${data.message.senderName || 'مستخدم'}`,
                            data.message.text
                        );
                    }
                }
                break;

            case 'conversation_updated':
                // ✅ تحديث المحادثة
                const updatedConv = state.conversations.find(c => c.id === data.conversationId);
                if (updatedConv) {
                    updatedConv.lastMessage = data.lastMessage;
                    updatedConv.lastMessageTime = data.lastMessageTime;
                    updatedConv.unreadCount = data.unreadCount || 0;
                    renderConversations();
                }
                break;

            case 'user_online':
                // ✅ مستخدم متصل
                if (state.user.role === 'admin' || state.user.role === 'expert') {
                    showToast(`🟢 ${data.userName || 'مستخدم'} متصل الآن`, 'info');
                }
                break;

            case 'user_offline':
                // ✅ مستخدم غير متصل
                if (state.user.role === 'admin' || state.user.role === 'expert') {
                    showToast(`🔴 ${data.userName || 'مستخدم'} غير متصل`, 'info');
                }
                break;

            case 'conversations':
                // ✅ قائمة المحادثات
                state.conversations = data.conversations || [];
                renderConversations();
                if (state.conversations.length > 0 && !state.currentConversationId) {
                    openConversation(state.conversations[0].id);
                }
                break;

            case 'messages':
                // ✅ رسائل محادثة
                if (data.conversationId === state.currentConversationId) {
                    state.messages = data.messages || [];
                    renderMessages();
                    scrollToBottom();
                }
                break;

            case 'error':
                console.error('❌ خطأ من الخادم:', data.message);
                showToast('❌ ' + data.message, 'error');
                break;

            default:
                console.log('📩 رسالة غير معروفة:', data);
        }
    }

    // ============================================================
    // تحميل المحادثات من الخادم
    // ============================================================
    async function loadConversations() {
        try {
            const token = getToken();
            if (!token) return;

            const response = await fetch(`${CONFIG.apiUrl}/chat/conversations`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`خطأ ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                state.conversations = data.data || [];
                renderConversations();
                
                if (state.conversations.length > 0) {
                    openConversation(state.conversations[0].id);
                }
            }
        } catch (error) {
            console.error('❌ فشل تحميل المحادثات:', error);
        }
    }

    // ============================================================
    // تحميل رسائل محادثة
    // ============================================================
    async function loadConversationMessages(conversationId) {
        try {
            const token = getToken();
            if (!token) return;

            const response = await fetch(`${CONFIG.apiUrl}/chat/conversations/${conversationId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`خطأ ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                state.messages = data.data || [];
                state.currentConversationId = conversationId;
                renderMessages();
                scrollToBottom();
            }
        } catch (error) {
            console.error('❌ فشل تحميل الرسائل:', error);
        }
    }

    // ============================================================
    // إنشاء محادثة جديدة
    // ============================================================
    async function createConversation(userId, userRole = 'client') {
        try {
            const token = getToken();
            if (!token) {
                showToast('❌ يرجى تسجيل الدخول', 'error');
                return;
            }

            const response = await fetch(`${CONFIG.apiUrl}/chat/conversations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: userId,
                    userRole: userRole
                })
            });

            if (!response.ok) {
                throw new Error(`خطأ ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                state.conversations.unshift(data.data);
                renderConversations();
                openConversation(data.data.id);
                showToast('✅ تم إنشاء المحادثة', 'success');
            }
        } catch (error) {
            console.error('❌ فشل إنشاء المحادثة:', error);
            showToast('❌ حدث خطأ في إنشاء المحادثة', 'error');
        }
    }

    // ============================================================
    // عرض قائمة المحادثات
    // ============================================================
    function renderConversations() {
        const container = elements.conversationsList;
        if (!container) return;

        if (state.conversations.length === 0) {
            container.innerHTML = `
                <div class="conv-empty">
                    <i class="fas fa-comments"></i>
                    <p>لا توجد محادثات</p>
                    <span>ابدأ محادثة جديدة</span>
                </div>
            `;
            return;
        }

        let html = '';
        state.conversations.forEach(conv => {
            const isActive = conv.id === state.currentConversationId;
            const unread = conv.unreadCount || 0;
            const lastMsg = conv.lastMessage || 'لا توجد رسائل';
            const time = conv.lastMessageTime ? new Date(conv.lastMessageTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
            
            const otherUser = conv.otherUser || conv.participants?.find(p => p.id !== state.user.id) || {};
            const userName = otherUser.name || conv.userName || 'مستخدم';
            const userAvatar = otherUser.avatar || userName.charAt(0) || 'م';
            const userRole = otherUser.role || conv.userRole || 'client';
            
            const roleColors = {
                admin: 'admin',
                client: 'client',
                expert: 'expert'
            };

            html += `
                <div class="conv-item ${isActive ? 'active' : ''}" onclick="window.chatWidget.openConversation('${conv.id}')">
                    <div class="avatar ${roleColors[userRole] || 'client'}">${userAvatar}</div>
                    <div class="info">
                        <div class="name">
                            ${userName}
                            <span class="role">${userRole === 'admin' ? 'مدير' : userRole === 'expert' ? 'خبير' : 'عميل'}</span>
                        </div>
                        <div class="last-msg">${lastMsg}</div>
                    </div>
                    ${unread > 0 ? `<div class="unread">${unread}</div>` : ''}
                    <span class="time">${time}</span>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ============================================================
    // فتح محادثة
    // ============================================================
    function openConversation(conversationId) {
        if (state.currentConversationId === conversationId) return;
        
        state.currentConversationId = conversationId;
        loadConversationMessages(conversationId);
        
        // تحديث الإشعارات
        const conv = state.conversations.find(c => c.id === conversationId);
        if (conv) {
            conv.unreadCount = 0;
            renderConversations();
            updateBadge();
        }
        
        // إرسال إشعار قراءة
        sendWSMessage({
            type: 'read',
            conversationId: conversationId
        });
    }

    // ============================================================
    // عرض الرسائل
    // ============================================================
    function renderMessages() {
        const container = elements.messages;
        if (!container) return;

        container.innerHTML = '';

        if (state.messages.length === 0) {
            container.innerHTML = `
                <div class="widget-empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>لا توجد رسائل</p>
                    <span>ابدأ المحادثة الآن</span>
                </div>
            `;
            return;
        }

        let lastDate = '';
        state.messages.forEach((msg) => {
            // إضافة تاريخ
            const msgDate = new Date(msg.createdAt || msg.timestamp).toLocaleDateString('ar-SA');
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                const dateDiv = document.createElement('div');
                dateDiv.className = 'message-date';
                dateDiv.innerHTML = `<span>${msgDate}</span>`;
                container.appendChild(dateDiv);
            }

            const div = document.createElement('div');
            const isOwn = msg.senderId === state.user.id;
            div.className = `msg ${isOwn ? 'sent' : 'received'}`;

            let content = msg.text || '';

            if (msg.file) {
                const isImage = msg.file.type && msg.file.type.startsWith('image/');
                const isVideo = msg.file.type && msg.file.type.startsWith('video/');

                if (isImage) {
                    content += `<img src="${msg.file.data}" class="msg-image" 
                               onclick="window.open('${msg.file.data}', '_blank')" />`;
                } else if (isVideo) {
                    content += `
                        <video controls class="msg-video">
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
                            <span class="file-size">${fileSize} KB</span>
                            <i class="fas fa-download"></i>
                        </div>
                    `;
                }
            }

            const senderName = msg.senderName || (isOwn ? 'أنت' : 'المرسل');
            const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'الآن';
            content += `<span class="time">${senderName} • ${time}</span>`;
            div.innerHTML = content;
            container.appendChild(div);
        });

        scrollToBottom();
    }

    // ============================================================
    // إرسال رسالة
    // ============================================================
    async function sendMessage() {
        const text = elements.input.value.trim();
        if (!text && !state.pendingFile) return;

        if (!state.currentConversationId) {
            showToast('❌ اختر محادثة أولاً', 'error');
            return;
        }

        const token = getToken();
        if (!token) {
            showToast('❌ يرجى تسجيل الدخول', 'error');
            return;
        }

        // تحويل الملف إلى Base64
        let fileData = null;
        if (state.pendingFile) {
            fileData = {
                name: state.pendingFile.name,
                type: state.pendingFile.type,
                size: state.pendingFile.size,
                data: state.pendingFile.data
            };
        }

        const messageData = {
            conversationId: state.currentConversationId,
            text: text || '📎 ملف مرفق',
            file: fileData
        };

        try {
            const response = await fetch(`${CONFIG.apiUrl}/chat/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(messageData)
            });

            if (!response.ok) {
                throw new Error(`خطأ ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                // إضافة الرسالة محلياً
                addMessageToConversation(data.data);
                
                // تنظيف
                state.pendingFile = null;
                elements.input.value = '';
                elements.sendBtn.disabled = true;
                
                // إرسال عبر WebSocket
                sendWSMessage({
                    type: 'new_message',
                    conversationId: state.currentConversationId,
                    message: data.data
                });
            }
        } catch (error) {
            console.error('❌ فشل إرسال الرسالة:', error);
            showToast('❌ فشل إرسال الرسالة', 'error');
        }
    }

    // ============================================================
    // إضافة رسالة إلى المحادثة
    // ============================================================
    function addMessageToConversation(message) {
        state.messages.push(message);
        renderMessages();
        scrollToBottom();
        
        // تحديث آخر رسالة في المحادثة
        const conv = state.conversations.find(c => c.id === state.currentConversationId);
        if (conv) {
            conv.lastMessage = message.text;
            conv.lastMessageTime = message.createdAt;
            renderConversations();
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
        `;
        document.body.appendChild(btn);
        elements.btn = btn;

        // ✅ نافذة الدردشة
        const popup = document.createElement('div');
        popup.className = 'chat-widget-popup';
        popup.id = 'chatWidgetPopup';
        
        const isAdmin = state.user.role === 'admin' || state.user.role === 'expert';
        
        popup.innerHTML = `
            <div class="chat-widget-header">
                <div class="info">
                    <div class="avatar" id="widgetAvatar">${isAdmin ? 'م' : 'ا'}</div>
                    <div class="details">
                        <div class="name" id="widgetName">${isAdmin ? 'لوحة الإدارة' : 'الدعم الفني'}</div>
                        <div class="status" id="widgetStatus">
                            <span class="dot online"></span> متصل الآن
                        </div>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="new-chat-btn" onclick="window.chatWidget.newChat()" title="محادثة جديدة">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button class="minimize-btn" onclick="window.chatWidget.minimize()" title="تصغير">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="close-btn" onclick="window.chatWidget.close()" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="chat-widget-body">
                <div class="chat-conversations" id="chatConversations">
                    <div class="conv-header">
                        <span>المحادثات</span>
                        <span class="conv-count" id="convCount">0</span>
                    </div>
                    <div class="conv-list" id="convList">
                        <div class="conv-empty">
                            <i class="fas fa-comments"></i>
                            <p>لا توجد محادثات</p>
                        </div>
                    </div>
                </div>

                <div class="chat-messages-wrapper">
                    <div class="chat-messages" id="widgetMessages">
                        <div class="widget-empty-state">
                            <i class="fas fa-comment-dots"></i>
                            <p>اختر محادثة للبدء</p>
                        </div>
                    </div>

                    <div class="chat-widget-input">
                        <button class="attach-btn" onclick="window.chatWidget.attachFile()" title="إرفاق ملف">
                            <i class="fas fa-paperclip"></i>
                        </button>
                        <input type="text" id="widgetInput" placeholder="اكتب رسالتك..." autocomplete="off" />
                        <button class="send-btn" id="widgetSendBtn" disabled onclick="window.chatWidget.sendMessage()">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>

            <input type="file" id="widgetFileInput" style="display:none" 
                   accept=".jpg,.jpeg,.png,.gif,.mp4,.avi,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" 
                   multiple />
        `;
        document.body.appendChild(popup);
        elements.popup = popup;

        // تخزين المراجع
        elements.messages = document.getElementById('widgetMessages');
        elements.conversationsList = document.getElementById('convList');
        elements.input = document.getElementById('widgetInput');
        elements.sendBtn = document.getElementById('widgetSendBtn');
        elements.badge = document.getElementById('widgetBadge');
        elements.fileInput = document.getElementById('widgetFileInput');
        elements.avatar = document.getElementById('widgetAvatar');
        elements.name = document.getElementById('widgetName');
        elements.status = document.getElementById('widgetStatus');

        // ✅ ربط الدوال بـ window
        window.chatWidget = {
            init: init,
            open: openChat,
            close: closeChat,
            toggle: toggleChat,
            minimize: minimizeChat,
            sendMessage: sendMessage,
            attachFile: triggerFileUpload,
            downloadFile: downloadFile,
            openConversation: openConversation,
            newChat: showNewChatDialog,
            getUnreadCount: getUnreadCount,
            markAsRead: markAsRead,
            getMessages: getMessages
        };
    }

    // ============================================================
    // عرض نافذة محادثة جديدة
    // ============================================================
    function showNewChatDialog() {
        const userId = prompt('أدخل معرف المستخدم (ID) لبدء محادثة جديدة:');
        if (!userId) return;
        
        const role = prompt('نوع المستخدم (client / expert / admin):', 'client');
        if (!role) return;
        
        createConversation(userId, role);
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
        
        state.unreadCount = 0;
        updateBadge();
        
        // تحديث المحادثات
        loadConversations();
        
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
    // تحديث شارة الإشعارات
    // ============================================================
    function updateBadge() {
        const badge = elements.badge;
        if (!badge) return;

        // حساب الإشعارات من جميع المحادثات
        let totalUnread = 0;
        state.conversations.forEach(conv => {
            totalUnread += (conv.unreadCount || 0);
        });

        if (totalUnread > 0) {
            badge.style.display = 'flex';
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        } else {
            badge.style.display = 'none';
        }
    }

    // ============================================================
    // دوال مساعدة
    // ============================================================
    function getUnreadCount() {
        let total = 0;
        state.conversations.forEach(conv => {
            total += (conv.unreadCount || 0);
        });
        return total;
    }

    function markAsRead() {
        state.conversations.forEach(conv => {
            conv.unreadCount = 0;
        });
        updateBadge();
        renderConversations();
    }

    function getMessages() {
        return state.messages;
    }

    function triggerFileUpload() {
        elements.fileInput.click();
    }

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
    // مستمعي الأحداث
    // ============================================================
    function setupEventListeners() {
        elements.btn.addEventListener('click', toggleChat);

        elements.input.addEventListener('input', function() {
            elements.sendBtn.disabled = !this.value.trim() && !state.pendingFile;
        });

        elements.input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        elements.fileInput.addEventListener('change', function(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            const file = files[0];
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
        });

        // طلب إذن الإشعارات
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => Notification.requestPermission(), 5000);
        }
    }

    // ============================================================
    // Toast وإشعارات
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
            <div class="notif-icon"><i class="fas fa-comment-dots"></i></div>
            <div class="notif-content">
                <div class="notif-title">${title}</div>
                <div class="notif-text">${message}</div>
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

    function playNotificationSound() {
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
        } catch (e) {}
    }

    function scrollToBottom() {
        setTimeout(() => {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }, 50);
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
    // تصدير
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
        openConversation: openConversation,
        newChat: showNewChatDialog,
        getUnreadCount: getUnreadCount,
        markAsRead: markAsRead,
        getMessages: getMessages,
        state: state
    };

    console.log('💬 Chat Widget initialized successfully!');
    console.log('👤 المستخدم:', state.user);

})();