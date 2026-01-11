
import React, { useState, useRef, useEffect } from 'react';
import { Language, Ingredient, Recipe } from './types';
import { TRANSLATIONS } from './constants';
import { KitchenAI } from './services/geminiService';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

const DIETARY_OPTIONS = [
  { id: 'vegan', icon: 'fa-leaf', label: { uz: 'Vegan', en: 'Vegan', ru: 'Веган' } },
  { id: 'gluten-free', icon: 'fa-wheat-awn-circle-exclamation', label: { uz: 'Glutensiz', en: 'Gluten-free', ru: 'Без глютена' } },
  { id: 'nut-free', icon: 'fa-ban', label: { uz: 'Yong’oqsiz', en: 'Nut-free', ru: 'Без орехов' } },
  { id: 'halal', icon: 'fa-check-double', label: { uz: 'Halol', en: 'Halal', ru: 'Халяль' } },
];

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('uz');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<'main' | 'cookbook'>('main');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const ai = new KitchenAI();
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const saved = localStorage.getItem('oshxona_malikasi_cookbook');
    if (saved) {
      try { setSavedRecipes(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveToCookbook = (recipe: Recipe) => {
    const isAlreadySaved = savedRecipes.some(r => r.id === recipe.id);
    if (isAlreadySaved) return;
    const updated = [...savedRecipes, recipe];
    setSavedRecipes(updated);
    localStorage.setItem('oshxona_malikasi_cookbook', JSON.stringify(updated));
  };

  const removeFromCookbook = (id: string) => {
    const updated = savedRecipes.filter(r => r.id !== id);
    setSavedRecipes(updated);
    localStorage.setItem('oshxona_malikasi_cookbook', JSON.stringify(updated));
  };

  const startVoiceAssistant = async () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      const sessionPromise = genAI.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsListening(true);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const base64 = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.modelTurn?.parts?.[0]?.text) {
              const text = msg.serverContent.modelTurn.parts[0].text.toLowerCase();
              if (text.includes("upload") || text.includes("rasm") || text.includes("yuklash")) fileInputRef.current?.click();
              if (text.includes("recipe") || text.includes("retsept") || text.includes("рецепт")) handleGenerateRecipes();
            }
          },
          onclose: () => setIsListening(false),
          onerror: () => setIsListening(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `Siz "Oshxona Malikasi" - ayollar uchun aqlli oshxona yordamchisiz. Foydalanuvchiga ${lang} tilida ovozli buyruqlar orqali yordam bering. Buyruqlar: "Rasm yuklash" (masalliqlar rasmini tanlash uchun), "Retsept yaratish" (taom tayyorlash bo'yicha tavsiyalar olish uchun). Har doim xushmuomala va dalda beruvchi bo'ling.`,
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      setPreviewUrl(e.target?.result as string);
      try {
        const detected = await ai.detectIngredients(base64, lang);
        setIngredients(detected);
        setRecipes([]); 
      } catch (err) {
        console.error("Detection error:", err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateRecipes = async () => {
    if (ingredients.length === 0) return;
    setLoading(true);
    try {
      const suggested = await ai.getRecipes(ingredients.map(i => i.name), lang, selectedFilters.join(", "));
      setRecipes(suggested);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const renderRecipeCard = (recipe: Recipe) => {
    const isSaved = savedRecipes.some(r => r.id === recipe.id);
    return (
      <div key={recipe.id} className="feminine-card overflow-hidden rounded-3xl transition-all shadow-lg border-2 border-pink-50 mb-6 p-6 animate-fadeIn">
        <div className="flex justify-between items-start mb-4">
          <h4 className="text-xl font-serif text-gray-800 leading-tight pr-2">{recipe.title}</h4>
          <button 
            onClick={() => isSaved ? removeFromCookbook(recipe.id) : saveToCookbook(recipe)} 
            className={`text-xl transition-all active:scale-125 ${isSaved ? 'text-pink-500' : 'text-gray-300 hover:text-pink-300'}`}
          >
            <i className={`fa-${isSaved ? 'solid' : 'regular'} fa-heart`}></i>
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-pink-50/50 p-2 rounded-xl">
             <i className="fa-regular fa-clock text-pink-400"></i> {recipe.time}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-pink-50/50 p-2 rounded-xl">
             <i className="fa-solid fa-fire text-pink-400"></i> {recipe.nutrition.calories} kcal
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h5 className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-pink-400"></span>
              {t.ingredientsLabel}
            </h5>
            <ul className="text-sm text-gray-600 space-y-1 pl-1">
              {recipe.ingredients.map((ing, i) => <li key={i} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-pink-200"></span>
                {ing}
              </li>)}
            </ul>
          </div>
          <div>
            <h5 className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-pink-400"></span>
              {t.instructionsLabel}
            </h5>
            <ol className="text-sm text-gray-600 space-y-3 pl-1">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-pink-300 font-serif italic text-lg leading-none">{i+1}</span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          
          {recipe.culturalNote && (
            <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-100/50 flex gap-3 mt-2">
              <i className="fa-solid fa-wand-magic-sparkles text-amber-400 text-xs mt-0.5"></i>
              <p className="text-[11px] text-amber-800 italic leading-relaxed">{recipe.culturalNote}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24 bg-[#fff9fa]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pink-100 p-4 flex justify-between items-center">
        <div onClick={() => setCurrentView('main')} className="cursor-pointer">
          <h1 className="text-2xl font-bold text-pink-600 italic leading-none">{t.title}</h1>
          <p className="text-[10px] text-pink-400 font-medium uppercase tracking-tighter">{t.subtitle}</p>
        </div>
        <div className="flex gap-1">
          {(['uz', 'en', 'ru'] as Language[]).map(l => (
            <button 
              key={l} 
              onClick={() => setLang(l)} 
              className={`px-2 py-1 text-[9px] font-bold rounded-lg border transition-all ${lang === l ? 'bg-pink-500 text-white border-pink-500 shadow-sm' : 'text-gray-400 border-gray-100 hover:border-pink-200'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {currentView === 'main' ? (
          <>
            <section className="relative overflow-hidden rounded-[2rem] soft-pink-gradient aspect-[4/3] flex flex-col items-center justify-center border-4 border-white shadow-2xl">
              {previewUrl ? (
                <div className="relative w-full h-full group">
                  <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white/90 text-pink-500 px-4 py-2 rounded-full font-bold text-xs"
                    >
                      <i className="fa-solid fa-rotate mr-2"></i>Change Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 space-y-6">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto text-pink-400 shadow-xl rotate-3">
                    <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-serif text-gray-800">Masalliqlar rasmini yuklang</h2>
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      className="primary-btn text-white px-10 py-4 rounded-full font-bold text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 mx-auto"
                    >
                      <i className="fa-solid fa-image"></i>
                      Rasm tanlash
                    </button>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange} 
              />
            </section>

            <div className="flex justify-center -mt-10 relative z-10">
              <button 
                onClick={startVoiceAssistant}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-white ${isListening ? 'bg-red-500 scale-110' : 'bg-pink-500 hover:bg-pink-600'}`}
              >
                <i className={`fa-solid ${isListening ? 'fa-microphone animate-pulse' : 'fa-microphone'} text-white text-xl`}></i>
              </button>
            </div>

            <section className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                <i className="fa-solid fa-sliders text-pink-300"></i> {t.dietaryFilters}
              </h3>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((opt) => (
                  <button 
                    key={opt.id} 
                    onClick={() => setSelectedFilters(p => p.includes(opt.id) ? p.filter(f => f !== opt.id) : [...p, opt.id])}
                    className={`px-4 py-2.5 rounded-2xl text-[11px] font-bold border transition-all flex items-center gap-2 ${selectedFilters.includes(opt.id) ? 'bg-pink-500 text-white border-pink-500 shadow-pink-200 shadow-lg' : 'bg-white text-gray-500 border-pink-100 hover:border-pink-300'}`}
                  >
                    <i className={`fa-solid ${opt.icon}`}></i> {opt.label[lang]}
                  </button>
                ))}
              </div>
            </section>

            {loading ? (
              <div className="py-16 text-center space-y-4">
                <div className="relative w-12 h-12 mx-auto">
                   <div className="absolute inset-0 border-4 border-pink-100 rounded-full"></div>
                   <div className="absolute inset-0 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-xs text-pink-500 font-bold uppercase tracking-widest animate-pulse">{t.processing}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {ingredients.length > 0 && (
                  <section className="animate-fadeIn space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <i className="fa-solid fa-leaf text-pink-400"></i> {t.detectedIngredients}
                      </h3>
                      <button 
                        onClick={() => {setIngredients([]); setPreviewUrl(null); setRecipes([]);}}
                        className="text-[10px] text-pink-400 font-bold uppercase"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {ingredients.map((ing, i) => (
                        <div key={i} className="feminine-card p-4 rounded-2xl text-xs font-bold text-pink-700 border-pink-100 flex items-center justify-between">
                          <span>{ing.name}</span>
                          <span className="text-[9px] bg-pink-50 px-2 py-0.5 rounded-full opacity-70">{ing.nutrition.calories}cal</span>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={handleGenerateRecipes} 
                      className="w-full primary-btn text-white py-4 rounded-[1.5rem] font-bold shadow-xl flex items-center justify-center gap-2 text-sm"
                    >
                      <i className="fa-solid fa-wand-sparkles"></i>
                      {t.generateRecipe}
                    </button>
                  </section>
                )}
                {recipes.length > 0 && (
                   <section className="space-y-4">
                     <h3 className="text-lg font-serif text-gray-800 px-1">{t.recipes}</h3>
                     {recipes.map(recipe => renderRecipeCard(recipe))}
                   </section>
                )}
              </div>
            )}
          </>
        ) : (
          <section className="animate-fadeIn space-y-6 min-h-[60vh]">
             <div className="flex justify-between items-end border-b border-pink-100 pb-4">
               <div>
                <h3 className="text-2xl font-serif text-gray-800 flex items-center gap-3">
                    <i className="fa-solid fa-book-sparkles text-pink-400"></i> {t.myCookbook}
                </h3>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Saved Recipes Portfolio</p>
               </div>
               <span className="text-pink-500 text-sm font-bold bg-pink-50 px-3 py-1 rounded-full">{savedRecipes.length}</span>
             </div>
             
             {savedRecipes.length === 0 ? (
               <div className="py-32 text-center space-y-6">
                 <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-inner border border-pink-50">
                   <i className="fa-solid fa-heart-crack text-pink-100 text-4xl"></i>
                 </div>
                 <div className="space-y-2">
                   <p className="text-gray-400 font-medium italic">Your cookbook is empty</p>
                   <button 
                    onClick={() => setCurrentView('main')}
                    className="text-pink-500 text-xs font-bold underline underline-offset-4"
                   >
                     Find something to cook
                   </button>
                 </div>
               </div>
             ) : (
               <div className="space-y-2">
                {savedRecipes.map(recipe => renderRecipeCard(recipe))}
               </div>
             )}
          </section>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 h-20 bg-white/95 backdrop-blur-xl border-t border-pink-50 flex items-center justify-around px-6 pb-2 z-[60]">
        <button 
          onClick={() => {setCurrentView('main');}} 
          className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'main' ? 'text-pink-500 scale-110' : 'text-gray-300'}`}
        >
          <div className={`p-2 rounded-xl ${currentView === 'main' ? 'bg-pink-50' : ''}`}>
            <i className="fa-solid fa-house-chimney text-lg"></i>
          </div>
          <span className="text-[9px] font-black uppercase tracking-tighter">Home</span>
        </button>
        
        <div className="w-16"></div>

        <button 
          onClick={() => {setCurrentView('cookbook');}} 
          className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'cookbook' ? 'text-pink-500 scale-110' : 'text-gray-300'}`}
        >
          <div className={`p-2 rounded-xl ${currentView === 'cookbook' ? 'bg-pink-50' : ''}`}>
            <i className="fa-solid fa-book-bookmark text-lg"></i>
          </div>
          <span className="text-[9px] font-black uppercase tracking-tighter">Cookbook</span>
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 -top-6">
           <button 
             onClick={() => {setCurrentView('main'); fileInputRef.current?.click();}}
             className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-2xl transition-all active:scale-95 border-4 border-white bg-pink-500`}
           >
             <i className="fa-solid fa-cloud-arrow-up text-xl"></i>
           </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
