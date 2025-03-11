const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const TokenServicePath = './../../../src/services/TokenService';
const TokenServiceFactory = require(TokenServicePath);

describe('TokenService', function () {
    let clock = null;

    const CURRENT_TIMESTAMP = 1661930700000;
    const IP = '::ffff:127.0.0.1';
    const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0';
    const COOKIE_VALUE = 'adf1faefdaf9e9d0bc6795bbd81a6a19fed70482';
    const USER_IDENTIFIER = `${IP}|||||${USER_AGENT}|||||${COOKIE_VALUE}`;
    const SOURCE = 'test-source-chl';
    const JWT_SECRET = 'test-jwt-secret-key';
    const CONFIG = {
        minDifficulty: 2,
        minComplexity: 100,
        challengeExpireAfter: 180000,
    };
    const SERVER_CHALLENGE_ID = '4524830a-9781-4239-8b41-d9bfb943a22e';
    const TEST_DIFFICULTY = 2;
    const TEST_COMPLEXITY = 200;

    const POW_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFsbGVuZ2VJZCI6IjQ1MjQ4MzBhLTk3ODEt' +
        'NDIzOS04YjQxLWQ5YmZiOTQzYTIyZSIsInVzZXJJZGVudGlmaWVyIjoiOjpmZmZmOjEyNy4wLjAuMXx8fHx8TW96aWxsYS81LjA' +
        'gKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTAuMTU7IHJ2OjEwMi4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEwMi4wfH' +
        'x8fHxhZGYxZmFlZmRhZjllOWQwYmM2Nzk1YmJkODFhNmExOWZlZDcwNDgyIiwiZGlmZmljdWx0eSI6MiwiY29tcGxleGl0eSI6M' +
        'jAwLCJjcmVhdGVkT24iOjE2NjE5MzA3MDA3MjQsImV4cGlyZXNPbiI6MTY2MTkzMDg4MDcyNCwiaWF0IjoxNjYxOTMwNzU5fQ.B' +
        'Ac1y4z7JkzVL6GpLgvJEeuBsZHIP4SHIAMpVqkL1Vc';
    const POW_TOKEN_DATA = {
        chl: SERVER_CHALLENGE_ID,
        idf: USER_IDENTIFIER,
        dif: TEST_DIFFICULTY,
        cpx: TEST_COMPLEXITY,
        iat: CURRENT_TIMESTAMP / 1000,
        exp: (CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter) / 1000,
        src: SOURCE,
    };

    const RAND = 'cv33Z';
    const PAYLOAD = 'test@bitdefender.com';
    const ENCODED_PAYLOAD = '%22test%40bitdefender.com%22';
    const POW_SELF_GENERATED_TOKEN = `${CONFIG.minDifficulty}:${CONFIG.minComplexity}:${CURRENT_TIMESTAMP}:${ENCODED_PAYLOAD}:${RAND}`;
    const SELF_GENERATED_CHALLENGE_ID = 'b00d017926275a1c3aa6c7e4634631082e3abe00';

    this.beforeEach(function () {
        clock = sinon.useFakeTimers(new Date(CURRENT_TIMESTAMP));
    });

    this.afterEach(function () {
        clock.restore();
    });

    describe('init (configuration, secret)', function () {
        it('Should set the config and jwtSecret and return the TokenService obj', function () {
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.equal(typeof TokenService.init, 'function');
            assert.equal(typeof TokenService.generateChallengeAndToken, 'function');
            assert.equal(typeof TokenService.decodeServerToken, 'function');
            assert.equal(typeof TokenService.decodeSelfGeneratedToken, 'function');
            assert.equal(typeof TokenService.validateServerToken, 'function');
            assert.equal(typeof TokenService.validateSelfGeneratedToken, 'function');
        });
    });

    describe('generateChallengeAndToken (userIdentifier, difficulty, complexity)', function () {
        it('Should generate a jwt token and return it along the challengeData', function () {
            const randomUUID = sinon.stub().returns(SERVER_CHALLENGE_ID);
            const jwtSign = sinon.stub().returns(POW_JWT_TOKEN);
            const TokenServiceProxyquired = proxyquire(TokenServicePath, {
                jsonwebtoken: {
                    sign: jwtSign,
                },
                crypto: {
                    randomUUID,
                },
            });
            const TokenService = TokenServiceProxyquired.init(CONFIG, JWT_SECRET);

            const result = TokenService.generateChallengeAndToken(USER_IDENTIFIER, TEST_DIFFICULTY, TEST_COMPLEXITY);

            sinon.assert.calledOnce(randomUUID);
            assert.deepStrictEqual(result, {
                powToken: POW_JWT_TOKEN,
                challengeData: {
                    challengeId: SERVER_CHALLENGE_ID,
                    userIdentifier: USER_IDENTIFIER,
                    difficulty: TEST_DIFFICULTY,
                    complexity: TEST_COMPLEXITY,
                    createdOn: CURRENT_TIMESTAMP,
                    expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                    source: undefined,
                },
            });
        });
    });

    describe('decodeServerToken (token)', function () {
        it('When server generated token is valid, should return the decoded information', function () {
            const jwtVerify = sinon.stub().returns(POW_TOKEN_DATA);
            const TokenServiceProxyquired = proxyquire(TokenServicePath, {
                jsonwebtoken: {
                    verify: jwtVerify,
                },
            });
            const TokenService = TokenServiceProxyquired.init(CONFIG, JWT_SECRET);

            const result = TokenService.decodeServerToken(POW_JWT_TOKEN);

            assert.deepStrictEqual(result, {
                challengeId: SERVER_CHALLENGE_ID,
                userIdentifier: USER_IDENTIFIER,
                difficulty: TEST_DIFFICULTY,
                complexity: TEST_COMPLEXITY,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: false,
                hasInvalidTimestamp: false,
                source: SOURCE,
            });
        });

        it('When the provded token is corrupted, should throw InvalidToken error', function () {
            const invalidToken = '123455678';
            const jwtError = new Error('jwt malformed');
            const jwtVerify = sinon.stub().throws(jwtError);
            const TokenServiceProxyquired = proxyquire(TokenServicePath, {
                jsonwebtoken: {
                    verify: jwtVerify,
                },
            });
            const TokenService = TokenServiceProxyquired.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.decodeServerToken(invalidToken), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Token corrupted',
            });
        });

        it('When the provded token is missing data, should throw InvalidToken error', function () {
            const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFsbGVuZ2VJZCI6IjQ1MjQ4MzBhLTk' +
                '3ODEtNDIzOS04YjQxLWQ5YmZiOTQzYTIyZSIsImRpZmZpY3VsdHkiOjIsImNvbXBsZXhpdHkiOjIwMCwiY3JlYXRl' +
                'ZE9uIjoxNjQwOTk1MjAwMDAwLCJleHBpcmVzT24iOjE2NDA5OTUyMDM2MDAsImlhdCI6MTY0MDk5NTIwMH0.-wjPw' +
                'J83rlqAy7TP9sZ-oFvEOX-VhSCLhzVY-ibHp1A';
            const invalidTokenData = {
                difficulty: TEST_DIFFICULTY,
                complexity: TEST_COMPLEXITY,
            };
            const jwtVerify = sinon.stub().returns(invalidTokenData);
            const TokenServiceProxyquired = proxyquire(TokenServicePath, {
                jsonwebtoken: {
                    verify: jwtVerify,
                },
            });
            const TokenService = TokenServiceProxyquired.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.decodeServerToken(invalidToken), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid token data',
            });
        });
    });

    describe('decodeSelfGeneratedToken (token)', function () {
        it('When self generated token is valid, should return the decoded information', function () {
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            const result = TokenService.decodeSelfGeneratedToken(POW_SELF_GENERATED_TOKEN);

            assert.deepStrictEqual(result, {
                challengeId: SELF_GENERATED_CHALLENGE_ID,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                random: RAND,
                payload: ENCODED_PAYLOAD,
                selfGenerated: true,
                hasInvalidTimestamp: false,
            });
        });

        it('When self generated token is valid but with invalid timestamp, should return the decoded information with hasInvalidTimestamp flag true', function () {
            const invalidTimestamp = CURRENT_TIMESTAMP - 100000;
            const powInvalidTimestampToken = `${CONFIG.minDifficulty}:${CONFIG.minComplexity}:${invalidTimestamp}:${ENCODED_PAYLOAD}:${RAND}`;
            const expectedChallengeId = '8d5c45c3500f752531af30b9399e6244fb86be27';
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            const result = TokenService.decodeSelfGeneratedToken(powInvalidTimestampToken);

            assert.deepStrictEqual(result, {
                challengeId: expectedChallengeId,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                createdOn: invalidTimestamp,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                random: RAND,
                payload: ENCODED_PAYLOAD,
                selfGenerated: true,
                hasInvalidTimestamp: true,
            });
        });

        it('When the provded token format is not correct, should throw InvalidToken error', function () {
            const invalidToken = '1234:55678';
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.decodeSelfGeneratedToken(invalidToken), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid token format',
            });
        });
    });

    describe('validateServerToken (decoded, userIdentifier)', function () {
        it('When server token data is valid, should return true', function () {
            const decodedToken = {
                challengeId: SERVER_CHALLENGE_ID,
                difficulty: TEST_DIFFICULTY,
                complexity: TEST_COMPLEXITY,
                userIdentifier: USER_IDENTIFIER,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: false,
                hasInvalidTimestamp: false,
            };
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            const result = TokenService.validateServerToken(decodedToken, USER_IDENTIFIER);

            assert.deepStrictEqual(result, undefined);
        });

        it('When the token created timestamp is too old, should throw InvalidToken error', function () {
            const decodedToken = {
                challengeId: SERVER_CHALLENGE_ID,
                difficulty: TEST_DIFFICULTY,
                complexity: TEST_COMPLEXITY,
                userIdentifier: USER_IDENTIFIER,
                createdOn: CURRENT_TIMESTAMP - 1000000,
                expiresOn: CURRENT_TIMESTAMP - 1000000 + CONFIG.challengeExpireAfter,
                selfGenerated: false,
                hasInvalidTimestamp: false,
            };
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.validateServerToken(decodedToken, USER_IDENTIFIER), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Token expired',
            });
        });

        it('When the token userIdentifier does not match the provided one, should throw InvalidToken error', function () {
            const decodedToken = {
                challengeId: SERVER_CHALLENGE_ID,
                difficulty: TEST_DIFFICULTY,
                complexity: TEST_COMPLEXITY,
                userIdentifier: USER_IDENTIFIER,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: false,
                hasInvalidTimestamp: false,
            };
            const invalidInput = 'invalid';
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.validateServerToken(decodedToken, invalidInput), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid user identifier',
            });
        });
    });

    describe('validateSelfGeneratedToken (decoded, payload)', function () {
        it('When server token data is valid, should return true', function () {
            const decodedToken = {
                challengeId: SELF_GENERATED_CHALLENGE_ID,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                payload: ENCODED_PAYLOAD,
                random: RAND,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: true,
                hasInvalidTimestamp: false,
            };
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            const result = TokenService.validateSelfGeneratedToken(decodedToken, PAYLOAD);

            assert.deepStrictEqual(result, undefined);
        });

        it('When the token payload does not match the provided one, should throw InvalidToken error', function () {
            const decodedToken = {
                challengeId: SELF_GENERATED_CHALLENGE_ID,
                difficulty: CONFIG.minDifficulty,
                complexity: CONFIG.minComplexity,
                payload: ENCODED_PAYLOAD,
                random: RAND,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: true,
                hasInvalidTimestamp: false,
            };
            const invalidPayload = 'invalid@payload.com';
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.validateSelfGeneratedToken(decodedToken, invalidPayload), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid payload',
            });
        });

        it('When the dificulty or complexity are smaller that the server minimum, should throw InvalidToken error', function () {
            const decodedToken = {
                challengeId: SELF_GENERATED_CHALLENGE_ID,
                difficulty: 1,
                complexity: CONFIG.minComplexity,
                payload: ENCODED_PAYLOAD,
                random: RAND,
                createdOn: CURRENT_TIMESTAMP,
                expiresOn: CURRENT_TIMESTAMP + CONFIG.challengeExpireAfter,
                selfGenerated: true,
                hasInvalidTimestamp: false,
            };
            const TokenService = TokenServiceFactory.init(CONFIG, JWT_SECRET);

            assert.throws(() => TokenService.validateSelfGeneratedToken(decodedToken, PAYLOAD), {
                name: 'PowValidationError',
                type: 'InvalidToken',
                message: 'Invalid token data',
            });
        });
    });
});
