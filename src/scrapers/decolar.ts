import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

/**
 * Decolar é uma OTA (agência online) e exibe resultados de múltiplas companhias.
 * É o scraper mais rico em dados pois cobre várias aéreas de uma vez.
 */
export class DecolaScraper extends BaseScraper {
    readonly siteName = 'decolar';
    readonly siteLabel = 'Decolar.com';

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
                    (url.includes('despegar') || url.includes('decolar')) &&
                    (url.includes('availability') || url.includes('clusters') || url.includes('search')) &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseDecolárApiResponse(data, params);
                        captured.push(...offers);
                    } catch { /* não JSON */ }
                }
            });

            const tipo = params.returnDate ? 'roundtrip' : 'oneway';
            const url = [
                'https://www.decolar.com/flights/results/',
                `?from=${params.origin}`,
                `&to=${params.destination}`,
                `&depart=${params.departureDate}`,
                params.returnDate ? `&in=${params.returnDate}` : '',
                `&adults=${params.adults}`,
                `&children=0`,
                `&infants=0`,
                `&cabinClass=ECONOMY`,
                `&itinerary=${tipo}`,
            ].join('');

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(10_000, 16_000); // Decolar é mais lento

            if (captured.length === 0) {
                results.push(...await this.extractFromDOM(page, params));
            } else {
                results.push(...captured);
            }

            await context.close();
        } catch (error) {
            console.error(`[DECOLAR] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseDecolárApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;

            // Decolar (marca de Despegar) usa "clusters" para agrupar voos
            const clusters = (d.clusters ?? d.results ?? d.items) as unknown[];
            if (!Array.isArray(clusters)) return [];

            for (const c of clusters) {
                const cluster = c as Record<string, unknown>;
                const priceObj = (cluster.price ?? cluster.totalPrice) as Record<string, unknown>;
                const price = parseFloat(String(priceObj?.totalAmount ?? priceObj?.total ?? priceObj?.amount ?? ''));
                if (isNaN(price) || price <= 0) continue;

                const airlineCode = (
                    (cluster.segments as unknown[])?.[0] as Record<string, unknown>
                )?.marketingCarrier as string;

                results.push({
                    origin: params.origin,
                    destination: params.destination,
                    site: this.siteName,
                    airline: airlineCode ?? 'Múltiplas',
                    price,
                    currency: 'BRL',
                    departureDate: params.departureDate,
                    returnDate: params.returnDate,
                    stops: (cluster.stops as number) ?? 0,
                    link: `https://www.decolar.com/flights/results/?from=${params.origin}&to=${params.destination}&depart=${params.departureDate}`,
                });
            }
            // Ordena pelo menor preço e retorna só os 3 mais baratos
            results.sort((a, b) => a.price - b.price);
            return results.slice(0, 3);
        } catch { /* silently ignore */ }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            await page.waitForSelector(
                '[class*="price"], [class*="Price"], [data-test*="price"], [class*="amount"]',
                { timeout: 20_000 },
            );
            const items = await page.$$eval(
                '[class*="result-card"], [class*="flight-card"], [class*="cluster"]',
                (cards) =>
                    cards.slice(0, 5).map((card) => {
                        const priceEl = card.querySelector('[class*="price"], [class*="amount"]');
                        const alEl = card.querySelector('[class*="airline"], [class*="carrier"]');
                        return {
                            priceText: priceEl?.textContent?.trim() ?? '',
                            airlineText: alEl?.textContent?.trim() ?? '',
                        };
                    }),
            );

            for (const item of items) {
                const price = this.parsePrice(item.priceText);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: item.airlineText || 'Múltiplas',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: `https://www.decolar.com/flights/results/?from=${params.origin}&to=${params.destination}&depart=${params.departureDate}`,
                    });
                }
            }
            results.sort((a, b) => a.price - b.price);
        } catch { /* sem dom */ }
        return results;
    }
}
