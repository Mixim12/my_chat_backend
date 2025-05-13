import { prometheus } from '@hono/prometheus';

export const { registerMetrics, printMetrics } = prometheus();

