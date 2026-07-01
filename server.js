import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 4000;

const rooms = new Map();

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Couple Booth Socket Server\n');
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentRole = null;

  console.log(`[+] Client connected: ${socket.id}`);

  socket.on('create-room', ({ roomCode }) => {
    currentRoom = roomCode;
    currentRole = 'a';
    socket.join(roomCode);

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        users: new Map(),
        layout: null,
        theme: 'pink',
        countdown: 3,
        filter: 'original',
        stickers: [],
        customText: '',
        textFont: 'Pacifico',
        textSize: 32,
        textColor: '#E8A0C0',
        dateStamp: false,
        ready: { a: false, b: false },
        lockedLayout: false,
        layoutVotes: {},
        partnerA: { name: '', color: 'pink', connected: true },
        partnerB: { name: '', color: 'blue', connected: false },
      });
    }

    const room = rooms.get(roomCode);
    room.users.set(socket.id, { role: 'a', name: '', color: 'pink' });
    room.partnerA.connected = true;

    console.log(`[room] ${roomCode} created by ${socket.id}`);
    socket.emit('room-state', getRoomState(roomCode));
    io.to(roomCode).emit('participants-update', getParticipants(roomCode));
  });

  socket.on('join-room', ({ roomCode }) => {
    if (!rooms.has(roomCode)) {
      socket.emit('error-msg', 'Room not found');
      console.log(`[warn] ${socket.id} tried to join missing room ${roomCode}`);
      return;
    }

    currentRoom = roomCode;
    currentRole = 'b';
    socket.join(roomCode);

    const room = rooms.get(roomCode);
    room.users.set(socket.id, { role: 'b', name: '', color: 'blue' });
    room.partnerB.connected = true;

    console.log(`[room] ${socket.id} joined ${roomCode} as partner B`);
    socket.emit('room-state', getRoomState(roomCode));
    io.to(roomCode).emit('participants-update', getParticipants(roomCode));
  });

  socket.on('set-name', ({ name }) => {
    if (!currentRoom || !currentRole) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (user) user.name = name;
    if (currentRole === 'a') room.partnerA.name = name;
    else room.partnerB.name = name;
    io.to(currentRoom).emit('participants-update', getParticipants(currentRoom));
    io.to(currentRoom).emit('name-updated', { role: currentRole, name });
  });

  socket.on('set-color', ({ color }) => {
    if (!currentRoom || !currentRole) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (user) user.color = color;
    if (currentRole === 'a') room.partnerA.color = color;
    else room.partnerB.color = color;
    io.to(currentRoom).emit('participants-update', getParticipants(currentRoom));
    io.to(currentRoom).emit('color-updated', { role: currentRole, color });
  });

  socket.on('vote-layout', ({ layout }) => {
    if (!currentRoom || !currentRole) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.layoutVotes[currentRole] = layout;
    io.to(currentRoom).emit('layout-votes-update', { ...room.layoutVotes });
  });

  socket.on('layout-confirmed', ({ layout }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.layout = layout;
    room.lockedLayout = true;
    io.to(currentRoom).emit('layout-confirmed', { layout });
  });

  socket.on('reset-layout-votes', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.layoutVotes = {};
    room.lockedLayout = false;
    room.layout = null;
    io.to(currentRoom).emit('layout-votes-update', {});
    io.to(currentRoom).emit('layout-reset');
  });

  socket.on('set-theme', ({ theme }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.theme = theme;
    io.to(currentRoom).emit('theme-updated', { theme });
  });

  socket.on('set-countdown', ({ countdown }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.countdown = countdown;
    io.to(currentRoom).emit('countdown-updated', { countdown });
  });

  socket.on('set-ready', ({ ready }) => {
    if (!currentRoom || !currentRole) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.ready[currentRole] = ready;
    io.to(currentRoom).emit('ready-updated', { ...room.ready });
    if (room.ready.a && room.ready.b) {
      io.to(currentRoom).emit('both-ready');
      setTimeout(() => {
        room.ready.a = false;
        room.ready.b = false;
        io.to(currentRoom).emit('ready-updated', { a: false, b: false });
      }, 3000);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      if (currentRole === 'a') room.partnerA.connected = false;
      if (currentRole === 'b') room.partnerB.connected = false;
      io.to(currentRoom).emit('participants-update', getParticipants(currentRoom));
      if (room.users.size === 0) {
        setTimeout(() => {
          if (room.users.size === 0) rooms.delete(currentRoom);
        }, 60000);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Couple Booth socket server running on port ${PORT}`);
});

// ─── Helpers ───

function getRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return {};
  return {
    layout: room.layout,
    lockedLayout: room.lockedLayout,
    layoutVotes: room.layoutVotes,
    theme: room.theme,
    countdown: room.countdown,
    filter: room.filter,
    stickers: room.stickers,
    customText: room.customText,
    textFont: room.textFont,
    textSize: room.textSize,
    textColor: room.textColor,
    dateStamp: room.dateStamp,
    ready: room.ready,
  };
}

function getParticipants(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return { partnerA: { name: '', color: 'pink', connected: false }, partnerB: { name: '', color: 'blue', connected: false } };
  return { partnerA: room.partnerA, partnerB: room.partnerB };
}
