import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
});

// Component to handle map camera movement
function MapController({ activeVehicle }) {
  const map = useMap();
  useEffect(() => {
    if (activeVehicle) map.flyTo([activeVehicle.lat, activeVehicle.lng], 16, { duration: 1.5 });
  }, [activeVehicle, map]);
  return null;
}

function App() {
  // ─── LIVE CLOUD ENDPOINT CONFIGURATION ─────────────────────────────
  const API_BASE_URL = "https://motorcare-backend-1.onrender.com/api/vehicles";

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  
  // Data State
  const [vehicles, setVehicles] = useState(() => {
    const saved = localStorage.getItem('mc_fleet');
    return saved ? JSON.parse(saved) : [
      { plate: 'KCB 123X', sacco: 'Classic Sacco', route: 'Kericho - Kisumu', type: '14-Seater Matatu', lastService: 45000, currentKm: 51000, lat: -0.3689, lng: 35.2863, status: 'Active' }
    ];
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('mc_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Form States
  const [maintForm, setMaintForm] = useState({ plate: '', task: '' });
  const [newVehicle, setNewVehicle] = useState({ plate: '', sacco: '', route: '', type: '14-Seater Matatu', currentKm: '', lastService: '' });

  // Fallback Local Persistence
  useEffect(() => { localStorage.setItem('mc_fleet', JSON.stringify(vehicles)); }, [vehicles]);
  useEffect(() => { localStorage.setItem('mc_history', JSON.stringify(history)); }, [history]);

  // --- LIVE LOCATION TRACKING LOGIC ---
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation({ lat: latitude, lng: longitude });

        // Update the location of the FIRST vehicle dynamically
        setVehicles(prev => prev.map((v, index) => 
          index === 0 ? { ...v, lat: latitude, lng: longitude } : v
        ));
      },
      (err) => console.error("GPS Error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  // ─── NETWORK SYNC HANDLERS ─────────────────────────────────────────
  
  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicle.plate) return;
    
    const vehicleData = { 
      plateNumber: newVehicle.plate,
      ownerName: "Sacco Operator", 
      saccoName: newVehicle.sacco || "General Sacco",
      route: newVehicle.route || "Local Route",
      vehicleType: newVehicle.type || "Matatu",
      currentKm: parseInt(newVehicle.currentKm) || 0, 
      lastService: parseInt(newVehicle.lastService) || 0,
      lat: driverLocation?.lat || -0.3689, 
      lng: driverLocation?.lng || 35.2863,
      status: 'Active' 
    };

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleData)
      });

      if (response.status === 201) {
        const localVehicleObj = {
          plate: vehicleData.plateNumber,
          sacco: vehicleData.saccoName,
          route: vehicleData.route,
          type: vehicleData.vehicleType,
          currentKm: vehicleData.currentKm,
          lastService: vehicleData.lastService,
          lat: vehicleData.lat,
          lng: vehicleData.lng,
          status: vehicleData.status
        };
        setVehicles([...vehicles, localVehicleObj]);
        setNewVehicle({ plate: '', sacco: '', route: '', type: '14-Seater Matatu', currentKm: '', lastService: '' });
        setCurrentTab('dashboard');
      }
    } catch (error) {
      console.error("Sync Error:", error);
      setVehicles([...vehicles, {
        plate: vehicleData.plateNumber, sacco: vehicleData.saccoName, route: vehicleData.route, type: vehicleData.vehicleType,
        currentKm: vehicleData.currentKm, lastService: vehicleData.lastService, lat: vehicleData.lat, lng: vehicleData.lng, status: 'Local-Only'
      }]);
      setNewVehicle({ plate: '', sacco: '', route: '', type: '14-Seater Matatu', currentKm: '', lastService: '' });
      setCurrentTab('dashboard');
    }
  };

  const handleLogMaintenance = async (e) => {
    e.preventDefault();
    if (!maintForm.plate) return;

    const entry = { ...maintForm, date: new Date().toLocaleDateString() };
    
    try {
      await fetch(`${API_BASE_URL}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateNumber: maintForm.plate, notes: maintForm.task })
      });

      setHistory([entry, ...history]);
      setVehicles(vehicles.map(v => 
          v.plate === maintForm.plate ? { ...v, lastService: v.currentKm } : v
      ));
      setMaintForm({ plate: '', task: '' });
      setCurrentTab('dashboard');
    } catch (error) {
      console.error("Maintenance Sync Failed:", error);
      setHistory([entry, ...history]);
      setVehicles(vehicles.map(v => v.plate === maintForm.plate ? { ...v, lastService: v.currentKm } : v));
      setMaintForm({ plate: '', task: '' });
      setCurrentTab('dashboard');
    }
  };

  const isOverdue = (v) => (v.currentKm - (v.lastService || 0)) >= 5000;

  return (
    <div style={layoutStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={logoCircle}>
            {/* Custom SVG: Mechanics Gear combined with a Log Checklist */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94.77l-6.91 6.91a2.12 2.12 0 0 0 3 3l6.91-6.91a6 6 0 0 1 .77-7.94l-3.77 3.77z" />
              <path d="M4 14H2" />
              <path d="M10 20v2" />
              <path d="M4 20H2" />
              <path d="M7 17v5" />
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#fff', letterSpacing: '0.5px' }}>
            MAT MAINTENANCE <span style={{ color: '#38bdf8' }}>APP</span>
          </h1>
        </div>
        <div style={statBadge}>{vehicles.length} UNITS</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        
        {/* DASHBOARD */}
        {currentTab === 'dashboard' && (
          <div style={containerStyle}>
            <div style={{display: 'flex', gap: '12px', marginBottom: '35px'}}>
               <button onClick={() => setCurrentTab('fleet')} style={actionButton('#38bdf8')}>🚐 Add Fleet</button>
               <button onClick={() => setCurrentTab('maintenance')} style={actionButton('#f8fafc')}>🛠️ Maintenance</button>
            </div>

            <h2 style={sectionLabel}>FLEET STATUS & ALERTS</h2>
            {vehicles.map(v => (
              <div key={v.plate} style={isOverdue(v) ? alertCard : normalCard}>
                <div>
                  <div style={{fontWeight: 'bold', fontSize: '15px', color: '#fff'}}>{v.plate}</div>
                  <div style={{fontSize: '12px', color: '#94a3b8', marginTop: '4px'}}>
                    {v.sacco} • Route: {v.route}
                  </div>
                  <div style={{fontSize: '11px', color: '#64748b', marginTop: '2px'}}>
                    Type: {v.type}
                  </div>
                  <div style={{fontSize: '11px', color: isOverdue(v) ? '#38bdf8' : '#10b981', marginTop: '6px', fontWeight: '600'}}>
                     {isOverdue(v) ? '⚠️ SERVICE OVERDUE' : '✅ Operational'}
                  </div>
                </div>
                <button onClick={() => { setActiveVehicle(v); setCurrentTab('map'); }} style={trackBtn}>VIEW MAP</button>
              </div>
            ))}
          </div>
        )}

        {/* MAINTENANCE FORM & HISTORY */}
        {currentTab === 'maintenance' && (
          <div style={containerStyle}>
            <div style={{...formBox, border: '1px solid #38bdf8'}}>
              <h3 style={formTitle}>RESET SERVICE COUNTER</h3>
              <select style={inputStyle} value={maintForm.plate} onChange={e => setMaintForm({...maintForm, plate: e.target.value})}>
                <option value="">Select Plate</option>
                {vehicles.map(v => <option key={v.plate} value={v.plate}>{v.plate}</option>)}
              </select>
              <input placeholder="Service Notes (e.g. Oil Change)" style={inputStyle} value={maintForm.task} onChange={e => setMaintForm({...maintForm, task: e.target.value})} />
              <button onClick={handleLogMaintenance} style={saveBtn}>LOG SERVICE</button>
            </div>

            <h2 style={{...sectionLabel, marginTop: '30px'}}>RECENT LOGS</h2>
            {history.length > 0 ? (
              history.map((h, i) => (
                <div key={i} style={historyCard}>
                  <div style={{fontWeight: 'bold', color: '#fff'}}>{h.plate}</div>
                  <div style={{fontSize: '12px', color: '#64748b', marginTop: '5px'}}>
                    {h.task} — {h.date}
                  </div>
                </div>
              ))
            ) : (
              <div style={{textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '20px'}}>
                No records found.
              </div>
            )}
          </div>
        )}

        {/* FLEET FORM */}
        {currentTab === 'fleet' && (
          <div style={containerStyle}>
            <div style={formBox}>
              <h3 style={formTitle}>REGISTER VEHICLE</h3>
              <input placeholder="Plate Number" style={inputStyle} value={newVehicle.plate} onChange={e => setNewVehicle({...newVehicle, plate: e.target.value.toUpperCase()})} />
              <input placeholder="Sacco Name (e.g., Classic Sacco)" style={inputStyle} value={newVehicle.sacco} onChange={e => setNewVehicle({...newVehicle, sacco: e.target.value})} />
              <input placeholder="Route Description (e.g., Kericho - Kisumu)" style={inputStyle} value={newVehicle.route} onChange={e => setNewVehicle({...newVehicle, route: e.target.value})} />
              
              <select style={inputStyle} value={newVehicle.type} onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}>
                <option value="14-Seater Matatu">14-Seater Matatu</option>
                <option value="33-Seater Nganya">33-Seater Nganya</option>
                <option value="7-Seater Shuttle">7-Seater Shuttle</option>
                <option value="Other Fleet Vehicle">Other Fleet Vehicle</option>
              </select>

              <input placeholder="Current KM" type="number" style={inputStyle} value={newVehicle.currentKm} onChange={e => setNewVehicle({...newVehicle, currentKm: e.target.value})} />
              <input placeholder="Last Service KM" type="number" style={inputStyle} value={newVehicle.lastService} onChange={e => setNewVehicle({...newVehicle, lastService: e.target.value})} />
              <button onClick={handleAddVehicle} style={saveBtn}>ADD TO SYSTEM</button>
            </div>
          </div>
        )}

        {/* MAP VIEW */}
        {currentTab === 'map' && (
          <div style={{ height: '100%', width: '100%' }}>
            <MapContainer center={[-0.3689, 35.2863]} zoom={14} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {vehicles.map((v, i) => (
                <Marker key={i} position={[v.lat, v.lng]}>
                  <Popup>
                    <b>{v.plate}</b><br/>
                    {v.sacco}<br/>
                    {isOverdue(v) ? "⚠️ Maintenance Due" : "✅ Healthy"}
                  </Popup>
                </Marker>
              ))}
              <MapController activeVehicle={activeVehicle} />
            </MapContainer>
          </div>
        )}
      </div>

      {/* FOOTER NAV */}
      <div style={bottomNav}>
        <div onClick={() => setCurrentTab('dashboard')} style={navItem(currentTab === 'dashboard')}>🏠<br/>Home</div>
        <div onClick={() => setCurrentTab('fleet')} style={navItem(currentTab === 'fleet')}>🚐<br/>Fleet</div>
        <div onClick={() => setCurrentTab('maintenance')} style={navItem(currentTab === 'maintenance')}>🛠️<br/>Fix</div>
        <div onClick={() => setCurrentTab('map')} style={navItem(currentTab === 'map')}>📍<br/>Track</div>
      </div>
    </div>
  );
}

// --- STYLING ---
const layoutStyle = { height: '100vh', width: '100vw', background: '#020617', color: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' };
const headerStyle = { padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', borderBottom: '1px solid #1e293b' };
const logoCircle = { width: '40px', height: '40px', background: '#38bdf8', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' };
const statBadge = { background: '#1e293b', padding: '5px 12px', borderRadius: '15px', fontSize: '10px', fontWeight: 'bold', color: '#38bdf8', border: '1px solid #38bdf844' };
const containerStyle = { padding: '20px' };
const sectionLabel = { color: '#475569', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '15px' };
const actionButton = (color) => ({ flex: 1, background: '#0f172a', border: `1px solid ${color}`, padding: '20px 10px', borderRadius: '20px', color: '#fff', fontWeight: 'bold' });
const normalCard = { background: '#0f172a', padding: '15px', borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #1e293b' };
const alertCard = { ...normalCard, borderLeft: '4px solid #38bdf8' };
const trackBtn = { background: '#1e293b', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' };
const formBox = { background: '#0f172a', padding: '20px', borderRadius: '20px' };
const formTitle = { marginTop: 0, fontSize: '14px', color: '#38bdf8', marginBottom: '15px' };
const inputStyle = { width: '100%', padding: '12px', background: '#020617', border: '1px solid #1e293b', color: '#fff', borderRadius: '10px', marginBottom: '10px' };
const saveBtn = { width: '100%', padding: '15px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '10px', fontWeight: 'bold' };
const bottomNav = { height: '80px', background: '#0f172a', display: 'flex', borderTop: '1px solid #1e293b' };
const navItem = (active) => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: active ? '#38bdf8' : '#64748b' });
const historyCard = { background: '#0f172a', padding: '12px', borderRadius: '12px', marginBottom: '8px', border: '1px solid #1e293b' };

export default App;
