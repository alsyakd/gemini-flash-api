import "dotenv/config";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const upload = multer();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Define the Gemini model to use
const GEMINI_MODEL = "gemini-2.5-flash";

// Middleware to parse JSON bodies
app.use(express.json());

// Define the port to listen on
const PORT = process.env.PORT || 3000;

async function callGemini(fn, retries = 4, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    if (
      (err.message.includes("503") || err.message.includes("UNAVAILABLE")) &&
      retries > 0
    ) {
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
      return callGemini(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

app.use(async (req, res, next) => {
  await new Promise((r) => setTimeout(r, 500));
  next();
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server ready on http://localhost:${PORT}`);
});

app.post("/generate-text", async (req, res) => {
  const { prompt } = req.body;

  try {
    const response = await callGemini(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      }),
    );

    res.status(200).json({ result: response.text });
  } catch (e) {
    console.log(e);

    res.status(503).json({
      message: "AI lagi sibuk, coba lagi sebentar ya 🙏",
    });
  }
});

app.post(
  "/generate-from-document",
  upload.single("document"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "File wajib diupload" });
      }

      // Batasi ukuran file (misal max 2MB)
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(400).json({
          message: "File terlalu besar (max 2MB)",
        });
      }

      const base64Document = req.file.buffer.toString("base64");

      const response = await callGemini(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              text:
                req.body.prompt || "Analyze this document and give insights",
            },
            {
              inlineData: {
                data: base64Document,
                mimeType: req.file.mimetype,
              },
            },
          ],
        }),
      );

      res.status(200).json({ result: response.text });
    } catch (e) {
      console.log(e);

      res.status(503).json({
        message: "AI lagi overload, coba lagi ya 🙏",
      });
    }
  },
);

app.post("/generate-from-audio", upload.single("audio"), async (req, res) => {
  const { prompt } = req.body;
  const base64Audio = req.file.buffer.toString("base64");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          text: prompt ?? "Analyze this audio and give insights.",
          type: "text",
        },
        {
          inlineData: {
            data: base64Audio,
            mimeType: req.file.mimetype,
          },
        },
      ],
    });

    res.status(200).json({ result: response.text });
  } catch (e) {
    console.log(e);
    res.status(503).json({
      message: "AI lagi overload, coba lagi ya 🙏",
    });
  }
});
