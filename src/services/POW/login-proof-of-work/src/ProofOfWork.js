/* eslint-disable no-param-reassign, complexity */
const DatabaseController = require('./database/DatabaseController');
const TokenServiceFactory = require('./services/TokenService');
const HashCash = require('./services/HashCash');
const { isDefined, isSelfGeneratedToken, hashString } = require('./utils');
const { PowValidationError } = require('./errors');

const defaultConfig = require('./../defaultConfig.json');

let config = {};
let dbController = null;
let TokenService = null;

const self = {};

self.init = function init (options, jwtSecret, mongoClient) {
    options = options || {};
    jwtSecret = jwtSecret || '-';

    config = loadConfig(options);
    TokenService = TokenServiceFactory.init(config, jwtSecret);

    if (mongoClient) {
        dbController = DatabaseController.init(config, mongoClient);
    }

    return self;
};

self.generatePowChallenge = async function generatePowChallenge (userIdentifier, options = {}) {
    const hashedUserIdentifier = hashString(userIdentifier);
    const [
        { difficulty, complexity },
        userCounts,
    ] = await Promise.all([
        getDifficultyAndComplexityForUserIdentifier(hashedUserIdentifier),
        getUserIdentifierCounts(hashedUserIdentifier),
    ]);

    const {
        challengeData,
        powToken,
    } = TokenService.generateChallengeAndToken(hashedUserIdentifier, difficulty, complexity, options.source);
    const {
        allowIncomplete,
        allowSelfGenerated,
    } = getPermissions(userCounts);

    await dbController.saveGenerated(challengeData);

    return {
        powChallenge: powToken, difficulty, complexity, allowIncomplete, allowSelfGenerated,
    };
};

self.checkPowSolution = async function checkPowSolution (userIdentifier, powChallenge, powNonces, payload) {
    const hashedUserIdentifier = hashString(userIdentifier);
    const decoded = decodeAndVerifyToken(powChallenge, { userIdentifier: hashedUserIdentifier, payload });
    const solution = checkHashCashSolution(powChallenge, powNonces, decoded.difficulty, decoded.complexity);
    const userCounts = await getUserIdentifierCounts(hashedUserIdentifier);
    const promises = [];

    if (decoded.selfGenerated) {
        checkSelfGeneratedLimit(userCounts);
        promises.push(dbController.saveSelfGenerated(hashedUserIdentifier));
        userCounts.userSelfGeneratedCount++;
    }

    if (solution.isIncomplete) {
        const challengeData = {
            difficulty: decoded.difficulty,
            complexity: decoded.complexity,
            powChallenge,
        };
        checkIncompleteLimits(userCounts, challengeData);
        promises.push(dbController.saveIncomplete(hashedUserIdentifier));
        userCounts.userIncompleteSolutionsCount++;
        userCounts.totalIncompleteSolutionsCount++;
    }

    if (decoded.hasInvalidTimestamp) {
        promises.push(checkInvalidTimestampChallengeIsUsedAndSave(decoded.challengeId));
    } else {
        promises.push(checkChallengeIfUsedAndSave(decoded.challengeId));
    }

    await Promise.all(promises);
    const { allowIncomplete, allowSelfGenerated } = getPermissions(userCounts);

    return {
        allowSelfGenerated,
        allowIncomplete,
        isValid: solution.isValid,
        isIncomplete: solution.isIncomplete,
        selfGenerated: decoded.selfGenerated,
        createdOn: decoded.createdOn,
        difficulty: decoded.difficulty,
        complexity: decoded.complexity,
        hasInvalidTimestamp: decoded.hasInvalidTimestamp,
    };
};

async function getUserIdentifierCounts (userIdentifier) {
    const userCounts = {
        userSelfGeneratedCount: 0,
        userIncompleteSolutionsCount: 0,
        totalIncompleteSolutionsCount: 0,
    };
    if (!dbController) {
        return userCounts;
    }

    const promises = [];
    if (config.allowIncomplete) {
        promises.push(dbController.getUserIncompleteCount(userIdentifier));
        promises.push(dbController.getTotalIncompleteCount());
    }
    if (config.allowSelfGenerated) {
        promises.push(dbController.getUserSelfGeneratedCount(userIdentifier));
    }

    const results = await Promise.all(promises);
    if (results.length === 3) {
        userCounts.userIncompleteSolutionsCount = isDefined(results[0]) ? results[0] : 0;
        userCounts.totalIncompleteSolutionsCount = isDefined(results[1]) ? results[1] : 0;
        userCounts.userSelfGeneratedCount = isDefined(results[2]) ? results[2] : 0;
    } else if (results.length === 2) {
        userCounts.userIncompleteSolutionsCount = isDefined(results[0]) ? results[0] : 0;
        userCounts.totalIncompleteSolutionsCount = isDefined(results[1]) ? results[1] : 0;
    } else if (results.length === 1) {
        userCounts.userSelfGeneratedCount = isDefined(results[0]) ? results[0] : 0;
    }

    return userCounts;
}

function loadConfig (data) {
    const newConfig = {};

    for (const key of Object.keys(defaultConfig)) {
        newConfig[key] = isDefined(data[key]) ? data[key] : defaultConfig[key];
    }

    return newConfig;
}

function decodeAndVerifyToken (powChallenge, options) {
    let decoded = null;

    if (isSelfGeneratedToken(powChallenge)) {
        if (config.allowSelfGenerated !== true) {
            throw new PowValidationError('SelfGeneratedNotAllowed', 'SelfGenerated Token not allowed');
        }
        decoded = TokenService.decodeSelfGeneratedToken(powChallenge);
        TokenService.validateSelfGeneratedToken(decoded, options.payload);
    } else {
        decoded = TokenService.decodeServerToken(powChallenge);
        TokenService.validateServerToken(decoded, options.userIdentifier);
    }
    return decoded;
}

function increaseOverallDifficulty (difficulty, complexity) {
    if (complexity === config.maxComplexity) {
        if (difficulty < config.maxDifficulty) {
            difficulty += config.difficultyStep;
            complexity = config.minComplexity;
        }
    } else {
        complexity = complexity + config.complexityStep;
    }
    return { difficulty, complexity };
}

function decreaseOverallDifficulty (difficulty, complexity) {
    if (complexity === config.minComplexity && difficulty > config.minDifficulty) {
        difficulty -= config.difficultyStep;
        complexity = config.maxComplexity - config.complexityStep;
    } else if (complexity > config.minComplexity) {
        complexity -= config.complexityStep;
    }
    return { difficulty, complexity };
}

async function getDifficultyAndComplexityForUserIdentifier (userIdentifier) {
    const now = Date.now();
    let overallDifficulty = {
        difficulty: config.minDifficulty,
        complexity: config.minComplexity,
    };

    const lastChallenge = await dbController.getUserLastGeneratedChallenge(userIdentifier);

    if (lastChallenge && lastChallenge.difficulty && lastChallenge.complexity) {
        if (lastChallenge.expiresOn + config.difficultyDecreasePeriod < now) {
            overallDifficulty = decreaseOverallDifficulty(lastChallenge.difficulty, lastChallenge.complexity);
        } else {
            overallDifficulty = increaseOverallDifficulty(lastChallenge.difficulty, lastChallenge.complexity);
        }
    }

    return overallDifficulty;
}

function getPermissions (userCounts) {
    const allowSelfGenerated = config.allowSelfGenerated && userCounts.userSelfGeneratedCount < config.maximumUserSelfGenerated;
    const allowIncomplete = config.allowIncomplete &&
        userCounts.userIncompleteSolutionsCount < config.maximumUserIncompleteSolutions &&
        userCounts.totalIncompleteSolutionsCount < config.maximumIncompleteSolutions;

    return { allowSelfGenerated, allowIncomplete };
}

function checkSelfGeneratedLimit (userCounts) {
    if (userCounts.userSelfGeneratedCount >= config.maximumUserSelfGenerated) {
        throw new PowValidationError('SelfGeneratedLimitReached', 'SelfGenerated challenges limit reached');
    }
}

function checkIncompleteLimits (userCounts, challengeData) {
    if (userCounts.userIncompleteSolutionsCount >= config.maximumUserIncompleteSolutions) {
        throw new PowValidationError('IncompleteUserLimitReached', 'Incomplete solutions limit reached for user', challengeData);
    }
    if (userCounts.totalIncompleteSolutionsCount >= config.maximumIncompleteSolutions) {
        throw new PowValidationError('IncompleteLimitReached', 'Incomplete solutions limit reached', challengeData);
    }
}

async function checkChallengeIfUsedAndSave (challengeId) {
    if (!dbController) {
        return;
    }

    const usedChallenge = await dbController.getUsed(challengeId);
    if (usedChallenge) {
        throw new PowValidationError('ChallengeAlreadyUsed', 'Challenge already used!');
    }
    return dbController.saveUsed(challengeId);
}

async function checkInvalidTimestampChallengeIsUsedAndSave (challengeId) {
    if (!dbController) {
        return;
    }

    const usedChallenge = await dbController.getInvalidTimestampChallenge(challengeId);
    if (usedChallenge) {
        throw new PowValidationError('ChallengeAlreadyUsed', 'Challenge already used!');
    }
    return dbController.saveInvalidTimestampChallenge(challengeId);
}

function checkHashCashSolution (powChallenge, powNonces, difficulty, complexity) {
    let isIncomplete = false;
    let powComplexity = complexity;

    if (powNonces.length < complexity && config.allowIncomplete && powNonces.length > 0) {
        powComplexity = powNonces.length;
        isIncomplete = true;
    }

    const solution = HashCash.checkSolution(powChallenge, powNonces, difficulty, powComplexity);

    if (!solution.isValid) {
        throw new PowValidationError('InvalidSolution', `Invalid solution: ${solution.reason}`);
    }

    return {
        isValid: solution.isValid,
        isIncomplete,
    };
}

module.exports = self;
