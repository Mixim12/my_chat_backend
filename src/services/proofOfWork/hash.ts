import { createHash } from "crypto";

export interface HashCashSolution {
  nonces: number[];
  executionTime: number;
}

const MAX_EXECUTION_TIME = 60 * 1000;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hexToBinary(hex: string): string {
  return hex
    .split("")
    .map((c) => parseInt(c, 16).toString(2).padStart(4, "0"))
    .join("");
}

function findNonce(prefix: string, difficulty: number): number {
  let nonce = 0;
  const startTime = Date.now();
  while (true) {
    const hashHex = sha256(prefix + nonce);
    const hashBinary = hexToBinary(hashHex);
    if (hashBinary.substring(0, difficulty) === "0".repeat(difficulty)) {
      return nonce;
    }
    nonce++;
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      throw new Error("Max execution time exceeded while solving challenge");
    }
  }
}

export function solveChallenge(challenge: string, difficulty: number, complexity: number): HashCashSolution {
  const nonces: number[] = [];
  let currentPrefix = challenge;
  const startTime = Date.now();
  for (let i = 0; i < complexity; i++) {
    const nonce = findNonce(currentPrefix, difficulty);
    nonces.push(nonce);
    currentPrefix += nonce.toString();
  }
  const executionTime = Date.now() - startTime;
  return { nonces, executionTime };
}

export function verifySolution(challenge: string, nonces: number[], difficulty: number): boolean {
  const requiredZeros = "0".repeat(difficulty);
  let currentPrefix = challenge;
  for (const nonce of nonces) {
    const hashHex = sha256(currentPrefix + nonce);
    const hashBinary = hexToBinary(hashHex);
    if (hashBinary.substring(0, difficulty) !== requiredZeros) {
      return false;
    }
    currentPrefix += nonce.toString();
  }
  return true;
}
