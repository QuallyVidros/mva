/* =====================================================================
   viewer3d.js — Visualização 3D isométrica do móvel montado
   Corrigido em v6.1: ordem de desenho (painter's algorithm por z real),
   presets de câmera e organização em faces por ambiente.
   ===================================================================== */

(function(global){
  "use strict";

  const PRESETS = {
    frontal:  { rotX: 0.05,  rotY: 0.05,  zoom: 1.0 },
    iso:      { rotX: -0.35, rotY: 0.55,  zoom: 1.0 },
    superior: { rotX: -1.1,  rotY: 0.05,  zoom: 1.0 },
    lateral:  { rotX: 0.05,  rotY: 1.2,   zoom: 1.0 }
  };

  const CORES = {
    estrutura: "#334155",
    vidro:     "#0ea5e9",
    acm:       "#64748b",
    prat:      "#a855f7",
    pratBorda: "#7e22ce",
    puxador:   "#e2e8f0",
    perfil:    "#64748b"
  };

  function corDoPerfil(cor){
    const map = {
      "Bronze":"#a0522d", "Preto":"#1a1a1a", "Branco":"#e5e7eb",
      "Champanhe":"#d9cbb0", "Fosco":"#4b5563", "A definir":"#7c3aed"
    };
    return map[cor] || "#64748b";
  }

  // ====== Vetor 3D helpers ======
  function rotY(p, a){ const c = Math.cos(a), s = Math.sin(a); return [p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c]; }
  function rotX(p, a){ const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1]*c - p[2]*s, p[1]*s + p[2]*c]; }

  // ====== Viewer ======
  function Viewer(){
    this.canvas = null;
    this.ctx = null;
    this.rotX = PRESETS.iso.rotX;
    this.rotY = PRESETS.iso.rotY;
    this.zoom = PRESETS.iso.zoom;
    this.panX = 0;
    this.panY = 0;
    this.modo = "solido";
    this.cotas = false;
    this.autoRotate = false;
    this.drag = null;
    this.ambIdx = 0;
    this.animFrame = null;
    this._getState = null;   // função injetada por app.js
    this._onSnapshot = null;
	    // Explosão
    this.explosao = 0;        // 0..1
    this.explosaoAtiva = false;
  }

  Viewer.prototype.init = function(opts){
    this.canvas = document.getElementById("viewer3D");
    if(!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this._getState = opts.getState;
    this._onSnapshot = opts.onSnapshot || null;
    this.resize();
    this._bindEvents();
    this._buildAmbTabs();
    this.render();
  };

  Viewer.prototype._buildAmbTabs = function(){
    const tabs = document.getElementById("viewerAmbTabs");
    if(!tabs) return;
    const state = this._getState();
    if(!state.ambientes.length){ tabs.innerHTML = ""; return; }
    tabs.innerHTML = state.ambientes.map((a, i) =>
      `<div class="tab ${i===this.ambIdx?"on":""}" data-idx="${i}">🏠 ${a.nome||"Amb "+i}</div>`
    ).join("");
    tabs.querySelectorAll(".tab").forEach(t=>{
      t.onclick = () => { this.ambIdx = +t.dataset.idx; this._buildAmbTabs(); this.render(); };
    });
  };

  Viewer.prototype.resize = function(){
    if(!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Viewer.prototype._bindEvents = function(){
    const c = this.canvas;
    c.addEventListener("pointerdown", e=>{ this.drag = { x:e.clientX, y:e.clientY, rx:this.rotX, ry:this.rotY }; try{ c.setPointerCapture(e.pointerId); }catch(_){} });
    c.addEventListener("pointermove", e=>{
      if(!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.rotY = this.drag.ry + dx * 0.008;
      this.rotX = Math.max(-1.5, Math.min(1.5, this.drag.rx + dy * 0.008));
      this.render();
    });
    c.addEventListener("pointerup", e=>{ this.drag = null; try{ c.releasePointerCapture(e.pointerId); }catch(_){} });
    c.addEventListener("wheel", e=>{ e.preventDefault(); this.zoom = Math.max(0.25, Math.min(3, this.zoom * (e.deltaY<0?1.1:0.9))); this.render(); }, { passive:false });
    window.addEventListener("resize", ()=>{ this.resize(); this.render(); });

    // presets de câmera
    document.querySelectorAll("#cameraPresets button").forEach(b=>{
      b.onclick = () => {
        const p = PRESETS[b.dataset.cam];
        if(!p) return;
        this.rotX = p.rotX; this.rotY = p.rotY; this.zoom = p.zoom; this.panX = 0; this.panY = 0;
        document.querySelectorAll("#cameraPresets button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        this.render();
      };
    });

    // modos
    document.querySelectorAll("#modeGroup button").forEach(b=>{
      b.onclick = () => {
        this.modo = b.dataset.mode;
        document.querySelectorAll("#modeGroup button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        this.render();
      };
    });
  };

  Viewer.prototype.reset = function(){
    const p = PRESETS.iso;
    this.rotX = p.rotX; this.rotY = p.rotY; this.zoom = p.zoom; this.panX = 0; this.panY = 0;
    this.render();
  };

  Viewer.prototype.toggleAuto = function(){
    this.autoRotate = !this.autoRotate;
    document.getElementById("btnAutoRotate").classList.toggle("on", this.autoRotate);
    if(this.autoRotate) this._tick(); else cancelAnimationFrame(this.animFrame);
  };
  Viewer.prototype._tick = function(){
    if(!this.autoRotate) return;
    this.rotY += 0.01;
    this.render();
    this.animFrame = requestAnimationFrame(()=>this._tick());
  };

  Viewer.prototype.toggleCotas = function(){
    this.cotas = !this.cotas;
    document.getElementById("btnCotas").classList.toggle("on", this.cotas);
    this.render();
  };
    // ====== EXPLOSÃO ======
  Viewer.prototype.toggleExplosao = function(){
    this.explosaoAtiva = !this.explosaoAtiva;
    this.explosao = this.explosaoAtiva ? 0.5 : 0;
    const btn = document.getElementById("btnExplosao");
    if(btn) btn.classList.toggle("on", this.explosaoAtiva);
    const slider = document.getElementById("explosaoSlider");
    if(slider) slider.disabled = !this.explosaoAtiva;
    if(slider) slider.value = this.explosao;
    this.render();
  };

  Viewer.prototype.setExplosao = function(v){
    this.explosao = Math.max(0, Math.min(1, v));
    this.explosaoAtiva = this.explosao > 0.001;
    const btn = document.getElementById("btnExplosao");
    if(btn) btn.classList.toggle("on", this.explosaoAtiva);
    this.render();
  };

  Viewer.prototype.snapshot = function(paraPrint){
    if(!this.canvas) return;
    const dataURL = this.canvas.toDataURL("image/png");
    const el = document.getElementById("viewerSnapshot");
    if(!el) return;
    if(paraPrint){
      el.innerHTML = `<img src="${dataURL}" style="width:100%;max-width:780px;border-radius:8px;border:1px solid #999">`;
      el.style.display = "block";
      return;
    }
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = `visualizacao-${Date.now()}.png`;
    a.click();
    if(this._onSnapshot) this._onSnapshot("PNG baixado");
  };

  // ====== PROJEÇÃO ======
  // Aplica rotação e retorna coordenada de tela + profundidade
  Viewer.prototype._proj = function(x, y, z){
    // rotação
    let p = rotY([x, y, z], this.rotY);
    p = rotX(p, this.rotX);
    // perspectiva
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

  // ====== GERAR FACES ======
  Viewer.prototype._gerarFaces = function(amb){
    const faces = [];
    const L = +amb.largura, A = +amb.altura, P = +amb.profundidade;
    const ox = -L/2, oy = -A/2, oz = -P/2; // centraliza
    const vis = amb.visibilidade || "frente";

	   // ====== EXPLOSÃO: fator global ======
	const EXPL = this.explosao;   // 0..1
	const centro = [0, 0, 0];     // centro do ambiente

	// helper: adiciona face retangular (4 pontos 3D) com deslocamento de explosão
	function addFace(pts, cor, alpha, tipo){
	  let ptsFinal = pts;
	  if(EXPL > 0.001){
		const cx = (pts[0][0]+pts[1][0]+pts[2][0]+pts[3][0])/4;
		const cy = (pts[0][1]+pts[1][1]+pts[2][1]+pts[3][1])/4;
		const cz = (pts[0][2]+pts[1][2]+pts[2][2]+pts[3][2])/4;
		const dx = cx - centro[0];
		const dy = cy - centro[1];
		const dz = cz - centro[2];
		const len = Math.hypot(dx, dy, dz) || 1;
		const fator = EXPL * 600;
		const ox2 = (dx / len) * fator;
		const oy2 = (dy / len) * fator;
		const oz2 = (dz / len) * fator;
		ptsFinal = pts.map(p => [p[0] + ox2, p[1] + oy2, p[2] + oz2]);
	  }
	  const n = normal(ptsFinal);
	  const shade = 0.7 + 0.3 * Math.max(0, n[1]);
	  const cx = (ptsFinal[0][0]+ptsFinal[1][0]+ptsFinal[2][0]+ptsFinal[3][0])/4;
	  const cy = (ptsFinal[0][1]+ptsFinal[1][1]+ptsFinal[2][1]+ptsFinal[3][1])/4;
	  const cz = (ptsFinal[0][2]+ptsFinal[1][2]+ptsFinal[2][2]+ptsFinal[3][2])/4;
	  faces.push({ pts: ptsFinal, cor, alpha, tipo, shade, cx, cy, cz });
	}

    function normal(pts){
      const a = [pts[1][0]-pts[0][0], pts[1][1]-pts[0][1], pts[1][2]-pts[0][2]];
      const b = [pts[2][0]-pts[0][0], pts[2][1]-pts[0][1], pts[2][2]-pts[0][2]];
      const n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const len = Math.hypot(n[0],n[1],n[2]) || 1;
      return [n[0]/len, n[1]/len, n[2]/len];
    }

    // ====== ESTRUTURA (paredes) ======
    // Frente (sempre)
    addFace([[ox,oy,oz+P],[ox+L,oy,oz+P],[ox+L,oy+A,oz+P],[ox,oy+A,oz+P]], CORES.vidro, 0.18, "vidro-frente");
    // Base
    addFace([[ox,oy,oz],[ox+L,oy,oz],[ox+L,oy,oz+P],[ox,oy,oz+P]], CORES.acm, 0.9, "acm-base");
    // Topo (borda fina)
    addFace([[ox,oy+A,oz],[ox+L,oy+A,oz],[ox+L,oy+A,oz+P],[ox,oy+A,oz+P]], CORES.estrutura, 0.55, "topo");
    // Fundo
    if(vis === "todos") addFace([[ox,oy,oz],[ox+L,oy,oz],[ox+L,oy+A,oz],[ox,oy+A,oz]], CORES.vidro, 0.18, "vidro-fundo");
    // Lateral esquerda
    if(vis === "frente_1" || vis === "frente_2" || vis === "todos"){
      addFace([[ox,oy,oz],[ox,oy,oz+P],[ox,oy+A,oz+P],[ox,oy+A,oz]], CORES.vidro, 0.18, "vidro-lat");
    }
    // Lateral direita
    if(vis === "frente_2" || vis === "todos"){
      addFace([[ox+L,oy,oz],[ox+L,oy,oz+P],[ox+L,oy+A,oz+P],[ox+L,oy+A,oz]], CORES.vidro, 0.18, "vidro-lat");
    }

    // ====== VÃOS ======
    let xCursor = 0;
    (amb.vaos||[]).forEach(v=>{
      const vw = +v.largura;
      const vx = ox + xCursor;
      const vxEnd = vx + vw;
      const corP = corDoPerfil(v.corPerfil);
      const esp = 18; // espessura do perfil

      // Helper: adiciona caixa 3D (6 faces)
      function addBox(x, y, z, dx, dy, dz, cor, alpha){
        // frente
        addFace([[x,y,z+dz],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]], cor, alpha, "box");
        // fundo
        addFace([[x,y,z],[x+dx,y,z],[x+dx,y+dy,z],[x,y+dy,z]], cor, alpha, "box");
        // esq
        addFace([[x,y,z],[x,y,z+dz],[x,y+dy,z+dz],[x,y+dy,z]], cor, alpha, "box");
        // dir
        addFace([[x+dx,y,z],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x+dx,y+dy,z]], cor, alpha, "box");
        // topo
        addFace([[x,y+dy,z],[x+dx,y+dy,z],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]], cor, alpha, "box");
        // base
        addFace([[x,y,z],[x+dx,y,z],[x+dx,y,z+dz],[x,y,z+dz]], cor, alpha, "box");
      }

      // Moldura do vão
      addBox(vx, oy, oz, esp, A, P, corP, 1);              // montante esq
      addBox(vxEnd - esp, oy, oz, esp, A, P, corP, 1);      // montante dir
      addBox(vx + esp, oy + A - esp, oz, vw - 2*esp, esp, P, corP, 1); // travessa topo
      addBox(vx + esp, oy, oz, vw - 2*esp, esp, P, corP, 1);           // travessa base

      // Conteúdo
      const nGavetas = v.gavetasPortas || 1;
      if(v.tipo === "gaveta" || v.tipo === "gaveta_dupla"){
        const n = v.tipo === "gaveta_dupla" ? nGavetas * 2 : nGavetas;
        const hG = (A - 2*esp) / n;
        for(let gi = 0; gi < n; gi++){
          const gy = oy + esp + gi * hG;
          // frente de vidro translúcido da gaveta
          addFace([[vx+esp+2, gy+2, oz+P-3],[vxEnd-esp-2, gy+2, oz+P-3],[vxEnd-esp-2, gy+hG-2, oz+P-3],[vx+esp+2, gy+hG-2, oz+P-3]], CORES.vidro, 0.45, "gaveta");
          // divisória entre gavetas
          addBox(vx+esp, gy, oz, vw - 2*esp, 2, P, corP, 1);
        }
      } else if(["porta_simples","porta_dupla","porta_tempero","cristaleira","nicho"].includes(v.tipo)){
        // porta de vidro
        addFace([[vx+esp, oy+esp, oz+P-3],[vxEnd-esp, oy+esp, oz+P-3],[vxEnd-esp, oy+A-esp, oz+P-3],[vx+esp, oy+A-esp, oz+P-3]], CORES.vidro, 0.5, "porta");
        // prateleiras
        if(v.temPrateleiras && v.qtdPrateleiras > 0){
          const nP = +v.qtdPrateleiras;
          for(let pi = 0; pi < nP; pi++){
            const py = oy + esp + (A - 2*esp) * (pi+1) / (nP+1);
            addFace([[vx+esp, py-2, oz+esp],[vxEnd-esp, py-2, oz+esp],[vxEnd-esp, py-2, oz+P-esp],[vx+esp, py-2, oz+P-esp]], CORES.prat, 0.85, "prat");
            addFace([[vx+esp, py+2, oz+esp],[vxEnd-esp, py+2, oz+esp],[vxEnd-esp, py+2, oz+P-esp],[vx+esp, py+2, oz+P-esp]], CORES.pratBorda, 0.85, "prat");
          }
        }
        // puxador
        addBox(vxEnd - esp - 60, oy + A - esp - 30, oz + P - 8, 40, 6, 6, CORES.puxador, 1);
      } else if(v.tipo === "lixeira"){
        addFace([[vx+esp, oy+esp, oz+P-3],[vxEnd-esp, oy+esp, oz+P-3],[vxEnd-esp, oy+A-esp, oz+P-3],[vx+esp, oy+A-esp, oz+P-3]], "#22c55e", 0.55, "lixeira");
      }

      xCursor += vw;
    });

    return { faces, L, A, P, ox, oy, oz };
  };

  // ====== RENDER ======
  Viewer.prototype.render = function(){
    if(!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    const state = this._getState();
    const amb = state.ambientes[this.ambIdx];
    const msgEl = document.getElementById("viewerMsg");
    const hudEl = document.getElementById("viewerHud");

    if(!amb){
      if(msgEl){ msgEl.style.display = "block"; msgEl.textContent = state.ambientes.length ? "Selecione um ambiente." : "Adicione ambientes para visualizar."; }
      if(hudEl) hudEl.textContent = "—";
      return;
    }
    if(msgEl) msgEl.style.display = "none";
    if(hudEl) hudEl.textContent = `${amb.nome} · ${amb.largura}×${amb.altura}×${amb.profundidade}mm`;

    // 1) Gera faces 3D
    const { faces, ox, oy, oz } = this._gerarFaces(amb);

    // 2) Projeta cada face e calcula z médio APÓS rotação (profundidade real)
    const proj = faces.map(f => {
      // centro da face em 3D
      let c = [f.cx, f.cy, f.cz];
      // rotação
      c = rotY(c, this.rotY);
      c = rotX(c, this.rotX);
      // z real = profundidade após rotação
      return {
        face: f,
        screenPts: f.pts.map(p => this._proj(p[0], p[1], p[2])),
        zReal: c[2]
      };
    });

    // 3) ORDENA: maior z (mais distante) primeiro → painter's algorithm
    proj.sort((a, b) => b.zReal - a.zReal);

    // 4) Desenha
    proj.forEach(({ face, screenPts }) => {
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for(let i=1; i<screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
      ctx.closePath();

      if(this.modo === "wireframe"){
        ctx.strokeStyle = face.cor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        // cor com sombreamento e alpha
        ctx.fillStyle = this._applyShade(face.cor, face.shade, face.alpha);
        ctx.fill();
        // contorno
        if(this.modo === "solido"){
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        } else if(this.modo === "transp"){
          ctx.strokeStyle = this._applyAlpha(face.cor, 0.6);
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    });

    // 5) Cotas 3D
    if(this.cotas) this._desenharCotas(ctx, amb, ox, oy, oz);

    // 6) Legenda + detalhes
    this._renderLegenda(amb);
    if(this._renderDetalhes) this._renderDetalhes(amb);
  };

  Viewer.prototype._applyShade = function(hex, shade, alpha){
    // hex → rgb, aplica shade e alpha
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const r2 = Math.min(255, Math.round(r * shade));
    const g2 = Math.min(255, Math.round(g * shade));
    const b2 = Math.min(255, Math.round(b * shade));
    if(alpha >= 1) return `rgb(${r2},${g2},${b2})`;
    return `rgba(${r2},${g2},${b2},${alpha})`;
  };
  Viewer.prototype._applyAlpha = function(hex, alpha){
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  Viewer.prototype._desenharCotas = function(ctx, amb, ox, oy, oz){
    const L = +amb.largura, A = +amb.altura, P = +amb.profundidade;
    const cor = "#fbbf24";
    ctx.save();
    ctx.strokeStyle = cor; ctx.fillStyle = cor;
    ctx.lineWidth = 1.2; ctx.font = "bold 12px system-ui,Arial";
    ctx.textAlign = "center";

    // Largura (frente)
    const pA = this._proj(ox, oy - 80, oz + P);
    const pB = this._proj(ox + L, oy - 80, oz + P);
    ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
    seta(ctx, pA, pB, cor); seta(ctx, pB, pA, cor);
    ctx.fillText(`${L}mm`, (pA.x+pB.x)/2, (pA.y+pB.y)/2 - 8);

    // Altura (esquerda)
    const pC = this._proj(ox - 80, oy, oz + P);
    const pD = this._proj(ox - 80, oy + A, oz + P);
    ctx.beginPath(); ctx.moveTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y); ctx.stroke();
    seta(ctx, pC, pD, cor); seta(ctx, pD, pC, cor);
    ctx.save(); ctx.translate((pC.x+pD.x)/2 - 10, (pC.y+pD.y)/2); ctx.rotate(-Math.PI/2); ctx.fillText(`${A}mm`, 0, 0); ctx.restore();

    // Profundidade (direita)
    const pE = this._proj(ox + L + 60, oy, oz);
    const pF = this._proj(ox + L + 60, oy, oz + P);
    ctx.beginPath(); ctx.moveTo(pE.x, pE.y); ctx.lineTo(pF.x, pF.y); ctx.stroke();
    seta(ctx, pE, pF, cor); seta(ctx, pF, pE, cor);
    ctx.fillText(`${P}mm`, (pE.x+pF.x)/2 + 24, (pE.y+pF.y)/2);

    ctx.restore();
  };

  function seta(ctx, p1, p2, cor){
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - s*Math.cos(ang-0.4), p2.y - s*Math.sin(ang-0.4));
    ctx.lineTo(p2.x - s*Math.cos(ang+0.4), p2.y - s*Math.sin(ang+0.4));
    ctx.closePath();
    ctx.fillStyle = cor;
    ctx.fill();
  }

  Viewer.prototype._renderLegenda = function(amb){
    const el = document.getElementById("viewerLegend");
    if(!el) return;
    el.innerHTML = `
      <span class="vl-item"><span class="lg-cor" style="background:${CORES.estrutura}"></span>Estrutura</span>
      <span class="vl-item"><span class="lg-cor" style="background:${CORES.vidro}"></span>Vidro</span>
      <span class="vl-item"><span class="lg-cor" style="background:${CORES.acm}"></span>ACM</span>
      <span class="vl-item"><span class="lg-cor" style="background:${CORES.prat}"></span>Prateleira</span>
      <span class="vl-item"><span class="lg-cor" style="background:${corDoPerfil(amb.corPerfil)}"></span>Perfil ${amb.corPerfil||'-'}</span>
      <span class="vl-item"><span class="lg-cor" style="background:#fbbf24"></span>Cotas</span>`;
  };

  // Exporta helpers para app.js
  global.viewer3D = new Viewer();
  global.CORES_VIEWER = CORES;

})(window);