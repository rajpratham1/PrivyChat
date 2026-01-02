const CryptoUtils = {
    // 1. Derive Key from Password (PBKDF2)
    // We use the Room Name as the "Salt" so everyone in the room derives the same key from the same password.
    deriveKey: async (password, salt) => {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode(salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    // 2. Encrypt Message
    encrypt: async (text, key) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Random IV for every message
        const encoded = new TextEncoder().encode(text);

        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encoded
        );

        // Return as base64 strings so they can be sent via JSON
        return {
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
        };
    },

    // 3. Decrypt Message
    decrypt: async (encryptedData, key) => {
        try {
            // Convert base64 back to buffer
            const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
            const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed:", e);
            return "🔒 Encrypted Message (Cannot Decrypt - Wrong Password?)";
        }
    }
};
