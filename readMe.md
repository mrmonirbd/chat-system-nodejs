# Chat System

A comprehensive multi-tenant chat platform designed to enable seamless communication between website visitors and support teams.

## Overview

Chat System is a full-stack web application that provides real-time customer support through embeddable chat widgets. It features a centralized admin dashboard for managing multiple sites, support staff, and conversations.

## Features

- **Multi-Tenant Architecture**: Support multiple websites from a single platform
- **Real-Time Messaging**: WebSocket-based instant messaging capability
- **Admin Dashboard**: Comprehensive management interface for sites and support staff
- **Chat Widget**: Embeddable widget for website integration
- **Thread Management**: Organize conversations by topic
- **User Authentication**: Secure login system for admins and support staff
- **API-Driven**: RESTful API with token-based authentication

## Project Structure

```
chat-system/
├── backend/                 # Node.js Express server
│   ├── models/             # Database models (User, Site, Thread, Message)
│   ├── routes/             # API endpoints
│   ├── socket/             # WebSocket configuration
│   ├── server.js           # Main server file
│   └── package.json        # Dependencies
├── frontend/               # Chat widget
│   ├── widget.js          # Widget functionality
│   ├── widget.css         # Widget styling
│   └── index.html         # Widget markup
├── admin-panel/            # Admin dashboard
│   ├── index.html         # Login page
│   ├── dashboard.html     # Main dashboard
│   ├── support-panel.html # Support interface
│   └── js/
│       └── admin.js       # Dashboard logic
└── readMe.md              # This file
```

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB (or configured database)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chat-system
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the backend directory:
   ```
   PORT=3000
   MONGODB_URI=your_database_url
   JWT_SECRET=your_secret_key
   NODE_ENV=development
   ```

4. **Start the server**
   ```bash
   npm start
   ```

## Usage

### Admin Dashboard

1. Navigate to the admin panel
2. Authenticate with admin credentials
3. Create new sites
4. Add support staff members
5. Monitor active conversations
### Embedding the Widget

Add this script tag to your website:

```html
<script 
  src="https://your-server.com/widget.js" 
  data-chat-widget 
  data-api-key="YOUR_SITE_API_KEY">
</script>
```

## API Documentation

### Authentication

**POST** `/api/auth/login`
- Authenticate and receive JWT token

### Sites Management

**POST** `/api/sites/create`
- Create a new site
- Requires: Bearer token

**GET** `/api/sites`
- Retrieve all sites for authenticated admin

**POST** `/api/sites/add-support`
- Add a support staff member to a site

### Messages

**GET** `/api/messages`
- Retrieve messages for a thread

**POST** `/api/messages/send`
- Send a new message

### Threads

**GET** `/api/threads`
- Retrieve conversation threads

**POST** `/api/threads/create`
- Create a new conversation thread

## WebSocket Events

The system uses Socket.IO for real-time communication:

- `new-message`: New message received
- `user-joined`: User joined the chat
- `user-left`: User left the chat
- `typing`: User is typing indicator

## Technology Stack

- **Backend**: Node.js, Express.js
- **Real-Time**: Socket.IO
- **Database**: MongoDB
- **Authentication**: JWT
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Contributing

1. Create a feature branch
2. Commit your changes
3. Push to the branch
4. Submit a pull request

## License

This project is licensed under the MIT License.



<!-- this script will be need site frontend

<script 
  src="https://your-server.com/widget.js" 
  data-chat-widget 
  data-api-key="YOUR_SITE_API_KEY">
</script> -->


<!-- Admin Dashboard  -->
<!-- <!DOCTYPE html>
<html>
<head>
    <title>Chat System Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-8">
        <h1 class="text-3xl font-bold mb-8">Admin Dashboard</h1>
        
        <div class="grid grid-cols-2 gap-6">
            <!-- Create Site Card -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Create New Site</h2>
                <input type="text" id="siteName" placeholder="Site Name" class="w-full p-2 border rounded mb-3">
                <input type="text" id="siteDomain" placeholder="Domain (e.g., example.com)" class="w-full p-2 border rounded mb-3">
                <button onclick="createSite()" class="bg-blue-500 text-white px-4 py-2 rounded">Create Site</button>
            </div>
            
            <!-- Add Support User Card -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Add Support Person</h2>
                <select id="siteSelect" class="w-full p-2 border rounded mb-3"></select>
                <input type="text" id="supportName" placeholder="Full Name" class="w-full p-2 border rounded mb-3">
                <input type="email" id="supportEmail" placeholder="Email" class="w-full p-2 border rounded mb-3">
                <input type="password" id="supportPassword" placeholder="Password" class="w-full p-2 border rounded mb-3">
                <button onclick="addSupport()" class="bg-green-500 text-white px-4 py-2 rounded">Add Support</button>
            </div>
        </div>
        
        <!-- Sites List -->
        <div class="bg-white rounded-lg shadow p-6 mt-6">
            <h2 class="text-xl font-semibold mb-4">Your Sites</h2>
            <div id="sitesList"></div>
        </div>
    </div>
    
    <script>
        const API_URL = 'http://localhost:3000/api';
        let token = localStorage.getItem('token');
        
        if (!token) {
            // Simple login (in production, make a proper login page)
            const email = prompt('Admin Email:');
            const password = prompt('Password:');
            fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            }).then(res => res.json()).then(data => {
                localStorage.setItem('token', data.token);
                token = data.token;
                loadSites();
            });
        } else {
            loadSites();
        }
        
        async function createSite() {
            const name = document.getElementById('siteName').value;
            const domain = document.getElementById('siteDomain').value;
            
            const res = await fetch(`${API_URL}/sites/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, domain })
            });
            const data = await res.json();
            alert(`Site created! API Key: ${data.apiKey}\nShare this with the website owner.`);
            loadSites();
        }
        
        async function addSupport() {
            const siteId = document.getElementById('siteSelect').value;
            const name = document.getElementById('supportName').value;
            const email = document.getElementById('supportEmail').value;
            const password = document.getElementById('supportPassword').value;
            
            await fetch(`${API_URL}/sites/add-support`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ siteId, name, email, password })
            });
            alert('Support user added!');
        }
        
        async function loadSites() {
            const res = await fetch(`${API_URL}/sites/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const sites = await res.json();
            
            const siteSelect = document.getElementById('siteSelect');
            const sitesList = document.getElementById('sitesList');
            
            siteSelect.innerHTML = '<option value="">Select Site</option>';
            sitesList.innerHTML = '';
            
            sites.forEach(site => {
                siteSelect.innerHTML += `<option value="${site._id}">${site.name}</option>`;
                sitesList.innerHTML += `
                    <div class="border-b py-3">
                        <p><strong>${site.name}</strong> - ${site.domain}</p>
                        <p class="text-sm text-gray-600">API Key: <code>${site.apiKey}</code></p>
                        <p class="text-sm">JS Snippet: <code>&lt;script src="${API_URL.replace('/api', '')}/widget.js" data-chat-widget data-api-key="${site.apiKey}"&gt;&lt;/script&gt;</code></p>
                    </div>
                `;
            });
        }
    </script>
</body>
</html> -->


start mongo db

docker run -d -p 27017:27017 --name mongodb mongo:latest

start backend 
----------------

cd backend
npm install
npm run dev



set environmental variable
-----------------------------

PORT=3000
MONGODB_URI=mongodb://localhost:27017/chatsystem
JWT_SECRET=your_super_secret_key_change_this


Create demo use in mongo
-------------------------

// Run in MongoDB shell or Compass
db.users.insertOne({
  name: "Admin",
  email: "admin@example.com",
  password: "$2a$10$...", // Use bcrypt to hash "admin123"
  role: "admin",
  isActive: true
})


admin panel eill be like this
-------------------------------

http://localhost:3000/admin






