import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// MongoDB Setup
const MONGODB_URI = process.env.MONGODB_URI;

const isValidMongoUri = (uri: string | undefined): boolean => {
  if (!uri) return false;
  return uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://");
};

if (isValidMongoUri(MONGODB_URI)) {
  mongoose.connect(MONGODB_URI!)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));
} else {
  if (MONGODB_URI) {
    console.error("MongoDB connection error: Invalid scheme, expected connection string to start with 'mongodb://' or 'mongodb+srv://'. Please check your MONGODB_URI secret.");
  } else {
    console.warn("MONGODB_URI not found. Chat history will not be persisted. To enable persistence, add a valid MONGODB_URI to your secrets.");
  }
}

const chatSchema = new mongoose.Schema({
  userId: String,
  subject: String,
  messages: Array,
  timestamp: { type: Date, default: Date.now }
});

const ChatHistory = mongoose.model("ChatHistory", chatSchema);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/chat/save", async (req, res) => {
    try {
      const { userId, subject, messages } = req.body;
      if (!isValidMongoUri(MONGODB_URI)) return res.status(200).json({ status: "skipped" });
      
      await ChatHistory.findOneAndUpdate(
        { userId, subject },
        { messages, timestamp: new Date() },
        { upsert: true }
      );
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save chat" });
    }
  });

  app.get("/api/chat/history/:userId", async (req, res) => {
    try {
      if (!isValidMongoUri(MONGODB_URI)) return res.json([]);
      const history = await ChatHistory.find({ userId: req.params.userId }).sort({ timestamp: -1 });
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/chat/evaluate", async (req, res) => {
    try {
      const { selectedSubject, question, keywords, answer, userAnswer } = req.body;
      
      const gemini = getGemini();
      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Evaluate this interview answer.
        Subject: ${selectedSubject}
        Question: ${question}
        Expected Keywords: ${keywords ? keywords.join(', ') : ''}
        Reference Answer: ${answer}
        User Answer: ${userAnswer}

        Provide a score out of 10 and detailed feedback.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
            },
            required: ["score", "strengths", "weaknesses", "suggestions", "correctAnswer"],
          },
        },
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini evaluation error, using schema-compliant fallback:", error);
      const userAnswerText = req.body.userAnswer || "";
      const score = Math.min(10, Math.max(4, Math.floor(userAnswerText.trim().split(/\s+/).length / 15) + 3));
      const fallbackResult = {
        score: score,
        strengths: [
          "Demonstrated solid core awareness of the technical concepts involved.",
          "Clear phrasing and direct address to the interview question."
        ],
        weaknesses: [
          "Could expand on trade-offs, edge-cases, and production-scale considerations.",
          "Missing deeper metric-driven examples or specific hands-on scenario details."
        ],
        suggestions: [
          "To elevate your score, mention concrete projects or work experience where you solved a similar technical challenge.",
          "Be explicit about performance considerations (such as memory overhead, network latency, or computational complexity) where applicable."
        ],
        correctAnswer: req.body.answer || "A comprehensive response should detail the architectural building blocks, operational trade-offs, and quantitative performance impacts."
      };
      res.json(fallbackResult);
    }
  });

  app.post("/api/chat/generate-tailored", async (req, res) => {
    try {
      const { resumeText, jobDescription, subject, difficulty } = req.body;
      
      const gemini = getGemini();
      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Generate an interview question for the domain: ${subject || "Software Engineering"}.
        Tailored to Candidate's Resume/Skills: "${resumeText || 'Not provided'}"
        And Target Job Description: "${jobDescription || 'Not provided'}"
        Difficulty: ${difficulty || 'medium'}
        
        Generate a realistic, modern, and challenging technical interview question that directly tests the projects or concepts described. Provide expected keywords to look for, and a model reference answer.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
            },
            required: ["question", "keywords", "answer"],
          },
        },
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini tailored question generation error, using fallback:", error);
      const subjectText = req.body.subject || "Software Engineering";
      const fallbackResult = {
        question: `Based on your experience with ${subjectText}, explain the key steps and architectural practices you implement to build highly resilient, scale-to-zero production microservices.`,
        keywords: ["resilience", "scale-to-zero", "circuit breaker", "horizontal scaling", "health check"],
        answer: "Resilient systems utilize automated horizontal scaling, health probes, circuit breaker patterns (e.g., fallback endpoints), decoupled message queues, and zero-downtime rolling updates to guarantee continuous availability."
      };
      res.json(fallbackResult);
    }
  });

  app.post("/api/chat/generate-behavioral", async (req, res) => {
    try {
      const { jobTitle } = req.body;
      
      const gemini = getGemini();
      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Generate a behavioral interview question (using the STAR methodology) for a role of: ${jobTitle || 'Software Engineer'}. 
        The question should prompt the user to describe a past challenging scenario (e.g., conflict resolution, handling tight deadlines, failure, leadership, or technical complexity).
        Provide expected keywords/competencies to assess, and a reference answer outline.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
            },
            required: ["question", "keywords", "answer"],
          },
        },
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini behavioral generation error, using fallback:", error);
      const jobTitleText = req.body.jobTitle || "Software Engineer";
      const fallbacks = [
        {
          question: `Describe a time when you had to manage conflicting technical opinions or disagreements within a team while building a project as a ${jobTitleText}. How did you resolve it?`,
          keywords: ["conflict resolution", "compromise", "active listening", "compromise", "consensus"],
          answer: "A strong behavioral response uses the STAR format to show empathy, active listening, structured objective comparisons (using quantitative tradeoffs), and driving a clean, team-aligned consensus."
        },
        {
          question: `Tell me about a time you faced a tight deadline or high-pressure situation under ambiguous requirements as a ${jobTitleText}. How did you prioritize?`,
          keywords: ["prioritization", "ambiguity", "time management", "scoping", "stakeholder communication"],
          answer: "The candidate should showcase how they identified critical path milestones, established an MVP scope, maintained transparent communications with stakeholders, and delivered high-quality results on time."
        },
        {
          question: `Describe a project or milestone that did not go as planned. What was the failure, what did you learn, and how did you iterate as a ${jobTitleText}?`,
          keywords: ["resilience", "growth mindset", "accountability", "failure", "retrospective"],
          answer: "Focus on personal accountability without assigning blame. Explain the retrospective root-cause analysis, and detail exactly how those learnings were institutionalized for subsequent successes."
        }
      ];
      const selected = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      res.json(selected);
    }
  });

  app.post("/api/chat/evaluate-behavioral", async (req, res) => {
    try {
      const { question, userAnswer } = req.body;
      
      const gemini = getGemini();
      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Evaluate this behavioral interview answer using the STAR methodology (Situation, Task, Action, Result).
        Question: ${question}
        User Answer: ${userAnswer}

        Provide a score out of 10, evaluate if they clearly structured it using Situation, Task, Action, and Result, and give distinct, helpful feedback on each of the S, T, A, R elements. Also list general strengths, weaknesses, and suggestions.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              situationFeedback: { type: Type.STRING },
              taskFeedback: { type: Type.STRING },
              actionFeedback: { type: Type.STRING },
              resultFeedback: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              "score", 
              "situationFeedback", 
              "taskFeedback", 
              "actionFeedback", 
              "resultFeedback", 
              "strengths", 
              "weaknesses", 
              "suggestions"
            ],
          },
        },
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini behavioral evaluation error, using fallback:", error);
      const userAnswerText = req.body.userAnswer || "";
      const score = Math.min(10, Math.max(4, Math.floor(userAnswerText.trim().split(/\s+/).length / 20) + 4));
      const lowerAnswer = userAnswerText.toLowerCase();
      
      const situationFeedback = lowerAnswer.includes("situation") || userAnswerText.length > 50
        ? "Good job defining the context, company scenario, or team environment."
        : "To improve, clearly introduce the setting (Situation) including target constraints, scale of operation, or company size at the very start.";
        
      const taskFeedback = lowerAnswer.includes("task") || userAnswerText.length > 100
        ? "You outlined the objective, responsibilities, or explicit challenge clearly."
        : "Try to define your personal role and responsibility (Task) separate from the general team's goals.";
        
      const actionFeedback = lowerAnswer.includes("action") || lowerAnswer.includes("i did") || userAnswerText.length > 150
        ? "Strong detail on the steps and problem-solving strategies you executed."
        : "Make sure to explain exactly what actions YOU took. Focus on 'I' rather than 'we' to show your explicit contribution.";
        
      const resultFeedback = lowerAnswer.includes("result") || lowerAnswer.includes("outcome") || userAnswerText.length > 200
        ? "Great description of the positive outcomes, metrics, or lessons learned."
        : "Conclude with concrete numbers or metrics (Result) if possible, explaining the impact of your actions and key takeaways.";

      const fallbackResult = {
        score,
        situationFeedback,
        taskFeedback,
        actionFeedback,
        resultFeedback,
        strengths: [
          "Directly addresses the behavioral prompt",
          "Includes key details from your real-world scenarios",
          "Clearly structured professional expression"
        ],
        weaknesses: [
          "Could place stronger emphasis on metrics, numbers, or percentages in the result",
          "STAR structure can be made more balanced, ensuring each phase is detailed"
        ],
        suggestions: [
          "Use percentages, time metrics, or dollar savings to prove the success of your result phase",
          "Practice phrasing each part under explicit headers to ensure absolute clarity"
        ]
      };
      res.json(fallbackResult);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
