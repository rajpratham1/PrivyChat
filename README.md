# 🛡️ PrivyChat - The Zero-Trace Ephemeral Spy Messenger

![PrivyChat Banner](public/logo.png)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/Security-AES--256--GCM%20%7C%20ECDH%20P--256-emerald.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![P2P Mesh](https://img.shields.io/badge/Mesh-WiFi%20%2B%20Bluetooth%20%2B%20QR-cyan.svg)](public/nearby.html)
[![RAM-Only](https://img.shields.io/badge/Storage-100%25%20Volatile%20RAM-red.svg)](README.md)

> *"Privacy is not a crime. It is a fundamental human right."*

**PrivyChat** is an open-source, ultra-secure, RAM-only ephemeral messaging platform engineered for journalists, whistleblowers, activists, and security-conscious individuals. Built under a **"Zero-Trust"** philosophy, PrivyChat guarantees that no message, packet, or metadata touches a database or disk. 

Every communication channel is shielded with hardware-accelerated **AES-256-GCM encryption**, **Ephemeral ECDH Key Handshakes**, **Anti-Shoulder-Surfing OPSEC Tools**, **Invisible Ink Steganography**, and a brand-new **Nearby WiFi & Bluetooth Tactical Mesh Radar** for 100% offline, air-gapped communication.

---

## 📑 Table of Contents

- [Core Architectural Guarantees](#-core-architectural-guarantees)
- [Feature Suite](#-feature-suite)
- [Nearby WiFi, Bluetooth & Air-Gapped Mesh](#-nearby-wifi-bluetooth--air-gapped-mesh)
- [Cryptographic Specification](#-cryptographic-specification)
- [Physical OPSEC & Counter-Surveillance](#-physical-opsec--counter-surveillance)
- [Project Directory Structure](#-project-directory-structure)
- [Local Installation & Setup](#-local-installation--setup)
- [Production Deployment Guide](#-production-deployment-guide)
- [Admin & Lead Developer](#-admin--lead-developer)
- [License](#-license)

---

## 🧠 Core Architectural Guarantees

```
                                  [ ZERO-TRUST ARCHITECTURE ]
                                  
   +------------------+         Blind Encrypted Relay         +------------------+
   |   Sender Node    |  ---------------------------------->  |  Receiver Node   |
   | (Browser Client) |  <----------------------------------  | (Browser Client) |
   +------------------+           (No Plaintext Stored)       +------------------+
            |                                                           |
   +------------------+                                        +------------------+
   | Client-Side E2EE |                                        | Client-Side E2EE |
   |  • AES-256-GCM   |                                        |  • AES-256-GCM   |
   |  • ECDH P-256    |                                        |  • ECDH P-256    |
   |  • Volatile RAM  |                                        |  • Volatile RAM  |
   +------------------+                                        +------------------+
```

### 1. 100% Volatile RAM Lifecycle
- Traditional messaging apps record conversations in persistent databases (MongoDB, PostgreSQL, Redis).
- **PrivyChat Guarantee:** All active rooms and user states live exclusively in the volatile heap memory of the Node.js process.
- **Forensic Resistance:** If power is cut, the server restarts, or a container is destroyed, **100% of room history is irrecoverably obliterated**.

### 2. Zero-Knowledge Server Blindness
- Encryption and decryption happen solely within your browser via the native **Web Crypto API**.
- The server functions as a blind WebSocket/WebRTC relay, routing binary cipher blobs without holding decryption keys.

### 3. Absolute Zero-Log Policy
- 🚫 **No IP Logging:** Connection IP addresses are discarded immediately.
- 🚫 **No Metadata Retention:** Timestamps, sender relationships, and session metrics are never archived.
- 🚫 **Zero Third-Party Trackers:** Free of Google Analytics, Meta Pixels, tracking cookies, and advertising telemetry.

---

## 🌟 Feature Suite

### 📡 Air-Gapped & Nearby Tactical Mesh Radar (New!)
- **360° Sonar Radar HUD:** Animated radar canvas tracking active peer nodes within local proximity.
- **Triple-Vector Discovery:** Connect via local WiFi/Hotspot subnets (zero internet required), Web Bluetooth Low Energy (BLE), or camera-to-screen QR Code optical beams.
- **P2P Direct DataChannels:** Serverless peer-to-peer data streams (`RTCDataChannel`) with ephemeral ECDH P-256 key exchange.

### 🕵️ Physical OPSEC & Counter-Surveillance
- **Stealth Calculator Mode:** Transforms the entire interface into a functional scientific calculator. Unlock code: `1337=`.
- **Decoy Vault Redirection:** Type `weather`, `guest`, `aether`, or `1234` in the search bar for instant plausible deniability with a working weather app.
- **Ghost Mode:** Heavily blurs messages to thwart physical shoulder-surfers; reveals text only on direct hover or tap.
- **Invisible Ink Steganography:** Hide encrypted secret payloads inside innocent PNG/JPEG image carrier pixels using Least Significant Bit (LSB) encoding.
- **Emergency Panic Purge:** Destroys browser memory keys, purges storage, scrubs the DOM, and immediately redirects to Google.

### 💬 Ephemeral Rich Messaging & Calling
- **Self-Destruct Timers:** Messages burn after `5s`, `15s`, `30s`, `60s`, or upon initial viewing (`Burn on Read`).
- **Encrypted Voice Notes & Masking:** Record voice memos with real-time pitch-shifting disguises.
- **Secure WebRTC Calling:** Direct peer-to-peer voice and video calls with DTLS 1.2 & SRTP encryption.
- **Encrypted File Sharing:** Share documents and photos encrypted client-side chunk-by-chunk.

---

## 📡 Nearby WiFi, Bluetooth & Air-Gapped Mesh

| Discovery Vector | Connectivity Required | Range | Security Protocol |
| :--- | :--- | :--- | :--- |
| **Local WiFi / LAN** | Shared WiFi Router or Mobile Hotspot (**No Internet**) | 50–100m | WebRTC DataChannels + AES-256-GCM |
| **Web Bluetooth (BLE)** | Bluetooth Radio (`navigator.bluetooth`) | 10–30m | BLE GATT Proximity + ECDH Handshake |
| **Air-Gapped QR Beam** | Device Cameras (Zero RF Radiation / Air-Gapped) | Line of Sight | Optical SDP Handshake + AES-256-GCM |

---

## 🔐 Cryptographic Specification

| Component | Standard & Configuration | Security Assurance |
| :--- | :--- | :--- |
| **Symmetric Encryption** | AES-256-GCM | Authenticated encryption preventing ciphertext tampering |
| **Initialization Vector (IV)** | 96-bit (12 bytes) CSPRNG per message | Guarantees semantic security; eliminates nonce reuse |
| **Key Derivation Function** | PBKDF2 (SHA-256, 100,000 rounds) | Mitigates brute-force and dictionary attacks |
| **Asymmetric Key Exchange** | Ephemeral ECDH (NIST P-256 Curve) | Perfect Forward Secrecy per peer session |
| **MITM Verification** | 6-Block Hex Fingerprint + 4 Safety Emojis | Visual out-of-band verification against MITM interception |
| **Calling Media Stream** | DTLS-SRTP (WebRTC) | Zero-server audio/video encryption |

---

## 📱 Desktop & Mobile Responsiveness

PrivyChat is built using a mobile-first responsive architecture:
- **Dynamic Viewport Height:** Uses `100dvh` to ensure zero keyboard clipping on mobile browsers (iOS Safari, Android Chrome).
- **Touch-Friendly Controls:** Minimum 44px hit targets with haptic visual feedback.
- **Adaptive Radar Canvas:** Automatically scales the 360° sonar radar between desktop HUD and compact mobile viewports.
- **PWA Ready:** Installable as a progressive web app with offline cache fallback.

---

## 💻 Project Directory Structure

```
PrivyChat/
├── public/
│   ├── index.html          # Main Global Lobby Entry Point
│   ├── style.css           # Modern Cyber-Tactical Design System & Glassmorphism
│   ├── app.js              # Lobby, Room Handlers, OPSEC & Chat Logic
│   ├── nearby.html         # Nearby WiFi & Bluetooth Tactical Mesh Radar
│   ├── nearby.css          # Radar HUD & P2P Terminal Stylesheet
│   ├── nearby.js           # WebRTC DataChannels, Web Bluetooth, QR Engine & ECDH
│   ├── about.html          # Architecture Documentation & Creator Spotlight
│   ├── manual.html         # Comprehensive Tactical User Manual
│   ├── crypto-utils.js     # Web Crypto AES-GCM / PBKDF2 Helper Engine
│   ├── sound-utils.js      # Web Audio Synthesizer (Pings, Beeps, Voice Disguise)
│   ├── steg-utils.js       # Invisible Ink LSB Canvas Steganography Library
│   ├── manifest.json       # Progressive Web App (PWA) Manifest
│   └── logo.png            # PrivyChat Shield Identity Asset
├── server.js               # Node.js Server (RAM-Only State, WebSockets, LAN Signaling)
├── package.json            # Node.js Dependencies & NPM Scripts
├── render.yaml             # Render.com Cloud Infrastructure-as-Code Spec
├── vercel.json             # Vercel Serverless Configuration
└── README.md               # Technical Specification & Documentation
```

---

## 🚀 Local Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- NPM (v9.0.0 or higher)

### Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/rajpratham1/PrivyChat.git
cd PrivyChat

# 2. Install dependencies
npm install

# 3. Start the application
npm start
```

Open your browser at:
- **Global Lobby:** [http://localhost:3001](http://localhost:3001)
- **Nearby Tactical Mesh Radar:** [http://localhost:3001/nearby.html](http://localhost:3001/nearby.html)
- **About & Security Architecture:** [http://localhost:3001/about.html](http://localhost:3001/about.html)
- **User Manual:** [http://localhost:3001/manual.html](http://localhost:3001/manual.html)

---

## ☁️ Production Deployment Guide

### Deploying to Render.com (Recommended)
1. Push your repository to GitHub.
2. Link your repository on [Render.com](https://render.com) as a **Web Service**.
3. Configure the following build settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Set the Environment Variables:
   - `PORT`: `10000` (or leave default)
   - `RENDER_EXTERNAL_URL`: `https://your-service-name.onrender.com` (activates built-in keep-alive pings)

### Docker Deployment
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## 👤 Admin & Lead Developer

<div align="center">
  <img src="https://github.com/rajpratham1.png" width="120" style="border-radius: 50%; border: 3px solid #22c55e;" alt="Pratham Kumar" />
  <h3>Pratham Kumar</h3>
  <p><b>Founder, Admin & Lead Cryptography Engineer</b></p>
  <p>
    <a href="https://github.com/rajpratham1">GitHub (@rajpratham1)</a> •
    <a href="https://github.com/rajpratham1/PrivyChat">PrivyChat Repository</a>
  </p>
</div>

---

## ⚖️ License

PrivyChat is distributed under the open-source **MIT License**. See [LICENSE](LICENSE) for details.

```
Copyright (c) 2026 PrivyChat • Pratham Kumar
Zero Logs. Zero Traces. Pure Volatile Memory.
```
