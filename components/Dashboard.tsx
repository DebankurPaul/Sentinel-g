import React, { useState, useEffect, useRef, useMemo } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import 'leaflet.heat'; // Import Heatmap plugin
import { getEvacuationRoute, RouteSegment } from "../services/routingService";
import { getNearbyPlaces, Place } from "../services/placesService";

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
    impactRadius?: number; // meters
    votes: number;
    userVoted?: 'up' | 'down';
    reportCount: number;
    status: "verified" | "pending";
    reporterId?: string;
    mediaType?: "image" | "video"; // New: Track media type
}

interface UserLocation {
    lat: number;
    lng: number;
}

// --- Icons & UI Components ---

const Header = ({ showResources, onToggleResources }: { showResources: boolean, onToggleResources: () => void }) => (
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

        <div className="flex items-center gap-4">
            <button
                onClick={onToggleResources}
                className={`px-3 py-1.5 rounded-full font-bold text-[10px] transition-all border ${showResources ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'}`}>
                {showResources ? '🏥 Resources On' : '🏥 Show Resources'}
            </button>

            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[10px] text-green-400 font-mono font-bold">LIVE FEED</span>
            </div>
        </div>
    </header>
);

const CameraCapture = ({ onCapture, onClose }: { onCapture: (base64: string, mimeType: string) => void; onClose: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" },
                    audio: true // Request audio for video mode
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Camera error:", err);
                alert("Camera/Mic permission denied or unavailable.");
                onClose();
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [onClose]);

    // Timer for recording
    useEffect(() => {
        let interval: any;
        if (isRecording) {
            interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
        } else {
            setRecordingTime(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const handleTakePhoto = () => {
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
                onCapture(base64, "image/jpeg");
            }
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            // Stop Recording
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        } else {
            // Start Recording
            if (!videoRef.current?.srcObject) return;
            const stream = videoRef.current.srcObject as MediaStream;
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            mediaRecorderRef.current = mediaRecorder;
            const chunks: BlobPart[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    const base64 = base64data.split(',')[1];
                    onCapture(base64, "video/webm");
                };
                reader.readAsDataURL(blob);
            };

            mediaRecorder.start();
            setIsRecording(true);
        }
    };

    // SOS Logic
    const handleSOS = async () => {
        // 1. Get Location
        const loc = await new Promise<{ lat: number, lng: number }>((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve({ lat: 26.2006, lng: 92.9376 })
            );
        });

        // 2. Get Battery (Experimental API)
        let batteryLevel = "Unknown";
        try {
            const battery: any = await (navigator as any).getBattery();
            batteryLevel = Math.round(battery.level * 100) + "%";
        } catch (e) {
            console.warn("Battery API not supported");
        }

        // 3. Construct Message
        const message = `🚨 SOS! I need immediate help!\n📍 Location: https://www.google.com/maps?q=${loc.lat},${loc.lng}\n🔋 Battery: ${batteryLevel}\nSent via Sentinel-G.`;

        // 4. Open WhatsApp
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black overflow-hidden h-[100dvh] w-full animate-in fade-in duration-300">
            <div className="flex-1 relative">
                <video ref={videoRef} autoPlay playsInline muted={!isRecording} className="w-full h-full object-cover absolute inset-0" />
                <canvas ref={canvasRef} className="hidden" />

                {/* Recording Indicator */}
                {isRecording && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600/80 px-4 py-1 rounded-full text-white text-sm font-bold flex items-center gap-2 animate-pulse">
                        <div className="w-3 h-3 bg-white rounded-full"></div>
                        REC {formatTime(recordingTime)}
                    </div>
                )}

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
            <div className="h-40 bg-slate-900 flex items-center justify-center gap-12 pb-8">
                {/* Photo Button */}
                {!isRecording && (
                    <button onClick={handleTakePhoto} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-transparent hover:bg-white/10 transition-all">
                        <span className="text-xs font-bold text-white">PHOTO</span>
                    </button>
                )}

                {/* Video Button */}
                <button onClick={toggleRecording} className={`w-24 h-24 rounded-full border-4 border-white flex items-center justify-center transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-95 ${isRecording ? 'bg-white' : 'bg-red-600 hover:bg-red-700'}`}>
                    {isRecording ? (
                        <div className="w-10 h-10 bg-red-600 rounded-md"></div>
                    ) : (
                        <div className="w-16 h-16 rounded-full border-2 border-slate-900/50"></div>
                    )}
                </button>

                {/* Placeholder for balance */}
                {!isRecording && <div className="w-16"></div>}
            </div>
        </div>
    );
};

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatTimeSince = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
};

const AlertDetails = ({ alert, onClose, onVerify, onVote }: { alert: Alert; onClose: () => void; onVerify: () => void; onVote: (id: string, type: 'up' | 'down') => void }) => {
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

                <div className="space-y-3">
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

                    {/* Crowd Voting */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => onVote(alert.id, 'up')}
                            disabled={!!alert.userVoted}
                            className={`py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${alert.userVoted === 'up' ? 'bg-green-600 border-green-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                            <span>👍</span> Confirm ({alert.votes || 0})
                        </button>
                        <button
                            onClick={() => onVote(alert.id, 'down')}
                            disabled={!!alert.userVoted}
                            className={`py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${alert.userVoted === 'down' ? 'bg-red-900/50 border-red-800 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                            <span>👎</span> Dismiss
                        </button>
                    </div>
                </div>

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
    const [evacuationRoute, setEvacuationRoute] = useState<RouteSegment | null>(null);
    const [showResources, setShowResources] = useState(false);
    const [resources, setResources] = useState<Place[]>([]);
    const [isListening, setIsListening] = useState(false);

    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState("");
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
    const [timeFilter, setTimeFilter] = useState(24); // Hours (0-24)

    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const resourceMarkersRef = useRef<any[]>([]);
    const routeLayerRef = useRef<any>(null);
    const heatLayerRef = useRef<any>(null);

    // Filter Alerts by Time
    const filteredAlerts = useMemo(() => {
        const now = new Date();
        return alerts.filter(a => {
            const diffHours = (now.getTime() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60);
            return diffHours <= timeFilter;
        });
    }, [alerts, timeFilter]);

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

        // Clear existing alert markers and route layer
        markersRef.current.forEach(m => leafletMap.current.removeLayer(m));
        markersRef.current = [];

        if (routeLayerRef.current) {
            leafletMap.current.removeLayer(routeLayerRef.current);
            routeLayerRef.current = null;
        }

        // --- Heatmap Logic ---
        if (heatLayerRef.current) {
            leafletMap.current.removeLayer(heatLayerRef.current);
        }

        // Prepare Heatmap Data: [lat, lng, intensity]
        // Intensity based on severity: Critical=1.0, High=0.7, Medium=0.4
        const heatData = filteredAlerts.map(a => {
            let intensity = 0.4;
            if (a.severity === 'critical') intensity = 1.0;
            else if (a.severity === 'high') intensity = 0.7;

            return [a.location.lat, a.location.lng, intensity];
        });

        if ((L as any).heatLayer && heatData.length > 0) {
            heatLayerRef.current = (L as any).heatLayer(heatData, {
                radius: 35,
                blur: 20,
                maxZoom: 12,
                gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
            }).addTo(leafletMap.current);
        }
        // ---------------------

        // Draw Alert Markers
        filteredAlerts.forEach(alert => {
            const markerColor = alert.severity === 'critical' ? '#ef4444' : alert.severity === 'high' ? '#f97316' : '#eab308';

            // Impact Radius (If available)
            if (alert.impactRadius) {
                const radiusCircle = L.circle([alert.location.lat, alert.location.lng], {
                    radius: alert.impactRadius,
                    color: markerColor,
                    fillColor: markerColor,
                    fillOpacity: 0.2,
                    weight: 1
                }).addTo(leafletMap.current!);
                markersRef.current.push(radiusCircle);
            }

            // Alert Marker
            const marker = L.circleMarker([alert.location.lat, alert.location.lng], {
                radius: 8,
                fillColor: markerColor,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(leafletMap.current!);

            marker.on('click', () => {
                setSelectedAlert(alert);
                leafletMap.current?.setView([alert.location.lat, alert.location.lng], 16);
            });

            markersRef.current.push(marker); // Keep track of all markers

            // Safe Zone Marker (only if selected) and Route
            if (selectedAlert?.id === alert.id && alert.safeZone) {
                const safeIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="text-2xl">🛡️</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });

                const safeZoneMarker = L.marker([alert.safeZone.lat, alert.safeZone.lng], { icon: safeIcon })
                    .addTo(leafletMap.current!)
                    .bindPopup(`<b>Safe Zone:</b> ${alert.safeZone.name}`);
                markersRef.current.push(safeZoneMarker); // Add safe zone marker to ref

                // Draw Route if available
                if (evacuationRoute) {
                    const routePolyline = L.polyline(evacuationRoute.coordinates, {
                        color: '#4ade80', // Green
                        weight: 5,
                        opacity: 0.8,
                        dashArray: '10, 10',
                        lineCap: 'round'
                    }).addTo(leafletMap.current!);
                    routeLayerRef.current = routePolyline; // Store route layer

                    // Fit bounds to show whole route
                    // leafletMap.current!.fitBounds(L.polyline(evacuationRoute.coordinates).getBounds(), { padding: [50, 50] });
                }
            }
        });
    }, [filteredAlerts, selectedAlert, evacuationRoute]); // Dependencies updated

    // Fetch & Render Resources
    useEffect(() => {
        if (!leafletMap.current || !mapCenter) return;

        const updateResources = async () => {
            // Clear existing
            resourceMarkersRef.current.forEach(m => leafletMap.current.removeLayer(m));
            resourceMarkersRef.current = [];

            if (!showResources) return;

            const places = await getNearbyPlaces(mapCenter.lat, mapCenter.lng);
            setResources(places);

            places.forEach(place => {
                let iconEmoji = '📍';
                if (place.type === 'hospital') iconEmoji = '🏥';
                if (place.type === 'police') iconEmoji = '👮';
                if (place.type === 'shelter') iconEmoji = '⛺';
                if (place.type === 'pharmacy') iconEmoji = '💊';

                const icon = L.divIcon({
                    className: 'resource-icon',
                    html: `<div style="font-size:20px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));">${iconEmoji}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                const marker = L.marker([place.lat, place.lng], { icon })
                    .addTo(leafletMap.current)
                    .bindPopup(`<b>${place.name}</b><br><span style="text-transform:capitalize">${place.type}</span>`);

                resourceMarkersRef.current.push(marker);
            });
        };

        // Debounce slightly
        const timeout = setTimeout(updateResources, 500);
        return () => clearTimeout(timeout);
    }, [showResources, mapCenter]);

    // Verify Alert Logic
    const handleVerify = () => {
        if (!selectedAlert) return;

        const updatedAlert = { ...selectedAlert, status: 'verified' as const, reportCount: selectedAlert.reportCount + 1 };

        setAlerts(prev => prev.map(a => a.id === selectedAlert.id ? updatedAlert : a));
        setSelectedAlert(updatedAlert);

        // Trigger generic evacuation route if not already present
        if (!updatedAlert.safeZone) {
            // Logic to find nearest safe zone or just set route
            // For now, we rely on AI to provide safe zone, or we can mock one
        }
    };

    const handleVoiceCommand = (command: string) => {
        const lower = command.toLowerCase();
        console.log("Voice Command:", lower);

        if (lower.includes('report') || lower.includes('camera') || lower.includes('photo')) {
            setIsCameraOpen(true);
        } else if (lower.includes('verify')) {
            handleVerify();
        } else if (lower.includes('resource') || lower.includes('help') || lower.includes('hospital')) {
            setShowResources(true);
        } else if (lower.includes('hide resource')) {
            setShowResources(false);
        } else if (lower.includes('safe zone') || lower.includes('evacuate')) {
            // Select the first critical/high alert with a safe zone
            const criticalAlert = alerts.find(a => (a.severity === 'critical' || a.severity === 'high') && a.safeZone);
            if (criticalAlert) {
                setSelectedAlert(criticalAlert);
                if (leafletMap.current) leafletMap.current.setView([criticalAlert.location.lat, criticalAlert.location.lng], 16);
            }
        }
    };

    const toggleListening = () => {
        if (isListening) {
            (window as any).speechRecognition?.stop();
            setIsListening(false);
        } else {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Voice control not supported in this browser.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'en-US';
            recognition.interimResults = false;

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                handleVoiceCommand(transcript);
            };

            recognition.start();
            (window as any).speechRecognition = recognition; // Store ref
        }
    };

    const handleCapture = async (base64Data: string, mimeType: string) => {
        setIsCameraOpen(false);
        setIsProcessing(true);
        setProcessingStep("Acquiring GPS Signal...");

        // Get Location
        const loc = userLocation || await new Promise<{ lat: number, lng: number }>((resolve) => {
            if (userLocation) resolve(userLocation);
            else {
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => resolve({ lat: 26.2006, lng: 92.9376 })
                );
            }
        });

        setProcessingStep("Analyzing multi-modal data (Visuals + Audio)...");

        try {
            const prompt = `
          I am currently at Latitude: ${loc.lat}, Longitude: ${loc.lng} in Northeast India.
          The attached media (${mimeType}) shows a potential disaster situation.
          
          Perform the following analysis:
          1. Identify the disaster type (e.g., Landslide, Flood, Fire).
          2. Estimate the severity (low, medium, high, critical).
          3. Use Google Search (simulated) to find current weather at these coordinates.
          4. Determine a Safe Route away from this location to the nearest town or high ground. 
          5. Estimate the coordinates (lat/lng) of that Safe Zone.
          6. Estimate the "Impact Radius" in meters (e.g., how far is the flood/fire spreading?).
          
          Return ONLY a JSON object with this structure (no markdown code blocks):
          {
            "hazardType": "string",
            "severity": "low|medium|high|critical",
            "description": "string (short description for alert)",
            "weather": "string (e.g. Heavy Rain, 22C)",
            "route": "string (text description of path)",
            "safeZone": { "lat": number, "lng": number, "name": "string" },
            "impactRadius": number,
            "confidence": number
          }
        `;

            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent([
                prompt,
                { inlineData: { mimeType: mimeType, data: base64Data } }
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
                impactRadius: analysisData.impactRadius || 100, // Default to 100m if undefined
                reportCount: 1,
                status: "pending",
                mediaType: mimeType.startsWith('video') ? 'video' : 'image',
                votes: 0
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
                    status: "pending",
                    votes: 0
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

    // React Effect to Fetch Route when Alert Selected
    useEffect(() => {
        const fetchRoute = async () => {
            if (selectedAlert && selectedAlert.safeZone) {
                const route = await getEvacuationRoute(selectedAlert.location, selectedAlert.safeZone);
                setEvacuationRoute(route);
            } else {
                setEvacuationRoute(null);
            }
        };
        fetchRoute();
    }, [selectedAlert]);



    const handleVote = (id: string, type: 'up' | 'down') => {
        setAlerts(prev => prev.map(a => {
            if (a.id === id) {
                const votes = (a.votes || 0) + (type === 'up' ? 1 : -1);
                return { ...a, votes, userVoted: type };
            }
            return a;
        }));
    };

    // SOS Logic
    const handleSOS = async () => {
        // 1. Get Location
        const loc = userLocation || await new Promise<{ lat: number, lng: number }>((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve({ lat: 26.2006, lng: 92.9376 })
            );
        });

        // 2. Get Battery (Experimental API)
        let batteryLevel = "Unknown";
        try {
            const battery: any = await (navigator as any).getBattery();
            batteryLevel = Math.round(battery.level * 100) + "%";
        } catch (e) {
            console.warn("Battery API not supported");
        }

        // 3. Construct Message
        const message = `🚨 SOS! I need immediate help!\n📍 Location: https://www.google.com/maps?q=${loc.lat},${loc.lng}\n🔋 Battery: ${batteryLevel}\nSent via Sentinel-G.`;

        // 4. Open WhatsApp
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };

    return (
        <div className="h-screen w-screen bg-slate-900 text-white overflow-hidden relative font-sans">
            {/* Map Background - Full Screen */}
            <div ref={mapRef} className="absolute inset-0 z-0" style={{ height: "100%", width: "100%" }}></div>

            <Header showResources={showResources} onToggleResources={() => setShowResources(!showResources)} />

            {/* SOS Beacon Button */}
            <button
                onClick={handleSOS}
                className="absolute top-24 left-6 z-[1000] bg-red-600 hover:bg-red-700 text-white font-black text-xl w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse active:scale-95 border-4 border-red-400"
                title="SOS Emergency Beacon">
                SOS
            </button>

            {/* Timeline Control */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4 animate-in slide-in-from-bottom duration-500">
                <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Historical Timeline</span>
                        <span className="text-xs font-bold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">
                            Last {timeFilter} Hours
                        </span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="24"
                        step="1"
                        value={timeFilter}
                        onChange={(e) => setTimeFilter(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>Now</span>
                        <span>-12h</span>
                        <span>-24h</span>
                    </div>
                </div>
            </div>

            <WeatherPanel center={mapCenter} />

            {/* ... rest of UI ... */}

            {/* Main Controls - Only visible when no alert is selected */}
            {!selectedAlert && (
                <>
                    {/* Alert List */}
                    <div className="absolute top-24 right-6 w-96 max-h-[70vh] min-h-[200px] bg-slate-900/95 backdrop-blur-md border border-slate-700 flex flex-col z-10 shadow-2xl rounded-2xl animate-in slide-in-from-right duration-500">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl">
                            <h2 className="font-bold text-white flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${filteredAlerts.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                                Active Hazards ({filteredAlerts.length})
                            </h2>
                        </div>
                        <div className="overflow-y-auto flex-1 p-3 space-y-2">
                            {filteredAlerts.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 mt-8 mb-8">
                                    <span className="text-4xl opacity-50">🛡️</span>
                                    <p className="text-sm">No active hazards detected.</p>
                                </div>
                            ) : (
                                filteredAlerts.map(alert => (
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
                                            <div className="flex justify-between items-center">
                                                <p className="text-xs text-slate-400 line-clamp-1">{alert.description}</p>
                                                <span className="text-[10px] text-slate-600">
                                                    {formatTimeSince(new Date(alert.timestamp))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )))}
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

            {/* Voice Command Button */}
            <div className="absolute bottom-10 right-6 z-20">
                <button
                    onClick={toggleListening}
                    className={`flex items-center justify-center w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] border-4 transition-all active:scale-95 ${isListening ? 'bg-red-600 border-red-400 animate-pulse' : 'bg-blue-600 border-blue-400 hover:bg-blue-500'}`}>
                    <span className="text-3xl">{isListening ? '🎙️' : '🎤'}</span>
                </button>
            </div>

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
                    onVote={handleVote}
                />
            )}
        </div>
    );
};

export default Dashboard;
