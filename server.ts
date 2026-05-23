import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

// --- CAPA DE MEMORIA: Hot Reload de Fillers ---
const FILLERS_PATH = path.join(process.cwd(), "config", "fillers.json");
let activeFillers = {
  intent_categories: {
    roi: ["Entiendo su preocupación por el ROI, permítame validar los datos..."],
    technical: ["Comprendo el desafío técnico, estoy consultando la arquitectura..."],
    scaling: ["Entendido, escalar la operación requiere precisión. Revisando KPIs..."],
    default: ["Entiendo perfectamente, déme un segundo..."]
  }
};

function loadFillers() {
  try {
    if (!fs.existsSync(path.dirname(FILLERS_PATH))) {
      fs.mkdirSync(path.dirname(FILLERS_PATH), { recursive: true });
    }
    const data = fs.readFileSync(FILLERS_PATH, "utf-8");
    activeFillers = JSON.parse(data);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Fillers cargados/actualizados exitosamente.`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Error cargando fillers. Usando fallback en memoria.`);
  }
}

// Carga inicial
loadFillers();

// Vigilante (Hot Reload)
fs.watch(FILLERS_PATH, (eventType) => {
  if (eventType === "change") {
    loadFillers();
  }
});
// ----------------------------------------------

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para JSON
  app.use(express.json());

  // --- TWILIO INTEGRATION: TwiML Endpoint ---
  app.post("/api/twilio/voice", (req, res) => {
    res.set("Content-Type", "text/xml");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Ricardo" language="es-CL">
        Hola, soy Martín de IMP Assist. Cachái que estabas buscando una asistencia médica y para el hogar que funcione al tiro. 
        Nuestro plan cuesta solo cinco dólares cincuenta al mes. ¿Cómo estás hoy? ¿Te interesa saber del médico 24/7 o del gásfiter?
    </Say>
    <Pause length="1"/>
    <Gather input="speech" action="/api/twilio/handle-response" language="es-CL" speechTimeout="auto">
        <Say voice="Polly.Ricardo" language="es-CL">Por favor, dime qué te parece.</Say>
    </Gather>
</Response>`;
    res.send(twiml);
  });

  app.post("/api/twilio/handle-response", async (req, res) => {
      // Aquí Twilio enviaría el texto transcrito (SpeechResult)
      const speechResult = req.body.SpeechResult || "";
      console.log("Twilio Speech Result:", speechResult);
      
      res.set("Content-Type", "text/xml");
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Ricardo" language="es-MX">Entendido. Estoy procesando su consulta sobre "${speechResult}". Un momento...</Say>
    <Redirect>/api/twilio/voice</Redirect>
</Response>`);
  });
  // ------------------------------------------

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "SOVA Core", phase: 2 });
  });

  app.get("/api/config-check", (req, res) => {
    res.json({
      gemini: !!process.env.GEMINI_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      voice_id: !!process.env.ELEVENLABS_VOICE_ID,
      app_url: !!process.env.APP_URL
    });
  });

  // Fase 2: Simulación de Cloud Function (Dual Path Cognition)
  app.post("/api/process-intent", async (req, res) => {
    const { query } = req.body;
    const lowerQuery = (query || "").toLowerCase();
    
    // Selección dinámica de frase Fast Track (Línea A) desde Memoria Activa
    const categories = activeFillers.intent_categories;
    let fastTrackResponse = "";
    
    if (lowerQuery.includes("roi") || lowerQuery.includes("costo") || lowerQuery.includes("precio") || lowerQuery.includes("inversión")) {
      const options = categories.roi || categories.default;
      fastTrackResponse = options[Math.floor(Math.random() * options.length)];
    } else if (lowerQuery.includes("técnico") || lowerQuery.includes("latencia") || lowerQuery.includes("arquitectura") || lowerQuery.includes("integración")) {
      const options = categories.technical || categories.default;
      fastTrackResponse = options[Math.floor(Math.random() * options.length)];
    } else if (lowerQuery.includes("equipo") || lowerQuery.includes("personas") || lowerQuery.includes("escala") || lowerQuery.includes("100")) {
      const options = categories.scaling || categories.default;
      fastTrackResponse = options[Math.floor(Math.random() * options.length)];
    } else {
      const options = categories.default;
      fastTrackResponse = options[Math.floor(Math.random() * options.length)];
    }
    
    // En una implementación real, aquí se llamaría a Gemini 1.5 Flash
    // y se enviaría vía WebSocket inmediatamente.

    res.json({
      fastTrack: fastTrackResponse,
      metrics: {
        latency_line_a: `${Math.floor(Math.random() * 50 + 100)}ms`,
        stt_engine: "Chirp-2",
        processing_node: "us-west2-a"
      }
    });
  });

  // Proxy para ElevenLabs (Fase 3: Streaming Pipe)
  app.post("/api/tts", async (req, res) => {
    const { text } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const envVoiceId = process.env.ELEVENLABS_VOICE_ID;
    
    // Default valid voice IDs for Free Plan (Pre-made voices)
    const DEFAULT_VOICE_ID = "pNInz6obpg8ndclK7Abv"; // Adam (System)
    const ALT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel (System)
    const SAFE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Bella (System - Muy estable)
    let voiceId = envVoiceId && envVoiceId.trim() !== "" ? envVoiceId.trim() : DEFAULT_VOICE_ID;

    if (!text) {
      return res.status(400).json({ error: "Texto requerido" });
    }

    if (!apiKey || apiKey.trim() === "") {
      console.warn("ELEVENLABS_API_KEY no configurada. Simulando stream de audio...");
      return res.json({ status: "simulated", message: "Audio stream simulated (Missing API Key)", text });
    }

    const generateTTS = async (vId: string) => {
      console.log(`Iniciando TTS para voz: ${vId}`);
      return fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
            "accept": "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_flash_v2_5", // Flash es más permisivo y rápido en planes free/starter
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );
    };

    try {
      let response = await generateTTS(voiceId);

      // Si la voz específica (del env) falla, intentar con Adam
      if ((response.status === 404 || response.status === 402) && voiceId !== DEFAULT_VOICE_ID) {
        console.warn(`Voz personalizada falló (${response.status}). Reintentando con Adam.`);
        voiceId = DEFAULT_VOICE_ID;
        response = await generateTTS(voiceId);
      }

      // Si falla Adam, intentar con Rachel
      if ((response.status === 404 || response.status === 402) && voiceId !== ALT_VOICE_ID) {
        console.warn(`Voz Adam falló (${response.status}). Intentando con Rachel.`);
        voiceId = ALT_VOICE_ID;
        response = await generateTTS(voiceId);
      }

      // Si falla Rachel, intentar con Bella (El fallback de emergencia para Free)
      if ((response.status === 404 || response.status === 402) && voiceId !== SAFE_VOICE_ID) {
        console.warn(`Voz Rachel falló (${response.status}). Intentando con Bella.`);
        voiceId = SAFE_VOICE_ID;
        response = await generateTTS(voiceId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        
        // Si hay errores de plan (402), cuota (429), auth (401) o voz no encontrada (404)
        // tras agotar el encadenamiento, simulamos para activar el fallback local en el cliente
        if ([401, 402, 404, 429].includes(response.status)) {
            console.warn(`ElevenLabs API (Status ${response.status}): Error manejado. Activando síntesis local.`);
            return res.json({ 
                status: "simulated", 
                message: "ElevenLabs fallback active.",
                text,
                detail: errorBody 
            });
        }
        
        console.error(`ElevenLabs API Error Crítico (${response.status}):`, errorBody);
        throw new Error(`ElevenLabs API error: ${response.statusText} - ${errorBody}`);
      }

      // Pipe del stream de audio directamente al cliente
      res.setHeader("Content-Type", "audio/mpeg");
      if (response.body) {
        const reader = response.body.getReader();
        const nodeStream = new (await import('stream')).Readable({
          async read() {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(Buffer.from(value));
            }
          }
        });
        nodeStream.pipe(res);
      }
    } catch (error) {
      console.error("Error detallado en ElevenLabs Proxy:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Error al generar audio" });
    }
  });

  // Configuración de Vite para desarrollo
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SOVA Core corriendo en http://localhost:${PORT}`);
  });
}

startServer();
