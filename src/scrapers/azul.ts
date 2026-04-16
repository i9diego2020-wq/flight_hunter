import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

export class AzulScraper extends BaseScraper {
    readonly siteName = 'azul';
    readonly siteLabel = 'Azul Linhas Aéreas';

    async search(params: SearchParams): Promise<FlightResult[]> {
        const browser = await this.createBrowser();
        const results: FlightResult[] = [];

        try {
            const context = await this.createContext(browser);
            const page = await context.newPage();
            const captured: FlightResult[] = [];

            page.on('response', async (response) => {
                const url = response.url();
                if (
                    (url.includes('availability') || url.includes('shopping') || url.includes('booking')) &&
                    (url.includes('azul') || url.includes('TravelFusion')) &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseAzulApiResponse(data, params);
                        captured.push(...offers);
                    } catch { /* não JSON */ }
                }
            });

            // Azul usa formato [ORIGIN:DEST:DATE] na URL
            const c = params.returnDate
                ? `[${params.origin}:${params.destination}:${params.departureDate}]-[${params.destination}:${params.origin}:${params.returnDate}]`
                : `[${params.origin}:${params.destination}:${params.departureDate}]`;

            const url = `https://www.voeazul.com.br/br/pt/home/selecao-de-assento?c=${encodeURIComponent(c)}&p=[ADT:${params.adults}]`;

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(8_000, 13_000);

            if (captured.length === 0) {
                results.push(...await this.extractFromDOM(page, params));
            } else {
                results.push(...captured);
            }

            await context.close();
        } catch (error) {
            console.error(`[AZUL] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseAzulApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;
            // Azul normalmente retorna { journeys: [ { recommendations: [ { totalPrice: ... } ] } ] }
            const journeys = d.journeys as unknown[];
            if (!Array.isArray(journeys)) return [];

            for (const j of journeys) {
                const journey = j as Record<string, unknown>;
                const recs = journey.recommendations as unknown[];
                if (!Array.isArray(recs)) continue;

                for (const r of recs) {
                    const rec = r as Record<string, unknown>;
                    const price = parseFloat(String(rec.totalPrice ?? rec.lowestPrice ?? ''));
                    if (!isNaN(price) && price > 0) {
                        results.push({
                            origin: params.origin,
                            destination: params.destination,
                            site: this.siteName,
                            airline: 'Azul',
                            price,
                            currency: 'BRL',
                            departureDate: params.departureDate,
                            returnDate: params.returnDate,
                            stops: (rec.stops as number) ?? 0,
                            link: `https://www.voeazul.com.br/br/pt/home/selecao-de-assento`,
                        });
                        break;
                    }
                }
                if (results.length > 0) break;
            }
        } catch { /* silently ignore */ }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            await page.waitForSelector('[class*="price"], [class*="valor"], [class*="preco"]', {
                timeout: 15_000,
            });
            const prices = await page.$$eval(
                '[class*="price"]:not([class*="old"]), [class*="preco-total"], [class*="valor-total"]',
                (els) => els.map((el) => el.textContent?.trim()).filter(Boolean),
            );
            for (const raw of prices) {
                const price = this.parsePrice(raw!);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: 'Azul',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: 'https://www.voeazul.com.br',
                    });
                    break;
                }
            }
        } catch { /* sem dom */ }
        return results;
    }
}
