import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

export class GolScraper extends BaseScraper {
    readonly siteName = 'gol';
    readonly siteLabel = 'GOL Linhas Aéreas';

    async search(params: SearchParams): Promise<FlightResult[]> {
        const browser = await this.createBrowser();
        const results: FlightResult[] = [];

        try {
            const context = await this.createContext(browser);
            const page = await context.newPage();
            const captured: FlightResult[] = [];

            // GOL usa uma API interna de compra
            page.on('response', async (response) => {
                const url = response.url();
                if (
                    (url.includes('purchase') || url.includes('availability')) &&
                    url.includes('gol') &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseGolApiResponse(data, params);
                        captured.push(...offers);
                    } catch { /* não JSON */ }
                }
            });

            const tipo = params.returnDate ? 'roundtrip' : 'oneway';
            const search = new URLSearchParams({
                origin: params.origin,
                destination: params.destination,
                departure: params.departureDate,
                adults: String(params.adults),
                children: '0',
                babies: '0',
                type: tipo,
            });
            if (params.returnDate) search.set('return', params.returnDate);

            const url = `https://www.voegol.com.br/pt/comprar-passagens-aereas?${search.toString()}`;

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(7_000, 12_000);

            if (captured.length === 0) {
                const domResults = await this.extractFromDOM(page, params);
                results.push(...domResults);
            } else {
                results.push(...captured);
            }

            await context.close();
        } catch (error) {
            console.error(`[GOL] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseGolApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;
            const flights = d.flights as unknown[];
            if (!Array.isArray(flights)) return [];

            for (const f of flights) {
                const flight = f as Record<string, unknown>;
                const fares = flight.fares as unknown[];
                if (!Array.isArray(fares)) continue;

                const prices = fares
                    .map((fa: unknown) => (fa as Record<string, unknown>).price as number)
                    .filter((p) => p > 0);

                if (prices.length === 0) continue;
                const lowestPrice = Math.min(...prices);

                results.push({
                    origin: params.origin,
                    destination: params.destination,
                    site: this.siteName,
                    airline: 'GOL',
                    price: lowestPrice,
                    currency: 'BRL',
                    departureDate: params.departureDate,
                    returnDate: params.returnDate,
                    stops: (flight.stops as number) ?? 0,
                    link: `https://www.voegol.com.br/pt/comprar-passagens-aereas?origin=${params.origin}&destination=${params.destination}&departure=${params.departureDate}`,
                });
            }
        } catch { /* silently ignore */ }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            await page.waitForSelector('[class*="price"], [class*="tarifa"], [class*="valor"]', {
                timeout: 15_000,
            });

            const prices = await page.$$eval(
                '[class*="price"]:not([class*="old"]):not([class*="strike"]), [class*="tarifa-valor"]',
                (els) => els.map((el) => el.textContent?.trim()).filter(Boolean),
            );

            for (const raw of prices) {
                const price = this.parsePrice(raw!);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: 'GOL',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: `https://www.voegol.com.br/pt/comprar-passagens-aereas?origin=${params.origin}&destination=${params.destination}&departure=${params.departureDate}`,
                    });
                    break;
                }
            }
        } catch { /* sem dom */ }
        return results;
    }
}
