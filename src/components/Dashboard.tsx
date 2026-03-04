import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";
import type { ConsistencyEntry, Person, WindowRange } from "../types";
import {
  buildDailySeries,
  DEFAULT_COMMENT_MAX_LENGTH,
  formatUtcDateTime,
  getUtcWindowRange,
  isCommentLengthValid,
  shortPersonLabel,
  toUtcHour,
} from "../lib/consistency";

type DashboardProps = {
  session: Session;
};

const renderGapAlertDot = (props: {
  cx?: number;
  cy?: number;
  payload?: {
    gapAlertMarker?: number | null;
  };
}) => {
  const { cx, cy, payload } = props;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    !payload ||
    payload.gapAlertMarker === null
  ) {
    return <g />;
  }

  return (
    <text x={cx} y={cy - 2} textAnchor="middle" fill="#bb3131" fontSize={15} aria-hidden="true">
      ★
    </text>
  );
};

const makeTime = () => {
  const hour = new Date().getUTCHours();
  return `${String(hour).padStart(2, "0")}:00`;
};

const makeDate = () => {
  return new Date().toISOString().slice(0, 10);
};

const isoToDateInput = (iso: string) => iso.slice(0, 10);
const isoToHourInput = (iso: string) => `${iso.slice(11, 13)}:00`;

const isUuid = (value: string) => /^[0-9a-fA-F-]{36}$/.test(value);
const HOUR_OPTIONS = Array.from(
  { length: 24 },
  (_unused, hour) => `${String(hour).padStart(2, "0")}:00`,
);
const BRISTOL_LEVELS = [
  { score: 1, mnemonic: "Hard", description: "Separate hard lumps (constipation)." },
  { score: 2, mnemonic: "Lumpy", description: "Lumpy and sausage-like." },
  { score: 3, mnemonic: "Cracked", description: "Sausage with cracks on surface." },
  { score: 4, mnemonic: "Smooth", description: "Smooth, soft sausage or snake (typical/ideal)." },
  { score: 5, mnemonic: "Soft", description: "Soft blobs with clear edges." },
  { score: 6, mnemonic: "Mushy", description: "Fluffy pieces, mushy stool." },
  { score: 7, mnemonic: "Liquid", description: "Watery, no solid pieces (diarrhea)." },
] as const;

type BackendStatus = "checking" | "ok" | "error";
type QueryStatus = "idle" | "loading" | "ok" | "empty" | "error";

const getStatusClass = (status: BackendStatus | QueryStatus) => {
  if (status === "ok") {
    return "ok";
  }
  if (status === "error") {
    return "error";
  }
  return "checking";
};

const getStatusLabel = (status: BackendStatus | QueryStatus) => {
  if (status === "ok") {
    return "Connected";
  }
  if (status === "error") {
    return "Error";
  }
  if (status === "empty") {
    return "No rows";
  }
  if (status === "idle") {
    return "Idle";
  }
  return "Checking";
};

const getStatusTooltip = (
  label: string,
  status: BackendStatus | QueryStatus,
  detail?: string,
  extra?: string,
) => {
  const base = `${label} status light. Green = connected/healthy, gray = checking or idle, red = error. Current: ${getStatusLabel(
    status,
  )}.`;

  const detailPart = detail ? ` Detail: ${detail}.` : "";
  const extraPart = extra ? ` ${extra}` : "";
  return `${base}${detailPart}${extraPart}`;
};

export const Dashboard = ({ session }: DashboardProps) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [defaultPersonId, setDefaultPersonId] = useState("");

  const [entries, setEntries] = useState<ConsistencyEntry[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState<BackendStatus>("checking");
  const [databaseStatusDetail, setDatabaseStatusDetail] = useState("");
  const [peopleQueryStatus, setPeopleQueryStatus] = useState<QueryStatus>("loading");
  const [entriesQueryStatus, setEntriesQueryStatus] = useState<QueryStatus>("idle");
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshPulseTick, setRefreshPulseTick] = useState(0);
  const [isRefreshPulsing, setIsRefreshPulsing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryDate, setEditEntryDate] = useState("");
  const [editEntryTime, setEditEntryTime] = useState("00:00");
  const [editEntryScore, setEditEntryScore] = useState("4");
  const [editEntryComment, setEditEntryComment] = useState("");
  const [isSavingEntryEdit, setIsSavingEntryEdit] = useState(false);
  const [isBristolHelpOpen, setIsBristolHelpOpen] = useState(false);
  const [isStatusHelpOpen, setIsStatusHelpOpen] = useState(false);

  const [entryDate, setEntryDate] = useState(makeDate);
  const [entryTime, setEntryTime] = useState(makeTime);
  const [entryScore, setEntryScore] = useState("4");
  const [entryComment, setEntryComment] = useState("");

  const [newPersonId, setNewPersonId] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);

  const [lookbackDays, setLookbackDays] = useState<5 | 14 | 30>(30);
  const [windowOffsetDays, setWindowOffsetDays] = useState(0);
  const [range, setRange] = useState<WindowRange>(() => getUtcWindowRange(30, 0));

  const checkDatabaseConnection = useCallback(async (showChecking = false) => {
    if (showChecking) {
      setDatabaseStatus("checking");
    }

    const { error } = await supabase.from("people").select("id", { head: true, count: "exact" });

    if (error) {
      setDatabaseStatus("error");
      setDatabaseStatusDetail(error.message);
      return;
    }

    setDatabaseStatus("ok");
  }, []);

  const loadPeople = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingPeople(true);
      setPeopleQueryStatus("loading");
      setActionError("");
    }
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      if (!silent) {
        setActionError(error.message);
      }
      setPeopleQueryStatus("error");
      setDatabaseStatus("error");
      setDatabaseStatusDetail(error.message);
      if (!silent) {
        setLoadingPeople(false);
      }
      return;
    }

    setPeople(data as Person[]);
    setPeopleQueryStatus("ok");
    setDatabaseStatus("ok");
    setDatabaseStatusDetail("");

    const defaultPerson = data.find((person) => person.is_default) ?? data[0] ?? null;
    if (defaultPerson) {
      setDefaultPersonId(defaultPerson.id);
      setSelectedPersonId((current) => {
        if (!current || !data.some((person) => person.id === current)) {
          return defaultPerson.id;
        }

        return current;
      });
    } else if (data[0]) {
      setDefaultPersonId(data[0].id);
      setSelectedPersonId((current) => {
        if (!current || !data.some((person) => person.id === current)) {
          return data[0].id;
        }

        return current;
      });
    } else {
      setSelectedPersonId("");
      setEntriesQueryStatus("idle");
    }

    if (!silent) {
      setLoadingPeople(false);
    }
  }, []);

  const loadEntries = useCallback(
    async (silent = false) => {
      if (!selectedPersonId) {
        setEntries([]);
        setEntriesQueryStatus("idle");
        if (!silent) {
          setLoadingEntries(false);
        }
        return;
      }

      if (!silent) {
        setLoadingEntries(true);
        setEntriesQueryStatus("loading");
        setActionError("");
      }

      const currentRange = getUtcWindowRange(lookbackDays, windowOffsetDays);
      setRange(currentRange);

      const { data, error } = await supabase
        .from("consistency_entries")
        .select("*")
        .eq("person_id", selectedPersonId)
        .gte("at", currentRange.start)
        .lt("at", currentRange.endExclusive)
        .order("at", { ascending: true });

      if (error) {
        if (!silent) {
          setActionError(error.message);
        }
        setEntriesQueryStatus("error");
        setDatabaseStatus("error");
        setDatabaseStatusDetail(error.message);
      } else {
        const nextEntries = (data as ConsistencyEntry[]) ?? [];
        setEntries(nextEntries);
        setEntriesQueryStatus(nextEntries.length > 0 ? "ok" : "empty");
        setDatabaseStatus("ok");
        setDatabaseStatusDetail("");
      }

      if (!silent) {
        setLoadingEntries(false);
      }
    },
    [lookbackDays, selectedPersonId, windowOffsetDays],
  );

  const runSilentRefresh = useCallback(async () => {
    await checkDatabaseConnection();
    await loadPeople(true);
    await loadEntries(true);
    setLastRefreshAt(new Date());
    setRefreshPulseTick((current) => current + 1);
  }, [checkDatabaseConnection, loadEntries, loadPeople]);

  useEffect(() => {
    const loadInitialData = async () => {
      await checkDatabaseConnection(true);
      await loadPeople();
    };

    void loadInitialData();
  }, [checkDatabaseConnection, loadPeople]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void runSilentRefresh();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [runSilentRefresh]);

  useEffect(() => {
    if (refreshPulseTick === 0) {
      return;
    }

    setIsRefreshPulsing(true);
    const timeout = window.setTimeout(() => setIsRefreshPulsing(false), 900);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshPulseTick]);

  useEffect(() => {
    if (!selectedPersonId || people.length === 0) {
      return;
    }

    const currentDefault = people.find((person) => person.is_default);
    if (currentDefault) {
      setDefaultPersonId(currentDefault.id);
    }

    const selectedExists = people.some((person) => person.id === selectedPersonId);
    if (!selectedExists) {
      const fallback = people[0];
      setSelectedPersonId(fallback?.id || "");
    }
  }, [people, selectedPersonId]);

  const series = useMemo(() => buildDailySeries(entries, range), [entries, range]);
  const maxDailyCount = useMemo(
    () => series.reduce((currentMax, point) => Math.max(currentMax, point.count), 0),
    [series],
  );
  const chartSeries = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        gapAlertMarker: point.hasLongGapWithoutEntry ? maxDailyCount + 1 : null,
      })),
    [maxDailyCount, series],
  );
  const hasLongGapAlert = useMemo(
    () => series.some((point) => point.hasLongGapWithoutEntry),
    [series],
  );

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  );

  const defaultPerson = useMemo(
    () => people.find((person) => person.id === defaultPersonId) ?? people[0] ?? null,
    [people, defaultPersonId],
  );

  const homePersonLabel = defaultPerson ? shortPersonLabel(defaultPerson.id) : "no person";

  const chartStatusMessage = useMemo(() => {
    if (people.length === 0) {
      return "No people configured. Add a person to start plotting.";
    }

    if (!selectedPersonId) {
      return "Select a person to display chart data.";
    }

    if (entriesQueryStatus === "loading" || loadingEntries || loadingPeople) {
      return "Loading chart data...";
    }

    if (entriesQueryStatus === "error") {
      return "Could not load entries for this chart window.";
    }

    if (entries.length === 0) {
      return "No entries found in this date range.";
    }

    return `Loaded ${entries.length} entr${entries.length === 1 ? "y" : "ies"} for this window.`;
  }, [
    entries.length,
    entriesQueryStatus,
    loadingEntries,
    loadingPeople,
    people.length,
    selectedPersonId,
  ]);
  const shouldRenderChart = people.length > 0 && selectedPersonId !== "";
  const refreshIndicatorTitle = lastRefreshAt
    ? `Auto refresh heartbeat light. Green pulse = refresh cycle completed. It runs every 15 seconds. Last cycle at ${lastRefreshAt.toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        },
      )}.`
    : "Auto refresh heartbeat light. Green pulse = refresh cycle completed. First cycle is pending.";

  const onSubmitEntry = async (event: FormEvent) => {
    event.preventDefault();
    setActionError("");
    setMessage("");

    const homePerson = defaultPerson ?? people[0] ?? null;
    if (!homePerson) {
      setActionError("Add a person first.");
      return;
    }

    if (!isCommentLengthValid(entryComment)) {
      setActionError(`Comments must be ${DEFAULT_COMMENT_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const payload = {
      person_id: homePerson.id,
      at: toUtcHour(entryDate, entryTime),
      score: Number(entryScore),
      comment: entryComment.trim() || null,
    };

    setIsSavingEntry(true);
    const { error } = await supabase.from("consistency_entries").insert(payload);
    setIsSavingEntry(false);

    if (error) {
      if (error.code === "23505") {
        setActionError("That person already has an entry for the selected hour.");
      } else {
        setActionError(error.message);
      }
      return;
    }

    setMessage("Entry added.");
    setEntryComment("");
    setEntryScore("4");
    setEntryDate(makeDate());
    setEntryTime(makeTime());

    if (selectedPersonId !== homePerson.id) {
      setSelectedPersonId(homePerson.id);
      return;
    }

    await loadEntries();
  };

  const onSubmitPerson = async (event: FormEvent) => {
    event.preventDefault();
    setActionError("");
    setMessage("");

    const personId = newPersonId.trim();
    if (personId && !isUuid(personId)) {
      setActionError("Enter a valid UUID or leave blank to auto-generate.");
      return;
    }

    const payload: { id?: string } = {};

    if (personId) {
      payload.id = personId;
    }

    const { data: createdPerson, error } = await supabase
      .from("people")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        setActionError("This UUID already exists.");
        return;
      }

      setActionError(error.message);
      return;
    }

    if (!createdPerson?.id) {
      setActionError("Could not confirm the created person ID.");
      return;
    }

    if (setAsDefault) {
      const { error: setDefaultError } = await supabase.rpc("set_default_person", {
        person_uuid: createdPerson.id,
      });

      if (setDefaultError) {
        setActionError(setDefaultError.message);
        return;
      }
    }

    setMessage(setAsDefault ? "Person added and set as default." : "Person added.");
    setNewPersonId("");
    setSetAsDefault(false);
    void loadPeople();
  };

  const startEditingEntry = (entry: ConsistencyEntry) => {
    setActionError("");
    setMessage("");
    setEditingEntryId(entry.id);
    setEditEntryDate(isoToDateInput(entry.at));
    setEditEntryTime(isoToHourInput(entry.at));
    setEditEntryScore(String(entry.score));
    setEditEntryComment(entry.comment ?? "");
  };

  const cancelEditingEntry = () => {
    setEditingEntryId(null);
    setEditEntryDate("");
    setEditEntryTime("00:00");
    setEditEntryScore("4");
    setEditEntryComment("");
    setIsSavingEntryEdit(false);
  };

  const saveEditedEntry = async (event: FormEvent, entryId: string) => {
    event.preventDefault();
    setActionError("");
    setMessage("");

    if (!isCommentLengthValid(editEntryComment)) {
      setActionError(`Comments must be ${DEFAULT_COMMENT_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSavingEntryEdit(true);
    const { error } = await supabase
      .from("consistency_entries")
      .update({
        at: toUtcHour(editEntryDate, editEntryTime),
        score: Number(editEntryScore),
        comment: editEntryComment.trim() || null,
      })
      .eq("id", entryId);
    setIsSavingEntryEdit(false);

    if (error) {
      if (error.code === "23505") {
        setActionError("Another entry already exists for that person and hour.");
      } else {
        setActionError(error.message);
      }
      return;
    }

    setMessage("Entry updated.");
    cancelEditingEntry();
    await loadEntries();
  };

  const moveWindowBack = () => {
    setWindowOffsetDays((current) => current + lookbackDays);
  };

  const moveWindowForward = () => {
    setWindowOffsetDays((current) => Math.max(0, current - lookbackDays));
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [message]);

  useEffect(() => {
    if (!isBristolHelpOpen && !isStatusHelpOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBristolHelpOpen(false);
        setIsStatusHelpOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBristolHelpOpen, isStatusHelpOpen]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-right">
          <button
            type="button"
            aria-label="auth status connected"
            className="status-dot-button"
            data-testid="status-auth"
            onClick={() => setIsStatusHelpOpen(true)}
            title={getStatusTooltip("Auth", "ok", undefined, `Signed in as ${session.user.email}.`)}
          >
            <span className="status-icon ok" />
          </button>
          <button
            type="button"
            aria-label={`database status ${getStatusLabel(databaseStatus).toLowerCase()}`}
            className="status-dot-button"
            data-testid="status-database"
            onClick={() => setIsStatusHelpOpen(true)}
            title={getStatusTooltip("Database", databaseStatus, databaseStatusDetail)}
          >
            <span className={`status-icon ${getStatusClass(databaseStatus)}`} />
          </button>
          <button
            type="button"
            aria-label={`people query status ${getStatusLabel(peopleQueryStatus).toLowerCase()}`}
            className="status-dot-button"
            data-testid="status-people-query"
            onClick={() => setIsStatusHelpOpen(true)}
            title={getStatusTooltip(
              "People query",
              peopleQueryStatus,
              undefined,
              `People loaded: ${people.length}.`,
            )}
          >
            <span className={`status-icon ${getStatusClass(peopleQueryStatus)}`} />
          </button>
          <button
            type="button"
            aria-label={`entries query status ${getStatusLabel(entriesQueryStatus).toLowerCase()}`}
            className="status-dot-button"
            data-testid="status-entries-query"
            onClick={() => setIsStatusHelpOpen(true)}
            title={getStatusTooltip(
              "Entries query",
              entriesQueryStatus,
              undefined,
              `Entries loaded: ${entries.length}.`,
            )}
          >
            <span className={`status-icon ${getStatusClass(entriesQueryStatus)}`} />
          </button>
          <button
            type="button"
            aria-label="auto refresh indicator"
            className="status-dot-button"
            data-testid="status-refresh"
            onClick={() => setIsStatusHelpOpen(true)}
            title={refreshIndicatorTitle}
          >
            <span className={`status-icon refresh ${isRefreshPulsing ? "pulse" : ""}`} />
          </button>

          <div className="settings-anchor">
            <button
              aria-label="open settings"
              className="icon-button ghost"
              onClick={() => setSettingsOpen((current) => !current)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            {settingsOpen ? (
              <div className="settings-menu" role="menu">
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    void supabase.auth.signOut();
                  }}
                  role="menuitem"
                  type="button"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {actionError ? <p className="error">{actionError}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <section className="card">
        <h2>Quick add (home person)</h2>
        {people.length === 0 ? (
          <p>Add a person before recording entries.</p>
        ) : (
          <>
            <p className="muted">Default person: {homePersonLabel}</p>
            <form onSubmit={onSubmitEntry} className="inline-form">
              <input
                aria-label="Entry date (UTC)"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
              />

              <select
                aria-label="Entry hour (UTC)"
                value={entryTime}
                onChange={(event) => setEntryTime(event.target.value)}
              >
                {HOUR_OPTIONS.map((hourValue) => (
                  <option key={hourValue} value={hourValue}>
                    {hourValue}
                  </option>
                ))}
              </select>

              <div className="score-input-wrap">
                <select
                  aria-label="Bristol score"
                  value={entryScore}
                  onChange={(event) => setEntryScore(event.target.value)}
                >
                  {BRISTOL_LEVELS.map((level) => (
                    <option key={level.score} value={level.score}>
                      Bristol {level.score} - {level.mnemonic}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Show stool chart help"
                  className="help-badge"
                  onClick={() => setIsBristolHelpOpen(true)}
                  type="button"
                >
                  ?
                </button>
              </div>

              <textarea
                value={entryComment}
                onChange={(event) => setEntryComment(event.target.value)}
                rows={2}
                placeholder={`Optional comment (up to ${DEFAULT_COMMENT_MAX_LENGTH} chars)`}
              />

              <button disabled={isSavingEntry} type="submit">
                {isSavingEntry ? "Saving..." : "Save entry"}
              </button>
            </form>
          </>
        )}
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>Insights</h2>
          <div className="toolbar-controls">
            <select
              value={selectedPersonId}
              disabled={people.length === 0}
              onChange={(event) => setSelectedPersonId(event.target.value)}
            >
              {people.length === 0 ? <option value="">No people</option> : null}
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {shortPersonLabel(person.id)}
                </option>
              ))}
            </select>

            <select
              value={lookbackDays}
              onChange={(event) => {
                setLookbackDays(Number(event.target.value) as 5 | 14 | 30);
                setWindowOffsetDays(0);
              }}
            >
              <option value={5}>Last 5 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>

            <button onClick={moveWindowBack} disabled={people.length === 0}>
              ← Back
            </button>
            <button
              onClick={moveWindowForward}
              disabled={windowOffsetDays === 0 || people.length === 0}
            >
              Forward →
            </button>
          </div>
        </div>

        <p className="muted">
          Viewing {range.displayStartLabel} to {range.displayEndLabel}
        </p>
        <p
          className={
            entriesQueryStatus === "error" || peopleQueryStatus === "error"
              ? "chart-status error"
              : "chart-status muted"
          }
        >
          {chartStatusMessage}
        </p>

        <div className="chart-wrap">
          {shouldRenderChart ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[1, 7]} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="count" fill="#2f8f4e" name="Daily entries" />
                <Line
                  yAxisId="left"
                  type="linear"
                  dataKey="gapAlertMarker"
                  stroke="transparent"
                  connectNulls={false}
                  dot={renderGapAlertDot}
                  activeDot={false}
                  isAnimationActive={false}
                  name=">48h no-entry gap alert"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rollingAverage"
                  stroke="#2f5fbd"
                  strokeWidth={2}
                  dot={false}
                  name="Rolling avg (3-day)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-placeholder">Chart will appear after selecting a person.</div>
          )}
        </div>
        {hasLongGapAlert ? (
          <p className="gap-alert-note">
            ★ Red star marks a period with more than 48 hours without an entry.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>
          Entries for {selectedPerson ? shortPersonLabel(selectedPerson.id) : "person"} ·{" "}
          {range.displayStartLabel} to {range.displayEndLabel}
        </h2>

        {loadingPeople || loadingEntries ? (
          <p>Loading...</p>
        ) : people.length === 0 ? (
          <p>No people configured yet.</p>
        ) : !selectedPerson ? (
          <p>Select a person to see entries.</p>
        ) : entries.length === 0 ? (
          <p>No entries for this period.</p>
        ) : (
          <ul className="entry-list">
            {entries
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  {editingEntryId === entry.id ? (
                    <form
                      className="entry-edit-form"
                      onSubmit={(event) => void saveEditedEntry(event, entry.id)}
                    >
                      <div className="entry-row-top">
                        <input
                          aria-label="Edit entry date (UTC)"
                          required
                          type="date"
                          value={editEntryDate}
                          onChange={(event) => setEditEntryDate(event.target.value)}
                        />
                        <select
                          aria-label="Edit entry hour (UTC)"
                          value={editEntryTime}
                          onChange={(event) => setEditEntryTime(event.target.value)}
                        >
                          {HOUR_OPTIONS.map((hourValue) => (
                            <option key={hourValue} value={hourValue}>
                              {hourValue}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Edit Bristol score"
                          value={editEntryScore}
                          onChange={(event) => setEditEntryScore(event.target.value)}
                        >
                          {BRISTOL_LEVELS.map((level) => (
                            <option key={level.score} value={level.score}>
                              Bristol {level.score} - {level.mnemonic}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        aria-label="Edit comment"
                        rows={2}
                        value={editEntryComment}
                        onChange={(event) => setEditEntryComment(event.target.value)}
                        placeholder={`Optional comment (up to ${DEFAULT_COMMENT_MAX_LENGTH} chars)`}
                      />
                      <div className="entry-actions">
                        <button disabled={isSavingEntryEdit} type="submit">
                          {isSavingEntryEdit ? "Saving..." : "Save changes"}
                        </button>
                        <button className="ghost" onClick={cancelEditingEntry} type="button">
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="entry-row-top">
                        <span>{formatUtcDateTime(entry.at)}</span>
                        <span>Score {entry.score}</span>
                      </div>
                      <span>{entry.comment || "-"}</span>
                      <div className="entry-actions">
                        <button
                          className="ghost"
                          onClick={() => startEditingEntry(entry)}
                          type="button"
                        >
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Person setup</h2>
        <form onSubmit={onSubmitPerson} className="inline-form">
          <input
            value={newPersonId}
            onChange={(event) => setNewPersonId(event.target.value)}
            placeholder="Person UUID (leave blank for auto-generated)"
            autoComplete="off"
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(event) => setSetAsDefault(event.target.checked)}
            />
            Set as default home person
          </label>
          <button type="submit">Add person</button>
        </form>
      </section>
      <p className="muted">
        Signed in as {session.user.email} · Metadata columns (created_by/updated_at) are captured on
        save.
      </p>

      {isBristolHelpOpen ? (
        <div className="modal-backdrop" onClick={() => setIsBristolHelpOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bristol-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="bristol-help-title">Bristol stool chart guide</h3>
            <ul className="modal-list">
              {BRISTOL_LEVELS.map((level) => (
                <li key={level.score}>
                  <strong>
                    {level.score} - {level.mnemonic}
                  </strong>{" "}
                  {level.description}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsBristolHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStatusHelpOpen ? (
        <div className="modal-backdrop" onClick={() => setIsStatusHelpOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="status-help-title">Status indicators</h3>
            <ul className="modal-list">
              <li>
                <strong>Auth</strong>: session status for the signed-in user ({session.user.email}).
              </li>
              <li>
                <strong>Database</strong>: connection health to Supabase. Current:{" "}
                {getStatusLabel(databaseStatus)}.
              </li>
              <li>
                <strong>People query</strong>: latest people-table fetch status. Current:{" "}
                {getStatusLabel(peopleQueryStatus)}.
              </li>
              <li>
                <strong>Entries query</strong>: latest entries fetch status for selected
                person/window. Current: {getStatusLabel(entriesQueryStatus)}.
              </li>
              <li>
                <strong>Refresh</strong>: heartbeat of automatic 15-second refresh cycles.{" "}
                {lastRefreshAt
                  ? `Last completed at ${lastRefreshAt.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}.`
                  : "First cycle is pending."}
              </li>
            </ul>
            <p className="muted">
              Color legend: green = healthy, gray = checking/idle, red = error.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsStatusHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};
