const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { PowValidationError } = require('../errors');
const { isDefined, hashString } = require('../utils');

const self = {};

let jwtSecret = '-';
let config = {};

self.init = function (configuration, secret) {
    config = configuration;
    jwtSecret = secret;

    return self;
};

function challengeToClaims (challengeData) {
    return {
        chl: challengeData.challengeId,
        idf: challengeData.userIdentifier,
        dif: challengeData.difficulty,
        cpx: challengeData.complexity,
        iat: Math.floor(challengeData.createdOn / 1000),
        exp: Math.floor(challengeData.expiresOn / 1000),
        src: challengeData.source,
    };
}

self.generateChallengeAndToken = function generateChallengeAndToken (userIdentifier, difficulty, complexity, source) {
    const challengeId = crypto.randomUUID();
    const now = Date.now();

    const challengeData = {
        challengeId,
        userIdentifier,
        difficulty,
        complexity,
        createdOn: now,
        expiresOn: now + config.challengeExpireAfter,
        source,
    };

    const powToken = jwt.sign(challengeToClaims(challengeData), jwtSecret);

    return {
        challengeData,
        powToken,
    };
};

self.decodeServerToken = function decodeServerToken (token) {
    let decoded = {};
    try {
        const decodedRaw = jwt.verify(token, jwtSecret);
        decoded = {
            challengeId: decodedRaw.chl,
            userIdentifier: decodedRaw.idf,
            difficulty: decodedRaw.dif,
            complexity: decodedRaw.cpx,
            createdOn: decodedRaw.iat * 1000,
            expiresOn: decodedRaw.exp * 1000,
            source: decodedRaw.src,
        };
    } catch (err) {
        throw new PowValidationError('InvalidToken', 'Token corrupted');
    }

    if (
        !isDefined(decoded.userIdentifier) || !isDefined(decoded.expiresOn) || !isDefined(decoded.createdOn) ||
        !isDefined(decoded.challengeId) || !isDefined(decoded.difficulty) || !isDefined(decoded.complexity)
    ) {
        throw new PowValidationError('InvalidToken', 'Invalid token data');
    }

    decoded.selfGenerated = false;
    decoded.hasInvalidTimestamp = false;

    return decoded;
};

self.decodeSelfGeneratedToken = function decodeSelfGeneratedToken (token) {
    const data = token.split(':');
    if (data.length !== 5) {
        throw new PowValidationError('InvalidToken', 'Invalid token format');
    }
    const challengeId = hashString(token);

    const decoded = {
        challengeId,
        difficulty: parseInt(data[0]),
        complexity: parseInt(data[1]),
        createdOn: parseInt(data[2]),
        payload: data[3],
        random: data[4],
    };

    const now = Date.now();
    const allowedTimestampOffset = config.challengeExpireAfter / 2;
    decoded.hasInvalidTimestamp =
        (now + allowedTimestampOffset <= decoded.createdOn) ||
        (now - allowedTimestampOffset >= decoded.createdOn);

    decoded.expiresOn = now + config.challengeExpireAfter;
    decoded.selfGenerated = true;

    return decoded;
};

self.validateServerToken = function validateServerToken (decoded, userIdentifier) {
    const now = Date.now();

    if (decoded.userIdentifier !== userIdentifier) {
        throw new PowValidationError('InvalidToken', 'Invalid user identifier');
    }
    if (now > decoded.expiresOn) {
        throw new PowValidationError('InvalidToken', 'Token expired');
    }
};

self.validateSelfGeneratedToken = function validateSelfGeneratedToken (decoded, payload) {
    if (decoded.complexity < config.minComplexity || decoded.difficulty < config.minDifficulty) {
        throw new PowValidationError('InvalidToken', 'Invalid token data');
    }
    const payloadCheck = encodeURIComponent(JSON.stringify(payload));
    if (decoded.payload !== payloadCheck) {
        throw new PowValidationError('InvalidToken', 'Invalid payload');
    }
};

module.exports = self;
