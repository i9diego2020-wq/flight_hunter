import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

export class AviancaScraper extends BaseScraper {
    readonly siteName = 'avianca';
    readonly siteLabel = 'Avianca';

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
                    (url.includes('shopping') || url.includes('flightoffers') || url.includes('availability')) &&
                    url.includes('avianca') &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseAviancaApiResponse(data, params);
                        captured.push(...offers);
                    } catch { /* não JSON */ }
                }
            });

            const tipo = params.returnDate ? 'roundtrip' : 'oneway';
            const url = [
                'https://www.avianca.com/br/pt/voos/',
                `?Origin=${params.origin}`,
                `&Destination=${params.destination}`,
                `&DepartDate=${params.departureDate}`,
                params.returnDate ? `&ReturnDate=${params.returnDate}` : '',
                `&Adults=${params.adults}`,
                `&Children=0`,
                `&Infants=0`,
                `&CabinClass=Economy`,
                `&TripType=${tipo}`,
            ].join('');

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(8_000, 13_000);

            if (captured.length === 0) {
                results.push(...await this.extractFromDOM(page, params));
            } else {
                results.push(...captured);
            }

            await context.close();
        } catch (error) {
            console.error(`[AVIANCA] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseAviancaApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;
            const offers = (d.flightOffers ?? d.offers ?? d.results) as unknown[];
            if (!Array.isArray(offers)) return [];

            for (const o of offers) {
                const offer = o as Record<string, unknown>;
                const price = parseFloat(String(
                    (offer.price as Record<string, unknown>)?.total ??
                    offer.totalPrice ??
                    offer.price ??
                    ''
                ));
                if (isNaN(price) || price <= 0) continue;

                results.push({
                    origin: params.origin,
                    destination: params.destination,
                    site: this.siteName,
                    airline: 'Avianca',
                    price,
                    currency: 'BRL',
                    departureDate: params.departureDate,
                    returnDate: params.returnDate,
                    stops: (offer.stops as number) ?? 0,
                    link: `https://www.avianca.com/br/pt/voos/?Origin=${params.origin}&Destination=${params.destination}&DepartDate=${params.departureDate}`,
                });
                break;
            }
        } catch { /* silently ignore */ }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            await page.waitForSelector('[class*="price"], [class*="Price"], [class*="fare"]', {
                timeout: 15_000,
            });
            const prices = await page.$$eval(
                '[class*="price-value"], [class*="totalPrice"], [class*="fare-price"]',
                (els) => els.map((el) => el.textContent?.trim()).filter(Boolean),
            );
            for (const raw of prices) {
                const price = this.parsePrice(raw!);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: 'Avianca',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: `https://www.avianca.com/br/pt/voos/?Origin=${params.origin}&Destination=${params.destination}`,
                    });
                    break;
                }
            }
        } catch { /* sem dom */ }
        return results;
    }
}
