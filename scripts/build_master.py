"""One table per player (overall) and per player x surface with every measure the interactive chart could switch between:
ace rate, serve points won, return points won, win rate, average ranking and ranking tier, height, hand.
Same raw data as everything else here. Run: python3 build_master.py"""
import glob, os
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
df = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(os.path.join(HERE, "..", "assignment3", "data", "raw", "atp_matches_20*.csv")))])
df = df[df.surface.isin(["Hard", "Clay", "Grass"])]
df = df[~df.score.fillna("").str.upper().str.contains(r"RET|W/O|DEF|ABD|UNP")]
df = df.dropna(subset=["w_ace","l_ace","w_svpt","l_svpt","w_1stWon","w_2ndWon","l_1stWon","l_2ndWon"])
df = df[(df.w_svpt > 0) & (df.l_svpt > 0)]
def side(p, won):
    o = "l" if p == "w" else "w"; n = "winner" if p == "w" else "loser"
    return pd.DataFrame({"player_id": df[f"{n}_id"], "player": df[f"{n}_name"], "hand": df[f"{n}_hand"], "height": df[f"{n}_ht"],
        "rank": df[f"{n}_rank"], "surface": df.surface, "won": won, "aces": df[f"{p}_ace"], "svpt": df[f"{p}_svpt"],
        "sv_won": df[f"{p}_1stWon"] + df[f"{p}_2ndWon"], "opp_svpt": df[f"{o}_svpt"], "opp_sv_won": df[f"{o}_1stWon"] + df[f"{o}_2ndWon"]})
pm = pd.concat([side("w", 1), side("l", 0)])

def table(keys, min_matches):
    g = pm.groupby(keys).agg(player=("player","first"), hand=("hand","first"), height=("height","first"), matches=("won","size"),
        wins=("won","sum"), aces=("aces","sum"), svpt=("svpt","sum"), sv_won=("sv_won","sum"), opp_svpt=("opp_svpt","sum"),
        opp_sv_won=("opp_sv_won","sum"), avg_rank=("rank","mean"), best_rank=("rank","min")).reset_index()
    g = g[g.matches >= min_matches].copy()
    g["win_pct"] = 100 * g.wins / g.matches
    g["ace_pct"] = 100 * g.aces / g.svpt
    g["serve_pts_won_pct"] = 100 * g.sv_won / g.svpt
    g["return_pts_won_pct"] = 100 * (g.opp_svpt - g.opp_sv_won) / g.opp_svpt
    g["rank_tier"] = pd.cut(g.best_rank, [0, 10, 50, 100, 10000], labels=["Peaked top 10", "Peaked 11-50", "Peaked 51-100", "Peaked 100+"])
    return g.drop(columns=["aces","svpt","sv_won","opp_svpt","opp_sv_won"])

overall = table(["player_id"], 50); overall.to_csv(os.path.join(HERE, "out", "players_master.csv"), index=False)
surf = table(["player_id", "surface"], 30); surf.to_csv(os.path.join(HERE, "out", "players_master_by_surface.csv"), index=False)
print("overall:", len(overall), "players | by surface:", len(surf), "rows | players missing avg_rank:", int(overall.avg_rank.isna().sum()))
print("\nby ranking tier (overall table):")
print(overall.groupby("rank_tier", observed=True)[["ace_pct","serve_pts_won_pct","return_pts_won_pct","win_pct"]].agg(["mean"]).round(1).assign(n=overall.groupby("rank_tier", observed=True).size()).to_string())
top = overall[overall.rank_tier == "Peaked top 10"]
print("\nPlayers who reached top 10 (best ranking), by ace rate:"); print(top.sort_values("ace_pct", ascending=False)[["player","ace_pct","return_pts_won_pct","win_pct","avg_rank"]].head(10).round(1).to_string(index=False))
print("\ncorr(ace_pct, avg_rank):", round(overall.ace_pct.corr(overall.avg_rank), 3), " corr(return_pts_won_pct, avg_rank):", round(overall.return_pts_won_pct.corr(overall.avg_rank), 3))
