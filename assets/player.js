/*
  Player runtime. Reads ?p=<slug>, loads puzzles/<slug>.json, shows a column of
  artwork images and an answer grid. Solving a piece fills its row; solving all
  of them shifts the rows into alignment and reveals the clue word.
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    slug: null,
    puzzle: null,
    layout: null,
    solved: [],        // answer string per item, '' while unsolved
    openIndex: -1,
    hintsShown: [],
    storeKey: null,
    revealed: false,
  };

  /* ---------- boot ---------- */

  function showMessage(title, bodyHtml) {
    $('stateMsg').innerHTML = `<h1>${title}</h1>${bodyHtml}`;
    $('stateMsg').hidden = false;
    $('puzzleWrap').hidden = true;
  }

  async function boot() {
    const slug = (new URLSearchParams(location.search).get('p') || '').trim();
    if (!slug) return showIndex();

    state.slug = slug;
    state.storeKey = 'hm-hunt:' + slug;

    // The builder's "Test puzzle" stashes a draft rather than publishing it.
    if (slug === '__preview__') {
      let draft = null;
      try { draft = JSON.parse(sessionStorage.getItem('hm-hunt:preview') || 'null'); } catch (_) {}
      if (!draft) return showMessage('No preview loaded',
        '<p>Open a preview from the <a href="builder.html">puzzle builder</a>.</p>');
      return initPuzzle(draft);
    }

    if (!/^[a-z0-9-]+$/i.test(slug)) {
      return showMessage('Puzzle not found', '<p>That puzzle link looks malformed.</p>');
    }

    let data;
    try {
      const res = await fetch(`puzzles/${slug}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (_) {
      return showMessage('Puzzle not found',
        `<p>There&rsquo;s no puzzle at <code>?p=${escapeHtml(slug)}</code>. Check the link, or ` +
        `<a href="./">see all puzzles</a>.</p>`);
    }
    initPuzzle(data);
  }

  async function showIndex() {
    let list = [];
    try {
      const res = await fetch('puzzles/index.json', { cache: 'no-cache' });
      if (res.ok) list = (await res.json()).puzzles || [];
    } catch (_) {}

    if (!list.length) {
      return showMessage('Gallery Hunt',
        '<p>Open your puzzle with the link your host gave you &mdash; it looks like ' +
        '<code>?p=team-red</code>.</p><p><a href="builder.html">Build a puzzle &rarr;</a></p>');
    }

    const items = list.map((p) =>
      `<li><a href="?p=${encodeURIComponent(p.slug)}">${escapeHtml(p.title || p.slug)}` +
      (p.location ? `<span class="meta">${escapeHtml(p.location)}</span>` : '') + `</a></li>`).join('');

    showMessage('Gallery Hunt',
      `<p>Choose your hunt.</p><ul class="hunt-list">${items}</ul>`);
  }

  function initPuzzle(data) {
    state.puzzle = data;
    if (!data.items || !data.items.length) {
      return showMessage('Empty puzzle', '<p>This puzzle has no artworks in it yet.</p>');
    }

    state.layout = HM.layout(data);
    state.solved = data.items.map(() => '');

    document.title = `${data.title || 'Puzzle'} | High Museum Gallery Hunt`;
    $('puzzleTitle').textContent = data.title || 'Puzzle';
    $('puzzleEyebrow').textContent = data.eyebrow || 'Scavenger Hunt';
    $('headerMeta').textContent = data.location || 'Gallery Hunt';
    $('footerSlug').textContent = state.slug === '__preview__' ? 'preview' : (state.slug || '');
    if (data.intro) $('puzzleIntro').textContent = data.intro; else $('puzzleIntro').remove();

    restore();
    renderPieces();
    renderGrid();
    $('puzzleWrap').hidden = false;

    // Restored a finished puzzle: show it already aligned, no animation.
    if (isComplete()) revealClue(true);
  }

  /* ---------- answer grid ---------- */

  function sizeSquares() {
    // Width must account for each row's alignment offset, not just its length:
    // an offset row extends further right than its letter count suggests.
    const width = Math.max(1, ...state.layout.rows.map((r) => r.offset + r.length));
    const gap = 5;
    const avail = Math.min(window.innerWidth - 34, 680);
    const size = Math.max(14, Math.min(38, Math.floor((avail - (width - 1) * gap) / width)));
    $('agrid').style.setProperty('--sq', size + 'px');
  }

  /*
    Rows are rendered at their aligned offsets only once the puzzle is solved.
    Until then every row sits flush left, so the shift is visible at the end.
  */
  function renderGrid() {
    const grid = $('agrid');
    grid.innerHTML = '';
    sizeSquares();

    state.layout.rows.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = 'arow';
      el.dataset.row = i;

      const answer = state.solved[i];
      const cells = answer ? HM.normalize(answer).length : row.length;

      for (let c = 0; c < cells; c++) {
        const sq = document.createElement('div');
        sq.className = 'sq';
        if (answer) {
          sq.textContent = HM.normalize(answer)[c];
          if (state.revealed && c === row.clueIndex) {
            sq.classList.add('is-clue');
            sq.style.background = clueColor();
            sq.style.color = textOn(clueColor());
          }
        } else {
          sq.classList.add('is-pending');
        }
        el.appendChild(sq);
      }
      grid.appendChild(el);
    });

    applyOffsets(state.revealed);
  }

  /* Shift each row so its clue letter sits in the shared column. */
  function applyOffsets(on, animate) {
    const size = parseFloat(getComputedStyle($('agrid')).getPropertyValue('--sq')) || 34;
    const step = size + 5;

    [...$('agrid').children].forEach((el, i) => {
      const row = state.layout.rows[i];
      const pad = on ? row.offset * step : 0;

      if (animate && pad) {
        // Apply the real offset immediately so the grid measures correctly,
        // then slide in from the old position using a transform that is
        // cleared on the next frame.
        el.style.transform = `translateX(${-pad}px)`;
        el.style.marginLeft = pad + 'px';
        requestAnimationFrame(() => {
          // Stagger each row so they arrive in sequence rather than as a block.
          el.style.transitionDelay = (i * 110) + 'ms';
          el.classList.add('is-shifting');
          el.style.transform = 'translateX(0)';
        });
      } else {
        el.style.marginLeft = pad + 'px';
        el.style.transform = 'translateX(0)';
      }
    });
  }

  /* One colour for the whole clue word, set per puzzle in the builder. */
  function clueColor() {
    return (state.puzzle && state.puzzle.clueColor) || '#f8ce8f';
  }

  /* Keep the letter legible whether the chosen colour is light or dark. */
  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#000';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    // Relative luminance, rounded to the usual sRGB coefficients.
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
  }

  function isComplete() {
    return state.solved.length > 0 && state.solved.every((a) => !!a);
  }

  /* ---------- pieces ---------- */

  function renderPieces() {
    const wrap = $('pieces');
    wrap.innerHTML = '';

    state.puzzle.items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'piece' + (state.solved[i] ? ' is-solved' : '');
      btn.dataset.index = i;
      btn.setAttribute('aria-label', `Artwork ${i + 1}${state.solved[i] ? ', solved' : ''}`);

      const img = document.createElement('img');
      img.src = item.image || '';
      img.alt = `Artwork ${i + 1}`;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('div'), {
          className: 'hm-help',
          style: 'padding:36px 14px;text-align:center',
          textContent: `Image missing: ${item.image || '(none)'}`,
        }));
      });

      const num = document.createElement('span');
      num.className = 'piece-num';
      num.textContent = i + 1;

      const tag = document.createElement('span');
      tag.className = 'piece-solved-tag';
      tag.textContent = state.solved[i] ? `✓ ${state.solved[i]}` : '';

      btn.append(num, img, tag);
      btn.addEventListener('click', () => openModal(i));
      wrap.appendChild(btn);
    });
  }

  /* ---------- modal ---------- */

  function openModal(i) {
    const item = state.puzzle.items[i];
    state.openIndex = i;

    $('modalImg').src = item.image || '';
    $('modalImg').alt = `Artwork ${i + 1}`;
    $('modalPrompt').textContent = HM.promptFor(item);
    $('letterCount').textContent = letterHint(item.answer);
    showHint(i, state.hintsShown.includes(i));
    $('answerInput').value = state.solved[i] || '';
    setAnswerState('');

    $('modal').classList.add('is-open');
    document.body.style.overflow = 'hidden';
    // Don't auto-focus on touch: it throws up the keyboard over the artwork.
    if (!matchMedia('(hover: none)').matches) setTimeout(() => $('answerInput').focus(), 60);
  }

  /*
    How long is the answer? Multi-word answers show the split, since "6, 5" is
    far more useful at the label than a bare "11 letters".
  */
  function letterHint(answer) {
    const words = String(answer || '').trim().split(/[\s-]+/)
      .map((w) => HM.normalize(w).length).filter(Boolean);
    if (!words.length) return '';
    const total = words.reduce((a, b) => a + b, 0);
    return words.length > 1
      ? `${total} letters (${words.join(', ')})`
      : `${total} letter${total === 1 ? '' : 's'}`;
  }

  /*
    The hint is opt-in: the button is offered only when the item has one, and
    swaps itself for the text once asked for.
  */
  function showHint(index, reveal) {
    const item = state.puzzle.items[index];
    const hint = (item && item.hint || '').trim();
    const btn = $('hintBtn');
    const text = $('hintText');

    if (!hint) { btn.hidden = true; text.hidden = true; return; }

    btn.hidden = !!reveal;
    text.hidden = !reveal;
    text.textContent = reveal ? hint : '';
  }

  $('hintBtn').addEventListener('click', () => {
    const i = state.openIndex;
    if (i < 0) return;
    if (!state.hintsShown.includes(i)) state.hintsShown.push(i);
    showHint(i, true);
    persist();
  });

  function closeModal() {
    const modal = $('modal');
    modal.classList.add('is-closing');
    $('answerInput').blur();
    setTimeout(() => {
      modal.classList.remove('is-open', 'is-closing');
      document.body.style.overflow = '';
      state.openIndex = -1;
    }, 200);
  }

  function setAnswerState(kind, msg) {
    const input = $('answerInput');
    const note = $('answerMsg');
    input.classList.remove('is-wrong', 'is-right');
    note.classList.remove('is-wrong', 'is-right');
    note.textContent = msg || '';
    if (kind) { input.classList.add('is-' + kind); note.classList.add('is-' + kind); }
  }

  function submitAnswer(ev) {
    ev.preventDefault();
    const i = state.openIndex;
    if (i < 0) return;

    const item = state.puzzle.items[i];
    const guess = $('answerInput').value;
    if (!HM.normalize(guess)) return;

    if (!HM.isCorrect(guess, item.answer)) {
      setAnswerState('');
      // Restart the shake even on repeated wrong guesses.
      void $('answerInput').offsetWidth;
      setAnswerState('wrong', 'Not quite — look again.');
      try { navigator.vibrate && navigator.vibrate(60); } catch (_) {}
      return;
    }

    setAnswerState('right', 'Correct');
    $('answerInput').blur();               // dismiss the keyboard
    state.solved[i] = HM.normalize(item.answer);
    persist();

    setTimeout(() => {
      closeModal();
      renderPieces();

      // The player may be well down the list of works. Bring the grid into view
      // before the letters drop, so the animation they just earned is actually
      // seen. On the final answer the reveal handles its own scrolling.
      const complete = isComplete();
      const delay = scrollToGrid() ? 420 : 0;

      setTimeout(() => {
        fillRow(i);
        if (complete) setTimeout(() => revealClue(false), 620);
      }, delay);
    }, 420);
  }

  /*
    Scroll the answer grid into view. Returns true if the page actually had to
    move, so callers can wait for it before animating.
  */
  function scrollToGrid() {
    const grid = $('agrid');
    if (!grid) return false;
    const rect = grid.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (fullyVisible) return false;
    grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  /* Drop the solved letters into the grid one square at a time. */
  function fillRow(i) {
    const rowEl = $('agrid').children[i];
    if (!rowEl) return renderGrid();
    const letters = HM.normalize(state.solved[i]);

    rowEl.innerHTML = '';
    [...letters].forEach((ch, c) => {
      const sq = document.createElement('div');
      sq.className = 'sq is-drop';
      sq.textContent = ch;
      sq.style.animationDelay = (c * 70) + 'ms';
      rowEl.appendChild(sq);
    });

    // A flash sweeping along the row once the letters have landed.
    const settle = letters.length * 70 + 340;
    setTimeout(() => {
      [...rowEl.children].forEach((sq, c) => {
        sq.classList.remove('is-drop');
        sq.style.animationDelay = (c * 45) + 'ms';
        sq.classList.add('is-settle');
      });
    }, settle);
  }

  /*
    The finale. Rows slide into alignment, the clue column lights up letter by
    letter, and the rest of the grid dims so the word stands alone. Input is
    locked for the duration so a stray tap or scroll can't interrupt it.
  */
  function revealClue(instant) {
    state.revealed = true;
    const grid = $('agrid');

    if (instant) { renderGrid(); return; }

    // Bring the grid into view first, then pin the page there.
    const moved = scrollToGrid();

    setTimeout(() => {
      lockInput(true);
      applyOffsets(true, true);

      // Dim the non-clue letters so the eye is led to the column.
      setTimeout(() => {
        state.layout.rows.forEach((row, i) => {
          const rowEl = grid.children[i];
          if (!rowEl) return;
          [...rowEl.children].forEach((sq, c) => {
            if (c !== row.clueIndex) sq.classList.add('is-dim');
          });
        });
      }, 1180);

      // Then light each clue square in turn, top to bottom.
      state.layout.rows.forEach((row, i) => {
        setTimeout(() => {
          const sq = grid.children[i] && grid.children[i].children[row.clueIndex];
          if (!sq) return;
          sq.classList.add('is-clue', 'is-reveal');
          sq.style.background = clueColor();
          sq.style.color = textOn(clueColor());
        }, 1400 + i * 260);
      });

      const total = 1400 + state.layout.rows.length * 260 + 500;
      setTimeout(() => lockInput(false), total);
    }, moved ? 620 : 120);
  }

  /* Block scrolling and pointer input while the finale plays. */
  let lockedScrollY = 0;
  function lockInput(on) {
    document.body.classList.toggle('is-locked', on);
    if (on) {
      // overflow:hidden alone doesn't hold the page when the documentElement is
      // the scroller, so pin the body at the current offset instead.
      lockedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    } else {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, lockedScrollY);
    }
    if (on) {
      window.addEventListener('wheel', preventScroll, { passive: false });
      window.addEventListener('touchmove', preventScroll, { passive: false });
      window.addEventListener('keydown', preventKeys, true);
    } else {
      window.removeEventListener('wheel', preventScroll, { passive: false });
      window.removeEventListener('touchmove', preventScroll, { passive: false });
      window.removeEventListener('keydown', preventKeys, true);
    }
  }
  function preventScroll(ev) { ev.preventDefault(); }
  function preventKeys(ev) {
    if ([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
      ev.preventDefault();
    }
  }

  /* ---------- persistence ---------- */

  function persist() {
    try {
      localStorage.setItem(state.storeKey,
        JSON.stringify({ solved: state.solved, hintsShown: state.hintsShown }));
    } catch (_) {}
  }

  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(state.storeKey) || 'null'); } catch (_) {}
    if (saved && Array.isArray(saved.hintsShown)) {
      state.hintsShown = saved.hintsShown.filter((n) => Number.isInteger(n) && n >= 0);
    }
    if (saved && Array.isArray(saved.solved)) {
      // Only trust stored answers that still match the current puzzle.
      state.puzzle.items.forEach((item, i) => {
        const v = saved.solved[i];
        if (v && HM.isCorrect(v, item.answer)) state.solved[i] = HM.normalize(item.answer);
      });
    }
  }

  /* ---------- wiring ---------- */

  $('answerForm').addEventListener('submit', submitAnswer);
  $('modalClose').addEventListener('click', closeModal);
  $('modalStage').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) closeModal(); });
  $('answerInput').addEventListener('input', () => setAnswerState(''));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.openIndex >= 0) closeModal();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.layout) return;
      sizeSquares();
      applyOffsets(state.revealed);
    }, 150);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
