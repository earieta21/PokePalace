// Genera un CSV a partir de un arreglo de arreglos (filas) y dispara la
// descarga en el navegador. Sin dependencias — Excel abre .csv de forma nativa.
export function downloadCSV(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // BOM al inicio para que Excel detecte UTF-8 y no rompa acentos/ñ
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
