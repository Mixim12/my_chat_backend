const MongoAdapter = require('./MongoAdapter');
const { PowInternalError } = require('./../errors');

const self = {};

let dbAdapter = null;
let config = {};

async function makeDbCall (method, args) {
    if (!dbAdapter) {
        return;
    }
    try {
        return await dbAdapter[method](args);
    } catch (err) {
        throw new PowInternalError('DatabaseError', err);
    }
}

self.init = function (configurations, mongoClient) {
    config = configurations;

    if (mongoClient) {
        dbAdapter = MongoAdapter.init(mongoClient);
    }

    return self;
};

self.getUsed = function getUsed (challengeId) {
    return makeDbCall('getUsed', challengeId);
};

self.saveUsed = function saveUsed (challengeId) {
    const data = {
        challengeId,
        deleteOn: new Date(Date.now() + config.challengeExpireAfter),
    };

    return makeDbCall('saveUsed', data);
};

self.getInvalidTimestampChallenge = function getInvalidTimestampChallenge (challengeId) {
    return makeDbCall('getInvalidTimestampChallenge', challengeId);
};

self.saveInvalidTimestampChallenge = function saveInvalidTimestampChallenge (challengeId) {
    const data = {
        challengeId,
        deleteOn: new Date(Date.now() + config.invalidTimestampChallengesDeleteAfter),
    };

    return makeDbCall('saveInvalidTimestampChallenge', data);
};

self.getUserIncompleteCount = function getUserIncompleteCount (userIdentifier) {
    return makeDbCall('getIncompleteCountByUserIdentifier', userIdentifier);
};

self.getTotalIncompleteCount = function getTotalIncompleteCount () {
    return makeDbCall('getTotalIncompleteCount');
};

self.saveIncomplete = function saveIncomplete (userIdentifier) {
    const data = {
        userIdentifier,
        deleteOn: new Date(Date.now() + config.incompleteDeleteAfter),
    };

    return makeDbCall('saveIncomplete', data);
};

self.getUserSelfGeneratedCount = function getUserSelfGeneratedCount (userIdentifier) {
    return makeDbCall('getSelfGeneratedCountByUserIdentifier', userIdentifier);
};

self.saveSelfGenerated = function saveSelfGenerated (userIdentifier) {
    const data = {
        userIdentifier,
        deleteOn: new Date(Date.now() + config.selfGeneratedDeleteAfter),
    };

    return makeDbCall('saveSelfGenerated', data);
};

self.getUserLastGeneratedChallenge = function getUserLastGeneratedChallenge (userIdentifier) {
    return makeDbCall('getLastGeneratedByUserIdentifier', userIdentifier);
};

self.saveGenerated = function saveGenerated (challengeData) {
    const data = {
        complexity: challengeData.complexity,
        difficulty: challengeData.difficulty,
        userIdentifier: challengeData.userIdentifier,
        expiresOn: challengeData.expiresOn,
        deleteOn: new Date(Date.now() + config.difficultyResetPeriod),
    };

    return makeDbCall('saveGenerated', data);
};

module.exports = self;
