// ============================================================================
// Firebase Configuration & Service Layer
// ============================================================================
// If you have your own Firebase project:
// 1. Replace the firebaseConfig object below with your Firebase web app config
// 2. Enable Cloud Firestore in test mode (or use the provided firestore.rules)
// 3. (Optional) Enable Google Sign-In in Firebase Authentication
//
// NOTE: If the placeholder keys remain unchanged, this app automatically operates
// in a seamless LocalStorage + Real-Time BroadcastChannel mode, so you can test
// both Admin and Student pages across tabs immediately without any configuration!
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyCwbl4mb-Yk6ery8R33YehpQnjuQin2nmI",
  authDomain: "attendance-system-2c59e.firebaseapp.com",
  projectId: "attendance-system-2c59e",
  storageBucket: "attendance-system-2c59e.firebasestorage.app",
  messagingSenderId: "789721775992",
  appId: "1:789721775992:web:7cd758b6d5e22ea8bc928d",
  measurementId: "G-2887BV29XD"
};

// Check if user has entered real Firebase keys
const isFirebaseConfigured = () => {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("YOUR_FIREBASE") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("your-project-id")
  );
};

// Initialize Firebase if configured
let db = null;
let auth = null;
let isRealFirebase = false;

try {
  if (isFirebaseConfigured() && typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    isRealFirebase = true;
    console.log("Connected to live Firebase Firestore!");

    // Enable offline persistence in Firestore
    if (typeof db.enablePersistence === "function") {
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code === "failed-precondition") {
          console.warn("Firestore persistence active in another tab");
        } else if (err.code === "unimplemented") {
          console.warn("Browser does not support Firestore persistence");
        }
      });
    }
  } else {
    console.log("Running in offline/local simulation mode (Local storage & Realtime BroadcastChannel)");
  }
} catch (err) {
  console.warn("Firebase initialization error, defaulting to local mode:", err);
}

// Real-time broadcast channel for multi-tab communication when in local mode
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("attendance_sync_channel") : null;

// ============================================================================
// Local Storage Simulation Engine & Persistent Cache
// ============================================================================
const STORAGE_SESSIONS_KEY = "attendance_system_sessions";
const STORAGE_SUBMISSIONS_KEY = "attendance_system_submissions";

function getLocalSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveLocalSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn("Failed to write sessions to localStorage:", e);
  }
}

function getLocalSubmissions(sessionId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_SUBMISSIONS_KEY}_${sessionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalSubmissions(sessionId, submissions) {
  try {
    localStorage.setItem(`${STORAGE_SUBMISSIONS_KEY}_${sessionId}`, JSON.stringify(submissions));
    // Also update submission count in local session object
    const sessions = getLocalSessions();
    if (sessions[sessionId]) {
      sessions[sessionId].submissionCount = submissions.length;
      saveLocalSessions(sessions);
    }
  } catch (e) {
    console.warn("Failed to write submissions to localStorage:", e);
  }
}

// Initialize seed session if storage is empty
(function seedDefaultSession() {
  const sessions = getLocalSessions();
  const sampleSubmissions = [
    {
      id: "sub_1",
      sessionId: "Oct22_Lec",
      name: "Nishit Gupta (B25CM1034)",
      email: "b25cm1034@iitj.ac.in",
      affiliation: "B25CM1034",
      lat: 26.28483,
      lng: 73.02984,
      accuracy: 12,
      timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      distanceFromCenter: 4,
      distanceFromGroup: 4,
      flagged: false
    },
    {
      id: "sub_2",
      sessionId: "Oct22_Lec",
      name: "Aarav Sharma",
      email: "b25cs1002@iitj.ac.in",
      affiliation: "B25CS1002",
      lat: 26.28487,
      lng: 73.02989,
      accuracy: 15,
      timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
      distanceFromCenter: 9,
      distanceFromGroup: 6,
      flagged: false
    },
    {
      id: "sub_3",
      sessionId: "Oct22_Lec",
      name: "Priya Patel",
      email: "b25ee1021@iitj.ac.in",
      affiliation: "B25EE1021",
      lat: 26.28510,
      lng: 73.03010,
      accuracy: 18,
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      distanceFromCenter: 42,
      distanceFromGroup: 38,
      flagged: false
    },
    {
      id: "sub_4",
      sessionId: "Oct22_Lec",
      name: "Rohan Varma (Remote/Proxy)",
      email: "b25me1055@iitj.ac.in",
      affiliation: "B25ME1055",
      lat: 26.28750,
      lng: 73.03250,
      accuracy: 25,
      timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      distanceFromCenter: 380,
      distanceFromGroup: 375,
      flagged: true
    }
  ];

  const defaultSession = {
    name: "Oct22_Lec",
    scheduledStart: "",
    openMinutes: 15,
    maxGpsError: 500,
    enforceCenter: true,
    centerLat: 26.47338,
    centerLng: 73.11728,
    centerRadius: 150,
    status: "CLOSED",
    createdAt: new Date().toISOString(),
    startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    submissionCount: sampleSubmissions.length
  };

  if (Object.keys(sessions).length === 0 || !sessions["Oct22_Lec"]) {
    sessions["Oct22_Lec"] = defaultSession;
    saveLocalSessions(sessions);
    saveLocalSubmissions("Oct22_Lec", sampleSubmissions);
  }

  // Also seed into Firestore if Firestore is active and empty
  if (isRealFirebase && db) {
    db.collection("sessions").doc("Oct22_Lec").get().then((doc) => {
      if (!doc.exists) {
        db.collection("sessions").doc("Oct22_Lec").set(defaultSession).catch(console.warn);
        sampleSubmissions.forEach(sub => {
          db.collection("sessions").doc("Oct22_Lec").collection("submissions").doc(sub.id).set(sub).catch(console.warn);
        });
      }
    }).catch(console.warn);
  }
})();

// ============================================================================
// Database Service Interface (Unified for Firebase & Local Simulation)
// ============================================================================
window.AttendanceDB = {
  isConfigured() {
    return isRealFirebase;
  },

  // Get all sessions from both Cloud Firestore & LocalStorage (merged & persistent)
  async getAllSessions() {
    const sessions = getLocalSessions();

    if (isRealFirebase && db) {
      try {
        const snapshot = await db.collection("sessions").get();
        snapshot.docs.forEach((doc) => {
          const cloudData = doc.data();
          const key = doc.id;
          sessions[key] = {
            ...(sessions[key] || {}),
            ...cloudData
          };
        });
        saveLocalSessions(sessions);
      } catch (err) {
        console.warn("Could not fetch cloud sessions, using local cache:", err);
      }
    }

    // Attach submission counts for each session
    Object.keys(sessions).forEach((key) => {
      const localSubs = getLocalSubmissions(key);
      if (localSubs && localSubs.length > 0) {
        sessions[key].submissionCount = localSubs.length;
      } else if (sessions[key].submissionCount === undefined) {
        sessions[key].submissionCount = 0;
      }
    });

    return sessions;
  },

  // Save or update session details across Cloud and LocalStorage
  async saveSession(sessionData) {
    if (!sessionData.name) throw new Error("Session name is required");
    const sessionKey = sessionData.name.trim();
    const openMins = parseInt(sessionData.openMinutes, 10) || 15;

    // 1. Immediately persist to LocalStorage
    const sessions = getLocalSessions();
    const existing = sessions[sessionKey] || {};

    let newExpiresAt = existing.expiresAt;
    if (existing.status === "ACTIVE" && existing.startedAt) {
      newExpiresAt = new Date(new Date(existing.startedAt).getTime() + openMins * 60 * 1000).toISOString();
    }

    const merged = {
      ...existing,
      ...sessionData,
      openMinutes: openMins,
      expiresAt: newExpiresAt,
      updatedAt: new Date().toISOString()
    };
    sessions[sessionKey] = merged;
    saveLocalSessions(sessions);
    try {
      localStorage.setItem("attendance_last_session_name", sessionKey);
    } catch (e) {}

    // 2. Persist to Cloud Firestore if connected
    if (isRealFirebase && db) {
      try {
        await db.collection("sessions").doc(sessionKey).set(merged, { merge: true });
      } catch (err) {
        console.warn("Cloud session save deferred / offline:", err);
      }
    }

    if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName: sessionKey });
    return merged;
  },

  // Get single session by name (Cache-first with live cloud sync)
  async getSession(sessionName) {
    if (!sessionName) return null;
    const key = sessionName.trim();
    const sessions = getLocalSessions();
    let local = sessions[key] || null;

    if (isRealFirebase && db) {
      try {
        const doc = await db.collection("sessions").doc(key).get();
        if (doc.exists) {
          const cloudData = doc.data();
          local = { ...(local || {}), ...cloudData };
          sessions[key] = local;
          saveLocalSessions(sessions);
        }
      } catch (err) {
        console.warn("Firestore getSession fallback to local cache:", err);
      }
    }

    return local;
  },

  // Get active session (or most recently updated session)
  async getActiveSession() {
    const all = await this.getAllSessions();
    const list = Object.values(all);

    // First check for any ACTIVE session
    const active = list.find((s) => s.status === "ACTIVE");
    if (active) return active;

    // Fallback to most recently updated / created
    list.sort((a, b) => {
      const tA = new Date(a.updatedAt || a.startedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.startedAt || b.createdAt || 0).getTime();
      return tB - tA;
    });

    return list.length > 0 ? list[0] : null;
  },

  // Start session now
  async startSession(sessionName, openMinutes = 15) {
    const mins = parseInt(openMinutes, 10) || 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + mins * 60 * 1000);

    const update = {
      name: sessionName,
      status: "ACTIVE",
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      openMinutes: mins,
      updatedAt: now.toISOString()
    };

    // 1. LocalStorage
    const sessions = getLocalSessions();
    sessions[sessionName] = {
      ...(sessions[sessionName] || {}),
      ...update
    };
    saveLocalSessions(sessions);
    try {
      localStorage.setItem("attendance_last_session_name", sessionName);
    } catch (e) {}

    // 2. Firestore
    if (isRealFirebase && db) {
      try {
        await db.collection("sessions").doc(sessionName).set(update, { merge: true });
      } catch (err) {
        console.warn("Cloud startSession deferred / offline:", err);
      }
    }

    if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
    return update;
  },

  // Clear all submissions for a session
  async clearSubmissions(sessionId) {
    saveLocalSubmissions(sessionId, []);
    const sessions = getLocalSessions();
    if (sessions[sessionId]) {
      sessions[sessionId].submissionCount = 0;
      saveLocalSessions(sessions);
    }

    if (isRealFirebase && db) {
      try {
        const snapshot = await db.collection("sessions").doc(sessionId).collection("submissions").get();
        const batch = db.batch();
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (err) {
        console.warn("Cloud clearSubmissions error:", err);
      }
    }

    if (syncChannel) syncChannel.postMessage({ type: "NEW_SUBMISSION", sessionId });
  },

  // Stop session
  async stopSession(sessionName) {
    const update = {
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const sessions = getLocalSessions();
    if (sessions[sessionName]) {
      sessions[sessionName] = { ...sessions[sessionName], ...update };
      saveLocalSessions(sessions);
    }

    if (isRealFirebase && db) {
      try {
        await db.collection("sessions").doc(sessionName).set(update, { merge: true });
      } catch (err) {
        console.warn("Cloud stopSession error:", err);
      }
    }

    if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
    return update;
  },

  // Extend session time by minutes
  async extendSession(sessionName, extraMinutes = 5) {
    const session = await this.getSession(sessionName);
    if (!session) return null;

    let currentExpiry = session.expiresAt ? new Date(session.expiresAt) : new Date();
    if (currentExpiry.getTime() < Date.now()) {
      currentExpiry = new Date();
    }
    const newExpiry = new Date(currentExpiry.getTime() + extraMinutes * 60 * 1000);

    const update = {
      status: "ACTIVE",
      expiresAt: newExpiry.toISOString(),
      openMinutes: (session.openMinutes || 15) + extraMinutes,
      updatedAt: new Date().toISOString()
    };

    const sessions = getLocalSessions();
    if (sessions[sessionName]) {
      sessions[sessionName] = { ...sessions[sessionName], ...update };
      saveLocalSessions(sessions);
    }

    if (isRealFirebase && db) {
      try {
        await db.collection("sessions").doc(sessionName).set(update, { merge: true });
      } catch (err) {
        console.warn("Cloud extendSession error:", err);
      }
    }

    if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
    return update;
  },

  // Record student attendance submission (Dual Cloud & Local Storage)
  async submitAttendance(sessionId, studentData) {
    // 1. Enforce that session is strictly open/active
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" does not exist.`);
    }

    const now = Date.now();
    const isExpired = session.expiresAt && new Date(session.expiresAt).getTime() < now;
    if (session.status !== "ACTIVE" || isExpired) {
      throw new Error(`Session "${sessionId}" is CLOSED (time over). Attendance submissions cannot be accepted.`);
    }

    const deviceId = studentData.deviceId ? String(studentData.deviceId).trim() : "dev_unknown";

    const subRecord = {
      id: "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      sessionId: sessionId,
      name: studentData.name.trim(),
      email: studentData.email.trim().toLowerCase(),
      affiliation: (studentData.affiliation || "").trim(),
      rollNo: (studentData.rollNo || "").trim(),
      isIitj: Boolean(studentData.isIitj),
      deviceId: deviceId,
      lat: Number(studentData.lat),
      lng: Number(studentData.lng),
      accuracy: Number(studentData.accuracy),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Check duplicate in local storage first
    const localExisting = getLocalSubmissions(sessionId);
    const isDupEmail = localExisting.some((item) => item.email === subRecord.email);
    if (isDupEmail) {
      throw new Error("Attendance already submitted for this email in this session.");
    }
    if (deviceId && deviceId !== "dev_unknown") {
      const isDupDevice = localExisting.some((item) => item.deviceId && item.deviceId === deviceId);
      if (isDupDevice) {
        throw new Error("Attendance has already been marked from this mobile phone / device. Only one attendance submission per device is allowed.");
      }
    }

    // Check duplicate in Firestore if connected
    if (isRealFirebase && db) {
      try {
        const dupQuery = await db.collection("sessions")
          .doc(sessionId)
          .collection("submissions")
          .where("email", "==", subRecord.email)
          .get();
        if (!dupQuery.empty) {
          throw new Error("Attendance already submitted for this email in this session.");
        }

        if (deviceId && deviceId !== "dev_unknown") {
          const devQuery = await db.collection("sessions")
            .doc(sessionId)
            .collection("submissions")
            .where("deviceId", "==", deviceId)
            .get();
          if (!devQuery.empty) {
            throw new Error("Attendance has already been marked from this mobile phone / device. Only one attendance submission per device is allowed.");
          }
        }

        await db.collection("sessions").doc(sessionId).collection("submissions").doc(subRecord.id).set(subRecord);
      } catch (err) {
        if (err.message && err.message.includes("already")) throw err;
        console.warn("Cloud attendance write deferred / offline:", err);
      }
    }

    // Save to local cache
    localExisting.unshift(subRecord);
    saveLocalSubmissions(sessionId, localExisting);

    if (syncChannel) syncChannel.postMessage({ type: "NEW_SUBMISSION", sessionId, submission: subRecord });
    return subRecord;
  },

  // Fetch all submissions for a session (merged and cached)
  async getSubmissions(sessionId) {
    const local = getLocalSubmissions(sessionId);

    if (isRealFirebase && db) {
      try {
        const snapshot = await db.collection("sessions")
          .doc(sessionId)
          .collection("submissions")
          .orderBy("timestamp", "desc")
          .get();

        if (!snapshot.empty) {
          const cloudSubs = snapshot.docs.map((doc) => doc.data());
          // Merge deduplicating by id and email
          const subMap = new Map();
          cloudSubs.forEach((s) => subMap.set(s.id || s.email, s));
          local.forEach((s) => {
            const key = s.id || s.email;
            if (!subMap.has(key)) subMap.set(key, s);
          });
          const merged = Array.from(subMap.values());
          saveLocalSubmissions(sessionId, merged);
          return merged;
        }
      } catch (err) {
        console.warn("Firestore getSubmissions fallback to local cache:", err);
      }
    }

    return local;
  },

  // Listen for real-time changes to submissions
  onSubmissionsChange(sessionId, callback) {
    // 1. Immediately provide cached submissions
    callback(getLocalSubmissions(sessionId));

    let unsubscribeFirestore = null;
    if (isRealFirebase && db) {
      try {
        unsubscribeFirestore = db.collection("sessions")
          .doc(sessionId)
          .collection("submissions")
          .orderBy("timestamp", "desc")
          .onSnapshot((snapshot) => {
            const list = snapshot.docs.map((doc) => doc.data());
            // Sync with local cache
            if (list.length > 0) {
              const local = getLocalSubmissions(sessionId);
              const map = new Map();
              list.forEach((s) => map.set(s.id || s.email, s));
              local.forEach((s) => {
                const key = s.id || s.email;
                if (!map.has(key)) map.set(key, s);
              });
              const merged = Array.from(map.values());
              saveLocalSubmissions(sessionId, merged);
              callback(merged);
            } else {
              callback(getLocalSubmissions(sessionId));
            }
          }, (err) => console.warn("Firestore submissions listener notice:", err));
      } catch (e) {
        console.warn("Firestore onSubmissionsChange listener setup notice:", e);
      }
    }

    const handler = (e) => {
      if (e.data && (e.data.type === "NEW_SUBMISSION" || e.data.type === "SESSION_UPDATED")) {
        if (!e.data.sessionId || e.data.sessionId === sessionId) {
          callback(getLocalSubmissions(sessionId));
        }
      }
    };
    if (syncChannel) syncChannel.addEventListener("message", handler);

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (syncChannel) syncChannel.removeEventListener("message", handler);
    };
  },

  // Listen for real-time changes to a session's state
  onSessionChange(sessionId, callback) {
    this.getSession(sessionId).then((sess) => {
      if (sess) callback(sess);
    });

    let unsubscribeFirestore = null;
    if (isRealFirebase && db) {
      try {
        unsubscribeFirestore = db.collection("sessions").doc(sessionId).onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            const sessions = getLocalSessions();
            sessions[sessionId] = { ...(sessions[sessionId] || {}), ...data };
            saveLocalSessions(sessions);
            callback(sessions[sessionId]);
          }
        }, (err) => console.warn("Firestore session listener notice:", err));
      } catch (e) {
        console.warn("Firestore onSessionChange listener setup notice:", e);
      }
    }

    const handler = (e) => {
      if (e.data && e.data.type === "SESSION_UPDATED" && (!e.data.sessionName || e.data.sessionName === sessionId)) {
        this.getSession(sessionId).then((sess) => {
          if (sess) callback(sess);
        });
      }
    };
    if (syncChannel) syncChannel.addEventListener("message", handler);

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (syncChannel) syncChannel.removeEventListener("message", handler);
    };
  }
};
