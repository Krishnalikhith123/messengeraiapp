import React from 'react';
import { FiMapPin, FiExternalLink } from 'react-icons/fi';
import '../styles/LocationMessage.css';

function LocationMessage({ message }) {
  const { latitude, longitude, locationLabel } = message;

  if (!latitude || !longitude) return null;

  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude-0.005}%2C${latitude-0.005}%2C${longitude+0.005}%2C${latitude+0.005}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  const externalUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <div className="location-message-card">
      <div className="location-header">
        <FiMapPin className="location-pin-icon" />
        <span className="location-label">{locationLabel || 'Shared Location'}</span>
      </div>
      <div className="location-map-container">
        <iframe
          title="Shared Location Map"
          width="100%"
          height="180"
          frameBorder="0"
          scrolling="no"
          marginHeight="0"
          marginWidth="0"
          src={mapUrl}
          className="location-iframe"
        />
      </div>
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="view-maps-btn"
      >
        <span>View on Google Maps</span>
        <FiExternalLink size={14} />
      </a>
    </div>
  );
}

export default LocationMessage;
