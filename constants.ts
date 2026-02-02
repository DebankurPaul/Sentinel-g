import { IncidentType, Report, SatelliteZone, VerificationStatus } from './types';

// Mocking a region of Assam, India
export const MOCK_ZONES: SatelliteZone[] = [
  {
    id: 'Z1',
    name: 'Silchar North',
    status: 'HEAVY_CLOUD',
    inundationLevel: 0.8,
    lastPass: '10 mins ago',
    gridPoints: [
      {x: 10, y: 10, lat: 24.85, lng: 92.75}, 
      {x: 50, y: 10, lat: 24.85, lng: 92.85}, 
      {x: 50, y: 50, lat: 24.80, lng: 92.85}, 
      {x: 10, y: 50, lat: 24.80, lng: 92.75}
    ]
  },
  {
    id: 'Z2',
    name: 'Karimganj Sector',
    status: 'CLEAR',
    inundationLevel: 0.2,
    lastPass: '1 hour ago',
    gridPoints: [
      {x: 60, y: 10, lat: 24.88, lng: 92.35}, 
      {x: 90, y: 10, lat: 24.88, lng: 92.40}, 
      {x: 90, y: 50, lat: 24.84, lng: 92.40}, 
      {x: 60, y: 50, lat: 24.84, lng: 92.35}
    ]
  },
  {
    id: 'Z3',
    name: 'Barak Valley Lowlands',
    status: 'PARTIAL_CLOUD',
    inundationLevel: 0.6,
    lastPass: '30 mins ago',
    gridPoints: [
      {x: 10, y: 60, lat: 24.75, lng: 92.75}, 
      {x: 90, y: 60, lat: 24.75, lng: 92.85}, 
      {x: 90, y: 90, lat: 24.70, lng: 92.85}, 
      {x: 10, y: 90, lat: 24.70, lng: 92.75}
    ]
  }
];

export const INITIAL_REPORTS: Report[] = [
  {
    id: 'r1',
    source: 'TWITTER',
    text: 'Urgent! Water entered first floor of Civil Hospital. Patients stranded. #AssamFloods',
    imageUrl: 'https://picsum.photos/400/300?grayscale', 
    timestamp: new Date().toISOString(),
    location: { x: 20, y: 20, lat: 24.83, lng: 92.77 },
    locationName: 'Silchar Civil Hospital',
    type: IncidentType.MEDICAL,
    status: VerificationStatus.UNVERIFIED,
    estimatedDepth: 1.2
  },
  {
    id: 'r2',
    source: 'WHATSAPP',
    text: 'Embankment breached near Sonai Road. Water rising fast. Need boats.',
    imageUrl: 'https://picsum.photos/400/301?blur=2',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    location: { x: 70, y: 80, lat: 24.60, lng: 92.80 },
    locationName: 'Sonai Road',
    type: IncidentType.INFRASTRUCTURE,
    status: VerificationStatus.UNVERIFIED,
    estimatedDepth: 2.5
  },
  {
    id: 'r3',
    source: 'TELEGRAM',
    text: 'Family stuck on roof in Karimganj. No food for 2 days. 5 people.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    location: { x: 80, y: 25, lat: 24.86, lng: 92.35 },
    locationName: 'Karimganj Town',
    type: IncidentType.FOOD_SHORTAGE,
    status: VerificationStatus.UNVERIFIED
  }
];

export const MAP_STYLES = {
  water: '#38bdf8',
  land: '#1e293b',
  danger: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  text: '#94a3b8'
};