import React, { useState } from "react";
import LocationFinder from "../components/LocationFinder";
import "./LocationPage.css";

const LocationPage = () => {
  const [searchResults, setSearchResults] = useState([]);

  const sampleLocations = [
    { id: 1, city: "Tijuana", address: "123 Poke Lane, Tijuana, MX" },
    { id: 2, city: "San Diego", address: "456 Ocean Ave, San Diego, CA" },
    { id: 3, city: "Los Angeles", address: "789 Sunset Blvd, Los Angeles, CA" },
  ];

  const handleSearch = (query) => {
    // Simulate a search by filtering sample locations
    const results = sampleLocations.filter((location) =>
      location.city.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
  };

  return (
    <div className="location-page">
      <h1>Find a Location</h1>
      <p>Search for a Poke Palace near you!</p>
      <LocationFinder onSearch={handleSearch} />

      <div className="search-results">
        {searchResults.length > 0 ? (
          <ul>
            {searchResults.map((location) => (
              <li key={location.id}>
                <h3>{location.city}</h3>
                <p>{location.address}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No locations found. Please try a different city or ZIP code.</p>
        )}
      </div>
    </div>
  );
};

export default LocationPage;
