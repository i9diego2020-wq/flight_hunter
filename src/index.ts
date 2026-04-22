import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NeonDB } from './db/neon';
import { TelegramNotifier } from './notify/telegram';
import { sampleDatesInRange, addDays } from './engine/priceIntel';
import { allScrapers } from './scrapers';

interface Route {
    id: string;
    origin: string;
    destination: string;
    dateStart: string;
    dateEnd: string;
    tripDays: number | null;
    adults: number;
    maxPrice?: number;
    sites: string[];
    active: boolean;
}

async function delay(min: number, max: number) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    // ─── Validação de ambiente ──────────────────────────────────────────────
    const { DATABASE_URL, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
    if (!DATABASE_URL || !TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error(
            '❌ Variáveis de ambiente faltando: DATABASE_URL, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID'
        );
        process.exit(1);
    }

    // ─── Inicialização ──────────────────────────────────────────────────────
    const db = new NeonDB(DATABASE_URL);
    const telegram = new TelegramNotifier(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID);

    await db.initialize();

    // ─── Carrega rotas ──────────────────────────────────────────────────────
    const routesPath = path.join(process.cwd(), 'routes.json');
    const routes: Route[] = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    const activeRoutes = routes.filter((r) => r.active);

    console.log(`🛫 Flight Hunter iniciado — ${activeRoutes.length} rota(s) ativa(s)`);

    // ─── Loop principal ─────────────────────────────────────────────────────
    for (const route of activeRoutes) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📍 Rota: ${route.origin} → ${route.destination} [${route.id}]`);

        // Amostra até 8 datas no intervalo
        const dates = sampleDatesInRange(route.dateStart, route.dateEnd, 8);
        console.log(`📅 Verificando ${dates.length} data(s): ${dates.join(', ')}`);

        let totalFound = 0;
        let totalSent = 0;

        for (const scraper of Object.values(allScrapers)) {
            if (!route.sites.includes(scraper.siteName)) continue;

            console.log(`\n  🌐 Site: ${scraper.siteLabel}`);

            for (const departureDate of dates) {
                const returnDate = route.tripDays
                    ? addDays(departureDate, route.tripDays)
                    : undefined;

                console.log(
                    `    🔍 ${departureDate}${returnDate ? ` → ${returnDate}` : ' (só ida)'}`
                );

                try {
                    const flights = await scraper.search({
                        origin: route.origin,
                        destination: route.destination,
                        departureDate,
                        returnDate,
                        adults: route.adults,
                    });

                    for (const flight of flights) {
                        // Filtra por preço máximo configurado
                        if (route.maxPrice && flight.price > route.maxPrice) {
                            console.log(`      ↳ R$ ${flight.price} (acima do limite de R$ ${route.maxPrice})`);
                            continue;
                        }

                        totalFound++;
                        console.log(`      ↳ R$ ${flight.price.toFixed(2)}`);

                        // Evita enviar a mesma combinação nas últimas 24h
                        const alreadySent = await db.alertAlreadySent(
                            route.origin,
                            route.destination,
                            flight.site,
                            departureDate,
                            'REPORT',
                        );

                        if (!alreadySent) {
                            console.log(`      🔔 Enviando para o Telegram...`);
                            await telegram.sendAlert(flight);
                            await db.saveSentAlert(
                                route.origin,
                                route.destination,
                                flight.site,
                                departureDate,
                                flight.price,
                                'REPORT',
                            );
                            totalSent++;
                        } else {
                            console.log(`      (já enviado nas últimas 24h)`);
                        }
                    }

                    if (flights.length === 0) {
                        console.log(`      ↳ Nenhum resultado`);
                    }
                } catch (err) {
                    console.error(`      ❌ Erro: ${(err as Error).message}`);
                }

                await delay(3_000, 6_000);
            }

            await delay(5_000, 10_000);
        }

        console.log(`\n  📊 Resumo [${route.id}]: ${totalFound} encontrado(s), ${totalSent} enviado(s)`);
        await telegram.sendSummary(route.id, totalFound, totalSent);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('✅ Varredura concluída!');
}

main().catch((err) => {
    console.error('💥 Erro fatal:', err);
    process.exit(1);
});
