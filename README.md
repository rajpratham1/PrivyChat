# 🛡️ PrivyChat - Secure & Ephemeral Messaging

![PrivyChat Banner](public/logo.png)

### **Premium Secure Chat. 100% Ephemeral. No Database.**
Designed by **Pratham Kumar**, PrivyChat is a statement against surveillance capitalism. It provides a secure, frictionless communication channel that leaves zero digital footprints.

---

## 🚀 Deployment

### **Option 1: Deploy to Render (Recommended)**
PrivyChat utilizes **WebSockets (Socket.io)** for real-time communication. This requires a stateful server, which `Render.com` provides for free.

1.  **Fork** this repository.
2.  Login to [Render Dashboard](https://dashboard.render.com).
3.  Click **New +** -> **Web Service**.
4.  Connect your GitHub repo `PrivyChat`.
5.  Render will auto-detect the `render.yaml` blueprint.
6.  Click **Create**. Your app is live!

### **Why not Vercel?**
Vercel is a Serverless/Static platform. It does not support persistent WebSocket connections (The "Phone Line" required for chat). If you deploy to Vercel, the app will load but disconnects after 10 seconds.

---

## 🔐 Security Architecture

PrivyChat employs a defense-in-depth strategy to ensure complete privacy:

### **1. Ephemeral Storage (RAM Only)**
*   **No Database**: There is no MongoDB, SQL, or Redis.
*   **Volatile Memory**: Messages are stored in the server's RAM arrays (`messages[]`).
*   **Instant Wipe**: The moment the server restarts (which happens frequently on free tiers) or the session ends, data is irretrievably lost.

### **2. End-to-End Encryption (E2E)**
We use the **Web Crypto API** (SubtleCrypto) native to modern browsers.

*   **Private Rooms**:
    *   **PBKDF2**: Key Derivation Function generates a cryptographic key from your Room Password + Room Name (Salt).
    *   **AES-GCM**: Military-grade encryption is used to lock messages before they leave your device.
*   **1-on-1 (Server Blind)**:
    *   **Hash-Based Key**: The encryption key is generated in the URL Hash (`#key=...`).
    *   **Server Blindness**: Browsers **never** send the URL fragment (after `#`) to the server. The server literally cannot see the key required to decrypt your chat.

### **3. Privacy Features**
*   **Screenshot Protection**: The UI blurs instantly (`filter: blur(10px)`) when the window loses focus (Alt-Tab detection).
*   **No IP Logging**: We do not log IP addresses or User Agents.

---

## 📂 Project Structure

A clean, modular MVC-lite architecture using Vanilla JS.

```
PrivyChat/
├── public/                 # Client-Side Code
│   ├── index.html          # Single Page Application (SPA) Entry
│   ├── app.js              # Core Logic (Socket, UI, Encryption)
│   ├── style.css           # Glassmorphism Design System
│   ├── crypto-utils.js     # E2E Encryption Handling (Web Crypto API)
│   └── logo.png            # Assets
├── server.js               # Node.js + Socket.io Server Backend
├── render.yaml             # Render Infrastructure-as-Code
├── vercel.json             # Vercel Configuration (Static Serving)
├── package.json            # Dependencies
└── README.md               # Documentation
```

---

## 🛠️ Technology Stack

*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Real-Time**: Socket.io v4
*   **Frontend**: Native HTML5, CSS3 Variables, ES6 JavaScript
*   **Cryptography**: AES-GCM (Galois/Counter Mode) via `window.crypto.subtle`

---

## 🌍 Developer & Vision

**Designed & Developed by [Pratham Kumar](https://rajpratham1.github.io/WebFolio/)**

> "In a world where every click is tracked and every message is archived, privacy is no longer a luxury—it's a necessity. We believe that your words belong to you, and the moment they are spoken, they should vanish into the ether."

### **Contact & Portfolio**
*   **Portfolio**: [WebFolio](https://rajpratham1.github.io/WebFolio/)
*   **GitHub**: [@rajpratham1](https://github.com/rajpratham1)

---

## 📄 License
This project is licensed under the **MIT License**.
Copyright (c) 2024 Pratham Kumar.
Free to use, study, and modify for educational or personal privacy tools.
