import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface FlightResult {
    origin: string;
    destination: string;
    site: string;
    airline: string;
    price: number;
    currency: string;
    departureDate: string;
    returnDate?: string;
    stops: number;
    link: string;
}

export interface SearchParams {
    origin: string;
    destination: string;
    departureDate: string;  // YYYY-MM-DD
    returnDate?: string;  // YYYY-MM-DD
    adults: number;
}

export abstract class BaseScraper {
    abstract readonly siteName: string;
    abstract readonly siteLabel: string;

    abstract search(params: SearchParams): Promise<FlightResult[]>;

    protected async createBrowser(): Promise<Browser> {
        return chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
            ],
        });
    }

    protected async createContext(browser: Browser): Promise<BrowserContext> {
        const context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            viewport: { width: 1440, height: 900 },
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo',
            permissions: [],
            extraHTTPHeaders: {
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            },
        });

        // Anti-detecção (o callback é executado no browser; usamos globalThis para satisfazer o TS no Node)
        await context.addInitScript(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const nav: any = (globalThis as any).navigator;
            if (nav) {
                Object.defineProperty(nav, 'webdriver', { get: () => undefined });
                Object.defineProperty(nav, 'plugins', { get: () => [1, 2, 3] });
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        return context;
    }

    /** Espera um tempo aleatório para simular comportamento humano */
    protected delay(minMs: number, maxMs: number): Promise<void> {
        const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** Tenta extrair texto de um seletor, retorna null se não encontrado */
    protected async tryGetText(page: Page, selector: string): Promise<string | null> {
        try {
            const el = await page.$(selector);
            if (!el) return null;
            return (await el.textContent())?.trim() ?? null;
        } catch {
            return null;
        }
    }

    /** Extrai um número de um texto (remove R$, pontos, trata vírgula decimal) */
    protected parsePrice(raw: string): number | null {
        // Remove R$, espaços, "BRL", etc.
        const cleaned = raw
            .replace(/[^\d,\.]/g, '')
            .replace(/\.(?=\d{3})/g, '')   // remove separador de milhar (ponto)
            .replace(',', '.');             // vírgula -> ponto decimal

        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }
}
