import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { TelegramNotifier } from './notify/telegram';
import { sampleDatesInRange, addDays } from './engine/priceIntel';
import { searchFlights } from './amadeus';

interface Route {
    id: string;
    origin: string;
    destination: string;
    dateStart: string;
    dateEnd: string;
    tripDays: number | null;
    adults: number;
    maxPrice?: number;
    active: boolean;
}

async function delay(min: number, max: number) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET } = process.env;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('❌ Faltando: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID');
        process.exit(1);
    }
    if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) {
        console.error('❌ Faltando: AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET');
        process.exit(1);
    }

    const telegram = new TelegramNotifier(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID);

    const routesPath = path.join(process.cwd(), 'routes.json');
    const routes: Route[] = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    const activeRoutes = routes.filter((r) => r.active);

    console.log(`🛫 Flight Hunter iniciado — ${activeRoutes.length} rota(s) ativa(s)`);

    for (const route of activeRoutes) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📍 Rota: ${route.origin} → ${route.destination} [${route.id}]`);

        const dates = sampleDatesInRange(route.dateStart, route.dateEnd, 8);
        console.log(`📅 Verificando ${dates.length} data(s): ${dates.join(', ')}`);

        let totalFound = 0;
        let totalSent = 0;

        for (const departureDate of dates) {
            const returnDate = route.tripDays
                ? addDays(departureDate, route.tripDays)
                : undefined;

            console.log(`  🔍 ${departureDate}${returnDate ? ` → ${returnDate}` : ' (só ida)'}`);

            try {
                const flights = await searchFlights(
                    {
                        origin: route.origin,
                        destination: route.destination,
                        departureDate,
                        returnDate,
                        adults: route.adults,
                    },
                    AMADEUS_CLIENT_ID,
                    AMADEUS_CLIENT_SECRET,
                );

                for (const flight of flights) {
                    if (route.maxPrice && flight.price > route.maxPrice) {
                        console.log(`    ↳ R$ ${flight.price} (acima do limite de R$ ${route.maxPrice})`);
                        continue;
                    }

                    totalFound++;
                    console.log(`    ↳ R$ ${flight.price.toFixed(2)} — ${flight.airline} — enviando...`);
                    await telegram.sendAlert(flight);
                    totalSent++;
                }

                if (flights.length === 0) {
                    console.log(`    ↳ Nenhum resultado`);
                }
            } catch (err) {
                console.error(`    ❌ Erro: ${(err as Error).message}`);
            }

            await delay(1_000, 2_000);
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
