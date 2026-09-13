/*
  Shared model for the High scavenger hunt.

  A puzzle is an ordered list of artwork images. Each image has one answer --
  either the artist's name or the title of the work -- and each answer
  contributes one letter to the puzzle's clue word. Answer N supplies the Nth
  letter of the clue, so the grid reads top-to-bottom once every row is aligned.
*/

const HM = (() => {

  /* Grid cells hold A-Z only: spaces, punctuation and accents are stripped. */
  const normalize = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');

  const PROMPTS = { artist: 'Artist Last Name', work: 'Name of Work' };
  const promptFor = (item) => PROMPTS[item && item.prompt] || PROMPTS.work;

  /*
    Where does this row's clue letter sit?
    `clueIndex` is chosen in the builder; fall back to the first match so a
    hand-written JSON file still aligns without one.
  */
  function clueIndexFor(item, clueLetter) {
    const answer = normalize(item.answer);
    const letter = normalize(clueLetter);
    if (typeof item.clueIndex === 'number' &&
        answer[item.clueIndex] === letter) return item.clueIndex;
    return answer.indexOf(letter);
  }

  /*
    Lay the rows out so every clue letter shares one column.
    Returns the column index of the clue and each row's offset from the left.
  */
  function layout(puzzle) {
    const clue = normalize(puzzle.clue);
    const items = puzzle.items || [];
    const rows = items.map((item, i) => {
      const answer = normalize(item.answer);
      const letter = clue[i] || '';
      const at = clueIndexFor(item, letter);
      return { answer, letter, clueIndex: at, length: answer.length };
    });

    // The clue column sits as far right as the longest prefix demands.
    const clueCol = rows.reduce((m, r) => Math.max(m, r.clueIndex < 0 ? 0 : r.clueIndex), 0);
    let width = 0;
    rows.forEach((r) => {
      r.offset = r.clueIndex < 0 ? 0 : clueCol - r.clueIndex;
      width = Math.max(width, r.offset + r.length);
    });

    return { clue, clueCol, width, rows };
  }

  /* An answer is only usable if it contains the clue letter it must supply. */
  function validateItem(item, clueLetter) {
    const answer = normalize(item.answer);
    const letter = normalize(clueLetter);
    if (!answer) return { ok: false, reason: 'no answer yet' };
    if (!letter) return { ok: false, reason: 'no clue letter for this row' };
    const positions = [];
    for (let i = 0; i < answer.length; i++) if (answer[i] === letter) positions.push(i);
    if (!positions.length) {
      return { ok: false, reason: `“${answer}” has no letter ${letter}`, positions };
    }
    return { ok: true, positions };
  }

  /* Compare a player's typed guess against the stored answer. */
  function isCorrect(guess, answer) {
    return normalize(guess) === normalize(answer) && normalize(answer).length > 0;
  }

  function slugify(s) {
    return (s || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  return { normalize, promptFor, PROMPTS, clueIndexFor, layout, validateItem, isCorrect, slugify };
})();

if (typeof module !== 'undefined') module.exports = HM;
