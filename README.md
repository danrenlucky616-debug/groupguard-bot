# 🛡️ GroupGuard

GroupGuard is a WhatsApp group protection and moderation bot built with Node.js and Baileys.

## 🚀 Features

- 🔗 Anti-link protection
- 🚨 Anti-spam protection
- ⚠️ Warning system
- 🚫 Automatic member removal
- 📢 Status-mention protection
- 👮 Admin-only commands
- 🛡️ Bot permission checks
- 🌐 Web interface
- 📱 WhatsApp pairing
- 🔄 Automatic reconnection
- 💾 Persistent group settings
- 👋 Welcome messages disabled

---

## 🛡️ Default Protection

| Protection | Setting |
|---|---|
| Anti-link | ON |
| Anti-spam | ON |
| Status mentions | ON |
| Welcome messages | OFF |
| Spam threshold | 10 messages / 10 seconds |
| Link removal | 3 warnings |
| Spam removal | 3 warnings |
| Status removal | 4 warnings |
| Manual warning removal | 3 warnings |

---

## 👮 Commands

Only group administrators can use GroupGuard commands.

Normal group members who send commands are silently ignored.

### General

```text
.menu
.help
.ping
.botstatus