"""Download raw source data into pipeline/raw/.

Sources:
  * Baseball-Reference WAR daily files (per player-season-stint WAR, salary, OPS+/ERA+)
  * Lahman database (via the Lahman R package's .RData files) for traditional counting stats
  * MLB Stats API draft endpoint for every Rule 4 draft since 1965
"""
import json
import pathlib
import time
import urllib.request

RAW = pathlib.Path(__file__).parent / "raw"
RAW.mkdir(exist_ok=True)

FILES = {
    "war_bat.txt": "https://www.baseball-reference.com/data/war_daily_bat.txt",
    "war_pitch.txt": "https://www.baseball-reference.com/data/war_daily_pitch.txt",
}
LAHMAN = ["Batting", "Pitching", "People", "Appearances"]
LAHMAN_URL = "https://raw.githubusercontent.com/cdalzell/Lahman/master/data/{}.RData"
DRAFT_URL = "https://statsapi.mlb.com/api/v1/draft/{}"
DRAFT_YEARS = range(1965, 2026)


def fetch(url: str, dest: pathlib.Path, force: bool = False) -> None:
    if dest.exists() and not force:
        return
    print("GET", url)
    req = urllib.request.Request(url, headers={"User-Agent": "management-sim-data-pipeline"})
    with urllib.request.urlopen(req, timeout=180) as r:
        dest.write_bytes(r.read())
    time.sleep(0.5)


def main() -> None:
    for name, url in FILES.items():
        fetch(url, RAW / name)
    for t in LAHMAN:
        fetch(LAHMAN_URL.format(t), RAW / f"{t}.RData")
    drafts = RAW / "drafts"
    drafts.mkdir(exist_ok=True)
    for y in DRAFT_YEARS:
        fetch(DRAFT_URL.format(y), drafts / f"{y}.json")
    # sanity check
    for y in DRAFT_YEARS:
        json.loads((drafts / f"{y}.json").read_text(encoding="utf-8"))
    print("done")


if __name__ == "__main__":
    main()
