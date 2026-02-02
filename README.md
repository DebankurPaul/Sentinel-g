# Sentinel-G 🛰️
### AI-Powered Satellite Disaster Response System

Sentinel-G is a multimodal crisis command center designed for the Northeast India region. It fuses satellite imagery with ground-level reporting to establish ground truth during disasters (floods, landslides, etc.).

![Sentinel-G Dashboard](./screenshot.png)

## 🌟 Features

- **📍 Live Satellite Map**: Interaction map with high-resolution satellite imagery.
- **🛣️ Hybrid Navigation**: Overlays for major transportation networks (`Esri WorldTransportation`) and place names.
- **⚠️ AI-Powered Reporting**: 
  - Capture or upload images of disaster scenes.
  - **Gemini 3 Pro** analyzes the image to identify hazards, severity, and safe routes.
  - Generates verified alerts on the map.
- **🌦️ Real-Time Weather Panel**: 
  - Live temperature, wind, and conditions for the viewed location (via Open-Meteo).
  - Dynamic "Risk Assessment" (Low/Medium/High/Critical).
- **📱 Mobile-First Design**: Optimized camera UI and responsive layout for field responders.
- **🔄 Offline/Quota Fallback**: Gracefully simulates reports if API quotas are exceeded.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Google Gemini API Key

### Installation

1.  **Clone the repository** (if applicable) or navigate to project folder:
    ```bash
    cd sentinel-g
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Environment Variables**:
    - Create a `.env.local` file in the root directory.
    - Add your API key:
      ```env
      GEMINI_API_KEY=your_actual_api_key_here
      ```

4.  **Run the Application**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) (or the port shown in terminal) to view it.

## 🛠️ Tech Stack

- **Frontend**: React (Vite), TypeScript
- **Styling**: Tailwind CSS (CDN)
- **Maps**: Leaflet, Esri ArcGIS Layers
- **AI**: Google Gemini API (`gemini-3-pro-image-preview`)
- **Data**: Open-Meteo (Weather), OpenStreetMap/Esri (Geodata)

## 🛡️ License

This project is licensed under the MIT License.
