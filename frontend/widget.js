(function() {
    const CONFIG = {
        apiUrl: 'http://localhost:3000',
        apiKey: null,
        siteId: null,
        socket: null,
        availabilitySocket: null,
        threadId: null,
        visitorId: null
    };
    
    const scriptTag = document.querySelector('script[data-chat-widget]');
    if (scriptTag) {
        CONFIG.apiKey = scriptTag.getAttribute('data-api-key');
    }
    
    if (!CONFIG.apiKey) {
        console.error('❌ Chat widget: Missing API key');
        return;
    }
    
    console.log('✅ Chat widget initializing');
    
    // Track displayed messages by unique ID
    let displayedMessages = new Set();
    let chatConnectPromise = null;
    let supportTypingTimeout = null;
    let widgetSettings = null;
    let currentSupportAvailability = null;
    
    function getVisitorId() {
        let visitorId = localStorage.getItem('chat_visitor_id');
        if (!visitorId) {
            visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_visitor_id', visitorId);
        }
        return visitorId;
    }
    
    CONFIG.visitorId = getVisitorId();
    
    async function loadConfig() {
        try {
            const response = await fetch(`${CONFIG.apiUrl}/api/sites/config/${CONFIG.apiKey}`);
            if (!response.ok) throw new Error('Invalid API key');
            const data = await response.json();
            CONFIG.siteId = data.siteId;
            widgetSettings = data.settings;
            currentSupportAvailability = data.supportAvailability;
            console.log('✅ Config loaded, siteId:', CONFIG.siteId);
            initWidget(widgetSettings, currentSupportAvailability);
            connectAvailabilityUpdates();
        } catch (err) {
            console.error('❌ Config error:', err);
        }
    }
    
    function initWidget(settings, supportAvailability) {
        const widgetColor = settings?.widgetColor || '#3B82F6';
        const greetingMessage = settings?.greetingMessage || 'Hello! How can we help you?';
        injectWidgetStyles();
        const widgetHTML = `
            <div id="chat-widget-container" style="position:fixed; bottom:20px; right:20px; z-index:99999; font-family:system-ui, -apple-system, sans-serif;">
                <div id="chat-toggle" style="background:${widgetColor}; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <div id="chat-window" style="display:none; position:absolute; bottom:80px; right:0; width:380px; height:520px; background:white; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.2); flex-direction:column; overflow:hidden;">
                    <div style="background:${widgetColor}; padding:16px; color:white; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <div style="min-width:0;">
                                <div id="chat-header-name" style="font-weight:700; font-size:15px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Customer Support</div>
                                <div style="display:flex; align-items:center; gap:6px; margin-top:3px; font-size:12px; opacity:0.9;">
                                    <span id="chat-status-dot" style="width:8px; height:8px; border-radius:50%; background:#fbbf24; display:inline-block; flex-shrink:0;"></span>
                                    <span id="chat-header-status">We reply soon</span>
                                </div>
                            </div>
                        </div>
                        <span id="chat-close" style="cursor:pointer; font-size:24px;">&times;</span>
                    </div>
                    <div id="chat-messages" style="flex:1; overflow-y:auto; padding:16px; background:#f9fafb;"></div>
                    <div style="padding:16px; background:white; border-top:1px solid #e5e7eb; display:flex; gap:10px;">
                        <input type="text" id="chat-input" placeholder="Type your message..." style="flex:1; padding:10px; border:1px solid #e5e7eb; border-radius:8px; outline:none;">
                        <button id="chat-send" style="background:${widgetColor}; border:none; color:white; padding:10px 18px; border-radius:8px; cursor:pointer;">Send</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        const toggle = document.getElementById('chat-toggle');
        const windowDiv = document.getElementById('chat-window');
        const close = document.getElementById('chat-close');
        const messagesDiv = document.getElementById('chat-messages');
        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');

        showGreetingMessage(messagesDiv, greetingMessage, supportAvailability);
        updateSupportHeader(supportAvailability);
        loadExistingChat(messagesDiv);
        
        toggle.onclick = () => {
            if (windowDiv.style.display === 'none' || windowDiv.style.display === '') {
                windowDiv.style.display = 'flex';
            } else {
                windowDiv.style.display = 'none';
            }
        };
        
        close.onclick = () => {
            windowDiv.style.display = 'none';
        };

        send.onclick = () => sendVisitorMessage(messagesDiv, input, send);

        input.onkeypress = (e) => {
            if (e.key === 'Enter') send.onclick();
        };
    }

    function showGreetingMessage(messagesDiv, greetingMessage, supportAvailability) {
        messagesDiv.innerHTML = `
            <div style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                <div style="max-width:75%; padding:10px 14px; border-radius:12px; background:#e5e7eb; color:#1f2937; word-wrap:break-word;">
                    ${escapeHtml(greetingMessage)}
                </div>
            </div>
            <div id="chat-availability-row" style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                <div id="chat-availability-message" style="max-width:75%; padding:10px 14px; border-radius:12px; background:#e5e7eb; color:#1f2937; word-wrap:break-word;">
                    ${escapeHtml(getAvailabilityMessage(supportAvailability))}
                </div>
            </div>
        `;
        updateAvailabilityMessage(supportAvailability);
    }

    function getAvailabilityMessage(supportAvailability) {
        return supportAvailability?.available
            ? ''
            : 'No support agent is available right now. We will reply as soon as possible.';
    }

    function updateAvailabilityMessage(supportAvailability) {
        currentSupportAvailability = supportAvailability;
        const availabilityRow = document.getElementById('chat-availability-row');
        const availabilityDiv = document.getElementById('chat-availability-message');
        const availabilityMessage = getAvailabilityMessage(supportAvailability);

        if (availabilityRow) {
            availabilityRow.style.display = availabilityMessage ? 'flex' : 'none';
        }

        if (availabilityDiv && availabilityMessage) {
            availabilityDiv.textContent = availabilityMessage;
        }
        updateSupportHeader(supportAvailability);
    }

    function updateSupportHeader(supportAvailability) {
        const headerName = document.getElementById('chat-header-name');
        const headerStatus = document.getElementById('chat-header-status');
        const statusDot = document.getElementById('chat-status-dot');
        if (!headerName || !headerStatus || !statusDot) return;

        if (supportAvailability?.available && supportAvailability.agentName) {
            headerName.textContent = supportAvailability.agentName;
            headerStatus.textContent = 'Available now';
            statusDot.style.background = '#22c55e';
            statusDot.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
        } else {
            headerName.textContent = 'Customer Support';
            headerStatus.textContent = 'We reply soon';
            statusDot.style.background = '#fbbf24';
            statusDot.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.25)';
        }
    }

    async function connectAvailabilityUpdates() {
        if (CONFIG.availabilitySocket || !CONFIG.siteId) return;

        await loadSocketIO();
        if (typeof io === 'undefined') return;

        CONFIG.availabilitySocket = io(CONFIG.apiUrl);
        CONFIG.availabilitySocket.on('connect', () => {
            CONFIG.availabilitySocket.emit('visitor-join-site', CONFIG.siteId);
        });

        CONFIG.availabilitySocket.on('support-availability', (supportAvailability) => {
            updateAvailabilityMessage(supportAvailability);
        });
    }

    async function sendVisitorMessage(messagesDiv, input, send) {
        const messageText = input.value.trim();
        if (!messageText) return;

        try {
            input.disabled = true;
            send.disabled = true;
            await ensureChatConnected(messagesDiv);

            CONFIG.socket.emit('visitor-message', {
                threadId: CONFIG.threadId,
                message: messageText,
                visitorId: CONFIG.visitorId
            });

            input.value = '';
        } catch (err) {
            console.error('Send message error:', err);
            messagesDiv.innerHTML = `<div style="text-align:center;color:red;padding:20px;">Error: ${err.message}</div>`;
        } finally {
            input.disabled = false;
            send.disabled = false;
            input.focus();
        }
    }

    function ensureChatConnected(messagesDiv) {
        if (CONFIG.socket && CONFIG.socket.connected && CONFIG.threadId) {
            return Promise.resolve();
        }

        if (!chatConnectPromise) {
            chatConnectPromise = connectToChat(messagesDiv).finally(() => {
                chatConnectPromise = null;
            });
        }

        return chatConnectPromise;
    }
    
    async function connectToChat(messagesDiv) {
        messagesDiv.innerHTML = '<div style="text-align:center;padding:20px;">Connecting...</div>';
        
        const response = await fetch(`${CONFIG.apiUrl}/api/threads/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                siteId: CONFIG.siteId, 
                visitorId: CONFIG.visitorId,
                visitorName: 'Guest'
            })
        });

        if (!response.ok) throw new Error('Could not start chat');
        
        const data = await response.json();
        CONFIG.threadId = data.threadId;
        console.log('✅ Thread:', CONFIG.threadId);
        
        return connectThreadSocket(messagesDiv, { clearOnPreviousMessages: true });
    }

    async function loadExistingChat(messagesDiv) {
        try {
            const query = new URLSearchParams({
                siteId: CONFIG.siteId,
                visitorId: CONFIG.visitorId
            });
            const response = await fetch(`${CONFIG.apiUrl}/api/threads/existing?${query.toString()}`);
            if (!response.ok) return;

            const data = await response.json();
            if (!data.thread) return;

            CONFIG.threadId = data.thread.id;
            renderMessages(messagesDiv, data.messages || []);
            await connectThreadSocket(messagesDiv, { clearOnPreviousMessages: false });
        } catch (err) {
            console.error('Load existing chat error:', err);
        }
    }

    async function connectThreadSocket(messagesDiv, options = {}) {
        const { clearOnPreviousMessages = true } = options;

        await loadSocketIO();

        return new Promise((resolve, reject) => {
            if (CONFIG.socket) {
                CONFIG.socket.disconnect();
            }

            CONFIG.socket = io(CONFIG.apiUrl);
            let previousMessagesLoaded = false;

            CONFIG.socket.on('connect', () => {
                console.log('✅ Socket connected');
                CONFIG.socket.emit('join-thread', CONFIG.threadId, CONFIG.visitorId);
            });
            
            CONFIG.socket.on('previous-messages', (messages) => {
                if (clearOnPreviousMessages) {
                    renderMessages(messagesDiv, messages);
                }
                hideSupportTyping();
                previousMessagesLoaded = true;
                resolve();
            });
            
            // Handle new messages with duplicate prevention
            CONFIG.socket.on('new-message', (msg) => {
                const uniqueKey = `${msg.id}_${msg.sender}_${msg.message.substring(0, 20)}`;
                
                if (displayedMessages.has(uniqueKey)) {
                    console.log('Duplicate prevented:', uniqueKey);
                    return;
                }
                
                displayedMessages.add(uniqueKey);
                hideSupportTyping();
                addMessageToUI(messagesDiv, msg);
            });

            CONFIG.socket.on('visitor-typing', (data) => {
                showSupportTyping(messagesDiv, data.isTyping);
            });
            
            CONFIG.socket.on('connect_error', (err) => {
                console.error('Socket error:', err);
                messagesDiv.innerHTML = '<div style="text-align:center;color:red;padding:20px;">Cannot connect to server.</div>';
                reject(err);
            });

            setTimeout(() => {
                if (!previousMessagesLoaded) resolve();
            }, 3000);
        });
    }

    function renderMessages(messagesDiv, messages) {
        messagesDiv.innerHTML = '';
        displayedMessages.clear();

        if (!messages.length) {
            showGreetingMessage(messagesDiv, widgetSettings?.greetingMessage || 'Hello! How can we help you?', currentSupportAvailability);
            return;
        }

        messages.forEach(msg => {
            const uniqueKey = `${msg.id}_${msg.sender}_${msg.message.substring(0, 20)}`;
            if (!displayedMessages.has(uniqueKey)) {
                displayedMessages.add(uniqueKey);
                addMessageToUI(messagesDiv, msg);
            }
        });
    }

    function showSupportTyping(messagesDiv, isTyping) {
        const existingIndicator = document.getElementById('support-typing-indicator');

        if (!isTyping) {
            clearTimeout(supportTypingTimeout);
            supportTypingTimeout = setTimeout(() => {
                hideSupportTyping();
            }, 4000);
            return;
        }

        if (!existingIndicator) {
            addSupportTypingIndicator(messagesDiv);
        }

        clearTimeout(supportTypingTimeout);
        supportTypingTimeout = setTimeout(() => {
            hideSupportTyping();
        }, 5000);
    }

    function addSupportTypingIndicator(messagesDiv) {
        const existingIndicator = document.getElementById('support-typing-indicator');
        if (!existingIndicator) {
            const typingDiv = document.createElement('div');
            typingDiv.id = 'support-typing-indicator';
            typingDiv.style.display = 'flex';
            typingDiv.style.justifyContent = 'flex-start';
            typingDiv.style.marginBottom = '12px';
            typingDiv.innerHTML = `
                <div style="padding:10px 14px; border-radius:12px; background:#e5e7eb; color:#1f2937; display:flex; align-items:center; gap:6px;">
                    <span style="font-size:12px; color:#4b5563;">Typing</span>
                    <span style="display:flex; gap:3px;">
                        <span class="chat-typing-dot"></span>
                        <span class="chat-typing-dot"></span>
                        <span class="chat-typing-dot"></span>
                    </span>
                </div>
            `;
            messagesDiv.appendChild(typingDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    function hideSupportTyping() {
        clearTimeout(supportTypingTimeout);
        const existingIndicator = document.getElementById('support-typing-indicator');
        if (existingIndicator) existingIndicator.remove();
    }

    function injectWidgetStyles() {
        if (document.getElementById('chat-widget-styles')) return;

        const style = document.createElement('style');
        style.id = 'chat-widget-styles';
        style.textContent = `
            @keyframes chatTypingBounce {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
                40% { transform: translateY(-4px); opacity: 1; }
            }

            .chat-typing-dot {
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: #6b7280;
                display: inline-block;
                animation: chatTypingBounce 1.4s infinite ease-in-out;
            }

            .chat-typing-dot:nth-child(2) {
                animation-delay: 0.15s;
            }

            .chat-typing-dot:nth-child(3) {
                animation-delay: 0.3s;
            }
        `;
        document.head.appendChild(style);
    }
    
    function loadSocketIO() {
        return new Promise((resolve) => {
            if (typeof io !== 'undefined') {
                resolve(true);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }
    
    function addMessageToUI(messagesDiv, msg) {
        const isVisitor = msg.sender === 'visitor';
        const div = document.createElement('div');
        div.style.marginBottom = '12px';
        div.style.display = 'flex';
        div.style.justifyContent = isVisitor ? 'flex-end' : 'flex-start';
        
        div.innerHTML = `
            <div style="max-width:75%; padding:10px 14px; border-radius:12px; background:${isVisitor ? '#3B82F6' : '#e5e7eb'}; color:${isVisitor ? 'white' : '#1f2937'}; word-wrap:break-word;">
                ${escapeHtml(msg.message)}
                <div style="font-size:10px; margin-top:4px; opacity:0.7;">
                    ${new Date(msg.createdAt).toLocaleTimeString()}
                </div>
            </div>
        `;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    loadConfig();
})();
