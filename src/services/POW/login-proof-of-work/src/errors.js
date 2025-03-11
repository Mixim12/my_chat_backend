class PowError extends Error {
    constructor (type, message, data) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);

        this.type = type;
        this.data = data;
    }
}

class PowValidationError extends PowError {
    constructor (type, message, data) {
        super(type, message, { ...data });
    }
}

class PowInternalError extends PowError {
    constructor (type, error) {
        super(type, error.message, { error });
    }
}

module.exports = {
    PowError,
    PowValidationError,
    PowInternalError,
};
