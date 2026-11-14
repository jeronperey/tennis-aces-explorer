"""Builds shared/data.js (one JS file with all chart data) from the processed CSVs. Run: python3 scripts/build_data.py"""
import json, os
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
P = lambda f: os.path.join(ROOT, "data", "processed", f)
players = pd.read_csv(P("players_master.csv"))
within = pd.read_csv(P("players_within.csv"))[["player_id", "win_when_outaces", "win_when_outaced", "n_outaces", "n_outaced", "share_matches_outace"]]
surf = pd.read_csv(P("players_master_by_surface.csv"))
players = players.merge(within, on="player_id", how="left")
TIER = {"Peaked top 10": "Top 10", "Peaked 11-50": "11-50", "Peaked 51-100": "51+", "Peaked 100+": "51+"}   # 4 players in 100+ are merged into 51+
r1 = lambda v: None if pd.isna(v) else round(float(v), 1)
out_players = []
for _, p in players.iterrows():
    s = surf[surf.player_id == p.player_id]
    out_players.append({
        "id": int(p.player_id), "name": p.player, "hand": p.hand if isinstance(p.hand, str) else "", "ht": None if pd.isna(p.height) else int(p.height),
        "m": int(p.matches), "win": r1(p.win_pct), "ace": r1(p.ace_pct), "serve": r1(p.serve_pts_won_pct), "ret": r1(p.return_pts_won_pct),
        "rank": r1(p.avg_rank), "best": None if pd.isna(p.best_rank) else int(p.best_rank), "tier": TIER[p.rank_tier],
        "wo": r1(p.win_when_outaces), "wd": r1(p.win_when_outaced), "no": int(p.n_outaces), "nd": int(p.n_outaced), "share": r1(p.share_matches_outace),
        "surf": {r.surface: {"m": int(r.matches), "win": r1(r.win_pct), "ace": r1(r.ace_pct), "serve": r1(r.serve_pts_won_pct), "ret": r1(r.return_pts_won_pct)} for r in s.itertuples()},
    })
bins = pd.read_csv(P("chart5_ace_advantage_win_rates.csv")); bs = pd.read_csv(P("chart6_ace_advantage_by_surface_win_rates.csv"))
match = {"all": [{"bin": r.ace_advantage_bin.replace("-", "–"), "n": int(r.matches), "won": int(r.higher_ace_won), "pct": round(float(r.win_pct), 2)} for r in bins.itertuples()]}
for s in ["Hard", "Clay", "Grass"]:
    match[s] = [{"bin": r.ace_advantage_bin.replace("-", "–"), "n": int(r.matches), "won": int(r.higher_ace_won), "pct": round(float(r.win_pct), 2)} for r in bs[bs.surface == s].itertuples()]
data = {"players": out_players, "match": match,
        "meta": {"matchesAnalyzed": 23723, "matchesInFiles": 27672, "minMatches": 50, "minMatchesSurface": 30, "years": "2015–2024"}}
open(os.path.join(ROOT, "shared", "data.js"), "w").write("const DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
print(len(out_players), "players;", {k: len(v) for k, v in match.items()}, os.path.getsize(os.path.join(ROOT, "shared", "data.js")), "bytes")
print(pd.Series([p["tier"] for p in out_players]).value_counts().to_dict())
