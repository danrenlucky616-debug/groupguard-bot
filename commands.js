
// ============================================================
// GROUPGUARD
// ADMIN COMMANDS
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

// ------------------------------------------------------------
// GET COMMAND TEXT
// ------------------------------------------------------------

function getCommandText(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    ''
  ).trim()
}

// ------------------------------------------------------------
// PARSE COMMAND
// ------------------------------------------------------------

function parseCommand(text) {
  if (!text.startsWith(config.PREFIX)) {
    return null
  }

  const parts = text
    .slice(config.PREFIX.length)
    .trim()
    .split(/\s+/)

  const command = (
    parts.shift() || ''
  ).toLowerCase()

  return {
    command,
    args: parts
  }
}

// ------------------------------------------------------------
// GET TARGET
// ------------------------------------------------------------

function getMentionedUser(message) {
  const context =
    message?.message?.extendedTextMessage
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

// ------------------------------------------------------------
// GET REPLIED USER
// ------------------------------------------------------------

function getRepliedUser(message) {
  const context =
    message?.message?.extendedTextMessage
      ?.contextInfo

  const participant =
    context?.participant

  return participant || null
}

// ------------------------------------------------------------
// GET TARGET USER
// ------------------------------------------------------------

function getTargetUser(message) {
  return (
    getMentionedUser(message) ||
    getRepliedUser(message)
  )
}

// ------------------------------------------------------------
// SEND MESSAGE
// ------------------------------------------------------------

async function sendText(
  sock,
  jid,
  text,
  mentions = []
) {
  await sock.sendMessage(
    jid,
    {
      text,
      mentions
    }
  )
}

// ------------------------------------------------------------
// REQUIRE ADMIN
// ------------------------------------------------------------

async function requireAdmin(
  sock,
  message,
  groupId,
  senderId
) {
  const admin =
    await isAdmin(
      sock,
      groupId,
      senderId
    )

  if (!admin) {
    // IMPORTANT:
    // Normal users get NO reply.
    return false
  }

  return true
}

// ------------------------------------------------------------
// REQUIRE BOT ADMIN
// ------------------------------------------------------------

async function requireBotAdmin(
  sock,
  groupId
) {
  return await botIsAdmin(
    sock,
    groupId
  )
}

// ------------------------------------------------------------
// MENU
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// PING
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// WARN
// ------------------------------------------------------------

async function warn(
  sock,
  message,
  groupId,
  senderId
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
          'Manual warnings'
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

  await sendText(
    sock,
    groupId,
    messages.warning(
      username,
      count,
      config.MANUAL_WARNING_LIMIT,
      'Manual warning'
    ),
    [target]
  )
}

// ------------------------------------------------------------
// WARNINGS
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// RESET WARNINGS
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// KICK
// ------------------------------------------------------------

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
      messages.removed(
        target.split('@')[0],
        'Admin action'
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

// ------------------------------------------------------------
// ANTI-LINK
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// ANTI-SPAM
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// STATUS PROTECTION
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// RULES
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// BOT STATUS
// ------------------------------------------------------------

async function botstatus(
  sock,
  groupId
) {
  await sendText(
    sock,
    groupId,
    messages.botStatus
  )
}

// ------------------------------------------------------------
// COMMAND HANDLER
// ------------------------------------------------------------

async function handleCommand(
  sock,
  message
) {
  try {
    if (
      !isGroup(message)
    ) {
      return
    }

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

    const groupId =
      getGroupId(message)

    const senderId =
      getSenderId(message)

    // --------------------------------------------------------
    // ADMIN ONLY
    // --------------------------------------------------------

    const admin =
      await requireAdmin(
        sock,
        message,
        groupId,
        senderId
      )

    if (!admin) {
      return
    }

    // --------------------------------------------------------
    // COMMANDS
    // --------------------------------------------------------

    switch (command) {
      case 'menu':
      case 'help':
        await menu(
          sock,
          groupId
        )
        break

      case 'ping':
        await ping(
          sock,
          groupId
        )
        break

      case 'warn':
        await warn(
          sock,
          message,
          groupId,
          senderId
        )
        break

      case 'warnings':
      case 'warns':
        await warnings(
          sock,
          message,
          groupId
        )
        break

      case 'resetwarn':
        await resetwarn(
          sock,
          message,
          groupId
        )
        break

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
        }
        break

      case 'antilink':
        await antilink(
          sock,
          groupId,
          args
        )
        break

      case 'antispam':
        await antispam(
          sock,
          groupId,
          args
        )
        break

      case 'antistatus':
        await antistatus(
          sock,
          groupId,
          args
        )
        break

      case 'rules':
        await rules(
          sock,
          groupId
        )
        break

      case 'botstatus':
      case 'status':
        await botstatus(
          sock,
          groupId
        )
        break

      default:
        // Unknown commands are silently ignored.
        return
    }

  } catch (error) {
    console.error(
      '❌ Command error:',
      error.message
    )
  }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  getCommandText,
  parseCommand,
  getMentionedUser,
  getRepliedUser,
  getTargetUser,
  handleCommand
}