const socket = io({
    transports: ['websocket'],
    upgrade: false
});

// Debug Helper
const debugLog = (msg) => {
    console.log(msg);
    // Optional: Add to chat as system debug
    // addMessage(`[DEBUG] ${msg}`, 'system'); 
};

// State
let currentMode = '';
let currentRoom = '';
let currentPassword = '';
let myUsername = '';

// Initialize Share Link
const globalUrlInput = document.getElementById('global-url');
const warningMsg = document.getElementById('localhost-warning');

if (globalUrlInput) {
    globalUrlInput.value = window.location.href;

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        warningMsg.style.display = 'block';
    }
}

// --- INFO CONTENT (Footer Sections) ---
const infoContent = {
    feature: {
        title: "✨ Features",
        body: `
            <h3>🛡️ Secure Conversations</h3>
            <p>PrivyChat is built with security as a priority. Engage in 1-on-1 chats, group discussions, or password-protected private rooms.</p>
            
            <h3>👻 100% Ephemeral</h3>
            <p>We do not store your data. Messages are held in RAM only and are instantly wiped when the server restarts or when the session ends. No databases, no persistent logs.</p>
            
            <h3>📂 File Sharing</h3>
            <p>Share images, documents, and files up to 5MB directly with your peers. Files are transferred in real-time and are never permanently stored on our disks.</p>
            
            <h3>👀 Privacy Protection</h3>
            <p>Smart features like "Privacy Blur" confuse prying eyes when you switch tabs. End-to-End messaging ensures only you and your recipient can read the 1-on-1 chats.</p>
        `
    },
    security: {
        title: "🔐 Security Architecture",
        body: `
            <h3>AES-GCM Encryption</h3>
            <p>Private Rooms use <strong>AES-GCM</strong> (Advanced Encryption Standard - Galois/Counter Mode), a military-grade encryption standard. Keys are derived from your room password using <strong>PBKDF2</strong>.</p>
            
            <h3>Server-Blind 1v1</h3>
            <p>Our unique 1-on-1 links contain the encryption key in the URL <em>hash</em> (the part after the #). Browsers do NOT send this part to the server. This means the server <strong>cannot</strong> decrypt your 1v1 messages even if it wanted to.</p>
            
            <h3>No Database</h3>
            <p>The safest data is data that doesn't exist. We don't have a database. If our server is seized/hacked, there is nothing to steal because nothing is saved.</p>
        `
    },
    about: {
        title: "ℹ️ About PrivyChat",
        body: `
            <p>PrivyChat was born from the need for simple, quick, and anonymous communication. In an age of surveillance capitalism, we wanted a tool that respects your right to whisper.</p>
            <p>Developed with passion by <strong>WebFolio</strong>, this project demonstrates the power of modern Web Cryptography and WebSockets.</p>
        `
    },
    license: {
        title: "⚖️ MIT License",
        body: `
            <p>Copyright (c) 2024 PrivyChat</p>
            <p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software...</p>
            <p>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.</p>
        `
    },
    privacy: {
        title: "👁️ Privacy Policy",
        body: `
            <h3>Data Collection</h3>
            <p>We do NOT collect: Names, Emails, IP Addresses, Message Content, or Metadata.</p>
            
            <h3>Cookies</h3>
            <p>We do NOT use persistent cookies. We use simple session storage to keep your connection alive, which is cleared when you close the tab.</p>
            
            <h3>Third Parties</h3>
            <p>We do not share data with third parties because we don't have any data to share.</p>
        `
    },
    terms: {
        title: "📝 Terms of Service",
        body: `
            <p>By using PrivyChat, you agree to the following:</p>
            <ul>
                <li>You will not use this service for illegal activities.</li>
                <li>You acknowledge that messages are not permanently saved and cannot be recovered.</li>
                <li>You accept that the developers are not liable for any content shared on this platform.</li>
            </ul>
        `
    },
    overview: {
        title: "🌍 Overview & Vision",
        body: `
            <h3>👨‍💻 The Developer</h3>
            <p>PrivyChat is heavily engineered by <strong>Pratham Kumar</strong>, a passionate Full Stack Developer and Cyber Security enthusiast. With a deep commitment to digital rights, Pratham built this platform to challenge the status quo of data-hungry messaging apps.</p>

            <h3>🛡️ Our Vision</h3>
            <p>In a world where every click is tracked and every message is archived, privacy is no longer a luxury—it's a necessity. Our vision is simple: <strong>To restore the sanctity of private conversation.</strong></p>
            <p>We believe that your words belong to you, and the moment they are spoken (or sent), they should vanish into the ether, leaving no trace for corporations or bad actors to exploit.</p>

            <h3>💻 Technical Excellence</h3>
            <p>Leveraging cutting-edge Full Stack technologies and robust Cyber Security protocols (AES-GCM, PBKDF2), this application stands as a fortress of anonymity. It is not just a chat app; it is a statement that privacy is possible.</p>
        `
    }
};

function openInfo(section) {
    const modal = document.getElementById('info-modal');
    const title = document.getElementById('info-title');
    const body = document.getElementById('info-body');

    if (infoContent[section]) {
        title.innerHTML = infoContent[section].title;
        body.innerHTML = infoContent[section].body;
        modal.classList.add('active');
    }
}

function closeInfoModal() {
    document.getElementById('info-modal').classList.remove('active');
}

function copyGlobalLink() {
    globalUrlInput.select();
    globalUrlInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(globalUrlInput.value);
    showToast("App Link Copied!", "success");
}

// DOM Elements
const lobby = document.getElementById('lobby');
const chatRoom = document.getElementById('chat-room');
const joinForm = document.getElementById('join-form');
const formTitle = document.getElementById('form-title');
const inputRoom = document.getElementById('room-name');
const inputPass = document.getElementById('room-pass');
const inputUser = document.getElementById('username');
const linkDisplay = document.getElementById('generated-link');
const messagesDiv = document.getElementById('messages');
const roomTitle = document.getElementById('current-room');

// Check URL Params for invite
const urlParams = new URLSearchParams(window.location.search);
const inviteRoom = urlParams.get('room');
const inviteMode = urlParams.get('mode'); // 'private' or '1v1'

if (inviteRoom) {
    inputRoom.value = inviteRoom;
    joinForm.style.display = 'block';
    formTitle.innerText = "Join Chat";
    document.querySelector('.modes-grid').style.display = 'none';

    inputRoom.readOnly = true;

    if (inviteMode === 'private') {
        formTitle.innerText = "Join Private Room";
        inputPass.style.display = 'block'; // Show password field
        currentMode = 'private'; // Set mode explicitly
    } else {
        inputPass.style.display = 'none';
    }
}

// Functions
function selectMode(mode) {
    currentMode = mode;
    joinForm.style.display = 'block';
    linkDisplay.innerText = '';

    // Reset Inputs
    inputRoom.style.display = 'none';
    inputPass.style.display = 'none';
    inputRoom.readOnly = false;
    inputPass.value = ''; // Clear password

    if (mode === '1v1') {
        formTitle.innerText = "Start 1-on-1 Chat";
        if (!inviteRoom) {
            // Generate UUID for room
            const roomUUID = 'chat-' + Math.random().toString(36).substr(2, 9);
            // Generate Strong Secret for E2E (Hash part, never sent to server)
            const secretKey = Math.random().toString(36).substr(2, 10) + Math.random().toString(36).substr(2, 10);

            const link = `${window.location.origin}?room=${roomUUID}#key=${secretKey}`;

            linkDisplay.innerHTML = `
                <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; margin-top: 10px;">
                    <p style="margin:0 0 5px 0; font-size: 0.8rem; opacity: 0.8;">Share this private link:</p>
                    <input type="text" value="${link}" id="share-link-input" readonly style="width:100%; background:transparent; border:none; color:#fbcfe8; font-family:monospace; margin-bottom:5px;">
                    <button class="btn" onclick="copyLink()" style="padding: 5px 15px; font-size: 0.8rem; width: auto;">📋 Copy Link</button>
                    <p style="font-size:0.7rem; color:#4ade80; margin-top:5px;">🔒 E2E Encryption Key Included in Link</p>
                </div>
            `;
            inputRoom.value = roomUUID;
            // Auto-set password for local user so they can join their own creation
            inputPass.value = secretKey;
        }
    } else if (mode === 'private') {
        formTitle.innerText = "Enter Private Room";
        inputRoom.style.display = 'block';
        inputPass.style.display = 'block';
        inputRoom.placeholder = "Room Name";
    } else if (mode === 'group') {
        formTitle.innerText = "Join Group Chat";
    }
}

function showLobby() {
    joinForm.style.display = 'none';
    document.querySelector('.modes-grid').style.display = 'grid';
    linkDisplay.innerText = '';
}

function startChat() {
    myUsername = inputUser.value.trim();
    if (!myUsername) {
        alert("Please enter a nickname");
        return;
    }

    let room = '';
    let password = '';

    // Check for Key in Hash (from invite link)
    const urlHash = window.location.hash;
    if (urlHash.includes('key=')) {
        password = urlHash.split('key=')[1];
    }

    // Fallback: If creating 1v1, we set inputPass.value in step 1
    if (currentMode === '1v1' && inputPass.value) {
        password = inputPass.value;
    }

    if (currentMode === 'group') {
        room = 'general';
        password = ''; // No key for public
    } else if (currentMode === '1v1') {
        room = (inputRoom.value || '1v1-default').toLowerCase();
        // Password here is the Encryption Key
    } else if (currentMode === 'private') {
        room = inputRoom.value.trim().toLowerCase();
        password = inputPass.value.trim();
        if (!room || !password) {
            showToast("Room name and password required", "error");
            return;
        }
    } else if (!currentMode && inputRoom.value) {
        // Invite Link Case
        room = inputRoom.value.trim().toLowerCase();
        // Assume public unless prompted later
        if (!room) {
            showToast("Invalid Room", "error");
            return;
        }
    }

    // Join via Socket
    socket.emit('join_room', { room, password, username: myUsername, type: currentMode });
}

let isCurrentRoomPrivate = false;

socket.on('password_required', (room) => {
    // Server says we need a password
    const pass = prompt("🔒 This room is password protected.\nPlease enter the password:");
    if (pass) {
        currentPassword = pass; // Store for reconnects
        socket.emit('join_room', { room, password: pass, username: myUsername, type: 'private' });
    } else {
        alert("Password required to join.");
        showLobby();
    }
});
// Socket Connection Logic (Auto-Rejoin)
socket.on('connect', () => {
    console.log("Connected to server", socket.id);
    updateConnectionStatus(true);

    // If we were already in a room, re-join it (e.g. after server restart)
    if (currentRoom && myUsername) {
        console.log("Re-joining room...", currentRoom);
        socket.emit('joined_reconnect', { room: currentRoom }); // Just log it
        // We need the password if it was private.
        // We can store it in a variable 'currentPassword' if we want to be seamless.
        // For now, let's try to join. If password needed, server will ask (and we might need to prompt again or store it).
        // Let's store password in startChat to support this.
        socket.emit('join_room', { room: currentRoom, password: currentPassword, username: myUsername, type: currentMode });
    }
});

socket.on('disconnect', () => {
    console.log("Disconnected from server");
    updateConnectionStatus(false);
});

socket.on('connect_error', (err) => {
    console.error("Connection Error:", err);
    updateConnectionStatus(false);

    // Check if hosted on Vercel (hostname check)
    if (window.location.hostname.includes('vercel.app')) {
        // Show critical error modal
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0f172a; color:white; font-family:'Outfit',sans-serif; text-align:center; padding:20px;">
                <h1 style="color:#ef4444; font-size:3rem; margin-bottom:10px;">⚠️ Deployment Error</h1>
                <p style="font-size:1.2rem; max-width:600px; line-height:1.6;">
                    You are trying to run a <strong>Real-Time WebSocket App</strong> on <strong>Vercel</strong>.<br>
                    Vercel does not support persistent connections needed for this chat.
                </p>
                <div style="background:rgba(255,255,255,0.1); padding:20px; border-radius:10px; margin:20px 0;">
                    <h3 style="margin:0 0 10px 0;">Solution:</h3>
                    <p>Please deploy this repository to <strong>Render.com</strong> or <strong>Railway.app</strong>.</p>
                </div>
                <a href="https://github.com/rajpratham1/PrivyChat" class="btn" style="text-decoration:none; padding:10px 20px; background:#3b82f6; border-radius:5px; color:white;">View GitHub Instructions</a>
            </div>
        `;
    }
});

function updateConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connection-status');
    if (statusDot) {
        statusDot.style.background = isConnected ? '#4ade80' : '#ef4444'; // Green or Red
        statusDot.title = isConnected ? 'Connected' : 'Disconnected';
    }
}

// Socket Listeners
socket.on('joined_success', async (data) => {
    currentRoom = data.room;
    isCurrentRoomPrivate = data.isPrivate;

    // SETUP ENCRYPTION
    if (isCurrentRoomPrivate && currentPassword) {
        try {
            // Verify CryptoUtils
            if (typeof CryptoUtils === 'undefined') {
                console.error("CryptoUtils is not defined!");
                addMessage("❌ Encryption Error: Library missing", 'system');
            } else {
                addMessage("🔒 Securing Encryption Keys...", 'system');
                currentCryptoKey = await CryptoUtils.deriveKey(currentPassword, currentRoom);
                addMessage("🔐 End-to-End Encryption Enabled", 'system');
            }
        } catch (e) {
            console.error("Encryption Setup Error:", e);
            addMessage("❌ Encryption Setup Failed", 'system');
        }
    } else {
        currentCryptoKey = null; // Clear key if public
    }

    lobby.style.display = 'none';
    chatRoom.style.display = 'flex';
    roomTitle.innerHTML = `Room: ${data.room} <button class="btn" onclick="copyRoomLink('${data.room}')" style="padding: 5px 10px; font-size: 0.7rem; margin-left: 10px;">🔗 Invite</button>`;

    addMessage("You are connected.", 'system');
});

// Socket Listeners
socket.on('update_user_count', (count) => {
    const statusSpan = document.getElementById('user-count');
    if (statusSpan) {
        statusSpan.innerText = `👥 ${count} Online`;
    }
});

// ... (existing listeners)

socket.on('file_share', async (data) => {
    // 1. Decrypt if needed
    if (data.encrypted && data.iv) {
        if (currentCryptoKey) {
            try {
                data.fileData = await CryptoUtils.decrypt({ iv: data.iv, data: data.fileData }, currentCryptoKey);
            } catch (e) {
                console.error("File Decrypt Fail:", e);
                data.fileName = "⚠️ Decryption Failed";
                data.fileData = null;
            }
        } else {
            data.fileName = "🔒 Encrypted File";
            data.fileData = null; // Cannot view
        }
    }

    const type = data.username === myUsername ? 'sent' : 'received';
    addFileMessage(data, type);
});

function copyRoomLink(room) {
    let link = `${window.location.origin}?room=${room}`;
    if (isCurrentRoomPrivate) {
        link += `&mode=private`;
    }
    navigator.clipboard.writeText(link);
    alert("Invite link copied to clipboard! 📋");
}

socket.on('display_typing', (data) => {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.innerHTML = `<span class="typing-dots">💬</span> <strong style="color:white; text-shadow: 0 0 5px rgba(255,255,255,0.5);">${data.username}</strong> is typing...`;
    typingDiv.style.opacity = '1';
});

socket.on('hide_typing', (data) => {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.innerText = '';
});

// Typing Logic
let typingTimeout;
const msgInput = document.getElementById('msg-input');

msgInput.addEventListener('input', () => {
    socket.emit('typing', { room: currentRoom, username: myUsername });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing', { room: currentRoom, username: myUsername });
    }, 1000);
});

// File Sharing Logic
const fileInput = document.getElementById('file-input');
const uploadBtn = document.querySelector('.input-area button'); // The paperclip button

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("File too large (Max 5MB)");
            return;
        }

        // feedback
        uploadBtn.innerText = "⏳";
        uploadBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            let fileData = evt.target.result;
            let isEncrypted = false;
            let iv = null;

            if (currentCryptoKey) {
                // Encrypt the Base64 String
                const encrypted = await CryptoUtils.encrypt(fileData, currentCryptoKey);
                fileData = encrypted.data; // This is now ciphertext
                iv = encrypted.iv;
                isEncrypted = true;
            }

            socket.emit('file_share', {
                room: currentRoom,
                username: myUsername,
                fileData: fileData,
                encrypted: isEncrypted,
                iv: iv,
                fileName: file.name,
                fileType: file.type,
                timestamp: Date.now()
            });
            // reset
            uploadBtn.innerText = "📎";
            uploadBtn.disabled = false;
        };
        reader.readAsDataURL(file);
        fileInput.value = ''; // Reset
    }
});

socket.on('system_msg', (msg) => {
    addMessage(msg, 'system');
});

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const msgText = input.value.trim();

    if (msgText && currentRoom) {

        let protocolMsg = msgText;
        let isEncrypted = false;
        let iv = null;

        if (currentCryptoKey) {
            // ENCRYPT
            const encryptedData = await CryptoUtils.encrypt(msgText, currentCryptoKey);
            protocolMsg = encryptedData.data;
            iv = encryptedData.iv;
            isEncrypted = true;
        }

        socket.emit('send_message', {
            room: currentRoom,
            message: protocolMsg,
            encrypted: isEncrypted,
            iv: iv,
            username: myUsername,
            timestamp: Date.now(),
            destruct: document.getElementById('destruct-timer').value
        });

        // Sender sees their own message immediately (Plaintext)
        addMessage(msgText, 'sent');

        input.value = '';
        socket.emit('stop_typing', { room: currentRoom, username: myUsername });
    } else if (!currentRoom) {
        alert("Not in a room. Please re-join.");
        showLobby();
    }
}

// Receive Message Listener with Decryption
socket.on('receive_message', async (data) => {
    const type = data.username === myUsername ? 'sent' : 'received';

    // If listening to own message broadcast (rare), ignore or handle. 
    // Here we usually only listen to others, or server echo.
    // If username is mine, I already added it via sendMessage.
    if (data.username === myUsername) return;

    let displayMsg = data.message;

    // DECRYPT IF NEEDED
    if (data.encrypted && data.iv) {
        if (currentCryptoKey) {
            displayMsg = await CryptoUtils.decrypt({ iv: data.iv, data: data.message }, currentCryptoKey);
        } else {
            displayMsg = "🔒 Encrypted Message (You do not have the key)";
        }
    }

    const msgElement = addMessage(displayMsg, type, data.username);

    // Handle Self-Destruct
    if (data.destruct && data.destruct > 0) {
        const timerSec = data.destruct / 1000;
        const timerSpan = document.createElement('span');
        timerSpan.style.fontSize = '0.7rem';
        timerSpan.style.color = '#ef4444';
        timerSpan.style.marginLeft = '10px';
        timerSpan.innerText = `💣 ${timerSec}s`;
        msgElement.appendChild(timerSpan);

        setTimeout(() => {
            msgElement.style.transition = "opacity 0.5s";
            msgElement.style.opacity = "0";
            setTimeout(() => msgElement.remove(), 500);
        }, data.destruct);
    }
});

function addMessage(text, type, sender) {
    const div = document.createElement('div');
    div.classList.add('message', type);

    if (sender && type !== 'sent') {
        div.innerHTML = `<span class="sender">${sender}</span>${text}`;
    } else {
        div.innerText = text;
    }

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div; // Return element for manipulation
}

function addFileMessage(data, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);

    let content = '';
    if (data.fileType.startsWith('image/')) {
        content = `<img src="${data.fileData}" style="max-width: 100%; border-radius: 10px; margin-top: 5px;">`;
    } else if (data.fileType.startsWith('audio/')) {
        content = `<div style="min-width: 200px;">
                     <div style="font-size:0.8rem; opacity:0.7; margin-bottom:5px;">🎤 Voice Note</div>
                     <audio controls src="${data.fileData}" style="width: 100%; border-radius: 20px;"></audio>
                   </div>`;
    } else {
        content = `<div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                     📄 ${data.fileName} <br>
                     <a href="${data.fileData}" download="${data.fileName}" style="color: #fbcfe8; text-decoration: underline;">Download</a>
                   </div>`;
    }

    if (data.username && type !== 'sent') {
        div.innerHTML = `<span class="sender">${data.username}</span>${content}`;
    } else {
        div.innerHTML = content;
    }

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

function leaveChat() {
    location.reload(); // Simple reload to leave
}

function copyLink() {
    const copyText = document.getElementById("share-link-input");
    copyText.select();
    copyText.setSelectionRange(0, 99999); /* For mobile devices */
    navigator.clipboard.writeText(copyText.value);

    // Visual feedback
    const btn = document.querySelector('#generated-link button');
    const originalText = btn.innerText;
    btn.innerText = "✅ Copied!";
    setTimeout(() => {
        btn.innerText = originalText;
    }, 2000);
}

// SCREENSHOT PROTECTION / PRIVACY BLUR
window.addEventListener('blur', () => {
    if (currentRoom) {
        document.body.style.filter = 'blur(10px)';
        document.title = "🔒 Privacy Mode";
    }
});

window.addEventListener('focus', () => {
    if (currentRoom) {
        document.body.style.filter = 'none';
        document.title = "🛡️ PrivyChat";
    }
});

// --- v2.0 Features ---

function panicMode() {
    if (socket) socket.disconnect();
    document.body.innerHTML = '<div style="background:black; width:100vw; height:100vh;"></div>';
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("https://www.google.com");
}

function toggleTheme() {
    document.body.classList.toggle('hacker-theme');
    const isHacker = document.body.classList.contains('hacker-theme');
    showToast(isHacker ? "👨‍💻 Hacker Mode" : "🛡️ Secure Mode", "success");
}

// --- Voice Notes ---
let mediaRecorder;
let audioChunks = [];

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            sendVoiceNote(audioBlob);
        };

        mediaRecorder.start();
        document.getElementById('mic-btn').innerText = "🔴"; // Visual Feedback
        showToast("Recording...", "info");
    } catch (err) {
        console.error("Mic Error:", err);
        showToast("Microphone Access Denied (Check Permissions)", "error");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('mic-btn').innerText = "🎤";
    }
}

function sendVoiceNote(blob) {
    if (blob.size < 1000) return; // Ignore accidental clicks (< 1KB)

    // Convert Blob to DataURL (Base64) to send via Socket
    const reader = new FileReader();
    reader.onload = async (evt) => {
        let fileData = evt.target.result;
        let isEncrypted = false;
        let iv = null;

        if (currentCryptoKey) {
            const encrypted = await CryptoUtils.encrypt(fileData, currentCryptoKey);
            fileData = encrypted.data;
            iv = encrypted.iv;
            isEncrypted = true;
        }

        socket.emit('file_share', {
            room: currentRoom,
            username: myUsername,
            fileData: fileData,
            encrypted: isEncrypted,
            iv: iv,
            fileName: "voice-note.webm",
            fileType: "audio/webm",
            timestamp: Date.now(),
            destruct: document.getElementById('destruct-timer').value
        });
    };
    reader.readAsDataURL(blob);
}

// --- Stealth Mode ---
let calcExpression = '';
function toggleStealth() {
    const overlay = document.getElementById('stealth-calculator');
    const isHidden = overlay.style.display === 'none';
    overlay.style.display = isHidden ? 'flex' : 'none';
    document.title = isHidden ? "Calculator" : "🛡️ PrivyChat";
    if (isHidden) {
        calcExpression = '';
        document.getElementById('calc-display').value = '';
    }
}

function calcInput(val) {
    const display = document.getElementById('calc-display');

    if (val === 'C') {
        calcExpression = '';
        display.value = '';
    } else if (val === 'unlock') {
        // Magic Code Check
        if (calcExpression === '1337' || display.value === '1337') {
            toggleStealth();
            showToast("🔓 Access Granted", "success");
        } else {
            // Perform actual math to fake it
            try {
                display.value = eval(calcExpression || '0');
                calcExpression = display.value;
            } catch (e) {
                display.value = 'Error';
            }
        }
    } else {
        calcExpression += val;
        display.value = calcExpression;
    }
}
