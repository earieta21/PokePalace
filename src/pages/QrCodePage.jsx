import "./QrCodePage.css";
import { useLanguage } from "../i18n/LanguageContext";

export default function QrCodePage() {
  const { t, language } = useLanguage();

  return (
    <main className="qrPage">
      <div className="qrHero">
        <p className="qrBadge">{language === "es" ? "Código QR" : "QR Code"}</p>
        <h1>{language === "es" ? "Comparte Poke Palace" : "Share Poke Palace"}</h1>
        <p className="qrSub">
          {language === "es"
            ? "Descarga o imprime este código para mesas, ventanas, empaques o redes sociales."
            : "Download or print this code for tables, windows, packaging, or social media."}
        </p>
      </div>

      <div className="qrPrintArea">
        <div className="qrCard">
          <div className="qrChip">
            <img src="/qr-code.png" alt="Código QR — pokepalace.org" width="200" height="200" />
          </div>

          <p className="qrInstruction">
            {language === "es" ? "Apunta la cámara de tu celular" : "Point your phone's camera"}
          </p>
          <p className="qrTarget">pokepalace.org</p>

          <div className="qrDivider" />

          <p className="qrMeta">
            <strong>Blvd. Gustavo Díaz Ordaz</strong><br />
            Plaza La Estación, Local 24 · Tijuana<br />
            {t("location.hours")}
          </p>

          <div className="qrActions">
            <button className="qrPrimaryBtn" onClick={() => window.print()}>
              {language === "es" ? "Imprimir" : "Print"}
            </button>
            <a className="qrGhostBtn" href="/qr-code.png" download="poke-palace-qr.png">
              {language === "es" ? "Descargar" : "Download"}
            </a>
          </div>
        </div>
      </div>

      <p className="qrHint">
        {language === "es"
          ? 'También puedes mantener presionada la imagen y elegir "Guardar imagen".'
          : 'You can also press and hold the image and choose "Save Image".'}
      </p>
    </main>
  );
}
