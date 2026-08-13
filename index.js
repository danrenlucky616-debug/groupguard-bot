// ============================================================
// GROUPGUARD
// MAIN SERVER + WEBSITE + PAIRING API
// ============================================================

require('dotenv').config()

const express = require('express')

const config = require('./config')

const {
  connectToWhatsApp,
  createPairing,
  getConnectionStatus,
  getUserConnectionStatus,
  disconnectUser
} = require('./whatsapp')

const {
  loadDatabase,
  getUser,
  getUsers
} = require('./database')

// ============================================================
// APP
// ============================================================

const app = express()

app.use(express.json())

// ============================================================
// WEBSITE
// ============================================================

app.get('/', (req, res) => {
  res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>GroupGuard</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background: #07130d;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 520px;
      background: #0d1f16;
      border: 1px solid #1d4430;
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
    }

    .logo {
      text-align: center;
      font-size: 42px;
      margin-bottom: 5px;
    }

    h1 {
      text-align: center;
      margin: 0;
      font-size: 30px;
    }

    .subtitle {
      text-align: center;
      color: #a7c2b2;
      margin: 10px 0 28px;
      line-height: 1.5;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: bold;
    }

    input {
      width: 100%;
      padding: 15px;
      border-radius: 10px;
      border: 1px solid #315d45;
      background: #08150e;
      color: white;
      font-size: 16px;
      outline: none;
    }

    input:focus {
      border-color: #25d366;
    }

    button {
      width: 100%;
      margin-top: 15px;
      padding: 15px;
      border: 0;
      border-radius: 10px;
      background: #25d366;
      color: #041008;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }

    button:disabled {
      opacity: .5;
      cursor: not-allowed;
    }

    .result {
      display: none;
      margin-top: 25px;
      padding: 20px;
      border-radius: 12px;
      background: #07130d;
      border: 1px solid #315d45;
    }

    .code {
      margin: 15px 0;
      padding: 18px;
      text-align: center;
      font-size: 26px;
      font-weight: bold;
      letter-spacing: 4px;
      background: #102b1b;
      border-radius: 10px;
      color: #25d366;
    }

    .steps {
      color: #b8cfc1;
      line-height: 1.7;
    }

    .error {
      color: #ff8585;
    }

    .success {
      color: #72e6a0;
    }

    .footer {
      text-align: center;
      color: #759181;
      margin-top: 25px;
      font-size: 13px;
    }
  </style>
</head>

<body>

  <main class="container">

    <div class="logo">🛡️</div>

    <h1>GroupGuard</h1>

    <p class="subtitle">
      WhatsApp group protection made simple.
      Connect your WhatsApp account and protect
      your groups with GroupGuard.
    </p>

    <label for="phone">
      WhatsApp number
    </label>

    <input
      id="phone"
      type="tel"
      placeholder="2348012345678"
      autocomplete="tel"
    >

    <button
      id="connectButton"
      onclick="connectWhatsApp()"
    >
      Connect WhatsApp
    </button>

    <div
      id="result"
      class="result"
    ></div>

    <div class="footer">
      GroupGuard • WhatsApp Group Protection
    </div>

  </main>

<script>

async function connectWhatsApp() {

  const input =
    document.getElementById('phone')

  const button =
    document.getElementById('connectButton')

  const result =
    document.getElementById('result')

  const phone =
    input.value.trim()

  if (!phone) {
    result.style.display = 'block'

    result.innerHTML =
      '<p class="error">Please enter your WhatsApp number.</p>'

    return
  }

  button.disabled = true

  button.textContent =
    'Generating pairing code...'

  result.style.display = 'block'

  result.innerHTML =
    '<p>Please wait...</p>'

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
            phone
          })
        }
      )

    const data =
      await response.json()

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Unable to generate pairing code.'
      )
    }

    if (data.connected) {

      result.innerHTML = `
        <p class="success">
          🟢 This WhatsApp number is already connected.
        </p>
      `

      button.disabled = false

      button.textContent =
        'Connect WhatsApp'

      return
    }

    result.innerHTML = `
      <p class="success">
        ✅ Pairing code generated.
      </p>

      <div class="code">
        ${escapeHtml(data.code)}
      </div>

      <div class="steps">
        <strong>On your WhatsApp:</strong><br>

        1. Open WhatsApp<br>
        2. Go to Settings<br>
        3. Open Linked Devices<br>
        4. Select Link a Device<br>
        5. Choose Link with phone number instead<br>
        6. Enter the code shown above
      </div>
    `

  } catch (error) {

    result.innerHTML = `
      <p class="error">
        ❌ ${escapeHtml(error.message)}
      </p>
    `

  } finally {

    button.disabled = false

    button.textContent =
      'Connect WhatsApp'
  }
}

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

</script>

</body>
</html>
  `)
})

// ============================================================
// PAIRING API
// ============================================================

app.post(
  '/api/pair',
  async (req, res) => {

    try {

      const phone =
        String(
          req.body?.phone || ''
        )
        .replace(/\D/g, '')

      if (!phone) {
        return res.status(400).json({
          error:
            'Please provide a valid WhatsApp number.'
        })
      }

      if (
        phone.length < 10 ||
        phone.length > 15
      ) {
        return res.status(400).json({
          error:
            'Please enter a valid international WhatsApp number.'
        })
      }

      console.log(
        `📱 Pairing request: ${phone}`
      )

      const result =
        await createPairing(
          phone
        )

      return res.status(200).json(
        result
      )

    } catch (error) {

      console.error(
        '❌ Pairing API error:',
        error.message
      )

      return res.status(500).json({
        error:
          error.message ||
          'Pairing failed.'
      })
    }
  }
)

// ============================================================
// USER STATUS
// ============================================================

app.get(
  '/api/status/:phone',
  (req, res) => {

    const phone =
      String(
        req.params.phone || ''
      )
      .replace(/\D/g, '')

    if (!phone) {
      return res.status(400).json({
        error:
          'Invalid phone number.'
      })
    }

    const status =
      getUserConnectionStatus(
        phone
      )

    const user =
      getUser(
        phone
      )

    res.json({
      phone,
      status,
      connected:
        status === 'connected',
      user: user
        ? {
            createdAt:
              user.createdAt,
            updatedAt:
              user.updatedAt
          }
        : null
    })
  }
)

// ============================================================
// ADMIN / DEBUG USER COUNT
// ============================================================

app.get(
  '/api/users/count',
  (req, res) => {

    const users =
      getUsers()

    res.json({
      count:
        Object.keys(users).length
    })
  }
)

// ============================================================
// DISCONNECT
// ============================================================

app.post(
  '/api/disconnect',
  async (req, res) => {

    try {

      const phone =
        String(
          req.body?.phone || ''
        )
        .replace(/\D/g, '')

      if (!phone) {
        return res.status(400).json({
          error:
            'Invalid phone number.'
        })
      }

      const disconnected =
        await disconnectUser(
          phone
        )

      res.json({
        success:
          disconnected
      })

    } catch (error) {

      console.error(
        '❌ Disconnect error:',
        error.message
      )

      res.status(500).json({
        error:
          'Unable to disconnect account.'
      })
    }
  }
)

// ============================================================
// HEALTH
// ============================================================

app.get(
  '/health',
  (req, res) => {

    const whatsapp =
      getConnectionStatus()

    const healthy =
      whatsapp === 'connected'

    res.status(
      healthy
        ? 200
        : 503
    ).json({

      status:
        healthy
          ? 'ok'
          : 'starting',

      bot:
        config.BOT_NAME,

      version:
        config.VERSION,

      service:
        'online',

      whatsapp,

      time:
        new Date().toISOString()
    })
  }
)

// ============================================================
// START
// ============================================================

const PORT =
  Number(
    process.env.PORT
  ) ||
  config.PORT ||
  10000

const server =
  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        '========================================'
      )

      console.log(
        '🛡️ GROUPGUARD'
      )

      console.log(
        '========================================'
      )

      console.log(
        `🌐 Port: ${PORT}`
      )

      console.log(
        '❤️ Health: /health'
      )

      console.log(
        '🔗 Website: /'
      )

      console.log(
        '📱 Pairing API: /api/pair'
      )

      console.log(
        '========================================'
      )
    }
  )

// ============================================================
// DATABASE
// ============================================================

try {

  loadDatabase()

} catch (error) {

  console.error(
    '❌ Database startup error:',
    error.message
  )
}

// ============================================================
// WHATSAPP
// ============================================================

connectToWhatsApp()
  .catch(
    error => {

      console.error(
        '❌ WhatsApp startup error:',
        error.message
      )
    }
  )

// ============================================================
// GLOBAL ERRORS
// ============================================================

process.on(
  'uncaughtException',
  error => {

    console.error(
      '❌ Uncaught exception:',
      error
    )
  }
)

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '❌ Unhandled promise rejection:',
      error
    )
  }
)

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown(
  signal
) {

  console.log(
    `🛑 ${signal} received.`
  )

  server.close(
    () => {

      console.log(
        '🌐 HTTP server closed.'
      )

      process.exit(0)
    }
  )

  setTimeout(
    () => {
      process.exit(0)
    },
    10_000
  )
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
)

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
)