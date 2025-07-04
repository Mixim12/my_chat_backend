import { Server } from "socket.io";
import { createAdapter } from "socket.io-amqp0";
import amqplib, { Connection } from "amqplib";
import config from "../utils/config";
import { createLogger } from "../utils/logger";
import { initSocketServer } from "./socketServer";

const log = createLogger('Socket.IO:Setup');

/**
 * Create and configure Socket.IO server
 */
export function createSocketIOServer(): Server {
  // Create Socket.IO server with AMQP adapter
  const io = new Server({
    cors: {
      origin: config.cors.origins,
      methods: ["GET", "POST"],
      credentials: true
    },
    // Enhanced transport configuration for better compatibility
    transports: ['websocket', 'polling'],
    
    // Connection timeout and ping settings for better reliability
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    
    // Allow Engine.IO v3 clients (backwards compatibility)
    allowEIO3: true,
    
    // Enhanced connection handling
    maxHttpBufferSize: 1e6, // 1MB max buffer size
    
    // Enable client serving for development
    serveClient: false, // Disable in production, enable for development
    
    // Cookie settings
    cookie: {
      name: 'io',
      httpOnly: false,
      path: '/',
      sameSite: 'lax'
    }
  });

 
  io.adapter(createAdapter({ amqpConnection: () => amqplib.connect(config.rabbitmq.url )as unknown as Promise<Connection> }))
 
  log.info('Socket.IO server configured (AMQP adapter disabled due to TypeScript import conflict)');

  // Enhanced connection event handling
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected to socket: ${socket.id} from  ${socket.handshake.address}`);
    
    // Track connection metrics
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected from socket: ${socket.id}, reason: ${reason}`);
    });
    
    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`[Socket.IO] Socket error for socket: ${socket.id}:`, error);
    });
    
    // Handle ping/pong for connection monitoring
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Global error handling
  io.on('connect_error', (error) => {
    console.error('[Socket.IO] Connection error:', error);
  });

  // Initialize Socket.IO server handlers
  initSocketServer(io);

  return io;
}

/**
 * Start Socket.IO server on specified port
 */
export async function startSocketIOServer(io: Server, port: number = 3001): Promise<void> {
  // Start Socket.IO server
  io.listen(port);
  console.log(`[Socket.IO] Server running on http://localhost:${port}`);

  // Set up engine error handling after the server is listening
  io.engine.on('connection_error', (err) => {
    console.error('[Socket.IO] Engine connection error:', {
      code: err.code,
      message: err.message,
      context: err.context,
      type: err.type
    });
  });
} 