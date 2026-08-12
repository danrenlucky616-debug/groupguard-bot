// ===============================
// GROUPGUARD
// ===============================

const http = require('http')

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const { Boom } = require('@hapi/boom')
const fs = require('fs')

const PREFIX = '.'
const BOT_NAME = 'GroupGuard'
const WARN_LIMIT = 5

const DB_FILE = './warnings.json'
const AUTH_DIR = './auth_info'

const PHONE_NUMBER = process.env.PHONE_NUMBER

// ===============================
// RENDER WEB SERVER
// ===============================

const PORT = process.env.PORT || 3000

http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  })

  res.end('GroupGuard is running')
}).listen(PORT, () => {
  console.log(`🌐 GroupGuard web server running on port ${PORT}`)
})

// ===============================
// DATABASE
// ===============================

let db = {}

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(
      fs.readFileSync(DB_FILE, 'utf8')
    )
  } catch {
    console.log(
      '⚠️ Could not read warnings database.'
    )

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

// ===============================
// HELPERS
// ===============================

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
  return `@${user.split('@')[0]}`
}

// ===============================
// WARNING SYSTEM
// ===============================

async function sendWarning(
  sock,
  groupId,
  userId,
  reason
) {

  const user = getUser(
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
      mentions: [userId]
    }
  )

  if (user.warnings >= WARN_LIMIT) {

    await sock.sendMessage(
      groupId,
      {
        text:
          `🔨 ${mention(userId)} has reached ${WARN_LIMIT} warnings.\n` +
          `You have been removed from the GC. 🚫`,
        mentions: [userId]
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

// ===============================
// BOT CONNECTION
// ===============================

let reconnecting = false
let pairingRequested = false

async function startBot() {

  if (reconnecting) {
    return
  }

  reconnecting = true
  pairingRequested = false

  try {

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      AUTH_DIR
    )

    const sock = makeWASocket({

      auth: state,

      printQRInTerminal: false,

      browser: [
        'GroupGuard',
        'Chrome',
        '1.0.0'
      ],

      markOnlineOnConnect: false,

      syncFullHistory: false,

      connectTimeoutMs: 60000
    })

    sock.ev.on(
      'creds.update',
      saveCreds
    )

    // ===============================
    // CONNECTION UPDATE
    // ===============================

    sock.ev.on(
      'connection.update',
      async update => {

        const {
          connection,
          qr,
          lastDisconnect
        } = update

        // ===============================
        // PAIRING CODE
        // ===============================

        if (
          !sock.authState.creds.registered &&
          qr &&
          !pairingRequested
        ) {

          pairingRequested = true

          if (!PHONE_NUMBER) {

            console.log('')
            console.log(
              '❌ PHONE_NUMBER is missing.'
            )
            console.log(
              'Add PHONE_NUMBER in Render Environment Variables.'
            )
            console.log('')

            return
          }

          const cleanNumber =
            PHONE_NUMBER.replace(/\D/g, '')

          if (!cleanNumber) {

            console.log(
              '❌ PHONE_NUMBER is invalid.'
            )

            return
          }

          try {

            console.log(
              '📱 Requesting WhatsApp pairing code...'
            )

            const code =
              await sock.requestPairingCode(
                cleanNumber
              )

            console.log('')
            console.log(
              '================================'
            )
            console.log(
              '📱 GROUPGUARD PAIRING CODE'
            )
            console.log(
              '================================'
            )
            console.log(
              `🔐 CODE: ${code}`
            )
            console.log(
              '================================'
            )
            console.log(
              'On WhatsApp:'
            )
            console.log(
              'Linked Devices → Link a device'
            )
            console.log(
              '→ Link with phone number'
            )
            console.log(
              '→ Enter the code above'
            )
            console.log(
              '================================'
            )
            console.log('')

          } catch (error) {

            pairingRequested = false

            console.log(
              '❌ Could not generate pairing code:',
              error.message
            )
          }
        }

        // ===============================
        // ONLINE
        // ===============================

        if (connection === 'open') {

          reconnecting = false
          pairingRequested = false

          console.log('')
          console.log(
            '================================'
          )
          console.log(
            '✅ GROUPGUARD IS ONLINE!'
          )
          console.log(
            '================================'
          )
          console.log('')
        }

        // ===============================
        // CLOSED
        // ===============================

        if (connection === 'close') {

          reconnecting = false

          const statusCode =
            new Boom(
              lastDisconnect?.error
            )?.output?.statusCode

          const shouldReconnect =
            statusCode !==
            DisconnectReason.loggedOut

          console.log(
            '❌ WhatsApp connection closed.'
          )

          console.log(
            'Status:',
            statusCode
          )

          if (shouldReconnect) {

            console.log(
              '🔄 Reconnecting in 10 seconds...'
            )

            setTimeout(
              () => {
                startBot()
              },
              10000
            )

          } else {

            console.log(
              '🔐 WhatsApp logged out.'
            )

            console.log(
              'Pair the account again.'
            )
          }
        }
      }
    )

    // ===============================
    // GROUP PARTICIPANTS
    // ===============================

    sock.ev.on(
      'group-participants.update',
      async update => {

        if (update.action === 'add') {

          for (
            const user of update.participants
          ) {

            try {

              await sock.sendMessage(
                update.id,
                {
                  text:
                    `👋 Welcome ${mention(user)} to the group! 🎉\n` +
                    `Please read and follow the GC rules. 🙏`,
                  mentions: [user]
                }
              )

            } catch (error) {

              console.log(
                'Welcome error:',
                error.message
              )
            }
          }
        }

        // ===============================
        // ADMIN PROMOTED
        // ===============================

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

        // ===============================
        // ADMIN DEMOTED
        // ===============================

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
      }
    )

    // ===============================
    // MESSAGE HANDLER
    // ===============================

    sock.ev.on(
      'messages.upsert',
      async ({ messages }) => {

        try {

          const msg = messages[0]

          if (
            !msg?.message ||
            msg.key.fromMe
          ) {
            return
          }

          const groupId =
            msg.key.remoteJid

          if (
            !groupId ||
            !groupId.endsWith('@g.us')
          ) {
            return
          }

          const sender =
            msg.key.participant ||
            msg.participant ||
            msg.key.remoteJid

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
            admins.includes(sender)

          const userData =
            getUser(
              groupId,
              sender
            )

          // ===============================
          // ANTI-LINK
          // ===============================

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
                  delete: msg.key
                }
              )

            } catch {}

            await sendWarning(
              sock,
              groupId,
              sender,
              'Links are not allowed 🚫'
            )

            return
          }

          // ===============================
          // STATUS MENTION
          // ===============================

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
                  delete: msg.key
                }
              )

            } catch {}

            await sendWarning(
              sock,
              groupId,
              sender,
              'Status mentions are not allowed 🚫'
            )

            return
          }

          // ===============================
          // ANTI-SPAM
          // ===============================

          if (!userData.msgTimes) {
            userData.msgTimes = []
          }

          const now = Date.now()

          userData.msgTimes =
            userData.msgTimes.filter(
              time =>
                now - time < 10000
            )

          userData.msgTimes.push(now)

          if (
            userData.msgTimes.length >= 6 &&
            !isAdmin
          ) {

            userData.msgTimes = []

            saveDB()

            await sendWarning(
              sock,
              groupId,
              sender,
              'Stop spamming 🚫'
            )

            return
          }

          saveDB()

          // ===============================
          // COMMANDS
          // ===============================

          if (
            !text.startsWith(PREFIX)
          ) {
            return
          }

          const parts =
            text
              .slice(PREFIX.length)
              .trim()
              .split(/\s+/)

          const command =
            parts
              .shift()
              ?.toLowerCase()

          const targetNumber =
            parts[0]
              ?.replace('@', '')
              .replace(/\D/g, '')

          const target =
            targetNumber
              ? `${targetNumber}@s.whatsapp.net`
              : null

          // ===============================
          // ADMIN COMMANDS
          // ===============================

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
                mentions: [sender]
              }
            )

            return
          }

          // ===============================
          // COMMANDS
          // ===============================

          switch (command) {

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

            // ===============================
            // WARN
            // ===============================

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
                sock,
                groupId,
                target,
                'Manual warning issued by an admin.'
              )

              break

            // ===============================
            // WARNINGS
            // ===============================

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
                  mentions: [target]
                }
              )

              break

            // ===============================
            // RESET
            // ===============================

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
                  mentions: [target]
                }
              )

              break

            // ===============================
            // KICK
            // ===============================

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

              } catch {

                await sock.sendMessage(
                  groupId,
                  {
                    text:
                      '❌ I could not remove that user.'
                  }
                )
              }

              break

            // ===============================
            // RULES
            // ===============================

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

            // ===============================
            // UNKNOWN COMMAND
            // ===============================

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

  } catch (error) {

    reconnecting = false

    console.error(
      '❌ Failed to start GroupGuard:',
      error.message
    )

    setTimeout(
      () => {
        startBot()
      },
      10000
    )
  }
}

// ===============================
// START
// ===============================

console.log('')
console.log('================================')
console.log('🤖 GROUPGUARD STARTING...')
console.log('================================')
console.log('')

startBot()