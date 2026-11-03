import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiImage, FiCamera, FiCheck, FiSmile } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';
import '../styles/StoryCreator.css';

function StoryCreator({ onClose, onCreate }) {
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaType, setMediaType] = useState('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none'); // none, vhs, neon, crown
  
  // Custom AI Sticker overlay states
  const [stickerPrompt, setStickerPrompt] = useState('');
  const [isGeneratingSticker, setIsGeneratingSticker] = useState(false);
  const [stickers, setStickers] = useState([]); // Array of { svg, x, y, size }
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previewContainerRef = useRef(null);

  // Close camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Bind video stream once the video element is rendered in the DOM
  useEffect(() => {
    if (isCameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.error("Webcam video play failed: ", err);
      });
    }
  }, [isCameraOpen]);

  const startCamera = async () => {
    try {
      setMediaUrl(null);
      setMediaType('text');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 720, height: 1280, facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (err) {
      toast.error('Unable to access webcam. Please upload a photo instead.');
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      stopCamera();
      const reader = new FileReader();
      reader.onload = (event) => {
        setMediaUrl(event.target.result);
        setMediaType('image');
      };
      reader.readAsDataURL(file);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions to match video aspect ratio
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Apply selected filters in canvas export
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (selectedFilter === 'vhs') {
      ctx.filter = 'contrast(1.25) saturate(0.7) sepia(0.15)';
    } else if (selectedFilter === 'neon') {
      ctx.filter = 'hue-rotate(280deg) saturate(2) contrast(1.15)';
    } else {
      ctx.filter = 'none';
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Render custom camera overlay items on canvas directly if wanted, or just save clean
    if (selectedFilter === 'vhs') {
      // Add vintage date stamp overlay
      ctx.font = '24px "Courier New", Courier, monospace';
      ctx.fillStyle = '#f59e0b';
      const now = new Date();
      const dateStr = `PLAY  ${now.toLocaleTimeString()} \nMAY ${now.getDate()} 2026`;
      ctx.fillText(dateStr, 30, canvas.height - 50);
    }

    const dataUrl = canvas.toDataURL('image/jpeg');
    setMediaUrl(dataUrl);
    setMediaType('image');
    stopCamera();
  };

  // Sticker Generation & Drag Mechanics
  const handleAddSticker = async () => {
    if (!stickerPrompt.trim()) return;
    setIsGeneratingSticker(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/messages/sticker/generate-raw', {
        promptText: stickerPrompt
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const newSticker = {
        svg: response.data.svg,
        x: 40, // percentage x
        y: 40, // percentage y
        size: 120 // initial size in px
      };
      setStickers([...stickers, newSticker]);
      setStickerPrompt('');
      toast.success('AI Filter Sticker generated!');
    } catch (err) {
      toast.error('Failed to generate sticker. Try another prompt!');
      console.error(err);
    } finally {
      setIsGeneratingSticker(false);
    }
  };

  const handleMouseDown = (index, e) => {
    e.preventDefault();
    setDraggingIndex(index);
    const sticker = stickers[index];
    const container = previewContainerRef.current.getBoundingClientRect();
    
    // Calculate click offset relative to the sticker top-left corner
    const stickerX = (sticker.x / 100) * container.width;
    const stickerY = (sticker.y / 100) * container.height;
    
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    setDragOffset({
      x: clientX - container.left - stickerX,
      y: clientY - container.top - stickerY
    });
  };

  const handleMouseMove = (e) => {
    if (draggingIndex === null) return;
    const container = previewContainerRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    if (!clientX || !clientY) return;

    let xPx = clientX - container.left - dragOffset.x;
    let yPx = clientY - container.top - dragOffset.y;

    // Convert back to percentages
    const xPct = Math.max(0, Math.min(100, (xPx / container.width) * 100));
    const yPct = Math.max(0, Math.min(100, (yPx / container.height) * 100));

    const updatedStickers = [...stickers];
    updatedStickers[draggingIndex] = {
      ...updatedStickers[draggingIndex],
      x: xPct,
      y: yPct
    };
    setStickers(updatedStickers);
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
  };

  const handleCreate = async () => {
    if (!content.trim()) {
      toast.error('Please add a status description');
      return;
    }

    setIsLoading(true);
    try {
      // Compile overlays, stickers and GPU filters into the final canvas export!
      let finalMediaUrl = mediaUrl;
      if (mediaUrl && (stickers.length > 0 || ['vhs', 'neon', 'crown', 'dog', 'cat'].includes(selectedFilter))) {
        const combineCanvas = document.createElement('canvas');
        const img = new Image();
        img.src = mediaUrl;
        await new Promise((resolve) => { img.onload = resolve; });

        combineCanvas.width = img.naturalWidth;
        combineCanvas.height = img.naturalHeight;
        const ctx = combineCanvas.getContext('2d');

        // Apply GPU filters if present
        if (selectedFilter === 'vhs') {
          ctx.filter = 'contrast(1.25) saturate(0.7) sepia(0.15) brightness(1.05)';
        } else if (selectedFilter === 'neon') {
          ctx.filter = 'hue-rotate(280deg) saturate(2) contrast(1.15)';
        } else {
          ctx.filter = 'none';
        }

        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none'; // reset filter for vector overlays

        // Vintage VHS static date stamp
        if (selectedFilter === 'vhs') {
          ctx.font = 'bold ' + Math.round(combineCanvas.height * 0.03) + 'px "Courier New", Courier, monospace';
          ctx.fillStyle = '#f59e0b';
          const now = new Date();
          ctx.fillText(`PLAY  ${now.toLocaleTimeString()}`, combineCanvas.width * 0.05, combineCanvas.height * 0.9);
          ctx.fillText(`MAY ${now.getDate()} 2026`, combineCanvas.width * 0.05, combineCanvas.height * 0.94);
        }

        // Crown emoji overlay
        if (selectedFilter === 'crown') {
          ctx.font = Math.round(combineCanvas.height * 0.08) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('👑', combineCanvas.width * 0.5, combineCanvas.height * 0.22);
        }

        // Dog filter drawing on Canvas
        if (selectedFilter === 'dog') {
          // Draw left ear
          ctx.fillStyle = '#8B4513';
          ctx.beginPath();
          ctx.ellipse(combineCanvas.width * 0.25, combineCanvas.height * 0.18, combineCanvas.width * 0.12, combineCanvas.height * 0.2, Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#A0522D';
          ctx.beginPath();
          ctx.ellipse(combineCanvas.width * 0.25, combineCanvas.height * 0.18, combineCanvas.width * 0.08, combineCanvas.height * 0.14, Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();

          // Draw right ear
          ctx.fillStyle = '#8B4513';
          ctx.beginPath();
          ctx.ellipse(combineCanvas.width * 0.75, combineCanvas.height * 0.18, combineCanvas.width * 0.12, combineCanvas.height * 0.2, -Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#A0522D';
          ctx.beginPath();
          ctx.ellipse(combineCanvas.width * 0.75, combineCanvas.height * 0.18, combineCanvas.width * 0.08, combineCanvas.height * 0.14, -Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();

          // Draw snout
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.ellipse(combineCanvas.width * 0.5, combineCanvas.height * 0.55, combineCanvas.width * 0.14, combineCanvas.width * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();

          // Draw mouth/tongue
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(3, Math.round(combineCanvas.width * 0.008));
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.5, combineCanvas.height * 0.58);
          ctx.lineTo(combineCanvas.width * 0.5, combineCanvas.height * 0.65);
          ctx.stroke();

          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(combineCanvas.width * 0.5, combineCanvas.height * 0.65, combineCanvas.width * 0.05, 0, Math.PI, false);
          ctx.fill();
        }

        // Cat filter drawing on Canvas
        if (selectedFilter === 'cat') {
          // Draw left pointy ear
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.15, combineCanvas.height * 0.25);
          ctx.lineTo(combineCanvas.width * 0.35, combineCanvas.height * 0.05);
          ctx.lineTo(combineCanvas.width * 0.45, combineCanvas.height * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fda4af';
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.22, combineCanvas.height * 0.22);
          ctx.lineTo(combineCanvas.width * 0.35, combineCanvas.height * 0.09);
          ctx.lineTo(combineCanvas.width * 0.4, combineCanvas.height * 0.22);
          ctx.closePath();
          ctx.fill();

          // Draw right pointy ear
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.85, combineCanvas.height * 0.25);
          ctx.lineTo(combineCanvas.width * 0.65, combineCanvas.height * 0.05);
          ctx.lineTo(combineCanvas.width * 0.55, combineCanvas.height * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fda4af';
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.78, combineCanvas.height * 0.22);
          ctx.lineTo(combineCanvas.width * 0.65, combineCanvas.height * 0.09);
          ctx.lineTo(combineCanvas.width * 0.6, combineCanvas.height * 0.22);
          ctx.closePath();
          ctx.fill();

          // Draw pink nose
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.46, combineCanvas.height * 0.54);
          ctx.lineTo(combineCanvas.width * 0.54, combineCanvas.height * 0.54);
          ctx.lineTo(combineCanvas.width * 0.5, combineCanvas.height * 0.59);
          ctx.closePath();
          ctx.fill();

          // Draw whiskers left & right
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = Math.max(2, Math.round(combineCanvas.width * 0.006));
          ctx.beginPath();
          ctx.moveTo(combineCanvas.width * 0.42, combineCanvas.height * 0.55);
          ctx.lineTo(combineCanvas.width * 0.15, combineCanvas.height * 0.5);
          ctx.moveTo(combineCanvas.width * 0.42, combineCanvas.height * 0.57);
          ctx.lineTo(combineCanvas.width * 0.1, combineCanvas.height * 0.57);
          ctx.moveTo(combineCanvas.width * 0.42, combineCanvas.height * 0.59);
          ctx.lineTo(combineCanvas.width * 0.15, combineCanvas.height * 0.64);

          ctx.moveTo(combineCanvas.width * 0.58, combineCanvas.height * 0.55);
          ctx.lineTo(combineCanvas.width * 0.85, combineCanvas.height * 0.5);
          ctx.moveTo(combineCanvas.width * 0.58, combineCanvas.height * 0.57);
          ctx.lineTo(combineCanvas.width * 0.9, combineCanvas.height * 0.57);
          ctx.moveTo(combineCanvas.width * 0.58, combineCanvas.height * 0.59);
          ctx.lineTo(combineCanvas.width * 0.85, combineCanvas.height * 0.64);
          ctx.stroke();
        }

        // Overlay each sticker on the canvas
        for (const sticker of stickers) {
          const svgBlob = new Blob([sticker.svg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const svgImg = new Image();
          svgImg.src = url;
          await new Promise((resolve) => { svgImg.onload = resolve; });

          const xPx = (sticker.x / 100) * combineCanvas.width;
          const yPx = (sticker.y / 100) * combineCanvas.height;
          // Scale size proportional to original width
          const sizePx = (sticker.size / 300) * combineCanvas.width; 

          ctx.drawImage(svgImg, xPx, yPx, sizePx, sizePx);
          URL.revokeObjectURL(url);
        }
        finalMediaUrl = combineCanvas.toDataURL('image/jpeg');
      }

      await onCreate(content, finalMediaUrl, mediaType);
      stopCamera();
    } catch (error) {
      toast.error('Failed to publish story');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="story-creator-overlay" onMouseMove={handleMouseMove} onTouchMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}>
      <div className="story-creator glass-panel">
        <button className="close-btn" onClick={() => { stopCamera(); onClose(); }}>
          <FiX />
        </button>

        <h2>📸 Create high-fidelity snap & status</h2>

        <div className="creator-content">
          {/* CAMERA FEED OR IMAGE PREVIEW */}
          {isCameraOpen ? (
            <div className="camera-preview-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`video-preview filter-${selectedFilter}`}
              />
              {selectedFilter === 'crown' && (
                <div className="floating-crown-svg">👑</div>
              )}
              {selectedFilter === 'vhs' && (
                <div className="vhs-scanlines-overlay">REC 🔴</div>
              )}

              {/* Real-time Lens Filter Overlays */}
              {selectedFilter === 'dog' && (
                <div className="realtime-filter-overlay dog-filter">
                  <div className="dog-ears-wrapper">
                    <svg className="dog-ear left" viewBox="0 0 100 100" width="80" height="80">
                      <path d="M10,20 Q30,10 50,40 Q60,70 30,85 Q0,70 10,20" fill="#8B4513" />
                      <path d="M20,30 Q30,20 40,40 Q45,60 30,70 Q15,60 20,30" fill="#A0522D" />
                    </svg>
                    <svg className="dog-ear right" viewBox="0 0 100 100" width="80" height="80">
                      <path d="M90,20 Q70,10 50,40 Q40,70 70,85 Q100,70 90,20" fill="#8B4513" />
                      <path d="M80,30 Q70,20 60,40 Q55,60 70,70 Q85,60 80,30" fill="#A0522D" />
                    </svg>
                  </div>
                  <div className="dog-nose-wrapper">
                    <svg className="dog-snout" viewBox="0 0 100 60" width="70" height="42">
                      <ellipse cx="50" cy="20" rx="25" ry="15" fill="#1e293b" />
                      <path d="M50,28 L50,42" stroke="#000" strokeWidth="3" />
                      <path d="M42,39 Q50,45 58,39" fill="none" stroke="#000" strokeWidth="3" />
                      <path d="M45,42 Q50,56 55,42 Z" fill="#f43f5e" />
                    </svg>
                  </div>
                </div>
              )}
              {selectedFilter === 'cat' && (
                <div className="realtime-filter-overlay cat-filter">
                  <div className="cat-ears-wrapper">
                    <svg className="cat-ear left" viewBox="0 0 100 100" width="70" height="70">
                      <polygon points="10,80 50,10 90,80" fill="#475569" />
                      <polygon points="25,75 50,25 75,75" fill="#fda4af" />
                    </svg>
                    <svg className="cat-ear right" viewBox="0 0 100 100" width="70" height="70">
                      <polygon points="10,80 50,10 90,80" fill="#475569" />
                      <polygon points="25,75 50,25 75,75" fill="#fda4af" />
                    </svg>
                  </div>
                  <div className="cat-nose-wrapper">
                    <svg className="cat-snout" viewBox="0 0 100 60" width="90" height="54">
                      <polygon points="40,25 60,25 50,35" fill="#f43f5e" />
                      <line x1="30" y1="28" x2="5" y2="20" stroke="#1e293b" strokeWidth="3" />
                      <line x1="30" y1="33" x2="2" y2="33" stroke="#1e293b" strokeWidth="3" />
                      <line x1="30" y1="38" x2="5" y2="46" stroke="#1e293b" strokeWidth="3" />
                      <line x1="70" y1="28" x2="95" y2="20" stroke="#1e293b" strokeWidth="3" />
                      <line x1="70" y1="33" x2="98" y2="33" stroke="#1e293b" strokeWidth="3" />
                      <line x1="70" y1="38" x2="95" y2="46" stroke="#1e293b" strokeWidth="3" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Real-time Lens Slider */}
              <div className="lens-slider">
                <button
                  className={selectedFilter === 'none' ? 'active' : ''}
                  onClick={() => setSelectedFilter('none')}
                >
                  🎥 Original
                </button>
                <button
                  className={selectedFilter === 'vhs' ? 'active' : ''}
                  onClick={() => setSelectedFilter('vhs')}
                >
                  📼 VHS Retro
                </button>
                <button
                  className={selectedFilter === 'neon' ? 'active' : ''}
                  onClick={() => setSelectedFilter('neon')}
                >
                  🕶️ Cyber Neon
                </button>
                <button
                  className={selectedFilter === 'crown' ? 'active' : ''}
                  onClick={() => setSelectedFilter('crown')}
                >
                  👑 Crown
                </button>
                <button
                  className={selectedFilter === 'dog' ? 'active' : ''}
                  onClick={() => setSelectedFilter('dog')}
                >
                  🐶 Dog Filter
                </button>
                <button
                  className={selectedFilter === 'cat' ? 'active' : ''}
                  onClick={() => setSelectedFilter('cat')}
                >
                  🐱 Cat Filter
                </button>
                <button
                  className={selectedFilter === 'glitch' ? 'active' : ''}
                  onClick={() => setSelectedFilter('glitch')}
                >
                  ⚡ Glitch
                </button>
                <button
                  className={selectedFilter === 'pixelate' ? 'active' : ''}
                  onClick={() => setSelectedFilter('pixelate')}
                >
                  🟦 Pixelate
                </button>
                <button
                  className={selectedFilter === 'sunflower' ? 'active' : ''}
                  onClick={() => setSelectedFilter('sunflower')}
                >
                  🌻 Sunflower
                </button>
                <button
                  className={selectedFilter === 'space' ? 'active' : ''}
                  onClick={() => setSelectedFilter('space')}
                >
                  🌌 Space
                </button>
                <button
                  className={selectedFilter === 'rainbow' ? 'active' : ''}
                  onClick={() => setSelectedFilter('rainbow')}
                >
                  🌈 Rainbow
                </button>
                <button
                  className={selectedFilter === 'fire' ? 'active' : ''}
                  onClick={() => setSelectedFilter('fire')}
                >
                  🔥 Fire
                </button>
                <button
                  className={selectedFilter === 'vintage' ? 'active' : ''}
                  onClick={() => setSelectedFilter('vintage')}
                >
                  📷 Vintage
                </button>
                <button
                  className={selectedFilter === 'blackwhite' ? 'active' : ''}
                  onClick={() => setSelectedFilter('blackwhite')}
                >
                  🖤 B&W
                </button>
              </div>

              <div className="camera-controls">
                <button className="capture-btn" onClick={capturePhoto}>
                  <div className="inner-circle" />
                </button>
                <button className="text-btn" onClick={stopCamera}>
                  Cancel Camera
                </button>
              </div>
            </div>
          ) : mediaUrl ? (
            <div className="media-preview-container" ref={previewContainerRef}>
              <div className="media-preview">
                <img src={mediaUrl} alt="Story Preview" className={`filter-${selectedFilter}`} />
                {selectedFilter === 'vhs' && (
                  <div className="vhs-static-stamp">PLAY</div>
                )}
                {selectedFilter === 'crown' && (
                  <div className="floating-crown-svg">👑</div>
                )}
                {selectedFilter === 'dog' && (
                  <div className="realtime-filter-overlay dog-filter">
                    <div className="dog-ears-wrapper">
                      <svg className="dog-ear left" viewBox="0 0 100 100" width="80" height="80">
                        <path d="M10,20 Q30,10 50,40 Q60,70 30,85 Q0,70 10,20" fill="#8B4513" />
                        <path d="M20,30 Q30,20 40,40 Q45,60 30,70 Q15,60 20,30" fill="#A0522D" />
                      </svg>
                      <svg className="dog-ear right" viewBox="0 0 100 100" width="80" height="80">
                        <path d="M90,20 Q70,10 50,40 Q40,70 70,85 Q100,70 90,20" fill="#8B4513" />
                        <path d="M80,30 Q70,20 60,40 Q55,60 70,70 Q85,60 80,30" fill="#A0522D" />
                      </svg>
                    </div>
                    <div className="dog-nose-wrapper">
                      <svg className="dog-snout" viewBox="0 0 100 60" width="70" height="42">
                        <ellipse cx="50" cy="20" rx="25" ry="15" fill="#1e293b" />
                        <path d="M50,28 L50,42" stroke="#000" strokeWidth="3" />
                        <path d="M42,39 Q50,45 58,39" fill="none" stroke="#000" strokeWidth="3" />
                        <path d="M45,42 Q50,56 55,42 Z" fill="#f43f5e" />
                      </svg>
                    </div>
                  </div>
                )}
                {selectedFilter === 'cat' && (
                  <div className="realtime-filter-overlay cat-filter">
                    <div className="cat-ears-wrapper">
                      <svg className="cat-ear left" viewBox="0 0 100 100" width="70" height="70">
                        <polygon points="10,80 50,10 90,80" fill="#475569" />
                        <polygon points="25,75 50,25 75,75" fill="#fda4af" />
                      </svg>
                      <svg className="cat-ear right" viewBox="0 0 100 100" width="70" height="70">
                        <polygon points="10,80 50,10 90,80" fill="#475569" />
                        <polygon points="25,75 50,25 75,75" fill="#fda4af" />
                      </svg>
                    </div>
                    <div className="cat-nose-wrapper">
                      <svg className="cat-snout" viewBox="0 0 100 60" width="90" height="54">
                        <polygon points="40,25 60,25 50,35" fill="#f43f5e" />
                        <line x1="30" y1="28" x2="5" y2="20" stroke="#1e293b" strokeWidth="3" />
                        <line x1="30" y1="33" x2="2" y2="33" stroke="#1e293b" strokeWidth="3" />
                        <line x1="30" y1="38" x2="5" y2="46" stroke="#1e293b" strokeWidth="3" />
                        <line x1="70" y1="28" x2="95" y2="20" stroke="#1e293b" strokeWidth="3" />
                        <line x1="70" y1="33" x2="98" y2="33" stroke="#1e293b" strokeWidth="3" />
                        <line x1="70" y1="38" x2="95" y2="46" stroke="#1e293b" strokeWidth="3" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* ===== New Filters Overlays ===== */}
                {selectedFilter === 'glitch' && (
                  <div className="realtime-filter-overlay glitch-overlay">
                    <div className="glitch-bar glitch-bar-1" />
                    <div className="glitch-bar glitch-bar-2" />
                    <div className="glitch-bar glitch-bar-3" />
                    <span className="glitch-text">GLITCH</span>
                  </div>
                )}
                {selectedFilter === 'pixelate' && (
                  <div className="realtime-filter-overlay pixelate-overlay">
                    <div className="pixel-grid" />
                  </div>
                )}
                {selectedFilter === 'sunflower' && (
                  <div className="realtime-filter-overlay sunflower-overlay">
                    <span className="sunflower-emoji top-left">🌻</span>
                    <span className="sunflower-emoji top-right">🌻</span>
                    <span className="sunflower-emoji bottom-left">🌸</span>
                    <span className="sunflower-emoji bottom-right">🌸</span>
                    <div className="sunflower-border" />
                  </div>
                )}
                {selectedFilter === 'space' && (
                  <div className="realtime-filter-overlay space-overlay">
                    <div className="stars-layer" />
                    <span className="space-emoji">🚀</span>
                    <span className="space-planet">🪐</span>
                  </div>
                )}
                {selectedFilter === 'rainbow' && (
                  <div className="realtime-filter-overlay rainbow-overlay">
                    <div className="rainbow-arc" />
                    <span className="rainbow-star star-l">⭐</span>
                    <span className="rainbow-star star-r">⭐</span>
                  </div>
                )}
                {selectedFilter === 'fire' && (
                  <div className="realtime-filter-overlay fire-overlay">
                    <span className="fire-emoji fire-l">🔥</span>
                    <span className="fire-emoji fire-r">🔥</span>
                    <div className="fire-border" />
                  </div>
                )}
                
                {/* SVG Drag Overlays */}
                {stickers.map((sticker, idx) => (
                  <div
                    key={idx}
                    className="draggable-sticker"
                    style={{
                      left: `${sticker.x}%`,
                      top: `${sticker.y}%`,
                      width: `${sticker.size}px`,
                      height: `${sticker.size}px`
                    }}
                    onMouseDown={(e) => handleMouseDown(idx, e)}
                    onTouchStart={(e) => handleMouseDown(idx, e)}
                    dangerouslySetInnerHTML={{ __html: sticker.svg }}
                  />
                ))}
              </div>

              <div className="overlay-editor-tools">
                <button className="change-img-btn" onClick={() => { setMediaUrl(null); setMediaType('text'); setStickers([]); }}>
                  Delete Photo
                </button>

                {/* AI sticker Generator */}
                <div className="ai-sticker-creator">
                  <div className="flex-row">
                    <input
                      type="text"
                      placeholder="Ask Kane for an AI filter sticker... 🕶️"
                      value={stickerPrompt}
                      onChange={(e) => setStickerPrompt(e.target.value)}
                    />
                    <button
                      onClick={handleAddSticker}
                      disabled={isGeneratingSticker || !stickerPrompt.trim()}
                    >
                      {isGeneratingSticker ? '...' : <FiSmile />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="media-selector-box">
              <button className="selector-btn camera-sel" onClick={startCamera}>
                <FiCamera /> 📸 Use Live Webcam & Filters
              </button>
              <div className="divider-or">OR</div>
              <button className="selector-btn file-sel" onClick={() => fileInputRef.current?.click()}>
                <FiImage /> 📁 Upload Photo from Device
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                hidden
              />
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a status update/caption... (e.g. Studying coding late! 💻)"
            maxLength={250}
            rows={3}
            className="caption-textarea"
          />

          <div className="char-count">
            {content.length}/250
          </div>
        </div>

        <button
          className="create-btn highlight-btn"
          onClick={handleCreate}
          disabled={isLoading || !content.trim()}
        >
          {isLoading ? 'Processing Snap...' : '✨ Next / Send'}
        </button>
      </div>
      
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default StoryCreator;