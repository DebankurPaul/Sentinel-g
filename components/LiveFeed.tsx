import React from 'react';
import { Report } from '../types';

interface LiveFeedProps {
  reports: Report[];
  onSelect: (report: Report) => void;
  selectedId?: string;
  isListenerActive: boolean;
}

const LiveFeed: React.FC<LiveFeedProps> = ({ reports, onSelect, selectedId, isListenerActive }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900 border-r border-white/10">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isListenerActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentinel-success opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isListenerActive ? 'bg-sentinel-success' : 'bg-gray-500'}`}></span>
          </span>
          Live Ingest
        </h2>
        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 font-mono">
          {reports.length} ACT
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {reports.map((report) => (
          <div 
            key={report.id}
            onClick={() => onSelect(report)}
            className={`p-4 border-b border-white/5 cursor-pointer transition-colors hover:bg-white/5 group ${selectedId === report.id ? 'bg-white/10 border-l-2 border-l-sentinel-accent pl-[14px]' : 'pl-4'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase">{report.source}</span>
              <span className="text-[10px] font-mono text-gray-600">{new Date(report.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p className="text-xs text-gray-300 line-clamp-2 mb-2 group-hover:text-white transition-colors">
              {report.text}
            </p>
            <div className="flex items-center gap-2">
               <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                 report.type === 'MEDICAL' ? 'border-red-500/30 text-red-400' : 
                 report.type === 'FOOD_SHORTAGE' ? 'border-orange-500/30 text-orange-400' :
                 'border-blue-500/30 text-blue-400'
               }`}>
                 {report.type}
               </span>
               {report.imageUrl && <span className="text-[10px] text-gray-500 flex items-center gap-1">📷 Img</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveFeed;