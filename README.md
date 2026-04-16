# ✈️ Flight Hunter

Monitor automático de passagens aéreas com detecção de promoções. Roda no GitHub Actions (grátis), busca em múltiplos sites e envia alertas no Telegram.

**Sites monitorados:** Decolar · LATAM · GOL · Azul · Iberia · Avianca

---

## 🚀 Setup em 4 passos

### 1. Criar o Bot do Telegram

1. Abra o Telegram e pesquise por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome e um username para o bot (ex: `MeuHunterBot`)
4. O BotFather te dará um **token** como: `1234567890:AAxxxxxx...` → guarde!
5. Para descobrir seu **Chat ID**:
   - Inicie uma conversa com seu bot
   - Acesse: `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
   - O campo `"chat": {"id": 123456789}` é seu Chat ID

> Para um **grupo**, adicione o bot ao grupo e o Chat ID terá o formato `-100xxxxxxxxxx`

---

### 2. Criar o banco de dados no Neon.tech

1. Acesse [neon.tech](https://neon.tech) → crie conta gratuita
2. Crie um novo project chamado `flight-hunter`
3. Na aba **SQL Editor**, cole e execute o conteúdo de [`sql/schema.sql`](sql/schema.sql)
4. Copie a **Connection String** que aparece no painel (começa com `postgresql://...`)

---

### 3. Criar o repositório e configurar Secrets

1. Crie um repositório no GitHub (pode ser privado)
2. Faça upload de todos os arquivos deste projeto
3. Acesse: `Settings → Secrets and variables → Actions → New repository secret`
4. Crie os 3 secrets:

| Secret | Valor |
|--------|-------|
| `DATABASE_URL` | Connection string do Neon.tech |
| `TELEGRAM_TOKEN` | Token do BotFather |
| `TELEGRAM_CHAT_ID` | Seu chat ID numérico |

---

### 4. Configurar as rotas em `routes.json`

Edite o arquivo `routes.json` na raiz do projeto:

```json
[
  {
    "id": "GRU-LIS-JUL",
    "origin": "GRU",
    "destination": "LIS",
    "dateStart": "2025-07-01",
    "dateEnd": "2025-07-31",
    "tripDays": 10,
    "adults": 1,
    "maxPrice": 4000,
    "sites": ["latam", "gol", "iberia", "avianca", "decolar"],
    "active": true
  }
]
```

| Campo | Descrição |
|-------|-----------|
| `origin` / `destination` | Código IATA do aeroporto (GRU, LIS, MIA...) |
| `dateStart` / `dateEnd` | Intervalo de datas de partida |
| `tripDays` | Duração da viagem. `null` = só ida |
| `maxPrice` | Preço máximo — ignora resultados acima |
| `sites` | Sites a consultar: `latam`, `gol`, `azul`, `iberia`, `avianca`, `decolar` |
| `active` | `false` desativa a rota sem deletar |

---

## 🤖 Como funciona

```
GitHub Actions (4x por dia)
  └── Para cada rota ativa
        └── Para cada site configurado
              └── Para cada data no intervalo (amostra de 8)
                    ├── Playwright abre o site e extrai o preço
                    ├── Salva no Neon.tech
                    ├── Compara com média histórica dos últimos 30 dias
                    └── Se preço ≤ 80% da média → alerta Telegram 🔥
                        Se preço ≤ 90% da média → alerta Telegram ✅
```

---

## 🔧 Rodar localmente

```bash
npm install
npx playwright install chromium
cp .env.example .env
# edite .env com suas credenciais
npm run hunt
```

---

## 📊 Lógica de detecção de promoção

| Badge | Condição |
|-------|----------|
| 🔥 **PROMOÇÃO** | Preço atual ≤ média histórica − 20% |
| ✅ **BOM PREÇO** | Preço atual ≤ média histórica − 10% |
| _(silencioso)_ | Preço dentro ou acima da média |

> Nas primeiras execuções (menos de 5 amostras), nenhum alerta é enviado pois ainda não há histórico suficiente para comparação confiável.

---

## ⚠️ Avisos

- Sites de companhias aéreas têm proteção anti-bot. O sistema usa técnicas de stealth mas pode ser bloqueado ocasionalmente. Se um site falhar, o próximo continua normalmente.
- O mesmo alerta não é enviado duas vezes em 24 horas para evitar spam.
- Para produção intensiva, considere um CAPTCHA solver como 2captcha.
