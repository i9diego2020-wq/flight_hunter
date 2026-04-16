import type { Page } from 'playwright';
import { BaseScraper, type FlightResult, type SearchParams } from './base';

export class LatamScraper extends BaseScraper {
    readonly siteName = 'latam';
    readonly siteLabel = 'LATAM Airlines';

    async search(params: SearchParams): Promise<FlightResult[]> {
        const browser = await this.createBrowser();
        const results: FlightResult[] = [];

        try {
            const context = await this.createContext(browser);
            const page = await context.newPage();

            // Intercept LATAM's internal flight-search API
            const capturedOffers: FlightResult[] = [];

            page.on('response', async (response) => {
                const url = response.url();
                if (
                    (url.includes('booking.latam.com') || url.includes('flightshopping')) &&
                    url.includes('shopping') &&
                    response.status() === 200
                ) {
                    try {
                        const data = await response.json();
                        const offers = this.parseLatamApiResponse(data, params);
                        capturedOffers.push(...offers);
                    } catch {
                        // response body não é JSON
                    }
                }
            });

            const tipo = params.returnDate ? 'ida_vuelta' : 'ida';
            const url = [
                'https://www.latam.com/pt_br/apps/personas/booking',
                `?fecha1_vuelo1=${params.departureDate}`,
                params.returnDate ? `&fecha2_vuelo1=${params.returnDate}` : '',
                `&ida_vuelta=${tipo}`,
                `&tipo_adultos=ADT`,
                `&cant_adultos=${params.adults}`,
                `&pt_vuelo1=${params.origin}`,
                `&dt_vuelo1=${params.destination}`,
            ].join('');

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await this.delay(6_000, 10_000); // aguarda carregamento assíncrono

            // Fallback: extrai preços do DOM caso API não tenha sido interceptada
            if (capturedOffers.length === 0) {
                const domResults = await this.extractFromDOM(page, params);
                results.push(...domResults);
            } else {
                results.push(...capturedOffers);
            }

            await context.close();
        } catch (error) {
            console.error(`[LATAM] Erro ao buscar: ${(error as Error).message}`);
        } finally {
            await browser.close();
        }

        return results;
    }

    private parseLatamApiResponse(data: unknown, params: SearchParams): FlightResult[] {
        const results: FlightResult[] = [];
        try {
            const d = data as Record<string, unknown>;
            const groups = (d.data as Record<string, unknown>)?.groups as unknown[];
            if (!Array.isArray(groups)) return [];

            for (const g of groups) {
                const group = g as Record<string, unknown>;
                const price = (group.lowestPrice as Record<string, unknown>)?.totalPrice as number;
                if (!price) continue;

                results.push({
                    origin: params.origin,
                    destination: params.destination,
                    site: this.siteName,
                    airline: 'LATAM',
                    price: price,
                    currency: 'BRL',
                    departureDate: params.departureDate,
                    returnDate: params.returnDate,
                    stops: (group.stops as number) ?? 0,
                    link: `https://www.latam.com/pt_br/apps/personas/booking?pt_vuelo1=${params.origin}&dt_vuelo1=${params.destination}&fecha1_vuelo1=${params.departureDate}`,
                });
            }
        } catch {
            // silently ignore
        }
        return results;
    }

    private async extractFromDOM(page: Page, params: SearchParams): Promise<FlightResult[]> {
        const results: FlightResult[] = [];
        try {
            // Aguarda algum elemento com preço
            await page.waitForSelector(
                '[class*="price"], [class*="fare"], [data-testid*="price"]',
                { timeout: 15_000 },
            );

            const prices = await page.$$eval(
                '[class*="price"]:not([class*="original"]), [class*="fare-amount"]',
                (els) => els.map((el) => el.textContent?.trim()).filter(Boolean),
            );

            for (const raw of prices) {
                const price = this.parsePrice(raw!);
                if (price && price > 50) {
                    results.push({
                        origin: params.origin,
                        destination: params.destination,
                        site: this.siteName,
                        airline: 'LATAM',
                        price,
                        currency: 'BRL',
                        departureDate: params.departureDate,
                        returnDate: params.returnDate,
                        stops: 0,
                        link: `https://www.latam.com/pt_br/apps/personas/booking?pt_vuelo1=${params.origin}&dt_vuelo1=${params.destination}&fecha1_vuelo1=${params.departureDate}`,
                    });
                    break; // pega o primeiro (mais barato)
                }
            }
        } catch {
            // sem resultados no DOM
        }
        return results;
    }
}
