export { LatamScraper } from './latam';
export { GolScraper } from './gol';
export { AzulScraper } from './azul';
export { IberiaScraper } from './iberia';
export { AviancaScraper } from './avianca';
export { DecolaScraper } from './decolar';

import { LatamScraper } from './latam';
import { GolScraper } from './gol';
import { AzulScraper } from './azul';
import { IberiaScraper } from './iberia';
import { AviancaScraper } from './avianca';
import { DecolaScraper } from './decolar';
import type { BaseScraper } from './base';

export const allScrapers: Record<string, BaseScraper> = {
    latam: new LatamScraper(),
    gol: new GolScraper(),
    azul: new AzulScraper(),
    iberia: new IberiaScraper(),
    avianca: new AviancaScraper(),
    decolar: new DecolaScraper(),
};
