const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const ProofOfWorkPath = './../../src/ProofOfWork';

describe('ProofOfWork', function () {
    const USER_IDENTIFIER = '::ffff:127.0.0.1|||||Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0|||||';
    const HASHED_USER_IDENTIFIER = '53b936bb36039731d1444fa5855b742664ad9ae2'; // this is the sha1 hash of USER_IDENTIFIER
    const CHALLENGE_ID = '9f7ea8e1-d2f6-4613-9c22-1d805b194097';
    const POW_SELF_GENERATED_CHALLENGE = '2:10:1879123:ASDQW';
    const POW_SERVER_CHALLENGE = 'asd11423asd.2vsesfr2.hrtdffea';
    const POW_NONCES_INCOMPLETE = [1, 2];
    const POW_NONCES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const PAYLOAD = 'test@bitdefender.com';
    const CONFIG = {
        minDifficulty: 2,
        maxDifficulty: 4,
        difficultyStep: 2,
        minComplexity: 100,
        maxComplexity: 300,
        complexityStep: 25,
        difficultyDecreasePeriod: 60,
        allowSelfGenerated: true,
        allowIncomplete: true,
        maximumIncompleteSolutions: 3,
        maximumUserIncompleteSolutions: 2,
        maximumUserSelfGenerated: 2,
    };

    describe('init (options, jwtSecret, mongoClient)', function () {
        const defaultConfig = require('./../../defaultConfig');
        const TokenService = {};
        const DatabaseController = {};
        let ProofOfWorkProxyquired = null;

        beforeEach(function () {
            TokenService.init = sinon.stub();
            DatabaseController.init = sinon.stub();

            ProofOfWorkProxyquired = proxyquire(ProofOfWorkPath, {
                './services/TokenService': TokenService,
                './database/DatabaseController': DatabaseController,
            });
        });

        it('When no configurations are set, should use default configurations to initialize and return itself', async function () {
            const ProofOfWork = ProofOfWorkProxyquired.init();

            assert.strictEqual(typeof ProofOfWork.init, 'function');
            assert.strictEqual(typeof ProofOfWork.generatePowChallenge, 'function');
            assert.strictEqual(typeof ProofOfWork.checkPowSolution, 'function');
            sinon.assert.calledOnceWithExactly(TokenService.init, defaultConfig, '-');
            sinon.assert.notCalled(DatabaseController.init);
        });

        it('When all configurations are set, should initialize all services and return itself', async function () {
            const config = {
                minDifficulty: 0,
                maxDifficulty: 0,
                difficultyStep: 0,
                minComplexity: 0,
                maxComplexity: 0,
                complexityStep: 0,
                difficultyResetPeriod: 0,
                difficultyDecreasePeriod: 0,
                challengeExpireAfter: 0,
                maximumIncompleteSolutions: 0,
                maximumUserIncompleteSolutions: 0,
                maximumUserSelfGenerated: 0,
                incompleteDeleteAfter: 0,
                selfGeneratedDeleteAfter: 0,
                invalidTimestampChallengesDeleteAfter: 0,
                allowIncomplete: false,
                allowSelfGenerated: false,
            };
            const MongoClient = { MongoClient: true };
            const jwtSecret = 'jwt-secret';

            const ProofOfWork = ProofOfWorkProxyquired.init(config, jwtSecret, MongoClient);

            assert.strictEqual(typeof ProofOfWork.init, 'function');
            assert.strictEqual(typeof ProofOfWork.generatePowChallenge, 'function');
            assert.strictEqual(typeof ProofOfWork.checkPowSolution, 'function');
            sinon.assert.calledOnceWithExactly(TokenService.init, config, jwtSecret);
            sinon.assert.calledOnceWithExactly(DatabaseController.init, config, MongoClient);
            sinon.assert.callOrder(
                TokenService.init,
                DatabaseController.init,
            );
        });
    });

    describe('async generatePowChallenge (userIdentifier)', function () {
        const TokenService = {};
        const DatabaseController = {};
        let ProofOfWorkProxyquired = null;

        beforeEach(function () {
            TokenService.generateChallengeAndToken = sinon.stub();

            DatabaseController.getUserLastGeneratedChallenge = sinon.stub();
            DatabaseController.saveGenerated = sinon.stub();
            DatabaseController.getUserIncompleteCount = sinon.stub();
            DatabaseController.getTotalIncompleteCount = sinon.stub();
            DatabaseController.getUserSelfGeneratedCount = sinon.stub();

            ProofOfWorkProxyquired = proxyquire(ProofOfWorkPath, {
                './services/TokenService': {
                    init: function () {
                        return TokenService;
                    },
                },
                './database/DatabaseController': {
                    init: function () {
                        return DatabaseController;
                    },
                },
            });
        });

        it('When no challenges were generated for the user, should generate and return minimum difficulty challenge', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});
            const options = { source: 'TEST-123' };

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER, options);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                allowIncomplete: true,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                'TEST-123',
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When a challenge was generated for the user, should increase overall difficulty and return new challenge - increase complexity', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            const lastChallenge = {
                difficulty: 2,
                complexity: 200,
                expiresOn: Date.now(),
            };
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(lastChallenge);
            DatabaseController.saveGenerated.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: 2,
                complexity: 225,
                allowIncomplete: true,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER, lastChallenge.difficulty, lastChallenge.complexity + CONFIG.complexityStep, undefined);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When a challenge was generated for the user, should increase overall difficulty and return new challenge - increase difficulty', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            const lastChallenge = {
                difficulty: 2,
                complexity: 300,
                expiresOn: Date.now(),
            };
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(lastChallenge);
            DatabaseController.saveGenerated.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: 4,
                complexity: 100,
                allowIncomplete: true,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER, lastChallenge.difficulty + CONFIG.difficultyStep, CONFIG.minComplexity, undefined);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When a user challenge was created past the difficultyDecreasePeriod, should decrease overall difficulty and return new challenge - decrease complexity', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            const lastChallenge = {
                difficulty: 2,
                complexity: 225,
                expiresOn: Date.now() - (CONFIG.difficultyDecreasePeriod + 10),
            };
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(lastChallenge);
            DatabaseController.saveGenerated.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: 2,
                complexity: 200,
                allowIncomplete: true,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER, lastChallenge.difficulty, lastChallenge.complexity - CONFIG.complexityStep, undefined);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When a user challenge was created past the difficultyDecreasePeriod, should decrease overall difficulty and return new challenge - decrease difficulty', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            const lastChallenge = {
                difficulty: 4,
                complexity: 100,
                expiresOn: Date.now() - (CONFIG.difficultyDecreasePeriod + 10),
            };
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(lastChallenge);
            DatabaseController.saveGenerated.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: 2,
                complexity: 275,
                allowIncomplete: true,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                lastChallenge.difficulty - CONFIG.difficultyStep,
                CONFIG.maxComplexity - CONFIG.complexityStep,
                undefined,
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When selfGenerated limit is reached for the user, should return allowSelfGenerated as false', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            DatabaseController.getUserSelfGeneratedCount.resolves(CONFIG.maximumUserSelfGenerated);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                allowIncomplete: true,
                allowSelfGenerated: false,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                undefined,
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When incomplete limit is reached for the user, should return allowIncomplete as false', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            DatabaseController.getUserIncompleteCount.resolves(CONFIG.maximumUserIncompleteSolutions);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                allowIncomplete: false,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                undefined,
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When incomplete pows are disabled, should return allowIncomplete as false', async function () {
            const config = { ...CONFIG };
            config.allowIncomplete = false;
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            DatabaseController.getUserSelfGeneratedCount.resolves(0);
            const ProofOfWork = ProofOfWorkProxyquired.init(config, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: config.minDifficulty,
                complexity: config.minComplexity,
                allowIncomplete: false,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                undefined,
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.notCalled(DatabaseController.getUserIncompleteCount);
            sinon.assert.notCalled(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When iselfGenerated pows are disabled, should return allowSelfGenerated as false', async function () {
            const config = { ...CONFIG };
            config.allowSelfGenerated = false;
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            DatabaseController.getUserIncompleteCount.resolves(0);
            DatabaseController.getTotalIncompleteCount.resolves(0);
            const ProofOfWork = ProofOfWorkProxyquired.init(config, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER);

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: config.minDifficulty,
                complexity: config.minComplexity,
                allowIncomplete: true,
                allowSelfGenerated: false,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                undefined,
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.notCalled(DatabaseController.getUserSelfGeneratedCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When total incomplete limit is reached, should return allowIncomplete as false', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(null);
            DatabaseController.saveGenerated.resolves();
            DatabaseController.getTotalIncompleteCount.resolves(CONFIG.maximumIncompleteSolutions);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.generatePowChallenge(USER_IDENTIFIER, { source: 'SRC-TEST-333' });

            assert.deepStrictEqual(result, {
                powChallenge: POW_SERVER_CHALLENGE,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                allowIncomplete: false,
                allowSelfGenerated: true,
            });
            sinon.assert.calledOnceWithExactly(
                TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER,
                CONFIG.minDifficulty,
                CONFIG.minComplexity,
                'SRC-TEST-333',
            );
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });

        it('When error is thrown while saving the generated challenge, should throw it', async function () {
            const challengeData = {
                challengeId: CHALLENGE_ID,
            };
            const powToken = POW_SERVER_CHALLENGE;
            const lastChallenge = {
                difficulty: 2,
                complexity: 200,
            };
            const DbError = {
                name: 'PowInternalError',
                type: 'DatabaseError',
                message: 'db query error',
            };
            TokenService.generateChallengeAndToken.returns({ challengeData, powToken });
            DatabaseController.getUserLastGeneratedChallenge.resolves(lastChallenge);
            DatabaseController.saveGenerated.throws(DbError);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.generatePowChallenge(USER_IDENTIFIER), DbError);

            sinon.assert.calledOnceWithExactly(TokenService.generateChallengeAndToken,
                HASHED_USER_IDENTIFIER, lastChallenge.difficulty, lastChallenge.complexity + CONFIG.complexityStep, undefined);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserLastGeneratedChallenge, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveGenerated, challengeData);
            sinon.assert.callOrder(
                DatabaseController.getUserLastGeneratedChallenge,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                TokenService.generateChallengeAndToken,
                DatabaseController.saveGenerated,
            );
        });
    });

    describe('async checkPowSolution (userIdentifier, powChallenge, powNonces, payload)', function () {
        let ProofOfWorkProxyquired = null;
        const TokenService = {};
        const DatabaseController = {};
        const HashCash = {};

        beforeEach(function () {
            TokenService.decodeSelfGeneratedToken = sinon.stub();
            TokenService.validateSelfGeneratedToken = sinon.stub();
            TokenService.decodeServerToken = sinon.stub();
            TokenService.validateServerToken = sinon.stub();

            DatabaseController.getUserSelfGeneratedCount = sinon.stub();
            DatabaseController.saveSelfGenerated = sinon.stub();
            DatabaseController.getUserIncompleteCount = sinon.stub();
            DatabaseController.getTotalIncompleteCount = sinon.stub();
            DatabaseController.saveIncomplete = sinon.stub();
            DatabaseController.getInvalidTimestampChallenge = sinon.stub();
            DatabaseController.saveInvalidTimestampChallenge = sinon.stub();
            DatabaseController.getUsed = sinon.stub();
            DatabaseController.saveUsed = sinon.stub();

            HashCash.checkSolution = sinon.stub();

            ProofOfWorkProxyquired = proxyquire(ProofOfWorkPath, {
                './services/HashCash': HashCash,
                './services/TokenService': {
                    init: function () {
                        return TokenService;
                    },
                },
                './database/DatabaseController': {
                    init: function () {
                        return DatabaseController;
                    },
                },
            });
        });

        it('When corrupt self-generated token provided, should throw InvalidToken error', async function () {
            const validationError = {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid token format',
            };
            TokenService.decodeSelfGeneratedToken.throws(validationError);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES, PAYLOAD), validationError);

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
        });

        it('When self-generated tokens not allowed, should throw SelfGeneratedNotAllowed error', async function () {
            const config = { ...CONFIG };
            config.allowSelfGenerated = false;
            const ProofOfWork = ProofOfWorkProxyquired.init(config, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES, PAYLOAD), {
                name: 'PowValidationError',
                type: 'SelfGeneratedNotAllowed',
                message: 'SelfGenerated Token not allowed',
            });

            sinon.assert.notCalled(TokenService.decodeSelfGeneratedToken);
            sinon.assert.notCalled(TokenService.decodeServerToken);
        });

        it('When corrupt server token provided, should throw InvalidToken error', async function () {
            const validationError = {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Token corrupted',
            };
            TokenService.decodeServerToken.throws(validationError);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SERVER_CHALLENGE, POW_NONCES, PAYLOAD), validationError);

            sinon.assert.calledOnceWithExactly(TokenService.decodeServerToken, POW_SERVER_CHALLENGE);
        });

        it('When invalid token provided, should throw InvalidToken error', async function () {
            const validationError = {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid user identifier',
            };
            const decodedToken = {
                challengeId: CHALLENGE_ID,
            };
            TokenService.decodeServerToken.returns(decodedToken);
            TokenService.validateServerToken.throws(validationError);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SERVER_CHALLENGE, POW_NONCES, PAYLOAD), validationError);

            sinon.assert.calledOnceWithExactly(TokenService.decodeServerToken, POW_SERVER_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateServerToken, decodedToken, HASHED_USER_IDENTIFIER);
            sinon.assert.callOrder(
                TokenService.decodeServerToken,
                TokenService.validateServerToken,
            );
        });

        it('When invalid incomplete solution, should throw InvalidSolution error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
            };
            TokenService.decodeServerToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: false, reason: '-' });
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SERVER_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'InvalidSolution',
                message: 'Invalid solution: -',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeServerToken, POW_SERVER_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateServerToken, decodedToken, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SERVER_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.callOrder(
                TokenService.decodeServerToken,
                TokenService.validateServerToken,
                HashCash.checkSolution,
            );
        });

        it('When self generated limit is reached, should throw SelfGeneratedLimitReached error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(10);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'SelfGeneratedLimitReached',
                message: 'SelfGenerated challenges limit reached',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserSelfGeneratedCount,
            );
        });

        it('When incomplete solutions for user limit is reached, should throw IncompleteUserLimitReached error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(10);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'IncompleteUserLimitReached',
                message: 'Incomplete solutions limit reached for user',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
            );
        });

        it('When total incomplete solutions limit is reached, should throw IncompleteLimitReached error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(0);
            DatabaseController.getTotalIncompleteCount.returns(10);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'IncompleteLimitReached',
                message: 'Incomplete solutions limit reached',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
            );
        });

        it('When challenge was alreay used, should throw ChallengeAlreadyUsed error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
            };
            const usedChallenge = {
                challengeId: CHALLENGE_ID,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(0);
            DatabaseController.getTotalIncompleteCount.returns(0);
            DatabaseController.getUsed.returns(usedChallenge);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'ChallengeAlreadyUsed',
                message: 'Challenge already used!',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveIncomplete, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUsed, decodedToken.challengeId);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
                DatabaseController.saveIncomplete,
                DatabaseController.getUsed,
            );
        });

        it('When all checks pass, should return solution data', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
                hasInvalidTimestamp: false,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(0);
            DatabaseController.getTotalIncompleteCount.returns(0);
            DatabaseController.getUsed.returns(null);
            DatabaseController.saveUsed.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.checkPowSolution(
                USER_IDENTIFIER,
                POW_SELF_GENERATED_CHALLENGE,
                POW_NONCES_INCOMPLETE,
                PAYLOAD,
            );

            assert.deepStrictEqual(result, {
                hasInvalidTimestamp: false,
                allowIncomplete: true,
                allowSelfGenerated: true,
                isValid: true,
                isIncomplete: true,
                selfGenerated: decodedToken.selfGenerated,
                createdOn: decodedToken.createdOn,
                difficulty: decodedToken.difficulty,
                complexity: decodedToken.complexity,
            });
            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveIncomplete, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUsed, decodedToken.challengeId);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveUsed, decodedToken.challengeId);
            sinon.assert.notCalled(DatabaseController.getInvalidTimestampChallenge);
            sinon.assert.notCalled(DatabaseController.saveInvalidTimestampChallenge);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
                DatabaseController.saveIncomplete,
                DatabaseController.getUsed,
                DatabaseController.saveUsed,
            );
        });

        it('When a challenge with invalid timestamp was alreay used, should throw ChallengeAlreadyUsed error', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
                hasInvalidTimestamp: true,
            };
            const usedChallenge = {
                challengeId: CHALLENGE_ID,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(0);
            DatabaseController.getTotalIncompleteCount.returns(0);
            DatabaseController.getInvalidTimestampChallenge.resolves(usedChallenge);
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            await assert.rejects(ProofOfWork.checkPowSolution(USER_IDENTIFIER, POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, PAYLOAD), {
                name: 'PowValidationError',
                type: 'ChallengeAlreadyUsed',
                message: 'Challenge already used!',
            });

            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveIncomplete, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getInvalidTimestampChallenge, decodedToken.challengeId);
            sinon.assert.notCalled(DatabaseController.saveInvalidTimestampChallenge);
            sinon.assert.notCalled(DatabaseController.getUsed);
            sinon.assert.notCalled(DatabaseController.saveUsed);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
                DatabaseController.getInvalidTimestampChallenge,
            );
        });

        it('When all checks pass for a selfGenerated pow with invalid timestamp, should return solution data', async function () {
            const decodedToken = {
                challengeId: CHALLENGE_ID,
                difficulty: 2,
                complexity: 10,
                selfGenerated: true,
                hasInvalidTimestamp: true,
            };
            TokenService.decodeSelfGeneratedToken.returns(decodedToken);
            TokenService.validateServerToken.resolves();
            HashCash.checkSolution.returns({ isValid: true });
            DatabaseController.getUserSelfGeneratedCount.returns(0);
            DatabaseController.getUserIncompleteCount.returns(0);
            DatabaseController.getTotalIncompleteCount.returns(0);
            DatabaseController.getInvalidTimestampChallenge.resolves(null);
            DatabaseController.saveInvalidTimestampChallenge.resolves();
            DatabaseController.getUsed.resolves(null);
            DatabaseController.saveUsed.resolves();
            const ProofOfWork = ProofOfWorkProxyquired.init(CONFIG, '-', {});

            const result = await ProofOfWork.checkPowSolution(
                USER_IDENTIFIER,
                POW_SELF_GENERATED_CHALLENGE,
                POW_NONCES_INCOMPLETE,
                PAYLOAD,
            );

            assert.deepStrictEqual(result, {
                hasInvalidTimestamp: true,
                allowIncomplete: true,
                allowSelfGenerated: true,
                isValid: true,
                isIncomplete: true,
                selfGenerated: decodedToken.selfGenerated,
                createdOn: decodedToken.createdOn,
                difficulty: decodedToken.difficulty,
                complexity: decodedToken.complexity,
            });
            sinon.assert.calledOnceWithExactly(TokenService.decodeSelfGeneratedToken, POW_SELF_GENERATED_CHALLENGE);
            sinon.assert.calledOnceWithExactly(TokenService.validateSelfGeneratedToken, decodedToken, PAYLOAD);
            sinon.assert.calledOnceWithExactly(HashCash.checkSolution,
                POW_SELF_GENERATED_CHALLENGE, POW_NONCES_INCOMPLETE, decodedToken.difficulty, POW_NONCES_INCOMPLETE.length);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserSelfGeneratedCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveSelfGenerated, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getUserIncompleteCount, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getTotalIncompleteCount);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveIncomplete, HASHED_USER_IDENTIFIER);
            sinon.assert.calledOnceWithExactly(DatabaseController.getInvalidTimestampChallenge, decodedToken.challengeId);
            sinon.assert.calledOnceWithExactly(DatabaseController.saveInvalidTimestampChallenge, decodedToken.challengeId);
            sinon.assert.notCalled(DatabaseController.getUsed);
            sinon.assert.notCalled(DatabaseController.saveUsed);
            sinon.assert.callOrder(
                TokenService.decodeSelfGeneratedToken,
                TokenService.validateSelfGeneratedToken,
                HashCash.checkSolution,
                DatabaseController.getUserIncompleteCount,
                DatabaseController.getTotalIncompleteCount,
                DatabaseController.getUserSelfGeneratedCount,
                DatabaseController.saveSelfGenerated,
                DatabaseController.getInvalidTimestampChallenge,
                DatabaseController.saveInvalidTimestampChallenge,
            );
        });
    });
});
