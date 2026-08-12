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

const PORT = process.env.PORT || 10000

const DB_FILE = path.join(__dirname, 'warnings.json')
const AUTH_ROOT = path.join(__dirname, 'auth')

const MAX_SESSIONS = 20

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
    console.log('⚠️ Could not read warnings database.')
    db = {}
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    )
  } catch (error) {
    console.log(
      '❌ Could not save database:',
      error.message
    )
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

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  )
}

function mention(user) {
  return `@${String(user).split('@')[0]}`
}

function cleanPhone(number) {
  return String(number || '').replace(/\D/g, '')
}

function makeSessionId() {
  return crypto.randomBytes(16).toString('hex')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// ACTIVE SESSIONS
// ============================================================

const sessions = new Map()
const phoneSessions = new Map()

// ============================================================
// SIMPLE RATE LIMIT
// ============================================================

const requestTimes = new Map()

function allowedRequest(ip) {
  const now = Date.now()

  const previous = requestTimes.get(ip) || []

  const recent = previous.filter(
    time => now - time < 60000
  )

  if (recent.length >= 5) {
    requestTimes.set(ip, recent)
    return false
  }

  recent.push(now)

  requestTimes.set(ip, recent)

  return true
}

// ============================================================
// PAIRING PAGE
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
Enter this code in WhatsApp.
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

6. Select <b>Link with phone number</b>.

<br>

7. Enter the pairing code above.

</div>

<div class="small">

Use international format.

<br>

Example: 2348012345678

<br><br>

Do not include + or spaces.

</div>

</div>

<script>

async function pair() {

  const phoneInput =
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
    phoneInput.value.replace(/\\D/g, '')

  message.innerHTML = ''

  codeBox.style.display = 'none'

  if (!phone) {

    message.innerHTML =
      '<div class="error">Enter your WhatsApp number.</div>'

    return
  }

  if (
    phone.length < 10 ||
    phone.length > 15
  ) {

    message.innerHTML =
      '<div class="error">Enter a valid international number.</div>'

    return
  }

  button.disabled = true

  button.innerText =
    'GENERATING CODE...'

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

    code.innerText =
      data.code

    codeBox.style.display =
      'block'

    message.innerHTML =
      '<div class="success">' +
      '✅ Pairing code generated.' +
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
// WEB SERVER
// ============================================================

function startWebServer() {

  const server = http.createServer(
    async (req, res) => {

      try {

        // ====================================================
        // HOME PAGE
        // ====================================================

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

          res.end(HTML_PAGE)

          return
        }

        // ====================================================
        // HEALTH
        // ====================================================

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
              sessions: sessions.size
            })
          )

          return
        }

        // ====================================================
        // PAIRING API
        // ====================================================

        if (
          req.method === 'POST' &&
          req.url === '/api/pair'
        ) {

          const ip =
            req.socket.remoteAddress ||
            'unknown'

          if (!allowedRequest(ip)) {

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

                const phone =
                  cleanPhone(
                    data.phone
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

                // ==================================================
                // CHECK EXISTING SESSION
                // ==================================================

                if (
                  phoneSessions.has(phone)
                ) {

                  const existingId =
                    phoneSessions.get(
                      phone
                    )

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

                // ==================================================
                // MAX SESSIONS
                // ==================================================

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
                        'Too many active sessions. Try again later.'
                    })
                  )

                  return
                }

                // ==================================================
                // CREATE SESSION
                // ==================================================

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

        // ====================================================
        // NOT FOUND
        // ====================================================

        res.writeHead(404)

        res.end('Not found')

      } catch (error) {

        console.log(
          '❌ Web server error:',
          error.message
        )

        if (!res.headersSent) {
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

  const sessionId =
    makeSessionId()

  const sessionDir =
    path.join(
      AUTH_ROOT,
      sessionId
    )

  fs.mkdirSync(
    sessionDir,
    {
      recursive: true
    }
  )

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      sessionDir
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

      syncFullHistory: false

    })

  const session = {

    id: sessionId,

    phone: phone,

    sock: sock,

    state: state,

    pairingCode: null,

    paired: false,

    reconnecting: false,

    createdAt: Date.now()

  }

  sessions.set(
    sessionId,
    session
  )

  phoneSessions.set(
    phone,
    sessionId
  )

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
  // CONNECTION UPDATE
  // ==========================================================

  sock.ev.on(
    'connection.update',
    async update => {

      const {
        connection,
        lastDisconnect
      } = update

      // ======================================================
      // OPEN
      // ======================================================

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

      // ======================================================
      // CLOSE
      // ======================================================

      if (
        connection === 'close'
      ) {

        const statusCode =
          new Boom(
            lastDisconnect?.error
          )?.output?.statusCode

        console.log(
          `❌ Session ${sessionId} closed. Status: ${statusCode}`
        )

        const loggedOut =
          statusCode ===
          DisconnectReason.loggedOut

        if (loggedOut) {

          console.log(
            `🔐 ${phone} logged out.`
          )

          sessions.delete(
            sessionId
          )

          if (
            phoneSessions.get(
              phone
            ) === sessionId
          ) {

            phoneSessions.delete(
              phone
            )
          }

          return
        }

        if (
          session.reconnecting
        ) {
          return
        }

        session.reconnecting = true

        console.log(
          `🔄 Reconnecting ${phone} in 10 seconds...`
        )

        setTimeout(
          async () => {

            try {

              sessions.delete(
                sessionId
              )

              if (
                phoneSessions.get(
                  phone
                ) === sessionId
              ) {

                phoneSessions.delete(
                  phone
                )
              }

              await createWhatsAppSession(
                phone
              )

            } catch (error) {

              console.log(
                '❌ Reconnection error:',
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
  // GENERATE PAIRING CODE
  // ==========================================================

  try {

    await sleep(4000)

    if (
      state.creds.registered
    ) {

      return {
        success: true,
        code: 'ALREADY_CONNECTED'
      }
    }

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
      '❌ Could not generate pairing code:',
      error.message
    )

    sessions.delete(
      sessionId
    )

    if (
      phoneSessions.get(
        phone
      ) === sessionId
    ) {

      phoneSessions.delete(
        phone
      )
    }

    try {

      sock.end(
        new Error(
          'Pairing failed'
        )
      )

    } catch {}

    throw new Error(
      'WhatsApp rejected the pairing request. Check the number and try again.'
    )
  }
}

// ============================================================
// GROUP BOT FEATURES
// ============================================================

function setupGroupFeatures(
  sock
) {

  // ==========================================================
  // WARNING SYSTEM
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

    // ========================================================
    // REMOVE AFTER 5 WARNINGS
    // ========================================================

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
          '❌ Could not remove user:',
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

        // ====================================================
        // WELCOME
        // ====================================================

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

        // ====================================================
        // PROMOTE
        // ====================================================

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

        // ====================================================
        // DEMOTE
        // ====================================================

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
  // MESSAGE HANDLER
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

        // ====================================================
        // GET GROUP ADMINS
        // ====================================================

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

        // IMPORTANT:
        // This is the corrected JavaScript regex.

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
          /@status\b/i.test(text)

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
        // COMMAND CHECK
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
        // FIND TARGET
        // ====================================================

        let target = null

        const context =
          msg.message
            ?.extendedTextMessage
            ?.contextInfo

        const mentioned =
          context?.mentionedJid

        if (
          mentioned &&
          mentioned.length > 0
        ) {

          target =
            mentioned[0]

        } else if (
          parts[0]
        ) {

          const targetNumber =
            parts[0]
              .replace(
                '@',
                ''
              )
              .replace(
                /\D/g,
                ''
              )

          if (
            targetNumber
          ) {

            target =
              `${targetNumber}@s.whatsapp.net`
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

          // ==================================================
          // MENU
          // ==================================================

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

          // ==================================================
          // WARN
          // ==================================================

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

          // ==================================================
          // WARNINGS
          // ==================================================

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

            break

          // ==================================================
          // RESET
          // ==================================================

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

          // ==================================================
          // KICK
          // ==================================================

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
                'Kick error:',
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

          // ==================================================
          // RULES
          // ==================================================

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

          // ==================================================
          // UNKNOWN COMMAND
          // ==================================================

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

console.log(
  '================================'
)

console.log(
  '🤖 GROUPGUARD STARTING...'
)

console.log(
  '================================'
)

console.log('')

startWebServer()