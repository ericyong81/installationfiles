const express = require('express');
const path = require('path');
const logger = require('./logger');
require('dotenv').config();
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const getOpenPosition = require('./scripts/getOpenPosition.js');
const getOrderHistory = require('./scripts/getOrderHistory.js');
const db = require('./database.js');
const { Worker } = require('worker_threads');
const fs = require('fs');
const { exec } = require('child_process');


const app = express();
const port = 3000;

app.disable('x-powered-by'); // Disable X-Powered-By header
app.set('etag', false); // Disable Etag header

app.set('trust proxy', 1); // Trust Nginx as a proxy

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }), // Store sessions in sessions.db
  cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' } // Set secure to true in production for HTTPS, add sameSite
}));
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.use(express.static(path.join(__dirname)));

const activeWorkers = new Set();

function spawnWorker(scriptPath, data) {
    const workerKey = `${data.algoName || 'default'}-${data.type}`;

    if (activeWorkers.has(workerKey)) {
        logger.debug(`Worker for ${workerKey} is already active. Skipping.`);
        return Promise.resolve('Worker already active');
    }

    activeWorkers.add(workerKey);

    return new Promise((resolve, reject) => {
        const worker = new Worker(scriptPath, { workerData: data });

        worker.on('message', (message) => {
            logger.debug(`Worker finished with message: ${message}`);
            activeWorkers.delete(workerKey);
            resolve(message);
        });

        worker.on('error', (error) => {
            logger.error(`Worker error: ${error}`);
            activeWorkers.delete(workerKey);
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(`Worker exited with code ${code}`);
                activeWorkers.delete(workerKey);
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

// Middleware to check for API key authentication in the request body
function isApiKeyAuthenticated(req, res, next) {
  const apiKey = req.body.api_key; // Get API key from request body

  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(401).json({ message: 'Unauthorized: Invalid API Key' });
  }

  // Remove the API key from the body before proceeding
  delete req.body.api_key;
  next();
}

function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

app.post('/register', async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false' || process.env.ALLOW_REGISTRATION === '0') {
    return res.status(403).json({ message: 'User registration is currently disabled.' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ message: 'User already exists.' });
        }
        logger.error('Error registering user:', err);
        return res.status(500).json({ message: 'Error registering user.' });
      }
      res.status(201).json({ message: 'User registered successfully.' });
    });
  } catch (error) {
    logger.error('Error hashing password:', error);
    res.status(500).json({ message: 'Error registering user.' });
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      logger.error('Error fetching user:', err);
      return res.status(500).json({ message: 'Error logging in.' });
    }
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.userId = user.id;
      res.json({ message: 'Logged in successfully.' });
    } else {
      res.status(400).json({ message: 'Invalid credentials.' });
    }
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      logger.error('Error destroying session:', err);
      return res.status(500).json({ message: 'Error logging out.' });
    }
    res.json({ message: 'Logged out successfully.' });
  });
});

app.post('/register', async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false' || process.env.ALLOW_REGISTRATION === '0') {
    return res.status(403).json({ message: 'User registration is currently disabled.' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ message: 'User already exists.' });
        }
        logger.error('Error registering user:', err);
        return res.status(500).json({ message: 'Error registering user.' });
      }
      res.status(201).json({ message: 'User registered successfully.' });
    });
  } catch (error) {
    logger.error('Error hashing password:', error);
    res.status(500).json({ message: 'Error registering user.' });
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      logger.error('Error fetching user:', err);
      return res.status(500).json({ message: 'Error logging in.' });
    }
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.userId = user.id;
      logger.info('User logged in. Session ID:', req.session.id, 'User ID:', req.session.userId);
      res.json({ message: 'Logged in successfully.' });
    } else {
      res.status(400).json({ message: 'Invalid credentials.' });
    }
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      logger.error('Error destroying session:', err);
      return res.status(500).json({ message: 'Error logging out.' });
    }
    res.json({ message: 'Logged out successfully.' });
  });
});

app.post('/signal', isApiKeyAuthenticated, async (req, res) => {
    const webhookData = req.body;
    logger.debug('Received webhook:', webhookData);
    if (webhookData.type === '-1' || webhookData.type === '1') {
        logger.debug('Spawning worker for entry action...');
        await spawnWorker('./scripts/marketentry_worker.js', webhookData);
    }
    if (webhookData.type === '0') {
        logger.debug('Spawning worker for exit action...');
        await spawnWorker('./scripts/marketexit_worker.js', webhookData);
    }

    res.status(200).json({ message: 'Webhook processed successfully!' });
});

app.get('/api/open-positions', isAuthenticated, async (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    const openPositions = await getOpenPosition(config);
    res.json(openPositions);
  } catch (error) {
    logger.error('Error getting open positions:', error);
    res.status(500).json({ error: 'Failed to get open positions' });
  }
});

app.get('/api/order-history', isAuthenticated, (req, res) => {
  const { date, limit = 10, offset = 0 } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];

  if (date) {
    query += ' WHERE DATE(createdTime) = ?';
    params.push(date);
  }

  query += ' ORDER BY createdTime DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(query, params, (err, rows) => {
    if (err) {
      logger.error('Error getting order history:', err);
      res.status(500).json({ error: 'Failed to get order history' });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/order-history/count', isAuthenticated, (req, res) => {
  const { date } = req.query;
  let query = 'SELECT COUNT(*) as count FROM orders';
  const params = [];

  if (date) {
    query += ' WHERE DATE(createdTime) = ?';
    params.push(date);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      logger.error('Error getting order history count:', err);
      res.status(500).json({ error: 'Failed to get order history count' });
      return;
    }
    res.json({ count: row.count });
  });
});

app.get('/api/realized-trades', isAuthenticated, (req, res) => {
  const { date, limit = 10, offset = 0 } = req.query;
  let query = 'SELECT * FROM realized_trades';
  const params = [];

  if (date) {
    query += ' WHERE DATE(createdAt) = ?';
    params.push(date);
  }

  query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(query, params, (err, rows) => {
    if (err) {
      logger.error('Error getting realized trades:', err);
      res.status(500).json({ error: 'Failed to get realized trades' });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/realized-trades/count', isAuthenticated, (req, res) => {
  const { date } = req.query;
  let query = 'SELECT COUNT(*) as count FROM realized_trades';
  const params = [];

  if (date) {
    query += ' WHERE DATE(createdAt) = ?';
    params.push(date);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      logger.error('Error getting realized trades count:', err);
      res.status(500).json({ error: 'Failed to get realized trades count' });
      return;
    }
    res.json({ count: row.count });
  });
});

async function fetchOrderHistory() {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    const orders = await getOrderHistory(config);

    if (orders && Array.isArray(orders) && orders.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO orders (
          orderId, symbol, side, orderType, quantity, price, status, createdTime, tradeId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      orders.forEach(order => {
        stmt.run(
          order.OrderId,
          order.SeriesTradeCode,
          order.BuySell === 1 ? 'BUY' : 'SELL',
          order.OrderTypeDesc,
          order.FilledQuantity,
          order.AveragePrice,
          order.OrderStatusDesc,
          order.OrderSubmissionDt,
          order.TradeId
        );
      });
      stmt.finalize();
    }
  } catch (error) {
    logger.error('Error fetching and saving order history:', error);
  }
}

function scheduleOrderHistoryFetch() {
  fetchOrderHistory();
  setTimeout(scheduleOrderHistoryFetch, 2 * 60 * 1000); // Check every 2 minutes
}

app.get('/api/autoshutoff/status', isAuthenticated, (req, res) => {
  const controlFilePath = path.join(__dirname, 'autoshutoff.control');
  const isEnabled = fs.existsSync(controlFilePath);
  res.json({ enabled: isEnabled });
});

app.post('/api/autoshutoff/toggle', isAuthenticated, (req, res) => {
  const { enabled } = req.body;
  const controlFilePath = path.join(__dirname, 'autoshutoff.control');

  try {
    if (enabled) {
      fs.writeFileSync(controlFilePath, 'enabled');
      logger.info('Autoshutoff enabled.');
    } else {
      if (fs.existsSync(controlFilePath)) {
        fs.unlinkSync(controlFilePath);
        logger.info('Autoshutoff disabled.');
      } else {
        logger.info('Autoshutoff control file not found, already disabled or never enabled.');
      }
    }

    // Restart PM2 process for force_exit to apply changes
    exec('pm2 restart force_exit', (error, stdout, stderr) => {
      if (error) {
        logger.error(`Error restarting PM2 process: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to restart PM2 process.', error: error.message });
      }
      if (stderr) {
        logger.warn(`PM2 restart stderr: ${stderr}`);
      }
      logger.debug(`PM2 restart stdout: ${stdout}`);
      res.json({ success: true, message: `Autoshutoff ${enabled ? 'enabled' : 'disabled'} and PM2 process restarted.` });
    });

  } catch (error) {
    logger.error('Error toggling autoshutoff:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle autoshutoff.', error: error.message });
  }
});

app.post('/api/change-password', isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.session.userId;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Old and new passwords are required.' });
  }

  if (oldPassword === newPassword) {
    return res.status(400).json({ message: 'New password cannot be the same as the old password.' });
  }

  db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
    if (err) {
      logger.error('Error fetching user:', err);
      return res.status(500).json({ message: 'Error changing password.' });
    }
    if (!user) {
      // This case should ideally not happen if the user is authenticated
      return res.status(404).json({ message: 'User not found.' });
    }

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
      return res.status(400).json({ message: 'Invalid old password.' });
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], function(updateErr) {
        if (updateErr) {
          logger.error('Error updating password:', updateErr);
          return res.status(500).json({ message: 'Error updating password.' });
        }
        res.json({ message: 'Password updated successfully.' });
      });
    } catch (hashError) {
      logger.error('Error hashing new password:', hashError);
      res.status(500).json({ message: 'Error processing new password.' });
    }
  });
});

app.listen(port, () => {
  logger.info(`Server listening at http://localhost:${port}`);
  scheduleOrderHistoryFetch();
});
