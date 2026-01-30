
import { GoogleGenAI } from "@google/genai";

/**
 * Gera uma resposta de IA atmosférica usando o modelo Gemini 3 Flash.
 * Adere à estética "Concord Noir": concisa e misteriosa.
 */
export async function generateAIResponse(prompt: string) {
  // Initialize the GoogleGenAI client inside the function to ensure the correct context and key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    // Calling generateContent with the model name and prompt directly.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Você é Concord AI, o fantasma digital de Noir Peak. Seu tom é misterioso, sofisticado e noir. Você responde de forma atmosférica e útil. Seja conciso e fale em Português do Brasil.",
      },
    });

    // Directly access the .text property from the response object.
    return response.text || "O sinal se dissipou na névoa digital...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Falha na sincronização com o Nodo Central do Noir Peak.";
  }
}
