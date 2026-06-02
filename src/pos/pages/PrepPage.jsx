const PREP_ITEMS = [
  { name: "Arroz para Sushi",        target: 20, done: 16 },
  { name: "Atún Ahi (rebanado)",     target: 8,  done: 8  },
  { name: "Salmón (en cubos)",       target: 6,  done: 4  },
  { name: "Pepino Encurtido",        target: 4,  done: 4  },
  { name: "Edamame (sin vaina)",     target: 3,  done: 1  },
  { name: "Aguacate (rebanado)",     target: 10, done: 6  },
  { name: "Mango (en cubos)",        target: 3,  done: 3  },
  { name: "Ensalada de Algas",       target: 5,  done: 2  },
  { name: "Salsa Ponzu (lote)",      target: 2,  done: 2  },
  { name: "Mayo Picante",            target: 2,  done: 1  },
];

export default function PrepPage({ styles }) {
  const complete    = PREP_ITEMS.filter((i) => i.done >= i.target).length;
  const inProgress  = PREP_ITEMS.filter((i) => i.done > 0 && i.done < i.target).length;
  const notStarted  = PREP_ITEMS.filter((i) => i.done === 0).length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Preparación</h1>
          <p className={styles.pageSubtitle}>
            {complete} de {PREP_ITEMS.length} artículos listos hoy
          </p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Completados</p>
          <p className={`${styles.statValue} ${styles.statAccent}`}>{complete}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>En Proceso</p>
          <p className={styles.statValue}>{inProgress}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Sin Iniciar</p>
          <p className={styles.statValue}>{notStarted}</p>
        </div>
      </div>

      <div className={styles.prepList}>
        {PREP_ITEMS.map((item) => {
          const pct  = Math.min(100, Math.round((item.done / item.target) * 100));
          const done = item.done >= item.target;
          return (
            <div key={item.name} className={styles.prepRow}>
              <span className={styles.prepName}>{item.name}</span>
              <div className={styles.prepBar}>
                <div
                  className={`${styles.prepBarFill} ${done ? styles.prepBarDone : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.prepNums}>
                {item.done} / {item.target}
              </span>
              {done && (
                <span className={`${styles.badge} ${styles.badgeGreen}`}>Listo</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
