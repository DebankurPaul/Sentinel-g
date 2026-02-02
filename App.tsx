import React, { useState, useEffect, useRef } from 'react';
import MapVisualizer from './components/MapVisualizer';
import AnalysisPanel from './components/AnalysisPanel';
import LiveFeed from './components/LiveFeed';
import { INITIAL_REPORTS, MOCK_ZONES } from './constants';
import { Report, SatelliteZone, LogisticsPlan, FilterState, IncidentType, VerificationStatus, UITheme } from './types';
import { analyzeFloodingImage, generateLogisticsPlan, verifyIncident, parseCommand, generateSyntheticReport, analyzeSatelliteImagery, fetchRealTimeWeather } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [reports, setReports] = useState<Report[]>(INITIAL_REPORTS);
  const [zones, setZones] = useState<SatelliteZone[]>(MOCK_ZONES);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  
  // Analysis State
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [logisticsPlan, setLogisticsPlan] = useState<LogisticsPlan | null>(null);

  // Ingestion State
  const [isSocialListenerActive, setIsSocialListenerActive] = useState(false);
  const [isSatelliteLoading, setIsSatelliteLoading] = useState(false);

  // UI / Vibe State
  const [command, setCommand] = useState('');
  const [theme, setTheme] = useState<UITheme | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    minSeverity: 0,
    showVerifiedOnly: false
  });

  // Derived State
  const filteredReports = reports.filter(r => {
    if (filters.showVerifiedOnly && r.status !== VerificationStatus.VERIFIED_TRUE) return false;
    if (filters.types.length > 0 && !filters.types.includes(r.type)) return false;
    return true;
  });

  // Social Listener Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSocialListenerActive) {
        interval = setInterval(async () => {
            const newReportData = await generateSyntheticReport();
            if (newReportData.text) {
                const newReport: Report = {
                    id: `gen-${Date.now()}`,
                    text: newReportData.text || "Report",
                    source: newReportData.source || 'TWITTER',
                    locationName: newReportData.locationName || 'Unknown',
                    type: (newReportData.type as IncidentType) || IncidentType.INFRASTRUCTURE,
                    status: VerificationStatus.UNVERIFIED,
                    timestamp: new Date().toISOString(),
                    // Random location near mock center
                    location: { 
                        x: 30 + Math.random() * 40, 
                        y: 30 + Math.random() * 40,
                        lat: 24.8 + (Math.random() - 0.5) * 0.1,
                        lng: 92.7 + (Math.random() - 0.5) * 0.1
                    }
                };
                setReports(prev => [newReport, ...prev]);
            }
        }, 5000); // New report every 5 seconds
    }
    return () => clearInterval(interval);
  }, [isSocialListenerActive]);

  // Actions
  const handleSelectReport = (report: Report) => {
    setSelectedReport(report);
    setLogisticsPlan(null); // Reset plan when selection changes
  };

  const handleFetchSatellite = async () => {
      setIsSatelliteLoading(true);
      
      // 1. Mock Satellite Image for AI Analysis (Targeting the first zone as 'active scan')
      const mockSatImage = 'https://picsum.photos/600/600?grayscale&blur=2'; 
      const activeZone = zones[0];
      
      // Concurrently: Analyze Image for Active Zone AND Fetch Weather for ALL Zones
      const [aiResult, ...weatherResults] = await Promise.all([
          analyzeSatelliteImagery(mockSatImage, activeZone.name),
          ...zones.map(z => {
              // Use grid point centroid or first point for weather
              return fetchRealTimeWeather(z.gridPoints[0].lat, z.gridPoints[0].lng);
          })
      ]);
      
      const updatedZones = zones.map((z, index) => {
          const precip = weatherResults[index];
          
          if (z.id === activeZone.id) {
              // Active Zone gets AI update + Weather
              return { 
                  ...z, 
                  inundationLevel: aiResult.inundationLevel, 
                  status: aiResult.status,
                  lastPass: 'Just now',
                  precipitation: precip
              };
          } else {
              // Other zones just get fresh weather
              return {
                  ...z,
                  precipitation: precip
              };
          }
      });
      
      setZones(updatedZones);
      setIsSatelliteLoading(false);
  };

  const handleVerify = async () => {
    if (!selectedReport) return;
    setIsVerifying(true);

    const zone = zones[0]; // Simplified: verifying against the first zone

    let aiAnalysis = "No visual data available.";
    let estimatedDepth = 0;
    
    // Gemini 3 Pro Vision Agent Analysis
    if (selectedReport.imageUrl) {
      const visionResult = await analyzeFloodingImage(selectedReport.imageUrl, selectedReport.text);
      aiAnalysis = `${visionResult.description} (Severity: ${visionResult.severity})`;
      estimatedDepth = visionResult.depth;
    }

    // Gemini 3 Pro Reasoning for Verification
    const verificationResult = await verifyIncident(selectedReport, zone);

    const updatedReports = reports.map(r => {
      if (r.id === selectedReport.id) {
        return {
          ...r,
          status: verificationResult.verified ? VerificationStatus.VERIFIED_TRUE : VerificationStatus.VERIFIED_FALSE,
          confidenceScore: verificationResult.confidence,
          aiAnalysis,
          estimatedDepth
        };
      }
      return r;
    });

    setReports(updatedReports);
    setSelectedReport(updatedReports.find(r => r.id === selectedReport.id) || null);
    setIsVerifying(false);
  };

  const handlePlan = async () => {
    if (!selectedReport) return;
    setIsPlanning(true);
    
    const contextReports = reports.filter(r => r.status === VerificationStatus.VERIFIED_TRUE);
    const resources = ["NDRF Team (10 pax)", "Inflatable Boats (3)", "Drone Unit (1)", "Medical Kit (Type A)"];

    const plan = await generateLogisticsPlan(contextReports.length ? contextReports : [selectedReport], resources);
    setLogisticsPlan(plan);
    setIsPlanning(false);
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    // Use Gemini to parse intent and get Vibe
    const result = await parseCommand(command);
    
    if (result.theme) {
        setTheme(result.theme);
    } else {
        setTheme(undefined);
    }

    const types: IncidentType[] = [];
    if (result.filter?.types) {
        result.filter.types.forEach((t: string) => {
             if (Object.values(IncidentType).includes(t as IncidentType)) {
                 types.push(t as IncidentType);
             }
        });
    }

    setFilters(prev => ({
        ...prev,
        types: types.length ? types : [],
        showVerifiedOnly: result.filter?.showVerifiedOnly || false
    }));
  };

  // Dynamic Styles based on Vibe Theme
  const mainStyle = {
      '--theme-primary': theme?.primary || '#38bdf8',
      '--theme-accent': theme?.accent || '#38bdf8',
      '--theme-bg': theme?.bg || '#020617',
  } as React.CSSProperties;

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-gray-200 overflow-hidden font-sans selection:bg-sentinel-accent selection:text-black transition-colors duration-1000" style={mainStyle}>
      {/* Left Sidebar: Live Feed */}
      <div className="w-80 h-full flex-shrink-0 z-20 flex flex-col">
        <LiveFeed 
          reports={filteredReports} 
          onSelect={handleSelectReport}
          selectedId={selectedReport?.id}
          isListenerActive={isSocialListenerActive}
        />
        {/* Data Ingestion Controls */}
        <div className="p-4 border-t border-white/10 bg-slate-900">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Data Ingestion</h3>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm">Social Listener</span>
                    <button 
                        onClick={() => setIsSocialListenerActive(!isSocialListenerActive)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${isSocialListenerActive ? 'bg-green-500' : 'bg-gray-700'}`}
                    >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isSocialListenerActive ? 'left-7' : 'left-1'}`}></span>
                    </button>
                </div>
                
                <button 
                    onClick={handleFetchSatellite}
                    disabled={isSatelliteLoading}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs flex items-center justify-center gap-2"
                >
                    {isSatelliteLoading ? (
                        <span className="animate-pulse">Analyzing Imagery...</span>
                    ) : (
                        <>
                           <span>📡 Fetch Sentinel-1 & Weather</span>
                        </>
                    )}
                </button>
            </div>
        </div>
      </div>

      {/* Main Content: Map & Command */}
      <div className="flex-1 flex flex-col relative z-10 transition-colors duration-1000" style={{backgroundColor: theme?.bg}}>
        {/* Top Command Bar */}
        <div className="h-16 border-b border-white/10 bg-slate-900/80 backdrop-blur flex items-center px-6 gap-4">
          <div className="font-bold tracking-widest text-lg font-mono transition-colors duration-500" style={{color: theme?.primary || '#38bdf8'}}>SENTINEL-G</div>
          <div className="h-6 w-px bg-white/10 mx-2"></div>
          
          <form onSubmit={handleCommandSubmit} className="flex-1 max-w-2xl relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="font-mono text-xs" style={{color: theme?.accent || '#38bdf8'}}>{'>'}</span>
            </div>
            <input 
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Ask Sentinel (e.g., 'Show medical emergencies' or 'Analyze high risk areas')"
              className="w-full bg-black/40 border border-white/10 rounded px-8 py-2 text-sm text-white focus:outline-none focus:ring-1 transition-all font-mono placeholder:text-gray-600"
              style={{ borderColor: theme?.accent ? `${theme.accent}40` : undefined }}
            />
            <div className="absolute inset-y-0 right-3 flex items-center">
                {theme && <span className="text-[10px] bg-white/10 px-2 rounded animate-pulse" style={{color: theme.accent}}>VIBE CODED</span>}
            </div>
          </form>
          
          <div className="ml-auto flex items-center gap-4 text-xs font-mono text-gray-500">
             {/* Dynamic Status Indicators */}
             <div className="flex items-center gap-2" title="Social Data Stream Status">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isSocialListenerActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className={isSocialListenerActive ? 'text-gray-300' : 'text-gray-600'}>
                    SOC: {isSocialListenerActive ? 'LIVE' : 'OFFLINE'}
                </span>
             </div>
             <div className="flex items-center gap-2" title="Satellite API Status">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isSatelliteLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className={isSatelliteLoading ? 'text-yellow-400' : 'text-gray-300'}>
                    SAT: {isSatelliteLoading ? 'SYNCING' : 'READY'}
                </span>
             </div>
             <div className="w-px h-4 bg-white/10"></div>
             <span className="text-sentinel-accent">GEMINI-3: ACTIVE</span>
          </div>
        </div>

        {/* Map Area */}
        <div className="flex-1 relative p-4 bg-transparent">
           <MapVisualizer 
             zones={zones} 
             reports={filteredReports} 
             onSelectReport={handleSelectReport}
             selectedReportId={selectedReport?.id}
             theme={theme}
           />
        </div>
      </div>

      {/* Right Sidebar: Analysis Panel */}
      <div className={`w-96 h-full flex-shrink-0 transition-transform duration-300 z-30 ${selectedReport ? 'translate-x-0' : 'translate-x-full absolute right-0'}`}>
        <AnalysisPanel 
          report={selectedReport}
          onVerify={handleVerify}
          onPlan={handlePlan}
          isVerifying={isVerifying}
          isPlanning={isPlanning}
          logisticsPlan={logisticsPlan}
        />
      </div>
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-50" style={{
          background: `radial-gradient(ellipse at top, ${theme?.bg || '#0f172a'}, #020617)`
      }}></div>
    </div>
  );
};

export default App;