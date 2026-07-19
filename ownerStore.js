const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'ownerStore.json');

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) return { dynamicOwners: [] };
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch { return { dynamicOwners: [] }; }
}

function saveStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getStaticOwners() {
  const ids = process.env.OWNER_IDS || '';
  return ids.split(',').map(s => s.trim()).filter(Boolean);
}

function getDynamicOwners() {
  return loadStore().dynamicOwners || [];
}

function isOwner(userId) {
  return getStaticOwners().includes(userId) || getDynamicOwners().includes(userId);
}

function addDynamicOwner(userId) {
  const store = loadStore();
  if (!store.dynamicOwners.includes(userId)) {
    store.dynamicOwners.push(userId);
    saveStore(store);
  }
}

function removeDynamicOwner(userId) {
  const store = loadStore();
  store.dynamicOwners = store.dynamicOwners.filter(id => id !== userId);
  saveStore(store);
}

function getAllOwners() {
  return { static: getStaticOwners(), dynamic: getDynamicOwners() };
}

module.exports = { isOwner, addDynamicOwner, removeDynamicOwner, getAllOwners, getDynamicOwners, getStaticOwners };
