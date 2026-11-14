// Assignment 4: the explorer. State can be set from the URL (handy for sharing a view or taking screenshots), e.g.
//   ?measure=ret&surface=Grass&select=Novak%20Djokovic&brush=25,45,60,90
(function () {
  const { createStore, Scatter, Profile, BrushSummary, Controls, byName } = Aces;
  const q = new URLSearchParams(location.search), init = {};
  if (["ace", "serve", "ret"].includes(q.get("measure"))) init.measure = q.get("measure");
  if (["Hard", "Clay", "Grass"].includes(q.get("surface"))) init.surface = q.get("surface");
  ["color", "trend", "labels"].forEach(k => { if (q.get(k) === "0") init[k] = false; });
  if (q.get("select") && byName.has(q.get("select"))) init.selected = byName.get(q.get("select")).id;
  if (q.get("brush")) { const [x0, x1, y0, y1] = q.get("brush").split(",").map(Number); if ([x0, x1, y0, y1].every(isFinite)) init.brush = { x0, x1, y0, y1 }; }
  const store = createStore(init);
  Controls("#controls", store, { id: "explorer" });
  const ctl = document.querySelector("#controls");
  Scatter("#chart", store, {});
  BrushSummary("#brush", store);
  Profile("#profile", store);
  store.on(() => {                                  // keep the URL in step with the view so it can be shared
    const st = store.get(), p = new URLSearchParams();
    if (st.measure !== "ace") p.set("measure", st.measure);
    if (st.surface !== "All") p.set("surface", st.surface);
    ["color", "trend", "labels"].forEach(k => { if (!st[k]) p.set(k, "0"); });
    if (st.selected != null) p.set("select", Aces.byId.get(st.selected).name);
    if (st.brush) p.set("brush", [st.brush.x0, st.brush.x1, st.brush.y0, st.brush.y1].map(v => v.toFixed(1)).join(","));
    history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
  });
})();
