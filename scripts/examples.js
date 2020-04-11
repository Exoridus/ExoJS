const { PORT = 3000 } = process.env;
const { resolve } = require("path");
const express = require('express');
const serveStatic = require('serve-static');

const app = express();

app.use(serveStatic(
    resolve(__dirname, '../examples'),
    { 'index': ['index.html'] }
));

app.listen(PORT);

console.log(`Examples running: http://localhost:${PORT}`);