import { useId } from "react";
import { getItemLabel } from "./OrderLabels";
import {
  getBowlLayers,
  INGREDIENT_ART,
  MARINADE_COLORS,
  SAUCE_COLORS,
  TOPPING_ART,
  scatter,
} from "./bowlPreviewModel";
import styles from "./LiveBowl.module.css";

function Piece({ shape, color }) {
  if (shape === "cucumber")
    return (
      <g>
        <circle r="12" fill={color} />
        <circle r="9.5" fill="#d3e3a5" />
        <path d="M0-6 2-2-2-2ZM6 1 2 3 3-1ZM-3 6-4 1-1 3Z" fill="#f6f1c9" />
        <circle r="11" fill="none" stroke="#3b7140" strokeWidth="1" />
      </g>
    );
  if (shape === "avocado")
    return (
      <g>
        <path d="M-17-12Q-8 24 19 6L14 1Q-5 10-10-14Z" fill="#58723b" />
        <path d="M-15-12Q-7 20 17 5L13 1Q-5 8-10-13Z" fill={color} />
        <path
          d="M-11-10Q-5 12 11 4"
          fill="none"
          stroke="#e2e6a2"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
    );
  if (shape === "leaf")
    return (
      <g>
        <path
          d="M0 15C-26 2-18-21-5-15C1-31 25-12 14 0C26 15 6 20 0 15Z"
          fill={color}
        />
        <path
          d="M0 15-2-11M-1 5 10-3M-1 1-12-8"
          fill="none"
          stroke="#bbce82"
          strokeWidth="1.4"
          opacity=".6"
        />
      </g>
    );
  if (shape === "shrimp")
    return (
      <g>
        <path
          d="M9-9C-11-21-21 7-3 13C4 16 11 12 13 7"
          fill="none"
          stroke="#f9d0ac"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d="M7-12-1-5M-7-11-5-2M-14-2-6 2M-12 9-4 5M-3 14 0 7"
          stroke={color}
          strokeWidth="3"
        />
        <path d="M10 8 19 4 17 14Z" fill={color} />
      </g>
    );
  if (shape === "onion")
    return (
      <g fill="none" stroke={color} strokeWidth="3">
        <path d="M-11 7C-20-14 14-18 13 4M-7 7C-12-8 9-11 9 2" />
        <path d="M-10 7C-17-11 13-15 12 4" stroke="#f5dbc6" strokeWidth="1" />
      </g>
    );
  if (shape === "ring")
    return (
      <g>
        <ellipse rx="9" ry="7" fill={color} />
        <ellipse rx="4" ry="3" fill="#ddcfaa" />
        <path
          d="M-6-3Q0-7 6-3"
          stroke="#ffffff"
          opacity=".28"
          fill="none"
          strokeWidth="1.5"
        />
      </g>
    );
  if (shape === "shred")
    return (
      <path
        d="M-13 4Q-3-5 12-3"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    );
  if (shape === "bean")
    return (
      <g>
        <ellipse rx="8" ry="5.5" fill={color} />
        <path
          d="M-4-2Q0-4 4-2"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          opacity=".35"
          strokeLinecap="round"
        />
      </g>
    );
  if (shape === "seed")
    return (
      <ellipse rx="2" ry="4" fill={color} stroke="#665539" strokeWidth=".35" />
    );
  if (shape === "roe")
    return (
      <g fill={color} stroke="#b9501f" strokeWidth=".5">
        <circle cx="-3" r="3" />
        <circle cx="3" r="3" />
        <circle cy="-4" r="3" />
        <circle cy="4" r="3" />
      </g>
    );
  if (shape === "surimi")
    return (
      <g>
        <rect x="-6" y="-13" width="12" height="26" rx="3" fill="#f4e6cc" />
        <rect x="-6" y="-13" width="4" height="26" rx="2" fill={color} />
        <path d="M1-10V10M4-10V10" stroke="#dbc7aa" strokeWidth=".8" />
      </g>
    );
  return (
    <g>
      <path
        d="M-10-8 5-11 12-3 10 10-5 12-12 4Z"
        fill={color}
        stroke="#664535"
        strokeOpacity=".18"
      />
      <path d="M-10-8 5-11 12-3-3 0Z" fill="#fff" opacity=".17" />
      <path d="M-3 0 12-3 10 10-5 12Z" fill="#633b2a" opacity=".09" />
      {shape === "salmon" && (
        <path
          d="M-7-5 3 5M-2-8 8 2M-8 2 1 10"
          stroke="#ffdfad"
          strokeWidth="1.8"
          opacity=".8"
        />
      )}
    </g>
  );
}

function Portion({ id, category, language, position, scale = 1 }) {
  const art = INGREDIENT_ART[id] || {
    shape: "cube",
    color: "#b6b66b",
    x: 180,
    y: 180,
  };
  const count =
    art.shape === "shred"
      ? 27
      : art.shape === "bean"
        ? 16
        : art.shape === "avocado"
          ? 5
          : 7;
  return (
    <g
      data-ingredient={`${category}:${id}`}
      transform={`translate(${position?.x ?? art.x} ${position?.y ?? art.y}) scale(${scale})`}
    >
      <title>{getItemLabel(category, id, language)}</title>
      <g className={styles.arrival}>
        {scatter(id, count, art.shape === "avocado" ? 15 : 23).map(
          (point, index) => (
            <g
              key={index}
              transform={`translate(${point.x} ${point.y}) rotate(${art.shape === "avocado" ? -30 : point.rotation})`}
            >
              <Piece {...art} />
            </g>
          ),
        )}
      </g>
    </g>
  );
}

export default function LiveBowl({ order, language = "es", compact = false }) {
  const instance = useId().replaceAll(":", "");
  const uid = (name) => `${instance}-${name}`;
  const url = (name) => `url(#${uid(name)})`;
  const layers = getBowlLayers(order);
  const selected = Object.entries(layers)
    .filter(([key]) => key !== "extraScoops")
    .flatMap(([, ids]) => ids);
  const empty = selected.length === 0;
  return (
    <div className={`${styles.visual} ${compact ? styles.compact : ""}`}>
      <svg
        viewBox="0 0 360 360"
        className={styles.bowl}
        role="img"
        aria-labelledby={uid("title")}
        aria-describedby={uid("description")}
      >
        <title id={uid("title")}>
          {language === "en"
            ? "Your bowl, built live"
            : "Tu bowl, armado en vivo"}
        </title>
        <desc id={uid("description")}>
          {empty
            ? language === "en"
              ? "Empty bowl. Choose your first ingredient."
              : "Bowl vacío. Elige tu primer ingrediente."
            : [
                ...layers.bases.map((id) => getItemLabel("base", id, language)),
                ...layers.proteins.map((id) =>
                  getItemLabel("protein", id, language),
                ),
                ...layers.complements.map((id) =>
                  getItemLabel("complement", id, language),
                ),
                ...layers.marinades.map((id) =>
                  getItemLabel("marinade", id, language),
                ),
                ...layers.sauces.map((id) =>
                  getItemLabel("sauce", id, language),
                ),
                ...layers.toppings.map((id) =>
                  getItemLabel("topping", id, language),
                ),
              ].join(", ")}
        </desc>
        <defs>
          <radialGradient id={uid("ceramic")} cx="45%" cy="35%">
            <stop stopColor="#fffdf6" />
            <stop offset=".82" stopColor="#f2ebdb" />
            <stop offset="1" stopColor="#cfc3aa" />
          </radialGradient>
          <radialGradient id={uid("inside")}>
            <stop stopColor="#f6f0e4" />
            <stop offset=".83" stopColor="#e5dbc6" />
            <stop offset="1" stopColor="#c5b89e" />
          </radialGradient>
          <clipPath id={uid("food")}>
            <circle cx="180" cy="177" r="132" />
          </clipPath>
          <pattern
            id={uid("rice")}
            width="22"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <rect width="22" height="20" fill="#ede4cc" />
            <g fill="#fff8e8" stroke="#ded2b7" strokeWidth=".6">
              <ellipse
                cx="5"
                cy="5"
                rx="3"
                ry="6"
                transform="rotate(-30 5 5)"
              />
              <ellipse
                cx="16"
                cy="14"
                rx="3"
                ry="6"
                transform="rotate(35 16 14)"
              />
              <ellipse
                cx="4"
                cy="18"
                rx="2.5"
                ry="5"
                transform="rotate(65 4 18)"
              />
            </g>
          </pattern>
          <pattern
            id={uid("quinoa")}
            width="19"
            height="19"
            patternUnits="userSpaceOnUse"
          >
            <rect width="19" height="19" fill="#dac399" />
            <g fill="#ead8ae" stroke="#b3935e" strokeWidth="1">
              <circle cx="5" cy="5" r="3" />
              <circle cx="14" cy="13" r="3" />
              <circle cx="3" cy="16" r="2" />
              <circle cx="16" cy="3" r="2" fill="#996742" />
            </g>
          </pattern>
          <pattern
            id={uid("greens")}
            width="49"
            height="43"
            patternUnits="userSpaceOnUse"
          >
            <rect width="49" height="43" fill="#557346" />
            <g transform="translate(13 18) rotate(-25)">
              <Piece shape="leaf" color="#7c9d53" />
            </g>
            <g transform="translate(41 38) rotate(70)">
              <Piece shape="leaf" color="#9cae65" />
            </g>
            <path d="M30 5Q38-6 47 9L36 19Z" fill="#76576a" />
          </pattern>
        </defs>
        <ellipse
          cx="184"
          cy="195"
          rx="150"
          ry="147"
          fill="#5b4b32"
          opacity=".09"
        />
        <circle
          cx="180"
          cy="177"
          r="153"
          fill={url("ceramic")}
          stroke="#fffdf5"
          strokeWidth="2"
        />
        <circle
          cx="180"
          cy="177"
          r="137"
          fill={url("inside")}
          stroke="#ded3bd"
          strokeWidth="2"
        />
        <g clipPath={url("food")}>
          {layers.bases.map((id, index) => (
            <g
              key={id}
              data-ingredient={`base:${id}`}
              className={styles.arrival}
            >
              <title>{getItemLabel("base", id, language)}</title>
              <rect
                x={48 + (index * 264) / layers.bases.length}
                y="45"
                width={264 / layers.bases.length}
                height="264"
                fill={url(
                  id === "quinoa"
                    ? "quinoa"
                    : ["spring_mix", "mixed_greens"].includes(id)
                      ? "greens"
                      : "rice",
                )}
              />
            </g>
          ))}
          {layers.proteins.map((id) => (
            <Portion key={id} id={id} category="protein" language={language} />
          ))}
          {layers.extraScoops.map((id, index) => (
            <Portion
              key={`${id}-${index}`}
              id={id}
              category="protein"
              language={language}
              position={{ x: 144 + index * 35, y: 237 }}
              scale={0.6}
            />
          ))}
          {layers.marinades.map((id, index) => (
            <g
              key={id}
              data-ingredient={`marinade:${id}`}
              className={styles.arrival}
              fill={MARINADE_COLORS[id] || "#b58a42"}
              opacity=".65"
            >
              <title>{getItemLabel("marinade", id, language)}</title>
              {layers.proteins.flatMap((protein) =>
                scatter(`${id}-${protein}`, 13, 27).map((p, i) => (
                  <ellipse
                    key={`${protein}-${i}`}
                    cx={(INGREDIENT_ART[protein]?.x || 180) + p.x}
                    cy={(INGREDIENT_ART[protein]?.y || 177) + p.y}
                    rx={2.5 + index}
                    ry="1.8"
                  />
                )),
              )}
            </g>
          ))}
          {layers.complements.map((id) => (
            <Portion
              key={id}
              id={id}
              category="complement"
              language={language}
            />
          ))}
          {layers.sauces.map((id, index) => (
            <g
              key={id}
              data-ingredient={`sauce:${id}`}
              className={styles.arrival}
            >
              <title>{getItemLabel("sauce", id, language)}</title>
              <g transform={`rotate(${index * 65 - 30} 180 177)`}>
                <path
                  d="M95 108Q178 83 255 108M88 139Q180 114 270 139M85 170Q180 145 275 170M91 201Q180 176 268 201M105 232Q180 207 253 232"
                  fill="none"
                  stroke="#694b2e"
                  strokeWidth="6"
                  strokeOpacity=".12"
                  strokeLinecap="round"
                />
                <path
                  d="M95 106Q178 81 255 106M88 137Q180 112 270 137M85 168Q180 143 275 168M91 199Q180 174 268 199M105 230Q180 205 253 230"
                  fill="none"
                  stroke={SAUCE_COLORS[id] || "#ccaf77"}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>
            </g>
          ))}
          {layers.toppings.map((id) => (
            <g key={id} data-ingredient={`topping:${id}`}>
              <title>{getItemLabel("topping", id, language)}</title>
              <g className={styles.arrival}>
                {scatter(id, id === "sesame_seeds" ? 60 : 23, 116).map(
                  (p, index) => (
                    <g
                      key={index}
                      transform={`translate(${180 + p.x} ${177 + p.y}) rotate(${p.rotation}) scale(${id === "sesame_seeds" ? 1 : 0.55})`}
                    >
                      <Piece
                        {...(TOPPING_ART[id] || {
                          shape: "seed",
                          color: "#8c7246",
                        })}
                      />
                    </g>
                  ),
                )}
              </g>
            </g>
          ))}
        </g>
        <circle
          cx="180"
          cy="177"
          r="146"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          opacity=".7"
        />
        {empty && (
          <g fill="#9c927b" textAnchor="middle">
            <path
              d="M163 162h34m-17-17v34"
              stroke="currentColor"
              color="#b1a58d"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <text x="180" y="208" fontSize="12" fontFamily="inherit">
              {language === "en"
                ? "Start with your base"
                : "Empieza por tu base"}
            </text>
          </g>
        )}
      </svg>
      {!compact && (
        <span className={styles.caption}>
          {language === "en"
            ? "Live illustration of your selection"
            : "Ilustración en vivo de tu selección"}
        </span>
      )}
    </div>
  );
}
