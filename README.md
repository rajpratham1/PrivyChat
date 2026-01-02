# 🛡️ PrivyChat - Zero-Trace Spy Messenger

![PrivyChat Banner](public/logo.png)

### **"Your words belong to you. The moment they are spoken, they should vanish."**

PrivyChat is an ultra-secure, ephemeral messaging platform designed for whistleblowers, journalists, and privacy enthusiasts. It bypasses traditional databases entirely, storing messages **only in RAM**, making data recovery physically impossible after a server restart.

---

## 🌟 Key Features

### **🕵️‍♂️ Spy Tech & Stealth**
*   **Stealth Mode (Calculator)**: Instantly hide the entire chat app behind a fully functional Calculator overlay.
    *   *Unlock Code*: Type `1337` and press `=` to re-enter.
*   **Decoy Vault**: Type keywords like `weather` or `guest` into the login box to instanty redirect to a harmless **Weather App**. Perfect for plausible deniability.
*   **Ghost Mode**: All messages are blurred by default. They only reveal when you hover your mouse over them, preventing "shoulder surfing" in public.
*   **Panic Button**: A single click on the 🚨 icon instantly disconnects you, wipes local storage, and redirects your browser to Google.com.
*   **Self-Destruct Messages**: Set a timer (5s, 10s, 30s) for your messages to effectively "burn" from the recipient's screen after reading.

### **🔐 Military-Grade Security**
*   **End-to-End Encryption (E2E)**: 
    *   **Private Rooms**: Uses **AES-GCM-256** with keys derived from your Room Password + Salt (PBKDF2). The server *cannot* derive the key.
    *   **1-on-1 Links**: Uses **RSA-OAEP** and **AES-GCM** key exchange via URL fragments. The key is in the `#hash`, which is *never sent to the server*.
*   **Zero-Knowledge Server**: The server acts as a dumb relay. It routes encrypted blobs without having the keys to decrypt them.
*   **RAM-Only Storage**: No MongoDB. No SQL. No Redis. If the power plug is pulled, all data ceases to exist.

### **🎨 Premium Experience**
*   **Glassmorphism UI**: A stunning, modern interface with blur effects and smooth animations.
*   **Themes**: Switch between "Standard Secure" (Blue/Dark) and "Hacker Mode" (Matrix Green/Black terminal style).
*   **Rich Media**: Send **Encypted Images** and **Voice Notes** (Opus/WebM) securely.

---

## � Getting Started (Local)

PrivyChat is built on **Node.js** and **Socket.io**.

### **Prerequisites**
*   Node.js (v14 or higher)
*   NPM (Node Package Manager)

### **Installation**
1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/PrivyChat.git
    cd PrivyChat
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Server**
    ```bash
    npm run dev
    ```

4.  **Open in Browser**
    Visit `http://localhost:3001`

---

## 📖 User Manual

A comprehensive User Manual is included in the application.
👉 **[View User Manual](public/manual.html)** (or access via the `?` Help icon in the app).

---

## 🛠️ Tech Stack

*   **Frontend**: Vanilla JS (ES6+), HTML5, CSS3 Variables.
*   **Backend**: Node.js, Express.
*   **Real-Time**: Socket.io v4 (WebSockets).
*   **Cryptography**: Web Crypto API (`window.crypto.subtle`).

---

## ⚠️ Disclaimer

While PrivyChat uses industry-standard encryption algorithms, it is an **open-source educational project**. It has not been audited by external security firms. Use it for personal privacy, but always exercise caution with extremely sensitive data.

---

### **License**
MIT License. Free to use, fork, and modify.
