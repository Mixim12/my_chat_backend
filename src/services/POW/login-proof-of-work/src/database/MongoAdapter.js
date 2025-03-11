import { Db, Collection } from "mongodb";

let db: Db | null = null;

const MongoAdapter = {
  /**
   * Initializes the adapter with the provided MongoDB database instance.
   *
   * @param mongoClient - The MongoDB database instance.
   * @returns The initialized adapter.
   */
  init(mongoClient: Db) {
    db = mongoClient;

    // Create indexes for the generated challenges collection.
    db.collection("pow_generated").createIndex({ userIdentifier: 1 });
    db.collection("pow_generated").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });

    // Create indexes for the used challenges collection.
    db.collection("pow_used").createIndex({ challengeId: 1 });
    db.collection("pow_used").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });

    // Create indexes for the invalid timestamp challenges collection.
    db.collection("pow_invalid_timestamp_challenges").createIndex({ challengeId: 1 });
    db.collection("pow_invalid_timestamp_challenges").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });

    // Removed self-generated collection indexes.

    // Create indexes for the incomplete challenges collection.
    db.collection("pow_incomplete").createIndex({ userIdentifier: 1 });
    db.collection("pow_incomplete").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });

    return MongoAdapter;
  },

  /**
   * Retrieves the last generated challenge for a given user identifier.
   *
   * @param userIdentifier - The user's identifier.
   * @returns The most recent generated challenge document.
   */
  async getLastGeneratedByUserIdentifier(userIdentifier: string): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    const result = await db.collection("pow_generated").find({ userIdentifier }).sort({ _id: -1 }).limit(1).toArray();
    return result[0];
  },

  /**
   * Saves a generated challenge document.
   *
   * @param data - The challenge data to be saved.
   * @returns The result of the insert operation.
   */
  async saveGenerated(data: any): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_generated").insertOne(data);
  },

  /**
   * Retrieves a used challenge document by its challengeId.
   *
   * @param challengeId - The challenge ID.
   * @returns The used challenge document if found.
   */
  async getUsed(challengeId: string): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_used").findOne({ challengeId });
  },

  /**
   * Saves a used challenge document.
   *
   * @param data - The data for the used challenge.
   * @returns The result of the insert operation.
   */
  async saveUsed(data: any): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_used").insertOne(data);
  },

  /**
   * Retrieves an invalid timestamp challenge document by its challengeId.
   *
   * @param challengeId - The challenge ID.
   * @returns The invalid timestamp challenge document if found.
   */
  async getInvalidTimestampChallenge(challengeId: string): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_invalid_timestamp_challenges").findOne({ challengeId });
  },

  /**
   * Saves an invalid timestamp challenge document.
   *
   * @param data - The data for the invalid timestamp challenge.
   * @returns The result of the insert operation.
   */
  async saveInvalidTimestampChallenge(data: any): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_invalid_timestamp_challenges").insertOne(data);
  },

  /**
   * Retrieves the total count of incomplete challenge documents.
   *
   * @returns The total number of incomplete challenges.
   */
  async getTotalIncompleteCount(): Promise<number> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_incomplete").countDocuments();
  },

  /**
   * Retrieves the count of incomplete challenge documents for a specific user.
   *
   * @param userIdentifier - The user's identifier.
   * @returns The number of incomplete challenges for the user.
   */
  async getIncompleteCountByUserIdentifier(userIdentifier: string): Promise<number> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_incomplete").countDocuments({ userIdentifier });
  },

  /**
   * Saves an incomplete challenge document.
   *
   * @param data - The data for the incomplete challenge.
   * @returns The result of the insert operation.
   */
  async saveIncomplete(data: any): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_incomplete").insertOne(data);
  },
};

export default MongoAdapter;
