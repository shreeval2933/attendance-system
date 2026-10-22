// ============================================================================
// Teacher Admin Dashboard Logic
// ============================================================================

let currentSessionName = "Oct22_Lec";
let map = null;
let markersLayer = null;
let centerCircle = null;
let centerMarker = null;
let qrcodeInstance = null;
let sessionTimerInterval = null;
let currentSubmissions = [];
let unsubscribeSubmissions = null;
let unsubscribeSession = null;

// Haversine Distance Calculator (returns distance in meters between two lat/lng points)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Compute median lat and median lng from an array of coordinates
function calculateMedianCoordinates(submissions) {
  const valid = submissions.filter(s => typeof s.lat === "number" && typeof s.lng === "number");
  if (valid.length === 0) return null;

  const lats = valid.map(s => s.lat).sort((a, b) => a - b);
  const lngs = valid.map(s => s.lng).sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);

  const medianLat = valid.length % 2 !== 0 ? lats[mid] : (lats[mid - 1] + lats[mid]) / 2;
  const medianLng = valid.length % 2 !== 0 ? lngs[mid] : (lngs[mid - 1] + lngs[mid]) / 2;

  return { lat: medianLat, lng: medianLng };
}

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

// Initialize Leaflet Map
function initMap() {
  if (map) return;
  const el = document.getElementById("adminMap");
  if (!el) return;
  const defaultCenter = [26.47338, 73.11728]; // Classroom coordinates
  map = L.map("adminMap").setView(defaultCenter, 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// Custom Leaflet Icons for clean differentiation
const normalIcon = L.divIcon({
  className: "custom-pin",
  html: `<div style="background-color:#2563eb; width:14px; height:14px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const flaggedIcon = L.divIcon({
  className: "custom-pin",
  html: `<div style="background-color:#dc2626; width:16px; height:16px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.5); animation: pulse 1.5s infinite;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const centerIcon = L.divIcon({
  className: "custom-pin-center",
  html: `<div style="background-color:#16a34a; width:18px; height:18px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:bold;">★</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

// Update or generate QR Code
function updateQrCode(sessionName) {
  const qrContainer = document.getElementById("qrcode");
  const linkEl = document.getElementById("qrDirectLink");
  
  // Construct absolute URL to student.html with session param
  const url = new URL("student.html", window.location.href);
  url.searchParams.set("session", sessionName);
  const studentUrl = url.toString();

  linkEl.href = studentUrl;
  linkEl.textContent = studentUrl;

  qrContainer.innerHTML = "";
  qrcodeInstance = new QRCode(qrContainer, {
    text: studentUrl,
    width: 180,
    height: 180,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

// Render submissions on Map & Table
function renderSubmissions(submissions, session) {
  currentSubmissions = submissions;
  const countEl = document.getElementById("submissionCount");
  const tableBody = document.getElementById("submissionsTableBody");
  const flagThreshold = parseFloat(document.getElementById("flagFartherThan").value) || 150;
  const maxGpsError = parseFloat(document.getElementById("maxGpsError").value) || 200;

  countEl.textContent = submissions.length;
  tableBody.innerHTML = "";
  markersLayer.clearLayers();

  if (centerCircle) {
    map.removeLayer(centerCircle);
    centerCircle = null;
  }
  if (centerMarker) {
    map.removeLayer(centerMarker);
    centerMarker = null;
  }

  // Draw classroom center if configured (reads live input coordinates first)
  const inputLat = parseFloat(document.getElementById("centerLat") ? document.getElementById("centerLat").value : NaN);
  const inputLng = parseFloat(document.getElementById("centerLng") ? document.getElementById("centerLng").value : NaN);
  const inputRadius = parseFloat(document.getElementById("centerRadius") ? document.getElementById("centerRadius").value : NaN);

  const centerLat = !isNaN(inputLat) ? inputLat : (session && session.centerLat ? Number(session.centerLat) : 26.47338);
  const centerLng = !isNaN(inputLng) ? inputLng : (session && session.centerLng ? Number(session.centerLng) : 73.11728);
  const centerRadius = !isNaN(inputRadius) ? inputRadius : (session && session.centerRadius ? Number(session.centerRadius) : 150);

  const enforceCheckbox = document.getElementById("enforceCenterCheckbox");
  const enforceCenter = Boolean(enforceCheckbox && enforceCheckbox.checked && centerLat !== null && centerLng !== null);

  if (centerLat !== null && centerLng !== null) {
    centerMarker = L.marker([centerLat, centerLng], { icon: centerIcon }).addTo(map)
      .bindPopup(`<b>Classroom Center</b><br/>Lat: ${centerLat}<br/>Lng: ${centerLng}<br/>Radius: ${centerRadius}m<br/>Geofencing: <b>${enforceCenter ? 'Active (Strict)' : 'Off (Reference)'}</b>`);

    centerCircle = L.circle([centerLat, centerLng], {
      radius: centerRadius,
      color: enforceCenter ? "#2563eb" : "#94a3b8",
      fillColor: enforceCenter ? "#3b82f6" : "#cbd5e1",
      fillOpacity: enforceCenter ? 0.15 : 0.05,
      weight: enforceCenter ? 2 : 1,
      dashArray: "4, 6"
    }).addTo(map);
  }

  // Calculate class median coordinates
  const medianCoords = calculateMedianCoordinates(submissions);
  const latLngList = [];

  submissions.forEach((sub, idx) => {
    const timeFormatted = sub.timestamp ? new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--";
    
    // Compute distance from group median
    const distGroup = (medianCoords && sub.lat && sub.lng && submissions.length > 1)
      ? calculateHaversineDistance(medianCoords.lat, medianCoords.lng, sub.lat, sub.lng)
      : 0;

    // Compute distance from classroom center (if center is set)
    const distCenter = (centerLat && centerLng && sub.lat && sub.lng)
      ? calculateHaversineDistance(centerLat, centerLng, sub.lat, sub.lng)
      : null;

    // Check flagging criteria with transparent specific reasons
    const flagReasons = [];
    if (distGroup !== null && distGroup > flagThreshold) {
      flagReasons.push(`> ${flagThreshold}m from class median (${distGroup}m)`);
    }
    if (enforceCenter && distCenter !== null && distCenter > centerRadius) {
      flagReasons.push(`> ${centerRadius}m from classroom (${distCenter}m)`);
    }
    if (sub.accuracy && sub.accuracy > maxGpsError) {
      flagReasons.push(`GPS error ±${Math.round(sub.accuracy)}m > max ±${maxGpsError}m`);
    }

    const isFlagged = flagReasons.length > 0;

    // Add marker to map
    if (sub.lat && sub.lng) {
      const marker = L.marker([sub.lat, sub.lng], {
        icon: isFlagged ? flaggedIcon : normalIcon
      }).addTo(markersLayer);

      marker.bindPopup(`
        <div style="font-size:12px; line-height:1.4;">
          <strong>${sub.name || 'Anonymous'}</strong><br/>
          <span style="color:#64748b;">${sub.email || ''}</span><br/>
          ${sub.isIitj ? `Roll No: <b>${sub.rollNo || sub.affiliation}</b> <span style="color:#2563eb; font-size:10px;">(IIT Jodhpur)</span>` : `Affiliation: <b>${sub.affiliation || '--'}</b>`}<br/>
          Dist from Median: <b>${distGroup !== null ? distGroup + ' m' : '--'}</b><br/>
          ${distCenter !== null ? `Dist from Center: <b>${distCenter} m</b><br/>` : ''}
          GPS Accuracy: ±${sub.accuracy || '--'} m<br/>
          Status: <b style="color:${isFlagged ? '#dc2626' : '#16a34a'}">${isFlagged ? 'FLAGGED: ' + flagReasons.join(', ') : 'VALID'}</b>
        </div>
      `);

      latLngList.push([sub.lat, sub.lng]);

      sub._marker = marker;
    }

    const rollDisplay = sub.rollNo ? sub.rollNo : (sub.affiliation || "--");
    const flagDisplay = isFlagged 
      ? `<span class="badge badge-flagged" title="${flagReasons.join('; ')}">Flagged</span>` 
      : `<span class="badge badge-valid">Valid</span>`;

    // Append table row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td style="white-space:nowrap; font-family:monospace;">${timeFormatted}</td>
      <td><strong>${sub.name || "--"}</strong></td>
      <td>${rollDisplay}</td>
      <td style="font-family:monospace; font-size:0.8rem; color:#475569;">${sub.email || "--"}</td>
      <td>${distGroup !== null ? distGroup : "--"}</td>
      <td>${distCenter !== null ? distCenter : "--"}</td>
      <td>±${sub.accuracy ? Math.round(sub.accuracy) : "--"}</td>
      <td>${flagDisplay}</td>
      <td>
        ${sub.lat && sub.lng ? `<a href="#" class="locate-btn" data-idx="${idx}" style="color:#2563eb; text-decoration:none; font-weight:600;">Open</a>` : '--'}
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach click listeners to map links
  document.querySelectorAll(".locate-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(btn.getAttribute("data-idx"));
      const target = submissions[idx];
      if (target && target.lat && target.lng) {
        map.setView([target.lat, target.lng], 18);
        if (target._marker) {
          target._marker.openPopup();
        }
      }
    });
  });

  // Adjust map viewport to show all markers
  if (latLngList.length > 0) {
    const bounds = L.latLngBounds(latLngList);
    if (centerLat && centerLng) bounds.extend([centerLat, centerLng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  } else if (centerLat && centerLng) {
    map.setView([centerLat, centerLng], 16);
  }
}

// Update the Session Status banner & countdown timer
function updateSessionStatusUI(session) {
  const banner = document.getElementById("sessionStatusBanner");
  const bannerText = document.getElementById("statusBannerText");
  const bannerTimer = document.getElementById("statusBannerTimer");

  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }

  if (!session) {
    banner.className = "status-banner closed";
    bannerText.textContent = `Session "${currentSessionName}" — NOT FOUND`;
    bannerTimer.textContent = "--:--";
    return;
  }

  const status = session.status || "READY";
  const sessionName = session.name || currentSessionName;

  if (status === "ACTIVE") {
    banner.className = "status-banner active";
    
    function tick() {
      const now = Date.now();
      const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : now;
      const diffMs = expiresAt - now;

      if (diffMs <= 0) {
        banner.className = "status-banner closed";
        bannerText.textContent = `Session "${sessionName}" — CLOSED (time over)`;
        bannerTimer.textContent = "00:00";
        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
        // Automatically mark as closed
        window.AttendanceDB.stopSession(sessionName).catch(console.error);
      } else {
        const totalSecs = Math.floor(diffMs / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        bannerText.textContent = `Session "${sessionName}" — ACTIVE (${mins} min left)`;
        bannerTimer.textContent = timeStr;
      }
    }

    tick();
    sessionTimerInterval = setInterval(tick, 1000);
  } else if (status === "CLOSED") {
    banner.className = "status-banner closed";
    bannerText.textContent = `Session "${sessionName}" — CLOSED (time over)`;
    bannerTimer.textContent = "00:00";
  } else {
    // Scheduled / Ready
    banner.className = "status-banner scheduled";
    bannerText.textContent = `Session "${sessionName}" — READY (waiting to start)`;
    bannerTimer.textContent = "READY";
  }
}

// Load a session by name and listen to changes
async function loadSessionData(sessionName) {
  currentSessionName = sessionName.trim();
  document.getElementById("sessionName").value = currentSessionName;
  document.getElementById("sessionToView").value = currentSessionName;

  // Unsubscribe old listeners
  if (unsubscribeSubmissions) unsubscribeSubmissions();
  if (unsubscribeSession) unsubscribeSession();

  updateQrCode(currentSessionName);

  let session = await window.AttendanceDB.getSession(currentSessionName);
  if (!session) {
    // Create new skeleton session if not found
    session = {
      name: currentSessionName,
      openMinutes: 15,
      maxGpsError: 200,
      centerRadius: 150,
      status: "READY"
    };
  }

  // Populate form fields (without clobbering active user typing)
  if (session.openMinutes && document.activeElement !== document.getElementById("openMinutes")) {
    document.getElementById("openMinutes").value = session.openMinutes;
  }
  if (session.maxGpsError && document.activeElement !== document.getElementById("maxGpsError")) {
    document.getElementById("maxGpsError").value = session.maxGpsError;
  }
  if (document.getElementById("enforceCenterCheckbox")) {
    document.getElementById("enforceCenterCheckbox").checked = Boolean(session.enforceCenter);
  }
  if (session.centerLat !== undefined && session.centerLat !== null) {
    document.getElementById("centerLat").value = session.centerLat;
  } else if (!document.getElementById("centerLat").value) {
    document.getElementById("centerLat").value = "26.47338";
  }

  if (session.centerLng !== undefined && session.centerLng !== null) {
    document.getElementById("centerLng").value = session.centerLng;
  } else if (!document.getElementById("centerLng").value) {
    document.getElementById("centerLng").value = "73.11728";
  }

  if (session.centerRadius) {
    document.getElementById("centerRadius").value = session.centerRadius;
  } else if (!document.getElementById("centerRadius").value) {
    document.getElementById("centerRadius").value = "150";
  }
  if (session.scheduledStart) document.getElementById("scheduledStart").value = session.scheduledStart;

  updateSessionStatusUI(session);

  // Subscribe to live session updates
  unsubscribeSession = window.AttendanceDB.onSessionChange(currentSessionName, (updatedSession) => {
    updateSessionStatusUI(updatedSession);
    if (updatedSession) {
      if (updatedSession.openMinutes && document.activeElement !== document.getElementById("openMinutes")) {
        document.getElementById("openMinutes").value = updatedSession.openMinutes;
      }
    }
  });

  // Subscribe to live submissions updates
  unsubscribeSubmissions = window.AttendanceDB.onSubmissionsChange(currentSessionName, (submissions) => {
    renderSubmissions(submissions, session);
  });
}

// CSV Export
function downloadSubmissionsCSV() {
  if (!currentSubmissions || currentSubmissions.length === 0) {
    showToast("No submissions to export!");
    return;
  }

  const headers = ["Index", "Time", "Name", "Roll/Affiliation", "Email", "Latitude", "Longitude", "GPS Accuracy (m)", "Dist from Median (m)", "Dist from Center (m)", "Status"];
  const rows = currentSubmissions.map((sub, i) => [
    i + 1,
    sub.timestamp ? new Date(sub.timestamp).toLocaleString() : "",
    `"${(sub.name || "").replace(/"/g, '""')}"`,
    `"${(sub.rollNo || sub.affiliation || "").replace(/"/g, '""')}"`,
    sub.email || "",
    sub.lat || "",
    sub.lng || "",
    sub.accuracy || "",
    sub.distanceFromGroup !== undefined ? sub.distanceFromGroup : "",
    sub.distanceFromCenter !== undefined ? sub.distanceFromCenter : "",
    sub.flagged ? "Flagged" : "Valid"
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `attendance_${currentSessionName}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("CSV downloaded successfully!");
}

// ==========================================================================
// Admin Security Gate Logic (Master PIN & Immediate Auth)
// ==========================================================================
const REQUIRED_ADMIN_PIN = "2933";

function getStoredAdminPin() {
  return localStorage.getItem("attendance_admin_secret_pin") || REQUIRED_ADMIN_PIN;
}

function verifyAdminPin(entered) {
  if (!entered) return false;
  const clean = String(entered).trim();
  const custom = (localStorage.getItem("attendance_admin_secret_pin") || "").trim();
  // PIN 2933 MUST open. Any other PIN will return false.
  return clean === REQUIRED_ADMIN_PIN || (custom.length > 0 && clean === custom);
}

let isDashboardLoaded = false;

function unlockDashboard() {
  document.body.classList.remove("admin-locked");
  const lockError = document.getElementById("adminLockError");
  const pinInput = document.getElementById("adminPinInput");

  if (lockError) lockError.style.display = "none";
  if (pinInput) pinInput.value = "";

  // Initialize Map, QR Code, and Session ONLY AFTER unlock
  if (!isDashboardLoaded) {
    isDashboardLoaded = true;
    try {
      initMap();
    } catch (err) {
      console.error("Map initialization failed:", err);
    }

    const modeBadge = document.getElementById("firebaseModeBadge");
    if (modeBadge) {
      if (window.AttendanceDB && window.AttendanceDB.isConfigured()) {
        modeBadge.textContent = "Firebase Live";
        modeBadge.style.background = "#dcfce7";
        modeBadge.style.color = "#15803d";
        modeBadge.style.borderColor = "#86efac";
      } else {
        modeBadge.textContent = "Local Multi-Tab Sync";
      }
    }

    loadSessionData(currentSessionName).catch((err) => {
      console.error("Error loading session data:", err);
    });
  } else if (map) {
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (err) {
        console.warn("Map resize warning:", err);
      }
    }, 150);
  }
}

function lockDashboard() {
  document.body.classList.add("admin-locked");
  const lockError = document.getElementById("adminLockError");
  const pinInput = document.getElementById("adminPinInput");

  if (lockError) lockError.style.display = "none";
  if (pinInput) {
    pinInput.value = "";
    setTimeout(() => pinInput.focus(), 60);
  }
}

// Expose globally so inline HTML form can trigger immediately
window.unlockDashboard = unlockDashboard;
window.lockDashboard = lockDashboard;
window.verifyAdminPin = verifyAdminPin;

// Event Bindings
document.addEventListener("DOMContentLoaded", () => {
  // 1. Immediately Bind & Execute Security Lock Screen
  const lockForm = document.getElementById("adminLockForm");
  const pinInput = document.getElementById("adminPinInput");
  const lockError = document.getElementById("adminLockError");
  const lockDashboardBtn = document.getElementById("lockDashboardBtn");
  const updateAdminPinBtn = document.getElementById("updateAdminPinBtn");
  const newAdminPinInput = document.getElementById("newAdminPinInput");

  let isUnlocking = false;

  function handleUnlockAttempt() {
    if (isUnlocking) return;
    const entered = pinInput ? pinInput.value.trim() : "";
    if (!entered) return;

    if (verifyAdminPin(entered)) {
      isUnlocking = true;
      if (lockError) lockError.style.display = "none";
      unlockDashboard();
      showToast("Access Granted. Welcome, Teacher!");
      setTimeout(() => {
        isUnlocking = false;
      }, 500);
    } else {
      if (lockError) {
        lockError.style.display = "block";
      }
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
        pinInput.style.borderColor = "#dc2626";
        pinInput.style.backgroundColor = "#fff1f2";
        setTimeout(() => {
          pinInput.style.borderColor = "";
          pinInput.style.backgroundColor = "";
        }, 1200);
      }
      showToast("❌ Incorrect PIN. Access denied.");
    }
  }

  if (lockForm) {
    lockForm.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleUnlockAttempt();
      return false;
    });
  }

  if (pinInput) {
    pinInput.addEventListener("input", () => {
      if (lockError) lockError.style.display = "none";
    });
  }

  // Every time admin page is opened or reloaded, strictly enforce lock and empty password field
  lockDashboard();
  if (pinInput) pinInput.value = "";
  setTimeout(() => { if (pinInput) pinInput.value = ""; }, 120);
  setTimeout(() => { if (pinInput) pinInput.value = ""; }, 300);

  if (lockDashboardBtn) {
    lockDashboardBtn.addEventListener("click", () => {
      lockDashboard();
      showToast("Dashboard locked.");
    });
  }

  if (updateAdminPinBtn) {
    updateAdminPinBtn.addEventListener("click", () => {
      const newPin = newAdminPinInput ? newAdminPinInput.value.trim() : "";
      if (!newPin || newPin.length < 4) {
        alert("Please enter a valid PIN of at least 4 characters.");
        return;
      }
      localStorage.setItem("attendance_admin_secret_pin", newPin);
      if (newAdminPinInput) newAdminPinInput.value = "";
      showToast("Admin Secret PIN successfully updated!");
    });
  }

  // Toggle collapsible location enforcement
  const toggleBtn = document.getElementById("toggleGeoEnforcement");
  const toggleArrow = document.getElementById("toggleArrow");
  const geoContent = document.getElementById("geoEnforcementContent");
  if (toggleBtn && geoContent) {
    toggleBtn.addEventListener("click", () => {
      geoContent.classList.toggle("open");
      if (toggleArrow) {
        toggleArrow.textContent = geoContent.classList.contains("open") ? "▼" : "▶";
      }
    });
  }

  // Action Button: Save session
  document.getElementById("saveSessionBtn").addEventListener("click", async () => {
    const sName = document.getElementById("sessionName").value.trim();
    if (!sName) {
      alert("Please enter a valid session name");
      return;
    }

    const mins = parseInt(document.getElementById("openMinutes").value, 10) || 15;
    const enforceCenter = document.getElementById("enforceCenterCheckbox").checked;

    const payload = {
      name: sName,
      scheduledStart: document.getElementById("scheduledStart").value,
      openMinutes: mins,
      maxGpsError: parseInt(document.getElementById("maxGpsError").value, 10) || 500,
      enforceCenter: enforceCenter,
      centerLat: document.getElementById("centerLat").value ? parseFloat(document.getElementById("centerLat").value) : null,
      centerLng: document.getElementById("centerLng").value ? parseFloat(document.getElementById("centerLng").value) : null,
      centerRadius: parseInt(document.getElementById("centerRadius").value, 10) || 150
    };

    try {
      await window.AttendanceDB.saveSession(payload);
      showToast(`Session "${sName}" saved (${mins} mins duration)!`);
      if (sName !== currentSessionName) {
        await loadSessionData(sName);
      } else {
        const session = await window.AttendanceDB.getSession(currentSessionName);
        renderSubmissions(currentSubmissions, session);
      }
    } catch (e) {
      alert("Failed to save session: " + e.message);
    }
  });

  // Action Button: Start now
  document.getElementById("startNowBtn").addEventListener("click", async () => {
    const sName = document.getElementById("sessionName").value.trim();
    const mins = parseInt(document.getElementById("openMinutes").value, 10) || 15;
    const enforceCenter = document.getElementById("enforceCenterCheckbox").checked;

    try {
      // Save current parameters alongside starting
      await window.AttendanceDB.saveSession({
        name: sName,
        openMinutes: mins,
        maxGpsError: parseInt(document.getElementById("maxGpsError").value, 10) || 500,
        enforceCenter: enforceCenter,
        centerLat: document.getElementById("centerLat").value ? parseFloat(document.getElementById("centerLat").value) : null,
        centerLng: document.getElementById("centerLng").value ? parseFloat(document.getElementById("centerLng").value) : null,
        centerRadius: parseInt(document.getElementById("centerRadius").value, 10) || 150
      });

      await window.AttendanceDB.startSession(sName, mins);
      showToast(`Session "${sName}" is now ACTIVE for ${mins} minutes!`);
      await loadSessionData(sName);
    } catch (e) {
      alert("Error starting session: " + e.message);
    }
  });

  // Action Button: Stop now
  document.getElementById("stopNowBtn").addEventListener("click", async () => {
    const sName = document.getElementById("sessionName").value.trim();
    try {
      await window.AttendanceDB.stopSession(sName);
      showToast(`Session "${sName}" CLOSED.`);
      await loadSessionData(sName);
    } catch (e) {
      alert("Error stopping session: " + e.message);
    }
  });

  // Action Button: +5 min
  document.getElementById("add5MinBtn").addEventListener("click", async () => {
    const sName = document.getElementById("sessionName").value.trim();
    try {
      await window.AttendanceDB.extendSession(sName, 5);
      showToast(`Extended "${sName}" by +5 minutes!`);
      await loadSessionData(sName);
    } catch (e) {
      alert("Error extending session: " + e.message);
    }
  });

  // Action Button: Load session
  document.getElementById("loadSessionBtn").addEventListener("click", () => {
    const sName = document.getElementById("sessionToView").value.trim();
    if (sName) {
      loadSessionData(sName);
      showToast(`Loaded session: ${sName}`);
    }
  });

  // Action Button: Clear Submissions
  document.getElementById("clearSubmissionsBtn").addEventListener("click", async () => {
    if (confirm(`Are you sure you want to delete all attendance records for "${currentSessionName}"? This allows you to test freshly with zero students.`)) {
      try {
        await window.AttendanceDB.clearSubmissions(currentSessionName);
        currentSubmissions = [];
        const session = await window.AttendanceDB.getSession(currentSessionName);
        renderSubmissions([], session);
        showToast("Cleared all records for this session!");
      } catch (e) {
        alert("Failed to clear submissions: " + e.message);
      }
    }
  });

  // Live filter/setting change re-rendering
  function triggerRerender() {
    window.AttendanceDB.getSession(currentSessionName).then(session => {
      renderSubmissions(currentSubmissions, session);
    });
  }

  document.getElementById("flagFartherThan").addEventListener("input", triggerRerender);
  document.getElementById("maxGpsError").addEventListener("input", triggerRerender);
  document.getElementById("enforceCenterCheckbox").addEventListener("change", triggerRerender);
  document.getElementById("centerLat").addEventListener("input", triggerRerender);
  document.getElementById("centerLng").addEventListener("input", triggerRerender);
  document.getElementById("centerRadius").addEventListener("input", triggerRerender);

  // Teacher GPS as classroom center
  document.getElementById("useTeacherLocationBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    showToast("Detecting your GPS location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById("centerLat").value = pos.coords.latitude.toFixed(5);
        document.getElementById("centerLng").value = pos.coords.longitude.toFixed(5);
        document.getElementById("enforceCenterCheckbox").checked = true;
        showToast("Classroom center set to current coordinates & geofencing enabled!");
        triggerRerender();
      },
      (err) => {
        alert("Failed to get location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // Copy QR Link
  document.getElementById("copyLinkBtn").addEventListener("click", () => {
    const linkText = document.getElementById("qrDirectLink").href;
    navigator.clipboard.writeText(linkText).then(() => {
      showToast("Student attendance link copied to clipboard!");
    });
  });

  // Download QR image
  document.getElementById("downloadQrBtn").addEventListener("click", () => {
    const canvas = document.querySelector("#qrcode canvas");
    const img = document.querySelector("#qrcode img");
    let dataUrl = "";
    if (canvas) {
      dataUrl = canvas.toDataURL("image/png");
    } else if (img) {
      dataUrl = img.src;
    }
    if (dataUrl) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `QR_${currentSessionName}.png`;
      a.click();
      showToast("QR code downloaded!");
    }
  });

  // Download CSV
  document.getElementById("downloadCsvBtn").addEventListener("click", downloadSubmissionsCSV);

  // Live QR Code updating as teacher types session name
  document.getElementById("sessionName").addEventListener("input", (e) => {
    const name = e.target.value.trim();
    if (name) {
      updateQrCode(name);
    }
  });

  // Google Sign-in / Auth Handler (if enabled in UI)
  const authBtnText = document.getElementById("authBtnText");
  const teacherEmailBadge = document.getElementById("teacherEmailBadge");
  const googleAuthBtn = document.getElementById("googleAuthBtn");

  // Restore saved email from localStorage in local mode
  const savedTeacherEmail = localStorage.getItem("attendance_teacher_email");
  if (savedTeacherEmail && teacherEmailBadge) {
    teacherEmailBadge.textContent = savedTeacherEmail;
  }

  // If live Firebase Auth is available, listen to real auth state
  if (window.AttendanceDB.isConfigured() && typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        if (teacherEmailBadge) teacherEmailBadge.textContent = user.email;
        if (authBtnText) authBtnText.textContent = "Sign Out";
        localStorage.setItem("attendance_teacher_email", user.email);
      } else {
        if (authBtnText) authBtnText.textContent = "Sign in with Google";
      }
    });
  }

  if (googleAuthBtn) {
    googleAuthBtn.addEventListener("click", async () => {
      if (window.AttendanceDB.isConfigured() && typeof firebase !== "undefined" && firebase.auth) {
        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
          if (confirm(`Currently signed in as ${currentUser.email}. Do you want to sign out?`)) {
            await firebase.auth().signOut();
            showToast("Signed out successfully");
          }
        } else {
          const provider = new firebase.auth.GoogleAuthProvider();
          firebase.auth().signInWithPopup(provider)
            .then(result => {
              if (teacherEmailBadge) teacherEmailBadge.textContent = result.user.email;
              if (authBtnText) authBtnText.textContent = "Sign Out";
              showToast(`Signed in as ${result.user.email}`);
            })
            .catch(err => {
              console.error("Google Auth error:", err);
              alert("Google Sign-In error: " + err.message);
            });
        }
      } else {
        // Local/Demo Mode prompt
        const current = (teacherEmailBadge && teacherEmailBadge.textContent) || "teacher@institution.edu";
        const email = prompt("Enter teacher profile email:", current);
        if (email && email.trim()) {
          const clean = email.trim().toLowerCase();
          if (teacherEmailBadge) teacherEmailBadge.textContent = clean;
          localStorage.setItem("attendance_teacher_email", clean);
          showToast(`Teacher profile updated: ${clean}`);
        }
      }
    });
  }

  // Settings Modal
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsModalBtn").addEventListener("click", () => {
    modal.style.display = "flex";
  });
  document.getElementById("closeSettingsModalBtn").addEventListener("click", () => {
    modal.style.display = "none";
  });
});
