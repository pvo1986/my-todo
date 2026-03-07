import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

// ─── SUPABASE: ЗАГРУЗКА ДАННЫХ ────────────────────────────────────────────────
async function loadData() {
  const [{ data: lists }, { data: tasks }, { data: completions }] = await Promise.all([
    supabase.from("lists").select("*").order("created_at"),
    supabase.from("tasks").select("*").order("created_at"),
    supabase.from("completions").select("*"),
  ]);

  const compMap = {};
  for (const c of completions || []) {
    compMap[`${c.task_id}_${c.completed_date}`] = c.created_at;
  }

  return {
    lists: (lists || []).map((l) => ({ id: l.id, name: l.name, color: l.color })),
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      listId: t.list_id,
      title: t.title,
      note: t.note,
      startDate: t.start_date,
      recurrence: t.recurrence,
      rollover: t.rollover,
    })),
    completions: compMap,
  };
}

// ─── SUPABASE: СОХРАНЕНИЕ ─────────────────────────────────────────────────────
async function saveTaskToDB(task) {
  await supabase.from("tasks").upsert({
    id: task.id,
    list_id: task.listId,
    title: task.title,
    note: task.note || null,
    start_date: task.startDate || null,
    recurrence: task.recurrence,
    rollover: task.rollover || false,
  });
}

async function deleteTaskFromDB(id) {
  await supabase.from("tasks").delete().eq("id", id);
}

async function saveListToDB(list) {
  await supabase.from("lists").upsert({ id: list.id, name: list.name, color: list.color });
}

async function deleteListFromDB(id) {
  await supabase.from("lists").delete().eq("id", id);
}

async function toggleCompletionInDB(taskId, dateStr, isCurrentlyDone) {
  if (isCurrentlyDone) {
    await supabase.from("completions").delete()
      .eq("task_id", taskId)
      .eq("completed_date", dateStr);
  } else {
    await supabase.from("completions").upsert({
      task_id: taskId,
      completed_date: dateStr,
    });
  }
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ──────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function getDayOfWeek(dateStr) {
  return new Date(dateStr + "T12:00:00").getDay();
}

function getDatesInMonth(year, month) {
  const dates = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function taskAppearsOnDate(task, dateStr) {
  if (!task.startDate) return false;
  if (dateStr < task.startDate) return false;
  const { recurrence } = task;
  if (!recurrence || recurrence.type === "once") {
    if (task.rollover) return true;
    return dateStr === task.startDate;
  }
  if (recurrence.type === "daily") return true;
  if (recurrence.type === "weekly") {
    const dow = getDayOfWeek(dateStr);
    return recurrence.days && recurrence.days.includes(dow);
  }
  if (recurrence.type === "every_n_days") {
    const start = new Date(task.startDate + "T12:00:00");
    const cur = new Date(dateStr + "T12:00:00");
    const diff = Math.round((cur - start) / 86400000);
    return diff >= 0 && diff % recurrence.n === 0;
  }
  return false;
}

function isCompletedOn(task, dateStr, completions) {
  return !!completions[`${task.id}_${dateStr}`];
}

// ─── ИКОНКИ ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    check: <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    sun: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    chevronLeft: <polyline points="15 18 9 12 15 6" />,
    chevronRight: <polyline points="9 18 15 12 9 6" />,
    repeat: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></>,
    folder: <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {icons[name]}
    </svg>
  );
};

// ─── МОДАЛКА: ЗАДАЧА ──────────────────────────────────────────────────────────
function TaskModal({ task, lists, onSave, onDelete, onClose }) {
  const isNew = !task;
  const [form, setForm] = useState(
    task || {
      id: crypto.randomUUID(),
      title: "",
      listId: lists[0]?.id || "",
      startDate: today(),
      recurrence: { type: "once" },
      rollover: false,
      note: "",
    }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRec = (k, v) => setForm((f) => ({ ...f, recurrence: { ...f.recurrence, [k]: v } }));
  const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  function toggleDay(d) {
    const days = form.recurrence.days || [];
    setRec("days", days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? "Новая задача" : "Редактировать"}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="form-group">
          <label>Название</label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Что нужно сделать?"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Список</label>
            <select value={form.listId} onChange={(e) => set("listId", e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Дата начала</label>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Повторение</label>
          <div className="recurrence-tabs">
            {[
              { v: "once", label: "Однократно" },
              { v: "daily", label: "Каждый день" },
              { v: "weekly", label: "По дням недели" },
              { v: "every_n_days", label: "Каждые N дней" },
            ].map((r) => (
              <button
                key={r.v}
                className={`rec-tab ${form.recurrence.type === r.v ? "active" : ""}`}
                onClick={() => setRec("type", r.v)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {form.recurrence.type === "weekly" && (
            <div className="dow-picker">
              {DOW.map((d, i) => (
                <button
                  key={i}
                  className={`dow-btn ${(form.recurrence.days || []).includes(i) ? "active" : ""}`}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {form.recurrence.type === "every_n_days" && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group">
                <label>Каждые сколько дней</label>
                <input
                  type="number"
                  min="2"
                  max="365"
                  value={form.recurrence.n || 2}
                  onChange={(e) => setRec("n", parseInt(e.target.value) || 2)}
                />
              </div>
            </div>
          )}

          {form.recurrence.type === "once" && (
            <label className="checkbox-label" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={!!form.rollover}
                onChange={(e) => set("rollover", e.target.checked)}
              />
              <span>Показывать каждый день, пока не выполнено</span>
            </label>
          )}
        </div>

        <div className="form-group">
          <label>Заметка</label>
          <textarea
            value={form.note || ""}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Дополнительные детали..."
            rows={2}
          />
        </div>

        <div className="modal-actions">
          {!isNew && (
            <button className="btn btn-danger" onClick={() => onDelete(task.id)}>
              <Icon name="trash" size={15} /> Удалить
            </button>
          )}
          <button className="btn btn-primary" onClick={() => form.title.trim() && onSave(form)}>
            <Icon name="check" size={15} /> {isNew ? "Создать" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── МОДАЛКА: СПИСОК ──────────────────────────────────────────────────────────
function ListModal({ list, onSave, onDelete, onClose }) {
  const COLORS = ["#e85d4a", "#f5a623", "#7ed321", "#3b82f6", "#9b59b6", "#1abc9c", "#e91e8c", "#607d8b"];
  const isNew = !list;
  const [name, setName] = useState(list?.name || "");
  const [color, setColor] = useState(list?.color || COLORS[0]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? "Новый список" : "Редактировать список"}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="form-group">
          <label>Название</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Семья" />
        </div>
        <div className="form-group">
          <label>Цвет</label>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot ${color === c ? "selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          {!isNew && (
            <button className="btn btn-danger" onClick={() => onDelete(list.id)}>
              <Icon name="trash" size={15} /> Удалить
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => name.trim() && onSave({ ...list, id: list?.id || crypto.randomUUID(), name, color })}
          >
            <Icon name="check" size={15} /> {isNew ? "Создать" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ЭЛЕМЕНТ ЗАДАЧИ ───────────────────────────────────────────────────────────
function TaskItem({ task, done, accentColor, onToggle, onEdit, dateLabel }) {
  const rec = task.recurrence;
  let recLabel = "";
  if (rec?.type === "daily") recLabel = "каждый день";
  else if (rec?.type === "weekly") {
    const DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    recLabel = (rec.days || []).map((d) => DOW[d]).join(", ");
  } else if (rec?.type === "every_n_days") recLabel = `каждые ${rec.n} дн.`;
  else if (task.rollover) recLabel = "до выполнения";

  return (
    <div className={`task-item ${done ? "done" : ""}`} style={{ "--accent": accentColor }}>
      <button className={`check-btn ${done ? "checked" : ""}`} onClick={onToggle}>
        {done && <Icon name="check" size={12} />}
      </button>
      <div className="task-body">
        <span className="task-title">{task.title}</span>
        <div className="task-meta">
          {dateLabel && <span className="meta-tag">{dateLabel}</span>}
          {recLabel && (
            <span className="meta-tag">
              <Icon name="repeat" size={10} />{recLabel}
            </span>
          )}
          {task.note && <span className="meta-note">{task.note}</span>}
        </div>
      </div>
      <button className="icon-btn task-edit" onClick={onEdit}><Icon name="edit" size={14} /></button>
    </div>
  );
}

// ─── ВКЛАДКА: СЕГОДНЯ ────────────────────────────────────────────────────────
function TodayView({ data, setData }) {
  const { lists, tasks, completions } = data;
  const [editingTask, setEditingTask] = useState(null);
  const todayStr = today();

  const todayTasks = tasks.filter((t) => taskAppearsOnDate(t, todayStr));
  const pending = todayTasks.filter((t) => !isCompletedOn(t, todayStr, completions));
  const done = todayTasks.filter((t) => isCompletedOn(t, todayStr, completions));

  function toggleTask(task) {
    const isDone = isCompletedOn(task, todayStr, completions);
    const key = `${task.id}_${todayStr}`;
    const newComp = { ...completions };
    if (isDone) delete newComp[key];
    else newComp[key] = new Date().toISOString();
    setData({ ...data, completions: newComp });
    toggleCompletionInDB(task.id, todayStr, isDone);
  }

  function saveTask(form) {
    const exists = tasks.find((t) => t.id === form.id);
    const newTasks = exists ? tasks.map((t) => (t.id === form.id ? form : t)) : [...tasks, form];
    setData({ ...data, tasks: newTasks });
    saveTaskToDB(form);
    setEditingTask(null);
  }

  function deleteTask(id) {
    setData({ ...data, tasks: tasks.filter((t) => t.id !== id) });
    deleteTaskFromDB(id);
    setEditingTask(null);
  }

  const getList = (id) => lists.find((l) => l.id === id);
  const d = new Date(todayStr + "T12:00:00");
  const dayNames = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const monthNames = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  return (
    <div className="view today-view">
      <div className="today-header">
        <div className="today-date">
          <span className="today-day-num">{d.getDate()}</span>
          <div className="today-date-text">
            <span className="today-month">{monthNames[d.getMonth()]} {d.getFullYear()}</span>
            <span className="today-weekday">{dayNames[d.getDay()]}</span>
          </div>
        </div>
        <div className="today-progress">
          <div className="progress-text">{done.length} / {todayTasks.length}</div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: todayTasks.length ? `${(done.length / todayTasks.length) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      <div className="tasks-list">
        {pending.map((t) => {
          const list = getList(t.listId);
          return (
            <TaskItem
              key={t.id}
              task={t}
              done={false}
              accentColor={list?.color || "#3b82f6"}
              onToggle={() => toggleTask(t)}
              onEdit={() => setEditingTask(t)}
              dateLabel={list?.name}
            />
          );
        })}

        {done.length > 0 && (
          <>
            <div className="section-divider">Выполнено</div>
            {done.map((t) => {
              const list = getList(t.listId);
              return (
                <TaskItem
                  key={t.id}
                  task={t}
                  done={true}
                  accentColor={list?.color || "#3b82f6"}
                  onToggle={() => toggleTask(t)}
                  onEdit={() => setEditingTask(t)}
                  dateLabel={list?.name}
                />
              );
            })}
          </>
        )}

        {todayTasks.length === 0 && (
          <div className="empty-state">
            <Icon name="sun" size={40} />
            <p>На сегодня задач нет</p>
          </div>
        )}
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          lists={lists}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ─── ВКЛАДКА: СПИСКИ ─────────────────────────────────────────────────────────
function ListsView({ data, setData }) {
  const { lists, tasks, completions } = data;
  const [activeList, setActiveList] = useState(lists[0]?.id || null);
  const [editingTask, setEditingTask] = useState(null);
  const [newTask, setNewTask] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [newList, setNewList] = useState(false);

  const curList = lists.find((l) => l.id === activeList);
  const todayStr = today();

  const listTasks = tasks
    .filter((t) => t.listId === activeList)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  function toggleTask(task) {
    const isDone = isCompletedOn(task, todayStr, completions);
    const key = `${task.id}_${todayStr}`;
    const newComp = { ...completions };
    if (isDone) delete newComp[key];
    else newComp[key] = new Date().toISOString();
    setData({ ...data, completions: newComp });
    toggleCompletionInDB(task.id, todayStr, isDone);
  }

  function saveTask(form) {
    const exists = tasks.find((t) => t.id === form.id);
    const newTasks = exists ? tasks.map((t) => (t.id === form.id ? form : t)) : [...tasks, form];
    setData({ ...data, tasks: newTasks });
    saveTaskToDB(form);
    setEditingTask(null);
    setNewTask(false);
  }

  function deleteTask(id) {
    setData({ ...data, tasks: tasks.filter((t) => t.id !== id) });
    deleteTaskFromDB(id);
    setEditingTask(null);
  }

  function saveList(form) {
    const exists = lists.find((l) => l.id === form.id);
    const newLists = exists ? lists.map((l) => (l.id === form.id ? form : l)) : [...lists, form];
    setData({ ...data, lists: newLists });
    saveListToDB(form);
    if (!exists) setActiveList(form.id);
    setEditingList(null);
    setNewList(false);
  }

  function deleteList(id) {
    const newLists = lists.filter((l) => l.id !== id);
    const newTasks = tasks.filter((t) => t.listId !== id);
    setData({ ...data, lists: newLists, tasks: newTasks });
    deleteListFromDB(id);
    setEditingList(null);
    setActiveList(newLists[0]?.id || null);
  }

  const doneTasks = listTasks.filter((t) => isCompletedOn(t, todayStr, completions));
  const pendingTasks = listTasks.filter((t) => !isCompletedOn(t, todayStr, completions));

  return (
    <div className="view">
      <div className="lists-sidebar">
        {lists.map((l) => (
          <button
            key={l.id}
            className={`list-tab ${activeList === l.id ? "active" : ""}`}
            style={{ "--accent": l.color }}
            onClick={() => setActiveList(l.id)}
            onDoubleClick={() => setEditingList(l)}
          >
            <span className="list-dot" style={{ background: l.color }} />
            <span>{l.name}</span>
            <span className="list-count">{tasks.filter((t) => t.listId === l.id).length}</span>
          </button>
        ))}
        <button className="list-tab add-list" onClick={() => setNewList(true)}>
          <Icon name="plus" size={14} /> Новый список
        </button>
      </div>

      <div className="list-content">
        {curList ? (
          <>
            <div className="list-header">
              <h2 style={{ color: curList.color }}>{curList.name}</h2>
              <div className="header-actions">
                <button className="icon-btn" onClick={() => setEditingList(curList)}>
                  <Icon name="edit" size={16} />
                </button>
                <button className="btn btn-primary small" onClick={() => setNewTask(true)}>
                  <Icon name="plus" size={14} /> Задача
                </button>
              </div>
            </div>

            <div className="tasks-list">
              {pendingTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  done={false}
                  accentColor={curList.color}
                  onToggle={() => toggleTask(t)}
                  onEdit={() => setEditingTask(t)}
                />
              ))}
              {doneTasks.length > 0 && (
                <>
                  <div className="section-divider">Выполнено сегодня</div>
                  {doneTasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      done={true}
                      accentColor={curList.color}
                      onToggle={() => toggleTask(t)}
                      onEdit={() => setEditingTask(t)}
                    />
                  ))}
                </>
              )}
              {listTasks.length === 0 && (
                <div className="empty-state">
                  <Icon name="list" size={32} />
                  <p>Нет задач</p>
                  <button className="btn btn-primary" onClick={() => setNewTask(true)}>Добавить первую</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state full">
            <Icon name="folder" size={48} />
            <p>Создайте первый список</p>
            <button className="btn btn-primary" onClick={() => setNewList(true)}>Создать список</button>
          </div>
        )}
      </div>

      {(editingTask || newTask) && (
        <TaskModal
          task={editingTask}
          lists={lists}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => { setEditingTask(null); setNewTask(false); }}
        />
      )}
      {(editingList || newList) && (
        <ListModal
          list={editingList}
          onSave={saveList}
          onDelete={deleteList}
          onClose={() => { setEditingList(null); setNewList(false); }}
        />
      )}
    </div>
  );
}

// ─── ВКЛАДКА: КАЛЕНДАРЬ ──────────────────────────────────────────────────────
function CalendarView({ data }) {
  const { lists, tasks, completions } = data;
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(today());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const dates = getDatesInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  function getDayStatus(dateStr) {
    const dayTasks = tasks.filter((t) => taskAppearsOnDate(t, dateStr));
    if (dayTasks.length === 0) return "empty";
    const doneTasks = dayTasks.filter((t) => isCompletedOn(t, dateStr, completions));
    if (doneTasks.length === 0) return "none";
    if (doneTasks.length === dayTasks.length) return "all";
    return "partial";
  }

  const selectedTasks = tasks.filter((t) => taskAppearsOnDate(t, selectedDay));
  const getList = (id) => lists.find((l) => l.id === id);

  return (
    <div className="view calendar-view">
      <div className="cal-container">
        <div className="cal-panel">
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              <Icon name="chevronLeft" />
            </button>
            <h2>{monthNames[month]} {year}</h2>
            <button className="icon-btn" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              <Icon name="chevronRight" />
            </button>
          </div>

          <div className="cal-grid">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <div key={d} className="cal-dow">{d}</div>
            ))}
            {Array(offset).fill(null).map((_, i) => <div key={`e${i}`} />)}
            {dates.map((dateStr) => {
              const status = getDayStatus(dateStr);
              const isToday = dateStr === today();
              const isSelected = dateStr === selectedDay;
              return (
                <button
                  key={dateStr}
                  className={`cal-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDay(dateStr)}
                >
                  <span className="cal-day-num">{parseInt(dateStr.slice(8))}</span>
                  {status !== "empty" && <div className={`cal-dot ${status}`} />}
                </button>
              );
            })}
          </div>

          <div className="cal-legend">
            <span><span className="cal-dot all" /> Все выполнено</span>
            <span><span className="cal-dot partial" /> Частично</span>
            <span><span className="cal-dot none" /> Не выполнено</span>
          </div>
        </div>

        <div className="cal-detail">
          <h3>{formatDate(selectedDay)}</h3>
          {selectedTasks.length === 0 ? (
            <div className="empty-state small"><p>Задач нет</p></div>
          ) : (
            <div className="tasks-list">
              {selectedTasks.map((t) => {
                const list = getList(t.listId);
                const done = isCompletedOn(t, selectedDay, completions);
                return (
                  <div
                    key={t.id}
                    className={`task-item static ${done ? "done" : ""}`}
                    style={{ "--accent": list?.color || "#3b82f6" }}
                  >
                    <div className={`check-btn ${done ? "checked" : ""}`}>
                      {done && <Icon name="check" size={12} />}
                    </div>
                    <div className="task-body">
                      <span className="task-title">{t.title}</span>
                      {list && (
                        <span className="meta-tag" style={{ background: list.color + "22", color: list.color }}>
                          {list.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("today");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading || !data) {
    return (
      <div className="app loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #f5f6f8;
          --surface: #ffffff;
          --surface2: #f0f1f4;
          --surface3: #e8eaee;
          --border: #e2e4ea;
          --text: #1a1d26;
          --text2: #5a5f7a;
          --text3: #a0a5be;
          --accent: #3b82f6;
          --green: #16a34a;
          --red: #dc2626;
          --radius: 12px;
          --radius-sm: 8px;
          font-family: 'Manrope', sans-serif;
        }

        html, body, #root { height: 100%; background: var(--bg); color: var(--text); }

        .app {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          max-width: 100%;
          margin: 0 auto;
        }

        .app.loading { align-items: center; justify-content: center; }

        .spinner {
          width: 36px; height: 36px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* NAV */
        .nav {
          display: flex;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 0 8px;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .nav-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px 8px;
          background: none;
          border: none;
          color: var(--text3);
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: color 0.2s;
          position: relative;
        }

        .nav-btn.active { color: var(--text); }
        .nav-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 20%; right: 20%;
          height: 2px;
          background: var(--accent);
          border-radius: 2px 2px 0 0;
        }
        .nav-btn:hover:not(.active) { color: var(--text2); }

        /* VIEWS */
        .view { flex: 1; overflow: hidden; display: flex; }

        /* LISTS SIDEBAR */
        .lists-sidebar {
          width: 200px;
          flex-shrink: 0;
          background: var(--surface);
          border-right: 1px solid var(--border);
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        @media (max-width: 600px) { .lists-sidebar { width: 130px; } }

        .list-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 10px;
          border: none;
          background: none;
          border-radius: var(--radius-sm);
          color: var(--text2);
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          text-align: left;
          transition: all 0.15s;
        }
        .list-tab:hover { background: var(--surface2); color: var(--text); }
        .list-tab.active { background: var(--surface3); color: var(--text); }
        .list-tab.add-list { color: var(--text3); font-size: 12px; margin-top: 4px; }
        .list-tab.add-list:hover { color: var(--text2); }

        .list-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .list-tab span:nth-child(2) {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .list-count {
          font-size: 11px;
          color: var(--text3);
          background: var(--surface3);
          padding: 1px 6px;
          border-radius: 10px;
        }

        .list-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

        .list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .list-header h2 { font-size: 18px; font-weight: 700; }
        .header-actions { display: flex; gap: 8px; align-items: center; }

        /* TASKS */
        .tasks-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .task-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          transition: all 0.2s;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .task-item:not(.static):hover { background: var(--surface2); }
        .task-item.done { opacity: 0.4; }
        .task-item.done .task-title { text-decoration: line-through; }

        .check-btn {
          width: 22px; height: 22px;
          border-radius: 50%;
          border: 2px solid var(--accent, #3b82f6);
          background: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          transition: all 0.15s;
          margin-top: 1px;
        }
        .check-btn.checked { background: var(--accent, #3b82f6); border-color: var(--accent, #3b82f6); }
        .check-btn:hover:not(.checked) { background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent); }

        .task-body { flex: 1; min-width: 0; }
        .task-title { font-size: 14px; font-weight: 500; line-height: 1.4; display: block; }

        .task-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
          align-items: center;
        }

        .meta-tag {
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 10px;
          background: var(--surface3);
          color: var(--text2);
          display: flex;
          align-items: center;
          gap: 3px;
          font-weight: 500;
        }
        .meta-note { font-size: 11px; color: var(--text3); }

        .task-edit { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
        .task-item:hover .task-edit { opacity: 1; }

        .section-divider {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text3);
          font-weight: 600;
          padding: 12px 4px 4px;
        }

        /* TODAY */
        .today-view { flex-direction: column; }

        .today-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--surface);
        }

        .today-date { display: flex; align-items: center; gap: 16px; }
        .today-day-num { font-size: 48px; font-weight: 800; line-height: 1; color: var(--text); }
        .today-date-text { display: flex; flex-direction: column; }
        .today-month { font-size: 14px; font-weight: 600; color: var(--text2); }
        .today-weekday { font-size: 13px; color: var(--text3); text-transform: capitalize; }

        .today-progress { text-align: right; }
        .progress-text { font-size: 24px; font-weight: 700; color: var(--text2); margin-bottom: 6px; }
        .progress-bar { width: 120px; height: 4px; background: var(--surface3); border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--green); border-radius: 2px; transition: width 0.3s ease; }

        /* CALENDAR */
        .calendar-view { padding: 0; }
        .cal-container { display: flex; flex: 1; overflow: hidden; }

        .cal-panel {
          padding: 16px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          width: 320px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (max-width: 600px) {
          .cal-container { flex-direction: column; overflow: auto; }
          .cal-panel { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
        }

        .cal-nav { display: flex; align-items: center; justify-content: space-between; }
        .cal-nav h2 { font-size: 16px; font-weight: 700; }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }

        .cal-dow {
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          color: var(--text3);
          padding: 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .cal-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: inherit;
          gap: 2px;
          transition: background 0.15s;
        }
        .cal-day:hover { background: var(--surface2); }
        .cal-day.today .cal-day-num { color: var(--accent); font-weight: 700; }
        .cal-day.selected { background: var(--surface3); }
        .cal-day-num { font-size: 13px; font-weight: 500; color: var(--text2); }

        .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
        .cal-dot.all { background: var(--green); }
        .cal-dot.partial { background: #f5a623; }
        .cal-dot.none { background: var(--red); }

        .cal-legend { display: flex; gap: 12px; flex-wrap: wrap; }
        .cal-legend span { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text3); }

        .cal-detail { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .cal-detail h3 { font-size: 16px; font-weight: 700; color: var(--text2); }

        /* BUTTONS */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: none;
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn.small { padding: 6px 10px; font-size: 12px; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-danger { background: transparent; color: var(--red); border: 1px solid var(--red); margin-right: auto; }
        .btn-danger:hover { background: #dc262610; }

        .icon-btn {
          background: none;
          border: none;
          color: var(--text2);
          cursor: pointer;
          padding: 6px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .icon-btn:hover { background: var(--surface2); color: var(--text); }

        /* MODAL */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          width: 100%;
          max-width: 480px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          animation: slideUp 0.2s ease;
          max-height: 90dvh;
          overflow-y: auto;
        }
        .modal-card.small { max-width: 360px; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }

        .modal-header { display: flex; align-items: center; justify-content: space-between; }
        .modal-header h2 { font-size: 17px; font-weight: 700; }
        .modal-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }

        /* FORM */
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        input, select, textarea {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-family: inherit;
          font-size: 14px;
          padding: 9px 12px;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
        }
        input:focus, select:focus, textarea:focus { border-color: var(--accent); }
        textarea { resize: vertical; }

        .recurrence-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .rec-tab {
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: none;
          color: var(--text2);
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .rec-tab.active { background: var(--accent); border-color: var(--accent); color: white; }
        .rec-tab:hover:not(.active) { border-color: var(--text2); color: var(--text); }

        .dow-picker { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
        .dow-btn {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: none;
          color: var(--text2);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .dow-btn.active { background: var(--accent); border-color: var(--accent); color: white; }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text2);
        }
        .checkbox-label input { width: auto; }

        .color-picker { display: flex; gap: 8px; flex-wrap: wrap; }
        .color-dot {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .color-dot.selected { border-color: #1a1d26; transform: scale(1.2); }
        .color-dot:hover { transform: scale(1.1); }

        /* EMPTY STATE */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 40px 20px;
          color: var(--text3);
        }
        .empty-state.full { flex: 1; justify-content: center; }
        .empty-state p { font-size: 14px; }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>

      <div className="app">
        <nav className="nav">
          <button className={`nav-btn ${view === "today" ? "active" : ""}`} onClick={() => setView("today")}>
            <Icon name="sun" size={20} />
            Сегодня
          </button>
          <button className={`nav-btn ${view === "lists" ? "active" : ""}`} onClick={() => setView("lists")}>
            <Icon name="list" size={20} />
            Списки
          </button>
          <button className={`nav-btn ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>
            <Icon name="calendar" size={20} />
            Календарь
          </button>
        </nav>

        {view === "today" && <TodayView data={data} setData={setData} />}
        {view === "lists" && <ListsView data={data} setData={setData} />}
        {view === "calendar" && <CalendarView data={data} />}
      </div>
    </>
  );
}