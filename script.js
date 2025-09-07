// --- START OF CONFIGURATION ---
const API_KEY = 'AIzaSyADRh25vDmLJ447aTkYA41k6XXg0uU_Y9k';
const CLIENT_ID = '492778792665-qgu59q7rilsd0f7hsevcmkvflu8a0sgg.apps.googleusercontent.com';
const SPREADSHEET_ID = '1fElvYncq9gYnaN6ZqdpXmT5mj3v8FWgXREwIVYfiMjo';
// --- END OF CONFIGURATION ---

const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];

// --- DOM ELEMENTS ---
const loginContainer = document.getElementById('login-container');
const signInBtn = document.getElementById('google-signin-btn');
const taskContainer = document.getElementById('task-container');
const logoutBtn = document.getElementById('logout-btn');
const startWorkBtn = document.getElementById('start-work-btn');
const endWorkBtn = document.getElementById('end-work-btn');
const welcomeMessage = document.getElementById('welcome-message');

// --- DATA STORAGE ---
let tokenClient;
let sessionData = {};
let activeTask = {};

// --- ROBUST INITIALIZATION WITH DEBUGGING ---
window.onload = function() {
    console.log("Step 1: Page has loaded (window.onload fired).");
    const checkInterval = setInterval(() => {
        console.log("Step 2: Checking for Google libraries...");
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
            console.log("Step 3: Google libraries are loaded! Stopping the check.");
            clearInterval(checkInterval); 
            initializeGoogleApis();      
        }
    }, 500); // Check every 500 milliseconds
};

function initializeGoogleApis() {
    console.log("Step 4: Initializing Google APIs...");
    gapi.load('client:oauth2', async () => {
        try {
            console.log("Step 5: GAPI client is loaded. Now initializing GAPI client...");
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            console.log("Step 6: GAPI client has been initialized successfully.");

            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: handleAuthResponse,
            });
            console.log("Step 7: GIS token client has been initialized.");

            signInBtn.disabled = false;
            signInBtn.innerText = "Sign In with Google";
            console.log("Step 8: SUCCESS! Sign-in button is enabled.");
        } catch (error) {
            console.error("CRITICAL ERROR during initialization:", error);
            // We can also display this to the user
            signInBtn.innerText = "Initialization Failed. Check Console.";
            signInBtn.style.backgroundColor = "red";
        }
    });
}

// --- AUTHENTICATION & LOGIN ---
signInBtn.addEventListener('click', () => {
    tokenClient.requestAccessToken({ prompt: '' });
});

async function handleAuthResponse(response) {
    if (response.error) {
        console.error("Authentication Error:", response.error);
        alert("An error occurred during authentication.");
        return;
    }
    
    try {
        const userInfoResponse = await gapi.client.oauth2.userinfo.get();
        const userEmail = userInfoResponse.result.email;
        const isFounder = await checkIfFounder(userEmail);

        if (isFounder) {
            sessionData = { founderName: userEmail, loginTime: new Date(), tasksCompleted: [], logoutTime: null };
            welcomeMessage.innerText = `Welcome, ${userEmail}`;
            loginContainer.classList.add('hidden');
            taskContainer.classList.remove('hidden');
        } else {
            alert("Access Denied. This Google account is not authorized.");
            google.accounts.oauth2.revoke(response.access_token);
        }
    } catch (err) {
        console.error("Error during login process:", err);
        alert("An error occurred. Could not verify your founder status.");
    }
}

async function checkIfFounder(email) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Founders!A2:A',
        });
        const founderEmails = response.result.values?.flat() || [];
        return founderEmails.includes(email);
    } catch (err) {
        console.error("Error reading from Founders sheet:", err.result ? err.result.error.message : err.message);
        return false;
    }
}

// --- TASK MANAGEMENT ---
startWorkBtn.addEventListener('click', () => {
    const taskName = document.getElementById('task-name').value;
    const taskDetails = document.getElementById('task-details').value;
    if (taskName.trim() === "") { alert("Task Name is required."); return; }
    activeTask = { name: taskName, details: taskDetails, startTime: new Date() };
    document.getElementById('active-task-name').innerText = activeTask.name;
    document.getElementById('active-task-details').innerText = activeTask.details;
    document.getElementById('active-task-start-time').innerText = activeTask.startTime.toLocaleTimeString();
    document.getElementById('active-task-display').classList.remove('hidden');
    document.querySelector('.task-input-section').classList.add('hidden');
});

endWorkBtn.addEventListener('click', () => {
    const endTime = new Date();
    const timeTakenMs = endTime - activeTask.startTime;
    const timeTakenStr = new Date(timeTakenMs).toISOString().substr(11, 8); // HH:MM:SS
    const completedTask = { name: activeTask.name, details: activeTask.details, timeTaken: timeTakenStr };
    sessionData.tasksCompleted.push(completedTask);
    const list = document.getElementById('completed-tasks-list');
    const listItem = document.createElement('li');
    listItem.innerHTML = `<strong>${completedTask.name}</strong> - Time Taken: ${completedTask.timeTaken}`;
    list.appendChild(listItem);
    document.getElementById('task-name').value = '';
    document.getElementById('task-details').value = '';
    document.getElementById('active-task-display').classList.add('hidden');
    document.querySelector('.task-input-section').classList.remove('hidden');
    activeTask = {};
});

// --- LOGOUT ---
logoutBtn.addEventListener('click', async () => {
    if (Object.keys(activeTask).length > 0) {
        if (!confirm("You have an active task. Are you sure you want to logout? The active task will not be saved.")) { return; }
    }
    sessionData.logoutTime = new Date();
    const tasksString = sessionData.tasksCompleted.map(t => `${t.name} (Time: ${t.timeTaken})`).join('; ');
    const valuesToAppend = [sessionData.founderName, sessionData.loginTime.toLocaleString(), tasksString || "No tasks completed.", sessionData.logoutTime.toLocaleString()];
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'AttendanceLog!A1',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [valuesToAppend] },
        });
        alert("Session logged successfully!");
        loginContainer.classList.remove('hidden');
        taskContainer.classList.add('hidden');
        document.getElementById('completed-tasks-list').innerHTML = '';
        sessionData = {};
    } catch (err) {
        console.error("Error writing to AttendanceLog sheet:", err.result ? err.result.error.message : err.message);
        alert("Could not save session data to Google Sheets. Please check the console for errors.");
    }
});