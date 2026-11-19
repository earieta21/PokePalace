import { useState } from "react";
import { API_URL } from "../config";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./OrderSummary.module.css";

export default function SaveFavoriteBowl({ line, token, descriptionId }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    const favoriteName = name.trim();
    if (!favoriteName || saving) return;
    setSaving(true);
    setError("");
    try {
      const { base, bases, protein, proteins, bowlSize, marinades, complements, sauces, toppings, extraScoopProteins } = line;
      const response = await fetch(`${API_URL}/api/users/me/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: favoriteName, base, bases, protein, proteins, bowlSize,
          marinades, complements, sauces, toppings, extraScoopProteins,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.code === "favorite_limit" ? t("summary.favoriteLimit") : (data.msg || t("summary.favoriteSaveError")));
        return;
      }
      setSavedName(favoriteName);
      setEditing(false);
    } catch {
      setError(t("summary.favoriteSaveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.favoriteSection}>
      {savedName ? (
        <p className={styles.promoSuccess} role="status">{t("summary.favoriteSaved", { name: savedName })}</p>
      ) : editing ? (
        <form className={styles.favoriteRow} onSubmit={save}>
          <input
            className={styles.favoriteInput}
            autoFocus
            placeholder={t("summary.favoritePlaceholder")}
            aria-label={t("summary.favoriteName")}
            aria-describedby={descriptionId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            disabled={saving}
          />
          <button className={styles.favSaveBtn} type="submit" disabled={saving || !name.trim()}>
            {saving ? t("summary.savingFavorite") : t("summary.save")}
          </button>
          <button className={styles.favCancelBtn} type="button" disabled={saving} onClick={() => {
            setEditing(false);
            setName("");
            setError("");
          }}>
            {t("summary.cancel")}
          </button>
        </form>
      ) : (
        <button className={styles.favBtn} type="button" aria-describedby={descriptionId} onClick={() => setEditing(true)}>
          {t("summary.saveFavorite")}
        </button>
      )}
      {error && <p className={styles.promoError} role="alert">{error}</p>}
    </div>
  );
}
