// ============================================================
// GROUPGUARD
// DATABASE
// ============================================================

const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(
  __dirname,
  'groupguard-data.json'
)

const DEFAULT_GROUP_SETTINGS = {
  antiLink: true,
  antiSpam: true,
  antiStatusMention: true,
  welcome: false
}

let database = {
  users: {},
  groups: {},
  warnings: {}
}

// ============================================================
// LOAD
// ============================================================

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveDatabase()
      return
    }

    const file = fs.readFileSync(
      DATA_FILE,
      'utf8'
    )

    if (!file.trim()) {
      return
    }

    const parsed = JSON.parse(file)

    database = {
      users: parsed.users || {},
      groups: parsed.groups || {},
      warnings: parsed.warnings || {}
    }

    console.log('🗄️ Database loaded.')
  } catch (error) {
    console.error(
      '❌ Database load error:',
      error.message
    )
  }
}

// ============================================================
// SAVE
// ============================================================

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2),
      'utf8'
    )
  } catch (error) {
    console.error(
      '❌ Database save error:',
      error.message
    )
  }
}

// ============================================================
// USERS
// ============================================================

function getOrCreateUser(
  userId,
  phone = ''
) {
  if (!userId) {
    return null
  }

  if (!database.users[userId]) {
    database.users[userId] = {
      id: userId,
      phone: phone || userId,
      connected: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    saveDatabase()
  }

  return database.users[userId]
}

function getUser(userId) {
  if (!userId) {
    return null
  }

  return database.users[userId] || null
}

function setUserConnected(
  userId,
  connected
) {
  const user =
    getOrCreateUser(
      userId,
      userId
    )

  if (!user) {
    return null
  }

  user.connected = Boolean(connected)

  user.updatedAt =
    new Date().toISOString()

  saveDatabase()

  return user
}

function getUsers() {
  return {
    ...database.users
  }
}

function removeUser(userId) {
  if (!database.users[userId]) {
    return false
  }

  delete database.users[userId]

  saveDatabase()

  return true
}

// ============================================================
// GROUP SETTINGS
// ============================================================

function getGroupSettings(groupId) {
  if (!database.groups[groupId]) {
    database.groups[groupId] = {
      ...DEFAULT_GROUP_SETTINGS
    }

    saveDatabase()
  }

  return database.groups[groupId]
}

function updateGroupSettings(
  groupId,
  settings
) {
  const current =
    getGroupSettings(groupId)

  database.groups[groupId] = {
    ...current,
    ...settings
  }

  saveDatabase()

  return database.groups[groupId]
}

// ============================================================
// WARNINGS
// ============================================================

function createWarningRecord() {
  return {
    link: 0,
    spam: 0,
    status: 0,
    manual: 0
  }
}

function getWarnings(
  groupId,
  userId
) {
  if (!database.warnings[groupId]) {
    database.warnings[groupId] = {}
  }

  if (!database.warnings[groupId][userId]) {
    database.warnings[groupId][userId] =
      createWarningRecord()

    saveDatabase()
  }

  return database.warnings[groupId][userId]
}

function addWarning(
  groupId,
  userId,
  type
) {
  const warnings =
    getWarnings(
      groupId,
      userId
    )

  if (
    !Object.prototype.hasOwnProperty.call(
      warnings,
      type
    )
  ) {
    throw new Error(
      `Unknown warning type: ${type}`
    )
  }

  warnings[type] += 1

  saveDatabase()

  return {
    ...warnings
  }
}

function resetWarnings(
  groupId,
  userId
) {
  if (
    database.warnings[groupId] &&
    database.warnings[groupId][userId]
  ) {
    database.warnings[groupId][userId] =
      createWarningRecord()

    saveDatabase()
  }
}

function resetWarningType(
  groupId,
  userId,
  type
) {
  const warnings =
    getWarnings(
      groupId,
      userId
    )

  if (
    !Object.prototype.hasOwnProperty.call(
      warnings,
      type
    )
  ) {
    return warnings
  }

  warnings[type] = 0

  saveDatabase()

  return {
    ...warnings
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  loadDatabase,
  saveDatabase,

  getOrCreateUser,
  getUser,
  setUserConnected,
  getUsers,
  removeUser,

  getGroupSettings,
  updateGroupSettings,

  getWarnings,
  addWarning,
  resetWarnings,
  resetWarningType
}