function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.statusCode || 500;
  const message = status === 500 ? 'Something went wrong on the server.' : err.message;
  res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
