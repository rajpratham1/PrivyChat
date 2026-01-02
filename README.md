# 🛡️ PrivyChat - Secure & Ephemeral

A premium, privacy-focused real-time chat application built for anonymity. 

**No Database. No Logs. 100% Ephemeral.**

![PrivyChat Logo](public/logo.png)

## 🚀 Features

*   **🔒 End-to-End Encryption**: 
    *   **Private Rooms**: Secured with AES-GCM (Password Derived).
    *   **1-on-1 Rooms**: Secured with **Server-Blind** Hash Keys. The server *never* sees the encryption key.
*   **👥 1-on-1 Rooms**: Instantly generate a unique, sharable link for private conversations (Max 2 users).
*   **👀 Screenshot Protection**: Privacy Blur activates instantly when you switch tabs or minimize.
*   **🔑 Password Protected Rooms**: Create named rooms that require a password to join.
*   **👻 Ephemeral Messaging**: Messages are RAM-only and vanish instantly when the server restarts or you leave.
*   **📂 File Sharing**: Share images and documents (up to 5MB) directly peer-to-peer.
*   **✨ Premium UI**: Glassmorphism design, smooth animations, and a "Cyber Security" blue theme.
*   **🔔 Smart Notifications**: Toast notifications and Modals replace intrusive browser alerts.

## 🛠️ Technology Stack

*   **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism), Vanilla JS (ES6+)
*   **Backend**: Node.js, Express.js
*   **Real-Time**: Socket.io (WebSockets)
*   **Security**: Web Crypto API (SubtleCrypto) for AES-GCM & PBKDF2

## 📦 Installation & Usage

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/rajpratham1/Hide.git
    cd Hide
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Server**
    ```bash
    node server.js
    ```
    *Or use the developer mode:*
    ```bash
    npm run dev
    ```

4.  **Open the App**
    *   Visit: `http://localhost:3001`
    *   **Public Access**: Use `go_live.bat` to expose via Localtunnel.

## 🌍 Designed & Developed By
**Pratham Kumar** (WebFolio)  
A project driven by the vision of restoring privacy in the digital age.  
[Visit Portfolio](https://rajpratham1.github.io/WebFolio/)

## ☁️ Deployment

### 🚀 Deploy to Render (Recommended)
This app uses **WebSockets**, which requires a persistent server. Vercel is great for static sites but does not support persistent WebSockets. **We recommend deploying to Render.**

1.  Push your code to GitHub.
2.  Create an account on [Render.com](https://render.com).
3.  Click "New +", select **"Web Service"**.
4.  Connect your GitHub repo.
5.  Render will auto-detect Node.js. Click "Create Web Service".
6.  *Done!*

### ☁️ Deploy to Vercel (Frontend Only / Experimental)
**Note**: Vercel does not support native WebSockets. The app may load, but real-time features might fail unless configured with a separate backend.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajpratham1%2FHide)

### Manual Deployment
1.  Push to GitHub.
2.  Import project in Vercel.
3.  Set Output Directory to `public` (optional, usually auto-detected).
4.  Environment Variables: None required for basic usage.

## 📄 License
MIT License. Copyright (c) 2024 Pratham Kumar.
