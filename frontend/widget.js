(function() {
  // Configuration
  const CONFIG = {
    apiUrl: 'https://your-server.com', // CHANGE THIS
    apiKey: null, // Will be set by site admin
    siteId: null
  };
  
  // Load site configuration
  async function loadConfig() {
    const scriptTag = document.querySelector('script[data-chat-widget]');
    CONFIG.apiKey = scriptTag?.getAttribute('data-api-key');
    
    if (!CONFIG.apiKey) {
      console.error('Chat widget: Missing API key');
      return;
    }
    
    // Fetch site config
    const response = await fetch(`${CONFIG.apiUrl}/api/sites/config/${CONFIG.apiKey}`);
    const data = await response.json();
    CONFIG.siteId = data.siteId;
    
    initWidget(data.settings);
  }
  
  // Generate or get visitor ID
  function getVisitorId() {
    let visitorId = localStorage.getItem('chat_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('chat_visitor_id', visitorId);
    }
    return visitorId;
  }
  
  // Create chat UI
  function initWidget(settings) {
    // Inject CSS
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${CONFIG.apiUrl}/widget.css`;
    document.head.appendChild(css);
    
    // Create widget HTML
    const widgetHTML = `
      <div id="chat-widget" style="position:fixed; ${settings.widgetPosition === 'bottom-right' ? 'bottom:20px; right:20px;' : 'bottom:20px; left:20px;'} z-index:9999;">
        <div id="chat-toggle" style="background:${settings.widgetColor}; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.2);">
          💬
        </div>
        <div id="chat-window" style="display:none; position:absolute; bottom:80px; ${settings.widgetPosition === 'bottom-right' ? 'right:0;' : 'left:0;'} width:350px; height:500px; background:white; border-radius:10px; box-shadow:0 5px 20px rgba(0,0,0,0.2); flex-direction:column; overflow:hidden;">
          <div style="background:${settings.widgetColor}; padding:15px; color:white; display:flex; justify-content:space-between;">
            <span>Chat Support</span>
            <span id="chat-close" style="cursor:pointer;">✕</span>
          </div>
          <div id="chat-messages" style="flex:1; overflow-y:auto; padding:15px;"></div>
          <div style="padding:15px; border-top:1px solid #eee; display:flex;">
            <input type="text" id="chat-input" placeholder="Type a message..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:5px;">
            <button id="chat-send" style="margin-left:10px; background:${settings.widgetColor}; border:none; color:white; padding:8px 15px; border-radius:5px; cursor:pointer;">Send</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
    
    // Setup event listeners
    const toggle = document.getElementById('chat-toggle');
    const window = document.getElementById('chat-window');
    const close = document.getElementById('chat-close');
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const messagesDiv = document.getElementById('chat-messages');
    
    let socket = null;
    let threadId = null;
    let visitorId = getVisitorId();
    
    toggle.onclick = () => {
      if (window.style.display === 'none') {
        window.style.display = 'flex';
        if (!socket) connectToChat();
      } else {
        window.style.display = 'none';
      }
    };
    
    close.onclick = () => {
      window.style.display = 'none';
    };
    
    async function connectToChat() {
      // Create or get thread
      const response = await fetch(`${CONFIG.apiUrl}/api/threads/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: CONFIG.siteId,
          visitorId: visitorId
        })
      });
      const data = await response.json();
      threadId = data.threadId;
      
      // Connect socket
      socket = io(CONFIG.apiUrl);
      socket.emit('join-thread', threadId, visitorId);
      
      socket.on('new-message', (message) => {
        addMessage(message);
      });
      
      socket.on('previous-messages', (messages) => {
        messagesDiv.innerHTML = '';
        messages.forEach(msg => addMessage(msg));
      });
    }
    
    function addMessage(msg) {
      const div = document.createElement('div');
      div.style.marginBottom = '10px';
      div.style.textAlign = msg.sender === 'visitor' ? 'right' : 'left';
      div.innerHTML = `
        <div style="display:inline-block; background:${msg.sender === 'visitor' ? settings.widgetColor : '#f1f1f1'}; color:${msg.sender === 'visitor' ? 'white' : 'black'}; padding:8px 12px; border-radius:10px; max-width:80%;">
          ${msg.message}
        </div>
      `;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    send.onclick = () => {
      if (!input.value.trim()) return;
      socket.emit('visitor-message', {
        threadId,
        message: input.value,
        visitorId,
        visitorName: 'Guest'
      });
      input.value = '';
    };
    
    input.onkeypress = (e) => {
      if (e.key === 'Enter') send.onclick();
    };
  }
  
  loadConfig();
})();