import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env.local and .env
if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
} else {
    dotenv.config();
}

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
    console.error("GEMINI_API_KEY not found in env");
    process.exit(1);
}

async function listModels() {
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Attempt to list models.
        const response = await ai.models.list();

        // Check if response is iterable or has a property
        const models = [];
        for await (const model of response) {
            models.push(model.name);
        }

        console.log("Available Models:");
        console.log(models.join('\n'));

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
