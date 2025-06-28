# MyChat Monitoring Setup

This document describes the monitoring setup for the MyChat application.

## Overview

The monitoring stack consists of:

- **Prometheus**: Collects metrics from the backend application and RabbitMQ
- **Grafana**: Visualizes the metrics in dashboards

## Accessing the Monitoring Tools

- **Grafana**: http://localhost:3030 (admin/admin)
- **Prometheus**: http://localhost:9090

## Available Dashboards

### Backend Dashboard

The Backend Dashboard provides monitoring for the MyChat application, including:

- Message throughput (sent/received)
- Active WebSocket connections
- Message processing time
- API latency
- Memory usage

### RabbitMQ Dashboard

The RabbitMQ Dashboard provides monitoring for the RabbitMQ message broker, including:

- Queue metrics (messages published, delivered, acknowledged)
- Node metrics (memory usage, disk space)
- Connection metrics
- Exchange metrics
- Channel metrics

## Metrics Collection

### Backend Metrics

The backend application exposes metrics at `/api/metrics` using the Prometheus client library. These metrics include:

- `active_connections`: Number of active WebSocket connections
- `messages_sent_total`: Total number of messages sent, labeled by channel and encryption status
- `messages_received_total`: Total number of messages received, labeled by channel
- `message_processing_time_seconds`: Histogram of message processing time in seconds
- `api_latency_seconds`: Histogram of API request latency in seconds
- `memory_usage_bytes`: Memory usage by type (heap, external, etc.)

### RabbitMQ Metrics

RabbitMQ exposes metrics via the Prometheus plugin at port 15692. These metrics include:

- `rabbitmq_connections`: Number of connections
- `rabbitmq_channels`: Number of channels
- `rabbitmq_queues`: Number of queues
- `rabbitmq_queue_messages`: Number of messages in queues
- `rabbitmq_queue_messages_ready`: Number of messages ready to be delivered
- `rabbitmq_queue_messages_unacknowledged`: Number of unacknowledged messages
- `rabbitmq_consumers`: Number of consumers
- `rabbitmq_exchanges`: Number of exchanges
- `rabbitmq_node_mem_used`: Memory used by RabbitMQ
- `rabbitmq_node_disk_free`: Free disk space
- `rabbitmq_messages_published_total`: Total number of messages published
- `rabbitmq_messages_delivered_total`: Total number of messages delivered
- `rabbitmq_messages_acknowledged_total`: Total number of messages acknowledged

## Starting the Monitoring Stack

To start the monitoring stack, run:

```bash
./start-monitoring.sh
```

This will start Prometheus and Grafana in Docker containers.

## Troubleshooting

If you encounter issues with the monitoring stack:

1. Check if the containers are running: `docker compose ps`
2. Check the container logs: `docker compose logs prometheus` or `docker compose logs grafana`
3. Verify that the backend application is exposing metrics at `/api/metrics`
4. Verify that RabbitMQ is exposing metrics at port 15692 