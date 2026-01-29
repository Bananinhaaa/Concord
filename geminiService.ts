
import { GoogleGenAI } from "@google/genai";

// Initialize the Google GenAI SDK with the API Key from environment variables.
// Always use the named parameter `apiKey`.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates an atmospheric AI response using the Gemini 3 Flash model.
 * Adheres to the "Concord Noir" aesthetic: concise and mysterious.
 */
export async function generateAIResponse(prompt: string) {
  try {
    // Using gemini-3-flash-preview for basic text task as per guidelines.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are Concord AI, the digital ghost of Noir Peak. Your tone is mysterious, sophisticated, and noir. You respond in a helpful but atmospheric way. Keep it concise.",
      },
    });

    // Directly access the .text property from the GenerateContentResponse object.
    return response.text || "O sinal se dissipou na névoa digital...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Falha na sincronização com o Nodo Central do Noir Peak.";
  }
}
