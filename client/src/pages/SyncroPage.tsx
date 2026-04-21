import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { PageProps } from "../lib/types";
import { NavBar } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusKey = "in-progress" | "interno" | "esterno" | "done" | "cancelled";

interface SyncroTask {
  id: string;
  activity_id: string;
  task_desc: string;
  date: string;
  time: string;
  act_status: StatusKey;
  created_at?: string;
}

interface SyncroActivity {
  id: string;
  title: string;
  assignee: string;
  status: StatusKey;
  status_date: string;
  status_desc: string;
  end_date: string;
  tasks?: SyncroTask[];
  created_at?: string;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS: Record<StatusKey, { label: string; hex: string; lt: string; tx: string }> = {
  "in-progress": { label: "In lavorazione", hex: "#3B82F6", lt: "#EBF3FF", tx: "#1D4ED8" },
  "interno":     { label: "Att. interna",   hex: "#EF4444", lt: "#FEF2F2", tx: "#B91C1C" },
  "esterno":     { label: "Att. esterna",   hex: "#F97316", lt: "#FFF7ED", tx: "#C2410C" },
  "done":        { label: "Concluso",       hex: "#10B981", lt: "#ECFDF5", tx: "#065F46" },
  "cancelled":   { label: "Annullato",      hex: "#94A3B8", lt: "#F8FAFC", tx: "#475569" },
};
const STATUS_KEYS: StatusKey[] = ["in-progress", "interno", "esterno", "done", "cancelled"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nowT = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmtD = (s: string) => {
  if (!s) return "—";
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleString("it-IT", { day: "numeric", month: "short" });
};
const dtKey = (date: string, time: string) => `${date} ${time || "00:00"}`;

function resolveFromTasks(
  tasks: SyncroTask[],
  fb: { status: StatusKey; status_date: string; status_desc: string }
) {
  if (!tasks?.length) return fb;
  const latest = [...tasks].sort((a, b) =>
    dtKey(b.date, b.time).localeCompare(dtKey(a.date, a.time))
  )[0];
  return { status: latest.act_status, status_date: latest.date, status_desc: latest.task_desc };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Dot({ color, size = 5 }: { color: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
  );
}

function StatusBadge({ status, onClick }: { status: StatusKey; onClick?: () => void }) {
  const { hex, lt, tx, label } = STATUS[status] || STATUS["in-progress"];
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 20,
        border: `1.5px solid ${hex}44`, background: lt,
        cursor: onClick ? "pointer" : "default",
        fontSize: 10, fontWeight: 600, color: tx,
        fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.7,
      }}
    >
      <Dot color={hex} size={4} />
      {label}
      {onClick && <span style={{ fontSize: 7, opacity: 0.4, marginLeft: 1 }}>▼</span>}
    </button>
  );
}

function AssigneeTag({ name, onClick }: { name: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "1px 7px", borderRadius: 5,
        background: "#ECFDF5", border: "1.5px solid #6EE7B7",
        color: "#065F46", fontSize: 11, fontWeight: 600,
        fontFamily: "'DM Mono', monospace", cursor: "text", flexShrink: 0, whiteSpace: "nowrap",
      }}
    >
      {name || "—"}
    </span>
  );
}

function TaskRow({ task, onDel }: { task: SyncroTask; onDel: () => void }) {
  const { hex, lt, tx, label } = STATUS[task.act_status] || STATUS["in-progress"];
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "1fr auto auto auto",
        alignItems: "center", gap: 8,
        padding: "5px 8px", borderRadius: 6,
        transition: "background .1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "#f7f8fc")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 11, color: "#374151", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {task.task_desc || "—"}
      </span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>
        {fmtD(task.date)} {task.time || ""}
      </span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 7px", borderRadius: 10, background: lt,
        fontSize: 10, color: tx, fontWeight: 600,
        fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
      }}>
        <Dot color={hex} size={4} />
        {label}
      </span>
      <button
        onClick={onDel}
        style={{ background: "none", border: "none", color: "#e2e5ef", cursor: "pointer", fontSize: 10, padding: "1px 3px", lineHeight: 1, transition: "color .12s" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
        onMouseLeave={e => (e.currentTarget.style.color = "#e2e5ef")}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Add Task Modal ────────────────────────────────────────────────────────────

function AddTaskModal({ onOk, onClose }: { onOk: (tk: Omit<SyncroTask, "id" | "activity_id">) => void; onClose: () => void }) {
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(tod());
  const [time, setTime] = useState(nowT());
  const [actStatus, setActStatus] = useState<StatusKey>("in-progress");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const inp: React.CSSProperties = {
    width: "100%", background: "#f4f6fb", border: "1.5px solid #e2e5ef",
    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1a1d2e",
    fontFamily: "'DM Mono', monospace",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,17,30,.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900, backdropFilter: "blur(3px)" }}>
      <div style={{ background: "#fff", border: "1px solid #e8eaf2", borderRadius: 16, padding: "22px 20px", width: 340, boxShadow: "0 12px 48px rgba(0,0,0,.1)" }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "#1a1d2e", marginBottom: 14 }}>Nuovo task</div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#94a3b8", display: "block", marginBottom: 4, letterSpacing: 0.5 }}>DESCRIZIONE</label>
          <textarea
            ref={ref}
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            placeholder="Cosa è stato fatto?"
            style={{ ...inp, fontFamily: "'DM Sans', sans-serif", resize: "none" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#94a3b8", display: "block", marginBottom: 4, letterSpacing: 0.5 }}>DATA</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#94a3b8", display: "block", marginBottom: 4, letterSpacing: 0.5 }}>ORA</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#94a3b8", display: "block", marginBottom: 6, letterSpacing: 0.5 }}>PORTA L'ATTIVITÀ IN</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {STATUS_KEYS.map(k => (
              <button
                key={k}
                onClick={() => setActStatus(k)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", borderRadius: 7,
                  border: `1.5px solid ${actStatus === k ? STATUS[k].hex : "#e2e5ef"}`,
                  background: actStatus === k ? STATUS[k].lt : "transparent",
                  color: actStatus === k ? STATUS[k].tx : "#374151",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", transition: "all .12s",
                }}
              >
                <Dot color={STATUS[k].hex} />
                {STATUS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #e2e5ef", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Annulla
          </button>
          <button
            onClick={() => desc.trim() && onOk({ task_desc: desc.trim(), date, time, act_status: actStatus })}
            disabled={!desc.trim()}
            style={{
              padding: "7px 18px", borderRadius: 8, border: "none",
              background: desc.trim() ? "#1a1d2e" : "#e2e5ef",
              color: desc.trim() ? "#fff" : "#94a3b8",
              fontSize: 13, fontWeight: 600, cursor: desc.trim() ? "pointer" : "not-allowed",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Modal ──────────────────────────────────────────────────────────────

function StatusModal({ act, onOk, onClose }: { act: SyncroActivity; onOk: (status: StatusKey, date: string) => void; onClose: () => void }) {
  const [sel, setSel] = useState<StatusKey>(act.status);
  const [date, setDate] = useState(tod());

  const inp: React.CSSProperties = {
    width: "100%", background: "#f4f6fb", border: "1.5px solid #e2e5ef",
    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1a1d2e",
    fontFamily: "'DM Mono', monospace",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,17,30,.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900, backdropFilter: "blur(3px)" }}>
      <div style={{ background: "#fff", border: "1px solid #e8eaf2", borderRadius: 16, padding: "20px 18px", width: 300, boxShadow: "0 12px 48px rgba(0,0,0,.1)" }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "#1a1d2e", marginBottom: 2 }}>Cambia status</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#94a3b8", marginBottom: 12, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {act.title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          {STATUS_KEYS.map(k => (
            <button
              key={k}
              onClick={() => setSel(k)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 7,
                border: `1.5px solid ${sel === k ? STATUS[k].hex : "#e2e5ef"}`,
                background: sel === k ? STATUS[k].lt : "transparent",
                color: sel === k ? STATUS[k].tx : "#374151",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", transition: "all .12s",
              }}
            >
              <Dot color={STATUS[k].hex} />
              {STATUS[k].label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#94a3b8", display: "block", marginBottom: 4, letterSpacing: 0.5 }}>DATA STATUS</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #e2e5ef", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Annulla
          </button>
          <button
            onClick={() => onOk(sel, date)}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#1a1d2e", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Card ─────────────────────────────────────────────────────────────

function ActivityCard({
  act, onUpdate, onDelete, onStatusClick, onAddTask,
}: {
  act: SyncroActivity;
  onUpdate: (id: string, patch: Partial<SyncroActivity>) => void;
  onDelete: (id: string) => void;
  onStatusClick: (act: SyncroActivity) => void;
  onAddTask: (actId: string) => void;
}) {
  const { hex } = STATUS[act.status] || STATUS["in-progress"];
  const cancelled = act.status === "cancelled";
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [editAssignee, setEditAssignee] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const assigneeRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editTitle) titleRef.current?.focus(); }, [editTitle]);
  useEffect(() => { if (editAssignee) { assigneeRef.current?.focus(); assigneeRef.current?.select(); } }, [editAssignee]);
  useEffect(() => { if (editDesc) descRef.current?.focus(); }, [editDesc]);

  const tasks = act.tasks || [];
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => dtKey(b.date, b.time).localeCompare(dtKey(a.date, a.time))),
    [tasks]
  );

  return (
    <div style={{
      background: "#fff", borderRadius: 11, border: "1px solid #e4e8f2",
      marginBottom: 8, overflow: "hidden", opacity: cancelled ? 0.48 : 1,
      boxShadow: "0 1px 3px rgba(0,0,0,.04)", transition: "opacity .2s",
    }}>
      <div style={{ borderLeft: `4px solid ${hex}`, padding: "11px 14px 10px" }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          {editTitle ? (
            <input
              ref={titleRef}
              value={act.title}
              onChange={e => onUpdate(act.id, { title: e.target.value })}
              onBlur={() => setEditTitle(false)}
              onKeyDown={e => e.key === "Enter" && setEditTitle(false)}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "#1a1d2e", fontFamily: "inherit" }}
            />
          ) : (
            <span
              onClick={() => setEditTitle(true)}
              style={{
                flex: 1, fontSize: 13, fontWeight: 600, color: "#1a1d2e", cursor: "text",
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                textDecoration: cancelled ? "line-through" : "none",
              }}
            >
              {act.title}
            </span>
          )}
          <StatusBadge status={act.status} onClick={() => onStatusClick(act)} />
          <button
            onClick={() => onDelete(act.id)}
            style={{ background: "none", border: "none", color: "#dde1ef", cursor: "pointer", fontSize: 11, padding: "1px 3px", lineHeight: 1, flexShrink: 0, transition: "color .12s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={e => (e.currentTarget.style.color = "#dde1ef")}
          >
            ✕
          </button>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexWrap: "nowrap", overflow: "hidden" }}>
          {editAssignee ? (
            <input
              ref={assigneeRef}
              value={act.assignee}
              onChange={e => onUpdate(act.id, { assignee: e.target.value })}
              onBlur={() => setEditAssignee(false)}
              onKeyDown={e => e.key === "Enter" && setEditAssignee(false)}
              style={{ border: "1.5px solid #6EE7B7", borderRadius: 5, background: "#ECFDF5", color: "#065F46", fontSize: 10, fontFamily: "'DM Mono', monospace", width: 90, padding: "1px 6px", fontWeight: 600 }}
            />
          ) : (
            <AssigneeTag name={act.assignee} onClick={() => setEditAssignee(true)} />
          )}
          <span style={{ color: "#d1d5e8", fontSize: 11, flexShrink: 0, margin: "0 1px" }}>·</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>status</span>
          <input
            type="date"
            value={act.status_date || ""}
            onChange={e => onUpdate(act.id, { status_date: e.target.value })}
            style={{ background: "transparent", border: "none", color: "#374151", fontSize: 10, cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "'DM Mono', monospace" }}
          />
          <span style={{ color: "#d1d5e8", fontSize: 11, flexShrink: 0, margin: "0 1px" }}>·</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>fine</span>
          <input
            type="date"
            value={act.end_date || ""}
            onChange={e => onUpdate(act.id, { end_date: e.target.value })}
            style={{ background: "transparent", border: "none", color: "#374151", fontSize: 10, cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "'DM Mono', monospace" }}
          />
        </div>

        {/* Status description */}
        {editDesc ? (
          <textarea
            ref={descRef}
            value={act.status_desc}
            onChange={e => onUpdate(act.id, { status_desc: e.target.value })}
            onBlur={() => setEditDesc(false)}
            rows={2}
            style={{ width: "100%", background: "#f4f6fb", border: "1px solid #e2e5ef", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#374151", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, resize: "none" }}
          />
        ) : (
          <div
            onClick={() => setEditDesc(true)}
            style={{
              fontSize: 11, color: act.status_desc ? "#6b7280" : "#c8cfe0",
              cursor: "text", fontStyle: act.status_desc ? "normal" : "italic",
              lineHeight: 1.5, minHeight: 16, marginBottom: 6,
            }}
          >
            {act.status_desc || "Aggiungi nota di status..."}
          </div>
        )}

        {/* Tasks footer */}
        <div style={{ borderTop: "1px solid #f0f2fa", paddingTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setExpanded(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#374151", fontWeight: 500, fontFamily: "'DM Sans', sans-serif", padding: 0 }}
          >
            <span style={{ fontSize: 7, color: "#94a3b8", display: "inline-block", transition: "transform .15s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
            {`Task${tasks.length > 0 ? ` (${tasks.length})` : ""}`}
          </button>
          <button
            onClick={() => onAddTask(act.id)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px dashed #e2e5ef", color: "#94a3b8", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: "'DM Sans', sans-serif", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.color = "#3B82F6"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e5ef"; e.currentTarget.style.color = "#94a3b8"; }}
          >
            + task
          </button>
        </div>

        {/* Task list */}
        {expanded && tasks.length > 0 && (
          <div style={{ marginTop: 6, borderTop: "1px solid #f0f2fa", paddingTop: 4 }}>
            {sortedTasks.map(tk => (
              <TaskRow
                key={tk.id}
                task={tk}
                onDel={() => onUpdate(act.id, { tasks: tasks.filter(t => t.id !== tk.id) })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group Box ─────────────────────────────────────────────────────────────────

function GroupBox({ label, count, color, children }: { label: string; count: number; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", marginBottom: 4, padding: "2px 0" }}
      >
        <span style={{ fontSize: 7, color: "#94a3b8", display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
        <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Mono', monospace" }}>({count})</span>
      </button>
      {open && children}
    </div>
  );
}

// ─── Supabase helpers ──────────────────────────────────────────────────────────

const TABLE_ACT = "syncro_activities";
const TABLE_TASK = "syncro_tasks";

async function fetchActivities(): Promise<SyncroActivity[]> {
  const acts = await supabase.select(TABLE_ACT, "order=created_at.asc") as SyncroActivity[];
  const tasks = await supabase.select(TABLE_TASK, "order=created_at.asc") as SyncroTask[];
  return acts.map(a => ({
    ...a,
    tasks: tasks.filter(t => t.activity_id === a.id),
  }));
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SyncroPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [activities, setActivities] = useState<SyncroActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<SyncroActivity | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<string | null>(null);
  const [selStatus, setSelStatus] = useState<StatusKey[]>([]);
  const [selMonths, setSelMonths] = useState<string[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Load from Supabase
  useEffect(() => {
    fetchActivities()
      .then(setActivities)
      .catch(() => showToast("Errore caricamento dati"))
      .finally(() => setLoading(false));
  }, []);

  // Persist update to Supabase (debounced via local state first, then sync)
  const updateActivity = useCallback(async (id: string, patch: Partial<SyncroActivity>) => {
    // Optimistic update
    setActivities(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));

    // If tasks updated, sync individually — otherwise PATCH the activity row
    if (patch.tasks !== undefined) {
      // Tasks are managed separately — this handles local deletions
      // (additions go through addTask below)
      const deletedTask = activities
        .find(a => a.id === id)?.tasks
        ?.find(t => !patch.tasks!.find(pt => pt.id === t.id));
      if (deletedTask) {
        try {
          await supabase.delete(TABLE_TASK, deletedTask.id);
        } catch {
          showToast("Errore eliminazione task");
        }
      }
    } else {
      // Extract only DB columns (no tasks)
      const { tasks: _t, ...dbPatch } = patch as any;
      try {
        await supabase.update(TABLE_ACT, id, dbPatch);
      } catch {
        showToast("Errore salvataggio");
      }
    }
  }, [activities]);

  const deleteActivity = useCallback(async (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
    try {
      // Tasks are deleted via ON DELETE CASCADE in Supabase
      await supabase.delete(TABLE_ACT, id);
    } catch {
      showToast("Errore eliminazione");
    }
  }, []);

  const addActivity = useCallback(async () => {
    setSaving(true);
    const newAct = {
      title: "Nuova attività",
      assignee: "",
      status: "in-progress" as StatusKey,
      status_date: tod(),
      status_desc: "",
      end_date: "",
    };
    try {
      const [created] = await supabase.insert(TABLE_ACT, newAct) as SyncroActivity[];
      setActivities(prev => [...prev, { ...created, tasks: [] }]);
    } catch {
      showToast("Errore creazione attività");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleStatusOk = useCallback(async (status: StatusKey, date: string) => {
    if (!statusModal) return;
    await updateActivity(statusModal.id, { status, status_date: date });
    setStatusModal(null);
  }, [statusModal, updateActivity]);

  const addTask = useCallback(async (actId: string, tk: Omit<SyncroTask, "id" | "activity_id">) => {
    const newTask = { ...tk, activity_id: actId };
    try {
      const [created] = await supabase.insert(TABLE_TASK, newTask) as SyncroTask[];
      setActivities(prev => prev.map(a => {
        if (a.id !== actId) return a;
        const tasks = [...(a.tasks || []), created];
        const resolved = resolveFromTasks(tasks, { status: a.status, status_date: a.status_date, status_desc: a.status_desc });
        // Also update activity status in DB
        supabase.update(TABLE_ACT, actId, resolved).catch(() => {});
        return { ...a, tasks, ...resolved };
      }));
    } catch {
      showToast("Errore aggiunta task");
    }
    setAddTaskFor(null);
  }, []);

  // Derived
  const allMonths = useMemo(() => {
    const ms = new Set<string>();
    activities.forEach(a => { if (a.status_date) ms.add(a.status_date.slice(0, 7)); });
    return [...ms].sort().reverse();
  }, [activities]);

  const filtered = useMemo(() => activities.filter(a => {
    if (selStatus.length && !selStatus.includes(a.status)) return false;
    if (selMonths.length) { const m = a.status_date?.slice(0, 7) || ""; if (!selMonths.includes(m)) return false; }
    return true;
  }), [activities, selStatus, selMonths]);

  const active = filtered.filter(a => a.status !== "done" && a.status !== "cancelled");
  const done = filtered.filter(a => a.status === "done");
  const cancelled = filtered.filter(a => a.status === "cancelled");

  const counts = STATUS_KEYS.reduce((acc, k) => { acc[k] = activities.filter(a => a.status === k).length; return acc; }, {} as Record<StatusKey, number>);
  const mLabel = (m: string) => { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("it-IT", { month: "short", year: "2-digit" }); };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento Syncro...</div></div>
    </div>
  );

  return (
    <PageShell toast={toast}>
      <NavBar current="syncro" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <rect width={24} height={24} rx={7} fill="#EBF3FF" />
                <rect x={4} y={8} width={16} height={2.5} rx={1.25} fill="#3B82F6" />
                <rect x={4} y={13} width={10} height={2.5} rx={1.25} fill="#8B5CF6" />
                <circle cx={17.5} cy={14.25} r={2.5} fill="#F59E0B" />
              </svg>
              Syncro
            </span>
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Tracciamento attività marketing</p>
        </div>
        <button
          onClick={addActivity}
          disabled={saving}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px dashed #e2e5ef", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.color = "#3B82F6"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e5ef"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          {saving ? "..." : "+ Attività"}
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e4e8f2", padding: "12px 16px", marginBottom: 16 }}>
        {/* Status filters */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {STATUS_KEYS.filter(k => counts[k] > 0).map(k => (
            <button
              key={k}
              onClick={() => setSelStatus(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 20,
                border: `1.5px solid ${selStatus.includes(k) ? STATUS[k].hex : "#e2e5ef"}`,
                background: selStatus.includes(k) ? STATUS[k].lt : "#f8f9fb",
                fontSize: 10, fontWeight: 600,
                color: selStatus.includes(k) ? STATUS[k].tx : "#6b7280",
                fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all .12s",
              }}
            >
              <Dot color={STATUS[k].hex} />
              {STATUS[k].label}
              <span style={{ opacity: 0.55, marginLeft: 1 }}> ({counts[k]})</span>
            </button>
          ))}
        </div>

        {/* Month filters */}
        {allMonths.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#c0c5d8", letterSpacing: 0.5, marginRight: 2 }}>MESE</span>
            {allMonths.map(m => (
              <button
                key={m}
                onClick={() => setSelMonths(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])}
                style={{
                  display: "inline-flex", padding: "2px 8px", borderRadius: 20,
                  border: `1.5px solid ${selMonths.includes(m) ? "#374151" : "#e2e5ef"}`,
                  background: selMonths.includes(m) ? "#1a1d2e" : "#f8f9fb",
                  fontSize: 10, fontWeight: 600,
                  color: selMonths.includes(m) ? "#fff" : "#6b7280",
                  fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all .12s",
                }}
              >
                {mLabel(m)}
              </button>
            ))}
            {(selStatus.length > 0 || selMonths.length > 0) && (
              <button
                onClick={() => { setSelStatus([]); setSelMonths([]); }}
                style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", padding: "2px 4px", textDecoration: "underline" }}
              >
                reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity list */}
      <div>
        {active.length === 0 && done.length === 0 && cancelled.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 8 }}>
            <div style={{ fontSize: 32, color: "#e2e5ef" }}>◎</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Nessuna attività.</div>
          </div>
        ) : (
          <>
            {active.map(a => (
              <ActivityCard
                key={a.id}
                act={a}
                onUpdate={updateActivity}
                onDelete={deleteActivity}
                onStatusClick={setStatusModal}
                onAddTask={setAddTaskFor}
              />
            ))}
            {done.length > 0 && (
              <GroupBox label="Conclusi" count={done.length} color="#10B981">
                {done.map(a => (
                  <ActivityCard key={a.id} act={a} onUpdate={updateActivity} onDelete={deleteActivity} onStatusClick={setStatusModal} onAddTask={setAddTaskFor} />
                ))}
              </GroupBox>
            )}
            {cancelled.length > 0 && (
              <GroupBox label="Annullati" count={cancelled.length} color="#94A3B8">
                {cancelled.map(a => (
                  <ActivityCard key={a.id} act={a} onUpdate={updateActivity} onDelete={deleteActivity} onStatusClick={setStatusModal} onAddTask={setAddTaskFor} />
                ))}
              </GroupBox>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {statusModal && <StatusModal act={statusModal} onOk={handleStatusOk} onClose={() => setStatusModal(null)} />}
      {addTaskFor && <AddTaskModal onOk={tk => addTask(addTaskFor, tk)} onClose={() => setAddTaskFor(null)} />}
    </PageShell>
  );
}
