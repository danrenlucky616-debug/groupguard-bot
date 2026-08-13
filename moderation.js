// ============================================================
// GROUPGUARD v2
// ADMIN COMMAND SYSTEM
// ============================================================

const config = require('./config')
const messages = require('./messages')

const {
  getSenderId,
  getGroupId,
  isGroup,
  isAdmin,
  botIsAdmin
} = require('./admin')

const {
  getGroupSettings,
  updateGroupSettings,
  getWarnings,
  resetWarnings,
  addWarning
} = require('./database')

const {
  removeMember
} = require('./moderation')

// ============================================================
// TEXT EXTRACTION
// ============================================================

function getCommandText(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    ''
  ).trim()
}

// ============================================================
// COMMAND PARSER
// ============================================================

function parseCommand(text) {
  if (
    !text ||
    !text.startsWith(config.PREFIX)
  ) {
    return null
  }

  const parts =
    text
      .slice(config.PREFIX.length)
      .trim()
      .split(/\s+/)

  const command =
    (
      parts.shift() || ''
    ).toLowerCase()

  if (!command) {
    return null
  }

  return {
    command,
    args: parts
  }
}

// ============================================================
// MENTIONED USER
// ============================================================

function getMentionedUser(message) {
  const context =
    message
      ?.message
      ?.extendedTextMessage
      ?.contextInfo

  const mentioned =
    context?.mentionedJid

  if (
    Array.isArray(mentioned) &&
    mentioned.length > 0
  ) {
    return mentioned[0]
  }

  return null
}

// ============================================================
// REPLIED USER
// ============================================================

function getRepliedUser(message) {
  const context =
    message
      ?.message
      ?.extendedTextMessage
      ?.contextInfo

  return (
    context?.participant ||
    null
  )
}

// ============================================================
// TARGET USER
// ============================================================

function getTargetUser(message) {
  return (
    getMentionedUser(message) ||
    getRepliedUser(message)
  )
}

// ============================================================
// SEND TEXT
// ============================================================

async function sendText(
  sock,
  jid,
  text,
  mentions = []
) {
  try {
    await sock.sendMessage(
      jid,
      {
        text,
        mentions
      }
    )

    return true
  } catch (error) {
    console.error(
      '❌ Command message error:',
      error.message
    )

    return false
  }
}

// ============================================================
// REQUIRE ADMIN
//
// IMPORTANT:
// Normal members are completely ignored.
// The bot does NOT send a permission-denied message.
// ============================================================

async function requireAdmin(
  sock,
  groupId,
  senderId
) {
  return await isAdmin(
    sock,
    groupId,
    senderId
  )
}

// ============================================================
// REQUIRE BOT ADMIN
// ============================================================

async function requireBotAdmin(
  sock,
  groupId
) {
  return await botIsAdmin(
    sock,
    groupId
  )
}

// ============================================================
// MENU
// ============================================================

async function menu(
  sock,
  groupId
) {
  await sendText(
    sock,
    groupId,
    messages.menu
  )
}

// ============================================================
// PING
// ============================================================

async function ping(
  sock,
  groupId
) {
  await sendText(
    sock,
    groupId,
    messages.ping
  )
}

// ============================================================
// WARN
// ============================================================

async function warn(
  sock,
  message,
  groupId
) {
  const target =
    getTargetUser(message)

  if (!target) {
    await sendText(
      sock,
      groupId,
      messages.targetRequired
    )

    return
  }

  // Never manually warn admins.
  if (
    await isAdmin(
      sock,
      groupId,
      target
    )
  ) {
    await sendText(
      sock,
      groupId,
      messages.cannotWarnAdmin
    )

    return
  }

  const warnings =
    addWarning(
      groupId,
      target,
      'manual'
    )

  const count =
    warnings.manual

  const username =
    target.split('@')[0]

  // ----------------------------------------------------------
  // MANUAL WARNING LIMIT
  // ----------------------------------------------------------

  if (
    count >=
    config.MANUAL_WARNING_LIMIT
  ) {
    const removed =
      await removeMember(
        sock,
        groupId,
        target
      )

    if (removed) {
      await sendText(
        sock,
        groupId,
        messages.removed(
          username,
          'Manual warnings reached 3/3'
        ),
        [target]
      )
    } else {
      await sendText(
        sock,
        groupId,
        messages.removalFailed
      )
    }

    return
  }

  // ----------------------------------------------------------
  // WARNING
  // ----------------------------------------------------------

  await sendText(
    sock,
    groupId,
    messages.warning(
      username,
      count,
      config.MANUAL_WARNING_LIMIT,
      'Manual administrator warning'
    ),
    [target]
  )
}

// ============================================================
// WARNINGS
// ============================================================

async function warnings(
  sock,
  message,
  groupId
) {
  const target =
    getTargetUser(message)

  if (!target) {
    await sendText(
      sock,
      groupId,
      messages.targetRequired
    )

    return
  }

  const data =
    getWarnings(
      groupId,
      target
    )

  const username =
    target.split('@')[0]

  await sendText(
    sock,
    groupId,
    messages.warnings(
      username,
      data
    ),
    [target]
  )
}

// ============================================================
// RESET WARNINGS
// ============================================================

async function resetwarn(
  sock,
  message,
  groupId
) {
  const target =
    getTargetUser(message)

  if (!target) {
    await sendText(
      sock,
      groupId,
      messages.targetRequired
    )

    return
  }

  resetWarnings(
    groupId,
    target
  )

  await sendText(
    sock,
    groupId,
    messages.warningsReset(
      target.split('@')[0]
    ),
    [target]
  )
}

// ============================================================
// KICK
// ============================================================

async function kick(
  sock,
  message,
  groupId
) {
  const target =
    getTargetUser(message)

  if (!target) {
    await sendText(
      sock,
      groupId,
      messages.targetRequired
    )

    return
  }

  // Never remove another admin.
  if (
    await isAdmin(
      sock,
      groupId,
      target
    )
  ) {
    await sendText(
      sock,
      groupId,
      messages.cannotRemoveAdmin
    )

    return
  }

  const removed =
    await removeMember(
      sock,
      groupId,
      target
    )

  if (removed) {
    await sendText(
      sock,
      groupId,
      messages.kickSuccess(
        target.split('@')[0]
      ),
      [target]
    )
  } else {
    await sendText(
      sock,
      groupId,
      messages.removalFailed
    )
  }
}

// ============================================================
// ANTI-LINK
// ============================================================

async function antilink(
  sock,
  groupId,
  args
) {
  const value =
    args[0]?.toLowerCase()

  if (
    value !== 'on' &&
    value !== 'off'
  ) {
    await sendText(
      sock,
      groupId,
      messages.usageAntilink
    )

    return
  }

  const enabled =
    value === 'on'

  updateGroupSettings(
    groupId,
    {
      antiLink: enabled
    }
  )

  await sendText(
    sock,
    groupId,
    messages.settingChanged(
      'Anti-link',
      enabled
    )
  )
}

// ============================================================
// ANTI-SPAM
// ============================================================

async function antispam(
  sock,
  groupId,
  args
) {
  const value =
    args[0]?.toLowerCase()

  if (
    value !== 'on' &&
    value !== 'off'
  ) {
    await sendText(
      sock,
      groupId,
      messages.usageAntispam
    )

    return
  }

  const enabled =
    value === 'on'

  updateGroupSettings(
    groupId,
    {
      antiSpam: enabled
    }
  )

  await sendText(
    sock,
    groupId,
    messages.settingChanged(
      'Anti-spam',
      enabled
    )
  )
}

// ============================================================
// ANTI-STATUS
// ============================================================

async function antistatus(
  sock,
  groupId,
  args
) {
  const value =
    args[0]?.toLowerCase()

  if (
    value !== 'on' &&
    value !== 'off'
  ) {
    await sendText(
      sock,
      groupId,
      messages.usageAntistatus
    )

    return
  }

  const enabled =
    value === 'on'

  updateGroupSettings(
    groupId,
    {
      antiStatusMention: enabled
    }
  )

  await sendText(
    sock,
    groupId,
    messages.settingChanged(
      'Status protection',
      enabled
    )
  )
}

// ============================================================
// RULES
// ============================================================

async function rules(
  sock,
  groupId
) {
  const settings =
    getGroupSettings(
      groupId
    )

  await sendText(
    sock,
    groupId,
    messages.rules(
      settings
    )
  )
}

// ============================================================
// BOT STATUS
// ============================================================

async function botstatus(
  sock,
  groupId
) {
  await sendText(
    sock,
    groupId,
    messages.botStatus()
  )
}

// ============================================================
// COMMAND HANDLER
// ============================================================

async function handleCommand(
  sock,
  message
) {
  try {

    // --------------------------------------------------------
    // GROUPS ONLY
    // --------------------------------------------------------

    if (
      !isGroup(message)
    ) {
      return
    }

    // --------------------------------------------------------
    // COMMAND TEXT
    // --------------------------------------------------------

    const text =
      getCommandText(message)

    const parsed =
      parseCommand(text)

    if (!parsed) {
      return
    }

    const {
      command,
      args
    } = parsed

    // --------------------------------------------------------
    // GROUP
    // --------------------------------------------------------

    const groupId =
      getGroupId(message)

    if (!groupId) {
      return
    }

    // --------------------------------------------------------
    // SENDER
    // --------------------------------------------------------

    const senderId =
      getSenderId(message)

    if (!senderId) {
      return
    }

    // --------------------------------------------------------
    // ADMIN ONLY
    //
    // IMPORTANT:
    // If sender isn't admin:
    // DO NOTHING.
    // NO reply.
    // --------------------------------------------------------

    const admin =
      await requireAdmin(
        sock,
        groupId,
        senderId
      )

    if (!admin) {
      return
    }

    // ========================================================
    // COMMANDS
    // ========================================================

    switch (command) {

      // ------------------------------------------------------
      // MENU
      // ------------------------------------------------------

      case 'menu':
      case 'help':

        await menu(
          sock,
          groupId
        )

        break

      // ------------------------------------------------------
      // PING
      // ------------------------------------------------------

      case 'ping':

        await ping(
          sock,
          groupId
        )

        break

      // ------------------------------------------------------
      // WARN
      // ------------------------------------------------------

      case 'warn':

        await warn(
          sock,
          message,
          groupId
        )

        break

      // ------------------------------------------------------
      // WARNINGS
      // ------------------------------------------------------

      case 'warnings':
      case 'warns':

        await warnings(
          sock,
          message,
          groupId
        )

        break

      // ------------------------------------------------------
      // RESET WARNINGS
      // ------------------------------------------------------

      case 'resetwarn':

        await resetwarn(
          sock,
          message,
          groupId
        )

        break

      // ------------------------------------------------------
      // KICK
      // ------------------------------------------------------

      case 'kick':
      case 'remove':

        if (
          await requireBotAdmin(
            sock,
            groupId
          )
        ) {

          await kick(
            sock,
            message,
            groupId
          )

        } else {

          await sendText(
            sock,
            groupId,
            messages.botNotAdmin
          )
        }

        break

      // ------------------------------------------------------
      // ANTI-LINK
      // ------------------------------------------------------

      case 'antilink':

        await antilink(
          sock,
          groupId,
          args
        )

        break

      // ------------------------------------------------------
      // ANTI-SPAM
      // ------------------------------------------------------

      case 'antispam':

        await antispam(
          sock,
          groupId,
          args
        )

        break

      // ------------------------------------------------------
      // ANTI-STATUS
      // ------------------------------------------------------

      case 'antistatus':

        await antistatus(
          sock,
          groupId,
          args
        )

        break

      // ------------------------------------------------------
      // RULES
      // ------------------------------------------------------

      case 'rules':

        await rules(
          sock,
          groupId
        )

        break

      // ------------------------------------------------------
      // BOT STATUS
      // ------------------------------------------------------

      case 'botstatus':
      case 'status':

        await botstatus(
          sock,
          groupId
        )

        break

      // ------------------------------------------------------
      // UNKNOWN
      //
      // Unknown commands remain silent.
      // ------------------------------------------------------

      default:
        return
    }

  } catch (error) {

    console.error(
      '❌ Command handler error:',
      error.message
    )

  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getCommandText,
  parseCommand,
  getMentionedUser,
  getRepliedUser,
  getTargetUser,
  handleCommand
}