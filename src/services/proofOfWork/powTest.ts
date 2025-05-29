import { createHash } from "crypto";

export interface HashCashSolution {
  nonces: number[];
  executionTime: number;
}
const MAX_EXECUTION_TIME = 60 * 1000;
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

const token =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaWQiOiI2ODI5OTI5MTI5ZjVkNzY1ODBlZDdhNjMiLCJ1aWQiOiJicnVuby1ydW50aW1lLzIuMy4wfDE5Mi4xNjguMS4xfHVuZGVmaW5lZCIsImRpZiI6MiwiY3B4IjoxMDAsImlhdCI6MTc0NzU1NDk2MSwiZXhwIjoxNzY1NTU0OTYxfQ.K5tAQ022U8XFVFb8tDpI3NdZ2Iskt8gHea3ir7G6L6zDIv7Ug4QGi9CsDpYK2Cl8mqUVzpFU8oI0q3awCGuTu9K5M17T2el4QlCgpcOsvO2Swi4CCOUu5zi5yLPetjlgAEKxp3L5Tyk-b1zh8fqkCT-i5Mn5Duzw2txkkik8A3uUDMICOwyRkNzh9UzJ7eNoeSvEplB84HThq4_Y7EehBjV_oTa8sDZQWfaFVT4QtGVhO8ItnOGBjYfF9naZGxRKoS4LxRb2eJrNDHt8wEMPip3tEcWflVISh3ryPM5Fnz3JlQoZ-6cjJw7ha0p8E7tG6E2oaE27yNL5uAyIjot0CcWTYW_OpFkr67U2U0odbyHi7XFLSZczVezSIjYc6QzBnTKvDJBDincYwbZksRtKfX3C5Na7WiVNzY46FiroXfJLzfmLc2JCaSXKpKdroU0vEbY71OHObn4wL-HlRVOic0xf8XQ9tngaTH33jpWWiZMPwViHtduKsA2ZVxVr4flkVONrjadbPMhQvh4ypIlc5CLNEx0r0uMA43VI8ZgUTjLDQEimfanL72KoZFmWDMvphUJQ_MROpCUc7CcW-hSPIFKr2JnipMU9fS0chcah0V4jU_pgql9nX_La28xSU2GKYTdmOkf1__jE12ae4pH4pB1YT7BK-ElDUhO9GloR60w";
const noncesAndTime = solveChallenge(token, 2, 100);

console.log("Nonces:", noncesAndTime.nonces);
console.log("Execution Time:", noncesAndTime.executionTime, "ms");
