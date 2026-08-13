// ============================================================
// GROUPGUARD v2
// BOT MESSAGES
// ============================================================

const BOT_NAME = '🛡️ GroupGuard'

module.exports = {

  // ==========================================================
  // WARNINGS
  // ==========================================================

  warning: (
    username,
    count,
    limit,
    reason
  ) =>
    `⚠️ @${username}

🚨 WARNING ${count}/${limit}

📌 Reason: ${reason}

Please follow the group rules.

${BOT_NAME}`,

  // ==========================================================
  // REMOVAL
  // ==========================================================

  removed: (
    username,
    reason
  ) =>
    `🚫 @${username} has been removed from the group.

📌 Reason: ${reason}

🛡️ GroupGuard protection.`,

  removalFailed:
    `⚠️ GroupGuard detected a violation, but I couldn't remove the member.

Please make sure GroupGuard is a group administrator.`,

  // ==========================================================
  // ANTI-LINK
  // ==========================================================

  linkDetected:
    `🔗 LINK DETECTED

⚠️ Links are not allowed in this group.

🗑️ The message has been removed.`,

  linkWarning: (
    username,
    count,
    limit
  ) =>
    `🔗 @${username}

⚠️ PROHIBITED LINK

🚨 Warning ${count}/${limit}

Links are not allowed in this group.

${BOT_NAME}`,

  linkRemoved: (
    username
  ) =>
    `🚫 @${username} has been removed.

📌 Reason: Repeated prohibited links
⚠️ Link warnings reached 3/3.

${BOT_NAME}`,

  // ==========================================================
  // ANTI-SPAM
  // ==========================================================

  spamDetected:
    `🚨 SPAM DETECTED

⚠️ Please stop flooding the group.

🗑️ The message has been removed.`,

  spamWarning: (
    username,
    count,
    limit
  ) =>
    `🚨 @${username}

⚠️ SPAM DETECTED

Warning ${count}/${limit}

Please stop sending messages repeatedly.

${BOT_NAME}`,

  spamRemoved: (
    username
  ) =>
    `🚫 @${username} has been removed.

📌 Reason: Repeated spam/flooding
⚠️ Spam warnings reached 3/3.

${BOT_NAME}`,

  // ==========================================================
  // STATUS MENTION
  // ==========================================================

  statusDetected:
    `📢 STATUS MENTION DETECTED

⚠️ Status mentioning is not allowed in this group.`,

  statusWarning: (
    username,
    count,
    limit
  ) =>
    `📢 @${username}

⚠️ STATUS MENTION WARNING

Warning ${count}/${limit}

Status mentioning is not allowed in this group.

${BOT_NAME}`,

  statusRemoved: (
    username
  ) =>
    `🚫 @${username} has been removed.

📌 Reason: Repeated status mentioning
⚠️ Status warnings reached 4/4.

${BOT_NAME}`,

  // ==========================================================
  // PERMISSIONS
  // ==========================================================

  permissionDenied:
    `🔒 This command is restricted to group administrators.`,

  botNotAdmin:
    `⚠️ I need to be a group administrator to perform this action.`,

  cannotWarnAdmin:
    `🛡️ I can't warn another group administrator.`,

  cannotRemoveAdmin:
    `🛡️ I can't remove another group administrator.`,

  // ==========================================================
  // TARGET
  // ==========================================================

  targetRequired:
    `⚠️ Please mention a member or reply to their message.`,

  // ==========================================================
  // MENU
  // ==========================================================

  menu:
    `🛡️ GROUPGUARD
━━━━━━━━━━━━━━━━━━

📋 ADMIN COMMANDS

🛡️ PROTECTION

• .antilink on
• .antilink off

• .antispam on
• .antispam off

• .antistatus on
• .antistatus off

📜 .rules

━━━━━━━━━━━━━━━━━━

⚠️ MODERATION

• .warn @user
• .warnings @user
• .resetwarn @user
• .kick @user

━━━━━━━━━━━━━━━━━━

ℹ️ GENERAL

• .ping
• .botstatus
• .menu

━━━━━━━━━━━━━━━━━━

🔐 Admin commands only.

👋 Welcome messages:
🔴 Disabled

${BOT_NAME}`,

  // ==========================================================
  // PING
  // ==========================================================

  ping:
    `🏓 PONG!

🟢 GroupGuard is running.`,

  // ==========================================================
  // BOT STATUS
  // ==========================================================

  botStatus: (
    sessionCount = 1
  ) =>
    `🛡️ GROUPGUARD STATUS

🟢 Service: Online
🟢 WhatsApp: Connected

🛡️ Anti-link: Active
🚨 Anti-spam: Active
📢 Status protection: Active

👋 Welcome messages: Disabled

👥 Active sessions: ${sessionCount}

GroupGuard is protecting this group.`,

  // ==========================================================
  // RULES
  // ==========================================================

  rules: settings =>
    `📜 GROUPGUARD RULES
━━━━━━━━━━━━━━━━━━

🔗 Anti-link:
${
  settings.antiLink
    ? '🟢 ON'
    : '🔴 OFF'
}

🚨 Anti-spam:
${
  settings.antiSpam
    ? '🟢 ON'
    : '🔴 OFF'
}

📢 Status protection:
${
  settings.antiStatusMention
    ? '🟢 ON'
    : '🔴 OFF'
}

👋 Welcome:
🔴 OFF

━━━━━━━━━━━━━━━━━━

⚠️ Link limit: 3 warnings
🚨 Spam limit: 3 warnings
📢 Status limit: 4 warnings

🛡️ GroupGuard`,

  // ==========================================================
  // SETTINGS
  // ==========================================================

  settingChanged: (
    setting,
    enabled
  ) =>
    `⚙️ ${setting}

Status:
${
  enabled
    ? '🟢 ON'
    : '🔴 OFF'
}

🛡️ GroupGuard`,

  usageAntilink:
    `⚠️ Usage:

.antilink on
.antilink off`,

  usageAntispam:
    `⚠️ Usage:

.antispam on
.antispam off`,

  usageAntistatus:
    `⚠️ Usage:

.antistatus on
.antistatus off`,

  // ==========================================================
  // WARNING LIST
  // ==========================================================

  warnings: (
    username,
    data
  ) =>
    `⚠️ WARNINGS FOR @${username}
━━━━━━━━━━━━━━━━━━

🔗 Links: ${data.link}/3
🚨 Spam: ${data.spam}/3
📢 Status: ${data.status}/4
👮 Manual: ${data.manual}/3

━━━━━━━━━━━━━━━━━━

🛡️ GroupGuard`,

  warningsReset: username =>
    `✅ Warnings reset for @${username}.

🛡️ GroupGuard`,

  // ==========================================================
  // KICK
  // ==========================================================

  kickSuccess: username =>
    `🚫 @${username} has been removed.

📌 Reason: Admin action

🛡️ GroupGuard`,

  // ==========================================================
  // GENERAL
  // ==========================================================

  unknownCommand:
    `❓ Unknown command.

Use .menu to see the available commands.`,

  serviceOffline:
    `⚠️ GroupGuard is currently reconnecting to WhatsApp.

Please try again shortly.`,

  // ==========================================================
  // WEBSITE / CONNECTION
  // ==========================================================

  websiteTitle:
    '🛡️ GroupGuard',

  websiteSubtitle:
    'Protect your WhatsApp groups.',

  connectionWaiting:
    'Waiting for WhatsApp connection...',

  connectionStarting:
    'Starting WhatsApp connection...',

  connectionReady:
    'WhatsApp is connected.',

  connectionFailed:
    'WhatsApp connection could not be established.',

  pairingInstructions:
    `Open WhatsApp → Linked Devices → Link a device → Link with phone number → Enter the pairing code.`,

  // ==========================================================
  // SECURITY
  // ==========================================================

  invalidPhoneNumber:
    '⚠️ Please enter a valid WhatsApp phone number in international format.',

  sessionLimitReached:
    '⚠️ The maximum number of active sessions has been reached. Please try again later.',

  rateLimited:
    '⚠️ Too many connection attempts. Please wait and try again.',

  // ==========================================================
  // SERVICE INFORMATION
  // ==========================================================

  noWelcome:
    '👋 Welcome messages are disabled by design.'
}