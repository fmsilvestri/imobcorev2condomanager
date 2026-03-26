/**
 * routes/tts.ts — ElevenLabs TTS com cache em memória
 */
import { Router } from 'express';
const r = Router();
const cache = new Map<string, Buffer>();

r.post('/', async (req, res) => {
  const { text, idioma = 'pt_BR' } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text obrigatório' }) as any;

  const txt     = String(text).slice(0, 500);
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    // Fallback: indica ao cliente para usar Web Speech API
    return res.status(503).json({ error: 'ElevenLabs não configurado', fallback: 'web_speech' }) as any;
  }

  const key = `${idioma}:${txt}`;
  if (cache.has(key)) {
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.end(cache.get(key)) as any;
  }

  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   apiKey,
          'Content-Type': 'application/json',
          Accept:         'audio/mpeg',
        },
        body: JSON.stringify({
          text: txt,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
        }),
      }
    );
    if (!resp.ok) return res.status(502).json({ error: 'ElevenLabs ' + resp.status }) as any;

    res.setHeader('Content-Type', 'audio/mpeg');
    const chunks: Buffer[] = [];
    const reader = resp.body!.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) { if (cache.size < 60) cache.set(key, Buffer.concat(chunks)); res.end(); return; }
      const c = Buffer.from(value);
      chunks.push(c); res.write(c);
      return pump();
    };
    await pump();
  } catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

export default r;
