# Aces and winning: ATP 2015-2024 (DATA 3302, Assignment 4)

An interactive explorer built with D3 + SVG: **"Which players win by serving big, and which win without it?"**
A scatterplot of 246 ATP players with a measure toggle (ace rate, serve points won, return points won), a court filter,
brushing with a group summary, and a player profile.

- `explorer/` - the page. Open `explorer/index.html` in a browser (no server needed).
- `shared/` - chart components (`charts.js`), styles, and data (`data.js`, built by `scripts/build_data.py`).
- `data/raw/` - Jeff Sackmann's ATP match files, 2015-2024. `data/processed/` - the tables the charts use.
- `scripts/` - `explore_players.py` and `build_master.py` (player tables) and `build_data.py` (chart data).

A view can be set from the address, for example `explorer/?measure=ret&surface=Grass&select=Novak%20Djokovic`.

Data: Jeff Sackmann, *Tennis Abstract* ATP match data (CC BY-NC-SA 4.0), via github.com/Aneeshers/tennis-sackmann-archive.
D3 v7.9.0 (d3js.org).
