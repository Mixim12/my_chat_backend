import { Schema, Types } from "mongoose";
import { signPow, verifyPow } from "../../utils/jwt";
import config from "../../utils/config";

export interface ChallengeData {
  _id: Schema.Types.ObjectId;
  userIdentifier: string;
  difficulty: number;
  complexity: number;
  createdAt: number;
  expiresOn: number;
  source?: string;
}

let challengeExpireAfter: number = config.proofOfWork.challengeExpireAfter;

export async function generateChallengeToken(
  userIdentifier: string,
  difficulty: number,
  complexity: number,
  source?: string
): Promise<{ token: string | null; challengeData: ChallengeData }> {
  const _id = new Types.ObjectId() as unknown as Schema.Types.ObjectId;

  const now = Date.now();

  const challengeData: ChallengeData = {
    _id,
    userIdentifier,
    difficulty,
    complexity,
    createdAt: now,
    expiresOn: now + challengeExpireAfter,
    source,
  };

  const payload = {
    cid: challengeData._id,
    uid: challengeData.userIdentifier,
    dif: challengeData.difficulty,
    cpx: challengeData.complexity,
    iat: Math.floor(challengeData.createdAt / 1000),
    exp: Math.floor(challengeData.expiresOn / 1000),
    src: challengeData.source,
  };

  const token = signPow(payload);

  return { token, challengeData };
}

export function decodeChallengeToken(token: string): ChallengeData {
  try {
    const decoded = verifyPow(token) as any;

    return {
      _id: decoded.cid,
      userIdentifier: decoded.uid,
      difficulty: decoded.dif,
      complexity: decoded.cpx,
      createdAt: decoded.iat * 1000,
      expiresOn: decoded.exp * 1000,
      source: decoded.src,
    };
  } catch (err) {
    throw new Error("Invalid token");
  }
}
