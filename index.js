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

const BOT_NAME = 'GroupGuard'
const PREFIX = '.'
const WARN_LIMIT = 5

const PORT = Number(process.env.PORT) || 10000

const AUTH_ROOT = path.join(__dirname, 'auth')
const DB_FILE = path.join(__dirname, 'warnings.json')

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
  } catch {
    db = {}
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    )
  } catch (err) {
    console.log('Database save error:', err.message)
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

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sessionId() {
  return crypto.randomBytes(16).toString('hex')
}

function mention(jid) {
  return '@' + String(jid).split('@')[0]
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
// SESSIONS
// ============================================================

// id -> session
const sessions = new Map()

// phone -> id
const phoneSessions = new Map()

// ============================================================
// PAIRING PAGE
// ============================================================

const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>GroupGuard</title>

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
  max-width: 430px;

  background: #191919;

  border-radius: 22px;

  padding: 28px;

  box-shadow: 0 10px 40px rgba(0,0,0,.45);
}

.logo {
  text-align: center;
  font-size: 48px;
}

h1 {
  text-align: center;
  margin: 8px 0;
}

.sub {
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
}

button {
  width: 100%;

  margin-top: 15px;

  padding: 15px;

  border: 0;
  border-radius: 12px;

  background: #25D366;

  color: #000;

  font-size: 16px;
  font-weight: bold;
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

.codeBox {
  display: none;

  margin-top: 20px;

  padding: 20px;

  border-radius: 15px;

  background: #0d0d0d;

  text-align: center;
}

.code {
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

  text-align: center;

  color: #777;

  font-size: 13px;
}

</style>
</head>

<body>

<div class="card">

<div class="logo">🤖</div>

<h1>GroupGuard</h1>

<div class="sub">
WhatsApp Group Protection
</div>

<label>WhatsApp number</label>

<input
  id="phone"
  type="tel"
  placeholder="2348012345678"
  autocomplete="off"
/>

<button id="btn" onclick="pair()">
GET PAIRING CODE
</button>

<div id="message" class="message"></div>

<div id="codeBox" class="codeBox">

<div>🔐 Your Pairing Code</div>

<div id="code" class="code"></div>

<div>Enter this code in WhatsApp.</div>

</div>

<div class="steps">

<b>How to connect</b><br>

1. Enter your number in international format.<br>
2. Tap GET PAIRING CODE.<br>
3. Open WhatsApp.<br>
4. Go to Linked Devices.<br>
5. Tap Link a device.<br>
6. Tap Link with phone number instead.<br>
7. Enter the code shown here.

</div>

<div class="small">

Example: 2348012345678

<br>

No + sign. No spaces.

</div>

</div>

<script>

async function pair() {

  const input = document.getElementById('phone')
  const btn = document.getElementById('btn')
  const message = document.getElementById('message')
  const box = document.getElementById('codeBox')
  const code = document.getElementById('code')

  let phone = input.value.replace(/\\D/g, '')

  message.innerHTML = ''
  box.style.display = 'none'

  if (!phone) {

    message.innerHTML =
      '<div class="error">Enter your WhatsApp number.</div>'

    return
  }

  if (phone.length < 10 || phone.length > 15) {

    message.innerHTML =
      '<div class="error">Invalid international number.</div>'

    return
  }

  btn.disabled = true
  btn.innerText = 'CONNECTING...'

  try {

    const response = await fetch('/api/pair', {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        phone: phone
      })

    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.error || 'Pairing failed.'
      )
    }

    if (data.connected) {

      message.innerHTML =
        '<div class="success">✅ This number is already connected.</div>'

      return
    }

    code.innerText = data.code

    box.style.display = 'block'

    message.innerHTML =
      '<div class="success">✅ Code ready. Enter it in WhatsApp now.</div>'

  } catch (err) {

    message.innerHTML =
      '<div class="error">' +
      err.message +
      '</div>'

  } finally {

    btn.disabled = false
    btn.innerText = 'GET PAIRING CODE'

  }
}

</script>

</body>
</html>
`

// ============================================================
// WEB SERVER
// ============================================================

function startServer() {

  const server = http.createServer((req, res) => {

    // --------------------------------------------------------
    // HOME
    // --------------------------------------------------------

    if (
      req.method === 'GET' &&
      req.url === '/'
    ) {

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      })

      res.end(HTML)

      return
    }

    // --------------------------------------------------------
    // HEALTH
    // --------------------------------------------------------

    if (
      req.method === 'GET' &&
      req.url === '/health'
    ) {

      res.writeHead(200, {
        'Content-Type': 'application/json'
      })

      res.end(JSON.stringify({
        status: 'ok',
        bot: BOT_NAME,
        sessions: sessions.size
      }))

      return
    }

    // --------------------------------------------------------
    // PAIR
    // --------------------------------------------------------

    if (
      req.method === 'POST' &&
      req.url === '/api/pair'
    ) {

      let body = ''

      req.on('data', chunk => {

        body += chunk.toString()

        if (body.length > 5000) {
          req.destroy()
        }

      })

      req.on('end', async () => {

        try {

          const data =
            JSON.parse(body || '{}')

          const phone =
            cleanPhone(data.phone)

          if (
            phone.length < 10 ||
            phone.length > 15
          ) {

            return sendJSON(
              res,
              400,
              {
                error: 'Invalid WhatsApp number.'
              }
            )
          }

          // Existing session
          const existingId =
            phoneSessions.get(phone)

          if (existingId) {

            const existing =
              sessions.get(existingId)

            if (existing) {

              if (existing.paired) {

                return sendJSON(
                  res,
                  200,
                  {
                    connected: true
                  }
                )
              }

              if (existing.pairingCode) {

                return sendJSON(
                  res,
                  200,
                  {
                    success: true,
                    code:
                      existing.pairingCode
                  }
                )
              }

              return sendJSON(
                res,
                409,
                {
                  error:
                    'This number is already connecting. Wait a moment.'
                }
              )
            }

            phoneSessions.delete(phone)
          }

          if (
            sessions.size >= MAX_SESSIONS
          ) {

            return sendJSON(
              res,
              503,
              {
                error:
                  'Server is currently full. Try again later.'
              }
            )
          }

          const result =
            await createSession(phone)

          return sendJSON(
            res,
            200,
            result
          )

        } catch (err) {

          console.log(
            'Pairing API error:',
            err.message
          )

          return sendJSON(
            res,
            500,
            {
              error:
                err.message ||
                'Could not create pairing session.'
            }
          )
        }

      })

      return
    }

    res.writeHead(404)
    res.end('Not found')

  })

  server.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        `🌐 GroupGuard web server running on port ${PORT}`
      )

    }
  )
}

function sendJSON(res, status, data) {

  res.writeHead(status, {
    'Content-Type': 'application/json'
  })

  res.end(
    JSON.stringify(data)
  )
}

// ============================================================
// CREATE WHATSAPP SESSION
// ============================================================

async function createSession(phone) {

  const id = sessionId()

  const authDir =
    path.join(
      AUTH_ROOT,
      id
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

      syncFullHistory: false

    })

  const session = {

    id,

    phone,

    sock,

    pairingCode: null,

    paired: false,

    reconnecting: false

  }

  sessions.set(id, session)
  phoneSessions.set(phone, id)

  sock.ev.on(
    'creds.update',
    saveCreds
  )

  setupGroupBot(sock)

  // ----------------------------------------------------------
  // CONNECTION
  // ----------------------------------------------------------

  sock.ev.on(
    'connection.update',
    async update => {

      const {
        connection,
        lastDisconnect
      } = update

      console.log(
        `📡 ${phone} connection: ${connection || 'starting'}`
      )

      // ------------------------------------------------------
      // OPEN
      // ------------------------------------------------------

      if (
        connection === 'open'
      ) {

        session.paired = true

        console.log(
          `✅ ${phone} GROUPGUARD CONNECTED`
        )

        return
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

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          removeSession(session)

          return
        }

        if (
          !session.reconnecting
        ) {

          session.reconnecting = true

          console.log(
            `🔄 ${phone} reconnecting...`
          )

          setTimeout(
            async () => {

              removeSession(session)

              try {

                await createSession(phone)

              } catch (err) {

                console.log(
                  `❌ Reconnect failed for ${phone}:`,
                  err.message
                )

              }

            },
            5000
          )
        }
      }

    }
  )

  // ----------------------------------------------------------
  // PAIRING
  // ----------------------------------------------------------

  await sleep(3000)

  if (
    state.creds.registered
  ) {

    session.paired = true

    return {
      connected: true
    }
  }

  try {

    console.log(
      `🔗 Requesting pairing code for ${phone}...`
    )

    const code =
      await sock.requestPairingCode(
        phone
      )

    session.pairingCode = code

    console.log(
      `🔐 Pairing code for ${phone}: ${code}`
    )

    return {

      success: true,

      code

    }

  } catch (err) {

    console.log(
      `❌ Pairing failed for ${phone}:`,
      err.message
    )

    removeSession(session)

    throw new Error(
      'WhatsApp rejected the pairing request. Check the number and try again.'
    )
  }
}

// ============================================================
// REMOVE SESSION
// ============================================================

function removeSession(session) {

  sessions.delete(session.id)

  if (
    phoneSessions.get(
      session.phone
    ) === session.id
  ) {

    phoneSessions.delete(
      session.phone
    )
  }

}

// ============================================================
// GROUP BOT
// ============================================================

function setupGroupBot(sock) {

  // ==========================================================
  // WARNING
  // ==========================================================

  async function warn(
    group,
    user,
    reason
  ) {

    const data =
      getUser(
        group,
        user
      )

    data.warnings += 1

    saveDB()

    await sock.sendMessage(
      group,
      {
        text:
          `⚠️ ${mention(user)} Warning ${data.warnings}/${WARN_LIMIT}\n` +
          `${reason}\n` +
          `Please follow the GC rules. 🙏`,

        mentions: [
          user
        ]
      }
    )

    if (
      data.warnings >= WARN_LIMIT
    ) {

      await sock.sendMessage(
        group,
        {
          text:
            `🔨 ${mention(user)} has reached ${WARN_LIMIT} warnings.\n` +
            `You have been removed from the GC. 🚫`,

          mentions: [
            user
          ]
        }
      )

      try {

        await sock.groupParticipantsUpdate(
          group,
          [user],
          'remove'
        )

      } catch (err) {

        console.log(
          '❌ Remove error:',
          err.message
        )
      }

      data.warnings = 0

      saveDB()
    }
  }

  // ==========================================================
  // PARTICIPANTS
  // ==========================================================

  sock.ev.on(
    'group-participants.update',
    async update => {

      try {

        if (
          update.action === 'add'
        ) {

          for (
            const user of update.participants
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

      } catch (err) {

        console.log(
          'Participant error:',
          err.message
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

        const msg = messages?.[0]

        if (
          !msg?.message ||
          msg.key?.fromMe
        ) {
          return
        }

        const group =
          msg.key?.remoteJid

        if (
          !group ||
          !group.endsWith('@g.us')
        ) {
          return
        }

        const sender =
          msg.key?.participant

        if (!sender) {
          return
        }

        const text =
          getText(msg).trim()

        const metadata =
          await sock.groupMetadata(
            group
          )

        const admins =
          metadata.participants
            .filter(
              p => p.admin
            )
            .map(
              p => p.id
            )

        const isAdmin =
          admins.includes(sender)

        const user =
          getUser(
            group,
            sender
          )

        // ====================================================
        // ANTI LINK
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
              group,
              {
                delete: msg.key
              }
            )

          } catch {}

          await warn(
            group,
            sender,
            'Links are not allowed 🚫'
          )

          return
        }

        // ====================================================
        // STATUS
        // ====================================================

        const statusMention =
          /@status\b/i.test(text)

        if (
          statusMention &&
          !isAdmin
        ) {

          try {

            await sock.sendMessage(
              group,
              {
                delete: msg.key
              }
            )

          } catch {}

          await warn(
            group,
            sender,
            'Status mentions are not allowed 🚫'
          )

          return
        }

        // ====================================================
        // SPAM
        // ====================================================

        const now =
          Date.now()

        user.msgTimes =
          (user.msgTimes || [])
            .filter(
              t => now - t < 10000
            )

        user.msgTimes.push(now)

        if (
          user.msgTimes.length >= 6 &&
          !isAdmin
        ) {

          user.msgTimes = []

          saveDB()

          await warn(
            group,
            sender,
            'Stop spamming 🚫'
          )

          return
        }

        saveDB()

        // ====================================================
        // COMMANDS
        // ====================================================

        if (
          !text.startsWith(PREFIX)
        ) {
          return
        }

        const parts =
          text
            .slice(1)
            .trim()
            .split(/\s+/)

        const command =
          parts
            .shift()
            ?.toLowerCase()

        const context =
          msg.message
            ?.extendedTextMessage
            ?.contextInfo

        let target =
          context?.mentionedJid?.[0] ||
          null

        if (
          !target &&
          parts[0]
        ) {

          const number =
            parts[0]
              .replace('@', '')
              .replace(/\D/g, '')

          if (number) {
            target =
              number +
              '@s.whatsapp.net'
          }
        }

        // ====================================================
        // ADMIN ONLY
        // ====================================================

        if (
          ['warn', 'reset', 'kick']
            .includes(command) &&
          !isAdmin
        ) {

          await sock.sendMessage(
            group,
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
        // COMMAND SWITCH
        // ====================================================

        switch (command) {

          case 'menu':
          case 'help':

            await sock.sendMessage(
              group,
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

          case 'warn':

            if (!target) {

              await sock.sendMessage(
                group,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .warn @user'
                }
              )

              return
            }

            await warn(
              group,
              target,
              'Manual warning issued by an admin.'
            )

            break

          case 'warnings':

            if (!target) {

              await sock.sendMessage(
                group,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .warnings @user'
                }
              )

              return
            }

            const targetData =
              getUser(
                group,
                target
              )

            await sock.sendMessage(
              group,
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

          case 'reset':

            if (!target) {

              await sock.sendMessage(
                group,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .reset @user'
                }
              )

              return
            }

            getUser(
              group,
              target
            ).warnings = 0

            saveDB()

            await sock.sendMessage(
              group,
              {
                text:
                  `✅ Warnings reset for ${mention(target)}.`,

                mentions: [
                  target
                ]
              }
            )

            break

          case 'kick':

            if (!target) {

              await sock.sendMessage(
                group,
                {
                  text:
                    '⚠️ Mention a user.\nExample: .kick @user'
                }
              )

              return
            }

            try {

              await sock.groupParticipantsUpdate(
                group,
                [target],
                'remove'
              )

              await sock.sendMessage(
                group,
                {
                  text:
                    `👢 ${mention(target)} has been removed from the group.`,

                  mentions: [
                    target
                  ]
                }
              )

            } catch {

              await sock.sendMessage(
                group,
                {
                  text:
                    '❌ I could not remove that user. Make sure I am a group admin.'
                }
              )
            }

            break

          case 'rules':

            await sock.sendMessage(
              group,
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

          default:

            await sock.sendMessage(
              group,
              {
                text:
                  '❓ Unknown command.\nType .menu to see available commands. 🤖'
              }
            )
        }

      } catch (err) {

        console.log(
          '❌ Message handler error:',
          err.message
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

startServer()