import React, { useState, useEffect, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

console.log("Sentinel-G Dashboard Loading...");

// Initialize Gemini
let genAI: GoogleGenerativeAI;
try {
    console.log("Initializing Gemini Client...");
    genAI = new GoogleGenerativeAI(process.env.API_KEY || "");
    console.log("Gemini Client Initialized");
} catch (err) {
    console.error("Failed to initialize Gemini Client:", err);
}


// --- Types ---
interface SafeZone {
    lat: number;
    lng: number;
    name: string;
}

interface Alert {
    id: string;
    type: string;
    location: { lat: number; lng: number };
    description: string;
    timestamp: Date;
    severity: "low" | "medium" | "high" | "critical";
    weather?: string;
    route?: string;
    safeZone?: SafeZone;
    reportCount: number;
    status: "verified" | "pending";
    reporterId?: string;
}

interface UserLocation {
    lat: number;
    lng: number;
}

// --- Icons & UI Components ---

const Header = () => (
    <header className="absolute top-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-b border-slate-700 p-4 flex justify-between items-center shadow-lg z-[1000]">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <div>
                <h1 className="font-bold text-xl text-white tracking-tight leading-none">Sentinel-G</h1>
                <p className="text-[10px] text-slate-400 font-medium tracking-wide">SATELLITE DISASTER RESPONSE</p>
            </div>
        </div>
        <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] text-green-400 font-mono font-bold">LIVE FEED</span>
        </div>
    </header>
);

const CameraCapture = ({ onCapture, onClose }: { onCapture: (img: string) => void; onClose: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Camera error:", err);
                alert("Camera permission denied or unavailable.");
                onClose();
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [onClose]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(video, 0, 0);
                const dataUrl = canvas.toDataURL("image/jpeg");
                const base64 = dataUrl.split(",")[1];
                onCapture(base64);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black overflow-hidden h-[100dvh] w-full animate-in fade-in duration-300">
            <div className="flex-1 relative">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover absolute inset-0" />
                <canvas ref={canvasRef} className="hidden" />

                {/* Overlay Guides */}
                <div className="absolute inset-0 border-[30px] border-black/30 pointer-events-none">
                    <div className="w-full h-full border-2 border-white/50 relative">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-red-500"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-red-500"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-red-500"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-red-500"></div>
                    </div>
                </div>

                <button onClick={onClose} className="absolute top-6 right-6 bg-black/60 text-white p-3 rounded-full backdrop-blur-md border border-white/10 hover:bg-black/80 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="h-40 bg-slate-900 flex items-center justify-center gap-8 pb-8">
                <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-red-600 hover:bg-red-700 transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-95">
                    <div className="w-16 h-16 rounded-full border-2 border-slate-900/50"></div>
                </button>
            </div>
        </div>
    );
};

const AlertDetails = ({ alert, onClose, onVerify }: { alert: Alert; onClose: () => void; onVerify: () => void }) => {
    return (
        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-700 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-[1100] max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">

            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-1" onClick={onClose}>
                <div className="w-12 h-1.5 bg-slate-600 rounded-full"></div>
            </div>

            <div className="p-6 overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${alert.severity === 'critical' ? 'bg-red-500/20 text-red-500' :
                            alert.severity === 'high' ? 'bg-orange-500/20 text-orange-500' : 'bg-yellow-500/20 text-yellow-500'
                            }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">{alert.type}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${alert.severity === 'critical' ? 'bg-red-900 text-red-200' :
                                    alert.severity === 'high' ? 'bg-orange-900 text-orange-200' : 'bg-yellow-900 text-yellow-200'
                                    }`}>
                                    {alert.severity} Severity
                                </span>
                                {alert.status === 'verified' && (
                                    <span className="flex items-center gap-1 text-[10px] text-blue-400 font-bold bg-blue-900/30 px-2 py-0.5 rounded border border-blue-800">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                        VERIFIED ({alert.reportCount})
                                    </span>
                                )}
                                {alert.status === 'pending' && (
                                    <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                        PENDING VERIFICATION ({alert.reportCount})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                <p className="text-slate-300 mb-6 leading-relaxed">{alert.description}</p>

                {alert.route && (
                    <div className="bg-indigo-950/50 p-4 rounded-xl border border-indigo-500/30 mb-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <svg className="w-16 h-16 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M13 7H7v6h6V7z" /><path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" /></svg>
                        </div>
                        <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                            Recommended Route
                        </h3>
                        <p className="text-indigo-100 relative z-10">{alert.route}</p>
                        {alert.safeZone && (
                            <div className="mt-3 flex items-center gap-2 text-xs text-indigo-300/80">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                Heading towards: <span className="font-semibold text-white">{alert.safeZone.name}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Weather</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">☁️</span>
                            <span className="text-sm text-white">{alert.weather || "Not available"}</span>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</h3>
                        <div className="flex items-center gap-2 h-full pb-2">
                            <span className="text-sm font-semibold text-white capitalize">{alert.status}</span>
                        </div>
                    </div>
                </div>

                {alert.status !== 'verified' && (
                    <button
                        onClick={onVerify}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95 flex justify-center items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Verify This Report
                    </button>
                )}
            </div>
        </div>
    );
};

const WeatherPanel = ({ center }: { center: { lat: number, lng: number } }) => {
    const [weather, setWeather] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchWeather = async () => {
            if (typeof center.lat !== 'number' || typeof center.lng !== 'number') return;

            setLoading(true);
            try {
                const lat = center.lat.toFixed(4);
                const lng = center.lng.toFixed(4);
                console.log(`Fetching weather for ${lat}, ${lng}`);

                const [weatherRes, airRes, floodRes] = await Promise.all([
                    fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`
                    ),
                    fetch(
                        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,uv_index&timezone=auto`
                    ),
                    fetch(
                        `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge,river_discharge_median&forecast_days=1`
                    )
                ]);

                if (!weatherRes.ok || !airRes.ok) throw new Error(`API Error`);

                const weatherData = await weatherRes.json();
                const airData = await airRes.json();
                const floodData = floodRes.ok ? await floodRes.json() : null; // Flood API might be optional/beta

                setWeather({
                    current: {
                        ...weatherData.current,
                        ...airData.current
                    },
                    flood: floodData?.daily || null
                });
            } catch (e) {
                console.error("Weather fetch failed", e);
            } finally {
                setLoading(false);
            }
        };
        fetchWeather();
    }, [center.lat, center.lng]);

    const code = weather?.current?.weather_code ?? 0;
    const temp = weather?.current?.temperature_2m ?? "--";
    const wind = weather?.current?.wind_speed_10m ?? "--";
    const humidity = weather?.current?.relative_humidity_2m ?? "--";
    const aqi = weather?.current?.us_aqi ?? "--";
    const uv = weather?.current?.uv_index ?? "--";

    // Flood Data
    const discharge = weather?.flood?.river_discharge?.[0] ?? 0;
    const medianDischarge = weather?.flood?.river_discharge_median?.[0] ?? 1;

    // Natural Calamity Risk Logic (Ignoring AQI/UV for High Risk)
    let riskLevel = "Low";
    let riskColor = "text-green-400";
    let riskBg = "bg-green-500/20";

    // 1. Extreme Weather (Violent Storms)
    if (code >= 95 || wind > 80) {
        riskLevel = "Critical"; riskColor = "text-red-500"; riskBg = "bg-red-500/20";
    }
    // 2. Flood Risk (Significant deviation from median)
    else if (discharge > medianDischarge * 3) {
        riskLevel = "Critical"; riskColor = "text-red-500"; riskBg = "bg-red-500/20";
    }
    else if (discharge > medianDischarge * 2) {
        riskLevel = "High"; riskColor = "text-orange-400"; riskBg = "bg-orange-500/20";
    }
    else if (code >= 61 && code <= 65) { // Moderate Rain
        riskLevel = "Medium"; riskColor = "text-yellow-400"; riskBg = "bg-yellow-500/20";
    }

    const getAQILabel = (val: number) => {
        if (val <= 50) return "Good";
        if (val <= 100) return "Moderate";
        if (val <= 150) return "Unhealthy for Sensitive";
        return "Unhealthy";
    };

    return (
        <div className="absolute top-24 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-xl w-72 animate-in fade-in slide-in-from-left duration-500">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                Live Conditions
            </h3>

            {loading && !weather && (
                <div className="text-sm text-slate-400 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
                    Fetching Satellite Data...
                </div>
            )}

            {weather && (
                <>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="text-4xl font-bold text-white flex items-start">
                                {temp}°<span className="text-lg font-normal text-slate-400 mt-1">C</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1 capitalize">{code < 3 ? 'Clear Sky' : code < 50 ? 'Cloudy' : code < 80 ? 'Rainy' : 'Stormy'}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl text-white">
                                {code < 3 ? '☀️' : code < 50 ? '☁️' : code < 80 ? '🌧️' : '⛈️'}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Humidity</div>
                            <div className="text-sm font-semibold text-white flex items-center gap-1">
                                💧 {humidity}%
                            </div>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Wind</div>
                            <div className="text-sm font-semibold text-white flex items-center gap-1">
                                💨 {wind} <span className="text-[10px] font-normal">km/h</span>
                            </div>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">AQI</div>
                            <div className="text-sm font-semibold text-white flex items-center gap-1">
                                😷 {aqi}
                            </div>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">UV Index</div>
                            <div className="text-sm font-semibold text-white flex items-center gap-1">
                                ☀️ {uv}
                            </div>
                        </div>
                    </div>

                    <div className={`p-3 rounded-lg border border-white/5 ${riskBg}`}>
                        <div className="text-[10px] uppercase font-bold text-slate-300 mb-1">Potential Risk</div>
                        <div className={`text-lg font-bold ${riskColor} flex items-center gap-2`}>
                            {riskLevel.toUpperCase()}
                            {riskLevel === 'Critical' && <span className="animate-ping w-2 h-2 rounded-full bg-red-500"></span>}
                        </div>
                    </div>
                </>
            )}

            {!weather && !loading && (
                <div className="text-red-400 text-xs">Weather Data Unavailable</div>
            )}
        </div>
    );
};

// --- Main App Logic ---

const Dashboard = () => {
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState("");
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const routeLayerRef = useRef<any>(null);

    // Map Center State for Weather
    const [mapCenter, setMapCenter] = useState<{ lat: number, lng: number }>({ lat: 26.2006, lng: 92.9376 });

    // Initialize Map
    useEffect(() => {
        // const L = (window as any).L; // Removed, using import
        if (!mapRef.current) return;

        if (!leafletMap.current) {
            console.log("Initializing Leaflet Map...", mapRef.current);
            leafletMap.current = L.map(mapRef.current, {
                zoomControl: false,
                attributionControl: false
            }).setView([26.2006, 92.9376], 7);

            // Listen for move events to update weather
            leafletMap.current.on('moveend', () => {
                const center = leafletMap.current.getCenter().wrap();
                setMapCenter({ lat: center.lat, lng: center.lng });
            });

            // OpenStreetMap Standard Layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(leafletMap.current);

            // Add Scale
            L.control.scale({ position: 'bottomright' }).addTo(leafletMap.current);

            // Force map resize calculation after mount
            setTimeout(() => {
                leafletMap.current?.invalidateSize();
            }, 100);
        }

        // User Location Tracking
        navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserLocation({ lat: latitude, lng: longitude });
            },
            (err) => console.error("Geo error", err),
            { enableHighAccuracy: true }
        );
    }, []);

    // Sync User Marker
    useEffect(() => {
        if (!leafletMap.current || !userLocation) return;

        if (!(leafletMap.current as any).userMarker) {
            const userIcon = L.divIcon({
                className: 'user-pulse',
                html: `<div style="position:relative;">
                    <div style="position:absolute; top:-10px; left:-10px; width:40px; height:40px; background:rgba(59, 130, 246, 0.4); border-radius:50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                    <div style="position:absolute; top:0; left:0; width:20px; height:20px; background:#3b82f6; border:3px solid white; border-radius:50%; box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
                   </div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            (leafletMap.current as any).userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
                .addTo(leafletMap.current);
        } else {
            (leafletMap.current as any).userMarker.setLatLng([userLocation.lat, userLocation.lng]);
        }
    }, [userLocation]);

    // Update Alert Markers & Routes
    useEffect(() => {
        if (!leafletMap.current) return;

        // Clear existing alert markers
        markersRef.current.forEach(m => leafletMap.current.removeLayer(m));
        markersRef.current = [];

        // Clear route layer
        if (routeLayerRef.current) {
            leafletMap.current.removeLayer(routeLayerRef.current);
            routeLayerRef.current = null;
        }

        // Draw Route if alert selected
        if (selectedAlert && selectedAlert.safeZone) {
            const path: [number, number][] = [
                [selectedAlert.location.lat, selectedAlert.location.lng],
                [selectedAlert.safeZone.lat, selectedAlert.safeZone.lng]
            ];

            const group = L.layerGroup().addTo(leafletMap.current);
            routeLayerRef.current = group;

            // Dashed line
            L.polyline(path, {
                color: '#4ade80', // Green
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 10',
                lineCap: 'round'
            }).addTo(group);

            // Safe Zone Marker
            const safeIcon = L.divIcon({
                className: 'safe-icon',
                html: `<div style="background:#22c55e; width:30px; height:30px; border-radius:8px; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <svg style="width:18px; height:18px; color:white;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                   </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            L.marker([selectedAlert.safeZone.lat, selectedAlert.safeZone.lng], { icon: safeIcon })
                .addTo(group)
                .bindPopup(`<b>Safe Zone:</b> ${selectedAlert.safeZone.name}`);

            // Fit bounds to show route
            leafletMap.current.fitBounds(L.latLngBounds(path).pad(0.2));
        }

        // Draw Alert Markers
        alerts.forEach(alert => {
            const color = alert.severity === "critical" ? "#ef4444" : alert.severity === "high" ? "#f97316" : "#eab308";
            const isSelected = selectedAlert?.id === alert.id;

            const icon = L.divIcon({
                className: 'alert-icon',
                html: `<div style="
            background-color: ${color}; 
            width: ${isSelected ? 32 : 24}px; 
            height: ${isSelected ? 32 : 24}px; 
            border-radius: 50%; 
            border: ${isSelected ? '3px' : '2px'} solid white; 
            display: flex; align-items: center; justify-content: center; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        ">
            <span style="color: white; font-weight: bold; font-size: ${isSelected ? 18 : 14}px;">!</span>
        </div>`,
                iconSize: [isSelected ? 32 : 24, isSelected ? 32 : 24],
                iconAnchor: [isSelected ? 16 : 12, isSelected ? 16 : 12]
            });

            const marker = L.marker([alert.location.lat, alert.location.lng], { icon })
                .addTo(leafletMap.current)
                .on('click', () => setSelectedAlert(alert));

            markersRef.current.push(marker);
        });
    }, [alerts, selectedAlert]);

    const handleCapture = async (base64Image: string) => {
        setIsCameraOpen(false);
        setIsProcessing(true);
        setProcessingStep("Acquiring GPS Signal...");

        // Get Location
        const loc = await new Promise<{ lat: number, lng: number }>((resolve) => {
            if (userLocation) resolve(userLocation);
            else {
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => resolve({ lat: 26.2006, lng: 92.9376 })
                );
            }
        });

        setProcessingStep("Analyzing imagery & real-time weather...");

        try {
            const prompt = `
          I am currently at Latitude: ${loc.lat}, Longitude: ${loc.lng} in Northeast India.
          The attached image shows a potential disaster situation.
          
          Perform the following analysis:
          1. Identify the disaster type (e.g., Landslide, Flood, Fire).
          2. Estimate the severity (low, medium, high, critical).
          3. Use Google Search (simulated) to find current weather at these coordinates.
          4. Determine a Safe Route away from this location to the nearest town or high ground. 
          5. Estimate the coordinates (lat/lng) of that Safe Zone.
          
          Return ONLY a JSON object with this structure (no markdown code blocks):
          {
            "hazardType": "string",
            "severity": "low|medium|high|critical",
            "description": "string (short description for alert)",
            "weather": "string (e.g. Heavy Rain, 22C)",
            "route": "string (text description of path)",
            "safeZone": { "lat": number, "lng": number, "name": "string" },
            "confidence": number
          }
        `;

            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const result = await model.generateContent([
                prompt,
                { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]);

            setProcessingStep("Validating Report...");

            const responseText = result.response.text();

            // Parse JSON from text response
            let analysisData;
            try {
                const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                analysisData = JSON.parse(cleanText || "{}");
            } catch (e) {
                console.error("JSON parse failed", e);
                // Fallback
                analysisData = {
                    hazardType: "Reported Incident",
                    severity: "high",
                    description: responseText.slice(0, 100) + "...",
                    weather: "Check local forecast",
                    route: "Proceed with caution",
                    safeZone: { lat: loc.lat + 0.01, lng: loc.lng + 0.01, name: "Safe Area" }
                };
            }


            const newAlert: Alert = {
                id: Date.now().toString(),
                type: analysisData.hazardType || "Incident",
                location: loc,
                description: analysisData.description,
                timestamp: new Date(),
                severity: analysisData.severity || "medium",
                weather: analysisData.weather,
                route: analysisData.route,
                safeZone: analysisData.safeZone,
                reportCount: 1,
                status: "pending"
            };

            setAlerts(prev => [newAlert, ...prev]);
            setSelectedAlert(newAlert);

        } catch (error: any) {
            console.error("Gemini Error:", error);

            // Handle Quota Limit (429) gracefully
            if (error.message?.includes("429") || error.toString().includes("429")) {
                alert("⚠️ API Quota Exceeded (Free Tier Limit).\n\nGenerating a SIMULATED report so you can test the UI.");

                // Fallback Simulated Data
                const fallbackAlert: Alert = {
                    id: Date.now().toString(),
                    type: "Simulated Hazard (Quota Limit)",
                    location: loc, // Use real user location
                    description: "This is a simulated alert because the AI API quota was exceeded. Actual analysis requires a higher quota plan.",
                    timestamp: new Date(),
                    severity: "medium",
                    weather: "Simulated Rain",
                    route: "Simulated Evacuation Route",
                    safeZone: { lat: loc.lat + 0.005, lng: loc.lng + 0.005, name: "Nearby Safe Point" },
                    reportCount: 1,
                    status: "pending"
                };

                setAlerts(prev => [fallbackAlert, ...prev]);
                setSelectedAlert(fallbackAlert);
            } else {
                alert(`Failed to analyze. Error: ${error.message || error}`);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleVerify = () => {
        if (!selectedAlert) return;

        const updatedAlerts = alerts.map(a => {
            if (a.id === selectedAlert.id) {
                const newCount = a.reportCount + 1;
                return {
                    ...a,
                    reportCount: newCount,
                    status: newCount >= 3 ? "verified" : "pending" // Auto-verify after 3 reports
                } as Alert;
            }
            return a;
        });

        setAlerts(updatedAlerts);

        // Update the selected alert ref as well
        const updatedSelected = updatedAlerts.find(a => a.id === selectedAlert.id);
        if (updatedSelected) setSelectedAlert(updatedSelected);
    };

    return (
        <div className="h-screen w-screen bg-slate-900 text-white overflow-hidden relative font-sans">
            {/* Map Background - Full Screen */}
            <div ref={mapRef} className="absolute inset-0 z-0" style={{ height: "100%", width: "100%" }}></div>

            <Header />
            <WeatherPanel center={mapCenter} />

            {/* ... rest of UI ... */}

            {/* Main Controls - Only visible when no alert is selected */}
            {!selectedAlert && (
                <>
                    {/* Alert List */}
                    <div className="absolute top-24 bottom-6 right-6 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700 flex flex-col z-10 shadow-2xl rounded-2xl animate-in slide-in-from-right duration-500">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl">
                            <h2 className="font-bold text-white flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                Active Hazards ({alerts.length})
                            </h2>
                        </div>
                        <div className="overflow-y-auto flex-1 p-3 space-y-2">
                            {alerts.map(alert => (
                                <div key={alert.id} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex gap-3 hover:bg-slate-700 transition-colors cursor-pointer active:scale-[0.98]"
                                    onClick={() => {
                                        setSelectedAlert(alert);
                                        if (leafletMap.current) leafletMap.current.setView([alert.location.lat, alert.location.lng], 15);
                                    }}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${alert.severity === 'critical' ? 'bg-red-500/20 text-red-500' :
                                        alert.severity === 'high' ? 'bg-orange-500/20 text-orange-500' : 'bg-yellow-500/20 text-yellow-500'
                                        }`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-semibold text-sm text-slate-200 truncate">{alert.type}</h3>
                                            {alert.status === 'verified' && <span className="text-[10px] text-blue-400 font-bold bg-blue-900/30 px-1.5 rounded ml-2">VERIFIED</span>}
                                        </div>
                                        <p className="text-xs text-slate-400 line-clamp-1">{alert.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Floating Action Button */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
                        <button
                            onClick={() => setIsCameraOpen(true)}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white pl-4 pr-6 py-3 rounded-full font-bold shadow-2xl shadow-red-900/80 transition-all hover:scale-105 active:scale-95 border-4 border-slate-900/50 backdrop-blur">
                            <div className="bg-white/20 p-1.5 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                </svg>
                            </div>
                            <span>REPORT</span>
                        </button>
                    </div>
                </>
            )}

            {/* Modals & Overlays */}
            {isCameraOpen && (
                <CameraCapture onCapture={handleCapture} onClose={() => setIsCameraOpen(false)} />
            )}

            {isProcessing && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[2000] flex flex-col items-center justify-center p-8 text-center">
                    <div className="relative w-20 h-20 mb-6">
                        <div className="absolute inset-0 border-4 border-red-600/30 rounded-full animate-ping"></div>
                        <div className="absolute inset-0 border-4 border-t-red-600 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Analyzing Situation</h3>
                    <p className="text-slate-400 font-mono text-sm animate-pulse">{processingStep}</p>
                </div>
            )}

            {selectedAlert && (
                <AlertDetails
                    alert={selectedAlert}
                    onClose={() => {
                        setSelectedAlert(null);
                        // Reset map view slightly if needed
                    }}
                    onVerify={handleVerify}
                />
            )}
        </div>
    );
};

export default Dashboard;
