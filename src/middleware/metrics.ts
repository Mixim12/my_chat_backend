import { prometheus } from '@hono/prometheus';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

// Create a custom registry for our metrics
const registry = new Registry();

// Enable default metrics collection (CPU, memory, etc.)
collectDefaultMetrics({ register: registry });

// Define custom metrics
export const messagesSent = new Counter({
  name: 'messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['channel_id', 'encrypted'],
  registers: [registry]
});

export const messagesReceived = new Counter({
  name: 'messages_received_total',
  help: 'Total number of messages received',
  labelNames: ['channel_id'],
  registers: [registry]
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active WebSocket connections',
  registers: [registry]
});

export const channelMembers = new Gauge({
  name: 'channel_members',
  help: 'Number of members in each channel',
  labelNames: ['channel_id'],
  registers: [registry]
});

export const messageProcessingTime = new Histogram({
  name: 'message_processing_time_seconds',
  help: 'Time taken to process messages',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry]
});

export const apiLatency = new Histogram({
  name: 'api_latency_seconds',
  help: 'API endpoint latency in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry]
});

// Memory usage gauge
export const memoryUsage = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
  registers: [registry]
});

// Initialize Prometheus middleware
export const { registerMetrics, printMetrics } = prometheus();

// Custom metrics endpoint handler
export const printCustomMetrics = async () => {
  return registry.metrics();
};

// Function to update memory metrics (to be called periodically)
export function updateMemoryMetrics(): void {
  try {
    if (typeof process !== 'undefined') {
      const memoryData = process.memoryUsage();
      memoryUsage.set({ type: 'rss' }, memoryData.rss);
      memoryUsage.set({ type: 'heapTotal' }, memoryData.heapTotal);
      memoryUsage.set({ type: 'heapUsed' }, memoryData.heapUsed);
      memoryUsage.set({ type: 'external' }, memoryData.external);
      
      // For Bun runtime, additional metrics may be available
      if (typeof Bun !== 'undefined') {
        // @ts-ignore - Bun-specific metrics
        if (Bun.memoryUsage) {
          // @ts-ignore
          const bunMemory = Bun.memoryUsage();
          Object.entries(bunMemory).forEach(([key, value]) => {
            memoryUsage.set({ type: `bun_${key}` }, value as number);
          });
        }
      }
    }
  } catch (error) {
    console.error('Error updating memory metrics:', error);
  }
}

