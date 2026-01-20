import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import fluent from 'fluent-ffmpeg'
import { fileTypeFromBuffer as fromBuffer } from 'file-type'
import { addExif } from '../lib/sticker.js' // Asegúrate de que esta ruta sea correcta en tu bot

export default {
  name: "sticker",
  category: "sticker",
  command: ["s", "sticker", "stiker"],

  run: async (conn, m, { args }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    let buffer

    try {
      // 1. Obtener el Buffer (de descarga o URL)
      if (/image|video/g.test(mime)) {
        if (/video/.test(mime) && (q.msg || q).seconds > 11) {
          return m.reply('⚠️ El video no puede durar más de *10 segundos*.')
        }
        buffer = await q.download()
      } else if (args[0] && /^https?:\/\//.test(args[0])) {
        const res = await fetch(args[0])
        buffer = await res.buffer()
      } else {
        return m.reply('*[ × ]* Responde a una *imagen o video* para crear el sticker.')
      }

      await m.react('🕓')

      // 2. Convertir a WebP (Sticker)
      const stickers = await toWebp(buffer)
      
      // 3. Agregar Metadatos (Nombre del bot/autor)
      // Ajusta 'global.bot' y 'global.dev' según tus variables
      let dl_url = await addExif(stickers, "Blue Lock Bot", "Egoist System")
      
      // 4. Enviar
      await conn.sendMessage(m.chat, { sticker: dl_url }, { quoted: m })
      await m.react('✅')

    } catch (e) {
      console.error(e)
      await m.react('✖️')
      m.reply('⚠️ Ocurrió un error al crear el sticker. Asegúrate de tener instalado FFMPEG.')
    }
  }
}

// Función de procesamiento de imagen/video a WebP
async function toWebp(buffer) {
  const fileType = await fromBuffer(buffer)
  const ext = fileType?.ext || 'jpg'
  
  // Carpeta temporal
  const tmpDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir)

  const input = path.join(tmpDir, `${Date.now()}.${ext}`)
  const output = path.join(tmpDir, `${Date.now()}.webp`)
  
  fs.writeFileSync(input, buffer)

  // Ajuste de tamaño para sticker cuadrado
  const scale = `scale='if(gt(iw,ih),512,-1):if(gt(iw,ih),-1,512)'`

  const options = [
    '-vcodec', 'libwebp',
    '-vf', `${scale},fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    ...(ext.match(/(mp4|mkv|m4p|gif)/)
      ? ['-loop', '0', '-ss', '00:00:00', '-t', '00:00:10', '-preset', 'default', '-an', '-vsync', '0']
      : [])
  ]

  return new Promise((resolve, reject) => {
    fluent(input)
      .addOutputOptions(options)
      .toFormat('webp')
      .save(output)
      .on('end', () => {
        const result = fs.readFileSync(output)
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
        resolve(result)
      })
      .on('error', (err) => {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
        reject(err)
      })
  })
}