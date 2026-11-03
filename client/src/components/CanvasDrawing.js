import React, { useRef, useState, useEffect } from 'react';
import { FiX, FiTrash2, FiMinus, FiCircle } from 'react-icons/fi';
import '../styles/CanvasDrawing.css';

const CanvasDrawing = ({ onClose, socket, chatId, recipientId, participants, user }) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#1a1a1a');
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);

  const colors = [
    { name: 'dark', hex: '#1a1a1a' },
    { name: 'red', hex: '#ff4d4d' },
    { name: 'blue', hex: '#2196f3' },
    { name: 'green', hex: '#4caf50' },
    { name: 'yellow', hex: '#ffeb3b' }
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set high-DPI scaling for crisp lines
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = canvas.getContext('2d');
    context.scale(2, 2);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = brushColor;
    context.lineWidth = brushSize;
    contextRef.current = context;

    // Load background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rect.width, rect.height);
  }, []);

  // Sync brush settings
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = isEraser ? '#ffffff' : brushColor;
      contextRef.current.lineWidth = brushSize;
    }
  }, [brushColor, brushSize, isEraser]);

  // Handle incoming socket drawing events
  useEffect(() => {
    if (!socket) return;

    const handleRemoteDraw = (data) => {
      if (data.chatId !== chatId) return;
      const context = contextRef.current;
      if (!context) return;

      context.beginPath();
      context.lineWidth = data.size;
      context.strokeStyle = data.color;
      context.moveTo(data.x0, data.y0);
      context.lineTo(data.x1, data.y1);
      context.stroke();
      context.closePath();
    };

    const handleRemoteClear = (data) => {
      if (data.chatId !== chatId) return;
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (canvas && context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    socket.on('draw-line', handleRemoteDraw);
    socket.on('clear-canvas', handleRemoteClear);

    return () => {
      socket.off('draw-line', handleRemoteDraw);
      socket.off('clear-canvas', handleRemoteClear);
    };
  }, [socket, chatId]);

  // Local drawing handlers
  const startDrawing = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    contextRef.current.beginPath();
    contextRef.current.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    
    // Store starting coordinates for the drag segment
    canvasRef.current.lastX = coords.x;
    canvasRef.current.lastY = coords.y;
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const lastX = canvasRef.current.lastX;
    const lastY = canvasRef.current.lastY;

    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();

    // Emit drawing action to friends
    if (socket) {
      socket.emit('draw-line', {
        chatId,
        senderId: user.id,
        recipientId,
        participants: participants ? participants.map(p => p._id) : undefined,
        x0: lastX,
        y0: lastY,
        x1: coords.x,
        y1: coords.y,
        color: isEraser ? '#ffffff' : brushColor,
        size: brushSize
      });
    }

    canvasRef.current.lastX = coords.x;
    canvasRef.current.lastY = coords.y;
  };

  const stopDrawing = () => {
    if (isDrawing) {
      contextRef.current.closePath();
      setIsDrawing(false);
    }
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    // Check touch vs mouse
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      if (socket) {
        socket.emit('clear-canvas', {
          chatId,
          senderId: user.id,
          recipientId,
          participants: participants ? participants.map(p => p._id) : undefined
        });
      }
    }
  };

  return (
    <div className="canvas-whiteboard-overlay">
      <div className="canvas-container-glass">
        {/* Header */}
        <div className="canvas-header">
          <div className="title-area">
            <span className="dot animate-pulse"></span>
            <h3>Real-Time Whiteboard</h3>
          </div>
          <button className="close-btn-round" onClick={onClose} title="Close Canvas">
            <FiX size={18} />
          </button>
        </div>

        {/* Board */}
        <div className="canvas-body">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Toolbar Controls */}
        <div className="canvas-toolbar">
          {/* Colors */}
          <div className="control-group">
            <label>Color</label>
            <div className="options-row">
              {colors.map((c) => (
                <button
                  key={c.hex}
                  className={`color-pill ${brushColor === c.hex && !isEraser ? 'active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => {
                    setBrushColor(c.hex);
                    setIsEraser(false);
                  }}
                  title={c.name}
                />
              ))}
              <button
                className={`eraser-btn ${isEraser ? 'active' : ''}`}
                onClick={() => setIsEraser(true)}
                title="Eraser"
              >
                🧽
              </button>
            </div>
          </div>

          {/* Sizes */}
          <div className="control-group">
            <label>Brush Size</label>
            <div className="options-row brush-size-slider">
              <input
                type="range"
                min="2"
                max="25"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
              />
              <span className="size-badge">{brushSize}px</span>
            </div>
          </div>

          {/* Actions */}
          <div className="control-group actions-group">
            <button className="clear-btn-luxury" onClick={clearCanvas} title="Clear Board">
              <FiTrash2 size={16} /> Clear Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasDrawing;
