module.exports = {
    apps: [
        {
            name: 'autoupdateToken',
            script: './scripts/autoupdateToken.js',
            cron_restart: '*/5 * * * *',
            autorestart: false,
            watch: false
        },
        {
            name: 'serve_api',
            script: './server.js',
            autorestart: false,
            watch: false
        },
        {
            name: 'force_exit',
            script: './scripts/forceExitTrade.js',
            cron_restart: '*/2 * * * *',
            autorestart: true,
            watch: false
        },
        {
            name: 'backfill_profit_loss',
            script: './scripts/backfillProfitLoss.js',
            cron_restart: '* * * * *',
            autorestart: false,
            watch: false
        }
    ]
};

