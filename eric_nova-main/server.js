// server.js

const express = require('express');
const getOpenPosition = require('./getOpenPosition.js');
const helmet = require('helmet');
const { Worker } = require('worker_threads');
const app = express();

const fs = require('fs');
const CONTROL_FILE = './autoshutoff.control';

// Middleware to set security HTTP headers
app.use(helmet());

// Middleware to parse JSON bodies
app.use(express.json());

function spawnWorker(scriptPath, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(scriptPath, { workerData: data });

        worker.on('message', (message) => {
            console.log(`Worker finished with message: ${message}`);
            resolve(message);
        });

        worker.on('error', (error) => {
            console.error(`Worker error: ${error}`);
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker exited with code ${code}`);
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

app.get('/', (req, res) => {
    let forceExitStatus;
    if (fs.existsSync(CONTROL_FILE)) {
        forceExitStatus = '✅ Auto Force Exit ON';
    }
    else {
        forceExitStatus = '⛔ Auto Force Exit OFF';
    }

    res.status(200).json({ message: `server running, ${forceExitStatus}` });
})

// Define the POST /signal endpoint
app.post('/signal', async (req, res) => {
    const webhookData = req.body;
    // Process the webhook data as needed
    console.log('Received webhook:', webhookData);
    if (webhookData.type === '-1' || webhookData.type === '1') {
        console.log('Spawning worker for entry action...');
        await spawnWorker('./marketentry_worker.js', webhookData);
    }
    if (webhookData.type === '0') {
        console.log('Spawning worker for exit action...');
        await spawnWorker('./marketexit_worker.js', webhookData);
    }

    res.status(200).json({ message: 'Webhook processed successfully!' });
});

app.get('/enableForceExit', (req, res) => {
    fs.writeFileSync(CONTROL_FILE, 'ENABLED');
    console.log('✅ Auto Force Exit ENABLED');
    res.status(200).json({ message: '✅ Auto Force Exit ENABLED' });
})

app.get('/disableForceExit', (req, res) => {
    if (fs.existsSync(CONTROL_FILE)) {
        fs.unlinkSync(CONTROL_FILE);
    }
    console.log('⛔ Auto Force Exit Disabled');
    res.status(200).json({ message: '⛔ Auto Force Exit Disabled' });
})

app.get('/getOpenPosition', async (req, res) => {
    const configData = await fs.readFileSync('./config.json', 'utf8');
    const config = JSON.parse(configData);
    const openPositions = await getOpenPosition(config);
    res.status(200).json({ message: openPositions });
})

// Handle undefined routes (404)
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global error handler (500)
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server on port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
