import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './roomManager.js';
import { config } from '../config.js';
import type { ServerToClientEvents, ClientToServerEvents } from '@boom/types';

export function setupSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const roomManager = new RoomManager(io);

  io.on('connection', (socket) => {
    roomManager.registerSocket(socket);
  });

  return io;
}
