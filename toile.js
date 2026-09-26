/* Toile — les outils de dessin communs (Sablier, Téléphone dessiné).

   Une seule barre d'outils pour tous les jeux qui dessinent : un seul outil actif à la fois (crayon,
   gomme ou seau), trois épaisseurs, une palette, Annuler, et « Tout effacer » qui demande une seconde
   touche pour confirmer. Choisir une couleur depuis la gomme repasse au crayon ; choisir une épaisseur
   depuis le seau aussi. Plus besoin de recliquer sur un outil pour « l'annuler ».
   toilePad() fournit en plus une feuille de dessin locale (traits vectoriels rejoués sur une toile,
   export en JPEG), utilisée par le Téléphone dessiné. Le rendu des traits et le remplissage
   (sabRenderStroke, sabFloodFill) viennent de sablier-ui.js, chargé après ce fichier.
   Chargé après app.js : réutilise $ et el. */

'use strict';

const TOILE_COLORS = ['#1f2430', '#6b7280', '#ffffff', '#e5484d', '#f97316', '#fbbf24', '#8b5a2b', '#2fa96b', '#38bdf8', '#3e63dd', '#8e4ec6', '#ec4899'];
const TOILE_WIDTHS = [['Fin', 0.005, 4], ['Moyen', 0.012, 8], ['Gros', 0.028, 14]];
const TOILE_ICON = {
  pen: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 013 3L8 15l-4 1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  eraser: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 16h8M3.5 11.5l6-6a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L9 16H6.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  fill: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3l6 6-5.5 5.5a1.5 1.5 0 01-2.1 0L3.5 10.6a1.5 1.5 0 010-2.1zM3 9.5h11M16.5 12s1.5 1.9 1.5 3a1.5 1.5 0 01-3 0c0-1.1 1.5-3 1.5-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};

/** Construit la barre d'outils dans box. st = { tool: 'pen'|'eraser'|'fill', color, width } est modifié en place. */
function toileToolbar(box, st, { onChange, onUndo, onClear, colors = TOILE_COLORS } = {}) {
  box.classList.add('toile-bar');
  box.innerHTML = `<div class="toile-seg tools" role="radiogroup" aria-label="Outil">`
    + [['pen', 'Crayon'], ['eraser', 'Gomme'], ['fill', 'Seau']].map(([k, l]) => `<button type="button" role="radio" data-tool="${k}">${TOILE_ICON[k]}<span>${l}</span></button>`).join('')
    + `</div><div class="toile-seg sizes" role="radiogroup" aria-label="Épaisseur">`
    + TOILE_WIDTHS.map(([l, w, d]) => `<button type="button" role="radio" data-w="${w}" aria-label="${l}" title="${l}"><i style="width:${d}px;height:${d}px"></i></button>`).join('')
    + `</div><div class="toile-colors" role="group" aria-label="Couleur">`
    + colors.map(c => `<button type="button" class="toile-sw" data-c="${c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join('')
    + `<label class="toile-sw toile-more" title="Autre couleur"><input type="color" value="${st.color}" aria-label="Autre couleur"></label></div>`
    + `<div class="toile-act"><button type="button" class="btn small" data-act="undo">Annuler</button><button type="button" class="btn small ghost" data-act="clear">Tout effacer</button></div>`;
  const pick = box.querySelector('input[type=color]');
  const sync = () => {
    box.dataset.current = st.tool;
    box.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === st.tool)));
    box.querySelectorAll('[data-w]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.w === st.width)));
    let known = false;
    box.querySelectorAll('.toile-sw[data-c]').forEach(b => { const on = b.dataset.c.toLowerCase() === st.color.toLowerCase(); known = known || on; b.setAttribute('aria-pressed', String(on)); });
    box.querySelector('.toile-more').classList.toggle('on', !known);
    box.querySelector('.toile-more').style.setProperty('--c', st.color);
  };
  const changed = () => { sync(); onChange?.(st); };
  box.onclick = e => {
    const t = e.target.closest('[data-tool]'), w = e.target.closest('[data-w]'), c = e.target.closest('.toile-sw[data-c]'), a = e.target.closest('[data-act]');
    if (t) { st.tool = t.dataset.tool; return changed(); }
    if (w) { st.width = +w.dataset.w; if (st.tool === 'fill') st.tool = 'pen'; return changed(); }
    if (c) { st.color = c.dataset.c; if (st.tool === 'eraser') st.tool = 'pen'; return changed(); }
    if (a?.dataset.act === 'undo') { onUndo?.(); return; }
    if (a?.dataset.act === 'clear') {
      if (a.dataset.armed) { delete a.dataset.armed; clearTimeout(a._t); a.textContent = 'Tout effacer'; a.classList.remove('armed'); onClear?.(); return; }
      a.dataset.armed = '1'; a.textContent = 'Sûr ? Touche encore'; a.classList.add('armed');
      a._t = setTimeout(() => { delete a.dataset.armed; a.textContent = 'Tout effacer'; a.classList.remove('armed'); }, 2500);
    }
  };
  pick.oninput = () => { st.color = pick.value; if (st.tool === 'eraser') st.tool = 'pen'; changed(); };
  sync();
  return { sync };
}

/** Une feuille de dessin locale : { el, bar, isEmpty(), toJPEG(), reset() }. */
function toilePad({ w = 800, h = 600 } = {}) {
  const wrap = el('div', 'toile-pad');
  const cv = document.createElement('canvas'); cv.className = 'toile-cv'; cv.width = w; cv.height = h;
  cv.setAttribute('aria-label', 'Feuille de dessin'); wrap.appendChild(cv);
  const bar = el('div'); wrap.appendChild(bar);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const st = { tool: 'pen', color: '#1f2430', width: 0.012 };
  const strokes = []; let cur = null;
  const redraw = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); strokes.forEach(s => sabRenderStroke(ctx, w, h, s, 0)); };
  const rel = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height].map(v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000); };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const p = rel(e);
    if (st.tool === 'fill') { const s = { t: 'fill', c: st.color, p }; strokes.push(s); sabRenderStroke(ctx, w, h, s, 0); return; }
    try { cv.setPointerCapture(e.pointerId); } catch { }
    cur = { c: st.color, w: st.width, e: st.tool === 'eraser', p: p.slice() };
    strokes.push(cur); sabRenderStroke(ctx, w, h, cur, 0);
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return; e.preventDefault();
    const from = Math.max(0, cur.p.length - 2); cur.p.push(...rel(e)); sabRenderStroke(ctx, w, h, cur, from);
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.dataset.tool = st.tool;
  toileToolbar(bar, st, {
    onChange: () => { cv.dataset.tool = st.tool; },
    onUndo: () => { strokes.pop(); redraw(); },
    onClear: () => { strokes.length = 0; redraw(); },
  });
  return {
    el: wrap, bar, canvas: cv,
    isEmpty: () => !strokes.length,
    reset: () => { strokes.length = 0; redraw(); },
    toJPEG(q = 0.72) {
      const o = document.createElement('canvas'); o.width = w; o.height = h;
      const g = o.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.drawImage(cv, 0, 0);
      return o.toDataURL('image/jpeg', q);
    },
  };
}
