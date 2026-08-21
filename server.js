const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

// Strict CORS Policy with Local & LAN Support
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:10000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:10000",
    process.env.RENDER_EXTERNAL_URL // Dynamic from Render
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or direct files)
        if (!origin) return callback(null, true);
        if (
            allowedOrigins.indexOf(origin) !== -1 ||
            origin.startsWith('http://localhost') ||
            origin.startsWith('http://127.0.0.1') ||
            origin.startsWith('http://192.168.') ||
            origin.startsWith('http://10.') ||
            origin.startsWith('http://172.')
        ) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"]
};

const io = new Server(server, {
    cors: corsOptions,
    maxHttpBufferSize: 1e7 // 10MB Limit
});

const PORT = process.env.PORT || 3001;

// --- Security Middleware ---
// 1. Helmet: Protects headers & allows P2P / WebSockets / Media
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": [
                "'self'",
                "'unsafe-eval'",
                "'unsafe-inline'",
                "https://cdn.tailwindcss.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net"
            ],
            "style-src": [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ],
            "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
            "img-src": [
                "'self'",
                "data:",
                "blob:",
                "https://github.com",
                "https://avatars.githubusercontent.com",
                "https://via.placeholder.com",
                "https://*"
            ],
            "media-src": ["'self'", "blob:", "data:"],
            "connect-src": [
                "'self'",
                "ws:",
                "wss:",
                "http:",
                "https:",
                "blob:",
                "data:",
                "https://cdn.tailwindcss.com"
            ],
        },
    },
}));

// 2. Rate Limiting: Prevent Brute Force / DoS
const limiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(cors(corsOptions)); // Apply strict CORS to Express too
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/nearby', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nearby.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/manual', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manual.html'));
});

// --- Chat Logic ---
const rooms = {}; // { roomName: { password: '...', users: [] } }
const nearbyPeers = {}; // { socketId: { id, nickname, avatar, mode, ip, joinedAt, publicKey } }

// Validation Schema
const roomSchema = Joi.object({
    room: Joi.string().pattern(/^[a-zA-Z0-9_\- ]{1,30}$/).required(),
    username: Joi.string().pattern(/^[a-zA-Z0-9_\- ]{1,30}$/).required(),
    password: Joi.string().allow(null, '').optional(),
    type: Joi.string().valid('1v1', 'private', 'group').required(),
});

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    // Helper to broadcast user count AND list
    const broadcastRoomUpdate = (room) => {
        if (rooms[room]) {
            const users = rooms[room].users.map(u => u.username);
            io.to(room).emit('update_room_state', {
                count: users.length,
                users: users
            });
        }
    };

    // Broadcast active nearby peers
    const broadcastNearbyPeers = () => {
        const peerList = Object.values(nearbyPeers).map(p => ({
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            mode: p.mode,
            device: p.device,
            publicKey: p.publicKey,
            joinedAt: p.joinedAt
        }));
        io.emit('nearby_peer_list', peerList);
    };

    // ==========================================
    // 1. NEARBY MESH / P2P DISCOVERY EVENTS
    // ==========================================
    socket.on('nearby_join', (data) => {
        // data: { nickname, avatar, mode, device, publicKey }
        const nickname = (data && data.nickname ? String(data.nickname).slice(0, 25) : 'Agent_' + socket.id.slice(0, 4));
        const avatar = data && data.avatar ? data.avatar : '🕵️';
        const mode = data && data.mode ? data.mode : 'wifi';
        const device = data && data.device ? data.device : 'Desktop';
        const publicKey = data && data.publicKey ? data.publicKey : null;

        nearbyPeers[socket.id] = {
            id: socket.id,
            nickname,
            avatar,
            mode,
            device,
            ip: clientIp,
            publicKey,
            joinedAt: Date.now()
        };

        // Notify client of their assigned ID and list of other peers
        socket.emit('nearby_registered', {
            id: socket.id,
            nickname,
            avatar
        });

        broadcastNearbyPeers();
    });

    socket.on('nearby_update_profile', (data) => {
        if (nearbyPeers[socket.id]) {
            if (data.nickname) nearbyPeers[socket.id].nickname = String(data.nickname).slice(0, 25);
            if (data.avatar) nearbyPeers[socket.id].avatar = data.avatar;
            if (data.mode) nearbyPeers[socket.id].mode = data.mode;
            if (data.publicKey) nearbyPeers[socket.id].publicKey = data.publicKey;
            broadcastNearbyPeers();
        }
    });

    // WebRTC Signaling for Nearby Direct P2P
    socket.on('nearby_signal', (data) => {
        // data: { to, signal, type, senderInfo }
        if (data && data.to && io.sockets.sockets.get(data.to)) {
            io.to(data.to).emit('nearby_signal', {
                from: socket.id,
                signal: data.signal,
                type: data.type,
                senderInfo: nearbyPeers[socket.id] || { id: socket.id, nickname: 'Anonymous' }
            });
        }
    });

    // P2P Direct Call Relay (Voice/Video)
    socket.on('nearby_call_request', (data) => {
        if (data && data.to && io.sockets.sockets.get(data.to)) {
            io.to(data.to).emit('nearby_call_request', {
                from: socket.id,
                caller: nearbyPeers[socket.id] || { id: socket.id, nickname: 'Agent' },
                callType: data.callType || 'audio',
                offer: data.offer
            });
        }
    });

    socket.on('nearby_call_response', (data) => {
        if (data && data.to && io.sockets.sockets.get(data.to)) {
            io.to(data.to).emit('nearby_call_response', {
                from: socket.id,
                accepted: data.accepted,
                answer: data.answer
            });
        }
    });

    socket.on('nearby_call_end', (data) => {
        if (data && data.to && io.sockets.sockets.get(data.to)) {
            io.to(data.to).emit('nearby_call_end', { from: socket.id });
        }
    });

    // Nearby ICE candidates
    socket.on('nearby_ice_candidate', (data) => {
        if (data && data.to && io.sockets.sockets.get(data.to)) {
            io.to(data.to).emit('nearby_ice_candidate', {
                from: socket.id,
                candidate: data.candidate
            });
        }
    });

    // ==========================================
    // 2. MAIN PRIVYCHAT ROOM EVENTS
    // ==========================================
    socket.on('join_room', async (data) => {
        const { error, value } = roomSchema.validate(data);
        if (error) {
            socket.emit('error_msg', `❌ Invalid Input: ${error.details[0].message}`);
            return;
        }

        const { room, password, username, type } = value;
        const existingRoom = rooms[room];

        if (existingRoom) {
            // 1v1 Capacity Check
            if (type === '1v1' || (existingRoom.type === '1v1')) {
                if (existingRoom.users.length >= 2) {
                    socket.emit('error_msg', '⛔ This 1-on-1 room is full.');
                    return;
                }
            }

            // --- EXISTING ROOM ---
            if (existingRoom.password) {
                // Private Room Logic
                const isPasswordValid = await bcrypt.compare(password || '', existingRoom.password);
                if (!isPasswordValid) {
                    if (!password) {
                        socket.emit('password_required', room);
                        return;
                    }
                    socket.emit('error_msg', 'Incorrect password');
                    return;
                }
            }
        } else {
            // --- NEW ROOM ---
            if (type === 'private') {
                if (!password) {
                    socket.emit('password_required', room);
                    return;
                }
                const hashedPassword = await bcrypt.hash(password, 10);
                rooms[room] = { password: hashedPassword, users: [], type: 'private' };
            } else if (type === '1v1') {
                rooms[room] = { password: null, users: [], type: '1v1' };
            } else {
                rooms[room] = { password: null, users: [], type: 'group' };
            }
        }

        // --- JOIN SUCCESS ---
        socket.join(room);

        // Update User List
        if (rooms[room]) {
            rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
            rooms[room].users.push({ id: socket.id, username: username });
        }

        socket.to(room).emit('system_msg', `${username} has joined the chat`);

        // Notify Client
        socket.emit('joined_success', {
            room,
            username,
            isPrivate: !!(rooms[room] && rooms[room].password)
        });

        broadcastRoomUpdate(room);
    });

    // Send Message
    socket.on('send_message', (data) => {
        io.to(data.room).emit('receive_message', data);
    });

    // Typing Indicators
    socket.on('typing', (data) => {
        socket.to(data.room).emit('display_typing', data);
    });

    socket.on('stop_typing', (data) => {
        socket.to(data.room).emit('hide_typing', data);
    });

    // File Sharing
    socket.on('file_share', (data) => {
        io.to(data.room).emit('file_share', data);
    });

    // --- WebRTC Signaling ---
    socket.on('call_user', (data) => {
        socket.to(data.room).emit('call_user', { offer: data.offer, socketId: socket.id });
    });

    socket.on('answer_call', (data) => {
        io.to(data.to).emit('call_accepted', data.answer);
    });

    socket.on('ice_candidate', (data) => {
        if (data.room) {
            socket.to(data.room).emit('ice_candidate', data.candidate);
        } else if (data.to) {
            io.to(data.to).emit('ice_candidate', data.candidate);
        }
    });

    socket.on('end_call', (data) => {
        io.to(data.room).emit('end_call');
    });

    socket.on('disconnecting', () => {
        const roomsToUpdate = [...socket.rooms];
        roomsToUpdate.forEach((room) => {
            if (room !== socket.id && rooms[room]) {
                const user = rooms[room].users.find(u => u.id === socket.id);
                if (user) {
                    rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
                    socket.to(room).emit('system_msg', `${user.username} has left`);
                    broadcastRoomUpdate(room);
                }
            }
        });

        // Cleanup nearby peer presence
        if (nearbyPeers[socket.id]) {
            delete nearbyPeers[socket.id];
            broadcastNearbyPeers();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chat Server running on http://localhost:${PORT}`);
});

module.exports = app;

// --- Keep-Alive Optimization ---
const keepAliveURL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

if (process.env.RENDER_EXTERNAL_URL) {
    console.log('⚡ Keep-Alive Activated for:', keepAliveURL);
    setInterval(() => {
        const client = keepAliveURL.startsWith('https') ? https : http;
        client.get(`${keepAliveURL}/health`, (resp) => {
            // Keep alive ping
        }).on('error', (err) => {
            console.error('Keep-Alive Error:', err.message);
        });
    }, 2 * 60 * 1000); // Ping every 2 minutes
}

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
        },
    });
});



