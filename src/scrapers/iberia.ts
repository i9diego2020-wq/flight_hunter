import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

export class IberiaScraper extends BaseScraper {
    readonly siteName = 'iberia';
    readonly siteLabel = 'Iberia';

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
                    (url.includes('flightshopping') || url.includes('iberia.com/api') || url.includes('availability')) &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseIberiaApiResponse(data, params);
                        captured.push(...offers);
                    } catch { /* não JSON */ }
                }
            });

            // Iberia usa datas no formato YYYYMMDD
            const dep = params.departureDate.replace(/-/g, '');
            const ret = params.returnDate ? params.returnDate.replace(/-/g, '') : '';
            const tipo = params.returnDate ? 'RT' : 'OW';

            const url = [
                'https://www.iberia.com/br/voos/?',
                `or=${params.origin}`,
                `&de=${params.destination}`,
                `&ida=${dep}`,
                params.returnDate ? `&vta=${ret}` : '',
                `&ad=${params.adults}`,
                `&cl=Y`,
                `&fl=0`,
                `&vf=${tipo}`,
            ].join('');

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(8_000, 14_000);

            if (captured.length === 0) {
                results.push(...await this.extractFromDOM(page, params));
            } else {
                results.push(...captured);
            }

            await context.close();
        } catch (error) {
            console.error(`[IBERIA] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseIberiaApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;
            const itineraries = (d.flightOffers ?? d.itineraries ?? d.offers) as unknown[];
            if (!Array.isArray(itineraries)) return [];

            for (const it of itineraries) {
                const item = it as Record<string, unknown>;
                const price = parseFloat(String(
                    (item.totalPrice as Record<string, unknown>)?.amount ??
                    item.price ??
                    ''
                ));
                if (isNaN(price) || price <= 0) continue;

                results.push({
                    origin: params.origin,
                    destination: params.destination,
                    site: this.siteName,
                    airline: 'Iberia',
                    price,
                    currency: 'BRL',
                    departureDate: params.departureDate,
                    returnDate: params.returnDate,
                    stops: (item.stops as number) ?? 0,
                    link: `https://www.iberia.com/br/voos/?or=${params.origin}&de=${params.destination}&ida=${params.departureDate.replace(/-/g, '')}`,
                });
                break;
            }
        } catch { /* silently ignore */ }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            await page.waitForSelector('[class*="price"], [class*="precio"], [class*="price-fare"]', {
                timeout: 15_000,
            });
            const prices = await page.$$eval(
                '[class*="price-amount"], [class*="fare-price"], [class*="price-total"]',
                (els) => els.map((el) => el.textContent?.trim()).filter(Boolean),
            );
            for (const raw of prices) {
                const price = this.parsePrice(raw!);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: 'Iberia',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: `https://www.iberia.com/br/voos/?or=${params.origin}&de=${params.destination}`,
                    });
                    break;
                }
            }
        } catch { /* sem dom */ }
        return results;
    }
}
