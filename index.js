// ============================================================
// GROUPGUARD
// MULTI-USER WHATSAPP GROUP BOT
// ============================================================

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const { Boom } = require('@hapi/boom')

const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')

// ============================================================
// SETTINGS
// ============================================================

const PREFIX = '.'
const BOT_NAME = 'GroupGuard'
const WARN_LIMIT = 5

const PORT = Number(process.env.PORT) || 10000

// Render free instance: keep this LOW.
const MAX_SESSIONS = 3

const AUTH_ROOT = path.join(__dirname, 'auth')
const DB_FILE = path.join(__dirname, 'warnings.json')

// ============================================================
// DIRECTORIES
// ============================================================

if (!fs.existsSync(AUTH_ROOT)) {
  fs.mkdirSync(AUTH_ROOT, { recursive: true })
}

// ============================================================
// DATABASE
// ============================================================

let db = {}

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(
      fs.readFileSync(DB_FILE, 'utf8')
    )
  } catch (error) {
    console.log('⚠️ warnings.json could not be read.')
    db = {}
  }
}

function saveDB() {
  const tempFile = `${DB_FILE}.tmp`

  try {
    fs.writeFileSync(
      tempFile,
      JSON.stringify(db, null, 2),
      'utf8'
    )

    fs.renameSync(
      tempFile,
      DB_FILE
    )
  } catch (error) {
    console.log(
      '❌ Database save error:',
      error.message
    )

    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    } catch {}
  }
}

function getUser(groupId, userId) {
  if (!db[groupId]) {
    db[groupId] = {}
  }

  if (!db[groupId][userId]) {
    db[groupId][userId] = {
      warnings: 0,
      msgTimes: []
    }
  }

  return db[groupId][userId]
}

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanPhone(number) {
  return String(number || '')
    .replace(/\D/g, '')
}

function mention(user) {
  return `@${String(user).split('@')[0]}`
}

function makeSessionId() {
  return crypto
    .randomBytes(16)
    .toString('hex')
}

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  )
}

// ============================================================
// SESSION STORAGE
// ============================================================

// sessionId -> session
const sessions = new Map()

// phone -> sessionId
const phoneSessions = new Map()

// ============================================================
// RATE LIMITING
// ============================================================

const requestTimes = new Map()
const phoneRequestTimes = new Map()

function rateLimit(map, key, limit, windowMs) {
  const now = Date.now()

  const old =
    map.get(key) || []

  const recent =
    old.filter(
      time => now - time < windowMs
    )

  if (recent.length >= limit) {
    map.set(key, recent)
    return false
  }

  recent.push(now)

  map.set(key, recent)

  return true
}

// ============================================================
// HTML
// ============================================================

const HTML_PAGE = `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>GroupGuard Pairing</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #101010;
  color: white;
  font-family: Arial, sans-serif;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;
}

.card {
  width: 100%;
  max-width: 440px;

  background: #191919;

  border-radius: 22px;

  padding: 28px;

  box-shadow:
    0 10px 40px rgba(0,0,0,.45);
}

.logo {
  text-align: center;
  font-size: 48px;
}

h1 {
  text-align: center;
  margin: 8px 0;
}

.subtitle {
  text-align: center;
  color: #aaa;
  margin-bottom: 25px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

input {
  width: 100%;

  padding: 15px;

  border-radius: 12px;

  border: 1px solid #444;

  background: #111;

  color: white;

  font-size: 16px;

  outline: none;
}

input:focus {
  border-color: #25D366;
}

button {
  width: 100%;

  margin-top: 15px;

  padding: 15px;

  border: none;

  border-radius: 12px;

  background: #25D366;

  color: #000;

  font-size: 16px;

  font-weight: bold;

  cursor: pointer;
}

button:disabled {
  opacity: .5;
}

.message {
  text-align: center;
  margin-top: 15px;
}

.error {
  color: #ff6b6b;
}

.success {
  color: #25D366;
}

.code {
  display: none;

  margin-top: 20px;

  padding: 20px;

  background: #0d0d0d;

  border-radius: 15px;

  text-align: center;
}

.codeValue {
  margin: 12px 0;

  color: #25D366;

  font-size: 30px;

  font-weight: bold;

  letter-spacing: 5px;
}

.steps {
  margin-top: 25px;

  color: #ccc;

  line-height: 1.8;
}

.small {
  margin-top: 20px;

  color: #777;

  text-align: center;

  font-size: 13px;
}

</style>

</head>

<body>

<div class="card">

<div class="logo">🤖</div>

<h1>GroupGuard</h1>

<div class="subtitle">
WhatsApp Group Protection
</div>

<label>
WhatsApp Number
</label>

<input
  id="phone"
  type="tel"
  placeholder="2348012345678"
  autocomplete="off"
/>

<button
  id="button"
  onclick="pair()"
>
GET PAIRING CODE
</button>

<div
  id="message"
  class="message"
></div>

<div
  id="codeBox"
  class="code"
>

<div>🔐 Your Pairing Code</div>

<div
  id="code"
  class="codeValue"
></div>

<div>
Enter this code in WhatsApp immediately.
</div>

</div>

<div class="steps">

<b>How to connect:</b>

<br>

1. Enter your WhatsApp number.

<br>

2. Tap <b>GET PAIRING CODE</b>.

<br>

3. Open WhatsApp.

<br>

4. Go to <b>Linked Devices</b>.

<br>

5. Tap <b>Link a device</b>.

<br>

6. Tap <b>Link with phone number instead</b>.

<br>

7. Enter the pairing code.

</div>

<div class="small">

Use international format.

<br>

Example: 2348012345678

<br><br>

No + sign. No spaces.

</div>

</div>

<script>

async function pair() {

  const input =
    document.getElementById('phone')

  const button =
    document.getElementById('button')

  const message =
    document.getElementById('message')

  const codeBox =
    document.getElementById('codeBox')

  const code =
    document.getElementById('code')

  let phone =
    input.value.replace(/\\D/g, '')

  message.innerHTML = ''

  codeBox.style.display = 'none'

  if (!phone) {

    message.innerHTML =
      '<div class="error">' +
      'Enter your WhatsApp number.' +
      '</div>'

    return
  }

  if (
    phone.length < 10 ||
    phone.length > 15
  ) {

    message.innerHTML =
      '<div class="error">' +
      'Enter a valid international number.' +
      '</div>'

    return
  }

  button.disabled = true

  button.innerText =
    'CONNECTING TO WHATSAPP...'

  try {

    const response =
      await fetch(
        '/api/pair',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            phone: phone
          })
        }
      )

    const data =
      await response.json()

    if (!response.ok) {

      throw new Error(
        data.error ||
        'Pairing failed.'
      )
    }

    if (
      data.code ===
      'ALREADY_CONNECTED'
    ) {

      message.innerHTML =
        '<div class="success">' +
        '✅ This WhatsApp account is already connected.' +
        '</div>'

      return
    }

    code.innerText =
      data.code

    codeBox.style.display =
      'block'

    message.innerHTML =
      '<div class="success">' +
      '✅ Code ready. Enter it in WhatsApp now.' +
      '</div>'

  } catch (error) {

    message.innerHTML =
      '<div class="error">' +
      error.message +
      '</div>'

  } finally {

    button.disabled = false

    button.innerText =
      'GET PAIRING CODE'
  }
}

</script>

</body>

</html>
`

// ============================================================
// REMOVE SESSION
// ============================================================

function removeSession(
  sessionId,
  deleteAuth = false
) {

  const session =
    sessions.get(sessionId)

  if (!session) {
    return
  }

  const phone =
    session.phone

  sessions.delete(
    sessionId
  )

  if (
    phoneSessions.get(phone) ===
    sessionId
  ) {

    phoneSessions.delete(phone)
  }

  if (deleteAuth) {

    try {

      fs.rmSync(
        session.authDir,
        {
          recursive: true,
          force: true
        }
      )

    } catch (error) {

      console.log(
        '⚠️ Could not remove auth:',
        error.message
      )
    }
  }
}

// ============================================================
// WEB SERVER
// ============================================================

function startWebServer() {

  const server =
    http.createServer(
      async (req, res) => {

        try {

          // ==================================================
          // HOME
          // ==================================================

          if (
            req.method === 'GET' &&
            req.url === '/'
          ) {

            res.writeHead(
              200,
              {
                'Content-Type':
                  'text/html; charset=utf-8'
              }
            )

            res.end(
              HTML_PAGE
            )

            return
          }

          // ==================================================
          // HEALTH
          // ==================================================

          if (
            req.method === 'GET' &&
            req.url === '/health'
          ) {

            res.writeHead(
              200,
              {
                'Content-Type':
                  'application/json'
              }
            )

            res.end(
              JSON.stringify({
                status: 'ok',
                bot: BOT_NAME,
                sessions:
                  sessions.size
              })
            )

            return
          }

          // ==================================================
          // PAIR
          // ==================================================

          if (
            req.method === 'POST' &&
            req.url === '/api/pair'
          ) {

            const ip =
              req.socket.remoteAddress ||
              'unknown'

            if (
              !rateLimit(
                requestTimes,
                ip,
                5,
                60 * 1000
              )
            ) {

              res.writeHead(
                429,
                {
                  'Content-Type':
                    'application/json'
                }
              )

              res.end(
                JSON.stringify({
                  error:
                    'Too many requests. Please wait one minute.'
                })
              )

              return
            }

            let body = ''

            req.on(
              'data',
              chunk => {

                body +=
                  chunk.toString()

                if (
                  body.length > 5000
                ) {

                  req.destroy()
                }
              }
            )

            req.on(
              'end',
              async () => {

                try {

                  const data =
                    JSON.parse(
                      body || '{}'
                    )

                  // ------------------------------------------
                  // IMPORTANT:
                  // THIS IS THE ONLY NUMBER USED.
                  // NO PHONE_NUMBER ENV VARIABLE.
                  // ------------------------------------------

                  const phone =
                    cleanPhone(
                      data.phone
                    )

                  console.log(
                    `📥 Pairing request received for: ${phone}`
                  )

                  if (
                    phone.length < 10 ||
                    phone.length > 15
                  ) {

                    res.writeHead(
                      400,
                      {
                        'Content-Type':
                          'application/json'
                      }
                    )

                    res.end(
                      JSON.stringify({
                        error:
                          'Invalid WhatsApp number.'
                      })
                    )

                    return
                  }

                  // One request per number
                  // every 5 minutes.

                  if (
                    !rateLimit(
                      phoneRequestTimes,
                      phone,
                      1,
                      5 * 60 * 1000
                    )
                  ) {

                    res.writeHead(
                      429,
                      {
                        'Content-Type':
                          'application/json'
                      }
                    )

                    res.end(
                      JSON.stringify({
                        error:
                          'A pairing request was already made for this number. Wait 5 minutes before requesting another code.'
                      })
                    )

                    return
                  }

                  // ------------------------------------------
                  // EXISTING SESSION
                  // ------------------------------------------

                  const existingId =
                    phoneSessions.get(
                      phone
                    )

                  if (existingId) {

                    const existing =
                      sessions.get(
                        existingId
                      )

                    if (
                      existing?.pairingCode
                    ) {

                      res.writeHead(
                        200,
                        {
                          'Content-Type':
                            'application/json'
                        }
                      )

                      res.end(
                        JSON.stringify({
                          success: true,
                          code:
                            existing.pairingCode
                        })
                      )

                      return
                    }

                    if (existing) {

                      res.writeHead(
                        409,
                        {
                          'Content-Type':
                            'application/json'
                        }
                      )

                      res.end(
                        JSON.stringify({
                          error:
                            'This number is already connecting. Please wait.'
                        })
                      )

                      return
                    }

                    phoneSessions.delete(
                      phone
                    )
                  }

                  // ------------------------------------------
                  // MAX SESSIONS
                  // ------------------------------------------

                  if (
                    sessions.size >=
                    MAX_SESSIONS
                  ) {

                    res.writeHead(
                      503,
                      {
                        'Content-Type':
                          'application/json'
                      }
                    )

                    res.end(
                      JSON.stringify({
                        error:
                          'GroupGuard is currently full. Please try again later.'
                      })
                    )

                    return
                  }

                  // ------------------------------------------
                  // CREATE SESSION
                  // ------------------------------------------

                  const result =
                    await createWhatsAppSession(
                      phone
                    )

                  res.writeHead(
                    200,
                    {
                      'Content-Type':
                        'application/json'
                    }
                  )

                  res.end(
                    JSON.stringify(
                      result
                    )
                  )

                } catch (error) {

                  console.log(
                    '❌ Pairing API error:',
                    error.message
                  )

                  res.writeHead(
                    500,
                    {
                      'Content-Type':
                        'application/json'
                    }
                  )

                  res.end(
                    JSON.stringify({
                      error:
                        error.message ||
                        'Could not generate pairing code.'
                    })
                  )
                }
              }
            )

            return
          }

          // ==================================================
          // 404
          // ==================================================

          res.writeHead(404)

          res.end(
            'Not found'
          )

        } catch (error) {

          console.log(
            '❌ Web server error:',
            error.message
          )

          if (
            !res.headersSent
          ) {

            res.writeHead(500)
          }

          res.end(
            'Server error'
          )
        }
      }
    )

  server.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        `🌐 ${BOT_NAME} web server running on port ${PORT}`
      )
    }
  )
}

// ============================================================
// CREATE WHATSAPP SESSION
// ============================================================

async function createWhatsAppSession(
  phone
) {

  console.log(
    `🚀 Creating NEW WhatsApp session for ${phone}`
  )

  const sessionId =
    makeSessionId()

  const authDir =
    path.join(
      AUTH_ROOT,
      sessionId
    )

  fs.mkdirSync(
    authDir,
    {
      recursive: true
    }
  )

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      authDir
    )

  const sock =
    makeWASocket({

      auth: state,

      printQRInTerminal: false,

      browser: [
        'GroupGuard',
        'Chrome',
        '1.0.0'
      ],

      markOnlineOnConnect: false,

      syncFullHistory: false,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 60000

    })

  const session = {

    id: sessionId,

    phone: phone,

    authDir: authDir,

    sock: sock,

    pairingCode: null,

    paired: false,

    createdAt: Date.now(),

    reconnecting: false

  }

  sessions.set(
    sessionId,
    session
  )

  phoneSessions.set(
    phone,
    sessionId
  )

  // ==========================================================
  // SAVE CREDENTIALS
  // ==========================================================

  sock.ev.on(
    'creds.update',
    saveCreds
  )

  // ==========================================================
  // GROUP FEATURES
  // ==========================================================

  setupGroupFeatures(
    sock
  )

  // ==========================================================
  // CONNECTION EVENTS
  // ==========================================================

  sock.ev.on(
    'connection.update',
    async update => {

      const {
        connection,
        lastDisconnect
      } = update

      console.log(
        `📡 ${phone} connection: ${connection || 'unknown'}`
      )

      // ------------------------------------------------------
      // OPEN
      // ------------------------------------------------------

      if (
        connection === 'open'
      ) {

        session.paired = true

        console.log('')
        console.log(
          '================================'
        )
        console.log(
          '✅ GROUPGUARD ACCOUNT ONLINE'
        )
        console.log(
          `📱 ${phone}`
        )
        console.log(
          '================================'
        )
        console.log('')
      }

      // ------------------------------------------------------
      // CLOSE
      // ------------------------------------------------------

      if (
        connection === 'close'
      ) {

        const statusCode =
          new Boom(
            lastDisconnect?.error
          )?.output?.statusCode

        console.log(
          `❌ ${phone} disconnected. Status: ${statusCode}`
        )

        const loggedOut =
          statusCode ===
          DisconnectReason.loggedOut

        if (
          loggedOut
        ) {

          console.log(
            `🔐 ${phone} logged out.`
          )

          removeSession(
            sessionId,
            true
          )

          return
        }

        if (
          session.reconnecting
        ) {
          return
        }

        session.reconnecting =
          true

        console.log(
          `🔄 ${phone} will reconnect in 10 seconds.`
        )

        setTimeout(
          async () => {

            removeSession(
              sessionId,
              false
            )

            try {

              await createWhatsAppSession(
                phone
              )

            } catch (error) {

              console.log(
                `❌ Reconnection failed for ${phone}:`,
                error.message
              )
            }

          },
          10000
        )
      }
    }
  )

  // ==========================================================
  // REQUEST PAIRING CODE
  // ==========================================================

  try {

    if (
      state.creds.registered
    ) {

      console.log(
        `✅ ${phone} already has saved WhatsApp credentials.`
      )

      return {
        success: true,
        code: 'ALREADY_CONNECTED'
      }
    }

    // Give the socket time to establish
    // its WhatsApp transport.

    console.log(
      `⏳ Waiting for WhatsApp connection for ${phone}...`
    )

    await sleep(7000)

    if (
      state.creds.registered
    ) {

      return {
        success: true,
        code: 'ALREADY_CONNECTED'
      }
    }

    console.log(
      `🔗 Requesting pairing code for ${phone}...`
    )

    const code =
      await sock.requestPairingCode(
        phone
      )

    session.pairingCode =
      code

    console.log('')
    console.log(
      '================================'
    )
    console.log(
      '📱 GROUPGUARD PAIRING CODE'
    )
    console.log(
      `📱 Number: ${phone}`
    )
    console.log(
      `🔐 Code: ${code}`
    )
    console.log(
      '================================'
    )
    console.log('')

    return {
      success: true,
      code: code
    }

  } catch (error) {

    console.log(
      `❌ Pairing failed for ${phone}:`,
      error.message
    )

    removeSession(
      sessionId,
      true
    )

    try {

      sock.end(
        new Error(
          'Pairing failed'
        )
      )

    } catch {}

    throw new Error(
      'WhatsApp rejected the pairing request. Check the number and try again later.'
    )
  }
}

// ============================================================
// GROUP FEATURES
// ============================================================

function setupGroupFeatures(
  sock
) {

  // ==========================================================
  // WARNING
  // ==========================================================

  async function sendWarning(
    groupId,
    userId,
    reason
  ) {

    const user =
      getUser(
        groupId,
        userId
      )

    user.warnings += 1

    saveDB()

    await sock.sendMessage(
      groupId,
      {
        text:
          `⚠️ ${mention(userId)} Warning ${user.warnings}/${WARN_LIMIT}\n` +
          `${reason}\n` +
          `Please follow the GC rules. 🙏`,

        mentions: [
          userId
        ]
      }
    )

    if (
      user.warnings >=
      WARN_LIMIT
    ) {

      await sock.sendMessage(
        groupId,
        {
          text:
            `🔨 ${mention(userId)} has reached ${WARN_LIMIT} warnings.\n` +
            `You have been removed from the GC. 🚫`,

          mentions: [
            userId
          ]
        }
      )

      try {

        await sock.groupParticipantsUpdate(
          groupId,
          [userId],
          'remove'
        )

      } catch (error) {

        console.log(
          '❌ Remove error:',
          error.message
        )
      }

      user.warnings = 0

      saveDB()
    }
  }

  // ==========================================================
  // GROUP PARTICIPANTS
  // ==========================================================

  sock.ev.on(
    'group-participants.update',
    async update => {

      try {

        if (
          update.action === 'add'
        ) {

          for (
            const user of
            update.participants
          ) {

            await sock.sendMessage(
              update.id,
              {
                text:
                  `👋 Welcome ${mention(user)} to the group! 🎉\n` +
                  `Please read and follow the GC rules. 🙏`,

                mentions: [
                  user
                ]
              }
            )
          }
        }

        if (
          update.action === 'promote'
        ) {

          await sock.sendMessage(
            update.id,
            {
              text:
                `👮 ${mention(update.participants[0])} is now a group admin.\n` +
                `Use your powers responsibly. 🫡`,

              mentions:
                update.participants
            }
          )
        }

        if (
          update.action === 'demote'
        ) {

          await sock.sendMessage(
            update.id,
            {
              text:
                `👮 ${mention(update.participants[0])} is no longer a group admin.`,

              mentions:
                update.participants
            }
          )
        }

      } catch (error) {

        console.log(
          '❌ Participant event error:',
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
    async ({ messages }) => {

      try {

        const msg =
          messages?.[0]

        if (
          !msg?.message ||
          msg.key?.fromMe
        ) {
          return
        }

        const groupId =
          msg.key?.remoteJid

        if (
          !groupId ||
          !groupId.endsWith('@g.us')
        ) {
          return
        }

        const sender =
          msg.key?.participant ||
          msg.participant

        if (!sender) {
          return
        }

        const text =
          getText(msg).trim()

        const metadata =
          await sock.groupMetadata(
            groupId
          )

        const admins =
          metadata.participants
            .filter(
              participant =>
                participant.admin
            )
            .map(
              participant =>
                participant.id
            )

        const isAdmin =
          admins.includes(
            sender
          )

        const userData =
          getUser(
            groupId,
            sender
          )

        // ====================================================
        // ANTI-LINK
        // ====================================================

        const hasLink =
          /(https?:\/\/|www\.|(?:^|\s)\S+\.(com|net|org|ng|io)\b)/i
            .test(text)

        if (
          hasLink &&
          !isAdmin
        ) {

          try {

            await sock.sendMessage(
              groupId,
              {
                delete:
                  msg.key
              }
            )

          } catch {}

          await sendWarning(
            groupId,
            sender,
            'Links are not allowed 🚫'
          )

          return
        }

        // ====================================================
        // STATUS MENTION
        // ====================================================

        const hasStatusMention =
          /@status\b/i.test(
            text
          )

        if (
          hasStatusMention &&
          !isAdmin
        ) {

          try {

            await sock.sendMessage(
              groupId,
              {
                delete:
                  msg.key
              }
            )

          } catch {}

          await sendWarning(
            groupId,
            sender,
            'Status mentions are not allowed 🚫'
          )

          return
        }

        // ====================================================
        // ANTI-SPAM
        // ====================================================

        if (
          !userData.msgTimes
        ) {

          userData.msgTimes = []
        }

        const now =
          Date.now()

        userData.msgTimes =
          userData.msgTimes.filter(
            time =>
              now - time < 10000
          )

        userData.msgTimes.push(
          now
        )

        if (
          userData.msgTimes.length >= 6 &&
          !isAdmin
        ) {

          userData.msgTimes = []

          saveDB()

          await sendWarning(
            groupId,
            sender,
            'Stop spamming 🚫'
          )

          return
        }

        saveDB()

        // ====================================================
        // COMMAND
        // ====================================================

        if (
          !text.startsWith(
            PREFIX
          )
        ) {
          return
        }

        const parts =
          text
            .slice(
              PREFIX.length
            )
            .trim()
            .split(/\s+/)

        const command =
          parts
            .shift()
            ?.toLowerCase()

        // ====================================================
        // TARGET
        // ====================================================

        let target = null

        const context =
          msg.message
            ?.extendedTextMessage
            ?.contextInfo

        const mentioned =
          context?.mentionedJid

        if (
          mentioned?.length
        ) {

          target =
            mentioned[0]

        } else if (
          parts[0]
        ) {

          const number =
            parts[0]
              .replace('@', '')
              .replace(/\D/g, '')

          if (
            number
          ) {

            target =
              `${number}@s.whatsapp.net`
          }
        }

        // ====================================================
        // ADMIN COMMANDS
        // ====================================================

        const adminCommands = [
          'warn',
          'reset',
          'kick'
        ]

        if (
          adminCommands.includes(
            command
          ) &&
          !isAdmin
        ) {

          await sock.sendMessage(
            groupId,
            {
              text:
                `🚫 ${mention(sender)} This command is for admins only. 👮`,

              mentions: [
                sender
              ]
            }
          )

          return
        }

        // ====================================================
        // COMMANDS
        // ====================================================

        switch (
          command
        ) {

          // --------------------------------------------------
          // MENU
          // --------------------------------------------------

          case 'menu':
          case 'help':

            await sock.sendMessage(
              groupId,
              {
                text:
`🤖 ${BOT_NAME} MENU

⚠️ MODERATION

.warn @user
.warnings @user
.reset @user
.kick @user

📋 GROUP

.rules
.menu

🚫 PROTECTION

• Anti-link
• Anti-status mention
• Anti-spam
• 5 warnings = removal`
              }
            )

            break

          // --------------------------------------------------
          // WARN
          // --------------------------------------------------

          case 'warn':

            if (!target) {

              await sock.sendMessage(
                groupId,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .warn @user'
                }
              )

              return
            }

            await sendWarning(
              groupId,
              target,
              'Manual warning issued by an admin.'
            )

            break

          // --------------------------------------------------
          // WARNINGS
          // --------------------------------------------------

          case 'warnings':

            if (!target) {

              await sock.sendMessage(
                groupId,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .warnings @user'
                }
              )

              return
            }

            {

              const targetData =
                getUser(
                  groupId,
                  target
                )

              await sock.sendMessage(
                groupId,
                {
                  text:
                    `📊 ${mention(target)}\n` +
                    `Warnings: ${targetData.warnings}/${WARN_LIMIT} ⚠️`,

                  mentions: [
                    target
                  ]
                }
              )
            }

            break

          // --------------------------------------------------
          // RESET
          // --------------------------------------------------

          case 'reset':

            if (!target) {

              await sock.sendMessage(
                groupId,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .reset @user'
                }
              )

              return
            }

            getUser(
              groupId,
              target
            ).warnings = 0

            saveDB()

            await sock.sendMessage(
              groupId,
              {
                text:
                  `✅ Warnings reset for ${mention(target)}.`,

                mentions: [
                  target
                ]
              }
            )

            break

          // --------------------------------------------------
          // KICK
          // --------------------------------------------------

          case 'kick':

            if (!target) {

              await sock.sendMessage(
                groupId,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .kick @user'
                }
              )

              return
            }

            try {

              await sock.groupParticipantsUpdate(
                groupId,
                [target],
                'remove'
              )

              await sock.sendMessage(
                groupId,
                {
                  text:
                    `👢 ${mention(target)} has been removed from the group.`,

                  mentions: [
                    target
                  ]
                }
              )

            } catch (error) {

              console.log(
                '❌ Kick error:',
                error.message
              )

              await sock.sendMessage(
                groupId,
                {
                  text:
                    '❌ I could not remove that user. Make sure I am a group admin.'
                }
              )
            }

            break

          // --------------------------------------------------
          // RULES
          // --------------------------------------------------

          case 'rules':

            await sock.sendMessage(
              groupId,
              {
                text:
`📋 GC RULES

🚫 No links
🚫 No status mentions
🚫 No spam
🤝 Respect everyone
⚠️ 5 warnings = removal

🙏 Follow the rules.`
              }
            )

            break

          // --------------------------------------------------
          // UNKNOWN
          // --------------------------------------------------

          default:

            await sock.sendMessage(
              groupId,
              {
                text:
                  `❓ Unknown command.\n` +
                  `Type .menu to see available commands. 🤖`
              }
            )
        }

      } catch (error) {

        console.log(
          '❌ Message handler error:',
          error.message
        )
      }
    }
  )
}

// ============================================================
// START
// ============================================================

console.log('')
console.log('================================')
console.log('🤖 GROUPGUARD STARTING...')
console.log('================================')
console.log('')

startWebServer()