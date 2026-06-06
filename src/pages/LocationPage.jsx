import "./LocationPage.css";

const LOCATION = {
  name: "Poke Palace",
  label: "Local principal",
  address: "Ubicación exacta en Google Maps",
  phone: "+52 663 108 6583",
  hours: "Lunes a domingo · 11:00 AM - 9:00 PM",
  pickup: "Pedidos para recoger y comer en restaurante",
  mapsUrl: "https://maps.app.goo.gl/XY9uU2vr8MER54CG7?g_st=ic",
};

const mapQuery = encodeURIComponent(LOCATION.mapsUrl);

export default function LocationPage() {
  return (
    <main className="locationPage">
      <section className="locationHero">
        <div>
          <p className="locationBadge">Ubicación</p>
          <h1>{LOCATION.name}</h1>
          <p className="locationSub">
            Encuentra nuestro local, revisa horarios y abre indicaciones para llegar.
          </p>
        </div>
      </section>

      <section className="locationCard">
        <div className="mapPanel" aria-label="Mapa de ubicación">
          <iframe
            title={`Mapa de ${LOCATION.name}`}
            src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="detailsPanel">
          <p className="locationKicker">{LOCATION.label}</p>
          <h2>{LOCATION.name}</h2>

          <div className="detailList">
            <div className="detailItem">
              <span className="detailIcon">📍</span>
              <div>
                <strong>Dirección</strong>
                <p>{LOCATION.address}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">🕒</span>
              <div>
                <strong>Horario</strong>
                <p>{LOCATION.hours}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">📞</span>
              <div>
                <strong>Teléfono</strong>
                <p>{LOCATION.phone}</p>
              </div>
            </div>

            <div className="detailItem">
              <span className="detailIcon">🥗</span>
              <div>
                <strong>Servicio</strong>
                <p>{LOCATION.pickup}</p>
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
              Cómo llegar
            </a>
            <a className="ghostLocationBtn" href={`tel:${LOCATION.phone.replace(/\s/g, "")}`}>
              Llamar
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
