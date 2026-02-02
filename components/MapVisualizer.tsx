import React, { useState, useRef, useEffect } from 'react';
import { GeoPoint, IncidentType, Report, SatelliteZone, VerificationStatus, UITheme } from '../types';

interface MapVisualizerProps {
  zones: SatelliteZone[];
  reports: Report[];
  onSelectReport: (report: Report) => void;
  selectedReportId?: string;
  theme?: UITheme;
}

const MapVisualizer: React.FC<MapVisualizerProps> = ({ zones, reports, onSelectReport, selectedReportId, theme }) => {
  // Theme Setup
  const colors = {
    water: theme?.mapWater || '#38bdf8',
    land: theme?.mapLand || '#1e293b',
    accent: theme?.accent || '#38bdf8',
    danger: theme?.danger || '#ef4444',
  };

  // View State (ViewBox based Zoom/Pan)
  // World space is 0-100 x 0-100
  const [viewState, setViewState] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Layer State
  const [layers, setLayers] = useState({
    satellite: true,
    reports: true,
    weather: true,
    logistics: true
  });
  
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  // Constants
  const MIN_ZOOM = 100; // Full view (w=100)
  const MAX_ZOOM = 10;  // Close up (w=10)

  // Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    const direction = e.deltaY > 0 ? 1 : -1;
    
    // Calculate new width/height
    let newW = viewState.w * (1 + direction * zoomFactor);
    let newH = viewState.h * (1 + direction * zoomFactor);

    // Clamp
    if (newW > MIN_ZOOM) { newW = MIN_ZOOM; newH = MIN_ZOOM; }
    if (newW < MAX_ZOOM) { newW = MAX_ZOOM; newH = MAX_ZOOM; }

    // Zoom towards center (simplification)
    // To zoom to mouse, we'd need exact mouse coords relative to SVG
    const dw = viewState.w - newW;
    const dh = viewState.h - newH;
    
    let newX = viewState.x + dw / 2;
    let newY = viewState.y + dh / 2;

    // Clamp Pan
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newW > 100) newX = 100 - newW;
    if (newY + newH > 100) newY = 100 - newH;

    setViewState({ x: newX, y: newY, w: newW, h: newH });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !svgRef.current) return;
    
    const dxPx = e.clientX - dragStart.current.x;
    const dyPx = e.clientY - dragStart.current.y;
    
    // Convert pixels to SVG units
    // svg width in pixels
    const svgWidth = svgRef.current.clientWidth;
    // We assume width drives the scale because of meet/slice behavior
    const scale = viewState.w / svgWidth;
    
    const dx = dxPx * scale;
    const dy = dyPx * scale;

    let newX = viewState.x - dx;
    let newY = viewState.y - dy;

    // Clamp
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + viewState.w > 100) newX = 100 - viewState.w;
    if (newY + viewState.h > 100) newY = 100 - viewState.h;

    setViewState(prev => ({ ...prev, x: newX, y: newY }));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  // Marker scale compensation (keep markers readable size)
  // Base radius 1.5 at zoom 100.
  // current radius = 1.5 * (currentW / 100)
  const markerScale = viewState.w / 100;

  const getMarkerColor = (type: IncidentType) => {
    switch (type) {
      case IncidentType.MEDICAL: return colors.danger;
      case IncidentType.INFRASTRUCTURE: return '#f59e0b';
      case IncidentType.FOOD_SHORTAGE: return '#fb923c';
      default: return colors.accent;
    }
  };

  const getStatusRing = (status: VerificationStatus) => {
    switch (status) {
      case VerificationStatus.VERIFIED_TRUE: return 'stroke-[#10b981]';
      case VerificationStatus.VERIFIED_FALSE: return 'stroke-gray-500';
      case VerificationStatus.VERIFYING: return `stroke-[${colors.accent}] animate-pulse`;
      default: return 'stroke-transparent';
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-white/10 shadow-2xl transition-colors duration-700 group"
         style={{ backgroundColor: colors.land.replace('1.0', '0.2') }}> 
      
      {/* Background with dynamic land color */}
      <div className="absolute inset-0 opacity-100 transition-colors duration-700" style={{ backgroundColor: '#020617' }}></div>

      {/* Grid Lines - Fixed to viewport */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <svg 
        ref={svgRef}
        className={`w-full h-full absolute inset-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        viewBox={`${viewState.x} ${viewState.y} ${viewState.w} ${viewState.h}`}
        preserveAspectRatio="xMidYMid meet" 
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <pattern id="waterPattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M0,10 l10,-10 M-2.5,2.5 l5,-5 M7.5,12.5 l5,-5" stroke={colors.water} strokeWidth="1" opacity="0.1"/>
          </pattern>
        </defs>

        {/* Layer: Satellite Zones */}
        {layers.satellite && zones.map(zone => {
          const pointsStr = zone.gridPoints.map(p => `${p.x},${p.y}`).join(' ');
          const isFlooded = zone.inundationLevel > 0.5;
          return (
            <g key={zone.id}>
              <polygon 
                points={pointsStr} 
                fill={isFlooded ? "url(#waterPattern)" : "transparent"}
                stroke={isFlooded ? colors.water : "#475569"}
                strokeWidth={0.2 * markerScale}
                opacity="0.6"
                className="transition-all duration-700"
              />
              <text 
                x={zone.gridPoints[0].x + 2} 
                y={zone.gridPoints[0].y + 5} 
                fontSize={3 * markerScale} 
                fill="#64748b" 
                className="font-mono uppercase tracking-widest select-none"
              >
                  {zone.name}
              </text>
              
              {/* Weather Precipitation Indicator */}
              {layers.weather && (
                  <g transform={`translate(${zone.gridPoints[0].x + 2}, ${zone.gridPoints[0].y + 8})`}>
                     <text fontSize={2.5 * markerScale} fill="#94a3b8" className="font-mono select-none">
                       {zone.precipitation !== undefined ? `🌧 ${zone.precipitation}mm` : ''}
                     </text>
                  </g>
              )}
            </g>
          );
        })}

        {/* River (Stylized) - always visible base map feature */}
        <path d="M 0 60 Q 30 50, 50 70 T 100 80" fill="none" stroke={colors.water} strokeWidth={2 * markerScale} strokeOpacity="0.4" className="transition-all duration-700" />

        {/* Layer: Reports */}
        {layers.reports && reports.map(report => (
          <g 
            key={report.id} 
            onClick={(e) => { e.stopPropagation(); onSelectReport(report); }}
            className="cursor-pointer transition-all duration-300 hover:opacity-80 origin-center"
          >
            {/* Ripple for unverified urgent */}
            {report.status === VerificationStatus.UNVERIFIED && (
              <circle cx={report.location.x} cy={report.location.y} r={4 * markerScale} fill={colors.accent} className="animate-ping opacity-20" />
            )}
            
            {/* Status Ring (Outer) */}
            {report.status !== VerificationStatus.UNVERIFIED && (
               <circle 
                 cx={report.location.x} 
                 cy={report.location.y} 
                 r={(selectedReportId === report.id ? 3.5 : 2.4) * markerScale} 
                 fill="none"
                 strokeWidth={0.3 * markerScale}
                 className={`${getStatusRing(report.status)} transition-all`}
               />
            )}

            {/* Main Dot */}
            <circle 
              cx={report.location.x} 
              cy={report.location.y} 
              r={(selectedReportId === report.id ? 2.5 : 1.5) * markerScale} 
              fill={getMarkerColor(report.type)}
              stroke="white"
              strokeWidth={0.2 * markerScale}
              strokeOpacity="0.3"
              className="transition-all"
            />

            {/* Depth Indicator (Vertical Bar) */}
            {report.estimatedDepth !== undefined && report.estimatedDepth > 0 && (
                <g pointerEvents="none">
                    {/* Track */}
                    <rect
                        x={report.location.x + 2.5 * markerScale}
                        y={report.location.y - 2.5 * markerScale}
                        width={0.8 * markerScale}
                        height={5 * markerScale}
                        fill="black"
                        fillOpacity="0.5"
                        rx={0.2 * markerScale}
                    />
                    {/* Fill */}
                    <rect
                        x={report.location.x + 2.5 * markerScale}
                        y={report.location.y + 2.5 * markerScale - (Math.min(report.estimatedDepth, 5) * markerScale)}
                        width={0.8 * markerScale}
                        height={Math.min(report.estimatedDepth, 5) * markerScale}
                        fill={colors.water}
                        rx={0.2 * markerScale}
                    />
                    {/* Depth Label (Visible when zoomed in or selected) */}
                    {(selectedReportId === report.id || viewState.w < 40) && (
                        <text
                            x={report.location.x + 3.8 * markerScale}
                            y={report.location.y}
                            fontSize={2 * markerScale}
                            fill={colors.water}
                            className="font-mono font-bold select-none"
                            alignmentBaseline="middle"
                        >
                            {report.estimatedDepth}m
                        </text>
                    )}
                </g>
            )}
            
            {/* Hover Tooltip/Label */}
             {selectedReportId === report.id && (
               <g pointerEvents="none">
                 {/* Tooltip adjusted to left to avoid overlap with depth indicator */}
                 <line 
                    x1={report.location.x} y1={report.location.y} 
                    x2={report.location.x - 5 * markerScale} y2={report.location.y - 5 * markerScale} 
                    stroke="white" strokeWidth={0.2 * markerScale} 
                 />
                 <text 
                    x={report.location.x - 6 * markerScale} y={report.location.y - 5 * markerScale} 
                    fontSize={3 * markerScale} fill="white" 
                    textAnchor="end"
                    className="font-sans font-bold shadow-lg select-none"
                 >
                   {report.locationName}
                 </text>
               </g>
             )}
          </g>
        ))}
      </svg>

      {/* Layer Switcher */}
      <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2">
         <button 
           onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
           className="bg-slate-900/90 backdrop-blur border border-white/10 p-2 rounded-lg text-white hover:bg-slate-800 transition-colors shadow-lg"
         >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
         </button>
         
         {isLayerMenuOpen && (
            <div className="bg-slate-900/95 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl w-48 space-y-2 animate-in fade-in slide-in-from-top-2">
               <h4 className="text-[10px] uppercase font-bold text-gray-400 mb-2">Map Layers</h4>
               <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer hover:bg-white/5 p-1 rounded">
                  <input type="checkbox" checked={layers.satellite} onChange={e => setLayers({...layers, satellite: e.target.checked})} className="rounded border-gray-600 bg-gray-800 text-sentinel-accent focus:ring-offset-0 focus:ring-1 focus:ring-sentinel-accent" />
                  <span>Satellite Data</span>
               </label>
               <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer hover:bg-white/5 p-1 rounded">
                  <input type="checkbox" checked={layers.reports} onChange={e => setLayers({...layers, reports: e.target.checked})} className="rounded border-gray-600 bg-gray-800 text-sentinel-accent focus:ring-offset-0 focus:ring-1 focus:ring-sentinel-accent" />
                  <span>Ground Reports</span>
               </label>
               <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer hover:bg-white/5 p-1 rounded">
                  <input type="checkbox" checked={layers.weather} onChange={e => setLayers({...layers, weather: e.target.checked})} className="rounded border-gray-600 bg-gray-800 text-sentinel-accent focus:ring-offset-0 focus:ring-1 focus:ring-sentinel-accent" />
                  <span>Weather Radar</span>
               </label>
            </div>
         )}
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-40">
        <button 
            onClick={() => {
                const newW = Math.max(MAX_ZOOM, viewState.w * 0.8);
                const newH = Math.max(MAX_ZOOM, viewState.h * 0.8);
                // Center zoom
                const newX = viewState.x + (viewState.w - newW)/2;
                const newY = viewState.y + (viewState.h - newH)/2;
                setViewState({x: newX, y: newY, w: newW, h: newH});
            }}
            className="w-8 h-8 bg-slate-900/90 border border-white/10 rounded-t flex items-center justify-center text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
        >
            +
        </button>
        <button 
            onClick={() => {
                let newW = Math.min(MIN_ZOOM, viewState.w * 1.25);
                let newH = Math.min(MIN_ZOOM, viewState.h * 1.25);
                // Adjust position to stay in bounds
                let newX = viewState.x - (newW - viewState.w)/2;
                let newY = viewState.y - (newH - viewState.h)/2;
                if (newX < 0) newX = 0; if (newY < 0) newY = 0;
                if (newX + newW > 100) newX = 100 - newW;
                if (newY + newH > 100) newY = 100 - newH;

                setViewState({x: newX, y: newY, w: newW, h: newH});
            }}
            className="w-8 h-8 bg-slate-900/90 border border-white/10 border-t-0 rounded-b flex items-center justify-center text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
        >
            -
        </button>
      </div>

      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur border border-white/10 p-3 rounded-lg text-xs font-mono space-y-2 pointer-events-none select-none">
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{backgroundColor: colors.danger}}></div> Medical</div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-400"></div> Food/Infra</div>
        <div className="h-px bg-white/10 my-1"></div>
        <div className="text-gray-400">SAT: Sentinel-1 (RADAR)</div>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
           <span style={{color: colors.accent}}>Live Fusion</span>
        </div>
        {layers.weather && <div className="text-gray-500 pt-1">🌧 Real-time Weather</div>}
      </div>
    </div>
  );
};

export default MapVisualizer;