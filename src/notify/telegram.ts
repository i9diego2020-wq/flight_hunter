import type { FlightResult } from '../scrapers/base';
import { formatDateBR } from '../engine/priceIntel';

const BASE_URL = 'https://api.telegram.org';

export class TelegramNotifier {
    private token: string;
    private chatId: string;

    constructor(token: string, chatId: string) {
        this.token = token;
        this.chatId = chatId;
    }

    async sendAlert(flight: FlightResult): Promise<void> {
        const priceFormatted = flight.price.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const dateLine = flight.returnDate
            ? `📅 *Ida:* ${formatDateBR(flight.departureDate)} · *Volta:* ${formatDateBR(flight.returnDate)}`
            : `📅 *Ida:* ${formatDateBR(flight.departureDate)} _(só ida)_`;

        const stopsLine = flight.stops === 0
            ? '🛫 *Direto*'
            : `🛫 *${flight.stops} escala(s)*`;

        const linkLine = flight.link ? `\n🔗 [Ver oferta](${flight.link})` : '';

        const message = [
            `✈️ *${flight.origin} → ${flight.destination}*`,
            ``,
            `🏢 *Companhia:* ${flight.airline || flight.site}`,
            `🌐 *Site:* ${flight.site.charAt(0).toUpperCase() + flight.site.slice(1)}`,
            dateLine,
            stopsLine,
            `💰 *Preço:* R$ ${priceFormatted}`,
            linkLine,
        ]
            .filter((l) => l !== undefined)
            .join('\n');

        await this.sendMessage(message.trim());
    }

    async sendMessage(text: string): Promise<void> {
        const url = `${BASE_URL}/bot${this.token}/sendMessage`;
        const body = {
            chat_id: this.chatId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ Telegram error: ${response.status}`, err);
        }
    }

    async sendSummary(routeId: string, totalFound: number, totalSent: number): Promise<void> {
        const msg = [
            `📋 *Varredura concluída* — Rota: ${routeId}`,
            `Resultados encontrados: ${totalFound}`,
            `Mensagens enviadas:     ${totalSent}`,
            `⏱ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        ].join('\n');

        await this.sendMessage(msg);
    }
}
