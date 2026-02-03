import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import path from 'path';

// Load env from root .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
    console.error("No API Key found in .env.local");
    process.exit(1);
}

async function listModels() {
    try {
        console.log("Fetching available models from API...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            const err = await response.text();
            console.error(`API Error: ${response.status} ${response.statusText}`);
            console.error(err);
            return;
        }

        const data = await response.json();
        const models = data.models || [];

        console.log(`\nFound ${models.length} models:`);
        models.forEach(m => {
            console.log(`- ${m.name.replace('models/', '')} (${m.supportedGenerationMethods.join(', ')})`);
        });

        // Test one if found
        const flash = models.find(m => m.name.includes('flash'));
        if (flash) {
            console.log(`\nTesting ${flash.name}...`);
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: flash.name.replace('models/', '') });
            try {
                const fs = await import('fs');
                const result = await model.generateContent("Hello");
                console.log("SUCCESS: Content generated.");
                fs.writeFileSync('success_model.txt', flash.name.replace('models/', ''));
            } catch (e) {
                console.error("FAIL:", e.message.split('\n')[0]);
            }
        } else {
            console.log("No flash model found, checking pro...");
            const pro = models.find(m => m.name.includes('pro'));
            if (pro) {
                console.log(`\nTesting ${pro.name}...`);
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: pro.name.replace('models/', '') });
                try {
                    const fs = await import('fs');
                    await model.generateContent("Hello");
                    console.log("SUCCESS");
                    fs.writeFileSync('success_model.txt', pro.name.replace('models/', ''));
                } catch (e) {
                    console.error("FAIL:", e.message.split('\n')[0]);
                }
            }
        }

    } catch (error) {
        console.error("Script Error:", error);
    }
}

listModels();
