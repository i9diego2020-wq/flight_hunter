import type { FlightResult } from '../scrapers/base';
import type { PriceStats } from '../db/neon';

export type DealLevel = 'PROMOTION' | 'GOOD_PRICE' | 'NORMAL';

const DEAL_THRESHOLD = parseFloat(process.env.DEAL_THRESHOLD_PERCENT || '20') / 100;
const GOOD_PRICE_THRESHOLD = parseFloat(process.env.GOOD_PRICE_THRESHOLD_PERCENT || '10') / 100;
const MIN_SAMPLES = parseInt(process.env.MIN_SAMPLES_FOR_INTEL || '5');

export function getDealLevel(price: number, stats: PriceStats): DealLevel {
    // Se não houver amostras suficientes, não classifica como promoção
    if (stats.count < MIN_SAMPLES) return 'NORMAL';

    const promotionCutoff = stats.avg * (1 - DEAL_THRESHOLD);
    const goodPriceCutoff = stats.avg * (1 - GOOD_PRICE_THRESHOLD);

    if (price <= promotionCutoff) return 'PROMOTION';
    if (price <= goodPriceCutoff) return 'GOOD_PRICE';
    return 'NORMAL';
}

export function formatSavingsPercent(price: number, stats: PriceStats): string {
    if (stats.avg === 0) return '0';
    const savings = ((stats.avg - price) / stats.avg) * 100;
    return savings.toFixed(0);
}

export function buildPriceBar(price: number, stats: PriceStats): string {
    if (stats.min === stats.max) return '▓▓▓▓▓';
    const ratio = (price - stats.min) / (stats.max - stats.min);
    const filled = Math.round(ratio * 5);
    const bars = ['🟢', '🟡', '🟠', '🔴'];
    const barIdx = Math.min(Math.floor(ratio * bars.length), bars.length - 1);
    return bars[barIdx] + ' ' + '▓'.repeat(filled) + '░'.repeat(5 - filled);
}

/** Escolhe N datas distribuídas igualmente no intervalo */
export function sampleDatesInRange(
    startDate: string,
    endDate: string,
    maxSamples = 8,
): string[] {
    const start = new Date(startDate + 'T12:00:00Z');
    const end = new Date(endDate + 'T12:00:00Z');
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000) + 1;

    if (diffDays <= maxSamples) {
        // Retorna todos os dias no intervalo
        return Array.from({ length: diffDays }, (_, i) => {
            const d = new Date(start.getTime() + i * 86_400_000);
            return toDateStr(d);
        });
    }

    // Distribui uniformemente
    const step = diffDays / maxSamples;
    return Array.from({ length: maxSamples }, (_, i) => {
        const d = new Date(start.getTime() + Math.floor(i * step) * 86_400_000);
        return toDateStr(d);
    });
}

export function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return toDateStr(d);
}

export function formatDateBR(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function toDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
}
