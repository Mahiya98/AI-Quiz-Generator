// ============ CONFIG ============
// Your Google Sheet (the questions one)
const SHEET_ID = "1kY_5uis5_tWyPG8-fCDwgZKO7CvXcidJ-Dq7pVOG7ZY";
const SHEET_GID = "0";
const QUESTIONS_CSV_URL =
  `https://docs.google.com/spreadsheets/d/e/2PACX-1vSQfIW4RYZwilCYUEMzuWYuAruHlMxxT3HUqlqg2Vyamv7xf4_1ZxXi1exsX1Tw8YqKjNh7ShA5NzIz/pub?gid=96178082&single=true&output=csv`;

// 👇 PASTE YOUR DEPLOYED APPS SCRIPT WEB APP URL HERE
const RESULTS_WEBAPP_URL = "https://script.google.com/a/macros/akijresource.com/s/AKfycbwNuZ4IIcJ6obZ2EG0mzaZEFaqAn5rIjyRBvXWT_l_uQKGOPjVP4y_Rlv1mf_y7iNGt/exec";

// Google Sheet view link (for the "Download" button — opens results sheet)
// 👇 Replace with YOUR results sheet ID (the one your Apps Script writes to)
const RESULTS_SHEET_ID = "1kY_5uis5_tWyPG8-fCDwgZKO7CvXcidJ-Dq7pVOG7ZY";
const RESULTS_DOWNLOAD_URL =
  `https://docs.google.com/spreadsheets/d/${RESULTS_SHEET_ID}/export?format=xlsx`;

const TOTAL_QUESTIONS = 10;

// ============ STATE ============
let state = {
  userName: "",
  userId: "",
  allQuestions: [],
  questions: [],
  current: 0,
  score: 0,
  timer: null,
  timeLeft: 60,
  answered: false,
};

// ============ HELPERS ============
const $ = (id) => document.getElementById(id);
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(id).classList.add("active");
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============ INIT ============
window.addEventListener("DOMContentLoaded", () => {
  $("startBtn").addEventListener("click", handleStart);
  $("nextBtn").addEventListener("click", handleNext);
  $("tryAgainBtn").addEventListener("click", () => {
    resetQuiz();
    showPage("page-user");
  });
  $("downloadBtn").addEventListener("click", () => {
    window.open(RESULTS_DOWNLOAD_URL, "_blank");
  });
});

// ============ PAGE 1: START ============
async function handleStart() {
  const name = $("userName").value.trim();
  const id = $("userId").value.trim();
  if (!name || !id) { alert("Please enter both your Name and ID."); return; }

  state.userName = name;
  state.userId = id;

  $("loading").classList.remove("hidden");
  $("startBtn").disabled = true;

  try {
    const allQs = await fetchQuestionsFromSheet();
    if (allQs.length === 0) throw new Error("No questions found in sheet.");

    // Shuffle and pick 10 (or all if less than 10)
    const shuffled = shuffle(allQs);
    state.questions = shuffled.slice(0, Math.min(TOTAL_QUESTIONS, shuffled.length));
    state.current = 0;
    state.score = 0;

    showPage("page-quiz");
    renderQuestion();
  } catch (err) {
    alert("Failed to load questions: " + err.message +
      "\n\nMake sure the sheet is shared as 'Anyone with the link → Viewer'.");
  } finally {
    $("loading").classList.add("hidden");
    $("startBtn").disabled = false;
  }
}

// ============ FETCH QUESTIONS FROM GOOGLE SHEET ============
async function fetchQuestionsFromSheet() {
  const res = await fetch(QUESTIONS_CSV_URL);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const csv = await res.text();
  return parseSheetCSV(csv);
}

// Simple CSV parser that handles quoted multi-line cells
function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ""; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// Parse the sheet structure:
// Col A = Serial, Col B = Question, Col C = "A. ...\nB. ...\nC. ...\nD. ...\n\nউত্তর: C"
function parseSheetCSV(csv) {
  const rows = parseCSV(csv);
  const questions = [];

  // Skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;

    const questionText = (r[1] || "").trim();
    const optionsBlock = (r[2] || "").trim();
    if (!questionText || !optionsBlock) continue;

    const lines = optionsBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const options = [];
    let answerLetter = "";

    for (const line of lines) {
      // Match option lines like "A. something" or "A) something"
      const optMatch = line.match(/^([A-D])[\.\)]\s*(.+)$/);
      if (optMatch) {
        options.push({ letter: optMatch[1], text: optMatch[2].trim() });
        continue;
      }
      // Match the answer line — supports "উত্তর: C", "Answer: C", "Ans: C"
      const ansMatch = line.match(/(?:উত্তর|Answer|Ans)\s*[:：]\s*([A-D])/i);
      if (ansMatch) {
        answerLetter = ansMatch[1].toUpperCase();
      }
    }

    if (options.length < 2 || !answerLetter) continue;

    const correctOpt = options.find(o => o.letter === answerLetter);
    if (!correctOpt) continue;

    questions.push({
      question: questionText,
      options: options.map(o => o.text),
      answer: correctOpt.text,
    });
  }
  return questions;
}

// ============ QUIZ PAGE ============
function renderQuestion() {
  const q = state.questions[state.current];
  state.answered = false;

  $("qProgress").textContent = `Question ${state.current + 1}/${state.questions.length}`;
  $("quizHeader").textContent = `Hello ${state.userName} — Good luck!`;
  $("questionText").textContent = q.question;

  const isLast = state.current === state.questions.length - 1;
  $("nextBtn").textContent = isLast ? "Finish Quiz" : "Next Question";

  const optsBox = $("options");
  optsBox.innerHTML = "";
  // Shuffle the options too so order varies
  shuffle(q.options).forEach(opt => {
    const div = document.createElement("div");
    div.className = "option";
    div.textContent = opt;
    div.onclick = () => selectOption(div, opt, q.answer);
    optsBox.appendChild(div);
  });

  startTimer();
}

function selectOption(el, chosen, correct) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);

  document.querySelectorAll(".option").forEach(o => {
    o.classList.add("disabled");
    if (o.textContent === correct) o.classList.add("correct");
    else if (o === el) o.classList.add("wrong");
  });

  if (chosen === correct) state.score++;
}

function startTimer() {
  state.timeLeft = 60;
  $("timer").textContent = "01:00";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;
    const m = String(Math.floor(state.timeLeft / 60)).padStart(2, "0");
    const s = String(state.timeLeft % 60).padStart(2, "0");
    $("timer").textContent = `${m}:${s}`;
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      const q = state.questions[state.current];
      if (!state.answered) {
        state.answered = true;
        document.querySelectorAll(".option").forEach(o => {
          o.classList.add("disabled");
          if (o.textContent === q.answer) o.classList.add("correct");
        });
      }
    }
  }, 1000);
}

function handleNext() {
  if (!state.answered) {
    if (!confirm("You haven't answered this question. Skip it?")) return;
  }
  if (state.current < state.questions.length - 1) {
    state.current++;
    renderQuestion();
  } else {
    clearInterval(state.timer);
    showResults();
  }
}

// ============ RESULTS PAGE ============
async function showResults() {
  const total = state.questions.length;
  const score = state.score;
  $("scoreText").textContent = `${score}/${total}`;
  $("userInfoLine").textContent = `${state.userName} (ID: ${state.userId})`;

  const pct = score / total;
  let msg;
  if (pct === 1) msg = "Perfect Score! You're a wizard! 🧙";
  else if (pct >= 0.8) msg = "Excellent! Almost perfect! ✨";
  else if (pct >= 0.6) msg = "Great job! Keep going! 🌟";
  else if (pct >= 0.4) msg = "Not bad — practice makes perfect! 💪";
  else msg = "Keep learning, you'll get there! 📚";
  $("scoreMsg").textContent = msg;

  showPage("page-result");

  // Save to Google Sheet via Apps Script
  saveResultToSheet({
    name: state.userName,
    id: state.userId,
    score: score,
    total: total,
    timestamp: new Date().toISOString(),
  });
}

async function saveResultToSheet(payload) {
  if (!RESULTS_WEBAPP_URL || RESULTS_WEBAPP_URL.startsWith("PASTE")) {
    console.warn("Results web app URL not configured — skipping save.");
    return;
  }
  try {
    // Use no-cors so the browser doesn't block the request to Apps Script
    await fetch(RESULTS_WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Failed to save result:", err);
  }
}

function resetQuiz() {
  state.questions = [];
  state.current = 0;
  state.score = 0;
  clearInterval(state.timer);
}
