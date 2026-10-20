import { Box, Chip, Typography } from "@mui/material";

interface RouteMapProps {
  currentLabel?: string;
  summitLabel?: string;
  compact?: boolean;
  restricted?: boolean;
}

export default function RouteMap({
  currentLabel = "Текущая высота",
  summitLabel = "Возможная вершина",
  compact = false,
  restricted = false,
}: RouteMapProps) {
  return (
    <Box className={`route-map ${compact ? "compact" : ""}`}>
      <Box className="route-map-heading">
        <Box>
          <Typography className="eyebrow">ВАШ ФИНАНСОВЫЙ МАРШРУТ</Typography>
          <Typography className="route-map-title">
            От плана к финансированию
          </Typography>
        </Box>
        <Chip label="Оценка по текущим данным" />
      </Box>
      <Box className="route-landscape">
        <svg
          className="mountain-art"
          viewBox="0 0 900 290"
          preserveAspectRatio="none"
          role="img"
          aria-label="Схема маршрута по горному рельефу с контрольными точками"
        >
          <circle cx="741" cy="66" r="35" className="route-sun" />
          <path
            d="M0 252 190 115l96 74L455 60l197 181 102-94 146 105v38H0Z"
            className="mountain-back"
          />
          <path
            d="m0 270 155-91 106 43 141-105 137 141 99-68 94 66 83-34 85 51v17H0Z"
            className="mountain-front"
          />
          <path
            d="M112 205c82-73 133-83 210-52s107 15 156-36 95-48 153 2"
            className="contour-line"
          />
          <path
            d="M128 219c76-61 127-68 188-42s116 15 163-32 91-40 139 6"
            className="contour-line"
          />
          <path
            d="M153 230c62-45 107-50 162-28s112 15 151-27 79-34 121 8"
            className="contour-line"
          />
          <path
            d="M92 228 C190 214 213 240 292 217 S403 158 481 174 S559 220 608 193 S690 122 765 109"
            className="route-line"
          />
          {[92, 292, 481, 608, 765].map((x, index) => (
            <circle
              key={x}
              cx={x}
              cy={[228, 217, 174, 193, 109][index]}
              r={index === 0 ? 9 : 6}
              className={`route-point ${index === 0 ? "current" : ""} ${restricted && index === 3 ? "blocked" : ""}`}
            />
          ))}
          <path d="M765 88v-28" className="summit-flag-pole" />
          <path d="M765 60h34l-12 10 12 10h-34Z" className="summit-flag" />
        </svg>
        <Box className="map-label current-label">
          <Typography>{currentLabel}</Typography>
          <b>{restricted ? "600 000 ₽" : "1 050 000 ₽"}</b>
        </Box>
        <Box className="map-label summit-label">
          <Typography>{summitLabel}</Typography>
          <b>{restricted ? "1 500 000 ₽" : "1 500 000 ₽"}</b>
        </Box>
        {restricted && (
          <Box className="map-obstacle">Ограничение по лимиту</Box>
        )}
      </Box>
      {!compact && (
        <Box className="map-legend">
          <span>
            <i className="legend-current" />
            Текущая оценка
          </span>
          <span>
            <i className="legend-route" />
            Контрольные точки
          </span>
          <span>
            <i className="legend-summit" />
            Желаемая сумма
          </span>
        </Box>
      )}
    </Box>
  );
}
