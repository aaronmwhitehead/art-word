# High Museum Gallery Hunt

A scavenger hunt for events at the High Museum of Art. Each team gets its own
link. Their page shows a column of artwork photographs with no titles, artists or
locations — they have to find each work in the galleries and name it.

Naming a work fills a row in the grid at the top of the page. When every row is
filled, the rows slide sideways to align on a hidden **clue word**. Each team
carries their clue word to the final puzzle.

Static site — no database, no auth, no build step. Designed for GitHub Pages.

## Layout

```
index.html            the player (reads ?p=<slug>)
builder.html          the puzzle builder
assets/
  high.css            shared styling, High brand tokens
  acrostic.js         answer normalising, clue alignment, validation
  player.js           player runtime
  builder.js          builder runtime
  images/             artwork photographs
puzzles/
  index.json          the list shown on the home page
  team-*.json         one file per team
```

## The event

Five team puzzles, whose clue words reassemble into the final phrase:

| Puzzle | Clue word | Works | Highlight |
|---|---|---|---|
| `team-gift` | GIFT | 4 | `#f0956a` |
| `team-shop` | SHOP | 4 | `#7b8fd0` |
| `team-iwon` | IWON | 4 | `#cfeaaa` |
| `team-art`  | ART  | 3 | `#f8ce8f` |
| `team-word` | WORD | 4 | `#a996d8` |

Together: **GIFT SHOP — I WON ART WORD**. Teams combine their clue words, work
out the phrase, then tell the gift shop clerk the passphrase *"I won art word"*
to claim a prize.

The clue words are grouped so every team gets a 3–4 row grid. Splitting them
exactly as spoken would leave one team with a single-row "I" puzzle, which is no
puzzle at all — `IWON` keeps that letter in play while staying the right size.

## Making a puzzle

1. Put the artwork photographs in `assets/images/`.
2. Open `builder.html`.
3. Set the title and the **URL slug** — this is the `?p=` value and the filename.
4. Set the **clue word**. You need one artwork per letter.
5. Pick the **clue highlight colour** — one colour used for every letter of this
   puzzle's clue word. Use a preset swatch, the colour picker, or type a hex.
   Letters flip between black and white automatically so they stay readable.
6. For each artwork: give the image path, choose whether the player is asked for
   **Name of Work** or **Artist Last Name**, and type the answer.
7. **Download JSON** into `puzzles/`, add it to `puzzles/index.json`, and commit.

The builder enforces the one rule that makes the puzzle work: **row N's answer
must contain letter N of the clue word.** If it doesn't, it says so and won't let
you add it. When a letter appears more than once in an answer (the two T's in
UNTITLED) it asks which one should line up.

Use the ↑ ↓ buttons to reorder works — the clue letters stay with their position,
so reordering can invalidate rows. Anything broken is flagged in red.

**Test puzzle** opens the real player without publishing. Work in progress is
kept in the browser, so a refresh won't lose a draft; **Load existing** takes a
published puzzle's JSON back into the builder.

## Answers

Answers are compared letters-only: case, spaces, punctuation and accents are all
ignored, so `van gogh`, `Van Gogh` and `VAN-GOGH` all pass. The two prompts are
**Name of Work** and **Artist Last Name** — for an artist, the answer should be
the surname alone (`Pissarro`, not `Camille Pissarro`). They are
shown in the grid the same way, one letter per square, with no gaps between
words.

Keep answers reasonably short. A 12-letter answer is about the practical limit
before squares get small on a phone.

## Playing

Give each team a link like `https://<you>.github.io/high-art/?p=team-art`.

- Tap a piece to open it: a close button sits top right and the answer box is at
  the bottom. The answer's length is shown above it — `11 LETTERS (6, 5)` for a
  two-word answer. Pinch to zoom into the image; tapping it does nothing, so a
  stray tap while typing can't disturb the view.
- A wrong answer shakes and turns red; the popup stays open to try again.
- A correct answer turns green, dismisses the keyboard, closes the popup, and
  drops the letters into that row one at a time.
- Filling the last row plays the finale: the grid scrolls into view, the rows
  slide into alignment, everything but the clue column dims, and the clue
  letters light up in turn. Scrolling and tapping are blocked for its duration
  so it can't be interrupted, then released. The highlighted column is the whole
  payoff — there is no banner or explanatory text after it.
- Progress is saved per puzzle in that browser, so a locked phone loses nothing.

The player is never told what the clue word is for, that clue words combine, or
that other teams exist. The grid simply reveals the word and stops. Keep it that
way in the intro text if you edit it — brief the teams in person instead.

## Placeholder images

`assets/images/piece-*.svg` are abstract placeholders so the app is usable before
real photography exists. Replace them with gallery photographs and update the
`image` paths.

Photograph the work itself — not the wall label — or the answer is given away.

## Publishing to GitHub Pages

Push to `main`, then Settings → Pages → deploy from `main` / root. The included
`.nojekyll` stops Jekyll from interfering.

## Design

Styling follows the High's public site (2026 brand refresh): Martina Plantijn for
headlines, Theinhardt for functional copy, `#f00a00` red, `#4d4d4d` ink, hairline
rules. The brand faces are licensed and not bundled here, so the stacks fall back
to the substitutes the High's own guidelines specify — Times New Roman and Arial.
If you have the licensed webfonts, drop them in `assets/fonts/` and add the
matching `@font-face` rules.
