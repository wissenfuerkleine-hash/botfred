const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'botState.json');

function load() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({ paused: false }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return { paused: false };
  }
}

function save(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function isPaused() {
  return load().paused === true;
}

function setPaused(paused) {
  save({ paused });
  return paused;
}

module.exports = { isPaused, setPaused };
