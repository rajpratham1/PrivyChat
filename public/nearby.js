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
        // Identity is intentionally session-only. Do not move this to localStorage,
        // IndexedDB, cookies, or any other persistent browser storage.
        myNickname: `Agent_${Math.floor(1000 + Math.random() * 9000)}`,
        myAvatar: '🕵️',
        mode: 'wifi', // 'wifi', 'ble', 'qr'
        isOffline: !navigator.onLine,
        preferredDiscovery: 'local-host-qr',
        isStealth: false,
        sonarSound: false, // Muted by default
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
        transport: 'none', // 'direct', 'relay', or 'manual-qr'
        qrHandshake: null,
        optical: {
            active: false,
            role: null,
            sessionKey: null,
            peerKey: null,
            txFrames: [],
            txTimer: null,
            txIndex: 0,
            rxFrames: new Map(),
            rxVideo: null,
            rxStream: null,
            rxCanvas: null,
            rxContext: null,
            rxLoop: false,
            rxBusy: false,
            seenFrames: new Set(),
            mediaRecorder: null,
            audioChunks: []
        },
        transfers: new Map(),
        objectUrls: new Set(),

        // Voice Recording & Media
        mediaRecorder: null,
        voiceSourceStream: null,
        voiceAudioContext: null,
        voiceAudioNodes: null,
        voiceMasking: false,
        cancelVoiceRecording: false,
        audioChunks: [],
        voiceTimerInterval: null,
        localStream: null,
        remoteStream: null,

        // P2P Voice Call Management
        callTimerInterval: null,
        callSeconds: 0,
        isCallActive: false
    };

    // ICE candidate queue — prevents race condition where candidates arrive before setRemoteDescription
    let _pendingIceCandidates = [];
    let _remoteDescriptionSet = false;
    let _connectionTimeoutTimer = null;

    // Connection progress modal state
    let _connElapsedInterval = null;
    let _connStartTime = null;
    let _connCurrentStep = 0;


    // Socket.io Connection (Local LAN Discovery)
    const socket = io({
        transports: ['websocket', 'polling'],
        upgrade: true
    });

    function setOfflineMeshStatus(isOffline) {
        state.isOffline = Boolean(isOffline);
        state.preferredDiscovery = state.isOffline ? 'local-host-qr' : 'auto';
        const pill = document.getElementById('meshStatusPill');
        const statusText = document.getElementById('meshStatusText');
        const dot = pill?.querySelector('span');
        const badge = document.getElementById('radarBadge');
        const wifiButton = document.getElementById('modeWifiBtn');
        const qrButton = document.getElementById('modeQrBtn');

        if (pill) {
            pill.style.background = state.isOffline ? 'rgba(245, 158, 11, 0.14)' : 'rgba(34, 197, 94, 0.1)';
            pill.style.borderColor = state.isOffline ? 'rgba(245, 158, 11, 0.55)' : 'rgba(34, 197, 94, 0.3)';
            pill.style.color = state.isOffline ? '#f59e0b' : 'var(--neon-green)';
        }
        if (dot) {
            dot.style.background = state.isOffline ? '#f59e0b' : 'var(--neon-green)';
            dot.style.boxShadow = state.isOffline ? '0 0 8px #f59e0b' : '0 0 8px var(--neon-green)';
        }
        if (statusText) statusText.textContent = state.isOffline ? 'OFFLINE MESH (HOTSPOT / AIR-GAP ONLY)' : 'RADAR ACTIVE';
        if (badge) badge.textContent = state.isOffline ? 'LOCAL HOST • AIR-GAP QR' : 'SWEEP: 360° • SCANNING';
        if (wifiButton) wifiButton.title = state.isOffline ? 'Discover peers on a local hotspot/subnet without internet' : 'Discover peers on local WiFi / Hotspot router';
        if (qrButton) qrButton.title = 'Air-Gapped Optical QR Messenger — no network required';
        document.body.classList.toggle('offline-mesh', state.isOffline);
    }

    // Sound Synthesizer via Web Audio API (Zero external mp3 files needed)
    const AudioEngine = {
        ctx: null,
        ringInterval: null,
        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
        },
        playSonarPing() {
            // Silenced
        },
        playLockBeep() {
            // Silenced
        },
        playMsgChirp() {
            // Silenced
        },
        playRingtone() {
            this.init();
            if (!this.ctx || this.ringInterval) return;
            const ring = () => {
                try {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(440, this.ctx.currentTime); // A4
                    osc.frequency.setValueAtTime(480, this.ctx.currentTime + 0.4);
                    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 1.2);
                } catch (e) {}
            };
            ring();
            this.ringInterval = setInterval(ring, 3000);
        },
        stopRingtone() {
            if (this.ringInterval) {
                clearInterval(this.ringInterval);
                this.ringInterval = null;
            }
        }
    };

    // =========================================================================
    // 2. CRYPTOGRAPHIC ENGINE (Web Crypto API - ECDH + AES-256-GCM)
    // =========================================================================
    const CryptoEngine = {
        async init() {
            if (state.keyPair && state.myPublicKeyJwk) return;
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
            if (!state.keyPair || !state.myPublicKeyJwk) {
                throw new Error('The ephemeral key pair is not ready.');
            }
            const peerKey = await window.crypto.subtle.importKey(
                "jwk",
                peerPublicKeyJwk,
                { name: "ECDH", namedCurve: "P-256" },
                false,
                []
            );

            // ECDH produces shared secret material only in memory. HKDF binds the
            // resulting AES key to a deterministic public-key transcript so both
            // parties derive the same key without exposing it to the relay.
            const rawBits = await window.crypto.subtle.deriveBits(
                { name: "ECDH", public: peerKey },
                state.keyPair.privateKey,
                256
            );

            const canonicalPublicKey = (jwk) => JSON.stringify({
                crv: jwk.crv,
                kty: jwk.kty,
                x: jwk.x,
                y: jwk.y
            });
            const transcript = [
                canonicalPublicKey(state.myPublicKeyJwk),
                canonicalPublicKey(peerPublicKeyJwk)
            ].sort().join('|');
            const transcriptBytes = new TextEncoder().encode(transcript);
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", transcriptBytes);

            const keyMaterial = await window.crypto.subtle.importKey(
                'raw', rawBits, 'HKDF', false, ['deriveKey']
            );
            state.sessionKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'HKDF',
                    hash: 'SHA-256',
                    salt: hashBuffer,
                    info: new TextEncoder().encode('PrivyChat Nearby Tactical Mesh v1')
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            // SHA-256 of the ordered public keys is the out-of-band MITM check.
            // Show the first eight bytes (16 hex characters) as the safety code.
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

            state.safetyFingerprint = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;

            // 4 Safety Emojis
            const emojiTable = ['🛡️', '⚡', '🔑', '🦅', '🐺', '🛰️', '🔒', '💎', '🔥', '⚔️', '🌊', '🧬', '👁️', '🦇', '⚓', '🎯'];
            state.safetyEmojis = [
                emojiTable[hashArray[0] % emojiTable.length],
                emojiTable[hashArray[1] % emojiTable.length],
                emojiTable[hashArray[2] % emojiTable.length],
                emojiTable[hashArray[3] % emojiTable.length]
            ].join(' ');

            console.log("Ephemeral AES-256-GCM session key established.");
        },

        async encrypt(plaintext, additionalData = '') {
            if (!state.sessionKey) throw new Error('Secure session is not established.');
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(plaintext);
            const ciphertext = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv,
                    additionalData: new TextEncoder().encode(additionalData)
                },
                state.sessionKey,
                encoded
            );
            return {
                iv: btoa(String.fromCharCode(...iv)),
                data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
            };
        },

        async decrypt(encryptedObj, additionalData = '') {
            if (!state.sessionKey) throw new Error('Received an encrypted packet before the secure session was established.');
            try {
                const iv = Uint8Array.from(atob(encryptedObj.iv), c => c.charCodeAt(0));
                const data = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
                const decrypted = await window.crypto.subtle.decrypt(
                    {
                        name: "AES-GCM",
                        iv,
                        additionalData: new TextEncoder().encode(additionalData)
                    },
                    state.sessionKey,
                    data
                );
                return new TextDecoder().decode(decrypted);
            } catch (e) {
                throw new Error('Message authentication failed.');
            }
        }
    };

    // Key-scoped helpers keep an optical session isolated from the normal
    // Socket.IO/WebRTC session key. They use the same AES-256-GCM primitive and
    // never persist the CryptoKey outside the page heap.
    CryptoEngine.encryptWithKey = async (plaintext, key, additionalData = '') => {
        if (!key) throw new Error('Optical session is not established.');
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(additionalData) },
            key,
            new TextEncoder().encode(plaintext)
        );
        return { iv: bytesToBase64(iv), data: bytesToBase64(ciphertext) };
    };

    CryptoEngine.decryptWithKey = async (encryptedObj, key, additionalData = '') => {
        if (!key) throw new Error('Optical session is not established.');
        const iv = base64ToBytes(encryptedObj.iv);
        const data = base64ToBytes(encryptedObj.data);
        if (iv.byteLength !== 12 || data.byteLength < 16) throw new Error('Invalid optical ciphertext.');
        const plaintext = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(additionalData) },
            key,
            data
        );
        return new Uint8Array(plaintext);
    };

    async function ensureCryptoReady() {
        await CryptoEngine.init();
        return state.myPublicKeyJwk;
    }

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
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            // Free TURN relay — required for cross-NAT connections (mobile data ↔ home WiFi on Render)
            { urls: 'stun:stun.relay.metered.ca:80' },
            {
                urls: [
                    'turn:openrelay.metered.ca:80',
                    'turn:openrelay.metered.ca:443',
                    'turn:openrelay.metered.ca:443?transport=tcp',
                    'turns:openrelay.metered.ca:443',
                    'turns:openrelay.metered.ca:443?transport=tcp'
                ],
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        iceCandidatePoolSize: 10
    };

    // QR handshakes must not contact a STUN/TURN service while the offer and
    // answer are exchanged optically.  Host candidates are enough when the
    // devices share a local link; the normal WiFi mode keeps the STUN/TURN
    // fallback for carrier-grade NATs.
    const QRRTCConfig = {
        iceServers: [],
        iceCandidatePoolSize: 0
    };

    const LOCALRTCConfig = {
        // No STUN/TURN DNS lookups in airplane mode or on a mobile hotspot.
        // WebRTC will advertise host candidates on the local subnet (for
        // example 192.168.43.x / 192.168.1.x) and connect directly when both
        // browsers share that link.
        iceServers: [],
        iceCandidatePoolSize: 0
    };

    // Perfect Negotiation State
    let isMakingOffer = false;
    let ignoreOffer = false;

    function initPeerConnection(targetPeer, isInitiator = false, { manualQr = false } = {}) {
        _pendingIceCandidates = [];
        _remoteDescriptionSet = false;
        isMakingOffer = false;
        ignoreOffer = false;

        if (state.peerConnection) {
            try { state.peerConnection.close(); } catch (e) {}
            state.peerConnection = null;
        }

        const rtcConfig = manualQr ? QRRTCConfig : (state.isOffline ? LOCALRTCConfig : RTCConfig);
        state.peerConnection = new RTCPeerConnection(rtcConfig);
        state.activePeer = targetPeer;

        const targetId = (targetPeer && targetPeer.id) || (state.activePeer && state.activePeer.id);

        const sendSignallingDescription = (description) => {
            if (manualQr || !socket || !targetId) return;
            socket.emit('nearby_signal', {
                to: targetId,
                signal: description,
                type: description.type,
                senderInfo: {
                    id: state.myId || socket.id,
                    nickname: state.myNickname,
                    avatar: state.myAvatar,
                    mode: state.mode,
                    device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                    publicKey: state.myPublicKeyJwk
                }
            });
        };

        // ICE Candidate Handling. Manual QR carries candidates in its SDP.
        state.peerConnection.onicecandidate = (event) => {
            if (!manualQr && event.candidate && socket && targetId) {
                socket.emit('nearby_ice_candidate', {
                    to: targetId,
                    candidate: event.candidate
                });
            }
        };

        // Handles the initial data-channel offer and renegotiates when a voice
        // stream is added, which is required for a real WebRTC call.
        if (!manualQr) {
            state.peerConnection.onnegotiationneeded = async () => {
                try {
                    isMakingOffer = true;
                    await state.peerConnection.setLocalDescription();
                    sendSignallingDescription(state.peerConnection.localDescription);
                } catch (error) {
                    console.warn('WebRTC renegotiation failed:', error.message);
                } finally {
                    isMakingOffer = false;
                }
            };
        }

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

        // Direct Audio/Video Stream Handling for P2P Voice Call
        state.peerConnection.ontrack = (event) => {
            console.log('Incoming remote media track:', event.track.kind);
            const remoteAudio = document.getElementById('remoteAudio');
            const remoteVideo = document.getElementById('remoteVideo');
            if (event.streams && event.streams[0]) {
                if (event.track.kind === 'video' && remoteVideo) {
                    remoteVideo.srcObject = event.streams[0];
                    remoteVideo.style.display = 'block';
                } else if (event.track.kind === 'audio' && remoteAudio) {
                    remoteAudio.srcObject = event.streams[0];
                    remoteAudio.play().catch(e => console.warn('Autoplay error:', e));
                }
            }
        };

        state.peerConnection.oniceconnectionstatechange = () => {
            const iceState = state.peerConnection.iceConnectionState;
            console.log('WebRTC ICE State:', iceState);
            if (iceState === 'connected' || iceState === 'completed') {
                updateConnStep(3, 'done');
                updateConnStep(4, 'done');
            }
        };

        state.peerConnection.onconnectionstatechange = () => {
            console.log("WebRTC Connection State:", state.peerConnection.connectionState);
        };
    }

    function setupDataChannelEvents(dc) {
        dc.onopen = () => {
            state.transport = state.qrHandshake ? 'manual-qr' : 'direct';
            updateTransportBadge();
            if (state.qrHandshake) state.qrHandshake.connected = true;
            console.log("⚡ Direct P2P WebRTC DataChannel OPEN!");
            updateConnStep(3, 'done');
            updateConnStep(4, 'done');
            const ring = document.getElementById('connProgRing');
            if (ring) ring.className = 'conn-prog-ring done';
            if (state.qrHandshake && state.activePeer) {
                closeConnProgress();
                switchToActiveChat(state.activePeer);
                showNearbyToast('Air-gapped QR handshake completed over a direct local channel.', 'success');
            }
        };

        dc.onclose = () => {
            console.log("DataChannel Closed.");
            if (!state.qrHandshake) state.transport = 'relay';
            updateTransportBadge();
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

    function updateTransportBadge() {
        const badge = document.getElementById('peerActiveChannel');
        if (!badge) return;
        const labels = {
            direct: 'P2P DIRECT',
            relay: 'E2EE RELAY',
            'manual-qr': 'OPTICAL • DIRECT',
            none: 'NEGOTIATING'
        };
        badge.textContent = labels[state.transport] || 'E2EE RELAY';
    }

    // Dual-Layer Transport Engine (P2P DataChannel + Zero-Knowledge Encrypted Socket Relay)
    function sendP2PPacket(packet) {
        if (state.dataChannel && state.dataChannel.readyState === 'open') {
            try {
                state.dataChannel.send(JSON.stringify(packet));
                state.transport = state.qrHandshake ? 'manual-qr' : 'direct';
                updateTransportBadge();
                return true;
            } catch (e) {
                console.warn("DataChannel send failed, using E2EE socket relay fallback:", e);
            }
        }
        // A manual QR session has no signalling relay by design. Never pretend a
        // packet was delivered while its data channel is still negotiating.
        if (state.qrHandshake) return false;
        if (socket && state.activePeer && state.activePeer.id) {
            socket.emit('nearby_p2p_message', {
                to: state.activePeer.id,
                packet: packet
            });
            state.transport = 'relay';
            updateTransportBadge();
            return true;
        }
        return false;
    }

    const MAX_TRANSFER_BYTES = 5 * 1024 * 1024;
    const TRANSFER_CHUNK_BYTES = 12 * 1024;

    function packetAAD(packet) {
        return [
            packet.type || '',
            packet.sender || '',
            packet.timestamp || '',
            packet.transferId || '',
            Number.isInteger(packet.index) ? packet.index : '',
            Number.isInteger(packet.total) ? packet.total : '',
            packet.burn || ''
        ].join('|');
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (let offset = 0; offset < view.length; offset += 0x8000) {
            binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function createTransferId() {
        return Array.from(window.crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function waitForDataChannelCapacity() {
        if (!state.dataChannel || state.dataChannel.readyState !== 'open' || state.dataChannel.bufferedAmount < 512 * 1024) {
            return Promise.resolve();
        }
        return new Promise(resolve => setTimeout(resolve, 30)).then(waitForDataChannelCapacity);
    }

    async function sendBinaryTransfer({ blob, name, mime, kind, burn }) {
        if (!state.activePeer || !state.sessionKey) throw new Error('Connect and verify a peer before sending media.');
        if (!blob || blob.size > MAX_TRANSFER_BYTES) {
            throw new Error(`Transfers are limited to ${MAX_TRANSFER_BYTES / (1024 * 1024)} MB per session.`);
        }

        const transferId = createTransferId();
        const total = Math.max(1, Math.ceil(blob.size / TRANSFER_CHUNK_BYTES));
        const timestamp = Date.now();
        const meta = {
            name: String(name || (kind === 'voice' ? 'voice-note.webm' : 'attachment')),
            mime: String(mime || 'application/octet-stream'),
            size: blob.size,
            kind: kind === 'voice' ? 'voice' : 'file',
            total
        };
        const metaPacket = {
            type: 'file_meta', sender: state.myNickname, timestamp, burn,
            transferId, total
        };
        metaPacket.payload = await CryptoEngine.encrypt(JSON.stringify(meta), packetAAD(metaPacket));
        if (!sendP2PPacket(metaPacket)) throw new Error('Secure transport is not ready yet.');

        const source = new Uint8Array(await blob.arrayBuffer());
        for (let index = 0; index < total; index++) {
            await waitForDataChannelCapacity();
            const start = index * TRANSFER_CHUNK_BYTES;
            const packet = {
                type: 'file_chunk', sender: state.myNickname, timestamp, burn,
                transferId, index, total
            };
            packet.payload = await CryptoEngine.encrypt(bytesToBase64(source.subarray(start, start + TRANSFER_CHUNK_BYTES)), packetAAD(packet));
            if (!sendP2PPacket(packet)) throw new Error('Secure transport closed before the transfer completed.');
        }

        const completePacket = {
            type: 'file_complete', sender: state.myNickname, timestamp, burn,
            transferId, total
        };
        completePacket.payload = await CryptoEngine.encrypt('complete', packetAAD(completePacket));
        if (!sendP2PPacket(completePacket)) throw new Error('Secure transport closed before the transfer completed.');
        return { transferId, meta, timestamp };
    }

    // =========================================================================
    // Connection Progress Modal — shows real-time WebRTC handshake stages
    // =========================================================================
    function openConnProgress(title) {
        const modal = document.getElementById('connProgressModal');
        if (!modal) return;
        // Update title
        const titleEl = document.getElementById('connProgTitle');
        if (titleEl) titleEl.textContent = title || 'Establishing Secure Channel';
        // Reset all 4 steps to pending
        for (let i = 1; i <= 4; i++) {
            setStepState(i, 'pending');
        }
        // Reset progress bar
        const fill = document.getElementById('connProgressFill');
        const pct  = document.getElementById('connPercent');
        if (fill) fill.style.width = '10%';
        if (pct) pct.textContent = '10%';
        // Reset spinner ring
        const ring = document.getElementById('connProgRing');
        if (ring) ring.className = 'conn-prog-ring';
        // Start elapsed timer
        _connStartTime = Date.now();
        _connCurrentStep = 0;
        clearInterval(_connElapsedInterval);
        _connElapsedInterval = setInterval(() => {
            const el = document.getElementById('connElapsed');
            if (el) el.textContent = `${((Date.now() - _connStartTime) / 1000).toFixed(1)}s elapsed`;
        }, 80);
        modal.classList.add('active');
    }

    function setStepState(num, status) {
        const step  = document.getElementById(`connStep${num}`);
        const dot   = document.getElementById(`connDot${num}`);
        const badge = document.getElementById(`connBadge${num}`);
        if (!step || !dot || !badge) return;
        step.className  = `conn-step ${status === 'pending' ? '' : status}`;
        dot.className   = `conn-step-dot ${status}`;
        badge.className = `conn-step-badge ${status}`;
        const labels = { pending: 'PENDING', active: 'ACTIVE ●', done: '✓ DONE', error: '✗ FAIL' };
        badge.textContent = labels[status] || 'PENDING';
    }

    function updateConnStep(stepNum, status) {
        setStepState(stepNum, status);
        _connCurrentStep = stepNum;
        const progressMap = { 1: { active: 20, done: 30 }, 2: { active: 50, done: 65 }, 3: { active: 80, done: 90 }, 4: { active: 95, done: 100 } };
        const fill = document.getElementById('connProgressFill');
        const pct  = document.getElementById('connPercent');
        const p = (progressMap[stepNum] || {})[status];
        if (p !== undefined && fill && pct) {
            fill.style.width = `${p}%`;
            pct.textContent = `${p}%`;
        }
    }

    function closeConnProgress() {
        clearInterval(_connElapsedInterval);
        _connElapsedInterval = null;
        const modal = document.getElementById('connProgressModal');
        if (modal) modal.classList.remove('active');
    }

    // Toast notification helper
    function showNearbyToast(msg, type = 'info') {
        let toast = document.getElementById('nearbyToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'nearbyToast';
            toast.style.cssText = [
                'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
                'padding:10px 22px', 'border-radius:12px', 'font-size:13px',
                "font-family:'Courier Prime',monospace", 'z-index:99999',
                'max-width:340px', 'text-align:center', 'pointer-events:none',
                'box-shadow:0 4px 24px rgba(0,0,0,0.55)', 'transition:opacity 0.4s',
                'backdrop-filter:blur(8px)'
            ].join(';');
            document.body.appendChild(toast);
        }
        const palette = {
            error:   { bg: 'rgba(239,68,68,0.93)',  border: '#ef4444' },
            success: { bg: 'rgba(34,197,94,0.93)',   border: '#22c55e' },
            info:    { bg: 'rgba(15,23,42,0.97)',    border: '#334155' }
        };
        const c = palette[type] || palette.info;
        toast.style.background = c.bg;
        toast.style.border = `1px solid ${c.border}`;
        toast.style.color = '#fff';
        toast.style.opacity = '1';
        toast.textContent = msg;
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4500);
    }

    async function connectToPeer(peer) {
        if (!peer || peer.id === state.myId) return;
        if (!peer.publicKey) {
            showNearbyToast('This peer is not advertising an ephemeral public key.', 'error');
            return;
        }

        AudioEngine.playLockBeep();

        // Open progress modal with stage tracking
        openConnProgress(`Connecting to ${escapeHtml(peer.nickname || 'Peer')}`);
        updateConnStep(1, 'active');

        state.activePeer = peer;

        // 1. Instantly derive the shared session key before any packet can be
        // sent. A malformed JWK must abort the attempt, never fall back to
        // plaintext.
        try {
            await CryptoEngine.deriveSharedSessionKey(peer.publicKey);
        } catch (error) {
            closeConnProgress();
            state.activePeer = null;
            showNearbyToast('Peer key exchange failed: ' + error.message, 'error');
            return;
        }
        updateConnStep(1, 'done');
        updateConnStep(2, 'active');

        // 2. Send instant E2EE session request via zero-knowledge relay
        socket.emit('nearby_session_request', {
            to: peer.id,
            publicKey: state.myPublicKeyJwk
        });

        // 3. Initiate WebRTC peer connection in parallel for direct media/data streaming.
        // onnegotiationneeded performs the offer and later call renegotiations.
        initPeerConnection(peer, true);
    }

    // Expose Global Connect Function Immediately
    window.PrivyNearbyConnect = function (peerId) {
        if (!peerId) return;
        const target = state.discoveredPeers.find(p => p.id === peerId) || { id: peerId, nickname: 'Agent' };
        connectToPeer(target);
    };
    window.PrivyNearby = {
        connect: window.PrivyNearbyConnect
    };

    // Global Click Delegation for Connect Buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.peer-connect-btn');
        if (btn && btn.id !== 'cancelConnBtn' && btn.id !== 'returnToChatNavBtn') {
            const peerId = btn.getAttribute('data-peer-id');
            if (peerId) {
                e.preventDefault();
                window.PrivyNearbyConnect(peerId);
            }
        }
    });

    // =========================================================================
    // 5.1 DIRECT P2P ENCRYPTED VOICE CALL ENGINE
    // =========================================================================
    async function startP2PCall() {
        if (!state.activePeer) {
            showNearbyToast('⚠️ Connect to a peer first to start a call.', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            state.localStream = stream;

            // Attach audio tracks to WebRTC peer connection
            if (state.peerConnection) {
                stream.getTracks().forEach(track => {
                    state.peerConnection.addTrack(track, stream);
                });
            }

            AudioEngine.playRingtone();

            // Open call modal on caller device
            const callModal = document.getElementById('callModal');
            document.getElementById('callAvatarIcon').textContent = state.activePeer.avatar || '🕵️';
            document.getElementById('callPeerHeading').textContent = `Calling ${state.activePeer.nickname || 'Target'}...`;
            document.getElementById('callSubheading').textContent = 'OUTGOING ENCRYPTED P2P VOICE CALL • RINGING';
            document.getElementById('acceptCallBtn').style.display = 'none';
            document.getElementById('hangupCallBtn').style.display = 'flex';
            if (callModal) callModal.classList.add('active');

            // Send call offer packet
            const sent = await sendEncryptedControl('call_offer', {
                caller: state.myNickname,
                avatar: state.myAvatar,
                callType: 'audio'
            });
            if (!sent) {
                endP2PCall(false);
                showNearbyToast('Secure session is not ready for a call.', 'error');
            }
        } catch (err) {
            console.error('Call failed:', err);
            showNearbyToast('Microphone permission required for voice call: ' + err.message, 'error');
        }
    }

    async function acceptIncomingCall() {
        AudioEngine.stopRingtone();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            state.localStream = stream;

            if (state.peerConnection) {
                stream.getTracks().forEach(track => {
                    state.peerConnection.addTrack(track, stream);
                });
            }

            startCallTimer();
            document.getElementById('callPeerHeading').textContent = `Connected: ${state.activePeer ? state.activePeer.nickname : 'Partner'}`;
            document.getElementById('acceptCallBtn').style.display = 'none';

            const sent = await sendEncryptedControl('call_accept', { accepted: true });
            if (!sent) {
                endP2PCall(false);
                showNearbyToast('Secure session is not ready for a call.', 'error');
            }
        } catch (err) {
            console.error('Accept call failed:', err);
            showNearbyToast('Microphone access denied: ' + err.message, 'error');
            endP2PCall();
        }
    }

    function endP2PCall(notifyPeer = true) {
        AudioEngine.stopRingtone();
        clearInterval(state.callTimerInterval);
        state.callTimerInterval = null;
        state.isCallActive = false;

        if (state.localStream) {
            state.localStream.getTracks().forEach(t => t.stop());
            state.localStream = null;
        }

        const callModal = document.getElementById('callModal');
        if (callModal) callModal.classList.remove('active');

        const remoteAudio = document.getElementById('remoteAudio');
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteAudio) remoteAudio.srcObject = null;
        if (remoteVideo) {
            remoteVideo.srcObject = null;
            remoteVideo.style.display = 'none';
        }

        if (notifyPeer) {
            sendEncryptedControl('call_end', { ended: true }).catch(() => {});
        }

        showNearbyToast('Call ended.', 'info');
    }

    function startCallTimer() {
        state.isCallActive = true;
        state.callSeconds = 0;
        clearInterval(state.callTimerInterval);
        const subheading = document.getElementById('callSubheading');
        state.callTimerInterval = setInterval(() => {
            state.callSeconds++;
            const mins = Math.floor(state.callSeconds / 60);
            const secs = state.callSeconds % 60;
            const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (subheading) subheading.textContent = `🟢 ENCRYPTED VOICE CALL IN PROGRESS (${timeStr})`;
        }, 1000);
    }

    // =========================================================================
    // 5. P2P MESSAGING, VOICE NOTES & FILE SHARING
    // =========================================================================
    async function sendEncryptedControl(type, value) {
        if (!state.activePeer || !state.sessionKey) return false;
        const packet = {
            type,
            sender: state.myNickname,
            timestamp: Date.now(),
            burn: '0'
        };
        packet.payload = await CryptoEngine.encrypt(JSON.stringify(value), packetAAD(packet));
        return sendP2PPacket(packet);
    }

    async function sendTextMessage(text) {
        if (!text || !text.trim() || !state.activePeer) return;

        const trimmed = text.trim();
        if (trimmed.length > 16000) {
            showNearbyToast('Messages are limited to 16,000 characters.', 'error');
            return;
        }
        const packet = {
            type: 'text',
            sender: state.myNickname,
            avatar: state.myAvatar,
            timestamp: Date.now(),
            burn: state.burnTimer
        };
        try {
            packet.payload = await CryptoEngine.encrypt(trimmed, packetAAD(packet));
        } catch (error) {
            showNearbyToast(error.message, 'error');
            return;
        }

        if (!sendP2PPacket(packet)) {
            showNearbyToast('Secure transport is still connecting. Try again in a moment.', 'error');
            return;
        }
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
        if (!packet || !packet.type) return;
        if (!state.sessionKey) return;
        try {
        if (packet.type === 'text') {
            const decryptedText = await CryptoEngine.decrypt(packet.payload, packetAAD(packet));
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
            const decryptedDataUrl = await CryptoEngine.decrypt(packet.payload, packetAAD(packet));
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
            const decryptedFileObj = JSON.parse(await CryptoEngine.decrypt(packet.payload, packetAAD(packet)));
            AudioEngine.playMsgChirp();

            renderMessage({
                type: 'file',
                isSent: false,
                file: decryptedFileObj,
                timestamp: packet.timestamp,
                burn: packet.burn,
                sender: packet.sender
            });
        } else if (packet.type === 'file_meta') {
            const meta = JSON.parse(await CryptoEngine.decrypt(packet.payload, packetAAD(packet)));
            if (!packet.transferId || !Number.isInteger(packet.total) || packet.total < 1 || packet.total > 500 ||
                !Number.isFinite(meta.size) || meta.size < 0 || meta.size > MAX_TRANSFER_BYTES ||
                !['file', 'voice'].includes(meta.kind)) {
                throw new Error('Invalid encrypted transfer metadata.');
            }
            state.transfers.set(packet.transferId, {
                meta,
                chunks: new Array(packet.total),
                received: 0,
                timestamp: packet.timestamp,
                burn: packet.burn,
                sender: packet.sender
            });
        } else if (packet.type === 'file_chunk') {
            const transfer = state.transfers.get(packet.transferId);
            if (!transfer || packet.total !== transfer.chunks.length || packet.index < 0 || packet.index >= packet.total) {
                throw new Error('Unexpected encrypted file chunk.');
            }
            if (!transfer.chunks[packet.index]) {
                const decoded = base64ToBytes(await CryptoEngine.decrypt(packet.payload, packetAAD(packet)));
                if (decoded.byteLength > TRANSFER_CHUNK_BYTES) throw new Error('Invalid encrypted file chunk size.');
                transfer.chunks[packet.index] = decoded;
                transfer.received++;
            }
        } else if (packet.type === 'file_complete') {
            const transfer = state.transfers.get(packet.transferId);
            await CryptoEngine.decrypt(packet.payload, packetAAD(packet));
            if (!transfer || transfer.received !== transfer.chunks.length) {
                throw new Error('Encrypted transfer is incomplete.');
            }
            const receivedSize = transfer.chunks.reduce((size, chunk) => size + chunk.byteLength, 0);
            if (receivedSize !== transfer.meta.size) throw new Error('Encrypted transfer integrity check failed.');
            const blob = new Blob(transfer.chunks, { type: transfer.meta.mime });
            const url = URL.createObjectURL(blob);
            state.objectUrls.add(url);
            state.transfers.delete(packet.transferId);
            AudioEngine.playMsgChirp();
            renderMessage({
                type: transfer.meta.kind,
                isSent: false,
                audioSrc: transfer.meta.kind === 'voice' ? url : undefined,
                file: transfer.meta.kind === 'file' ? { ...transfer.meta, url } : undefined,
                timestamp: transfer.timestamp,
                burn: transfer.burn,
                sender: transfer.sender,
                objectUrl: url
            });
        } else if (packet.type === 'call_offer') {
            const call = JSON.parse(await CryptoEngine.decrypt(packet.payload, packetAAD(packet)));
            AudioEngine.playRingtone();
            const callModal = document.getElementById('callModal');
            const callerName = call.caller || 'Agent';
            document.getElementById('callAvatarIcon').textContent = packet.avatar || '🕵️';
            document.getElementById('callPeerHeading').textContent = `Incoming Call: ${callerName}`;
            document.getElementById('callSubheading').textContent = 'INCOMING ENCRYPTED P2P VOICE CALL • RINGING';
            document.getElementById('acceptCallBtn').style.display = 'flex';
            document.getElementById('hangupCallBtn').style.display = 'flex';
            if (callModal) callModal.classList.add('active');
        } else if (packet.type === 'call_accept') {
            await CryptoEngine.decrypt(packet.payload, packetAAD(packet));
            AudioEngine.stopRingtone();
            startCallTimer();
            document.getElementById('callPeerHeading').textContent = `Connected: ${state.activePeer ? state.activePeer.nickname : 'Partner'}`;
            document.getElementById('acceptCallBtn').style.display = 'none';
            showNearbyToast('📞 Voice Call Connected!', 'success');
        } else if (packet.type === 'call_end') {
            await CryptoEngine.decrypt(packet.payload, packetAAD(packet));
            endP2PCall(false);
        } else if (packet.type === 'typing') {
            const typingState = JSON.parse(await CryptoEngine.decrypt(packet.payload, packetAAD(packet)));
            const indicator = document.getElementById('typingIndicator');
            if (indicator) {
                indicator.style.display = typingState.isTyping ? 'block' : 'none';
            }
        }
        } catch (error) {
            console.warn('Dropped unauthenticated or malformed encrypted packet:', error.message);
            showNearbyToast('A malformed or unauthenticated packet was discarded.', 'error');
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
        const safeAudioSrc = typeof msg.audioSrc === 'string' && /^(blob:|data:audio\/)/i.test(msg.audioSrc) ? msg.audioSrc : '';
        const rawFileHref = msg.file && (msg.file.url || msg.file.data);
        const safeFileHref = typeof rawFileHref === 'string' && (/^blob:/i.test(rawFileHref) || /^data:(audio|image|application)\//i.test(rawFileHref)) ? rawFileHref : '#';
        if (msg.burn && msg.burn !== '0') {
            burnBadgeHtml = `<div class="burn-timer-badge" title="Self-destruct timer">🔥</div>`;
        }

        if (msg.type === 'text') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 2px; font-weight: bold;">
                    ${msg.isSent ? 'You' : escapeHtml(msg.sender || 'Target')} • ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>${escapeHtml(msg.text)}</div>
            `;
        } else if (msg.type === 'voice') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 4px; font-weight: bold;">
                    🎙️ Voice Memo (${msg.isSent ? 'You' : escapeHtml(msg.sender || 'Target')})
                </div>
                <audio controls src="${escapeHtml(safeAudioSrc)}" style="max-width: 220px; height: 32px;"></audio>
            `;
        } else if (msg.type === 'file') {
            bubble.innerHTML = `
                ${burnBadgeHtml}
                <div style="font-size: 11px; color: ${msg.isSent ? '#86efac' : '#94a3b8'}; margin-bottom: 4px; font-weight: bold;">
                    📎 Encrypted File (${msg.isSent ? 'You' : escapeHtml(msg.sender || 'Target')})
                </div>
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px;">
                    <i data-lucide="file" class="w-4 h-4 text-green-400"></i>
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;">
                        ${escapeHtml(msg.file.name)} (${Math.round(msg.file.size / 1024)} KB)
                    </div>
                    <a href="${escapeHtml(safeFileHref)}" download="${escapeHtml(msg.file.name)}" style="color: var(--neon-green); font-size: 12px; font-weight: bold; text-decoration: none;">
                        Save
                    </a>
                </div>
            `;
            setTimeout(() => lucide.createIcons(), 10);
        }

        row.appendChild(bubble);
        row._objectUrl = msg.objectUrl || (msg.file && msg.file.url) || (typeof msg.audioSrc === 'string' && msg.audioSrc.startsWith('blob:') ? msg.audioSrc : null);
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;

        // Handle Self-Destruct Countdown
        if (msg.burn && msg.burn !== '0') {
            const seconds = msg.burn === 'read' ? 5 : parseInt(msg.burn, 10);
            setTimeout(() => {
                row.style.transition = 'opacity 0.5s, transform 0.5s';
                row.style.opacity = '0';
                row.style.transform = 'scale(0.8)';
                setTimeout(() => {
                    if (row._objectUrl) {
                        URL.revokeObjectURL(row._objectUrl);
                        state.objectUrls.delete(row._objectUrl);
                    }
                    row.remove();
                }, 500);
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
        state.activePeer = peer;
        const standby = document.getElementById('standbyScreen');
        const hud = document.getElementById('activeChatHUD');

        // Close any open modals gracefully
        document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
        stopQrScanner();

        // Fade out standby
        standby.style.opacity = '0';
        setTimeout(() => {
            standby.style.display = 'none';

            // Activate full-screen chat view
            document.body.classList.add('chat-active-view');

            // Fade in HUD
            hud.style.opacity = '0';
            hud.style.display = 'flex';
            requestAnimationFrame(() => requestAnimationFrame(() => { hud.style.opacity = '1'; }));

            // Show Return to Chat button
            const returnNavBtn = document.getElementById('returnToChatNavBtn');
            if (returnNavBtn) returnNavBtn.style.display = 'flex';

            // Populate peer info
            document.getElementById('peerActiveAvatar').textContent = peer.avatar || '🕵️';
            document.getElementById('peerActiveName').textContent = peer.nickname || 'Target_Peer';
            document.getElementById('peerActiveDevice').textContent = peer.device || 'Mobile';
            updateTransportBadge();
            document.getElementById('safetyEmojis').textContent = state.safetyEmojis || '🛡️ ⚡ 🔑 🦅';
            document.getElementById('safetyHexCode').textContent = state.safetyFingerprint || 'VERIFIED E2EE';

            const msgInput = document.getElementById('msgInput');
            if (msgInput) msgInput.focus();
        }, 250);
    }

    function terminateSession() {
        // Clear all timers
        opticalResetSession();
        if (_connectionTimeoutTimer) { clearTimeout(_connectionTimeoutTimer); _connectionTimeoutTimer = null; }
        closeConnProgress();
        endP2PCall(false);

        if (state.dataChannel) {
            try { state.dataChannel.close(); } catch (e) {}
            state.dataChannel = null;
        }
        if (state.peerConnection) {
            try { state.peerConnection.close(); } catch (e) {}
            state.peerConnection = null;
        }
        state.activePeer = null;
        state.sessionKey = null;
        // A terminated session must not reuse its ECDH identity. Generate a
        // fresh ephemeral identity for the next discovery attempt.
        state.keyPair = null;
        state.myPublicKeyJwk = null;
        state.safetyFingerprint = '';
        state.safetyEmojis = '';
        state.transport = 'none';
        CryptoEngine.init().catch(() => {});
        state.qrHandshake = null;
        _pendingIceCandidates = [];
        _remoteDescriptionSet = false;
        state.transfers.clear();
        state.objectUrls.forEach(url => URL.revokeObjectURL(url));
        state.objectUrls.clear();

        // Re-enable connect buttons
        document.querySelectorAll('.peer-connect-btn').forEach(btn => {
            if (btn.id !== 'cancelConnBtn') { btn.disabled = false; btn.textContent = 'Connect'; }
        });

        const hud = document.getElementById('activeChatHUD');
        const standby = document.getElementById('standbyScreen');

        if (hud.style.display !== 'none') {
            // Fade out chat HUD
            hud.style.opacity = '0';
            setTimeout(() => {
                hud.style.display = 'none';
                hud.style.opacity = '';
                document.body.classList.remove('chat-active-view');
                const returnNavBtn = document.getElementById('returnToChatNavBtn');
                if (returnNavBtn) returnNavBtn.style.display = 'none';
                standby.style.opacity = '0';
                standby.style.display = 'flex';
                requestAnimationFrame(() => requestAnimationFrame(() => { standby.style.opacity = '1'; }));
                document.getElementById('messagesContainer').innerHTML = '';
            }, 270);
        } else {
            document.body.classList.remove('chat-active-view');
            const returnNavBtn = document.getElementById('returnToChatNavBtn');
            if (returnNavBtn) returnNavBtn.style.display = 'none';
            standby.style.display = 'flex';
            standby.style.opacity = '1';
            document.getElementById('messagesContainer').innerHTML = '';
        }
        console.log("P2P Session Terminated.");
    }

    function updatePeerListUI(peers) {
        state.discoveredPeers = peers;
        const countDisplay = document.getElementById('peerCountDisplay');
        if (countDisplay) countDisplay.textContent = peers.filter(p => p.id !== state.myId).length;

        // Update Radar Blips
        RadarEngine.updatePeerBlips(peers);

        const container = document.getElementById('peerListContainer');
        const bleContainer = document.getElementById('blePeerListContainer');

        const otherPeers = peers.filter(p => p.id !== state.myId);

        // 1. Update Main Radar Target List
        if (container) {
            if (otherPeers.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 12px; font-family: 'Courier Prime', monospace;">
                        <i data-lucide="radio" class="w-5 h-5 mx-auto mb-2 text-green-500 animate-pulse"></i>
                        No nearby peers currently broadcasting.<br>
                        Make sure other devices are on this WiFi or have Bluetooth active.
                    </div>
                `;
            } else {
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
                        <button class="peer-connect-btn" data-peer-id="${peer.id}" data-peer-nick="${escapeHtml(peer.nickname)}" onclick="window.PrivyNearbyConnect('${peer.id}')">
                            Connect
                        </button>
                    </div>
                `).join('');
            }
        }

        // 2. Update Bluetooth Modal Peer List
        if (bleContainer) {
            if (otherPeers.length === 0) {
                bleContainer.innerHTML = `
                    <div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 11px; font-family: 'Courier Prime', monospace;">
                        Scanning for Bluetooth peers in range...
                    </div>
                `;
            } else {
                bleContainer.innerHTML = otherPeers.map(peer => `
                    <div class="peer-card" style="padding: 8px 12px; background: rgba(6, 182, 212, 0.08); border-color: rgba(6, 182, 212, 0.25);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 18px;">${peer.avatar || '🕵️'}</div>
                            <div>
                                <div style="font-weight: 700; font-size: 12px; color: #fff;">${escapeHtml(peer.nickname)}</div>
                                <div style="font-size: 9.5px; color: var(--neon-cyan); font-family: 'Courier Prime', monospace;">
                                    ${peer.mode === 'ble' ? '📶 Active BLE Radio' : '📡 WiFi Mesh Peer'}
                                </div>
                            </div>
                        </div>
                        <button class="peer-connect-btn" data-peer-id="${peer.id}" data-peer-nick="${escapeHtml(peer.nickname)}" style="padding: 5px 12px; font-size: 11px; background: linear-gradient(135deg, #06b6d4, #0284c7);" onclick="document.getElementById('bleModal').classList.remove('active'); window.PrivyNearbyConnect('${peer.id}')">
                            Connect
                        </button>
                    </div>
                `).join('');
            }
        }

        setTimeout(() => lucide.createIcons(), 10);
    }


    // =========================================================================
    // 7. WEB BLUETOOTH & AIR-GAPPED QR HANDSHAKE
    // =========================================================================
    async function triggerBluetoothScan() {
        const msgEl = document.getElementById('bleStatusMsg');
        if (!navigator.bluetooth) {
            if (msgEl) msgEl.innerHTML = `<span style="color: #f59e0b;">⚠️ Web Bluetooth is not supported in this browser.<br>Use <strong style="color:#22c55e">QR Air-Gap</strong> or <strong style="color:#22c55e">WiFi</strong> mode to connect with nearby people.</span>`;
            return;
        }

        try {
            if (msgEl) msgEl.textContent = 'Confirming Bluetooth proximity...';
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['generic_access', 'battery_service']
            });

            if (msgEl) msgEl.innerHTML = `<span style="color: #22c55e;">✓ BLE confirmed: "${escapeHtml(device.name || 'Nearby Device')}" is in range!<br>Opening QR handshake to establish secure encrypted channel...</span>`;

            // Web Bluetooth only proves physical proximity — it cannot carry chat data.
            // Redirect to QR Air-Gap which completes the secure WebRTC handshake.
            setTimeout(() => {
                document.getElementById('bleModal')?.classList.remove('active');
                openQrHandshakeModal();
                showNearbyToast('📶 BLE proximity confirmed! Scan QR to open encrypted channel.', 'success');
            }, 1500);

        } catch (err) {
            if (msgEl) msgEl.innerHTML = `<span style="color: #94a3b8;">Bluetooth pairing cancelled or failed.<br>Try <strong style="color:#22c55e">QR Mode</strong> or <strong style="color:#22c55e">WiFi Mode</strong> instead.</span>`;
        }
    }

    let qrOfferScannerActive = false;
    let qrVideoElem = null;
    let qrScanTimer = null;
    const qrScanCanvas = document.createElement("canvas");
    const qrScanCtx = qrScanCanvas.getContext("2d", { willReadFrequently: true });

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

    async function encodeQrPayload(payload) {
        const text = JSON.stringify(payload);
        if ('CompressionStream' in window) {
            const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
            return `PC2Z:${bytesToBase64(compressed)}`;
        }
        return `PC2:${safeUtf8ToBase64(text)}`;
    }

    async function decodeQrPayload(raw) {
        if (raw.trim().startsWith('{')) return JSON.parse(raw);
        if (raw.startsWith('PC2Z:')) {
            if (!('DecompressionStream' in window)) throw new Error('This browser cannot read compressed handshake QR codes.');
            const stream = new Blob([base64ToBytes(raw.slice(5))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            return JSON.parse(await new Response(stream).text());
        }
        if (raw.startsWith('PC2:')) return JSON.parse(safeBase64ToUtf8(raw.slice(4)));
        return JSON.parse(safeBase64ToUtf8(raw));
    }

    function renderHandshakeQr(data, statusHtml) {
        const qrContainer = document.getElementById('qrCodeContainer');
        const statusEl = document.getElementById('qrStatusText');
        if (!qrContainer) return;
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: data,
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });
        if (statusEl) statusEl.innerHTML = statusHtml;
    }

    function waitForIceGatheringComplete(peerConnection, timeoutMs = 7000) {
        if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();
        return new Promise(resolve => {
            const timeout = setTimeout(finish, timeoutMs);
            function finish() {
                clearTimeout(timeout);
                peerConnection.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
            function check() {
                if (peerConnection.iceGatheringState === 'complete') finish();
            }
            peerConnection.addEventListener('icegatheringstatechange', check);
        });
    }

    function closePendingQrConnection() {
        if (!state.qrHandshake) return;
        if (state.dataChannel) {
            try { state.dataChannel.close(); } catch (e) {}
            state.dataChannel = null;
        }
        if (state.peerConnection) {
            try { state.peerConnection.close(); } catch (e) {}
            state.peerConnection = null;
        }
        state.qrHandshake = null;
        state.sessionKey = null;
        state.activePeer = null;
    }

    function openQrHandshakeModal() {
        const modal = document.getElementById('qrModal');
        if (!modal) return;
        modal.classList.add('active');

        // Default to View 1 (Offer)
        document.getElementById('qrOfferView').style.display = 'block';
        document.getElementById('qrScanView').style.display = 'none';
        document.getElementById('qrOpticalView')?.style.setProperty('display', 'none');
        opticalStopReceiver();
        generateQrOffer();
    }

    function stopQrScanner() {
        qrOfferScannerActive = false;
        if (qrScanTimer) {
            clearTimeout(qrScanTimer);
            qrScanTimer = null;
        }
        if (qrVideoElem && qrVideoElem.srcObject) {
            try {
                qrVideoElem.srcObject.getTracks().forEach(t => t.stop());
            } catch (e) {}
            qrVideoElem.srcObject = null;
        }
    }

    function handleDecodedQrPayload(rawBase64Data) {
        try {
            const parsed = JSON.parse(safeBase64ToUtf8(rawBase64Data));
            if (parsed.type === 'airgap_offer' && parsed.key) {
                stopQrScanner();
                document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));

                if (parsed.sid && parsed.sid === state.myId) {
                    showNearbyToast('⚠️ You scanned your own QR code!', 'error');
                    return true;
                }

                if (parsed.sid && parsed.sid !== state.myId) {
                    // Server-relayed WebRTC: use socket ID embedded in QR for full P2P DataChannel
                    connectToPeer({
                        id: parsed.sid,
                        nickname: parsed.nick || 'QR_Agent',
                        avatar: parsed.avatar || '📷',
                        mode: 'qr',
                        device: 'QR Verified',
                        publicKey: parsed.key
                    });
                } else {
                    // Match peer in discovered list if available
                    const match = state.discoveredPeers.find(p => p.id !== state.myId && p.nickname === parsed.nick);
                    if (match) {
                        connectToPeer({ ...match, publicKey: parsed.key });
                    } else {
                        // Offline/local fallback: derive key & enter chat
                        CryptoEngine.deriveSharedSessionKey(parsed.key).then(() => {
                            switchToActiveChat({
                                id: 'airgap_peer',
                                nickname: parsed.nick || 'AirGap_Agent',
                                avatar: parsed.avatar || '📷',
                                device: 'Air-Gapped Optical Link',
                                publicKey: parsed.key
                            });
                            AudioEngine.playLockBeep();
                            showNearbyToast('🔒 Air-Gapped E2EE optical channel ready!', 'success');
                        });
                    }
                }
                return true;
            }
        } catch (e) {
            console.error("QR decode error:", e);
        }
        return false;
    }

    async function generateQrOffer() {
        const qrContainer = document.getElementById('qrCodeContainer');
        const statusEl = document.getElementById('qrStatusText');
        if (!qrContainer) return;
        qrContainer.innerHTML = '';

        if (!state.myPublicKeyJwk) {
            await CryptoEngine.init();
        }

        const sid = state.myId || socket.id;
        const offerPayload = {
            type: 'airgap_offer',
            nick: state.myNickname,
            avatar: state.myAvatar,
            key: state.myPublicKeyJwk,
            sid: sid
        };

        const compressed = safeUtf8ToBase64(JSON.stringify(offerPayload));
        new QRCode(qrContainer, {
            text: compressed,
            width: 220,
            height: 220,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });

        if (statusEl) {
            statusEl.innerHTML = `● Offer Generated for <strong style="color:#fff;">${escapeHtml(state.myNickname)}</strong>.<br><span style="color:var(--text-muted);font-size:11px;">Point partner camera to connect instantly.</span>`;
        }
    }

    async function startQrScanner() {
        const video = document.getElementById('qrScannerVideo');
        const statusMsg = document.getElementById('qrScanStatusMsg');
        if (!video) return;
        qrVideoElem = video;

        if (statusMsg) statusMsg.textContent = '🎥 Initializing camera sensor...';

        // Check mediaDevices support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (statusMsg) {
                statusMsg.innerHTML = '<span style="color:#f59e0b;">⚠️ Direct camera requires HTTPS or localhost.<br>Please use the "Snap or Upload QR Image" button below!</span>';
            }
            return;
        }

        let stream = null;
        const constraintAttempts = [
            { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false },
            { video: { facingMode: "environment" }, audio: false },
            { video: { facingMode: "user" }, audio: false },
            { video: true, audio: false }
        ];

        for (const constraint of constraintAttempts) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraint);
                if (stream) break;
            } catch (e) {
                console.warn("Camera constraint attempt failed:", constraint, e.message);
            }
        }

        if (!stream) {
            if (statusMsg) {
                statusMsg.innerHTML = '<span style="color:#ef4444;">⚠️ Camera access denied or unavailable.<br>Click "Snap or Upload QR Image" below to take or pick a photo!</span>';
            }
            return;
        }

        try {
            video.srcObject = stream;
            video.muted = true;
            video.setAttribute("playsinline", "true");
            video.setAttribute("webkit-playsinline", "true");
            await video.play();

            if (statusMsg) statusMsg.textContent = '● Camera active. Align partner QR in frame...';
            qrOfferScannerActive = true;
            scanQrLoop();
        } catch (err) {
            console.error("Camera playback failed:", err);
            if (statusMsg) {
                statusMsg.innerHTML = '<span style="color:#ef4444;">Camera preview failed. Use "Snap or Upload QR Image" below!</span>';
            }
        }
    }

    function scanQrLoop() {
        if (!qrOfferScannerActive || !qrVideoElem) return;

        if (qrVideoElem.readyState === qrVideoElem.HAVE_ENOUGH_DATA && qrVideoElem.videoWidth > 0) {
            qrScanCanvas.width = qrVideoElem.videoWidth;
            qrScanCanvas.height = qrVideoElem.videoHeight;
            qrScanCtx.drawImage(qrVideoElem, 0, 0, qrScanCanvas.width, qrScanCanvas.height);
            const imageData = qrScanCtx.getImageData(0, 0, qrScanCanvas.width, qrScanCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
                // QR decoding now performs asynchronous WebRTC/crypto work.
                // Keep scanning when a frame is not a valid PrivyChat payload.
                qrOfferScannerActive = false;
                handleDecodedQrPayload(code.data).then(success => {
                    if (!success) {
                        qrOfferScannerActive = true;
                        scanQrLoop();
                    }
                }).catch(() => {
                    qrOfferScannerActive = true;
                    scanQrLoop();
                });
            }
        }

        // Throttle scan to every 120ms to conserve mobile CPU. A valid QR
        // frame pauses this loop while its async handshake is processed.
        if (qrOfferScannerActive) qrScanTimer = setTimeout(scanQrLoop, 120);
    }

    // -------------------------------------------------------------------------
    // Optical QR transport v2
    // -------------------------------------------------------------------------
    // The original QR helpers remain above for backwards compatibility with
    // old bookmarks. These declarations intentionally override them at runtime
    // and exchange a complete SDP offer/answer, so QR mode has a real transport
    // and never relies on a Socket.IO signaling relay.
    function setQrView(view) {
        const offerView = document.getElementById('qrOfferView');
        const scanView = document.getElementById('qrScanView');
        if (offerView) offerView.style.display = view === 'scan' ? 'none' : 'block';
        if (scanView) scanView.style.display = view === 'scan' ? 'block' : 'none';
    }

    // Keep the optical payload browser-independent.  Raw UTF-8 base64 is
    // understood by older Safari/Chromium builds that do not expose
    // CompressionStream/DecompressionStream yet; local host-only SDP remains
    // small enough for a standard QR frame.
    async function encodeQrPayload(payload) {
        return `PC2:${safeUtf8ToBase64(JSON.stringify(payload))}`;
    }

    async function generateQrOffer() {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (!qrContainer) return;
        if (!state.myPublicKeyJwk) await CryptoEngine.init();
        if (state.peerConnection && !state.qrHandshake) {
            document.getElementById('qrModal')?.classList.remove('active');
            showNearbyToast('End the current session before starting an air-gapped handshake.', 'error');
            return;
        }
        closePendingQrConnection(true);

        const peer = {
            id: `qr:${createTransferId()}`,
            nickname: 'AirGap_Agent',
            avatar: 'QR',
            mode: 'qr',
            device: 'Air-Gapped Optical Link'
        };
        state.qrHandshake = { role: 'offer', connected: false };
        state.activePeer = peer;
        initPeerConnection(peer, true, { manualQr: true });
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        await waitForIceGatheringComplete(state.peerConnection);

        const encoded = await encodeQrPayload({
            version: 2,
            type: 'airgap_offer',
            nick: state.myNickname,
            avatar: state.myAvatar,
            key: state.myPublicKeyJwk,
            offer: state.peerConnection.localDescription
        });
        renderHandshakeQr(encoded, 'â— <strong style="color:#fff;">Offer ready.</strong><br><span style="color:var(--text-muted);font-size:11px;">Point the partner camera here. No signaling server is used.</span>');
    }

    async function handleDecodedQrPayload(rawData) {
        try {
            const parsed = await decodeQrPayload(rawData);
            if (await opticalHandleDecodedPayload(parsed)) return true;
            if (parsed.type === 'airgap_offer' && parsed.key && parsed.offer) {
                stopQrScanner();
                if (parsed.sid && parsed.sid === state.myId) {
                    showNearbyToast('You scanned your own QR code.', 'error');
                    return true;
                }
                if (state.activePeer && !state.qrHandshake) {
                    showNearbyToast('End the current session before starting an air-gapped handshake.', 'error');
                    return true;
                }

                await CryptoEngine.deriveSharedSessionKey(parsed.key);
                const peer = {
                    id: `qr:${createTransferId()}`,
                    nickname: parsed.nick || 'AirGap_Agent',
                    avatar: parsed.avatar || 'QR',
                    mode: 'qr',
                    device: 'Air-Gapped Optical Link',
                    publicKey: parsed.key
                };
                state.qrHandshake = { role: 'answer', connected: false };
                state.activePeer = peer;
                initPeerConnection(peer, false, { manualQr: true });
                await state.peerConnection.setRemoteDescription(parsed.offer);
                _remoteDescriptionSet = true;
                const answer = await state.peerConnection.createAnswer();
                await state.peerConnection.setLocalDescription(answer);
                await waitForIceGatheringComplete(state.peerConnection);

                const encoded = await encodeQrPayload({
                    version: 2,
                    type: 'airgap_answer',
                    nick: state.myNickname,
                    avatar: state.myAvatar,
                    key: state.myPublicKeyJwk,
                    answer: state.peerConnection.localDescription
                });
                setQrView('offer');
                renderHandshakeQr(encoded, 'â— <strong style="color:#fff;">Answer ready.</strong><br><span style="color:var(--text-muted);font-size:11px;">Show this QR to the offer device to finish.</span>');
                showNearbyToast('Optical answer ready. Show it to the other device.', 'success');
                return true;
            }

            if (parsed.type === 'airgap_answer' && parsed.key && parsed.answer && state.qrHandshake?.role === 'offer') {
                stopQrScanner();
                await CryptoEngine.deriveSharedSessionKey(parsed.key);
                state.activePeer = {
                    id: `qr:${createTransferId()}`,
                    nickname: parsed.nick || 'AirGap_Agent',
                    avatar: parsed.avatar || 'QR',
                    mode: 'qr',
                    device: 'Air-Gapped Optical Link',
                    publicKey: parsed.key
                };
                await state.peerConnection.setRemoteDescription(parsed.answer);
                _remoteDescriptionSet = true;
                const statusEl = document.getElementById('qrStatusText');
                if (statusEl) statusEl.innerHTML = 'âœ“ <strong style="color:#fff;">Answer accepted.</strong><br><span style="color:var(--text-muted);font-size:11px;">Opening the encrypted optical session...</span>';
                return true;
            }
        } catch (error) {
            console.warn('QR handshake rejected:', error.message);
            showNearbyToast('Invalid or expired PrivyChat handshake QR.', 'error');
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // 2-way animated optical QR messenger
    // -------------------------------------------------------------------------
    const OPTICAL_PROTOCOL = 'privy-opt-v1';
    const OPTICAL_CHUNK_BYTES = 220;
    const OPTICAL_FRAME_MS = 300;

    function opticalStatus(target, message, tone = '') {
        const el = document.getElementById(target);
        if (!el) return;
        el.textContent = message;
        el.style.color = tone === 'error' ? '#f87171' : tone === 'success' ? '#86efac' : '#94a3b8';
    }

    function opticalLog(text, received = false) {
        const log = document.getElementById('opticalChatLog');
        if (!log) return;
        const line = document.createElement('div');
        line.className = `optical-chat-line${received ? ' received' : ''}`;
        line.textContent = text;
        log.appendChild(line);
        while (log.children.length > 80) log.firstElementChild.remove();
        log.scrollTop = log.scrollHeight;
    }

    function opticalFrameAad(frame) {
        return `${OPTICAL_PROTOCOL}|${frame.id}|${frame.idx}|${frame.tot}`;
    }

    async function opticalChecksum(frame) {
        const bytes = new TextEncoder().encode(`${frame.iv}.${frame.data}`);
        return bytesToBase64(await window.crypto.subtle.digest('SHA-256', bytes));
    }

    function renderOpticalQr(payload) {
        const container = document.getElementById('opticalTxQr');
        if (!container || typeof QRCode === 'undefined') return;
        container.innerHTML = '';
        new QRCode(container, {
            text: typeof payload === 'string' ? payload : JSON.stringify(payload),
            width: 210,
            height: 210,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });
    }

    function opticalStopTransmitter() {
        if (state.optical.txTimer) clearInterval(state.optical.txTimer);
        state.optical.txTimer = null;
        state.optical.txFrames = [];
        state.optical.txIndex = 0;
        const txState = document.getElementById('opticalTxState');
        if (txState) txState.textContent = 'STANDBY';
    }

    function opticalStartTransmitter(frames) {
        opticalStopTransmitter();
        if (!frames || !frames.length) return;
        state.optical.txFrames = frames;
        state.optical.txIndex = 0;
        const draw = () => {
            const frame = state.optical.txFrames[state.optical.txIndex];
            if (!frame) return;
            renderOpticalQr(JSON.stringify(frame));
            opticalStatus('opticalTxStatus', `TX FRAME ${frame.idx + 1}/${frame.tot} • keep this screen facing the partner`, 'success');
            state.optical.txIndex = (state.optical.txIndex + 1) % state.optical.txFrames.length;
        };
        draw();
        const txState = document.getElementById('opticalTxState');
        if (txState) txState.textContent = 'STREAMING';
        state.optical.txTimer = setInterval(draw, OPTICAL_FRAME_MS);
    }

    async function opticalBuildFrames(payload) {
        if (!state.optical.sessionKey) throw new Error('Exchange optical key QR codes first.');
        const messageId = `msg_${createTransferId()}`;
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const total = Math.max(1, Math.ceil(bytes.length / OPTICAL_CHUNK_BYTES));
        if (total > 512) throw new Error('Optical payload is too large for one QR sequence.');
        const frames = [];
        for (let idx = 0; idx < total; idx++) {
            const plainChunk = bytesToBase64(bytes.subarray(idx * OPTICAL_CHUNK_BYTES, (idx + 1) * OPTICAL_CHUNK_BYTES));
            const frameBase = { p: OPTICAL_PROTOCOL, id: messageId, idx, tot: total };
            const encrypted = await CryptoEngine.encryptWithKey(plainChunk, state.optical.sessionKey, opticalFrameAad(frameBase));
            const frame = { ...frameBase, iv: encrypted.iv, data: encrypted.data };
            frame.chk = await opticalChecksum(frame);
            frames.push(frame);
        }
        return frames;
    }

    async function opticalSendText() {
        const input = document.getElementById('opticalMessageInput');
        const text = input?.value.trim();
        if (!text) return;
        try {
            const frames = await opticalBuildFrames({
                kind: 'text',
                sender: state.myNickname,
                timestamp: Date.now(),
                text
            });
            opticalStartTransmitter(frames);
            opticalLog(`You: ${text}`);
            input.value = '';
        } catch (error) {
            opticalStatus('opticalTxStatus', error.message, 'error');
        }
    }

    async function opticalToggleVoice() {
        const button = document.getElementById('opticalVoiceBtn');
        if (state.optical.mediaRecorder && state.optical.mediaRecorder.state !== 'inactive') {
            state.optical.mediaRecorder.stop();
            return;
        }
        if (!state.optical.sessionKey || !navigator.mediaDevices?.getUserMedia) {
            opticalStatus('opticalTxStatus', 'Exchange optical keys and allow microphone access first.', 'error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
            const mimeType = preferred.find(type => window.MediaRecorder?.isTypeSupported?.(type));
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            state.optical.mediaRecorder = recorder;
            state.optical.audioChunks = [];
            recorder.ondataavailable = event => { if (event.data.size) state.optical.audioChunks.push(event.data); };
            recorder.onstop = async () => {
                try {
                    const blob = new Blob(state.optical.audioChunks, { type: recorder.mimeType || 'audio/webm' });
                    if (blob.size > 96 * 1024) throw new Error('Optical voice notes are limited to 96 KB.');
                    const frames = await opticalBuildFrames({
                        kind: 'voice',
                        sender: state.myNickname,
                        timestamp: Date.now(),
                        mime: blob.type,
                        data: bytesToBase64(await blob.arrayBuffer())
                    });
                    opticalStartTransmitter(frames);
                    opticalLog('You: encrypted optical voice note');
                } catch (error) {
                    opticalStatus('opticalTxStatus', error.message, 'error');
                } finally {
                    stream.getTracks().forEach(track => track.stop());
                    state.optical.mediaRecorder = null;
                    state.optical.audioChunks = [];
                    if (button) button.classList.remove('recording');
                }
            };
            recorder.start();
            if (button) {
                button.classList.add('recording');
                button.title = 'Stop and transmit encrypted optical voice note';
            }
            opticalStatus('opticalTxStatus', 'RECORDING • click microphone again to transmit', 'success');
        } catch (error) {
            opticalStatus('opticalTxStatus', `Microphone unavailable: ${error.message}`, 'error');
        }
    }

    function opticalLogVoice(message) {
        const log = document.getElementById('opticalChatLog');
        if (!log) return;
        const line = document.createElement('div');
        line.className = 'optical-chat-line received';
        line.textContent = `${message.sender || 'Peer'}: encrypted optical voice note`;
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = URL.createObjectURL(new Blob([base64ToBytes(message.data)], { type: message.mime || 'audio/webm' }));
        state.objectUrls.add(audio.src);
        audio.style.display = 'block';
        audio.style.maxWidth = '100%';
        line.appendChild(audio);
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    }

    function opticalCleanupOldMessages() {
        const now = Date.now();
        for (const [id, entry] of state.optical.rxFrames) {
            if (now - entry.createdAt > 120000) state.optical.rxFrames.delete(id);
        }
    }

    async function opticalReceiveFrame(frame) {
        if (!state.optical.sessionKey || !frame || frame.p !== OPTICAL_PROTOCOL) return false;
        if (typeof frame.id !== 'string' || frame.id.length > 80 ||
            !Number.isInteger(frame.idx) || !Number.isInteger(frame.tot) ||
            frame.idx < 0 || frame.tot < 1 || frame.tot > 512 || frame.idx >= frame.tot ||
            typeof frame.iv !== 'string' || typeof frame.data !== 'string' || typeof frame.chk !== 'string') return false;
        const frameKey = `${frame.id}:${frame.idx}`;
        if (state.optical.seenFrames.has(frameKey)) return true;
        if (frame.data.length > 12000) return false;
        if (await opticalChecksum(frame) !== frame.chk) return false;
        state.optical.seenFrames.add(frameKey);
        if (state.optical.seenFrames.size > 2048) state.optical.seenFrames.delete(state.optical.seenFrames.values().next().value);

        const entry = state.optical.rxFrames.get(frame.id) || {
            tot: frame.tot,
            chunks: new Array(frame.tot),
            received: 0,
            createdAt: Date.now()
        };
        if (entry.tot !== frame.tot) return false;
        const decrypted = await CryptoEngine.decryptWithKey(frame, state.optical.sessionKey, opticalFrameAad(frame));
        const chunk = base64ToBytes(new TextDecoder().decode(decrypted));
        if (!entry.chunks[frame.idx]) {
            entry.chunks[frame.idx] = chunk;
            entry.received++;
        }
        state.optical.rxFrames.set(frame.id, entry);
        opticalStatus('opticalRxStatus', `RX FRAME ${entry.received}/${entry.tot} • checksum valid`, 'success');
        opticalCleanupOldMessages();
        if (entry.received !== entry.tot) return true;

        const size = entry.chunks.reduce((sum, value) => sum + value.byteLength, 0);
        const assembled = new Uint8Array(size);
        let offset = 0;
        entry.chunks.forEach(chunkValue => { assembled.set(chunkValue, offset); offset += chunkValue.byteLength; });
        state.optical.rxFrames.delete(frame.id);
        const message = JSON.parse(new TextDecoder().decode(assembled));
        if (message.kind === 'text') opticalLog(`${message.sender || 'Peer'}: ${message.text}`, true);
        if (message.kind === 'voice') opticalLogVoice(message);
        opticalStatus('opticalRxStatus', 'MESSAGE REASSEMBLED • decrypted in RAM', 'success');
        AudioEngine.playMsgChirp();
        return true;
    }

    async function opticalStartReceiver() {
        const video = document.getElementById('opticalRxVideo');
        const canvas = document.getElementById('opticalRxCanvas');
        if (!video || !canvas || !navigator.mediaDevices?.getUserMedia) {
            opticalStatus('opticalRxStatus', 'Camera access requires HTTPS or localhost.', 'error');
            return;
        }
        opticalStopReceiver();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            state.optical.rxVideo = video;
            state.optical.rxStream = stream;
            state.optical.rxCanvas = canvas;
            state.optical.rxContext = canvas.getContext('2d', { willReadFrequently: true });
            video.srcObject = stream;
            video.muted = true;
            await video.play();
            state.optical.rxLoop = true;
            const rxState = document.getElementById('opticalRxState');
            if (rxState) rxState.textContent = 'SCANNING 60FPS';
            document.getElementById('opticalScanBtn')?.style.setProperty('display', 'none');
            document.getElementById('opticalStopBtn')?.style.setProperty('display', 'inline-flex');
            opticalStatus('opticalRxStatus', 'Camera active • align the partner QR screen');
            requestAnimationFrame(opticalScanLoop);
        } catch (error) {
            opticalStatus('opticalRxStatus', `Camera unavailable: ${error.message}`, 'error');
        }
    }

    function opticalStopReceiver() {
        state.optical.rxLoop = false;
        try { state.optical.rxStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        if (state.optical.rxVideo) state.optical.rxVideo.srcObject = null;
        state.optical.rxStream = null;
        const rxState = document.getElementById('opticalRxState');
        if (rxState) rxState.textContent = 'STANDBY';
        document.getElementById('opticalScanBtn')?.style.setProperty('display', 'inline-flex');
        document.getElementById('opticalStopBtn')?.style.setProperty('display', 'none');
    }

    async function opticalScanLoop() {
        if (!state.optical.rxLoop || !state.optical.rxVideo || !state.optical.rxContext) return;
        const video = state.optical.rxVideo;
        if (!state.optical.rxBusy && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            const canvas = state.optical.rxCanvas;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            state.optical.rxContext.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = state.optical.rxContext.getImageData(0, 0, canvas.width, canvas.height);
            const code = typeof jsQR === 'function' ? jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' }) : null;
            if (code?.data) {
                state.optical.rxBusy = true;
                try {
                    const parsed = await decodeQrPayload(code.data);
                    await opticalHandleDecodedPayload(parsed);
                } catch (error) {
                    opticalStatus('opticalRxStatus', 'QR frame rejected • waiting for next frame', 'error');
                } finally {
                    state.optical.rxBusy = false;
                }
            }
        }
        if (state.optical.rxLoop) requestAnimationFrame(opticalScanLoop);
    }

    async function opticalHandleDecodedPayload(parsed) {
        if (!parsed) return false;
        if (parsed.p === OPTICAL_PROTOCOL && parsed.id) return opticalReceiveFrame(parsed);
        if (parsed.type !== 'optical_offer' && parsed.type !== 'optical_ack') return false;
        document.getElementById('qrModal')?.classList.add('active');
        document.getElementById('qrOfferView')?.style.setProperty('display', 'none');
        document.getElementById('qrScanView')?.style.setProperty('display', 'none');
        document.getElementById('qrOpticalView')?.style.setProperty('display', 'block');
        if (!parsed.key) throw new Error('Optical key QR is missing a public key.');

        await CryptoEngine.init();
        const previousSessionKey = state.sessionKey;
        await CryptoEngine.deriveSharedSessionKey(parsed.key);
        state.optical.sessionKey = state.sessionKey;
        state.sessionKey = previousSessionKey;
        state.optical.peerKey = parsed.key;
        state.optical.active = true;
        const safetyLabel = state.safetyFingerprint ? ` • SAFETY ${state.safetyFingerprint} ${state.safetyEmojis}` : '';

        if (parsed.type === 'optical_offer') {
            state.optical.role = 'answer';
            const ack = {
                p: OPTICAL_PROTOCOL,
                type: 'optical_ack',
                nick: state.myNickname,
                avatar: state.myAvatar,
                key: state.myPublicKeyJwk
            };
            renderOpticalQr(JSON.stringify(ack));
            opticalStatus('opticalTxStatus', `KEY ACK READY${safetyLabel} • show this screen to the offer device`, 'success');
            const txState = document.getElementById('opticalTxState');
            if (txState) txState.textContent = 'KEY ACK';
            return true;
        }

        state.optical.role = 'established';
        opticalStatus('opticalTxStatus', `OPTICAL E2EE READY${safetyLabel} • AES-256-GCM frames can transmit`, 'success');
        opticalStatus('opticalRxStatus', `OPTICAL E2EE READY${safetyLabel} • point camera at partner screen`, 'success');
        const txState = document.getElementById('opticalTxState');
        if (txState) txState.textContent = 'E2EE READY';
        return true;
    }

    async function opticalGenerateOffer() {
        await CryptoEngine.init();
        opticalStopTransmitter();
        state.optical.active = true;
        state.optical.role = 'offer';
        state.optical.sessionKey = null;
        state.optical.peerKey = null;
        state.optical.rxFrames.clear();
        state.optical.seenFrames.clear();
        renderOpticalQr(JSON.stringify({
            p: OPTICAL_PROTOCOL,
            type: 'optical_offer',
            nick: state.myNickname,
            avatar: state.myAvatar,
            key: state.myPublicKeyJwk
        }));
        opticalStatus('opticalTxStatus', 'KEY OFFER READY • point partner camera here', 'success');
        const txState = document.getElementById('opticalTxState');
        if (txState) txState.textContent = 'KEY OFFER';
    }

    function opticalResetSession() {
        try {
            if (state.optical.mediaRecorder && state.optical.mediaRecorder.state !== 'inactive') state.optical.mediaRecorder.stop();
            state.optical.mediaRecorder?.stream?.getTracks().forEach(track => track.stop());
        } catch (e) {}
        opticalStopTransmitter();
        opticalStopReceiver();
        state.optical.active = false;
        state.optical.role = null;
        state.optical.sessionKey = null;
        state.optical.peerKey = null;
        state.optical.rxFrames.clear();
        state.optical.seenFrames.clear();
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
            showNearbyToast('Microphone permission required: ' + err.message, 'error');
        }
    }

    async function stopAndSendVoiceRecording() {
        if (!state.mediaRecorder) return;

        state.mediaRecorder.onstop = async () => {
            clearInterval(state.voiceTimerInterval);
            document.getElementById('voiceRecordingBar').style.display = 'none';

            const audioBlob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType || 'audio/webm' });
            try {
                const transfer = await sendBinaryTransfer({
                    blob: audioBlob,
                    name: `voice-note-${Date.now()}.webm`,
                    mime: audioBlob.type,
                    kind: 'voice',
                    burn: state.burnTimer
                });
                const url = URL.createObjectURL(audioBlob);
                state.objectUrls.add(url);
                AudioEngine.playMsgChirp();
                renderMessage({
                    type: 'voice',
                    isSent: true,
                    audioSrc: url,
                    timestamp: transfer.timestamp,
                    burn: state.burnTimer,
                    objectUrl: url
                });
            } catch (error) {
                showNearbyToast(error.message, 'error');
            }

            // Stop mic tracks
            state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        };

        state.mediaRecorder.stop();
    }

    // -------------------------------------------------------------------------
    // Voice memo overrides: capture through a real Web Audio masking graph when
    // requested, and make Cancel discard the recording instead of transmitting
    // it through the recorder's normal onstop handler.
    // -------------------------------------------------------------------------
    function createVoiceMaskGraph(sourceStream) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return { stream: sourceStream, cleanup: () => {} };
        const ctx = new AudioContextCtor();
        const source = ctx.createMediaStreamSource(sourceStream);
        const distortion = ctx.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < curve.length; i++) {
            const x = (i * 2) / curve.length - 1;
            curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 3.2));
        }
        distortion.curve = curve;
        distortion.oversample = '2x';
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1350;
        filter.Q.value = 0.85;
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        const destination = ctx.createMediaStreamDestination();
        source.connect(distortion).connect(filter).connect(gain).connect(destination);
        ctx.resume().catch(() => {});
        return {
            stream: destination.stream,
            cleanup: () => {
                try { source.disconnect(); distortion.disconnect(); filter.disconnect(); gain.disconnect(); } catch (e) {}
                try { ctx.close(); } catch (e) {}
            },
            context: ctx
        };
    }

    async function startVoiceRecording() {
        if (state.mediaRecorder) return;
        try {
            const sourceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.voiceSourceStream = sourceStream;
            state.cancelVoiceRecording = false;
            state.voiceMasking = !!document.getElementById('voiceMaskToggle')?.checked;
            const graph = state.voiceMasking ? createVoiceMaskGraph(sourceStream) : { stream: sourceStream, cleanup: () => {} };
            state.voiceAudioNodes = graph;
            const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
            const mimeType = preferredTypes.find(type => window.MediaRecorder?.isTypeSupported?.(type));
            state.mediaRecorder = new MediaRecorder(graph.stream, mimeType ? { mimeType } : undefined);
            state.audioChunks = [];
            state.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) state.audioChunks.push(event.data);
            };
            state.mediaRecorder.onstop = async () => {
                clearInterval(state.voiceTimerInterval);
                const recorder = state.mediaRecorder;
                const audioBlob = new Blob(state.audioChunks, { type: recorder?.mimeType || 'audio/webm' });
                const cancelled = state.cancelVoiceRecording;
                if (!cancelled && audioBlob.size > 0) {
                    try {
                        const transfer = await sendBinaryTransfer({
                            blob: audioBlob,
                            name: `voice-note-${Date.now()}.webm`,
                            mime: audioBlob.type,
                            kind: 'voice',
                            burn: state.burnTimer
                        });
                        const url = URL.createObjectURL(audioBlob);
                        state.objectUrls.add(url);
                        AudioEngine.playMsgChirp();
                        renderMessage({ type: 'voice', isSent: true, audioSrc: url, timestamp: transfer.timestamp, burn: state.burnTimer, objectUrl: url });
                    } catch (error) {
                        showNearbyToast(error.message, 'error');
                    }
                }
                try { state.voiceSourceStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
                try { state.voiceAudioNodes?.cleanup?.(); } catch (e) {}
                state.voiceSourceStream = null;
                state.voiceAudioNodes = null;
                state.mediaRecorder = null;
                state.audioChunks = [];
                state.cancelVoiceRecording = false;
                const bar = document.getElementById('voiceRecordingBar');
                if (bar) bar.style.display = 'none';
            };
            state.mediaRecorder.start();
            const bar = document.getElementById('voiceRecordingBar');
            if (bar) bar.style.display = 'flex';
            let seconds = 0;
            const timerEl = document.getElementById('voiceTimer');
            state.voiceTimerInterval = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                if (timerEl) timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }, 1000);
        } catch (error) {
            showNearbyToast(`Microphone permission required: ${error.message}`, 'error');
        }
    }

    async function stopAndSendVoiceRecording() {
        if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
        state.cancelVoiceRecording = false;
        state.mediaRecorder.stop();
    }

    function cancelVoiceRecording() {
        if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
        state.cancelVoiceRecording = true;
        state.mediaRecorder.stop();
    }

    function panicPurge() {
        // Stop every active media source before dropping the references.
        opticalResetSession();
        try { stopQrScanner(); } catch (e) {}
        try { if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') { state.cancelVoiceRecording = true; state.mediaRecorder.stop(); } } catch (e) {}
        try { state.voiceSourceStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        try { state.localStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        try { state.remoteStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        try { state.dataChannel?.close(); } catch (e) {}
        try { state.peerConnection?.close(); } catch (e) {}
        try { socket.disconnect(); } catch (e) {}
        clearInterval(state.voiceTimerInterval);
        clearInterval(state.callTimerInterval);
        clearInterval(_connElapsedInterval);
        state.objectUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (e) {} });
        state.objectUrls.clear();
        state.transfers.clear();
        state.keyPair = null;
        state.myPublicKeyJwk = null;
        state.sessionKey = null;
        state.activePeer = null;
        state.peerConnection = null;
        state.dataChannel = null;
        state.qrHandshake = null;
        state.audioChunks = [];
        state.voiceSourceStream = null;
        state.voiceAudioNodes = null;
        state.mediaRecorder = null;
        // Clear any legacy storage written by older builds, then remove the
        // visible DOM so no ciphertext or media URL remains in the page heap.
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
        document.body.classList.add('panic-active');
        document.body.replaceChildren();
        setTimeout(() => { window.location.replace('about:blank'); }, 120);
    }

    // Browsers normally reclaim a page's heap on close, but pagehide can also
    // place a tab in the back-forward cache. Explicitly drop volatile secrets
    // and media handles so a restored page cannot resurrect an old session.
    window.addEventListener('pagehide', () => {
        opticalResetSession();
        try { state.dataChannel?.close(); } catch (e) {}
        try { state.peerConnection?.close(); } catch (e) {}
        try { state.localStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        try { state.voiceSourceStream?.getTracks().forEach(track => track.stop()); } catch (e) {}
        state.objectUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (e) {} });
        state.objectUrls.clear();
        state.transfers.clear();
        state.keyPair = null;
        state.myPublicKeyJwk = null;
        state.sessionKey = null;
        state.activePeer = null;
        try { socket.disconnect(); } catch (e) {}
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted) window.location.reload();
    });

    // =========================================================================
    // 9. EVENT LISTENERS & DOM HOOKS
    // =========================================================================
    document.addEventListener('DOMContentLoaded', async () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js').catch(() => {
                // The mesh still works directly when service workers are
                // unavailable (for example, when opened from file://).
            });
        }
        setOfflineMeshStatus(!navigator.onLine);
        window.addEventListener('offline', () => {
            setOfflineMeshStatus(true);
            showNearbyToast('Offline mesh active: use the local hotspot or Air-Gap QR.', 'info');
        });
        window.addEventListener('online', () => {
            setOfflineMeshStatus(false);
            if (!socket.connected) socket.connect();
            showNearbyToast('Network restored. Local mesh remains available.', 'success');
        });

        // Initialize Crypto & Radar
        await CryptoEngine.init();
        RadarEngine.init();

        // Register with Socket.io on local network
        const registerOnMesh = () => {
            if (socket.id) {
                state.myId = socket.id;
            }
            socket.emit('nearby_join', {
                nickname: state.myNickname,
                avatar: state.myAvatar,
                mode: state.mode,
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                publicKey: state.myPublicKeyJwk
            });
        };

        if (socket.connected) {
            registerOnMesh();
        }
        socket.on('connect', registerOnMesh);
        socket.on('reconnect', registerOnMesh);

        socket.on('nearby_registered', (data) => {
            state.myId = data.id;
        });

        socket.on('nearby_peer_list', (peers) => {
            updatePeerListUI(peers);
        });

        // ── ZERO-KNOWLEDGE INSTANT E2EE SESSION RELAY & HANDSHAKE ──
        socket.on('nearby_session_request', async (data) => {
            document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
            stopQrScanner();

            const sender = data.sender || { id: data.from, nickname: 'Peer', avatar: '🕵️' };
            state.activePeer = sender;

            openConnProgress(`Incoming from ${escapeHtml(sender.nickname || 'Peer')}`);
            updateConnStep(1, 'active');

            if (!sender.publicKey) {
                closeConnProgress();
                showNearbyToast('Peer did not provide an ephemeral public key.', 'error');
                return;
            }
            await CryptoEngine.deriveSharedSessionKey(sender.publicKey);
            updateConnStep(1, 'done');
            updateConnStep(2, 'done');
            updateConnStep(3, 'done');
            updateConnStep(4, 'done');
            state.transport = 'relay';
            updateTransportBadge();

            // Send back our public key confirmation
            socket.emit('nearby_session_accept', {
                to: data.from,
                publicKey: state.myPublicKeyJwk
            });

            AudioEngine.playLockBeep();
            setTimeout(() => {
                closeConnProgress();
                switchToActiveChat(sender);
                showNearbyToast('🔒 Encrypted P2P session established!', 'success');
            }, 350);
        });

        socket.on('nearby_session_accept', async (data) => {
            const sender = data.sender || { id: data.from, nickname: 'Peer', avatar: '🕵️' };
            state.activePeer = sender;

            if (!sender.publicKey) {
                showNearbyToast('Peer did not provide an ephemeral public key.', 'error');
                return;
            }
            if (!state.sessionKey) await CryptoEngine.deriveSharedSessionKey(sender.publicKey);
            updateConnStep(2, 'done');
            updateConnStep(3, 'done');
            updateConnStep(4, 'done');
            state.transport = 'relay';
            updateTransportBadge();

            AudioEngine.playLockBeep();
            setTimeout(() => {
                closeConnProgress();
                switchToActiveChat(sender);
                showNearbyToast('🔒 Encrypted P2P session established!', 'success');
            }, 350);
        });

        // Zero-Knowledge Encrypted Socket Message Receiver
        socket.on('nearby_p2p_message', (data) => {
            if (data && data.packet) {
                handleIncomingP2PPayload(data.packet);
            }
        });

        // WebRTC Signaling Handlers with W3C Perfect Negotiation Pattern (Simultaneous Connect Glare Resolution)
        socket.on('nearby_signal', async (data) => {
            const isPolite = state.myId < data.from;
            try {
                if (data.type === 'offer') {
                    if (!state.peerConnection) {
                        initPeerConnection({ id: data.from }, false);
                    }

                    const offerCollision = isMakingOffer || (state.peerConnection && state.peerConnection.signalingState !== "stable");
                    ignoreOffer = !isPolite && offerCollision;

                    if (ignoreOffer) {
                        console.log("Impolite Peer: Ignored colliding offer in favor of local offer");
                        return;
                    }

                    if (offerCollision && isPolite) {
                        console.log("Polite Peer: Rolling back local offer to accept incoming offer");
                        await state.peerConnection.setLocalDescription({ type: 'rollback' });
                    }

                    const sender = {
                        id: data.from,
                        nickname: (data.senderInfo && data.senderInfo.nickname) || 'Peer',
                        avatar: (data.senderInfo && data.senderInfo.avatar) || '🕵️',
                        mode: (data.senderInfo && data.senderInfo.mode) || 'wifi',
                        device: (data.senderInfo && data.senderInfo.device) || 'Mobile',
                        publicKey: (data.senderInfo && data.senderInfo.publicKey) || null
                    };

                    if (!sender.publicKey) throw new Error('Signaling peer did not provide an ephemeral public key.');
                    if (!state.sessionKey) await CryptoEngine.deriveSharedSessionKey(sender.publicKey);

                    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
                    _remoteDescriptionSet = true;

                    while (_pendingIceCandidates.length > 0) {
                        const cand = _pendingIceCandidates.shift();
                        try { await state.peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
                    }

                    const answer = await state.peerConnection.createAnswer();
                    await state.peerConnection.setLocalDescription(answer);

                    socket.emit('nearby_signal', {
                        to: data.from,
                        signal: answer,
                        type: 'answer',
                        senderInfo: {
                            id: state.myId || socket.id,
                            nickname: state.myNickname,
                            avatar: state.myAvatar,
                            mode: state.mode,
                            device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                            publicKey: state.myPublicKeyJwk
                        }
                    });
                } else if (data.type === 'answer') {
                    if (state.peerConnection && state.peerConnection.signalingState === 'have-local-offer') {
                        if (!data.senderInfo || !data.senderInfo.publicKey) throw new Error('Signaling peer did not provide an ephemeral public key.');
                        if (!state.sessionKey) await CryptoEngine.deriveSharedSessionKey(data.senderInfo.publicKey);

                        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
                        _remoteDescriptionSet = true;

                        while (_pendingIceCandidates.length > 0) {
                            const cand = _pendingIceCandidates.shift();
                            try { await state.peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
                        }
                    }
                }
            } catch (err) {
                console.warn("Signaling process notice:", err);
            }
        });

        socket.on('nearby_ice_candidate', async (data) => {
            if (!state.peerConnection || !data.candidate) return;
            if (_remoteDescriptionSet && state.peerConnection.remoteDescription && state.peerConnection.remoteDescription.type) {
                try {
                    await state.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.warn('ICE candidate notice:', e.message);
                }
            } else {
                _pendingIceCandidates.push(data.candidate);
            }
        });

        // Socket Call Signal Listeners
        socket.on('nearby_call_request', (data) => {
            AudioEngine.playRingtone();
            const callModal = document.getElementById('callModal');
            const callerName = (data.caller && data.caller.nickname) || 'Agent';
            document.getElementById('callAvatarIcon').textContent = (data.caller && data.caller.avatar) || '🕵️';
            document.getElementById('callPeerHeading').textContent = `Incoming Call: ${callerName}`;
            document.getElementById('callSubheading').textContent = 'INCOMING ENCRYPTED P2P VOICE CALL • RINGING';
            document.getElementById('acceptCallBtn').style.display = 'flex';
            document.getElementById('hangupCallBtn').style.display = 'flex';
            if (callModal) callModal.classList.add('active');
        });

        socket.on('nearby_call_response', (data) => {
            if (data.accepted) {
                AudioEngine.stopRingtone();
                startCallTimer();
                document.getElementById('callPeerHeading').textContent = `Connected: ${state.activePeer ? state.activePeer.nickname : 'Partner'}`;
                document.getElementById('acceptCallBtn').style.display = 'none';
                showNearbyToast('📞 Voice Call Connected!', 'success');
            }
        });

        socket.on('nearby_call_end', () => {
            endP2PCall(false);
        });

        // Profile inputs
        const nickInput = document.getElementById('nicknameInput');
        if (nickInput) {
            nickInput.value = state.myNickname;
            nickInput.addEventListener('change', () => {
                state.myNickname = nickInput.value.trim() || 'Agent_007';
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
                if (avatarBtn) avatarBtn.textContent = state.myAvatar;
                document.getElementById('avatarModal').classList.remove('active');
                socket.emit('nearby_update_profile', { avatar: state.myAvatar });
            }
        });

        document.getElementById('closeAvatarModalBtn')?.addEventListener('click', () => {
            document.getElementById('avatarModal').classList.remove('active');
        });

        // Cancel connection button — abort ongoing WebRTC handshake
        document.getElementById('cancelConnBtn')?.addEventListener('click', () => {
            closeConnProgress();
            terminateSession();
            showNearbyToast('Connection cancelled.', 'info');
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
        let typingStopTimer = null;

        const doSend = () => {
            if (msgInput) {
                sendTextMessage(msgInput.value);
                msgInput.value = '';
            }
        };

        if (sendBtn) sendBtn.addEventListener('click', doSend);
        if (msgInput) {
            msgInput.addEventListener('input', () => {
                if (!state.activePeer || !state.sessionKey) return;
                sendEncryptedControl('typing', { isTyping: msgInput.value.length > 0 }).catch(() => {});
                clearTimeout(typingStopTimer);
                typingStopTimer = setTimeout(() => {
                    sendEncryptedControl('typing', { isTyping: false }).catch(() => {});
                }, 1200);
            });
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    doSend();
                    clearTimeout(typingStopTimer);
                    sendEncryptedControl('typing', { isTyping: false }).catch(() => {});
                }
            });
        }

        // Voice Memo buttons
        document.getElementById('recordVoiceBtn')?.addEventListener('click', startVoiceRecording);
        document.getElementById('sendVoiceBtn')?.addEventListener('click', stopAndSendVoiceRecording);
        document.getElementById('cancelVoiceBtn')?.addEventListener('click', () => {
            cancelVoiceRecording();
        });

        // File Attachment
        const fileInput = document.getElementById('fileInput');
        document.getElementById('attachFileBtn')?.addEventListener('click', () => fileInput.click());
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file || !state.activePeer) return;

                try {
                    const transfer = await sendBinaryTransfer({
                        blob: file,
                        name: file.name,
                        mime: file.type || 'application/octet-stream',
                        kind: 'file',
                        burn: state.burnTimer
                    });
                    const url = URL.createObjectURL(file);
                    state.objectUrls.add(url);
                    AudioEngine.playMsgChirp();
                    renderMessage({
                        type: 'file',
                        isSent: true,
                        file: { ...transfer.meta, url },
                        timestamp: transfer.timestamp,
                        burn: state.burnTimer,
                        objectUrl: url
                    });
                } catch (error) {
                    showNearbyToast(error.message, 'error');
                } finally {
                    fileInput.value = '';
                }
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

        // P2P Direct Voice Call Controls
        document.getElementById('startCallBtn')?.addEventListener('click', startP2PCall);
        document.getElementById('acceptCallBtn')?.addEventListener('click', acceptIncomingCall);
        document.getElementById('hangupCallBtn')?.addEventListener('click', () => endP2PCall(true));

        // Discovery Mode Buttons
        document.getElementById('modeWifiBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'wifi';
            socket.emit('nearby_update_profile', { mode: 'wifi' });
            showNearbyToast('📡 Switched to WiFi / LAN Mode', 'info');
        });

        document.getElementById('modeBleBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'ble';
            socket.emit('nearby_update_profile', { mode: 'ble' });
            document.getElementById('bleModal').classList.add('active');
        });
        document.getElementById('closeBleModalBtn')?.addEventListener('click', () => {
            document.getElementById('bleModal').classList.remove('active');
        });
        document.getElementById('triggerBleRequestBtn')?.addEventListener('click', triggerBluetoothScan);

        // Fast Air-Gap QR Handshake button inside BLE modal
        document.getElementById('bleToQrBtn')?.addEventListener('click', () => {
            document.getElementById('bleModal').classList.remove('active');
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('modeQrBtn')?.classList.add('active');
            state.mode = 'qr';
            openQrHandshakeModal();
        });

        document.getElementById('modeQrBtn')?.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.mode = 'qr';
            openQrHandshakeModal();
        });
        document.getElementById('heroAirGapBtn')?.addEventListener('click', openQrHandshakeModal);
        document.getElementById('closeQrModalBtn')?.addEventListener('click', () => {
            document.getElementById('qrModal').classList.remove('active');
            stopQrScanner();
            opticalStopReceiver();
            opticalStopTransmitter();
            if (state.qrHandshake && !state.qrHandshake.connected) {
                closePendingQrConnection(true);
            }
        });

        document.getElementById('qrTabOffer')?.addEventListener('click', () => {
            stopQrScanner();
            opticalStopReceiver();
            document.getElementById('qrOfferView').style.display = 'block';
            document.getElementById('qrScanView').style.display = 'none';
            document.getElementById('qrOpticalView').style.display = 'none';
            generateQrOffer();
        });

        document.getElementById('qrTabScan')?.addEventListener('click', () => {
            opticalStopReceiver();
            document.getElementById('qrOfferView').style.display = 'none';
            document.getElementById('qrScanView').style.display = 'block';
            document.getElementById('qrOpticalView').style.display = 'none';
            startQrScanner();
        });

        document.getElementById('qrTabOptical')?.addEventListener('click', () => {
            stopQrScanner();
            document.getElementById('qrOfferView').style.display = 'none';
            document.getElementById('qrScanView').style.display = 'none';
            document.getElementById('qrOpticalView').style.display = 'block';
            if (!state.optical.active) opticalGenerateOffer();
        });
        document.getElementById('opticalGenerateBtn')?.addEventListener('click', opticalGenerateOffer);
        document.getElementById('opticalScanBtn')?.addEventListener('click', opticalStartReceiver);
        document.getElementById('opticalStopBtn')?.addEventListener('click', opticalStopReceiver);
        document.getElementById('opticalSendBtn')?.addEventListener('click', opticalSendText);
        document.getElementById('opticalVoiceBtn')?.addEventListener('click', opticalToggleVoice);
        document.getElementById('opticalMessageInput')?.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                opticalSendText();
            }
        });

        // Return to Chat Nav Button (Click to reopen clean chat if session active)
        document.getElementById('returnToChatNavBtn')?.addEventListener('click', () => {
            if (state.activePeer) {
                document.body.classList.add('chat-active-view');
            }
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
            panicPurge();
        });

        // Back to Radar Button (Toggle out of full-screen chat without disconnecting)
        document.getElementById('backToRadarBtn')?.addEventListener('click', () => {
            document.body.classList.toggle('chat-active-view');
        });

        // Gallery / Direct Photo QR Decoder
        const qrFileInput = document.getElementById('qrFileInput');
        document.getElementById('uploadQrImgBtn')?.addEventListener('click', () => {
            qrFileInput?.click();
        });

        if (qrFileInput) {
            qrFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const statusMsg = document.getElementById('qrScanStatusMsg');
                if (statusMsg) statusMsg.textContent = '🔍 Decoding photo QR code...';

                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imageData = ctx.getImageData(0, 0, img.width, img.height);
                        const code = jsQR(imageData.data, img.width, img.height, {
                            inversionAttempts: "dontInvert"
                        });

                        if (code && code.data) {
                            handleDecodedQrPayload(code.data).then(success => {
                                if (!success && statusMsg) {
                                statusMsg.innerHTML = '<span style="color:#ef4444;">⚠️ Invalid PrivyChat QR format. Try another photo.</span>';
                                }
                            });
                        } else {
                            if (statusMsg) statusMsg.innerHTML = '<span style="color:#ef4444;">⚠️ No QR code found in this image. Ensure clear lighting.</span>';
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        // Expose global connect function for inline blip/card clicks
        window.PrivyNearby = {
            connect: (id) => {
                const target = state.discoveredPeers.find(p => p.id === id);
                if (target) connectToPeer(target);
            }
        };
    });

})();
