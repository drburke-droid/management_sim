"""Build the compact game data files in public/data/ from pipeline/raw/.

Outputs
  players.json  - one "career template" per real MLB player who appeared in a
                  season >= FIRST_YEAR.  Names, birthdates and real IDs are
                  stripped; the game anonymizes further at new-game time.
  drafts.json   - every Rule 4 June draft class (rounds 1..MAX_ROUND) with the
                  information clubs had on draft day, linked to the career
                  template index when the pick reached the majors.
"""
import csv
import json
import math
import pathlib
import warnings
from collections import defaultdict

import pandas as pd
import rdata

warnings.filterwarnings("ignore")

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

FIRST_YEAR = 1966  # "last 60 years"
LAST_COMPLETE_YEAR = 2025
MAX_ROUND = 25
POS_ORDER = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]
POS_COLS = ["G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_lf", "G_cf", "G_rf", "G_dh"]


def rda(name):
    d = rdata.read_rda(RAW / f"{name}.RData")
    return d[list(d)[0]]


def num(v, default=0.0):
    if v in (None, "", "NULL"):
        return default
    try:
        f = float(v)
    except ValueError:
        return default
    return default if math.isnan(f) else f


def main():
    people = rda("People")
    lahman_to_bbref = dict(zip(people.playerID, people.bbrefID))
    bio = {}
    for r in people.itertuples():
        bio[r.bbrefID] = dict(
            bats=r.bats if isinstance(r.bats, str) and r.bats else "R",
            throws=r.throws if isinstance(r.throws, str) and r.throws else "R",
            height=72 if pd.isna(r.height) or not r.height else int(r.height),
            weight=190 if pd.isna(r.weight) or not r.weight else int(r.weight),
            country=r.birthCountry if isinstance(r.birthCountry, str) else "USA",
        )

    # ---- WAR files (keyed by bbref id) ---------------------------------
    bat_war = defaultdict(lambda: dict(WAR=0.0, PA=0.0, opsw=0.0, age=None, pitcher=False))
    mlb_id = {}
    with open(RAW / "war_bat.txt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            y = int(r["year_ID"])
            if y > LAST_COMPLETE_YEAR:
                continue
            k = (r["player_ID"], y)
            d = bat_war[k]
            pa = num(r["PA"])
            d["WAR"] += num(r["WAR"])
            d["PA"] += pa
            if r["OPS_plus"] not in ("NULL", ""):
                d["opsw"] += num(r["OPS_plus"]) * pa
            d["age"] = int(num(r["age"], 0)) or d["age"]
            d["pitcher"] = r["pitcher"] == "Y"
            if r["mlb_ID"] not in ("", "NULL"):
                mlb_id[r["player_ID"]] = int(r["mlb_ID"])

    pit_war = defaultdict(lambda: dict(WAR=0.0, outs=0.0, eraw=0.0, age=None))
    with open(RAW / "war_pitch.txt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            y = int(r["year_ID"])
            if y > LAST_COMPLETE_YEAR:
                continue
            k = (r["player_ID"], y)
            d = pit_war[k]
            outs = num(r["IPouts"])
            d["WAR"] += num(r["WAR"])
            d["outs"] += outs
            if r["ERA_plus"] not in ("NULL", ""):
                d["eraw"] += min(num(r["ERA_plus"]), 400) * outs
            d["age"] = int(num(r["age"], 0)) or d["age"]
            if r["mlb_ID"] not in ("", "NULL"):
                mlb_id[r["player_ID"]] = int(r["mlb_ID"])

    # ---- Lahman counting stats (keyed by bbref id) ----------------------
    def agg(df, cols):
        out = defaultdict(lambda: defaultdict(float))
        for r in df.itertuples(index=False):
            bb = lahman_to_bbref.get(r.playerID, r.playerID)
            d = out[(bb, int(r.yearID))]
            for c in cols:
                v = getattr(r, c)
                d[c] += 0 if v is None or pd.isna(v) else float(v)
        return out

    bat_cols = ["G", "AB", "R", "H", "X2B", "X3B", "HR", "RBI", "SB", "CS", "BB", "SO", "HBP", "SF", "SH", "IBB"]
    pit_cols = ["G", "GS", "IPouts", "W", "L", "SV", "H", "ER", "HR", "BB", "SO", "BFP"]
    batting = agg(rda("Batting"), bat_cols)
    pitching = agg(rda("Pitching"), pit_cols)
    appearances = agg(rda("Appearances"), ["G_all"] + POS_COLS)

    # ---- which players qualify -----------------------------------------
    seasons_by_player = defaultdict(set)
    for (pid, y) in list(batting) + list(pitching):
        if y <= LAST_COMPLETE_YEAR:
            seasons_by_player[pid].add(y)
    qualifying = sorted(p for p, ys in seasons_by_player.items() if max(ys) >= FIRST_YEAR)
    print("qualifying players", len(qualifying))

    players = []
    index_of_mlb = {}
    for pid in qualifying:
        years = sorted(seasons_by_player[pid])
        tot_pa = tot_outs = 0.0
        pwar = 0.0
        for y in years:
            b = batting.get((pid, y), {})
            tot_pa += b.get("AB", 0) + b.get("BB", 0) + b.get("HBP", 0) + b.get("SF", 0) + b.get("SH", 0)
            p = pitching.get((pid, y), {})
            tot_outs += p.get("IPouts", 0)
            pwar += pit_war.get((pid, y), {}).get("WAR", 0)
        is_pitcher = tot_outs / 3 > tot_pa / 4
        two_way = (not is_pitcher) and tot_outs / 3 >= 300 and tot_pa >= 1500 and pwar >= 5
        hit, pit = [], []
        for y in years:
            age = (bat_war.get((pid, y)) or pit_war.get((pid, y)) or {}).get("age")
            if not age:
                continue
            b = batting.get((pid, y))
            if b and (not is_pitcher):
                bw = bat_war.get((pid, y), {})
                pa = int(b["AB"] + b["BB"] + b["HBP"] + b["SF"] + b["SH"])
                ap = appearances.get((pid, y), {})
                gpos = [ap.get(c, 0) for c in POS_COLS]
                gtot = max(1, sum(gpos))
                prim = max(range(9), key=lambda i: gpos[i]) if sum(gpos) else 8
                mask = 0
                for i, g in enumerate(gpos):
                    if g >= 10 or g >= 0.25 * gtot:
                        mask |= 1 << i
                mask |= 1 << prim
                ops_plus = round(bw["opsw"] / bw["PA"]) if bw.get("PA") else 0
                hit.append([
                    age, y, int(b["G"]), pa, int(b["AB"]), int(b["R"]), int(b["H"]), int(b["X2B"]), int(b["X3B"]),
                    int(b["HR"]), int(b["RBI"]), int(b["SB"]), int(b["CS"]), int(b["BB"]), int(b["SO"]),
                    int(b["HBP"]), int(b["SF"]), ops_plus, round(bw.get("WAR", 0), 2), prim, mask,
                ])
            p = pitching.get((pid, y))
            if p and (is_pitcher or two_way):
                pw = pit_war.get((pid, y), {})
                era_plus = round(pw["eraw"] / pw["outs"]) if pw.get("outs") else 0
                pit.append([
                    age, y, int(p["G"]), int(p["GS"]), int(p["IPouts"]), int(p["W"]), int(p["L"]), int(p["SV"]),
                    int(p["H"]), int(p["ER"]), int(p["HR"]), int(p["BB"]), int(p["SO"]), era_plus,
                    round(pw.get("WAR", 0), 2),
                ])
        if not hit and not pit:
            continue
        b = bio.get(pid, dict(bats="R", throws="R", height=72, weight=190, country="USA"))
        entry = dict(
            r="P" if is_pitcher else ("TW" if two_way else "H"),
            b=b["bats"], t=b["throws"], ht=b["height"], wt=b["weight"],
            intl=0 if b["country"] in ("USA", "CAN") else 1,
            act=1 if max(years) == LAST_COMPLETE_YEAR else 0,
            dr=None,
            hs=hit, ps=pit,
        )
        if pid in mlb_id:
            index_of_mlb[mlb_id[pid]] = len(players)
        players.append(entry)

    # ---- drafts ---------------------------------------------------------
    drafts = {}
    first_draft_of = {}
    for y in range(1965, LAST_COMPLETE_YEAR + 1):
        d = json.loads((RAW / "drafts" / f"{y}.json").read_text(encoding="utf-8"))
        picks = []
        for rd in d["drafts"]["rounds"]:
            for p in rd["picks"]:
                if p["draftType"]["code"] != "JR" or p.get("isPass"):
                    continue
                try:
                    rnd = int(p.get("pickRound", "99"))
                except ValueError:
                    continue
                person = p.get("person") or {}
                # deep rounds: only keep picks who reached the majors
                if rnd > MAX_ROUND and index_of_mlb.get(person.get("id"), -1) < 0:
                    continue
                school = (p.get("school") or {}).get("name", "")
                su = school.upper()
                if " HS" in su or "HIGH SCHOOL" in su or "ACADEMY" in su:
                    level = "HS"
                elif any(t in su for t in (" CC", "JC", "JUNIOR COLLEGE", "COMMUNITY COLLEGE", " C.C.")):
                    level = "JC"
                elif school:
                    level = "4Y"
                else:
                    level = "HS"
                bd = person.get("birthDate")
                if bd:
                    age = y - int(bd[:4]) - (1 if bd[5:] > "06-05" else 0)
                else:
                    age = {"HS": 18, "JC": 20, "4Y": 21}[level]
                ht = person.get("height", "6' 1\"")
                try:
                    ft, inch = ht.replace('"', "").split("'")
                    height = int(ft) * 12 + int(inch.strip() or 0)
                except Exception:
                    height = 73
                pos = (person.get("primaryPosition") or {}).get("abbreviation", "P")
                if pos in ("RHP", "LHP", "TWP"):
                    pos = "P"
                if pos == "OF":
                    pos = "CF"
                idx = index_of_mlb.get(person.get("id"), -1)
                picks.append([
                    p.get("pickNumber") or 0, rnd, level, pos, age,
                    (person.get("batSide") or {}).get("code", "R"),
                    (person.get("pitchHand") or {}).get("code", "R"),
                    height, person.get("weight") or 190, idx,
                ])
                if idx >= 0:
                    # A player may be drafted several times; keep the last one before his debut.
                    first_draft_of[idx] = (y, len(picks) - 1)
        picks.sort(key=lambda x: x[0])
        drafts[y] = picks
    # re-resolve indexes after sort
    link = {}
    for y, picks in drafts.items():
        for j, pk in enumerate(picks):
            if pk[9] >= 0:
                link[pk[9]] = (y, j)
    for idx, (y, j) in link.items():
        players[idx]["dr"] = [y, j]

    # Strip calendar years from hitting/pitching seasons? They are kept only so
    # the game can restrict initial seeding to seasons >= FIRST_YEAR; the UI never
    # displays them.
    meta = dict(
        firstYear=FIRST_YEAR,
        lastYear=LAST_COMPLETE_YEAR,
        hitFields=["age", "year", "G", "PA", "AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "CS", "BB", "SO",
                   "HBP", "SF", "OPS+", "WAR", "pos", "posMask"],
        pitFields=["age", "year", "G", "GS", "IPouts", "W", "L", "SV", "H", "ER", "HR", "BB", "SO", "ERA+", "WAR"],
        draftFields=["overall", "round", "level", "pos", "age", "bats", "throws", "height", "weight", "player"],
        positions=POS_ORDER,
    )
    (OUT / "players.json").write_text(json.dumps(dict(meta=meta, players=players), separators=(",", ":")))
    (OUT / "drafts.json").write_text(json.dumps(dict(meta=meta, drafts=drafts), separators=(",", ":")))
    linked = sum(1 for p in players if p["dr"])
    print(f"players {len(players)} (drafted {linked}, intl {sum(p['intl'] for p in players)}, "
          f"active {sum(p['act'] for p in players)})")
    print("draft picks", sum(len(v) for v in drafts.values()))


if __name__ == "__main__":
    main()
