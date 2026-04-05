'use strict';

const { createServer }   = require('http');
const { Server }         = require('socket.io');
const { io: ioClient }   = require('socket.io-client');
const express            = require('express');

const { registerLobbyHandlers }     = require('../../src/socket/lobbyHandlers');
const { registerGameHandlers }      = require('../../src/socket/gameHandlers');
const { registerBluffHandlers }     = require('../../src/socket/bluffHandlers');
const { registerDisconnectHandler } = require('../../src/socket/disconnectHandler');
const { registerReconnectHandler }  = require('../../src/socket/reconnectHandler');
const { startRoomCleaner }          = require('../../src/room/RoomCleaner');
const { secureSocket }              = require('../../src/security/SocketMiddleware');

// ── Setup serveur de test ─────────────────────────────────
let io, httpServer, rooms;
let port;

function makeClient() {
  return ioClient(`http://localhost:${port}`, {
    autoConnect      : true,
    reconnection     : false,
    transports       : ['websocket'],
  });
}

beforeAll((done) => {
  const app = express();
  httpServer = createServer(app);
  io         = new Server(httpServer, { cors: { origin: '*' } });
  rooms      = new Map();

  io.on('connection', socket => {
    secureSocket(socket); // active rate limiting + validation (même config qu'en prod)
    registerReconnectHandler(socket, io, rooms);
    registerLobbyHandlers(socket, io, rooms);
    registerGameHandlers(socket, io, rooms);
    registerBluffHandlers(socket, io, rooms);
    registerDisconnectHandler(socket, io, rooms);
  });

  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  io.close();
  httpServer.close(done);
});

afterEach(() => {
  rooms.clear();
});

// ── Helper : promesse sur un événement socket ─────────────
function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), 3000);
    socket.once(event, (data) => { clearTimeout(timeout); resolve(data); });
  });
}

// ═══════════════════════════════════════════════════════════
//   LOBBY
// ═══════════════════════════════════════════════════════════
describe('Lobby', () => {
  let clientA;

  beforeEach(() => { clientA = makeClient(); });
  afterEach(() => { clientA.disconnect(); });

  test('créer une salle → room-created avec un code valide', async () => {
    const data = await new Promise(resolve => {
      clientA.emit('create-room', { name: 'Alice', maxRounds: 5 });
      clientA.once('room-created', resolve);
    });
    expect(data.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(data.room.players[0].name).toBe('Alice');
    expect(data.room.maxRounds).toBe(5);
    expect(data.reconnectToken).toBeDefined();
  });

  test('rejoindre une salle inexistante → game-error', async () => {
    clientA.emit('join-room', { code: 'ZZZZ', name: 'Bob' });
    const msg = await waitFor(clientA, 'game-error');
    expect(msg).toMatch(/introuvable/i);
  });

  test('2 joueurs rejoignent → room-updated avec 2 players', async () => {
    const clientB = makeClient();

    // Créer la salle avec A
    const created = await new Promise(resolve => {
      clientA.emit('create-room', { name: 'Alice', maxRounds: 3 });
      clientA.once('room-created', resolve);
    });
    const code = created.code;

    // B rejoint
    const [joinedB] = await Promise.all([
      waitFor(clientB, 'room-joined'),
      new Promise(resolve => { clientB.emit('join-room', { code, name: 'Bob' }); resolve(); }),
    ]);

    expect(joinedB.room.players).toHaveLength(2);
    clientB.disconnect();
  });

  test('lancer la partie avec < 2 joueurs → game-error', async () => {
    const created = await new Promise(resolve => {
      clientA.emit('create-room', { name: 'Alice', maxRounds: 3 });
      clientA.once('room-created', resolve);
    });
    clientA.emit('start-game', { code: created.code });
    const msg = await waitFor(clientA, 'game-error');
    expect(msg).toMatch(/minimum/i);
  });
});

// ═══════════════════════════════════════════════════════════
//   FLUX DE JEU (2 joueurs)
// ═══════════════════════════════════════════════════════════
describe('Flux de jeu — 2 joueurs', () => {
  let clientA, clientB, code;

  beforeEach(async () => {
    clientA = makeClient();
    clientB = makeClient();

    // Créer + rejoindre
    const created = await new Promise(resolve => {
      clientA.emit('create-room', { name: 'Alice', maxRounds: 1 });
      clientA.once('room-created', resolve);
    });
    code = created.code;

    await new Promise(resolve => {
      clientB.emit('join-room', { code, name: 'Bob' });
      clientB.once('room-joined', resolve);
    });
  });

  afterEach(() => {
    clientA.disconnect();
    clientB.disconnect();
  });

  test('lancer la partie → round-started avec mains privées', async () => {
    const [roundA, roundB] = await Promise.all([
      waitFor(clientA, 'round-started'),
      waitFor(clientB, 'round-started'),
      new Promise(resolve => {
        clientA.emit('start-game', { code });
        resolve();
      }),
    ]);

    // Chaque joueur a 1 dé (manche 1)
    expect(roundA.hands[clientA.id]).toHaveLength(1);
    expect(roundB.hands[clientB.id]).toHaveLength(1);
    expect(roundA.room.phase).toBe('betting');
  });

  test('paris → quand tous ont parié, phase passe à playing', async () => {
    await Promise.all([
      waitFor(clientA, 'round-started'),
      waitFor(clientB, 'round-started'),
      new Promise(r => { clientA.emit('start-game', { code }); r(); }),
    ]);

    // Attendre le room-updated final (phase = playing) en collectant tous les events
    const playingPhase = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: phase playing jamais reçue')), 5000);
      function check(room) {
        if (room.phase === 'playing') {
          clearTimeout(timeout);
          clientA.off('room-updated', check);
          resolve(room);
        }
      }
      clientA.on('room-updated', check);
    });

    // Les deux joueurs parient
    clientA.emit('place-bet', { code, bet: 0 });
    clientB.emit('place-bet', { code, bet: 1 });

    const room = await playingPhase;
    expect(room.phase).toBe('playing');
  });
});

// ═══════════════════════════════════════════════════════════
//   SÉCURITÉ / VALIDATION
// ═══════════════════════════════════════════════════════════
describe('Validation des inputs', () => {
  let client;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.disconnect(); });

  test('code invalide → game-error', async () => {
    client.emit('join-room', { code: '!!!', name: 'Bob' });
    const msg = await waitFor(client, 'game-error');
    expect(msg).toBeDefined();
  });

  test('nom vide → game-error', async () => {
    client.emit('create-room', { name: '', maxRounds: 5 });
    const msg = await waitFor(client, 'game-error');
    expect(msg).toBeDefined();
  });
});
