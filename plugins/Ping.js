import { performance } from 'perf_hooks'

export default {
  name: "ping",
  category: "main",
  command: ["ping", "p"],

  run: async (conn, m) => {
    try {
      // Calculamos la latencia inicial
      const start = performance.now()
      
      // Enviamos un mensaje de espera
      const { key } = await m.reply('🚀 *Calculando velocidad...*')
      
      const end = performance.now()
      const latencia = (end - start).toFixed(4)

      // Editamos el mensaje con la respuesta final
      await conn.sendMessage(m.chat, { 
        text: `🏓 *PONG!*\n\n> ⌛ *Latencia:* ${latencia} ms\n> 🤖 *Bot:* Blue Lock Bot`, 
        edit: key 
      })

    } catch (e) {
      console.error("Ping Error:", e)
      m.reply("❌ Error al ejecutar el comando ping.")
    }
  }
}