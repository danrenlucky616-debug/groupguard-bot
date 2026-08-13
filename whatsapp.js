// ============================================================
// GROUPGUARD
// WHATSAPP CONNECTION
// ============================================================

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers
} = require('@whiskeysockets/baileys')

const { Boom } = require('@hapi/boom')
const pino = require('pino')
const path = require('path')
const fs = require('fs')

const config = require('./config')

const {
  handleCommand
} = require('./commands')

const {
  moderateMessage
} = require('./moderation')

const {
  loadDatabase,
  getOrCreateUser,
  setUserConnected
} = require('./database')

// ============================================================
// LOGGER
// ============================================================

const logger = pino({
  level: config.LOG_LEVEL
})

// ============================================================
// AUTH DIRECTORY
// ============================================================

const AUTH_ROOT = path.join(
  __dirname,
  'auth_info'
)

if (!fs.existsSync(AUTH_ROOT)) {
  fs.mkdirSync(
    AUTH_ROOT,
    {
      recursive: true
    }
  )
}

// ============================================================
// CONNECTIONS
// ============================================================

const sockets = new Map()

const connectionStates = new Map()

const reconnectTimers = new Map()

const pairingLocks = new Set()

// ============================================================
// STATUS
// ============================================================

let connectionStatus = 'offline'

function getConnectionStatus() {
  if (sockets.size === 0) {
    return connectionStatus
  }

  for (
    const status
    of connectionStates.values()
  ) {
    if (status === 'connected') {
      return 'connected'
    }
  }

  return connectionStatus
}

// ============================================================
// NORMALIZE PHONE
// ============================================================

function normalizePhone(
  phone
) {
  return String(phone || '')
    .replace(/\D/g, '')
}

// ============================================================
// AUTH PATH
// ============================================================

function getAuthPath(
  userId
) {
  return path.join(
    AUTH_ROOT,
    normalizePhone(userId)
  )
}

// ============================================================
// CONNECT ONE USER
// ============================================================

async function connectUser(
  userId,
  phoneNumber = userId
) {
  const normalized =
    normalizePhone(
      userId
    )

  if (!normalized) {
    throw new Error(
      'Invalid WhatsApp number.'
    )
  }

  if (
    sockets.has(normalized)
  ) {
    return sockets.get(normalized)
  }

  const authPath =
    getAuthPath(
      normalized
    )

  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(
      authPath,
      {
        recursive: true
      }
    )
  }

  getOrCreateUser(
    normalized,
    normalizePhone(phoneNumber)
  )

  connectionStates.set(
    normalized,
    'connecting'
  )

  connectionStatus =
    'connecting'

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      authPath
    )

  const sock =
    makeWASocket({
      auth: state,

      logger,

      browser:
        Browsers.ubuntu(
          'Chrome'
        ),

      printQRInTerminal: false,

      markOnlineOnConnect: false,

      connectTimeoutMs:
        60_000,

      defaultQueryTimeoutMs:
        60_000,

      keepAliveIntervalMs:
        25_000,

      syncFullHistory: false,

      shouldSyncHistoryMessage:
        () => false
    })

  sockets.set(
    normalized,
    sock
  )

  sock.ev.on(
    'creds.update',
    saveCreds
  )

  // ==========================================================
  // CONNECTION EVENTS
  // ==========================================================

  sock.ev.on(
    'connection.update',
    async update => {
      try {
        const {
          connection,
          lastDisconnect
        } = update

        if (
          connection ===
          'connecting'
        ) {
          connectionStates.set(
            normalized,
            'connecting'
          )

          connectionStatus =
            'connecting'

          console.log(
            `🔄 Connecting ${normalized}...`
          )

          if (
            !state.creds.registered &&
            !pairingLocks.has(
              normalized
            )
          ) {
            await requestPairingCode(
              sock,
              normalized
            )
          }
        }

        if (
          connection ===
          'open'
        ) {
          connectionStates.set(
            normalized,
            'connected'
          )

          connectionStatus =
            'connected'

          setUserConnected(
            normalized,
            true
          )

          console.log(
            '========================================'
          )

          console.log(
            `🟢 GROUPGUARD CONNECTED: ${normalized}`
          )

          console.log(
            '========================================'
          )
        }

        if (
          connection ===
          'close'
        ) {
          connectionStates.set(
            normalized,
            'offline'
          )

          setUserConnected(
            normalized,
            false
          )

          const statusCode =
            new Boom(
              lastDisconnect?.error
            ).output?.statusCode

          console.log(
            `🔴 WhatsApp closed: ${normalized}`
          )

          console.log(
            'Status:',
            statusCode
          )

          sockets.delete(
            normalized
          )

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              `🚪 ${normalized} logged out.`
            )

            return
          }

          scheduleReconnect(
            normalized
          )
        }

      } catch (error) {
        console.error(
          '❌ Connection update error:',
          error.message
        )
      }
    }
  )

  // ==========================================================
  // MESSAGES
  // ==========================================================

  sock.ev.on(
    'messages.upsert',
    async event => {
      const messages =
        event?.messages || []

      for (
        const message
        of messages
      ) {
        try {
          if (
            !message?.message
          ) {
            continue
          }

          if (
            message.key?.fromMe
          ) {
            continue
          }

          if (
            event?.requestId
          ) {
            continue
          }

          await moderateMessage(
            sock,
            message
          )

          await handleCommand(
            sock,
            message
          )

        } catch (error) {
          console.error(
            '❌ Message processing error:',
            error.message
          )
        }
      }
    }
  )

  return sock
}

// ============================================================
// PAIRING CODE
// ============================================================

async function requestPairingCode(
  sock,
  phoneNumber
) {
  const normalized =
    normalizePhone(
      phoneNumber
    )

  if (
    pairingLocks.has(
      normalized
    )
  ) {
    return null
  }

  pairingLocks.add(
    normalized
  )

  try {
    console.log(
      `📱 Requesting pairing code for ${normalized}...`
    )

    const code =
      await sock.requestPairingCode(
        normalized
      )

    const formatted =
      code
        ?.match(/.{1,4}/g)
        ?.join('-') ||
      code

    console.log(
      '========================================'
    )

    console.log(
      `📱 GROUPGUARD PAIRING CODE`
    )

    console.log(
      `📞 Number: ${normalized}`
    )

    console.log(
      `🔐 CODE: ${formatted}`
    )

    console.log(
      '========================================'
    )

    return formatted

  } catch (error) {
    console.error(
      '❌ Pairing code error:',
      error.message
    )

    pairingLocks.delete(
      normalized
    )

    return null
  }
}

// ============================================================
// PUBLIC PAIRING FUNCTION
// ============================================================

async function createPairing(
  phoneNumber
) {
  const normalized =
    normalizePhone(
      phoneNumber
    )

  if (!normalized) {
    throw new Error(
      'Invalid phone number.'
    )
  }

  if (
    sockets.has(normalized)
  ) {
    const status =
      connectionStates.get(
        normalized
      )

    if (
      status ===
      'connected'
    ) {
      return {
        success: false,
        connected: true,
        message:
          'This WhatsApp number is already connected.'
      }
    }
  }

  const sock =
    await connectUser(
      normalized,
      normalized
    )

  if (!sock) {
    throw new Error(
      'Unable to start WhatsApp connection.'
    )
  }

  const authPath =
    getAuthPath(
      normalized
    )

  const {
    state
  } =
    await useMultiFileAuthState(
      authPath
    )

  if (
    state.creds.registered
  ) {
    return {
      success: false,
      connected: true,
      message:
        'This WhatsApp account is already registered.'
    }
  }

  const code =
    await requestPairingCode(
      sock,
      normalized
    )

  if (!code) {
    throw new Error(
      'Could not generate pairing code.'
    )
  }

  return {
    success: true,
    connected: false,
    phone: normalized,
    code
  }
}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(
  userId
) {
  if (
    reconnectTimers.has(
      userId
    )
  ) {
    return
  }

  console.log(
    `🔄 ${userId} will reconnect in 5 seconds...`
  )

  const timer =
    setTimeout(
      async () => {
        reconnectTimers.delete(
          userId
        )

        try {
          await connectUser(
            userId,
            userId
          )
        } catch (error) {
          console.error(
            `❌ Reconnect failed for ${userId}:`,
            error.message
          )

          scheduleReconnect(
            userId
          )
        }
      },
      5000
    )

  reconnectTimers.set(
    userId,
    timer
  )
}

// ============================================================
// LOAD EXISTING USERS
// ============================================================

async function connectExistingUsers() {
  loadDatabase()

  console.log(
    '🔎 Checking saved WhatsApp sessions...'
  )

  if (
    !fs.existsSync(
      AUTH_ROOT
    )
  ) {
    return
  }

  const folders =
    fs.readdirSync(
      AUTH_ROOT,
      {
        withFileTypes: true
      }
    )

  for (
    const folder
    of folders
  ) {
    if (
      !folder.isDirectory()
    ) {
      continue
    }

    const phone =
      folder.name

    if (
      !/^\d+$/.test(phone)
    ) {
      continue
    }

    try {
      await connectUser(
        phone,
        phone
      )
    } catch (error) {
      console.error(
        `❌ Failed to restore ${phone}:`,
        error.message
      )
    }
  }
}

// ============================================================
// MAIN CONNECT
// ============================================================

async function connectToWhatsApp() {
  try {
    await connectExistingUsers()

    return true

  } catch (error) {
    console.error(
      '❌ WhatsApp startup error:',
      error.message
    )

    connectionStatus =
      'offline'

    return false
  }
}

// ============================================================
// GET USER STATUS
// ============================================================

function getUserConnectionStatus(
  phoneNumber
) {
  const phone =
    normalizePhone(
      phoneNumber
    )

  return (
    connectionStates.get(
      phone
    ) ||
    'offline'
  )
}

// ============================================================
// DISCONNECT USER
// ============================================================

async function disconnectUser(
  phoneNumber
) {
  const phone =
    normalizePhone(
      phoneNumber
    )

  const sock =
    sockets.get(
      phone
    )

  if (!sock) {
    return false
  }

  try {
    await sock.logout()
  } catch (error) {
    console.error(
      '❌ Logout error:',
      error.message
    )
  }

  sockets.delete(
    phone
  )

  connectionStates.delete(
    phone
  )

  setUserConnected(
    phone,
    false
  )

  return true
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  connectToWhatsApp,
  connectUser,
  createPairing,
  requestPairingCode,
  getConnectionStatus,
  getUserConnectionStatus,
  disconnectUser
}