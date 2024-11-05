
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  MessageType,
  Browsers,
  proto,
  WAMessage
} from '@whiskeysockets/baileys'

import { Boom } from '@hapi/boom'
import * as fs from 'fs'
import { join } from 'path'


// Interface para configuração de sincronização
interface SyncConfig {
  includeMedia?: boolean;
  includeGroup?: boolean;
  messageTypes?: string[];
  maxMessages?: number;
  includeList?: string[];
}

// Configuração exemplo
const syncConfig: SyncConfig = {
  // Incluir arquivos de mídia
  includeMedia: true,
  includeGroup: false,

  // Tipos específicos de mensagem
  messageTypes: [
    'conversation',
    'imageMessage',
    'audioMessage',
    // 'videoMessage',
    'documentMessage'
  ],

  includeList: []
}

async function downloadAndSaveMedia(
  message: proto.IWebMessageInfo,
  chatDir: string,
  sock: any
) {
  if (message.message?.documentMessage ||
    message.message?.imageMessage ||
    message.message?.videoMessage ||
    message.message?.audioMessage) {
    try {
      const media = await downloadMediaMessage(
        message,
        'buffer',
        {},
        // {
        //   logger: console,
        //   reuploadRequest: sock.updateMediaMessage
        // }
      )

      const mediaExt = message.message?.documentMessage ? '.doc' :
        message.message?.imageMessage ? '.jpg' :
          message.message?.videoMessage ? '.mp4' :
            message.message?.audioMessage ? '.ogg' : ''

      const mediaFile = join(chatDir, `${message.key.id}${mediaExt}`)
      fs.writeFileSync(mediaFile, media as Buffer)
      console.log(`Mídia salva: ${mediaFile}`)
    } catch (error) {
      console.error('Erro ao baixar mídia:', error)
    }
  }
}

async function saveMessage(
  message: proto.IWebMessageInfo,
  chatDir: string,
  sock: any,
  config: SyncConfig
) {
  // Criar diretório para o chat se não existir
  if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true })
  }

  // Salvar mensagem
  const messageFile = join(chatDir, `${message.key.id}.json`)
  fs.writeFileSync(messageFile, JSON.stringify(message, null, 2))
  console.log(`Mensagem salva: ${messageFile}`)

  // Baixar mídia se configurado
  if (config.includeMedia) await downloadAndSaveMedia(message, chatDir, sock)
}

async function connectToWhatsApp() {
  // Diretório para armazenar as credenciais
  const AUTH_FOLDER = './data/auth'
  const BACKUP_FOLDER = './data/backup'

  // Criar diretórios se não existirem
  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true })
  if (!fs.existsSync(BACKUP_FOLDER)) fs.mkdirSync(BACKUP_FOLDER, { recursive: true })

  // Carregar estado de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Desktop'),
    printQRInTerminal: true,
    syncFullHistory: true
  })

  // Gerenciar conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Conexão fechada devido a:', lastDisconnect?.error)
      if (shouldReconnect) {
        connectToWhatsApp()
      }
    }

    console.log('Status da conexão:', connection)
  })

  // Salvar credenciais quando atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Processar histórico de mensagens
  sock.ev.on('messaging-history.set', async ({ messages, chats }) => {

    console.log(`Recebido histórico de ${messages.length} mensagens e ${chats.length} chats`)

    // Processar mensagens do histórico
    for (const message of messages) {

      // Verificar tipos de mensagem
      if (syncConfig.messageTypes && syncConfig.messageTypes.length > 0) {
        const messageType = Object.keys(message.message || {})[0];
        if (!messageType || !syncConfig.messageTypes.includes(messageType)) {
          continue;
        }
      }

      // // Verificar limite de mensagens
      // if (syncConfig.maxMessages && messageCount >= syncConfig.maxMessages) {
      //   console.log('Limite máximo de mensagens atingido')
      //   break
      // }

      const remoteJid = message.key.remoteJid
      if (!remoteJid) continue;


      // Check groupchat
      if (!syncConfig.includeGroup && remoteJid.indexOf("@g") != -1) continue;

      const phone = remoteJid.split('@')[0];

      if(syncConfig.includeList){
        if (!syncConfig.includeList.includes(phone.substring(2)) ){ // remover codigo de area
          console.log("Ignorando contato: " + phone);
          continue;
        }
      }

      const chatDir = join(BACKUP_FOLDER, phone)
      await saveMessage(message, chatDir, sock, syncConfig)
      // messageCount++
    }

    // Salvar informações dos chats
    const chatsFile = join(BACKUP_FOLDER, 'chats.json')
    fs.writeFileSync(chatsFile, JSON.stringify(chats, null, 2))
    console.log(`Informações dos chats salvas em: ${chatsFile}`)
  })

  // Processar novas mensagens
  sock.ev.on('messages.upsert', async ({ messages }) => {
    console.log('Nova mensagem recebida')

    for (const message of messages) {
      const chat = message.key.remoteJid
      if (!chat) continue

      const chatDir = join(BACKUP_FOLDER, chat.split('@')[0])
      await saveMessage(message, chatDir, sock, syncConfig)
    }
  })


}

// Carregar lista de contatos (opcional)
try {
  var includeList = fs.readFileSync('includeList.txt', 'utf8').toString().split('\n');
  syncConfig.includeList = includeList;
} catch (err) {
  console.error(err);
}

// Iniciar conexão
connectToWhatsApp()
