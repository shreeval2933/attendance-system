# 📍 Geolocation Attendance Verification System

A modern, anti-proxy classroom attendance platform powered by **HTML5 Geolocation**, **Leaflet.js interactive maps**, and **Google Firebase Firestore**.

---

## 🌟 Key Features

### 👨‍🏫 1. Teacher / Admin Dashboard (`admin.html`)
Matches your exact reference design with 3 structured sections:
- **Session Setup**:
  - Configure session name (e.g. `Oct22_Lec`), scheduled start time, duration in minutes, and maximum allowed GPS error in meters.
  - Optional classroom geofencing: set classroom center latitude/longitude and allowed radius with a single "Use My Current Location" button.
  - Action buttons: **Save session**, **Start now** (activates real-time countdown), **Stop now** (closes attendance), and **+5 min** extension.
- **Dynamic QR Code**:
  - Automatically generates scannable QR code pointing to the student check-in URL with the session parameter attached.
  - Copy student URL button & download QR code image for lecture slides or projector display.
- **Review & Submissions Analysis**:
  - Live count of submissions.
  - Configurable outlier distance threshold (e.g., flag if farther than 150m from class median).
  - **Interactive Leaflet Map**: plots student pins in real-time — blue pins for verified submissions within range, and red pins for flagged outliers or poor GPS accuracy.
  - Click any pin to view student name, email, roll/affiliation, distance from median/center, and GPS error.
  - **Submissions Table**: lists index, timestamp, student name, roll/affiliation, email, group distance, center distance, GPS accuracy, and flag status with a "Map" zoom button.
  - **Download CSV**: one-click export of complete attendance records with calculated metrics.

### 📱 2. Student Check-In Page (`student.html`)
A single, clean, mobile-optimized page where students record attendance:
- **Input Fields**:
  - Full Name
  - Institutional / Student Email
  - "Are you from IIT Jodhpur?" Checkbox
    - If YES: IIT Jodhpur Roll No (e.g. `B25CM1034`)
    - If NO: College / University / Organization Name
- **Geolocation Detection**:
  - High-accuracy HTML5 Geolocation (`enableHighAccuracy: true`).
  - Live GPS status indicator, precision badge, and coordinates display.
  - Mini Leaflet map preview with accuracy radius circle.
- **Anti-Proxy & Access Control**:
  - Checks if session is currently active and within open time window.
  - Prevents duplicate submissions for the same email in the same session.
  - Completely isolated: no links or access paths to the Teacher Admin Dashboard.
  - Confirms submission with a digital receipt showing timestamp and unique verification ID.

---

## 🚀 Instant Local Testing (Zero Configuration Needed)

This project includes a **built-in local simulation engine** with real-time `BroadcastChannel` multi-tab sync:
1. Start any local web server in this folder (e.g., using Python or Node.js):
   ```bash
   # Using Python:
   python -m http.server 8000
   
   # Or using Node:
   npx serve .
   ```
2. Open your browser:
   - Landing Portal: `http://localhost:8000/index.html`
   - Teacher Dashboard: `http://localhost:8000/admin.html`
   - Student Page: `http://localhost:8000/student.html?session=Oct22_Lec`
3. Try submitting attendance in the student tab and watch it appear **in real time** on the teacher dashboard map!

---

## ☁️ Connecting to your Firebase Project

When you are ready to connect to your real Firebase project:
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Under **Project settings** -> **General** -> **Your apps**, click the web icon (`</>`) to register a web app and copy your `firebaseConfig` object.
3. Open `firebase-config.js` and paste your config:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     storageBucket: "your-app.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef..."
   };
   ```
4. Enable **Cloud Firestore** in test mode or paste the rules from `firestore.rules`.
5. (Optional) Enable **Authentication** -> **Google Sign-in** if you want teachers to sign in with their Google accounts.
