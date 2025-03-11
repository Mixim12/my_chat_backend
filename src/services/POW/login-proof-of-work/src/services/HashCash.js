/* eslint-disable complexity */
const crypto = require("crypto");
const { PowInternalError } = require("../errors");

const MAX_EXECUTION_TIME = 2 * 60 * 1000;

const self = {};

self.checkSolution = function checkPowSolution(challenge, nonces, difficulty, complexity) {
  const length = nonces.length;
  if (length !== complexity) {
    return {
      isValid: false,
      reason: "Incorrect nonces number",
    };
  }
  const solutionPrefix = generateStringOfZeroes(difficulty);
  let challengePrefix = challenge;
  const checkIndexes = getIndexesToCheck(length);

  for (let i = 0; i < length; i++) {
    const nonce = nonces[i];
    if (checkIndexes.indexOf(i) > -1) {
      const hashedValue = concatenateAndHash(challengePrefix, nonce);
      const leadingBits = extractLeadingBitsFromHexString(hashedValue, difficulty);
      if (leadingBits !== solutionPrefix) {
        return {
          isValid: false,
          reason: "Incorrect nonces",
        };
      }
    }
    challengePrefix += nonce;
  }
  return { isValid: true };
};

self.solve = function solve(powChallenge, difficulty, complexity) {
  const nonces = [];
  const startExecution = Date.now();
  let executionTime = 1;
  let powPrefix = powChallenge;
  for (let i = 0; i < complexity; i++) {
    const solution = findNonce(powPrefix, difficulty);
    powPrefix = powPrefix + solution.nonce;
    nonces.push(solution.nonce);
  }
  executionTime = Date.now() - startExecution;
  return { nonce: nonces, executionTime };
};

function getRandomIntInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function convertHexCharToBinaryString(char) {
  switch (char.toUpperCase()) {
    case "0":
      return "0000";
    case "1":
      return "0001";
    case "2":
      return "0010";
    case "3":
      return "0011";
    case "4":
      return "0100";
    case "5":
      return "0101";
    case "6":
      return "0110";
    case "7":
      return "0111";
    case "8":
      return "1000";
    case "9":
      return "1001";
    case "A":
      return "1010";
    case "B":
      return "1011";
    case "C":
      return "1100";
    case "D":
      return "1101";
    case "E":
      return "1110";
    case "F":
      return "1111";
    default:
      return "0000";
  }
}

function concatenateAndHash(token, nonce) {
  const hash = crypto.createHash("sha256");
  hash.update(token + nonce);
  return hash.digest("hex");
}

function getIndexesToCheck(length) {
  const checkNonces = [0];
  let random = getRandomIntInRange(1, Math.floor(length / 2));
  checkNonces.push(random);
  random = getRandomIntInRange(Math.floor(length / 2), length - 1);
  checkNonces.push(random);
  checkNonces.push(length - 1);
  return checkNonces;
}

function generateStringOfZeroes(charNo) {
  let string = "";
  for (let i = 0; i < charNo; i++) {
    string += "0";
  }
  return string;
}

function extractLeadingBitsFromHexString(hexString, numBits) {
  let bitString = "";
  const numChars = Math.ceil(numBits / 4);
  for (let i = 0; i < numChars; i++) {
    bitString = `${bitString}${convertHexCharToBinaryString(hexString.charAt(i))}`;
  }
  bitString = bitString.substr(0, numBits);
  return bitString;
}

function findNonce(powChallenge, difficulty) {
  const startExecution = Date.now();
  let nonce = 1;
  let executionTime = 1;
  let hashedValue = concatenateAndHash(powChallenge, nonce);
  const solutionPrefix = generateStringOfZeroes(difficulty);

  while (extractLeadingBitsFromHexString(hashedValue, difficulty) !== solutionPrefix) {
    nonce++;
    hashedValue = concatenateAndHash(powChallenge, nonce);
    executionTime = Date.now() - startExecution;
    if (MAX_EXECUTION_TIME > 0 && executionTime > MAX_EXECUTION_TIME) {
      throw new PowInternalError("ExecutionTimeExceeded", { message: "Error solving PoW challenge: Max execution time exceceded" });
    }
  }
  return {
    powChallenge,
    nonce,
    executionTime,
    solutionHash: hashedValue,
  };
}

module.exports = self;
