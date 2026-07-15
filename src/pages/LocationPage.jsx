import "./LocationPage.css";
import { useLanguage } from "../i18n/LanguageContext";
import { GOOGLE_MAPS_URL } from "../config";

const LOCATION = {
  name: "Poke Palace",
  phone: "+52 663 108 6583",
  mapsUrl: GOOGLE_MAPS_URL,
  lat: 32.455826,
  lng: -116.919307,
};

export default function LocationPage() {
  const { t } = useLanguage();

  return (
    <main className="locationPage">
      <section className="locationHero">
        <div>
          <p className="locationBadge">{t("location.badge")}</p>
          <h1>{LOCATION.name}</h1>
          <p className="locationSub">
            {t("location.subtitle")}
          </p>
        </div>
      </section>

      <section className="locationCard">
        <div className="mapPanel" aria-label={t("location.map")}>
          <iframe
            title={`${t("location.map")} ${LOCATION.name}`}
            src={`https://www.google.com/maps?q=${LOCATION.lat},${LOCATION.lng}&z=17&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        <div className="detailsPanel">
          <p className="locationKicker">{t("location.main")}</p>
          <h2>{LOCATION.name}</h2>

          <div className="detailList">
            <div className="detailItem">
              <span className="detailIcon">📍</span>
              <div>
                <strong>{t("location.addressLabel")}</strong>
                <p>{t("location.address")}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">🕒</span>
              <div>
                <strong>{t("location.hoursLabel")}</strong>
                <p>{t("location.hours")}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">📞</span>
              <div>
                <strong>{t("location.phoneLabel")}</strong>
                <p>{LOCATION.phone}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">🥗</span>
              <div>
                <strong>{t("location.serviceLabel")}</strong>
                <p>{t("location.service")}</p>
              </div>
            </div>
          </div>

          <div className="locationActions">
            <a
              className="primaryLocationBtn"
              href={LOCATION.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("location.directions")}
            </a>
            <a className="ghostLocationBtn" href={`tel:${LOCATION.phone.replace(/\s/g, "")}`}>
              {t("location.call")}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
