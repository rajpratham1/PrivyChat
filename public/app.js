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
let eventListenersInitialized = false; // Prevent duplicate event listeners

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
        title: "📡 Advanced Feature Suite",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <h3 style="color:var(--g-green); margin-top:0;">📡 Air-Gapped & Nearby Tactical Mesh</h3>
                <p>Communicate completely off-the-grid without relying on public servers or global internet connectivity.</p>
                <ul style="list-style: none; padding-left: 0; margin-bottom: 15px;">
                    <li style="margin-bottom: 8px;"><strong>• 360° Sonar Radar:</strong> Real-time animated radio sweep detecting active nodes on local spectrum.</li>
                    <li style="margin-bottom: 8px;"><strong>• Local WiFi / Hotspot Mesh:</strong> Auto-discovers peers on the same router or mobile phone hotspot with zero internet.</li>
                    <li style="margin-bottom: 8px;"><strong>• Web Bluetooth (BLE):</strong> Proximity device pairing and signal strength (RSSI) tracking.</li>
                    <li style="margin-bottom: 8px;"><strong>• Optical QR Handshake:</strong> Camera-to-screen WebRTC SDP exchange for 100% air-gapped environments.</li>
                </ul>

                <h3 style="color:var(--g-blue);">🕵️ Physical OPSEC & Spy Tools</h3>
                <ul style="list-style: none; padding-left: 0; margin-bottom: 15px;">
                    <li style="margin-bottom: 8px;"><strong>• Stealth Mode (Calculator):</strong> Disguises the chat behind a functional scientific calculator. Unlock code: <code>1337=</code>.</li>
                    <li style="margin-bottom: 8px;"><strong>• Decoy Vault:</strong> Type <code>weather</code>, <code>guest</code>, or <code>1234</code> in the main box for instant plausible deniability.</li>
                    <li style="margin-bottom: 8px;"><strong>• Ghost Mode:</strong> Prevents shoulder-surfing by blurring all messages until you hover over them.</li>
                    <li style="margin-bottom: 8px;"><strong>• Invisible Ink (Steganography):</strong> Hide encrypted text payloads inside innocent PNG/JPEG image carrier pixels.</li>
                    <li style="margin-bottom: 8px;"><strong>• Emergency Panic Purge:</strong> Instantly wipes all RAM, destroys crypto keys, clears storage, and redirects to Google.</li>
                </ul>

                <h3 style="color:var(--pink-accent);">🎙️ Rich Ephemeral Media</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="margin-bottom: 8px;"><strong>• Voice Notes with Pitch Masking:</strong> Modulate vocal timbre and send encrypted audio memos.</li>
                    <li style="margin-bottom: 8px;"><strong>• Direct P2P Video & Voice Calls:</strong> Encrypted WebRTC DTLS-SRTP direct peer streaming.</li>
                    <li style="margin-bottom: 8px;"><strong>• Chunked File & Photo Transfer:</strong> Send documents and media encrypted in browser memory.</li>
                    <li style="margin-bottom: 8px;"><strong>• Ephemeral Self-Destruct:</strong> Set timers from 5s to 60s, or Burn-on-Read.</li>
                </ul>
            </div>
        `
    },
    security: {
        title: "🔒 Military-Grade Cryptography & Zero-Knowledge",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <p>PrivyChat employs a <strong>Zero-Trust, Zero-Knowledge Architecture</strong> where no plaintext data ever leaves your device.</p>
                
                <h3 style="color:var(--g-green);">Cryptographic Pipeline Specification</h3>
                <table style="width:100%; border-collapse: collapse; margin-bottom: 15px; background: rgba(0,0,0,0.3); border-radius: 8px; overflow: hidden; font-size: 0.9rem;">
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px; font-weight: bold; color: var(--g-green);">Cipher Suite</td>
                        <td style="padding: 10px;">AES-256-GCM (Authenticated Encryption with 96-bit random IVs)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px; font-weight: bold; color: var(--g-green);">Key Derivation</td>
                        <td style="padding: 10px;">PBKDF2 (100,000 Iterations of SHA-256 + Unique Room Salt)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px; font-weight: bold; color: var(--g-green);">P2P Handshake</td>
                        <td style="padding: 10px;">Ephemeral ECDH (P-256 Elliptic Curve) + SHA-256 Safety Fingerprint</td>
                    </tr>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px; font-weight: bold; color: var(--g-green);">Calling Media</td>
                        <td style="padding: 10px;">WebRTC Direct P2P with DTLS 1.2 & SRTP-AES-128-GCM</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; color: var(--g-green);">Engine</td>
                        <td style="padding: 10px;">Hardware-Accelerated Native Web Crypto API (Client-Side)</td>
                    </tr>
                </table>

                <h3 style="color:var(--g-blue);">100% Volatile RAM Lifecycle</h3>
                <p>No databases (no MongoDB, SQL, or Redis disks). All session rooms exist purely in temporary RAM heap memory. When the room empties or the server restarts, 100% of room history vanishes permanently.</p>
                
                <h3 style="color:var(--pink-accent);">Server Blindness & MITM Defense</h3>
                <p>The backend relay never holds decryption keys. Visual safety symbols (safety emojis & hex hash) allow users to verify channel integrity and eliminate Man-in-the-Middle eavesdropping.</p>
            </div>
        `
    },
    about: {
        title: "🛡️ About PrivyChat & Creator",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <div style="text-align:center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #34A853;">Privy<span style="color:#ffffff">Chat</span></h2>
                    <p style="opacity: 0.7; font-size: 0.9rem;">"Zero Logs. Zero Traces. Total Sovereignty."</p>
                </div>

                <h3 style="color:var(--g-green);">The Philosophy</h3>
                <p>PrivyChat was created to guarantee private human conversation against corporate data harvesting, ISP surveillance, and physical device inspection. Communication is an ephemeral act—it should leave no permanent forensic artifact.</p>

                <h3 style="color:var(--g-blue);">Admin & Lead Engineer</h3>
                <p>PrivyChat is architected, designed, and developed by <strong>Pratham Kumar</strong> (<a href="https://github.com/rajpratham1" target="_blank" style="color:var(--g-green); font-weight:bold;">@rajpratham1</a>).</p>
                
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border-left: 3px solid #10b981; margin-top: 15px;">
                    <strong>Open-Source Security:</strong> PrivyChat's source code is 100% transparent and open for independent cryptographic verification on <a href="https://github.com/rajpratham1/PrivyChat" target="_blank" style="color:var(--g-blue);">GitHub</a>.
                </div>
            </div>
        `
    },
    privacy: {
        title: "📜 Absolute Zero-Log Privacy Policy",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <h3 style="color:var(--g-green);">The Literal "No-Log" Standard</h3>
                <p>Privacy is enforced by architecture, not just promises:</p>
                <ul style="list-style: none; padding-left: 0;">
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <strong>🚫 No IP Address Archiving:</strong> We never log or store connection IP addresses.
                    </li>
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <strong>🚫 No Metadata Retention:</strong> No message counts, sender/receiver relationships, or timestamps are recorded.
                    </li>
                    <li style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <strong>🚫 Zero Trackers & Analytics:</strong> No Google Analytics, no Facebook pixels, no advertising beacons, and no tracking cookies.
                    </li>
                </ul>

                <h3 style="color:var(--g-blue);">Sub-Millisecond Transit</h3>
                <p>Ciphertext exists only for the millisecond required to bridge Sender and Recipient. Decrypted messages reside exclusively in client browser RAM and are purged upon window closure or self-destruct trigger.</p>
            </div>
        `
    },
    terms: {
        title: "⚖️ Terms of Service",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <p>By accessing PrivyChat, you agree to these operational terms:</p>
                <ol style="padding-left: 20px; margin-bottom: 15px;">
                    <li style="margin-bottom: 10px;"><strong>Client-Side Sovereignty:</strong> You are solely responsible for your communication keys. Because PrivyChat holds no keys, lost passwords or expired rooms cannot be recovered by anyone.</li>
                    <li style="margin-bottom: 10px;"><strong>Ethical & Lawful Conduct:</strong> You agree not to utilize PrivyChat for malicious automated attacks, unlawful malware distribution, or harassment.</li>
                    <li style="margin-bottom: 10px;"><strong>Open-Source As-Is License:</strong> Provided freely without warranty under open-source terms.</li>
                </ol>
                <p style="text-align:center; margin-top: 15px; font-style: italic; color: var(--g-green);">"Speak freely. Protect your identity. Leave zero trace."</p>
            </div>
        `
    },
    location: {
        title: "🌐 Global & Local Node Infrastructure",
        body: `
            <div style="font-size: 0.95rem; text-align: left; line-height: 1.6;">
                <p><strong>PrivyChat</strong> operates with global edge routing and localized air-gapped mesh support.</p>
                
                <h3 style="color:var(--g-green);">📍 Edge Relay Network</h3>
                <ul style="list-style: none; padding-left: 0; margin-bottom: 15px;">
                    <li style="margin-bottom: 8px;">
                        <strong>• Global Node:</strong> <span style="color:#10b981">Asia-Pacific Edge / Global Anycast</span>
                    </li>
                    <li style="margin-bottom: 8px;">
                        <strong>• Offline Tactical Mesh:</strong> <span style="color:#3b82f6">Local LAN / WiFi Hotspot / BLE P2P</span>
                    </li>
                </ul>

                <h3 style="color:var(--g-blue);">🔒 Cryptographic Sovereignty (Code-is-Law)</h3>
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; font-size: 0.9rem; border-left: 3px solid #10b981;">
                    "We cannot comply with data requests or third-party subpoenas because we possess zero persistent data. Mathematical cryptography, not policy, guarantees your freedom."
                </div>
            </div>
        `
    }
};

function openInfo(section) {
    const modal = document.getElementById('info-modal');
    const title = document.getElementById('info-title');
    const body = document.getElementById('info-body');

    if (infoContent[section] && modal) {
        if (title) title.innerHTML = infoContent[section].title;
        if (body) body.innerHTML = infoContent[section].body;
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeInfoModal() {
    const modal = document.getElementById('info-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function copyGlobalLink() {
    if (globalUrlInput) {
        globalUrlInput.select();
        globalUrlInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(globalUrlInput.value);
        showToast("App Link Copied!", "success");
    }
}

// DOM Elements
const lobby = document.getElementById('lobby');
const chatRoom = document.getElementById('chat-room');
const messagesDiv = document.getElementById('messages');
const roomTitle = document.getElementById('current-room');
const googleInput = document.getElementById('google-input');

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
        showToast("Invite Link Detected. Enter Name & Join!", "success");
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
    const pass = prompt("ðŸ”’ This room is password protected.\nPlease enter the password:");
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
                <h1 style="color:#ef4444; font-size:3rem; margin-bottom:10px;">âš ï¸ Deployment Error</h1>
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
                addMessage("Encryption Error: Library missing", 'system');
            } else {
                addMessage("🔒 Securing Encryption Keys...", 'system');
                currentCryptoKey = await CryptoUtils.deriveKey(currentPassword, currentRoom);
                addMessage("🔐 End-to-End Encryption Enabled", 'system');
            }
        } catch (e) {
            console.error("Encryption Setup Error:", e);
            addMessage("Encryption Setup Failed", 'system');
        }
    } else {
        currentCryptoKey = null; // Clear key if public
        currentReply = null; // Track reply state
    }

    lobby.style.display = 'none';
    chatRoom.style.display = 'flex';
    roomTitle.innerHTML = `Room: ${data.room}`;

    // Replace inline event handler for copying room link
    const copyRoomLink = (room) => {
        const link = `${window.location.origin}/?room=${room}`;
        navigator.clipboard.writeText(link).then(() => {
            alert('Room link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy room link:', err);
        });
    };

    // Attach event listener dynamically
    const inviteButton = document.createElement('button');
    inviteButton.className = 'btn';
    inviteButton.textContent = 'Copy Invite Link';
    inviteButton.style = 'padding: 5px 10px; font-size: 0.7rem; margin-left: 10px;';
    inviteButton.addEventListener('click', () => copyRoomLink(data.room));
    roomTitle.appendChild(inviteButton);

    addMessage("You are connected.", 'system');

    // Initialize event listeners only once
    if (!eventListenersInitialized) {
        initializeChatRoomEventListeners();
    }
});

// Socket Listeners
// Update Room State (Count + List)
socket.on('update_room_state', (data) => {
    // data: { count: number, users: string[] }
    const userCount = document.getElementById('user-count');
    userCount.innerText = `${data.count} Online`;
    roomUsers = data.users || [];

    // If modal is open, refresh it live
    const modal = document.getElementById('user-list-modal');
    if (modal.classList.contains('active')) {
        renderUserList();
    }
});

// Legacy fallback (shouldn't receive this anymore if server updated correctly)
socket.on('update_user_count', (count) => {
    document.getElementById('user-count').innerText = ` ${count} Online`;
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
                data.fileName = "âš ï¸ Decryption Failed";
                data.fileData = null;
            }
        } else {
            data.fileName = "Encrypted File";
            data.fileData = null; // Cannot view
        }
    }

    const type = data.username === myUsername ? 'sent' : 'received';
    addFileMessage(data, type);
});

socket.on('display_typing', (data) => {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.innerHTML = `<span class="typing-dots">ðŸ’¬</span> <strong style="color:white; text-shadow: 0 0 5px rgba(255,255,255,0.5);">${data.username}</strong> is typing...`;
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
                    console.log("🔐 Encryption Success");
                } catch (err) {
                    console.error("Encryption Failed:", err);
                    alert("Encryption Failed!");
                    uploadBtn.innerText = "📂";
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

            uploadBtn.innerText = "📂";
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

        const messageData = {
            room: currentRoom,
            message: protocolMsg,
            encrypted: isEncrypted,
            iv: iv,
            username: myUsername,
            replyTo: currentReply,
            timestamp: Date.now(),
            destruct: document.getElementById('destruct-timer').value
        };

        socket.emit('send_message', messageData);

        // Immediately display sender's own message (server no longer echoes back to sender)
        const msgElement = addMessage(msgText, 'sent', myUsername, currentReply);

        // Handle Self-Destruct for sender's own message
        if (messageData.destruct && messageData.destruct > 0) {
            const timerSec = messageData.destruct / 1000;
            const timerSpan = document.createElement('span');
            timerSpan.style.fontSize = '0.7rem';
            timerSpan.style.color = '#ef4444';
            timerSpan.style.marginLeft = '10px';
            timerSpan.innerText = `💣 ${timerSec}s`;
            msgElement.appendChild(timerSpan);
            const burnDuration = 600;
            const burnStart = Math.max(0, messageData.destruct - burnDuration);
            setTimeout(() => {
                msgElement.classList.add('burn-out');
                setTimeout(() => msgElement.remove(), burnDuration);
            }, burnStart);
        }

        cancelReply();
        SoundUtils.playSend();
        input.value = '';
        socket.emit('stop_typing', { room: currentRoom, username: myUsername });
    } else if (!currentRoom) {
        alert("Not in a room. Please re-join.");
        showLobby();
    }
}

// Receive Message Listener with Decryption (only handles messages from OTHER users)
socket.on('receive_message', async (data) => {
    // Server only sends this to other users now, so always 'received'
    SoundUtils.playReceive();

    let displayMsg = data.message;

    // DECRYPT IF NEEDED
    if (data.encrypted && data.iv) {
        if (currentCryptoKey) {
            try {
                displayMsg = await CryptoUtils.decrypt({ iv: data.iv, data: data.message }, currentCryptoKey);
            } catch (e) {
                displayMsg = '🔒 Encrypted Message (decryption failed)';
            }
        } else {
            displayMsg = '🔒 Encrypted Message (You do not have the key)';
        }
    }

    const msgElement = addMessage(displayMsg, 'received', data.username, data.replyTo);

    // Handle Self-Destruct
    if (data.destruct && data.destruct > 0) {
        const timerSec = data.destruct / 1000;
        const timerSpan = document.createElement('span');
        timerSpan.style.fontSize = '0.7rem';
        timerSpan.style.color = '#ef4444';
        timerSpan.style.marginLeft = '10px';
        timerSpan.innerText = `💣 ${timerSec}s`;
        msgElement.appendChild(timerSpan);
        const burnDuration = 600;
        const burnStart = Math.max(0, data.destruct - burnDuration);
        setTimeout(() => {
            msgElement.classList.add('burn-out');
            setTimeout(() => msgElement.remove(), burnDuration);
        }, burnStart);
    }
});

function addMessage(text, type, sender, replyContext = null) {
    const div = document.createElement('div');
    div.classList.add('message', type);

    // Render Reply Quote if exists
    let replyQuoteElement = null;
    if (replyContext) {
        replyQuoteElement = document.createElement('div');
        replyQuoteElement.className = 'reply-quote';
        replyQuoteElement.addEventListener('click', () => highlightMessage(`msg-${replyContext.id}`));

        const userSpan = document.createElement('span');
        userSpan.className = 'quote-user';
        userSpan.textContent = replyContext.sender;

        const textSpan = document.createElement('span');
        textSpan.style.cssText = 'display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        textSpan.textContent = replyContext.text;

        replyQuoteElement.appendChild(userSpan);
        replyQuoteElement.appendChild(textSpan);
    }

    // Create the message content wrapper safely
    const contentSpan = document.createElement('span');
    contentSpan.classList.add('message-content');

    // Matrix Protocol: Scramble Effect for Received Messages
    if (type === 'received') {
        scrambleText(contentSpan, text);
    } else {
        contentSpan.textContent = text;
    }

    if (sender && type !== 'sent') {
        // Add reply quote element if exists
        if (replyQuoteElement) {
            div.appendChild(replyQuoteElement);
        }

        const senderSpan = document.createElement('span');
        senderSpan.classList.add('sender');
        senderSpan.textContent = sender;
        div.appendChild(senderSpan);
        div.appendChild(contentSpan);
    } else {
        // Add reply quote element if exists
        if (replyQuoteElement) {
            div.appendChild(replyQuoteElement);
        }
        div.appendChild(contentSpan);
    }

    // Attach Swipe Logic
    attachSwipeHandler(div, text, sender || 'You');

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
}

// Matrix Protocol: Hacker Typing Effect
function scrambleText(element, finalString) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let iterations = 0;

    element.classList.add('scramble-text');
    element.classList.add('scramble-active');

    const interval = setInterval(() => {
        element.innerText = finalString
            .split("")
            .map((letter, index) => {
                if (index < iterations) {
                    return finalString[index];
                }
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("");

        if (iterations >= finalString.length) {
            clearInterval(interval);
            element.classList.remove('scramble-active');
            element.innerText = finalString;
        }

        iterations += 1 / 2; // Speed
    }, 30);
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
        let label = "ðŸŽ¤ Voice Note";
        let pitchPreserve = true;

        if (data.voiceEffect === 'robot') {
            rate = 0.85; // Slightly slower
            label = "ðŸ¤– Robot Voice";
            pitchPreserve = false;
        } else if (data.voiceEffect === 'chipmunk') {
            rate = 1.5; // Fast & High Pitch
            label = "ðŸ¿ï¸ Chipmunk Voice";
            pitchPreserve = false;
        } else if (data.voiceEffect === 'monster') {
            rate = 0.6; // Slow & Deep Pitch
            label = "ðŸ‘¹ Monster Voice";
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

    // Apply Audio Effects Programmatically
    if (fileType.startsWith('audio/') && fileType !== 'audio/') {
        const audioElement = div.querySelector('audio');
        if (audioElement) {
            audioElement.playbackRate = rate;
            if (audioElement.webkitPreservesPitch !== undefined) audioElement.webkitPreservesPitch = pitchPreserve;
            if (audioElement.mozPreservesPitch !== undefined) audioElement.mozPreservesPitch = pitchPreserve;
        }
    }

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

function leaveChat() {
    eventListenersInitialized = false; // Reset flag for next join
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
    btn.innerText = "✔️ Copied!";
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
        document.title = "🔐 PrivyChat";
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
        btn.innerText = '👁️‍🗨️'; // Active
        showToast("Ghost Mode ON: Messages Blurred", "info");
    } else {
        btn.innerText = '👁️'; // Inactive
        showToast("Ghost Mode OFF", "info");
    }
}

function toggleTheme() {
    document.body.classList.toggle('hacker-theme');
    const isHacker = document.body.classList.contains('hacker-theme');
    showToast(isHacker ? "👨‍💻 Hacker Mode" : "🔐 Secure Mode", "success");
    if (isHacker) SoundUtils.playHacker(); // SFX
}

// --- Voice Notes ---
let mediaRecorder;
let audioChunks = [];
let activeStream = null;
let isRecording = false;

async function toggleRecording() {
    isRecording ? stopRecording() : await startRecording();
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeStream = stream;
        isRecording = true;

        let selectedType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) selectedType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) selectedType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) selectedType = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) selectedType = 'audio/mp4';

        mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

        mediaRecorder.onstop = () => {
            const mimeBase = selectedType.split(';')[0];
            const audioBlob = new Blob(audioChunks, { type: mimeBase });
            if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
            sendVoiceNote(audioBlob, mimeBase);
        };

        mediaRecorder.start();
        const btn = document.getElementById('mic-btn');
        if (btn) { btn.innerText = '🔴'; btn.title = 'Click to Stop & Send'; btn.style.cssText = 'background:rgba(239,68,68,0.25);border-color:#ef4444;'; }
        showToast('🎙️ Recording... click mic again to send.', 'info');
    } catch (err) {
        isRecording = false;
        console.error('Mic Error:', err);
        showToast('Microphone access denied. Check browser permissions.', 'error');
    }
}

function stopRecording() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
    const btn = document.getElementById('mic-btn');
    if (btn) { btn.innerText = '🎤'; btn.title = 'Record Voice Note'; btn.style.cssText = ''; }
}

function sendVoiceNote(blob, mimeType = 'audio/webm') {
    if (blob.size < 100) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        const rawDataUrl = evt.target.result;
        let fileData = rawDataUrl;
        let isEncrypted = false;
        let iv = null;

        if (currentCryptoKey) {
            const encrypted = await CryptoUtils.encrypt(fileData, currentCryptoKey);
            fileData = encrypted.data;
            iv = encrypted.iv;
            isEncrypted = true;
        }

        const voiceData = {
            room: currentRoom,
            username: myUsername,
            fileData: fileData,
            encrypted: isEncrypted,
            iv: iv,
            fileName: 'voice-note' + (mimeType.includes('mp4') ? '.m4a' : '.webm'),
            fileType: mimeType,
            voiceEffect: document.getElementById('voice-effect').value,
            timestamp: Date.now(),
            destruct: document.getElementById('destruct-timer').value
        };

        socket.emit('file_share', voiceData);

        // Immediately display sender's own voice note (server no longer echoes back to sender)
        addFileMessage({ ...voiceData, fileData: rawDataUrl }, 'sent');
    };
    reader.readAsDataURL(blob);
}

// --- Stealth Mode ---
let calcExpression = '';
function toggleStealth() {
    const overlay = document.getElementById('stealth-calculator');
    const isHidden = overlay.style.display === 'none';
    overlay.style.display = isHidden ? 'flex' : 'none';
    document.title = isHidden ? "Calculator" : "PrivyChat";
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
    const val = input ? input.value.trim() : '';

    console.log('Google Join called with value:', val);

    if (!val) {
        showToast("ðŸŒ Joining Public Lobby...", "info");
        userLoginFlow('General', null, 'group');
        return;
    }

    // --- DECOY VAULT LOGIC ---
    const lowerVal = val.toLowerCase();
    if (lowerVal === 'weather' || lowerVal === 'guest' || lowerVal === 'aether' || lowerVal === '1234') {
        showToast("Loading Weather Data...", "info");
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
    console.log('Creating 1v1 room:', roomUUID);
    // Auto-join this new 1v1 room
    userLoginFlow(roomUUID, null, '1v1');
    showToast("🎲 Generating Secure 1v1 Link...", "success");
}

function googleCreate() {
    // Show room creation modal instead of using prompt
    showRoomCreationModal();
}

function initializeChatRoomEventListeners() {
    if (eventListenersInitialized) {
        console.log('Event listeners already initialized, skipping...');
        return;
    }

    console.log('Initializing chat room event listeners...');

    // Direct event listener attachment
    const sendBtn = document.getElementById('send-btn');
    const attachBtn = document.getElementById('attach-btn');
    const msgInput = document.getElementById('msg-input');
    const micBtn = document.getElementById('mic-btn');

    console.log('Found elements:', {
        sendBtn: !!sendBtn,
        attachBtn: !!attachBtn,
        msgInput: !!msgInput,
        micBtn: !!micBtn
    });

    if (sendBtn) {
        sendBtn.onclick = null; // Clear any existing handlers
        sendBtn.removeEventListener('click', sendMessage); // Remove any existing
        sendBtn.addEventListener('click', function (e) {
            console.log('Send button clicked!');
            e.preventDefault();
            sendMessage();
        });
        console.log('Send button listener attached');
    }

    if (attachBtn) {
        attachBtn.onclick = null;
        attachBtn.addEventListener('click', function (e) {
            console.log('Attach button clicked!');
            e.preventDefault();
            document.getElementById('file-input').click();
        });
        console.log('Attach button listener attached');
    }

    if (msgInput) {
        msgInput.onkeypress = null;
        msgInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                console.log('Enter key pressed in message input');
                sendMessage();
            }
        });
        console.log('Message input listener attached');
    }

    if (micBtn) {
        micBtn.onmousedown = null; micBtn.onmouseup = null; micBtn.onmouseleave = null; micBtn.onclick = null;
        micBtn.addEventListener('click', toggleRecording);
        console.log('Mic button click-toggle listener attached');
    }

    eventListenersInitialized = true;
    console.log('All chat room event listeners initialized successfully');
}

function userLoginFlow(room, password, mode) {
    SoundUtils.init(); // Initialize Audio Context on user interaction (Click/Enter)
    if (!myUsername) {
        // Show username modal instead of prompt (CSP blocks prompt)
        showUsernameModal(room, password, mode);
        return;
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

// Room Creation Modal Functions
function showRoomCreationModal() {
    const modal = document.getElementById('room-creation-modal');
    const roomNameInput = document.getElementById('room-name-input');

    if (modal && roomNameInput) {
        modal.style.display = 'flex';
        roomNameInput.focus();
    }
}

function createPrivateRoom() {
    const roomNameInput = document.getElementById('room-name-input');
    const roomPasswordInput = document.getElementById('room-password-input');

    const roomName = roomNameInput.value.trim();
    const roomPassword = roomPasswordInput.value.trim();

    console.log('Create room called:', { roomName, roomPassword });

    if (!roomName) {
        showToast('Please enter a room name', 'error');
        return;
    }

    if (!roomPassword) {
        showToast('Please enter a room password', 'error');
        return;
    }

    if (roomName.length > 30) {
        showToast('Room name too long (max 30 characters)', 'error');
        return;
    }

    // Validate room name with the same regex as server
    if (!/^[a-zA-Z0-9_\- ]{1,30}$/.test(roomName)) {
        showToast('Invalid characters in room name', 'error');
        return;
    }

    closeRoomCreationModal();
    userLoginFlow(roomName, roomPassword, 'private');
}

function closeRoomCreationModal() {
    const modal = document.getElementById('room-creation-modal');
    if (modal) {
        modal.style.display = 'none';
        const roomNameInput = document.getElementById('room-name-input');
        const roomPasswordInput = document.getElementById('room-password-input');
        if (roomNameInput) roomNameInput.value = '';
        if (roomPasswordInput) roomPasswordInput.value = '';
    }
}

// Username Modal Functions
function showUsernameModal(room, password, mode) {
    const modal = document.getElementById('username-modal');
    const input = document.getElementById('username-input');

    if (modal && input) {
        input.value = ''; // Clear any existing value
        modal.style.display = 'flex';
        input.focus();

        // Store the pending join data
        window.pendingJoin = { room, password, mode };
    }
}

function submitUsername() {
    const input = document.getElementById('username-input');
    const username = input.value.trim();

    console.log('Submit username called with:', username);

    if (!username || username.length === 0) {
        showToast('❌ Please enter a nickname', 'error');
        return;
    }

    if (username.toLowerCase() === 'na') {
        showToast('❌ Username cannot be "na"', 'error');
        return;
    }

    if (username.length > 30) {
        showToast('❌ Nickname too long (max 30 characters)', 'error');
        return;
    }

    // Validate username with the same regex as server
    if (!/^[a-zA-Z0-9_\- ]{1,30}$/.test(username)) {
        showToast('❌ Invalid characters in nickname', 'error');
        return;
    }

    myUsername = username;
    console.log('Username set to:', myUsername);
    console.log('Global username variable:', window.myUsername);
    closeUsernameModal();

    // Continue with the join flow
    if (window.pendingJoin) {
        const { room, password, mode } = window.pendingJoin;
        console.log('Continuing join flow with username:', myUsername);
        userLoginFlow(room, password, mode);
        window.pendingJoin = null;
    }
}

function closeUsernameModal() {
    const modal = document.getElementById('username-modal');
    if (modal) {
        modal.style.display = 'none';
        const input = document.getElementById('username-input');
        if (input) input.value = '';
    }
}

function submitPasswordModal() {
    const input = document.getElementById('modal-pass-input');
    const password = input.value.trim();

    if (!password) {
        showToast('Please enter password', 'error');
        return;
    }

    closePasswordModal();

    // Continue with stored join flow
    if (window.pendingPasswordJoin) {
        const { room, mode } = window.pendingPasswordJoin;
        currentPassword = password;
        socket.emit('join_room', { room, password, username: myUsername, type: mode });
        window.pendingPasswordJoin = null;
    }
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.style.display = 'none';
        const input = document.getElementById('modal-pass-input');
        if (input) input.value = '';
    }
}

function showPasswordModal(room, mode) {
    const modal = document.getElementById('password-modal');
    const input = document.getElementById('modal-pass-input');

    if (modal && input) {
        modal.style.display = 'flex';
        input.focus();

        // Store the pending join data
        window.pendingPasswordJoin = { room, mode };
    }
}

function handleModalKey(e) {
    if (e.key === 'Enter') {
        const activeModal = document.querySelector('.modal-overlay[style*="flex"]');
        if (activeModal) {
            if (activeModal.id === 'password-modal') {
                submitPasswordModal();
            } else if (activeModal.id === 'username-modal') {
                submitUsername();
            }
        }
    }
}

// Initialize Event Listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Starting initialization');

    // Register Service Worker with automatic update invalidation
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').then(reg => {
            reg.update().catch(() => {});
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('SKIP_WAITING');
                        }
                    });
                }
            });
        }).catch(err => console.log('SW Failed:', err));
    }


    // Check if all main elements exist
    const elementsCheck = {
        'send-btn': document.getElementById('send-btn'),
        'attach-btn': document.getElementById('attach-btn'),
        'msg-input': document.getElementById('msg-input'),
        'mic-btn': document.getElementById('mic-btn'),
        'google-input': document.getElementById('google-input'),
        'google-join-btn': document.getElementById('google-join-btn')
    };

    console.log('Element availability check:', elementsCheck);

    // Add global click debugging
    document.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON') {
            console.log('Button clicked:', {
                id: e.target.id,
                className: e.target.className,
                text: e.target.textContent,
                target: e.target
            });
        }
    });

    // Header buttons
    const stealthBtn = document.getElementById('stealth-btn');
    const themeBtn = document.getElementById('theme-btn');
    const panicBtn = document.getElementById('panic-btn');

    if (stealthBtn) stealthBtn.addEventListener('click', toggleStealth);
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    if (panicBtn) panicBtn.addEventListener('click', panicMode);

    // Google input handlers
    const googleInput = document.getElementById('google-input');
    const micBtn = document.getElementById('mic-btn-google');

    if (googleInput) googleInput.addEventListener('keypress', handleGoogleEnter);
    if (micBtn) micBtn.addEventListener('click', startGoogleMic);

    // Google buttons
    const joinBtn = document.getElementById('google-join-btn');
    const createBtn = document.getElementById('google-create-btn');
    const luckyBtn = document.getElementById('google-1v1-btn');

    if (joinBtn) joinBtn.addEventListener('click', googleJoin);
    if (createBtn) createBtn.addEventListener('click', googleCreate);
    if (luckyBtn) luckyBtn.addEventListener('click', google1v1);

    // Footer links
    const locationLink = document.getElementById('location-link');
    const aboutLink = document.getElementById('about-link');
    const featureLink = document.getElementById('feature-link');
    const securityLink = document.getElementById('security-link');
    const privacyLink = document.getElementById('privacy-link');
    const termsLink = document.getElementById('terms-link');

    if (locationLink) locationLink.addEventListener('click', () => openInfo('location'));
    // if (aboutLink) aboutLink.addEventListener('click', () => openInfo('about'));
    if (featureLink) featureLink.addEventListener('click', () => openInfo('feature'));
    if (securityLink) securityLink.addEventListener('click', () => openInfo('security'));
    if (privacyLink) privacyLink.addEventListener('click', () => openInfo('privacy'));
    if (termsLink) termsLink.addEventListener('click', () => openInfo('terms'));

    // Chat room elements - Add direct listeners
    const sendBtn = document.getElementById('send-btn');
    const attachBtn = document.getElementById('attach-btn');
    const msgInput = document.getElementById('msg-input');

    if (sendBtn) {
        sendBtn.addEventListener('click', function (e) {
            console.log('Send button clicked (main)!');
            e.preventDefault();
            sendMessage();
        });
    }

    if (attachBtn) {
        attachBtn.addEventListener('click', function (e) {
            console.log('Attach button clicked (main)!');
            e.preventDefault();
            document.getElementById('file-input').click();
        });
    }

    if (msgInput) {
        msgInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                console.log('Enter pressed (main)!');
                sendMessage();
            }
        });
    }

    // Chat room elements
    const ghostModeBtn = document.getElementById('ghost-mode-btn');
    const voiceCallBtn = document.getElementById('voice-call-btn');
    const videoCallBtn = document.getElementById('video-call-btn');
    const userCount = document.getElementById('user-count');
    const leaveChatBtn = document.getElementById('leave-chat-btn');
    const micBtnChat = document.getElementById('mic-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const submitPasswordBtn = document.getElementById('submit-password-btn');
    const closePasswordModalBtn = document.getElementById('close-password-modal-btn');
    const modalPassInput = document.getElementById('modal-pass-input');
    const submitUsernameBtn = document.getElementById('submit-username-btn');
    const cancelUsernameBtn = document.getElementById('cancel-username-btn');
    const usernameInput = document.getElementById('username-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const cancelRoomCreationBtn = document.getElementById('cancel-room-creation-btn');
    const roomNameInput = document.getElementById('room-name-input');
    const roomPasswordInput = document.getElementById('room-password-input');

    if (ghostModeBtn) ghostModeBtn.addEventListener('click', toggleGhostMode);
    if (voiceCallBtn) voiceCallBtn.addEventListener('click', () => startCall('voice'));
    if (videoCallBtn) videoCallBtn.addEventListener('click', () => startCall('video'));
    if (userCount) userCount.addEventListener('click', toggleUserList);
    if (leaveChatBtn) leaveChatBtn.addEventListener('click', leaveChat);
    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', cancelReply);
    if (submitPasswordBtn) submitPasswordBtn.addEventListener('click', submitPasswordModal);
    if (closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', closePasswordModal);
    if (submitUsernameBtn) submitUsernameBtn.addEventListener('click', submitUsername);
    if (cancelUsernameBtn) cancelUsernameBtn.addEventListener('click', closeUsernameModal);
    if (createRoomBtn) createRoomBtn.addEventListener('click', createPrivateRoom);
    if (cancelRoomCreationBtn) cancelRoomCreationBtn.addEventListener('click', closeRoomCreationModal);

    // Input event handlers  
    if (modalPassInput) modalPassInput.addEventListener('keypress', handleModalKey);
    if (usernameInput) usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitUsername();
    });
    if (roomNameInput) roomNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('room-password-input').focus();
    });
    if (roomPasswordInput) roomPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createPrivateRoom();
    });

    // Mic button click-toggle: click once to start recording (🔴), click again to stop & send
    if (micBtnChat) {
        micBtnChat.onmousedown = null; micBtnChat.onmouseup = null; micBtnChat.onmouseleave = null; micBtnChat.onclick = null;
        micBtnChat.addEventListener('click', toggleRecording);
    }

    // Modal event listeners
    const infoModal = document.getElementById('info-modal');
    const userListModal = document.getElementById('user-list-modal');
    const closeInfoModalBtn = document.getElementById('close-info-modal-btn');
    const closeUserListBtn = document.getElementById('close-user-list-btn');
    const acceptCallBtn = document.getElementById('accept-call-btn');
    const rejectCallBtn = document.getElementById('reject-call-btn');
    const toggleMuteBtn = document.getElementById('toggle-mute-btn');
    const toggleCamBtn = document.getElementById('toggle-cam-btn');
    const endCallBtn = document.getElementById('end-call-btn');

    if (infoModal) infoModal.addEventListener('click', (e) => { if (e.target === infoModal) closeInfoModal(); });
    if (userListModal) userListModal.addEventListener('click', (e) => { if (e.target === userListModal) toggleUserList(); });
    if (closeInfoModalBtn) closeInfoModalBtn.addEventListener('click', closeInfoModal);
    if (closeUserListBtn) closeUserListBtn.addEventListener('click', toggleUserList);
    if (acceptCallBtn) acceptCallBtn.addEventListener('click', acceptCall);
    if (rejectCallBtn) rejectCallBtn.addEventListener('click', rejectCall);
    if (toggleMuteBtn) toggleMuteBtn.addEventListener('click', toggleMute);
    if (toggleCamBtn) toggleCamBtn.addEventListener('click', toggleCam);
    if (endCallBtn) endCallBtn.addEventListener('click', endCall);

    // Calculator buttons event delegation
    const calcGrid = document.querySelector('.calc-grid');
    if (calcGrid) {
        calcGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-calc')) {
                const input = e.target.getAttribute('data-input');
                if (input) calcInput(input);
            }
        });
    }

    /* --- Operation Invisible Ink (Steganography) --- */
    const stegBtn = document.getElementById('steg-btn');
    const stegModal = document.getElementById('steg-modal');
    const closeStegBtn = document.getElementById('close-steg-modal-btn');
    const stegTabs = document.querySelectorAll('.steg-tab');

    // Toggle Modal
    if (stegBtn) stegBtn.addEventListener('click', () => {
        stegModal.style.display = 'flex';
    });

    if (closeStegBtn) closeStegBtn.addEventListener('click', () => {
        stegModal.style.display = 'none';
    });

    // Tab Switching
    stegTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs & panels
            stegTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.steg-panel').forEach(p => p.classList.remove('active'));

            // Activate clicked tab
            tab.classList.add('active');
            const targetPanel = document.getElementById(`steg-${tab.dataset.tab}-panel`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // --- ENCODE LOGIC ---
    const stegDropZone = document.getElementById('steg-drop-zone');
    const stegUploadInput = document.getElementById('steg-upload-input');
    const stegPreviewImg = document.getElementById('steg-preview-img');
    const stegEncodeBtn = document.getElementById('steg-encode-btn');
    let stegSelectedFile = null;

    if (stegDropZone) {
        stegDropZone.addEventListener('click', () => stegUploadInput.click());

        stegDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            stegDropZone.style.borderColor = 'var(--g-blue)';
        });

        stegDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            stegDropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        });

        stegDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            stegDropZone.style.borderColor = 'rgba(255,255,255,0.2)';
            if (e.dataTransfer.files.length > 0) handleStegFile(e.dataTransfer.files[0]);
        });
    }

    if (stegUploadInput) {
        stegUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleStegFile(e.target.files[0]);
        });
    }

    function handleStegFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('❌ Not an image file', 'error');
            return;
        }
        stegSelectedFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            stegPreviewImg.src = e.target.result;
            document.getElementById('steg-preview-container').style.display = 'block';
            stegDropZone.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    if (stegEncodeBtn) {
        stegEncodeBtn.addEventListener('click', async () => {
            const secretText = document.getElementById('steg-text-input').value;
            if (!stegSelectedFile || !secretText) {
                showToast('❌ Please select image and enter text', 'error');
                return;
            }

            stegEncodeBtn.innerText = "🔒 Processing...";
            stegEncodeBtn.disabled = true;

            try {
                // Encode
                const encodedDataUrl = await StegUtils.encode(stegSelectedFile, secretText);

                // Trigger Download
                const link = document.createElement('a');
                link.download = 'secret_image.png'; // Force PNG
                link.href = encodedDataUrl;
                link.click();

                showToast('✅ Encrypted Image Downloaded!', 'success');
                stegEncodeBtn.innerText = "🔒 Encrypt & Download";
                stegEncodeBtn.disabled = false;

                // Clear inputs
                document.getElementById('steg-text-input').value = '';

            } catch (err) {
                console.error("Steg Error:", err);
                showToast('❌ Failed: Message too long or bad image', 'error');
                stegEncodeBtn.innerText = "🔒 Encrypt & Download";
                stegEncodeBtn.disabled = false;
            }
        });
    }

    // --- DECODE LOGIC ---
    const stegDecodeBtn = document.getElementById('steg-decode-btn');
    const stegDecodeInput = document.getElementById('steg-decode-input');

    if (stegDecodeBtn) stegDecodeBtn.addEventListener('click', () => stegDecodeInput.click());

    if (stegDecodeInput) {
        stegDecodeInput.addEventListener('change', async (e) => {
            if (e.target.files.length === 0) return;
            const file = e.target.files[0];

            try {
                const message = await StegUtils.decode(file);
                if (message) {
                    document.getElementById('steg-result-text').innerText = message;
                    document.getElementById('steg-result-area').style.display = 'block';
                    showToast('🔓 Message Found!', 'success');
                } else {
                    document.getElementById('steg-result-text').innerText = "(No hidden data found)";
                    document.getElementById('steg-result-area').style.display = 'block';
                    showToast('⚠️ No secret message detected', 'error');
                }
            } catch (err) {
                console.error("Decode Error:", err);
                showToast('❌ Decoding Failed', 'error');
            }
        });
    }
});
// User List Modal Toggle
function toggleUserList() {
    const modal = document.getElementById('user-list-modal');
    if (modal) {
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) {
            renderUserList();
        }
    }
}

function renderUserList() {
    const container = document.getElementById('user-list-container');
    if (container && roomUsers) {
        if (roomUsers.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#9aa0a6;">No users online</div>';
            return;
        }

        let html = '';
        roomUsers.forEach(user => {
            const isSelf = user === myUsername;
            html += `<div style="padding:8px; background:rgba(255,255,255,0.05); margin:5px 0; border-radius:8px; display:flex; align-items:center; gap:10px;">
                <span style="width:8px; height:8px; background:#10b981; border-radius:50%;"></span>
                <span>${user}${isSelf ? ' (You)' : ''}</span>
            </div>`;
        });
        container.innerHTML = html;
    }
}
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
            callStatus.innerText = "Calling...";
        } else {
            document.getElementById('remote-video').style.display = 'block';
            callStatus.innerText = "Calling...";
        }

        peerConnection = createPeerConnection();

        // Add Tracks
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send Offer
        socket.emit('call_user', { room: currentRoom, offer: offer, callType: type });
        callStatus.innerText = "Ringing..."; // Update status after send
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
    modalTitle.innerText = data.callType === 'voice' ? 'Incoming Voice Call...' : 'Incoming Video Call...';

    incomingModal.style.display = 'flex';
    SoundUtils.playRing(); // Start Ringing!
});

// 3. Receiver Accepts
async function acceptCall() {
    SoundUtils.stopRing(); // Stop Ringing
    incomingModal.style.display = 'none';
    try {
        const type = incomingCallData.callType || 'video';
        callStatus.innerText = "Connecting..."; // Initial output

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
            callStatus.innerText = "Reconnecting...";
            // showToast("Call Reconnecting...", "info");
        } else if (state === 'failed') {
            callStatus.innerText = "Call Failed";
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
    SoundUtils.stopRing(); // Stop ringtone if active
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    videoOverlay.style.display = 'none';
    incomingModal.style.display = 'none'; // Ensure modal closes
    incomingCallData = null;
    socket.emit('end_call', { room: currentRoom });
}

socket.on('end_call', () => {
    SoundUtils.stopRing(); // Stop ringtone
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    videoOverlay.style.display = 'none';
    incomingModal.style.display = 'none'; // Close modal if open
    incomingCallData = null;
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

/* --- Header Kebab Menu Logic --- */
const headerKebabBtn = document.getElementById('header-kebab-btn');
const headerDropdown = document.getElementById('header-dropdown');

if (headerKebabBtn && headerDropdown) {
    // Toggle Menu
    headerKebabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerDropdown.classList.toggle('show');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!headerDropdown.contains(e.target) && e.target !== headerKebabBtn) {
            headerDropdown.classList.remove('show');
        }
    });

    // Close when an item is clicked
    headerDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            headerDropdown.classList.remove('show');
        });
    });
}
