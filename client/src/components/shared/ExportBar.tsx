export function ExportBar({ onCSV, onPrint }: { onCSV: () => void; onPrint: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button className="btn" onClick={onCSV} style={{ background: "#059669", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
        📥 Esporta Excel (CSV)
      </button>
      <button className="btn" onClick={onPrint} style={{ background: "#7c3aed", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
        🖨 Stampa / PDF
      </button>
    </div>
  );
}