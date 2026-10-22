// ============================================================================
// Student Attendance Check-In Logic
// ============================================================================

let currentSession = null;
let currentSessionName = "Oct22_Lec";
let detectedLocation = null;
let studentMiniMap = null;
let studentMarker = null;
let accuracyCircle = null;

// Toast helper
function showToast(message) {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "flex";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3200);
}

// Get query param
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Initialize Leaflet Mini Preview Map
function initMiniMap(lat, lng, accuracy) {
  const mapContainer = document.getElementById("studentMapPreview");
  if (!studentMiniMap) {
    studentMiniMap = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false
    }).setView([lat, lng], 17);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(studentMiniMap);
  } else {
    studentMiniMap.setView([lat, lng], 17);
  }

  if (studentMarker) studentMiniMap.removeLayer(studentMarker);
  if (accuracyCircle) studentMiniMap.removeLayer(accuracyCircle);

  studentMarker = L.marker([lat, lng]).addTo(studentMiniMap);
  accuracyCircle = L.circle([lat, lng], {
    radius: accuracy,
    color: "#2563eb",
    fillColor: "#3b82f6",
    fillOpacity: 0.15,
    weight: 1
  }).addTo(studentMiniMap);
}

// Acquire Device Geolocation
function requestGeolocation() {
  const badge = document.getElementById("gpsStatusBadge");
  const qualityMsg = document.getElementById("gpsQualityMsg");
  const latEl = document.getElementById("displayLat");
  const lngEl = document.getElementById("displayLng");
  const accEl = document.getElementById("displayAcc");

  badge.className = "gps-status-badge acquiring";
  badge.textContent = "Acquiring GPS...";
  qualityMsg.textContent = "Requesting device GPS coordinates...";

  if (!navigator.geolocation) {
    badge.className = "gps-status-badge error";
    badge.textContent = "Not Supported";
    qualityMsg.textContent = "Geolocation is not supported by your browser.";
    return;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      detectedLocation = {
        lat: latitude,
        lng: longitude,
        accuracy: Math.round(accuracy)
      };

      latEl.textContent = latitude.toFixed(5);
      lngEl.textContent = longitude.toFixed(5);
      accEl.textContent = `±${Math.round(accuracy)} m`;

      badge.className = "gps-status-badge ready";
      badge.textContent = "GPS Acquired";

      if (accuracy <= 25) {
        qualityMsg.textContent = "Excellent GPS precision (±" + Math.round(accuracy) + "m)";
        qualityMsg.style.color = "#16a34a";
      } else if (accuracy <= 100) {
        qualityMsg.textContent = "Good GPS precision (±" + Math.round(accuracy) + "m)";
        qualityMsg.style.color = "#2563eb";
      } else {
        qualityMsg.textContent = "Fair GPS precision (±" + Math.round(accuracy) + "m)";
        qualityMsg.style.color = "#d97706";
      }

      initMiniMap(latitude, longitude, accuracy);
    },
    (err) => {
      console.warn("Geolocation acquisition error:", err);
      detectedLocation = null;
      badge.className = "gps-status-badge error";
      badge.textContent = "GPS Required";
      
      let errMsg = "Location permission is required to record attendance.";
      if (err.code === 1) { // PERMISSION_DENIED
        errMsg = "Location access denied. Please allow location permission in your browser and click 'Retry GPS'.";
      } else if (err.code === 2) { // POSITION_UNAVAILABLE
        errMsg = "Location unavailable. Please ensure device GPS is turned on and click 'Retry GPS'.";
      } else if (err.code === 3) { // TIMEOUT
        errMsg = "GPS request timed out. Please click 'Retry GPS' or check device location.";
      }
      
      qualityMsg.textContent = errMsg;
      qualityMsg.style.color = "#dc2626";

      latEl.textContent = "--.-----";
      lngEl.textContent = "--.-----";
      accEl.textContent = "Not Acquired";

      if (studentMiniMap) {
        if (studentMarker) { studentMiniMap.removeLayer(studentMarker); studentMarker = null; }
        if (accuracyCircle) { studentMiniMap.removeLayer(accuracyCircle); accuracyCircle = null; }
      }
    },
    options
  );
}

// Evaluate session status and update UI
async function checkSessionStatus() {
  const urlSession = getQueryParam("session");
  if (urlSession) {
    currentSessionName = urlSession.trim();
  }

  const badgeEl = document.getElementById("sessionBadgeDisplay");
  const alertEl = document.getElementById("studentSessionAlert");
  const alertText = document.getElementById("studentSessionAlertText");
  const submitBtn = document.getElementById("submitAttendanceBtn");

  badgeEl.textContent = `Session: ${currentSessionName}`;

  currentSession = await window.AttendanceDB.getSession(currentSessionName);
  if (!currentSession) {
    // Try to get any active session
    const active = await window.AttendanceDB.getActiveSession();
    if (active) {
      currentSession = active;
      currentSessionName = active.name;
      badgeEl.textContent = `Session: ${currentSessionName}`;
    }
  }

  if (!currentSession) {
    alertEl.className = "status-banner closed";
    alertEl.style.display = "flex";
    alertText.textContent = `Session "${currentSessionName}" does not exist. Please check with your instructor.`;
    submitBtn.disabled = true;
    return;
  }

  // Check if session is closed or expired
  const now = Date.now();
  const isExpired = currentSession.expiresAt && new Date(currentSession.expiresAt).getTime() < now;
  const isClosed = currentSession.status === "CLOSED" || isExpired;

  if (isClosed) {
    alertEl.className = "status-banner closed";
    alertEl.style.display = "flex";
    alertText.textContent = `Session "${currentSessionName}" is CLOSED. Attendance submissions are no longer accepted.`;
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.6";
    submitBtn.style.cursor = "not-allowed";
  } else {
    alertEl.className = "status-banner active";
    alertEl.style.display = "flex";
    alertText.textContent = `Session "${currentSessionName}" is ACTIVE. You may mark your attendance now.`;
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    submitBtn.style.cursor = "pointer";
  }
}

// Initialize on load
document.addEventListener("DOMContentLoaded", async () => {
  await checkSessionStatus();
  requestGeolocation();

  // Retry GPS button
  document.getElementById("refreshGpsBtn").addEventListener("click", () => {
    requestGeolocation();
  });

  // Toggle IIT Jodhpur vs Other Affiliation
  const isIitjCheck = document.getElementById("isIitjCheck");
  const iitjRollContainer = document.getElementById("iitjRollContainer");
  const otherAffiliationContainer = document.getElementById("otherAffiliationContainer");
  const studentRollNo = document.getElementById("studentRollNo");
  const studentOtherAffiliation = document.getElementById("studentOtherAffiliation");

  function handleAffiliationToggle() {
    if (isIitjCheck.checked) {
      iitjRollContainer.style.display = "flex";
      studentRollNo.required = true;
      otherAffiliationContainer.style.display = "none";
      studentOtherAffiliation.required = false;
    } else {
      iitjRollContainer.style.display = "none";
      studentRollNo.required = false;
      otherAffiliationContainer.style.display = "flex";
      studentOtherAffiliation.required = true;
    }
  }

  isIitjCheck.addEventListener("change", handleAffiliationToggle);
  handleAffiliationToggle();

  // Handle Form Submission
  const form = document.getElementById("attendanceForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!detectedLocation || typeof detectedLocation.lat !== "number" || typeof detectedLocation.lng !== "number") {
      alert("⚠️ Your GPS location has not been acquired. Location detection is mandatory to mark attendance. Please enable location permissions on your browser and click 'Retry GPS'.");
      return;
    }

    const name = document.getElementById("studentName").value.trim();
    const email = document.getElementById("studentEmail").value.trim();
    const isIitj = isIitjCheck.checked;
    
    let affiliation = "";
    let rollNo = "";

    if (isIitj) {
      rollNo = studentRollNo.value.trim().toUpperCase();
      if (!rollNo) {
        alert("Please enter your IIT Jodhpur Roll Number.");
        studentRollNo.focus();
        return;
      }
      affiliation = rollNo;
    } else {
      const whereFrom = studentOtherAffiliation.value.trim();
      if (!whereFrom) {
        alert("Please enter where you are from (College / University / Affiliation).");
        studentOtherAffiliation.focus();
        return;
      }
      affiliation = whereFrom;
      rollNo = "--";
    }

    if (!name || !email || !affiliation) {
      alert("Please fill out all required fields.");
      return;
    }

    const submitBtn = document.getElementById("submitAttendanceBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting Attendance...";

    try {
      const record = await window.AttendanceDB.submitAttendance(currentSessionName, {
        name: name,
        email: email,
        affiliation: affiliation,
        rollNo: rollNo,
        isIitj: isIitj,
        lat: detectedLocation.lat,
        lng: detectedLocation.lng,
        accuracy: detectedLocation.accuracy
      });

      // Show receipt card
      document.getElementById("studentFormCard").style.display = "none";
      const receiptCard = document.getElementById("receiptCard");
      receiptCard.style.display = "block";

      document.getElementById("recSession").textContent = currentSessionName;
      document.getElementById("recName").textContent = record.name;
      document.getElementById("recEmail").textContent = record.email;
      document.getElementById("recAffiliation").textContent = isIitj ? `IIT Jodhpur (${rollNo})` : affiliation;
      document.getElementById("recGps").textContent = `±${record.accuracy} m (${record.lat.toFixed(5)}, ${record.lng.toFixed(5)})`;
      document.getElementById("recTime").textContent = new Date(record.timestamp).toLocaleString();
      document.getElementById("recId").textContent = record.id;

      showToast("Attendance verified and submitted!");
    } catch (err) {
      alert(err.message || "Failed to submit attendance. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "✓ Submit Attendance";
    }
  });

  // Done button
  document.getElementById("submitAnotherBtn").addEventListener("click", () => {
    window.location.reload();
  });
});
