import React, { useState } from 'react';
import { Report, VerificationStatus, LogisticsPlan } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AnalysisPanelProps {
  report: Report | null;
  onVerify: () => void;
  onPlan: () => void;
  isVerifying: boolean;
  isPlanning: boolean;
  logisticsPlan: LogisticsPlan | null;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ 
  report, 
  onVerify, 
  onPlan,
  isVerifying,
  isPlanning,
  logisticsPlan
}) => {
  const [activeTab, setActiveTab] = useState<'INTEL' | 'LOGISTICS'>('INTEL');

  if (!report) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8 text-center border-l border-white/10 bg-sentinel-panel/50">
        <div className="text-6xl mb-4 opacity-20">🛡️</div>
        <h3 className="text-lg font-mono text-sentinel-accent mb-2">Awaiting Selection</h3>
        <p className="text-sm">Select an incident from the map or feed to initiate Sentinel-G analysis.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sentinel-panel/90 backdrop-blur border-l border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-slate-900/50">
        <div className="flex justify-between items-start mb-2">
           <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${report.status === VerificationStatus.VERIFIED_TRUE ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
             {report.status}
           </span>
           <span className="text-xs text-gray-400 font-mono">{new Date(report.timestamp).toLocaleTimeString()}</span>
        </div>
        <h2 className="text-lg font-bold text-white leading-tight mb-1">{report.locationName}</h2>
        <p className="text-xs text-gray-400 uppercase tracking-wider">{report.type} Incident</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button 
          onClick={() => setActiveTab('INTEL')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'INTEL' ? 'bg-sentinel-accent/10 text-sentinel-accent border-b-2 border-sentinel-accent' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Intel & Vision
        </button>
        <button 
          onClick={() => setActiveTab('LOGISTICS')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'LOGISTICS' ? 'bg-sentinel-accent/10 text-sentinel-accent border-b-2 border-sentinel-accent' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Ops & Logistics
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'INTEL' && (
          <>
            {/* Multimedia Evidence */}
            <div className="rounded-lg overflow-hidden border border-white/10 bg-black relative group">
              {report.imageUrl ? (
                <>
                  <img src={report.imageUrl} alt="Evidence" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                    <p className="text-xs text-white font-mono truncate">{report.text}</p>
                  </div>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-600 font-mono text-xs">NO VISUAL DATA</div>
              )}
            </div>

            {/* Vision Agent Analysis */}
            {report.aiAnalysis && (
              <div className="space-y-2 animate-pulse-slow">
                <h3 className="text-xs font-bold text-sentinel-accent uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-sentinel-accent rounded-full"></span> 
                  Vision Agent Analysis
                </h3>
                <div className="bg-slate-950 p-3 rounded border border-white/5 text-sm text-gray-300 font-mono leading-relaxed">
                  {report.aiAnalysis}
                </div>
                {report.estimatedDepth && (
                   <div className="flex gap-2">
                      <div className="flex-1 bg-slate-900 p-2 rounded border border-white/5 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Est. Depth</div>
                        <div className="text-xl font-bold text-blue-400">{report.estimatedDepth}m</div>
                      </div>
                      <div className="flex-1 bg-slate-900 p-2 rounded border border-white/5 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Risk Level</div>
                        <div className="text-xl font-bold text-red-400">HIGH</div>
                      </div>
                   </div>
                )}
              </div>
            )}

            {/* Verification Action */}
            <div className="pt-2">
              <button 
                onClick={onVerify}
                disabled={isVerifying || report.status === VerificationStatus.VERIFIED_TRUE}
                className="w-full py-3 bg-sentinel-accent/10 hover:bg-sentinel-accent/20 border border-sentinel-accent/50 text-sentinel-accent rounded flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                   <>
                     <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     <span>Cross-Referencing Satellite Data...</span>
                   </>
                ) : report.status === VerificationStatus.VERIFIED_TRUE ? (
                   <>
                     <span className="text-lg">✓</span> Verified Ground Truth
                   </>
                ) : (
                   <>
                     <span>Verify with Gemini 3</span>
                   </>
                )}
              </button>
              
              {/* Confidence Meter (Visual only for verified) */}
              {report.confidenceScore !== undefined && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Confidence Score</span>
                    <span className="text-sentinel-success font-bold">{report.confidenceScore}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${report.confidenceScore}%` }}></div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 font-mono">
                    Analysis correlates ground report visuals with Sentinel-1 Radar signature.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'LOGISTICS' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-4 rounded-lg border border-white/5">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Resource Availability (Depot A)</h4>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Boats', value: 5 },
                      { name: 'Drones', value: 2 },
                      { name: 'Med Kits', value: 120 },
                      { name: 'Rations', value: 500 }
                    ]}>
                      <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b'}} interval={0} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} 
                        itemStyle={{ color: '#e2e8f0' }}
                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {
                          [0,1,2,3].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#38bdf8', '#818cf8', '#ef4444', '#f59e0b'][index]} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </div>

            <button 
              onClick={onPlan}
              disabled={isPlanning || !report.confidenceScore}
              className={`w-full py-3 rounded text-sm font-bold tracking-wide transition-all ${
                !report.confidenceScore 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              {isPlanning ? 'Reasoning...' : 'Generate Rescue Plan'}
            </button>

            {!report.confidenceScore && (
              <p className="text-center text-[10px] text-red-400">Must verify incident before planning logistics.</p>
            )}

            {logisticsPlan && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="border-l-2 border-indigo-500 pl-4 space-y-4">
                    <div>
                      <h5 className="text-xs text-indigo-400 font-bold uppercase mb-1">Recommended Route</h5>
                      <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                        {logisticsPlan.routes.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-xs text-indigo-400 font-bold uppercase mb-1">Required Assets</h5>
                       <div className="flex flex-wrap gap-2">
                        {logisticsPlan.resources.map((r, i) => (
                          <span key={i} className="px-2 py-1 bg-indigo-500/10 text-indigo-300 text-xs rounded border border-indigo-500/20">{r}</span>
                        ))}
                       </div>
                    </div>
                    <div>
                       <h5 className="text-xs text-indigo-400 font-bold uppercase mb-1">AI Reasoning</h5>
                       <p className="text-xs text-gray-500 italic leading-relaxed">
                         "{logisticsPlan.reasoning}"
                       </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-xs text-gray-400">ETA:</span>
                      <span className="text-xl font-mono text-white">{logisticsPlan.estimatedTime}</span>
                    </div>
                 </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisPanel;