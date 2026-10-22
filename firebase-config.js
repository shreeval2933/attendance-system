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
  } else {
    console.log("Running in offline/local simulation mode (Local storage & Realtime BroadcastChannel)");
  }
} catch (err) {
  console.warn("Firebase initialization error, defaulting to local mode:", err);
}

// Real-time broadcast channel for multi-tab communication when in local mode
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("attendance_sync_channel") : null;

// ============================================================================
// Local Storage Simulation Engine
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
  localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
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
  localStorage.setItem(`${STORAGE_SUBMISSIONS_KEY}_${sessionId}`, JSON.stringify(submissions));
}

// Initialize seed session if storage is empty
(function seedDefaultSession() {
  const sessions = getLocalSessions();
  if (Object.keys(sessions).length === 0) {
    const defaultSession = {
      name: "Oct22_Lec",
      scheduledStart: "",
      openMinutes: 15,
      maxGpsError: 500, // Generous default tolerance for laptop/WiFi testing
      enforceCenter: true,
      centerLat: 26.47338,
      centerLng: 73.11728,
      centerRadius: 150,
      status: "ACTIVE", // ACTIVE, CLOSED, READY
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
    sessions["Oct22_Lec"] = defaultSession;
    saveLocalSessions(sessions);

    // Add a few realistic sample submissions matching the reference screenshot
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
        lat: 26.28750, // Far away (hostel / off-campus)
        lng: 73.03250,
        accuracy: 25,
        timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        distanceFromCenter: 380,
        distanceFromGroup: 375,
        flagged: true
      }
    ];
    saveLocalSubmissions("Oct22_Lec", sampleSubmissions);
  }
})();

// ============================================================================
// Database Service Interface (Unified for Firebase & Local Simulation)
// ============================================================================
window.AttendanceDB = {
  isConfigured() {
    return isRealFirebase;
  },

  // Save or update session details
  async saveSession(sessionData) {
    if (!sessionData.name) throw new Error("Session name is required");
    const sessionKey = sessionData.name.trim();
    const openMins = parseInt(sessionData.openMinutes, 10) || 15;

    if (isRealFirebase) {
      const doc = await db.collection("sessions").doc(sessionKey).get();
      const existing = doc.exists ? doc.data() : {};
      
      // If currently active and duration changed, update expiresAt accordingly
      if (existing.status === "ACTIVE" && existing.startedAt) {
        sessionData.expiresAt = new Date(new Date(existing.startedAt).getTime() + openMins * 60 * 1000).toISOString();
      }
      sessionData.openMinutes = openMins;

      await db.collection("sessions").doc(sessionKey).set(sessionData, { merge: true });
      return sessionData;
    } else {
      const sessions = getLocalSessions();
      const existing = sessions[sessionKey] || {};

      let newExpiresAt = existing.expiresAt;
      if (existing.status === "ACTIVE" && existing.startedAt) {
        newExpiresAt = new Date(new Date(existing.startedAt).getTime() + openMins * 60 * 1000).toISOString();
      }

      sessions[sessionKey] = {
        ...existing,
        ...sessionData,
        openMinutes: openMins,
        expiresAt: newExpiresAt,
        updatedAt: new Date().toISOString()
      };
      saveLocalSessions(sessions);
      if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName: sessionKey });
      return sessions[sessionKey];
    }
  },

  // Get single session by name
  async getSession(sessionName) {
    if (!sessionName) return null;
    const key = sessionName.trim();

    if (isRealFirebase) {
      const doc = await db.collection("sessions").doc(key).get();
      return doc.exists ? doc.data() : null;
    } else {
      const sessions = getLocalSessions();
      return sessions[key] || null;
    }
  },

  // Get active session (or most recently updated session)
  async getActiveSession() {
    if (isRealFirebase) {
      const snapshot = await db.collection("sessions")
        .where("status", "==", "ACTIVE")
        .limit(1)
        .get();
      if (!snapshot.empty) return snapshot.docs[0].data();

      // Fallback to latest
      const latestSnapshot = await db.collection("sessions")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      return !latestSnapshot.empty ? latestSnapshot.docs[0].data() : null;
    } else {
      const sessions = getLocalSessions();
      const all = Object.values(sessions);
      const active = all.find(s => s.status === "ACTIVE");
      if (active) return active;
      return all.length > 0 ? all[all.length - 1] : null;
    }
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
      openMinutes: mins
    };

    if (isRealFirebase) {
      await db.collection("sessions").doc(sessionName).set(update, { merge: true });
    } else {
      const sessions = getLocalSessions();
      sessions[sessionName] = {
        ...(sessions[sessionName] || {}),
        ...update
      };
      saveLocalSessions(sessions);
      if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
    }
    return update;
  },

  // Clear all submissions for a session
  async clearSubmissions(sessionId) {
    if (isRealFirebase) {
      const snapshot = await db.collection("sessions").doc(sessionId).collection("submissions").get();
      const batch = db.batch();
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } else {
      saveLocalSubmissions(sessionId, []);
      if (syncChannel) syncChannel.postMessage({ type: "NEW_SUBMISSION", sessionId });
    }
  },

  // Stop session
  async stopSession(sessionName) {
    const update = {
      status: "CLOSED",
      closedAt: new Date().toISOString()
    };

    if (isRealFirebase) {
      await db.collection("sessions").doc(sessionName).update(update);
    } else {
      const sessions = getLocalSessions();
      if (sessions[sessionName]) {
        sessions[sessionName] = { ...sessions[sessionName], ...update };
        saveLocalSessions(sessions);
        if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
      }
    }
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
      openMinutes: (session.openMinutes || 15) + extraMinutes
    };

    if (isRealFirebase) {
      await db.collection("sessions").doc(sessionName).update(update);
    } else {
      const sessions = getLocalSessions();
      if (sessions[sessionName]) {
        sessions[sessionName] = { ...sessions[sessionName], ...update };
        saveLocalSessions(sessions);
        if (syncChannel) syncChannel.postMessage({ type: "SESSION_UPDATED", sessionName });
      }
    }
    return update;
  },

  // Record student attendance submission
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
      affiliation: studentData.affiliation.trim(),
      rollNo: studentData.rollNo ? studentData.rollNo.trim() : "",
      isIitj: Boolean(studentData.isIitj),
      deviceId: deviceId,
      lat: Number(studentData.lat),
      lng: Number(studentData.lng),
      accuracy: Number(studentData.accuracy),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    if (isRealFirebase) {
      // 2. Check for duplicate submission with same email in Firestore
      const dupQuery = await db.collection("sessions")
        .doc(sessionId)
        .collection("submissions")
        .where("email", "==", subRecord.email)
        .get();

      if (!dupQuery.empty) {
        throw new Error("Attendance already submitted for this email in this session.");
      }

      // 3. Enforce: One mobile/device only one user can submit
      if (deviceId && deviceId !== "dev_unknown") {
        const deviceQuery = await db.collection("sessions")
          .doc(sessionId)
          .collection("submissions")
          .where("deviceId", "==", deviceId)
          .get();

        if (!deviceQuery.empty) {
          throw new Error("Attendance has already been marked from this mobile phone / device. Only one attendance submission per device is allowed.");
        }
      }

      await db.collection("sessions").doc(sessionId).collection("submissions").doc(subRecord.id).set(subRecord);
      return subRecord;
    } else {
      const existing = getLocalSubmissions(sessionId);

      // Check email duplicate
      const isDupEmail = existing.some(item => item.email === subRecord.email);
      if (isDupEmail) {
        throw new Error("Attendance already submitted for this email in this session.");
      }

      // Check device duplicate
      if (deviceId && deviceId !== "dev_unknown") {
        const isDupDevice = existing.some(item => item.deviceId && item.deviceId === deviceId);
        if (isDupDevice) {
          throw new Error("Attendance has already been marked from this mobile phone / device. Only one attendance submission per device is allowed.");
        }
      }

      existing.unshift(subRecord);
      saveLocalSubmissions(sessionId, existing);
      if (syncChannel) syncChannel.postMessage({ type: "NEW_SUBMISSION", sessionId, submission: subRecord });
      return subRecord;
    }
  },

  // Fetch all submissions for a session
  async getSubmissions(sessionId) {
    if (isRealFirebase) {
      const snapshot = await db.collection("sessions")
        .doc(sessionId)
        .collection("submissions")
        .orderBy("timestamp", "desc")
        .get();
      return snapshot.docs.map(doc => doc.data());
    } else {
      return getLocalSubmissions(sessionId);
    }
  },

  // Listen for real-time changes to submissions
  onSubmissionsChange(sessionId, callback) {
    if (isRealFirebase) {
      return db.collection("sessions")
        .doc(sessionId)
        .collection("submissions")
        .orderBy("timestamp", "desc")
        .onSnapshot(snapshot => {
          const list = snapshot.docs.map(doc => doc.data());
          callback(list);
        }, err => console.error("Firestore listener error:", err));
    } else {
      // In local mode, immediately trigger callback, then listen to BroadcastChannel or storage events
      callback(getLocalSubmissions(sessionId));

      const handler = (e) => {
        if (e.data && (e.data.type === "NEW_SUBMISSION" || e.data.type === "SESSION_UPDATED")) {
          callback(getLocalSubmissions(sessionId));
        }
      };
      if (syncChannel) syncChannel.addEventListener("message", handler);

      // Return cleanup unsubscribe function
      return () => {
        if (syncChannel) syncChannel.removeEventListener("message", handler);
      };
    }
  },

  // Listen for real-time changes to a session's state
  onSessionChange(sessionId, callback) {
    if (isRealFirebase) {
      return db.collection("sessions").doc(sessionId).onSnapshot(doc => {
        if (doc.exists) callback(doc.data());
      });
    } else {
      this.getSession(sessionId).then(sess => { if (sess) callback(sess); });
      const handler = (e) => {
        if (e.data && e.data.type === "SESSION_UPDATED" && e.data.sessionName === sessionId) {
          this.getSession(sessionId).then(sess => { if (sess) callback(sess); });
        }
      };
      if (syncChannel) syncChannel.addEventListener("message", handler);
      return () => {
        if (syncChannel) syncChannel.removeEventListener("message", handler);
      };
    }
  }
};
