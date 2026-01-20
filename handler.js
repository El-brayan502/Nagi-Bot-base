import { smsg } from "./lib/simple.js"
import { format } from "util"
import { fileURLToPath } from "url"
import path, { join } from "path"
import fs, { unwatchFile, watchFile } from "fs"
import chalk from "chalk"
import fetch from "node-fetch"
import ws from "ws"

const { proto } = (await import("@whiskeysockets/baileys")).default
const isNumber = x => typeof x === "number" && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this)
    resolve()
}, ms))

export async function handler(chatUpdate) {
    this.msgqueque = this.msgqueque || []
    this.uptime = this.uptime || Date.now()
    if (!chatUpdate) return
    this.pushMessage(chatUpdate.messages).catch(console.error)
    let m = chatUpdate.messages[chatUpdate.messages.length - 1]
    if (!m) return
    if (global.db.data == null) await global.loadDatabase()
    
    try {
        m = smsg(this, m) || m
        if (!m) return
        
        m.exp = 0
        try {
            // --- GESTIÓN DE USUARIOS ---
            const user = global.db.data.users[m.sender]
            if (typeof user !== "object") global.db.data.users[m.sender] = {}
            if (user) {
                if (!("name" in user)) user.name = m.name
                if (!("exp" in user) || !isNumber(user.exp)) user.exp = 0
                if (!("coin" in user) || !isNumber(user.coin)) user.coin = 0
                if (!("bank" in user) || !isNumber(user.bank)) user.bank = 0
                if (!("level" in user) || !isNumber(user.level)) user.level = 0
                if (!("health" in user) || !isNumber(user.health)) user.health = 100
                if (!("premium" in user)) user.premium = false
                if (!("banned" in user)) user.banned = false
                if (!("registered" in user)) user.registered = false
            } else global.db.data.users[m.sender] = {
                name: m.name, exp: 0, coin: 0, bank: 0, level: 0, health: 100,
                premium: false, banned: false, registered: false
            }

            // --- GESTIÓN DE CHATS ---
            const chat = global.db.data.chats[m.chat]
            if (typeof chat !== "object") global.db.data.chats[m.chat] = {}
            if (chat) {
                if (!("isBanned" in chat)) chat.isBanned = false
                if (!("isMute" in chat)) chat.isMute = false
                if (!("antiLink" in chat)) chat.antiLink = true
            } else global.db.data.chats[m.chat] = { isBanned: false, isMute: false, antiLink: true }

            // --- AJUSTES DEL BOT ---
            const settings = global.db.data.settings[this.user.jid]
            if (typeof settings !== "object") global.db.data.settings[this.user.jid] = {}
            if (settings) {
                if (!("self" in settings)) settings.self = false
                if (!("jadibotmd" in settings)) settings.jadibotmd = true
            } else global.db.data.settings[this.user.jid] = { self: false, jadibotmd: true }
            
        } catch (e) { console.error(e) }

        if (typeof m.text !== "string") m.text = ""
        
        const user = global.db.data.users[m.sender]
        const chat = global.db.data.chats[m.chat]
        const settings = global.db.data.settings[this.user.jid]

        // --- PROTECCIÓN DE DUEÑOS ---
        const isROwner = [...global.owner.map(number => Array.isArray(number) ? number[0] : number)].map(v => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender)
        const isOwner = isROwner || m.fromMe
        const isPrems = isROwner || global.prems?.map(v => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender) || user.premium == true
        const isOwners = [this.user.jid, ...global.owner.map(number => (Array.isArray(number) ? number[0] : number) + "@s.whatsapp.net")].includes(m.sender)

        if (m.isBaileys) return
        m.exp += Math.ceil(Math.random() * 10)

        // --- METADATA DEL GRUPO ---
        const groupMetadata = m.isGroup ? await this.groupMetadata(m.chat).catch(_ => ({})) : {}
        const participants = (m.isGroup ? groupMetadata.participants : []) || []
        const userGroup = (m.isGroup ? participants.find(u => this.decodeJid(u.id) === m.sender) : {}) || {}
        const botGroup = (m.isGroup ? participants.find(u => this.decodeJid(u.id) == this.user.jid) : {}) || {}
        const isAdmin = userGroup?.admin == "admin" || userGroup?.admin == "superadmin" || false
        const isBotAdmin = botGroup?.admin || false

        const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), "./plugins")
        
        // --- PROCESAMIENTO DE PLUGINS ---
        for (const name in global.plugins) {
            const plugin = global.plugins[name]
            if (!plugin || plugin.disabled) continue

            const __filename = join(___dirname, name)
            
            // Ejecutar funciones "all"
            if (typeof plugin.all === "function") {
                try { await plugin.all.call(this, m, { chatUpdate, __dirname: ___dirname, __filename, user, chat, settings })
                } catch (e) { console.error(e) }
            }

            // --- LÓGICA DE PREFIJOS Y COMANDOS ---
            const strRegex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")
            const pluginPrefix = plugin.customPrefix || this.prefix || global.prefix
            const match = (pluginPrefix instanceof RegExp ? [[pluginPrefix.exec(m.text), pluginPrefix]] :
                Array.isArray(pluginPrefix) ? pluginPrefix.map(p => [ (p instanceof RegExp ? p : new RegExp(strRegex(p))).exec(m.text), p ]) :
                typeof pluginPrefix === "string" ? [[new RegExp(strRegex(pluginPrefix)).exec(m.text), new RegExp(strRegex(pluginPrefix))]] :
                [[[], new RegExp]]).find(p => p[1])

            let usedPrefix
            if ((usedPrefix = (match?.[0] || "")[0])) {
                const noPrefix = m.text.replace(usedPrefix, "")
                let [command, ...args] = noPrefix.trim().split(" ").filter(v => v)
                command = (command || "").toLowerCase()
                
                // VALIDACIÓN DE COMANDO (Fix para el error .map)
                const cmdProperty = plugin.command
                if (!cmdProperty) continue

                const isAccept = cmdProperty instanceof RegExp ? cmdProperty.test(command) :
                    Array.isArray(cmdProperty) ? cmdProperty.some(cmd => cmd instanceof RegExp ? cmd.test(command) : cmd === command) :
                    typeof cmdProperty === "string" ? cmdProperty === command : false

                if (!isAccept) continue
                
                global.comando = command
                m.plugin = name

                // Restricciones de seguridad
                if (settings.self && !isOwners) return
                if (chat?.isBanned && !isROwner) return
                if (user?.banned && !isROwner) return

                // Permisos
                if (plugin.rowner && !isROwner) { global.dfail("rowner", m, this); continue }
                if (plugin.owner && !isOwner) { global.dfail("owner", m, this); continue }
                if (plugin.group && !m.isGroup) { global.dfail("group", m, this); continue }
                if (plugin.admin && !isAdmin) { global.dfail("admin", m, this); continue }
                if (plugin.botAdmin && !isBotAdmin) { global.dfail("botAdmin", m, this); continue }

                m.isCommand = true
                let extra = { match, usedPrefix, noPrefix, args, command, conn: this, participants, groupMetadata, userGroup, botGroup, isROwner, isOwner, isAdmin, isBotAdmin, isPrems, user, chat, settings }
                
                try {
                    if (typeof plugin === "function") await plugin.call(this, m, extra)
                    else if (typeof plugin.run === "function") await plugin.run.call(this, this, m, extra)
                } catch (e) {
                    console.error(e)
                    m.reply(`❌ *Error en el plugin:* ${name}\n\n${format(e)}`)
                }
            }
        }
    } catch (err) {
        console.error(err)
    } finally {
        if (!opts["noprint"]) await (await import("./lib/print.js")).default(m, this).catch(console.error)
    }
}

global.dfail = (type, m, conn) => {
    const msg = {
        rowner: `⚽ Solo DuarteXV puede usar esto.`,
        owner: `⚽ Comando para desarrolladores.`,
        premium: `⚽ Solo para usuarios Premium.`,
        group: `⚽ Este comando solo funciona en grupos.`,
        admin: `⚽ Necesitas ser admin para usar esto.`,
        botAdmin: `⚽ ¡Hazme admin primero!`,
        unreg: `⚽ Regístrate primero usando: /reg nombre.edad`
    }[type]
    if (msg) return conn.reply(m.chat, msg, m).then(_ => m.react('✖️'))
}

let file = global.__filename(import.meta.url, true)
watchFile(file, async () => {
    unwatchFile(file)
    console.log(chalk.blueBright("⚽ 'handler.js' actualizado con éxito."))
})