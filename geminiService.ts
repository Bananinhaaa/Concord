import { GoogleGenAI } from "@google/genai";

// Inicialização segura: se a chave não estiver presente, a função lidará com o erro graciosamente.
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY não encontrada no ambiente.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Gera uma resposta de IA atmosférica usando o modelo Gemini 3 Flash.
 * Adere à estética "Concord Noir": concisa e misteriosa.
 */
export async function generateAIResponse(prompt: string) {
  try {
    const ai = getAIClient();
    if (!ai) return "Sinal fraco... (Chave de API não configurada)";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Você é Concord AI, o fantasma digital de Noir Peak. Seu tom é misterioso, sofisticado e noir. Você responde de forma atmosférica e útil. Seja conciso e fale em Português do Brasil.",
      },
    });

    return response.text || "O sinal se dissipou na névoa digital...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Falha na sincronização com o Nodo Central do Noir Peak.";
  }
}