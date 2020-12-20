const { readdirSync, statSync } = require('fs');
const { join } = require('path');

const getDirs = (p) => readdirSync(p).filter((f) => statSync(join(p, f)).isDirectory());

module.exports = getDirs;
