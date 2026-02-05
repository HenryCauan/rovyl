const { exec } = require('child_process');
const loudness = require('loudness');
const path = require('path');

const nircmdPath = path.join(__dirname, 'nircmd.exe');

function getVolume() {
  return loudness.getVolume();
}

function setVolume(level) {
  return loudness.setVolume(level);
}

function getBrightness() {
  return Promise.resolve(50); // nircmd doesn't support getting brightness
}

function setBrightness(level) {
  const nircmdLevel = Math.round((level / 100) * 255);
  return new Promise((resolve, reject) => {
    exec(`${nircmdPath} setbrightness ${nircmdLevel}`, (err) => {
      if (err) {
        console.error('Error setting brightness:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

function toggleWifi(enable) {
  return new Promise((resolve, reject) => {
    const action = enable ? 'enable' : 'disable';
    exec(`netsh interface set interface "Wi-Fi" ${action}`, (err) => {
      if (err) {
        console.error('Error toggling wifi:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

function toggleBluetooth(enable) {
  return new Promise((resolve) => {
    // This is a placeholder. A robust solution requires a third-party library.
    console.log(`Bluetooth toggled: ${enable}`);
    resolve();
  });
}

module.exports = {
  getVolume,
  setVolume,
  getBrightness,
  setBrightness,
  toggleWifi,
  toggleBluetooth,
};
