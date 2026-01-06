const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
// Strict CORS Policy
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.RENDER_EXTERNAL_URL // Dynamic from Render
].filter(Boolean); // Remove nulls

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost')) {
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

// ...


const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ...
const PORT = process.env.PORT || 3001;

// --- Security Middleware ---
// 1. Helmet: Protects headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for now to allow inline scripts/images without headache
}));

// 2. Rate Limiting: Prevent Brute Force / DoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per windowMs
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

// --- Chat Logic ---
const rooms = {}; // { roomName: { password: '...', users: [] } }

// Validation Regex
const SAFE_INPUT_REGEX = /^[a-zA-Z0-9_\- ]{1,30}$/;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

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

    // Join Room
    socket.on('join_room', (data) => {
        const { room, password, username, type } = data; // type: '1v1', 'private', 'group'

        // 1. Strict Input Validation (Guard)
        if (!room || !username || !SAFE_INPUT_REGEX.test(room) || !SAFE_INPUT_REGEX.test(username)) {
            socket.emit('error_msg', '❌ Invalid Input: Use alphanumeric characters only (max 30).');
            return;
        }

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
                if (existingRoom.password !== password) {
                    if (!password) {
                        // 1. Ask for password if missing
                        socket.emit('password_required', room);
                        return;
                    }
                    // 2. Reject if wrong
                    socket.emit('error_msg', 'Incorrect password');
                    return;
                }
            }
            // If no password (public) or password correct, proceed to join below.
        } else {
            // --- NEW ROOM (or Server Restarted) ---
            if (type === 'private') {
                // Creating PRIVATE room
                if (!password) {
                    // If trying to create/join private without password, ask for it.
                    // This handles the case where user joins via link mode=private but server restarted.
                    socket.emit('password_required', room);
                    return;
                }
                rooms[room] = { password, users: [], type: 'private' };
            } else if (type === '1v1') {
                // Creating 1v1 room
                rooms[room] = { password: null, users: [], type: '1v1' };
            } else {
                // Creating PUBLIC/Group room
                rooms[room] = { password: null, users: [], type: 'group' };
            }
        }

        // --- JOIN SUCCESS ---
        socket.join(room);

        // Update User List (simplified)
        if (rooms[room]) {
            // Remove if already exists (avoid duplicates if re-joining)
            rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
            rooms[room].users.push({ id: socket.id, username: username });
        }

        socket.to(room).emit('system_msg', `${username} has joined the chat`);

        console.log(`User ${username} joined ${room}`);

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
        // data: { room, message, username, timestamp }
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
        // data: { room, fileData, fileName, fileType, username, timestamp }
        // Broadcast back to room so client listener 'socket.on("file_share")' triggers
        io.to(data.room).emit('file_share', data);
    });

    // --- WebRTC Signaling ---
    socket.on('call_user', (data) => {
        // data: { offer, room }
        socket.to(data.room).emit('call_user', { offer: data.offer, socketId: socket.id });
    });

    socket.on('answer_call', (data) => {
        // data: { answer, to }
        io.to(data.to).emit('call_accepted', data.answer);
    });

    socket.on('ice_candidate', (data) => {
        // Standard WebRTC: Exchange candidates
        // data: { candidate, to, room }
        if (data.room) {
            // Broadcast to the other person in the room
            socket.to(data.room).emit('ice_candidate', data.candidate);
        } else if (data.to) {
            // Direct P2P (if socketID is known)
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
                // Remove user from room state
                const user = rooms[room].users.find(u => u.id === socket.id);
                if (user) {
                    rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
                    socket.to(room).emit('system_msg', `${user.username} has left`);
                    broadcastRoomUpdate(room);
                }
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`Chat Server running on http://localhost:${PORT}`);
});

module.exports = app;

// --- Keep-Alive Optimization (User Request) ---
// Prevents Render free tier from sleeping after 15 mins of inactivity.
const keepAliveURL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// 3. Health Check Route
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

if (process.env.RENDER_EXTERNAL_URL) {
    console.log('⚡ Keep-Alive Activated for:', keepAliveURL);
    setInterval(() => {
        http.get(`${keepAliveURL}/health`, (resp) => {
            if (resp.statusCode === 200) {
                // console.log('Keep-Alive Ping: Success'); 
            } else {
                console.error('Keep-Alive Ping: Failed', resp.statusCode);
            }
        }).on('error', (err) => {
            console.error('Keep-Alive Error:', err.message);
        });
    }, 14 * 60 * 1000); // Ping every 14 minutes
}


