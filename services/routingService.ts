/**
 * routingService.ts
 * Uses OSRM Public API to get driving routes.
 * NOTE: For production, use a self-hosted OSRM instance or a commercial provider like Mapbox/Google.
 */

export interface RouteSegment {
    coordinates: [number, number][]; // [lat, lng]
    distance: number; // meters
    duration: number; // seconds
}

const OSRM_API_BASE = 'https://router.project-osrm.org/route/v1/driving';

export const getEvacuationRoute = async (
    start: { lat: number; lng: number },
    end: { lat: number; lng: number }
): Promise<RouteSegment | null> => {
    try {
        // OSRM expects "lng,lat" NOT "lat,lng"
        const startCoord = `${start.lng},${start.lat}`;
        const endCoord = `${end.lng},${end.lat}`;
        const url = `${OSRM_API_BASE}/${startCoord};${endCoord}?overview=full&geometries=geojson`;

        console.log(`Fetching route from ${startCoord} to ${endCoord}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.error('OSRM API Error:', response.statusText);
            return null;
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.error('No route found:', data.code);
            return null;
        }

        const route = data.routes[0];
        // OSRM returns [lng, lat], Leaflet needs [lat, lng]
        const coordinates: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

        return {
            coordinates,
            distance: route.distance,
            duration: route.duration
        };

    } catch (error) {
        console.error('Routing Service Failed:', error);
        return null;
    }
};
