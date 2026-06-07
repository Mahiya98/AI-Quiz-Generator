// ====== STATE ======
let state = {
  apiKey: localStorage.getItem("geminiApiKey") || "",
  topic: "",
  difficulty: "Intermediate",
  model: "gemini-2.5-flash",
  numQ: 5,
  questions: [],
  current: 0,
  score: 0,
  timer: null,
  timeLeft: 60,
  answered: false,
};

// ====== HELPERS ======
const $ = (id) => document.getElementById(id);
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(id).classList.add("active");
}

// ====== INIT ======
window.addEventListener("DOMContentLoaded", () => {
  if (state.apiKey) {
    $("apiKey").value = state.apiKey;
  }

  $("unlockBtn").addEventListener("click", handleUnlock);
  $("generateBtn").addEventListener("click", handleGenerate);
  $("changeKeyBtn").addEventListener("click", () => showPage("page-api"));
  $("nextBtn").addEventListener("click", handleNext);
  $("tryAgainBtn").addEventListener("click", () => {
    resetQuiz();
    showPage("page-create");
  });
});

// ====== PAGE 1: UNLOCK ======
function handleUnlock() {
  const key = $("apiKey").value.trim();
  if (!key) { alert("Please enter your Gemini API key."); return; }
  state.apiKey = key;
  localStorage.setItem("geminiApiKey", key);
  showPage("page-create");
}

// ====== PAGE 2: GENERATE ======
async function handleGenerate() {
  const topic = $("topic").value.trim();
  if (!topic) { alert("Please enter a topic."); return; }

  state.topic = topic;
  state.difficulty = $("difficulty").value;
  state.model = $("model").value;
  state.numQ = parseInt($("numQ").value);

  $("loading").classList.remove("hidden");
  $("generateBtn").disabled = true;

  try {
    const questions = await generateQuiz();
    state.questions = questions;
    state.current = 0;
    state.score = 0;
    showPage("page-quiz");
    renderQuestion();
  } catch (err) {
    alert("Failed to generate quiz: " + err.message);
  } finally {
    $("loading").classList.add("hidden");
    $("generateBtn").disabled = false;
  }
}

// ====== GEMINI API CALL ======
async function generateQuiz() {
  const prompt = `Generate exactly ${state.numQ} multiple-choice quiz questions on the topic "${state.topic}" with difficulty: ${state.difficulty}.
Return ONLY a valid JSON array (no markdown, no explanation outside JSON) of objects with this shape:
[
  {
    "question": "string",
    "options": ["opt1","opt2","opt3","opt4"],
    "answer": "the exact correct option string",
    "explanation": "short helpful explanation"
  }
]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // Clean any stray markdown fences
  text = text.replace(/```json|```/g, "").trim();

  const questions = JSON.parse(text);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Invalid response from Gemini");
  }
  return questions;
}

// ====== PAGE 3: QUIZ ======
function renderQuestion() {
  const q = state.questions[state.current];
  state.answered = false;

  $("qProgress").textContent = `Question ${state.current + 1}/${state.questions.length}`;
  $("quizHeader").textContent = `${state.topic} Quiz`;
  $("questionText").textContent = q.question;
  $("explanation").classList.add("hidden");
  $("explanation").textContent = q.explanation || "";

  const isLast = state.current === state.questions.length - 1;
  $("nextBtn").textContent = isLast ? "Finish Quiz" : "Next Question";

  const optsBox = $("options");
  optsBox.innerHTML = "";
  q.options.forEach(opt => {
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
  $("explanation").classList.remove("hidden");
}

function startTimer() {
  state.timeLeft = 60;
  $("timer").textContent = "01:00";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;
    const m = String(Math.floor(state.timeLeft / 60)).padStart(2,"0");
    const s = String(state.timeLeft % 60).padStart(2,"0");
    $("timer").textContent = `${m}:${s}`;
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      const q = state.questions[state.current];
      // auto-reveal
      if (!state.answered) {
        state.answered = true;
        document.querySelectorAll(".option").forEach(o => {
          o.classList.add("disabled");
          if (o.textContent === q.answer) o.classList.add("correct");
        });
        $("explanation").classList.remove("hidden");
      }
    }
  }, 1000);
}

function handleNext() {
  if (state.current < state.questions.length - 1) {
    state.current++;
    renderQuestion();
  } else {
    clearInterval(state.timer);
    showResults();
  }
}

// ====== PAGE 4: RESULTS ======
function showResults() {
  const total = state.questions.length;
  const score = state.score;
  $("scoreText").textContent = `${score}/${total}`;

  let msg;
  const pct = score / total;
  if (pct === 1) msg = "Perfect Score! You're a wizard! 🧙‍♂️";
  else if (pct >= 0.8) msg = "Excellent! Almost perfect! ✨";
  else if (pct >= 0.6) msg = "Great job! Keep going! 🌟";
  else if (pct >= 0.4) msg = "Not bad — practice makes perfect! 💪";
  else msg = "Keep learning, you'll get there! 📚";
  $("scoreMsg").textContent = msg;

  showPage("page-result");
}

function resetQuiz() {
  state.questions = [];
  state.current = 0;
  state.score = 0;
  clearInterval(state.timer);
}
