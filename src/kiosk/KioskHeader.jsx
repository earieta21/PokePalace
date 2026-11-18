import { Leaf, X } from "lucide-react";
import styles from "./KioskHeader.module.css";

// Marca y "Cancelar pedido", igual en el menú y en el resumen del kiosco.
export default function KioskHeader({ onCancel }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Leaf size={28} strokeWidth={1.5} aria-hidden="true" />
        <span>
          Poke Palace<small>FRESCO. A TU GUSTO.</small>
        </span>
      </div>
      <button type="button" onClick={onCancel} className={styles.cancel}>
        <X size={17} aria-hidden="true" /> Cancelar pedido
      </button>
    </header>
  );
}
