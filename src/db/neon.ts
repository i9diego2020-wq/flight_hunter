import { neon } from '@neondatabase/serverless';
import type { FlightResult } from '../scrapers/base';

export interface PriceStats {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
  lastChecked: Date | null;
}

export class NeonDB {
  private sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async initialize(): Promise<void> {
    console.log('📦 Initializing database tables...');
    await this.sql`
      CREATE TABLE IF NOT EXISTS price_history (
        id             BIGSERIAL PRIMARY KEY,
        origin         VARCHAR(10)   NOT NULL,
        destination    VARCHAR(10)   NOT NULL,
        site           VARCHAR(50)   NOT NULL,
        airline        VARCHAR(100),
        price          DECIMAL(12,2) NOT NULL,
        currency       VARCHAR(10)   DEFAULT 'BRL',
        departure_date DATE          NOT NULL,
        return_date    DATE,
        stops          INT           DEFAULT 0,
        link           TEXT,
        checked_at     TIMESTAMPTZ   DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS sent_alerts (
        id             BIGSERIAL PRIMARY KEY,
        origin         VARCHAR(10)   NOT NULL,
        destination    VARCHAR(10)   NOT NULL,
        site           VARCHAR(50)   NOT NULL,
        departure_date DATE          NOT NULL,
        price          DECIMAL(12,2) NOT NULL,
        deal_level     VARCHAR(20)   NOT NULL,
        sent_at        TIMESTAMPTZ   DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_ph_route
        ON price_history(origin, destination)
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_ph_route_date
        ON price_history(origin, destination, departure_date)
    `;

    console.log('✅ Database ready.');
  }

  async savePriceHistory(flight: FlightResult): Promise<void> {
    await this.sql`
      INSERT INTO price_history
        (origin, destination, site, airline, price, currency, departure_date, return_date, stops, link)
      VALUES
        (
          ${flight.origin},
          ${flight.destination},
          ${flight.site},
          ${flight.airline ?? null},
          ${flight.price},
          ${flight.currency},
          ${flight.departureDate},
          ${flight.returnDate ?? null},
          ${flight.stops ?? 0},
          ${flight.link ?? null}
        )
    `;
  }

  async getRouteStats(origin: string, destination: string, days = 30): Promise<PriceStats> {
    const rows = await this.sql`
      SELECT
        ROUND(AVG(price)::numeric, 2)    AS avg_price,
        MIN(price)                        AS min_price,
        MAX(price)                        AS max_price,
        ROUND(STDDEV(price)::numeric, 2) AS std_dev,
        COUNT(*)                          AS sample_count,
        MAX(checked_at)                   AS last_checked
      FROM price_history
      WHERE origin      = ${origin}
        AND destination = ${destination}
        AND checked_at  > NOW() - (${days} || ' days')::INTERVAL
    `;

    type StatsRow = {
      avg_price: string;
      min_price: string;
      max_price: string;
      std_dev: string;
      sample_count: string;
      last_checked: string | null;
    };
    const typedRows = rows as unknown as StatsRow[];
    const row = typedRows[0];
    return {
      avg: parseFloat(row.avg_price) || 0,
      min: parseFloat(row.min_price) || 0,
      max: parseFloat(row.max_price) || 0,
      stdDev: parseFloat(row.std_dev) || 0,
      count: parseInt(row.sample_count) || 0,
      lastChecked: row.last_checked ? new Date(row.last_checked) : null,
    };
  }

  /** Verifica se um alerta para essa combinação já foi enviado nas últimas 24h */
  async alertAlreadySent(
    origin: string,
    destination: string,
    site: string,
    departureDate: string,
    dealLevel: string,
  ): Promise<boolean> {
    const rows = await this.sql`
      SELECT id FROM sent_alerts
      WHERE origin        = ${origin}
        AND destination   = ${destination}
        AND site          = ${site}
        AND departure_date = ${departureDate}
        AND deal_level    = ${dealLevel}
        AND sent_at       > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `;
    const typedRows2 = rows as unknown as { id: unknown }[];
    return typedRows2.length > 0;
  }

  async saveSentAlert(
    origin: string,
    destination: string,
    site: string,
    departureDate: string,
    price: number,
    dealLevel: string,
  ): Promise<void> {
    await this.sql`
      INSERT INTO sent_alerts
        (origin, destination, site, departure_date, price, deal_level)
      VALUES
        (${origin}, ${destination}, ${site}, ${departureDate}, ${price}, ${dealLevel})
    `;
  }
}
