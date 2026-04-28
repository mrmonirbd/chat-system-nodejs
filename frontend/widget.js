(function() {
    // Configuration
    const CONFIG = {
        apiUrl: 'http://localhost:3000',  // আপনার লোকাল সার্ভার
        apiKey: null,
        siteId: null,
        socket: null,
        threadId: null,
        visitorId: null
    };
    
    // Get API key from script tag
    const scriptTag = document.querySelector('script[data-chat-widget]');
    if (scriptTag) {
        CONFIG.apiKey = scriptTag.getAttribute('data-api-key');
    }
    
    if (!CONFIG.apiKey) {
        console.error('❌ Chat widget: Missing API key');
        return;
    }
    
    console.log('✅ Chat widget initializing with API key:', CONFIG.apiKey);
    
    // Generate or get visitor ID
    function getVisitorId() {
        let visitorId = localStorage.getItem('chat_visitor_id');
        if (!visitorId) {
            visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_visitor_id', visitorId);
        }
        return visitorId;
    }
    
    CONFIG.visitorId = getVisitorId();
    
    // Load site configuration
    async function loadConfig() {
        try {
            const url = `${CONFIG.apiUrl}/api/sites/config/${CONFIG.apiKey}`;
            console.log('📡 Fetching config from:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ Config loaded:', data);
            CONFIG.siteId = data.siteId;
            initWidget(data.settings);
        } catch (err) {
            console.error('❌ Failed to load chat config:', err);
            // Show error message in widget
            showErrorMessage();
        }
    }
    
    function showErrorMessage() {
        const errorHTML = `
            <div id="chat-widget-container" style="position:fixed; bottom:20px; right:20px; z-index:99999;">
                <div style="background:#ef4444; color:white; padding:10px 15px; border-radius:10px; font-size:12px; font-family:system-ui;">
                    ⚠️ Chat service unavailable. Please try again later.
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', errorHTML);
    }
    
    // Initialize chat widget
    function initWidget(settings) {
        console.log('🎨 Initializing widget with settings:', settings);
        
        // Create widget HTML
        const widgetHTML = `
            <div id="chat-widget-container" style="position:fixed; bottom:20px; right:20px; z-index:99999; font-family:system-ui, -apple-system, sans-serif;">
                <div id="chat-toggle" style="background:#3B82F6; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:transform 0.2s;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <div id="chat-window" style="display:none; position:absolute; bottom:80px; right:0; width:380px; height:520px; background:white; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.2); flex-direction:column; overflow:hidden;">
                    <div style="background:#3B82F6; padding:16px; color:white; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:600;">💬 Customer Support</span>
                        <span id="chat-close" style="cursor:pointer; font-size:24px;">&times;</span>
                    </div>
                    <div id="chat-messages" style="flex:1; overflow-y:auto; padding:16px; background:#f9fafb;"></div>
                    <div style="padding:16px; background:white; border-top:1px solid #e5e7eb; display:flex; gap:10px;">
                        <input type="text" id="chat-input" placeholder="Type your message..." style="flex:1; padding:10px; border:1px solid #e5e7eb; border-radius:8px; outline:none; font-size:14px;">
                        <button id="chat-send" style="background:#3B82F6; border:none; color:white; padding:10px 18px; border-radius:8px; cursor:pointer; font-weight:500;">Send</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        // DOM elements
        const toggle = document.getElementById('chat-toggle');
        const windowDiv = document.getElementById('chat-window');
        const close = document.getElementById('chat-close');
        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');
        const messagesDiv = document.getElementById('chat-messages');
        
        let isConnected = false;
        
        // Toggle chat window
        toggle.onclick = () => {
            if (windowDiv.style.display === 'none' || !windowDiv.style.display) {
                windowDiv.style.display = 'flex';
                if (!isConnected) connectToChat();
            } else {
                windowDiv.style.display = 'none';
            }
        };
        
        close.onclick = () => {
            windowDiv.style.display = 'none';
        };
        
        // Connect to chat server
        async function connectToChat() {
            try {
                console.log('🔌 Connecting to chat server...');
                
                // Create or get thread
                const response = await fetch(`${CONFIG.apiUrl}/api/threads/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        siteId: CONFIG.siteId, 
                        visitorId: CONFIG.visitorId,
                        visitorName: 'Guest'
                    })
                });
                
                if (!response.ok) throw new Error('Failed to create thread');
                
                const data = await response.json();
                CONFIG.threadId = data.threadId;
                console.log('✅ Thread created:', CONFIG.threadId);
                
                // Load Socket.IO
                if (typeof io === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
                    script.onload = () => {
                        setupSocket();
                    };
                    document.head.appendChild(script);
                } else {
                    setupSocket();
                }
            } catch (err) {
                console.error('❌ Connection error:', err);
                messagesDiv.innerHTML = '<div style="text-align:center;color:#ef4444;">Failed to connect. Please refresh.</div>';
            }
        }
        
        function setupSocket() {
            CONFIG.socket = io(CONFIG.apiUrl, {
                transports: ['websocket', 'polling'],
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                }
            });
            
            CONFIG.socket.on('connect', () => {
                console.log('✅ Socket connected');
                CONFIG.socket.emit('join-thread', CONFIG.threadId, CONFIG.visitorId);
            });
            
            CONFIG.socket.on('new-message', (message) => {
                console.log('📨 New message:', message);
                addMessage(message);
            });
            
            CONFIG.socket.on('previous-messages', (messages) => {
                console.log('📜 Loading previous messages:', messages.length);
                messagesDiv.innerHTML = '';
                messages.forEach(msg => addMessage(msg));
            });
            
            CONFIG.socket.on('connect_error', (err) => {
                console.error('Socket connection error:', err);
            });
            
            isConnected = true;
        }
        
        // Add message to chat
        function addMessage(msg) {
            const div = document.createElement('div');
            const isVisitor = msg.sender === 'visitor';
            div.style.marginBottom = '12px';
            div.style.display = 'flex';
            div.style.justifyContent = isVisitor ? 'flex-end' : 'flex-start';
            div.innerHTML = `
                <div style="max-width:75%; padding:10px 14px; border-radius:12px; background:${isVisitor ? '#3B82F6' : '#e5e7eb'}; color:${isVisitor ? 'white' : '#1f2937'}; word-wrap:break-word;">
                    ${escapeHtml(msg.message)}
                    <div style="font-size:10px; margin-top:4px; opacity:0.7;">${new Date(msg.createdAt).toLocaleTimeString()}</div>
                </div>
            `;
            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Send message
        send.onclick = () => {
            if (!input.value.trim() || !CONFIG.socket) return;
            CONFIG.socket.emit('visitor-message', { 
                threadId: CONFIG.threadId, 
                message: input.value, 
                visitorId: CONFIG.visitorId,
                visitorName: 'Guest'
            });
            input.value = '';
        };
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter') send.onclick();
        };
    }
    
    // Start the widget
    loadConfig();
})();