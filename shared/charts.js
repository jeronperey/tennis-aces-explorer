// Shared D3 + SVG components for the explorer (Assignment 4) and the article (Assignment 5).
// Needs d3 (v7) and DATA (shared/data.js). Every chart reads from one small "store" so that
// selecting or hovering a player in one graphic highlights the same player in the others.
(function () {
  const INK = "#1f2328", MUTED = "#5b626b", GRID = "#d9dde1", ACCENT = "#6d28d9";
  const TIER_COLORS = { "Top 10": "#08306b", "11-50": "#4f86c6", "51+": "#a9c1de" };
  const TIER_LABEL = { "Top 10": "Reached top 10", "11-50": "Best rank 11–50", "51+": "Best rank 51+" };
  const TIER_ORDER = ["Top 10", "11-50", "51+"];
  const SURF_COLORS = { Hard: "#1b3f8b", Clay: "#8b1e1e", Grass: "#2e8b3e" };
  const NOTABLE = ["Ivo Karlovic", "John Isner", "Reilly Opelka", "Milos Raonic", "Novak Djokovic", "Rafael Nadal",
                   "Carlos Alcaraz", "Roger Federer", "Nick Kyrgios", "Kei Nishikori"];
  const MEASURES = {
    ace:   { label: "Ace rate",          axis: "Ace rate (% of service points that are aces)" },
    serve: { label: "Serve points won",  axis: "Serve points won (% of service points)" },
    ret:   { label: "Return points won", axis: "Return points won (% of opponent's service points)" },
    win:   { label: "Match win rate",    axis: "Match win rate (%)" },
  };
  const f1 = d3.format(".1f"), f0 = d3.format(",");
  const REDUCE = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const byId = new Map(DATA.players.map(p => [p.id, p]));
  const byName = new Map(DATA.players.map(p => [p.name, p]));
  const lastName = n => n.split(" ").slice(-1)[0];

  const val = (p, key, surface) => surface === "All" ? p[key] : (p.surf[surface] ? p.surf[surface][key] : null);
  const matchesOn = (p, surface) => surface === "All" ? p.m : (p.surf[surface] ? p.surf[surface].m : 0);
  const baseMin = surface => surface === "All" ? DATA.meta.minMatches : DATA.meta.minMatchesSurface;
  const minFor = st => Math.max(st.minMatches != null ? st.minMatches : 0, baseMin(st.surface));
  // the players currently on the chart: have both measures, and enough matches (the "minimum matches" slider)
  const viewRows = (st, yKey) => DATA.players.map(p => ({ p, x: val(p, st.measure, st.surface), y: val(p, yKey || "win", st.surface), n: matchesOn(p, st.surface) }))
    .filter(d => d.x != null && d.y != null && d.n >= minFor(st));
  const pearson = (a, b) => {
    const n = a.length, ma = d3.mean(a), mb = d3.mean(b);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return sab / Math.sqrt(saa * sbb);
  };
  const strength = r => Math.abs(r) < 0.2 ? "barely" : Math.abs(r) < 0.4 ? "weakly" : Math.abs(r) < 0.6 ? "moderately" : "strongly";
  const topBy = (key, k) => DATA.players.slice().sort((a, b) => b[key] - a[key]).slice(0, k).map(p => p.id);
  const GROUPS = { servers: new Set(topBy("ace", 8)), winners: new Set(topBy("win", 8)) };

  // ---------- store (tiny publish/subscribe so linked graphics stay in sync) ----------
  function createStore(init) {
    const state = Object.assign({ measure: "ace", surface: "All", color: true, trend: true, labels: true,
      selected: null, hover: null, brush: null, highlight: "none", minMatches: null }, init || {});
    const subs = [];
    return { get: () => state, on: fn => subs.push(fn),
      set(patch) { const prev = Object.assign({}, state); Object.assign(state, patch); subs.forEach(fn => fn(state, patch, prev)); } };
  }

  // ---------- tooltip ----------
  let tipEl = null;
  function tip() { if (!tipEl) { tipEl = d3.select("body").append("div").attr("id", "tooltip"); } return tipEl; }
  function showTip(evt, html) {
    tip().html(html).style("opacity", 1).style("left", Math.min(evt.clientX + 14, innerWidth - 290) + "px").style("top", evt.clientY + 14 + "px");
  }
  const hideTip = () => tip().style("opacity", 0);

  // ======================================================================== scatterplot
  function Scatter(host, store, opts) {
    opts = opts || {};
    const W = opts.width || 760, H = opts.height || 520, m = { l: 70, r: 92, t: 50, b: 64 };
    const yKey = opts.y || "win";
    const svg = d3.select(host).append("svg").attr("class", "chart").attr("viewBox", [0, 0, W, H])
      .attr("role", "img").attr("aria-label", "Scatterplot: one dot per ATP player, 2015 to 2024");
    const x = d3.scaleLinear().range([m.l, W - m.r]), y = d3.scaleLinear().range([H - m.b, m.t]);
    const gGrid = svg.append("g"), gx = svg.append("g").attr("transform", `translate(0,${H - m.b})`).attr("class", "axis"),
      gy = svg.append("g").attr("transform", `translate(${m.l},0)`).attr("class", "axis");
    const xTitle = svg.append("text").attr("class", "axis-title").attr("x", (m.l + W - m.r) / 2).attr("y", H - 14).attr("text-anchor", "middle");
    svg.append("text").attr("class", "axis-title").attr("transform", `translate(16,${(m.t + H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text(MEASURES[yKey].axis);
    const ref = svg.append("g"), notes = svg.append("g").attr("pointer-events", "none");
    const brushG = svg.append("g").attr("class", "brush");
    const dotsG = svg.append("g"), trendG = svg.append("g").attr("pointer-events", "none"), labG = svg.append("g").attr("pointer-events", "none");
    const legend = svg.append("g").attr("transform", `translate(${m.l},22)`);
    const readout = svg.append("text").attr("class", "readout").attr("x", W - m.r).attr("y", 22).attr("text-anchor", "end");

    let rows = [];
    const brush = d3.brush().extent([[m.l, m.t], [W - m.r, H - m.b]]).on("brush end", e => {
      if (!e.sourceEvent) return;                           // ignore programmatic moves
      if (!e.selection) { if (e.type === "end") store.set({ brush: null }); return; }
      const [[px0, py0], [px1, py1]] = e.selection;
      store.set({ brush: { x0: x.invert(px0), x1: x.invert(px1), y0: y.invert(py1), y1: y.invert(py0) } });
    });
    brushG.call(brush);
    if (opts.brush === false) brushG.style("display", "none");
    const inBrush = (d, b) => d.x >= b.x0 && d.x <= b.x1 && d.y >= b.y0 && d.y <= b.y1;

    function render(animate) {
      const st = store.get(), dur = animate && !REDUCE ? 650 : 0;
      rows = viewRows(st, yKey);
      if (rows.length) {
        const xs = rows.map(d => d.x), ys = rows.map(d => d.y);
        x.domain([Math.floor(d3.min(xs) - 1), Math.ceil(d3.max(xs) + 1)]).nice();
        y.domain([Math.floor(d3.min(ys) / 5 - 0.2) * 5, Math.ceil(d3.max(ys) / 5 + 0.2) * 5]);
      }
      gx.transition().duration(dur).call(d3.axisBottom(x).ticks(7).tickFormat(d => d + "%"));
      gy.transition().duration(dur).call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "%"));
      gGrid.selectAll("line").data(y.ticks(6)).join("line").attr("class", "gridline").attr("x1", m.l).attr("x2", W - m.r)
        .transition().duration(dur).attr("y1", d => y(d)).attr("y2", d => y(d));
      xTitle.text(MEASURES[st.measure].axis);
      ref.selectAll("*").remove();
      if (yKey === "win" && y(50) >= m.t && y(50) <= H - m.b) {
        ref.append("line").attr("class", "ref").attr("x1", m.l).attr("x2", W - m.r + 6).attr("y1", y(50)).attr("y2", y(50));
        const lab = ref.append("text").attr("class", "small ref-label").attr("x", W - m.r + 10).attr("y", y(50) - 2);
        lab.append("tspan").attr("x", W - m.r + 10).text("50% line:"); lab.append("tspan").attr("x", W - m.r + 10).attr("dy", 15).text("wins half");
      }
      // corner notes: the two "surprising" corners, named in plain words (annotation, not a paragraph)
      notes.selectAll("*").remove();
      if (opts.cornerNotes && st.labels && yKey === "win") {
        const L = MEASURES[st.measure].label.toLowerCase();
        notes.append("text").attr("class", "corner-note").attr("x", m.l + 10).attr("y", m.t + 18).text(`Low ${L}, wins a lot`);
        notes.append("text").attr("class", "corner-note").attr("x", W - m.r - 10).attr("y", H - m.b - 10).attr("text-anchor", "end").text(`High ${L}, wins less`);
      }
      const dots = dotsG.selectAll("circle").data(rows, d => d.p.id);
      dots.exit().remove();
      const enter = dots.enter().append("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 0)
        .on("mouseenter", (e, d) => { store.set({ hover: d.p.id }); showTip(e, tipHtml(d)); })
        .on("mousemove", (e, d) => showTip(e, tipHtml(d)))
        .on("mouseleave", () => { store.set({ hover: null }); hideTip(); })
        .on("click", (e, d) => { e.stopPropagation(); store.set({ selected: store.get().selected === d.p.id ? null : d.p.id }); });
      enter.merge(dots).transition().duration(dur).attr("cx", d => x(d.x)).attr("cy", d => y(d.y));
      legend.selectAll("*").remove();
      if (st.color) {
        TIER_ORDER.forEach((t, i) => {
          const g = legend.append("g").attr("transform", `translate(${i * 132},0)`);
          g.append("circle").attr("r", 6).attr("cx", 6).attr("cy", -4).attr("fill", TIER_COLORS[t]).attr("stroke", "#4b5563").attr("stroke-width", 0.9);
          g.append("text").attr("x", 17).attr("y", 0).attr("class", "small").text(TIER_LABEL[t]);
        });
      } else legend.append("text").attr("class", "small").text("Each dot is one player");
      renderTrend();
      restyle(dur);
    }

    function renderTrend() {
      const st = store.get();
      trendG.selectAll("*").remove();
      const r = rows.length > 2 ? pearson(rows.map(d => d.x), rows.map(d => d.y)) : NaN;
      readout.text(isNaN(r) ? "" : `r = ${r.toFixed(2)} · ${rows.length} players`);
      if (!st.trend || rows.length < 3) return;
      const xs = rows.map(d => d.x), ys = rows.map(d => d.y), mx = d3.mean(xs), my = d3.mean(ys);
      const slope = d3.sum(rows, d => (d.x - mx) * (d.y - my)) / d3.sum(rows, d => (d.x - mx) ** 2), icpt = my - slope * mx;
      const [x0, x1] = d3.extent(xs), pts = { x1: x(x0), x2: x(x1), y1: y(slope * x0 + icpt), y2: y(slope * x1 + icpt) };
      trendG.append("line").attr("class", "trend halo").attr("x1", pts.x1).attr("x2", pts.x2).attr("y1", pts.y1).attr("y2", pts.y2);
      trendG.append("line").attr("class", "trend").attr("x1", pts.x1).attr("x2", pts.x2).attr("y1", pts.y1).attr("y2", pts.y2);
    }

    function tipHtml(d) {
      const st = store.get();
      return `<b>${d.p.name}</b><br>${MEASURES[st.measure].label}: ${f1(d.x)}%<br>${MEASURES[yKey].label}: ${f1(d.y)}%<br>` +
             `${f0(d.n)} matches · ${TIER_LABEL[d.p.tier]}`;
    }

    // restyle: opacity, ring and labels depend on selection, hover, brush and highlight group
    function restyle(dur) {
      const st = store.get(), grp = GROUPS[st.highlight], fade = st.selected != null && !st.brush && !grp;
      const dim = d => (grp && !grp.has(d.p.id)) || (st.brush && !inBrush(d, st.brush));
      dotsG.selectAll("circle").transition().duration(dur || 0)
        .attr("r", d => d.p.id === st.selected ? 9 : d.p.id === st.hover ? 8 : 5.8)
        .attr("fill", d => d.p.id === st.selected ? ACCENT : st.color ? TIER_COLORS[d.p.tier] : "#6b7580")
        .attr("stroke", d => d.p.id === st.selected ? "#fff" : d.p.id === st.hover ? INK : "#4b5563")
        .attr("stroke-width", d => d.p.id === st.selected ? 2.5 : d.p.id === st.hover ? 2 : 0.9)
        .attr("opacity", d => d.p.id === st.selected ? 1 : dim(d) ? 0.15 : fade ? 0.45 : 0.92);
      dotsG.selectAll("circle").filter(d => d.p.id === st.selected || d.p.id === st.hover).raise();
      drawLabels();
    }

    function drawLabels() {
      const st = store.get(), grp = GROUPS[st.highlight];
      const names = new Set();
      (opts.annotate || []).forEach(n => names.add(n));
      if (st.labels && !opts.annotate) NOTABLE.forEach(n => names.add(n));
      if (grp) grp.forEach(id => names.add(byId.get(id).name));
      [st.selected, st.hover].forEach(id => { if (id != null && byId.has(id)) names.add(byId.get(id).name); });
      const placed = [], out = [];
      const priority = d => (d.p.id === st.selected ? 0 : d.p.id === st.hover ? 1 : 2);
      rows.filter(d => names.has(d.p.name)).sort((a, b) => priority(a) - priority(b)).forEach(d => {
        // the selected player gets a call-out with their numbers (the takeaway lives in the chart, not only in the side panel)
        const text = d.p.id === st.selected ? `${lastName(d.p.name)}: ${f1(d.x)}% · wins ${f1(d.y)}%` : lastName(d.p.name);
        const w = text.length * 7.2 + 6, h = 15, px = x(d.x), py = y(d.y);
        const cands = [[10, 4, "start"], [-10, 4, "end"], [0, -13, "middle"], [0, 23, "middle"]];
        for (const [dx, dy, anchor] of cands) {
          const bx = anchor === "start" ? px + dx : anchor === "end" ? px + dx - w : px - w / 2, by = py + dy - 12;
          const ok = bx > m.l && bx + w < W - m.r + 6 && by > m.t - 8 && by + h < H - m.b + 6 && !placed.some(r => bx < r[0] + r[2] && bx + w > r[0] && by < r[1] + r[3] && by + h > r[1]);
          if (ok || (anchor === "middle" && dy === 23)) { placed.push([bx, by, w, h]); out.push({ d, text, x: px + dx, y: py + dy, anchor }); break; }
        }
      });
      labG.selectAll("text").data(out, o => o.d.p.id).join("text").attr("class", "dot-label")
        .attr("x", o => o.x).attr("y", o => o.y).attr("text-anchor", o => o.anchor)
        .attr("fill", o => o.d.p.id === store.get().selected ? ACCENT : INK)
        .attr("font-weight", o => o.d.p.id === store.get().selected ? 800 : 600).text(o => o.text);
    }

    store.on((st, patch) => {
      if ("measure" in patch || "surface" in patch || "minMatches" in patch) {
        if (st.brush) { st.brush = null; brushG.call(brush.move, null); }
        render(true);
      } else if ("color" in patch || "labels" in patch) render(false);
      else if ("trend" in patch) renderTrend();
      else if ("brush" in patch && !st.brush) { brushG.call(brush.move, null); restyle(0); }
      else restyle(0);
    });
    render(false);
    if (store.get().brush) {           // restore a brush from the URL, in data coordinates
      const b = store.get().brush;
      brushG.call(brush.move, [[x(b.x0), y(b.y1)], [x(b.x1), y(b.y0)]]);
    }
    return { rows: () => rows, x, y };
  }

  // ======================================================================== match-level bars (Assignment 2 result)
  function MatchChart(host, opts) {
    opts = opts || {};
    const W = 760, H = 392, m = { l: 112, r: 40, t: 34, b: 56 }, GAP = 48, ACC = "#6d28d9";   // GAP: room under the bars for the gap bracket
    const svg = d3.select(host).append("svg").attr("class", "chart").attr("viewBox", [0, 0, W, H]).attr("role", "img")
      .attr("aria-label", "Bar chart: share of matches won by the player who hit more aces, by size of the ace gap");
    const x = d3.scaleLinear([0, 100], [m.l, W - m.r]), barsBottom = H - m.b - GAP, by = barsBottom + GAP / 2;
    const band = d3.scaleBand(DATA.match.all.map(d => d.bin), [m.t, barsBottom]).padding(0.28);
    svg.append("g").attr("transform", `translate(0,${H - m.b})`).attr("class", "axis").call(d3.axisBottom(x).ticks(5).tickFormat(d => d + "%"));
    svg.append("text").attr("class", "axis-title").attr("x", (m.l + W - m.r) / 2).attr("y", H - 14).attr("text-anchor", "middle").text("Share of matches won by the player who hit more aces (%)");
    svg.append("text").attr("class", "small bold").attr("x", 14).attr("y", m.t - 14).text("Extra aces hit");
    const rowsG = svg.append("g");
    svg.append("line").attr("class", "ref halo").attr("x1", x(50)).attr("x2", x(50)).attr("y1", m.t - 8).attr("y2", barsBottom);
    svg.append("line").attr("class", "ref").attr("x1", x(50)).attr("x2", x(50)).attr("y1", m.t - 8).attr("y2", barsBottom);
    svg.append("text").attr("class", "small").attr("x", x(50)).attr("y", m.t - 14).attr("text-anchor", "middle").text("50% = coin flip");
    // the takeaway drawn in the chart: a guide from the first bar down to a bracket that spans the gap to the last bar
    const gap = svg.append("g").attr("pointer-events", "none");
    const guideHalo = gap.append("line").attr("class", "halo-line"), guide = gap.append("line").attr("stroke", ACC).attr("stroke-width", 2.5).attr("stroke-dasharray", "8 4");
    const bracket = gap.append("path").attr("stroke", ACC).attr("stroke-width", 3).attr("fill", "none");
    const gapLabel = gap.append("text").attr("font-size", 17).attr("font-weight", 800).attr("fill", ACC).attr("y", by + 6);
    let first = true;
    function update(surface) {
      const dur = first || REDUCE ? 0 : 500; first = false;
      const tr = sel => dur ? sel.transition().duration(dur) : sel;
      const data = DATA.match[surface === "All" ? "all" : surface], color = surface === "All" ? "#6b7580" : SURF_COLORS[surface];
      const g = rowsG.selectAll("g.row").data(data, d => d.bin).join(en => {
        const e = en.append("g").attr("class", "row");
        e.append("text").attr("class", "row-label");
        e.append("text").attr("class", "row-n small");
        e.append("rect").attr("class", "bar").attr("height", band.bandwidth()).attr("rx", 3).attr("x", x(0)).attr("width", 0);
        e.append("text").attr("class", "bar-val");
        return e;
      });
      g.attr("transform", d => `translate(0,${band(d.bin)})`)
        .on("mousemove", (e, d) => showTip(e, `<b>${d.bin} more aces</b><br>${f1(d.pct)}% won<br>${f0(d.won)} of ${f0(d.n)} matches`)).on("mouseleave", hideTip);
      g.select(".row-label").attr("x", 14).attr("y", band.bandwidth() / 2 - 2).text(d => d.bin + " aces");
      g.select(".row-n").attr("x", 14).attr("y", band.bandwidth() / 2 + 15).text(d => "n = " + f0(d.n));
      tr(g.select(".bar")).attr("width", d => x(d.pct) - x(0)).attr("fill", color);
      g.select(".bar-val").attr("y", band.bandwidth() / 2 + 7).each(function (d) {
        const node = this, from = +node.__v || d.pct; node.__v = d.pct;
        d3.select(node).transition().duration(dur).attr("x", x(d.pct) + 10).tween("text", () => { const i = d3.interpolateNumber(from, d.pct); return t => { node.textContent = f1(i(t)) + "%"; }; });
        if (!dur) { d3.select(node).interrupt().attr("x", x(d.pct) + 10); node.textContent = f1(d.pct) + "%"; }
      });
      const lo = data[0].pct, hi = data[data.length - 1].pct;
      [guideHalo, guide].forEach(l => tr(l).attr("x1", x(lo)).attr("x2", x(lo)).attr("y1", m.t - 6).attr("y2", by));
      guideHalo.attr("stroke", "#fff").attr("stroke-width", 6).attr("opacity", 0.9);
      tr(bracket).attr("d", `M${x(lo)},${by - 7}V${by + 7}M${x(lo)},${by}H${x(hi)}M${x(hi)},${by - 7}V${by + 7}`);
      tr(gapLabel).attr("x", x(hi) + 14);
      gapLabel.text(`+${f1(hi - lo)} pts: ${data[data.length - 1].bin} vs ${data[0].bin}`);
    }
    update(opts.surface || "All");
    return { update };
  }

  // ======================================================================== dumbbell: serve vs return points won
  function Dumbbell(host, store, opts) {
    opts = opts || {};
    const W = 760, rowH = 40, m = { l: 190, r: 40, t: 52, b: 50 };
    const COL = { serve: "#0f766e", ret: "#c2410c" };
    let ids = (opts.names || []).map(n => byName.get(n).id);
    const svg = d3.select(host).append("svg").attr("class", "chart").attr("role", "img")
      .attr("aria-label", "Dot plot: share of service points won and return points won for selected players");
    const x = d3.scaleLinear([20, 85], [m.l, W - m.r]);
    const medServe = d3.median(DATA.players, p => p.serve), medRet = d3.median(DATA.players, p => p.ret);
    function render() {
      const rows = ids.map(id => byId.get(id)).sort((a, b) => a.ace - b.ace), H = m.t + m.b + rowH * rows.length;
      svg.attr("viewBox", [0, 0, W, H]); svg.selectAll("*").remove();
      svg.append("g").attr("transform", `translate(0,${H - m.b + 6})`).attr("class", "axis").call(d3.axisBottom(x).ticks(6).tickFormat(d => d + "%"));
      svg.append("text").attr("class", "axis-title").attr("x", (m.l + W - m.r) / 2).attr("y", H - 12).attr("text-anchor", "middle").text("Share of points won (%)");
      [["serve", "Points won on their own serve", 0], ["ret", "Points won when returning", 250]].forEach(([k, t, dx]) => {
        svg.append("circle").attr("cx", m.l + dx).attr("cy", 18).attr("r", 6).attr("fill", COL[k]);
        svg.append("text").attr("class", "small bold").attr("x", m.l + dx + 12).attr("y", 22).text(t);
      });
      [[medServe, COL.serve], [medRet, COL.ret]].forEach(([v, c]) => svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t - 6).attr("y2", H - m.b)
        .attr("stroke", c).attr("stroke-dasharray", "6 4").attr("stroke-width", 2.2).attr("opacity", 0.95));
      svg.append("text").attr("class", "small").attr("x", x(medRet)).attr("y", m.t - 10).attr("text-anchor", "middle").attr("fill", COL.ret).text("typical player");
      svg.append("text").attr("class", "small").attr("x", x(medServe)).attr("y", m.t - 10).attr("text-anchor", "middle").attr("fill", COL.serve).text("typical player");
      const g = svg.selectAll("g.drow").data(rows, d => d.id).join("g").attr("class", "drow").attr("transform", (d, i) => `translate(0,${m.t + i * rowH})`)
        .attr("cursor", "pointer")
        .on("mouseenter", (e, d) => store.set({ hover: d.id })).on("mouseleave", () => { store.set({ hover: null }); hideTip(); })
        .on("mousemove", (e, d) => showTip(e, `<b>${d.name}</b><br>Serve points won: ${f1(d.serve)}%<br>Return points won: ${f1(d.ret)}%<br>Ace rate: ${f1(d.ace)}% · Match wins: ${f1(d.win)}%`))
        .on("click", (e, d) => store.set({ selected: store.get().selected === d.id ? null : d.id }));
      g.append("rect").attr("class", "hit").attr("x", 0).attr("y", 0).attr("width", W).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("class", "row-label").attr("x", 14).attr("y", rowH / 2 - 2).text(d => d.name);
      g.append("text").attr("class", "small").attr("x", 14).attr("y", rowH / 2 + 14).text(d => `${f1(d.ace)}% aces · wins ${f1(d.win)}%`);
      g.append("line").attr("x1", d => x(Math.min(d.serve, d.ret))).attr("x2", d => x(Math.max(d.serve, d.ret))).attr("y1", rowH / 2).attr("y2", rowH / 2).attr("stroke", "#9aa3ad").attr("stroke-width", 3);
      g.append("circle").attr("cx", d => x(d.serve)).attr("cy", rowH / 2).attr("r", 7).attr("fill", COL.serve);
      g.append("circle").attr("cx", d => x(d.ret)).attr("cy", rowH / 2).attr("r", 7).attr("fill", COL.ret);
      g.append("text").attr("class", "small bold").attr("x", d => x(d.serve) + (d.serve > d.ret ? 12 : -12)).attr("y", rowH / 2 + 4).attr("text-anchor", d => d.serve > d.ret ? "start" : "end").text(d => f1(d.serve) + "%");
      g.append("text").attr("class", "small bold").attr("x", d => x(d.ret) + (d.ret > d.serve ? 12 : -12)).attr("y", rowH / 2 + 4).attr("text-anchor", d => d.ret > d.serve ? "start" : "end").text(d => f1(d.ret) + "%");
      styleRows();
    }
    function styleRows() {
      const st = store.get();
      svg.selectAll("g.drow").select(".hit").attr("fill", d => d.id === st.selected ? "#efe9fb" : d.id === st.hover ? "#f2f4f6" : "transparent");
    }
    store.on((st, patch) => { if ("selected" in patch || "hover" in patch) styleRows(); });
    render();
    return { add(id) { if (!ids.includes(id)) { ids.push(id); render(); } }, ids: () => ids.slice() };
  }

  // ======================================================================== player profile (detail on demand)
  function Profile(host, store) {
    const root = d3.select(host).classed("profile", true);
    const pctile = (key, v) => Math.floor(100 * d3.mean(DATA.players, p => p[key] < v ? 1 : 0));
    function render() {
      const id = store.get().selected; root.selectAll("*").remove();
      if (id == null) {
        root.append("h3").attr("class", "q").text("Who is this player?");
        root.append("p").attr("class", "hint").text("Click a dot to see that player's profile. Try:");
        const row = root.append("div").attr("class", "chips");
        ["Ivo Karlovic", "Novak Djokovic", "Rafael Nadal"].forEach(n => row.append("button").attr("class", "chip").text(n).on("click", () => store.set({ selected: byName.get(n).id })));
        return;
      }
      const p = byId.get(id);
      root.append("h3").text(p.name);
      root.append("p").attr("class", "meta").text([p.hand === "R" ? "Right-handed" : p.hand === "L" ? "Left-handed" : null, p.ht ? p.ht + " cm" : null,
        p.best ? "best ranking #" + p.best : null, f0(p.m) + " matches, " + DATA.meta.years].filter(Boolean).join(" · "));
      const W = 330, sh = 42, svg = root.append("svg").attr("class", "chart").attr("viewBox", [0, 0, W, sh * 4 + 4]);
      [["ace", "Ace rate"], ["serve", "Serve points won"], ["ret", "Return points won"], ["win", "Match win rate"]].forEach(([k, label], i) => {
        const ext = d3.extent(DATA.players, d => d[k]), sx = d3.scaleLinear(ext, [8, W - 66]), y0 = i * sh + 4;
        const g = svg.append("g").attr("transform", `translate(0,${y0})`);
        g.append("text").attr("class", "small bold").attr("x", 8).attr("y", 12).text(label);
        const pc = pctile(k, p[k]);
        g.append("text").attr("class", "small").attr("x", W - 2).attr("y", 12).attr("text-anchor", "end").text(`${f1(p[k])}% · ` + (pc === 0 ? "lowest of all players" : `above ${pc}% of players`));
        g.append("line").attr("x1", 8).attr("x2", W - 66).attr("y1", 30).attr("y2", 30).attr("stroke", GRID);
        g.selectAll("line.t").data(DATA.players).join("line").attr("x1", d => sx(d[k])).attr("x2", d => sx(d[k])).attr("y1", 24).attr("y2", 36).attr("stroke", "#8a939c").attr("opacity", 0.45);
        g.append("line").attr("x1", sx(d3.median(DATA.players, d => d[k]))).attr("x2", sx(d3.median(DATA.players, d => d[k]))).attr("y1", 21).attr("y2", 39).attr("stroke", INK).attr("stroke-width", 1.5);
        g.append("circle").attr("cx", sx(p[k])).attr("cy", 30).attr("r", 6.5).attr("fill", ACCENT).attr("stroke", "#fff").attr("stroke-width", 1.5);
      });
      root.append("p").attr("class", "tiny").text("Grey ticks are all 246 players. The black line is the typical player.");
      root.append("h4").text("In their own matches");
      [["Wins when they hit more aces than the opponent", p.wo, p.no, "#0f766e"], ["Wins when the opponent hits more aces", p.wd, p.nd, "#9a3412"]].forEach(([t, v, n, c]) => {
        const row = root.append("div").attr("class", "bar-row");
        row.append("div").attr("class", "bar-text").html(`${t} <span class="tiny">(${f0(n)} matches${n < 20 ? ", small sample" : ""})</span>`);
        const track = row.append("div").attr("class", "track");
        track.append("div").attr("class", "fill").style("width", (v || 0) + "%").style("background", c);
        track.append("span").attr("class", "val").text(v == null ? "–" : f1(v) + "%");
      });
      root.append("p").attr("class", "tiny").html(`They hit more aces than the opponent in ${f1(p.share)}% of matches (ties in aces left out).`);
      root.append("h4").text("By court");
      const t = root.append("table").attr("class", "mini");
      t.append("tr").selectAll("th").data(["", "Matches", "Win", "Ace", "Return"]).join("th").text(d => d);
      ["Hard", "Clay", "Grass"].forEach(s => {
        const r = p.surf[s], tr = t.append("tr");
        tr.append("td").html(`<span class="dot" style="background:${SURF_COLORS[s]}"></span>${s}`);
        [r ? f0(r.m) : "–", r ? f1(r.win) + "%" : "–", r ? f1(r.ace) + "%" : "–", r ? f1(r.ret) + "%" : "–"].forEach(v => tr.append("td").text(v));
      });
      root.append("p").attr("class", "tiny").text("Courts with fewer than 30 matches are not shown.");
    }
    store.on((st, patch) => { if ("selected" in patch) render(); });
    render();
  }

  // ======================================================================== brush summary: selected group vs everyone
  function BrushSummary(host, store) {
    const root = d3.select(host).classed("brush-summary", true);
    function render() {
      const st = store.get(); root.selectAll("*").remove();
      root.append("h3").attr("class", "q").text("Who is in this group?");
      if (!st.brush) { root.append("p").attr("class", "hint").text("Drag a box on the chart to select a group of players and compare them with everyone."); return; }
      const all = viewRows(st), b = st.brush, sel = all.filter(d => d.x >= b.x0 && d.x <= b.x1 && d.y >= b.y0 && d.y <= b.y1);
      if (!sel.length) { root.append("p").attr("class", "hint").text("No players in that box."); return; }
      root.append("p").html(`<b>${sel.length} player${sel.length > 1 ? "s" : ""}</b> selected out of ${all.length}.`);
      // paired dots: everyone's average (hollow) vs this group's average (filled), with the gap written next to it
      const W = 330, rh = 64, svg = root.append("svg").attr("class", "chart").attr("viewBox", [0, 0, W, rh * 2 + 8]);
      [["x", MEASURES[st.measure].label], ["y", "Match win rate"]].forEach(([k, label], i) => {
        const vals = all.map(d => d[k]), ext = d3.extent(vals), pad = (ext[1] - ext[0]) * 0.06, sx = d3.scaleLinear([ext[0] - pad, ext[1] + pad], [10, W - 12]);
        const mAll = d3.mean(vals), mSel = d3.mean(sel, d => d[k]), g = svg.append("g").attr("transform", `translate(0,${i * rh + 4})`);
        g.append("text").attr("class", "small bold").attr("x", 10).attr("y", 12).text(label);
        g.append("text").attr("class", "small").attr("x", W - 10).attr("y", 12).attr("text-anchor", "end").text(`${mSel - mAll >= 0 ? "+" : "−"}${f1(Math.abs(mSel - mAll))} pts vs everyone`);
        g.append("line").attr("x1", 10).attr("x2", W - 12).attr("y1", 34).attr("y2", 34).attr("stroke", GRID);
        g.selectAll("line.t").data(vals).join("line").attr("x1", sx).attr("x2", sx).attr("y1", 29).attr("y2", 39).attr("stroke", "#8a939c").attr("opacity", 0.35);
        g.append("line").attr("x1", sx(mAll)).attr("x2", sx(mSel)).attr("y1", 34).attr("y2", 34).attr("stroke", ACCENT).attr("stroke-width", 3);
        g.append("circle").attr("cx", sx(mAll)).attr("cy", 34).attr("r", 6.5).attr("fill", "#fff").attr("stroke", INK).attr("stroke-width", 2);
        g.append("circle").attr("cx", sx(mSel)).attr("cy", 34).attr("r", 6.5).attr("fill", ACCENT).attr("stroke", "#fff").attr("stroke-width", 1.5);
        g.append("text").attr("class", "tiny").attr("x", sx(mAll)).attr("y", 52).attr("text-anchor", "middle").text(f1(mAll) + "%");
        g.append("text").attr("class", "tiny").attr("x", sx(mSel)).attr("y", 52).attr("text-anchor", "middle").attr("fill", ACCENT).attr("font-weight", 700).text(f1(mSel) + "%");
      });
      root.append("p").attr("class", "tiny").html("Hollow dot: everyone shown. Purple dot: this group.");
      const list = root.append("ul").attr("class", "plist");
      sel.sort((a, c) => c.y - a.y).slice(0, 6).forEach(d =>
        list.append("li").append("button").attr("class", "link").text(`${d.p.name} (${f1(d.y)}%)`).on("click", () => store.set({ selected: d.p.id })));
      if (sel.length > 6) root.append("p").attr("class", "tiny").text(`and ${sel.length - 6} more`);
    }
    store.on((st, patch) => { if ("brush" in patch || "measure" in patch || "surface" in patch || "minMatches" in patch) render(); });
    render();
  }

  // ======================================================================== insight: the takeaway for the current view
  function Insight(qHost, tHost, store) {
    const q = d3.select(qHost), t = d3.select(tHost);
    function render() {
      const st = store.get(), rows = viewRows(st), L = MEASURES[st.measure].label.toLowerCase();
      q.text(`Does ${L} go with winning${st.surface === "All" ? "" : " on " + st.surface.toLowerCase() + " courts"}?`);
      if (rows.length < 12) { t.html("Too few players meet the minimum number of matches. Lower the minimum to see more."); return; }
      const r = pearson(rows.map(d => d.x), rows.map(d => d.y)), k = Math.min(5, Math.floor(rows.length / 4));
      const sorted = rows.slice().sort((a, b) => b.x - a.x), top = d3.mean(sorted.slice(0, k), d => d.y), bot = d3.mean(sorted.slice(-k), d => d.y);
      t.html(`${MEASURES[st.measure].label} goes <b>${r < -0.2 ? "against" : strength(r)}</b> with winning (<i>r</i> = ${r.toFixed(2)}). ` +
        `The ${k} players with the highest ${L} win <b class="score">${f1(top)}%</b> of their matches on average, and the ${k} with the lowest win <b class="score">${f1(bot)}%</b>.`);
    }
    store.on((st, patch) => { if ("measure" in patch || "surface" in patch || "minMatches" in patch) render(); });
    render();
  }

  // ======================================================================== guided starting views
  function Presets(host, store) {
    const root = d3.select(host).classed("presets", true);
    root.append("span").attr("class", "ctl-label").text("Start here");
    const items = [["Do big servers win?", { measure: "ace", surface: "All", highlight: "servers", brush: null }],
                   ["Who wins without aces?", { measure: "ace", surface: "All", highlight: "winners", brush: null }],
                   ["What does go with winning?", { measure: "serve", surface: "All", highlight: "none", brush: null }],
                   ["Is grass different?", { measure: "ace", surface: "Grass", highlight: "none", brush: null }]];
    const btns = items.map(([text, patch]) => root.append("button").attr("type", "button").attr("class", "chip").text(text).on("click", () => { store.set(patch); sync(); }));
    const sync = () => { const st = store.get(); btns.forEach((b, i) => { const p = items[i][1]; b.classed("on", Object.keys(p).every(k => k === "brush" || st[k] === p[k])); }); };
    store.on(sync); sync();
  }

  // ======================================================================== controls
  function segmented(host, label, options, get, set) {
    const wrap = d3.select(host).append("div").attr("class", "ctl");
    wrap.append("span").attr("class", "ctl-label").text(label);
    const grp = wrap.append("div").attr("class", "seg").attr("role", "group").attr("aria-label", label);
    const btns = grp.selectAll("button").data(options).join("button").attr("type", "button").text(d => d[1]).on("click", (e, d) => { set(d[0]); sync(); });
    const sync = () => btns.classed("on", d => d[0] === get()).attr("aria-pressed", d => d[0] === get());
    sync();
    return sync;
  }
  function Controls(host, store, opts) {
    opts = opts || {};
    const root = d3.select(host).classed("controls", true), syncs = [];
    if (opts.measure !== false) syncs.push(segmented(root.node(), "Show on the x-axis", Object.keys(MEASURES).filter(k => k !== "win").map(k => [k, MEASURES[k].label]), () => store.get().measure, v => store.set({ measure: v })));
    if (opts.surface !== false) syncs.push(segmented(root.node(), "Court", [["All", "All"], ["Hard", "Hard"], ["Clay", "Clay"], ["Grass", "Grass"]], () => store.get().surface, v => store.set({ surface: v })));
    if (opts.slider) {
      const wrap = root.append("div").attr("class", "ctl");
      const lab = wrap.append("span").attr("class", "ctl-label");
      const input = wrap.append("input").attr("type", "range").attr("class", "slider").attr("min", 30).attr("max", 300).attr("step", 10).attr("aria-label", "Minimum matches per player")
        .on("input", function () { store.set({ minMatches: +this.value }); });
      const syncSlider = () => { const v = minFor(store.get()); input.property("value", v); lab.text(`Minimum matches: ${v}`); };
      store.on((st, patch) => { if ("minMatches" in patch || "surface" in patch) syncSlider(); });
      syncSlider(); syncs.push(syncSlider);
    }
    if (opts.toggles !== false) {
      const row = root.append("div").attr("class", "ctl toggles");
      [["color", "Color by best ranking"], ["trend", "Trend line"], ["labels", "Label notable players"]].forEach(([k, t]) => {
        const lab = row.append("label").attr("class", "chk");
        lab.append("input").attr("type", "checkbox").property("checked", store.get()[k]).on("change", function () { store.set({ [k]: this.checked }); });
        lab.append("span").text(t);
      });
      const dl = root.append("datalist").attr("id", "names-" + (opts.id || "x"));
      dl.selectAll("option").data(DATA.players.map(p => p.name).sort()).join("option").attr("value", d => d);
      row.append("input").attr("type", "search").attr("class", "search").attr("placeholder", "Find a player…").attr("aria-label", "Find a player").attr("list", "names-" + (opts.id || "x"))
        .on("change", function () { const p = byName.get(this.value); if (p) { store.set({ selected: p.id }); this.value = ""; } });
      row.append("button").attr("class", "chip reset").attr("type", "button").text("Reset").on("click", () => {
        store.set({ measure: "ace", surface: "All", color: true, trend: true, labels: true, selected: null, brush: null, highlight: "none", minMatches: null });
        root.selectAll("input[type=checkbox]").property("checked", true); syncs.forEach(f => f());
      });
    }
    return { sync: () => syncs.forEach(f => f()) };
  }

  window.Aces = { DATA, createStore, Scatter, MatchChart, Dumbbell, Profile, BrushSummary, Insight, Presets, Controls, viewRows, byName, byId, MEASURES, GROUPS, SURF_COLORS };
})();
