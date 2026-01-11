
import { GoogleGenAI, Type } from "@google/genai";
import { Language, Ingredient, Recipe } from "../types";

export class KitchenAI {
  private ai: GoogleGenAI;

  constructor() {
    // Initialize with named parameter apiKey as per @google/genai guidelines
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async detectIngredients(base64Image: string, lang: Language): Promise<Ingredient[]> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: `Identify all food ingredients in this image. For each ingredient, provide its name in ${lang}, and estimated nutritional data per 100g. Return as a JSON array.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              nutrition: {
                type: Type.OBJECT,
                properties: {
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fat: { type: Type.NUMBER }
                },
                required: ["calories", "protein", "carbs", "fat"]
              }
            },
            required: ["name", "confidence", "nutrition"]
          }
        }
      }
    });

    // Use .text property instead of .text() method
    return JSON.parse(response.text || "[]");
  }

  async getRecipes(ingredients: string[], lang: Language, preferences: string = ""): Promise<Recipe[]> {
    const prompt = `Based on these ingredients: ${ingredients.join(", ")}, suggest 2 culturally relevant recipes for a user in ${lang}. Preferences: ${preferences}. For each recipe, calculate the TOTAL estimated nutritional values (calories, protein, carbs, fats) for the entire prepared dish. Provide a small cultural note for each. Generate a unique short string ID for each recipe.`;
    
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              time: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
              instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
              nutrition: {
                type: Type.OBJECT,
                properties: {
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fat: { type: Type.NUMBER }
                },
                required: ["calories", "protein", "carbs", "fat"]
              },
              culturalNote: { type: Type.STRING }
            },
            required: ["id", "title", "time", "difficulty", "ingredients", "instructions", "nutrition"]
          }
        }
      }
    });

    // Use .text property instead of .text() method
    return JSON.parse(response.text || "[]");
  }
}
