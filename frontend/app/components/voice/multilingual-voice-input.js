"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Languages, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-PK", label: "Urdu" },
];

function getRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function MultilingualVoiceInput({
  title = "Voice Input",
  description = "Capture speech in your language",
  onTranscript,
  className = "",
}) {
  const recognitionRef = useRef(null);
  const [language, setLanguage] = useState("en-IN");
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");

  const isSupported = useMemo(() => Boolean(getRecognitionConstructor()), []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  function startListening() {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      toast.error("Voice unavailable", {
        description: "Speech recognition is not supported in this browser.",
      });
      return;
    }

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let partial = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        partial += event.results[i][0].transcript;
      }

      const cleaned = partial.trim();
      if (!cleaned) return;

      setLastTranscript(cleaned);
      onTranscript(cleaned);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === "aborted") return;
      toast.error("Voice input failed", {
        description: event.error || "Could not process speech.",
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{description}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
          <Languages size={12} />
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="bg-transparent outline-none"
            disabled={isListening}
          >
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={isListening ? stopListening : startListening}
          disabled={!isSupported}
          variant={isListening ? "outline" : "default"}
          className={
            isListening
              ? "border-emerald-600 text-emerald-800 hover:bg-emerald-50"
              : "bg-emerald-700 text-white hover:bg-emerald-600"
          }
        >
          {isListening ? <MicOff size={13} /> : <Mic size={13} />}
          {isListening ? "Stop Voice" : "Start Voice"}
        </Button>

        {!isSupported ? (
          <p className="text-xs text-slate-600">
            Browser does not support voice input.
          </p>
        ) : null}
      </div>

      {lastTranscript ? (
        <p className="mt-2 text-xs text-slate-600">
          Last transcript: <span className="font-medium text-slate-800">{lastTranscript}</span>
        </p>
      ) : null}
    </div>
  );
}
