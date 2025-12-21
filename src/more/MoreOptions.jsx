import React, { useState } from "react";
import styles from "./MoreOptions.module.css";

const MoreOptions = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOptions = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={styles.moreOptionsContainer}>
      <button className={styles.toggleButton} onClick={toggleOptions}>
        More Options
      </button>
      {isOpen && (
        <div className={styles.optionsMenu}>
          <ul className={styles.optionsList}>
            <li className={styles.optionItem}>
              <a href="/profile">Profile</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/recent-faves">Recent & Faves</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/missing-points">Missing Points from Receipt</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/locations">Locations</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/nutrition">Nutrition & More</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/help-careers">Help & Careers</a>
            </li>
            <li className={styles.optionItem}>
              <a href="/contact-legal">Contact & Legal</a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default MoreOptions;
