-- Execute este script no SQL Editor do Neon.tech para criar as tabelas

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  origin      VARCHAR(10)   NOT NULL,
  destination VARCHAR(10)   NOT NULL,
  site        VARCHAR(50)   NOT NULL,
  airline     VARCHAR(100),
  price       DECIMAL(12,2) NOT NULL,
  currency    VARCHAR(10)   DEFAULT 'BRL',
  departure_date DATE        NOT NULL,
  return_date    DATE,
  stops       INT           DEFAULT 0,
  link        TEXT,
  checked_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ph_route
  ON price_history(origin, destination);

CREATE INDEX IF NOT EXISTS idx_ph_checked_at
  ON price_history(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_ph_route_date
  ON price_history(origin, destination, departure_date);

-- View para estatísticas dos últimos 30 dias
CREATE OR REPLACE VIEW route_stats_30d AS
SELECT
  origin,
  destination,
  ROUND(AVG(price)::numeric, 2)    AS avg_price,
  MIN(price)                        AS min_price,
  MAX(price)                        AS max_price,
  ROUND(STDDEV(price)::numeric, 2) AS std_dev,
  COUNT(*)                          AS sample_count,
  MAX(checked_at)                   AS last_checked
FROM price_history
WHERE checked_at > NOW() - INTERVAL '30 days'
GROUP BY origin, destination;

-- Tabela de alertas enviados (evita spam repetido)
CREATE TABLE IF NOT EXISTS sent_alerts (
  id             BIGSERIAL PRIMARY KEY,
  origin         VARCHAR(10) NOT NULL,
  destination    VARCHAR(10) NOT NULL,
  site           VARCHAR(50) NOT NULL,
  departure_date DATE        NOT NULL,
  price          DECIMAL(12,2) NOT NULL,
  deal_level     VARCHAR(20) NOT NULL,
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_route_date
  ON sent_alerts(origin, destination, departure_date, site);
