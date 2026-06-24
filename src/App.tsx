/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, MicOff, Send, RefreshCw, Play, CheckCircle2, AlertCircle, User, Bot, 
  Volume2, ChevronRight, BarChart3, BookOpen, Layout, Settings, History, 
  ArrowLeft, Network, Award, Timer, Download, Sparkles, Brain, 
  TrendingUp, Gauge, Zap, Sparkle, VolumeX, HelpCircle, Check, Info, FileSpreadsheet,
  Layers, Compass, Code
} from 'lucide-react';
import questionsDataRaw from './data/questions.json';
const questionsData = questionsDataRaw as Question[];
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Question {
  id: number;
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keywords: string[];
  answer: string;
  subject?: string;
}

interface Message {
  id: string;
  type: 'bot' | 'user' | 'system';
  content: string;
  timestamp: Date;
  evaluation?: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    correctAnswer: string;
    // STAR specific properties
    situationFeedback?: string;
    taskFeedback?: string;
    actionFeedback?: string;
    resultFeedback?: string;
  };
}

const SUBJECTS = [
  { id: 'HTML', name: 'HTML & Frontend', icon: Layout, color: 'blue', desc: 'Core web technologies, semantic markups, and responsive patterns.' },
  { id: 'DevOps', name: 'DevOps & Infrastructure', icon: Settings, color: 'indigo', desc: 'CI/CD pipelines, containerization, deployments, and cloud architectures.' },
  { id: 'Cloud Computing', name: 'Cloud Services', icon: History, color: 'sky', desc: 'Hyperscalers, virtualization, storage tiers, and serverless compute.' },
  { id: 'OS', name: 'Operating Systems', icon: BookOpen, color: 'cyan', desc: 'Process scheduling, memory managers, virtual structures, and IO cycles.' },
  { id: 'Computer Networks', name: 'Computer Networks', icon: Network, color: 'purple', desc: 'Routing tables, transport models, subnets, DNS, and IP allocations.' },
  { id: 'Machine Learning', name: 'Machine Learning', icon: Brain, color: 'rose', desc: 'Supervised/unsupervised models, bias-variance tradeoff, optimization, and evaluation metrics.' },
  { id: 'Generative AI', name: 'Generative AI & LLMs', icon: Sparkles, color: 'amber', desc: 'Large Language Models, prompt engineering, RAG, fine-tuning, and transformer attention mechanisms.' },
  { id: 'Python', name: 'Python Programming', icon: Code, color: 'emerald', desc: 'Decorators, generators, memory management, and clean data structures.' },
  { id: 'Java', name: 'Java Programming', icon: Code, color: 'orange', desc: 'Object-oriented programming, garbage collection, concurrency, and JVM internals.' },
];

export default function App() {
  // General Session State
  const [activeTab, setActiveTab] = useState<'standard' | 'behavioral' | 'dashboard'>('standard');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [scores, setScores] = useState<number[]>([]);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);
  
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [customQuestion, setCustomQuestion] = useState<Question | null>(null);

  // STAR Behavioral Mode State
  const [targetJobTitle, setTargetJobTitle] = useState('Software Engineer');
  const [isSTARMode, setIsSTARMode] = useState(false);

  // Settings
  const [voiceFeedbackEnabled, setVoiceFeedbackEnabled] = useState(true);
  
  // Pacing & Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerIntervalId, setTimerIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [pacingList, setPacingList] = useState<number[]>([]); // holds seconds per answer

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(finalTranscript || interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  // Timer Management for Active Answering
  const startTimer = () => {
    stopTimer();
    setTimerSeconds(0);
    const id = setInterval(() => {
      setTimerSeconds(prev => prev + 1);
    }, 1000);
    setTimerIntervalId(id);
  };

  const stopTimer = () => {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      setTimerIntervalId(null);
    }
  };

  // Keep track of active recording/input timers
  useEffect(() => {
    if (isInterviewStarted && !isEvaluating) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isInterviewStarted, isEvaluating, currentQuestionIndex]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persistence: Save chat history
  useEffect(() => {
    if (isInterviewStarted && messages.length > 0) {
      fetch('/api/chat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subject: selectedSubject || 'Custom_Resume', messages }),
      }).catch(err => console.error("Save error:", err));
    }
  }, [messages, isInterviewStarted, userId, selectedSubject]);

  const speak = useCallback((text: string) => {
    if (voiceFeedbackEnabled && synthRef.current) {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.02;
      synthRef.current.speak(utterance);
    }
  }, [voiceFeedbackEnabled]);

  // Start drilling standard interview subjects
  const startStandardInterview = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setIsSTARMode(false);
    setIsInterviewStarted(true);
    setScores([]);
    setPacingList([]);
    
    const subjectQuestions = questionsData.filter(q => 
      subjectId === 'HTML' ? (!q.subject || q.subject === 'HTML') : q.subject === subjectId
    );
    
    const firstQuestion = subjectQuestions.find(q => q.difficulty === 'easy') || subjectQuestions[0];
    
    const welcomeMsg: Message = {
      id: Date.now().toString(),
      type: 'bot',
      content: `Welcome to your professional ${subjectId} Interview Session. I've designed an adaptive sequence of questions testing core enterprise competencies. Speak or type your answers below.`,
      timestamp: new Date(),
    };
    const questionMsg: Message = {
      id: (Date.now() + 1).toString(),
      type: 'bot',
      content: firstQuestion.question,
      timestamp: new Date(),
    };
    setMessages([welcomeMsg, questionMsg]);
    speak(welcomeMsg.content + " " + questionMsg.content);
    setCurrentQuestionIndex(questionsData.indexOf(firstQuestion));
    setCustomQuestion(null);
  };

  // Start STAR Behavioral Mode
  const startBehavioralInterview = async () => {
    setIsGeneratingQuestion(true);
    setIsInterviewStarted(true);
    setSelectedSubject("STAR-Behavioral");
    setIsSTARMode(true);
    setScores([]);
    setPacingList([]);

    const initialMsg: Message = {
      id: Date.now().toString(),
      type: 'bot',
      content: `Constructing a STAR behavioral scenario-based question for a ${targetJobTitle} role. Real managers evaluate based on Situation, Task, Action, and Result structured delivery. Let's prepare!`,
      timestamp: new Date(),
    };
    setMessages([initialMsg]);
    speak(initialMsg.content);

    try {
      const response = await fetch("/api/chat/generate-behavioral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle: targetJobTitle })
      });

      if (!response.ok) throw new Error("Failed to generate behavioral question");
      const data = await response.json();
      
      const tailoredQ: Question = {
        id: 8000 + Math.floor(Math.random() * 1000),
        question: data.question,
        keywords: data.keywords,
        answer: data.answer,
        difficulty: "medium",
        subject: "STAR Behavioral"
      };

      setCustomQuestion(tailoredQ);

      const readyMsg: Message = {
        id: (Date.now() + 2).toString(),
        type: 'bot',
        content: tailoredQ.question,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, readyMsg]);
      speak(readyMsg.content);
    } catch (err: any) {
      console.error(err);
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        type: 'bot',
        content: `Let's tackle this key behavioral prompt: Tell me about a time you faced a severe technical bottleneck or bug right before a production launch. How did you handle it and what was the outcome?`,
        timestamp: new Date(),
      };
      setCustomQuestion({
        id: 8888,
        question: "Tell me about a time you faced a severe technical bottleneck or bug right before a production launch. How did you handle it and what was the outcome?",
        keywords: ["STAR", "Situation", "Task", "Action", "Result"],
        answer: "A perfect answer lays out the critical issue context, the assigned challenge, the targeted troubleshooting actions taken, and measurable engineering outcomes.",
        difficulty: "medium"
      });
      setMessages(prev => [...prev, errMsg]);
      speak(errMsg.content);
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  // Complete evaluation logic
  const evaluateAnswer = async (userAnswer: string) => {
    if (!userAnswer.trim()) return;

    setIsEvaluating(true);
    stopTimer();
    
    // Save pacing metrics (how many seconds was the answer drafted in)
    const currentTimerVal = timerSeconds || 15;
    setPacingList(prev => [...prev, currentTimerVal]);

    const activeQuestion = customQuestion || questionsData[currentQuestionIndex];

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userAnswer,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      let endpoint = "/api/chat/evaluate";
      let payload: any = {
        selectedSubject,
        question: activeQuestion.question,
        keywords: activeQuestion.keywords,
        answer: activeQuestion.answer,
        userAnswer,
      };

      if (isSTARMode) {
        endpoint = "/api/chat/evaluate-behavioral";
        payload = {
          question: activeQuestion.question,
          userAnswer,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to evaluate answer on server");
      }

      const result = await response.json();
      setScores(prev => [...prev, result.score]);

      const botFeedback: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: `Evaluation score: ${result.score}/10.`,
        timestamp: new Date(),
        evaluation: {
          score: result.score,
          strengths: result.strengths || [],
          weaknesses: result.weaknesses || [],
          suggestions: result.suggestions || [],
          correctAnswer: result.correctAnswer || activeQuestion.answer,
          situationFeedback: result.situationFeedback,
          taskFeedback: result.taskFeedback,
          actionFeedback: result.actionFeedback,
          resultFeedback: result.resultFeedback,
        },
      };

      setMessages(prev => [...prev, botFeedback]);
      
      let voiceSummary = `You scored a ${result.score} out of 10. `;
      if (result.score >= 8) {
        voiceSummary += "Outstanding response. Highly professional articulation.";
      } else if (result.score >= 6) {
        voiceSummary += "Solid baseline. Check the breakdown report to fill in minor gaps.";
      } else {
        voiceSummary += "An area for progression. Let's practice with the model answer.";
      }
      speak(voiceSummary);

      // Adapt difficulty if we are in Drill Mode
      if (!customQuestion) {
        const avgScore = [...scores, result.score].reduce((a, b) => a + b, 0) / (scores.length + 1);
        let nextDifficulty = difficulty;
        if (avgScore > 8) nextDifficulty = 'hard';
        else if (avgScore > 6) nextDifficulty = 'medium';
        else nextDifficulty = 'easy';
        setDifficulty(nextDifficulty);

        setTimeout(() => {
          askNextQuestion(nextDifficulty);
        }, 5000);
      } else {
        // Custom Resume/Behavioral modes let user trigger a new question manually or finish session
        const completionMsg: Message = {
          id: (Date.now() + 5).toString(),
          type: 'system',
          content: "You can click 'Next Personal Question' to challenge yourself further or explore your placement score analysis in the Mastery Insights panel.",
          timestamp: new Date()
        };
        setTimeout(() => {
          setMessages(prev => [...prev, completionMsg]);
        }, 3000);
      }

    } catch (error) {
      console.error("Evaluation error:", error);
      const failMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "I received your response but hit a temporary processing bottleneck. Let's transition smoothly to the next exercise.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, failMsg]);
      speak(failMsg.content);
      if (!customQuestion) {
        setTimeout(() => {
          askNextQuestion(difficulty);
        }, 4000);
      }
    } finally {
      setIsEvaluating(false);
      setTranscript('');
    }
  };

  const askNextQuestion = (targetDifficulty: string) => {
    const subjectQuestions = questionsData.filter(q => 
      selectedSubject === 'HTML' ? (!q.subject || q.subject === 'HTML') : q.subject === selectedSubject
    );

    const availableQuestions = subjectQuestions.filter(q => 
      !messages.some(m => m.content === q.question)
    );
    
    const nextQ = availableQuestions.find(q => q.difficulty === targetDifficulty) || availableQuestions[0];

    if (nextQ) {
      const questionMsg: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: nextQ.question,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, questionMsg]);
      speak(nextQ.question);
      setCurrentQuestionIndex(questionsData.indexOf(nextQ));
    } else {
      const endMsg: Message = {
        id: Date.now().toString(),
        type: 'bot',
        content: "Outstanding! You've navigated our technical repository for this topic. Click the analytics tab to review your performance metrics.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, endMsg]);
      speak(endMsg.content);
    }
  };

  const loadNextCustomQuestion = async () => {
    setIsGeneratingQuestion(true);
    const progressMsg: Message = {
      id: Date.now().toString(),
      type: 'bot',
      content: `Synthesizing another deep dive scenario matching your profile...`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, progressMsg]);

    try {
      if (isSTARMode) {
        const response = await fetch("/api/chat/generate-behavioral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobTitle: targetJobTitle })
        });
        const data = await response.json();
        const nextQ: Question = {
          id: 8000 + Math.floor(Math.random() * 1000),
          question: data.question,
          keywords: data.keywords,
          answer: data.answer,
          difficulty: "medium",
          subject: "STAR Behavioral"
        };
        setCustomQuestion(nextQ);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          type: 'bot',
          content: nextQ.question,
          timestamp: new Date()
        }]);
        speak(nextQ.question);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleSend = () => {
    if (transcript.trim()) {
      evaluateAnswer(transcript);
    }
  };

  const changeSubject = () => {
    setIsInterviewStarted(false);
    setSelectedSubject(null);
    setMessages([]);
    setScores([]);
    setPacingList([]);
    setDifficulty('easy');
    setCustomQuestion(null);
    setIsSTARMode(false);
  };

  // Pacing Calculation
  const getAveragePacing = () => {
    if (pacingList.length === 0) return 0;
    return Math.round(pacingList.reduce((a, b) => a + b, 0) / pacingList.length);
  };

  const getPacingRating = () => {
    const avg = getAveragePacing();
    if (avg === 0) return { label: 'Awaiting answer', color: 'text-slate-400' };
    if (avg < 15) return { label: 'Fast (Brief answers)', color: 'text-amber-500' };
    if (avg > 75) return { label: 'Deliberate (Detailed)', color: 'text-sky-500' };
    return { label: 'Optimal Pace', color: 'text-emerald-500' };
  };

  // Export Transcript Utility
  const handleExportTranscript = () => {
    let output = `=====================================================\n`;
    output += `       AI INTERVIEW PLATFORM - PREPARATION REPORT     \n`;
    output += `=====================================================\n`;
    output += `Subject/Domain: ${selectedSubject || 'Custom Session'}\n`;
    output += `Average Score: ${(scores.reduce((a,b)=>a+b, 0) / (scores.length || 1)).toFixed(1)} / 10\n`;
    output += `Date: ${new Date().toLocaleDateString()}\n\n`;

    messages.forEach((m, idx) => {
      const typeLabel = m.type === 'bot' ? 'INTERVIEWER' : m.type === 'user' ? 'YOU' : 'SYSTEM';
      output += `[${typeLabel}] (${m.timestamp.toLocaleTimeString()})\n${m.content}\n`;
      if (m.evaluation) {
        output += `-----------------------------------------------------\n`;
        output += `SCORE: ${m.evaluation.score}/10\n`;
        output += `STRENGTHS:\n${m.evaluation.strengths.map(s => `  * ${s}`).join('\n')}\n`;
        output += `WEAKNESSES:\n${m.evaluation.weaknesses.map(w => `  * ${w}`).join('\n')}\n`;
        output += `SUGGESTIONS:\n${m.evaluation.suggestions.map(s => `  * ${s}`).join('\n')}\n`;
        output += `MODEL ANSWER REFERENCE:\n${m.evaluation.correctAnswer}\n`;
        output += `-----------------------------------------------------\n`;
      }
      output += `\n`;
    });

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Interview_Scorecard_${selectedSubject || 'Session'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans selection:bg-blue-100 flex flex-col">
      {/* Top Professional Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/10">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-slate-800">SkillVantage AI</h1>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">v2.1 PRO</span>
            </div>
            <p className="text-xs text-slate-400">Adaptive Placement & Technical Interview Simulator</p>
          </div>
        </div>

        {/* Dynamic Mode Tabs for Navigation (Only visible when not actively in an interview screen or in dashboard tab) */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          <button
            onClick={() => { setActiveTab('standard'); if(!isInterviewStarted) changeSubject(); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'standard' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            Subject Drill
          </button>
          <button
            onClick={() => { setActiveTab('behavioral'); if(!isInterviewStarted) changeSubject(); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'behavioral' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            STAR Behavioral
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1",
              activeTab === 'dashboard' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <BarChart3 size={13} />
            Analytics
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setVoiceFeedbackEnabled(!voiceFeedbackEnabled)}
            className={cn(
              "p-2.5 rounded-xl border transition-all flex items-center justify-center",
              voiceFeedbackEnabled ? "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100" : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
            )}
            title={voiceFeedbackEnabled ? "Mute AI voice readback" : "Enable AI voice readback"}
          >
            {voiceFeedbackEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          {isInterviewStarted && (
            <button 
              onClick={changeSubject}
              className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-600 px-3.5 py-2 rounded-xl transition-colors"
            >
              <ArrowLeft size={14} />
              <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Exit Session</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 flex flex-col min-h-0">
        
        {/* Active Interview Panel */}
        {isInterviewStarted ? (
          <div className="flex-1 flex flex-col h-full bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100 overflow-hidden">
            {/* Session stats sub-bar */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-3.5 flex items-center justify-between flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                  <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />
                  Live Assessment: {selectedSubject}
                </span>
                {!customQuestion && (
                  <span className="bg-slate-200/60 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Adaptive Difficulty: {difficulty}
                  </span>
                )}
                {isSTARMode && (
                  <span className="bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    STAR Model ACTIVE
                  </span>
                )}
              </div>

              {/* Dynamic timer & pace counters */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Timer size={14} className="text-blue-500 animate-pulse" />
                  <span>Response Timer: <strong className="font-mono text-slate-800 text-sm">{timerSeconds}s</strong></span>
                </div>
                {scores.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Award size={14} className="text-emerald-500" />
                    <span>Avg Score: <strong className="text-emerald-600 font-bold">{Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 10) / 10}/10</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 pb-36">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4 max-w-[85%] transition-all",
                      msg.type === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm",
                      msg.type === 'bot' ? "bg-blue-600 text-white" : msg.type === 'system' ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-600"
                    )}>
                      {msg.type === 'bot' ? <Bot size={20} /> : msg.type === 'system' ? <Info size={16} /> : <User size={20} />}
                    </div>

                    <div className="space-y-3 w-full">
                      <div className={cn(
                        "p-5 rounded-2xl text-[15px] leading-relaxed shadow-sm border",
                        msg.type === 'bot' 
                          ? "bg-slate-50 border-slate-100 text-slate-800" 
                          : msg.type === 'system'
                          ? "bg-amber-50 border-amber-100/50 text-amber-800 text-xs italic font-medium"
                          : "bg-blue-600 border-blue-500 text-white"
                      )}>
                        {msg.content}
                      </div>

                      {/* Score Evaluation Subpanel */}
                      {msg.evaluation && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-slate-50/70 border border-slate-100 rounded-2xl p-6 space-y-6 shadow-sm mt-3"
                        >
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3.5">
                            <div className="flex items-center gap-2">
                              <Sparkle size={14} className="text-blue-600" />
                              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">AI Evaluation Report</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-blue-600 px-3 py-1 rounded-full text-white font-black text-xs">
                              <Gauge size={13} />
                              <span>Score: {msg.evaluation.score}/10</span>
                            </div>
                          </div>

                          {/* STAR METHODOLOGY FEEDBACK REPORT */}
                          {isSTARMode && (msg.evaluation.situationFeedback || msg.evaluation.taskFeedback) && (
                            <div className="space-y-3 bg-purple-50/50 border border-purple-100/50 p-4 rounded-xl">
                              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-purple-700 flex items-center gap-1.5">
                                <Layers size={13} /> STAR Methodology Breakdown
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div className="space-y-1">
                                  <span className="font-black text-purple-600 uppercase tracking-widest text-[9px] block">S - Situation</span>
                                  <p className="text-slate-600 leading-relaxed">{msg.evaluation.situationFeedback || "Evaluating context setup..."}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="font-black text-purple-600 uppercase tracking-widest text-[9px] block">T - Task</span>
                                  <p className="text-slate-600 leading-relaxed">{msg.evaluation.taskFeedback || "Evaluating defined challenge..."}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="font-black text-purple-600 uppercase tracking-widest text-[9px] block">A - Action</span>
                                  <p className="text-slate-600 leading-relaxed">{msg.evaluation.actionFeedback || "Evaluating strategic action steps..."}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="font-black text-purple-600 uppercase tracking-widest text-[9px] block">R - Result</span>
                                  <p className="text-slate-600 leading-relaxed">{msg.evaluation.resultFeedback || "Evaluating measurable business outcomes..."}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                            <div className="space-y-2.5">
                              <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                                <CheckCircle2 size={13} /> Key Strengths
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-2">
                                {msg.evaluation.strengths.length > 0 ? (
                                  msg.evaluation.strengths.map((s, i) => <li key={i} className="flex gap-2 font-medium"><span>•</span> {s}</li>)
                                ) : (
                                  <li className="italic text-slate-400">Analyzed baseline parameters successfully.</li>
                                )}
                              </ul>
                            </div>
                            <div className="space-y-2.5">
                              <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                                <AlertCircle size={13} /> Improvement Areas
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-2">
                                {msg.evaluation.weaknesses.length > 0 ? (
                                  msg.evaluation.weaknesses.map((w, i) => <li key={i} className="flex gap-2 font-medium"><span>•</span> {w}</li>)
                                ) : (
                                  <li className="italic text-slate-400">Excellent delivery. No critical improvement points found.</li>
                                )}
                              </ul>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-200/60">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Model Reference / Guidance Outline</h4>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed italic bg-slate-100/50 p-3.5 rounded-xl border border-slate-200/30">
                              "{msg.evaluation.correctAnswer}"
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-200/40 flex justify-between items-center text-[10px] text-slate-400 font-medium">
                            <span>Evaluated by Gemini AI in Real-time</span>
                            <div className="flex gap-2">
                              {msg.evaluation.suggestions.slice(0, 2).map((sug, sIdx) => (
                                <span key={sIdx} className="bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-500">{sug}</span>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Loader placeholder */}
              {isEvaluating && (
                <div className="flex gap-4 items-center mr-auto bg-slate-50 p-5 rounded-2xl border border-slate-100 max-w-[50%] animate-pulse">
                  <RefreshCw className="animate-spin text-blue-600" size={18} />
                  <span className="text-xs font-semibold text-slate-500">Gemini scoring engine running detailed analysis...</span>
                </div>
              )}

              {/* Manual Question Loaders for Custom Modes */}
              {isInterviewStarted && customQuestion && messages.length > 2 && !isEvaluating && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3 justify-center items-center py-6"
                >
                  <button
                    onClick={loadNextCustomQuestion}
                    disabled={isGeneratingQuestion}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-blue-500/10 transition-colors"
                  >
                    {isGeneratingQuestion ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                    Next Dynamic Question
                  </button>
                  <button
                    onClick={handleExportTranscript}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-200 transition-colors"
                  >
                    <Download size={14} />
                    Download Session Log
                  </button>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Fixed Bottom Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent border-t border-slate-100">
              <div className="max-w-4xl mx-auto w-full">
                <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl p-2.5 flex items-center gap-3">
                  <button
                    onClick={toggleRecording}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                      isRecording ? "bg-rose-500 text-white animate-pulse" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                    )}
                    title={isRecording ? "Stop recording speech" : "Record voice answer"}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  
                  <div className="flex-1 px-2">
                    {isRecording ? (
                      <div className="flex items-center gap-3">
                        <div className="flex gap-0.5 items-center">
                          {[1,2,3,4,5].map(i => (
                            <motion.div
                              key={i}
                              animate={{ height: [8, 20, 8] }}
                              transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                              className="w-0.75 bg-blue-500 rounded-full"
                            />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400 font-semibold italic truncate">
                          {transcript || "Listening to your answer... Click mic or submit to analyze."}
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Speak or type your interview response here..."
                        className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm text-slate-700 font-semibold placeholder:text-slate-300"
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      />
                    )}
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={isEvaluating || !transcript.trim()}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                      transcript.trim() && !isEvaluating ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "bg-slate-50 text-slate-200 cursor-not-allowed"
                    )}
                  >
                    {isEvaluating ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
                
                <div className="mt-2.5 flex justify-center gap-6 text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Volume2 size={13} className="text-slate-300" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Voice Readback: {voiceFeedbackEnabled ? 'ACTIVE' : 'MUTED'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-400 animate-bounce" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Optimal response length: ~45-90s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'dashboard' ? (
          /* PERSISTENT PERFORMANCE ANALYTICS DASHBOARD */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 pb-12"
          >
            {/* Upper grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Mastery Gauge */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col items-center justify-center text-center">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-6">Overall Interview score</h3>
                <div className="relative flex items-center justify-center mb-4">
                  {/* Gauge Ring */}
                  <svg className="w-36 h-36">
                    <circle className="text-slate-100" strokeWidth="12" stroke="currentColor" fill="transparent" r="58" cx="72" cy="72"/>
                    <circle 
                      className="text-blue-600" 
                      strokeWidth="12" 
                      strokeDasharray={364} 
                      strokeDashoffset={364 - (364 * (scores.length > 0 ? scores.reduce((a,b)=>a+b,0) / scores.length : 0)) / 10} 
                      strokeLinecap="round" 
                      stroke="currentColor" 
                      fill="transparent" 
                      r="58" 
                      cx="72" 
                      cy="72"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-black text-slate-800">
                      {scores.length > 0 ? (scores.reduce((a,b)=>a+b,0) / scores.length).toFixed(1) : "0.0"}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">out of 10</span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-semibold leading-relaxed">
                  {scores.length === 0 ? "Awaiting your first practice responses." : scores.length < 3 ? "Progressing nicely. Submit 3+ answers for optimal calibration." : "Keep iterating on improvements to unlock top placements."}
                </span>
              </div>

              {/* Progress Tracker Card */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Preparation Volume</h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
                      <span>Questions Answered</span>
                      <span>{scores.length} / 12 (Target)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (scores.length / 12) * 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
                      <span>Optimal Pacing Ratio</span>
                      <span>{getPacingRating().label}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: pacingList.length > 0 ? '80%' : '0%' }} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><Compass size={13} className="text-indigo-500" /> Career Readiness:</span>
                    <span className={cn(scores.length >= 6 ? "text-emerald-600" : "text-amber-500")}>
                      {scores.length >= 6 ? "High (Ready)" : "Developing baseline"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Placement Badges / Achievements */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Placement Credentials</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", scores.length > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-300")}>
                        <Award size={18} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">First Response</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{scores.length > 0 ? "Unlocked" : "Locked"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", (scores.length >= 3 && (scores.reduce((a,b)=>a+b,0) / scores.length) >= 7.5) ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-300")}>
                        <Sparkle size={18} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Technical Champion (Avg {'>'} 7.5)</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{(scores.length >= 3 && (scores.reduce((a,b)=>a+b,0) / scores.length) >= 7.5) ? "Unlocked" : "Locked"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", pacingList.length >= 3 ? "bg-purple-50 text-purple-600" : "bg-slate-100 text-slate-300")}>
                        <Zap size={18} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Optimal Pacing Veteran</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{pacingList.length >= 3 ? "Unlocked" : "Locked"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => { setActiveTab('standard'); changeSubject(); }}
                    className="w-full text-center text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700"
                  >
                    Launch Practice Mode
                  </button>
                </div>
              </div>
            </div>

            {/* Historical feedback insights */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Improvement Roadmap</h3>
              <div className="space-y-3">
                {scores.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 space-y-2">
                    <HelpCircle size={32} className="mx-auto opacity-30" />
                    <p className="text-xs font-semibold">Complete your first interview to generate an actionable preparation roadmap.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Based on your {scores.length} practiced questions, our AI Placement Assistant recommends focusing on the following areas to stand out to industry managers:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 block">Identified Strengths</span>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                          Excellent baseline structures. General answers demonstrate a good command of terminology and keyword coverage.
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2 block">Actionable Checklist</span>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                          Expand responses with precise architectural keywords. Ensure behavioral scenarios detail quantitative metrics ("increased load speed by 25%").
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          /* WELCOME HOMEPAGE SCREEN - WITH MODE SELECTION */
          <div className="space-y-12 py-6">
            
            {/* Mode selection toggle block for simple mobile viewing */}
            <div className="flex md:hidden items-center justify-center bg-slate-100 p-1 rounded-xl w-full max-w-sm mx-auto mb-6">
              <button
                onClick={() => setActiveTab('standard')}
                className={cn("flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all", activeTab === 'standard' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
              >
                Subject Drill
              </button>
              <button
                onClick={() => setActiveTab('behavioral')}
                className={cn("flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all", activeTab === 'behavioral' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
              >
                Behavioral
              </button>
            </div>

            {/* Mode A: STANDARD SUBJECT DRILL HOME */}
            {activeTab === 'standard' && (
              <div className="space-y-12">
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center space-y-4 max-w-2xl mx-auto"
                >
                  <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-2">
                    <Sparkles size={13} /> Multi-Subject Technical Simulator
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
                    Drill core placement <span className="text-blue-600">concepts.</span>
                  </h2>
                  <p className="text-slate-500 text-base font-medium leading-relaxed">
                    Practice with over 200+ carefully cataloged technical interview challenges. Adaptive scoring recalibrates difficulty from Easy to Hard based on your performance.
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl mx-auto">
                  {SUBJECTS.map((subject) => (
                    <motion.button
                      key={subject.id}
                      whileHover={{ scale: 1.01, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => startStandardInterview(subject.id)}
                      className="group relative bg-white p-7 rounded-3xl border border-slate-200 text-left shadow-sm hover:shadow-lg hover:border-blue-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors group-hover:bg-blue-600 group-hover:text-white",
                          subject.color === 'blue' && "bg-blue-50 text-blue-600",
                          subject.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                          subject.color === 'sky' && "bg-sky-50 text-sky-600",
                          subject.color === 'cyan' && "bg-cyan-50 text-cyan-600",
                          subject.color === 'purple' && "bg-purple-50 text-purple-600",
                          subject.color === 'rose' && "bg-rose-50 text-rose-600",
                          subject.color === 'amber' && "bg-amber-50 text-amber-600",
                          subject.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                          subject.color === 'orange' && "bg-orange-50 text-orange-600"
                        )}>
                          <subject.icon size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{subject.name}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4">
                          {subject.desc}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 w-full text-xs font-bold">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Drill Mode</span>
                        <span className="text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Start Session <ChevronRight size={14} />
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Mode C: STAR BEHAVIORAL TRAINER */}
            {activeTab === 'behavioral' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-slate-200/80 shadow-md space-y-6"
              >
                <div className="space-y-2 text-center">
                  <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    <Brain size={13} /> Behavioral STAR Coach
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">Behavioral Scenario Prep</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Most companies evaluate behavioral fit using the structured **STAR model**. Tell us your target position, and we will formulate scenario challenges that score your ability to articulate clear situations, actions, and quantitative results.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* One-Click AI/ML Role Quick Select */}
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Brain size={12} className="text-purple-600 animate-pulse" /> Select specialized AI/ML STAR tracks
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetJobTitle("Machine Learning Engineer")}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1"
                      >
                        <Brain size={11} className="text-rose-500" /> ML Engineer
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetJobTitle("Generative AI Developer")}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1"
                      >
                        <Sparkles size={11} className="text-amber-500" /> GenAI Dev
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetJobTitle("AI Product Manager")}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1"
                      >
                        <Compass size={11} className="text-blue-500" /> AI PM
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Professional Title</label>
                    <input 
                      type="text" 
                      value={targetJobTitle} 
                      onChange={(e) => setTargetJobTitle(e.target.value)}
                      placeholder="e.g. Software Engineer / Product Manager"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-100 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                      <Layers size={13} /> STAR Structure Reference
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-[10px] font-semibold text-slate-500">
                      <div>
                        <strong className="text-slate-700 block mb-0.5">S - Situation</strong> Describe context and background scenario.
                      </div>
                      <div>
                        <strong className="text-slate-700 block mb-0.5">T - Task</strong> Define the critical responsibility or challenge.
                      </div>
                      <div>
                        <strong className="text-slate-700 block mb-0.5">A - Action</strong> Detail strategic technical action steps you drove.
                      </div>
                      <div>
                        <strong className="text-slate-700 block mb-0.5">R - Result</strong> Detail quantifiable metrics and achievements.
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={startBehavioralInterview}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-purple-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Play size={14} />
                    Begin STAR Behavioral Session
                  </button>
                </div>
              </motion.div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
