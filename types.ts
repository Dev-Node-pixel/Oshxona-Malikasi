
export type Language = 'uz' | 'en' | 'ru';

export interface Translation {
  title: string;
  subtitle: string;
  scanNow: string;
  detectedIngredients: string;
  generateRecipe: string;
  processing: string;
  nutritionInfo: string;
  recipes: string;
  switchLang: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  ingredientsLabel: string;
  instructionsLabel: string;
  dietaryFilters: string;
  culturalHint: string;
  voicePrompt: string;
  saveRecipe: string;
  saved: string;
  myCookbook: string;
}

export interface Ingredient {
  name: string;
  confidence: number;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface Recipe {
  id: string;
  title: string;
  time: string;
  difficulty: string;
  ingredients: string[];
  instructions: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  culturalNote?: string;
}
