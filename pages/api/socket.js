import { Server } from 'socket.io';

const rooms = new Map();

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log('Starting Socket.io server...');
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: { origin: '*' },
    });
    res.socket.server.io = io;

    io.on('connection', (socket) => {
      let currentRoom = null;
      let currentRole = null;

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
        socket.emit('room-state', getRoomState(roomCode));
        io.to(roomCode).emit('participants-update', getParticipants(roomCode));
      });

      socket.on('join-room', ({ roomCode }) => {
        if (!rooms.has(roomCode)) {
          socket.emit('error-msg', 'Room not found');
          return;
        }
        currentRoom = roomCode;
        currentRole = 'b';
        socket.join(roomCode);
        const room = rooms.get(roomCode);
        room.users.set(socket.id, { role: 'b', name: '', color: 'blue' });
        room.partnerB.connected = true;
        socket.emit('room-state', getRoomState(roomCode));
        io.to(roomCode).emit('participants-update', getParticipants(roomCode));
      });

      socket.on('set-name', ({ name }) => {
        if (!currentRoom || !currentRole) return;
        const room = rooms.get(currentRoom);
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
        const user = room.users.get(socket.id);
        if (user) user.color = color;
        if (currentRole === 'a') room.partnerA.color = color;
        else room.partnerB.color = color;
        io.to(currentRoom).emit('participants-update', getParticipants(currentRoom));
        io.to(currentRoom).emit('color-updated', { role: currentRole, color });
      });

      // ALWAYS allow changing vote — never lock on server
      socket.on('vote-layout', ({ layout }) => {
        if (!currentRoom || !currentRole) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        room.layoutVotes[currentRole] = layout;
        // Broadcast votes so clients detect match
        io.to(currentRoom).emit('layout-votes-update', { ...room.layoutVotes });
      });

      // Client explicitly confirms when both match & proceed
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
        rooms.get(currentRoom).theme = theme;
        io.to(currentRoom).emit('theme-updated', { theme });
      });

      socket.on('set-countdown', ({ countdown }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).countdown = countdown;
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

      socket.on('photo-captured', ({ index }) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('partner-photo-captured', { index });
      });

      socket.on('set-filter', ({ filter }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).filter = filter;
        socket.to(currentRoom).emit('filter-updated', { filter });
      });

      socket.on('add-sticker', ({ sticker }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).stickers.push(sticker);
        socket.to(currentRoom).emit('sticker-added', { sticker });
      });

      socket.on('clear-decorations', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        room.stickers = [];
        room.customText = '';
        socket.to(currentRoom).emit('decorations-cleared');
      });

      socket.on('set-custom-text', ({ text }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).customText = text;
        socket.to(currentRoom).emit('custom-text-updated', { text });
      });

      socket.on('set-text-font', ({ font }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).textFont = font;
        socket.to(currentRoom).emit('text-font-updated', { font });
      });

      socket.on('set-text-size', ({ size }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).textSize = size;
        socket.to(currentRoom).emit('text-size-updated', { size });
      });

      socket.on('set-text-color', ({ color }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).textColor = color;
        socket.to(currentRoom).emit('text-color-updated', { color });
      });

      socket.on('set-date-stamp', ({ enabled }) => {
        if (!currentRoom) return;
        rooms.get(currentRoom).dateStamp = enabled;
        socket.to(currentRoom).emit('date-stamp-updated', { enabled });
      });

      socket.on('disconnect', () => {
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom);
          room.users.delete(socket.id);
          if (currentRole === 'a') room.partnerA.connected = false;
          if (currentRole === 'b') room.partnerB.connected = false;
          io.to(currentRoom).emit('participants-update', getParticipants(currentRoom));
          if (room.users.size === 0) {
            setTimeout(() => { if (room.users.size === 0) rooms.delete(currentRoom); }, 60000);
          }
        }
      });
    });
  }
  res.end();
}

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
  if (!room) return { partnerA: { name:'',color:'pink',connected:false }, partnerB: { name:'',color:'blue',connected:false } };
  return { partnerA: room.partnerA, partnerB: room.partnerB };
}
