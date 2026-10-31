"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Globe2,
  LayoutDashboard,
  ChartNoAxesCombined,
  Star,
  Sparkles,
  Newspaper,
  CalendarDays,
  Bell,
  Settings,
  Search,
  ChevronDown,
  Plus,
  X,
  Check,
  Menu,
  ShieldCheck,
  LogOut,
  Download,
  GripVertical,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
  Command,
  Wallet,
  Mail,
  Layers,
  LifeBuoy,
} from "lucide-react";
import { demoQuotes, demoNews, demoEvents, type Quote } from "@/lib/market";
type User = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  role: string;
  plan: string;
  status: string;
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  access: boolean;
  premium: boolean;
  preferences: { widgets?: string[]; category?: string; newsCategory?: string };
};
type Report = {
  id: string;
  title: string;
  provider: string;
  generatedAt: string;
  content: {
    generatedAt: string;
    interpretation: string;
    facts: { symbol: string; price: number; changePercent: number }[];
    calculations: { symbol: string; sma14: number; rsi14: number }[];
    dataAsOf: {
      symbol: string;
      timestamp: string;
      source: string;
      status: string;
    }[];
    disclosure: string;
  };
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Request failed");
  return result;
}
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["markets", "Markets", ChartNoAxesCombined],
  ["watchlist", "Watchlist", Star],
  ["intelligence", "AI Intelligence", Sparkles],
  ["news", "Market news", Newspaper],
  ["calendar", "Economic calendar", CalendarDays],
  ["alerts", "Alerts", Bell],
  ["comparisons", "Compare assets", Layers],
] as const;
const categories = [
  "All markets",
  "Crypto",
  "Forex",
  "Stocks",
  "Indices",
  "Commodities",
  "ETFs",
  "CFDs",
];
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: n < 2 ? 5 : 2,
    minimumFractionDigits: n < 2 ? 4 : 2,
  }).format(n);
function Delta({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? "positive" : "negative"}>
      {value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{" "}
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}
function Spark({ q }: { q: Quote }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={q.history.slice(-30)}>
        <Area
          type="monotone"
          dataKey="price"
          stroke={q.change >= 0 ? "#a3e635" : "#f27788"}
          fill={q.change >= 0 ? "#a3e635" : "#f27788"}
          fillOpacity={0.06}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        <YAxis domain={["dataMin", "dataMax"]} hide />
      </AreaChart>
    </ResponsiveContainer>
  );
}
export function Terminal({ page }: { page: string }) {
  const [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false),
    [quotes, setQuotes] = useState<Quote[]>(demoQuotes()),
    [feedError, setFeedError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All markets"),
    [selected, setSelected] = useState("BTC"),
    [period, setPeriod] = useState("3D"),
    [watch, setWatch] = useState<string[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [news, setNews] = useState(demoNews),
    [events, setEvents] = useState(demoEvents),
    [alerts, setAlerts] = useState<any[]>([]),
    [notifications, setNotifications] = useState<any[]>([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState(""),
    [question, setQuestion] = useState(""),
    [compareSymbol, setCompareSymbol] = useState("ETH"),
    [widgets, setWidgets] = useState([
      "chart",
      "markets",
      "news",
      "calendar",
      "reports",
    ]),
    [drag, setDrag] = useState(""),
    [newsCategory, setNewsCategory] = useState("All markets"),
    [plan, setPlan] = useState("PREMIUM"),
    [admin, setAdmin] = useState<any>(null),
    [invoices, setInvoices] = useState<any[]>([]),
    [compareData, setCompareData] = useState<any>(null),
    [billingMode, setBillingMode] = useState("test"),
    [sort, setSort] = useState("directory"),
    [newsStatus, setNewsStatus] = useState("demonstration"),
    [calendarStatus, setCalendarStatus] = useState("demonstration");
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 6000);
  }, []);
  const refreshUser = useCallback(async () => {
    const data = await api("session");
    setUser(data.user);
    setLoaded(true);
    if (data.user?.preferences?.widgets)
      setWidgets(data.user.preferences.widgets);
    if (data.user?.preferences?.category)
      setCategory(data.user.preferences.category);
    if (data.user?.preferences?.newsCategory)
      setNewsCategory(data.user.preferences.newsCategory);
    return data.user;
  }, []);
  useEffect(() => {
    refreshUser().catch(() => setLoaded(true));
    api("markets")
      .then((d) => {
        setQuotes(d.quotes);
        setFeedError(d.error || "");
      })
      .catch(() =>
        setFeedError(
          "Market service unavailable. Showing bundled demonstration fixtures.",
        ),
      );
    if (new URLSearchParams(location.search).get("plan") === "STANDARD")
      setPlan("STANDARD");
  }, [refreshUser]);
  useEffect(() => {
    const timer = setInterval(() => {
      api("markets")
        .then((d) => {
          setQuotes(d.quotes);
          setFeedError(d.error || "");
        })
        .catch(() =>
          setFeedError("Market refresh failed; check source timestamps."),
        );
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user) return;
    if (user.access) {
      api("watchlist")
        .then((d) => setWatch(d.map((w: any) => w.symbol)))
        .catch(() => {});
      api("reports")
        .then(setReports)
        .catch(() => {});
      api("alerts")
        .then(setAlerts)
        .catch(() => {});
      api("news")
        .then((d) => {
          setNews(d.articles);
          setNewsStatus(d.status);
          if (d.error) setFeedError(d.error);
        })
        .catch(() => {});
      api("calendar")
        .then((d) => {
          setEvents(d.events);
          setCalendarStatus(d.status);
          if (d.error) setFeedError(d.error);
        })
        .catch(() => {});
    }
    api("notifications")
      .then(setNotifications)
      .catch(() => {});
    if (page === "account")
      api("account")
        .then((d) => setInvoices(d.invoices))
        .catch(() => {});
    if (page === "admin")
      api("admin")
        .then(setAdmin)
        .catch((e) => setError(e.message));
  }, [user, page]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal("");
      if (event.key === "Tab") {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button,.modal a,.modal input,.modal select,.modal textarea",
          ),
        ).filter((e) => !e.hasAttribute("disabled"));
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function toggleWatch(symbol: string) {
    await action(async () => {
      await api("watchlist", watch.includes(symbol) ? "DELETE" : "POST", {
        symbol,
      });
      setWatch((w) =>
        w.includes(symbol) ? w.filter((s) => s !== symbol) : [...w, symbol],
      );
    });
  }
  async function saveWidgets(next: string[]) {
    await action(async () => {
      await api("preferences", "POST", {
        widgets: next,
        category,
        newsCategory,
      });
      setWidgets(next);
      notify("Dashboard preferences saved");
    });
  }
  useEffect(() => {
    api("config")
      .then((c) => setBillingMode(c.billing))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (page === "comparisons" && user?.premium)
      api("comparisons?left=" + selected + "&right=" + compareSymbol)
        .then(setCompareData)
        .catch((e) => {
          setCompareData(null);
          setError(e.message);
        });
  }, [page, user, selected, compareSymbol]);
  const q = quotes.find((q) => q.symbol === selected) || quotes[0];
  const filtered = quotes
    .filter(
      (q) =>
        (category === "All markets" || category === q.category) &&
        (!query ||
          [q.symbol, q.name]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "gainers"
        ? b.change - a.change
        : sort === "losers"
          ? a.change - b.change
          : sort === "volume"
            ? b.volumeRatio - a.volumeRatio
            : 0,
    );
  const trialDays = user
    ? Math.max(
        0,
        Math.ceil((Date.parse(user.trialEndsAt) - Date.now()) / 86400000),
      )
    : 7;
  const isPublic = [
    "home",
    "pricing",
    "features",
    "faq",
    "contact",
    "privacy",
    "terms",
    "disclosures",
    "login",
    "register",
    "verify",
    "forgot-password",
    "reset-password",
  ].includes(page);
  function Brand() {
    return (
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Activity size={23} />
        </span>
        <span>
          DARK<span className="muted">MARKETS</span>
          <small>POWERED BY DARK SYSTEMS</small>
        </span>
      </Link>
    );
  }
  function ReportCard({ report }: { report: Report }) {
    return (
      <article className="report-card">
        <div className="eyebrow">
          <Sparkles size={13} />
          {report.provider === "deterministic"
            ? "CALCULATED BRIEFING"
            : "AI MARKET BRIEFING"}
        </div>
        <h3>{report.title}</h3>
        <p>{report.content.interpretation}</p>
        <div className="report-facts">
          {report.content.facts.slice(0, 4).map((f) => (
            <div key={f.symbol}>
              <strong>{f.symbol}</strong>
              <span>{fmt(f.price)}</span>
              <Delta value={f.changePercent} />
            </div>
          ))}
        </div>
        <details>
          <summary>Evidence, calculations & sources</summary>
          {report.content.calculations.map((f) => (
            <p key={f.symbol}>
              {f.symbol}: SMA(14) {fmt(f.sma14)} · RSI(14) {f.rsi14}
            </p>
          ))}
          {report.content.dataAsOf.map((f) => (
            <p key={f.symbol}>
              {f.symbol} · {f.timestamp} · {f.source} · {f.status}
            </p>
          ))}
          <p>{report.content.disclosure}</p>
        </details>
        <footer>
          <span>
            {new Date(report.generatedAt).toLocaleString("en-ZA", {
              timeZone: "Africa/Johannesburg",
            })}{" "}
            SAST
          </span>
          {user?.premium && (
            <a href={"/api/reports/download?id=" + report.id}>
              <Download size={14} /> JSON report
            </a>
          )}
        </footer>
      </article>
    );
  }
  function MarketTable() {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Price / USD quote</th>
              <th>Fixture change</th>
              <th className="hide-mobile">3-day trend</th>
              <th className="hide-mobile">Volume · demo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .filter((a) => page !== "watchlist" || watch.includes(a.symbol))
              .map((a) => (
                <tr
                  key={a.symbol}
                  className={a.symbol === selected ? "selected-row" : ""}
                >
                  <td>
                    <button
                      className="asset-button"
                      onClick={() => {
                        setSelected(a.symbol);
                        setModal("chart");
                      }}
                    >
                      <span className={"coin coin-" + a.category.toLowerCase()}>
                        {a.symbol === "BTC"
                          ? "₿"
                          : a.symbol === "ETH"
                            ? "Ξ"
                            : a.symbol.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {a.symbol} <i>·</i> {a.category}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td className="number">{fmt(a.price)}</td>
                  <td>
                    <Delta value={a.change} />
                  </td>
                  <td className="hide-mobile spark-cell">
                    <Spark q={a} />
                  </td>
                  <td className="hide-mobile muted number">
                    {(a.volume / 1e9).toFixed(2)}B
                  </td>
                  <td>
                    <button
                      aria-label={
                        (watch.includes(a.symbol) ? "Remove " : "Watch ") +
                        a.name
                      }
                      className={
                        "icon-button " +
                        (watch.includes(a.symbol) ? "starred" : "")
                      }
                      onClick={() => toggleWatch(a.symbol)}
                    >
                      <Star
                        size={16}
                        fill={
                          watch.includes(a.symbol) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!filtered.filter(
          (a) => page !== "watchlist" || watch.includes(a.symbol),
        ).length && (
          <div className="empty">
            {category === "CFDs"
              ? "CFD data requires an authorised, licensed provider. No CFD feed is enabled."
              : page === "watchlist"
                ? "Your watchlist is clear. Star an asset in Markets to add it."
                : "No matching assets."}
          </div>
        )}
      </div>
    );
  }
  function Chart() {
    const points = q.history.slice(
      period === "1D" ? -24 : period === "2D" ? -48 : 0,
    );
    return (
      <>
        <div className="panel-heading">
          <div className="chart-title">
            <span className="coin coin-crypto">
              {q.symbol === "BTC" ? "₿" : q.symbol.slice(0, 1)}
            </span>
            <div>
              <h3>
                {q.name} <span className="muted">/ USD</span>
              </h3>
              <small>
                {q.symbol} ·{" "}
                {q.source.includes("synthetic") ? "Demonstration" : q.source}
              </small>
            </div>
            <select
              aria-label="Chart asset"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {quotes.map((a) => (
                <option key={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </div>
          <button
            className="icon-button"
            aria-label="Create alert"
            onClick={() => setModal("alert")}
          >
            <Bell size={17} />
          </button>
        </div>
        <div className="chart-values">
          <strong>{fmt(q.price)}</strong>
          <Delta value={q.change} />
          <span className="muted">fixture change</span>
        </div>
        <div className="chart-controls">
          <div className="segmented">
            {["1D", "2D", "3D"].map((p) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="muted">
            Area chart <Activity size={13} />
          </span>
        </div>
        <div className="main-chart">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart
              data={points}
              margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b4f45b" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#b4f45b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#272c28"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="time"
                tickFormatter={(t) =>
                  new Date(t).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })
                }
                minTickGap={60}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#778079", fontSize: 10 }}
              />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={(v) => fmt(v)}
                axisLine={false}
                tickLine={false}
                width={78}
                tick={{ fill: "#778079", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#151a16",
                  border: "1px solid #35402f",
                  borderRadius: 8,
                  color: "#fff",
                }}
                labelFormatter={(v) => new Date(String(v)).toUTCString()}
                formatter={(v) => [fmt(Number(v)), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#b4f45b"
                strokeWidth={2}
                fill="url(#chartFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-bottom">
          <span>
            SMA 14 <b>{fmt(q.sma)}</b>
          </span>
          <span>
            RSI 14 <b>{q.rsi.toFixed(2)}</b>
          </span>
          <span>
            Volatility <b>{q.volatility.toFixed(2)}%</b> · Volume ratio{" "}
            <b>{q.volumeRatio.toFixed(2)}×</b>
          </span>
          <span>
            Data: {new Date(q.asOf).toLocaleDateString("en-GB")} · UTC
          </span>
        </div>
      </>
    );
  }
  function NewsPanel() {
    return (
      <>
        <div className="panel-heading">
          <h3>
            <Newspaper size={16} /> Market stories
          </h3>
          <Link href="/news">
            View all <ArrowUpRight size={13} />
          </Link>
        </div>
        {news.slice(0, 3).map((n, i) => (
          <Link key={n.id} href="/news" className="news-item">
            <div className="news-index">0{i + 1}</div>
            <div>
              <span className="eyebrow">
                {n.category} <i>·</i>{" "}
                {newsStatus === "demonstration"
                  ? "EDUCATIONAL"
                  : "LICENSED SOURCE"}
              </span>
              <h4>{n.title}</h4>
              <small>{n.source}</small>
            </div>
            <ArrowUpRight size={14} />
          </Link>
        ))}
      </>
    );
  }
  function CalendarPanel() {
    return (
      <>
        <div className="panel-heading">
          <h3>
            <CalendarDays size={16} /> On the calendar
          </h3>
          <Link href="/calendar">
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="subtle-banner">
          {calendarStatus === "demonstration"
            ? "Sample events · UTC · not an actual schedule"
            : "Authorised provider schedule · UTC"}
        </div>
        {events.slice(0, 3).map((e) => (
          <div key={e.id} className="event">
            <span className="number muted">
              {e.time}
              <small>{e.date}</small>
            </span>
            <span>
              <b>{e.region}</b>
              <p>{e.title}</p>
            </span>
            <span className={"impact " + e.impact.toLowerCase()}>
              {e.impact}
            </span>
          </div>
        ))}
      </>
    );
  }
  const authPage = [
    "login",
    "register",
    "verify",
    "forgot-password",
    "reset-password",
  ].includes(page);
  return (
    <div className={isPublic ? "public-app" : "app-shell"}>
      {isPublic ? (
        <header className="public-header">
          <Brand />
          <nav>
            <Link href="/features">Platform</Link>
            <Link href="/dashboard">Explore markets</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
          <div>
            <Link className="text-link" href={user ? "/dashboard" : "/login"}>
              {user ? "Dashboard" : "Sign in"}
            </Link>
            <Link className="button primary" href="/register">
              Start free trial <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>
      ) : (
        <>
          <aside className={"sidebar " + (mobile ? "open" : "")}>
            <Brand />
            <div className="workspace-tag">
              <span className="status-dot" /> GLOBAL INTELLIGENCE{" "}
              <ChevronDown size={13} />
            </div>
            <span className="nav-label">WORKSPACE</span>
            <nav>
              {nav.map(([href, label, Icon]) => (
                <Link
                  key={href}
                  href={"/" + href}
                  className={page === href ? "active" : ""}
                >
                  <Icon size={18} />
                  {label}
                  {href === "intelligence" && (
                    <span className="tiny-badge">AI</span>
                  )}
                </Link>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="upgrade-card">
                <Sparkles size={18} />
                <strong>A wider perspective.</strong>
                <p>Unlock on-demand research and a workspace that’s yours.</p>
                <Link href="/pricing">
                  Explore Premium <ArrowUpRight size={14} />
                </Link>
              </div>
              <Link href="/contact">
                <LifeBuoy size={17} /> Help & support
              </Link>
              <Link
                className={page === "account" ? "active" : ""}
                href="/account"
              >
                <Settings size={17} /> Account & billing
              </Link>
              {user?.role === "ADMIN" && (
                <Link href="/admin">
                  <ShieldCheck size={17} /> Administration
                </Link>
              )}
              <div className="profile">
                <span className="avatar">
                  {user ? user.name.slice(0, 2).toUpperCase() : "DM"}
                </span>
                <span>
                  <strong>{user?.name || "Explorer workspace"}</strong>
                  <small>
                    {user
                      ? user.plan + " · " + user.status
                      : "Demonstration access"}
                  </small>
                </span>
                {user ? (
                  <button
                    aria-label="Sign out"
                    className="icon-button"
                    onClick={() =>
                      action(async () => {
                        await api("auth/logout", "POST");
                        location.href = "/login";
                      })
                    }
                  >
                    <LogOut size={16} />
                  </button>
                ) : (
                  <Link href="/login">
                    <ArrowUpRight size={17} />
                  </Link>
                )}
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <button
                className="icon-button mobile-menu"
                aria-label="Toggle navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <b>
                  {nav.find((n) => n[0] === page)?.[1] ||
                    page[0].toUpperCase() + page.slice(1)}
                </b>
              </span>
              <div className="top-actions">
                <div className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search assets"
                    placeholder="Search any market…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (page !== "markets" && page !== "dashboard")
                        location.href = "/markets";
                    }}
                  />
                  <span>⌘ K</span>
                </div>
                <span className="demo-tag">
                  <span className="status-dot" />{" "}
                  {quotes.some((a) => a.status === "demonstration")
                    ? "DEMO DATA"
                    : "PROVIDER DATA"}
                </span>
                <button
                  className="icon-button notification-button"
                  aria-label="Notifications"
                  onClick={() => setModal("notifications")}
                >
                  <Bell size={18} />
                  {notifications.some((n) => !n.read) && <i />}
                </button>
              </div>
            </header>
            <div className="ticker">
              {quotes.slice(0, 7).map((a) => (
                <button
                  key={a.symbol}
                  onClick={() => {
                    setSelected(a.symbol);
                    setModal("chart");
                  }}
                >
                  <strong>{a.symbol}</strong>
                  <span>{fmt(a.price)}</span>
                  <Delta value={a.change} />
                </button>
              ))}
            </div>
            <main className="terminal-main">
              {feedError && <div className="notice">{feedError}</div>}
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="status-dot" /> YOUR EDGE STARTS WITH
                    INFORMATION
                  </div>
                  <h1>
                    {page === "dashboard"
                      ? "The world. At a glance."
                      : nav.find((n) => n[0] === page)?.[1] ||
                        page[0].toUpperCase() + page.slice(1)}
                  </h1>
                  <p>
                    {page === "dashboard"
                      ? "Every asset. Every perspective. One connected view."
                      : "Explore the information behind every market."}
                  </p>
                </div>
                <div className="heading-actions">
                  <span className="date-label">
                    {new Date(q.asOf)
                      .toLocaleDateString("en-GB", { timeZone: "UTC" })
                      .toUpperCase()}{" "}
                    <small>{q.status.toUpperCase()} SNAPSHOT</small>
                  </span>
                  {page === "dashboard" && (
                    <button
                      className="button secondary"
                      onClick={() => setModal("customize")}
                    >
                      <SlidersHorizontal size={15} /> Customise
                    </button>
                  )}
                </div>
              </div>
              {!user && loaded && (
                <div className="trial-banner">
                  <span>
                    <Sparkles size={16} /> You’re exploring a demonstration
                    workspace. Start a seven-day trial to save your research.
                  </span>
                  <Link href="/register">
                    Start free trial <ArrowRight size={15} />
                  </Link>
                </div>
              )}
              {user && !user.verified && (
                <div className="notice">
                  Verify your email to activate your selected plan.{" "}
                  <button
                    onClick={() =>
                      action(async () =>
                        notify((await api("auth/resend", "POST")).message),
                      )
                    }
                  >
                    Resend email
                  </button>
                </div>
              )}
              {user?.status === "trialing" && user.verified && (
                <div className="trial-banner">
                  <span>
                    <Sparkles size={16} /> {user.plan} trial · {trialDays} day
                    {trialDays === 1 ? "" : "s"} remaining. No automatic
                    charges.
                  </span>
                  <Link href="/account">
                    Manage plan <ArrowRight size={15} />
                  </Link>
                </div>
              )}
              {user?.verified && !user.access && (
                <div className="notice">
                  Your subscription is inactive. Your saved data is preserved.{" "}
                  <Link href="/account">Manage billing</Link>
                </div>
              )}
              {page === "dashboard" && (
                <>
                  <div className="stat-grid">
                    {["SPX", "BTC", "XAU", "EURUSD"].map((symbol) => {
                      const a =
                        quotes.find((q) => q.symbol === symbol) || quotes[0];
                      return (
                        <button
                          className="stat-card"
                          key={symbol}
                          onClick={() => {
                            setSelected(symbol);
                            setModal("chart");
                          }}
                        >
                          <div>
                            <span className="stat-label">{a.name}</span>
                            <span className="mini-icon">
                              <Globe2 size={15} />
                            </span>
                          </div>
                          <strong>{fmt(a.price)}</strong>
                          <div>
                            <Delta value={a.change} />
                            <small>{a.category}</small>
                          </div>
                          <div className="stat-spark">
                            <Spark q={a} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="dashboard-grid">
                    {widgets.map((widget) => (
                      <section
                        key={widget}
                        className={"panel widget-" + widget}
                        draggable={!!user?.premium}
                        onDragStart={() => setDrag(widget)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (user?.premium && drag !== widget) {
                            const next = [...widgets];
                            next.splice(next.indexOf(drag), 1);
                            next.splice(next.indexOf(widget), 0, drag);
                            saveWidgets(next);
                          }
                        }}
                      >
                        {widget === "chart" ? (
                          <Chart />
                        ) : widget === "markets" ? (
                          <>
                            <div className="panel-heading">
                              <h3>
                                Market overview{" "}
                                <span className="count">{filtered.length}</span>
                              </h3>
                              <Link href="/markets">
                                All assets <ArrowUpRight size={13} />
                              </Link>
                            </div>
                            <div className="category-tabs">
                              {categories.slice(0, 6).map((c) => (
                                <button
                                  key={c}
                                  className={category === c ? "active" : ""}
                                  onClick={() => setCategory(c)}
                                >
                                  {c === "All markets" ? "All assets" : c}
                                </button>
                              ))}
                            </div>
                            <MarketTable />
                          </>
                        ) : widget === "news" ? (
                          <NewsPanel />
                        ) : widget === "calendar" ? (
                          <CalendarPanel />
                        ) : (
                          <>
                            <div className="panel-heading">
                              <h3>
                                <Sparkles size={16} /> The intelligence brief
                              </h3>
                              <span className="tiny-badge">RESEARCH</span>
                            </div>
                            <div className="intelligence-preview">
                              <div className="ai-orb">
                                <Sparkles size={25} />
                              </div>
                              <div className="eyebrow">
                                LESS NOISE. MORE CONTEXT.
                              </div>
                              <h2>
                                A clearer view of
                                <br />
                                the bigger picture.
                              </h2>
                              <p>
                                Evidence-led market briefings. Deterministic
                                numbers. Transparent sources.
                              </p>
                              <Link
                                className="button primary"
                                href="/intelligence"
                              >
                                Open intelligence <ArrowUpRight size={15} />
                              </Link>
                              <small>
                                Information, never personalised advice.
                              </small>
                            </div>
                          </>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              )}
              {["markets", "watchlist"].includes(page) && (
                <section className="panel">
                  <div className="panel-heading">
                    <h3>
                      {page === "watchlist"
                        ? "Your saved assets"
                        : "Asset directory"}
                    </h3>
                    <div className="search">
                      <Search size={15} />
                      <input
                        placeholder="Search name or symbol"
                        aria-label="Filter assets"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="market-sort">
                    <label>
                      Market movers
                      <select
                        aria-label="Sort markets"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="directory">Directory order</option>
                        <option value="gainers">Top gainers</option>
                        <option value="losers">Top losers</option>
                        <option value="volume">Volume expansion</option>
                      </select>
                    </label>
                  </div>
                  <div className="category-tabs">
                    {categories.map((c) => (
                      <button
                        className={category === c ? "active" : ""}
                        key={c}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <MarketTable />
                </section>
              )}
              {page === "intelligence" && (
                <>
                  <div className="research-box">
                    <Sparkles size={25} />
                    <h2>Ask a better market question.</h2>
                    <p>
                      Premium research · 20 requests per rolling 24 hours ·{" "}
                      {user?.premium
                        ? "Your access is active"
                        : "Premium access required"}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(async () => {
                          const r = await api("reports", "POST", {
                            question,
                            symbols: [selected],
                          });
                          setReports((s) => [r, ...s]);
                          setQuestion("");
                          notify("Research saved");
                        });
                      }}
                    >
                      <input
                        aria-label="Research question"
                        required
                        minLength={5}
                        maxLength={500}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Compare the supplied price and volume observations…"
                      />
                      <select
                        aria-label="Research asset"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {quotes.map((a) => (
                          <option key={a.symbol}>{a.symbol}</option>
                        ))}
                      </select>
                      <button disabled={busy} className="button primary">
                        <ArrowUpRight size={17} /> Generate
                      </button>
                    </form>
                    <small>
                      {user?.premium
                        ? "Reports use the configured server-side provider."
                        : "Explore Premium for on-demand research."}{" "}
                      Deterministic mode produces calculated briefings without a
                      language model.
                    </small>
                  </div>
                  <div className="section-heading">
                    <h2>Research library</h2>
                    <span className="muted">
                      Daily briefings & saved research
                    </span>
                  </div>
                  <div className="report-grid">
                    {reports.map((r) => (
                      <ReportCard key={r.id} report={r} />
                    ))}
                  </div>
                  {!reports.length && (
                    <div className="empty panel">
                      {user?.access
                        ? "No reports yet. Run the background worker to generate the daily briefing."
                        : "Sign in with an active trial to read and save market reports."}
                      <Link href="/register" className="text-link">
                        Start your trial <ArrowRight size={15} />
                      </Link>
                    </div>
                  )}
                </>
              )}
              {page === "news" && (
                <>
                  <div className="category-tabs">
                    {categories
                      .filter((c) => c !== "CFDs")
                      .map((c) => (
                        <button
                          className={newsCategory === c ? "active" : ""}
                          key={c}
                          onClick={() => setNewsCategory(c)}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                  <div className="notice">
                    {newsStatus === "demonstration"
                      ? "Educational stories are demonstration content. No live news provider is connected."
                      : "Headlines and summaries supplied by the configured authorised provider. Follow the source for the original article."}
                  </div>
                  <div className="report-grid">
                    {news
                      .filter(
                        (n) =>
                          (newsCategory === "All markets" ||
                            newsCategory === n.category) &&
                          (!query ||
                            [n.title, n.summary, ...n.symbols]
                              .join(" ")
                              .toLowerCase()
                              .includes(query.toLowerCase())),
                      )
                      .map((n) => (
                        <article className="report-card" key={n.id}>
                          <div className="eyebrow">
                            {n.category} · {newsStatus.toUpperCase()}
                          </div>
                          <h2>{n.title}</h2>
                          <p>{n.summary}</p>
                          <div className="tags">
                            {n.symbols.map((s) => (
                              <button
                                key={s}
                                onClick={() => {
                                  setSelected(s);
                                  setModal("chart");
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                          <a href={n.url}>
                            {n.source} <ExternalLink size={13} />
                          </a>
                        </article>
                      ))}
                  </div>
                </>
              )}
              {page === "calendar" && (
                <section className="panel">
                  <CalendarPanel />
                  <div className="panel-footnote">
                    {calendarStatus === "demonstration"
                      ? "These illustrative events are not an economic release schedule. Configure an authorised calendar provider for actual events."
                      : "Release times are supplied by the configured calendar provider in UTC and may change."}
                  </div>
                </section>
              )}
              {page === "alerts" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Your alert rules</h3>
                    <button
                      className="button primary"
                      onClick={() => setModal("alert")}
                    >
                      <Plus size={15} /> Create alert
                    </button>
                  </div>
                  <div className="panel-footnote">
                    Price, change, volume and volatility thresholds are
                    evaluated by the background worker. Each rule fires once.
                    Demo alerts refer to synthetic observations.
                  </div>
                  {alerts.map((a) => (
                    <div className="list-row" key={a.id}>
                      <Bell size={18} />
                      <span>
                        <strong>
                          {a.symbol} · {a.kind.replaceAll("_", " ")}{" "}
                          {a.threshold}
                        </strong>
                        <small>
                          {a.triggeredAt ? "Triggered" : "Waiting"} ·{" "}
                          {a.email ? "In-app + email" : "In-app"}
                        </small>
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Delete alert"
                        onClick={() =>
                          action(async () => {
                            await api("alerts", "DELETE", { id: a.id });
                            setAlerts(alerts.filter((x) => x.id !== a.id));
                          })
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                  {!alerts.length && (
                    <div className="empty">
                      No alerts yet. Create a rule to follow an observation.
                    </div>
                  )}
                </section>
              )}
              {page === "comparisons" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h3>
                      Asset comparison{" "}
                      <span className="tiny-badge">PREMIUM</span>
                    </h3>
                    <div className="compare-selects">
                      {[selected, compareSymbol].map((v, i) => (
                        <select
                          key={i}
                          aria-label={"Comparison asset " + (i + 1)}
                          value={v}
                          onChange={(e) =>
                            i
                              ? setCompareSymbol(e.target.value)
                              : setSelected(e.target.value)
                          }
                        >
                          {quotes.map((a) => (
                            <option key={a.symbol}>{a.symbol}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </div>
                  {user?.premium ? (
                    <>
                      <div className="compare-chart">
                        <ResponsiveContainer width="100%" height={350}>
                          <LineChart data={compareData?.series || []}>
                            <CartesianGrid stroke="#272c28" />
                            <XAxis dataKey="time" hide />
                            <YAxis
                              tickFormatter={(v) => v.toFixed(1) + "%"}
                              stroke="#89938b"
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#171c18",
                                borderColor: "#394234",
                              }}
                            />
                            <Line
                              dataKey={selected}
                              stroke="#b4f45b"
                              dot={false}
                            />
                            <Line
                              dataKey={compareSymbol}
                              stroke="#bca2f5"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="panel-footnote">
                        Normalised change from the first supplied observation.{" "}
                        {selected} in lime; {compareSymbol} in purple.{" "}
                        {compareData?.indicators.map((i: any) => (
                          <p key={i.symbol}>
                            {i.symbol}: MACD {fmt(i.macd)} · Signal{" "}
                            {fmt(i.signal)} · Bollinger(20, 2σ){" "}
                            {fmt(i.bollinger.lower)} – {fmt(i.bollinger.upper)}
                          </p>
                        ))}
                        {compareData?.sources.map((s: any) => (
                          <p key={s.symbol}>
                            {s.symbol} · {s.source} · {s.status} · {s.asOf}
                          </p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <ShieldCheck size={28} />
                      <h3>More context. Side by side.</h3>
                      <p>
                        Premium includes normalised comparisons and advanced
                        calculated indicators.
                      </p>
                      <Link href="/pricing" className="button primary">
                        Explore Premium
                      </Link>
                    </div>
                  )}
                </section>
              )}
              {page === "account" && (
                <div className="account-grid">
                  {user ? (
                    <>
                      <section className="panel form-panel">
                        <h2>Your account</h2>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            action(async () => {
                              await api("account", "POST", {
                                name: f.get("name"),
                              });
                              await refreshUser();
                              notify("Profile saved");
                            });
                          }}
                        >
                          <label>
                            Full name
                            <input
                              name="name"
                              defaultValue={user.name}
                              required
                              minLength={2}
                            />
                          </label>
                          <label>
                            Email
                            <input value={user.email} readOnly />
                          </label>
                          <button className="button secondary" disabled={busy}>
                            Save profile
                          </button>
                        </form>
                        <a className="text-link" href="/api/account/export">
                          <Download size={15} /> Export your data
                        </a>
                        <button
                          className="text-link negative"
                          onClick={() => setModal("delete")}
                        >
                          Delete account
                        </button>
                      </section>
                      <section className="panel form-panel">
                        <div className="eyebrow">BILLING & ACCESS</div>
                        <h2>
                          {user.plan} · {user.status}
                        </h2>
                        <p>
                          {user.status === "trialing"
                            ? "Trial ends " +
                              new Date(user.trialEndsAt).toLocaleString(
                                "en-ZA",
                                { timeZone: "Africa/Johannesburg" },
                              ) +
                              " SAST"
                            : "Access until " +
                              (user.subscriptionEndsAt
                                ? new Date(
                                    user.subscriptionEndsAt,
                                  ).toLocaleDateString()
                                : "—")}
                        </p>
                        <div className="notice">
                          {billingMode === "test"
                            ? "Local billing test flow. No real money is charged."
                            : billingMode === "stripe"
                              ? "Stripe billing is configured. Checkout and the billing portal manage recurring payments."
                              : "Billing is disabled until a payment provider is configured."}
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            action(async () => {
                              const result = await api(
                                "billing/checkout",
                                "POST",
                                { plan, authorize: true },
                              );
                              if (result.url) location.href = result.url;
                              else {
                                notify(result.message);
                                await refreshUser();
                                const d = await api("account");
                                setInvoices(d.invoices);
                              }
                            });
                          }}
                        >
                          <label>
                            Monthly plan
                            <select
                              value={plan}
                              onChange={(e) => setPlan(e.target.value)}
                            >
                              <option value="STANDARD">
                                Standard — $10/month
                              </option>
                              <option value="PREMIUM">
                                Premium — $19/month
                              </option>
                            </select>
                          </label>
                          <label className="checkbox">
                            <input type="checkbox" required /> I authorise the
                            selected subscription.{" "}
                            {billingMode === "test"
                              ? "Test mode does not charge money."
                              : "Checkout shows the final price and payment terms."}
                          </label>
                          <button className="button primary" disabled={busy}>
                            Continue to subscription <ArrowRight size={15} />
                          </button>
                        </form>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            onClick={() =>
                              action(async () => {
                                const r = await api("billing/portal", "POST");
                                location.href = r.url;
                              })
                            }
                          >
                            Stripe billing portal
                          </button>
                          <button
                            className="text-link"
                            onClick={() =>
                              action(async () => {
                                notify(
                                  (await api("billing/cancel", "POST")).message,
                                );
                                await refreshUser();
                              })
                            }
                          >
                            Cancel subscription
                          </button>
                        </div>
                        <h3>Payment history</h3>
                        {invoices.length ? (
                          invoices.map((i) => (
                            <div key={i.id} className="list-row">
                              <span>
                                {new Date(i.createdAt).toLocaleDateString()}
                              </span>
                              <strong>${(i.amount / 100).toFixed(2)}</strong>
                              <small>
                                {i.provider} · {i.status}
                              </small>
                            </div>
                          ))
                        ) : (
                          <p>No payments recorded.</p>
                        )}
                      </section>
                    </>
                  ) : (
                    <section className="panel empty">
                      <h2>Your workspace awaits.</h2>
                      <Link href="/login" className="button primary">
                        Sign in
                      </Link>
                    </section>
                  )}
                </div>
              )}
              {page === "admin" &&
                (admin ? (
                  <>
                    <div className="stat-grid">
                      {[
                        ["Registered users", admin.users],
                        ["Active trials", admin.trials],
                        [
                          "Standard / Premium",
                          admin.standard + " / " + admin.premium,
                        ],
                        ["Live MRR", "$" + admin.mrr],
                      ].map(([l, v]) => (
                        <div className="stat-card" key={l}>
                          <span className="stat-label">{l}</span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>
                    <section className="panel form-panel">
                      <h2>Operations</h2>
                      <p>{admin.costs}</p>
                      <p>
                        Provider modes: {JSON.stringify(admin.providers)} ·
                        Published reports: {admin.reports}
                      </p>
                      {admin.jobs.map((j: any) => (
                        <div className="list-row" key={j.id}>
                          <span>
                            <strong>{j.kind}</strong>
                            <small>
                              Next run {new Date(j.runAt).toISOString()} ·{" "}
                              {j.attempts} retries
                            </small>
                          </span>
                          <span
                            className={
                              j.status === "healthy" ? "positive" : "muted"
                            }
                          >
                            {j.status}
                          </span>
                          <small>{j.error}</small>
                        </div>
                      ))}
                      <h2>Support requests</h2>
                      {admin.support.map((s: any) => (
                        <div className="list-row" key={s.id}>
                          <span>
                            <b>{s.user.email}</b>
                            <p>{s.message}</p>
                          </span>
                          <button
                            className="button secondary"
                            onClick={() =>
                              action(async () => {
                                await api("admin/support", "POST", {
                                  id: s.id,
                                  status:
                                    s.status === "open" ? "resolved" : "open",
                                });
                                setAdmin(await api("admin"));
                              })
                            }
                          >
                            {s.status === "open" ? "Resolve" : "Reopen"}
                          </button>
                        </div>
                      ))}
                      <h2>Audit log</h2>
                      {admin.audit.map((a: any) => (
                        <p key={a.id}>
                          {a.createdAt} · {a.action} · {a.detail}
                        </p>
                      ))}
                    </section>
                  </>
                ) : (
                  <div className="panel empty">
                    Administrator authorisation required.
                  </div>
                ))}
              <footer className="terminal-footer">
                <span>
                  <span className="status-dot" />{" "}
                  {quotes.some((a) => a.status === "demonstration")
                    ? "Synthetic demonstration observations"
                    : "Provider observations"}{" "}
                  · {new Date(q.asOf).toUTCString()}
                </span>
                <span>
                  Information. Never personalised advice.{" "}
                  <Link href="/disclosures">
                    Data & disclosures <ArrowUpRight size={11} />
                  </Link>
                </span>
              </footer>
            </main>
          </div>
        </>
      )}
      {isPublic && (
        <main className="public-main">
          {page === "home" && (
            <>
              <div className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="status-dot" /> THE GLOBAL MARKET,
                    CONNECTED.
                  </div>
                  <h1>
                    One world.
                    <br />
                    Every market.
                    <br />
                    <em>Your perspective.</em>
                  </h1>
                  <p>
                    Turn a world of market noise into a clearer picture.
                    Multi-asset intelligence, transparent research and a
                    workspace built around you.
                  </p>
                  <div className="button-row">
                    <Link className="button primary large" href="/register">
                      Start your 7-day free trial <ArrowUpRight size={18} />
                    </Link>
                    <Link className="button secondary large" href="/dashboard">
                      Explore the terminal <ArrowRight size={17} />
                    </Link>
                  </div>
                  <div className="hero-proof">
                    <span>
                      <Check size={13} /> No card required
                    </span>
                    <span>
                      <Check size={13} /> Cancel anytime
                    </span>
                    <span>
                      <Check size={13} /> From $10/month
                    </span>
                  </div>
                </div>
                <div className="hero-visual">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="globe">
                    <Globe2 strokeWidth={0.45} />
                  </div>
                  <div className="floating-label">
                    <span className="status-dot" /> A CONNECTED MARKET
                    PERSPECTIVE
                  </div>
                  <div className="floating-quote">
                    <span>
                      BITCOIN <span className="demo-tag">DEMO</span>
                    </span>
                    <strong>67,432.80</strong>
                    <Delta value={2.84} />
                    <Spark q={quotes[0]} />
                  </div>
                  <span className="coordinate">
                    26°12′ S &nbsp; 28°02′ E<br />
                    DARK SYSTEMS · GLOBAL INTELLIGENCE
                  </span>
                </div>
              </div>
              <div className="landing-ticker">
                {["BTC", "EURUSD", "SPX", "XAU", "NVDA"].map((s) => {
                  const a = quotes.find((q) => q.symbol === s) || quotes[0];
                  return (
                    <div key={s}>
                      <small>{a.name} · DEMO</small>
                      <strong>{fmt(a.price)}</strong>
                      <Delta value={a.change} />
                    </div>
                  );
                })}
              </div>
              <section className="public-section">
                <div className="eyebrow">A WIDER FIELD OF VIEW</div>
                <h2>Intelligence without the blind spots.</h2>
                <div className="feature-grid">
                  {[
                    [
                      Globe2,
                      "Every market, connected",
                      "Crypto, forex, equities, ETFs, indices and commodities in one transparent view.",
                    ],
                    [
                      Sparkles,
                      "Research with receipts",
                      "Calculated observations, source timestamps and a clear line between evidence and interpretation.",
                    ],
                    [
                      LayoutDashboard,
                      "A workspace that fits",
                      "Watchlists, alerts and Premium customisation keep your perspective in focus.",
                    ],
                  ].map(([Icon, title, description]: any) => (
                    <article className="panel feature-card" key={title}>
                      <Icon size={28} />
                      <h3>{title}</h3>
                      <p>{description}</p>
                      <Link href="/features">
                        Explore the platform <ArrowUpRight size={14} />
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
              <Pricing />
              <section className="cta-panel">
                <h2>The bigger picture starts here.</h2>
                <p>Seven days. Your choice of plan. No card required.</p>
                <Link href="/register" className="button primary">
                  Create your workspace <ArrowUpRight size={16} />
                </Link>
              </section>
            </>
          )}
          {page === "pricing" && <Pricing />}
          {page === "features" && (
            <section className="public-section">
              <div className="eyebrow">THE DARK MARKETS PLATFORM</div>
              <h1>Context for a connected world.</h1>
              <div className="feature-grid">
                {[
                  [
                    "Multi-market dashboard",
                    "Explore an asset directory, historical area charts, market movers, SMA and RSI calculations.",
                  ],
                  [
                    "Watchlists & alerts",
                    "Save assets and configure price, percentage, volume and volatility thresholds.",
                  ],
                  [
                    "Factual intelligence",
                    "Read scheduled briefings with observations, deterministic calculations and source timestamps.",
                  ],
                  [
                    "Premium workspace",
                    "Reorder dashboard widgets and compare normalised asset performance.",
                  ],
                  [
                    "Research on demand",
                    "Ask questions against supplied observations. Premium includes 20 requests per rolling 24 hours.",
                  ],
                  [
                    "Transparent by design",
                    "Demo fixtures are labelled. External feeds, news, AI and payments require configured providers.",
                  ],
                ].map(([t, d]) => (
                  <article key={t} className="panel feature-card">
                    <h2>{t}</h2>
                    <p>{d}</p>
                  </article>
                ))}
              </div>
              <Link href="/dashboard" className="button primary">
                Explore the workspace <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
          {page === "faq" && (
            <section className="public-section narrow">
              <h1>A little more clarity.</h1>
              {[
                [
                  "Is this investment advice?",
                  "No. DARK MARKETS provides market information and analysis only. It does not execute trades, manage investments or hold assets.",
                ],
                [
                  "How does the trial work?",
                  "Choose Standard or Premium, register and verify your email. Your selected plan is available for seven days. No card is required and no automatic charge is made.",
                ],
                [
                  "Are these live prices?",
                  "The unconfigured application uses clearly labelled synthetic demonstration fixtures. Licensed real-time or delayed feeds require operator configuration and commercial usage rights.",
                ],
                [
                  "What does Premium include?",
                  "Standard features plus dashboard customisation, comparisons, research history, downloadable reports and up to 20 on-demand requests per rolling 24 hours.",
                ],
                [
                  "How can I cancel?",
                  "Open Account & billing and choose Cancel subscription. Paid access remains available through the current period. Stripe customers can manage invoices and plan changes through the billing portal.",
                ],
                [
                  "What powers the reports?",
                  "The default local adapter produces factual calculated briefings. An operator can configure an OpenAI-compatible server-side provider for AI interpretation; the model never calculates the numerical indicators.",
                ],
              ].map(([q, a]) => (
                <details className="faq-item" key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </section>
          )}
          {page === "contact" && (
            <section className="public-section narrow">
              <div className="eyebrow">DARK SYSTEMS (PTY) LTD</div>
              <h1>Let’s find the answer.</h1>
              <p>
                Signed-in users can submit a support request below. Requests are
                stored in the protected administration queue.
              </p>
              <form
                className="panel form-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  action(async () => {
                    notify(
                      (
                        await api("support", "POST", {
                          message: data.get("message"),
                        })
                      ).message,
                    );
                    form.reset();
                  });
                }}
              >
                <label>
                  Your message
                  <textarea
                    name="message"
                    minLength={10}
                    maxLength={4000}
                    required
                    placeholder="Tell us how we can help…"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Submit support request <ArrowRight size={15} />
                </button>
                {!user && (
                  <Link href="/login">Sign in to submit a request</Link>
                )}
              </form>
            </section>
          )}
          {["privacy", "terms", "disclosures"].includes(page) && (
            <Legal page={page} />
          )}
          {authPage && (
            <section className="auth-layout">
              <div className="auth-art">
                <div className="eyebrow">
                  DARK MARKETS / INTELLIGENCE, CONNECTED.
                </div>
                <h1>
                  Your world.
                  <br />
                  In perspective.
                </h1>
                <Globe2 size={210} strokeWidth={0.5} />
                <p>One World. Every Market. Intelligent Information.</p>
                <small>Powered by DARK SYSTEMS.</small>
              </div>
              <div className="auth-form panel">
                <span className="eyebrow">YOUR WORKSPACE STARTS HERE</span>
                <h1>
                  {page === "register"
                    ? "Find your edge."
                    : page === "login"
                      ? "Welcome back."
                      : page === "verify"
                        ? "Verify your email."
                        : page === "forgot-password"
                          ? "Reset your access."
                          : "A fresh start."}
                </h1>
                <p>
                  {page === "register"
                    ? "Seven days of market intelligence. No card required."
                    : page === "verify"
                      ? "Confirm your email to activate your seven-day trial."
                      : "A clearer market perspective is a sign-in away."}
                </p>
                {page === "register" || page === "login" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      action(async () => {
                        const result = await api(
                          "auth/" +
                            (page === "register" ? "register" : "login"),
                          "POST",
                          {
                            name: data.get("name"),
                            email: data.get("email"),
                            password: data.get("password"),
                            plan,
                          },
                        );
                        notify(result.message || "Signed in");
                        location.href = "/dashboard";
                      });
                    }}
                  >
                    {page === "register" && (
                      <>
                        <label>
                          Your name
                          <input
                            name="name"
                            autoComplete="name"
                            minLength={2}
                            maxLength={80}
                            required
                            placeholder="Alex Morgan"
                          />
                        </label>
                        <div className="plan-selector">
                          {["STANDARD", "PREMIUM"].map((p) => (
                            <button
                              className={plan === p ? "selected" : ""}
                              type="button"
                              key={p}
                              onClick={() => setPlan(p)}
                            >
                              <span>{p}</span>
                              <strong>
                                ${p === "STANDARD" ? 10 : 19}
                                <small>/mo after trial</small>
                              </strong>
                              <small>7 days free</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                      />
                    </label>
                    <label>
                      Password
                      <input
                        name="password"
                        type="password"
                        autoComplete={
                          page === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        minLength={12}
                        maxLength={128}
                        placeholder="At least 12 characters"
                      />
                    </label>
                    {page === "register" && (
                      <label className="checkbox">
                        <input type="checkbox" required />
                        <span>
                          I accept the <Link href="/terms">Terms</Link> and{" "}
                          <Link href="/privacy">Privacy Policy</Link>.
                        </span>
                      </label>
                    )}
                    <button className="button primary full" disabled={busy}>
                      {busy
                        ? "Working…"
                        : page === "register"
                          ? "Create free trial"
                          : "Sign in"}
                      <ArrowRight size={16} />
                    </button>
                    <p className="auth-switch">
                      {page === "register" ? (
                        <>
                          Already have an account?{" "}
                          <Link href="/login">Sign in</Link>
                        </>
                      ) : (
                        <>
                          New to DARK MARKETS?{" "}
                          <Link href="/register">Start free trial</Link>
                        </>
                      )}
                    </p>
                    {page === "login" && (
                      <Link href="/forgot-password" className="text-link">
                        Forgot password?
                      </Link>
                    )}
                  </form>
                ) : page === "verify" ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        const token = new URLSearchParams(location.search).get(
                          "token",
                        );
                        notify(
                          (await api("auth/verify", "POST", { token })).message,
                        );
                        await refreshUser();
                        location.href = "/dashboard";
                      })
                    }
                  >
                    Confirm email <Check size={16} />
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      action(async () => {
                        const result = await api(
                          page === "forgot-password"
                            ? "auth/forgot"
                            : "auth/reset",
                          "POST",
                          page === "forgot-password"
                            ? { email: f.get("email") }
                            : {
                                token: new URLSearchParams(location.search).get(
                                  "token",
                                ),
                                password: f.get("password"),
                              },
                        );
                        notify(result.message);
                      });
                    }}
                  >
                    <label>
                      {page === "forgot-password"
                        ? "Email address"
                        : "New password"}
                      <input
                        name={page === "forgot-password" ? "email" : "password"}
                        type={page === "forgot-password" ? "email" : "password"}
                        required
                        minLength={page === "reset-password" ? 12 : undefined}
                      />
                    </label>
                    <button className="button primary" disabled={busy}>
                      Continue <ArrowRight size={15} />
                    </button>
                    <Link href="/login" className="text-link">
                      Back to sign in
                    </Link>
                  </form>
                )}
              </div>
            </section>
          )}
        </main>
      )}
      {isPublic && (
        <footer className="public-footer">
          <Brand />
          <p>
            Market information and analysis only.
            <br />© {new Date().getFullYear()} DARK SYSTEMS (PTY) LTD.
          </p>
          <nav>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/disclosures">Data & disclosures</Link>
            <Link href="/contact">Support</Link>
          </nav>
        </footer>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="error-toast">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            className={
              "modal panel " + (modal === "chart" ? "chart-modal" : "")
            }
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            {modal === "chart" ? (
              <Chart />
            ) : modal === "alert" ? (
              <>
                <div className="eyebrow">STAY INFORMED</div>
                <h2>Create an alert</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    action(async () => {
                      await api("alerts", "POST", {
                        symbol: f.get("symbol"),
                        kind: f.get("kind"),
                        eventId: f.get("eventId"),
                        threshold: Number(f.get("threshold")),
                        email: f.get("email") === "on",
                      });
                      setAlerts(await api("alerts"));
                      setModal("");
                      notify(
                        "Alert created. The worker evaluates rules every minute.",
                      );
                    });
                  }}
                >
                  <label>
                    Asset
                    <select name="symbol" defaultValue={selected}>
                      {quotes.map((a) => (
                        <option key={a.symbol}>{a.symbol}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Condition
                    <select name="kind">
                      <option value="price_above">Price at or above</option>
                      <option value="price_below">Price at or below</option>
                      <option value="change">
                        Absolute percentage change at least
                      </option>
                      <option value="volume">Volume ratio at least</option>
                      <option value="volatility">Volatility at least</option>
                      <option value="asset_news">
                        Story related to this asset
                      </option>
                      <option value="economic_event">
                        Economic event within threshold hours
                      </option>
                    </select>
                  </label>
                  <label>
                    Economic event (for event rules)
                    <select name="eventId">
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Threshold (hours for events; 1 for news)
                    <input
                      name="threshold"
                      type="number"
                      step="any"
                      min="0.00001"
                      required
                    />
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="email" /> Also send an email
                  </label>
                  <button className="button primary" disabled={busy}>
                    Save alert <Plus size={15} />
                  </button>
                  <small>
                    Demo rules use synthetic observations. SMTP is required for
                    email delivery.
                  </small>
                </form>
              </>
            ) : modal === "notifications" ? (
              <>
                <h2>Notifications</h2>
                {notifications.map((n) => (
                  <div className="list-row" key={n.id}>
                    <span>
                      {n.title}
                      <small>{new Date(n.createdAt).toLocaleString()}</small>
                    </span>
                  </div>
                ))}
                {!notifications.length && <p>You’re all caught up.</p>}
                <button
                  className="button secondary"
                  onClick={() =>
                    action(async () => {
                      await api("notifications", "POST");
                      setNotifications(
                        notifications.map((n) => ({ ...n, read: true })),
                      );
                      notify("Notifications marked read");
                    })
                  }
                >
                  Mark all read
                </button>
              </>
            ) : modal === "customize" ? (
              <>
                <div className="eyebrow">PREMIUM WORKSPACE</div>
                <h2>Make room for your perspective.</h2>
                <p>
                  Drag widgets on the dashboard to reorder them. Choose which
                  sections appear below.
                </p>
                {["chart", "markets", "news", "calendar", "reports"].map(
                  (w) => (
                    <label className="list-row" key={w}>
                      <GripVertical size={17} />
                      <span>{w[0].toUpperCase() + w.slice(1)}</span>
                      <button
                        type="button"
                        aria-label={"Move " + w + " up"}
                        onClick={(e) => {
                          e.preventDefault();
                          const i = widgets.indexOf(w);
                          if (i > 0) {
                            const next = [...widgets];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            saveWidgets(next);
                          }
                        }}
                      >
                        ↑
                      </button>
                      <input
                        type="checkbox"
                        checked={widgets.includes(w)}
                        onChange={() => {
                          if (!user?.premium) {
                            setError("An active Premium plan is required");
                            return;
                          }
                          const next = widgets.includes(w)
                            ? widgets.filter((x) => x !== w)
                            : [...widgets, w];
                          if (!next.length) return;
                          saveWidgets(next);
                        }}
                      />
                    </label>
                  ),
                )}
                <label>
                  Default market filter
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Default news filter
                  <select
                    value={newsCategory}
                    onChange={(e) => setNewsCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  onClick={() => saveWidgets(widgets)}
                >
                  Save workspace
                </button>
              </>
            ) : modal === "delete" ? (
              <>
                <h2>Delete your account?</h2>
                <p>
                  Your saved data will be permanently removed. An active Stripe
                  subscription will be canceled.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    action(async () => {
                      await api("account", "DELETE", {
                        password: f.get("password"),
                      });
                      location.href = "/";
                    });
                  }}
                >
                  <label>
                    Confirm your password
                    <input name="password" type="password" required />
                  </label>
                  <button className="button danger" disabled={busy}>
                    Permanently delete account
                  </button>
                </form>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
  function Pricing() {
    return (
      <section className="public-section pricing-section">
        <div className="eyebrow">A CLEAR CHOICE</div>
        <h2>Big picture. Straightforward pricing.</h2>
        <p>Two plans. Seven days free. No credit card required.</p>
        <div className="pricing-grid">
          {[
            [
              "STANDARD",
              10,
              [
                "Global multi-market dashboard",
                "Available live or delayed feeds¹",
                "Financial news & economic calendar¹",
                "Standard indicators & daily briefings",
                "Watchlists & standard alerts",
                "Historical market information",
              ],
            ],
            [
              "PREMIUM",
              19,
              [
                "Everything in Standard",
                "Custom dashboard & draggable widgets",
                "Custom market & news filters",
                "Advanced asset comparisons & indicators",
                "20 on-demand research requests / 24h",
                "Downloadable reports & research history",
              ],
            ],
          ].map(([name, price, features]: any) => (
            <article
              key={name}
              className={
                "panel pricing-card " + (name === "PREMIUM" ? "featured" : "")
              }
            >
              <div className="eyebrow">
                {name}
                {name === "PREMIUM" && (
                  <span className="tiny-badge">THE COMPLETE PERSPECTIVE</span>
                )}
              </div>
              <div className="price">
                ${price}
                <span>/ month</span>
              </div>
              <p>Start with a seven-day free trial.</p>
              <Link
                className={
                  "button full " +
                  (name === "PREMIUM" ? "primary" : "secondary")
                }
                href={"/register?plan=" + name}
              >
                Start {name === "STANDARD" ? "Standard" : "Premium"} trial{" "}
                <ArrowUpRight size={16} />
              </Link>
              <ul>
                {features.map((f: string) => (
                  <li key={f}>
                    <Check size={15} />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <small>
          ¹ Feed and news availability depends on configured, authorised
          providers. The local build uses labelled demonstration fixtures. No
          auto-charge after trial.
        </small>
      </section>
    );
  }
}
function Legal({ page }: { page: string }) {
  const content =
    page === "privacy"
      ? [
          [
            "Privacy Policy — development draft",
            "DARK SYSTEMS (PTY) LTD operates DARK MARKETS. This policy is a draft for the local development build and requires business and legal review before commercial launch.",
          ],
          [
            "Information stored",
            "We store account email, name, a password hash, subscription status, watchlists, alerts, dashboard preferences, research requests, support messages and operational audit records. Session and reset tokens are hashed.",
          ],
          [
            "How information is used",
            "Data supports account access, billing, requested research and notifications. Research providers receive the question and supplied market observations, not account details. Payment details are handled by Stripe when configured.",
          ],
          [
            "Your controls",
            "Export account data and request account deletion from Account & billing. Account-linked data is deleted with the account. Operational audit and payment-provider records may remain where legally required.",
          ],
          [
            "Retention, processors and contact",
            "A production retention schedule, processor list, jurisdiction-specific rights and verified business contact must be completed before launch. Contact the operator through the authenticated support form.",
          ],
        ]
      : page === "terms"
        ? [
            [
              "Terms of Service — development draft",
              "These draft terms apply to the local DARK MARKETS build, owned by DARK SYSTEMS (PTY) LTD. Complete legal review, business particulars and governing-law details before launch.",
            ],
            [
              "Information only",
              "The platform provides general market information and analysis. It does not provide personalised financial advice, trading, custody or investment management. Data may be delayed, inaccurate or unavailable.",
            ],
            [
              "Plans and trials",
              "Standard is $10 per month; Premium is $19 per month. Both offer a seven-day no-card trial after email verification. A subscription requires explicit payment authorisation. Premium on-demand research is limited to 20 requests per rolling 24 hours.",
            ],
            [
              "Cancellation and acceptable use",
              "Cancel through account settings. Paid access continues through the paid period. Do not bypass access controls, abuse provider services or redistribute data beyond the source licence.",
            ],
            [
              "Service limitations",
              "Demonstration data does not describe current markets. AI interpretation can be wrong. No return or outcome is guaranteed. Refund policy, tax handling, consumer rights and dispute procedures require final business and legal configuration.",
            ],
          ]
        : [
            [
              "Market data & disclosures",
              "This build uses synthetic fixture observations dated 30 October 2026 at 20:00 UTC. Prices, volumes, educational stories and calendar events are not current financial information.",
            ],
            [
              "Attribution and licensing",
              "Synthetic fixtures are generated within DARK MARKETS. No external financial news is redistributed. Real-time and delayed feeds may only be activated with valid credentials and appropriate commercial redistribution rights. CFDs are unavailable until an authorised provider is configured.",
            ],
            [
              "Calculations and reporting",
              "Percentage changes use (current − previous) / previous × 100. SMA 14 is the arithmetic mean of 14 observations. RSI 14 uses simple mean gains and losses over 14 changes; it is not Wilder-smoothed RSI. Volatility and volume ratios in demo mode are synthetic fixtures. Reports separate facts, calculations and interpretation.",
            ],
            [
              "AI limitations",
              "The default deterministic reporting adapter does not use a language model. A configured AI provider may produce an interpretation from supplied observations. Interpretations do not prove causation and are not personalised recommendations.",
            ],
            [
              "Brand and commercial readiness",
              "The theme is provisional. DARK OS source assets were not available and exact visual parity is not claimed. This build requires provider configuration, legal review, operational monitoring and security review before a commercial launch.",
            ],
          ];
  return (
    <section className="public-section narrow legal">
      {content.map(([h, p], i) => (
        <section key={h}>
          {i === 0 ? <h1>{h}</h1> : <h2>{h}</h2>}
          <p>{p}</p>
        </section>
      ))}
    </section>
  );
}
