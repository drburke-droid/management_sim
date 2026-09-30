# Front Office: MLB Owner Sim

Buy a big-league franchise and try to make money, which usually means fielding a winner.

Every player in the league is a **real MLB career from 1966–2025**, disguised:

- **Fake names** and no calendar years, birthdates or real IDs.
- **Stats jittered** per player (about ±6% per stat, capped at ±12%), plus a little per-season noise. That breaks exact
  stat-line lookups but can't turn a star into a scrub or vice versa.
- **Careers replay by age.** A player who entered the game at 27 will have his real age-28 season next year, then his
  age-29 season, and so on. He retires when his real career ended. Players still active in 2025 get a projected
  remainder of their career (aging curve + randomness).

## How the game works

- **Start (2026):** each club gets a 25-man roster of 13 position players, 5 starters and 7 relievers. Every player is a
  random real player-season from the last 60 years. Each farm system gets ~22 real future big-leaguers (1–4 years before
  their real debut), plus a few career minor leaguers and AAAA veterans. There's also a small free-agent pool.
- **Standings are WAR.** Each week the depth chart turns your active roster into playing time (lineup by position, a
  5-man rotation, a bullpen). Team strength = Σ(true WAR rate × playing time). Anything the roster can't cover goes to
  replacement level. Games are simulated with log5 odds and home-field advantage. Playing someone out of position costs
  WAR, and injuries come from the player's real missed time.
- **Postseason:** the modern 12-team bracket (Wild Card best of 3, DS best of 5, LCS/WS best of 7).
- **Offseason:** retirements (real careers ending), service time, arbitration and non-tenders, then:
  - **Amateur draft (10 rounds):** each year uses a real draft class (1966–2014), anonymized. You see what clubs saw on
    draft day (position, school level, age, size and the industry board rank), plus your scouts' 20-80 FV grade. Bigger
    scouting budgets see through the noise better. Undrafted players from the class who reached the majors sign with
    random clubs.
  - **International signing period:** real international amateurs from the matching era, with a bonus pool.
  - **Free agency:** make offers; each player signs with the best offer. Unsigned players lower their asks each round.
- **In season:** call-ups and send-downs, releases (guaranteed money becomes dead money), free-agent signings, and trades
  until the deadline (week 18). AI clubs value players by surplus value (projected WAR × $/WAR minus salary over
  the control years), using only visible information. Contenders pay for now, rebuilders for later.
- **Owner economics:** ticket and concession pricing (with demand elasticity), marketing, scouting, player development
  (young players on your club beat or miss their real track), medical (shorter IL stints), local TV deals renegotiated off
  fan interest, national revenue, revenue sharing (48% pool), luxury tax with repeat-offender rates and surcharges, debt
  and interest, and franchise value.

## Running

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine test suite
```

The processed data in `public/data/` is checked in. To rebuild it from source:

```bash
pip install -r pipeline/requirements.txt
npm run data         # downloads raw data to pipeline/raw/ and rebuilds public/data/
```

### Data sources

- Baseball-Reference WAR daily files (`war_daily_bat.txt`, `war_daily_pitch.txt`): WAR, OPS+, ERA+, ages.
- Lahman Baseball Database (via the Lahman R package's data files): counting stats, positions, handedness, size.
- MLB Stats API draft endpoint: every Rule 4 June draft since 1965, linked to careers by MLB ID.

Amateur (high school or college) stats aren't available in any comprehensive public dataset, so draft prospects are
presented with draft-day scouting information and the industry ranking rather than a stat line.

## Layout

```
pipeline/            Python: fetch + build compact JSON data
public/data/         players.json (career templates), drafts.json (draft classes)
src/engine/          game engine (pure TS, no UI)
  career.ts          template -> anonymized, jittered, projected career
  depth.ts           roster -> playing time -> WAR
  season.ts          schedule, weekly sim, injuries, postseason, awards
  finance.ts         revenue / expense model, revenue sharing, luxury tax
  offseason.ts       retirements, contracts, draft, international, free agency
  roster.ts          call-ups, AI roster management
  trade.ts           AI trade evaluation
  value.ts           visible projections, scouting grades, salaries
src/ui/              React screens
tests/               vitest suite
```
