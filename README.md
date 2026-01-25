# 🛡️ PrivyChat(SecureChat) - The Zero-Trace Spy Messenger

![PrivyChat Banner](public/logo.png)

> *"Privacy is not a crime. It is a fundamental human right."*

**PrivyChat** is an open-source, ultra-secure, and ephemeral messaging platform designed for journalists, activists, whistleblowers, and privacy enthusiasts. It is engineered with a **"Zero-Trust"** philosophy: we assume the server is compromised, the network is tapped, and the device might be seized.

To combat this, PrivyChat operates **entirely in RAM** (Random Access Memory), uses **Military-Grade End-to-End Encryption**, and includes distinct "Spy Features" like a decoy calculator mode and browser panic button.

---

## 📑 Table of Contents

- [Philosophy & Core Concepts](#-philosophy--core-concepts)
- [Features Overview](#-features-overview)
- [Technical Architecture](#-technical-architecture)
- [Security Protocol (Cryptography)](#-security-protocol)
- [Codebase Deep Dive](#-codebase-deep-dive)
- [Installation & Setup](#-installation--setup)
- [Deployment Guide](#-deployment-guide)
- [Disclaimer & License](#-disclaimer--license)

---

## 🧠 Philosophy & Core Concepts

### 1. RAM-Only Architecture
Traditional chat apps store messages in databases (MongoDB, SQL, Redis). This leaves a forensic trail.
- **PrivyChat approach:** Data exists *only* in the volatile memory of the Node.js process.
- **Consequence:** If the server is restarted, crashed, or seized, **100% of the data is instantly and irrevocably lost**. There is no "Restore Backup" button.

### 2. Zero-Knowledge Server
The server routes messages between users but **cannot read them**.
- All encryption happens in the **Browser (Client-Side)** using the **Web Crypto API**.
- The server only ever sees encrypted blobs (cipher text).

### 3. Plausible Deniability
Security is useless if you are forced to give up your password.
- **Decoy Vault:** A fake login system that redirects to a weather app, allowing you to prove you were just "checking the forecast".
- **Stealth Mode:** A calculator overlay that hides the chat interface instantly.

---

## 🌟 Features Overview

### 🕵️‍♂️ Stealth Suite
- **Google Theme UI:** A landing page disguised as a search engine. Passersby will think you are just browsing Google.
- **Ghost Mode:** Messages are blurred by default. They only reveal when you hover your mouse over them, preventing "shoulder surfing".
- **Stealth Calculator:** 
  - **Trigger:** Click the Mask Icon 🎭.
  - **Effect:** The app transforms into a functional scientific calculator.
  - **Unlock:** Enter `1337` + `=` to retrieve your chat.
- **Panic Button:** 
  - **Trigger:** Click the Red Siren 🚨.
  - **Effect:** Instantly disconnects socket, clears `localStorage`, `sessionStorage`, and redirects to `google.com`.

### 💬 Messaging
- **1v1 Secure Links:** "I'm Feeling Lucky" button generates a unique UUID room. The encryption key is embedded in the URL hash (`#key`) so the server never receives it.
- **Private Rooms:** Password-protected named rooms (e.g., "TeamAlpha").
- **Voice Notes:** Record encrypted audio clips (Opus/WebM).
- **File Sharing:** Send images and documents. Files are encrypted chunk-by-chunk before upload.

### 🛡️ Security Polish (v5.3.0)
- **XSS Protection:** Complete sanitization of all user inputs using strict DOM text node creation.
- **Server Hardening:** Implemented `helmet` for secure HTTP headers and `express-rate-limit` to prevent DDoS attacks.
- **Audit:** Comprehensive security review completed.

### 🎨 Modern UI/UX (v5.4.0)
- **Glassmorphism Design:** Consistent glass-morphism effects across all UI components.
- **Dark Spy Theme:** Professional dark theme with consistent color variables.
- **Floating Input:** Detached, glowing input capsule.
- **Mobile Optimization:** Perfect responsiveness with `100dvh` and touch-friendly buttons.
- **Enhanced Animations:** Smooth message entry animations.

### Secure Calling (v5.1)
- **Video Calls (WebRTC):** High-definition, P2P video chat. No server recording.
- **Voice Calls:** Audio-only mode.
- **Encryption:** DTLS-SRTP (Standard WebRTC encryption).

### 🎨 Immersion & UX (v3.3)
- **Voice Masks:** Record voice notes with disguises (Robot, Chipmunk, Monster).
- **Matrix Hacker Theme:** Terminal green aesthetics (triggered via 👨‍💻).
- **Sound Effects:** Satisfying audio feedback (WebAudio synth).
- **Interactive User List:** Click "Online Count" to see connected users.
- **Swipe-to-Reply:** Drag messages to reply.

---

## 🏗️ Technical Architecture

**PrivyChat** is a Real-Time Single Page Application (SPA) built with Vanilla JavaScript and Node.js.

```mermaid
graph TD
    UserA[User A (Browser)] <-->|Encrypted WSS| Server[Node.js Server (RAM Only)];
    UserB[User B (Browser)] <-->|Encrypted WSS| Server;
    
    UserA -- Key Exchange (RSA-OAEP) --> UserB;
    UserA -- AES-GCM Encrypted Data --> Server --> UserB;
```

- **Runtime:** Node.js (v14+)
- **Framework:** Express.js (HTTP Server)
- **Protocol:** Socket.io v4 (WebSockets with Polling fallback)
- **Frontend:** HTML5, CSS3, Vanilla JS (ES2020)
- **Cryptography:** `window.crypto.subtle` (Native Web Crypto API)

---

## 🔐 Security Protocol

We use a hybrid encryption scheme to ensure speed and security.

### 1. Key Generation (PBKDF2)
For Private Rooms, keys are derived from the password.
- **Algorithm:** PBKDF2 (Password-Based Key Derivation Function 2)
- **Hash:** SHA-256
- **Iterations:** 100,000
- **Salt:** Room Name
- **Output:** A 256-bit AES-GCM Encryption Key.

### 2. Message Encryption (AES-GCM)
All messages (Text, Images, Audio) are encrypted using AES-GCM.
- **Why AES-GCM?:** Authenticated Encryption (Confidentiality + Integrity).
- **IV (Initialization Vector):** A unique 12-byte random IV for every message.

### 3. Transport Layer
All data is transmitted over HTTPS / WSS, providing a second layer of encryption (TLS/SSL).

---

## 💻 Codebase Deep Dive

### Directory Structure
```
PrivyChat/
├── public/              # Frontend Assets
│   ├── index.html       # Single Entry Point
│   ├── style.css        # CSS3 (Glassmorphism, Dark Theme)
│   ├── app.js           # Core Logic (Socket, UI, Events)
│   ├── crypto-utils.js  # Cryptography Helper Library
│   ├── sound-utils.js   # Audio Effects & Voice Processing
│   └── about.html       # About Page
├── server.js            # Node.js Backend Entry Point
├── package.json         # Dependencies & Scripts
└── README.md            # Documentation
```

### Frontend: `app.js` & `crypto-utils.js`
The frontend is the "Brain" of the security.
- `CryptoUtils.deriveKey(password, salt)`: Uses `window.crypto.subtle.importKey`.
- `sendMessage()`: Captures input -> `CryptoUtils.encrypt(text, key)` -> Emits socket event.

### Backend: `server.js`
The backend is intentionally "dumb".
- `users = {}`: Maps SocketIDs to Usernames/Rooms.
- `socket.on('send_message')`: Broadcasts to room. NO storage.

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v14+)

### Local Deployment
1. **Clone the Repo:**
   ```bash
   git clone https://github.com/rajpratham1/PrivyChat.git
   cd PrivyChat
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Run Development Server:**
   ```bash
   npm run dev
   # or
   node server.js
   ```
4. **Access App:** Open Browser at `http://localhost:3000`.

---

## ☁️ Deployment Guide

### Deploy to Render.com (Recommended)
1. Push code to GitHub.
2. Create a New Web Service on Render.
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`

> **Note:** Do NOT deploy to Vercel/Netlify. They do not support persistent WebSockets. Use Render, Railway, or Fly.io.

---

## 👥 Contributors

- **Pratham Kumar** ([@rajpratham1](https://github.com/rajpratham1)) - Original Creator & Core Developer
- **Ayush Gangwar** ([@Arya182-ui](https://github.com/Arya182-ui)) - UI/UX Enhancement, Security Improvements & Code Quality

---

## ⚠️ Disclaimer & License

**Educational Purpose**: This software is provided for educational and research purposes. It has not undergone a formal third-party security audit.

**MIT License**
Copyright (c) 2026 PrivyChat

Permission is hereby granted, free of charge, to any person obtaining a copy of this software... (See full license in LICENSE file).
