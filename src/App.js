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
  // ─── LIVE CLOUD ENDPOINTS ───────────────────────────────────────────
  const VEHICLE_API_URL = "https://motorcare-backend-1.onrender.com/api/vehicles";
  const AUTH_API_URL = "https://motorcare-backend-1.onrender.com/api/auth"; // Pointing to your new auth routes

  // --- AUTHENTICATION STATE ---
  const [token, setToken] = useState(localStorage.getItem('mc_token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('mc_role') || null);
  const [username, setUsername] = useState(localStorage.getItem('mc_username') || null);
  const [saccoName, setSaccoName] = useState(localStorage.getItem('mc_sacco') || null);
  
  // Login Form State
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Core Navigation & Tracking States
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
  const [newVehicle, setNewVehicle] = useState({ plate: '', sacco: '', route: '', type: '14-Seater Matatu', currentKm: '', lastService: '', isExisting: false });

  // Fallback Local Persistence
  useEffect(() => { localStorage.setItem('mc_fleet', JSON.stringify(vehicles)); }, [vehicles]);
  useEffect(() => { localStorage.setItem('mc_history', JSON.stringify(history)); }, [history]);

  // --- LIVE LOCATION TRACKING LOGIC ---
  useEffect(() => {
    if (!navigator.geolocation || !token) return;

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
  }, [token]);

  // ─── AUTHENTICATION HANDLERS ───────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login credentials authentication failed.');
      }

      // Fast Login Optimization: Store state tokens on client machine
      localStorage.setItem('mc_token', data.token);
      localStorage.setItem('mc_role', data.role);
      localStorage.setItem('mc_username', data.username);
      localStorage.setItem('mc_sacco', data.saccoName);

      setToken(data.token);
      setUserRole(data.role);
      setUsername(data.username);
      setSaccoName(data.saccoName);
      
      setCurrentTab('dashboard');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_role');
    localStorage.removeItem('mc_username');
    localStorage.removeItem('mc_sacco');
    
    setToken(null);
    setUserRole(null);
    setUsername(null);
    setSaccoName(null);
  };

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
      lat: newVehicle.lat || driverLocation?.lat || -0.3689, 
      lng: newVehicle.lng || driverLocation?.lng || 35.2863,
      status: newVehicle.status || 'Active' 
    };

    if (newVehicle.isExisting) {
      try {
        const response = await fetch(`${VEHICLE_API_URL}/${newVehicle.plate}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Protect endpoints with middleware token
          },
          body: JSON.stringify(vehicleData)
        });

        if (response.ok) {
          const updatedLocalList = vehicles.map(v => 
            v.plate === newVehicle.plate ? { ...v, ...vehicleData, plate: vehicleData.plateNumber, sacco: vehicleData.saccoName, type: vehicleData.vehicleType } : v
          );
          setVehicles(updatedLocalList);
          alert(`Vehicle ${newVehicle.plate} updated successfully in cloud!`);
        }
      } catch (error) {
        console.error("Cloud Update Failed, performing local update fallback:", error);
        const updatedLocalList = vehicles.map(v => 
          v.plate === newVehicle.plate ? {
            ...v, sacco: vehicleData.saccoName, route: vehicleData.route, type: vehicleData.vehicleType, currentKm: vehicleData.currentKm, lastService: vehicleData.lastService, status: 'Local-Only'
          } : v
        );
        setVehicles(updatedLocalList);
      }
    } else {
      try {
        const response = await fetch(`${VEHICLE_API_URL}/register`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(vehicleData)
        });

        if (response.status === 201) {
          const localVehicleObj = {
            plate: vehicleData.plateNumber, sacco: vehicleData.saccoName, route: vehicleData.route, type: vehicleData.vehicleType, currentKm: vehicleData.currentKm, lastService: vehicleData.lastService, lat: vehicleData.lat, lng: vehicleData.lng, status: vehicleData.status
          };
          setVehicles([...vehicles, localVehicleObj]);
        }
      } catch (error) {
        console.error("Sync Error on Registration, adding locally:", error);
        setVehicles([...vehicles, {
          plate: vehicleData.plateNumber, sacco: vehicleData.saccoName, route: vehicleData.route, type: vehicleData.vehicleType, currentKm: vehicleData.currentKm, lastService: vehicleData.lastService, lat: vehicleData.lat, lng: vehicleData.lng, status: 'Local-Only'
        }]);
      }
    }

    setNewVehicle({ plate: '', sacco: '', route: '', type: '14-Seater Matatu', currentKm: '', lastService: '', isExisting: false });
    setCurrentTab('dashboard');
  };

  const handleLogMaintenance = async (e) => {
    e.preventDefault();
    if (!maintForm.plate) return;

    const entry = { ...maintForm, date: new Date().toLocaleDateString() };
    
    try {
      await fetch(`${VEHICLE_API_URL}/maintenance`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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

  // ─── RENDER GATEWAY: SECURITY LOGIN PORTAL ─────────────────────────
  if (!token) {
    return (
      <div style={layoutStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '20px' }}>
          <div style={{ ...formBox, width: '100%', maxWidth: '400px', border: '1px solid #1e293b', textAlign: 'center' }}>
            
            {/* Embedded System Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div style={{ width: '50px', height: '50px', backgroundColor: '#eaeaea', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3.5 14A8 8 0 1 1 18.5 17" stroke="#2c3e50" strokeWidth="2"/>
                  <line x1="12" y1="12.5" x2="16" y2="8" stroke="#e74c3c" strokeWidth="2.5"/>
                  <circle cx="12" cy="12.5" r="1.5" fill="#e74c3c"/>
                </svg>
              </div>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#fff' }}>WELCOME BACK</h2>
            <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '25px' }}>Matatu Maintenance Fleet Portal</p>

            {loginError && (
              <div style={{ backgroundColor: '#7f1d1d', borderLeft: '4px solid #ef4444', color: '#fca5a5', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '15px', textAlign: 'left' }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <input 
                type="email" 
                placeholder="Operator Email" 
                autoComplete="username"
                autoFocus
                style={inputStyle} 
                value={loginForm.email} 
                onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} 
                required 
              />
              <input 
                type="password" 
                placeholder="Password" 
                autoComplete="current-password"
                style={inputStyle} 
                value={loginForm.password} 
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} 
                required 
              />
              <button type="submit" style={{ ...saveBtn, marginTop: '10px' }} disabled={isLoggingIn}>
                {isLoggingIn ? "AUTHENTICATING..." : "SECURE LOGIN"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── AUTHENTICATED SYSTEM DASHBOARD CORE ───────────────────────────
  return (
    <div style={layoutStyle}>
      {/* HEADER BAR */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '42px', height: '42px', backgroundColor: '#eaeaea', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.5 14A8 8 0 1 1 18.5 17" stroke="#2c3e50" strokeWidth="2" strokeLinecap="round"/>
              <rect x="7" y="12.5" width="9.5" height="3.5" rx="1" fill="#2c3e50"/>
              <line x1="12" y1="12.5" x2="16" y2="8" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="12.5" r="1.2" fill="#e74c3c"/>
            </svg>
          </div>
          <div>
            <h1 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
              {saccoName ? saccoName.toUpperCase() : 'FLEET'} PORTAL
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
              User: <span style={{ color: '#38bdf8' }}>{username}</span> ({userRole})
            </p>
          </div>
        </div>
        
        <button onClick={handleLogout} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
          LOGOUT
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        
        {/* DASHBOARD TAB */}
        {currentTab === 'dashboard' && (
          <div style={containerStyle}>
            
            {/* ROLE-BASED ACCESS PRIVILEGES INTERFACE ACTION PANEL */}
            {userRole === 'admin' ? (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '35px' }}>
                <button onClick={() => setCurrentTab('fleet')} style={actionButton('#38bdf8')}> Vans / Assets </button>
                <button onClick={() => setCurrentTab('maintenance')} style={actionButton('#e2e8f0')}> Maintain Logs </button>
              </div>
            ) : (
              <div style={{ padding: '15px', backgroundColor: '#1e293b', borderRadius: '12px', marginBottom: '35px', borderLeft: '4px solid #10b981', fontSize: '13px', color: '#94a3b8' }}>
                ℹ️ Welcome back, Driver. Your position and driving statistics are securely streaming live to management servers.
              </div>
            )}

            <h2 style={sectionLabel}>SYSTEM FLEET STATUS MONITOR</h2>
            {vehicles.map(v => (
              <div key={v.plate} style={isOverdue(v) ? alertCard : normalCard}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff' }}>{v.plate}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    {v.sacco} • Route: {v.route}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Mileage: {v.currentKm} KM / Last: {v.lastService || 0} KM
                  </div>
                  <div style={{ fontSize: '11px', color: isOverdue(v) ? '#38bdf8' : '#10b981', marginTop: '6px', fontWeight: '600' }}>
                     {isOverdue(v) ? '⚠️ SERVICE CRITICAL DUE' : '✅ Health Threshold Safe'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={() => { setActiveVehicle(v); setCurrentTab('map'); }} style={trackBtn}>PAN MAP</button>
                  {userRole === 'admin' && (
                    <button 
                      onClick={() => { 
                        setNewVehicle({ ...v, isExisting: true }); 
                        setCurrentTab('fleet'); 
                      }} 
                      style={{ ...trackBtn, backgroundColor: '#38bdf8', color: '#0f172a' }}
                    >
                      EDIT PRIVILEGE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MAINTENANCE MODULE */}
        {currentTab === 'maintenance' && userRole === 'admin' && (
          <div style={containerStyle}>
            <div style={{ ...formBox, border: '1px solid #38bdf8' }}>
              <h3 style={formTitle}>RESET MILEAGE COUNTER</h3>
              <select style={inputStyle} value={maintForm.plate} onChange={e => setMaintForm({ ...maintForm, plate: e.target.value })}>
                <option value="">Choose Asset Plate</option>
                {vehicles.map(v => <option key={v.plate} value={v.plate}>{v.plate}</option>)}
              </select>
              <input placeholder="Action Taken (e.g. Shell Helix Oil Exchange)" style={inputStyle} value={maintForm.task} onChange={e => setMaintForm({ ...maintForm, task: e.target.value })} />
              <button onClick={handleLogMaintenance} style={saveBtn}>DISPATCH LOG</button>
            </div>

            <h2 style={{ ...sectionLabel, marginTop: '30px' }}>HISTORICAL LOGS</h2>
            {history.length > 0 ? (
              history.map((h, i) => (
                <div key={i} style={historyCard}>
                  <div style={{ fontWeight: 'bold', color: '#fff' }}>{h.plate}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>
                    {h.task} — {h.date}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '20px' }}>No historic entries saved.</div>
            )}
          </div>
        )}

        {/* FLEET ASSET SYSTEM MODULE */}
        {currentTab === 'fleet' && userRole === 'admin' && (
          <div style={containerStyle}>
            <div style={formBox}>
              <h3 style={formTitle}>
                {newVehicle.isExisting ? "EDIT COMPLIANCE DETAILS" : "PROVISION ASSET'}
              </h3>
              
              <input 
                placeholder="Vehicle Plate" 
                style={inputStyle} 
                value={newVehicle.plate || ''} 
                onChange={e => {
                  const typedPlate = e.target.value.toUpperCase();
                  const existingVehicle = vehicles.find(v => v.plate === typedPlate);
                  
                  if (existingVehicle) {
                    setNewVehicle({
                      ...newVehicle, plate: typedPlate, sacco: existingVehicle.sacco, route: existingVehicle.route, type: existingVehicle.type, currentKm: existingVehicle.currentKm, lastService: existingVehicle.lastService, lat: existingVehicle.lat, lng: existingVehicle.lng, status: existingVehicle.status, isExisting: true
                    });
                  } else {
                    setNewVehicle({ ...newVehicle, plate: typedPlate, isExisting: false });
                  }
                }} 
              />

              {newVehicle.isExisting && (
                <div style={{ color: '#38bdf8', backgroundColor: '#1e293b', borderLeft: '4px solid #38bdf8', padding: '12px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', textAlign: 'left' }}>
                  <strong>ℹ️ Asset Located in Sacco Record</strong><br />
                  • Internal Odometer: <strong style={{ color: '#10b981' }}>{newVehicle.currentKm} KM</strong>
                </div>
              )}

              <input placeholder="Sacco Name" style={inputStyle} value={newVehicle.sacco || ''} onChange={e => setNewVehicle({ ...newVehicle, sacco: e.target.value })} />
              <input placeholder="Assigned Route" style={inputStyle} value={newVehicle.route || ''} onChange={e => setNewVehicle({ ...newVehicle, route: e.target.value })} />
              
              <select style={inputStyle} value={newVehicle.type || '14-Seater Matatu'} onChange={e => setNewVehicle({ ...newVehicle, type: e.target.value })}>
                <option value="14-Seater Matatu">14-Seater Matatu</option>
                <option value="33-Seater Nganya">33-Seater Nganya</option>
                <option value="7-Seater Shuttle">7-Seater Shuttle</option>
              </select>

              <input placeholder="Odometer Current Metrics" type="number" style={inputStyle} value={newVehicle.currentKm || ''} onChange={e => setNewVehicle({ ...newVehicle, currentKm: e.target.value })} />
              <input placeholder="Odometer Last Serviced Metric" type="number" style={inputStyle} value={newVehicle.lastService || ''} onChange={e => setNewVehicle({ ...newVehicle, lastService: e.target.value })} />
              
              <button onClick={handleAddVehicle} style={saveBtn}>
                {newVehicle.isExisting ? "COMMIT EDITS" : "SAVE NEW ASSET"}
              </button>
            </div>
          </div>
        )}
            
        {/* LEAFLET GEOSPATIAL MAP CORE */}
        {currentTab === 'map' && (
          <div style={{ height: '100%', width: '100%' }}>
            <MapContainer center={[-0.3689, 35.2863]} zoom={14} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {vehicles.map((v, i) => (
                <Marker key={i} position={[v.lat, v.lng]}>
                  <Popup>
                    <b>{v.plate}</b><br/>
                    {v.sacco}<br/>
                    Status: {isOverdue(v) ? "⚠️ Service Required" : "✅ Compliant"}
                  </Popup>
                </Marker>
              ))}
              <MapController activeVehicle={activeVehicle} />
            </MapContainer>
          </div>
        )}
      </div>

      {/* FOOTER TAB INTEGRATION */}
      <div style={bottomNav}>
        <div onClick={() => setCurrentTab('dashboard')} style={navItem(currentTab === 'dashboard')}>🏠<br/>Home</div>
        {userRole === 'admin' && <div onClick={() => setCurrentTab('fleet')} style={navItem(currentTab === 'fleet')}>🚐<br/>Fleet</div>}
        {userRole === 'admin' && <div onClick={() => setCurrentTab('maintenance')} style={navItem(currentTab === 'maintenance')}>🛠️<br/>Counter</div>}
        <div onClick={() => setCurrentTab('map')} style={navItem(currentTab === 'map')}>📍<br/>Track</div>
      </div>
    </div>
  );
}

// ─── STATIC STYLING SCHEMES ─────────────────────────────────────────
const layoutStyle = { height: '100vh', width: '100vw', background: '#020617', color: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' };
const headerStyle = { padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', borderBottom: '1px solid #1e293b' };
const containerStyle = { padding: '20px' };
const sectionLabel = { color: '#475569', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '15px' };
const actionButton = (color) => ({ flex: 1, background: '#0f172a', border: `1px solid ${color}`, padding: '20px 10px', borderRadius: '20px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' });
const normalCard = { background: '#0f172a', padding: '15px', borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #1e293b' };
const alertCard = { ...normalCard, borderLeft: '4px solid #38bdf8' };
const trackBtn = { background: '#1e293b', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' };
const formBox = { background: '#0f172a', padding: '20px', borderRadius: '20px' };
const formTitle = { marginTop: 0, fontSize: '14px', color: '#38bdf8', marginBottom: '15px' };
const inputStyle = { width: '100%', padding: '12px', background: '#020617', border: '1px solid #1e293b', color: '#fff', borderRadius: '10px', marginBottom: '10px', outline: 'none' };
const saveBtn = { width: '100%', padding: '15px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };
const bottomNav = { height: '80px', background: '#0f172a', display: 'flex', borderTop: '1px solid #1e293b' };
const navItem = (active) => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: active ? '#38bdf8' : '#64748b', cursor: 'pointer' });
const historyCard = { background: '#0f172a', padding: '12px', borderRadius: '12px', marginBottom: '8px', border: '1px solid #1e293b' };

export default App;
