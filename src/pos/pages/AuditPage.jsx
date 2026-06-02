const LOG = [
  { id: 1,  time: "12:34:02", action: "Orden #1051 marcada como completada",         user: "Maria G.",   type: "order" },
  { id: 2,  time: "12:31:18", action: "Nueva orden #1050 recibida",                   user: "Sistema",    type: "order" },
  { id: 3,  time: "12:28:44", action: "Inventario actualizado — Salsa Soya cant: 0.8",user: "Carlos R.",  type: "inv" },
  { id: 4,  time: "12:22:10", action: "Orden #1048 marcada como completada",          user: "Ana L.",     type: "order" },
  { id: 5,  time: "12:15:33", action: "Merma registrada — Salmón 0.4 kg",             user: "Carlos R.",  type: "waste" },
  { id: 6,  time: "12:08:05", action: "Inicio de sesión — Ana L.",                    user: "Ana L.",     type: "auth" },
  { id: 7,  time: "11:58:20", action: "Inventario actualizado — Aguacate cant: 14",   user: "Maria G.",   type: "inv" },
  { id: 8,  time: "11:45:11", action: "Orden #1044 creada",                           user: "Sistema",    type: "order" },
  { id: 9,  time: "11:30:00", action: "Inicio de sesión — Maria G.",                  user: "Maria G.",   type: "auth" },
  { id: 10, time: "11:20:44", action: "Merma registrada — Aguacate 3 pz",             user: "Maria G.",   type: "waste" },
  { id: 11, time: "11:15:00", action: "Horario publicado para la próxima semana",      user: "Priya S.",   type: "admin" },
  { id: 12, time: "10:58:32", action: "Inicio de sesión — Carlos R.",                 user: "Carlos R.",  type: "auth" },
];

const TYPE_LABEL = {
  order: "orden",
  inv:   "inventario",
  waste: "merma",
  auth:  "acceso",
  admin: "admin",
};

const TYPE_CFG = {
  order: { cls: "badgeBlue",   dot: "#1a3d80" },
  inv:   { cls: "badgeYellow", dot: "#7a5a0a" },
  waste: { cls: "badgeRed",    dot: "#8b1a1a" },
  auth:  { cls: "badgeGreen",  dot: "#1a6340" },
  admin: { cls: "badgeGray",   dot: "var(--p-muted)" },
};

export default function AuditPage({ styles }) {
  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Registro de Auditoría</h1>
          <p className={styles.pageSubtitle}>Actividad del sistema — hoy</p>
        </div>
        <button className={styles.btnGhost}>Exportar</button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Eventos de Hoy</p>
          <p className={styles.statValue}>{LOG.length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Eventos de Órdenes</p>
          <p className={styles.statValue}>{LOG.filter((l) => l.type === "order").length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Eventos de Acceso</p>
          <p className={styles.statValue}>{LOG.filter((l) => l.type === "auth").length}</p>
        </div>
      </div>

      <div className={styles.card}>
        <p className={styles.cardTitle}>Línea de Tiempo</p>
        <div className={styles.timeline}>
          {LOG.map((entry) => {
            const { cls, dot } = TYPE_CFG[entry.type] ?? TYPE_CFG.admin;
            return (
              <div key={entry.id} className={styles.timelineItem}>
                <div
                  className={styles.timelineDot}
                  style={{ background: dot }}
                />
                <div className={styles.timelineContent}>
                  <p className={styles.timelineAction}>{entry.action}</p>
                  <p className={styles.timelineMeta}>
                    <span
                      style={{
                        fontFamily: "DM Mono, monospace",
                        fontSize: 11,
                      }}
                    >
                      {entry.time}
                    </span>
                    {" · "}
                    {entry.user}
                    {" · "}
                    <span className={`${styles.badge} ${styles[cls]}`}>
                      {TYPE_LABEL[entry.type] ?? entry.type}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
