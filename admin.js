// ============================================================
// GROUPGUARD v2
// ADMIN & PERMISSION SYSTEM
// ============================================================

function normalizeUserId(id = '') {
  if (!id) return ''

  return String(id)
    .split(':')[0]
    .trim()
    .toLowerCase()
}

// ------------------------------------------------------------
// MESSAGE USER
// ------------------------------------------------------------

function getSenderId(message) {
  return normalizeUserId(
    message?.key?.participant ||
    message?.participant ||
    ''
  )
}

// ------------------------------------------------------------
// GROUP ID
// ------------------------------------------------------------

function getGroupId(message) {
  const jid =
    message?.key?.remoteJid || ''

  return jid.endsWith('@g.us')
    ? jid
    : ''
}

// ------------------------------------------------------------
// CHECK GROUP
// ------------------------------------------------------------

function isGroup(message) {
  return Boolean(
    getGroupId(message)
  )
}

// ------------------------------------------------------------
// GROUP METADATA
// ------------------------------------------------------------

async function getGroupMetadata(
  sock,
  groupId
) {
  try {
    if (!sock || !groupId) {
      return null
    }

    return await sock.groupMetadata(
      groupId
    )

  } catch (error) {
    console.error(
      '❌ Group metadata error:',
      error.message
    )

    return null
  }
}

// ------------------------------------------------------------
// FIND PARTICIPANT
// ------------------------------------------------------------

function findParticipant(
  metadata,
  userId
) {
  if (
    !metadata ||
    !Array.isArray(
      metadata.participants
    )
  ) {
    return null
  }

  const target =
    normalizeUserId(userId)

  return (
    metadata.participants.find(
      participant =>
        normalizeUserId(
          participant.id
        ) === target
    ) || null
  )
}

// ------------------------------------------------------------
// IS ADMIN
// ------------------------------------------------------------

async function isAdmin(
  sock,
  groupId,
  userId
) {
  try {
    const metadata =
      await getGroupMetadata(
        sock,
        groupId
      )

    const participant =
      findParticipant(
        metadata,
        userId
      )

    if (!participant) {
      return false
    }

    return (
      participant.admin === 'admin' ||
      participant.admin === 'superadmin'
    )

  } catch (error) {
    console.error(
      '❌ Admin check error:',
      error.message
    )

    return false
  }
}

// ------------------------------------------------------------
// IS GROUP OWNER
// ------------------------------------------------------------

async function isOwner(
  sock,
  groupId,
  userId
) {
  try {
    const metadata =
      await getGroupMetadata(
        sock,
        groupId
      )

    if (!metadata) {
      return false
    }

    const target =
      normalizeUserId(userId)

    if (
      metadata.owner &&
      normalizeUserId(
        metadata.owner
      ) === target
    ) {
      return true
    }

    const participant =
      findParticipant(
        metadata,
        target
      )

    return (
      participant?.admin ===
      'superadmin'
    )

  } catch (error) {
    console.error(
      '❌ Owner check error:',
      error.message
    )

    return false
  }
}

// ------------------------------------------------------------
// GET BOT ID
// ------------------------------------------------------------

function getBotId(sock) {
  return normalizeUserId(
    sock?.user?.id || ''
  )
}

// ------------------------------------------------------------
// IS BOT ADMIN
// ------------------------------------------------------------

async function botIsAdmin(
  sock,
  groupId
) {
  try {
    const botId =
      getBotId(sock)

    if (!botId) {
      return false
    }

    return await isAdmin(
      sock,
      groupId,
      botId
    )

  } catch (error) {
    console.error(
      '❌ Bot admin check error:',
      error.message
    )

    return false
  }
}

// ------------------------------------------------------------
// IS BOT OWNER / CREATOR
// ------------------------------------------------------------
//
// This is useful later for service-level operations.
// It is intentionally separate from WhatsApp group admin
// permissions.
//

function getConnectedPhoneNumber(sock) {
  const id =
    sock?.user?.id || ''

  return normalizeUserId(
    id.split('@')[0]
  )
}

// ------------------------------------------------------------
// GET ADMIN PARTICIPANTS
// ------------------------------------------------------------

async function getGroupAdmins(
  sock,
  groupId
) {
  const metadata =
    await getGroupMetadata(
      sock,
      groupId
    )

  if (
    !metadata ||
    !Array.isArray(
      metadata.participants
    )
  ) {
    return []
  }

  return metadata.participants
    .filter(
      participant =>
        participant.admin === 'admin' ||
        participant.admin === 'superadmin'
    )
    .map(
      participant =>
        normalizeUserId(
          participant.id
        )
    )
}

// ------------------------------------------------------------
// CAN TARGET USER
// ------------------------------------------------------------
//
// Returns false when the target is an administrator.
//
// The bot should never automatically remove or manually
// kick another administrator.
//

async function canModerateUser(
  sock,
  groupId,
  userId
) {
  if (!userId) {
    return false
  }

  const admin =
    await isAdmin(
      sock,
      groupId,
      userId
    )

  return !admin
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
  normalizeUserId,

  getSenderId,
  getGroupId,

  isGroup,

  getGroupMetadata,
  findParticipant,

  isAdmin,
  isOwner,

  getBotId,
  botIsAdmin,

  getConnectedPhoneNumber,
  getGroupAdmins,

  canModerateUser
}