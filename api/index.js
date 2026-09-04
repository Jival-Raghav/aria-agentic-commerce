const requestHandler = require('../server');

module.exports = async (req, res) => {
    try {
        return await requestHandler(req, res);
    } catch (err) {
        console.error('Unhandled serverless function error:', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Serverless Function Error',
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            }));
        }
    }
};
