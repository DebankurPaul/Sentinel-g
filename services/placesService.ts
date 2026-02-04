/**
 * placesService.ts
 * Uses Overpass API (OpenStreetMap) to find critical resources.
 */

export interface Place {
    id: number;
    lat: number;
    lng: number;
    name: string;
    type: 'hospital' | 'police' | 'shelter' | 'pharmacy';
}

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

export const getNearbyPlaces = async (lat: number, lng: number, radiusMeters: number = 5000): Promise<Place[]> => {
    try {
        const query = `
            [out:json][timeout:10];
            (
              node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
              node["amenity"="police"](around:${radiusMeters},${lat},${lng});
              node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
              node["social_facility"="shelter"](around:${radiusMeters},${lat},${lng});
            );
            out body;
        `;

        const response = await fetch(`${OVERPASS_API}?data=${encodeURIComponent(query)}`);

        if (!response.ok) {
            console.error('Overpass API Error:', response.statusText);
            return [];
        }

        const data = await response.json();

        return data.elements.map((el: any) => ({
            id: el.id,
            lat: el.lat,
            lng: el.lon,
            name: el.tags.name || `${el.tags.amenity || 'Resource'}`,
            type: mapOsmType(el.tags)
        }));

    } catch (error) {
        console.error('Places Service Failed:', error);
        return [];
    }
};

const mapOsmType = (tags: any): string => {
    if (tags.amenity === 'hospital') return 'hospital';
    if (tags.amenity === 'police') return 'police';
    if (tags.amenity === 'pharmacy') return 'pharmacy';
    if (tags.social_facility === 'shelter') return 'shelter';
    return 'unknown';
};
