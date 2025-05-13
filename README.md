# My Chat Backend

A secure, real-time chat application backend built with Hono, TypeScript, and MongoDB.

## Prerequisites

- Bun (latest version)
- MongoDB
- RabbitMQ (for message queue)

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/my_chat

# JWT
JWT_SECRET=your-secret-key-here

# RabbitMQ
RABBITMQ_URL=amqp://localhost
```

2. Create a `config.ts` file in `src/utils/`:

```typescript
export default {
  server: {
    port: process.env.PORT || 3000,
  },
  mongo: {
    mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/my_chat',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-here',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
  },
};
```

3. Create the secrets folder structure:

```bash
mkdir -p secrets/{jwt,pow}
```

4. Generate JWT keys:
```bash
# Generate private key
openssl genpkey -algorithm RSA -out secrets/jwt/private.pem -pkeyopt rsa_keygen_bits:2048

# Generate public key
openssl rsa -pubout -in secrets/jwt/private.pem -out secrets/jwt/public.pem
```

5. Generate PoW keys:
```bash
# Generate private key
openssl genpkey -algorithm RSA -out secrets/pow/private.pem -pkeyopt rsa_keygen_bits:2048

# Generate public key
openssl rsa -pubout -in secrets/pow/private.pem -out secrets/pow/public.pem
```

## Project Structure

```
src/
├── controllers/     # Request handlers
├── middleware/      # Custom middleware
├── models/         # MongoDB models
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript types
└── utils/          # Utility functions

secrets/
├── jwt/            # JWT keys
│   ├── private.pem
│   └── public.pem
└── pow/            # Proof of Work keys
    ├── private.pem
    └── public.pem
```

## Installation

1. Install dependencies:
```bash
bun install
```

2. Create required directories:
```bash
mkdir -p src/{controllers,middleware,models,routes,services,types,utils}
```

3. Build the project:
```bash
bun run build
```

## Running the Application

1. Start MongoDB:
```bash
mongod
```

2. Start RabbitMQ:
```bash
rabbitmq-server
```

3. Start the application:
```bash
# Development
bun run dev

# Production
bun start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users` - Get user profile
- `PUT /api/users` - Update user profile

### Channels
- `POST /api/channels` - Create a new channel
- `GET /api/channels` - List user's channels

### Messages
- `POST /api/message` - Send a message
- `GET /api/message` - Get channel messages

### E2EE
- `POST /api/e2ee/keys/generate` - Generate encryption keys
- `POST /api/e2ee/keys/upload` - Upload public keys
- `GET /api/e2ee/keys/:userUUID` - Get user's pre-key bundle
- `POST /api/e2ee/session` - Establish E2EE session
- `POST /api/e2ee/encrypt` - Encrypt message
- `POST /api/e2ee/decrypt` - Decrypt message

### Metrics
- `GET /api/metrics` - Prometheus metrics endpoint

## Development

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun start` - Start production server
- `bun run lint` - Run ESLint
- `bun run test` - Run tests

### Code Style

This project uses:
- ESLint for code linting
- Prettier for code formatting
- TypeScript for type safety

## Security Features

- End-to-end encryption (E2EE) using Signal Protocol
- Rate limiting
- JWT authentication with RSA keys
- Proof of Work protection
- Secure headers
- CORS protection
- Request validation using Zod

## Monitoring

The application exposes Prometheus metrics at `/api/metrics` for monitoring:
- Request duration
- Request count
- Error rates
- Active connections

## License

MIT