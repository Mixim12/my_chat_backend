# **Login Proof of Work**

## About
This library implements "Proof of Work" mechanism to be used for services access control

## Docs
* [Login ProofOfWork](https://bitdefender.atlassian.net/wiki/spaces/CONNECT/pages/1143873503/Login+ProofOfWork)
* [Proof of work sign in flow](https://bitdefender.atlassian.net/wiki/spaces/CONNECT/pages/1143873848/Proof+of+work+sign+in+flow)

## Initialization and Configuration

### Library initialization:
```
const factory = require('@repobit/login-proof-of-work');
const ProofOfWork = factory.init(configObject, jwtSecret, dbConnection);
```

### Configuration object and default values:
```
{
    "minDifficulty": 2,
    "maxDifficulty": 4,
    "difficultyStep": 2,
    "minComplexity": 100,
    "maxComplexity": 300,
    "complexityStep": 25,
    "difficultyResetPeriod": 86400000,
    "difficultyDecreasePeriod": 3600000,
    "challengeExpireAfter": 180000,
    "maximumIncompleteSolutions": 1000,
    "maximumUserIncompleteSolutions": 10,
    "maximumUserSelfGenerated": 10,
    "incompleteDeleteAfter": 86400000,
    "selfGeneratedDeleteAfter": 86400000,
    "invalidTimestampChallengesDeleteAfter": 86400000,
    "allowIncomplete": true,
    "allowSelfGenerated": true
}
```

If any of the configuration fields are missing on initialization, the respective default value will be used

### The JWT challenges are signed using the provided jwtSecret key
If the secret key is missing on initialization, the JWT will be signed with a default value ( not secure )

### The "dbConnection" is an initialised/connected Mongo DB client
On initialization, it will create the following DB collections and create the required indexes for them:

```
"pow_generated" - TTL given by the "challengeExpireAfter" config property
"pow_used" -  TTL given by the "difficultyResetPeriod" config property
"pow_invalid_timestamp_challenges" - TTL given by the "invalidTimestampChallengesDeleteAfter" config property
"pow_self_generated" - TTL given by the "selfGeneratedDeleteAfter" config property
"pow_incomplete" - TTL given by the "incompleteDeleteAfter" config property
```

__DB Collections descriptions:__

- __pow_generated__ - collection of generated pow challenges; it is used to calculate the overall difficulty when generating a new challenge for a given user; 'complexity', 'difficulty', 'userIdentifier' and 'expiresOn' are stored
- __pow_used__ - collection of used / resolved challenges; it is used to make sure a challenge was not already given as solution; only 'challengeId' is stored
- __pow_invalid_timestamp_challenges__ - collection to keep track of challenges resolved by users that had issues with their system's DateTime; only 'challengeId' is stored
- __pow_self_generated__ - collection to keep track of self-generated challenges solutions for users; only 'userIndentifier' is stored
- __pow_incomplete__ - collection to keep track of incomplete challenges solutions for users; only 'userIndentifier' is stored

## Library usage

### Generate PoW challenge for a given user based on request headers

```
# generate PoW challenge for user based on IP and UserAgent
const ip = req.headers['x-forwarded-for'];
const ua = req.headers['user-agent'];
const userIdentifier = `${ip}|||||${ua}`;

const pow = await ProofOfWork.generatePowChallenge(userIdentifier, { source: 'global' });
```

### Verify PoW solution

```
// verify PoW solution provided in the request body
const ip = req.headers['x-forwarded-for'];
const ua = req.headers['user-agent'];
const userIdentifier = `${ip}|||||${ua}`;

const powChallenge = req.body.pow_challenge;
const powNonces = req.body.pow_solution;
const payload = req.body.pow_payload; // optional; value used for self-generated pow; ex: user email

try {
    const solution = await ProofOfWork.checkPowSolution(userIdentifier, powChallenge, powNonces, payload);
} catch (powError) {
    if (powError.name === 'PowValidationError') {
        // handle PoW validation error
    } else {
        // powError.name === 'PowInternalError' 
        // handle internal error ( ex: database error )
    }
}
```

### Possible errors thrown by 'checkPowSolution'

There are 2 Error Classes implemented, each with multiple sub-types:

__1. PowValidationError__ : 

__SelfGeneratedNotAllowed__
- powError.type : 'SelfGeneratedNotAllowed'
- powError.name : 'PowValidationError'
- powError.message : 'SelfGenerated Token not allowed'
- reason : Self generated PoWs not allowed by config.allowSelfGenerated

__SelfGeneratedLimitReached__
- powError.type : 'SelfGeneratedLimitReached'
- powError.name : 'PowValidationError'
- powError.message : 'SelfGenerated challenges limit reached'
- reason : the user reached the limit set in config.maximumUserSelfGenerated

__IncompleteUserLimitReached__
- powError.type : 'IncompleteUserLimitReached'
- powError.name : 'PowValidationError'
- powError.message : 'Incomplete solutions limit reached for user'
- powError.extra : the challengeData - cand be returned back to user in order to find the complete solution for it
- reason : the user reached the limit set in config.maximumUserIncompleteSolutions

__IncompleteLimitReached__
- powError.type : 'IncompleteLimitReached'
- powError.name : 'PowValidationError'
- powError.message : 'Incomplete solutions limit reached'
- powError.extra : the challengeData - cand be returned back to user in order to find the complete solution for it
- reason : reached the limit set in config.maximumIncompleteSolutions ( for all users )

__ChallengeAlreadyUsed__
- powError.type : 'ChallengeAlreadyUsed'
- powError.name : 'PowValidationError'
- powError.message : 'Challenge already used!'
- reason : the challenge solution was already used / resolved

__InvalidSolution__
- powError.type : 'InvalidSolution'
- powError.name : 'PowValidationError'
- powError.message : 'Invalid solution: <reason>'
- reason : the provided solution was not correct, where '<reason>' is one of: 'Incorrect nonces number' or 'Incorrect nonces'

__2 PowInternalError__ : 

__DatabaseError__ 
- powError.type : 'DatabaseError'
- powError.name : 'PowInternalError'
- powError.message : The message of the thrown database error
- powError.extra : The database error that was thrown
- reason : an error was thrown when running a database operation

__ExecutionTimeExceeded__ 
- powError.type : 'ExecutionTimeExceeded'
- powError.name : 'PowInternalError'
- powError.message : 'Error solving PoW challenge: Max execution time exceceded'
- reason : Checking the HashCash pow solution took more than 2 minutes. Hardcoded limit added as extra precaution - this should not be triggered in normal circumstances.

# Changelog #
- 0.1.1
    - updated JWT claims to match the standard (3-letter naming)
- 0.0.2
    - Readme updates