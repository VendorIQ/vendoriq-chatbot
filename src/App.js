import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

const supplierId = "SUP123";
const supplierEmail = "abc@vendor.com";

const questions = [
  {
    text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    weight: { Yes: 10, No: 5 },
    requirements: [
      "A copy of the OHS Policy",
      "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards)"
    ],
    consequence: "Consider obtaining ISO 9001 for better market compliance."
  },
  {
    text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
    weight: { Yes: 10, No: 0 },
    requirements: [
      "A declaration from your top management that your company has not committed any infringements to the laws or regulations or is not under any current investigation by any regulatory authority in respect of any OHS matters (Statement should be signed off by CEO with official letterhead, stamp, etc.)",
      "A copy of the documented process or the systematic identification and assessment of legal applicable laws and regulations (i.e. procedure, instruction)",
      "A list of all OHS requirements including laws and regulations that the Company has identified as applicable",
      "A report of the legal compliance check conducted within the last twelve (12) months and corrective action plan to close any gaps identified"
    ],
    consequence: "Failure to comply this, Supplier will be direcly failed the assessment"
  },
  {
    text: "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
    weight: { Yes: 10, No: 0 },
    requirements: [
      "A copy of the documented process (i.e. procedure, instruction)",
      "Evidence of how the process has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards)",
      "Evidence of investigations, identified root causes and action plans for incidents and near misses (i.e. investigation reports) (excluding personal identifiable information)",
      "Records if the Company had any work-related fatality and/or incidents (internal employee, sub-contractors, or external party) that caused permanent disability or absence of over thirty (30) days in the last three (03) years. Evidence requested includes; 1. If yes, the Company must provide the investigation report/s, and corrective action plans to prevent re-occurrence, including a status report on the corrective actions. 2. If not, the Company must provide a declaration from its top management that there has not been any work-related fatality and/or incident that caused permanent disability or absence of over thirty (30) days in the last three (03) years.",
      "Last three (03) years statistics including incidents, near misses, fatalities, work related illness"
    ],
    consequence: "Failure to comply this, Supplier will be direcly failed the assessment"
  }
];

function App() {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
  ]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [uploadInputs, setUploadInputs] = useState([]);
  const [uploadFiles, setUploadFiles] = useState({});
  const [reportFeedback, setReportFeedback] = useState([]);
  const [showRestart, setShowRestart] = useState(false);
  const chatBottomRef = useRef(null);

  // Smooth scroll to latest message
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingBuffer, uploadInputs, disqualified]);

  // Type out next bot question if appropriate
  useEffect(() => {
    if (typing || disqualified || step >= questions.length) return;
    // If just started, after welcome message, show first question
    if (step < questions.length && !messages.some(m => m.text === questions[step].text)) {
      startTyping(questions[step].text);
    }
  }, [step, typing, disqualified, messages]);

  // Typing effect
  const startTyping = (text, delay = 12) => {
    setTyping(true);
    setTypingBuffer("");
    let index = 0;
    const interval = setInterval(() => {
      setTypingBuffer(text.slice(0, index + 1));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
        setTyping(false);
        setMessages(prev => [...prev, { from: "bot", text }]);
        setTypingBuffer("");
      }
    }, delay);
  };

  // Handle answer click
  const handleAnswer = async (answer) => {
    setMessages(prev => [...prev, { from: "user", text: answer }]);
    const current = questions[step];
    const points = current.weight[answer];

    // Save answer to DB (optional, comment if not needed)
    await supabase.from("responses").insert({
      supplier_email: supplierEmail,
      question_index: step,
      answer,
      score: points
    });

    if (answer === "No" && points === 0) {
      // Disqualify immediately
      setMessages(prev => [
        ...prev,
        { from: "bot", text: `❌ Disqualified: ${current.consequence}` }
      ]);
      setDisqualified(true);
      setShowRestart(true);
      setReportFeedback(prev => [
        ...prev,
        `Q${step + 1}: ❌ Disqualified - ${current.consequence}`
      ]);
      return;
    }

    setReportFeedback(prev => [
      ...prev,
      `Q${step + 1}: ${answer} - ${answer === "Yes" ? "Good. Please upload all required documents." : current.con
