require('dotenv').config()

var express = require('express')
var cookieParser = require('cookie-parser')

const SECURE_COOKIE_SECRET = process.env.SECURE_COOKIE_SECRET
if(!SECURE_COOKIE_SECRET) {
	throw new Error('requires env.SECURE_COOKIE_SECRET')
}

var app = express()
app.use(cookieParser('SECRET'))

app.get('/', function (req, res) {
  // Cookies that have not been signed
  console.log('Cookies: ', req.cookies)

  // Cookies that have been signed
  console.log('Signed Cookies: ', req.signedCookies)
})

app.listen(8080)
