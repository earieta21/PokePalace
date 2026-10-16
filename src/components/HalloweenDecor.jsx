// Dibujos del tema de Halloween (ver src/data/seasonalTheme.js). Son
// decorativos: siempre van aria-hidden y el color/posición lo pone quien
// los usa — el murciélago toma `fill` del CSS, la calabaza trae sus colores.
export const Bat = ({ className }) => (
  <svg className={className} viewBox="0 0 64 28" aria-hidden="true" focusable="false">
    <path d="M32 9c-1.6-3-3.4-4.4-4.6-4.6.5 1.3.4 2.6-.2 3.6C24 5.4 18.8 2.6 12 3.2c3 1.6 4.6 4 4.4 6.6C12.6 8 6.4 8.2 0 12c5.6.4 9.6 2.6 11.4 6 2.4-2.2 6.4-2.6 9.4-.8 1.4-2.4 4-3.6 6.6-3 1 2.2 2.8 4 4.6 5 1.8-1 3.6-2.8 4.6-5 2.6-.6 5.2.6 6.6 3 3-1.8 7-1.4 9.4.8C54.4 14.6 58.4 12.4 64 12c-6.4-3.8-12.6-4-16.4-2.2-.2-2.6 1.4-5 4.4-6.6-6.8-.6-12 2.2-15.2 4.8-.6-1-.7-2.3-.2-3.6C35.4 4.6 33.6 6 32 9Z" />
  </svg>
);

export const Pumpkin = ({ className }) => (
  <svg className={className} viewBox="0 0 64 60" aria-hidden="true" focusable="false">
    <path fill="#4f7a3a" d="M30 14c0-6 2-10 7-12l2 3c-4 2-5 5-5 9z" />
    <ellipse fill="#e8691a" cx="20" cy="36" rx="15" ry="20" />
    <ellipse fill="#e8691a" cx="44" cy="36" rx="15" ry="20" />
    <ellipse fill="#ff8a2b" cx="32" cy="36" rx="13" ry="21" />
    <path fill="#2a1405" d="M20 30l6-6 4 6zM34 30l4-6 6 6zM18 40c4 6 24 6 28 0l-4 1-3 4-3-3-4 3-4-3-3 3-3-4z" />
  </svg>
);
