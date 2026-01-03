const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e7 // 10MB Limit (Default is 1MB)
});

// ...



const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Chat Logic ---
const rooms = {}; // { roomName: { password: '...', users: [] } }

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

        // Guard: inputs
        if (!room || !username) {
            socket.emit('error_msg', 'Invalid room or username');
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
