const isProduction = process.env.NODE_ENV === 'production';

const logger = {
  info: (...args) => {
    if (!isProduction) {
      console.log('[INFO]', ...args);
    }
  },
  debug: (...args) => {
    if (!isProduction) {
      console.log('[DEBUG]', ...args);
    }
  },
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },
};

module.exports = logger;
