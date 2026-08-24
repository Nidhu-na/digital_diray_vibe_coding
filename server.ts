import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
  });

  // 1. Generate Daily Journaling Prompts
  app.post('/api/gemini/prompt', async (req, res) => {
    try {
      const { theme = 'general', mood = 'neutral', timeOfDay = 'any' } = req.body;
      const ai = getAI();
      if (!ai) {
        // Fallback default prompts if no key is configured
        const fallbacks: Record<string, string[]> = {
          gratitude: [
            "What is a small, unnoticed moment from today that brought warmth to your heart?",
            "Who is someone whose presence made your life easier recently, and why?",
            "Name three physical comforts around you right now that you feel thankful for."
          ],
          reflection: [
            "What occupied your thoughts the most today? Did it deserve that energy?",
            "If today was a chapter in your biography, what would you title it and why?",
            "What is one lesson you learned this week that you hope future-you remembers?"
          ],
          mindful: [
            "Close your eyes for three deep breaths. What sounds, sensations, and feelings are present right now?",
            "What emotion was hardest to sit with today, and how did you care for yourself?",
            "Describe the atmosphere of your favorite place as if you were sitting there right now."
          ],
          general: [
            "What made you smile today, even for a fleeting second?",
            "What is something you are eager to build, experience, or solve tomorrow?",
            "Write freely about whatever is on the tip of your mind right now."
          ]
        };
        const list = fallbacks[theme] || fallbacks.general;
        const prompt = list[Math.floor(Math.random() * list.length)];
        return res.json({ prompt, isFallback: true });
      }

      const promptResponse = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `You are an empathetic, poetic, and insightful personal journaling guide.
Create 1 inspiring, thoughtful, and open-ended daily journaling prompt.
Theme: "${theme}"
User's current mood/vibe: "${mood}"
Time of day: "${timeOfDay}"

Return ONLY the single prompt sentence/question directly without introduction, quotes, or markdown.`,
      });

      const generatedText = promptResponse.text?.trim() || "What made today uniquely yours?";
      res.json({ prompt: generatedText });
    } catch (err: any) {
      console.error('Error generating prompt:', err);
      res.status(500).json({ error: err.message || 'Failed to generate prompt' });
    }
  });

  // 2. Reflective Mirror & Insights on an Entry
  app.post('/api/gemini/reflect', async (req, res) => {
    try {
      const { title, content, mood, weather, tags } = req.body;
      if (!content || content.trim().length < 5) {
        return res.status(400).json({ error: 'Diary entry content is required to reflect upon.' });
      }

      const ai = getAI();
      if (!ai) {
        return res.json({
          reflection: "Your words capture a genuine snapshot of your journey. Journaling regularly is a gift to your future self.",
          keyThemes: ["Mindfulness", "Self-expression"],
          followUpQuestions: [
            "How do you feel in your body after writing this down?",
            "What is one thing you can do tonight to honor how you feel?",
            "If you look at this tomorrow, what perspective might shift?"
          ],
          isFallback: true
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `You are an empathetic, supportive, and compassionate personal diary companion.
The user has shared their private journal entry:

Title: "${title || 'Untitled Entry'}"
Mood: "${mood || 'Unspecified'}"
Weather: "${weather || 'Unspecified'}"
Tags: ${Array.isArray(tags) ? tags.join(', ') : 'None'}
Content:
"""
${content}
"""

Provide a gentle, validating, and constructive reflection.
Respond in JSON with the following structure:
{
  "reflection": "2-3 short, warm, compassionate sentences validating the user's emotions and acknowledging their growth or experience.",
  "keyThemes": ["theme 1", "theme 2", "theme 3"],
  "sentimentSummary": "A brief 1-phrase emotional essence (e.g., 'Quiet contemplation with underlying hope')",
  "followUpQuestions": [
    "Thought-provoking question 1 to explore deeper",
    "Thought-provoking question 2",
    "Thought-provoking question 3"
  ]
}
`,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json(parsed);
    } catch (err: any) {
      console.error('Error reflecting on entry:', err);
      res.status(500).json({ error: err.message || 'Failed to reflect on entry' });
    }
  });

  // 3. Journal Whisperer (Polishing / Expanding notes into journal prose)
  app.post('/api/gemini/polish', async (req, res) => {
    try {
      const { draftText, style = 'poetic-warm' } = req.body;
      if (!draftText || draftText.trim().length < 3) {
        return res.status(400).json({ error: 'Text is required to polish.' });
      }

      const ai = getAI();
      if (!ai) {
        return res.json({ polishedText: draftText, isFallback: true });
      }

      const styleGuides: Record<string, string> = {
        'poetic-warm': 'Warm, reflective, poetic yet natural and heartfelt personal diary tone.',
        'clear-concise': 'Clean, well-structured, readable narrative journal style.',
        'vintage-literary': 'Timeless classic literary prose reminiscent of early 20th century traveler notebooks.',
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `Transform the following raw thoughts/bullet points/rough notes into a beautifully written, heartfelt personal journal entry.
Style: ${styleGuides[style] || styleGuides['poetic-warm']}
Preserve the user's authentic facts, thoughts, raw honesty, and personal pronoun "I". Do NOT sound corporate or artificial.

Raw thoughts:
"""
${draftText}
"""

Return ONLY the polished journal text without commentary or wrapper quotes.`,
      });

      res.json({ polishedText: response.text?.trim() || draftText });
    } catch (err: any) {
      console.error('Error polishing entry:', err);
      res.status(500).json({ error: err.message || 'Failed to polish entry' });
    }
  });

  // 4. Audio Transcription to Text (Voice-to-Text via Gemini)
  app.post('/api/gemini/transcribe-audio', async (req, res) => {
    try {
      const { audioData, mimeType = 'audio/webm' } = req.body;
      if (!audioData) {
        return res.status(400).json({ error: 'Audio data is required for transcription.' });
      }

      // Strip data URL prefix if present (e.g. data:audio/webm;base64,...)
      const base64Data = audioData.includes('base64,')
        ? audioData.split('base64,')[1]
        : audioData;

      const ai = getAI();
      if (!ai) {
        return res.json({
          transcription: "Spoken reflection recorded successfully.",
          isFallback: true,
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: base64Data,
                },
              },
              {
                text: `You are a precise and faithful speech-to-text transcriber for personal journal entries.
Transcribe the user's spoken recording into clean, naturally punctuated diary prose.
- Transcribe all spoken words accurately.
- Remove accidental stutters or excessive filler words (like "uhm", "uh") if appropriate, while strictly preserving the speaker's meaning and natural voice.
- Add proper sentence capitalization and punctuation (. , ? !).
- Split distinct thoughts into readable paragraphs if long.
- Return ONLY the transcribed text, without preamble, quotes, or markdown code blocks.`
              }
            ],
          },
        ],
      });

      const transcription = response.text?.trim() || '';
      res.json({ transcription });
    } catch (err: any) {
      console.error('Error transcribing audio:', err);
      res.status(500).json({ error: err.message || 'Failed to transcribe audio' });
    }
  });

  // 5. Digest / Weekly Summary of Entries
  app.post('/api/gemini/summary', async (req, res) => {
    try {
      const { entries } = req.body;
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'At least one entry is required.' });
      }

      const ai = getAI();
      if (!ai) {
        return res.json({
          summary: `You have penned ${entries.length} reflections in this timeframe, capturing your authentic daily moments and evolving thoughts.`,
          highlights: ["Consistent journaling habit", "Personal growth moments"],
          moodArc: "Reflective and steady",
          isFallback: true
        });
      }

      const entriesDigest = entries.slice(0, 15).map(e => `[${e.date}] (Mood: ${e.mood || 'N/A'}) ${e.title}: ${e.content?.slice(0, 300)}...`).join('\n---\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `Analyze these journal entries and synthesize an encouraging, insightful emotional retrospective digest:

${entriesDigest}

Return a JSON object:
{
  "summary": "A 3-4 sentence warm summary of their journey, recurring themes, and personal victories across these entries.",
  "highlights": ["Key milestone or realization 1", "Key realization 2", "Key realization 3"],
  "moodArc": "A concise description of the emotional arc (e.g. 'From mid-week fatigue to renewed weekend inspiration')",
  "wordsOfEncouragement": "A gentle closing thought for their journaling road ahead"
}
`,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json(parsed);
    } catch (err: any) {
      console.error('Error summarizing entries:', err);
      res.status(500).json({ error: err.message || 'Failed to generate summary' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Digital Diary server running on http://localhost:${PORT}`);
  });
}

startServer();
