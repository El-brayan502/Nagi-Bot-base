import { watchFile, unwatchFile } from 'fs' 
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import fs from 'fs'
import cheerio from 'cheerio'
import fetch from 'node-fetch'
import axios from 'axios'
import moment from 'moment-timezone' 

global.owner = [['573244278232', 'Neji', true]];

global.botname = '† ɪsᴀɢɪ ʏᴏɪᴄʜɪ †'
global.author = '© DuarteXV'

global.libreria = 'Baileys'
global.baileys = 'V 6.7.17' 
global.vs = '2.2.5'
global.nameqr = '⚽️ Isagi-Yoichi-MD ⚽️'
global.namebot = 'I S A G I Y O I C H I B O T'
global.sessions = 'Sessions'
global.jadi = 'JadiBots' 

global.ch = {
ch1: '120363420979328566@newsletter',
}
global.multiplier = 60

global.cheerio = cheerio
global.fs = fs
global.fetch = fetch
global.axios = axios
global.moment = moment

global.opts = {
  ...global.opts,
  autoread: true,  
  queque: false 
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'settings.js'"))
  import(`${file}?update=${Date.now()}`)
})
