process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import fs, { readdirSync, existsSync, unlinkSync, watch } from 'fs'
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

// --- ANIMACIÓN NAGI 2.0 ---
console.clear()
cfonts.say('NAGI\nBOT', {
    font: 'block',
    align: 'center',
    colors: ['white'],
    gradient: ['white', 'blue'],
    transitionGradient: true,
})
console.log(chalk.bold.blueBright('⚽ ———————————————————————————————————————————————————— ⚽'))
console.log(chalk.white.italic('    "El talento es algo que tú mismo haces florecer."'))
console.log(chalk.bold.blueBright('⚽ ———————————————————————————————————————————————————— ⚽\n'))

// --- INICIALIZACIÓN CRÍTICA ---
protoType() // Carga decodificadores de JID
serialize() // Carga serialización de mensajes

// --- BASE DE DATOS ---
global.db = new Low(new JSONFile('database.json'))
global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) return
    await global.db.read().catch(console.error)
    global.db.data = { users: {}, chats: {}, settings: {}, ...(global.db.data || {}) }
    global.db.chain = chain(global.db.data)
}
await global.loadDatabase()

// --- GESTIÓN DE PLUGINS (COMANDOS) ---
const pluginFolder = join(__dirname, 'plugins')
global.plugins = {} // Inicialización para evitar error 'map'

async function loadPlugins() {
    const files = readdirSync(pluginFolder).filter(f => f.endsWith('.js'))
    for (const filename of files) {
        try {
            const file = pathToFileURL(join(pluginFolder, filename)).href
            const module = await import(`${file}?update=${Date.now()}`)
            global.plugins[filename] = module.default || module
        } catch (e) {
            console.error(chalk.red(`❌ Error en plugin: ${filename}`), e)
        }
    }
    console.log(chalk.green(`✅ Comandos cargados: ${Object.keys(global.plugins).length}`))
}

// --- FUNCIÓN PRINCIPAL DE CONEXIÓN ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (t) => new Promise((r) => rl.question(t, r))

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(global.sessions)
    const { version } = await fetchLatestBaileysVersion()

    const conn = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !process.argv.includes('code'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        browser: ["Nagi Bot", "Safari", "2.0.0"],
        version
    })

    global.conn = conn

    // Lógica de Pairing Code (8 dígitos)
    if (process.argv.includes('code') && !conn.authState.creds.registered) {
        let phoneNumber = await question(chalk.bgBlue.white('\n ⚽ INGRESA EL NÚMERO (Ej: 521XXXXXXXXXX): '))
        phoneNumber = phoneNumber.replace(/\D/g, '')
        
        setTimeout(async () => {
            let code = await conn.requestPairingCode(phoneNumber)
            code = code.match(/.{1,4}/g)?.join("-") || code
            console.log(chalk.bold.white(chalk.bgCyan('\n CÓDIGO DE VINCULACIÓN: ')), chalk.bold.yellow(code), '\n')
        }, 3000)
    }

    // --- EVENTOS ---
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'open') {
            console.log(chalk.bold.blue('\n[ ⚽ ] CONECTADO: ' + conn.user.name))
            // Auto-unir a canales si existen
            if (global.joinChannels) await global.joinChannels(conn)
        }
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow('⚽ Reconectando...'))
                startBot()
            }
        }
    })

    conn.ev.on('creds.update', saveCreds)

    // Vincular Handler de Comandos
    const handler = await import('./handler.js')
    conn.handler = handler.handler.bind(global.conn)
    conn.ev.on('messages.upsert', conn.handler)

    return conn
}

// --- AUTO-LIMPIEZA TMP (Cada 1 minuto) ---
setInterval(() => {
    const tmpDir = join(__dirname, 'tmp')
    if (existsSync(tmpDir)) {
        readdirSync(tmpDir).forEach(f => {
            try { unlinkSync(join(tmpDir, f)) } catch (e) {}
        })
        console.log(chalk.cyan('❄️ Archivos de TMP eliminados.'));
    }
}, 60000)

// --- INICIO DEL SISTEMA ---
loadPlugins().then(() => startBot())

// Manejo de errores globales para que el bot no se apague
process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)