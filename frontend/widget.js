(function() {
    const CONFIG = {
        apiUrl: 'http://localhost:3000',
        apiKey: null,
        siteId: null,
        socket: null,
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
    
    console.log('✅ Chat widget v4.0 initializing');
    
    // Track message IDs to prevent duplicates
    let receivedMessageIds = new Set();
    let pendingMessage = null;
    
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
            console.log('✅ Config loaded, siteId:', CONFIG.siteId);
            initWidget(data.settings);
        } catch (err) {
            console.error('❌ Config error:', err);
        }
    }
    
    function addTypingIndicator(messagesDiv) {
        if (document.getElementById('typing-indicator')) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'typing-indicator-container';
        typingDiv.style.cssText = 'margin: 10px 0; display: none; justify-content: flex-start;';
        typingDiv.innerHTML = `
            <div class="typing-bubble" style="background: #e5e7eb; padding: 10px 15px; border-radius: 18px; border-bottom-left-radius: 4px; display: flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; display: inline-block; animation: typingBounce 1.4s infinite ease-in-out;"></span>
                <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; display: inline-block; animation: typingBounce 1.4s infinite ease-in-out; animation-delay: -0.32s;"></span>
                <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; display: inline-block; animation: typingBounce 1.4s infinite ease-in-out; animation-delay: -0.16s;"></span>
                <span class="typing-text" style="font-size: 12px; color: #6b7280; margin-left: 8px;">Support is typing...</span>
            </div>
        `;
        
        if (!document.querySelector('#typing-animation-style')) {
            const style = document.createElement('style');
            style.id = 'typing-animation-style';
            style.textContent = `
                @keyframes typingBounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-10px); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        messagesDiv.appendChild(typingDiv);
    }
    
    function showTypingIndicator(show, message = 'Support is typing...') {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            if (show) {
                indicator.style.display = 'flex';
                const textSpan = indicator.querySelector('.typing-text');
                if (textSpan) textSpan.textContent = message;
                clearTimeout(window.typingTimeout);
                window.typingTimeout = setTimeout(() => {
                    if (indicator) indicator.style.display = 'none';
                }, 4000);
            } else {
                indicator.style.display = 'none';
            }
        }
    }
    
    function initWidget(settings) {
        const widgetHTML = `
            <div id="chat-widget-container" style="position:fixed; bottom:20px; right:20px; z-index:99999; font-family:system-ui, -apple-system, sans-serif;">
                <div id="chat-toggle" style="background:#3B82F6; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <div id="chat-window" style="display:none; position:absolute; bottom:80px; right:0; width:380px; height:520px; background:white; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.2); flex-direction:column; overflow:hidden;">
                    <div style="background:#3B82F6; padding:16px; color:white; display:flex; justify-content:space-between;">
                        <span>💬 Customer Support</span>
                        <span id="chat-close" style="cursor:pointer; font-size:24px;">&times;</span>
                    </div>
                    <div id="chat-messages" style="flex:1; overflow-y:auto; padding:16px; background:#f9fafb;"></div>
                    <div style="padding:16px; background:white; border-top:1px solid #e5e7eb; display:flex; gap:10px;">
                        <input type="text" id="chat-input" placeholder="Type your message..." style="flex:1; padding:10px; border:1px solid #e5e7eb; border-radius:8px; outline:none;">
                        <button id="chat-send" style="background:#3B82F6; border:none; color:white; padding:10px 18px; border-radius:8px; cursor:pointer;">Send</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        const toggle = document.getElementById('chat-toggle');
        const windowDiv = document.getElementById('chat-window');
        const close = document.getElementById('chat-close');
        const messagesDiv = document.getElementById('chat-messages');
        
        let isConnected = false;
        
        addTypingIndicator(messagesDiv);
        
        toggle.onclick = () => {
            if (windowDiv.style.display === 'none' || windowDiv.style.display === '') {
                windowDiv.style.display = 'flex';
                if (!isConnected) connectToChat(messagesDiv);
            } else {
                windowDiv.style.display = 'none';
            }
        };
        
        close.onclick = () => {
            windowDiv.style.display = 'none';
        };
    }
    
    async function connectToChat(messagesDiv) {
        try {
            messagesDiv.innerHTML = '<div style="text-align:center;padding:20px;">Connecting...</div>';
            addTypingIndicator(messagesDiv);
            
            const response = await fetch(`${CONFIG.apiUrl}/api/threads/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    siteId: CONFIG.siteId, 
                    visitorId: CONFIG.visitorId,
                    visitorName: 'Guest'
                })
            });
            
            const data = await response.json();
            CONFIG.threadId = data.threadId;
            console.log('✅ Thread:', CONFIG.threadId);
            
            await loadSocketIO();
            
            CONFIG.socket = io(CONFIG.apiUrl);
            
            CONFIG.socket.on('connect', () => {
                console.log('✅ Socket connected');
                CONFIG.socket.emit('join-thread', CONFIG.threadId, CONFIG.visitorId);
                messagesDiv.innerHTML = '';
                addTypingIndicator(messagesDiv);
                // Clear message ID set on reconnect
                receivedMessageIds.clear();
            });
            
            CONFIG.socket.on('previous-messages', (messages) => {
                messagesDiv.innerHTML = '';
                receivedMessageIds.clear();
                messages.forEach(msg => {
                    receivedMessageIds.add(msg.id);
                    addMessageToUI(messagesDiv, msg, false);
                });
                addTypingIndicator(messagesDiv);
            });
            
            // Handle new messages - check for duplicates
            CONFIG.socket.on('new-message', (msg) => {
                // Skip if we already have this message
                if (receivedMessageIds.has(msg.id)) {
                    console.log('Duplicate message ignored:', msg.id);
                    return;
                }
                receivedMessageIds.add(msg.id);
                showTypingIndicator(false);
                addMessageToUI(messagesDiv, msg, false);
            });
            
            CONFIG.socket.on('visitor-typing', (data) => {
                if (data && data.isTyping) {
                    showTypingIndicator(true, data.message || 'Support is typing...');
                } else {
                    showTypingIndicator(false);
                }
            });
            
            CONFIG.socket.on('connect_error', (err) => {
                console.error('Socket error:', err);
                messagesDiv.innerHTML = '<div style="text-align:center;color:red;padding:20px;">Cannot connect to server.</div>';
            });
            
            const input = document.getElementById('chat-input');
            const send = document.getElementById('chat-send');
            let typingTimeout;
            
            input.addEventListener('input', () => {
                if (CONFIG.socket && CONFIG.threadId) {
                    CONFIG.socket.emit('visitor-typing', {
                        threadId: CONFIG.threadId,
                        isTyping: true
                    });
                    
                    clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(() => {
                        if (CONFIG.socket) {
                            CONFIG.socket.emit('visitor-typing', {
                                threadId: CONFIG.threadId,
                                isTyping: false
                            });
                        }
                    }, 1000);
                }
            });
            
            send.onclick = () => {
                if (input.value.trim() && CONFIG.socket) {
                    const messageText = input.value;
                    const tempId = 'temp_' + Date.now();
                    
                    // Add to UI immediately (optimistic)
                    const tempMessage = {
                        id: tempId,
                        threadId: CONFIG.threadId,
                        sender: 'visitor',
                        senderId: CONFIG.visitorId,
                        message: messageText,
                        createdAt: new Date().toISOString()
                    };
                    addMessageToUI(messagesDiv, tempMessage, true);
                    
                    // Send to server
                    CONFIG.socket.emit('visitor-message', {
                        threadId: CONFIG.threadId,
                        message: messageText,
                        visitorId: CONFIG.visitorId
                    });
                    
                    input.value = '';
                }
            };
            
            input.onkeypress = (e) => {
                if (e.key === 'Enter') send.onclick();
            };
            
        } catch (err) {
            console.error('Connection error:', err);
            messagesDiv.innerHTML = `<div style="text-align:center;color:red;padding:20px;">Error: ${err.message}</div>`;
        }
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
    
    function addMessageToUI(messagesDiv, msg, isOptimistic = false) {
        const isVisitor = msg.sender === 'visitor';
        const div = document.createElement('div');
        div.id = `msg-${msg.id}`;
        div.style.marginBottom = '12px';
        div.style.display = 'flex';
        div.style.justifyContent = isVisitor ? 'flex-end' : 'flex-start';
        
        // Add optimistic class for visual feedback
        const optimisticClass = isOptimistic ? 'opacity-70' : '';
        
        div.innerHTML = `
            <div class="message-bubble ${optimisticClass}" style="max-width:75%; padding:10px 14px; border-radius:12px; background:${isVisitor ? '#3B82F6' : '#e5e7eb'}; color:${isVisitor ? 'white' : '#1f2937'}; word-wrap:break-word;">
                ${escapeHtml(msg.message)}
                <div style="font-size:10px; margin-top:4px; opacity:0.7;">
                    ${isOptimistic ? 'Sending...' : new Date(msg.createdAt).toLocaleTimeString()}
                </div>
            </div>
        `;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // If optimistic, update with real message when received
        if (isOptimistic) {
            setTimeout(() => {
                const optimisticMsg = document.getElementById(`msg-${msg.id}`);
                if (optimisticMsg) {
                    optimisticMsg.style.opacity = '1';
                    const timeSpan = optimisticMsg.querySelector('.message-bubble div:last-child');
                    if (timeSpan) {
                        timeSpan.innerHTML = new Date().toLocaleTimeString();
                    }
                }
            }, 500);
        }
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    loadConfig();
})();