import { generateChallengeToken, decodeChallengeToken } from "./token";
import { verifySolution } from "./hash";
import * as config from "../../../config.json";
import MongoAdapter from "./database/mongoAdapter";
import { powGenerated } from "../../models/powModel";

async function getDifficultyAndComplexityForUserIdentifier(userIdentifier: string): Promise<{ difficulty: number; complexity: number }> {
  const now = Date.now();
  let overall = { difficulty: config.proofOfWork.minDifficulty, complexity: config.proofOfWork.minComplexity };

  if (MongoAdapter && typeof MongoAdapter.getLastGeneratedByUserIdentifier === "function") {
    const lastChallenge = await MongoAdapter.getLastGeneratedByUserIdentifier(userIdentifier);
    if (lastChallenge && lastChallenge.difficulty && lastChallenge.complexity) {
      if (lastChallenge.expiresOn + config.proofOfWork.difficultyDecreasePeriod < now) {
        overall = decreaseOverallDifficulty(lastChallenge.difficulty, lastChallenge.complexity);
      } else {
        overall = increaseOverallDifficulty(lastChallenge.difficulty, lastChallenge.complexity);
      }
    }
  }
  return overall;
}

function increaseOverallDifficulty(difficulty: number, complexity: number): { difficulty: number; complexity: number } {
  if (complexity >= config.proofOfWork.maxComplexity) {
    if (difficulty < config.proofOfWork.maxDifficulty) {
      difficulty += config.proofOfWork.difficultyStep;
      complexity = config.proofOfWork.minComplexity;
    }
  } else {
    complexity += config.proofOfWork.complexityStep;
  }
  return { difficulty, complexity };
}

function decreaseOverallDifficulty(difficulty: number, complexity: number): { difficulty: number; complexity: number } {
  if (complexity <= config.proofOfWork.minComplexity && difficulty > config.proofOfWork.minDifficulty) {
    difficulty -= config.proofOfWork.difficultyStep;
    complexity = config.proofOfWork.maxComplexity - config.proofOfWork.complexityStep;
  } else if (complexity > config.proofOfWork.minComplexity) {
    complexity -= config.proofOfWork.complexityStep;
  }
  return { difficulty, complexity };
}

async function generateChallenge(userIdentifier: string, source?: string): Promise<{ challenge: string; difficulty: number; complexity: number }> {
  const { difficulty, complexity } = await getDifficultyAndComplexityForUserIdentifier(userIdentifier);
  const { token, challengeData } = await generateChallengeToken(userIdentifier, difficulty, complexity, source);

  if (!token) {
    throw new Error("Failed to generate challenge token");
  }

  const data = new powGenerated({
    userIdentifier: userIdentifier,
    challenge: token,
    difficulty,
    complexity,
    createdAt: challengeData.createdAt,
    expiresOn: challengeData.expiresOn,
    source,
  });

  if (MongoAdapter) {
    try {
      await MongoAdapter.saveGenerated(data);
    } catch (err) {
      console.error(err);
    }
  }

  return { challenge: token, difficulty: difficulty, complexity: complexity };
}

async function checkSolution(userIdentifier: string, token: string, nonces: number[]): Promise<boolean> {
  const challengeData = decodeChallengeToken(token);
  
  if (challengeData.userIdentifier !== userIdentifier) {
    
    throw new Error("User identifier does not match challenge");
  }

  if (Date.now() > challengeData.expiresOn) {
    throw new Error("Challenge token expired");
  }

  const isValid = verifySolution(token, nonces, challengeData.difficulty);

  if (!isValid) {
    throw new Error("Invalid PoW solution");
  }

  if (MongoAdapter) {
    await MongoAdapter.markChallengeUsed(challengeData._id);
  }

  return isValid;
}

export default { generateChallenge, checkSolution };
