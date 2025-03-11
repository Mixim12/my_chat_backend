const crypto = require('crypto');

module.exports.isDefined = function isDefined (data) {
    return (typeof data !== 'undefined' && data !== null);
};

module.exports.isSelfGeneratedToken = function isSelfGeneratedToken (token) {
    return typeof token === 'string' && token.indexOf(':') > 0;
};

module.exports.hashString = function hashString (string, algo) {
    const algorithm = algo || 'sha1';
    return crypto.createHash(algorithm).update(string).digest('hex');
};
