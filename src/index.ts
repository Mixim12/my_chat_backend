import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createGzip } from "node:zlib";

import { registerMetrics, printMetrics } from "./middleware/metrics";
import { initSocketServer } from "./websocket/socketServer";

import e2eeRouter from "./routes/e2eeRoutes";
import authRouter from "./routes/authRoutes";
import userRouter from "./routes/userRoutes";
import channelRouter from "./routes/channelRoutes";
import messageRouter from "./routes/messageRoutes";
import powRouter from "./routes/powRoutes";

import { connectDB } from "./utils/db";
import config from "./utils/config";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use("*", cors({
  origin: config.cors.origins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
  credentials: true,
}));
app.use("*", registerMetrics);

// Routes
app.route("/api/auth", authRouter);
app.route("/api/users", userRouter);
app.route("/api/channels", channelRouter);
app.route("/api/messages", messageRouter);
app.route("/api/e2ee", e2eeRouter);
app.route("/api/pow", powRouter);

// Metrics endpoint
app.get("/api/metrics", printMetrics);

// Create HTTP server
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    // Convert Node.js request to Web API Request
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? 
        new ReadableStream({
          start(controller) {
            req.on('data', chunk => controller.enqueue(chunk));
            req.on('end', () => controller.close());
            req.on('error', err => controller.error(err));
          }
        }) : undefined
    });

    const response = await app.fetch(request);
    const body = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Handle compression
    const acceptEncoding = req.headers['accept-encoding'];
    // Do not send a body for OPTIONS requests or 204 responses
    if (req.method === 'OPTIONS' || response.status === 204) {
      res.writeHead(response.status, responseHeaders);
      res.end();
    } else if (acceptEncoding?.includes('gzip')) {
      responseHeaders['Content-Encoding'] = 'gzip';
      const gzip = createGzip();
      res.writeHead(response.status, responseHeaders);
      gzip.pipe(res);
      gzip.end(body);
    } else {
      res.writeHead(response.status, responseHeaders);
      res.end(body);
    }
  } catch (err: unknown) {
    console.error(err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// Initialize Socket.IO server
initSocketServer(server).catch(console.error);

// Start server
server.listen(config.server.port, () => {
  console.log(`Server is running on port ${config.server.port}`);
});

// Connect to MongoDB
connectDB(config.mongo.mongoURI).catch(console.error);
