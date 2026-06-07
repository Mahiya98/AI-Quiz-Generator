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

// 🆕 Detect key type and build proper auth
function buildAuth(apiKey, model) {
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers = { "Content-Type": "application/json" };

  if (apiKey.startsWith("AQ.")) {
    // AQ. tokens → Bearer authorization header
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-goog-api-key"] = apiKey; // fallback for some endpoints
    return { url: baseUrl, headers };
  } else {
    // AIza... keys → query parameter
    return { url: `${baseUrl}?key=${apiKey}`, headers };
  }
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

  // 🆕 Validate key format
  if (!key.startsWith("AIza") && !key.startsWith("AQ.")) {
    if (!confirm("⚠️ This doesn't look like a standard Gemini key (should start with 'AIza' or 'AQ.'). Continue anyway?")) {
      return;
    }
  }

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

// ====== GEMINI API CALL (Updated) ======
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

  // 🆕 Build proper auth based on key type
  const { url, headers } = buildAuth(state.apiKey, state.model);

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      responseMimeType: "application/json"
    }
  });

  let res = await fetch(url, { method: "POST", headers, body });

  // 🆕 Auto-fallback: if AQ. token fails with Bearer, try x-goog-api-key only
  if (!res.ok && state.apiKey.startsWith("AQ.")) {
    const fallbackHeaders = {
      "Content-Type": "application/json",
      "x-goog-api-key": state.apiKey
    };
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent`;
    res = await fetch(fallbackUrl, { method: "POST", headers: fallbackHeaders, body });
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${res.status}`;

    // 🆕 Helpful hint for AQ. token issues
    if (state.apiKey.startsWith("AQ.") && (errMsg.includes("denied") || errMsg.includes("invalid") || errMsg.includes("expired"))) {
      throw new Error(
        `${errMsg}\n\n💡 Tip: AQ. tokens may be short-lived OAuth tokens. ` +
        `Try regenerating it from aistudio.google.com/apikey, ` +
        `or request a standard AIza key by enabling billing on your Google Cloud project.`
      );
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
