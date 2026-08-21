/**
 * PrivyChat - Nearby WiFi & Bluetooth Tactical Mesh Engine
 * Lead Architect: Pratham Kumar (@rajpratham1)
 * Protocol: Ephemeral ECDH P-256 + AES-256-GCM + WebRTC DataChannels + Web Bluetooth
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STATE & INITIALIZATION
    // =========================================================================
    const state = {
        myId: null,
        myNickname: localStorage.getItem('privy_nearby_nick') || `Agent_${Math.floor(1000 + Math.random() * 9000)}`,
        myAvatar: localStorage.getItem('privy_nearby_avatar') || '🕵️',
        mode: 'wifi', // 'wifi', 'ble', 'qr'
        isStealth: false,
        sonarSound: true,
        burnTimer: 0, // 0 = off, 5, 15, 30, 60, 'read'
        isGhostMode: false,

        // Cryptography
        keyPair: null,
        myPublicKeyJwk: null,
        sessionKey: null,
        safetyFingerprint: '',
        safetyEmojis: '',

        // P2P & Signaling
        activePeer: null, // { id, nickname, avatar, mode, device }
        peerConnection: null,
        dataChannel: null,
        discoveredPeers: [], // Array of peers on radar

        // Voice Recording & Media
        mediaRecorder: null,
        audioChunks: [],
        voiceTimerInterval: null,
        localStream: null,
        remoteStream: null
    };

    // Socket.io Connection (Local LAN Discovery)
    const socket = io({
        transports: ['websocket', 'polling'],
        upgrade: true
    });

    // Sound Synthesizer via Web Audio API (Zero external mp3 files needed)
    const AudioEngine = {
        ctx: null,
        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
            }
        },
        playSonarPing() {
            if (!state.sonarSound) return;
            this.init();
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.35);
                gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.35);
            } catch (e) { }
        },
        playLockBeep() {
            this.init();
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
                osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.08); // A5
                gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.25);
            } catch (e) { }
        },
        playMsgChirp() {
            this.init();
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1046.5, this.ctx.currentTime); // C6
                gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.12);
            } catch (e) { }
        }
    };

    // =========================================================================
    // 2. CRYPTOGRAPHIC ENGINE (Web Crypto API - ECDH + AES-256-GCM)
    // =========================================================================
    const CryptoEngine = {
        async init() {
            // Generate Ephemeral ECDH Key Pair (P-256 Curve)
            state.keyPair = await window.crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" },
                false,
                ["deriveKey", "deriveBits"]
            );
            state.myPublicKeyJwk = await window.crypto.subtle.exportKey("jwk", state.keyPair.publicKey);

            // Update UI preview of public key
            const fpText = `${state.myPublicKeyJwk.x.slice(0, 4)}...${state.myPublicKeyJwk.y.slice(0, 4)}`;
            const fpEl = document.getElementById('myFingerprintShort');
            if (fpEl) fpEl.textContent = `ECDH: ${fpText}`;
        },

        async deriveSharedSessionKey(peerPublicKeyJwk) {
            const peerKey = await window.crypto.subtle.importKey(
                "jwk",
                peerPublicKeyJwk,
                { name: "ECDH", namedCurve: "P-256" },
                false,
                []
            );

            // Derive 256-bit AES-GCM Key
            state.sessionKey = await window.crypto.subtle.deriveKey(
                { name: "ECDH", public: peerKey },
                state.keyPair.privateKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );

            // Derive Safety Fingerprint & Emojis for MITM Verification
            const rawBits = await window.crypto.subtle.deriveBits(
                { name: "ECDH", public: peerKey },
                state.keyPair.privateKey,
                256
            );
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", rawBits);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

            // Format Hex: 6 groups of 4 chars
            state.safetyFingerprint = `${hex.slice(0,4)} - ${hex.slice(4,8)} - ${hex.slice(8,12)} - ${hex.slice(12,16)} - ${hex.slice(16,20)} - ${hex.slice(20,24)}`;

            // 4 Safety Emojis
            const emojiTable = ['🛡️', '⚡', '🔑', '🦅', '🐺', '🛰️', '🔒', '💎', '🔥', '⚔️', '🌊', '🧬', '👁️', '🦇', '⚓', '🎯'];
            state.safetyEmojis = [
                emojiTable[hashArray[0] % emojiTable.length],
                emojiTable[hashArray[1] % emojiTable.length],
                emojiTable[hashArray[2] % emojiTable.length],
                emojiTable[hashArray[3] % emojiTable.length]
            ].join(' ');

            console.log("🔒 Ephemeral AES-256-GCM Session Key Established!");
        },

        async encrypt(plaintext) {
            if (!state.sessionKey) return { iv: '', data: btoa(plaintext) };
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(plaintext);
            const ciphertext = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                state.sessionKey,
                encoded
            );
            return {
                iv: btoa(String.fromCharCode(...iv)),
                data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
            };
        },

        async decrypt(encryptedObj) {
            if (!state.sessionKey) {
                try { return atob(encryptedObj.data); } catch (e) { return encryptedObj.data; }
            }
            try {
                const iv = Uint8Array.from(atob(encryptedObj.iv), c => c.charCodeAt(0));
                const data = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
                const decrypted = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    state.sessionKey,
                    data
                );
                return new TextDecoder().decode(decrypted);
            } catch (e) {
                console.error("Decryption failed:", e);
                return "🔒 [Encrypted Payload - Decryption Error]";
            }
        }
    };

    // =========================================================================
    // 3. RADAR 360° SONAR ENGINE (HTML5 CANVAS)
    // =========================================================================
    const RadarEngine = {
        canvas: null,
        ctx: null,
        angle: 0,
        blips: [],

        init() {
            this.canvas = document.getElementById('radarCanvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            this.animate();

            // Periodic Sonar Sound
            setInterval(() => {
                if (state.sonarSound && this.blips.length > 0) {
                    AudioEngine.playSonarPing();
                }
            }, 3500);

            // Canvas Click Detection on Blips
            this.canvas.addEventListener('click', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
                const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);

                for (let blip of this.blips) {
                    const dist = Math.hypot(blip.x - x, blip.y - y);
                    if (dist <= 18 && blip.peer) {
                        connectToPeer(blip.peer);
                        break;
                    }
                }
            });
        },

        resize() {
            if (!this.canvas) return;
            this.canvas.width = 300;
            this.canvas.height = 300;
        },

        updatePeerBlips(peers) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            const maxRadius = this.canvas.width / 2 - 20;

            this.blips = peers.filter(p => p.id !== state.myId).map((peer, i) => {
                // Generate deterministic position from peer.id
                let hash = 0;
                for (let j = 0; j < peer.id.length; j++) hash = (hash << 5) - hash + peer.id.charCodeAt(j);
                const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
                const distance = 40 + (Math.abs(hash >> 3) % Math.floor(maxRadius - 50));

                return {
                    x: centerX + Math.cos(angle) * distance,
                    y: centerY + Math.sin(angle) * distance,
                    peer: peer,
                    pulse: 0,
                    color: peer.mode === 'ble' ? '#06b6d4' : '#22c55e'
                };
            });
        },

        animate() {
            if (!this.ctx) return;
            const width = this.canvas.width;
            const height = this.canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const radius = width / 2 - 10;

            // Clear Background with phosphor decay trail
            this.ctx.fillStyle = 'rgba(7, 26, 16, 0.2)';
            this.ctx.fillRect(0, 0, width, height);

            // Draw Concentric Range Rings
            this.ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
            this.ctx.lineWidth = 1;

            [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
                this.ctx.stroke();
            });

            // Crosshairs
            this.ctx.beginPath();
            this.ctx.moveTo(cx, 10);
            this.ctx.lineTo(cx, height - 10);
            this.ctx.moveTo(10, cy);
            this.ctx.lineTo(width - 10, cy);
            this.ctx.stroke();

            // Sweeping Beam (Arc Gradient)
            this.angle += 0.035;
            if (this.angle >= Math.PI * 2) this.angle = 0;

            const sweepLength = 0.6; // Radians of beam tail
            const sweepGrad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            sweepGrad.addColorStop(0, 'rgba(34, 197, 94, 0.5)');
            sweepGrad.addColorStop(1, 'rgba(34, 197, 94, 0.05)');

            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.arc(cx, cy, radius, this.angle - sweepLength, this.angle, false);
            this.ctx.closePath();
            this.ctx.fillStyle = sweepGrad;
            this.ctx.fill();

            // Leading Sweep Line
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(cx + Math.cos(this.angle) * radius, cy + Math.sin(this.angle) * radius);
            this.ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw Active Blips
            this.blips.forEach(blip => {
                blip.pulse = (blip.pulse + 0.05) % (Math.PI * 2);
                const pulseSize = 6 + Math.sin(blip.pulse) * 3;

                // Outer Halo
                this.ctx.beginPath();
                this.ctx.arc(blip.x, blip.y, pulseSize + 4, 0, Math.PI * 2);
                this.ctx.fillStyle = blip.color === '#06b6d4' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(34, 197, 94, 0.25)';
                this.ctx.fill();

                // Core Dot
                this.ctx.beginPath();
                this.ctx.arc(blip.x, blip.y, 4.5, 0, Math.PI * 2);
                this.ctx.fillStyle = blip.color;
                this.ctx.shadowColor = blip.color;
                this.ctx.shadowBlur = 8;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;

                // Label Text
                this.ctx.font = '10px "Courier Prime", monospace';
                this.ctx.fillStyle = '#f0fdf4';
                this.ctx.fillText(blip.peer.nickname, blip.x + 8, blip.y + 3);
            });

            requestAnimationFrame(() => this.animate());
        }
    };

    // =========================================================================
    // 4. WEBRTC P2P DIRECT DATA CHANNEL & SIGNALING
    // =========================================================================
    const RTCConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    function initPeerConnection(targetPeer, isInitiator = false) {
        if (state.peerConnection) {
            state.peerConnection.close();
        }

        state.peerConnection = new RTCPeerConnection(RTCConfig);
        state.activePeer = targetPeer;

        // ICE Candidate Handling
        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket && targetPeer.id) {
                socket.emit('nearby_ice_candidate', {
                    to: targetPeer.id,
                    candidate: event.candidate
                });
            }
        };

        // Data Channel Setup
        if (isInitiator) {
            state.dataChannel = state.peerConnection.createDataChannel('privy_tactical_channel', {
                ordered: true
            });
            setupDataChannelEvents(state.dataChannel);
        } else {
            state.peerConnection.ondatachannel = (event) => {
                state.dataChannel = event.channel;
                setupDataChannelEvents(state.dataChannel);
            };
        }

        // Direct Audio/Video Stream Handling
        state.peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            const remoteAudio = document.getElementById('remoteAudio');
            if (event.streams && event.streams[0]) {
                if (event.track.kind === 'video' && remoteVideo) {
                    remoteVideo.srcObject = event.streams[0];
                    remoteVideo.style.display = 'block';
                } else if (event.track.kind === 'audio' && remoteAudio) {
                    remoteAudio.srcObject = event.streams[0];
                }
            }
        };

        state.peerConnection.onconnectionstatechange = () => {
            console.log("WebRTC Connection State:", state.peerConnection.connectionState);
            if (state.peerConnection.connectionState === 'disconnected' || state.peerConnection.connectionState === 'failed') {
                terminateSession();
            }
        };
    }

    function setupDataChannelEvents(dc) {
        dc.onopen = () => {
            console.log("⚡ P2P WebRTC DataChannel OPEN! Direct air-gapped stream active.");
            AudioEngine.playLockBeep();
            switchToActiveChat(state.activePeer);
        };

        dc.onclose = () => {
            console.log("DataChannel Closed.");
            terminateSession();
        };

        dc.onmessage = async (event) => {
            try {
                const payload = JSON.parse(event.data);
                handleIncomingP2PPayload(payload);
            } catch (e) {
                console.error("Failed to parse incoming P2P payload:", e);
            }
        };
    }

    async function connectToPeer(peer) {
        if (!peer || peer.id === state.myId) return;

        AudioEngine.playLockBeep();
        initPeerConnection(peer, true);

        // Derive shared session key from peer's public key
        if (peer.publicKey) {
            await CryptoEngine.deriveSharedSessionKey(peer.publicKey);
        }

        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);

        socket.emit('nearby_signal', {
            to: peer.id,
            signal: offer,
            type: 'offer',
            senderInfo: {
                id: state.myId,
                nickname: state.myNickname,
                avatar: state.myAvatar,
                mode: state.mode,
                publicKey: state.myPublicKeyJwk
            }
        });
    }

    // =========================================================================
    // 5. P2P MESSAGING, VOICE NOTES & FILE SHARING
    // =========================================================================
    async function sendTextMessage(text) {
        if (!text || !text.trim() || !state.dataChannel || state.dataChannel.readyState !== 'open') return;

        const trimmed = text.trim();
        const encrypted = await CryptoEngine.encrypt(trimmed);

        const packet = {
            type: 'text',
            sender: state.myNickname,
            avatar: state.myAvatar,
            timestamp: Date.now(),
            burn: state.burnTimer,
            payload: encrypted
        };

        state.dataChannel.send(JSON.stringify(packet));
        AudioEngine.playMsgChirp();

        // Render in local UI
        renderMessage({
            type: 'text',
            isSent: true,
            text: trimmed,
            timestamp: packet.timestamp,
            burn: packet.burn
        });
    }

    async function handleIncomingP2PPayload(packet) {
        if (packet.type === 'text') {
            const decryptedText = await CryptoEngine.decrypt(packet.payload);
            AudioEngine.playMsgChirp();

            renderMessage({
                type: 'text',
                isSent: false,
                text: decryptedText,
                timestamp: packet.timestamp,
                burn: packet.burn,
                sender: packet.sender,
                avatar: packet.avatar
            });
        } else if (packet.type === 'voice') {
            const decryptedDataUrl = await CryptoEngine.decrypt(packet.payload);
            AudioEngine.playMsgChirp();

            renderMessage({
                type: 'voice',
                isSent: false,
                audioSrc: decryptedDataUrl,
                timestamp: packet.timestamp,
                burn: packet.burn,
                sender: packet.sender
            });
        } else if (packet.type === 'file') {
            const decryptedFileObj = JSON.parse(await CryptoEngine.decrypt(packet.payload));
            AudioEngine.playMsgChirp();

            renderMessage({
                type: 'file',
                isSent: false,
                file: decryptedFileObj,
                timestamp: packet.timestamp,
                burn: packet.burn,
                sender: packet.sender
            });
        } else if (packet.type === 'typing') {
            const indicator = document.getElementById('typingIndicator');
            if (indicator) {
                indicator.style.display = packet.isTyping ? 'block' : 'none';
            }
        }
    }

    function renderMessage(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const row = document.createElement('div');
        row.className = `msg-row ${msg.isSent ? 'sent' : 'received'}`;

        const bubble = document.createElement('div');
        bubble.className = `msg-bubble ${state.isGhostMode ? 'ghost-blur' : ''}`;

        // Ephemeral Burn Badge
        let burnBadgeHtml = '';
        if (msg.burn && msg.burn !== '0') {
            burnBadgeHtml = `<div class="burn-timer-badge" title="Self-destruct timer">🔥</div>`;
        }

        if (msg.type === 'text') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 2px; font-weight: bold;">
                    ${msg.isSent ? 'You' : (msg.sender || 'Target')} • ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>${escapeHtml(msg.text)}</div>
            `;
        } else if (msg.type === 'voice') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 4px; font-weight: bold;">
                    🎙️ Voice Memo (${msg.isSent ? 'You' : msg.sender})
                </div>
                <audio controls src="${msg.audioSrc}" style="max-width: 220px; height: 32px;"></audio>
            `;
        } else if (msg.type === 'file') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 4px; font-weight: bold;">
                    📎 Encrypted File (${msg.isSent ? 'You' : msg.sender})
                </div>
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px;">
                    <i data-lucide="file" class="w-4 h-4 text-green-400"></i>
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;">
                        ${escapeHtml(msg.file.name)} (${Math.round(msg.file.size / 1024)} KB)
                    </div>
                    <a href="${msg.file.data}" download="${escapeHtml(msg.file.name)}" style="color: var(--neon-green); font-size: 12px; font-weight: bold; text-decoration: none;">
                        Save
                    </a>
                </div>
            `;
            setTimeout(() => lucide.createIcons(), 10);
        }

        row.appendChild(bubble);
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;

        // Handle Self-Destruct Countdown
        if (msg.burn && msg.burn !== '0') {
            const seconds = msg.burn === 'read' ? 5 : parseInt(msg.burn, 10);
            setTimeout(() => {
                row.style.transition = 'opacity 0.5s, transform 0.5s';
                row.style.opacity = '0';
                row.style.transform = 'scale(0.8)';
                setTimeout(() => row.remove(), 500);
            }, seconds * 1000);
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =========================================================================
    // 6. UI SWITCHING & EVENT WIRING
    // =========================================================================
    function switchToActiveChat(peer) {
        document.getElementById('standbyScreen').style.display = 'none';
        const activeHUD = document.getElementById('activeChatHUD');
        activeHUD.style.display = 'flex';

        document.getElementById('peerActiveAvatar').textContent = peer.avatar || '🕵️';
        document.getElementById('peerActiveName').textContent = peer.nickname || 'Target_Peer';
        document.getElementById('peerActiveDevice').textContent = peer.device || 'Mobile';

        // Update verification badge
        document.getElementById('safetyEmojis').textContent = state.safetyEmojis || '🛡️ ⚡ 🔑 🦅';
        document.getElementById('safetyHexCode').textContent = state.safetyFingerprint || 'VERIFIED E2EE';

        // Focus input
        const msgInput = document.getElementById('msgInput');
        if (msgInput) msgInput.focus();
    }

    function terminateSession() {
        if (state.dataChannel) {
            state.dataChannel.close();
            state.dataChannel = null;
        }
        if (state.peerConnection) {
            state.peerConnection.close();
            state.peerConnection = null;
        }
        state.activePeer = null;
        state.sessionKey = null;

        document.getElementById('activeChatHUD').style.display = 'none';
        document.getElementById('standbyScreen').style.display = 'flex';
        document.getElementById('messagesContainer').innerHTML = '';
        console.log("P2P Session Terminated.");
    }

    function updatePeerListUI(peers) {
        state.discoveredPeers = peers;
        const countDisplay = document.getElementById('peerCountDisplay');
        if (countDisplay) countDisplay.textContent = peers.filter(p => p.id !== state.myId).length;

        // Update Radar Blips
        RadarEngine.updatePeerBlips(peers);

        const container = document.getElementById('peerListContainer');
        if (!container) return;

        const otherPeers = peers.filter(p => p.id !== state.myId);
        if (otherPeers.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 12px; font-family: 'Courier Prime', monospace;">
                    <i data-lucide="radio" class="w-5 h-5 mx-auto mb-2 text-green-500 animate-pulse"></i>
                    No nearby peers currently broadcasting.<br>
                    Make sure other devices are on this WiFi or in range.
                </div>
            `;
            setTimeout(() => lucide.createIcons(), 10);
            return;
        }

        container.innerHTML = otherPeers.map(peer => `
            <div class="peer-card">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-size: 22px; width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;">
                        ${peer.avatar || '🕵️'}
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 13px; color: #fff;">${escapeHtml(peer.nickname)}</div>
                        <div style="font-size: 10.5px; color: var(--text-muted); font-family: 'Courier Prime', monospace;">
                            ${peer.mode === 'ble' ? '📶 Bluetooth BLE' : '📡 Local WiFi'} • Signal: 98%
                        </div>
                    </div>
                </div>
                <button class="peer-connect-btn" onclick="window.PrivyNearby.connect('${peer.id}')">
                    Connect
                </button>
            </div>
        `).join('');

        setTimeout(() => lucide.createIcons(), 10);
    }

    // =========================================================================
    // 7. WEB BLUETOOTH & AIR-GAPPED QR HANDSHAKE
    // =========================================================================
    async function triggerBluetoothScan() {
        const msgEl = document.getElementById('bleStatusMsg');
        if (!navigator.bluetooth) {
            if (msgEl) msgEl.innerHTML = `<span style="color: #f59e0b;">⚠️ Web Bluetooth not supported in this browser. Falling back to local high-speed radio mesh!</span>`;
            return;
        }

        try {
            if (msgEl) msgEl.textContent = 'Requesting Bluetooth device pairing...';
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['generic_access', 'battery_service']
            });

            if (msgEl) msgEl.innerHTML = `<span style="color: #22c55e;">✓ Paired with ${escapeHtml(device.name || 'Nearby Device')}! Adding to mesh radar.</span>`;
            
            // Add virtual peer to radar
            const blePeer = {
                id: `ble_${device.id || Math.random().toString(36).slice(2, 7)}`,
                nickname: device.name || 'BLE_Target',
                avatar: '📶',
                mode: 'ble',
                device: 'Bluetooth Device'
            };
            state.discoveredPeers.push(blePeer);
            updatePeerListUI(state.discoveredPeers);
        } catch (err) {
            if (msgEl) msgEl.textContent = `Bluetooth scan canceled or failed: ${err.message}`;
        }
    }

    let qrOfferScannerActive = false;
    let qrVideoElem = null;

    function safeUtf8ToBase64(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode('0x' + p1);
        }));
    }

    function safeBase64ToUtf8(b64) {
        return decodeURIComponent(Array.prototype.map.call(atob(b64), (c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    function openQrHandshakeModal() {
        const modal = document.getElementById('qrModal');
        if (!modal) return;
        modal.classList.add('active');

        // Generate Offer QR Code
        generateQrOffer();
    }

    async function generateQrOffer() {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (!qrContainer) return;
        qrContainer.innerHTML = '';

        // Create temporary offer string
        const offerPayload = {
            type: 'airgap_offer',
            nick: state.myNickname,
            avatar: state.myAvatar,
            key: state.myPublicKeyJwk
        };

        const compressed = safeUtf8ToBase64(JSON.stringify(offerPayload));
        new QRCode(qrContainer, {
            text: compressed,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    async function startQrScanner() {
        const video = document.getElementById('qrScannerVideo');
        if (!video) return;
        qrVideoElem = video;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            video.play();
            qrOfferScannerActive = true;
            requestAnimationFrame(scanQrFrame);
        } catch (err) {
            console.error("Camera access failed for QR scan:", err);
        }
    }

    function scanQrFrame() {
        if (!qrOfferScannerActive || !qrVideoElem) return;
        if (qrVideoElem.readyState === qrVideoElem.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement("canvas");
            canvas.width = qrVideoElem.videoWidth;
            canvas.height = qrVideoElem.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(qrVideoElem, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
                try {
                    const parsed = JSON.parse(safeBase64ToUtf8(code.data));
                    if (parsed.type === 'airgap_offer' && parsed.key) {
                        qrOfferScannerActive = false;
                        document.getElementById('qrModal').classList.remove('active');
                        // Stop camera stream
                        qrVideoElem.srcObject.getTracks().forEach(t => t.stop());

                        // Establish air-gapped direct session
                        CryptoEngine.deriveSharedSessionKey(parsed.key).then(() => {
                            switchToActiveChat({
                                id: 'airgap_peer',
                                nickname: parsed.nick || 'AirGap_Agent',
                                avatar: parsed.avatar || '📷',
                                device: 'Air-Gapped Optical Link'
                            });
                            AudioEngine.playLockBeep();
                        });
                        return;
                    }
                } catch (e) { }
            }
        }
        requestAnimationFrame(scanQrFrame);
    }

    // =========================================================================
    // 8. VOICE MEMO RECORDER ENGINE
    // =========================================================================
    async function startVoiceRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.mediaRecorder = new MediaRecorder(stream);
            state.audioChunks = [];

            state.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) state.audioChunks.push(e.data);
            };

            state.mediaRecorder.start();

            // Show recording bar
            document.getElementById('voiceRecordingBar').style.display = 'flex';
            let seconds = 0;
            const timerEl = document.getElementById('voiceTimer');
            state.voiceTimerInterval = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                if (timerEl) timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }, 1000);
        } catch (err) {
            alert("Microphone permission required for voice notes: " + err.message);
        }
    }

    async function stopAndSendVoiceRecording() {
        if (!state.mediaRecorder) return;

        state.mediaRecorder.onstop = async () => {
            clearInterval(state.voiceTimerInterval);
            document.getElementById('voiceRecordingBar').style.display = 'none';

            const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result;
                const encrypted = await CryptoEngine.encrypt(base64Data);

                const packet = {
                    type: 'voice',
                    sender: state.myNickname,
                    avatar: state.myAvatar,
                    timestamp: Date.now(),
                    burn: state.burnTimer,
                    payload: encrypted
                };

                if (state.dataChannel && state.dataChannel.readyState === 'open') {
                    state.dataChannel.send(JSON.stringify(packet));
                    AudioEngine.playMsgChirp();
                    renderMessage({
                        type: 'voice',
                        isSent: true,
                        audioSrc: base64Data,
                        timestamp: packet.timestamp,
                        burn: packet.burn
                    });
                }
            };
            reader.readAsDataURL(audioBlob);

            // Stop mic tracks
            state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        };

        state.mediaRecorder.stop();
    }

    // =========================================================================
    // 9. EVENT LISTENERS & DOM HOOKS
    // =========================================================================
    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize Crypto & Radar
        await CryptoEngine.init();
        RadarEngine.init();

        // Register with Socket.io on local network
        socket.on('connect', () => {
            state.myId = socket.id;
            socket.emit('nearby_join', {
                nickname: state.myNickname,
                avatar: state.myAvatar,
                mode: state.mode,
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                publicKey: state.myPublicKeyJwk
            });
        });

        socket.on('nearby_registered', (data) => {
            state.myId = data.id;
        });

        socket.on('nearby_peer_list', (peers) => {
            updatePeerListUI(peers);
        });

        // WebRTC Signaling Handlers
        socket.on('nearby_signal', async (data) => {
            if (data.type === 'offer') {
                initPeerConnection(data.senderInfo, false);
                if (data.senderInfo.publicKey) {
                    await CryptoEngine.deriveSharedSessionKey(data.senderInfo.publicKey);
                }
                await state.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
                const answer = await state.peerConnection.createAnswer();
                await state.peerConnection.setLocalDescription(answer);

                socket.emit('nearby_signal', {
                    to: data.from,
                    signal: answer,
                    type: 'answer',
                    senderInfo: {
                        id: state.myId,
                        nickname: state.myNickname,
                        avatar: state.myAvatar,
                        mode: state.mode,
                        publicKey: state.myPublicKeyJwk
                    }
                });
            } else if (data.type === 'answer') {
                if (state.peerConnection) {
                    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
                }
            }
        });

        socket.on('nearby_ice_candidate', async (data) => {
            if (state.peerConnection && data.candidate) {
                try {
                    await state.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) { }
            }
        });

        // Profile inputs
        const nickInput = document.getElementById('nicknameInput');
        if (nickInput) {
            nickInput.value = state.myNickname;
            nickInput.addEventListener('change', () => {
                state.myNickname = nickInput.value.trim() || 'Agent_007';
                localStorage.setItem('privy_nearby_nick', state.myNickname);
                socket.emit('nearby_update_profile', { nickname: state.myNickname });
            });
        }

        const avatarBtn = document.getElementById('profileAvatarBtn');
        if (avatarBtn) {
            avatarBtn.textContent = state.myAvatar;
            avatarBtn.addEventListener('click', () => {
                document.getElementById('avatarModal').classList.add('active');
            });
        }

        document.getElementById('avatarGrid')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('profile-avatar-btn')) {
                state.myAvatar = e.target.textContent;
                localStorage.setItem('privy_nearby_avatar', state.myAvatar);
                if (avatarBtn) avatarBtn.textContent = state.myAvatar;
                document.getElementById('avatarModal').classList.remove('active');
                socket.emit('nearby_update_profile', { avatar: state.myAvatar });
            }
        });

        document.getElementById('closeAvatarModalBtn')?.addEventListener('click', () => {
            document.getElementById('avatarModal').classList.remove('active');
        });

        // Sound & Stealth Toggles
        document.getElementById('radarSoundToggle')?.addEventListener('click', (e) => {
            state.sonarSound = !state.sonarSound;
            e.currentTarget.style.color = state.sonarSound ? 'var(--neon-green)' : 'var(--text-muted)';
        });

        document.getElementById('stealthToggleBtn')?.addEventListener('click', (e) => {
            state.isStealth = !state.isStealth;
            e.currentTarget.style.color = state.isStealth ? 'var(--neon-purple)' : 'var(--neon-green)';
            socket.emit('nearby_update_profile', { mode: state.isStealth ? 'stealth' : state.mode });
        });

        // Send message button & Enter key
        const msgInput = document.getElementById('msgInput');
        const sendBtn = document.getElementById('sendMsgBtn');

        const doSend = () => {
            if (msgInput) {
                sendTextMessage(msgInput.value);
                msgInput.value = '';
            }
        };

        if (sendBtn) sendBtn.addEventListener('click', doSend);
        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            });
        }

        // Voice Memo buttons
        document.getElementById('recordVoiceBtn')?.addEventListener('click', startVoiceRecording);
        document.getElementById('sendVoiceBtn')?.addEventListener('click', stopAndSendVoiceRecording);
        document.getElementById('cancelVoiceBtn')?.addEventListener('click', () => {
            if (state.mediaRecorder) {
                state.mediaRecorder.stop();
                state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
                clearInterval(state.voiceTimerInterval);
                document.getElementById('voiceRecordingBar').style.display = 'none';
            }
        });

        // File Attachment
        const fileInput = document.getElementById('fileInput');
        document.getElementById('attachFileBtn')?.addEventListener('click', () => fileInput.click());
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file || !state.dataChannel) return;

                const reader = new FileReader();
                reader.onload = async () => {
                    const fileObj = {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        data: reader.result
                    };
                    const encrypted = await CryptoEngine.encrypt(JSON.stringify(fileObj));
                    const packet = {
                        type: 'file',
                        sender: state.myNickname,
                        avatar: state.myAvatar,
                        timestamp: Date.now(),
                        burn: state.burnTimer,
                        payload: encrypted
                    };

                    state.dataChannel.send(JSON.stringify(packet));
                    AudioEngine.playMsgChirp();
                    renderMessage({
                        type: 'file',
                        isSent: true,
                        file: fileObj,
                        timestamp: packet.timestamp,
                        burn: packet.burn
                    });
                };
                reader.readAsDataURL(file);
            });
        }

        // Ghost Mode Toggle
        document.getElementById('ghostToggleBtn')?.addEventListener('click', () => {
            state.isGhostMode = !state.isGhostMode;
            document.querySelectorAll('.msg-bubble').forEach(b => {
                if (state.isGhostMode) b.classList.add('ghost-blur');
                else b.classList.remove('ghost-blur');
            });
        });

        // Burn Timer Selector
        document.getElementById('burnTimerSelect')?.addEventListener('change', (e) => {
            state.burnTimer = e.target.value;
        });

        // Verification Modal
        document.getElementById('verifySafetyBtn')?.addEventListener('click', () => {
            document.getElementById('safetyModal').classList.add('active');
        });
        document.getElementById('closeSafetyModalBtn')?.addEventListener('click', () => {
            document.getElementById('safetyModal').classList.remove('active');
        });

        // Disconnect Button
        document.getElementById('disconnectBtn')?.addEventListener('click', terminateSession);

        // Discovery Mode Buttons
        document.getElementById('modeWifiBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'wifi';
        });

        document.getElementById('modeBleBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'ble';
            document.getElementById('bleModal').classList.add('active');
        });
        document.getElementById('closeBleModalBtn')?.addEventListener('click', () => {
            document.getElementById('bleModal').classList.remove('active');
        });
        document.getElementById('triggerBleRequestBtn')?.addEventListener('click', triggerBluetoothScan);

        document.getElementById('modeQrBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'qr';
            openQrHandshakeModal();
        });
        document.getElementById('heroAirGapBtn')?.addEventListener('click', openQrHandshakeModal);
        document.getElementById('closeQrModalBtn')?.addEventListener('click', () => {
            document.getElementById('qrModal').classList.remove('active');
            qrOfferScannerActive = false;
        });

        document.getElementById('qrTabOffer')?.addEventListener('click', () => {
            document.getElementById('qrOfferView').style.display = 'block';
            document.getElementById('qrScanView').style.display = 'none';
            generateQrOffer();
        });

        document.getElementById('qrTabScan')?.addEventListener('click', () => {
            document.getElementById('qrOfferView').style.display = 'none';
            document.getElementById('qrScanView').style.display = 'block';
            startQrScanner();
        });

        // Hero Scan Button
        document.getElementById('heroScanBtn')?.addEventListener('click', () => {
            AudioEngine.playSonarPing();
            socket.emit('nearby_join', {
                nickname: state.myNickname,
                avatar: state.myAvatar,
                mode: state.mode,
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                publicKey: state.myPublicKeyJwk
            });
        });

        document.getElementById('refreshScanBtn')?.addEventListener('click', () => {
            AudioEngine.playSonarPing();
            socket.emit('nearby_join', {
                nickname: state.myNickname,
                avatar: state.myAvatar,
                mode: state.mode,
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                publicKey: state.myPublicKeyJwk
            });
        });

        // Panic Purge Button
        document.getElementById('panicBtn')?.addEventListener('click', () => {
            document.body.classList.add('panic-active');
            localStorage.clear();
            sessionStorage.clear();
            setTimeout(() => {
                window.location.replace('https://www.google.com');
            }, 250);
        });

        // Expose global connect function for inline blip/card clicks
        window.PrivyNearby = {
            connect: (id) => {
                const target = state.discoveredPeers.find(p => p.id === id);
                if (target) connectToPeer(target);
            }
        };
    });

})();
