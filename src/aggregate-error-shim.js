class AggregateError extends Error {
  constructor(errors, message) {
    super(message || "AggregateError");
    this.name = "AggregateError";
    this.errors = Array.from(errors || []);
  }
}
module.exports = AggregateError;
module.exports.default = AggregateError;
