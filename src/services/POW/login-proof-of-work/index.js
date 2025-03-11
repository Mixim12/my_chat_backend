const ProofOfWork = require('./src/ProofOfWork');

const self = {};

self.init = function init (config, jwtSecret, dbConnection) {
    return ProofOfWork.init(config, jwtSecret, dbConnection);
};

module.exports = self;
