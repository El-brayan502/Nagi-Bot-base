import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const TEMP = path.join(ROOT, 'temp')

const ALWAYS_EXCLUDE = new Set(['node_modules', '.git', '.vscode', 'temp', '.npm'])
const EXCLUDE_FILES = new Set(['database.json', 'package-lock.json'])
const SESSION_DIRS = new Set(['sessions', 'sessions-qr', 'botSession'])

// Funciones auxiliares
function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function copyTree(src, dst, includeSessions) {
  await fsp.mkdir(dst, { recursive: true })
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const name = e.name
    if (ALWAYS_EXCLUDE.has(name)) continue
    if (!includeSessions && SESSION_DIRS.has(name)) continue
    const sp = path.join(src, name)
    const dp = path.join(dst, name)
    if (e.isDirectory()) {
      await copyTree(sp, dp, includeSessions)
    } else if (e.isFile()) {
      if (EXCLUDE_FILES.has(name)) continue
      await fsp.mkdir(path.dirname(dp), { recursive: true })
      try { await fsp.copyFile(sp, dp) } catch {}
    }
  }
}

async function zipFolderWin(sourceDir, zipPath) {
  const destPS = zipPath.replace(/'/g, "''")
  const script = `$ErrorActionPreference='Stop'; $dest='${destPS}'; if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }; $items = Get-ChildItem -Force | Select-Object -ExpandProperty FullName; Compress-Archive -Path $items -DestinationPath $dest -Force`
  const cmd = `powershell -NoProfile -Command "${script.replace(/"/g, '`"')}"`
  execSync(cmd, { cwd: sourceDir, stdio: 'inherit' })
}

async function zipFolderUnix(sourceDir, zipPath) {
  try {
    execSync('zip -v', { stdio: 'ignore' })
    execSync(`zip -r "${zipPath}" .`, { cwd: sourceDir, stdio: 'inherit' })
    return zipPath
  } catch {
    const gzPath = zipPath.replace(/\.zip$/i, '.tar.gz')
    execSync(`tar -czf "${gzPath}" .`, { cwd: sourceDir, stdio: 'inherit' })
    return gzPath
  }
}

async function makeFkontak() {
  try {
    const res = await fetch('https://i.postimg.cc/rFfVL8Ps/image.jpg')
    const thumb2 = Buffer.from(await res.arrayBuffer())
    return {
      key: { participants: '0@s.whatsapp.net', remoteJid: 'status@broadcast', fromMe: false, id: 'BackupInfo' },
      message: { locationMessage: { name: 'Backup Exitoso 📁', jpegThumbnail: thumb2 } },
      participant: '0@s.whatsapp.net'
    }
  } catch { return undefined }
}

export default {
  name: "backup",
  category: "owner",
  command: ["backup", "backupbot", "export", "respaldo"],

  run: async (conn, m, { args }) => {
    // Validar si necesitas que solo el dueño lo use (descomenta la siguiente linea si tienes esa variable)
    // if (!m.isOwner) return m.reply("❌ Este comando es solo para mi creador.")

    const includeSessions = args.some(a => /^--with-?sessions$/i.test(a))
    const nameArg = args.find(a => /^--name=(.+)$/i.test(a))?.split('=')[1]
    
    const sanitize = (s = '') => String(s).replace(/\s+/g, '-').replace(/[^a-z0-9._-]/ig, '')
    const baseName = sanitize(nameArg || 'BlueLock-Backup')
    const base = nameArg ? baseName : `${baseName}-${stamp()}`
    
    const exportDir = path.join(TEMP, base)
    const zipPath = path.join(TEMP, `${base}.zip`)

    await m.reply('📦 *Iniciando el respaldo del bot...*')
    await fsp.mkdir(TEMP, { recursive: true }).catch(() => {})

    try {
      await copyTree(ROOT, exportDir, includeSessions)
    } catch (e) {
      return m.reply(`❌ Error copiando archivos: ${e.message}`)
    }

    let artifact = zipPath
    try {
      if (process.platform === 'win32') {
        await zipFolderWin(exportDir, zipPath)
      } else {
        artifact = await zipFolderUnix(exportDir, zipPath)
      }

      const stat = await fsp.stat(artifact)
      const maxSend = 100 * 1024 * 1024 // 100MB límite
      
      if (stat.size > maxSend) {
        return m.reply(`⚠️ El archivo es demasiado grande (${(stat.size / 1024 / 1024).toFixed(1)}MB). Se guardó en el servidor: ${artifact}`)
      }

      const buffer = await fsp.readFile(artifact)
      const fileName = path.basename(artifact)
      const mt = artifact.endsWith('.zip') ? 'application/zip' : 'application/gzip'
      
      const fancyQuoted = await makeFkontak()

      await conn.sendMessage(m.chat, { 
        document: buffer, 
        mimetype: mt, 
        fileName: fileName,
        caption: `✅ *Respaldo completado*\n📂 *Archivo:* ${fileName}\n⚖️ *Peso:* ${(stat.size / 1024 / 1024).toFixed(2)} MB`
      }, { quoted: fancyQuoted || m })

    } catch (e) {
      m.reply(`❌ Error en el proceso: ${e.message}`)
    } finally {
      // Limpieza de archivos temporales
      try { await fsp.rm(exportDir, { recursive: true, force: true }) } catch {}
      try { await fsp.rm(artifact, { force: true }) } catch {}
    }
  }
}