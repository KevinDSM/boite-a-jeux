// ============================================================ salon : emojis, joueurs, invitations
// Chargé après app.js. Trois conforts hors jeux : l'emoji de chacun (choisi à l'accueil, unique à la
// table), le retrait d'un joueur par l'hôte, et l'invitation à partager (lien du salon et image
// « Kevin vous invite à jouer »).

// ------------------------------------------------ emoji
function paintEmoBtn() { const b = $('#btn-emo'); if (b) b.textContent = net.emoji; }

function openEmojiPicker() {
  const inLobby = view?.phase === 'lobby' && !!net.code;
  const mine = inLobby ? view.players.find(p => p.id === net.me)?.emoji || net.emoji : net.emoji;
  const taken = new Set(inLobby ? view.players.filter(p => p.id !== net.me && !p.kicked).map(p => p.emoji) : []);
  const grid = $('#emo-grid'); grid.innerHTML = '';
  EMOJIS.forEach(e => {
    const b = el('button', 'emo' + (e === mine ? ' on' : ''), e); b.type = 'button';
    b.setAttribute('aria-pressed', String(e === mine));
    if (taken.has(e)) { b.disabled = true; b.title = 'Déjà pris'; }
    b.onclick = () => {
      net.emoji = e; try { localStorage.setItem('dc-emo', e); } catch { }
      paintEmoBtn(); $('#emo-pick').hidden = true;
      if (inLobby && e !== mine) act({ t: 'emoji', e });
    };
    grid.appendChild(b);
  });
  $('#emo-note').textContent = taken.size ? 'Les emojis grisés sont déjà pris à cette table.' : 'Il te suit dans tous les jeux de la soirée.';
  $('#emo-pick').hidden = false;
  grid.querySelector('.on')?.focus({ preventScroll: true });
}
$('#btn-emo').onclick = openEmojiPicker;
$('#emo-close').onclick = () => { $('#emo-pick').hidden = true; };
$('#emo-pick').onclick = e => { if (e.target.id === 'emo-pick') $('#emo-pick').hidden = true; };
paintEmoBtn();

// ------------------------------------------------ joueurs : retirer quelqu'un
const sinceTxt = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'moins d’une minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

function askKick(p) {
  const name = p.base || p.name;
  const inGame = view && view.phase !== 'lobby';
  askConfirm(`Retirer ${name}`, inGame
    ? `${name} quitte le salon et ne pourra plus y revenir. La partie continue, comme après un départ.`
    : `${name} quitte le salon et ne pourra plus y revenir.`, 'Retirer', () => act({ t: 'kick', id: p.id }));
}

function renderPlayersSheet() {
  const list = $('#players-list'); if (!list || !view?.players) return;
  list.innerHTML = '';
  view.players.filter(p => !p.kicked).forEach(p => {
    const sub = p.host ? (p.id === net.me ? 'hôte, toi' : 'hôte') : p.online ? 'en ligne' : `hors ligne${p.offAt ? ' depuis ' + sinceTxt(p.offAt) : ''}`;
    const row = el('div', 'pl-row' + (p.online ? '' : ' off'),
      `<span class="pemo" aria-hidden="true">${esc(p.emoji || glyph0(p.name))}</span><span class="pl-name"><b>${esc(p.base || p.name)}</b><small>${sub}</small></span>`);
    if (isHostPlayer() && !p.host) { const b = el('button', 'btn small', 'Retirer'); b.type = 'button'; b.onclick = () => askKick(p); row.appendChild(b); }
    list.appendChild(row);
  });
}
$('#btn-players').onclick = () => { renderPlayersSheet(); $('#players-sheet').hidden = false; };
$('#players-close').onclick = () => { $('#players-sheet').hidden = true; };
$('#players-sheet').onclick = e => { if (e.target.id === 'players-sheet') $('#players-sheet').hidden = true; };

// L'hôte est prévenu une fois quand un joueur ne revient pas : il peut le retirer pour débloquer la table.
const offNagged = new Set();
setInterval(() => {
  if (!net.isHost || !view?.players) return;
  const gone = view.players.filter(p => !p.online && !p.kicked && !p.host);
  $('#btn-players').classList.toggle('alert', gone.length > 0);
  view.players.forEach(p => { if (p.online) offNagged.delete(p.id); });
  if (view.phase === 'lobby') return;
  gone.forEach(p => {
    if (!p.offAt || Date.now() - p.offAt < 120000 || offNagged.has(p.id)) return;
    offNagged.add(p.id);
    toast(`Plus de nouvelles de ${p.base || p.name} depuis 2 min. Tu peux retirer ce joueur avec le bouton Joueurs, en haut.`, 6000);
  });
  if (!$('#players-sheet').hidden) renderPlayersSheet();
}, 5000);

// appelé à la fin de chaque render()
let emoWarned = false;
function salonAfterRender() {
  const me = view?.players?.find(p => p.id === net.me);
  if (me?.emoji && net.emoji && me.emoji !== net.emoji && !emoWarned) {
    emoWarned = true;
    toast(`${net.emoji} était déjà pris, te voilà ${me.emoji}. Touche ton nom pour en changer.`, 4500);
  }
  if (!$('#players-sheet').hidden) renderPlayersSheet();
}

// ------------------------------------------------ invitation
const INV_W = 1200, INV_H = 630;
const INV_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, sans-serif';
const INV_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const INV = {
  bg: 'oklch(0.17 0.018 62)', surface: 'oklch(0.225 0.020 62)', surface2: 'oklch(0.27 0.022 62)', line: 'oklch(0.33 0.022 62)',
  ink: 'oklch(0.95 0.014 80)', ink2: 'oklch(0.78 0.020 74)', mute: 'oklch(0.62 0.020 70)',
  acc: 'oklch(0.78 0.155 68)', accSoft: 'oklch(0.86 0.110 72)', pos: 'oklch(0.83 0.135 165)',
};

// la boîte de l'accueil, redessinée trait pour trait (même géométrie que le SVG de index.html)
function drawGameBox(ctx, x, y, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const poly = (pts, fill) => { ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const dot = (cx, cy, r, fill) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
  ctx.beginPath(); ctx.ellipse(60, 90, 46, 7, 0, 0, Math.PI * 2); ctx.fillStyle = 'oklch(0 0 0 / .35)'; ctx.fill();
  poly([18, 52, 60, 70, 60, 92, 18, 74], 'oklch(0.24 0.02 62)');
  poly([60, 70, 102, 52, 102, 74, 60, 92], 'oklch(0.30 0.022 62)');
  poly([18, 52, 60, 34, 102, 52, 60, 70], 'oklch(0.36 0.026 62)');
  poly([18, 64, 60, 82, 60, 88, 18, 70], INV.acc);
  poly([60, 82, 102, 64, 102, 70, 60, 88], INV.accSoft);
  // couvercle entrouvert
  ctx.save(); ctx.translate(14, 44); ctx.rotate(-0.12); ctx.translate(-14, -44);
  poly([14, 44, 60, 24, 106, 44, 60, 64], INV.acc);
  poly([14, 44, 60, 64, 60, 69, 14, 49], 'oklch(0.52 0.15 60)');
  poly([60, 64, 106, 44, 106, 49, 60, 69], 'oklch(0.62 0.15 64)');
  poly([44, 42, 60, 35, 76, 42, 60, 49], 'oklch(0.99 0.01 80 / .85)');
  ctx.restore();
  // un dé et un pion qui dépassent
  poly([86, 20, 98, 14, 110, 20, 98, 26], 'oklch(0.99 0.01 80)');
  poly([86, 20, 98, 26, 98, 40, 86, 34], 'oklch(0.86 0.015 80)');
  poly([98, 26, 110, 20, 110, 34, 98, 40], 'oklch(0.93 0.012 80)');
  const pip = 'oklch(0.22 0.03 62)';
  dot(98, 20, 1.8, pip); dot(90, 26, 1.5, pip); dot(94, 32, 1.5, pip); dot(102, 32, 1.5, pip); dot(106, 26, 1.5, pip);
  dot(24, 24, 6, INV.pos); ctx.fillStyle = INV.pos; ctx.fill(new Path2D('M14 46 L16 34 Q24 26 32 34 L34 46 Z'));
  ctx.restore();
}

const fitFont = (ctx, text, weight, size, min, maxW) => { let s = size; do { ctx.font = `${weight} ${s}px ${INV_FONT}`; if (ctx.measureText(text).width <= maxW) break; s -= 4; } while (s > min); return s; };
function spaced(ctx, text, x, y, gap) { for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + gap; } }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function emojiAt(ctx, e, cx, cy, size) { ctx.save(); ctx.font = `${size}px ${INV_EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, cx, cy + size * .04); ctx.restore(); }

/** Dessine l'image d'invitation. Sans `name`, c'est l'aperçu générique du site (og.png). */
function drawInvite({ name = '', emoji = '', code = '', game = '', faces = [] } = {}) {
  const c = document.createElement('canvas'); c.width = INV_W; c.height = INV_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = INV.bg; ctx.fillRect(0, 0, INV_W, INV_H);
  const glow = ctx.createRadialGradient(905, 330, 20, 905, 330, 470);
  glow.addColorStop(0, 'oklch(0.78 0.155 68 / .26)'); glow.addColorStop(1, 'oklch(0.78 0.155 68 / 0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, INV_W, INV_H);

  // à droite : la boîte, et l'emoji de celui qui invite qui en sort
  drawGameBox(ctx, 690, 150, 3.7);
  if (emoji) {
    ctx.beginPath(); ctx.arc(902, 122, 84, 0, Math.PI * 2); ctx.fillStyle = INV.surface2; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = INV.acc; ctx.stroke();
    emojiAt(ctx, emoji, 902, 122, 102);
  }
  // les joueurs déjà à table
  const shown = faces.slice(0, 5);
  shown.forEach((e, i) => {
    const cx = 735 + i * 70, cy = 560;
    ctx.beginPath(); ctx.arc(cx, cy, 31, 0, Math.PI * 2); ctx.fillStyle = INV.surface; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INV.line; ctx.stroke();
    emojiAt(ctx, e, cx, cy, 36);
  });
  if (faces.length > shown.length) { ctx.font = `600 26px ${INV_FONT}`; ctx.fillStyle = INV.ink2; ctx.textBaseline = 'middle'; ctx.fillText(`+${faces.length - shown.length}`, 735 + shown.length * 70 - 20, 560); }

  // à gauche : le texte
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.beginPath(); ctx.arc(89, 92, 8, 0, Math.PI * 2); ctx.fillStyle = INV.acc; ctx.fill();
  ctx.font = `700 30px ${INV_FONT}`; ctx.fillStyle = INV.ink2; ctx.fillText('Boîte à jeux', 108, 103);
  const maxW = 560;
  if (name) {
    fitFont(ctx, name, 800, 118, 64, maxW); ctx.fillStyle = INV.ink; ctx.fillText(name, 76, 250);
    ctx.font = `700 56px ${INV_FONT}`; ctx.fillStyle = INV.acc; ctx.fillText('vous invite à jouer', 78, 322);
  } else {
    ctx.font = `800 118px ${INV_FONT}`; ctx.fillStyle = INV.ink; ctx.fillText('22 jeux', 76, 250);
    ctx.font = `700 56px ${INV_FONT}`; ctx.fillStyle = INV.acc; ctx.fillText('pour la soirée', 78, 322);
  }
  const line = game ? `Au programme : ${game}` : name ? '22 jeux, chacun sur son téléphone' : 'Chacun joue sur son téléphone';
  fitFont(ctx, line, 500, 32, 22, maxW); ctx.fillStyle = INV.ink2; ctx.fillText(line, 78, 384);

  if (code) {
    roundRect(ctx, 78, 430, 318, 118, 24); ctx.fillStyle = INV.surface; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INV.line; ctx.stroke();
    ctx.font = `600 22px ${INV_FONT}`; ctx.fillStyle = INV.mute; ctx.fillText('Code du salon', 106, 470);
    ctx.font = `800 58px ${INV_FONT}`; ctx.fillStyle = INV.ink; spaced(ctx, code, 104, 528, 10);
  } else {
    ctx.font = `600 26px ${INV_FONT}`; ctx.fillStyle = INV.mute;
    ctx.fillText('Gratuit, sans compte, sans rien installer.', 78, 470);
  }
  ctx.font = `500 21px ${INV_FONT}`; ctx.fillStyle = INV.mute; ctx.fillText('kevindsm.github.io/boite-a-jeux', 78, 596);
  return c;
}

function inviteData() {
  const me = view?.players?.find(p => p.id === net.me);
  const name = me?.base || net.name || 'Quelqu’un';
  const u = new URL(location.pathname.replace(/index.html$/, ''), location.origin);
  u.searchParams.set('c', net.code); u.searchParams.set('de', name);
  return {
    name, emoji: me?.emoji || net.emoji, code: net.code, url: u.href,
    game: view?.pick && GAMES[view.pick] ? GAMES[view.pick].name : '',
    faces: (view?.players || []).filter(p => p.id !== net.me && p.online && !p.kicked).map(p => p.emoji).filter(Boolean),
  };
}

let invFile = null, invUrl = null;
async function openInvite() {
  const d = inviteData();
  const canvas = drawInvite(d);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  invFile = new File([blob], `invitation-${d.code}.png`, { type: 'image/png' });
  if (invUrl) URL.revokeObjectURL(invUrl);
  invUrl = URL.createObjectURL(blob);
  $('#invite-img').src = invUrl;
  $('#invite-img').alt = `${d.name} vous invite à jouer, salon ${d.code}`;
  $('#invite-url').textContent = d.url;
  const text = `${d.name} vous invite à jouer à la Boîte à jeux. Salon ${d.code} : ${d.url}`;
  const canFiles = !!navigator.canShare?.({ files: [invFile] });
  const share = $('#invite-share'), copy = $('#invite-copy'), copyImg = $('#invite-copy-img');
  share.hidden = !navigator.share;
  share.textContent = canFiles ? 'Partager l’invitation' : 'Partager le lien';
  copy.classList.toggle('primary', !navigator.share);
  copyImg.hidden = !window.ClipboardItem || !navigator.clipboard?.write;
  share.onclick = async () => {
    try { await navigator.share(canFiles ? { files: [invFile], title: 'Boîte à jeux', text } : { title: 'Boîte à jeux', text, url: d.url }); }
    catch (e) { if (e.name !== 'AbortError') toast('Partage impossible. Copie plutôt le lien.'); }
  };
  copy.onclick = async () => { try { await navigator.clipboard.writeText(d.url); toast('Lien copié'); } catch { toast('Copie impossible sur cet appareil.'); } };
  copyImg.onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Image copiée. Colle-la dans ta conversation.'); }
    catch { toast('Copie de l’image impossible sur cet appareil.'); }
  };
  $('#invite').hidden = false;
}
$('#btn-invite').onclick = () => openInvite();
$('#invite-close').onclick = () => { $('#invite').hidden = true; };
$('#invite').onclick = e => { if (e.target.id === 'invite') $('#invite').hidden = true; };

// ------------------------------------------------ accueil : arrivée par un lien d'invitation
(function homeFromLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('retire')) {
    $('#home-err').textContent = 'L’hôte t’a retiré de son salon.';
    history.replaceState(null, '', location.pathname);
    return;
  }
  const code = (q.get('c') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) return;
  const from = (q.get('de') || '').trim().slice(0, 14);
  const form = $('#f-home'), join = form.querySelector('button[data-act=join]'), banner = $('#invite-banner'), own = $('#btn-own');
  form.classList.add('invited');
  banner.innerHTML = `${from ? `<b>${esc(from)}</b> t’invite à jouer.` : 'Une partie t’attend.'}<span>Salon ${code}. Choisis ton prénom et ton emoji, puis rejoins la table.</span>`;
  banner.hidden = false;
  join.classList.add('primary', 'lg'); join.textContent = 'Rejoindre la partie';
  own.hidden = false;
  own.onclick = () => {
    form.classList.remove('invited'); banner.hidden = true; own.hidden = true;
    join.classList.remove('primary', 'lg'); join.textContent = 'Rejoindre';
    $('#in-code').value = ''; history.replaceState(null, '', location.pathname);
  };
})();
