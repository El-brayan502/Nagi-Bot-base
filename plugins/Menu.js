import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { performance } from 'perf_hooks'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default {
  name: "menu",
  category: "main",
  command: ["menu", "help", "comandos"],

  run: async (conn, m) => {
    try {
      const start = performance.now()
      
      // --- AJUSTA ESTA RUTA ---
      // Si tus comandos están en otra carpeta, cambia './plugins' por la tuya
      const commandsDir = path.join(process.cwd(), './plugins') 
      
      const categories = {}
      const files = await fsp.readdir(commandsDir)

      // Escaneamos los archivos para extraer la info automáticamente
      for (const file of files) {
        if (file.endsWith('.js')) {
          const filePath = path.join(commandsDir, file)
          // Importamos el comando dinámicamente
          const module = await import(`file://${filePath}?update=${Date.now()}`)
          const cmd = module.default

          if (cmd && cmd.name && cmd.category) {
            if (!categories[cmd.category]) {
              categories[cmd.category] = []
            }
            // Agregamos el nombre y los alias (command) a la lista
            categories[cmd.category].push(cmd)
          }
        }
      }

      const end = performance.now()
      const latencia = (end - start).toFixed(2)
      const nombreUsuario = m.pushName || "Egoísta"

      // Construcción del texto
      let menuTexto = `⚽ *HOLA, ${nombreUsuario.toUpperCase()}!* ⚽\n`
      menuTexto += `> *Latencia:* ${latencia} ms\n`
      menuTexto += `> *Bot:* Blue Lock System\n\n`
      menuTexto += `--- *LISTA DE COMANDOS* ---\n`

      // Ordenar categorías y comandos alfabéticamente
      const sortedCategories = Object.keys(categories).sort()

      for (const cat of sortedCategories) {
        menuTexto += `\n🔹 *${cat.toUpperCase()}*\n`
        categories[cat].forEach(cmd => {
          // Mostramos el nombre principal y sus comandos asociados
          const cmds = Array.isArray(cmd.command) ? cmd.command.join(', ') : cmd.command
          menuTexto += `• .${cmds}\n`
        })
      }

      menuTexto += `\n---`
      menuTexto += `\n⚡ *Total de categorías:* ${sortedCategories.length}`
      menuTexto += `\n⚡ *Egoist System Active*`

      await conn.sendMessage(m.chat, {
        text: menuTexto,
        contextInfo: {
          externalAdReply: {
            body: "The world's best striker bot",
            thumbnailUrl: "https://raw.githubusercontent.com/El-brayan502/img/upload/uploads/4919ee-1768933122343.jpg",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m })

    } catch (e) {
      console.error("Menu Auto Error:", e)
      m.reply("❌ Hubo un error al generar el menú automático.")
    }
  }
}