/* 
 * 🕵️‍♂️ Operation Invisible Ink (steg-utils.js)
 * Library for hiding text inside images using LSB (Least Significant Bit) Steganography.
 * 
 * Features:
 * - Canvas manipulation
 * - Binary conversion
 * - LSB Encoding/Decoding
 */

const StegUtils = {

    // --- HELPERS ---

    strToBin: function (str) {
        let bin = "";
        for (let i = 0; i < str.length; i++) {
            let charBin = str.charCodeAt(i).toString(2);
            bin += "00000000".slice(charBin.length) + charBin; // Pad to 8 bits
        }
        return bin;
    },

    binToStr: function (bin) {
        let str = "";
        for (let i = 0; i < bin.length; i += 8) {
            let byte = parseInt(bin.substr(i, 8), 2);
            if (byte === 0) break; // Null terminator found
            str += String.fromCharCode(byte);
        }
        return str;
    },

    // --- ENCODER ---

    /**
     * Hides a message inside an image file.
     * @param {File} imageFile - The source image file object.
     * @param {string} message - The text to hide.
     * @returns {Promise<string>} - A Promise resolving to the DataURL of the encoded PNG.
     */
    encode: function (imageFile, message) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    canvas.width = img.width;
                    canvas.height = img.height;

                    // Draw original image
                    ctx.drawImage(img, 0, 0);

                    // Get pixel data
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    // Prepare Message: Add Null Terminator (00000000) to mark end
                    const binaryMsg = this.strToBin(message) + "00000000";

                    if (binaryMsg.length > data.length * 3) { // 3 channels (RGB) per pixel
                        reject("Message is too long for this image.");
                        return;
                    }

                    // LSB Algorithm
                    let bitIdx = 0;
                    for (let i = 0; i < data.length; i += 4) { // Iterate pixels (RGBA)
                        if (bitIdx >= binaryMsg.length) break;

                        // Modiify R, G, B channels
                        for (let j = 0; j < 3; j++) { // R=0, G=1, B=2
                            if (bitIdx < binaryMsg.length) {
                                // Clear LSB (set to 0) then OR with message bit
                                let bit = parseInt(binaryMsg[bitIdx]);
                                data[i + j] = (data[i + j] & 0xFE) | bit;
                                bitIdx++;
                            }
                        }
                    }

                    // Put modified data back
                    ctx.putImageData(imageData, 0, 0);

                    // Export as PNG (Lossless - Critical!)
                    resolve(canvas.toDataURL("image/png"));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(imageFile);
        });
    },

    // --- DECODER ---

    /**
     * Extracts a hidden message from an image file.
     * @param {File} imageFile - The source image file object.
     * @returns {Promise<string>} - A Promise resolving to the extracted text.
     */
    decode: function (imageFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    canvas.width = img.width;
                    canvas.height = img.height;

                    ctx.drawImage(img, 0, 0);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    let binaryMsg = "";
                    let nullChar = "00000000";

                    // Extract LSBs
                    for (let i = 0; i < data.length; i += 4) {
                        for (let j = 0; j < 3; j++) {
                            // Read LSB
                            binaryMsg += (data[i + j] & 1);

                            // Check for terminator every 8 bits
                            if (binaryMsg.length % 8 === 0) {
                                let lastByte = binaryMsg.substr(binaryMsg.length - 8);
                                if (lastByte === nullChar) {
                                    // Found end of message
                                    const rawBin = binaryMsg.slice(0, -8); // Remove terminator
                                    resolve(this.binToStr(rawBin));
                                    return;
                                }
                            }
                        }
                    }
                    resolve(""); // No terminator found (or empty)
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(imageFile);
        });
    }
};

window.StegUtils = StegUtils;
