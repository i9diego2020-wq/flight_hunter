import type { FlightResult, SearchParams } from './scrapers/base';

const AMADEUS_AUTH_URL = 'https://test.api.amadeus.com/v1/security/oauth2/token';
const AMADEUS_SEARCH_URL = 'https://test.api.amadeus.com/v2/shopping/flight-offers';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    const res = await fetch(AMADEUS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Amadeus auth failed: ${err}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.token;
}

export async function searchFlights(
    params: SearchParams,
    clientId: string,
    clientSecret: string,
): Promise<FlightResult[]> {
    const token = await getAccessToken(clientId, clientSecret);

    const query = new URLSearchParams({
        originLocationCode: params.origin,
        destinationLocationCode: params.destination,
        departureDate: params.departureDate,
        adults: String(params.adults),
        max: '5',
        currencyCode: 'BRL',
    });

    if (params.returnDate) {
        query.set('returnDate', params.returnDate);
    }

    const res = await fetch(`${AMADEUS_SEARCH_URL}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Amadeus search failed (${res.status}): ${err}`);
    }

    const data = await res.json() as AmadeusResponse;

    const results: FlightResult[] = [];

    for (const offer of data.data ?? []) {
        const price = parseFloat(offer.price.grandTotal);
        if (isNaN(price)) continue;

        const firstItinerary = offer.itineraries[0];
        const firstSegment = firstItinerary.segments[0];
        const lastSegment = firstItinerary.segments[firstItinerary.segments.length - 1];
        const stops = firstItinerary.segments.length - 1;
        const airline = firstSegment.carrierCode;

        results.push({
            origin: params.origin,
            destination: params.destination,
            site: 'amadeus',
            airline,
            price,
            currency: 'BRL',
            departureDate: params.departureDate,
            returnDate: params.returnDate,
            stops,
            link: `https://www.google.com/travel/flights/search?q=voos+${params.origin}+${params.destination}+${params.departureDate}`,
        });
    }

    return results;
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AmadeusResponse {
    data: AmadeusOffer[];
}

interface AmadeusOffer {
    price: { grandTotal: string };
    itineraries: AmadeusItinerary[];
    validatingAirlineCodes: string[];
}

interface AmadeusItinerary {
    segments: AmadeusSegment[];
}

interface AmadeusSegment {
    carrierCode: string;
    departure: { iataCode: string; at: string };
    arrival: { iataCode: string; at: string };
}
