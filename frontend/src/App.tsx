import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./App.css";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
};
const api = import.meta.env.VITE_API_BASE_URL ?? "/api";
const meta: Record<TaskStatus, { label: string; className: string }> = {
  TODO: { label: "待开始", className: "todo" },
  IN_PROGRESS: { label: "进行中", className: "progress" },
  DONE: { label: "已完成", className: "done" },
};

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = useMemo(
    () => tasks.filter((task) => task.status === "DONE").length,
    [tasks],
  );
  async function load() {
    try {
      setError(null);
      const r = await fetch(`${api}/tasks`);
      if (!r.ok) throw new Error("无法加载任务");
      setTasks(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${api}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      });
      if (!r.ok) throw new Error("创建任务失败");
      const created: Task = await r.json();
      setTasks((v) => [created, ...v]);
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }
  async function move(task: Task) {
    const next: TaskStatus =
      task.status === "TODO"
        ? "IN_PROGRESS"
        : task.status === "IN_PROGRESS"
          ? "DONE"
          : "TODO";
    try {
      const r = await fetch(`${api}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error("更新失败");
      const updated = await r.json();
      setTasks((v) => v.map((x) => (x.id === task.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
  }
  async function remove(id: number) {
    try {
      const r = await fetch(`${api}/tasks/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("删除失败");
      setTasks((v) => v.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }
  return (
    <main className="shell">
      <header className="masthead">
        <a className="brand" href="/">
          TALLY<span>•</span>
        </a>
        <p>一个克制而清晰的工作台</p>
        <div className="today">
          {new Intl.DateTimeFormat("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "short",
          }).format(new Date())}
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">YOUR WORK / IN VIEW</p>
          <h1>
            让重要的事，<em>浮上来。</em>
          </h1>
        </div>
        <div className="progress-note">
          <strong>{completed}</strong>
          <span>/{tasks.length} 已完成</span>
        </div>
      </section>
      <section className="composer">
        <form onSubmit={add}>
          <label htmlFor="title">新增一件事</label>
          <div className="input-row">
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：完成本周项目回顾"
              maxLength={120}
            />
            <button disabled={submitting}>
              {submitting ? "添加中" : "加入清单"} <span>↗</span>
            </button>
          </div>
          <input
            className="detail-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="补充一点上下文（可选）"
            maxLength={1000}
          />
        </form>
      </section>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <section className="task-section">
        <div className="section-head">
          <h2>任务清单</h2>
          <span>{tasks.length} ITEMS</span>
        </div>
        {loading ? (
          <div className="empty">正在整理你的清单…</div>
        ) : tasks.length === 0 ? (
          <div className="empty">还没有任务。先写下第一件要紧事。</div>
        ) : (
          <ul className="task-list">
            {tasks.map((task, i) => {
              const m = meta[task.status];
              return (
                <li
                  className={`task ${task.status === "DONE" ? "is-done" : ""}`}
                  key={task.id}
                  style={{ "--delay": `${i * 55}ms` } as CSSProperties}
                >
                  <button
                    className="status-button"
                    onClick={() => void move(task)}
                    aria-label="切换任务状态"
                  >
                    <span className={m.className} />
                  </button>
                  <div className="task-copy">
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                  </div>
                  <span className={`tag ${m.className}`}>{m.label}</span>
                  <button
                    className="delete-button"
                    onClick={() => void remove(task.id)}
                    aria-label="删除任务"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <footer>点击圆点切换状态 · 任务自动保存</footer>
    </main>
  );
}
export default App;
