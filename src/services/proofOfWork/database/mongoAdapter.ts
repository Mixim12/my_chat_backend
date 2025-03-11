import { Db } from "mongodb";

let db: Db | null = null;

const MongoAdapter = {
  init(mongoClient: Db) {
    db = mongoClient;

    db.collection("pow_generated").createIndex({ userIdentifier: 1 });
    db.collection("pow_generated").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });

    db.collection("pow_used").createIndex({ challengeId: 1 });
    db.collection("pow_used").createIndex({ deleteOn: 1 }, { expireAfterSeconds: 1 });
  },

  async getLastGeneratedByUserIdentifier(userIdentifier: string): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    const result = await db.collection("pow_generated").find({ userIdentifier }).sort({ _id: -1 }).limit(1).toArray();
    return result[0];
  },

  async saveGenerated(data: any): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_generated").insertOne(data);
  },

  async getChallenge(challengeId: string): Promise<any> {
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.collection("pow_used").findOne({ challengeId });
  },
};

export default MongoAdapter;
