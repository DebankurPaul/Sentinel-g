export enum IncidentType {
  FLOOD = 'FLOOD',
  LANDSLIDE = 'LANDSLIDE',
  MEDICAL = 'MEDICAL',
  FOOD_SHORTAGE = 'FOOD_SHORTAGE',
  INFRASTRUCTURE = 'INFRASTRUCTURE'
}

export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  VERIFYING = 'VERIFYING',
  VERIFIED_TRUE = 'VERIFIED_TRUE',
  VERIFIED_FALSE = 'VERIFIED_FALSE',
  NEEDS_DRONE = 'NEEDS_DRONE'
}

export interface GeoPoint {
  x: number;
  y: number;
  lat: number;
  lng: number;
}

export interface Report {
  id: string;
  source: 'TWITTER' | 'TELEGRAM' | 'WHATSAPP' | 'DIRECT';
  text: string;
  imageUrl?: string;
  timestamp: string;
  location: GeoPoint;
  locationName: string;
  type: IncidentType;
  status: VerificationStatus;
  confidenceScore?: number;
  aiAnalysis?: string;
  estimatedDepth?: number; // in meters
}

export interface SatelliteZone {
  id: string;
  name: string;
  status: 'CLEAR' | 'PARTIAL_CLOUD' | 'HEAVY_CLOUD';
  inundationLevel: number; // 0-1 (percentage)
  lastPass: string;
  gridPoints: GeoPoint[]; // Polygon definition
  precipitation?: number; // mm (real-time from weather API)
}

export interface LogisticsPlan {
  routes: string[];
  resources: string[];
  estimatedTime: string;
  reasoning: string;
}

export interface FilterState {
  types: IncidentType[];
  minSeverity: number;
  showVerifiedOnly: boolean;
}

export interface UITheme {
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  bg: string;
  mapWater: string;
  mapLand: string;
}