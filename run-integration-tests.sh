#!/bin/bash

# Ensure Docker RabbitMQ container is running
echo "Checking if RabbitMQ container is running..."
if ! docker ps | grep -q mychat-rabbitmq; then
  echo "Starting RabbitMQ container..."
  cd ..
  docker compose up -d rabbitmq
  cd my_chat_backend_taskmaster
  
  # Wait for RabbitMQ to be fully initialized
  echo "Waiting for RabbitMQ to be ready..."
  sleep 10
fi

# Set environment variables for tests
export RABBITMQ_URL="amqp://rabbitmquser:rabbitmqpassword@localhost:5672"
export RABBITMQ_EXCHANGE="test_exchange"
export RABBITMQ_QUEUE="test_queue"
export JWT_SECRET="test_secret"

# Run the tests
echo "Running integration tests..."
bun test src/tests/integration/socketClient.test.ts
bun test src/tests/integration/rabbitMQ.test.ts
bun test src/tests/integration/rabbitMQWebSocket.test.ts

# Clean up any test queues that might have been left behind
echo "Cleaning up test resources..."
docker exec mychat-rabbitmq rabbitmqctl list_queues name | grep "test_" | while read -r queue _; do
  echo "Deleting test queue: $queue"
  docker exec mychat-rabbitmq rabbitmqctl delete_queue "$queue"
done

# Clean up any test exchanges that might have been left behind
docker exec mychat-rabbitmq rabbitmqctl list_exchanges name | grep "test_" | while read -r exchange _; do
  echo "Deleting test exchange: $exchange"
  docker exec mychat-rabbitmq rabbitmqctl delete_exchange "$exchange"
done

echo "Integration tests completed!"