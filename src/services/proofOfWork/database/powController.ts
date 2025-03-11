// PowDatabaseController.ts

import MongoAdapter from "./mongoAdapter";
import { PowInternalError } from "./../errors";

export interface PowDbConfig {
  challengeExpireAfter: number;
  invalidTimestampChallengesDeleteAfter: number;
  incompleteDeleteAfter: number;
  selfGeneratedDeleteAfter: number;
  difficultyResetPeriod: number;
}

/**
 * Interface for the adapter that interacts with MongoDB.
 */
export interface MongoAdapterInterface {
  getUsed(challengeId: string): Promise<any>;
  saveUsed(data: { challengeId: string; deleteOn: Date }): Promise<any>;
  getInvalidTimestampChallenge(challengeId: string): Promise<any>;
  saveInvalidTimestampChallenge(data: { challengeId: string; deleteOn: Date }): Promise<any>;
  getIncompleteCountByUserIdentifier(userIdentifier: string): Promise<number>;
  getTotalIncompleteCount(): Promise<number>;
  saveIncomplete(data: { userIdentifier: string; deleteOn: Date }): Promise<any>;
  getSelfGeneratedCountByUserIdentifier(userIdentifier: string): Promise<number>;
  saveSelfGenerated(data: { userIdentifier: string; deleteOn: Date }): Promise<any>;
  getLastGeneratedByUserIdentifier(userIdentifier: string): Promise<any>;
  saveGenerated(data: { complexity: number; difficulty: number; userIdentifier: string; expiresOn: number; deleteOn: Date }): Promise<any>;
}

/**
 * A controller for making database calls related to POW challenges.
 */
export class PowDatabaseController {
  private dbAdapter?: MongoAdapterInterface;
  private config: PowDbConfig;

  /**
   * Initializes the controller with configuration and an optional MongoDB client.
   * @param config - The database-related configuration.
   * @param mongoClient - A MongoDB client instance.
   */
  constructor(config: PowDbConfig, mongoClient?: any) {
    this.config = config;
    if (mongoClient) {
      this.dbAdapter = MongoAdapter.init(mongoClient);
    }
  }

  /**
   * A helper method that calls a method on the adapter and wraps errors.
   * @param method - The method name to call.
   * @param args - The arguments for the method.
   * @returns The result of the adapter call.
   * @throws PowInternalError if the adapter call fails.
   */
  private async makeDbCall<T>(method: keyof MongoAdapterInterface, args?: any): Promise<T | undefined> {
    if (!this.dbAdapter) {
      return undefined;
    }
    try {
      return await this.dbAdapter[method](args);
    } catch (err: any) {
      throw new PowInternalError("DatabaseError", err);
    }
  }

  public getUsed(challengeId: string): Promise<any> {
    return this.makeDbCall("getUsed", challengeId);
  }

  public saveUsed(challengeId: string): Promise<any> {
    const data = {
      challengeId,
      deleteOn: new Date(Date.now() + this.config.challengeExpireAfter),
    };
    return this.makeDbCall("saveUsed", data);
  }

  public getInvalidTimestampChallenge(challengeId: string): Promise<any> {
    return this.makeDbCall("getInvalidTimestampChallenge", challengeId);
  }

  public saveInvalidTimestampChallenge(challengeId: string): Promise<any> {
    const data = {
      challengeId,
      deleteOn: new Date(Date.now() + this.config.invalidTimestampChallengesDeleteAfter),
    };
    return this.makeDbCall("saveInvalidTimestampChallenge", data);
  }

  public getUserIncompleteCount(userIdentifier: string): Promise<number> {
    return this.makeDbCall<number>("getIncompleteCountByUserIdentifier", userIdentifier) as Promise<number>;
  }

  public getTotalIncompleteCount(): Promise<number> {
    return this.makeDbCall<number>("getTotalIncompleteCount") as Promise<number>;
  }

  public saveIncomplete(userIdentifier: string): Promise<any> {
    const data = {
      userIdentifier,
      deleteOn: new Date(Date.now() + this.config.incompleteDeleteAfter),
    };
    return this.makeDbCall("saveIncomplete", data);
  }

  public getUserSelfGeneratedCount(userIdentifier: string): Promise<number> {
    return this.makeDbCall<number>("getSelfGeneratedCountByUserIdentifier", userIdentifier) as Promise<number>;
  }

  public saveSelfGenerated(userIdentifier: string): Promise<any> {
    const data = {
      userIdentifier,
      deleteOn: new Date(Date.now() + this.config.selfGeneratedDeleteAfter),
    };
    return this.makeDbCall("saveSelfGenerated", data);
  }

  public getUserLastGeneratedChallenge(userIdentifier: string): Promise<any> {
    return this.makeDbCall("getLastGeneratedByUserIdentifier", userIdentifier);
  }

  public saveGenerated(challengeData: { complexity: number; difficulty: number; userIdentifier: string; expiresOn: number }): Promise<any> {
    const data = {
      complexity: challengeData.complexity,
      difficulty: challengeData.difficulty,
      userIdentifier: challengeData.userIdentifier,
      expiresOn: challengeData.expiresOn,
      deleteOn: new Date(Date.now() + this.config.difficultyResetPeriod),
    };
    return this.makeDbCall("saveGenerated", data);
  }
}

export default PowDatabaseController;
