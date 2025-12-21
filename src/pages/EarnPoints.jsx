import React from "react";
import styles from "./EarnPoints.module.css"; // Import CSS Module

const EarnPoints = ({ userPoints, onRedeem }) => {
  const nextReward = 100; // Example: 100 points for the next reward
  const progressPercentage = Math.min((userPoints / nextReward) * 100, 100);

  return (
    <div className={styles.earnPointsContainer}>
      <h2 className={styles.title}>Earn Points</h2>
      <div className={styles.pointsDisplay}>
        <p>
          <strong>{userPoints}</strong> points
        </p>
        <p>
          Next reward at <strong>{nextReward}</strong> points
        </p>
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progress}
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
      <button
        className={styles.redeemButton}
        onClick={onRedeem}
        disabled={userPoints < nextReward}
      >
        Redeem Reward
      </button>
      <p className={styles.howToEarn}>
        Earn points by ordering your favorite poke bowls! $1 = 1 point.
      </p>
    </div>
  );
};

export default EarnPoints;
