import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { io } from 'socket.io-client';

const LAYOUTS = {
  '2v': { name: '2 Vertical', cols: 1, rows: 2, total: 2 },
  '3v': { name: '3 Vertical', cols: 1, rows: 3, total: 3 },
  '4v': { name: '4 Vertical', cols: 1, rows: 4, total: 4 },
  '2x2': { name: '2×2 Grid', cols: 2, rows: 2, total: 4 },
  '6g': { name: '6-Photo Grid', cols: 3, rows: 2, total: 6 },
  '8s': { name: '8-Photo Strip', cols: 2, rows: 4, total: 8 },
};

const THEMES = { pink: { bg: '#F8D7E6', name: 'Light Pink' }, blue: { bg: '#D9ECFF', name: 'Light Blue' }, mint: { bg: '#D4F5E9', name: 'Mint' } };
const COLORS = ['pink','blue','mint','lavender','peach'];
const COLOR_MAP = { pink: '#F8D7E6', blue: '#D9ECFF', mint: '#D4F5E9', lavender: '#E8D5F5', peach: '#FFE0D0' };
const COLOR_DEEP = { pink: '#F0B8D0', blue: '#B8D8F8', mint: '#A8E6CF', lavender: '#D4B8F0', peach: '#FFCCB8' };

const FILTERS = [
  { id:'original', name:'Original', css:'' },
  { id:'retro', name:'Retro', css:'sepia(0.3) saturate(1.2) contrast(1.1)' },
  { id:'film', name:'Film', css:'sepia(0.5) contrast(1.2) brightness(0.9)' },
  { id:'vintage', name:'Vintage', css:'sepia(0.6) saturate(0.8) contrast(0.9)' },
  { id:'cool', name:'Cool', css:'hue-rotate(170deg) saturate(0.8)' },
  { id:'warm', name:'Warm', css:'sepia(0.4) saturate(1.3)' },
  { id:'soft', name:'Soft', css:'brightness(1.15) contrast(0.85) saturate(0.9)' },
  { id:'dreamy', name:'Dreamy', css:'brightness(1.2) contrast(0.8) saturate(0.7) blur(1px)' },
  { id:'bw', name:'B&W', css:'grayscale(1) contrast(1.1)' },
  { id:'disposable', name:'Disposable', css:'saturate(1.3) contrast(1.2) brightness(0.95) sepia(0.15)' },
];

const STICKERS = ['❤️','⭐','🌸','✨','🎀','💫','🦋','🌷','💝','🌟','💕','🎵','🍀','🌈','🫧','💎'];

let toastId = 0;
function showToast(msg) {
  const id = ++toastId;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.id = 'toast-' + id;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

export default function Home() {
  const [page, setPage] = useState('landing');
  const [socket, setSocket] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [myRole, setMyRole] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const [partnerA, setPartnerA] = useState({ name:'', color:'pink', connected:false });
  const [partnerB, setPartnerB] = useState({ name:'', color:'blue', connected:false });
  const [myName, setMyName] = useState('');
  const [myColor, setMyColor] = useState('pink');

  const [layoutVotes, setLayoutVotes] = useState({});
  const [confirmedLayout, setConfirmedLayout] = useState(null);
  const [lockedLayout, setLockedLayout] = useState(false);

  const [theme, setTheme] = useState('pink');
  const [countdown, setCountdown] = useState(3);

  // Camera — use ref for photoIndex to avoid stale closure
  const [readyA, setReadyA] = useState(false);
  const [readyB, setReadyB] = useState(false);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const photoIdxRef = useRef(0);
  const [photos, setPhotos] = useState([]);
  const photosRef = useRef([]);
  const [capturing, setCapturing] = useState(false);
  const [countdownNum, setCountdownNum] = useState(null);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraStarted = useRef(false);
  const confirmedLayoutRef = useRef(null);

  const [selectedFrames, setSelectedFrames] = useState(new Set());
  const [editTab, setEditTab] = useState('filters');
  const [filter, setFilter] = useState('original');
  const [stickers, setStickers] = useState([]);
  const [customText, setCustomText] = useState('');
  const [textFont, setTextFont] = useState('Pacifico');
  const [textSize, setTextSize] = useState(32);
  const [textColor, setTextColor] = useState('#E8A0C0');
  const [dateStamp, setDateStamp] = useState(false);

 const exportCanvasRef = useRef(null);
  const dragRef = useRef({ idx: -1, el: null, startX: 0, startY: 0, startStickerX: 0, startStickerY: 0 });
  // Keep refs in sync
  useEffect(() => { photoIdxRef.current = currentPhotoIdx; }, [currentPhotoIdx]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => { confirmedLayoutRef.current = confirmedLayout; }, [confirmedLayout]);

  // ─── Socket ───
  useEffect(() => {
    const s = io({ path: '/api/socket' });
    setSocket(s);

    s.on('room-state', (state) => {
      setLockedLayout(state.lockedLayout || false);
      if (state.lockedLayout && state.layout) setConfirmedLayout(state.layout);
      setLayoutVotes(state.layoutVotes || {});
      setTheme(state.theme || 'pink');
      setCountdown(state.countdown || 3);
      setFilter(state.filter || 'original');
      setStickers(state.stickers || []);
      setCustomText(state.customText || '');
      setTextFont(state.textFont || 'Pacifico');
      setTextSize(state.textSize || 32);
      setTextColor(state.textColor || '#E8A0C0');
      setDateStamp(state.dateStamp || false);
    });

    s.on('participants-update', ({ partnerA: pa, partnerB: pb }) => { setPartnerA(pa); setPartnerB(pb); });
    s.on('name-updated', ({ role, name }) => {
      if (role === 'a') setPartnerA(p => ({...p, name})); else setPartnerB(p => ({...p, name}));
    });
    s.on('color-updated', ({ role, color }) => {
      if (role === 'a') setPartnerA(p => ({...p, color})); else setPartnerB(p => ({...p, color}));
    });
    s.on('layout-votes-update', (votes) => {
      setLayoutVotes(votes);
      if (votes['a'] && votes['b'] && votes['a'] === votes['b']) {
        setConfirmedLayout(votes['a']); setLockedLayout(true);
      } else {
        setLockedLayout(false); setConfirmedLayout(null);
      }
    });
    s.on('layout-confirmed', (data) => { setConfirmedLayout(data.layout); setLockedLayout(true); });
    s.on('layout-reset', () => { setLockedLayout(false); setConfirmedLayout(null); setLayoutVotes({}); });
    s.on('theme-updated', ({ theme: t }) => setTheme(t));
    s.on('countdown-updated', ({ countdown: c }) => setCountdown(c));
    s.on('ready-updated', (ready) => { setReadyA(ready.a); setReadyB(ready.b); });
    s.on('both-ready', () => { startCountdownSequence(); });
    s.on('error-msg', (msg) => showToast(msg));
    return () => { s.disconnect(); };
  }, []);

  // ─── Camera ───
  const startCamera = useCallback(async () => {
    if (cameraStarted.current) return;
    cameraStarted.current = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 800 }, frameRate: { ideal: 30 } }
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.onloadedmetadata = () => videoRef.current.play();
      }
    } catch (e) {
      cameraStarted.current = false;
      showToast('Camera access needed! 📷');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    cameraStarted.current = false;
  }, []);

  useEffect(() => {
    if (page === 'camera') startCamera();
    else stopCamera();
  }, [page, startCamera, stopCamera]);

  // Core capture function — uses refs, NOT state
  const doCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return false;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 1600;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const idx = photoIdxRef.current;
    const newPhotos = [...photosRef.current];
    newPhotos[idx] = dataUrl;
    photosRef.current = newPhotos;
    setPhotos(newPhotos);
    setFlash(true);
    setTimeout(() => setFlash(false), 350);

    const layout = confirmedLayoutRef.current;
    const total = LAYOUTS[layout]?.total || 4;
    const next = idx + 1;

    if (next >= total) {
      // All done
      photoIdxRef.current = 0;
      setCurrentPhotoIdx(0);
      setCapturing(false);
      stopCamera();
      setPage('review');
      return true; // finished
    } else {
      photoIdxRef.current = next;
      setCurrentPhotoIdx(next);
      return false; // more to capture
    }
  }, [stopCamera]);

  const startCountdownSequence = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    for (let i = countdown; i >= 1; i--) {
      setCountdownNum(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdownNum(null);
    if (!doCapture()) {
      // More photos to take — reset ready state for next shot
      setCapturing(false);
    }
    // Reset readys
    setReadyA(false);
    setReadyB(false);
  }, [countdown, capturing, doCapture]);

  // ─── Actions ───
  const createRoom = () => {
    const code = Array.from({length:6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
    setRoomCode(code); setMyRole('a'); setMyColor('pink');
    socket?.emit('create-room', { roomCode: code });
    setPage('lobby');
  };
  const joinRoom = () => {
    const code = joinInput.trim().toUpperCase();
    if (!code || code.length !== 6) return showToast('Enter a valid 6-character code');
    setRoomCode(code); setMyRole('b'); setMyColor('blue');
    socket?.emit('join-room', { roomCode: code });
    setPage('lobby');
  };
  const setName = (name) => { setMyName(name); socket?.emit('set-name', { name }); };
  const setMyColorFn = (color) => { setMyColor(color); socket?.emit('set-color', { color }); };
  const voteLayout = (layout) => { socket?.emit('vote-layout', { layout }); };
  const resetLayoutVotes = () => { socket?.emit('reset-layout-votes'); };
  const setThemeFn = (t) => { setTheme(t); socket?.emit('set-theme', { theme: t }); };

  const toggleReady = () => {
    const newReady = myRole === 'a' ? !readyA : !readyB;
    if (myRole === 'a') setReadyA(newReady); else setReadyB(newReady);
    socket?.emit('set-ready', { ready: newReady });
  };

  const goToCamera = () => {
    setCurrentPhotoIdx(0);
    photoIdxRef.current = 0;
    setPhotos([]);
    photosRef.current = [];
    cameraStarted.current = false;
    setPage('camera');
  };

  const retakeFrame = (idx) => {
    setCurrentPhotoIdx(idx);
    photoIdxRef.current = idx;
    cameraStarted.current = false;
    setPage('camera');
  };

  const retakeSelected = () => {
    if (selectedFrames.size === 0) return;
    const first = Math.min(...selectedFrames);
    setCurrentPhotoIdx(first);
    photoIdxRef.current = first;
    setSelectedFrames(new Set());
    setCapturing(false);
    cameraStarted.current = false;
    setPage('camera');
  };

  const retakeAll = () => {
    setPhotos([]);
    photosRef.current = [];
    setCurrentPhotoIdx(0);
    photoIdxRef.current = 0;
    setCapturing(false);
    cameraStarted.current = false;
    setPage('camera');
  };

  const toggleFrameSelect = (idx) => {
    setSelectedFrames(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };
// ─── Drag stickers ───
const startDragSticker = (e, idx) => {
e.preventDefault();
const el = e.currentTarget;
const clientX = e.touches ? e.touches[0].clientX : e.clientX;
const clientY = e.touches ? e.touches[0].clientY : e.clientY;
const rect = el.parentElement.getBoundingClientRect();
el.style.cursor = "grabbing";
el.style.zIndex = "50";
el.style.transition = "none";
dragRef.current = {
idx, el,
startX: clientX, startY: clientY,
origLeft: stickers[idx].x, origTop: stickers[idx].y
};
};

useEffect(() => {
const onMove = (e) => {
const d = dragRef.current;
if (d.idx < 0) return;
const clientX = e.touches ? e.touches[0].clientX : e.clientX;
const clientY = e.touches ? e.touches[0].clientY : e.clientY;
const parentRect = d.el.parentElement.getBoundingClientRect();
const dxPx = clientX - d.startX;
const dyPx = clientY - d.startY;
const dxPct = (dxPx / parentRect.width) * 100;
const dyPct = (dyPx / parentRect.height) * 100;
const newX = Math.max(5, Math.min(95, d.origLeft + dxPct));
const newY = Math.max(5, Math.min(95, d.origTop + dyPct));
d.el.style.left = newX + "%";
d.el.style.top = newY + "%";
};
const onUp = () => {
const d = dragRef.current;
if (d.idx < 0) return;
const el = d.el;
const newX = parseFloat(el.style.left);
const newY = parseFloat(el.style.top);
el.style.cursor = "grab";
el.style.zIndex = "10";
el.style.transition = "filter 0.15s";
if (!isNaN(newX) && !isNaN(newY)) {
setStickers(prev => {
const arr = [...prev];
arr[d.idx] = { ...arr[d.idx], x: newX, y: newY };
return arr;
});
}
dragRef.current = { idx: -1, el: null, startX: 0, startY: 0, origLeft: 0, origTop: 0 };
};
window.addEventListener("mousemove", onMove);
window.addEventListener("mouseup", onUp);
window.addEventListener("touchmove", onMove, { passive: false });
window.addEventListener("touchend", onUp);
return () => {
window.removeEventListener("mousemove", onMove);
window.removeEventListener("mouseup", onUp);
window.removeEventListener("touchmove", onMove);
window.removeEventListener("touchend", onUp);
};
}, [stickers, socket]);

  const addSticker = (emoji) => {
    const sticker = { emoji, x: 10 + Math.random() * 70, y: 10 + Math.random() * 70 };
    setStickers(prev => [...prev, sticker]);
    
  };
  const clearDecorations = () => { setStickers([]); setCustomText('');  };
  const setFilterFn = (f) => { setFilter(f);  };

  // ─── Export ───
  const buildExport = useCallback((scale = 1) => {
    const layout = LAYOUTS[confirmedLayout];
    if (!layout) return null;
    const photoW = 350, photoH = 440, padding = 40, gap = 14;
    const headerH = 100;
    const footerH = (customText || stickers.length > 0) ? 130 : 50;
    const cols = layout.cols, rows = layout.rows;
    const contentW = cols * photoW + (cols - 1) * gap;
    const contentH = rows * photoH + (rows - 1) * gap;
    const cw = contentW + padding * 2;
    const ch = headerH + padding + contentH + footerH;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = THEMES[theme]?.bg || '#F8D7E6';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#525252';
    ctx.font = 'bold 28px Pacifico, Quicksand, cursive';
    ctx.textAlign = 'center';
    ctx.fillText('Couple Booth 💕', cw / 2, headerH / 2 - 4);
    if (dateStamp) {
      ctx.font = '12px Quicksand, sans-serif';
      ctx.fillStyle = '#737373';
      ctx.fillText(new Date().toLocaleDateString('en-US', { year:'numeric',month:'long',day:'numeric' }), cw / 2, headerH / 2 + 26);
    }
    ctx.font = '16px Quicksand, sans-serif';
    ctx.fillStyle = '#737373';
    ctx.textAlign = 'left';
    if (partnerA.name) ctx.fillText('💗 ' + partnerA.name, padding, headerH / 2);
    ctx.textAlign = 'right';
    if (partnerB.name) ctx.fillText('💙 ' + partnerB.name, cw - padding, headerH / 2);
    for (let i = 0; i < Math.min(photos.length, layout.total); i++) {
      if (!photos[i]) continue;
      const col = i % cols, row = Math.floor(i / cols);
      const x = padding + col * (photoW + gap);
      const y = headerH + padding + row * (photoH + gap);
      ctx.save();
      const r = 12;
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.lineTo(x+photoW-r,y); ctx.quadraticCurveTo(x+photoW,y,x+photoW,y+r);
      ctx.lineTo(x+photoW,y+photoH-r); ctx.quadraticCurveTo(x+photoW,y+photoH,x+photoW-r,y+photoH);
      ctx.lineTo(x+r,y+photoH); ctx.quadraticCurveTo(x,y+photoH,x,y+photoH-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath(); ctx.clip();
      const img = new Image(); img.src = photos[i];
      if (filter && filter !== "original") { ctx.filter = FILTERS.find(f=>f.id===filter)?.css || ""; ctx.drawImage(img, x, y, photoW, photoH); ctx.filter = "none"; } else { ctx.drawImage(img, x, y, photoW, photoH); }
      ctx.restore();
      ctx.strokeStyle = COLOR_DEEP[theme] || '#F0B8D0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.lineTo(x+photoW-r,y); ctx.quadraticCurveTo(x+photoW,y,x+photoW,y+r);
      ctx.lineTo(x+photoW,y+photoH-r); ctx.quadraticCurveTo(x+photoW,y+photoH,x+photoW-r,y+photoH);
      ctx.lineTo(x+r,y+photoH); ctx.quadraticCurveTo(x,y+photoH,x,y+photoH-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath(); ctx.stroke();
    }
    const footerY = headerH + padding + contentH + 15;
    if (customText) {
      ctx.fillStyle = textColor;
      ctx.font = textSize + 'px ' + textFont + ', Quicksand, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(customText, cw / 2, footerY + textSize);
    }
    for (const sticker of stickers) {
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sticker.emoji, padding + (contentW * sticker.x / 100), headerH + padding + (contentH * sticker.y / 100));
    }
    return canvas;
  }, [confirmedLayout, theme, photos, partnerA, partnerB, customText, textColor, textFont, textSize, stickers, dateStamp, filter]);


  // Render export preview canvas whenever on export tab
  useEffect(() => {
    if (editTab !== "export" || !exportCanvasRef.current) return;
    const canvas = buildExport(0.35);
    if (!canvas) return;
    const dest = exportCanvasRef.current;
    dest.width = canvas.width;
    dest.height = canvas.height;
    const dctx = dest.getContext("2d");
    dctx.drawImage(canvas, 0, 0);
  }, [editTab, buildExport, photos, theme, filter, stickers, customText, textFont, textSize, textColor, dateStamp]);
  const exportPhoto = (format) => {
    const scale = format === 'print' ? 2 : 1;
    const canvas = buildExport(scale);
    if (!canvas) return;
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'couple-booth-' + Date.now() + '.' + ext;
      a.click(); URL.revokeObjectURL(url);
      showToast('Downloaded! 💾');
    }, mime, format === 'print' ? 1.0 : 0.95);
  };

  const copyLink = () => {
    const link = window.location.origin + '?room=' + roomCode;
    navigator.clipboard.writeText(link).then(() => showToast('Link copied! 📋'));
  };
  const getInviteLink = () => window.location.origin + '?room=' + roomCode;
  const myPartnerColor = myRole === 'a' ? partnerB.color : partnerA.color;
  const myPartnerName = myRole === 'a' ? partnerB.name : partnerA.name;
  const layoutTotal = LAYOUTS[confirmedLayout]?.total || 4;
  const bothConnected = partnerA.connected && partnerB.connected;
  const aVote = layoutVotes['a'];
  const bVote = layoutVotes['b'];
  const votesMatch = aVote && bVote && aVote === bVote;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) { setJoinInput(room); setShowJoin(true); }
  }, []);

  return (
    <>
      <Head>
        <title>Couple Booth 💕</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="bg-decor" style={{top:'5%',left:'5%',animationDelay:'0s'}}>💕</div>
      <div className="bg-decor" style={{top:'15%',right:'8%',animationDelay:'2s'}}>✨</div>
      <div className="bg-decor" style={{bottom:'20%',left:'10%',animationDelay:'4s'}}>🌸</div>
      <div className="bg-decor" style={{top:'40%',right:'14%',animationDelay:'1s'}}>💫</div>
      <div className="bg-decor" style={{bottom:'30%',right:'8%',animationDelay:'3s'}}>🎀</div>
      <div className="bg-decor" style={{top:'60%',left:'8%',animationDelay:'5s'}}>💝</div>

      <div style={{position:'relative',zIndex:1,maxWidth:800,margin:'0 auto',padding:'16px',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        
        {/* LANDING */}
        {page === 'landing' && (
          <div className="card" style={{textAlign:'center',animation:'fadeSlideIn 0.4s ease'}}>
            <div style={{fontSize:'4rem',marginBottom:8}}>📸</div>
            <h1 style={{fontFamily:"'Pacifico',cursive",fontSize:'2.5rem',fontWeight:400,background:'linear-gradient(135deg, #E8A0C0, #7EB8E8)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',lineHeight:1.3,marginBottom:8}}>Couple Booth</h1>
            <p style={{color:'var(--gray-500)',fontSize:'1.05rem',maxWidth:380,margin:'0 auto 20px',lineHeight:1.6}}>
              A real-time collaborative photo booth for you and your special someone. 💕
            </p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,maxWidth:380,margin:'0 auto 16px'}}>
              {['📷 Layouts','🎨 Themes','✨ Filters','💬 Live Sync','🎀 Stickers','🖼️ Export'].map(f => (
                <div key={f} style={{background:'rgba(255,255,255,0.6)',padding:'10px 6px',borderRadius:10,fontSize:'0.78rem',fontWeight:600,color:'var(--gray-500)'}}>{f}</div>
              ))}
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="btn btn-primary btn-lg" onClick={createRoom}>✨ Create Booth</button>
              <button className="btn btn-outline btn-lg" onClick={() => setShowJoin(!showJoin)}>🔗 Join Booth</button>
            </div>
            {showJoin && (
              <div style={{marginTop:16,display:'flex',gap:8,maxWidth:340,margin:'16px auto 0'}}>
                <input className="input" placeholder="Enter 6-char code..." value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())} maxLength={6} style={{textTransform:'uppercase',letterSpacing:'0.12em',textAlign:'center'}} />
                <button className="btn btn-secondary" onClick={joinRoom}>Join</button>
              </div>
            )}
          </div>
        )}

        {/* LOBBY */}
        {page === 'lobby' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:16}}>
              <h2 style={{margin:0}}>💕 Your Booth</h2>
              <span style={{fontFamily:'monospace',fontSize:'1.5rem',fontWeight:700,letterSpacing:'0.15em',background:'rgba(248,215,230,0.3)',padding:'8px 20px',borderRadius:25}}>{roomCode}</span>
            </div>
            <div style={{background:'rgba(255,255,255,0.5)',borderRadius:'var(--radius)',padding:14,marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <span style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.9rem'}}>📋 Invite link:</span>
              <span style={{fontSize:'0.78rem',color:'var(--gray-600)',wordBreak:'break-all',flex:1,minWidth:200}}>{getInviteLink()}</span>
              <button className="btn btn-sm btn-outline" onClick={copyLink}>📋 Copy</button>
            </div>
            <div style={{marginBottom:16}}>
              <p style={{fontWeight:600,color:'var(--gray-500)',marginBottom:10}}>👥 Participants</p>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {partnerA.connected && (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:50,fontWeight:600,fontSize:'0.9rem',background:'rgba(248,215,230,0.6)',border:'2px solid ' + (COLOR_DEEP[partnerA.color]||'#F0B8D0')}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:'#4ADE80',animation:'pulse 1.5s ease infinite'}}></div>
                    {partnerA.name || 'Partner A'} 💗
                  </div>
                )}
                {partnerB.connected && (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:50,fontWeight:600,fontSize:'0.9rem',background:'rgba(217,236,255,0.6)',border:'2px solid ' + (COLOR_DEEP[partnerB.color]||'#B8D8F8')}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:'#4ADE80',animation:'pulse 1.5s ease infinite'}}></div>
                    {partnerB.name || 'Partner B'} 💙
                  </div>
                )}
                {!partnerA.connected && !partnerB.connected && <span style={{color:'var(--gray-400)',fontSize:'0.9rem'}}>Waiting for partner to join...</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <button className="btn btn-primary" disabled={!bothConnected} onClick={() => setPage('names')}>🎨 Start Setup</button>
              <button className="btn btn-outline btn-sm" onClick={() => { socket?.disconnect(); window.location.reload(); }}>🚪 Leave</button>
            </div>
          </div>
        )}

        {/* NAMES */}
        {page === 'names' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease'}}>
            <h2 style={{textAlign:'center',marginBottom:4}}>What should we call you? 💕</h2>
            <p style={{textAlign:'center',color:'var(--gray-400)',marginBottom:20,fontSize:'0.9rem'}}>Each of you picks your own name & color</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={{background:'rgba(255,255,255,0.6)',borderRadius:'var(--radius)',padding:20,textAlign:'center',border:myRole==='a'?'2px solid rgba(240,184,208,0.4)':'2px solid rgba(184,216,248,0.4)'}}>
                <h3 style={{fontSize:'0.9rem',fontWeight:600,color:'var(--gray-500)',marginBottom:10}}>{myRole==='a'?'💗 You (Partner A)':'💙 You (Partner B)'}</h3>
                <input className="input" placeholder="Your name..." value={myName} onChange={e => setName(e.target.value)} style={{textAlign:'center'}} />
                <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:10}}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setMyColorFn(c)} style={{width:28,height:28,borderRadius:'50%',background:COLOR_MAP[c],cursor:'pointer',border:myColor===c?'3px solid var(--gray-600)':'3px solid transparent',transform:myColor===c?'scale(1.1)':'scale(1)',transition:'all 0.2s ease'}}></div>
                  ))}
                </div>
              </div>
              <div style={{background:'rgba(255,255,255,0.5)',borderRadius:'var(--radius)',padding:20,textAlign:'center',border:myRole==='a'?'2px solid rgba(184,216,248,0.3)':'2px solid rgba(240,184,208,0.3)',opacity:0.85}}>
                <h3 style={{fontSize:'0.9rem',fontWeight:600,color:'var(--gray-500)',marginBottom:10}}>{myRole==='a'?'💙 Partner B':'💗 Partner A'}</h3>
                <input className="input" value={myPartnerName} readOnly style={{textAlign:'center',background:'var(--gray-50)',cursor:'not-allowed'}} />
                <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:10}}>
                  {COLORS.map(c => (
                    <div key={c} style={{width:28,height:28,borderRadius:'50%',background:COLOR_MAP[c],border:myPartnerColor===c?'3px solid var(--gray-600)':'3px solid transparent',opacity:myPartnerColor===c?1:0.5}}></div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{textAlign:'center',marginTop:20,display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="btn btn-primary" onClick={() => setPage('layout')}>Next: Choose Layout 📐</button>
              <button className="btn btn-outline btn-sm" onClick={() => setPage('lobby')}>Back</button>
            </div>
          </div>
        )}

        {/* LAYOUT */}
        {page === 'layout' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease'}}>
            <h2 style={{textAlign:'center',marginBottom:4}}>Choose Your Layout 📐</h2>
            <div style={{textAlign:'center',marginBottom:12,padding:'10px 16px',borderRadius:50,
              background:votesMatch?'rgba(168,230,207,0.4)':'rgba(255,255,255,0.5)',
              color:votesMatch?'#2D7A5F':'var(--gray-500)',fontWeight:600,fontSize:'0.85rem',transition:'all 0.3s ease',
              border:votesMatch?'2px solid #A8E6CF':'2px solid transparent'}}>
              {votesMatch?'✅ Match! Both selected the same layout. You can proceed! 🎉':'💡 Both partners need to pick the SAME layout to continue. Click any layout — you can change your mind anytime!'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
              {Object.entries(LAYOUTS).map(([key, lay]) => {
                const partnerVote = myRole === 'a' ? bVote : aVote;
                const myVote = layoutVotes[myRole];
                const iVoted = myVote === key;
                const partnerVoted = partnerVote === key;
                const bothVoted = iVoted && partnerVoted;
                const highlight = bothVoted?'#A8E6CF':iVoted?COLOR_DEEP[myRole==='a'?'pink':'blue']:'var(--gray-200)';
                return (
                  <div key={key} onClick={() => voteLayout(key)} style={{
                    background:'var(--white)',border:'2px solid '+highlight,borderRadius:'var(--radius)',
                    padding:12,cursor:'pointer',transition:'all 0.2s ease',textAlign:'center',
                    transform:bothVoted?'scale(1.03)':'scale(1)',boxShadow:bothVoted?'var(--shadow-md)':'var(--shadow-sm)',
                  }}>
                    <div style={{display:'grid',gap:3,gridTemplateColumns:'repeat('+lay.cols+',1fr)',gridTemplateRows:'repeat('+lay.rows+',1fr)',aspectRatio:lay.cols+'/'+lay.rows,marginBottom:6}}>
                      {Array(lay.total).fill(0).map((_,i)=>(
                        <div key={i} style={{background:iVoted?highlight:'var(--gray-200)',borderRadius:3,minHeight:24}}></div>
                      ))}
                    </div>
                    <div style={{fontSize:'0.75rem',fontWeight:600,color:'var(--gray-500)'}}>{lay.name}</div>
                    <div style={{display:'flex',gap:4,justifyContent:'center',marginTop:4,flexWrap:'wrap'}}>
                      {iVoted&&<span style={{fontSize:'0.62rem',color:COLOR_DEEP[myRole==='a'?'pink':'blue'],fontWeight:700,background:'rgba(255,255,255,0.8)',padding:'1px 8px',borderRadius:10}}>You ✓</span>}
                      {partnerVoted&&<span style={{fontSize:'0.62rem',color:'var(--gray-400)',fontWeight:700,background:'rgba(255,255,255,0.8)',padding:'1px 8px',borderRadius:10}}>Partner ✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{textAlign:'center',marginBottom:12}}>
              <button className="btn btn-sm btn-outline" onClick={resetLayoutVotes}>🔄 Reset All Votes</button>
            </div>
            <h2 style={{textAlign:'center',marginTop:8,marginBottom:8}}>Border Theme 🎨</h2>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:20}}>
              {Object.entries(THEMES).map(([key, t]) => (
                <div key={key} onClick={() => setThemeFn(key)} style={{
                  display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:50,
                  border:'2px solid '+(theme===key?'var(--gray-600)':'var(--gray-200)'),
                  cursor:'pointer',fontWeight:600,fontSize:'0.9rem',background:theme===key?'var(--gray-50)':'var(--white)',transition:'all 0.2s ease'
                }}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:t.bg,border:'1px solid rgba(0,0,0,0.08)'}}></div>
                  {t.name}
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="btn btn-primary" disabled={!votesMatch} onClick={() => {
                if (votesMatch) {
                  const chosen = aVote || bVote;
                  setConfirmedLayout(chosen);
                  confirmedLayoutRef.current = chosen;
                  socket?.emit('layout-confirmed', { layout: chosen });
                  goToCamera();
                }
              }}>
                {votesMatch?'Next: Take Photos 📸':'🔒 Pick the same layout to continue'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setPage('names')}>Back</button>
            </div>
          </div>
        )}

        {/* CAMERA */}
        {page === 'camera' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease',textAlign:'center'}}>
            <h2 style={{marginBottom:10}}>Photo {currentPhotoIdx + 1} of {layoutTotal} 📸</h2>
            <div style={{position:'relative',borderRadius:'var(--radius-lg)',overflow:'hidden',background:'var(--gray-800)',aspectRatio:'4/5',maxHeight:'60vh',boxShadow:'var(--shadow-lg)'}}>
              <video ref={videoRef} autoPlay playsInline muted style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}}></video>
              {flash && <div style={{position:'absolute',inset:0,background:'white',opacity:0.85,pointerEvents:'none',zIndex:5}}></div>}
              {countdownNum && (
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',background:'rgba(0,0,0,0.2)',zIndex:4}}>
                  <span style={{fontSize:'6rem',fontWeight:700,color:'white',textShadow:'0 0 30px rgba(0,0,0,0.5)'}}>{countdownNum}</span>
                </div>
              )}
            </div>
            <div style={{marginTop:12,display:'flex',gap:8,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
              <label style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.9rem'}}>Countdown:</label>
              <select value={countdown} onChange={e=>{setCountdown(Number(e.target.value));socket?.emit('set-countdown',{countdown:Number(e.target.value)});}} className="input" style={{width:'auto',padding:'8px 12px'}}>
                <option value={3}>3s</option><option value={5}>5s</option><option value={10}>10s</option>
              </select>
            </div>
            <div style={{marginTop:16,display:'flex',gap:12,alignItems:'center',justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={toggleReady} disabled={capturing} style={{
                padding:'14px 32px',borderRadius:50,fontWeight:700,fontSize:'1rem',
                border:'3px solid '+((myRole==='a'?readyA:readyB)?'#22C55E':'var(--gray-200)'),
                background:(myRole==='a'?readyA:readyB)?'#4ADE80':'var(--white)',
                color:(myRole==='a'?readyA:readyB)?'white':'var(--gray-600)',
                cursor:capturing?'not-allowed':'pointer',opacity:capturing?0.5:1,transition:'all 0.2s ease'
              }}>
                {myRole==='a'?'💗':'💙'} {(myRole==='a'?readyA:readyB)?'Ready ✓':'Ready'}
              </button>
              <span style={{fontWeight:600,color:'var(--gray-400)',fontSize:'0.85rem'}}>Both must be ready!</span>
              <div style={{padding:'14px 32px',borderRadius:50,fontWeight:700,fontSize:'1rem',
                border:'3px solid '+((myRole==='a'?readyB:readyA)?'#22C55E':'var(--gray-200)'),
                background:(myRole==='a'?readyB:readyA)?'#4ADE80':'var(--gray-50)',
                color:(myRole==='a'?readyB:readyA)?'white':'var(--gray-400)',opacity:0.7}}>
                {myRole==='a'?'💙':'💗'} {(myRole==='a'?readyB:readyA)?'Ready ✓':'Waiting...'}
              </div>
            </div>
          </div>
        )}

        {/* REVIEW */}
        {page === 'review' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease',textAlign:'center'}}>
            <h2 style={{marginBottom:4}}>Your Photos ✨</h2>
            <p style={{color:'var(--gray-400)',marginBottom:12,fontSize:'0.85rem'}}>Click a photo to select it for retake</p>
            <div style={{display:'grid',gap:8,gridTemplateColumns:'repeat('+(LAYOUTS[confirmedLayout]?.cols||1)+',1fr)',gridTemplateRows:'repeat('+(LAYOUTS[confirmedLayout]?.rows||4)+',auto)'}}>
              {photos.map((p,i)=>p&&(
                <div key={i} onClick={()=>toggleFrameSelect(i)} style={{position:'relative',borderRadius:'var(--radius-sm)',overflow:'hidden',background:'var(--gray-200)',
                  outline:selectedFrames.has(i)?'3px solid '+(COLOR_DEEP[myRole==='a'?'pink':'blue']):'3px solid transparent',outlineOffset:-3,cursor:'pointer'}}>
                  <img src={p} alt={'Photo '+(i+1)} style={{width:'100%',display:'block'}} />
                  <button onClick={e=>{e.stopPropagation();retakeFrame(i);}} style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,0.5)',color:'white',border:'none',borderRadius:'50%',width:30,height:30,cursor:'pointer',fontSize:'1rem'}}>↺</button>
                </div>
              ))}
            </div>
            <div style={{marginTop:16,display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="btn btn-outline btn-sm" disabled={selectedFrames.size===0} onClick={retakeSelected}>🔄 Retake Selected ({selectedFrames.size})</button>
              <button className="btn btn-outline btn-sm" onClick={retakeAll}>🔁 Retake All</button>
              <button className="btn btn-primary" onClick={()=>setPage('edit')}>✨ Continue to Edit</button>
            </div>
          </div>
        )}

        {/* EDIT */}
        {page === 'edit' && (
          <div className="card" style={{animation:'fadeSlideIn 0.4s ease'}}>
            <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.4)',borderRadius:50,padding:4,marginBottom:16}}>
              {['filters','decorations','export'].map(tab=>(
                <button key={tab} onClick={()=>setEditTab(tab)} style={{flex:1,textAlign:'center',padding:'10px 16px',borderRadius:50,fontWeight:600,fontSize:'0.85rem',cursor:'pointer',border:'none',background:editTab===tab?'var(--white)':'transparent',color:editTab===tab?'var(--gray-700)':'var(--gray-500)',boxShadow:editTab===tab?'var(--shadow-sm)':'none',fontFamily:"'Quicksand',sans-serif",transition:'all 0.2s ease'}}>
                  {tab==='filters'?'🎨 Filters':tab==='decorations'?'🎀 Decorations':'💾 Export'}
                </button>
              ))}
            </div>
            {editTab==='filters'&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(70px,1fr))',gap:8}}>
                {FILTERS.map(f=>(
                  <div key={f.id} onClick={()=>setFilterFn(f.id)} style={{borderRadius:'var(--radius-sm)',overflow:'hidden',cursor:'pointer',border:filter===f.id?'3px solid '+COLOR_DEEP.pink:'3px solid transparent',textAlign:'center',transition:'all 0.2s ease',transform:filter===f.id?'scale(1.03)':'scale(1)'}}>
                    <div style={{background:'var(--gray-100)',aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {photos[0]?<img src={photos[0]} alt="" style={{width:'100%',height:'100%',objectFit:'cover',filter:f.css}}/>:'📷'}
                    </div>
                    <div style={{fontSize:'0.68rem',fontWeight:600,padding:'5px 3px',color:'var(--gray-600)'}}>{f.name}</div>
                  </div>
                ))}
              </div>
            )}
            {editTab==='decorations'&&(
              <div>
                <p style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.82rem',marginBottom:6}}>Stickers (click to add, then drag on preview below)</p>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                  {STICKERS.map(s=><span key={s} onClick={()=>addSticker(s)} style={{fontSize:'1.4rem',cursor:'pointer',padding:'4px 8px',borderRadius:8,background:'rgba(255,255,255,0.5)',transition:'all 0.2s ease',userSelect:'none'}}>{s}</span>)}
                </div>
                {/* FULL GRID DECORATION PREVIEW */}
                <div style={{background:THEMES[theme]?.bg||'#F8D7E6',borderRadius:'var(--radius)',padding:18,marginBottom:14,boxShadow:'var(--shadow-sm)',width:'100%'}}>
                  <div style={{textAlign:'center',fontFamily:"'Pacifico',cursive",fontSize:'1.35rem',color:'var(--gray-600)',marginBottom:10}}>Couple Booth 💕</div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',color:'var(--gray-500)',fontWeight:600,marginBottom:10}}>
                    <span>{partnerA.name?'💗 '+partnerA.name:''}</span>
                    <span>{partnerB.name?'💙 '+partnerB.name:''}</span>
                  </div>
                  <div style={{position:'relative',display:'grid',gap:8,gridTemplateColumns:'repeat('+(LAYOUTS[confirmedLayout]?.cols||1)+',1fr)',gridTemplateRows:'repeat('+(LAYOUTS[confirmedLayout]?.rows||1)+',1fr)',width:'100%',aspectRatio:(LAYOUTS[confirmedLayout]?.cols||1)+'/'+(LAYOUTS[confirmedLayout]?.rows||1),cursor:'default'}}>
                    {Array.from({length:LAYOUTS[confirmedLayout]?.total||photos.length||1}).map((_,i)=>(
                      <div key={i} style={{borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.55)',border:'2px solid '+(COLOR_DEEP[theme]||'#F0B8D0'),minHeight:120}}>
                        {photos[i]?<img src={photos[i]} alt={'Photo '+(i+1)} style={{width:'100%',height:'100%',objectFit:'cover',display:'block',filter:FILTERS.find(f=>f.id===filter)?.css||''}} />:<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--gray-300)',fontSize:'2rem'}}>📷</div>}
                      </div>
                    ))}
                    {stickers.map((st,idx)=>(
                      <div key={idx}
                        onMouseDown={(e)=>startDragSticker(e,idx)}
                        onTouchStart={(e)=>startDragSticker(e,idx)}
                        style={{
                          position:'absolute',left:st.x+'%',top:st.y+'%',
                          fontSize:'2.5rem',cursor:'grab',userSelect:'none',
                          transform:'translate(-50%,-50%)',zIndex:10,
                          filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.3))',
                          transition:'filter 0.15s'
                        }}
                      >{st.emoji}</div>
                    ))}
                  </div>
                  <div style={{textAlign:'center',fontSize:'0.7rem',color:'var(--gray-400)',marginTop:8}}>
                    💡 Drag stickers on the full grid to position them accurately
                  </div>
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
                  <label style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.82rem'}}>Text:</label>
                  <input className="input" value={customText} onChange={e=>{setCustomText(e.target.value);}} placeholder="Your message..." style={{flex:1,minWidth:140,padding:'10px 16px'}} />
                  <select value={textFont} onChange={e=>{setTextFont(e.target.value);}} className="input" style={{width:'auto',padding:'8px 12px'}}>
                    <option value="Pacifico">Cursive</option><option value="Quicksand">Rounded</option><option value="serif">Serif</option><option value="monospace">Mono</option>
                  </select>
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
                  <label style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.82rem'}}>Size:</label>
                  <input type="range" min={12} max={72} value={textSize} onChange={e=>{setTextSize(Number(e.target.value));}} style={{width:80}} />
                  <span style={{fontSize:'0.8rem',color:'var(--gray-500)'}}>{textSize}px</span>
                  <input type="color" value={textColor} onChange={e=>{setTextColor(e.target.value);}} />
                  <label style={{fontWeight:600,color:'var(--gray-500)',fontSize:'0.82rem',display:'flex',alignItems:'center',gap:4}}>
                    <input type="checkbox" checked={dateStamp} onChange={e=>{setDateStamp(e.target.checked);}} /> Date
                  </label>
                  <button className="btn btn-outline btn-sm" onClick={clearDecorations}>Clear All</button>
                </div>
                {stickers.length>0&&<div style={{background:'rgba(255,255,255,0.4)',borderRadius:'var(--radius-sm)',padding:12,fontSize:'0.85rem',color:'var(--gray-500)'}}>{stickers.length} sticker{stickers.length>1?'s':''} positioned ✨</div>}
              </div>
            )}
            {editTab==='export'&&(
              <div style={{textAlign:'center'}}>
                <p style={{color:'var(--gray-400)',fontSize:'0.85rem',marginBottom:16}}>Your photostrip will include the layout, border, filters, stickers & text ✨</p>
                {/* Live export preview */}
                <div style={{display:'inline-block',background:'white',borderRadius:'var(--radius)',padding:16,boxShadow:'var(--shadow-md)',marginBottom:16,position:'relative',maxWidth:'100%',overflow:'hidden'}} id="exportPreviewWrap">
                  <canvas ref={exportCanvasRef} style={{maxWidth:'100%',maxHeight:400,display:'block'}}></canvas>
                </div>
                <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                  <button className="btn btn-primary" onClick={()=>exportPhoto('png')}>📥 Download PNG</button>
                  <button className="btn btn-secondary" onClick={()=>exportPhoto('jpg')}>📥 Download JPG</button>
                  <button className="btn btn-mint" onClick={()=>exportPhoto('print')}>🖨️ High-Res Print</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @media(max-width:600px){.card{padding:20px!important}}
      `}</style>
    </>
  );
}
