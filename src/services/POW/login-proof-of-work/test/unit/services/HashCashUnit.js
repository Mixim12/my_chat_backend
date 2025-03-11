const assert = require('assert');
const sinon = require('sinon');

const HashCash = require('./../../../src/services/HashCash');

describe('HashCash', function () {
    const POW_CHALLENGE = 'asd11423asd.2vsesfr2.hrtdffea';
    const SOLUTION_NONCES = [6, 1, 6, 3, 2, 7, 3, 6, 1, 2];
    const DIFFICULTY = 2;
    const COMPLEXITY = 10;

    describe('checkSolution (challenge, nonces, difficulty, complexity)', function () {
        it('When solution is valid, should return isValid as true', async function () {
            const result = HashCash.checkSolution(POW_CHALLENGE, SOLUTION_NONCES, DIFFICULTY, COMPLEXITY);

            assert.deepStrictEqual(result, {
                isValid: true,
            });
        });

        it('When solution length is not equal to the complexity, should return isValid as false and reason as "Incorrect nonces number"', async function () {
            const result = HashCash.checkSolution(POW_CHALLENGE, [], DIFFICULTY, COMPLEXITY);

            assert.deepStrictEqual(result, {
                isValid: false,
                reason: 'Incorrect nonces number',
            });
        });

        it('When solution is NOT valid, should return isValid as false and reason as "Incorrect nonces"', async function () {
            const result = HashCash.checkSolution(POW_CHALLENGE, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], DIFFICULTY, COMPLEXITY);

            assert.deepStrictEqual(result, {
                isValid: false,
                reason: 'Incorrect nonces',
            });
        });
    });

    describe('solve (powChallenge, difficulty, complexity)', function () {
        it('Should find soluion and return it', async function () {
            const result = HashCash.solve(POW_CHALLENGE, DIFFICULTY, COMPLEXITY);

            sinon.assert.match(result, {
                executionTime: sinon.match.number,
                nonce: SOLUTION_NONCES,
            });
        });
    });
});
