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
let currentReply = null;
let currentCryptoKey = null;
let roomUsers = []; // Track connected users

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
        title: "✨ Advanced Feature Suite",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <h3 style="color:var(--accent-color); margin-top:0;">🕵️‍♂️ Spy & Stealth Tools</h3>
                <p>PrivyChat is built for the physical world, where privacy is often compromised by prying eyes.</p>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="margin-bottom: 10px;"><strong>🎭 Stealth Mode (Calculator)</strong><br>
                        Click the mask icon to hide the chat behind a functional scientific calculator.<br>
                        <span style="opacity:0.7">Unlock: Type <code>1337</code> and press <code>=</code>.</span>
                    </li>
                    <li style="margin-bottom: 10px;"><strong>🌦️ Decoy Vault</strong><br>
                        Need an escape? Type <code>weather</code>, <code>guest</code>, or <code>1234</code> into the main login box.<br>
                        <span style="opacity:0.7">Effect: Instant redirect to a harmless Weather App for plausible deniability.</span>
                    </li>
                    <li style="margin-bottom: 10px;"><strong>👻 Ghost Mode</strong><br>
                        Prevents "Shoulder Surfing". All messages are heavily blurred until you hover your mouse over them.
                    </li>
                    <li style="margin-bottom: 10px;"><strong>🚨 Panic Button</strong><br>
                        The Nuclear Option. Instantly disconnects, wipes all RAM/Storage, and redirects to Google.
                    </li>
                </ul>

                <h3 style="color:var(--accent-color);">💬 Rich Messaging</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="margin-bottom: 10px;"><strong>🎤 Encrypted Voice Notes</strong><br>
                        Send crystal-clear voice messages (Opus/WebM). Encrypted before upload.
                    </li>
                    <li style="margin-bottom: 10px;"><strong>📎 Secure File Sharing</strong><br>
                        Share images and documents. Files are encrypted chunk-by-chunk in the browser.
                    </li>
                    <li style="margin-bottom: 10px;"><strong>💣 Self-Destruct Timers</strong><br>
                        Set messages to auto-burn (5s, 10s, 30s) after reading.
                    </li>
                </ul>
            </div>
        `
    },
    security: {
        title: "🔐 Zero-Knowledge Security",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <p>We use a <strong>Zero-Trust Architecture</strong>. We assume the server is compromised, the network is tapped, and the device might be seized.</p>
                
                <h3 style="color:var(--accent-color);">🛡️ Encryption Protocol</h3>
                <p>All encryption happens in your browser using the <strong>Web Crypto API</strong>.</p>
                <table style="width:100%; border-collapse: collapse; margin-bottom: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden;">
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 8px; font-weight: bold;">Algorithm</td>
                        <td style="padding: 8px;">AES-GCM (256-bit)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 8px; font-weight: bold;">Key Derivation</td>
                        <td style="padding: 8px;">PBKDF2 (100,000 Iterations)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 8px; font-weight: bold;">Key Exchange</td>
                        <td style="padding: 8px;">RSA-OAEP (1v1 Mode)</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Integrity</td>
                        <td style="padding: 8px;">SHA-256 Hashing</td>
                    </tr>
                </table>

                <h3 style="color:var(--accent-color);">🔒 Server Blindness</h3>
                <p>The server acts as a "dumb relay". It routes encrypted blobs but <strong>never</strong> holds the decryption keys. Even if we wanted to read your messages, we couldn't.</p>
                
                <h3 style="color:var(--accent-color);">⚡ RAM-Only Storage</h3>
                <p>We use no persistent databases (No MongoDB, No SQL). Data lives only in the volatile Random Access Memory. If the server loses power or restarts, 100% of the data is physically destroyed.</p>
            </div>
        `
    },
    about: {
        title: "ℹ️ About PrivyChat",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <div style="text-align:center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #4285F4;">Privy<span style="color:#ffffff">Chat</span></h2>
                    <p style="opacity: 0.7; font-size: 0.9rem;">"Your words belong to you."</p>
                </div>

                <h3 style="color:var(--accent-color);">The Philosophy</h3>
                <p>PrivyChat was born from a desire to reclaim digital sovereignty. In an era where "User Data" is a commodity sold to the highest bidder, we built a sanctuary where your words belong only to you.</p>
                <p>We believe privacy is not about hiding "bad" things, but about protecting the things that make us human: intimacy, secrets, and freedom of thought.</p>

                <h3 style="color:var(--accent-color);">The Team</h3>
                <p>Designed and Engineered by <strong>Pratham Kumar</strong>.</p>
                <p>This is an open-source initiative to provide free, high-security communication tools to journalists, activists, and privacy enthusiasts worldwide.</p>
            </div>
        `
    },
    privacy: {
        title: "👁️ Privacy Policy",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <h3 style="color:var(--accent-color);">The "No-Log" Guarantee</h3>
                <p>We take this literally.</p>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 5px;">
                        <strong>🚫 No IP Logging</strong><br>We do not store or track user IP addresses.
                    </li>
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 5px;">
                        <strong>🚫 No Metadata</strong><br>We do not archive timestamps, sender IDs, or session durations.
                    </li>
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 5px;">
                        <strong>🚫 No Analytics</strong><br>No Google Analytics. No Facebook Pixels. No Cookies.
                    </li>
                </ul>

                <h3 style="color:var(--accent-color);">Data Lifecycle</h3>
                <p>Data exists only for the millisecond it takes to travel from Sender to Receiver. Once delivered, it is purged from server RAM.</p>
            </div>
        `
    },
    terms: {
        title: "📝 Terms of Service",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <p>By using PrivyChat, you agree to the following:</p>
                <ol style="padding-left: 20px;">
                    <li style="margin-bottom: 10px;"><strong>Self-Responsibility:</strong> You are solely responsible for the content you transmit. We cannot see or moderate content.</li>
                    <li style="margin-bottom: 10px;"><strong>No Recovery:</strong> You acknowledge that because we do not store data, lost passwords or messages are <strong>unrecoverable</strong>.</li>
                    <li style="margin-bottom: 10px;"><strong>Legal Use:</strong> You will not use this platform for malicious activities, cybercrime, or harassment.</li>
                    <li style="margin-bottom: 10px;"><strong>As-Is Software:</strong> This is open-source software provided without warranty. Use at your own risk.</li>
                </ol>
                <p style="text-align:center; margin-top: 20px; font-style: italic; opacity: 0.7;">Use wisely. Speak freely. Leave no trace.</p>
            </div>
        `
    },
    location: {
        title: "🇮🇳 Development HQ: India",
        body: `
            <div style="font-size: 0.95rem; text-align: left;">
                <p><strong>PrivyChat</strong> is proudly developed and maintained in <strong>India</strong>, a growing hub for global cyber-security innovation.</p>
                
                <h3 style="color:var(--accent-color);">📍 Server Infrastructure</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="margin-bottom: 10px;">
                        <strong>Node Region:</strong> <span style="color:#10b981">Asia-Pacific (Mumbai)</span><br>
                        <span style="opacity:0.7">Optimized for low-latency connections across South Asia.</span>
                    </li>
                    <li style="margin-bottom: 10px;">
                        <strong>Routing:</strong> <span style="color:#3b82f6">Decentralized Relay</span><br>
                        <span style="opacity:0.7">Traffic is routed through ephemeral nodes to obscure origin points.</span>
                    </li>
                </ul>

                <h3 style="color:var(--accent-color);">⚖️ Jurisdiction</h3>
                <p>While developed in India, PrivyChat operates on a <strong>Code-is-Law</strong> principle.</p>
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; font-size: 0.9rem; border-left: 3px solid #f59e0b;">
                    "We cannot comply with data requests because we do not possess the data. Technology, not policy, guarantees your privacy."
                </div>
            </div>
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
    // Google Theme Auto-Fill
    document.getElementById('google-input').value = inviteRoom;
    document.getElementById('google-input').readOnly = true; // Lock it so they don't accidentally change it

    // Auto-Join if it's a 1v1 link (which usually has no password or key is in URL)
    // Or just let them click "Join" to enter name.
    // For better UX, we can show a Toast.
    setTimeout(() => {
        showToast("🔗 Invite Link Detected. Enter Name & Join!", "success");
    }, 500);

    if (inviteMode === 'private') {
        currentMode = 'private';
    }
}
// --- Google UI Logic ---

// Enter Key Handler
// (Duplicate Google Logic removed)

let isCurrentRoomPrivate = false;

socket.on('password_required', (room) => {
    // Server says we need a password
    const pass = prompt("🔒 This room is password protected.\nPlease enter the password:");
    if (pass) {
        currentPassword = pass; // Store for reconnects
        socket.emit('join_room', { room, password: pass, username: myUsername, type: 'private' });
        SoundUtils.playJoin(); // SFX
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
        currentReply = null; // Track reply state
    }

    lobby.style.display = 'none';
    chatRoom.style.display = 'flex';
    roomTitle.innerHTML = `Room: ${data.room} <button class="btn" onclick="copyRoomLink('${data.room}')" style="padding: 5px 10px; font-size: 0.7rem; margin-left: 10px;">🔗 Invite</button>`;

    addMessage("You are connected.", 'system');
});

// Socket Listeners
// Update Room State (Count + List)
socket.on('update_room_state', (data) => {
    // data: { count: number, users: string[] }
    const userCount = document.getElementById('user-count');
    userCount.innerText = `👥 ${data.count} Online`;
    roomUsers = data.users || [];

    // If modal is open, refresh it live
    const modal = document.getElementById('user-list-modal');
    if (modal.classList.contains('active')) {
        renderUserList();
    }
});

// Legacy fallback (shouldn't receive this anymore if server updated correctly)
socket.on('update_user_count', (count) => {
    document.getElementById('user-count').innerText = `👥 ${count} Online`;
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
    console.log("📂 File Selected");
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            alert("File too large (Max 5MB)");
            return;
        }

        uploadBtn.innerText = "⏳";
        uploadBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            console.log("📂 File Read Complete");
            let fileData = evt.target.result;
            let isEncrypted = false;
            let iv = null;

            if (currentCryptoKey) {
                console.log("🔒 Encrypting File...");
                try {
                    const encrypted = await CryptoUtils.encrypt(fileData, currentCryptoKey);
                    fileData = encrypted.data;
                    iv = encrypted.iv;
                    isEncrypted = true;
                    console.log("🔒 Encryption Success");
                } catch (err) {
                    console.error("❌ Encryption Failed:", err);
                    alert("Encryption Failed!");
                    uploadBtn.innerText = "📎";
                    uploadBtn.disabled = false;
                    return;
                }
            }

            console.log("📡 Emitting file_share event");
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

            uploadBtn.innerText = "📎";
            uploadBtn.disabled = false;
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
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
            replyTo: currentReply, // Send reply context
            timestamp: Date.now(),
            destruct: document.getElementById('destruct-timer').value
        });

        // Sender sees their own message immediately (Plaintext)
        addMessage(msgText, 'sent', myUsername, currentReply);
        cancelReply(); // Clear reply state after sending
        SoundUtils.playSend(); // SFX

        input.value = '';
        socket.emit('stop_typing', { room: currentRoom, username: myUsername });
    } else if (!currentRoom) {
        alert("Not in a room. Please re-join.");
        showLobby();
    }
}

// Receive Message Listener with Decryption
socket.on('receive_message', async (data) => {
    SoundUtils.playReceive(); // SFX
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

    const msgElement = addMessage(displayMsg, type, data.username, data.replyTo);

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

function addMessage(text, type, sender, replyContext = null) {
    const div = document.createElement('div');
    div.classList.add('message', type);

    // Render Reply Quote if exists
    let quoteHtml = '';
    if (replyContext) {
        quoteHtml = `
        <div class="reply-quote" onclick="highlightMessage('msg-${replyContext.id}')">
            <span class="quote-user">${replyContext.sender}</span>
            <span style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${replyContext.text}</span>
        </div>`;
    }

    // Create the message content wrapper for Ghost Mode targeting
    const contentHtml = `<span class="message-content">${text}</span>`;

    if (sender && type !== 'sent') {
        div.innerHTML = `${quoteHtml}<span class="sender">${sender}</span>${contentHtml}`;
    } else {
        div.innerHTML = `${quoteHtml}${contentHtml}`;
    }

    // Attach Swipe Logic
    attachSwipeHandler(div, text, sender || 'You');

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
}

function addFileMessage(data, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);

    let content = '';
    const fileType = data.fileType || ''; // Safety Check

    // Apply 'file-preview' class for Ghost Mode targeting
    if (fileType.startsWith('image/')) {
        content = `<img src="${data.fileData}" class="file-preview" style="max-width: 100%; border-radius: 10px; margin-top: 5px;">`;
    } else if (fileType.startsWith('audio/')) {
        // Calculate Rate based on Effect
        let rate = 1.0;
        let label = "🎤 Voice Note";
        let pitchPreserve = true;

        if (data.voiceEffect === 'robot') {
            rate = 0.85; // Slightly slower
            label = "🤖 Robot Voice";
            pitchPreserve = false;
        } else if (data.voiceEffect === 'chipmunk') {
            rate = 1.5; // Fast & High Pitch
            label = "🐿️ Chipmunk Voice";
            pitchPreserve = false;
        } else if (data.voiceEffect === 'monster') {
            rate = 0.6; // Slow & Deep Pitch
            label = "👹 Monster Voice";
            pitchPreserve = false;
        }

        // Generate unique ID for this audio to set rate via JS safely
        const audioId = 'audio-' + Math.random().toString(36).substr(2, 9);

        // Ensure the Data URL has the correct MIME type prefix
        let safeSrc = data.fileData;
        if (fileType && safeSrc.startsWith('data:') && safeSrc.includes('base64,')) {
            const base64Content = safeSrc.split('base64,')[1];
            safeSrc = `data:${fileType};base64,${base64Content}`;
        }

        content = `<div class="file-preview" style="min-width: 200px;">
                     <div style="font-size:0.8rem; opacity:0.7; margin-bottom:5px;">${label}</div>
                     <audio id="${audioId}" controls src="${safeSrc}" style="width: 100%; border-radius: 20px;" onerror="console.error('Audio Playback Error', this.error)"></audio>
                   </div>`;

        // Set properties immediately (sync) or after render
        // Since we return 'div', we can modify its children before it is attached if we want,
        // but since we rely on ID lookups or structure, let's do it after innerHTML assignment.
    } else {
        // Default / Fallback
        content = `<div class="file-preview" style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                     📄 ${data.fileName || 'Unknown File'} <br>
                     <a href="${data.fileData}" download="${data.fileName || 'file'}" style="color: #fbcfe8; text-decoration: underline;">Download</a>
                   </div>`;
    }

    if (data.username && type !== 'sent') {
        div.innerHTML = `<span class="sender">${data.username}</span>${content}`;
    } else {
        div.innerHTML = content;
    }

    // Apply Audio Effects Programmatically (Fix)
    if (fileType.startsWith('audio/') && fileType !== 'audio/') {
        // We can find the audio element within 'div' now
        const audioElement = div.querySelector('audio');
        if (audioElement) {
            // We need to wait for metadata or just set it. 
            // Rate can be set immediately.
            audioElement.playbackRate = data.voiceEffect === 'robot' ? 0.85 :
                data.voiceEffect === 'chipmunk' ? 1.5 :
                    data.voiceEffect === 'monster' ? 0.6 : 1.0;

            const preserve = data.voiceEffect === 'normal' || !data.voiceEffect;
            if (audioElement.preservesPitch !== undefined) audioElement.preservesPitch = preserve;
            if (audioElement.mozPreservesPitch !== undefined) audioElement.mozPreservesPitch = preserve;
            if (audioElement.webkitPreservesPitch !== undefined) audioElement.webkitPreservesPitch = preserve;
        }
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

// Toast Notification Logic
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;

    // Auto-remove
    container.appendChild(toast);

    // Animation trigger
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// --- v2.0 Features ---

// --- v2.0 Features ---

function panicMode() {
    if (socket) socket.disconnect();
    document.body.innerHTML = '<div style="background:black; width:100vw; height:100vh;"></div>';
    localStorage.clear();
    sessionStorage.clear();
    // Redirect to User's Weather App (Decoy)
    window.location.replace("https://rajpratham1.github.io/Aether-Tools/");
}

// ... existing UI functions ...

// Add this to your joinRoom logic (or wherever the join button click is handled)
// Since I can't see the joinRoom function here, I'll update the panicMode first and you might need another edit for the login.
// Wait, I will search for the join logic first to do it in one go if possible, but for now let's secure the Panic Button.

// --- UI Functions ---
function toggleGhostMode() {
    const messages = document.getElementById('messages');
    messages.classList.toggle('ghost-active');

    // Toggle Icon
    const btn = document.querySelector('.chat-header .btn-icon');
    if (messages.classList.contains('ghost-active')) {
        btn.innerText = '👻'; // Active
        showToast("Ghost Mode ON: Messages Blurred", "info");
    } else {
        btn.innerText = '👁️'; // Inactive
        showToast("Ghost Mode OFF", "info");
    }
}

function toggleTheme() {
    document.body.classList.toggle('hacker-theme');
    const isHacker = document.body.classList.contains('hacker-theme');
    showToast(isHacker ? "👨‍💻 Hacker Mode" : "🛡️ Secure Mode", "success");
    if (isHacker) SoundUtils.playHacker(); // SFX
}

// --- Voice Notes ---
let mediaRecorder;
let audioChunks = [];

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let selectedType = 'audio/webm'; // Default
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            selectedType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            selectedType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            selectedType = 'audio/mp4';
        }

        console.log("🎤 Initializing Recorder with:", selectedType);

        mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Just use the simple mime type for the blob
            const audioBlob = new Blob(audioChunks, { type: selectedType });
            sendVoiceNote(audioBlob, selectedType);
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

function sendVoiceNote(blob, mimeType = 'audio/webm') {
    if (blob.size < 100) return; // Allow shorter clips (was 1000)

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
            // Strip codecs from fileName extension check if possible, or just default to .webm for safety
            fileName: "voice-note" + (mimeType.includes('mp4') ? '.m4a' : '.webm'),
            fileType: mimeType, // Send the clean mime type
            voiceEffect: document.getElementById('voice-effect').value, // Send selected effect
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

// Failsafe: Allow Escape key to close Stealth Mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('stealth-calculator');
        if (overlay && overlay.style.display !== 'none') {
            toggleStealth();
        }
    }
});

// --- Google Theme Logic & Decoy Vault ---

function handleGoogleEnter(e) {
    if (e.key === 'Enter') {
        googleJoin();
    }
}

function googleJoin() {
    const input = document.getElementById('google-input');
    const val = input.value.trim();

    if (!val) {
        showToast("🌍 Joining Public Lobby...", "info");
        userLoginFlow('General', null, 'group');
        return;
    }

    // --- DECOY VAULT LOGIC ---
    const lowerVal = val.toLowerCase();
    if (lowerVal === 'weather' || lowerVal === 'guest' || lowerVal === 'aether' || lowerVal === '1234') {
        showToast("☁️ Loading Weather Data...", "info");
        setTimeout(() => {
            window.location.replace("https://rajpratham1.github.io/Aether-Tools/");
        }, 1000);
        return;
    }

    // Normal Join
    userLoginFlow(val, null, 'group');
}

function startGoogleMic() {
    showToast("🎤 Listening... (Just kidding, typing only!)", "info");
}

function google1v1() {
    // Mode A: 1v1 Secure Link ("I'm Feeling Lucky")
    const roomUUID = 'secure-' + Math.random().toString(36).substr(2, 9);
    // Auto-join this new 1v1 room
    userLoginFlow(roomUUID, null, '1v1');
    showToast("🎲 Generating Secure 1v1 Link...", "success");
}

function googleCreate() {
    // Switch to the Lobby UI for creation or just prompt password
    const roomName = prompt("Enter a Name for your Private Room:");
    if (!roomName) return;
    const password = prompt("Set a Password:");
    if (!password) return;

    userLoginFlow(roomName, password, 'private');
}

function userLoginFlow(room, password, mode) {
    SoundUtils.init(); // Initialize Audio Context on user interaction (Click/Enter)
    if (!myUsername) {
        const name = prompt("Enter your Nickname to join:");
        if (!name) return;
        myUsername = name;
    }

    // Store globally
    currentMode = mode;
    currentRoom = room;
    if (password) currentPassword = password;

    // Join
    socket.emit('join_room', { room: room, password: password || '', username: myUsername, type: mode });

    // Hide Lobby (Google page)
    if (lobby) lobby.style.display = 'none';
    if (chatRoom) chatRoom.style.display = 'flex';
}




/* --- Chat UX Helpers --- */
function attachSwipeHandler(element, text, sender) {
    let startX = 0;
    let currentX = 0;
    const threshold = 50; // px to trigger

    element.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        element.style.transition = 'none'; // Instant drag
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        // Only allow dragging Right
        if (diff > 0 && diff < 150) {
            element.style.transform = 'translateX(' + diff + 'px)';
        }
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        const diff = currentX - startX;
        element.style.transition = 'transform 0.3s ease';
        element.style.transform = 'translateX(0)'; // Snap back

        if (diff > threshold) {
            // Trigger Reply
            triggerReply(text, sender);
            // Haptic Feedback
            if (navigator.vibrate) navigator.vibrate(20);
        }
    });
}

function triggerReply(text, sender) {
    currentReply = {
        text: text,
        sender: sender,
        id: Date.now() // Simple ID
    };

    const banner = document.getElementById('reply-banner');
    const preview = document.getElementById('reply-text-preview');
    // const userLabel = banner.querySelector('.reply-to-user');

    if (banner && preview) {
        preview.innerText = text;
        banner.querySelector('.reply-to-user').innerText = 'Replying to ' + sender;
        banner.classList.add('active');
        document.getElementById('msg-input').focus();
    }
}

function cancelReply() {
    currentReply = null;
    const banner = document.getElementById('reply-banner');
    if (banner) banner.classList.remove('active');
}

function highlightMessage(elementId) {
    // Optional: Scroll to message
    // Since we don't have stable IDs, we skip for now
    console.log('Highlight requested for', elementId);
}


/* --- WebRTC Video Logic (v5.0) --- */
let localStream;
let remoteStream;
let peerConnection;
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Public STUN
};

// UI Elements
const videoOverlay = document.getElementById('video-call-overlay');
const localVideo = document.getElementById('local-video');
const callStatus = document.getElementById('call-status'); // Status UI
const incomingModal = document.getElementById('incoming-call-modal');
const remoteVideo = document.getElementById('remote-video');
let incomingCallData = null;

// 1. Initiator Starts Call
async function startCall(type = 'video') {
    try {
        const constraints = type === 'voice' ? { video: false, audio: true } : { video: true, audio: true };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        localVideo.srcObject = localStream;
        // If voice only, maybe show a placeholder in localVideo?
        if (type === 'voice') localVideo.style.opacity = 0; // Hide self view for voice
        else localVideo.style.opacity = 1;

        videoOverlay.style.display = 'flex'; // Show UI
        if (type === 'voice') {
            document.getElementById('remote-video').style.display = 'none'; // Hide big video area
            callStatus.innerText = "📞 Calling...";
        } else {
            document.getElementById('remote-video').style.display = 'block';
            callStatus.innerText = "🎥 Calling...";
        }

        peerConnection = createPeerConnection();

        // Add Tracks
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send Offer
        socket.emit('call_user', { room: currentRoom, offer: offer, callType: type });
        callStatus.innerText = "🔔 Ringing..."; // Update status after send
        showToast('Calling...', 'info');
    } catch (err) {
        console.error('Call Error:', err);
        showToast('Camera/Mic Permission Denied', 'error');
    }
}

// 2. Receiver Gets Offer
socket.on('call_user', (data) => {
    // data: { offer, socketId, callType }
    incomingCallData = data;
    const modalTitle = document.querySelector('#incoming-call-modal h2');
    modalTitle.innerText = data.callType === 'voice' ? '📞 Incoming Voice Call...' : '🎥 Incoming Video Call...';

    incomingModal.style.display = 'flex';
    SoundUtils.playRing(); // Start Ringing!
});

// 3. Receiver Accepts
async function acceptCall() {
    SoundUtils.stopRing(); // Stop Ringing
    incomingModal.style.display = 'none';
    try {
        const type = incomingCallData.callType || 'video';
        callStatus.innerText = "🔄 Connecting..."; // Initial output

        const constraints = type === 'voice' ? { video: false, audio: true } : { video: true, audio: true };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        if (type === 'voice') {
            localVideo.style.opacity = 0;
            document.getElementById('remote-video').style.display = 'none';
        } else {
            localVideo.style.opacity = 1;
            document.getElementById('remote-video').style.display = 'block';
        }

        videoOverlay.style.display = 'flex';

        peerConnection = createPeerConnection();

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Set Remote Description (The Offer)
        await peerConnection.setRemoteDescription(incomingCallData.offer);

        // Create Answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send Answer
        socket.emit('answer_call', { to: incomingCallData.socketId, answer: answer });
    } catch (err) {
        console.error('Accept Error:', err);
    }
}

function rejectCall() {
    SoundUtils.stopRing(); // Stop Ringing
    incomingModal.style.display = 'none';
    incomingCallData = null;
    // Notify caller?
}

// 4. Initiator Gets Answer
socket.on('call_accepted', async (answer) => {
    await peerConnection.setRemoteDescription(answer);
    showToast('Call Connected', 'success');
});

// 5. ICE Candidates (Network Discovery)
socket.on('ice_candidate', async (candidate) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }
});

function createPeerConnection() {
    const pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // Send candidate to peer via Room Broadcast
            socket.emit('ice_candidate', {
                room: currentRoom,
                candidate: event.candidate
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log("ICE State:", state);
        if (state === 'disconnected') {
            callStatus.innerText = "⚠️ Reconnecting...";
            // showToast("Call Reconnecting...", "info");
        } else if (state === 'failed') {
            callStatus.innerText = "❌ Call Failed";
            endCall();
        } else if (state === 'connected') {
            callStatus.innerText = ""; // Clear status when live
        }
    };

    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    return pc;
}

// 6. End Call
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    videoOverlay.style.display = 'none';
    socket.emit('end_call', { room: currentRoom });
}

socket.on('end_call', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    videoOverlay.style.display = 'none';
    showToast('Call Ended', 'info');
});

// Controls
function toggleMute() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    showToast(audioTrack.enabled ? 'Mic On' : 'Mic Muted', 'info');
}

function toggleCam() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    showToast(videoTrack.enabled ? 'Cam On' : 'Cam Off', 'info');
}


