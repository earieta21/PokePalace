import { Fragment } from "react";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const STAFF = [
  { name: "Maria G.",  role: "manager" },
  { name: "Carlos R.", role: "kitchen" },
  { name: "Ana L.",    role: "cashier" },
  { name: "James K.",  role: "kitchen" },
  { name: "Sofia M.",  role: "cashier" },
];

// shift data: [dayIndex] = shift string or null
const SCHEDULE = {
  "Maria G.":  ["9-5",  "9-5",  "9-5",  null,   "9-5",  "10-6", null  ],
  "Carlos R.": ["10-6", "10-6", null,   "10-6", "10-6", "11-7", "11-7"],
  "Ana L.":    [null,   "8-4",  "8-4",  "8-4",  "8-4",  "9-5",  null  ],
  "James K.":  ["7-3",  "7-3",  "7-3",  "7-3",  null,   "7-3",  "7-3" ],
  "Sofia M.":  [null,   null,   "12-8", "12-8", "12-8", "12-8", "12-8"],
};

const ROLE_COLORS = {
  manager: "rgba(30,80,180,0.12)",
  kitchen: "rgba(212,160,23,0.12)",
  cashier: "rgba(82,183,136,0.12)",
};

const ROLE_TEXT = {
  manager: "#1a3d80",
  kitchen: "#7a5a0a",
  cashier: "#1a6340",
};

const ROLE_LABEL = {
  manager: "Gerente",
  kitchen: "Cocina",
  cashier: "Cajero",
};

export default function SchedulePage({ styles }) {
  const totalShifts = Object.values(SCHEDULE).flat().filter(Boolean).length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Horarios</h1>
          <p className={styles.pageSubtitle}>
            Semana del 26 May – 1 Jun · {totalShifts} turnos programados
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.btnGhost}>← Anterior</button>
          <button className={styles.btnGhost}>Siguiente →</button>
          <button className={styles.btnPrimary}>Publicar</button>
        </div>
      </div>

      <div className={styles.schedWrap}>
        <div className={styles.schedGrid}>
          {/* Header row */}
          <div className={styles.schedHeadCell}>Personal</div>
          {DAYS.map((d) => (
            <div key={d} className={styles.schedHeadCell}>{d}</div>
          ))}

          {/* Staff rows */}
          {STAFF.map((emp) => (
            <Fragment key={emp.name}>
              <div className={styles.schedNameCell}>
                <span className={styles.schedName}>{emp.name}</span>
              </div>
              {DAYS.map((d, i) => {
                const shift = SCHEDULE[emp.name]?.[i];
                return (
                  <div key={`${emp.name}-${d}`} className={styles.schedCell}>
                    {shift ? (
                      <div
                        className={styles.schedShift}
                        style={{
                          background: ROLE_COLORS[emp.role],
                          color: ROLE_TEXT[emp.role],
                        }}
                      >
                        {shift}
                      </div>
                    ) : (
                      <span className={styles.schedOff}>Libre</span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 14,
          fontSize: 12,
          flexWrap: "wrap",
        }}
      >
        {Object.entries(ROLE_COLORS).map(([role, bg]) => (
          <span key={role} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: bg,
                border: `1px solid ${ROLE_TEXT[role]}`,
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--p-muted)", fontWeight: 500 }}>
              {ROLE_LABEL[role]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
