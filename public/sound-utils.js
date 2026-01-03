const SoundUtils = {
    audioCtx: null,

    init: () => {
        if (!SoundUtils.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            SoundUtils.audioCtx = new AudioContext();
        }
    },

    playTone: (freq, type, duration, vol = 0.1) => {
        if (!SoundUtils.audioCtx) SoundUtils.init();
        const ctx = SoundUtils.audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type; // sine, square, sawtooth, triangle
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    },

    playSend: () => {
        // Soft "Pop"
        SoundUtils.playTone(600, 'sine', 0.1, 0.05);
    },

    playReceive: () => {
        // Gentle Chime
        if (!SoundUtils.audioCtx) SoundUtils.init();
        const ctx = SoundUtils.audioCtx;
        const now = ctx.currentTime;

        // Two tones
        SoundUtils.playTone(800, 'sine', 0.3, 0.05);
        setTimeout(() => SoundUtils.playTone(1200, 'sine', 0.4, 0.03), 100);
    },

    playJoin: () => {
        // Status Slide
        SoundUtils.playTone(300, 'triangle', 0.2, 0.05);
    },

    playHacker: () => {
        // Digital Static / Data processing sound
        if (!SoundUtils.audioCtx) SoundUtils.init();
        const ctx = SoundUtils.audioCtx;

        const bufferSize = ctx.sampleRate * 0.2; // 200ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 0.2 - 0.1; // White noise
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
    }
};
