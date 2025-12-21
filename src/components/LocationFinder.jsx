import React, { useState } from "react";
import styles from "./LocationFinder.module.css";

const LocationFinder = ({ onSearch }) => {
  const [location, setLocation] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    if (location.trim()) {
      onSearch(location);
    } else {
      alert("Please enter a valid location.");
    }
  };

  return (
    <div className={styles.locationFinder}>
      <h2 className={styles.title}>Search for a Store</h2>
      <form onSubmit={handleSearch} className={styles.form}>
        <input
          type="text"
          placeholder="Enter city or ZIP code"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>
    </div>
  );
};

export default LocationFinder;
