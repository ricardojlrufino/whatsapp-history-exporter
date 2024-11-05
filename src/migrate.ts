// src/readMessages.ts
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

class WhatsAppDataReader {
    private dataDir: string;
    private prisma: PrismaClient;

    constructor(dataDir: string ) {
        this.dataDir = dataDir;
        this.prisma = new PrismaClient();
    }

    // Processa uma mensagem para o formato do banco
    private parseMessage(chatId: string, messageData: any) {
        const message = messageData.message || {};
        const messageType = Object.keys(message)[0] || 'unknown';

        // Extrair texto da mensagem dependendo do tipo
        let text: string | undefined;
        let caption: string | undefined;

        if ('conversation' in message) {
            text = message.conversation;
        } else if ('extendedTextMessage' in message) {
            text = message.extendedTextMessage?.text;
        } else if ('imageMessage' in message) {
            caption = message.imageMessage?.caption;
            text = "[imagem] " + (caption || "");
        } else if ('videoMessage' in message) {
            caption = message.videoMessage?.caption;
            text = "[video] " + (caption || "");
        } else if ('audioMessage' in message) {
            text = "[audio]";
        } else if('documentMessage' in message) {
            text = "[document] " + message.documentMessage?.fileName;
        }

        // Verificar se tem mídia
        const hasMedia = [
            'imageMessage',
            'videoMessage',
            'audioMessage',
            'documentMessage',
            'stickerMessage'
        ].includes(messageType);

        const timestamp = new Date(parseInt(messageData.messageTimestamp) * 1000)
        timestamp.setHours(timestamp.getHours() - 3)

        return {
            messageId: messageData.key.id || '',
            timestamp,
            chatId,
            fromMe: messageData.key.fromMe,
            type: messageType.replace('Message', ''),
            // sender: messageData.key.participant || messageData.key.remoteJid,
            text: text || caption,
            hasMedia
        };
    }

    // Lê todos os arquivos JSON de uma pasta
    private async readChatFolder(chatId: string, folderPath: string): Promise<number> {
        let processedCount = 0;

        // Ler todos os arquivos da pasta
        const files = fs.readdirSync(folderPath);

        // Filtrar apenas arquivos .json
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        // Processar cada arquivo JSON
        for (const file of jsonFiles) {
            const filePath = path.join(folderPath, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const messageData = JSON.parse(content);

                // Processar mensagem
                const processedMessage = this.parseMessage(chatId, messageData);

                // Salvar no banco usando upsert para evitar duplicatas
                await this.prisma.message.upsert({
                    where: { messageId: processedMessage.messageId },
                    update: processedMessage,
                    create: processedMessage
                });

                processedCount++;
            } catch (error) {
                console.error(`Erro ao processar arquivo ${filePath}:`, error);
            }
        }

        return processedCount;
    }

    // Lê todas as pastas e salva no banco
    public async readAllChats(options: {
        batchSize?: number;
        onProgress?: (chatId: string, processed: number, total: number) => void;
    } = {}) {
        const { batchSize = 100, onProgress } = options;
        const stats: { [chatId: string]: { processed: number; total: number } } = {};

        // Verificar se o diretório existe
        if (!fs.existsSync(this.dataDir)) {
            throw new Error(`Diretório ${this.dataDir} não encontrado`);
        }

        try {
            // Iniciar transação
            await this.prisma.$transaction(async () => {
                // Ler todas as pastas (cada pasta representa um chat)
                const chatFolders = fs.readdirSync(this.dataDir);

                // Para cada pasta, ler e processar os arquivos
                for (const folder of chatFolders) {
                    const folderPath = path.join(this.dataDir, folder);

                    // Verificar se é um diretório
                    if (fs.statSync(folderPath).isDirectory()) {
                        console.log(`Processando chat: ${folder}`);

                        // Processar mensagens
                        const processedCount = await this.readChatFolder(folder, folderPath);

                        // Atualizar estatísticas
                        stats[folder] = {
                            processed: processedCount,
                            total: processedCount
                        };

                        // Chamar callback de progresso se fornecido
                        if (onProgress) {
                            onProgress(folder, processedCount, processedCount);
                        }
                    }
                }
            });

            return stats;
        } finally {
            // Fechar conexão com o banco
            await this.prisma.$disconnect();
        }
    }
}

// Exemplo de uso
async function main() {
    try {
        const reader = new WhatsAppDataReader('./data/backup');

        const stats = await reader.readAllChats({
            batchSize: 100,
            onProgress: (chatId, processed, total) => {
                console.log(`Chat ${chatId}: processadas ${processed}/${total} mensagens`);
            }
        });

        console.log('\nResumo final:');
        for (const [chatId, chatStats] of Object.entries(stats)) {
            console.log(`Chat ${chatId}: ${chatStats.processed} mensagens processadas`);
        }
    } catch (error) {
        console.error('Erro ao processar mensagens:', error);
    }
}

main();