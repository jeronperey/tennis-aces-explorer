"""Player-level exploration of ATP ace data (2015-2024) for Assignment 4 / 5 / Final.

Reads the raw Sackmann files kept in ../assignment3/data/raw, builds one row per player-match,
applies the same exclusions as Assignments 2 and 3 (other surface, unfinished, missing ace/serve data),
and writes player tables to out/.  Run:  python3 explore_players.py
"""
import glob, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "assignment3", "data", "raw", "atp_matches_20*.csv")
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
MIN_MATCHES = 50   # per player (overall); per-surface tables use a lower bar

df = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(RAW))], ignore_index=True)
n_all = len(df)
df = df[df.surface.isin(["Hard", "Clay", "Grass"])]
df = df[~df.score.fillna("").str.upper().str.contains(r"RET|W/O|DEF|ABD|UNP")]
df = df.dropna(subset=["w_ace", "l_ace", "w_svpt", "l_svpt"])
df = df[(df.w_svpt > 0) & (df.l_svpt > 0)]
df["year"] = df.tourney_date.astype(str).str[:4].astype(int)
print(f"{n_all} matches in files -> {len(df)} usable (ties NOT removed here: player-level view keeps them)")

def side(prefix, won):
    o = "l" if prefix == "w" else "w"
    return pd.DataFrame({
        "player_id": df[f"{'winner' if prefix=='w' else 'loser'}_id"], "player": df[f"{'winner' if prefix=='w' else 'loser'}_name"],
        "hand": df[f"{'winner' if prefix=='w' else 'loser'}_hand"], "height": df[f"{'winner' if prefix=='w' else 'loser'}_ht"],
        "surface": df.surface, "year": df.year, "won": won, "aces": df[f"{prefix}_ace"], "svpt": df[f"{prefix}_svpt"],
        "opp_aces": df[f"{o}_ace"], "tourney_level": df.tourney_level,
    })
pm = pd.concat([side("w", 1), side("l", 0)], ignore_index=True)
pm.to_csv(os.path.join(OUT, "player_matches.csv"), index=False)

def summarize(g):
    return pd.Series({"matches": len(g), "wins": g.won.sum(), "win_pct": 100 * g.won.mean(),
                      "aces_per_match": g.aces.mean(), "ace_pct": 100 * g.aces.sum() / g.svpt.sum(),
                      "opp_aces_per_match": g.opp_aces.mean(),
                      "height": g.height.dropna().iloc[0] if g.height.notna().any() else float("nan"),
                      "hand": g.hand.dropna().iloc[0] if g.hand.notna().any() else ""})
players = pm.groupby(["player_id", "player"]).apply(summarize, include_groups=False).reset_index()
players = players[players.matches >= MIN_MATCHES].copy()
players.to_csv(os.path.join(OUT, "players.csv"), index=False)

by_surface = pm.groupby(["player_id", "player", "surface"]).apply(summarize, include_groups=False).reset_index()
by_surface = by_surface[by_surface.matches >= 20]
by_surface.to_csv(os.path.join(OUT, "players_by_surface.csv"), index=False)
by_year = pm.groupby(["player_id", "player", "year"]).apply(summarize, include_groups=False).reset_index()
by_year = by_year[by_year.matches >= 10]
by_year.to_csv(os.path.join(OUT, "players_by_year.csv"), index=False)

# ---- findings printed for findings.md ----
corr = lambda a, b: a.corr(b)
print(f"\nplayers with >= {MIN_MATCHES} matches: {len(players)}")
print("corr(ace_pct, win_pct):", round(corr(players.ace_pct, players.win_pct), 3))
print("corr(aces_per_match, win_pct):", round(corr(players.aces_per_match, players.win_pct), 3))
print("corr(height, ace_pct):", round(players.height.corr(players.ace_pct), 3))
print("ace_pct quartiles:", players.ace_pct.quantile([.1, .25, .5, .75, .9]).round(1).to_dict())
for s in ["Hard", "Clay", "Grass"]:
    b = by_surface[(by_surface.surface == s) & (by_surface.matches >= 30)]
    print(f"{s}: players={len(b)} corr(ace_pct,win_pct)={b.ace_pct.corr(b.win_pct):.3f} mean ace_pct={b.ace_pct.mean():.1f}")
print("\nhand mean ace_pct:", players.groupby("hand").ace_pct.mean().round(2).to_dict())

import numpy as np
slope, icpt = np.polyfit(players.ace_pct, players.win_pct, 1)
players["resid"] = players.win_pct - (slope * players.ace_pct + icpt)
print(f"\nfit: win_pct = {slope:.2f} * ace_pct + {icpt:.1f}   (each +1 pt of ace_pct ~ +{slope:.1f} pts of win_pct)")
cols = ["player", "matches", "ace_pct", "aces_per_match", "win_pct", "height"]
print("\nTOP 12 by ace_pct"); print(players.sort_values("ace_pct", ascending=False)[cols].head(12).round(1).to_string(index=False))
print("\nTOP 12 by win_pct"); print(players.sort_values("win_pct", ascending=False)[cols].head(12).round(1).to_string(index=False))
print("\nBIG SERVERS WHO UNDER-WIN (most negative residual among top-quartile ace_pct)")
hi = players[players.ace_pct >= players.ace_pct.quantile(.75)]
print(hi.sort_values("resid")[cols + ["resid"]].head(8).round(1).to_string(index=False))
print("\nOVER-WINNERS (most positive residual among bottom-half ace_pct)")
lo = players[players.ace_pct <= players.ace_pct.median()]
print(lo.sort_values("resid", ascending=False)[cols + ["resid"]].head(8).round(1).to_string(index=False))

# surface swing: same player's ace_pct on grass vs clay
piv = by_surface.pivot(index="player", columns="surface", values="ace_pct").dropna(subset=["Grass", "Clay"])
piv["grass_vs_clay"] = piv.Grass - piv.Clay
print("\nmean ace_pct by surface (players with both):", piv[["Hard", "Clay", "Grass"]].mean().round(1).to_dict())
print("biggest grass-vs-clay swings:"); print(piv.sort_values("grass_vs_clay", ascending=False).head(6).round(1).to_string())
# year trend of ace_pct overall
yr = pm.groupby("year").apply(lambda g: 100 * g.aces.sum() / g.svpt.sum(), include_groups=False).round(2)
print("\naggregate ace_pct by year:", yr.to_dict())
players.to_csv(os.path.join(OUT, "players.csv"), index=False)

# ---- within-player view: does a player win more in the matches where THEY out-ace the opponent? ----
pm2 = pm[pm.aces != pm.opp_aces].copy()
pm2["out_aced"] = (pm2.aces > pm2.opp_aces).astype(int)
big = players.player_id
w = pm2[pm2.player_id.isin(big)].groupby(["player_id", "player", "out_aced"]).won.agg(["mean", "size"]).unstack("out_aced")
w.columns = ["win_when_outaced", "win_when_outaces", "n_outaced", "n_outaces"]
w = w.reset_index()
w["win_when_outaced"] *= 100; w["win_when_outaces"] *= 100
w["share_matches_outace"] = 100 * w.n_outaces / (w.n_outaces + w.n_outaced)
w = w.merge(players[["player_id", "ace_pct", "win_pct"]], on="player_id")
w.to_csv(os.path.join(OUT, "players_within.csv"), index=False)
print("\nWITHIN-PLAYER: win% when out-aced vs when out-acing (players with >=50 matches, ties dropped)")
print("mean win% when player out-aces opponent:", round(w.win_when_outaces.mean(), 1), " when out-aced:", round(w.win_when_outaced.mean(), 1))
print("players who win more when they out-ace opponent:", int((w.win_when_outaces > w.win_when_outaced).sum()), "of", len(w))
print("corr(share of matches player out-aces opp, overall win_pct):", round(w.share_matches_outace.corr(w.win_pct), 3))
show = w[w.player.isin(["Ivo Karlovic", "John Isner", "Reilly Opelka", "Milos Raonic", "Novak Djokovic", "Rafael Nadal", "Carlos Alcaraz", "Roger Federer"])]
print(show[["player", "win_when_outaces", "win_when_outaced", "share_matches_outace", "win_pct"]].round(1).to_string(index=False))
