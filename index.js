import dotenv from 'dotenv'
dotenv.config()

import { createLogger, format, transports } from 'winston'
import expressWinston from 'express-winston'
import { readFile, writeFile } from 'fs/promises'
import shortid from 'shortid'
import express from 'express'
import cookieParser from 'cookie-parser'

const { combine, timestamp, prettyPrint } = format

const SECURE_COOKIE_SECRET = process.env.SECURE_COOKIE_SECRET
if (!SECURE_COOKIE_SECRET) {
  throw new Error('requires env.SECURE_COOKIE_SECRET')
}

const SECURE_COOKIE_NAME = process.env.SECURE_COOKIE_NAME
if (!SECURE_COOKIE_NAME) {
  throw new Error('requires env.SECURE_COOKIE_NAME')
}

const readRedirects = async () => {
  const filepath = process.env.REDIRECTS_FILEPATH
  if (!filepath) {
    throw new Error('requires env.REDIRECTS_FILEPATH')
  }
  try {
    return JSON.parse(await readFile(filepath))
  } catch (err) {
    console.error(`failed to read ${filepath}`, err)
    return {}
  }
}

const redirects = await readRedirects()

var app = express()

app.use(cookieParser(SECURE_COOKIE_SECRET))
app.use(express.json())
app.use(express.static('public'))

// Middleware to set a user id in a cookie
app.use((req, res, next) => {
  const source = req.url.match(/\/m$/i) ? 'email' : 'web'

  if (req.signedCookies[SECURE_COOKIE_NAME]) {
    const id = req.signedCookies[SECURE_COOKIE_NAME]
    req.lbUser = {
      source,
      id,
      role: 'returning'
    }
    // console.log(`RETURNING ${SECURE_COOKIE_NAME}: ${id}`)
  } else {
    var id = Math.random().toString(36).substring(2)
    req.lbUser = { source, id, role: 'new' }
    res.cookie(SECURE_COOKIE_NAME, id, { signed: true })
    // console.log(`CREATED ${SECURE_COOKIE_NAME}: ${id}`)
  }

  next()
})

// Web Service Logging
app.use(
  expressWinston.logger({
    transports: [new transports.Console()],
    format: format.combine(format.colorize(), format.simple()),
    meta: false,
    msg: 'HTTP {{req.method}} {{req.url}}',
    expressFormat: true,
    colorize: false
    // ignoreRoute: function (req, res) {
    //   return false
    // }
  })
)

const logger = createLogger({
  level: 'info',
  format: combine(timestamp(), format.json()),
  defaultMeta: { service: 'url-shortener' },
  transports: [new transports.File({ filename: './logs/url_shortener.log' })]
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: combine(timestamp(), format.json(), prettyPrint())
    })
  )
}

// GET /u/:id or /u/:id/m
const routeHandler = (req, res) => {
  const id = req.params.id
  const ipaddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  const userAgent = req.headers['user-agent']
  const url = redirects[id]

  logger.info({
    user: req?.lbUser,
    ipaddr,
    id,
    url,
    userAgent
  })

  if (url) {
    res.redirect(url)
  } else {
    res.status(404).send('Not found')
  }
}

app.get('/u/:id', routeHandler) // from web
app.get('/u/:id/m', routeHandler) // from email

// GET /api/redirects
app.get('/api/redirects', (req, res) => {
  res.json(redirects)
})

// GET /api/redirects/:id
app.get('/api/redirects/:id', (req, res) => {
  const id = req.params.id
  res.json({ [id]: redirects[id] })
})

// POST /api/redirects
app.post('/api/redirects', async (req, res) => {
  const { id, url } = req.body

  console.log(req.body)

  if (!url) {
    res.status(400).send('url required')
    return
  }

  if (!id) {
    id = shortid.generate()
  }

  if (redirects[id]) {
    res.status(400).send('id already exists')
    return
  }

  redirects[id] = url

  await writeFile('./data/redirects.json', JSON.stringify(redirects, null, 2))

  res.json({ [id]: url })
})

app.listen(8080)
