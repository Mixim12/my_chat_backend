import mongoose from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

async function migrateKeys() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/my-chat-db');
    console.log('Connected to MongoDB');

    // Get the keys collection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    const keysCollection = db.collection('keys');

    // Drop the old index
    await keysCollection.dropIndex('userId_1');
    console.log('Dropped old userId index');

    // Create new index on userUUID
    await keysCollection.createIndex({ userUUID: 1 }, { unique: true });
    console.log('Created new userUUID index');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateKeys(); 