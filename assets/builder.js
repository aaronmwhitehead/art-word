/*
  Puzzle builder. Holds a working puzzle in memory (mirrored to localStorage so a
  refresh doesn't lose work) and exports the JSON the player reads.
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = 'hm-hunt:builder-draft';

  const model = {
    slug: '', title: '', eyebrow: '', location: '', intro: '', clue: '',
    clueColor: '#f8ce8f',
    items: [],     // { image, prompt: 'work'|'artist', answer, clueIndex }
  };

  let editingIndex = -1;
  let pendingPrompt = 'work';
  let pendingClueIndex = -1;

  /* ---------- identity fields ---------- */

  let slugTouched = false;

  [['fTitle','title'], ['fSlug','slug'], ['fEyebrow','eyebrow'],
   ['fLocation','location'], ['fIntro','intro'], ['fClue','clue']]
  .forEach(([elId, key]) => {
    $(elId).addEventListener('input', () => {
      if (key === 'slug') {
        slugTouched = true;
        // Sanitise as they type; spaces become hyphens rather than vanishing.
        // The caret is restored by counting surviving characters to its left,
        // which keeps select-and-replace and mid-string edits behaving.
        const el = $(elId), raw = el.value, caret = el.selectionStart;
        const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '');
        const cleaned = clean(raw).slice(0, 60);
        if (cleaned !== raw) {
          const left = clean(raw.slice(0, caret)).length;
          el.value = cleaned;
          const pos = Math.min(left, cleaned.length);
          el.setSelectionRange(pos, pos);
        }
        model.slug = cleaned;
      } else if (key === 'clue') {
        model.clue = HM.normalize($(elId).value);
        if ($(elId).value !== model.clue) $(elId).value = model.clue;
        recomputeAnswer();
      } else {
        model[key] = $(elId).value;
      }

      if (key === 'title' && !slugTouched) {
        model.slug = HM.slugify($(elId).value);
        $('fSlug').value = model.slug;
      }
      refreshHints();
      renderAll();
    });
  });

  $('fSlug').addEventListener('blur', () => {
    model.slug = HM.slugify($('fSlug').value);
    $('fSlug').value = model.slug;
    refreshHints();
    renderAll();
  });

  const PRESETS = ['#f8ce8f', '#f0956a', '#8d5b62', '#cfeaaa', '#7b8fd0', '#a996d8', '#f6ef9c', '#3fc3ee'];

  PRESETS.forEach((hex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', () => setClueColor(hex));
    $('swatches').appendChild(b);
  });

  function setClueColor(hex, skipInputs) {
    const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : model.clueColor;
    model.clueColor = clean;
    if (!skipInputs) { $('fClueColor').value = clean; $('fClueHex').value = clean; }
    [...$('swatches').children].forEach((b) => b.classList.toggle('is-sel', b.title === clean));
    renderAll();
  }

  $('fClueColor').addEventListener('input', () => setClueColor($('fClueColor').value));
  $('fClueHex').addEventListener('input', () => {
    let v = $('fClueHex').value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) setClueColor(v, true), ($('fClueColor').value = v.toLowerCase());
  });

  function refreshHints() {
    const slug = model.slug || '<slug>';
    $('urlPreview').textContent = `?p=${slug}`;
    $('fileNameHint').textContent = `puzzles/${slug}.json`;
    $('shareHint').textContent = `?p=${slug}`;
  }

  /* ---------- add / edit an artwork ---------- */

  $('promptSeg').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-prompt]');
    if (!btn) return;
    pendingPrompt = btn.dataset.prompt;
    [...$('promptSeg').children].forEach((b) => b.classList.toggle('is-on', b === btn));
  });

  $('fAnswer').addEventListener('input', recomputeAnswer);
  $('fImage').addEventListener('input', renderAll);

  /* Which clue letter is this row responsible for? */
  function targetLetterFor(index) {
    const i = index < 0 ? model.items.length : index;
    return model.clue[i] || '';
  }

  function recomputeAnswer() {
    const answer = HM.normalize($('fAnswer').value);
    const letter = targetLetterFor(editingIndex);
    const row = editingIndex < 0 ? model.items.length : editingIndex;

    $('letterOpts').innerHTML = '';
    $('answerWarn').hidden = true;
    $('answerOk').hidden = true;
    $('letterHint').textContent = model.clue
      ? `(row ${row + 1} of ${model.clue.length}${letter ? ` · needs “${letter}”` : ''})`
      : '';

    if (!model.clue) {
      $('answerWarn').textContent = 'Set the clue word first.';
      $('answerWarn').hidden = false;
      $('addItemBtn').disabled = true;
      return;
    }
    if (!letter) {
      $('answerWarn').textContent = `The clue word “${model.clue}” only has ${model.clue.length} letters — that many artworks is the maximum.`;
      $('answerWarn').hidden = false;
      $('addItemBtn').disabled = true;
      return;
    }
    if (!answer) { $('addItemBtn').disabled = true; return; }

    const check = HM.validateItem({ answer }, letter);
    if (!check.ok) {
      $('answerWarn').textContent = `This row supplies “${letter}”, but ${answer} has no ${letter}. Use a different answer or reorder the works.`;
      $('answerWarn').hidden = false;
      $('addItemBtn').disabled = true;
      return;
    }

    // One match is automatic; several means the builder picks which one aligns.
    if (check.positions.length === 1) {
      pendingClueIndex = check.positions[0];
      $('answerOk').textContent = `“${letter}” found at position ${pendingClueIndex + 1}.`;
      $('answerOk').hidden = false;
    } else {
      if (!check.positions.includes(pendingClueIndex)) pendingClueIndex = check.positions[0];
      $('answerOk').textContent = `“${letter}” appears ${check.positions.length} times — pick which one lines up:`;
      $('answerOk').hidden = false;
      check.positions.forEach((pos) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'letter-chip' + (pos === pendingClueIndex ? ' is-sel' : '');
        chip.innerHTML = answer.slice(0, pos) + '<b style="color:var(--hm-red)">' + answer[pos] + '</b>' + answer.slice(pos + 1);
        chip.addEventListener('click', () => {
          pendingClueIndex = pos;
          [...$('letterOpts').children].forEach((c, j) => c.classList.toggle('is-sel', check.positions[j] === pos));
          renderAll();
        });
        $('letterOpts').appendChild(chip);
      });
    }

    $('addItemBtn').disabled = false;
    renderAll();
  }

  $('addItemBtn').addEventListener('click', () => {
    const answer = $('fAnswer').value.trim();
    const image = $('fImage').value.trim();
    if (!HM.normalize(answer)) return toast('Enter an answer first');
    if (!image) return toast('Enter an image path first');

    const entry = { image, prompt: pendingPrompt, answer, hint: $('fHint').value.trim(), clueIndex: pendingClueIndex };
    if (editingIndex >= 0) { model.items[editingIndex] = entry; toast('Artwork updated'); }
    else { model.items.push(entry); toast('Artwork added'); }

    resetForm();
    renderAll();
  });

  $('cancelEditBtn').addEventListener('click', resetForm);

  function resetForm() {
    editingIndex = -1;
    pendingClueIndex = -1;
    $('fAnswer').value = '';
    $('fImage').value = '';
    $('fHint').value = '';
    $('cancelEditBtn').hidden = true;
    $('addItemBtn').textContent = 'Add artwork';
    // Keep the segmented control in step with the prompt it will actually use.
    [...$('promptSeg').children].forEach((b) => b.classList.toggle('is-on', b.dataset.prompt === pendingPrompt));
    recomputeAnswer();
    renderAll();
  }

  function editItem(i) {
    const item = model.items[i];
    if (!item) return;
    editingIndex = i;
    pendingPrompt = item.prompt === 'artist' ? 'artist' : 'work';
    pendingClueIndex = typeof item.clueIndex === 'number' ? item.clueIndex : -1;
    $('fAnswer').value = item.answer;
    $('fImage').value = item.image;
    $('fHint').value = item.hint || '';
    [...$('promptSeg').children].forEach((b) => b.classList.toggle('is-on', b.dataset.prompt === pendingPrompt));
    $('addItemBtn').textContent = 'Save changes';
    $('cancelEditBtn').hidden = false;
    recomputeAnswer();
    $('fAnswer').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function removeItem(i) {
    if (!confirm(`Remove artwork ${i + 1}?`)) return;
    model.items.splice(i, 1);
    if (editingIndex === i) resetForm();
    renderAll();
    toast('Artwork removed');
  }

  /* Order matters: row N supplies clue letter N. */
  function moveItem(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= model.items.length) return;
    [model.items[i], model.items[j]] = [model.items[j], model.items[i]];
    renderAll();
  }

  /* ---------- drag and drop an image file ---------- */

  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((e) => dz.addEventListener(e, (ev) => {
    ev.preventDefault(); dz.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((e) => dz.addEventListener(e, () => dz.classList.remove('is-over')));
  dz.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!file) return;
    // The browser can't know the file's repo path, so assume the images folder.
    $('fImage').value = 'assets/images/' + file.name;
    renderAll();
    toast('Path set — copy the file into assets/images/');
  });

  /* ---------- rendering ---------- */

  function renderAll() {
    renderItems();
    renderPreview();
    renderOutput();
    persist();
  }

  function renderItems() {
    const ul = $('itemList');
    ul.innerHTML = '';
    $('itemCount').textContent = model.items.length
      ? `(${model.items.length}${model.clue ? ' of ' + model.clue.length : ''})` : '';
    $('emptyNote').hidden = model.items.length > 0;

    model.items.forEach((item, i) => {
      const letter = model.clue[i] || '';
      const check = HM.validateItem(item, letter);
      const li = document.createElement('li');
      li.className = 'item-row';

      const thumb = item.image
        ? `<img class="item-thumb" src="${escapeHtml(item.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'item-thumb ph',textContent:'no image'}))">`
        : `<div class="item-thumb ph">no image</div>`;

      li.innerHTML = `
        ${thumb}
        <div class="item-body">
          <div class="item-answer">${escapeHtml(HM.normalize(item.answer) || '—')}</div>
          <div class="item-meta">${i + 1}. ${escapeHtml(HM.promptFor(item))}${letter ? ` · supplies “${letter}”` : ''}</div>
          ${item.hint ? `<div class="item-meta">Hint: ${escapeHtml(item.hint)}</div>` : ''}
          ${check.ok ? '' : `<div class="item-bad">${escapeHtml(check.reason)}</div>`}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="down" data-i="${i}" ${i === model.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="edit" data-i="${i}">Edit</button>
          <button class="icon-btn danger" data-act="del" data-i="${i}">Del</button>
        </div>`;
      ul.appendChild(li);
    });

    ul.querySelectorAll('button[data-act]').forEach((btn) => {
      const i = +btn.dataset.i;
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'edit') editItem(i);
        else if (act === 'del') removeItem(i);
        else moveItem(i, act === 'up' ? -1 : 1);
      });
    });
  }

  /* Show the grid as players see it once solved, with any pending row included. */
  function renderPreview() {
    const grid = $('prevGrid');
    grid.innerHTML = '';

    if (!model.clue) {
      $('gridMeta').textContent = 'Set a clue word to begin.';
      $('alignNote').textContent = '';
      return;
    }

    const draftAnswer = HM.normalize($('fAnswer').value);
    const items = model.items.slice();
    if (editingIndex < 0 && draftAnswer && items.length < model.clue.length) {
      items.push({ answer: draftAnswer, clueIndex: pendingClueIndex, prompt: pendingPrompt, __draft: true });
    } else if (editingIndex >= 0 && draftAnswer) {
      items[editingIndex] = { ...items[editingIndex], answer: draftAnswer, clueIndex: pendingClueIndex };
    }

    const laid = HM.layout({ clue: model.clue, items });

    model.clue.split('').forEach((letter, i) => {
      const row = document.createElement('div');
      row.className = 'prow';
      const data = laid.rows[i];

      if (!data || !data.answer) {
        // Row not filled in yet: show a single placeholder in the clue column.
        row.style.marginLeft = (laid.clueCol * 31) + 'px';
        const sq = document.createElement('div');
        sq.className = 'psq pending';
        sq.textContent = letter;
        row.appendChild(sq);
      } else {
        row.style.marginLeft = (data.offset * 31) + 'px';
        [...data.answer].forEach((ch, c) => {
          const sq = document.createElement('div');
          sq.className = 'psq';
          sq.textContent = ch;
          if (data.clueIndex < 0) sq.classList.add('missing');
          else if (c === data.clueIndex) {
            sq.style.background = model.clueColor;
            sq.style.color = textOn(model.clueColor);
          }
          row.appendChild(sq);
        });
      }
      grid.appendChild(row);
    });

    const filled = model.items.length;
    $('gridMeta').textContent = `Clue “${model.clue}” · ${filled} of ${model.clue.length} artworks`;

    const bad = model.items.filter((it, i) => !HM.validateItem(it, model.clue[i]).ok).length;
    $('alignNote').textContent = bad
      ? `${bad} answer${bad === 1 ? '' : 's'} can’t supply the needed letter — fix before publishing.`
      : (filled === model.clue.length ? 'Every row aligns. Ready to publish.' : '');
  }

  function buildJson() {
    return {
      slug: model.slug || '',
      title: model.title || '',
      eyebrow: model.eyebrow || 'Scavenger Hunt',
      location: model.location || '',
      intro: model.intro || '',
      clue: HM.normalize(model.clue),
      clueColor: model.clueColor || '#f8ce8f',
      items: model.items.map((it) => ({
        image: it.image,
        prompt: it.prompt === 'artist' ? 'artist' : 'work',
        answer: it.answer,
        hint: it.hint || '',
        clueIndex: typeof it.clueIndex === 'number' ? it.clueIndex : 0,
      })),
    };
  }

  function renderOutput() { $('outJson').value = JSON.stringify(buildJson(), null, 2); }

  /* ---------- export ---------- */

  function problems() {
    const out = [];
    if (!model.slug) out.push('no slug');
    if (!model.clue) out.push('no clue word');
    if (model.items.length !== model.clue.length) {
      out.push(`${model.items.length} artworks for a ${model.clue.length}-letter clue`);
    }
    model.items.forEach((it, i) => {
      if (!it.image) out.push(`artwork ${i + 1} has no image`);
      const c = HM.validateItem(it, model.clue[i]);
      if (!c.ok) out.push(`artwork ${i + 1}: ${c.reason}`);
    });
    return out;
  }

  $('downloadBtn').addEventListener('click', () => {
    const probs = problems();
    if (probs.length && !confirm('This puzzle has problems:\n\n' + probs.join('\n') + '\n\nExport anyway?')) return;
    if (!model.slug) return toast('Give the puzzle a slug first');

    const blob = new Blob([JSON.stringify(buildJson(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${model.slug}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Downloaded ' + model.slug + '.json');
  });

  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('outJson').value); toast('JSON copied'); }
    catch (_) { $('outJson').select(); toast('Press ⌘C to copy'); }
  });

  $('testBtn').addEventListener('click', () => {
    if (!model.items.length) return toast('Add an artwork first');
    try {
      sessionStorage.setItem('hm-hunt:preview', JSON.stringify(buildJson()));
      window.open('index.html?p=__preview__', '_blank');
    } catch (_) { toast('Couldn’t open preview'); }
  });

  $('importBtn').addEventListener('click', () => {
    const raw = $('importJson').value.trim();
    if (!raw) return toast('Paste some JSON first');
    let data;
    try { data = JSON.parse(raw); } catch (_) { return toast('That isn’t valid JSON'); }
    if (!Array.isArray(data.items)) return toast('No artworks found in that JSON');
    loadModel(data);
    $('importJson').value = '';
    toast('Puzzle loaded');
  });

  function loadModel(data) {
    model.slug = data.slug || '';
    model.title = data.title || '';
    model.eyebrow = data.eyebrow || '';
    model.location = data.location || '';
    model.intro = data.intro || '';
    model.clue = HM.normalize(data.clue);
    model.clueColor = /^#[0-9a-f]{6}$/i.test(data.clueColor || '') ? data.clueColor.toLowerCase() : '#f8ce8f';
    model.items = (data.items || []).map((it) => ({
      image: it.image || '',
      prompt: it.prompt === 'artist' ? 'artist' : 'work',
      answer: it.answer || '',
      hint: it.hint || '',
      clueIndex: typeof it.clueIndex === 'number' ? it.clueIndex : 0,
    }));
    slugTouched = !!model.slug;

    $('fTitle').value = model.title;
    $('fSlug').value = model.slug;
    $('fEyebrow').value = model.eyebrow;
    $('fLocation').value = model.location;
    $('fIntro').value = model.intro;
    $('fClue').value = model.clue;
    setClueColor(model.clueColor);
    refreshHints();
    resetForm();
  }

  function persist() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(buildJson())); } catch (_) {}
  }

  function restoreDraft() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {}
    if (data && (data.clue || (data.items && data.items.length))) loadModel(data);
    else { setClueColor(model.clueColor); refreshHints(); recomputeAnswer(); renderAll(); }
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
  }

  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#000';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  restoreDraft();
})();
