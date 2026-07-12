# SKILL.md — NYSE Terminal Architecture & Patterns

A reference document for AI agents (or new contributors) working on this
codebase. Captures the architectural patterns, conventions, and "why this
works the way it does" decisions that aren't obvious from the code alone.

---

## 1. The Big Picture

This project is a **modern frontend on a Hadoop-era backend**. The
frontend is Next.js 16 with a dark trading-desk UI. The "backend" is a
set of pre-computed JSON files produced by a Python pipeline that
mirrors the original MapReduce jobs from the itversity course.

The key insight: **the MapReduce jobs are the API contract**. Every
chart in the UI is backed by a specific MapReduce job, and the
`LineageBadge` on each chart makes that connection visible. When you
add a new chart, you must:
1. Identify which MapReduce job it derives from (or create a new
   "derived" job if none exists)
2. Add the job metadata to `pipeline_meta.json` in
   `scripts/build_artifacts.py`
3. Use `withLineage(jobId, data)` in the API route to attach the
   lineage to the response
4. Render a `<LineageBadge jobId="..." />` in the chart component

---

## 2. The Three Layers

### Layer 1: Pre-processing (`scripts/build_artifacts.py`)
- **Runs once** to produce JSON artifacts
- Reads raw NYSE `.gz` files from `repo/nyse_all/nyse_data/`
- Mirrors MapReduce logic in pandas — same key/value reasoning, same outputs
- **Memory-critical**: the sandbox has 4GB RAM. The full dataset is 9.4M
  rows. Patterns that work:
  - Use `dtype={"ticker": "category", "open": "float32", ...}` on read
  - Avoid `groupby().apply()` on the full DataFrame — use
    `groupby().agg()` with named aggregations instead
  - For per-ticker output, **stream** year-by-year and write to per-ticker
    file handles (don't accumulate in memory)
  - Use `groupby(sort=False)` when order doesn't matter
- **Output**: writes to `data/processed/` with `write_json()` which
  strips `Infinity`/`NaN` to `null` (strict JSON parsers reject them)

### Layer 2: Middleware (`src/app/api/`)
- Next.js Route Handlers (server-side)
- Reads pre-computed JSON via `src/lib/data-access.ts`
- **Caching**: `readCached<T>()` keeps parsed JSON in a module-level
  `Map<string, T>` — never re-parses the same file twice
- **Lineage decorator**: `withLineage(jobId, data)` wraps any payload
  with `{data, lineage: {job_id, title, stage, description, ...}}`
- **Path resolution**: `DATA_DIR = path.resolve(process.cwd(), "data", "processed")`
  — works because Next.js runs from the project root

### Layer 3: Frontend (`src/app/` + `src/components/`)
- Server components by default, client components where interactivity is needed
- **Zustand stores** for cross-component state:
  - `useYearStore` — the selected "time-machine" year (persisted to localStorage)
  - `usePipelineStore` — Pipeline Explorer slide-over open/close + active job
  - `useSelectedTicker` — Stock Detail drawer open/close + active ticker
- **Recharts** for all charts — works well with SSR but needs `key` prop
  on `ResponsiveContainer` to force re-render when data changes
- **shadcn/ui** for all UI primitives — New York style, dark mode default

---

## 3. The Lineage System

### Why it exists
The whole point of the project is to **expose the Hadoop-era heritage as
a feature**. Every chart shows where its data comes from, and clicking
the badge opens the original MapReduce source code.

### How to add a new lineage job
1. Add an entry to `PIPELINE_META` in `scripts/build_artifacts.py`:
   ```python
   {
       "id": "MyNewJob",
       "title": "What It Does",
       "source_files": ["code_repo/path/to/Original.java"],
       "description": "Mapper emits X; reducer computes Y.",
       "consumes": ["NYSE daily prices"],
       "produces": ["my_artifact.json"],
       "stage": "mapper_reducer",  # or counter | map_side_join | derived
   }
   ```
2. Re-run `python scripts/build_artifacts.py` (or just the relevant function)
3. Use `withLineage("MyNewJob", data)` in the API route
4. Render `<LineageBadge jobId="MyNewJob" />` in the chart component

### Stage icons
The `LineageBadge` shows different icons/colors based on `stage`:
- `mapper_reducer` → Cpu icon, emerald
- `counter` → FunctionSquare icon, amber
- `map_side_join` → Database icon, cyan
- `derived` → GitBranch icon, fuchsia

---

## 4. The Time-Machine Pattern

The year selector is the **spine of the UX**. Every panel reads the
selected year from `useYearStore` and re-fetches data when it changes.

### How to make a panel year-aware
```tsx
"use client";
import { useYearStore } from "@/hooks/use-year-store";

export function MyPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/my-endpoint?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d));
  }, [year]); // ← re-fetches when year changes

  return <Card>...</Card>;
}
```

### Historical context subtitles
`YearSelector` has a `HISTORICAL_EVENTS` map — add new entries there
for any year that deserves a contextual subtitle.

---

## 5. The Dark Trading-Desk Theme

Defined in `src/app/globals.css`. Key tokens:
- `--background: oklch(0.16 0.02 255)` — deep navy
- `--primary: oklch(0.7 0.18 165)` — mint/teal accent
- `--destructive: oklch(0.65 0.25 25)` — red for losses
- `--chart-1: oklch(0.7 0.2 145)` — green for gainers
- `--chart-2: oklch(0.65 0.25 25)` — red for losers

### Utility classes
- `.text-up` / `.text-down` — green/red text for positive/negative values
- `.bg-up` / `.bg-down` — translucent green/red backgrounds
- `.text-mono-tabular` — Geist Mono with `font-variant-numeric: tabular-nums`
- `.grid-bg` — subtle grid background pattern
- `.glow-up` / `.glow-down` — colored box-shadows for emphasis

### The root `<html>` has `className="dark"` — dark mode is always on.

---

## 6. Recharts Patterns

### Numeric X-axis with date values
Recharts defaults to `type="category"` for XAxis. When `dataKey` is a
numeric date (e.g. `20080101`), you **must** set:
```tsx
<XAxis
  dataKey="date"
  type="number"
  domain={["dataMin", "dataMax"]}
  scale="linear"
  tickFormatter={formatDate}
/>
```
Otherwise all points collapse to x=0 and the chart renders as a vertical
line.

### Force re-render on data change
`ResponsiveContainer` caches its measurements. When the data prop
changes significantly (e.g. switching tickers), add a `key`:
```tsx
<ResponsiveContainer key={`${ticker}-${range}`} width="100%" height={280}>
```

### Dual-axis composed chart
For price + volume in one chart:
```tsx
<ComposedChart data={series}>
  <YAxis yAxisId="price" />
  <YAxis yAxisId="vol" orientation="right" />
  <Bar yAxisId="vol" dataKey="volume" />
  <Line yAxisId="price" dataKey="close" />
</ComposedChart>
```

---

## 7. Memory Constraints

The sandbox has **4GB RAM, no swap**. This shapes many decisions:

- **No in-browser data caching beyond what's needed** — fetch per-panel,
  don't preload everything
- **Kill chrome processes before running the dev server** if you need to
  run agent-browser for verification — chrome + Turbopack together
  exceed the limit
- **Pre-compute, don't query on-demand** — the 9.4M-row dataset cannot
  be queried live within RAM limits
- **Stream large outputs** — the per-ticker JSON files are written
  year-by-year with open file handles, not accumulated in memory

If you hit OOM:
1. Check `dmesg | tail -5` for `oom-kill` lines
2. Kill chrome: `pkill -9 -f chrome`
3. Restart dev server: `cd /home/z/my-project && (nohup setsid bun run dev > /tmp/dev.log 2>&1 < /dev/null &)`

---

## 8. The Preview Link

The dev server runs on port 3000 internally. The user-facing preview is:
```
https://preview-<bot-id>.space-z.ai/
```
Replace `<bot-id>` with the actual bot ID at runtime.

**Never** tell the user to visit `http://localhost:3000` — it's internal.

---

## 9. Adding a New Panel

Checklist:
- [ ] Identify the MapReduce job it derives from (or define a new one in `PIPELINE_META`)
- [ ] Add the computation to `scripts/build_artifacts.py` — write JSON via `write_json()`
- [ ] Add an accessor in `src/lib/data-access.ts` — use `readCached<T>()`
- [ ] Add an API route in `src/app/api/<name>/route.ts` — use `withLineage()`
- [ ] Create the panel in `src/components/panels/<name>-panel.tsx`
- [ ] Use `useYearStore` for year-awareness
- [ ] Render a `<LineageBadge>` with the job ID
- [ ] Add the panel to `src/app/page.tsx` in the grid layout
- [ ] Verify with `curl` first, then agent-browser

---

## 10. Common Pitfalls

### "Module not found" right after creating a new file
The dev server's first compile attempt happens before the file exists.
Ignore the error — the next request will succeed.

### JSON parse error: `Unexpected token 'I'`
Python's `json.dumps` writes `Infinity` by default. The `write_json()`
helper strips these to `null`, but if you add a new writer, use the
helper or add the regex strip yourself.

### Recharts chart renders empty
Check:
1. Is `data` an array (not `undefined`)? Default to `[]`
2. Is `dataKey` matching the actual key in your data?
3. For numeric X-axis, is `type="number"` + `domain` set?
4. Add a `key` to `ResponsiveContainer` to force re-render

### Dev server dies between bash calls
The 4GB RAM limit + Turbopack memory usage means the server gets
OOM-killed when chrome is also running. Restart with:
```bash
pkill -9 -f chrome; cd /home/z/my-project && (nohup setsid bun run dev > /tmp/dev.log 2>&1 < /dev/null &)
```

---

## 11. Testing Strategy

1. **API smoke test** — `curl` every endpoint, verify 200 status and
   non-empty response
2. **Browser verification** — use `agent-browser` to open the page,
   snapshot interactive elements, click through key flows
3. **Memory check** — `free -h` before and after heavy operations
4. **No unit tests yet** — the project is small enough that E2E
   verification suffices. Add Jest/Vitest when the codebase stabilizes.
