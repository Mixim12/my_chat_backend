const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const DatabaseControllerPath = './../../../src/database/DatabaseController';

describe('DatabaseController', function () {
    const sandbox = sinon.createSandbox();
    const now = new Date('2022-01-01');

    const CONFIG = {
        minDifficulty: 2,
        minComplexity: 100,
        challengeExpireAfter: 3600,
        difficultyResetPeriod: 3600,
        invalidTimestampChallengesDeleteAfter: 3600,
        selfGeneratedDeleteAfter: 3600,
        incompleteDeleteAfter: 3600,
    };
    const CHALLENGE_ID = '9f7ea8e1-d2f6-4613-9c22-1d805b194097';
    const USER_IDENTIFIER = '::ffff:127.0.0.1|||||Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0|||||';

    let MongoClient = null;

    this.beforeEach(function () {
        sandbox.useFakeTimers(now);

        MongoClient = {
            pow_generated: {
                find: sandbox.stub(),
                insertOne: sandbox.stub(),
                createIndex: sandbox.stub(),
            },
            pow_used: {
                findOne: sandbox.stub(),
                insertOne: sandbox.stub(),
                createIndex: sandbox.stub(),
            },
            pow_invalid_timestamp_challenges: {
                findOne: sandbox.stub(),
                insertOne: sandbox.stub(),
                createIndex: sandbox.stub(),
            },
            pow_incomplete: {
                countDocuments: sandbox.stub(),
                insertOne: sandbox.stub(),
                createIndex: sandbox.stub(),
            },
            pow_self_generated: {
                countDocuments: sandbox.stub(),
                insertOne: sandbox.stub(),
                createIndex: sandbox.stub(),
            },
        };
    });

    this.afterEach(function () {
        sandbox.reset();
        sandbox.restore();
    });

    describe('init (configurations, mongoClient)', function () {
        it('When config and MongoClient are provided, should set the config and initialize the MongoAdapter', async function () {
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const dbController = DatabaseController.init(CONFIG, MongoClient);

            assert.strictEqual(typeof dbController.init, 'function');
            assert.strictEqual(typeof dbController.getUsed, 'function');
            assert.strictEqual(typeof dbController.saveUsed, 'function');
            assert.strictEqual(typeof dbController.getUserIncompleteCount, 'function');
            assert.strictEqual(typeof dbController.getTotalIncompleteCount, 'function');
            assert.strictEqual(typeof dbController.saveIncomplete, 'function');
            assert.strictEqual(typeof dbController.getUserSelfGeneratedCount, 'function');
            assert.strictEqual(typeof dbController.saveSelfGenerated, 'function');
            assert.strictEqual(typeof dbController.getUserLastGeneratedChallenge, 'function');
            assert.strictEqual(typeof dbController.saveGenerated, 'function');
            assert.strictEqual(typeof dbController.getInvalidTimestampChallenge, 'function');
            assert.strictEqual(typeof dbController.saveInvalidTimestampChallenge, 'function');
            sinon.assert.calledTwice(MongoClient.pow_generated.createIndex);
            assert.deepStrictEqual(
                MongoClient.pow_generated.createIndex.getCall(0).args,
                [{ userIdentifier: 1 }],
            );
            assert.deepStrictEqual(
                MongoClient.pow_generated.createIndex.getCall(1).args,
                [{ deleteOn: 1 }, { expireAfterSeconds: 1 }],
            );
            sinon.assert.calledTwice(MongoClient.pow_used.createIndex);
            assert.deepStrictEqual(
                MongoClient.pow_used.createIndex.getCall(0).args,
                [{ challengeId: 1 }],
            );
            assert.deepStrictEqual(
                MongoClient.pow_used.createIndex.getCall(1).args,
                [{ deleteOn: 1 }, { expireAfterSeconds: 1 }],
            );
            sinon.assert.calledTwice(MongoClient.pow_invalid_timestamp_challenges.createIndex);
            assert.deepStrictEqual(
                MongoClient.pow_invalid_timestamp_challenges.createIndex.getCall(0).args,
                [{ challengeId: 1 }],
            );
            assert.deepStrictEqual(
                MongoClient.pow_invalid_timestamp_challenges.createIndex.getCall(1).args,
                [{ deleteOn: 1 }, { expireAfterSeconds: 1 }],
            );
            sinon.assert.calledTwice(MongoClient.pow_self_generated.createIndex);
            assert.deepStrictEqual(
                MongoClient.pow_self_generated.createIndex.getCall(0).args,
                [{ userIdentifier: 1 }],
            );
            assert.deepStrictEqual(
                MongoClient.pow_self_generated.createIndex.getCall(1).args,
                [{ deleteOn: 1 }, { expireAfterSeconds: 1 }],
            );
            sinon.assert.calledTwice(MongoClient.pow_incomplete.createIndex);
            assert.deepStrictEqual(
                MongoClient.pow_incomplete.createIndex.getCall(0).args,
                [{ userIdentifier: 1 }],
            );
            assert.deepStrictEqual(
                MongoClient.pow_incomplete.createIndex.getCall(1).args,
                [{ deleteOn: 1 }, { expireAfterSeconds: 1 }],
            );
        });

        it('When MongoClient is not provided, should not initialize the MongoAdapter', async function () {
            const MongoAdapter = {
                init: sinon.stub(),
            };
            const DatabaseControllerProxyquired = proxyquire(DatabaseControllerPath, {
                './MongoAdapter': MongoAdapter,
            });
            const dbController = DatabaseControllerProxyquired.init(CONFIG);

            assert.strictEqual(typeof dbController.init, 'function');
            assert.strictEqual(typeof dbController.getUsed, 'function');
            assert.strictEqual(typeof dbController.saveUsed, 'function');
            assert.strictEqual(typeof dbController.getUserIncompleteCount, 'function');
            assert.strictEqual(typeof dbController.getTotalIncompleteCount, 'function');
            assert.strictEqual(typeof dbController.saveIncomplete, 'function');
            assert.strictEqual(typeof dbController.getUserSelfGeneratedCount, 'function');
            assert.strictEqual(typeof dbController.saveSelfGenerated, 'function');
            assert.strictEqual(typeof dbController.getUserLastGeneratedChallenge, 'function');
            assert.strictEqual(typeof dbController.saveGenerated, 'function');
            assert.strictEqual(typeof dbController.getInvalidTimestampChallenge, 'function');
            assert.strictEqual(typeof dbController.saveInvalidTimestampChallenge, 'function');
            sinon.assert.notCalled(MongoAdapter.init);
        });
    });

    describe('getUsed (challengeId)', function () {
        it('When the adapter is set, should call the Mongo client "getUsed" method and return response', async function () {
            const dbResponse = {
                challengeId: CHALLENGE_ID,
                deleteOn: Date.now(),
            };
            MongoClient.pow_used.findOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getUsed(CHALLENGE_ID);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_used.findOne, {
                challengeId: CHALLENGE_ID,
            });
        });

        it('When Mongo client throws error, should throw PowInternalError', async function () {
            const dbError = new Error('Db thrown error');
            MongoClient.pow_used.findOne.throws(dbError);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            await assert.rejects(DbController.getUsed(CHALLENGE_ID), {
                name: 'PowInternalError',
                type: 'DatabaseError',
                message: dbError.message,
                data: { error: dbError },
            });

            sinon.assert.calledOnceWithExactly(MongoClient.pow_used.findOne, {
                challengeId: CHALLENGE_ID,
            });
        });

        it('When the adapter is not set, should return "undefined"', async function () {
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG);

            const result = await DbController.getUsed(CHALLENGE_ID);
            console.log('result', result);

            assert.deepStrictEqual(result, undefined);
            sinon.assert.notCalled(MongoClient.pow_used.findOne);
        });
    });

    describe('saveIncomplete (userIdentifier)', function () {
        it('When the adapter is set, should call the "insertOne" method on the pow_incomplete collection and return response', async function () {
            const dbResponse = {
                acknowledged: true,
                insertedId: '56fc40f9d735c28df206d078',
            };
            MongoClient.pow_incomplete.insertOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.saveIncomplete(USER_IDENTIFIER);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_incomplete.insertOne, {
                userIdentifier: USER_IDENTIFIER,
                deleteOn: new Date(now.getTime() + CONFIG.incompleteDeleteAfter),
            });
        });
    });

    describe('saveSelfGenerated (userIdentifier)', function () {
        it('When the adapter is set, should call the "insertOne" method on the pow_self_generated collection and return response', async function () {
            const dbResponse = {
                acknowledged: true,
                insertedId: '56fc40f9d735c28df206d078',
            };
            MongoClient.pow_self_generated.insertOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.saveSelfGenerated(USER_IDENTIFIER);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_self_generated.insertOne, {
                userIdentifier: USER_IDENTIFIER,
                deleteOn: new Date(now.getTime() + CONFIG.selfGeneratedDeleteAfter),
            });
        });
    });

    describe('saveUsed (challengeId)', function () {
        it('When the adapter is set, should call the "insertOne" method on the pow_used collection and return response', async function () {
            const dbResponse = {
                acknowledged: true,
                insertedId: '56fc40f9d735c28df206d078',
            };
            MongoClient.pow_used.insertOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.saveUsed(CHALLENGE_ID);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_used.insertOne, {
                challengeId: CHALLENGE_ID,
                deleteOn: new Date(now.getTime() + CONFIG.challengeExpireAfter),
            });
        });
    });

    describe('saveGenerated (challengeData)', function () {
        it('When the adapter is set, should call the "insertOne" method on the pow_generated collection and return response', async function () {
            const challengeData = {
                complexity: 100,
                difficulty: 2,
                userIdentifier: USER_IDENTIFIER,
                expiresOn: now.getTime() + CONFIG.challengeExpireAfter,
            };
            const dbResponse = {
                acknowledged: true,
                insertedId: '56fc40f9d735c28df206d078',
            };
            MongoClient.pow_generated.insertOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.saveGenerated(challengeData);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_generated.insertOne, {
                complexity: challengeData.complexity,
                difficulty: challengeData.difficulty,
                userIdentifier: challengeData.userIdentifier,
                expiresOn: challengeData.expiresOn,
                deleteOn: new Date(now.getTime() + CONFIG.difficultyResetPeriod),
            });
        });
    });

    describe('saveInvalidTimestampChallenge (challengeId)', function () {
        it('When the adapter is set, should call the "insertOne" method on the pow_invalid_timestamp_challenges collection and return response', async function () {
            const dbResponse = {
                acknowledged: true,
                insertedId: '56fc40f9d735c28df206d078',
            };
            MongoClient.pow_invalid_timestamp_challenges.insertOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.saveInvalidTimestampChallenge(CHALLENGE_ID);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_invalid_timestamp_challenges.insertOne, {
                challengeId: CHALLENGE_ID,
                deleteOn: new Date(now.getTime() + CONFIG.invalidTimestampChallengesDeleteAfter),
            });
        });
    });

    describe('getInvalidTimestampChallenge (challengeId)', function () {
        it('When the adapter is set, should call the "findOne" method on the pow_invalid_timestamp_challenges collection and return response', async function () {
            const dbResponse = {
                _id: '56fc40f9d735c28df206d078',
                challengeId: CHALLENGE_ID,
                deleteOn: new Date(now.getTime() + CONFIG.invalidTimestampChallengesDeleteAfter),
            };
            MongoClient.pow_invalid_timestamp_challenges.findOne.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getInvalidTimestampChallenge(CHALLENGE_ID);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_invalid_timestamp_challenges.findOne, {
                challengeId: CHALLENGE_ID,
            });
        });
    });

    describe('getUserIncompleteCount (userIdentifier)', function () {
        it('When the adapter is set, should call the "countDocuments" method with the given userIdentifier filter on the pow_incomplete collection and return response', async function () {
            const dbResponse = 0;
            MongoClient.pow_incomplete.countDocuments.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getUserIncompleteCount(USER_IDENTIFIER);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_incomplete.countDocuments, {
                userIdentifier: USER_IDENTIFIER,
            });
        });
    });

    describe('getTotalIncompleteCount ()', function () {
        it('When the adapter is set, should call the "countDocuments" method on the pow_incomplete collection and return response', async function () {
            const dbResponse = 0;
            MongoClient.pow_incomplete.countDocuments.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getTotalIncompleteCount();

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_incomplete.countDocuments);
        });
    });

    describe('getUserSelfGeneratedCount (userIdentifier)', function () {
        it('When the adapter is set, should call the "countDocuments" method on the pow_self_generated collection and return response', async function () {
            const dbResponse = 0;
            MongoClient.pow_self_generated.countDocuments.resolves(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getUserSelfGeneratedCount(USER_IDENTIFIER);

            assert.deepStrictEqual(result, dbResponse);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_self_generated.countDocuments, {
                userIdentifier: USER_IDENTIFIER,
            });
        });
    });

    describe('getUserLastGeneratedChallenge (userIdentifier)', function () {
        it('When the adapter is set, should call the "find" method on the pow_generated collection and return the first response', async function () {
            const challenge = {
                _id: '56fc40f9d735c28df206d078',
                complexity: 100,
                difficulty: 2,
                userIdentifier: USER_IDENTIFIER,
                expiresOn: now.getTime() + CONFIG.challengeExpireAfter,
                deleteOn: new Date(now.getTime() + CONFIG.difficultyResetPeriod),
            };
            const dbResponse = {
                sort: sinon.stub().returns({
                    limit: sinon.stub().returns({
                        toArray: sinon.stub().resolves([challenge]),
                    }),
                }),
            };
            MongoClient.pow_generated.find.returns(dbResponse);
            const DatabaseController = proxyquire(DatabaseControllerPath, {});
            const DbController = DatabaseController.init(CONFIG, MongoClient);

            const result = await DbController.getUserLastGeneratedChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, challenge);
            sinon.assert.calledOnceWithExactly(MongoClient.pow_generated.find, {
                userIdentifier: USER_IDENTIFIER,
            });
        });
    });
});
