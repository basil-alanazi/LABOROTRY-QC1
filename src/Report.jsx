import { useMemo } from "react";
import { CONTEXTS, SLOTS, bpLevel, dayKey, fmtDate, fmtTime, glucoseLevel, sinceMeal } from "./dose";
import { MEAL_SLOTS } from "./mealPlan";

// تقرير يومي: كل القراءات والجرعات والوجبات بترتيب الوقت
export default function Report({ settings, readings, doses, bp, meals, since }) {
  const days = useMemo(() => {
    const items = [
      ...readings.map((r) => ({ kind: "sugar", at: r.created_at, r })),
      ...doses.map((d) => ({ kind: "dose", at: d.created_at, d })),
      ...bp.map((b) => ({ kind: "bp", at: b.created_at, b })),
      ...meals.map((m) => ({ kind: "meal", at: m.created_at, m })),
    ].filter((x) => new Date(x.at).getTime() >= since);

    const map = new Map();
    for (const x of items) {
      const k = dayKey(x.at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([k, list]) => [k, list.sort((a, b) => (a.at < b.at ? -1 : 1))]);
  }, [readings, doses, bp, meals, since]);

  if (!days.length) return <p className="empty">ما فيه تسجيلات في هالفترة.</p>;

  return days.map(([k, list]) => {
    const sugars = list.filter((x) => x.kind === "sugar").map((x) => x.r.glucose);
    const insulin = list.filter((x) => x.kind === "dose");
    const humalog = insulin.filter((x) => x.d.insulin === "Humalog").reduce((a, x) => a + Number(x.d.units), 0);
    const tresiba = insulin.filter((x) => x.d.insulin === "Tresiba").reduce((a, x) => a + Number(x.d.units), 0);
    return (
      <div key={k} className="card report-day">
        <h3>{fmtDate(list[0].at)}</h3>
        <div className="day-summary">
          {sugars.length > 0 && <span>متوسط السكر <b>{Math.round(sugars.reduce((a, b) => a + b, 0) / sugars.length)}</b></span>}
          {sugars.length > 0 && <span>أعلى <b>{Math.max(...sugars)}</b> · أقل <b>{Math.min(...sugars)}</b></span>}
          {humalog > 0 && <span>Humalog <b>{humalog}</b> وحدة</span>}
          {tresiba > 0 && <span>Tresiba <b>{tresiba}</b> وحدة</span>}
        </div>
        <ul className="timeline">
          {list.map((x) => (
            <li key={x.kind + (x.r?.id ?? x.d?.id ?? x.b?.id ?? x.m?.id)} className={`tl ${x.kind}`}>
              <span className="tl-time">{fmtTime(x.at)}</span>
              {x.kind === "sugar" && (
                <span className="tl-body">
                  🩸 سكر <span className={`badge ${glucoseLevel(x.r.glucose, x.r.context, settings)}`}>{x.r.glucose}</span>{" "}
                  <span className="muted">{CONTEXTS[x.r.context] || x.r.context}</span>
                  {sinceMeal(x.r) && <small className="muted block">{sinceMeal(x.r)}</small>}
                  {x.r.note && <small className="block">{x.r.note}</small>}
                </span>
              )}
              {x.kind === "dose" && (
                <span className="tl-body">
                  💉 <b>{x.d.insulin} {x.d.units}</b> وحدة <span className="muted">{SLOTS[x.d.slot]?.label}</span>
                  {x.d.planned_units != null && Number(x.d.planned_units) !== Number(x.d.units) && <small className="planned"> (الخطة {x.d.planned_units})</small>}
                </span>
              )}
              {x.kind === "bp" && (
                <span className="tl-body">
                  🩺 {x.b.systolic ? <>ضغط <span className={`badge ${bpLevel(x.b, settings)}`}>{x.b.systolic}/{x.b.diastolic}</span> </> : null}
                  {x.b.pulse && <span className="muted">نبض {x.b.pulse} </span>}
                  {x.b.spo2 && <span className="muted">أكسجين {x.b.spo2}%</span>}
                </span>
              )}
              {x.kind === "meal" && (
                <span className="tl-body">
                  🍽️ {MEAL_SLOTS[x.m.slot]?.label}: {x.m.followed ? "حسب الخطة" : x.m.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  });
}
