import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiCalendar, FiMapPin, FiClock, FiPlus, FiX } from 'react-icons/fi';
import '../styles/SharedCalendar.css';

function SharedCalendar({ chat, onClose, socket, user }) {
  const [events, setEvents] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/calendar/${chat._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setEvents(res.data || []);
    } catch (err) {
      toast.error('Failed to load shared calendar events');
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [chat._id]);

  useEffect(() => {
    if (!socket) return;

    const handleNewEvent = (newEvent) => {
      if (newEvent.chatId === chat._id) {
        setEvents(prev => [...prev, newEvent]);
      }
    };

    const handleRsvpUpdated = (updatedEvent) => {
      if (updatedEvent.chatId === chat._id) {
        setEvents(prev => prev.map(e => e._id === updatedEvent._id ? updatedEvent : e));
      }
    };

    socket.on('new-event', handleNewEvent);
    socket.on('event-rsvp-updated', handleRsvpUpdated);

    return () => {
      socket.off('new-event', handleNewEvent);
      socket.off('event-rsvp-updated', handleRsvpUpdated);
    };
  }, [socket, chat._id]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const eventTimestamp = new Date(`${date}T${time}`);
      const res = await axios.post(`/api/calendar/${chat._id}`, {
        title,
        date,
        time,
        location,
        eventTimestamp: eventTimestamp.toISOString()
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setEvents(prev => [...prev, res.data]);
      setShowAddForm(false);
      setTitle('');
      setDate('');
      setTime('');
      setLocation('');
      toast.success('Group event created successfully! 📅');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create event');
    }
  };

  const handleRsvp = async (eventId, status) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/calendar/events/${eventId}/rsvp`, { status }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setEvents(prev => prev.map(e => e._id === eventId ? res.data : e));
      toast.success(`RSVP updated to ${status}!`);
    } catch (err) {
      toast.error('Failed to update RSVP');
    }
  };

  return (
    <div className="shared-calendar-overlay" onClick={onClose}>
      <div className="shared-calendar-modal" onClick={e => e.stopPropagation()}>
        <div className="calendar-modal-header">
          <h3>📅 Shared Group Calendar</h3>
          <button className="calendar-close-btn" onClick={onClose}><FiX size={20} /></button>
        </div>

        <div className="calendar-modal-body">
          <div className="calendar-actions">
            <button className="create-event-trigger" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'View Events' : <><FiPlus /> Create Event</>}
            </button>
          </div>

          {showAddForm ? (
            <form onSubmit={handleAddEvent} className="calendar-event-form">
              <h4>Create Group Event</h4>
              <input
                type="text"
                placeholder="Event Title (e.g. Movie Night)..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
              <div className="form-row">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  required
                />
              </div>
              <input
                type="text"
                placeholder="Location (e.g. Living room, Mall)..."
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
              <button type="submit" className="submit-event-btn">Add Event to Calendar</button>
            </form>
          ) : (
            <div className="events-list">
              {events.length === 0 ? (
                <div className="no-events">
                  <FiCalendar size={48} />
                  <p>No events scheduled. Plan something together!</p>
                </div>
              ) : (
                events.map(ev => {
                  const myRsvp = ev.rsvps?.find(r => r.user?._id === user.id)?.status;
                  const goingCount = ev.rsvps?.filter(r => r.status === 'going').length || 0;

                  return (
                    <div key={ev._id} className="event-card">
                      <div className="event-info-main">
                        <h5>{ev.title}</h5>
                        <div className="event-meta">
                          <span><FiCalendar size={12} /> {new Date(ev.date).toLocaleDateString()}</span>
                          <span><FiClock size={12} /> {ev.time}</span>
                          {ev.location && <span><FiMapPin size={12} /> {ev.location}</span>}
                        </div>
                        <span className="rsvp-count">👥 {goingCount} going</span>
                      </div>

                      <div className="event-rsvp-section">
                        <span className="rsvp-label">RSVP:</span>
                        <div className="rsvp-buttons">
                          <button
                            className={`rsvp-btn going ${myRsvp === 'going' ? 'active' : ''}`}
                            onClick={() => handleRsvp(ev._id, 'going')}
                          >
                            Going
                          </button>
                          <button
                            className={`rsvp-btn maybe ${myRsvp === 'maybe' ? 'active' : ''}`}
                            onClick={() => handleRsvp(ev._id, 'maybe')}
                          >
                            Maybe
                          </button>
                          <button
                            className={`rsvp-btn declined ${myRsvp === 'declined' ? 'active' : ''}`}
                            onClick={() => handleRsvp(ev._id, 'declined')}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedCalendar;
