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
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaWQiOiI2ODIwYmFkZTYyZDc2ODIxMTIzOTBkMmYiLCJ1aWQiOiJicnVuby1ydW50aW1lLzIuMi4wfDE5Mi4xNjguMS4xfHVuZGVmaW5lZCIsImRpZiI6MiwiY3B4IjoxMDAsImlhdCI6MTc0Njk3NTQ1NCwiZXhwIjoxNzY0OTc1NDU0fQ.B5GQbLgKiJOK8d969lRdxnNmED71wJs0nhV6TJZHWGHnrSiLISvlDtD9aVRotb26rOP9rMMf21HSeomWTm1FRP5sEALJbPoQU0NSM1KychIjUPd57wEkaoYoyUnZRYpPa6R4gZVSEG7ZyXfPNq2RzlItweQSXE8wOcbdcE_R8bt0N9PVMX3_pSyFCTmreyPoWveqdsyKQ41RWK7uuL4vj-9tV7bcbijbpXsHeQfHIOyxH0QlnKNnFANlneBzibZmWHZROI2NdkrU18kp6MZBruZ3HT6RJNB-E-rmV_3kaXjtR0FrKmLNEez9WkwXUK3pX_ElsfvrGQNfNq7Epldvot_VpBEYVBykHpVj8eLv-sP7gppE2VM0Scy-DDCkrxzU5-5pn_MJflORJeKiVHH-R3lypfakO905gy32QnbYZ7nkdEl4N7QmOwMa4kmAyBEJssIEi6skgC6guTudXoeCcWjhzsx0QajGkhjKeHneCDVsWZZKt5yWGh6i91pp6IqyIlF2Wv_6gGOkgxxr3ZObHWOLQaLWKWVxOMEo0H2fkrd1lFyCQVI0n4cSFbOWN4Zstbq3xwl4AaqGcdbW0r2hXpNjn_wo9-OuZn5uUrKDFB8y5-SXbiv2sJUZN8y2nMDRxnv9FxoLKqiWONy--yS1I1WpSvwn_obaOEoFjnkOUB0";
const noncesAndTime = solveChallenge(token, 2, 100);

console.log("Nonces:", noncesAndTime.nonces);
console.log("Execution Time:", noncesAndTime.executionTime, "ms");
