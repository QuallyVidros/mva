/* =====================================================================
   viewer3d.js — v8.0
   Visualização 3D isométrica com:
   - Cotas completas (L, A, P + largura de vão + altura de gaveta)
   - Cores personalizadas (perfil usa cor real, vidro usa cor real)
   - Modos: sólido, wireframe, transparente
   - Explosão 3D
   - Rotação e zoom por mouse/toque
   ===================================================================== */

(function (global) {
  "use strict";

  /* =====================================================================
     PALETA DE CORES
     ===================================================================== */
  const CORES_PERFIL_HEX = {
    "Bronze":    "#a0522d",
    "Preto":     "#1a1a1a",
    "Branco":    "#e8e8e8",
    "Champanhe": "#d9cbb0",
    "Fosco":     "#5a5a5a",
    "A definir": "#7c3aed"
  };

  const CORES_VIDRO_HEX = {
    "Incolor":    "#cfeaff",
    "Preto":      "#2a2a2a",
    "Branco":     "#f0f0f0",
    "Champanhe":  "#e0d5bc",
    "Cinza":      "#8a8a8a",
    "Bege":       "#e7d9be",
    "A definir":  "#9bb5cc"
  };

  const COR_ESTRUTURA = "#475569";
  const COR_PUXADOR   = "#c0c8d4";
  const COR_COTA      = "#fbbf24";
  const COR_COTA_TXT  = "#0b1220";

  function corDoPerfil(cor) {
    return CORES_PERFIL_HEX[cor] || "#64748b";
  }
  function corDoVidro(cor) {
    return CORES_VIDRO_HEX[cor] || "#cfeaff";
  }
  function escurecer(hex, fator) {
    // fator < 1 = escurece, > 1 = clareia
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const r2 = Math.max(0, Math.min(255, Math.round(r * fator)));
    const g2 = Math.max(0, Math.min(255, Math.round(g * fator)));
    const b2 = Math.max(0, Math.min(255, Math.round(b * fator)));
    return "#" + [r2, g2, b2].map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function hexParaRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* =====================================================================
     PRESETS DE CÂMERA
     ===================================================================== */
  const PRESETS = {
    frontal:  { rotX: 0.05,  rotY: 0.05,  zoom: 1.0 },
    iso:      { rotX: -0.35, rotY: 0.55,  zoom: 1.0 },
    superior: { rotX: -1.1,  rotY: 0.05,  zoom: 1.0 },
    lateral:  { rotX: 0.05,  rotY: 1.2,   zoom: 1.0 }
  };

  /* =====================================================================
     MATEMÁTICA 3D
     ===================================================================== */
  function rotY(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  }
  function rotX(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  }

  /* =====================================================================
     VIEWER
     ===================================================================== */
  function Viewer() {
    this.canvas = null;
    this.ctx = null;
    this.rotX = PRESETS.iso.rotX;
    this.rotY = PRESETS.iso.rotY;
    this.zoom = PRESETS.iso.zoom;
    this.panX = 0;
    this.panY = 0;
    this.modo = "solido";
    this.cotas = true;
    this.autoRotate = false;
    this.drag = null;
    this.ambIdx = 0;
    this.animFrame = null;
    this._getState = null;
    this._onSnapshot = null;

    // Explosão
    this.explosao = 0;
    this.explosaoAtiva = false;
  }

  Viewer.prototype.init = function (opts) {
    this.canvas = document.getElementById("viewer3D");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this._getState = opts.getState;
    this._onSnapshot = opts.onSnapshot || null;
    this.resize();
    this._bindEvents();
    this._buildAmbTabs();
    this.render();
  };

  Viewer.prototype._buildAmbTabs = function () {
    const tabs = document.getElementById("viewerAmbTabs");
    if (!tabs) return;
    const state = this._getState();
    if (!state.ambientes.length) { tabs.innerHTML = ""; return; }
    if (this.ambIdx >= state.ambientes.length) this.ambIdx = 0;
    tabs.innerHTML = state.ambientes.map((a, i) =>
      `<div class="tab ${i === this.ambIdx ? "on" : ""}" data-idx="${i}">🏠 ${a.nome || "Amb " + i}</div>`
    ).join("");
    tabs.querySelectorAll(".tab").forEach(t => {
      t.onclick = () => {
        this.ambIdx = +t.dataset.idx;
        this._buildAmbTabs();
        this.render();
      };
    });
  };

  Viewer.prototype.resize = function () {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Viewer.prototype._bindEvents = function () {
    const c = this.canvas;
    c.addEventListener("pointerdown", e => {
      this.drag = { x: e.clientX, y: e.clientY, rx: this.rotX, ry: this.rotY };
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
    });
    c.addEventListener("pointermove", e => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.rotY = this.drag.ry + dx * 0.008;
      this.rotX = Math.max(-1.5, Math.min(1.5, this.drag.rx + dy * 0.008));
      this.render();
    });
    c.addEventListener("pointerup", e => {
      this.drag = null;
      try { c.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    c.addEventListener("wheel", e => {
      e.preventDefault();
      this.zoom = Math.max(0.25, Math.min(3, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      this.render();
    }, { passive: false });
    window.addEventListener("resize", () => { this.resize(); this.render(); });

    // Presets
    document.querySelectorAll("#cameraPresets button").forEach(b => {
      b.onclick = () => {
        const p = PRESETS[b.dataset.cam];
        if (!p) return;
        this.rotX = p.rotX; this.rotY = p.rotY; this.zoom = p.zoom;
        this.panX = 0; this.panY = 0;
        document.querySelectorAll("#cameraPresets button").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        this.render();
      };
    });

    // Modos
    document.querySelectorAll("#modeGroup button").forEach(b => {
      b.onclick = () => {
        this.modo = b.dataset.mode;
        document.querySelectorAll("#modeGroup button").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        this.render();
      };
    });
  };

  Viewer.prototype.reset = function () {
    const p = PRESETS.iso;
    this.rotX = p.rotX; this.rotY = p.rotY; this.zoom = p.zoom;
    this.panX = 0; this.panY = 0;
    this.render();
  };

  Viewer.prototype.toggleAuto = function () {
    this.autoRotate = !this.autoRotate;
    document.getElementById("btnAutoRotate").classList.toggle("on", this.autoRotate);
    if (this.autoRotate) this._tick();
    else cancelAnimationFrame(this.animFrame);
  };
  Viewer.prototype._tick = function () {
    if (!this.autoRotate) return;
    this.rotY += 0.01;
    this.render();
    this.animFrame = requestAnimationFrame(() => this._tick());
  };

  Viewer.prototype.toggleCotas = function () {
    this.cotas = !this.cotas;
    document.getElementById("btnCotas").classList.toggle("on", this.cotas);
    this.render();
  };

  Viewer.prototype.toggleExplosao = function () {
    this.explosaoAtiva = !this.explosaoAtiva;
    this.explosao = this.explosaoAtiva ? 0.5 : 0;
    const btn = document.getElementById("btnExplosao");
    if (btn) btn.classList.toggle("on", this.explosaoAtiva);
    const slider = document.getElementById("explosaoSlider");
    if (slider) { slider.disabled = !this.explosaoAtiva; slider.value = this.explosao; }
    this.render();
  };

  Viewer.prototype.setExplosao = function (v) {
    this.explosao = Math.max(0, Math.min(1, v));
    this.explosaoAtiva = this.explosao > 0.001;
    const btn = document.getElementById("btnExplosao");
    if (btn) btn.classList.toggle("on", this.explosaoAtiva);
    this.render();
  };

  Viewer.prototype.snapshot = function (paraPrint) {
    if (!this.canvas) return;
    const dataURL = this.canvas.toDataURL("image/png");
    const el = document.getElementById("viewerSnapshot");
    if (!el) return;
    if (paraPrint) {
      el.innerHTML = `<img src="${dataURL}" style="width:100%;max-width:780px;border-radius:8px;border:1px solid #999">`;
      el.style.display = "block";
      return;
    }
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = `visualizacao-${Date.now()}.png`;
    a.click();
    if (this._onSnapshot) this._onSnapshot("📸 PNG baixado");
  };

  /* =====================================================================
     PROJEÇÃO 3D → 2D
     ===================================================================== */
  Viewer.prototype._proj = function (x, y, z) {
    let p = rotY([x, y, z], this.rotY);
    p = rotX(p, this.rotX);
    const focal = 1400;
    const zPersp = focal / (focal + p[2] * 0.6);
    const cx = this.canvas.clientWidth / 2 + this.panX;
    const cy = this.canvas.clientHeight / 2 + this.panY;
    return {
      x: cx + p[0] * this.zoom * zPersp,
      y: cy + p[1] * this.zoom * zPersp,
      z: p[2]
    };
  };

  /* =====================================================================
     GERAR FACES 3D
     ===================================================================== */
  Viewer.prototype._gerarFaces = function (amb) {
    const faces = [];
    const L = +amb.largura, A = +amb.altura, P = +amb.profundidade;
    const ox = -L / 2, oy = -A / 2, oz = -P / 2;
    const vis = amb.visibilidade || "frente";

    // Cores personalizadas
    const corPerfil = corDoPerfil(amb.corPerfil);
    const corVidro = corDoVidro(amb.corVidro);
    const corPerfilBorda = escurecer(corPerfil, 0.6);
    const corVidroBorda = escurecer(corVidro, 0.7);

    const EXPL = this.explosao;
    const centro = [0, 0, 0];

    function normal(pts) {
      const a = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
      const b = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / len, n[1] / len, n[2] / len];
    }

    function addFace(pts, cor, alpha, tipo) {
      let ptsFinal = pts;
      if (EXPL > 0.001) {
        const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
        const cz = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
        const dx = cx - centro[0], dy = cy - centro[1], dz = cz - centro[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const fator = EXPL * 600;
        ptsFinal = pts.map(p => [
          p[0] + (dx / len) * fator,
          p[1] + (dy / len) * fator,
          p[2] + (dz / len) * fator
        ]);
      }
      const n = normal(ptsFinal);
      const shade = 0.75 + 0.25 * Math.max(0, n[1]);
      const cx = (ptsFinal[0][0] + ptsFinal[1][0] + ptsFinal[2][0] + ptsFinal[3][0]) / 4;
      const cy = (ptsFinal[0][1] + ptsFinal[1][1] + ptsFinal[2][1] + ptsFinal[3][1]) / 4;
      const cz = (ptsFinal[0][2] + ptsFinal[1][2] + ptsFinal[2][2] + ptsFinal[3][2]) / 4;
      faces.push({ pts: ptsFinal, cor, alpha, tipo, shade, cx, cy, cz });
    }

    function addBox(x, y, z, dx, dy, dz, cor, alpha, tipoBox) {
      tipoBox = tipoBox || "estrutura";
      // frente
      addFace([[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], cor, alpha, tipoBox);
      // fundo
      addFace([[x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z]], cor, alpha, tipoBox);
      // esquerda
      addFace([[x, y, z], [x, y, z + dz], [x, y + dy, z + dz], [x, y + dy, z]], cor, alpha, tipoBox);
      // direita
      addFace([[x + dx, y, z], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x + dx, y + dy, z]], cor, alpha, tipoBox);
      // topo
      addFace([[x, y + dy, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], cor, alpha, tipoBox);
      // base
      addFace([[x, y, z], [x + dx, y, z], [x + dx, y, z + dz], [x, y, z + dz]], cor, alpha, tipoBox);
    }

    // ===== Painel frontal (vidro) =====
    addFace(
      [[ox, oy, oz + P], [ox + L, oy, oz + P], [ox + L, oy + A, oz + P], [ox, oy + A, oz + P]],
      corVidro, 0.3, "vidro"
    );
    // Base (ACM)
    addFace(
      [[ox, oy, oz], [ox + L, oy, oz], [ox + L, oy, oz + P], [ox, oy, oz + P]],
      "#5c4033", 0.85, "acm"
    );
    // Topo (borda fina)
    addFace(
      [[ox, oy + A, oz], [ox + L, oy + A, oz], [ox + L, oy + A, oz + P], [ox, oy + A, oz + P]],
      corPerfil, 0.95, "estrutura"
    );
    // Fundo
    if (vis === "todos") {
      addFace(
        [[ox, oy, oz], [ox + L, oy, oz], [ox + L, oy + A, oz], [ox, oy + A, oz]],
        corVidro, 0.2, "vidro"
      );
    }
    // Lateral esquerda
    if (vis === "frente_1" || vis === "frente_2" || vis === "todos") {
      addFace(
        [[ox, oy, oz], [ox, oy, oz + P], [ox, oy + A, oz + P], [ox, oy + A, oz]],
        corVidro, 0.2, "vidro"
      );
    }
    // Lateral direita
    if (vis === "frente_2" || vis === "todos") {
      addFace(
        [[ox + L, oy, oz], [ox + L, oy, oz + P], [ox + L, oy + A, oz + P], [ox + L, oy + A, oz]],
        corVidro, 0.2, "vidro"
      );
    }

    // ===== Vãos =====
    const esp = 18;
    let xCursor = 0;

    (amb.vaos || []).forEach(v => {
      const vw = +v.largura;
      const vx = ox + xCursor;
      const vxEnd = vx + vw;

      // Moldura do vão
      addBox(vx, oy, oz, esp, A, P, corPerfil, 1, "perfil");
      addBox(vxEnd - esp, oy, oz, esp, A, P, corPerfil, 1, "perfil");
      addBox(vx + esp, oy + A - esp, oz, vw - 2 * esp, esp, P, corPerfil, 1, "perfil");
      addBox(vx + esp, oy, oz, vw - 2 * esp, esp, P, corPerfil, 1, "perfil");

      const nGavetas = v.gavetasPortas || 1;

      if (v.tipo === "gaveta" || v.tipo === "gaveta_dupla") {
        const n = v.tipo === "gaveta_dupla" ? nGavetas * 2 : nGavetas;
        const hG = (A - 2 * esp) / n;
        for (let gi = 0; gi < n; gi++) {
          const gy = oy + esp + gi * hG;
          // frente da gaveta (vidro)
          addFace(
            [[vx + esp + 2, gy + 2, oz + P - 3], [vxEnd - esp - 2, gy + 2, oz + P - 3],
             [vxEnd - esp - 2, gy + hG - 2, oz + P - 3], [vx + esp + 2, gy + hG - 2, oz + P - 3]],
            corVidro, 0.4, "vidro"
          );
          // divisória entre gavetas (perfil)
          if (gi < n - 1) {
            addBox(vx + esp, gy + hG - 2, oz, vw - 2 * esp, 4, P, corPerfil, 1, "perfil");
          }
        }
      } else if (["porta_simples", "porta_dupla", "porta_tempero", "cristaleira", "nicho"].includes(v.tipo)) {
        // porta de vidro
        addFace(
          [[vx + esp, oy + esp, oz + P - 3], [vxEnd - esp, oy + esp, oz + P - 3],
           [vxEnd - esp, oy + A - esp, oz + P - 3], [vx + esp, oy + A - esp, oz + P - 3]],
          corVidro, 0.45, "vidro"
        );
        // prateleiras
        if (v.temPrateleiras && v.qtdPrateleiras > 0) {
          const nP = +v.qtdPrateleiras;
          for (let pi = 0; pi < nP; pi++) {
            const py = oy + esp + (A - 2 * esp) * (pi + 1) / (nP + 1);
            addFace(
              [[vx + esp, py - 2, oz + esp], [vxEnd - esp, py - 2, oz + esp],
               [vxEnd - esp, py - 2, oz + P - esp], [vx + esp, py - 2, oz + P - esp]],
              "#a855f7", 0.75, "prateleira"
            );
            addFace(
              [[vx + esp, py + 2, oz + esp], [vxEnd - esp, py + 2, oz + esp],
               [vxEnd - esp, py + 2, oz + P - esp], [vx + esp, py + 2, oz + P - esp]],
              "#7e22ce", 0.75, "prateleira"
            );
          }
        }
        // puxador
        addBox(vxEnd - esp - 60, oy + A - esp - 30, oz + P - 8, 40, 6, 6, COR_PUXADOR, 1, "acessorio");
      } else if (v.tipo === "lixeira") {
        addFace(
          [[vx + esp, oy + esp, oz + P - 3], [vxEnd - esp, oy + esp, oz + P - 3],
           [vxEnd - esp, oy + A - esp, oz + P - 3], [vx + esp, oy + A - esp, oz + P - 3]],
          "#22c55e", 0.5, "vidro"
        );
      }

      xCursor += vw;
    });

    return { faces, L, A, P, ox, oy, oz, corPerfil, corVidro, corPerfilBorda, corVidroBorda };
  };

  /* =====================================================================
     RENDER
     ===================================================================== */
  Viewer.prototype.render = function () {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    const state = this._getState();
    const amb = state.ambientes[this.ambIdx];
    const msgEl = document.getElementById("viewerMsg");
    const hudEl = document.getElementById("viewerHud");

    if (!amb) {
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.textContent = state.ambientes.length ? "Selecione um ambiente." : "Adicione ambientes para visualizar.";
      }
      if (hudEl) hudEl.textContent = "—";
      return;
    }
    if (msgEl) msgEl.style.display = "none";
    if (hudEl) hudEl.textContent = `${amb.nome} · ${amb.largura}×${amb.altura}×${amb.profundidade}mm · ${this.modo}${this.cotas ? " · cotas" : ""}`;

    const dados = this._gerarFaces(amb);

    // Projeta e ordena por profundidade real
    const proj = dados.faces.map(f => {
      let c = [f.cx, f.cy, f.cz];
      c = rotY(c, this.rotY);
      c = rotX(c, this.rotX);
      return {
        face: f,
        screenPts: f.pts.map(p => this._proj(p[0], p[1], p[2])),
        zReal: c[2]
      };
    });
    proj.sort((a, b) => b.zReal - a.zReal);

    // Desenha faces
    proj.forEach(({ face, screenPts }) => {
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
      ctx.closePath();

      if (this.modo === "wireframe") {
        // Só linhas, cor depende do tipo
        let corLinha;
        if (face.tipo === "vidro") corLinha = escurecer(dados.corVidro, 0.7);
        else if (face.tipo === "prateleira") corLinha = "#a855f7";
        else if (face.tipo === "acessorio") corLinha = COR_PUXADOR;
        else corLinha = dados.corPerfil;
        ctx.strokeStyle = corLinha;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (this.modo === "solido") {
        // Preenchimento com cor + sombreamento
        ctx.fillStyle = this._aplicarShade(face.cor, face.shade, face.alpha);
        ctx.fill();
        // Contorno (mais escuro)
        let corBorda;
        if (face.tipo === "vidro") corBorda = dados.corVidroBorda;
        else if (face.tipo === "prateleira") corBorda = "#7e22ce";
        else if (face.tipo === "acessorio") corBorda = "#6b7280";
        else corBorda = dados.corPerfilBorda;
        ctx.strokeStyle = corBorda;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // Transparente: preenchimento fraco + contorno colorido
        ctx.fillStyle = this._aplicarShade(face.cor, face.shade, 0.15);
        ctx.fill();
        let corBorda;
        if (face.tipo === "vidro") corBorda = dados.corVidroBorda;
        else if (face.tipo === "prateleira") corBorda = "#a855f7";
        else if (face.tipo === "acessorio") corBorda = "#9ca3af";
        else corBorda = dados.corPerfil;
        ctx.strokeStyle = corBorda;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // Cotas
    if (this.cotas) this._desenharCotas(ctx, amb, dados);

    // Legenda + detalhes
    this._renderLegenda(amb);
    if (this._renderDetalhes) this._renderDetalhes(amb);
  };

  Viewer.prototype._aplicarShade = function (hex, shade, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const r2 = Math.min(255, Math.round(r * shade));
    const g2 = Math.min(255, Math.round(g * shade));
    const b2 = Math.min(255, Math.round(b * shade));
    if (alpha >= 1) return `rgb(${r2},${g2},${b2})`;
    return `rgba(${r2},${g2},${b2},${alpha})`;
  };

  /* =====================================================================
     COTAS
     ===================================================================== */
  Viewer.prototype._desenharCotas = function (ctx, amb, dados) {
    const { L, A, P, ox, oy, oz } = dados;
    ctx.save();
    ctx.strokeStyle = COR_COTA;
    ctx.fillStyle = COR_COTA;
    ctx.lineWidth = 1.5;
    ctx.font = "bold 11px system-ui,Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // ===== Cota de Largura total (embaixo do móvel) =====
    const pL1 = this._proj(ox, oy - 80, oz + P);
    const pL2 = this._proj(ox + L, oy - 80, oz + P);
    this._cotaLinha(ctx, pL1, pL2, `${L}mm`, "h");

    // ===== Cota de Altura (lateral esquerda) =====
    const pA1 = this._proj(ox - 80, oy, oz + P);
    const pA2 = this._proj(ox - 80, oy + A, oz + P);
    this._cotaLinha(ctx, pA1, pA2, `${A}mm`, "v");

    // ===== Cota de Profundidade (lateral direita) =====
    const pP1 = this._proj(ox + L + 80, oy - 20, oz);
    const pP2 = this._proj(ox + L + 80, oy - 20, oz + P);
    this._cotaLinha(ctx, pP1, pP2, `${P}mm`, "d");

    // ===== Cotas de cada vão (largura) =====
    const esp = 18;
    let xCursor = 0;
    (amb.vaos || []).forEach((v, i) => {
      const vw = +v.largura;
      const vx = ox + xCursor;
      const yBase = oy - 30;
      const zBase = oz + P + 5;

      // Largura do vão
      const v1 = this._proj(vx + esp, yBase, zBase);
      const v2 = this._proj(vx + vw - esp, yBase, zBase);
      this._cotaLinha(ctx, v1, v2, `${vw}mm`, "h", true);

      // Nome do vão
      const vMid = this._proj(vx + vw / 2, yBase + 20, zBase);
      ctx.font = "bold 10px system-ui,Arial";
      ctx.fillStyle = COR_COTA;
      ctx.fillText(v.descricao || TIPOS_VAO_NOME(v.tipo), vMid.x, vMid.y);

      // ===== Altura de cada gaveta =====
      if (v.tipo === "gaveta" || v.tipo === "gaveta_dupla") {
        const n = v.tipo === "gaveta_dupla" ? v.gavetasPortas * 2 : v.gavetasPortas;
        const hG = (A - 2 * esp) / n;
        for (let gi = 0; gi < n; gi++) {
          const gy = oy + esp + gi * hG;
          const gx = vx + vw + 10;
          const g1 = this._proj(gx, gy, oz + P);
          const g2 = this._proj(gx, gy + hG, oz + P);
          this._cotaLinha(ctx, g1, g2, `${Math.round(hG)}`, "v", true);
        }
      }

      // ===== Altura de porta =====
      if (["porta_simples", "porta_dupla", "porta_tempero", "cristaleira", "nicho"].includes(v.tipo)) {
        const gx = vx + vw + 10;
        const g1 = this._proj(gx, oy + esp, oz + P);
        const g2 = this._proj(gx, oy + A - esp, oz + P);
        this._cotaLinha(ctx, g1, g2, `${A - 2 * esp}`, "v", true);
      }

      xCursor += vw;
    });

    ctx.restore();
  };

  Viewer.prototype._cotaLinha = function (ctx, p1, p2, label, orientacao, pequena) {
    const cor = COR_COTA;
    const setaSize = pequena ? 4 : 6;

    // Linha
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = cor;
    ctx.lineWidth = pequena ? 1 : 1.5;
    ctx.stroke();

    // Setas
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + setaSize * Math.cos(ang - 0.4), p1.y + setaSize * Math.sin(ang - 0.4));
    ctx.lineTo(p1.x + setaSize * Math.cos(ang + 0.4), p1.y + setaSize * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - setaSize * Math.cos(ang - 0.4), p2.y - setaSize * Math.sin(ang - 0.4));
    ctx.lineTo(p2.x - setaSize * Math.cos(ang + 0.4), p2.y - setaSize * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();

    // Texto (com fundo)
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const fontSize = pequena ? 9 : 11;
    ctx.font = `bold ${fontSize}px system-ui,Arial`;
    const txtW = ctx.measureText(label).width + 8;
    const txtH = fontSize + 4;

    ctx.save();
    ctx.translate(mx, my);
    if (orientacao === "v") {
      ctx.rotate(-Math.PI / 2);
    }
    ctx.fillStyle = COR_COTA_TXT;
    ctx.fillRect(-txtW / 2, -txtH / 2, txtW, txtH);
    ctx.fillStyle = cor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  };

  function TIPOS_VAO_NOME(tipo) {
    const M = {
      gaveta: "Gaveta",
      gaveta_dupla: "Gaveta Dupla",
      porta_tempero: "Porta Tempero",
      lixeira: "Lixeira",
      nicho: "Nicho",
      porta_simples: "Porta",
      porta_dupla: "Porta Dupla",
      cristaleira: "Cristaleira"
    };
    return M[tipo] || tipo;
  }

  /* =====================================================================
     LEGENDA
     ===================================================================== */
  Viewer.prototype._renderLegenda = function (amb) {
    const el = document.getElementById("viewerLegend");
    if (!el) return;
    const corP = corDoPerfil(amb.corPerfil);
    const corV = corDoVidro(amb.corVidro);
    el.innerHTML = `
      <span class="vl-item"><span class="lg-cor" style="background:${corP};border:1px solid #666"></span>Perfil ${escapeHtmlLocal(amb.corPerfil || "-")}</span>
      <span class="vl-item"><span class="lg-cor" style="background:${corV};border:1px solid #666"></span>Vidro ${escapeHtmlLocal(amb.corVidro || "-")}</span>
      <span class="vl-item"><span class="lg-cor" style="background:#a855f7"></span>Prateleira</span>
      <span class="vl-item"><span class="lg-cor" style="background:${COR_PUXADOR}"></span>Puxador</span>
      <span class="vl-item"><span class="lg-cor" style="background:${COR_COTA}"></span>Cotas</span>`;
  };

  function escapeHtmlLocal(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /* =====================================================================
     EXPORTA
     ===================================================================== */
  global.viewer3D = new Viewer();
  global.CORES_VIEWER = { CORES_PERFIL_HEX, CORES_VIDRO_HEX };

})(window);
