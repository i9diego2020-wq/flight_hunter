import type { FlightResult } from '../scrapers/base';
import type { PriceStats } from '../db/neon';
import type { DealLevel } from '../engine/priceIntel';
import { formatSavingsPercent, formatDateBR } from '../engine/priceIntel';

const BASE_URL = 'https://api.telegram.org';

export class TelegramNotifier {
    private token: string;
    private chatId: string;

    constructor(token: string, chatId: string) {
        this.token = token;
        this.chatId = chatId;
    }

    async sendAlert(
        flight: FlightResult,
        stats: PriceStats,
        dealLevel: DealLevel,
    ): Promise<void> {
        const emoji = dealLevel === 'PROMOTION' ? '🔥' : '✅';
        const label = dealLevel === 'PROMOTION' ? 'PROMOÇÃO DETECTADA' : 'BOM PREÇO';
        const savings = formatSavingsPercent(flight.price, stats);

        const priceFormatted = flight.price.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        const avgFormatted = stats.avg.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const returnLine = flight.returnDate
            ? `📅 *Ida:* ${formatDateBR(flight.departureDate)} · *Volta:* ${formatDateBR(flight.returnDate)}\n`
            : `📅 *Ida:* ${formatDateBR(flight.departureDate)} _(só ida)_\n`;

        const stopsLine = flight.stops === 0
            ? '🛫 *Direto*\n'
            : `🛫 *${flight.stops} escala(s)*\n`;

        const avgLine = stats.count >= 5
            ? `📊 *Média histórica:* R$ ${avgFormatted}\n📉 *Economia:* -${savings}%\n`
            : `📊 _Dados históricos ainda insuficientes para comparação_\n`;

        const linkLine = flight.link ? `\n🔗 [Ver oferta](${flight.link})` : '';

        const message = [
            `${emoji} *${label}* — ${flight.origin} → ${flight.destination}`,
            ``,
            `✈️ *Companhia:* ${flight.airline || flight.site}`,
            `🌐 *Site:* ${flight.site.charAt(0).toUpperCase() + flight.site.slice(1)}`,
            returnLine.trimEnd(),
            stopsLine.trimEnd(),
            `💰 *Preço:* R$ ${priceFormatted}`,
            avgLine.trimEnd(),
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

    async sendSummary(routeId: string, totalFound: number, dealsFound: number): Promise<void> {
        const icon = dealsFound > 0 ? '🎯' : '📋';
        const msg = [
            `${icon} *Varredura concluída* — Rota: ${routeId}`,
            `Resultados analisados: ${totalFound}`,
            `Alertas disparados:    ${dealsFound}`,
            `⏱ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        ].join('\n');

        await this.sendMessage(msg);
    }
}
