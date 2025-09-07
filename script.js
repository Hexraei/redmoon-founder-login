// === CONFIGURATION ===
// Replace these values with your project's values
const CLIENT_ID = "492778792665-qgu59q7rilsd0f7hsevcmkvflu8a0sgg.apps.googleusercontent.com"; // OAuth 2.0 Client ID (Web app).
const SPREADSHEET_ID = "1fElvYncq9gYnaN6ZqdpXmT5mj3v8FWgXREwIVYfiMjo";
// Sheets ranges
const FOUNDERS_RANGE = "Founders!A2:A";        // emails
const LOG_SHEET = "AttendanceLog";             // sheet/tab name to append rows

// Scopes we need: sheets + basic profile/email
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email openid profile";

// DOM
const signinBtn = document.getElementById("signin-btn");
const loginMsg = document.getElementById("login-msg");
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const welcome = document.getElementById("welcome");
const emailDisplay = document.getElementById("email-display");
const logoutBtn = document.getElementById("logout-btn");
const taskNameEl = document.getElementById("task-name");
const taskDetailsEl = document.getElementById("task-details");
const startBtn = document.getElementById("start-btn");
const endBtn = document.getElementById("end-btn");
const activeSection = document.getElementById("active-task");
const activeTitle = document.getElementById("active-title");
const activeDetails = document.getElementById("active-details");
const activeStart = document.getElementById("active-start");
const completedList = document.getElementById("completed-list");
const statusEl = document.getElementById("status");

// Session state
let tokenClient = null;
let accessToken = null;
let userInfo = null;
let foundersAllowlist = []; // emails
let sessionStart = null;
let tasks = []; // completed tasks
let activeTask = null;

// ---- Utilities
function setStatus(s, isError=false){
  statusEl.textContent = s || "";
  statusEl.style.color = isError ? "#ffb4b4" : "";
}

function prettyDuration(ms){
  const s = Math.round(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  if(hh) return `${hh}h ${mm}m ${ss}s`;
  if(mm) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

// --- Initialize GSI token client once library loaded
window.addEventListener("load", () => {
  // Wait until google.accounts is available
  const t = setInterval(() => {
    if(window.google && google.accounts && google.accounts.oauth2){
      clearInterval(t);
      initTokenClient();
    }
  }, 200);
  // timeout guard
  setTimeout(()=> {
    if(!tokenClient) {
      signinBtn.disabled = true;
      signinBtn.textContent = "GSI not available";
      loginMsg.textContent = "Failed to load Google Identity Services. Check network/blocks.";
    }
  }, 8000);
});

function initTokenClient(){
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if(resp.error){
        console.error("token error", resp);
        setStatus("Authentication error. See console.", true);
        return;
      }
      accessToken = resp.access_token;
      // fetch profile and proceed
      fetchUserInfoAndAllowlist();
    }
  });

  signinBtn.disabled = false;
  signinBtn.textContent = "Sign in with Google";
  signinBtn.onclick = () => {
    // request access token - consent will appear first-run
    tokenClient.requestAccessToken({prompt: 'consent'});
    setStatus("Opening Google sign-in…");
  };
}

// Fetch userinfo (email) using Google's userinfo endpoint (requires token)
async function fetchUserInfoAndAllowlist(){
  try{
    setStatus("Fetching profile...");
    // get profile
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if(!r.ok) throw new Error("Failed to fetch profile: "+r.status);
    userInfo = await r.json();
    console.log("profile:", userInfo);
    // load allowlist from sheet
    setStatus("Loading founders allowlist from sheet...");
    const allow = await sheetsGetRange(FOUNDERS_RANGE);
    // allow.values may be array of arrays; flatten
    foundersAllowlist = (allow.values || []).map(row => String(row[0]).trim().toLowerCase());
    console.log("allowlist:", foundersAllowlist);
    // check
    if(!isFounder(userInfo.email)){
      setStatus("Account not authorized. Access denied.", true);
      // signout token (revoke)
      google.accounts.oauth2.revoke(accessToken);
      accessToken = null;
      return;
    }
    startSession();
  } catch(err){
    console.error(err);
    setStatus("Initialization failed. Check console for details.", true);
  }
}

function isFounder(email){
  if(!email) return false;
  return foundersAllowlist.includes(email.toLowerCase());
}

// --- Sheets operations using REST fetch
async function sheetsGetRange(range){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error("Sheets GET error: " + res.status + " " + text);
  }
  return res.json();
}

async function sheetsAppendRow(valuesArray){
  // valuesArray: array of values (single row)
  const range = `${LOG_SHEET}!A1:Z1`; // append target
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { range, majorDimension: "ROWS", values: [valuesArray] };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error("Sheets append error: " + res.status + " " + text);
  }
  return res.json();
}

// --- Session & Task logic
function startSession(){
  sessionStart = new Date();
  tasks = [];
  activeTask = null;
  // UI
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  welcome.textContent = `Welcome — ${userInfo.name || userInfo.email}`;
  emailDisplay.textContent = userInfo.email;
  setStatus("Ready. Start a task.");
}

// Start / End task
startBtn.onclick = () => {
  const name = taskNameEl.value && taskNameEl.value.trim();
  if(!name) { setStatus("Task name required.", true); return; }
  if(activeTask){ setStatus("Finish current active task first.", true); return; }
  activeTask = {
    name,
    details: taskDetailsEl.value.trim(),
    start: Date.now()
  };
  // UI
  activeTitle.textContent = activeTask.name;
  activeDetails.textContent = activeTask.details || "";
  activeStart.textContent = (new Date(activeTask.start)).toLocaleString();
  activeSection.classList.remove("hidden");
  endBtn.disabled = false;
  startBtn.disabled = true;
  setStatus("Task started.");
};

endBtn.onclick = () => {
  if(!activeTask){ setStatus("No active task.", true); return; }
  const endedAt = Date.now();
  const durationMs = endedAt - activeTask.start;
  const rec = {
    name: activeTask.name,
    details: activeTask.details,
    start: new Date(activeTask.start).toISOString(),
    end: new Date(endedAt).toISOString(),
    durationMs
  };
  tasks.push(rec);
  // update UI
  const li = document.createElement("li");
  li.textContent = `${rec.name} — ${prettyDuration(rec.durationMs)}${rec.details ? " · "+rec.details : ""}`;
  completedList.appendChild(li);
  // reset active
  activeTask = null;
  activeSection.classList.add("hidden");
  endBtn.disabled = true;
  startBtn.disabled = false;
  taskNameEl.value = "";
  taskDetailsEl.value = "";
  setStatus("Task ended and recorded.");
};

// Logout & append row
logoutBtn.onclick = async () => {
  try{
    setStatus("Saving session to sheet...");
    const logoutTime = new Date();
    const summary = tasks.map(t => `${t.name} (${prettyDuration(t.durationMs)})`).join(" ; ");
    function fmt(dt) {
  return dt.toLocaleString("en-GB", { // en-GB defaults to DD/MM/YYYY and 24h
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

const row = [
  userInfo.email,
  fmt(sessionStart),
  summary || "(no tasks)",
  fmt(logoutTime)
];

    await sheetsAppendRow(row);
    setStatus("Session saved. Logging out.");
    // revoke token
    try { google.accounts.oauth2.revoke(accessToken); } catch(e){/*ignore*/}
    // reset UI
    accessToken = null;
    userInfo = null;
    loginScreen.classList.remove("hidden");
    dashboard.classList.add("hidden");
    completedList.innerHTML = "";
    setStatus("Logged out.");
  } catch(err){
    console.error(err);
    setStatus("Failed to save session. See console.", true);
  }
};
