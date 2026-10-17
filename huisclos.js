// Huis clos : affichage et commandes. Les règles sont dans engines/huisclos.js, le scénario dans huisclos.json
// (sur le serveur seulement : ce téléphone ne reçoit que ce qui est visible, jamais un code).

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : la ligne de partie (chrono, indices, fil), les pièces en onglets
// (chacun se promène où il veut, les autres voient où il est), la pièce dessinée où l'on touche pour fouiller, le
// meneur qui raconte ce que la table vient de trouver, et le plateau de verre en bas : l'inventaire commun et les
// documents qui ne sont que sur CE téléphone. Un objet se glisse sur la pièce ou sur un autre objet (ou se prend en
// main, puis on touche la cible). La pièce et l'inventaire ne sont reconstruits que s'ils ont changé, et jamais
// pendant qu'un doigt traîne un objet ; une feuille ouverte (cadenas en cours de saisie) n'est pas dérangée.
let hcSk = null, hcLast = null, hcRecv = 0, hcRoom = null, hcHeld = null, hcDrag = null, hcEvSeen = -1, hcSheet = null, hcNew = new Set(), hcPhase = '';
const hcName = p => esc(tbSplit(p)[1]);
const hcEmo = p => tbSplit(p)[0];

// ---------------------------------------------------------------- les objets (dessins)
const HC_IC = {
  lampe: '<svg viewBox="0 0 40 40"><rect x="8" y="16" width="20" height="9" rx="3" fill="#56646a"/><rect x="27" y="13" width="7" height="15" rx="2" fill="#7b8a90"/><rect x="29" y="15" width="3" height="11" rx="1" fill="#2b3236"/><rect x="12" y="18" width="4" height="5" rx="1" fill="#2b3236"/></svg>',
  lampeOn: '<svg viewBox="0 0 40 40"><path d="M34 13 L40 6 L40 34 L34 28Z" fill="#b693ff" opacity=".5"/><rect x="6" y="16" width="20" height="9" rx="3" fill="#56646a"/><rect x="25" y="13" width="7" height="15" rx="2" fill="#7b8a90"/><rect x="27" y="15" width="3" height="11" rx="1" fill="#d9c7ff"/><circle cx="12" cy="20.5" r="2" fill="#62e3a7"/></svg>',
  pile: '<svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="12" fill="#a7b3b8"/><circle cx="20" cy="21" r="9" fill="#c9d2d6"/><text x="20" y="25" text-anchor="middle" font-size="10" font-weight="700" fill="#4d5a5f" font-family="sans-serif">3V</text></svg>',
  grattoir: '<svg viewBox="0 0 40 40"><path d="M6 30 L22 14 L28 20 L12 36Z" fill="#c2cdd1"/><path d="M22 14 L28 20" stroke="#eef3f5" stroke-width="2"/><rect x="25" y="4" width="7" height="16" rx="3" transform="rotate(45 28 12)" fill="#d9822b"/></svg>',
  tournevis: '<svg viewBox="0 0 40 40"><rect x="17" y="3" width="8" height="16" rx="3" fill="#ef7d22"/><path d="M19 7v8M23 7v8" stroke="#b85a10" stroke-width="1.2"/><rect x="19.5" y="19" width="3" height="14" fill="#c9d2d6"/><path d="M19.5 33h3l-1.5 4z" fill="#9aa6ab"/></svg>',
  lame: '<svg viewBox="0 0 40 40"><rect x="4" y="13" width="32" height="14" rx="2" fill="#bfe3ea" opacity=".75"/><rect x="5" y="14" width="10" height="12" fill="#fff" opacity=".85"/><text x="10" y="23" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3a4a50" font-family="sans-serif">A-7</text><circle cx="25" cy="20" r="4" fill="#ffb347" opacity=".7"/></svg>',
  tube: '<svg viewBox="0 0 40 40"><rect x="15" y="4" width="10" height="5" rx="1.5" fill="#5d6d72"/><path d="M15.5 9h9v22a4.5 4.5 0 0 1-9 0z" fill="#d8eef2" opacity=".55"/><path d="M15.5 18h9v13a4.5 4.5 0 0 1-9 0z" fill="#ff9d2e"/><circle cx="19" cy="24" r="1.4" fill="#ffd79a"/><circle cx="22" cy="28" r="1" fill="#ffd79a"/><circle cx="20.5" cy="20.5" r=".9" fill="#ffd79a"/></svg>',
  badge: '<svg viewBox="0 0 40 40"><rect x="8" y="6" width="24" height="30" rx="3" fill="#f3f6f7"/><rect x="16" y="3" width="8" height="5" rx="1.5" fill="#7b8a90"/><rect x="8" y="6" width="24" height="7" rx="3" fill="#2f8a9a"/><circle cx="20" cy="20" r="4" fill="#c4ced2"/><path d="M13 30c1-4 4-5 7-5s6 1 7 5" fill="#c4ced2"/></svg>',
  cle: '<svg viewBox="0 0 40 40"><circle cx="13" cy="20" r="7" fill="none" stroke="#e2b23c" stroke-width="3.5"/><path d="M19.5 20H34M29 20v5M33 20v4" stroke="#e2b23c" stroke-width="3.5" stroke-linecap="round"/></svg>',
  seringue: '<svg viewBox="0 0 40 40"><g transform="rotate(-40 20 20)"><rect x="6" y="16" width="22" height="8" rx="1.5" fill="#d8eef2" opacity=".85"/><rect x="6" y="16" width="10" height="8" fill="#9fd3a8" opacity=".7"/><path d="M9 16v8M13 16v8M17 16v8M21 16v8M25 16v8" stroke="#6b8a90" stroke-width=".7"/><rect x="2" y="14" width="4" height="12" rx="1" fill="#7b8a90"/><rect x="28" y="18.5" width="6" height="3" fill="#a7b3b8"/><path d="M34 20h5" stroke="#c9d2d6" stroke-width="1.2"/></g></svg>',
  fusible: '<svg viewBox="0 0 40 40"><rect x="8" y="14" width="24" height="12" rx="2" fill="#e9e3d2"/><rect x="3" y="15.5" width="6" height="9" rx="1" fill="#b9c2c6"/><rect x="31" y="15.5" width="6" height="9" rx="1" fill="#b9c2c6"/><text x="20" y="23" text-anchor="middle" font-size="7" font-weight="700" fill="#7a3b2b" font-family="sans-serif">16A</text></svg>',
  stabilisateur: '<svg viewBox="0 0 40 40"><rect x="16" y="4" width="8" height="6" rx="1.5" fill="#5d6d72"/><path d="M16.5 10h7v6l7 13a3 3 0 0 1-2.6 4.5H12.1A3 3 0 0 1 9.5 29l7-13z" fill="#d8eef2" opacity=".5"/><path d="M12.5 22h15l3 7a3 3 0 0 1-2.6 4.5H12.1A3 3 0 0 1 9.5 29z" fill="#f4b860"/></svg>',
  paper: '<svg viewBox="0 0 40 40"><rect x="9" y="5" width="22" height="30" rx="2" fill="#7a3b2b"/><rect x="12" y="8" width="17" height="24" fill="#efe6cf"/><path d="M15 13h11M15 17h11M15 21h8M15 25h10" stroke="#8b7f66" stroke-width="1.2"/></svg>',
  form: '<svg viewBox="0 0 40 40"><rect x="9" y="5" width="22" height="30" rx="2" fill="#e8eef0"/><rect x="9" y="5" width="22" height="7" rx="2" fill="#a2361d"/><path d="M13 17h14M13 21h14M13 25h9" stroke="#7d8d92" stroke-width="1.2"/></svg>',
  voice: '<svg viewBox="0 0 40 40"><rect x="10" y="4" width="20" height="32" rx="4" fill="#22343a"/><rect x="12" y="8" width="16" height="22" rx="1" fill="#0d1a1c"/><path d="M14 19v2M17 16v8M20 13v14M23 16v8M26 18v4" stroke="#ffb347" stroke-width="1.6" stroke-linecap="round"/></svg>',
  notes: '<svg viewBox="0 0 40 40"><path d="M10 6h20v28H10z" fill="#efe6cf" transform="rotate(-6 20 20)"/><path d="M14 13h12M14 17h12M14 21h8M14 25h10" stroke="#8b7f66" stroke-width="1.2" transform="rotate(-6 20 20)"/><path d="M10 6l2 3-2 3 2 3-2 3 2 3-2 3 2 3-2 3 2 3" stroke="#d9cfb6" stroke-width="1" fill="none" transform="rotate(-6 20 20)"/></svg>',
};
const hcIcon = it => HC_IC[it.id] || HC_IC[it.kind] || HC_IC.paper;

// ---------------------------------------------------------------- les pièces (dessins vectoriels, une case = 1 unité)
// Chaque pièce : ses endroits [x, y, largeur, hauteur] (zone à toucher, et cadrage du gros plan) et son dessin.
const hcFlasks = (cols, x, y, gap, s) => `<g class="hcx-uv">${(cols || []).map((c, i) => `<path transform="translate(${x + i * gap} ${y}) scale(${s})" d="M-3 -10h6v7l7 13a2 2 0 0 1-2 3h-16a2 2 0 0 1-2-3l7-13z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="1.6"/>`).join('')}</g>`;
const HC_ROOMS = {
  labo: {
    spots: { frigo: [8, 68, 70, 174], tableau: [90, 26, 116, 82], armoire: [214, 26, 76, 128], porteB: [310, 36, 100, 206], bureau: [86, 170, 122, 72], photo: [96, 144, 28, 26], pc: [146, 114, 62, 56], minuteur: [214, 168, 38, 30], micro: [256, 128, 46, 70] },
    draw: (f, art) => `
    <defs>
      <linearGradient id="hcw1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173430"/><stop offset="1" stop-color="#0e211e"/></linearGradient>
      <linearGradient id="hcf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a19"/><stop offset="1" stop-color="#060d0c"/></linearGradient>
      <radialGradient id="hcl1" cx=".5" cy="0" r=".8"><stop offset="0" stop-color="#ffd59a" stop-opacity=".22"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>
      <radialGradient id="hcr1" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a4a" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a4a" stop-opacity="0"/></radialGradient>
      <linearGradient id="hcm1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fa3a3"/><stop offset=".5" stop-color="#b5c4c3"/><stop offset="1" stop-color="#7e9393"/></linearGradient>
    </defs>
    <rect width="420" height="242" fill="url(#hcw1)"/><path d="M0 60H420M0 120H420M0 180H420" stroke="#fff" stroke-opacity=".025"/>
    <rect y="240" width="420" height="60" fill="url(#hcf1)"/><path d="M0 252H420M0 268H420M0 288H420M60 240L20 300M150 240L130 300M240 240L250 300M330 240L370 300" stroke="#fff" stroke-opacity=".04"/>
    <rect x="120" y="0" width="180" height="5" rx="2" fill="#ffe2b0" opacity=".7"/><rect x="40" y="0" width="340" height="200" fill="url(#hcl1)"/>
    <g data-spot="frigo"><rect x="10" y="70" width="66" height="170" rx="7" fill="url(#hcm1)"/><rect x="10" y="128" width="66" height="2" fill="#5d6f70"/>
      <rect x="66" y="88" width="4" height="30" rx="2" fill="#4b5b5c"/><rect x="66" y="140" width="4" height="40" rx="2" fill="#4b5b5c"/>
      <rect x="18" y="80" width="26" height="12" rx="2" fill="#0b1615"/><text x="31" y="89" text-anchor="middle" font-size="8" font-family="ui-monospace,monospace" fill="#62e3a7">-18°</text>
      ${f.has('frigo') ? '<rect x="14" y="134" width="50" height="100" rx="4" fill="#d9eef2" opacity=".18"/>' : '<path d="M10 150c10-6 18 4 28-2s20 6 38-4V240H10Z" fill="#eaf7fb" opacity=".75"/><path d="M12 128c8 4 14-3 22 2s16-4 24 1 12-2 18 0v12c-9 3-15-3-24 1s-16-2-24 2-12-1-16 0Z" fill="#eaf7fb" opacity=".7"/><circle cx="24" cy="200" r="1.4" fill="#fff"/><circle cx="50" cy="176" r="1.2" fill="#fff"/><circle cx="60" cy="214" r="1.6" fill="#fff"/>'}</g>
    <g data-spot="tableau"><rect x="92" y="28" width="112" height="76" rx="3" fill="#56676a"/><rect x="96" y="32" width="104" height="68" rx="1" fill="#cfd8d5"/>
      <path d="M104 46c8-4 14 3 22-1M104 58h34M146 44l16 0M150 54c6 4 12-4 18 0M104 72c10 2 20-3 30 1M150 70h30M110 86h22" stroke="#7d8b88" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
      <text x="170" y="62" font-size="9" fill="#5f6d6a" font-family="sans-serif">H₂O₂ ?</text>${art.board ? hcFlasks(art.board, 108, 52, 22, 1) : ''}<rect x="128" y="102" width="40" height="4" rx="1" fill="#3e4c4e"/></g>
    <g data-spot="armoire"><rect x="216" y="28" width="72" height="124" rx="4" fill="#24363a"/>
      <rect x="220" y="32" width="31" height="116" fill="#9fd8e3" opacity="${f.has('armoire') ? .05 : .12}"/><rect x="253" y="32" width="31" height="116" fill="#9fd8e3" opacity="${f.has('armoire') ? .05 : .12}"/>
      <path d="M220 70H284M220 108H284" stroke="#3b5156" stroke-width="2"/>
      <rect x="226" y="54" width="7" height="15" rx="2" fill="#f2d14b"/><rect x="238" y="50" width="7" height="19" rx="2" fill="#4fbf7a"/><rect x="258" y="56" width="7" height="13" rx="2" fill="#e5533d"/><rect x="270" y="52" width="7" height="17" rx="2" fill="#3f8fe0"/>
      <rect x="230" y="92" width="10" height="15" rx="3" fill="#8a9a9c"/><rect x="262" y="94" width="14" height="13" rx="3" fill="#6f8183"/>
      ${f.has('armoire') ? '<path d="M253 32 L270 40 L270 140 L253 148Z" fill="#9fd8e3" opacity=".08"/>' : '<rect x="232" y="124" width="40" height="14" rx="2" fill="#7f9093"/><rect x="246" y="84" width="12" height="14" rx="2" fill="#ffb347"/><path d="M248 84v-4a4 4 0 0 1 8 0v4" stroke="#ffb347" stroke-width="2" fill="none"/>'}</g>
    <g data-spot="porteB"><circle cx="360" cy="28" r="18" fill="url(#hcr1)" class="hcx-alarm"/><circle cx="360" cy="28" r="4" fill="#ff5a4a" class="hcx-alarm"/>
      <rect x="312" y="38" width="96" height="202" rx="3" fill="#1d2b2f"/><rect x="318" y="44" width="84" height="196" rx="2" fill="${f.has('porteB') ? '#0a1416' : '#2a3b40'}"/>
      ${f.has('porteB') ? '<path d="M318 44 L352 54 L352 236 L318 240Z" fill="#2a3b40"/><path d="M330 240 L402 240 L380 300 L300 300Z" fill="#ffe2b0" opacity=".05"/>' : '<rect x="336" y="60" width="48" height="56" rx="3" fill="#0d1a1c" stroke="#3d5258"/><rect x="388" y="140" width="10" height="34" rx="2" fill="#5a6b6f"/>'}
      <rect x="322" y="130" width="22" height="30" rx="3" fill="#0b1415" stroke="#4a5c60"/><rect x="325" y="133" width="16" height="7" rx="1" fill="${f.has('porteB') ? '#62e3a7' : '#ff5a4a'}" opacity=".85"/>
      <g fill="#5b6e72"><circle cx="328" cy="145" r="1.6"/><circle cx="333" cy="145" r="1.6"/><circle cx="338" cy="145" r="1.6"/><circle cx="328" cy="150" r="1.6"/><circle cx="333" cy="150" r="1.6"/><circle cx="338" cy="150" r="1.6"/><circle cx="328" cy="155" r="1.6"/><circle cx="333" cy="155" r="1.6"/><circle cx="338" cy="155" r="1.6"/></g>
      <rect x="342" y="196" width="40" height="13" rx="2" fill="#3c5a60"/><text x="362" y="205.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#e9f2ef" font-family="sans-serif">Réserve</text></g>
    <g data-spot="bureau"><rect x="88" y="168" width="118" height="9" rx="2" fill="#6b4a33"/><rect x="196" y="177" width="6" height="63" fill="#4c3524"/>
      <rect x="92" y="177" width="50" height="63" rx="2" fill="#5a3e2b"/><rect x="95" y="181" width="44" height="24" rx="1" fill="#634532"/><rect x="95" y="209" width="44" height="26" rx="1" fill="#634532"/>
      <rect x="109" y="191" width="16" height="3" rx="1.5" fill="#c79a5a"/><rect x="109" y="220" width="16" height="3" rx="1.5" fill="#c79a5a"/>${f.has('tiroirBas') ? '' : '<circle cx="131" cy="221.5" r="2" fill="#e2b23c"/>'}
      ${f.has('tiroir') ? '<rect x="92" y="203" width="52" height="5" rx="1" fill="#3a281b"/>' : ''}${f.has('tiroirBas') ? '<rect x="92" y="234" width="52" height="5" rx="1" fill="#3a281b"/>' : ''}
      <rect x="128" y="160" width="12" height="8" rx="1" fill="#f6e36b"/><rect x="178" y="156" width="10" height="12" rx="2" fill="#c9d3d3" opacity="0"/></g>
    <g data-spot="photo"><rect x="100" y="148" width="20" height="20" rx="1.5" fill="#c79a5a"/><rect x="102.5" y="150.5" width="15" height="15" fill="#e8d9b5"/><circle cx="107" cy="156" r="2.4" fill="#7a4a30"/><ellipse cx="113" cy="161" rx="4" ry="2.6" fill="#e08a3c"/></g>
    <g data-spot="pc"><rect x="168" y="160" width="12" height="8" fill="#3b4a4d"/><rect x="160" y="166" width="28" height="3" rx="1" fill="#3b4a4d"/>
      <rect x="150" y="118" width="48" height="42" rx="3" fill="#222e31"/><rect x="153" y="121" width="42" height="34" rx="1" fill="${f.has('pc') ? '#1c3d48' : '#10262c'}"/>
      ${f.has('pc') ? '<path d="M157 128h30M157 133h26M157 138h32M157 143h20" stroke="#7fc8d8" stroke-width="1.5" opacity=".7"/>' : '<rect x="163" y="134" width="22" height="7" rx="1.5" fill="#0a1416" stroke="#3d6d78"/><circle cx="174" cy="128" r="3" fill="#3d6d78"/>'}
      <rect x="186" y="122" width="8" height="8" fill="#f6e36b" transform="rotate(8 190 126)"/></g>
    <rect x="210" y="196" width="96" height="10" rx="2" fill="#3c5357"/><rect x="214" y="206" width="88" height="34" fill="#22333a"/><path d="M258 206v34" stroke="#152227"/>
    <rect x="236" y="220" width="8" height="3" rx="1.5" fill="#6f8589"/><rect x="272" y="220" width="8" height="3" rx="1.5" fill="#6f8589"/>
    <g data-spot="minuteur"><rect x="220" y="178" width="26" height="18" rx="5" fill="${f.has('pile') ? '#4a5a5e' : '#e8e2d4'}"/><rect x="224" y="182" width="18" height="9" rx="2" fill="#0b1615"/>
      <text x="233" y="189.5" text-anchor="middle" font-size="7" font-family="ui-monospace,monospace" fill="${f.has('pile') ? '#24403a' : '#62e3a7'}">00:00</text></g>
    <g data-spot="micro"><rect x="262" y="188" width="34" height="8" rx="3" fill="#cfd8d8"/><path d="M286 188v-28" stroke="#cfd8d8" stroke-width="6" stroke-linecap="round"/>
      <rect x="266" y="140" width="10" height="34" rx="4" fill="#e9eeee" transform="rotate(-18 271 157)"/><rect x="264" y="134" width="12" height="7" rx="2" fill="#40585c" transform="rotate(-18 270 137)"/>
      <rect x="268" y="176" width="20" height="4" rx="1" fill="#8ea0a2"/>${f.has('micro') ? '<rect x="270" y="174" width="14" height="3" fill="#bfe3ea"/>' : ''}</g>`,
  },
  reserve: {
    spots: { etageres: [12, 34, 108, 208], affiche: [128, 28, 100, 76], blouse: [130, 108, 50, 134], caisse: [184, 182, 72, 60], classeur: [256, 104, 54, 138], fusibles: [242, 26, 76, 70], porteC: [324, 34, 90, 208] },
    draw: (f, art) => `
    <defs>
      <linearGradient id="hcw2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2b26"/><stop offset="1" stop-color="#1a1b17"/></linearGradient>
      <linearGradient id="hcf2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141410"/><stop offset="1" stop-color="#0a0a08"/></linearGradient>
      <radialGradient id="hcl2" cx=".45" cy="0" r=".7"><stop offset="0" stop-color="#ffd59a" stop-opacity=".28"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="420" height="242" fill="url(#hcw2)"/><path d="M0 40H420M0 90H420M0 140H420M0 190H420M30 0V40M90 40V90M150 0V40M210 40V90M270 0V40M330 40V90M390 0V40" stroke="#fff" stroke-opacity=".03"/>
    <rect y="240" width="420" height="60" fill="url(#hcf2)"/><path d="M0 256H420M0 276H420M100 240L80 300M220 240L225 300M330 240L360 300" stroke="#fff" stroke-opacity=".04"/>
    <path d="M190 0V14" stroke="#555" stroke-width="1.5"/><circle cx="190" cy="19" r="5" fill="#ffe7b8"/><rect x="0" y="0" width="420" height="230" fill="url(#hcl2)"/>
    <g data-spot="etageres"><rect x="16" y="36" width="5" height="204" fill="#6c7476"/><rect x="111" y="36" width="5" height="204" fill="#6c7476"/>
      ${[70, 122, 174, 224].map(y => `<rect x="16" y="${y}" width="100" height="5" fill="#8a9396"/>`).join('')}
      <rect x="24" y="46" width="34" height="24" fill="#a0784c"/><rect x="62" y="52" width="44" height="18" fill="#8d6a43"/><path d="M24 58h34M62 61h44" stroke="#6b4e2f" stroke-width=".8"/>
      ${['#f2d14b', '#4fbf7a', '#f2d14b', '#3f8fe0', '#e5533d', '#4fbf7a', '#f2d14b', '#e5533d'].map((c, i) => `<rect x="${24 + i * 11}" y="${102 - (i % 3) * 3}" width="8" height="${20 + (i % 3) * 3}" rx="2" fill="${c}"/><rect x="${25.5 + i * 11}" y="${98 - (i % 3) * 3}" width="5" height="5" fill="#d9dfe1"/>`).join('')}
      <rect x="24" y="150" width="40" height="24" fill="#d9e2e6"/><text x="44" y="165" text-anchor="middle" font-size="7" fill="#4a5a60" font-family="sans-serif">Gants</text><rect x="70" y="154" width="38" height="20" fill="#c7d0d4"/>
      <rect x="26" y="200" width="30" height="24" fill="#5d7a8a"/><rect x="62" y="206" width="44" height="18" fill="#a0784c"/></g>
    <g data-spot="affiche"><rect x="130" y="30" width="96" height="70" fill="#e9eef0"/><rect x="130" y="30" width="96" height="9" fill="#2f6f8a"/>
      <text x="178" y="37" text-anchor="middle" font-size="6" font-weight="700" fill="#fff" font-family="sans-serif">Tableau périodique</text>
      ${hcPeriodic(134, 43, 5, 6.6, art.poster, true)}</g>
    <g data-spot="blouse"><rect x="153" y="112" width="4" height="126" fill="#4b4f50"/><path d="M143 238h24" stroke="#4b4f50" stroke-width="4" stroke-linecap="round"/><circle cx="155" cy="114" r="4" fill="#4b4f50"/>
      <path d="M155 122 L138 132 L134 214 L176 214 L172 132 Z" fill="#eef2f3"/><path d="M155 122 L148 150 L155 214 M155 122 L162 150 L155 214" stroke="#c5ced2" fill="none"/>
      <rect x="140" y="160" width="11" height="12" fill="#dde4e7"/><path d="M144 160v-4" stroke="#2f6f8a" stroke-width="1.5"/>${f.has('cle') ? '' : '<rect x="160" y="182" width="11" height="12" fill="#dde4e7"/><path d="M164 182c1-3 3-3 4 0" stroke="#e2b23c" stroke-width="1.5" fill="none"/>'}
      <text x="165" y="146" font-size="4.5" fill="#2f6f8a" font-family="sans-serif">Rémi</text></g>
    <g data-spot="caisse"><rect x="186" y="190" width="68" height="50" fill="#a0784c"/><path d="M186 206h68M186 222h68" stroke="#7d5a35" stroke-width="1.2"/><rect x="186" y="186" width="68" height="6" fill="${f.has('caisse') ? '#6b4e2f' : '#b38957'}" ${f.has('caisse') ? 'transform="rotate(-10 186 186)"' : ''}/>
      ${f.has('caisse') ? '<path d="M192 190c10-8 30-6 54 0" stroke="#d9c37a" stroke-width="3" fill="none"/>' : '<circle cx="190" cy="189" r="1.6" fill="#555"/><circle cx="250" cy="189" r="1.6" fill="#555"/>'}
      <text x="220" y="217" text-anchor="middle" font-size="6" fill="#4a3420" font-family="sans-serif">Pièces électriques</text></g>
    <g data-spot="fusibles"><rect x="244" y="28" width="72" height="64" rx="3" fill="#8b9497"/><rect x="248" y="32" width="64" height="56" rx="2" fill="#5d666a"/>
      ${[0, 1, 2, 3, 4, 5].map(i => { const x = 252 + (i % 3) * 20, y = 37 + Math.floor(i / 3) * 26, full = [0, 2, 4].includes(i) || (i === 3 && f.has('power')); return `<rect x="${x}" y="${y}" width="16" height="20" rx="1.5" fill="#2b3134"/>${full ? `<rect x="${x + 4}" y="${y + 4}" width="8" height="12" rx="1" fill="#e9e3d2"/>` : ''}`; }).join('')}
      <circle cx="310" cy="34" r="2" fill="${f.has('power') ? '#62e3a7' : '#6a3b35'}"/></g>
    <g data-spot="classeur"><rect x="258" y="106" width="50" height="134" rx="2" fill="#6d7b80"/>
      ${[0, 1, 2, 3].map(i => `<rect x="262" y="${111 + i * 32}" width="42" height="28" rx="1.5" fill="#7f8e93"/><rect x="276" y="${121 + i * 32}" width="14" height="4" rx="2" fill="#4b585c"/>`).join('')}
      ${f.has('classeur') ? '<rect x="258" y="139" width="50" height="6" fill="#3d474a"/>' : '<rect x="290" y="114" width="10" height="11" rx="2" fill="#ffb347"/><path d="M292 114v-3a3 3 0 0 1 6 0v3" stroke="#ffb347" stroke-width="1.6" fill="none"/>'}</g>
    <g data-spot="porteC"><rect x="326" y="36" width="86" height="204" rx="3" fill="#1f2426"/><rect x="332" y="42" width="74" height="198" rx="2" fill="${f.has('porteC') ? '#05080a' : '#3a4144'}"/>
      ${f.has('porteC') ? '<path d="M332 42 L362 52 L362 236 L332 240Z" fill="#3a4144"/><path d="M370 60 L400 60 L400 230 L370 230Z" fill="#3fa0d8" opacity=".08"/>' : '<rect x="350" y="62" width="38" height="44" rx="2" fill="#13181a" stroke="#4a5356"/><rect x="394" y="140" width="8" height="30" rx="2" fill="#6a7376"/>'}
      <rect x="340" y="132" width="16" height="24" rx="2" fill="#0e1214" stroke="#4a5356"/><rect x="343" y="136" width="10" height="4" rx="1" fill="${f.has('porteC') ? '#62e3a7' : f.has('power') ? '#7fe0a0' : '#2a2f31'}"${f.has('power') && !f.has('porteC') ? ' class="hcx-alarm"' : ''}/>
      <rect x="352" y="196" width="40" height="13" rx="2" fill="#3c5a60"/><text x="372" y="205.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#e9f2ef" font-family="sans-serif">Contrôle</text></g>`,
  },
  controle: {
    spots: { ecran: [12, 26, 156, 104], doseur: [16, 138, 130, 104], chambre: [168, 26, 136, 216], sortie: [316, 34, 98, 208] },
    draw: (f, art) => `
    <defs>
      <linearGradient id="hcw3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c2e"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
      <linearGradient id="hcf3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e18"/><stop offset="1" stop-color="#05070d"/></linearGradient>
      <radialGradient id="hcg3" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="${f.has('fin') ? '#ffd28a' : '#ff8a1e'}" stop-opacity="${f.has('fin') ? .35 : .55}"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="420" height="242" fill="url(#hcw3)"/><path d="M0 50H420M0 110H420M0 170H420" stroke="#8fb4ff" stroke-opacity=".035"/>
    <rect y="240" width="420" height="60" fill="url(#hcf3)"/><path d="M0 258H420M0 280H420M120 240L100 300M240 240L240 300M340 240L370 300" stroke="#fff" stroke-opacity=".04"/>
    <g data-spot="ecran"><rect x="14" y="30" width="150" height="70" rx="3" fill="#0a0f1a"/>
      ${[0, 1, 2].map(i => `<rect x="${18 + i * 49}" y="34" width="45" height="62" rx="2" fill="${i === 1 ? '#2a0e0e' : '#0e2030'}"/>`).join('')}
      <text x="89" y="56" text-anchor="middle" font-size="7" font-weight="700" fill="${f.has('fin') ? '#62e3a7' : '#ff6b5e'}" font-family="ui-monospace,monospace" class="${f.has('fin') ? '' : 'hcx-alarm'}">${f.has('fin') ? 'STABLE' : 'ALERTE'}</text>
      <text x="89" y="68" text-anchor="middle" font-size="5" fill="#ffb3a8" font-family="ui-monospace,monospace">Ambre-7</text>
      <path d="M22 70l6-8 6 4 6-12 6 6 6-3" stroke="#5ac8ff" stroke-width="1.2" fill="none"/><path d="M22 84h32M22 88h24" stroke="#5ac8ff" stroke-width="1" opacity=".5"/>
      <path d="M120 80l5-14 5 10 5-6 5 8 4-4" stroke="#62e3a7" stroke-width="1.2" fill="none"/><path d="M120 46h32M120 52h22" stroke="#62e3a7" stroke-width="1" opacity=".5"/>
      <rect x="10" y="104" width="158" height="8" rx="2" fill="#2a3346"/><rect x="40" y="112" width="6" height="18" fill="#232b3b"/><rect x="132" y="112" width="6" height="18" fill="#232b3b"/></g>
    <g data-spot="doseur"><rect x="20" y="150" width="122" height="88" rx="6" fill="#c9d1d6"/><rect x="26" y="156" width="110" height="10" rx="2" fill="#9aa5ab"/>
      ${[['#3f8fe0', 0], ['#4fbf7a', 1], ['#e5533d', 2]].map(([c, i]) => `<rect x="${32 + i * 34}" y="172" width="24" height="38" rx="4" fill="#e8eef0" opacity=".85"/><rect x="${32 + i * 34}" y="${f.has('stab') ? 204 : 184}" width="24" height="${f.has('stab') ? 6 : 26}" rx="3" fill="${c}"/>`).join('')}
      <rect x="40" y="216" width="82" height="16" rx="3" fill="#2b3338"/><rect x="44" y="219" width="40" height="10" rx="1.5" fill="#0d1a1c"/><text x="64" y="226.5" text-anchor="middle" font-size="6" fill="#62e3a7" font-family="ui-monospace,monospace">${f.has('stab') ? 'PRÊT' : '0 · 0 · 0'}</text>
      <circle cx="104" cy="224" r="5" fill="#e5533d"/>${f.has('seringue') ? '<rect x="138" y="182" width="16" height="6" rx="1" fill="#d8eef2"/><rect x="132" y="181" width="6" height="8" rx="1" fill="#7b8a90"/>' : '<rect x="140" y="182" width="6" height="8" rx="1" fill="#5d666a"/>'}</g>
    <g data-spot="chambre"><rect x="178" y="210" width="116" height="30" rx="3" fill="#2a3346"/><rect x="186" y="214" width="100" height="6" rx="2" fill="#3a465e"/>
      <path d="M190 210 V80 a46 46 0 0 1 92 0 V210 Z" fill="#9fd8e3" opacity=".09"/><path d="M190 210 V80 a46 46 0 0 1 92 0 V210" fill="none" stroke="#bfe3ea" stroke-opacity=".5" stroke-width="2"/>
      <path d="M200 84 a36 36 0 0 1 22 -30" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="226" y="178" width="20" height="32" rx="3" fill="#3a465e"/>
      ${f.has('tubeIn') ? `<rect x="230" y="138" width="12" height="42" rx="6" fill="#d8eef2" opacity=".6"/><rect x="230" y="152" width="12" height="28" rx="6" fill="${f.has('fin') ? '#f4c27a' : '#ff9d2e'}"/><circle cx="236" cy="150" r="40" fill="url(#hcg3)"${f.has('fin') ? '' : ' class="hcx-pulse"'}/>` : '<rect x="231" y="168" width="10" height="10" rx="2" fill="#1a2030"/>'}
      <path d="M282 120 h20 v-40" stroke="#7b8a90" stroke-width="4" fill="none"/><rect x="296" y="70" width="12" height="14" rx="2" fill="#7b8a90"/></g>
    <g data-spot="sortie"><rect x="318" y="36" width="94" height="204" rx="3" fill="#1b2130"/><rect x="324" y="42" width="82" height="198" rx="2" fill="${f.has('fin') ? '#0b1a10' : '#2c3548'}"/>
      <rect x="338" y="22" width="54" height="13" rx="2" fill="${f.has('fin') ? '#2fbf6a' : '#2f8a52'}"/><text x="365" y="31.5" text-anchor="middle" font-size="8" font-weight="700" fill="#eafff2" font-family="sans-serif">Sortie</text>
      <rect x="330" y="130" width="70" height="8" rx="3" fill="#59627a"/><rect x="380" y="150" width="14" height="22" rx="2" fill="#0b0e16"/><circle cx="387" cy="157" r="3" fill="${f.has('fin') ? '#62e3a7' : '#ff5a4a'}"/></g>`,
  },
};

// le tableau périodique, des 20 premiers éléments (dessiné dans l'affiche et en gros plan)
const HC_EL = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca'.split(' ');
const HC_POS = [[0, 0], [17, 0], [0, 1], [1, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [0, 2], [1, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [0, 3], [1, 3]];
function hcPeriodic(x0, y0, cw, ch, marks, mini) {
  const m = new Map((marks || []).map(([s, n]) => [s, n]));
  return HC_EL.map((s, i) => {
    const [cx, cy] = HC_POS[i], x = x0 + cx * cw, y = y0 + cy * ch, n = m.get(s);
    return `<rect x="${x}" y="${y}" width="${cw - .6}" height="${ch - .6}" fill="${['#f7d58a', '#cfe8f5', '#f5b6a8', '#f3e3a2'][cy % 4]}"/>`
      + (mini ? '' : `<text x="${x + 1}" y="${y + ch * .33}" font-size="${ch * .24}" fill="#5a6468" font-family="sans-serif">${i + 1}</text><text x="${x + cw / 2}" y="${y + ch * .8}" text-anchor="middle" font-size="${ch * .42}" font-weight="700" fill="#22303a" font-family="sans-serif">${s}</text>`)
      + (n ? `<g class="hcx-uv"><circle cx="${x + cw / 2}" cy="${y + ch / 2}" r="${cw * .62}" fill="none" stroke="#b693ff" stroke-width="${mini ? .8 : 1.6}"/>${mini ? '' : `<circle cx="${x + cw - 1}" cy="${y + 1}" r="${cw * .2}" fill="#b693ff"/><text x="${x + cw - 1}" y="${y + 1 + cw * .08}" text-anchor="middle" font-size="${cw * .24}" font-weight="800" fill="#1b0f33" font-family="sans-serif">${n}</text>`}</g>` : '');
  }).join('');
}

// ---------------------------------------------------------------- les gros plans
function hcCrop(roomId, f, art, r) {
  const R = HC_ROOMS[roomId], pad = 10, w = r[2] + pad * 2, h = r[3] + pad * 2;
  return `<svg viewBox="${r[0] - pad} ${r[1] - pad} ${w} ${h}" class="hcx-crop" aria-hidden="true">${R.draw(f, art)}</svg>`;
}
const HC_ART = {
  photo: () => `<svg viewBox="0 0 320 220" aria-hidden="true"><rect width="320" height="220" fill="#c79a5a"/><rect x="14" y="14" width="292" height="192" fill="#e8d9b5"/><rect x="14" y="14" width="292" height="120" fill="#b9c9cc"/>
    <rect x="40" y="110" width="170" height="70" rx="4" fill="#3b4a4d"/><rect x="48" y="118" width="154" height="54" rx="2" fill="#55676b"/>
    <ellipse cx="120" cy="130" rx="54" ry="22" fill="#e08a3c"/><circle cx="74" cy="118" r="18" fill="#e08a3c"/><path d="M60 104l4-12 8 9zM84 103l6-10 4 12z" fill="#e08a3c"/><path d="M66 118q4 3 8 0M78 118q4 3 8 0" stroke="#5a3010" stroke-width="2" fill="none"/><path d="M170 130q30 6 26 -18" stroke="#e08a3c" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="250" cy="76" r="24" fill="#f1c9a5"/><path d="M226 70q4-30 26-30t24 34q-6-14-24-14t-26 10z" fill="#5a3a28"/><path d="M212 160q8-50 38-50t38 50z" fill="#fff"/><path d="M243 82q7 5 14 0" stroke="#7a4a30" stroke-width="2" fill="none"/><rect x="246" y="112" width="8" height="20" fill="#2f6f8a"/></svg>`,
  'pc-login': () => `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" rx="8" fill="#222e31"/><rect x="10" y="10" width="300" height="180" rx="3" fill="#10262c"/><circle cx="160" cy="70" r="22" fill="#3d6d78"/><path d="M146 98q14-14 28 0" fill="#3d6d78"/><text x="160" y="118" text-anchor="middle" font-size="13" fill="#bfe3ea" font-family="sans-serif">Dr S. Vasseur</text><rect x="100" y="128" width="120" height="22" rx="4" fill="#0a1416" stroke="#3d6d78"/><text x="160" y="143" text-anchor="middle" font-size="10" fill="#5d8a94" font-family="sans-serif">Mot de passe</text><rect x="236" y="22" width="60" height="56" fill="#f6e36b" transform="rotate(6 266 50)"/><text x="266" y="44" text-anchor="middle" font-size="7.5" fill="#5a4a10" font-family="Bradley Hand,Segoe Print,cursive" transform="rotate(6 266 50)">tu sais bien</text><text x="266" y="55" text-anchor="middle" font-size="7.5" fill="#5a4a10" font-family="Bradley Hand,Segoe Print,cursive" transform="rotate(6 266 50)">qui dort sur</text><text x="266" y="66" text-anchor="middle" font-size="7.5" fill="#5a4a10" font-family="Bradley Hand,Segoe Print,cursive" transform="rotate(6 266 50)">mon clavier</text></svg>`,
  'pc-journal': () => `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" rx="8" fill="#222e31"/><rect x="10" y="10" width="300" height="180" rx="3" fill="#e9f1f3"/><rect x="10" y="10" width="300" height="20" rx="3" fill="#2f6f8a"/><text x="20" y="24" font-size="9" fill="#fff" font-family="sans-serif">Journal d’expérience · Ambre-7</text>${[46, 62, 78, 94, 110, 126, 142].map((y, i) => `<rect x="22" y="${y}" width="${[250, 270, 210, 260, 180, 240, 140][i]}" height="5" rx="2" fill="#9fb4ba"/>`).join('')}<rect x="200" y="160" width="96" height="20" rx="4" fill="#2f8a9a"/><text x="248" y="173" text-anchor="middle" font-size="8" fill="#fff" font-family="sans-serif">Imprimer un badge</text></svg>`,
  board: (art) => `<svg viewBox="0 0 320 170" aria-hidden="true"><rect width="320" height="170" fill="${art.board ? '#1d1530' : '#cfd8d5'}"/><path d="M30 40c20-8 34 6 54-2M30 70h80M150 36h50M156 60c14 8 28-8 42 0M30 110c24 4 48-6 72 2M150 106h70M40 140h50" stroke="${art.board ? '#4a3d66' : '#7d8b88'}" stroke-width="3" fill="none" stroke-linecap="round"/><text x="230" y="66" font-size="20" fill="${art.board ? '#4a3d66' : '#5f6d6a'}" font-family="sans-serif">H₂O₂ ?</text>${art.board ? hcFlasks(art.board, 70, 100, 60, 2.4) : ''}</svg>`,
  micro: (art) => `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" fill="#020606"/><circle cx="160" cy="100" r="88" fill="#ffe2a8"/><g opacity=".45" fill="#e2a24a">${Array.from({ length: 22 }, (_, i) => { const a = i * 2.4, r = 20 + (i * 13) % 60; return `<ellipse cx="${(160 + Math.cos(a) * r).toFixed(1)}" cy="${(100 + Math.sin(a) * r).toFixed(1)}" rx="${7 + i % 5}" ry="${5 + i % 4}"/>`; }).join('')}</g><text x="160" y="116" text-anchor="middle" font-size="46" font-weight="700" fill="#5a3410" font-family="ui-monospace,Consolas,monospace" letter-spacing="6">${esc(art.micro || '')}</text><circle cx="160" cy="100" r="88" fill="none" stroke="#000" stroke-width="10" opacity=".35"/></svg>`,
  shelves: () => `<svg viewBox="0 0 320 170" aria-hidden="true"><rect width="320" height="170" fill="#2a2b26"/><rect x="0" y="128" width="320" height="10" fill="#8a9396"/><rect x="0" y="138" width="320" height="32" fill="#1a1b17"/>
    ${['#f2d14b', '#4fbf7a', '#f2d14b', '#3f8fe0', '#e5533d', '#4fbf7a', '#f2d14b', '#e5533d'].map((c, i) => { const h = 62 + (i % 3) * 10, x = 14 + i * 38; return `<rect x="${x}" y="${128 - h}" width="28" height="${h}" rx="6" fill="${c}"/><rect x="${x + 6}" y="${128 - h - 12}" width="16" height="14" rx="2" fill="#d9dfe1"/><rect x="${x + 4}" y="${128 - h / 2 - 9}" width="20" height="18" rx="2" fill="#f2efe6" opacity=".55"/><path d="M${x + 7} ${128 - h / 2 - 3}h14M${x + 7} ${128 - h / 2 + 3}h10" stroke="#8b8577" stroke-width="1.5" opacity=".5"/>`; }).join('')}</svg>`,
  poster: (art) => `<svg viewBox="0 0 320 150" aria-hidden="true"><rect width="320" height="150" fill="#e9eef0"/><rect width="320" height="18" fill="#2f6f8a"/><text x="160" y="13" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" font-family="sans-serif">Tableau périodique des éléments</text>${art.poster ? '<rect y="18" width="320" height="132" fill="#2a1d4a" opacity=".18"/>' : ''}${hcPeriodic(8, 24, 16.9, 30, art.poster, false)}</svg>`,
  fuse: (art, f) => `<svg viewBox="0 0 320 170" aria-hidden="true"><rect width="320" height="170" rx="8" fill="#8b9497"/><rect x="10" y="10" width="300" height="150" rx="5" fill="#5d666a"/>
    ${['Éclairage', '', 'Ventilation', '', 'Alarme', ''].map((t, i) => { const x = 24 + (i % 3) * 96, y = 20 + Math.floor(i / 3) * 72, full = [0, 2, 4].includes(i) || (i === 3 && f.has('power')); return `<rect x="${x}" y="${y}" width="80" height="60" rx="4" fill="#2b3134"/><text x="${x + 8}" y="${y + 16}" font-size="13" font-weight="800" fill="#e9f2ef" font-family="sans-serif">${i + 1}</text>${full ? `<rect x="${x + 30}" y="${y + 12}" width="22" height="36" rx="2" fill="#e9e3d2"/>` : `<rect x="${x + 30}" y="${y + 12}" width="22" height="36" rx="2" fill="#1b2022" stroke="#444c50" stroke-dasharray="3 3"/>`}${t ? `<rect x="${x + 4}" y="${y + 48}" width="72" height="10" rx="1" fill="#efe6cf"/><text x="${x + 40}" y="${y + 56}" text-anchor="middle" font-size="7.5" fill="#3a3220" font-family="sans-serif">${t}</text>` : `<path d="M${x + 6} ${y + 52}h20" stroke="#efe6cf" stroke-width="2" opacity=".35"/>`}`; }).join('')}</svg>`,
  screen: () => `<svg viewBox="0 0 320 170" aria-hidden="true"><rect width="320" height="170" rx="6" fill="#0a0f1a"/><rect x="10" y="10" width="300" height="150" rx="3" fill="#160c0c"/><text x="160" y="46" text-anchor="middle" font-size="20" font-weight="800" fill="#ff6b5e" font-family="ui-monospace,monospace" class="hcx-alarm">ALERTE</text><text x="160" y="72" text-anchor="middle" font-size="11" fill="#ffb3a8" font-family="ui-monospace,monospace">Ambre-7 : instable</text><text x="160" y="92" text-anchor="middle" font-size="11" fill="#ffb3a8" font-family="ui-monospace,monospace">Confinement : actif</text><text x="160" y="120" text-anchor="middle" font-size="11" fill="#62e3a7" font-family="ui-monospace,monospace">Stabilisateur requis : 9 doses</text><path d="M40 140l20-10 20 6 20-14 20 8 20-4 20 10 20-12 20 6 20-2 20 8" stroke="#ff6b5e" stroke-width="1.5" fill="none"/></svg>`,
};

// ---------------------------------------------------------------- le chrono (compté sur ce téléphone depuis la dernière vue reçue)
const hcLeft = v => v.left == null ? null : Math.max(0, v.left - (v.phase === 'play' ? Date.now() - hcRecv : 0));
const hcClock = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
setInterval(() => {
  const v = hcLast, c = hcSk?.clock; if (!v || !c || !c.isConnected || v.phase !== 'play' || v.timeless) return;
  const l = hcLeft(v);
  document.querySelectorAll('#hc-main .hcx-time').forEach(b => { b.textContent = hcClock(l); b.classList.toggle('low', l < 5 * 60000); });
}, 500);

// ---------------------------------------------------------------- construire l'écran
function hcBuild(root) {
  root.innerHTML = '';
  const add = (tag, cls) => root.appendChild(el(tag, cls));
  hcSk = { bar: add('div', 'hcx-barbox'), rooms: add('nav', 'hcx-rooms'), main: add('div', 'hcx-mainbox'), say: add('div', 'hcx-saybox'), tray: add('div', 'hcx-traybox'), side: add('aside', 'hcx-side'), sceneKey: '', invKey: '', roomsKey: '', mainKey: '' };
  hcSk.rooms.setAttribute('aria-label', 'Les pièces');
  hcSk.scene = el('div', 'hcx-scene');
  hcBindDrag();
}

function hcSetRoom(r) {
  if (!hcLast?.rooms.find(x => x.id === r && x.open)) return;
  hcRoom = r; act({ t: 'hc:room', room: r }); renderHuisClos(hcLast);
}

// ---------------------------------------------------------------- tenir un objet, l'utiliser
function hcUse(item, on) {
  hcHeld = null;
  act({ t: 'hc:use', item, on });
  if (hcLast) renderHuisClos(hcLast);
}
function hcTapSpot(id) {
  if (hcHeld) { hcUse(hcHeld, id); return; }
  hcOpen('spot', id);
}
function hcBindDrag() {
  // la pièce : un toucher ouvre le gros plan (ou utilise l'objet en main)
  hcSk.scene.addEventListener('click', e => { const g = e.target.closest('[data-spot]'); if (g && !g.closest('.hcx-crop')) hcTapSpot(g.dataset.spot); });
  hcSk.scene.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const g = e.target.closest('[data-spot]'); if (g) { e.preventDefault(); hcTapSpot(g.dataset.spot); } });
  // l'inventaire : toucher = examiner, glisser = utiliser sur la pièce ou sur un autre objet
  const tray = hcSk.tray;
  tray.addEventListener('pointerdown', e => {
    const it = e.target.closest('.hcx-item'); if (!it || hcLast?.phase !== 'play') return;
    e.preventDefault();
    hcDrag = { id: it.dataset.id, doc: it.dataset.doc === '1', x: e.clientX, y: e.clientY, moved: false, ghost: null, pid: e.pointerId };
    try { it.setPointerCapture(e.pointerId); } catch { }
  });
  tray.addEventListener('pointermove', e => {
    const d = hcDrag; if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && !d.doc && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
      d.moved = true; d.ghost = el('div', 'hcx-ghost', HC_IC[d.id] || ''); document.body.appendChild(d.ghost);
      hcHeld = d.id; hcHand();
    }
    if (d.ghost) {
      d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
      const t = document.elementFromPoint(e.clientX, e.clientY);
      document.querySelectorAll('.hcx-item.target, [data-spot].target').forEach(x => x.classList.remove('target'));
      const tg = t?.closest('.hcx-item:not([data-doc="1"]), .hcx-scene [data-spot]');
      if (tg && tg.dataset.id !== d.id) tg.classList.add('target');
    }
  });
  const up = e => {
    const d = hcDrag; if (!d || e.pointerId !== d.pid) return;
    hcDrag = null;
    document.querySelectorAll('.hcx-item.target, [data-spot].target').forEach(x => x.classList.remove('target'));
    if (d.ghost) {
      d.ghost.remove();
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const spot = t?.closest('.hcx-scene [data-spot]'), it = t?.closest('.hcx-item:not([data-doc="1"])');
      if (spot) hcUse(d.id, spot.dataset.spot);
      else if (it && it.dataset.id !== d.id) hcUse(d.id, it.dataset.id);
      else { hcHeld = null; renderHuisClos(hcLast); }
      return;
    }
    if (e.type === 'pointercancel') return;
    // un simple toucher
    if (hcHeld && !d.doc && hcHeld !== d.id) { hcUse(hcHeld, d.id); return; }
    if (hcHeld === d.id) { hcHeld = null; renderHuisClos(hcLast); return; }
    hcOpen(d.doc ? 'doc' : 'item', d.id);
  };
  tray.addEventListener('pointerup', up); tray.addEventListener('pointercancel', up);
  tray.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const it = e.target.closest('.hcx-item'); if (!it) return; e.preventDefault();
    if (hcHeld && it.dataset.doc !== '1' && hcHeld !== it.dataset.id) hcUse(hcHeld, it.dataset.id); else hcOpen(it.dataset.doc === '1' ? 'doc' : 'item', it.dataset.id);
  });
}
function hcHand() {
  const v = hcLast, box = hcSk?.tray.querySelector('.hcx-hand'); if (!box) return;
  const it = hcHeld && v?.inv.find(x => x.id === hcHeld);
  box.hidden = !it || !!hcDrag?.ghost;                     // pendant un glisser, le bandeau ne pousse pas les tuiles sous le doigt
  if (it) box.querySelector('span').innerHTML = `<b>${esc(it.name)}</b> en main. Touche un endroit de la pièce ou un autre objet.`;
  hcSk.tray.querySelectorAll('.hcx-item').forEach(x => x.classList.toggle('sel', x.dataset.id === hcHeld));
  hcSk.scene.classList.toggle('aiming', !!it);
}

// ---------------------------------------------------------------- les feuilles (gros plan, objet, document, indices)
function hcOpen(kind, id) { hcSheet = { kind, id, key: '', code: '' }; hcSheetRender(); }
function hcClose() { hcSheet = null; document.getElementById('hcx-sheet')?.remove(); try { speechSynthesis.cancel(); } catch { } }
function hcSheetRender() {
  const v = hcLast, S = hcSheet; if (!S || !v) return;
  let data = null, html = '';
  if (S.kind === 'spot') { data = v.spots[S.id]; if (!data) { hcClose(); return; } }
  if (S.kind === 'item') { data = v.inv.find(x => x.id === S.id); if (!data) { hcClose(); return; } }
  if (S.kind === 'doc') { data = v.docs.find(x => x.id === S.id); if (!data) { hcClose(); return; } }
  if (S.kind === 'hints') data = { steps: v.steps, phase: v.phase };
  const key = S.kind + '|' + JSON.stringify(data) + '|' + (S.kind === 'spot' ? JSON.stringify(v.art) + v.flags.join() : '');
  if (key === S.key && document.getElementById('hcx-sheet')) return;
  S.key = key;
  const f = new Set(v.flags);
  const solo = v.players.length <= 1;
  if (S.kind === 'spot') {
    const d = data, r = HC_ROOMS[d.room]?.spots[S.id];
    const art = d.art && HC_ART[d.art] ? HC_ART[d.art](v.art, f) : r ? hcCrop(d.room, f, v.art, r) : '';
    html = `<h3>${esc(d.title)}</h3>${d.kicker ? `<p class="hcx-kick">${esc(d.kicker)}</p>` : ''}${art ? `<div class="hcx-art">${art}</div>` : ''}${d.text ? `<p class="hcx-text">${esc(d.text)}</p>` : ''}${d.lock ? hcLockHTML(d.lock) : ''}
      <div class="hcx-row">${d.acts.map(a => `<button class="btn tb-btn hero" type="button" data-act="${esc(a.id)}">${esc(a.label)}</button>`).join('')}${d.goto ? `<button class="btn tb-btn hero" type="button" data-goto="${esc(d.goto)}">Y aller</button>` : ''}<button class="btn tb-btn glass" type="button" data-close>Fermer</button></div>`;
  } else if (S.kind === 'item') {
    const d = data;
    html = `<h3>${esc(d.name)}</h3><p class="hcx-kick">Dans l’inventaire commun</p><div class="hcx-art hcx-big">${HC_IC[d.id] || HC_IC.paper}</div><p class="hcx-text">${esc(d.desc)}</p>${d.doc ? hcDocHTML(d.doc) : ''}
      <div class="hcx-row"><button class="btn tb-btn hero" type="button" data-hold="${esc(d.id)}">Prendre en main</button><button class="btn tb-btn glass" type="button" data-close>Fermer</button></div>`;
  } else if (S.kind === 'doc') {
    const d = data;
    html = `<h3>${esc(d.title)}</h3><p class="hcx-kick priv">${solo ? 'Ton document.' : 'Seulement sur ton téléphone. Raconte-le aux autres.'}</p>${hcDocHTML(d)}<div class="hcx-row"><button class="btn tb-btn glass" type="button" data-close>Fermer</button></div>`;
  } else if (S.kind === 'hints') {
    const steps = data.steps;
    html = `<h3>Un indice</h3><p class="hcx-kick">Les indices pris se voient sur tous les téléphones.</p>${steps.length ? `<ul class="hcx-steps">${steps.map(st => `<li><b>${esc(st.label)}</b>${st.hints.map(h => `<p>${esc(h)}</p>`).join('')}${st.hints.length < st.max ? `<button class="btn tb-btn glass" type="button" data-hint="${esc(st.id)}">${st.hints.length === st.max - 1 ? 'La réponse' : 'Un coup de pouce'}</button>` : ''}</li>`).join('')}</ul>` : '<p class="hcx-text">Rien à débloquer pour l’instant.</p>'}
      <div class="hcx-row"><button class="btn tb-btn glass" type="button" data-close>Fermer</button></div>`;
  }
  let box = document.getElementById('hcx-sheet');
  if (!box) {
    box = el('div', 'hcx-scrim'); box.id = 'hcx-sheet';
    box.innerHTML = '<div class="hcx-sheet glass-thick" role="dialog" aria-modal="true"><div class="hcx-grab"></div><div class="hcx-body"></div></div>';
    $('#s-huisclos').appendChild(box);
    box.addEventListener('click', hcSheetClick);
  }
  const body = box.querySelector('.hcx-body'), keep = body.scrollTop;
  body.innerHTML = html; body.scrollTop = keep;
  box.querySelector('.hcx-sheet').setAttribute('aria-label', body.querySelector('h3')?.textContent || '');
  if (S.kind === 'spot' && data.lock) hcLockWire(data.lock);
  const play = body.querySelector('.hcx-play'); if (play) play.onclick = () => hcSpeak(play.closest('.hcx-voice'));
}
function hcSheetClick(e) {
  const box = e.currentTarget, S = hcSheet;
  if (e.target === box || e.target.closest('[data-close]')) { hcClose(); return; }
  const a = e.target.closest('[data-act]'); if (a && S) { act({ t: 'hc:act', spot: S.id, a: a.dataset.act }); return; }
  const g = e.target.closest('[data-goto]'); if (g) { hcClose(); hcSetRoom(g.dataset.goto); return; }
  const h = e.target.closest('[data-hold]'); if (h) { hcHeld = h.dataset.hold; hcClose(); renderHuisClos(hcLast); return; }
  const hi = e.target.closest('[data-hint]'); if (hi) { act({ t: 'hc:hint', step: hi.dataset.hint }); return; }
}
function hcDocHTML(d) {
  if (d.kind === 'voice') return `<div class="hcx-voice"><button class="hcx-play" type="button" aria-label="Écouter le message"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 2l12 7-12 7z" fill="currentColor"/></svg></button><div class="hcx-wave">${Array.from({ length: 28 }, (_, i) => `<i style="height:${20 + Math.round(Math.abs(Math.sin(i * 1.7)) * 80)}%;animation-delay:${(i % 7) * .08}s"></i>`).join('')}</div></div><p class="hcx-quote">« ${d.html} »</p>`;
  return `<div class="hcx-paper${d.kind === 'form' ? ' form' : ''}">${d.html}</div>`;
}
function hcSpeak(box) {
  if (!box) return;
  const txt = box.nextElementSibling?.textContent.replace(/[«»]/g, '').trim() || '';
  box.classList.add('on');
  try { const u = new SpeechSynthesisUtterance(txt); u.lang = 'fr-FR'; u.rate = .95; u.onend = () => box.classList.remove('on'); speechSynthesis.cancel(); speechSynthesis.speak(u); }
  catch { setTimeout(() => box.classList.remove('on'), 4000); }
}

// ---------------------------------------------------------------- les cadenas
const HC_KEYS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
function hcLockHTML(L) {
  const cost = L.cost ? ` Une erreur coûte ${L.cost >= 60 ? `${Math.round(L.cost / 60)} min` : `${L.cost} s`}.` : '';
  if (L.kind === 'doses') return `<div class="hcx-lock"><div class="hcx-doses">${L.labels.map((l, i) => `<div class="hcx-dose" data-i="${i}"><span class="hcx-dot d${i}"></span><b>${esc(l)}</b><button type="button" data-dd="-1" aria-label="Une dose de ${esc(l)} en moins">−</button><output>0</output><button type="button" data-dd="1" aria-label="Une dose de ${esc(l)} en plus">+</button></div>`).join('')}</div><p class="hcx-cost">${cost}</p><button class="btn tb-btn hero hcx-ok" type="button" data-ok>Lancer le mélange</button></div>`;
  if (L.kind === 'slots') return `<div class="hcx-lock"><p class="hcx-cost">Où brancher le fusible ?${cost}</p><div class="hcx-slots">${Array.from({ length: L.n }, (_, i) => `<button type="button" data-slot="${i + 1}">${i + 1}</button>`).join('')}</div></div>`;
  const pad = L.kind === 'letters'
    ? `<div class="hcx-kbd">${HC_KEYS.map(r => `<div>${[...r].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}<div><button type="button" class="del" data-del>Effacer</button><button type="button" class="ok" data-ok>Valider</button></div></div>`
    : `<div class="hcx-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button type="button" data-k="${d}">${d}</button>`).join('')}<button type="button" class="del" data-del>Effacer</button><button type="button" data-k="0">0</button><button type="button" class="ok" data-ok>Valider</button></div>`;
  return `<div class="hcx-lock"><div class="hcx-screen${L.kind === 'letters' ? ' letters' : ''}">${'<span></span>'.repeat(L.len)}</div><p class="hcx-cost">${cost}</p>${pad}</div>`;
}
function hcLockWire(L) {
  const S = hcSheet, box = document.querySelector('#hcx-sheet .hcx-lock'); if (!box) return;
  const send = code => { S.sent = code; act({ t: 'hc:code', spot: S.id, code }); };
  if (L.kind === 'doses') {
    const vals = (S.code || '').padEnd(L.labels.length, '0').split('').map(Number);
    const show = () => box.querySelectorAll('.hcx-dose').forEach((d, i) => { d.querySelector('output').textContent = vals[i]; });
    show();
    box.onclick = e => {
      const b = e.target.closest('[data-dd]'); if (b) { const i = +b.closest('.hcx-dose').dataset.i; vals[i] = Math.max(0, Math.min(9, vals[i] + +b.dataset.dd)); S.code = vals.join(''); show(); return; }
      if (e.target.closest('[data-ok]')) send(vals.join(''));
    };
    return;
  }
  if (L.kind === 'slots') { box.onclick = e => { const b = e.target.closest('[data-slot]'); if (b) send(b.dataset.slot); }; return; }
  const scr = box.querySelector('.hcx-screen');
  const show = () => scr.querySelectorAll('span').forEach((s, i) => { s.textContent = S.code[i] || ''; });
  const submit = () => { if (S.code.length === L.len) send(S.code); };
  show();
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k != null && S.code.length < L.len) { S.code += b.dataset.k; show(); if (S.code.length === L.len) setTimeout(submit, 160); }
    if (b.hasAttribute('data-del')) { S.code = S.code.slice(0, -1); show(); }
    if (b.hasAttribute('data-ok')) submit();
  };
}
// le clavier de l'ordinateur sur PC
document.addEventListener('keydown', e => {
  const S = hcSheet; if (!S || !document.getElementById('hcx-sheet')) return;
  if (e.key === 'Escape') { hcClose(); return; }
  const L = S.kind === 'spot' && hcLast?.spots[S.id]?.lock; if (!L || !['digits', 'letters'].includes(L.kind) || e.target.closest?.('input,textarea,select')) return;
  const k = e.key.toUpperCase();
  const okKey = L.kind === 'digits' ? /^[0-9]$/.test(k) : /^[A-Z]$/.test(k);
  if (okKey && S.code.length < L.len) { S.code += k; hcLockWire(L); if (S.code.length === L.len) setTimeout(() => { if (S.code.length === L.len) { S.sent = S.code; act({ t: 'hc:code', spot: S.id, code: S.code }); } }, 160); }
  else if (e.key === 'Backspace') { S.code = S.code.slice(0, -1); hcLockWire(L); }
  else return;
  e.preventDefault();
});
// un code refusé : l'écran du cadenas tremble et se vide
function hcLockBad() {
  const S = hcSheet, scr = document.querySelector('#hcx-sheet .hcx-screen, #hcx-sheet .hcx-doses, #hcx-sheet .hcx-slots'); if (!S) return;
  navigator.vibrate?.([30, 40, 30]);
  if (scr) { scr.classList.remove('bad'); void scr.offsetWidth; scr.classList.add('bad'); }
  setTimeout(() => { if (hcSheet !== S) return; if (!/doses/.test(scr?.className || '')) S.code = ''; S.key = ''; hcSheetRender(); }, 650);
}

// ---------------------------------------------------------------- les nouvelles de la table
function hcEvents(v) {
  const evs = v.events || [];
  if (hcEvSeen < 0) { hcEvSeen = evs.length ? evs[evs.length - 1].n : 0; return; }
  for (const e of evs) {
    if (e.n <= hcEvSeen) continue;
    if (e.open && e.to === net.me) hcOpen('spot', e.open);
    if (e.wrong) {
      if (e.by === net.me) hcLockBad();
      if (e.cost && hcSk?.clock) { const p = el('span', 'hcx-pen', `−${e.cost >= 60 ? Math.round(e.cost / 60) + ' min' : e.cost + ' s'}`); hcSk.clock.appendChild(p); setTimeout(() => p.remove(), 1500); }
    }
    (e.give || []).forEach(id => hcNew.add(id));
    if (e.by && e.by !== net.me && e.text) navigator.vibrate?.(8);
  }
  hcEvSeen = evs.length ? evs[evs.length - 1].n : hcEvSeen;
}

function hcSheetBody() {
  const v = hcLast; if (!v) return '';
  return `${hcHolders(v)}${tbLog(v.log.slice().reverse())}`;
}
const hcHolders = v => v.holders.length ? `<ul class="hcx-holders">${v.holders.map(h => `<li><span>${hcEmo(h)}</span><b>${h.id === net.me ? 'Toi' : hcName(h)}</b><small>${h.docs.map(esc).join(', ')}</small></li>`).join('')}</ul>` : '';

// ---------------------------------------------------------------- le rendu
function renderHuisClos(v) {
  if (!v) return;
  if (v !== hcLast) hcRecv = Date.now();
  hcLast = v;
  const root = $('#hc-main');
  if (!hcSk || !root.contains(hcSk.bar)) hcBuild(root);
  // une nouvelle partie : on oublie tout ce qui restait de la précédente
  if (v.phase === 'intro' && hcPhase !== 'intro') { hcRoom = null; hcHeld = null; hcEvSeen = -1; hcNew.clear(); hcClose(); }
  hcPhase = v.phase;
  const S = hcSk, f = new Set(v.flags), me = v.me || {};
  if (!hcRoom || !v.rooms.find(r => r.id === hcRoom && r.open)) hcRoom = me.where && v.rooms.find(r => r.id === me.where && r.open) ? me.where : v.rooms[0].id;
  if (hcHeld && !v.inv.find(x => x.id === hcHeld)) hcHeld = null;
  hcEvents(v);

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.phase === 'play') chips.push(tbChip(`Indice${v.hints ? ` <b>${v.hints}</b>` : ''}`, () => hcOpen('hints'), 'Demander un indice'));
  if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => tbSheet.open('hc-log', 'La partie', hcSheetBody)));
  const clk = tbChip(`<b class="hcx-time">${v.timeless ? 'Sans chrono' : hcClock(hcLeft(v))}</b>`);
  clk.classList.add('hcx-clock');
  chips.unshift(clk);
  S.bar.replaceChildren(tbBar(esc(v.title), chips));
  S.clock = clk;
  if (!v.timeless && v.phase === 'play') clk.querySelector('b').classList.toggle('low', hcLeft(v) < 5 * 60000);

  // ---------------------------------------------------------------- les pièces, en onglets (et qui est où)
  const playing = v.phase === 'play';
  const rk = [hcRoom, playing, v.rooms.map(r => r.open).join(), v.players.map(p => p.id + p.where + p.online).join()].join('|');
  if (rk !== S.roomsKey) {
    S.roomsKey = rk;
    S.rooms.hidden = !playing;
    S.rooms.innerHTML = v.rooms.map(r => {
      const here = v.players.filter(p => p.where === r.id && p.id !== net.me && p.online).map(p => `<i title="${hcName(p)}">${hcEmo(p)}</i>`).join('');
      return `<button type="button" data-room="${r.id}" aria-pressed="${r.id === hcRoom}"${r.open ? '' : ' disabled'}>${r.open ? '' : '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>'}<span>${esc(r.name)}</span>${here ? `<em>${here}</em>` : ''}</button>`;
    }).join('');
    S.rooms.querySelectorAll('[data-room]').forEach(b => b.onclick = () => hcSetRoom(b.dataset.room));
  }

  // ---------------------------------------------------------------- l'histoire, la pièce, ou la fin
  if (v.phase === 'intro' || v.phase === 'over') {
    const mk = v.phase + '|' + v.docs.map(d => d.id).join() + v.isHost + JSON.stringify(v.result);
    if (mk !== S.mainKey) {
      S.mainKey = mk; S.sceneKey = '';
      const mine = v.docs.length ? `<p class="hcx-mine"><b>Sur ton téléphone :</b> ${v.docs.map(d => esc(d.name)).join(', ')}.</p>` : v.players.length > 1 ? '<p class="hcx-mine">Tu n’as pas de document au départ : écoute bien les autres.</p>' : '';
      if (v.phase === 'intro') S.main.innerHTML = `<section class="hcx-story glass"><p class="hcx-place">${esc(v.place)}</p><h2>${esc(v.title)}</h2>${v.intro.map(p => `<p>${esc(p)}</p>`).join('')}${mine}<p class="hcx-how">Touche la pièce pour fouiller. Glisse un objet sur la pièce ou sur un autre objet pour l’utiliser. Un code faux coûte du temps.</p></section>`;
      else {
        const r = v.result || {}, st = r.stars || 0;
        S.main.innerHTML = `<section class="hcx-story glass ${r.win ? 'win' : 'lose'}"><p class="hcx-place">${r.win ? 'Sortis !' : 'Temps écoulé'}</p><h2>${r.win ? 'Vous êtes sortis.' : 'Vous êtes restés enfermés.'}</h2><p>${esc(v.outro)}</p>
          ${r.win ? `<div class="hcx-stars" aria-label="${st} étoile${st > 1 ? 's' : ''} sur 3">${'★'.repeat(st)}<span>${'★'.repeat(3 - st)}</span></div>` : ''}
          <div class="hcx-score"><div><b>${r.left == null ? hcClock(r.time || 0) : hcClock(r.left)}</b><span>${r.left == null ? 'de jeu' : 'restantes'}</span></div><div><b>${r.hints}</b><span>indice${r.hints > 1 ? 's' : ''}</span></div><div><b>${r.wrong}</b><span>erreur${r.wrong > 1 ? 's' : ''}</span></div></div></section>`;
      }
    }
  } else {
    if (S.mainKey !== 'play') { S.mainKey = 'play'; S.main.replaceChildren(S.scene); }
    const sk = [hcRoom, v.flags.join(), JSON.stringify(v.art)].join('|');
    if (sk !== S.sceneKey && !hcDrag) {
      S.sceneKey = sk;
      const R = HC_ROOMS[hcRoom];
      S.scene.innerHTML = `<svg viewBox="0 0 420 300" role="group" aria-label="${esc(v.rooms.find(r => r.id === hcRoom)?.name || '')}">${R.draw(f, v.art)}${Object.entries(R.spots).filter(([id]) => v.spots[id]).map(([id, r]) => `<g class="hcx-hit" data-spot="${id}" tabindex="0" role="button" aria-label="${esc(v.spots[id].name)}"><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="5"/></g>`).join('')}</svg>`;
    }
    hcHand();
  }

  // ---------------------------------------------------------------- le meneur
  const last = (v.events || []).filter(e => e.text).slice(-1)[0];
  let title = '', line = '', pip = '🔎', hot = false;
  if (v.phase === 'intro') { title = v.isHost ? 'Prêts ? Lance le chrono.' : 'Lisez l’histoire.'; line = v.isHost ? 'Chacun a déjà son document. Le chrono part quand tu appuies.' : 'L’hôte lance le chrono quand tout le monde est prêt.'; pip = '🔒'; hot = v.isHost; }
  else if (v.phase === 'over') { title = v.result?.win ? 'Bien joué, vous êtes dehors.' : 'Le labo a gagné.'; line = v.result?.win ? 'Le Dr Vasseur vous doit une fière chandelle.' : 'Une revanche, avec un indice de plus ?'; pip = v.result?.win ? '🎉' : '😵'; }
  else if (last) { title = esc(last.text); line = last.to ? '' : hcSayHelp(v); pip = last.wrong ? '⏱️' : last.hint ? '💡' : last.to ? '🤔' : '✨'; }
  else { title = 'Le labo est verrouillé.'; line = 'Fouillez, et racontez-vous ce que vous avez sur vos téléphones.'; }
  S.say.replaceChildren(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : l'inventaire commun et mes documents
  const ik = [v.phase, v.inv.map(i => i.id).join(), v.docs.map(d => d.id).join(), v.isHost].join('|');
  if (ik !== S.invKey && !hcDrag) {
    S.invKey = ik;
    const acts = [];
    if (v.phase === 'intro' && v.isHost) acts.push(tbBtn('hero', 'Lancer le chrono', () => act({ t: 'hc:go' })));
    if (v.phase === 'over' && v.isHost) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    let body = null;
    if (v.phase === 'play' || (v.phase === 'intro' && v.docs.length)) {
      // les objets communs en tuiles ; mes documents en pastilles, à part (seul, on en a six)
      const tiles = (v.phase === 'play' ? v.inv : []).map(i => `<div class="hcx-item${hcNew.has(i.id) ? ' new' : ''}" data-id="${esc(i.id)}" tabindex="0" role="button" aria-label="${esc(i.name)}"><div class="hcx-ic">${HC_IC[i.id] || HC_IC.paper}</div><span>${esc(i.name)}</span></div>`);
      const docs = v.docs.map(d => `<div class="hcx-item hcx-doc" data-id="${esc(d.id)}" data-doc="1" tabindex="0" role="button" aria-label="${esc(d.name)}, seulement sur ton téléphone"><div class="hcx-ic">${HC_IC[d.kind] || HC_IC.paper}</div><span>${esc(d.name)}</span></div>`);
      hcNew.clear();
      body = el('div', 'hcx-inv', `<div class="hcx-hand" hidden><span></span><button type="button" class="btn tb-btn glass">Ranger</button></div>${v.phase === 'play' ? `<div class="hcx-items">${tiles.join('') || '<p class="hcx-empty">Rien pour l’instant. Fouillez la pièce.</p>'}</div>` : ''}${docs.length ? `<p class="hcx-legend"><i></i> ${v.players.length > 1 ? 'Seulement sur ton téléphone' : 'Tes documents'}</p><div class="hcx-docs">${docs.join('')}</div>` : ''}`);
      body.querySelector('.hcx-hand button').onclick = () => { hcHeld = null; hcHand(); };
    } else if (v.phase === 'intro') body = el('p', 'hcx-legend', 'L’hôte lance le chrono quand tout le monde est prêt.');
    else if (!v.isHost) body = el('p', 'hcx-legend', 'L’hôte vous ramène au salon.');
    S.tray.replaceChildren(tbTray({ left: v.phase === 'play' ? 'Inventaire commun' : '', body, acts }));
  }
  if (v.phase === 'play') hcHand();

  // ---------------------------------------------------------------- PC : la colonne de droite
  S.side.innerHTML = `${v.phase === 'play' ? `<div class="rl-block"><h4 class="mj-side-title">Le chrono</h4><b class="hcx-time hcx-big-time">${v.timeless ? 'Sans chrono' : hcClock(hcLeft(v))}</b></div><div class="rl-block"><h4 class="mj-side-title">Bloqués ?</h4><p class="hcx-legend">${v.hints ? `${v.hints} indice${v.hints > 1 ? 's' : ''} pris.` : 'Aucun indice pris.'}</p><button class="btn tb-btn glass hcx-hintbtn" type="button">Un indice</button></div>` : ''}${v.holders.length > 0 && v.players.length > 1 ? `<div class="rl-block"><h4 class="mj-side-title">Qui a quoi</h4>${hcHolders(v)}</div>` : ''}<div class="rl-block"><h4 class="mj-side-title">Le fil</h4>${tbLog(v.log.slice().reverse())}</div>`;
  const hb = S.side.querySelector('.hcx-hintbtn'); if (hb) hb.onclick = () => hcOpen('hints');
  hcSheetRender();
  tbSheet.refresh();
}
// sous la nouvelle, une phrase utile de temps en temps
function hcSayHelp(v) {
  const l = hcLeft(v);
  if (l != null && l < 5 * 60000) return 'Plus que quelques minutes. Accélérez.';
  if (v.wrong >= 3) return 'Doucement sur les codes : chaque erreur coûte cher.';
  return v.players.length > 1 ? 'Dites-vous ce que vous trouvez.' : '';
}
