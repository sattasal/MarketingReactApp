import React, { useState, useMemo } from "react";

export interface ColDef {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: number;
  bar?: boolean;                          // mostra barra proporzionale
  format?: (v: any) => React.ReactNode;  // renderer custom
}

interface DataTableProps {
  columns: ColDef[];
  data: any[];
  loading?: boolean;
  title?: string;
  maxRows?: number;
  emptyText?: string;
  accentColor?: string;
}

export function DataTable({
  columns = [],
  data = [],
  loading = false,
  title,
  maxRows = 10,
  emptyText = "Nessun dato disponibile",
  accentColor = "#3b82f6"
}: DataTableProps) {
  const [sortKey, setSortKey]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const isNum = typeof va === "number";
      if (isNum) return sortDir === "desc" ? vb - va : va - vb;
      return sortDir === "desc" ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
  }, [data, sortKey, sortDir]);

  const visible = expanded ? sorted : sorted.slice(0, maxRows);

  const barMaxValues = useMemo(() => {
    const m: Record<string, number> = {};
    columns.filter(c => c.bar).forEach(col => {
      m[col.key] = Math.max(...data.map(r => r[col.key] || 0));
    });
    return m;
  }, [data, columns]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
        {title && <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 14, width: 160 }} />
        </div>}
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid #f8fafc" }}>
            <div style={{ background: "#f1f5f9", borderRadius: 4, height: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
      {title && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</h3>
        </div>
      )}

      {data.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 20px", color: "#94a3b8", fontSize: 13 }}>
          {emptyText}
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: "10px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: ".4px",
                        textAlign: col.align || "left",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid #e2e8f0",
                        width: col.width,
                      }}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span style={{ marginLeft: 4, color: accentColor }}>{sortDir === "desc" ? "↓" : "↑"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr key={i} className="row-hover" style={{ borderBottom: "1px solid #f8fafc" }}>
                    {columns.map((col, ci) => {
                      const raw = row[col.key];
                      const display = col.format ? col.format(raw) : raw;
                      const barPct = col.bar && barMaxValues[col.key]
                        ? (raw / barMaxValues[col.key]) * 100
                        : null;

                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: "10px 16px",
                            fontSize: 13,
                            textAlign: col.align || "left",
                            color: ci === 0 ? "#1e293b" : "#475569",
                            fontWeight: ci === 0 ? 500 : 400,
                          }}
                        >
                          {barPct !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#1e293b", fontWeight: 600 }}>
                                {display}
                              </span>
                              <div style={{ width: 64, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${barPct}%`, height: "100%", background: accentColor, borderRadius: 2, transition: "width .4s ease" }} />
                              </div>
                            </div>
                          ) : ci === 0 ? (
                            <span style={{ display: "block", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(raw)}>
                              {display}
                            </span>
                          ) : (
                            <span style={{ fontFamily: typeof raw === "number" ? "'JetBrains Mono', monospace" : undefined, fontSize: typeof raw === "number" ? 12 : 13 }}>
                              {display}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.length > maxRows && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="btn"
              style={{ width: "100%", padding: "10px", fontSize: 12, color: "#64748b", background: "#f8fafc", borderTop: "1px solid #f1f5f9", textAlign: "center" }}
            >
              {expanded ? "↑ Mostra meno" : `↓ Mostra altri ${data.length - maxRows} risultati`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
