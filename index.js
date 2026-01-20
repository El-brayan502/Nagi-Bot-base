process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import fs, { readdirSync, existsSync, unlinkSync, mkdirSync, watch } from 'fs'
import path, { join } from 'path'
import chalk from 'chalk'
import cfonts from 'cfonts'
import pino from 'pino'
import readline from 'readline'
import { Low, JSONFile } from 'lowdb'
import lodash from 'lodash'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'

const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = (await import('@whiskeysockets/baileys')).default
const { chain } = lodash

// --- CONFIGURACIÓN DE RUTAS ---
global.__filename = (pathURL = import.meta.url, rmPrefix = platform !== 'win32') => rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString()
global.__dirname = (pathURL) => path.dirname(global.__filename(pathURL, true))
const __dirname = global.__dirname(import.meta.url)

// --- ANIMACIÓN DE INICIO (NAGI STYLE) ---
console.clear()
cfonts.say('NAGI-BOT', {
    font: 'block',
    align: 'center',
    gradient: ['white', 'blue']
})
console.log(chalk.bold.blueBright('⚽ ———————————————————————————————————————————————————— ⚽'))
console.log(chalk.white.italic('       "Solo ganan los que están dispuestos a apostarlo todo."'))
console.log(chalk.bold.blueBright('⚽ ———————————————————————————————————————————————————— ⚽\n'))

// --- INICIALIZACIÓN DE PROTOTIPOS (FIX jid.decodeJid) ---
protoType()
serialize()

// --- BASE DE DATOS ---
global.db = new Low(new JSONFile('database.json'))
global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) return
    await global.db.read().catch(console.error)
    global.db.data = { users: {}, chats: {}, settings: {}, ...(global.db.data || {}) }
    global.db.chain = chain(global.db.data)
}
await global.loadDatabase()

// --- CONFIGURACIÓN DE CONEXIÓN ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (t) => new Promise((r) => rl.question(t, r))

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(global.sessions)
    const { version } = await fetchLatestBaileysVersion()

    const connectionOptions = {
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !process.argv.includes('code'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        browser: ["Nagi Bot", "Safari", "2.0.0"],
        version
    }

    global.conn = makeWASocket(connectionOptions)

    // Lógica de Vinculación (QR o Código)
    if (process.argv.includes('code') && !conn.authState.creds.registered) {
        let phoneNumber = await question(chalk.bgBlue.white('\n ⚽ INGRESA TU NÚMERO (Ej: 521XXXXXXXXXX): '))
        phoneNumber = phoneNumber.replace(/\D/g, '')
        
        setTimeout(async () => {
            let code = await conn.requestPairingCode(phoneNumber)
            code = code.match(/.{1,4}/g)?.join("-") || code
            console.log(chalk.bold.white(chalk.bgCyan('\n CÓDIGO DE VINCULACIÓN: ')), chalk.bold.blue(code), '\n')
        }, 3000)
    }

    // --- MANEJO DE EVENTOS ---
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'open') {
            console.log(chalk.bold.green('\n✅ [NAGI BOT] CONECTADO CON ÉXITO'))
            console.log(chalk.blue(`⚽ Jugador: ${conn.user.name || 'Nagi Seishiro'}\n`))
            
            // Iniciar Jadibots si la función existe
            if (global.mikuJadiBot) {
                console.log(chalk.cyan('🚀 Iniciando sistema de Subbots...'))
            }
        }
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
            console.log(chalk.red(`⚠️ Conexión cerrada. Razón: ${reason}. Reconectando...`))
            if (reason !== DisconnectReason.loggedOut) startBot()
        }
    })

    conn.ev.on('creds.update', saveCreds)

    // Carga del Handler
    const handler = await import('./handler.js')
    conn.handler = handler.handler.bind(global.conn)
    conn.ev.on('messages.upsert', conn.handler)
}

// --- GESTIÓN DE PLUGINS ---
const pluginFolder = join(__dirname, 'plugins')
global.plugins = {}

async function loadPlugins() {
    for (const filename of readdirSync(pluginFolder).filter(f => f.endsWith('.js'))) {
        try {
            const file = pathToFileURL(join(pluginFolder, filename)).href
            const module = await import(file)
            global.plugins[filename] = module.default || module
        } catch (e) {
            console.error(chalk.red(`❌ Error en ${filename}:`), e)
        }
    }
    console.log(chalk.green(`⚽ [SISTEMA] ${Object.keys(global.plugins).length} Comandos listos.`))
}

// --- AUTO-ELIMINACIÓN TMP (Cada 1 minuto) ---
setInterval(() => {
    const tmpDir = join(__dirname, 'tmp')
    if (existsSync(tmpDir)) {
        readdirSync(tmpDir).forEach(f => {
            try { unlinkSync(join(tmpDir, f)) } catch (e) {}
        })
    }
}, 60000)

// --- INICIO TOTAL ---
loadPlugins()
startBot()

// Fix para errores de procesos no capturados
process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)