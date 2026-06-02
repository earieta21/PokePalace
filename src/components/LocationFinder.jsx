import React, { useState } from "react";
import styles from "./LocationFinder.module.css";

const LocationFinder = ({ onSearch }) => {
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    if (!location.trim()) {
      setError("Por favor ingresa una ciudad o código postal.");
      return;
    }
    setError("");
    onSearch(location);
  };

  return (
    <div className={styles.locationFinder}>
      <h2 className={styles.title}>Buscar una Sucursal</h2>
      <form onSubmit={handleSearch} className={styles.form}>
        <input
          type="text"
          placeholder="Ingresa ciudad o código postal"
          value={location}
          onChange={(e) => { setLocation(e.target.value); setError(""); }}
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          Buscar
        </button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
};

export default LocationFinder;
