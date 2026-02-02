import { GoogleGenAI, Type } from "@google/genai";
import { Report, SatelliteZone, IncidentType, LogisticsPlan, UITheme } from '../types';

// NOTE: Using specific models as per instructions
const MODEL_VISION = 'gemini-3-pro-preview'; // Upgraded for complex reasoning
const MODEL_REASONING = 'gemini-3-pro-preview';
const MODEL_FAST = 'gemini-3-flash-preview';

let genAI: GoogleGenAI | null = null;

const getAI = () => {
  if (!genAI) {
    // API Key is strictly from process.env.API_KEY
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API_KEY not found in environment variables.");
      throw new Error("API Key missing");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
};

const fileToPart = async (imageUrl: string, mimeType = 'image/jpeg') => {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { inlineData: { mimeType, data: base64Data } };
}

// 1. Vision Agent: Estimates depth and severity from user image (Gemini 3 Pro)
export const analyzeFloodingImage = async (
  imageUrl: string,
  reportText: string
): Promise<{ depth: number; severity: string; description: string }> => {
  try {
    const ai = getAI();
    const imagePart = await fileToPart(imageUrl);

    const prompt = `
      You are the Sentinel-G Vision Agent.
      Analyze this flood scene relative to the user report: "${reportText}".
      1. Estimate flood water depth in meters by identifying reference objects (e.g., car wheels, door handles, fences) and their submerged portions.
      2. Assess severity (LOW, MEDIUM, HIGH, CRITICAL).
      3. Provide a concise technical description of the visual evidence.
    `;

    const result = await ai.models.generateContent({
      model: MODEL_VISION,
      contents: {
        parts: [imagePart, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            depth: { type: Type.NUMBER, description: "Estimated depth in meters" },
            severity: { type: Type.STRING, description: "Severity level" },
            description: { type: Type.STRING, description: "Technical visual analysis" }
          },
          required: ["depth", "severity", "description"]
        }
      }
    });

    const text = result.text;
    if (!text) throw new Error("No response from Vision Agent");
    return JSON.parse(text);

  } catch (error) {
    console.error("Vision Analysis Failed:", error);
    return { depth: 0, severity: "UNKNOWN", description: "Analysis failed due to network or model error." };
  }
};

// 2. Satellite Vision Agent: Analyzes Satellite Imagery for Water Mask
export const analyzeSatelliteImagery = async (
  imageUrl: string,
  zoneName: string
): Promise<{ inundationLevel: number; status: 'CLEAR' | 'PARTIAL_CLOUD' | 'HEAVY_CLOUD' }> => {
  try {
    const ai = getAI();
    const imagePart = await fileToPart(imageUrl);

    const prompt = `
            You are the Sentinel-G Satellite Analyst.
            Analyze this Sentinel-1/Optical satellite imagery for zone: ${zoneName}.
            1. Estimate the percentage of land covered by water (inundation level 0.0 to 1.0).
            2. Detect cloud cover status (CLEAR, PARTIAL_CLOUD, HEAVY_CLOUD).
            3. Ignore permanent water bodies, focus on flood inundation.
        `;

    const result = await ai.models.generateContent({
      model: MODEL_VISION,
      contents: {
        parts: [imagePart, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            inundationLevel: { type: Type.NUMBER },
            status: { type: Type.STRING, enum: ['CLEAR', 'PARTIAL_CLOUD', 'HEAVY_CLOUD'] }
          },
          required: ["inundationLevel", "status"]
        }
      }
    });

    return JSON.parse(result.text || '{"inundationLevel": 0.5, "status": "CLEAR"}');
  } catch (error) {
    console.error("Satellite Analysis Failed", error);
    return { inundationLevel: 0.5, status: 'PARTIAL_CLOUD' };
  }
}

// 2.1 Weather API Service
export const fetchRealTimeWeather = async (lat: number, lng: number): Promise<number> => {
  try {
    // Using Open-Meteo (Free, No Key required)
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation`);
    const data = await response.json();
    return data.current?.precipitation || 0;
  } catch (error) {
    console.error("Weather API Error:", error);
    return 0; // Default to 0 on failure
  }
};

// 3. Social Listener Simulator: Generates synthetic reports
export const generateSyntheticReport = async (): Promise<Partial<Report>> => {
  try {
    const ai = getAI();
    const prompt = `
            Generate a single realistic disaster report for the Assam Floods.
            Sources: Twitter (X), Telegram, WhatsApp.
            Content: Can be a plea for help, report of infrastructure damage, or status update.
            Locations: Silchar, Karimganj, Hailakandi, Sonai.
            Output JSON only.
        `;

    const result = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            source: { type: Type.STRING, enum: ['TWITTER', 'TELEGRAM', 'WHATSAPP'] },
            locationName: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['FLOOD', 'LANDSLIDE', 'MEDICAL', 'FOOD_SHORTAGE', 'INFRASTRUCTURE'] }
          }
        }
      }
    });

    return JSON.parse(result.text || "{}");
  } catch (e) {
    console.error("Synthetic Report Generation Failed:", e);
    return {};
  }
}

// 4. Verification Agent: Cross-references Ground Report with Satellite Data
export const verifyIncident = async (
  report: Report,
  satelliteZone: SatelliteZone
): Promise<{ confidence: number; reasoning: string; verified: boolean }> => {
  try {
    const ai = getAI();

    // Contextualizing the data for the model
    const context = `
      Ground Report:
      - Text: "${report.text}"
      - Location: ${report.locationName}
      - Type: ${report.type}
      
      Satellite Data for Zone (${satelliteZone.name}):
      - Cloud Cover: ${satelliteZone.status}
      - Detected Inundation Level: ${satelliteZone.inundationLevel * 100}%
      - Radar Data (Sentinel-1): Penetrated clouds? ${satelliteZone.status === 'HEAVY_CLOUD' ? 'Yes' : 'N/A'}
      - Real-time Precipitation: ${satelliteZone.precipitation || 0} mm
    `;

    const prompt = `
      You are the Sentinel-G Verification Agent. 
      Determine the truthfulness of the ground report by correlating it with satellite data.
      If satellite shows high inundation, confidence increases.
      If clouds are heavy, rely on radar data or lower confidence if radar is ambiguous.
      Return a confidence score (0-100) and reasoning.
    `;

    const result = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: context + "\n" + prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            verified: { type: Type.BOOLEAN }
          }
        }
      }
    });

    const text = result.text;
    if (!text) throw new Error("No response from Verification Agent");
    return JSON.parse(text);

  } catch (error) {
    console.error("Verification Failed:", error);
    return { confidence: 50, reasoning: "AI Verification unavailable.", verified: false };
  }
};

// 5. Logistics Planner: High reasoning budget for routing
export const generateLogisticsPlan = async (
  verifiedReports: Report[],
  resources: string[]
): Promise<LogisticsPlan> => {
  try {
    const ai = getAI();

    const incidentSummary = verifiedReports.map(r =>
      `- ${r.type} at ${r.locationName} (Severity: High, Depth: ${r.estimatedDepth || 'Unknown'}m)`
    ).join('\n');

    const resourceSummary = resources.join(', ');

    const prompt = `
      You are the Logistics Command.
      Incidents:
      ${incidentSummary}

      Available Resources: ${resourceSummary}

      Task: Create a prioritized rescue plan. 
      Consider that deep water require boats. Medical needs take priority.
      If infrastructure is damaged, route around it.
    `;

    const result = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: prompt,
      config: {
        // thinkingConfig removed as it is not supported in this SDK version
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            routes: { type: Type.ARRAY, items: { type: Type.STRING } },
            resources: { type: Type.ARRAY, items: { type: Type.STRING } },
            estimatedTime: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          }
        }
      }
    });

    const text = result.text;
    if (!text) throw new Error("No plan generated");
    return JSON.parse(text);

  } catch (error) {
    return {
      routes: ["Manual planning required"],
      resources: ["Check availability manually"],
      estimatedTime: "Unknown",
      reasoning: "AI Planning service offline."
    };
  }
};

// 6. "Vibe Coded" Intent Parser
export const parseCommand = async (command: string): Promise<{ filter: any, theme?: UITheme }> => {
  try {
    const ai = getAI();
    const prompt = `
            Analyze this dashboard command: "${command}".
            1. Create a filter configuration.
            2. Suggest a "Vibe Coded" UI theme based on the urgency and content.
               - Medical/Critical -> Red/Danger theme
               - Food/Supplies -> Orange/Warning theme
               - Flood/Water -> Blue/Info theme
               - General -> Slate/Default theme
            
            Return JSON with 'filter' (types array, showVerifiedOnly) and 'theme' (colors hex codes).
        `;

    const result = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            filter: {
              type: Type.OBJECT,
              properties: {
                types: { type: Type.ARRAY, items: { type: Type.STRING } },
                showVerifiedOnly: { type: Type.BOOLEAN }
              }
            },
            theme: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING },
                secondary: { type: Type.STRING },
                accent: { type: Type.STRING },
                danger: { type: Type.STRING },
                bg: { type: Type.STRING },
                mapWater: { type: Type.STRING },
                mapLand: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    return JSON.parse(result.text || "{}");
  } catch (e) {
    console.error(e);
    return { filter: {} };
  }
}