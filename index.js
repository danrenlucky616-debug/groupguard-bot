// ===============================
// GROUPGUARD
// ===============================

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

// ===============================
// DATABASE
// ===============================

let db = {}

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch (error) {
    console.log('⚠️ Could not read warnings database. Starting fresh.')
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
    console.log('❌ Could not save database:', error.message)
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
  const user = getUser(groupId, userId)

  user.warnings += 1
  saveDB()

  await sock.sendMessage(groupId, {
    text:
      `⚠️ ${mention(userId)} Warning ${user.warnings}/${WARN_LIMIT}\n` +
      `${reason}\n` +
      `Please follow the GC rules. 🙏`,
    mentions: [userId]
  })

  if (user.warnings >= WARN_LIMIT) {

    await sock.sendMessage(groupId, {
      text:
        `🔨 ${mention(userId)} has reached ${WARN_LIMIT} warnings.\n` +
        `You have been removed from the GC. 🚫`,
      mentions: [userId]
    })

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
// START BOT
// ===============================

let starting = false

async function startBot() {

  if (starting) {
    return
  }

  starting = true

  try {

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(AUTH_DIR)

    const sock = makeWASocket({
      auth: state,
      browser: [
        'GroupGuard',
        'Chrome',
        '1.0.0'
      ],

      // Do NOT use printQRInTerminal.
      // We handle QR through connection.update.
      printQRInTerminal: false
    })

    sock.ev.on(
      'creds.update',
      saveCreds
    )

    // ===============================
    // CONNECTION
    // ===============================

    sock.ev.on(
      'connection.update',
      async update => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update

        // -------------------------------
        // QR CODE
        // -------------------------------

        if (qr) {

          console.log('')
          console.log('================================')
          console.log('📱 GROUPGUARD WHATSAPP QR')
          console.log('================================')
          console.log(
            'QR received successfully.'
          )
          console.log(
            'A secure QR display/pairing system will be added next.'
          )
          console.log('================================')
          console.log('')
        }

        // -------------------------------
        // CONNECTED
        // -------------------------------

        if (connection === 'open') {

          starting = false

          console.log('')
          console.log('================================')
          console.log('✅ GROUPGUARD IS ONLINE!')
          console.log('================================')
          console.log('')
        }

        // -------------------------------
        // CLOSED
        // -------------------------------

        if (connection === 'close') {

          starting = false

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
              '🔄 Reconnecting in 5 seconds...'
            )

            setTimeout(() => {
              startBot()
            }, 5000)

          } else {

            console.log(
              '🔐 WhatsApp logged out.'
            )

            console.log(
              'A new connection is required.'
            )
          }
        }
      }
    )

    // ===============================
    // WELCOME / ADMIN EVENTS
    // ===============================

    sock.ev.on(
      'group-participants.update',
      async update => {

        // Welcome
        if (update.action === 'add') {

          for (
            const user of update.participants
          ) {

            await sock.sendMessage(
              update.id,
              {
                text:
                  `👋 Welcome ${mention(user)} to the group! 🎉\n` +
                  `Please read and follow the GC rules. 🙏`,
                mentions: [user]
              }
            )
          }
        }

        // Promote
        if (update.action === 'promote') {

          await sock.sendMessage(
            update.id,
            {
              text:
                `👮 ${mention(update.participants[0])} is now a group admin.\n` +
                `Use your powers responsibly. 🫡`,
              mentions: update.participants
            }
          )
        }

        // Demote
        if (update.action === 'demote') {

          await sock.sendMessage(
            update.id,
            {
              text:
                `👮 ${mention(update.participants[0])} is no longer a group admin.`,
              mentions: update.participants
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
              .filter(p => p.admin)
              .map(p => p.id)

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
          // ANTI-STATUS MENTION
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
          // COMMAND SWITCH
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

            // -------------------------------
            // WARN
            // -------------------------------

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

            // -------------------------------
            // WARNINGS
            // -------------------------------

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

            // -------------------------------
            // RESET
            // -------------------------------

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

            // -------------------------------
            // KICK
            // -------------------------------

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

            // -------------------------------
            // RULES
            // -------------------------------

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

            // -------------------------------
            // UNKNOWN COMMAND
            // -------------------------------

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

    starting = false

    console.error(
      '❌ Failed to start GroupGuard:',
      error
    )

    setTimeout(() => {
      startBot()
    }, 5000)
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