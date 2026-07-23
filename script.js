/* ============================================================
   TesourariaSys — script.js
   Extraído do <script> embutido em tesourariasys.html.
   O código já é organizado internamente em blocos com banners
   '// ═══' (GITHUB CONFIG, MODO OFFLINE, UTILITÁRIOS, CRUD DE
   CADA MÓDULO, RENDER DE CADA TELA, etc.) — mantidos como estão
   porque já descrevem melhor cada função do que uma divisão
   genérica em 5 categorias faria.
   ============================================================ */

// ══════════════════════════════════════════
// GITHUB CONFIG
// ══════════════════════════════════════════
const GH_USER = 'Fabio9500';
const GH_REPO = 'tesourariasys';
const GH_FILE = 'dados.json';
const GH_API  = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${GH_FILE}`;

// Decodifica base64 -> UTF-8 corretamente (o par exato do encode usado em ghSalvar:
// btoa(unescape(encodeURIComponent(str))) ). Usar atob() sozinho corrompe acentos
// a cada ciclo de carregar/salvar (bug corrigido na v1.17 — dados antigos precisam
// ser limpos manualmente uma vez, ver rotina de correção no dados.json).
function b64ParaTextoUtf8(b64){
  return decodeURIComponent(escape(atob(b64)));
}

function getToken(){ return localStorage.getItem('tsr_gh_token') || ''; }
function setToken(t){ localStorage.setItem('tsr_gh_token', t); }

// ══════════════════════════════════════════
// CADASTRO ÚNICO (Categoria / Centro de Custo / Direcionamento)
// Vive em cadastros-pf.json e cadastros-pj.json neste mesmo repo —
// NÃO em dados.json. É a mesma fonte usada por Cartões PF/PJ, pra
// padronizar os lançamentos que se integram entre os sistemas.
// ══════════════════════════════════════════
const GH_CADASTRO_PF_FILE = 'cadastros-pf.json';
const GH_CADASTRO_PJ_FILE = 'cadastros-pj.json';
function ghCadastroApi(file){ return `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${file}`; }

let _cadastroSha = { pf:null, pj:null };
let CADASTRO_PF = {categorias:[],centrosCusto:[],direcionamentos:[]};
let CADASTRO_PJ = {categorias:[],centrosCusto:[],direcionamentos:[]};

async function ghCadastroCarregar(pfpj){
  const file = pfpj==='pf' ? GH_CADASTRO_PF_FILE : GH_CADASTRO_PJ_FILE;
  try{
    const r = await fetch(ghCadastroApi(file), { headers:{ 'Authorization': `token ${getToken()}`, 'Accept': 'application/vnd.github.v3+json' } });
    if(!r.ok){
      if(r.status===404) return {categorias:[],centrosCusto:[],direcionamentos:[]};
      throw new Error('HTTP '+r.status);
    }
    const j = await r.json();
    _cadastroSha[pfpj] = j.sha;
    let dados;
    if(!j.content || j.content.trim()===''){
      const r2 = await fetch(j.download_url);
      dados = await r2.json();
    } else {
      dados = JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
    }
    return dados;
  }catch(e){
    console.error('Erro ao carregar cadastro único ('+pfpj+')', e);
    return {categorias:[],centrosCusto:[],direcionamentos:[]};
  }
}

async function ghCadastroSalvar(pfpj, dados){
  const file = pfpj==='pf' ? GH_CADASTRO_PF_FILE : GH_CADASTRO_PJ_FILE;
  // Busca o SHA mais recente antes de gravar (outro sistema — Cartões PF/PJ —
  // pode ter alterado esse arquivo enquanto este app estava aberto).
  let sha = _cadastroSha[pfpj];
  try{
    const rCheck = await fetch(ghCadastroApi(file), { headers:{ 'Authorization': `token ${getToken()}`, 'Accept': 'application/vnd.github.v3+json' } });
    if(rCheck.ok){ const jCheck = await rCheck.json(); sha = jCheck.sha; }
  }catch(e){}
  const conteudo = btoa(unescape(encodeURIComponent(JSON.stringify(dados, null, 2))));
  const body = { message:'Atualiza '+file+' via TesourariaSys', content:conteudo };
  if(sha) body.sha = sha;
  const r = await fetch(ghCadastroApi(file), {
    method:'PUT',
    headers:{ 'Authorization': `token ${getToken()}`, 'Accept':'application/vnd.github.v3+json', 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if(!r.ok){ throw new Error('Falha ao salvar '+file+': HTTP '+r.status); }
  const j = await r.json();
  _cadastroSha[pfpj] = j.content.sha;
  return dados;
}

// Carrega os dois arquivos, marca cada item com tipoPFPJ (se ainda não tiver —
// os itens "de sistema" já vêm com tipoPFPJ:'ambos' fixo no próprio arquivo) e
// popula DB.categorias/centrosCusto/direcionamentos (usados por todo o resto
// do app, sem precisar mudar mais nada nas telas/relatórios).
async function carregarCadastrosUnicos(){
  const [pf, pj] = await Promise.all([ ghCadastroCarregar('pf'), ghCadastroCarregar('pj') ]);
  CADASTRO_PF = pf; CADASTRO_PJ = pj;
  aplicarCadastrosUnicosNaDB();
  try{ localStorage.setItem('tsr_cadastro_bkp', JSON.stringify({pf:CADASTRO_PF, pj:CADASTRO_PJ})); }catch(e){}
}

function carregarCadastrosUnicosOffline(){
  try{
    const bkp = JSON.parse(localStorage.getItem('tsr_cadastro_bkp')||'null');
    if(!bkp) return;
    CADASTRO_PF = bkp.pf||{categorias:[],centrosCusto:[],direcionamentos:[]};
    CADASTRO_PJ = bkp.pj||{categorias:[],centrosCusto:[],direcionamentos:[]};
    aplicarCadastrosUnicosNaDB();
  }catch(e){}
}

function aplicarCadastrosUnicosNaDB(){
  const marcar = (lista, padrao) => (lista||[]).map(i => ({...i, tipoPFPJ: i.tipoPFPJ || padrao}));
  DB.categorias       = [...marcar(CADASTRO_PF.categorias,'PF'),       ...marcar(CADASTRO_PJ.categorias,'PJ')];
  DB.centrosCusto      = [...marcar(CADASTRO_PF.centrosCusto,'PF'),     ...marcar(CADASTRO_PJ.centrosCusto,'PJ')];
  DB.direcionamentos  = [...marcar(CADASTRO_PF.direcionamentos,'PF'),  ...marcar(CADASTRO_PJ.direcionamentos,'PJ')];
}

// Grava um item (categoria / centro de custo / direcionamento) no(s)
// arquivo(s) certo(s) — PF, PJ, ou os dois quando tipoPFPJ==='ambos'.
// 'campo' é 'categorias' | 'centrosCusto' | 'direcionamentos'.
async function salvarItemCadastroUnico(campo, item, exclusao){
  const alvos = item.tipoPFPJ==='ambos' ? ['pf','pj'] : [item.tipoPFPJ==='PF' ? 'pf' : 'pj'];
  for(const alvo of alvos){
    const cad = await ghCadastroCarregar(alvo);
    let lista = cad[campo]||[];
    if(exclusao){
      lista = lista.filter(x=>x.id!==item.id);
    } else {
      const idx = lista.findIndex(x=>x.id===item.id);
      if(idx>=0) lista[idx]=item; else lista.push(item);
    }
    cad[campo]=lista;
    await ghCadastroSalvar(alvo, cad);
  }
  await carregarCadastrosUnicos();
}


let _sha = null;
let _shaAtual = null;

// ══════════════════════════════════════════
// MODO OFFLINE — FILA DE SINCRONIZAÇÃO
// ══════════════════════════════════════════
function getFilaPendente(){ try{ return JSON.parse(localStorage.getItem('tsr_fila')||'null'); }catch(e){ return null; } }
function setFilaPendente(db){ try{ localStorage.setItem('tsr_fila', JSON.stringify(db)); }catch(e){} }
function limparFilaPendente(){ localStorage.removeItem('tsr_fila'); }
function getUltimoSha(){ return localStorage.getItem('tsr_last_sha') || ''; }
function setUltimoSha(sha){ if(sha) localStorage.setItem('tsr_last_sha', sha); }

let _online = navigator.onLine;
let _sincronizando = false;
function isOnline(){ return navigator.onLine; }

async function ghCarregar(){
  try{
    setStatus('saving','🔄 Carregando...');
    const r = await fetch(GH_API, { headers:{ 'Authorization': `token ${getToken()}`, 'Accept': 'application/vnd.github.v3+json' } });
    if(r.status === 401 || r.status === 403) return null;
    if(r.status === 404){ setStatus('ok','✅ Pronto'); return dbVazio(); }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    _sha = j.sha;
    setUltimoSha(j.sha);
    let dados;
    if(!j.content || j.content.trim() === ''){
      setStatus('saving','🔄 Arquivo grande — carregando via download...');
      const r2 = await fetch(j.download_url);
      if(!r2.ok) throw new Error('Download falhou: '+r2.status);
      dados = await r2.json();
    } else {
      dados = JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
    }
    try{ localStorage.setItem('tsr_bkp', JSON.stringify(dados)); }catch(e){}
    const fila = getFilaPendente();
    if(fila){ setStatus('warn','📤 Sincronizando alterações offline...'); return await resolverFilaPendente(fila, dados, j.sha); }
    setStatus('ok','✅ Dados carregados');
    setTimeout(()=>{ document.getElementById('status').style.display='none'; },3000);
    return dados;
  }catch(e){
    const bkp = localStorage.getItem('tsr_bkp');
    if(bkp){ setStatus('warn','📴 Offline — usando dados locais'); return JSON.parse(bkp); }
    setStatus('warn','⚠ Sem dados');
    return dbVazio();
  }
}

async function resolverFilaPendente(filaDb, dadosRemotos, shaRemotoAtual){
  const shaQuandoFicouOffline = getUltimoSha();
  if(!shaQuandoFicouOffline || shaQuandoFicouOffline === shaRemotoAtual){
    limparFilaPendente();
    await ghSalvar(filaDb);
    setStatus('ok','✅ Alterações offline sincronizadas');
    setTimeout(()=>{ document.getElementById('status').style.display='none'; },4000);
    return filaDb;
  }
  mostrarConflitoSync(filaDb, dadosRemotos);
  return dadosRemotos;
}

function mostrarConflitoSync(filaDb, dadosRemotos){
  AM('⚠️ Conflito de Sincronização', `
    <div style="background:#da363322;border:1px solid var(--red);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.5">
      Você tem alterações feitas <strong>offline neste dispositivo</strong> que ainda não foram salvas na nuvem.<br><br>
      Porém, <strong>outro dispositivo já salvou alterações diferentes</strong> no sistema enquanto você estava sem conexão.<br><br>
      Escolha como deseja prosseguir:
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${B('☁️ Manter dados da nuvem (descarta minhas alterações offline)','aplicarResolucaoConflito(&quot;nuvem&quot;)','var(--blu)','#fff')}
      ${B('💾 Usar minhas alterações offline (sobrescreve a nuvem)','aplicarResolucaoConflito(&quot;local&quot;)','var(--acc)','#000')}
    </div>
    <div style="margin-top:14px;font-size:11px;color:var(--mut)">
      Dica: se não tiver certeza, escolha "Manter dados da nuvem" e refaça manualmente as alterações que fez offline, conferindo o que já está salvo.
    </div>
  `);
  window._conflitoFilaDb = filaDb;
  window._conflitoDadosRemotos = dadosRemotos;
}

async function aplicarResolucaoConflito(opcao){
  FM();
  if(opcao==='nuvem'){
    limparFilaPendente();
    DB = window._conflitoDadosRemotos;
    _relCacheVersion++;
    setStatus('ok','☁️ Dados da nuvem mantidos');
  } else {
    limparFilaPendente();
    await ghSalvar(window._conflitoFilaDb);
    DB = window._conflitoFilaDb;
    _relCacheVersion++;
    setStatus('ok','✅ Suas alterações offline foram salvas');
  }
  delete window._conflitoFilaDb;
  delete window._conflitoDadosRemotos;
  aplicarCadastrosUnicosNaDB();
  renderAba();
  setTimeout(()=>{ document.getElementById('status').style.display='none'; },4000);
}

async function ghSalvar(db, pularMesclagem){
  try{ localStorage.setItem('tsr_bkp', JSON.stringify(db)); }catch(e){}
  if(!isOnline()){
    setFilaPendente(db);
    setStatus('warn','📴 Offline — alteração salva neste dispositivo');
    setTimeout(()=>{ document.getElementById('status').style.display='none'; },4000);
    return;
  }
  setStatus('saving','⏳ Salvando...');
  try{
    const shaAntesDoSave = _shaAtual;
    const rGet = await fetch(GH_API, { headers:{ 'Authorization':`token ${getToken()}`, 'Accept':'application/vnd.github.v3+json' } });
    if(rGet.ok){
      const jGet = await rGet.json();
      _sha = jGet.sha; _shaAtual = jGet.sha;
      // Alguém (ex: CartõesPF/PJ pagando fatura) pode ter gravado dados.json entre o
      // carregamento local e este salvamento. Em vez de sobrescrever cegamente, mescla
      // os lançamentos que só existem na versão remota, pra não perdê-los.
      if(shaAntesDoSave && jGet.sha !== shaAntesDoSave && jGet.content && !pularMesclagem){
        try{
          const remoto = JSON.parse(b64ParaTextoUtf8(jGet.content.replace(/\n/g,'')));
          const idsLocais = new Set((db.lancamentos||[]).map(l=>l.id));
          const novosDoRemoto = (remoto.lancamentos||[]).filter(l=>!idsLocais.has(l.id));
          if(novosDoRemoto.length){
            db = { ...db, lancamentos: [...(db.lancamentos||[]), ...novosDoRemoto] };
            setStatus('warn', `🔄 ${novosDoRemoto.length} lançamento(s) de outro sistema mesclado(s) antes de salvar`);
          }
          // Protege as CONTAS (saldo inicial etc.) do mesmo jeito: se alguém salvou uma
          // versão diferente nesse meio-tempo, compara por "atualizadoEm" e mantém sempre
          // a edição mais recente de cada conta — em vez de deixar a gravação atual (que
          // pode estar operando com uma cópia mais antiga de outra conta) apagar sem querer
          // uma alteração feita em outro dispositivo/aba, ou vice-versa.
          if(remoto.contas && remoto.contas.length){
            const remotoPorId = {}; remoto.contas.forEach(c=>{ remotoPorId[c.id]=c; });
            const localPorId = {}; (db.contas||[]).forEach(c=>{ localPorId[c.id]=c; });
            const idsTodos = new Set([...Object.keys(remotoPorId), ...Object.keys(localPorId)]);
            const contasMescladas = [...idsTodos].map(id=>{
              const l = localPorId[id], r = remotoPorId[id];
              if(l && !r) return l; // conta nova, só existe local
              if(r && !l) return r; // conta nova, só existe remoto
              const tL = l.atualizadoEm ? new Date(l.atualizadoEm).getTime() : 0;
              const tR = r.atualizadoEm ? new Date(r.atualizadoEm).getTime() : 0;
              return tR > tL ? r : l; // mantém sempre a edição mais recente
            });
            db = { ...db, contas: contasMescladas };
          }
        }catch(eMerge){ /* se a mesclagem falhar, segue salvando o que já tínhamos, melhor que travar */ }
      }
    }
    const conteudo = btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2))));
    const body = { message:'TesourariaSys update', content: conteudo, sha: _sha };
    const r = await fetch(GH_API, {
      method:'PUT',
      headers:{ 'Authorization':`token ${getToken()}`, 'Accept':'application/vnd.github.v3+json', 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const res = await r.json();
    if(res.content && res.content.sha){
      _sha = res.content.sha; _shaAtual = res.content.sha;
      setUltimoSha(res.content.sha);
      limparFilaPendente();
      DB = db;
      _relCacheVersion++;
      aplicarCadastrosUnicosNaDB(); // repõe categorias/CC/direcionamentos (não gravados em dados.json)
      setStatus('ok','✅ Salvo na nuvem');
    } else {
      setFilaPendente(db);
      setStatus('err','⚠ Erro ao salvar — guardado localmente');
    }
    setTimeout(()=>{ document.getElementById('status').style.display='none'; },3000);
  }catch(e){
    setFilaPendente(db);
    setStatus('warn','📴 Sem conexão — alteração salva neste dispositivo');
    setTimeout(()=>{ document.getElementById('status').style.display='none'; },5000);
  }
}

window.addEventListener('online', async ()=>{
  _online = true;
  const fila = getFilaPendente();
  if(fila && !_sincronizando){
    _sincronizando = true;
    setStatus('warn','🔄 Conexão recuperada — verificando sincronização...');
    try{
      const r = await fetch(GH_API, { headers:{ 'Authorization':`token ${getToken()}`, 'Accept':'application/vnd.github.v3+json' } });
      if(r.ok){
        const j = await r.json();
        const dadosRemotos = JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
        await resolverFilaPendente(fila, dadosRemotos, j.sha);
        if(!window._conflitoFilaDb){ renderAba(); }
      }
    }catch(e){ }
    _sincronizando = false;
  }
});
window.addEventListener('offline', ()=>{
  _online = false;
  setStatus('warn','📴 Você está offline — alterações serão salvas neste dispositivo');
  setTimeout(()=>{ document.getElementById('status').style.display='none'; },4000);
});

function setStatus(tipo,msg){
  const el=document.getElementById('status');
  const s={saving:'background:#2f81f722;color:var(--acc);border:1px solid #2f81f755',
    ok:'background:#2ea04322;color:#3fb950;border:1px solid #2ea04355',
    warn:'background:#f0a50022;color:#f0a500;border:1px solid #f0a50055',
    err:'background:#da363322;color:#f85149;border:1px solid #da363355'};
  el.style.cssText='display:block;position:fixed;bottom:16px;right:16px;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:700;z-index:200;'+s[tipo];
  el.textContent=msg;
}

function atualizarIndicadorConexao(){
  let ind = document.getElementById('conn-indicator');
  if(!ind){
    ind = document.createElement('div');
    ind.id = 'conn-indicator';
    ind.style.cssText = 'position:fixed;top:8px;right:12px;font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px;z-index:250;display:none';
    document.body.appendChild(ind);
  }
  const fila = getFilaPendente();
  if(!isOnline()){
    ind.style.display='block';
    ind.style.cssText += 'background:#da363322;color:#f85149;border:1px solid #da363355';
    ind.textContent = '📴 Offline';
  } else if(fila){
    ind.style.display='block';
    ind.style.cssText += 'background:#f0a50022;color:#f0a500;border:1px solid #f0a50055';
    ind.textContent = '🔄 Pendente de sincronizar';
  } else {
    ind.style.display='none';
  }
}
setInterval(atualizarIndicadorConexao, 2000);

// ══════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
const fmt = n => Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function hoje(){ return new Date().toISOString().slice(0,10); }
function fmtD(iso){ if(!iso) return '-'; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; }
function parseValor(v){ if(typeof v==='number') return v; if(!v) return 0; return parseFloat(String(v).replace(/\./g,'').replace(',','.'))||0; }
function diffDias(iso){ const hj=new Date(hoje()+'T00:00:00'); const dt=new Date(iso+'T00:00:00'); return Math.round((dt-hj)/86400000); }

let DB = {};

// ══════════════════════════════════════════
// SISTEMA DE USUÁRIOS E PERMISSÕES
// ══════════════════════════════════════════
let USUARIO_ATUAL = null;
let _usuLoginId   = null;

const LABELS_PERFIL = { master:'Master', operador:'Operador', consulta:'Consulta' };
const CORES_PERFIL  = { master:'var(--acc)', operador:'var(--blu)', consulta:'var(--mut)' };
const BLOQ_OPERADOR = new Set(['excluir','editar_dados','config','usuarios']);
const BLOQ_CONSULTA = new Set(['excluir','editar_dados','config','usuarios','lancamentos','pagar']);

function temPerm(acao){
  if(!USUARIO_ATUAL) return false;
  if(USUARIO_ATUAL.perfil==='master')   return true;
  if(USUARIO_ATUAL.perfil==='operador') return !BLOQ_OPERADOR.has(acao);
  if(USUARIO_ATUAL.perfil==='consulta') return !BLOQ_CONSULTA.has(acao);
  return false;
}
function BPerm(perm,r,oc,cor,txt,p,tip){ return temPerm(perm)?B(r,oc,cor,txt,p,tip):''; }

async function hashSenha(s){
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function seedUsuarios(){
  DB.usuarios = [
    {id:uid(), nome:'Fabio', login:'fabio', hash:await hashSenha('master'), perfil:'master', ativo:true},
  ];
}

async function seedInicial(){
  if(!DB.usuarios||DB.usuarios.length===0) await seedUsuarios();
  if(!DB.contas||DB.contas.length===0){
    DB.contas = [];
    for(let i=1;i<=6;i++) DB.contas.push({id:uid(),tipo:'PF',titular:`Conta PF ${i}`,banco:'',agencia:'',conta:'',saldoInicial:0,dataSaldoInicial:hoje(),ativa:true,obs:''});
    for(let i=1;i<=4;i++) DB.contas.push({id:uid(),tipo:'PJ',titular:`Conta PJ ${i}`,banco:'',agencia:'',conta:'',saldoInicial:0,dataSaldoInicial:hoje(),ativa:true,obs:''});
  }
  if(!DB.integracaoChequeSys){
    DB.integracaoChequeSys = { mapaContas:{}, contaPadrao:null, sincronizados:{} };
  }
  // Categoria / Centro de Custo / Direcionamento não são mais seedados aqui —
  // vêm do cadastro único compartilhado (cadastros-pf.json / cadastros-pj.json),
  // carregado logo abaixo.
  if(isOnline()) await carregarCadastrosUnicos(); else carregarCadastrosUnicosOffline();
  if(!DB.lancamentos) DB.lancamentos = [];
  if(!DB.contasPagar) DB.contasPagar = [];
  if(!DB.contasReceber) DB.contasReceber = [];
  if(!DB.fornecedores) DB.fornecedores = [];
  if(!DB.clientes) DB.clientes = [];
  if(!DB.chequesEmitidos) DB.chequesEmitidos = [];
  if(!DB.investimentos) DB.investimentos = [];
  if(!DB.previdencias) DB.previdencias = [];
  if(!DB.capitalizacoes) DB.capitalizacoes = [];
  if(!DB.seguros) DB.seguros = [];
  if(!DB.relatoriosFavoritos) DB.relatoriosFavoritos = [];
}

function dbVazio(){ return {usuarios:[],contas:[],categorias:[],centrosCusto:[],direcionamentos:[],lancamentos:[],contasPagar:[],contasReceber:[],fornecedores:[],clientes:[],chequesEmitidos:[],investimentos:[],previdencias:[],capitalizacoes:[],seguros:[],relatoriosFavoritos:[],integracaoChequeSys:{mapaContas:{},contaPadrao:null,sincronizados:{}},alertas:[]}; }

// ══════════════════════════════════════════
// BIOMETRIA (WebAuthn / Face ID / Touch ID)
// ══════════════════════════════════════════
const BIO_KEY_TSR = 'tsr_bio';

async function bioDisponivel(){
  try{ return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch(e){ return false; }
}
function _bioB64ToArr(b64){ return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)); }
function _bioArrToB64(arr){ return btoa(String.fromCharCode(...new Uint8Array(arr))); }

async function registrarBioTsr(userId){
  const u = (DB.usuarios||[]).find(x=>x.id===userId); if(!u) return false;
  try{
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({publicKey:{
      challenge,
      rp:{ name:'TesourariaSys', id: location.hostname||'localhost' },
      user:{ id: new TextEncoder().encode(userId), name: u.login||u.nome, displayName: u.nome },
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required' },
      timeout: 60000
    }});
    localStorage.setItem(BIO_KEY_TSR, JSON.stringify({credId: _bioArrToB64(cred.rawId), userId}));
    return true;
  }catch(e){
    if(e.name!=='NotAllowedError') console.warn('WebAuthn register:',e);
    return false;
  }
}

async function entrarComBioTsr(){
  const stored = localStorage.getItem(BIO_KEY_TSR); if(!stored) return;
  const {credId, userId} = JSON.parse(stored);
  const u = (DB.usuarios||[]).find(x=>x.id===userId&&x.ativo!==false); if(!u) return;
  const btnBio = document.getElementById('btn-bio-tsr');
  if(btnBio){ btnBio.disabled=true; btnBio.textContent='⏳ Aguardando...'; }
  try{
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    await navigator.credentials.get({publicKey:{
      challenge,
      allowCredentials:[{id:_bioB64ToArr(credId),type:'public-key',transports:['internal']}],
      userVerification:'required',
      timeout:60000
    }});
    USUARIO_ATUAL = {id:u.id,nome:u.nome,perfil:u.perfil};
    localStorage.setItem('tsr_usu',JSON.stringify(USUARIO_ATUAL));
    document.getElementById('tela-usuario').style.display='none';
    atualizarNavUsuario();
    iniciarApp();
  }catch(e){
    if(btnBio){btnBio.disabled=false;btnBio.textContent='🔒 Entrar com Face ID / Touch ID';}
    if(e.name!=='NotAllowedError') console.warn('WebAuthn auth:',e);
  }
}

async function _oferecerBioTsr(userId){
  if(localStorage.getItem(BIO_KEY_TSR)) return;
  if(!await bioDisponivel()) return;
  AM('🔒 Ativar Face ID / Touch ID?',`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:48px;margin-bottom:10px">🔒</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:8px">Entrar sem senha no próximo acesso</div>
      <p style="color:var(--mut);font-size:13px;margin-bottom:20px">Use Face ID ou Touch ID neste dispositivo.<br>Seus dados permanecem protegidos.</p>
      <div style="display:flex;gap:8px">
        ${B('✅ Ativar Agora',`ativarBioTsr('${userId}')`, 'var(--grn)','#fff')}
        ${B('Agora não','FM()','var(--sur)','var(--txt)')}
      </div>
    </div>
  `);
}

async function ativarBioTsr(userId){
  FM();
  const ok = await registrarBioTsr(userId);
  if(ok){ setStatus('ok','✅ Face ID / Touch ID ativado neste dispositivo!'); setTimeout(()=>{document.getElementById('status').style.display='none';},4000); }
  else { setStatus('warn','⚠ Não foi possível ativar a biometria.'); setTimeout(()=>{document.getElementById('status').style.display='none';},4000); }
}

function removerBioTsr(){
  if(!confirm('Remover Face ID / Touch ID deste dispositivo?\nVocê precisará usar sua senha para entrar.')) return;
  localStorage.removeItem(BIO_KEY_TSR);
  renderAba();
  setStatus('ok','Biometria removida deste dispositivo.');
  setTimeout(()=>{document.getElementById('status').style.display='none';},3000);
}

function mostrarTelaUsuario(){
  const tu = document.getElementById('tela-usuario');
  tu.style.display = 'flex';
  document.getElementById('telausu-versao').textContent = VERSAO;
  document.getElementById('telausu-e1').style.display = 'block';
  document.getElementById('telausu-e2').style.display = 'none';
  const ativos = (DB.usuarios||[]).filter(u=>u.ativo!==false);

  let bioHtml = '';
  const bioStored = localStorage.getItem(BIO_KEY_TSR);
  if(bioStored){
    try{
      const {userId} = JSON.parse(bioStored);
      const bioUser = ativos.find(u=>u.id===userId);
      if(bioUser){
        bioHtml = `<button type="button" id="btn-bio-tsr" onclick="entrarComBioTsr()"
          style="display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;background:linear-gradient(135deg,#1a5a9c,#2f81f7);color:#fff;border:none;border-radius:var(--r);cursor:pointer;font-family:inherit;width:100%;font-weight:700;font-size:14px;margin-bottom:10px">
          🔒 Entrar como <strong>${esc(bioUser.nome)}</strong> com Face ID / Touch ID
        </button>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="flex:1;height:1px;background:var(--bor)"></div>
          <span style="font-size:11px;color:var(--mut)">ou escolha o usuário</span>
          <div style="flex:1;height:1px;background:var(--bor)"></div>
        </div>`;
      }
    }catch(e){}
  }

  document.getElementById('lista-usuarios-login').innerHTML = bioHtml + ativos.map(u=>`
    <button type="button" onclick="selecionarUsuario('${u.id}')"
      style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg);border:1px solid var(--bor);border-radius:var(--r);cursor:pointer;font-family:inherit;width:100%;text-align:left">
      <div style="width:36px;height:36px;border-radius:50%;background:${CORES_PERFIL[u.perfil]||'var(--mut)'};color:${u.perfil==='master'?'#000':'#fff'};font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${u.nome.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--txt)">${esc(u.nome)}</div>
        <div style="font-size:11px;color:var(--mut)">${LABELS_PERFIL[u.perfil]||u.perfil}</div>
      </div>
      <div style="color:var(--mut);font-size:16px">›</div>
    </button>`).join('');
}

function selecionarUsuario(id){
  _usuLoginId = id;
  const u = (DB.usuarios||[]).find(x=>x.id===id);
  if(!u) return;
  document.getElementById('telausu-e1').style.display = 'none';
  document.getElementById('telausu-e2').style.display = 'block';
  document.getElementById('telausu-nome-sel').textContent = u.nome;
  document.getElementById('err-login-usu').style.display = 'none';
  document.getElementById('senha-login-usu').value = '';
  setTimeout(()=>document.getElementById('senha-login-usu').focus(), 150);
}

function voltarEscolhaUsuario(){
  document.getElementById('telausu-e1').style.display = 'block';
  document.getElementById('telausu-e2').style.display = 'none';
  _usuLoginId = null;
}

async function loginUsuario(){
  const u = (DB.usuarios||[]).find(x=>x.id===_usuLoginId);
  if(!u) return;
  const hash = await hashSenha(document.getElementById('senha-login-usu').value||'');
  if(hash !== u.hash){
    document.getElementById('err-login-usu').style.display = 'block';
    return;
  }
  USUARIO_ATUAL = {id:u.id, nome:u.nome, perfil:u.perfil};
  localStorage.setItem('tsr_usu', JSON.stringify(USUARIO_ATUAL));
  document.getElementById('tela-usuario').style.display = 'none';
  atualizarNavUsuario();
  iniciarApp();
  setTimeout(()=>_oferecerBioTsr(u.id), 1500);
}

function sairUsuario(){
  USUARIO_ATUAL = null;
  localStorage.removeItem('tsr_usu');
  document.getElementById('nav-usu-badge').style.display = 'none';
  document.getElementById('navbar').style.display = 'none';
  document.getElementById('main').style.display = 'none';
  document.getElementById('fab-buttons').style.display = 'none';
  mostrarTelaUsuario();
}

function atualizarNavUsuario(){
  if(!USUARIO_ATUAL) return;
  const badge = document.getElementById('nav-usu-badge');
  badge.style.display = 'flex';
  document.getElementById('nav-usu-avatar').textContent = USUARIO_ATUAL.nome.charAt(0).toUpperCase();
  document.getElementById('nav-usu-avatar').style.background = CORES_PERFIL[USUARIO_ATUAL.perfil]||'var(--mut)';
  document.getElementById('nav-usu-avatar').style.color = USUARIO_ATUAL.perfil==='master'?'#000':'#fff';
  document.getElementById('nav-usu-nome').textContent   = USUARIO_ATUAL.nome;
  document.getElementById('nav-usu-perfil').textContent = LABELS_PERFIL[USUARIO_ATUAL.perfil]||'';
}

// ══════════════════════════════════════════
// BACKUP MANUAL E AUTOMÁTICO
// ══════════════════════════════════════════
async function backupGitHub(silencioso){
  if(!getToken()||!isOnline()) return false;
  try{
    const agora = new Date();
    const ts = agora.toISOString().slice(0,16).replace('T','_').replace(/:/g,'-');
    const nomeArq = `backups/backup_${ts}.json`;
    const url = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${nomeArq}`;
    const conteudo = btoa(unescape(encodeURIComponent(JSON.stringify(DB,null,2))));
    const r = await fetch(url,{
      method:'PUT',
      headers:{'Authorization':`token ${getToken()}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
      body:JSON.stringify({message:`Backup ${ts}`,content:conteudo})
    });
    if(r.ok){
      try{ localStorage.setItem('tsr_ultimo_bkp', new Date().toLocaleString('pt-BR')); }catch(e){}
      if(!silencioso){ setStatus('ok','☁️ Backup salvo no GitHub!'); setTimeout(()=>{document.getElementById('status').style.display='none';},4000); }
      return true;
    }
  }catch(e){}
  if(!silencioso){ setStatus('err','⚠ Erro ao salvar backup no GitHub'); setTimeout(()=>{document.getElementById('status').style.display='none';},4000); }
  return false;
}

function backupLocal(){
  const ts = new Date().toISOString().slice(0,16).replace('T','_').replace(/:/g,'-');
  const nomeArq = `TesourariaSys_backup_${ts}.json`;
  const blob = new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=nomeArq; a.click();
  URL.revokeObjectURL(url);
  try{ localStorage.setItem('tsr_ultimo_bkp', new Date().toLocaleString('pt-BR')); }catch(e){}
  setStatus('ok',`💾 Backup baixado: ${nomeArq}`);
  setTimeout(()=>{document.getElementById('status').style.display='none';},4000);
}

async function fazerBackupCompleto(){
  setStatus('saving','⏳ Fazendo backup completo...');
  const ghOk = await backupGitHub(true);
  backupLocal();
  const msg = ghOk ? '✅ Backup concluído — GitHub + arquivo local' : '💾 Backup local concluído (GitHub indisponível)';
  setStatus(ghOk?'ok':'warn', msg);
  setTimeout(()=>{document.getElementById('status').style.display='none';},5000);
}

function abrirModalBackup(){
  let ultimoBkp='';
  try{ ultimoBkp=localStorage.getItem('tsr_ultimo_bkp')||''; }catch(e){}
  AM('💾 Backup dos Dados',`
    <div style="font-size:12px;color:var(--mut);margin-bottom:14px">
      ${ultimoBkp?'Último backup: <strong>'+ultimoBkp+'</strong>':'Nenhum backup registrado ainda.'}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${B('☁️ + 💾  Backup Completo (GitHub + Download Local)','FM();fazerBackupCompleto()','var(--grn)','#fff')}
      ${B('☁️  Backup só no GitHub','FM();backupGitHub(false)','var(--blu)','#fff')}
      ${B('💾  Backup só Local (download)','FM();backupLocal()','var(--acc)','#000')}
    </div>
    <div style="border-top:1px solid var(--bor);margin:14px 0 10px;padding-top:12px">
      ${BPerm('excluir','📥  Importar Backup (substitui os dados atuais)','abrirImportarBackup()','#c0312b','#fff')}
      <div style="font-size:10px;color:var(--mut);margin-top:4px">Restrito ao usuário Master — é uma ação que substitui todos os dados do sistema.</div>
    </div>
    <div style="border-top:1px solid var(--bor);margin:14px 0 10px;padding-top:12px">
      ${B('🔍  Verificar Lançamentos Duplicados','FM();verificarLancamentosDuplicados()','var(--sur)','var(--txt)')}
      ${B('🔔  Ver Alertas e Regras Ativas','FM();mostrarPainelAlertas(false)','var(--sur)','var(--txt)')}
    </div>
    <div style="display:flex;margin-top:10px">${B('Cancelar','FM()','var(--sur)','var(--txt)')}</div>
  `);
}

// ══════════════════════════════════════════
// 📥 IMPORTAR BACKUP — restaura um arquivo .json exportado anteriormente
// ══════════════════════════════════════════
function abrirImportarBackup(){
  if(!temPerm('excluir')){ alert('Apenas o usuário Master pode importar um backup.'); return; }
  AM('📥 Importar Backup', `
    ${EH('e-imp')}
    <div style="background:#da363322;border:1px solid var(--red);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--red);font-weight:700;line-height:1.5">
      ⚠️ Isso vai SUBSTITUIR todos os dados atuais do sistema pelos dados do arquivo escolhido. Use apenas se tiver certeza — por exemplo, para recuperar um backup depois de um problema.
    </div>
    <div class="campo">
      <label>Arquivo de backup (.json)</label>
      <input type="file" id="imp-arquivo" accept=".json,application/json" style="padding:8px">
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      ${B('📂 Ler Arquivo e Conferir','lerArquivoImportacao()','var(--acc)','#000')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}

function lerArquivoImportacao(){
  const input = document.getElementById('imp-arquivo');
  const arquivo = input?.files?.[0];
  if(!arquivo){ ME('e-imp','Escolha um arquivo .json primeiro.'); return; }
  const leitor = new FileReader();
  leitor.onload = (e) => {
    let dadosImportados;
    try{
      dadosImportados = JSON.parse(e.target.result);
    }catch(err){
      ME('e-imp','Este arquivo não é um JSON válido. Confira se escolheu o arquivo certo.');
      return;
    }
    // Validação simples: confere se parece mesmo com um backup do TesourariaSys
    const camposEsperados = ['contas','categorias','lancamentos','contasPagar','contasReceber'];
    const pareceValido = camposEsperados.some(c => Array.isArray(dadosImportados[c]));
    if(!pareceValido){
      ME('e-imp','Este arquivo não parece ser um backup do TesourariaSys (não tem os campos esperados).');
      return;
    }
    mostrarComparacaoImportacao(dadosImportados);
  };
  leitor.onerror = () => ME('e-imp','Não foi possível ler o arquivo. Tente novamente.');
  leitor.readAsText(arquivo, 'UTF-8');
}

function _contarColecoesTsr(d){
  return {
    'Contas Bancárias': (d.contas||[]).length,
    'Categorias': (d.categorias||[]).length,
    'Centros de Custo': (d.centrosCusto||[]).length,
    'Lançamentos': (d.lancamentos||[]).length,
    'Contas a Pagar': (d.contasPagar||[]).length,
    'Contas a Receber': (d.contasReceber||[]).length,
    'Fornecedores': (d.fornecedores||[]).length,
    'Clientes': (d.clientes||[]).length,
    'Cheques Emitidos': (d.chequesEmitidos||[]).length,
    'Investimentos': (d.investimentos||[]).length,
    'Previdências': (d.previdencias||[]).length,
    'Capitalizações': (d.capitalizacoes||[]).length,
    'Seguros': (d.seguros||[]).length,
    'Usuários': (d.usuarios||[]).length,
  };
}

function mostrarComparacaoImportacao(dadosImportados){
  const atual = _contarColecoesTsr(DB);
  const novo = _contarColecoesTsr(dadosImportados);
  const linhas = Object.keys(atual).map(k=>{
    const mudou = atual[k]!==novo[k];
    return `<tr>
      <td>${k}</td>
      <td style="text-align:center">${atual[k]}</td>
      <td style="text-align:center;font-weight:${mudou?'800':'400'};color:${mudou?'var(--acc)':'var(--txt)'}">${novo[k]}</td>
    </tr>`;
  }).join('');

  window._backupParaImportar = dadosImportados;

  AM('🔍 Conferir Antes de Importar', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Compare o que existe agora com o que está no arquivo escolhido:</div>
    <table><thead><tr><th>Coleção</th><th style="text-align:center">Atual no Sistema</th><th style="text-align:center">No Arquivo</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <div style="background:#da363322;border:1px solid var(--red);border-radius:8px;padding:10px 14px;margin-top:14px;font-size:12px;color:var(--red);font-weight:700">
      ⚠️ Ao confirmar, os dados atuais serão substituídos pelos do arquivo e isso será salvo no GitHub imediatamente.
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${B('✅ Confirmar Importação','confirmarImportacaoBackup()','#c0312b','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}

function confirmarImportacaoBackup(){
  const dados = window._backupParaImportar;
  if(!dados){ FM(); return; }
  CF('Tem certeza? Essa ação não pode ser desfeita pelo sistema (só restaurando outro backup depois).', async ()=>{
    delete window._backupParaImportar;
    FM();
    await ghSalvar(dados, true);
    setStatus('ok','✅ Backup importado e salvo no GitHub!');
    setTimeout(()=>{document.getElementById('status').style.display='none';},4000);
    renderAba();
  });
}

window.addEventListener('beforeunload', ev => {
  try{
    localStorage.setItem('tsr_bkp_fechamento', JSON.stringify(DB));
    localStorage.setItem('tsr_ultimo_bkp', new Date().toLocaleString('pt-BR'));
  }catch(e){}
  const fila = getFilaPendente();
  if(fila){
    if(isOnline()) ghSalvar(DB);
    ev.preventDefault();
    ev.returnValue = 'Há alterações pendentes de sincronização com o GitHub. Aguarde ou confirme para sair.';
    return ev.returnValue;
  }
});

setInterval(async()=>{ await backupGitHub(true); },6*60*60*1000);

function iniciarSincronizacaoAutomatica(){
  if(_intervaloSync) clearInterval(_intervaloSync);
  _intervaloSync = setInterval(verificarAtualizacaoRemota, 30000);
}
let _intervaloSync = null;

async function verificarAtualizacaoRemota(){
  if(_sincronizando || !getToken() || !isOnline()) return;
  try{
    const r = await fetch(GH_API, { headers:{ 'Authorization': `token ${getToken()}`, 'Accept': 'application/vnd.github.v3+json' } });
    if(!r.ok) return;
    const j = await r.json();
    const shaRemoto = j.sha;
    if(!_shaAtual){ _shaAtual = shaRemoto; _sha = shaRemoto; return; }
    if(shaRemoto === _shaAtual) return;
    if(shaRemoto !== _shaAtual){
      _shaAtual = shaRemoto; _sha = shaRemoto;
      setUltimoSha(shaRemoto);
      let novosDados;
      if(!j.content || j.content.trim() === ''){
        const r2 = await fetch(j.download_url);
        if(!r2.ok) return;
        novosDados = await r2.json();
      } else {
        novosDados = JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
      }
      try{ localStorage.setItem('tsr_bkp', JSON.stringify(novosDados)); }catch(e){}
      DB = novosDados;
      _relCacheVersion++;
      aplicarCadastrosUnicosNaDB();
      renderAba();
      setStatus('ok', '🔄 Dados atualizados de outro dispositivo');
      setTimeout(()=>{ document.getElementById('status').style.display='none'; }, 4000);
    }
  }catch(e){ }
}

// ══════════════════════════════════════════
// INIT / TOKEN
// ══════════════════════════════════════════
async function entrar(){
  const t = document.getElementById('inp-token').value.trim();
  if(!t) return;
  setToken(t);
  document.getElementById('tela-token').style.display='none';
  document.getElementById('tela-loading').style.display='flex';
  document.getElementById('load-msg').textContent='Conectando ao GitHub...';
  const dados = await ghCarregar();
  if(dados === null){
    localStorage.removeItem('tsr_gh_token');
    document.getElementById('tela-loading').style.display='none';
    document.getElementById('tela-token').style.display='flex';
    document.getElementById('err-token').style.display='block';
    return;
  }
  DB = dados;
  _relCacheVersion++;
  await seedInicial();
  const _sessao = localStorage.getItem('tsr_usu');
  if(_sessao){
    try{
      const s = JSON.parse(_sessao);
      const uAtivo = (DB.usuarios||[]).find(u=>u.id===s.id&&u.ativo!==false);
      if(uAtivo){ USUARIO_ATUAL=s; atualizarNavUsuario(); iniciarApp(); return; }
    }catch(e){}
    localStorage.removeItem('tsr_usu');
  }
  document.getElementById('tela-loading').style.display='none';
  mostrarTelaUsuario();
}

function iniciarApp(){
  document.getElementById('tela-loading').style.display='none';
  document.getElementById('navbar').style.display='flex';
  document.getElementById('main').style.display='block';
  document.getElementById('fab-buttons').style.display='flex';
  const btnBack = document.querySelector('.fab-back');
  if(btnBack) btnBack.style.display='none';
  initNav();
  renderAba();
  atualizarIndicadorConexao();
  iniciarSincronizacaoAutomatica();
  atualizarResumoCartoes(true).catch(()=>{});
  atualizarResumoChequeSys(true).then(()=>sincronizarCaixaChequeSys(true)).catch(()=>{});
}

(async function init(){
  if(!getToken()){
    document.getElementById('tela-loading').style.display='none';
    document.getElementById('tela-token').style.display='flex';
    if(!isOnline()){
      const el = document.getElementById('err-token');
      el.textContent = '📴 Sem internet. Conecte-se à internet na primeira vez para salvar o token.';
      el.style.display = 'block';
    }
    return;
  }

  // ── OFFLINE: carrega direto do cache local, sem tentar o GitHub (evita tela travada) ──
  if(!isOnline()){
    const bkp = localStorage.getItem('tsr_bkp');
    if(bkp){
      try{
        const dados = JSON.parse(bkp);
        if(dados){
          DB = dados;
          _relCacheVersion++;
          await seedInicial();
          const _sessaoOff = localStorage.getItem('tsr_usu');
          if(_sessaoOff){
            try{
              const s = JSON.parse(_sessaoOff);
              const uAtivo = (DB.usuarios||[]).find(u=>u.id===s.id&&u.ativo!==false);
              if(uAtivo){ USUARIO_ATUAL=s; atualizarNavUsuario(); iniciarApp(); return; }
            }catch(e){}
          }
          document.getElementById('tela-loading').style.display='none';
          mostrarTelaUsuario();
          return;
        }
      }catch(e){}
    }
    document.getElementById('tela-loading').style.display='none';
    document.getElementById('tela-token').style.display='flex';
    const el = document.getElementById('err-token');
    el.textContent = '📴 Sem internet e sem dados salvos neste dispositivo ainda. Conecte-se à internet para carregar o sistema pela primeira vez.';
    el.style.display = 'block';
    return;
  }

  document.getElementById('load-msg').textContent='Carregando dados...';
  const dados = await ghCarregar();
  if(dados === null){
    localStorage.removeItem('tsr_gh_token');
    document.getElementById('tela-loading').style.display='none';
    document.getElementById('tela-token').style.display='flex';
    document.getElementById('err-token').style.display='block';
    return;
  }
  DB = dados;
  _relCacheVersion++;
  await seedInicial();
  const _sessaoInit = localStorage.getItem('tsr_usu');
  if(_sessaoInit){
    try{
      const s = JSON.parse(_sessaoInit);
      const uAtivo = (DB.usuarios||[]).find(u=>u.id===s.id&&u.ativo!==false);
      if(uAtivo){ USUARIO_ATUAL=s; atualizarNavUsuario(); iniciarApp(); return; }
    }catch(e){}
    localStorage.removeItem('tsr_usu');
  }
  document.getElementById('tela-loading').style.display='none';
  mostrarTelaUsuario();
})();

// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
let ABA='dashboard';
let _historicoAbas = []; // pilha de "fotografias" do estado (aba + filtros ativos) — não só o nome da aba, pra "Voltar" desfazer também os cliques de "Ir para" dentro da mesma tela (Extrato), um de cada vez.
function snapshotEstadoAtual(){
  return { aba: ABA, relExtrato: {...RelExtrato}, frf: {...FRF}, rlt: {...RLT} };
}
function empilharHistorico(){
  _historicoAbas.push(snapshotEstadoAtual());
}
function irPara(id){
  if(id!==ABA) empilharHistorico();
  ABA=id; initNav(); renderAba();
  const btnBack = document.querySelector('.fab-back');
  if(btnBack) btnBack.style.display = (id==='dashboard')?'none':'flex';
}
function voltarPagina(){
  const anterior = _historicoAbas.pop();
  if(anterior){
    ABA = anterior.aba;
    RelExtrato = anterior.relExtrato;
    FRF = anterior.frf;
    RLT = anterior.rlt;
  } else {
    ABA = 'dashboard';
  }
  initNav(); renderAba();
  const btnBack = document.querySelector('.fab-back');
  if(btnBack) btnBack.style.display = (ABA==='dashboard')?'none':'flex';
}
function initNav(){
  const abasVis = [
    {id:'dashboard',    r:'📊 Dashboard'},
    {id:'contas',       r:'🏦 Contas'},
    {id:'lancamentos',  r:'📋 Lançamentos'},
    {id:'contaspagar',  r:'📤 Contas a Pagar'},
    {id:'contasreceber', r:'📥 Contas a Receber'},
    {id:'chequesemitidos', r:'✍️ Cheques Emitidos'},
    {id:'investimentos', r:'📈 Investimentos & Seguros'},
    {id:'relatorios',   r:'📊 Relatórios'},
    {id:'fechamento',   r:'📋 Fechamento Diário'},
    {id:'relatorio_flex', r:'🔍 Relatório de Filtragem'},
    {id:'patrimonio_evol', r:'📈 Patrimônio Evolução'},
    ...(temPerm('config') ? [{id:'cadastros',r:'🗂 Cadastros'}] : []),
  ];
  document.getElementById('tabs').innerHTML = abasVis.map(a=>
    `<button type="button" class="tab${a.id===ABA?' ativo':''}" onclick="irPara('${a.id}')">${a.r}</button>`).join('') +
    `<button type="button" onclick="abrirModalBackup()" title="Fazer backup dos dados" style="background:var(--grn);color:#fff;border:none;border-radius:var(--r);padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;margin-left:8px">💾 Backup</button>`;
}

function desconectar(){
  if(!confirm('Trocar token de acesso?')) return;
  USUARIO_ATUAL = null;
  localStorage.removeItem('tsr_usu');
  localStorage.removeItem('tsr_gh_token');
  document.getElementById('navbar').style.display='none';
  document.getElementById('main').style.display='none';
  document.getElementById('tela-usuario').style.display='none';
  document.getElementById('tela-token').style.display='flex';
}
function renderAba(){
  migrarDirecionamentosParaId();
  const m=document.getElementById('main');
  const mp={dashboard:htmlDashboard,contas:htmlContas,lancamentos:htmlLancamentos,contaspagar:htmlContasPagar,contasreceber:htmlContasReceber,chequesemitidos:htmlChequesEmitidos,investimentos:htmlInvestimentosSeguros,relatorios:htmlRelatorios,fechamento:htmlFechamentoDiario,relatorio_flex:htmlRelatorioFlex,patrimonio_evol:htmlPatrimonioEvolucao,cadastros:htmlCadastros};
  m.innerHTML=(mp[ABA]||htmlDashboard)();
}

// ══════════════════════════════════════════
// MODAL / ERRO / CONFIRM / HELPERS DE UI
// ══════════════════════════════════════════
const VERSAO = 'v1.79';
document.addEventListener('DOMContentLoaded', ()=>{
  ['nav-versao','load-versao','login-versao'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = VERSAO;
  });
  tornarArrastavel(document.querySelector('#ov .modal-head'), document.querySelector('#ov .modal'));
  tornarArrastavel(document.querySelector('#ov-cf .cf-drag'), document.querySelector('#ov-cf .card'));
  tornarArrastavel(document.querySelector('#ov-cal-dia .modal-head'), document.querySelector('#ov-cal-dia .modal'));
});
// ── Janelas arrastáveis (estilo Money): segura no cabeçalho e arrasta pra
// qualquer lugar da tela. Só ativa position:fixed no primeiro arraste — até
// lá a janela continua centralizada normalmente via flex do .overlay.
function tornarArrastavel(handle, alvo){
  if(!handle || !alvo) return;
  let arrastando=false, offX=0, offY=0;
  handle.style.cursor='move';
  handle.addEventListener('mousedown',(e)=>{
    if(e.target.closest('button')) return; // não arrasta ao clicar no X
    arrastando=true;
    const rect = alvo.getBoundingClientRect();
    offX = e.clientX-rect.left; offY = e.clientY-rect.top;
    alvo.style.position='fixed';
    alvo.style.left=rect.left+'px'; alvo.style.top=rect.top+'px';
    alvo.style.margin='0';
    e.preventDefault();
  });
  document.addEventListener('mousemove',(e)=>{
    if(!arrastando) return;
    const maxX = window.innerWidth - 40, maxY = window.innerHeight - 30;
    alvo.style.left = Math.min(Math.max(0,e.clientX-offX),maxX)+'px';
    alvo.style.top = Math.min(Math.max(0,e.clientY-offY),maxY)+'px';
  });
  document.addEventListener('mouseup',()=>{ arrastando=false; });
  // Suporte a toque (tablet/celular)
  handle.addEventListener('touchstart',(e)=>{
    if(e.target.closest('button')) return;
    const t = e.touches[0]; arrastando=true;
    const rect = alvo.getBoundingClientRect();
    offX = t.clientX-rect.left; offY = t.clientY-rect.top;
    alvo.style.position='fixed'; alvo.style.left=rect.left+'px'; alvo.style.top=rect.top+'px'; alvo.style.margin='0';
  },{passive:true});
  document.addEventListener('touchmove',(e)=>{
    if(!arrastando) return;
    const t = e.touches[0];
    alvo.style.left=(t.clientX-offX)+'px'; alvo.style.top=(t.clientY-offY)+'px';
  },{passive:true});
  document.addEventListener('touchend',()=>{ arrastando=false; });
}
function _resetPosicaoJanela(alvo){
  if(!alvo) return;
  alvo.style.position=''; alvo.style.left=''; alvo.style.top=''; alvo.style.margin='';
}
function AM(titulo,corpo){ document.getElementById('m-titulo').textContent=titulo; document.getElementById('m-corpo').innerHTML=corpo; document.getElementById('ov').classList.add('vis'); _resetPosicaoJanela(document.querySelector('#ov .modal')); }
function FM(){ document.getElementById('ov').classList.remove('vis'); }
let _cfCb=null;
function CF(msg,cb){ document.getElementById('cf-msg').textContent=msg; document.getElementById('ov-cf').classList.add('vis'); _cfCb=cb; document.getElementById('cf-sim').onclick=()=>{const fn=_cfCb; FCF(); if(fn)fn();}; _resetPosicaoJanela(document.querySelector('#ov-cf .card')); }
function FCF(){ document.getElementById('ov-cf').classList.remove('vis'); _cfCb=null; }
const TIP_ICONES = {
  '👁':'Ver detalhes', '🖨':'Imprimir', '🗑':'Excluir', '✏':'Editar', '✏️':'Editar',
  '✅':'Confirmar', '💾':'Salvar', '➕':'Adicionar', '📋':'Ver lista completa', '📊':'Dashboard', '◀':'Voltar', '💵':'Pagar',
};
function B(r,oc,cor,txt,p,tip){
  cor=cor||'var(--acc)'; txt=txt||'#000';
  const tipFinal = tip || TIP_ICONES[r.trim()] || '';
  const titleAttr = tipFinal ? ` title="${tipFinal}"` : '';
  return `<button type="button" onclick="${oc}"${titleAttr} style="background:${cor};color:${txt};padding:${p?'4px 10px':'8px 16px'};font-size:${p?'11':'12'}px;border:none;border-radius:var(--r);cursor:pointer;font-weight:700;font-family:inherit;margin:2px">${r}</button>`;
}
function T(t,tipo){ return `<span class="tag tag-${tipo||'cz'}">${esc(t)}</span>`; }
function C(l,inp,fx,mn){ return `<div class="campo" style="flex:${fx||'1'};min-width:${mn||120}px;margin-bottom:10px"><label>${l}</label>${inp}</div>`; }
function EH(id){ return `<div class="erro" id="${id}"><span id="${id}-m"></span><button type="button" onclick="document.getElementById('${id}').classList.remove('vis')" style="background:transparent;color:var(--red);font-size:14px;border:none;cursor:pointer">✕</button></div>`; }
function ME(id,msg){ const el=document.getElementById(id); if(!el)return; document.getElementById(id+'-m').textContent=msg; el.classList.add('vis'); el.scrollIntoView({behavior:'smooth',block:'nearest'}); }
function LE(id){ const el=document.getElementById(id); if(el)el.classList.remove('vis'); }

// ══════════════════════════════════════════
// HELPERS DE NEGÓCIO — SEMPRE CALCULAM A PARTIR DO DB VIVO
// ══════════════════════════════════════════
function contaById(id){ return (DB.contas||[]).find(c=>c.id===id); }
function categoriaById(id){ return (DB.categorias||[]).find(c=>c.id===id); }
// Nome completo hierárquico (ex: "Transporte: Combustível") — usado em selects e
// relatórios pra dar contexto de qual categoria-mãe uma subcategoria pertence,
// mesmo fora da árvore visual dos Cadastros.
function nomeCompletoCategoria(cat){
  if(!cat) return '-';
  if(!cat.parentId) return cat.nome;
  const pai = categoriaById(cat.parentId);
  return pai ? `${pai.nome}: ${cat.nome}` : cat.nome;
}
// Lista de categorias-mãe elegíveis (só categorias de nível principal, sem
// parentId) — limita a hierarquia a 2 níveis (mãe → subcategoria), igual ao
// Money. excluirId serve pra não deixar uma categoria virar mãe dela mesma
// ao editar.
function opcoesCategoriasPaiParaSelect(selId, excluirId){
  return (DB.categorias||[]).filter(c=>!c.parentId && c.id!==excluirId)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(c=>`<option value="${c.id}"${c.id===selId?' selected':''}>${esc(c.nome)} (${c.tipo==='receita'?'Receita':'Despesa'})</option>`).join('');
}
// Ao escolher uma categoria-mãe no formulário, tipo (receita/despesa) e PF/PJ
// passam a ser herdados dela automaticamente (uma subcategoria não pode ter um
// tipo diferente da mãe) — os campos ficam escondidos nesse caso.
function aoMudarCategoriaPai(prefix){
  const paiId = document.getElementById(prefix+'-pai')?.value||'';
  const wrap = document.getElementById(prefix+'-tipo-pfpj-wrap');
  if(paiId){
    const pai = categoriaById(paiId);
    if(pai){
      const selTipo = document.getElementById(prefix+'-tipo'); if(selTipo) selTipo.value = pai.tipo;
      const selPfpj = document.getElementById(prefix+'-pfpj'); if(selPfpj) selPfpj.value = pai.tipoPFPJ||'ambos';
    }
    if(wrap) wrap.style.display='none';
  } else {
    if(wrap) wrap.style.display='';
  }
}
function centroCustoById(id){ return (DB.centrosCusto||[]).find(c=>c.id===id); }
function nomeCompletoCentroCusto(cc){
  if(!cc) return '-';
  if(!cc.parentId) return cc.nome;
  const pai = centroCustoById(cc.parentId);
  return pai ? `${pai.nome}: ${cc.nome}` : cc.nome;
}
function opcoesCentroCustoPaiParaSelect(selId, excluirId){
  return (DB.centrosCusto||[]).filter(c=>!c.parentId && c.id!==excluirId)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(c=>`<option value="${c.id}"${c.id===selId?' selected':''}>${esc(c.nome)}</option>`).join('');
}
function aoMudarCentroCustoPai(prefix){
  const paiId = document.getElementById(prefix+'-pai')?.value||'';
  const wrap = document.getElementById(prefix+'-pfpj-wrap');
  if(paiId){
    const pai = centroCustoById(paiId);
    if(pai){
      const selPfpj = document.getElementById(prefix+'-pfpj'); if(selPfpj) selPfpj.value = pai.tipoPFPJ||'ambos';
    }
    if(wrap) wrap.style.display='none';
  } else {
    if(wrap) wrap.style.display='';
  }
}
function fornecedorById(id){ return (DB.fornecedores||[]).find(f=>f.id===id); }
function clienteById(id){ return (DB.clientes||[]).find(c=>c.id===id); }
function chequeById(id){ return (DB.chequesEmitidos||[]).find(c=>c.id===id); }
function categoriaPorNome(nome,tipo){ return (DB.categorias||[]).find(c=>c.nome===nome&&c.tipo===tipo); }
function nomeConta(c){ if(!c) return '-'; return `${c.titular} (${c.tipo})`; }
function diasEntreDatas(a,b){
  return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000);
}
// Detecta transferências entre as próprias contas de Fabio por PAREAMENTO real
// (mesmo valor, contas diferentes, até 2 dias de diferença) — muito mais confiável
// do que adivinhar pelo nome do favorecido, que pode coincidir com um cliente real.
function identificarTransferenciasInternas(lancamentos){
  const contaIds = new Set((DB.contas||[]).map(c=>c.id));
  const idsPareados = new Set();
  // Pareamento explícito: lançamentos criados pelo tipo "Transferência" já vêm
  // linkados por transferenciaId — não precisa adivinhar por valor/data.
  lancamentos.forEach(l=>{ if(l.origem==='transferencia' && l.transferenciaId) idsPareados.add(l.id); });
  const saidas = lancamentos.filter(l=>l.tipo==='saida' && contaIds.has(l.contaId) && !idsPareados.has(l.id));
  const entradas = lancamentos.filter(l=>l.tipo==='entrada' && contaIds.has(l.contaId) && !idsPareados.has(l.id));
  const usadas = new Set();
  // PERFORMANCE CRÍTICA (23/07/2026): antes, para CADA saída, percorria a
  // lista INTEIRA de entradas procurando um par (.find dentro de .forEach) —
  // com ~24 mil lançamentos isso virava centenas de milhões de comparações
  // e travava o navegador por vários segundos. Agora as entradas são
  // indexadas por valor (em centavos) uma única vez, e cada saída busca só
  // dentro do grupo de mesmo valor (poucos candidatos, não a lista toda).
  const entradasPorValor = new Map();
  entradas.forEach(e=>{
    const chave = Math.round(e.valor*100);
    if(!entradasPorValor.has(chave)) entradasPorValor.set(chave, []);
    entradasPorValor.get(chave).push(e);
  });
  saidas.forEach(s=>{
    const chave = Math.round(s.valor*100);
    const candidatos = entradasPorValor.get(chave);
    if(!candidatos) return;
    const cand = candidatos.find(e=>
      !usadas.has(e.id) && e.contaId!==s.contaId &&
      Math.abs(diasEntreDatas(s.data,e.data))<=2
    );
    if(cand){ usadas.add(cand.id); idsPareados.add(s.id); idsPareados.add(cand.id); }
  });
  // Sinal auxiliar: bate o nome com "fabio oliveira" mas não achou o par correspondente —
  // fica sinalizado à parte para revisão manual, não é contado automaticamente como transferência.
  const suspeitasSemPar = lancamentos.filter(l=>!idsPareados.has(l.id) && contaIds.has(l.contaId) && /fabio\s+oliveira/i.test(l.contraparte||''));
  return { idsPareados, suspeitasSemPar };
}
// ── Filtro global PF/PJ (definido no Dashboard, afeta as demais abas) ──
function contasFiltradasPFPJ(){
  return (DB.contas||[]).filter(c=>c.ativa!==false && (_filtroDashPFPJ==='todos'||c.tipo===_filtroDashPFPJ));
}
function contaTipoOk(contaId){
  if(_filtroDashPFPJ==='todos') return true;
  if(!contaId) return true; // sem conta definida ainda: aparece nas duas visões
  const c = contaById(contaId);
  return c ? c.tipo===_filtroDashPFPJ : true;
}
function barraFiltroPFPJGlobal(){
  if(_filtroDashPFPJ==='todos') return '';
  const cor = _filtroDashPFPJ==='PF' ? 'var(--blu)' : 'var(--pur)';
  const label = _filtroDashPFPJ==='PF' ? '👤 Somente PF' : '🏢 Somente PJ';
  return `<div style="background:${cor}22;border:1px solid ${cor};border-radius:8px;padding:8px 12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px">
    <span style="color:${cor};font-weight:700">${label} — filtro ativo em todo o sistema</span>
    <button type="button" onclick="mudarFiltroDashPFPJ('todos')" style="background:transparent;color:${cor};border:1px solid ${cor};border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Ver Tudo</button>
  </div>`;
}

// Validação de CPF/CNPJ por dígito verificador (algoritmo módulo 11) — mesmo rigor do ChequeSys
function validarCpfCnpj(doc){
  const v = String(doc||'').replace(/\D/g,'');
  if(!v) return true; // campo opcional — vazio é válido
  if(v.length===11) return validarCPF(v);
  if(v.length===14) return validarCNPJ(v);
  return false;
}
function validarCPF(v){
  if(/^(\d)\1{10}$/.test(v)) return false;
  let soma=0; for(let i=0;i<9;i++) soma+=Number(v[i])*(10-i);
  let dv1=(soma*10)%11; if(dv1===10) dv1=0;
  if(dv1!==Number(v[9])) return false;
  soma=0; for(let i=0;i<10;i++) soma+=Number(v[i])*(11-i);
  let dv2=(soma*10)%11; if(dv2===10) dv2=0;
  return dv2===Number(v[10]);
}
function validarCNPJ(v){
  if(/^(\d)\1{13}$/.test(v)) return false;
  const calc = (base) => {
    const pesos = base.length===12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let soma=0; for(let i=0;i<base.length;i++) soma+=Number(base[i])*pesos[i];
    const r = soma%11; return r<2?0:11-r;
  };
  const dv1 = calc(v.slice(0,12));
  if(dv1!==Number(v[12])) return false;
  const dv2 = calc(v.slice(0,13));
  return dv2===Number(v[13]);
}
function opcoesDatalist(lista){
  return lista.map(x=>`<option value="${esc(x.nome)}">`).join('');
}

function lancamentosDaConta(contaId){
  // PERFORMANCE (23/07/2026): removida a ordenação (.sort) que existia aqui —
  // ela rodava a cada chamada sobre os ~24 mil lançamentos, mas nenhum dos
  // dois lugares que usam esta função (saldoConta/saldoContaAteData) precisa
  // da ordem, só da soma. Como saldoConta() é chamada repetidas vezes em
  // cada render do Dashboard (uma vez por conta), essa ordenação inútil
  // era o que estava travando a página. Extrato de Conta tem lógica própria
  // de ordenação, não depende desta função.
  return (DB.lancamentos||[]).filter(l=>l.contaId===contaId);
}
function saldoConta(contaId){
  const c = contaById(contaId); if(!c) return 0;
  const movs = lancamentosDaConta(contaId);
  let saldo = Number(c.saldoInicial||0);
  movs.forEach(l=>{ if(l.status==='nulo') return; saldo += (l.tipo==='entrada'?1:-1)*Number(l.valor||0); });
  return saldo;
}
// Reconstrução histórica: saldo da conta como ele ERA no fim de uma data passada
// (mesmo princípio de "cálculo sempre ao vivo" usado no resto do sistema — nunca
// fica um valor histórico gravado à parte, sempre recalcula a partir dos lançamentos
// reais até aquela data).
function saldoContaAteData(contaId, dataLimite){
  const c = contaById(contaId); if(!c) return 0;
  const movs = lancamentosDaConta(contaId).filter(l=>l.data<=dataLimite);
  let saldo = Number(c.saldoInicial||0);
  movs.forEach(l=>{ if(l.status==='nulo') return; saldo += (l.tipo==='entrada'?1:-1)*Number(l.valor||0); });
  return saldo;
}
function saldoTotalGeralAteData(dataLimite){
  return (DB.contas||[]).filter(c=>c.ativa!==false).reduce((s,c)=>s+saldoContaAteData(c.id,dataLimite),0);
}
function saldoTotalPorTipo(tipo){
  return (DB.contas||[]).filter(c=>c.tipo===tipo&&c.ativa!==false).reduce((s,c)=>s+saldoConta(c.id),0);
}
function saldoTotalGeral(){
  return (DB.contas||[]).filter(c=>c.ativa!==false).reduce((s,c)=>s+saldoConta(c.id),0);
}
function contasPagarPendentes(){
  return (DB.contasPagar||[]).filter(cp=>cp.status==='pendente').sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
}
function contasPagarVencidas(){
  return contasPagarPendentes().filter(cp=>diffDias(cp.vencimento)<0);
}
function statusVisualContaPagar(cp){
  if(cp.status==='pago') return {label:'Pago',tag:'vd'};
  if(cp.status==='cancelado') return {label:'Cancelado',tag:'cz'};
  const d = diffDias(cp.vencimento);
  if(d<0) return {label:'Vencido',tag:'vm'};
  if(d<=3) return {label:'Vence em breve',tag:'am'};
  return {label:'Pendente',tag:'az'};
}

// ── Contas a Receber (espelho de Contas a Pagar) ──
function contasReceberPendentes(){
  return (DB.contasReceber||[]).filter(cr=>cr.status==='pendente').sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
}
function contasReceberVencidas(){
  return contasReceberPendentes().filter(cr=>diffDias(cr.vencimento)<0);
}
function statusVisualContaReceber(cr){
  if(cr.status==='recebido') return {label:'Recebido',tag:'vd'};
  if(cr.status==='cancelado') return {label:'Cancelado',tag:'cz'};
  const d = diffDias(cr.vencimento);
  if(d<0) return {label:'Vencido',tag:'vm'};
  if(d<=3) return {label:'Vence em breve',tag:'am'};
  return {label:'Pendente',tag:'az'};
}

// ── Cheques Emitidos (pela empresa, para pagar terceiros — diferente do ChequeSys) ──
function chequesDaConta(contaId){
  return (DB.chequesEmitidos||[]).filter(c=>c.contaId===contaId);
}
function chequesEmitidosPendentes(){
  return (DB.chequesEmitidos||[]).filter(c=>c.status==='emitido').sort((a,b)=>a.dataPrevista.localeCompare(b.dataPrevista));
}
function totalChequesPendentesPorConta(contaId){
  return chequesDaConta(contaId).filter(c=>c.status==='emitido').reduce((s,c)=>s+Number(c.valor||0),0);
}
function statusVisualCheque(c){
  if(c.status==='compensado') return {label:'Compensado',tag:'vd'};
  if(c.status==='devolvido') return {label:'Devolvido',tag:'vm'};
  if(c.status==='cancelado') return {label:'Cancelado',tag:'cz'};
  const d = diffDias(c.dataPrevista);
  if(d<0) return {label:'Aguardando (atrasado)',tag:'am'};
  return {label:'Emitido',tag:'az'};
}

// ── Investimentos e Previdência (ativos que acumulam posição/rendimento) ──
function investimentoById(id){ return (DB.investimentos||[]).find(i=>i.id===id); }
function previdenciaById(id){ return (DB.previdencias||[]).find(p=>p.id===id); }
function capitalizacaoById(id){ return (DB.capitalizacoes||[]).find(c=>c.id===id); }
function seguroById(id){ return (DB.seguros||[]).find(s=>s.id===id); }

function ganhoInvestimento(i){ return Number(i.valorAtual||0) + Number(i.valorResgatado||0) - Number(i.valorAplicado||0); }
function totalPatrimonioInvestido(){
  return (DB.investimentos||[]).filter(i=>i.status==='ativo').reduce((s,i)=>s+Number(i.valorAtual||0),0)
       + (DB.previdencias||[]).filter(p=>p.status==='ativo').reduce((s,p)=>s+Number(p.valorAtual||0),0);
}
function statusVisualSeguro(s){
  if(s.status==='cancelado') return {label:'Cancelado',tag:'cz'};
  const d = diffDias(s.vigenciaFim);
  if(d<0) return {label:'Vencido',tag:'vm'};
  if(d<=30) return {label:'Vence em breve',tag:'am'};
  return {label:'Ativo',tag:'vd'};
}
function segurosVencendoEm(dias){
  return (DB.seguros||[]).filter(s=>s.status!=='cancelado').filter(s=>{const d=diffDias(s.vigenciaFim); return d>=0&&d<=dias;});
}
function segurosVencidos(){
  return (DB.seguros||[]).filter(s=>s.status!=='cancelado').filter(s=>diffDias(s.vigenciaFim)<0);
}

// ══════════════════════════════════════════
// INTEGRAÇÃO — RESUMO DE CARTÕES (CartoesPF/PJ) — Sessão 4
// Leitura somente-leitura (nunca grava) direto do repositório Fabio9500/Cartoes.
// ══════════════════════════════════════════
function getTokenCartoesPF(){ return localStorage.getItem('tsr_cc_pf_token') || localStorage.getItem('cc_pf_gh_token') || ''; }
function getTokenCartoesPJ(){ return localStorage.getItem('tsr_cc_pj_token') || localStorage.getItem('cc_pj_gh_token') || ''; }
function setTokenCartoesPF(t){ localStorage.setItem('tsr_cc_pf_token', t); }
function setTokenCartoesPJ(t){ localStorage.setItem('tsr_cc_pj_token', t); }

let _resumoCartoes = null;
try{ const _cRaw = localStorage.getItem('tsr_resumo_cartoes'); if(_cRaw) _resumoCartoes = JSON.parse(_cRaw); }catch(e){}

async function buscarDadosCartao(arquivo, token){
  const url = `https://api.github.com/repos/Fabio9500/Cartoes/contents/${arquivo}`;
  const r = await fetch(url, { headers:{ 'Authorization':`token ${token}`, 'Accept':'application/vnd.github.v3+json' } });
  if(!r.ok) throw new Error('HTTP '+r.status);
  const j = await r.json();
  if(!j.content || j.content.trim()===''){
    const r2 = await fetch(j.download_url);
    if(!r2.ok) throw new Error('download falhou');
    return await r2.json();
  }
  return JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
}
function resumoFaturasDeDados(dados){
  const compras = dados.compras||[];
  const pagamentos = dados.pagamentos||{};
  const grupos = {};
  compras.forEach(c=>{
    const key = c.cartao+'|'+c.venc;
    if(!grupos[key]) grupos[key] = {cartao:c.cartao, venc:c.venc, total:0};
    grupos[key].total += Number(c.valorParcela||0);
  });
  const porDirecionamento = {};
  compras.forEach(c=>{
    const nome = c.direcionamento || '(sem direcionamento)';
    if(!porDirecionamento[nome]) porDirecionamento[nome] = {qtd:0, total:0};
    porDirecionamento[nome].qtd++;
    porDirecionamento[nome].total += Number(c.valorParcela||0);
  });
  let totalAberto = 0, proxima = null;
  const porCartao = {};
  const faturasAbertas = [];
  Object.values(grupos).forEach(g=>{
    const key = g.cartao+'|'+g.venc;
    if(pagamentos[key]) return;
    totalAberto += g.total;
    if(!proxima || g.venc<proxima.venc) proxima = g;
    if(!porCartao[g.cartao]) porCartao[g.cartao] = {aberto:0, proximaVenc:null};
    porCartao[g.cartao].aberto += g.total;
    if(!porCartao[g.cartao].proximaVenc || g.venc<porCartao[g.cartao].proximaVenc) porCartao[g.cartao].proximaVenc = g.venc;
    faturasAbertas.push({ cartao:g.cartao, venc:g.venc, total:g.total });
  });
  faturasAbertas.sort((a,b)=>a.venc.localeCompare(b.venc));
  return { totalAberto, proximaVenc: proxima?proxima.venc:null, proximoValor: proxima?proxima.total:0, porDirecionamento, porCartao, faturasAbertas };
}
async function atualizarResumoCartoes(silencioso){
  const tokenPF = getTokenCartoesPF(), tokenPJ = getTokenCartoesPJ();
  const resultado = { pf:null, pj:null, erroPf:null, erroPj:null, atualizadoEm:new Date().toISOString() };
  if(tokenPF){
    try{ resultado.pf = resumoFaturasDeDados(await buscarDadosCartao('dados.json', tokenPF)); }
    catch(e){ resultado.erroPf = 'Não foi possível conectar (verifique o token).'; }
  } else { resultado.erroPf = 'Token não configurado.'; }
  if(tokenPJ){
    try{ resultado.pj = resumoFaturasDeDados(await buscarDadosCartao('dados-pj.json', tokenPJ)); }
    catch(e){ resultado.erroPj = 'Não foi possível conectar (verifique o token).'; }
  } else { resultado.erroPj = 'Token não configurado.'; }
  _resumoCartoes = resultado;
  try{ localStorage.setItem('tsr_resumo_cartoes', JSON.stringify(resultado)); }catch(e){}
  if(!silencioso){ renderAba(); setStatus('ok','✅ Resumo de cartões atualizado'); setTimeout(()=>{document.getElementById('status').style.display='none';},3000); }
}
function configurarTokensCartoes(){
  AM('⚙ Integração com Cartões (PF/PJ)',`
    ${EH('e-tokcc')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Esses tokens permitem que o TesourariaSys <strong>leia</strong> (nunca altera) o resumo das faturas do CartoesPF e CartoesPJ.
      Se você já usa esses sistemas neste mesmo navegador, os tokens já devem estar preenchidos automaticamente abaixo.
    </div>
    ${C('Token GitHub — CartoesPF',`<input type="password" id="tok-cc-pf" value="${esc(getTokenCartoesPF())}" placeholder="github_pat_...">`)}
    ${C('Token GitHub — CartoesPJ',`<input type="password" id="tok-cc-pj" value="${esc(getTokenCartoesPJ())}" placeholder="github_pat_...">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar e Atualizar','salvarTokensCartoes()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarTokensCartoes(){
  setTokenCartoesPF(document.getElementById('tok-cc-pf').value.trim());
  setTokenCartoesPJ(document.getElementById('tok-cc-pj').value.trim());
  FM();
  atualizarResumoCartoes(false);
}
let _cartaoSelecionadoDash = null; // {tag:'pf'|'pj', cartao:'nome do cartão'}
function selecionarCartaoDash(tag, cartao){ _cartaoSelecionadoDash = {tag, cartao}; renderAba(); }
function voltarListaCartoesDash(){ _cartaoSelecionadoDash = null; renderAba(); }
function htmlResumoCartoesCard(filtro){
  filtro = filtro || 'todos';
  const r = _resumoCartoes;
  if(_dashSoTitulos){
    return `<div class="card kpi" style="margin-bottom:14px;cursor:pointer" onclick="alternarDashSoTitulos()">
      <div class="kpi-l">💳 Cartões de Crédito</div>
    </div>`;
  }
  const aberto = _kpiAberto==='cartoes';
  const linhaResumo = (label,dado,erro) => dado
    ? `<div>${label}: <strong>R$ ${fmt(dado.totalAberto)}</strong> em aberto${dado.proximaVenc?` · próxima fatura ${fmtD(dado.proximaVenc)} — R$ ${fmt(dado.proximoValor)}`:''}</div>`
    : `<div style="color:var(--mut)">${label}: ${esc(erro||'carregando...')}</div>`;

  // ── Nível 1: cartões agrupados, cada um com seu total em aberto (toque pra ver as faturas dele) ──
  const linhasCartoesResumo = (tag,tipoLower,dado)=>{
    if(!dado || !dado.porCartao) return '';
    return Object.entries(dado.porCartao).map(([nome,info])=>
      `<tr onclick="selecionarCartaoDash('${tipoLower}','${esc(nome).replace(/'/g,"\\'")}')" style="cursor:pointer" title="Ver faturas a vencer deste cartão">
        <td>${esc(nomeCartaoAmigavel(nome))} ${T(tag,tag==='PF'?'az':'pur')}</td>
        <td>${info.proximaVenc?fmtD(info.proximaVenc):'-'}</td>
        <td style="text-align:right;font-weight:700">R$ ${fmt(info.aberto)}</td>
      </tr>`
    ).join('');
  };
  const temCartoesPF = filtro!=='PJ' && r?.pf?.porCartao && Object.keys(r.pf.porCartao).length>0;
  const temCartoesPJ = filtro!=='PF' && r?.pj?.porCartao && Object.keys(r.pj.porCartao).length>0;
  const composicaoCartoesLista = `<table><thead><tr><th>Cartão</th><th>Próx. Vencimento</th><th style="text-align:right">Em Aberto</th></tr></thead><tbody>
    ${filtro!=='PJ' ? linhasCartoesResumo('PF','pf', r?.pf) : ''}
    ${filtro!=='PF' ? linhasCartoesResumo('PJ','pj', r?.pj) : ''}
    ${(!temCartoesPF && !temCartoesPJ) ? '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Nenhuma fatura em aberto (ou toque em 🔄 para carregar)</td></tr>' : ''}
  </tbody></table>
  <div style="font-size:11px;color:var(--mut);margin-top:8px">Toque num cartão para ver as faturas a vencer dele.</div>`;

  // ── Nível 2: faturas a vencer só do cartão selecionado ──
  const sel = _cartaoSelecionadoDash;
  let composicaoCartoesDetalhe = '';
  if(sel){
    const dado = sel.tag==='pf' ? r?.pf : r?.pj;
    const tagLabel = sel.tag==='pf' ? 'PF' : 'PJ';
    const faturasDoCartao = (dado?.faturasAbertas||[]).filter(f=>f.cartao===sel.cartao).sort((a,b)=>a.venc.localeCompare(b.venc));
    composicaoCartoesDetalhe = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        ${B('◀ Voltar aos cartões','voltarListaCartoesDash()','var(--sur)','var(--txt)',1)}
        <div style="font-weight:700;font-size:12px">${esc(nomeCartaoAmigavel(sel.cartao))} ${T(tagLabel,tagLabel==='PF'?'az':'pur')}</div>
      </div>
      <table><thead><tr><th>Vencimento</th><th style="text-align:right">Valor</th></tr></thead><tbody>
      ${faturasDoCartao.length ? faturasDoCartao.map(f=>
        `<tr onclick="abrirPagamentoFaturaCartao('${sel.tag}',${f.total})" style="cursor:pointer" title="Registrar pagamento desta fatura">
          <td>${fmtD(f.venc)}</td>
          <td style="text-align:right;font-weight:700">R$ ${fmt(f.total)}</td>
        </tr>`).join('')
        : '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Nenhuma fatura em aberto para este cartão</td></tr>'}
      </tbody></table>
      <div style="font-size:11px;color:var(--mut);margin-top:8px">Toque numa fatura para registrar o pagamento dela.</div>`;
  }
  const composicaoCartoes = sel ? composicaoCartoesDetalhe : composicaoCartoesLista;

  return `<div class="card" style="margin-bottom:14px">
    <div onclick="toggleKpi('cartoes')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">💳 Cartões de Crédito ${filtro==='todos'?'(CartoesPF/PJ)':filtro==='PF'?'(CartoesPF)':'(CartoesPJ)'}</div>
      <div onclick="event.stopPropagation()">
        ${B('⚙','configurarTokensCartoes()','var(--sur)','var(--txt)',1,'Configurar tokens')}
        ${B('🔄','atualizarResumoCartoes(false)','var(--sur)','var(--txt)',1,'Atualizar agora')}
        <span style="font-size:11px;color:var(--mut);cursor:pointer" onclick="toggleKpi('cartoes')">${aberto?'▲':'▼'}</span>
      </div>
    </div>
    <div style="font-size:13px;line-height:1.9;margin-bottom:8px">
      ${r && filtro!=='PJ' ? linhaResumo('PF',r.pf,r.erroPf) : (filtro!=='PJ' ? '<div style="color:var(--mut)">Toque em 🔄 para carregar o resumo pela primeira vez.</div>' : '')}
      ${r && filtro!=='PF' ? linhaResumo('PJ',r.pj,r.erroPj) : ''}
    </div>
    ${aberto ? `<div style="margin-top:6px;padding-top:10px;border-top:1px solid var(--bor)" onclick="event.stopPropagation()">${composicaoCartoes}</div>` : ''}
    ${BPerm('lancamentos','💳 Registrar Pagamento de Fatura','abrirPagamentoFaturaCartao()','var(--acc)')}
  </div>`;
}
function totalFaturasCartoesAberto(){
  if(!_resumoCartoes) return 0;
  return (_resumoCartoes.pf?.totalAberto||0) + (_resumoCartoes.pj?.totalAberto||0);
}
// Nomes amigáveis dos cartões conhecidos do CartõesPF/PJ — se um cartão novo for
// criado lá e não aparecer aqui, mostra a chave crua mesmo (não trava nada).
const NOMES_CARTOES = {
  bradesco1:'Bradesco BRA 01', bradesco10:'Bradesco BRA 10', bradesco20:'Bradesco BRA 20',
  santander:'Santander', picpay:'PicPay',
};
function nomeCartaoAmigavel(chave){ return NOMES_CARTOES[chave] || chave; }

// ══════════════════════════════════════════
// INTEGRAÇÃO — CONTAS DO CHEQUESYS (Sessão 5)
// Leitura somente-leitura (nunca grava) direto do repositório
// Fabio9500/chequesys — mesmo padrão da integração com CartoesPF/PJ acima.
// Objetivo: ver o saldo de TODAS as contas (TesourariaSys + ChequeSys)
// num lugar só, sem duplicar cadastro de conta em cada sistema.
// ══════════════════════════════════════════
function getTokenChequeSys(){ return localStorage.getItem('tsr_chq_token') || localStorage.getItem('chqsys_token') || ''; }
function setTokenChequeSys(t){ localStorage.setItem('tsr_chq_token', t); }

let _resumoChequeSys = null;
try{ const _qRaw = localStorage.getItem('tsr_resumo_chequesys'); if(_qRaw) _resumoChequeSys = JSON.parse(_qRaw); }catch(e){}

async function buscarDadosChequeSys(token){
  const url = `https://api.github.com/repos/Fabio9500/chequesys/contents/dados.json`;
  const r = await fetch(url, { headers:{ 'Authorization':`token ${token}`, 'Accept':'application/vnd.github.v3+json' } });
  if(!r.ok) throw new Error('HTTP '+r.status);
  const j = await r.json();
  if(!j.content || j.content.trim()===''){
    const r2 = await fetch(j.download_url);
    if(!r2.ok) throw new Error('download falhou');
    return await r2.json();
  }
  return JSON.parse(b64ParaTextoUtf8(j.content.replace(/\n/g,'')));
}
// O ChequeSys não guarda "saldo" pronto por conta — cada conta acumula
// entradas/saídas dentro de DB.caixa. Reconstruímos o saldo aqui do
// mesmo jeito que o próprio ChequeSys faz no relatório "Minhas Contas".
function resumoContasDeChequeSys(dados){
  const contas = dados.contas||[];
  const caixa = dados.caixa||[];
  const porConta = contas.map(ct=>{
    const movs = caixa.filter(l=>l.contaId===ct.id);
    const saldo = movs.reduce((s,l)=>s+(l.tipo==='entrada'?Number(l.valor||0):-Number(l.valor||0)),0);
    return {id:ct.id, nome:ct.nome||'(sem nome)', bancoNome:ct.bancoNome||'', saldo};
  });
  const total = porConta.reduce((s,c)=>s+c.saldo,0);
  return { contas: porConta, total };
}
// Carteira ativa por Emitente (cheques) e por Sacado (boletos) — mesma regra de "carteira atual" usada no próprio ChequeSys
function resumoPorPessoaChequeSys(dados){
  const emitentes = dados.emitentes||[];
  const sacados = dados.sacados||[];
  const cheques = (dados.cheques||[]).filter(c=>(c.status==='em_maos'||c.status==='devolvido'||c.status==='reapresentado')&&!c.caucao);
  const boletos = (dados.boletos||[]).filter(b=>(b.status==='em_carteira'||b.status==='enviado'||b.status==='devolvido'||b.status==='reapresentado')&&!b.caucao);
  const porEmitente = {};
  cheques.forEach(c=>{
    const em = emitentes.find(e=>e.id===c.emitenteId);
    const nome = em?em.nome:'(sem emitente)';
    if(!porEmitente[nome]) porEmitente[nome] = {qtd:0, total:0};
    porEmitente[nome].qtd++;
    porEmitente[nome].total += Number(c.bruto||0);
  });
  const porSacado = {};
  boletos.forEach(b=>{
    const nome = b.sacado || (sacados.find(s=>s.id===b.sacadoId)||{}).nome || '(sem sacado)';
    if(!porSacado[nome]) porSacado[nome] = {qtd:0, total:0};
    porSacado[nome].qtd++;
    porSacado[nome].total += Number(b.bruto||0);
  });
  return { porEmitente, porSacado };
}
// ══════════════════════════════════════════
// 🔔 ALERTAS — detecta mudanças importantes no ChequeSys a cada sincronização
// (por enquanto: cheque/boleto que passou a "devolvido") e registra no
// histórico do TesourariaSys, perguntando o que fazer em vez de decidir sozinho.
// ══════════════════════════════════════════
function detectarAlertasChequeSys(dados){
  let snapshot = {};
  try{ snapshot = JSON.parse(localStorage.getItem('tsr_snapshot_chequesys_status')||'{}'); }catch(e){}
  const novosAlertas = [];
  const emitentes = dados.emitentes||[], sacados = dados.sacados||[];
  const cicloTotal = x => (x.historicoDepositos?.length||0)+(x.historicoDevolucoes?.length||0)+(x.historicoReapresentacoes?.length||0)+(x.historicoEnvios?.length||0);
  (dados.cheques||[]).forEach(c=>{
    const statusAnterior = snapshot['chq_'+c.id];
    if(c.status==='devolvido' && statusAnterior && statusAnterior!=='devolvido'){
      const em = emitentes.find(e=>e.id===c.emitenteId);
      novosAlertas.push({
        id: uid(), tipo:'chequesys_devolvido', entidadeTipo:'cheque', entidadeId:c.id,
        numero: c.numero, pessoa: em?em.nome:'(emitente não identificado)', valor: Number(c.bruto||0),
        detectadoEm: new Date().toISOString(), status:'pendente', decisao:null,
      });
    }
    snapshot['chq_'+c.id] = c.status;
    const cicloAnterior = snapshot['chq_ciclo_'+c.id]||0;
    const cicloAtual = cicloTotal(c);
    if(cicloAtual>=3 && cicloAnterior<3){
      const em = emitentes.find(e=>e.id===c.emitenteId);
      novosAlertas.push({
        id: uid(), tipo:'chequesys_renovacao_recorrente', entidadeTipo:'cheque', entidadeId:c.id,
        numero: c.numero, pessoa: em?em.nome:'(emitente não identificado)', valor: Number(c.bruto||0), ciclos: cicloAtual,
        detectadoEm: new Date().toISOString(), status:'pendente', decisao:null,
      });
    }
    snapshot['chq_ciclo_'+c.id] = cicloAtual;
  });
  (dados.boletos||[]).forEach(b=>{
    const statusAnterior = snapshot['bol_'+b.id];
    if(b.status==='devolvido' && statusAnterior && statusAnterior!=='devolvido'){
      const sac = b.sacado || (sacados.find(s=>s.id===b.sacadoId)||{}).nome;
      novosAlertas.push({
        id: uid(), tipo:'chequesys_devolvido', entidadeTipo:'boleto', entidadeId:b.id,
        numero: b.numero||b.id, pessoa: sac||'(sacado não identificado)', valor: Number(b.bruto||0),
        detectadoEm: new Date().toISOString(), status:'pendente', decisao:null,
      });
    }
    snapshot['bol_'+b.id] = b.status;
    const cicloAnteriorB = snapshot['bol_ciclo_'+b.id]||0;
    const cicloAtualB = cicloTotal(b);
    if(cicloAtualB>=3 && cicloAnteriorB<3){
      const sac = b.sacado || (sacados.find(s=>s.id===b.sacadoId)||{}).nome;
      novosAlertas.push({
        id: uid(), tipo:'chequesys_renovacao_recorrente', entidadeTipo:'boleto', entidadeId:b.id,
        numero: b.numero||b.id, pessoa: sac||'(sacado não identificado)', valor: Number(b.bruto||0), ciclos: cicloAtualB,
        detectadoEm: new Date().toISOString(), status:'pendente', decisao:null,
      });
    }
    snapshot['bol_ciclo_'+b.id] = cicloAtualB;
  });
  try{ localStorage.setItem('tsr_snapshot_chequesys_status', JSON.stringify(snapshot)); }catch(e){}
  return novosAlertas;
}
async function processarNovosAlertas(novosAlertas){
  if(!novosAlertas.length) return;
  const dbAtualizado = {...DB, alertas:[...(DB.alertas||[]), ...novosAlertas]};
  await ghSalvar(dbAtualizado);
  mostrarPainelAlertas(true);
}
function alertasPendentes(){ return (DB.alertas||[]).filter(a=>a.status==='pendente'); }
// ── Regra 3: lançamentos duplicados (mesma conta+data+valor+tipo+contraparte) —
// verificação manual, útil depois de importar extratos, pra pegar erro de
// importação em dobro antes que vire um problema no saldo. ──
function verificarLancamentosDuplicados(){
  const grupos = {};
  (DB.lancamentos||[]).forEach(l=>{
    const chave = [l.contaId, l.data, l.valor, l.tipo, (l.contraparte||'').toLowerCase()].join('|');
    if(!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(l);
  });
  const duplicados = Object.values(grupos).filter(g=>g.length>1);
  if(!duplicados.length){
    AM('🔍 Verificar Lançamentos Duplicados', `<div style="font-size:13px;color:var(--mut)">Nenhum lançamento duplicado encontrado (mesma conta, data, valor, tipo e fornecedor/cliente).</div><div style="margin-top:14px">${B('Fechar','FM()','var(--sur)','var(--txt)')}</div>`);
    return;
  }
  const linhas = duplicados.map(g=>{
    const cta = contaById(g[0].contaId);
    return `<div class="card" style="margin-bottom:10px;border:1px solid #f0a500">
      <div style="font-weight:700;margin-bottom:6px">${g.length}x igual — ${esc(cta?cta.titular:'-')} · ${fmtD(g[0].data)} · R$ ${fmt(g[0].valor)} · ${esc(g[0].contraparte||'(sem contraparte)')}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${g.map((l,i)=>`<div style="font-size:11px;color:var(--mut);display:flex;justify-content:space-between;align-items:center">
          <span>${esc(l.descricao||'(sem descrição)')}</span>
          ${BPerm('excluir','🗑 Excluir esta','excluirLancamento(\''+l.id+'\')','var(--sur)','var(--red)',1)}
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
  AM('🔍 Lançamentos Duplicados Encontrados', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:12px">Encontrei ${duplicados.length} grupo(s) com lançamentos idênticos (mesma conta, data, valor, tipo e fornecedor/cliente). Confira se são erro de importação em dobro ou se são coincidências legítimas (ex: dois PIX iguais no mesmo dia) antes de excluir.</div>
    ${linhas}
    <div style="margin-top:14px">${B('Fechar','FM()','var(--sur)','var(--txt)')}</div>
  `);
}
function mostrarPainelAlertas(somenteSeHouverPendente){
  const pend = alertasPendentes();
  if(somenteSeHouverPendente && !pend.length) return;
  const resolvidos = (DB.alertas||[]).filter(a=>a.status==='resolvido').sort((a,b)=>b.detectadoEm.localeCompare(a.detectadoEm)).slice(0,15);
  const rotuloOpcao = {criar_receber:'Conta a Receber criada', so_marcar:'Marcado como resolvido', ignorar:'Ignorado', ver_chequesys:'Foi ver no ChequeSys'};
  const linhaAlerta = a => {
    const rotulo = a.entidadeTipo==='cheque' ? 'Cheque' : 'Boleto';
    if(a.tipo==='chequesys_renovacao_recorrente'){
      return `<div class="card" style="margin-bottom:10px;border:1px solid #f0a500">
        <div style="font-weight:700;margin-bottom:6px">🔄 ${rotulo} renovado ${a.ciclos}x — ${esc(a.pessoa)}</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Nº ${esc(a.numero)} · R$ ${fmt(a.valor)} · pode indicar inadimplência recorrente deste ${a.entidadeTipo==='cheque'?'emitente':'sacado'} — vale revisar o limite de risco.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${B('👁 Ver no ChequeSys','resolverAlerta(\''+a.id+'\',\'ver_chequesys\')','var(--sur)','var(--txt)')}
          ${B('✅ Já estou de olho, só marcar como visto','resolverAlerta(\''+a.id+'\',\'so_marcar\')','var(--sur)','var(--txt)')}
          ${B('⏭ Ignorar por enquanto','resolverAlerta(\''+a.id+'\',\'ignorar\')','var(--sur)','var(--mut)')}
        </div>
      </div>`;
    }
    return `<div class="card" style="margin-bottom:10px;border:1px solid var(--red)">
      <div style="font-weight:700;margin-bottom:6px">⚠️ ${rotulo} devolvido — ${esc(a.pessoa)}</div>
      <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Nº ${esc(a.numero)} · R$ ${fmt(a.valor)} · detectado ${new Date(a.detectadoEm).toLocaleString('pt-BR')}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${B('➕ Criar Conta a Receber de cobrança','resolverAlerta(\''+a.id+'\',\'criar_receber\')','var(--acc)','#000')}
        ${B('✅ Já resolvido, só marcar como visto','resolverAlerta(\''+a.id+'\',\'so_marcar\')','var(--sur)','var(--txt)')}
        ${B('⏭ Ignorar por enquanto','resolverAlerta(\''+a.id+'\',\'ignorar\')','var(--sur)','var(--mut)')}
      </div>
    </div>`;
  };
  const linhaHistorico = a => {
    const rotulo = a.entidadeTipo==='cheque' ? 'Cheque' : 'Boleto';
    const desc = a.tipo==='chequesys_renovacao_recorrente' ? `${rotulo} nº ${esc(a.numero)} — ${esc(a.pessoa)} (renovado ${a.ciclos}x)` : `${rotulo} nº ${esc(a.numero)} — ${esc(a.pessoa)} (devolvido)`;
    return `<tr><td>${new Date(a.detectadoEm).toLocaleDateString('pt-BR')}</td><td>${desc}</td><td style="text-align:right">R$ ${fmt(a.valor)}</td><td>${rotuloOpcao[a.decisao?.opcao]||'-'}</td></tr>`;
  };
  AM('🔔 Alertas do ChequeSys', `
    ${pend.length
      ? `<div style="font-size:12px;color:var(--mut);margin-bottom:12px">${pend.length} item(ns) precisam da sua decisão:</div>${pend.map(linhaAlerta).join('')}`
      : `<div style="font-size:13px;color:var(--mut);margin-bottom:14px">Nenhum alerta pendente no momento.</div>`}
    ${resolvidos.length ? `
    <div style="margin-top:${pend.length?'18px':'0'};padding-top:14px;border-top:1px solid var(--bor)">
      <div style="font-weight:700;margin-bottom:8px">Histórico de decisões recentes</div>
      <table><thead><tr><th>Data</th><th>Título</th><th style="text-align:right">Valor</th><th>Decisão</th></tr></thead><tbody>${resolvidos.map(linhaHistorico).join('')}</tbody></table>
    </div>` : ''}
    <div style="margin-top:14px">${B('📋 Ver Regras Ativas','FM();mostrarRegrasAtivas()','var(--sur)','var(--txt)')}${B('Fechar','FM()','var(--sur)','var(--txt)')}</div>
  `);
}
function resolverAlerta(id, opcao){
  const a = (DB.alertas||[]).find(x=>x.id===id); if(!a) return;
  if(opcao==='criar_receber'){
    FM();
    novaContaReceber();
    setTimeout(()=>{
      const cliEl = document.getElementById('cr-cli'); if(cliEl) cliEl.value = a.pessoa;
      const valEl = document.getElementById('cr-valor'); if(valEl) valEl.value = fmt(a.valor);
      const obsEl = document.getElementById('cr-obs'); if(obsEl) obsEl.value = `Cobrança referente a ${a.entidadeTipo} devolvido nº ${a.numero} (ChequeSys)`;
    }, 100);
  }
  if(opcao==='ver_chequesys'){
    window.open('https://fabio9500.github.io/chequesys/chequesys.html','tsr_janela_chequesys');
  }
  const patch = { status:'resolvido', decisao:{ opcao, data:new Date().toISOString() } };
  salvar({...DB, alertas:(DB.alertas||[]).map(x=>x.id===id?{...x,...patch}:x)});
  if(opcao!=='criar_receber'){ mostrarPainelAlertas(true); if(!alertasPendentes().length) FM(); }
}
// ── Painel informativo com as regras ativas, em linguagem simples — serve de
// referência rápida quando formos revisar/criar regras novas juntos. ──
function mostrarRegrasAtivas(){
  AM('📋 Regras Ativas de Alerta', `
    <div style="font-size:13px;line-height:1.7">
      <div style="font-weight:700;margin-bottom:4px">1. Título devolvido</div>
      <div style="color:var(--mut);margin-bottom:12px">Quando um cheque ou boleto do ChequeSys muda de status para "devolvido", pergunta se quer criar uma Conta a Receber de cobrança.</div>
      <div style="font-weight:700;margin-bottom:4px">2. Renovação recorrente</div>
      <div style="color:var(--mut);margin-bottom:12px">Quando um título já foi depositado/devolvido/reapresentado 3 vezes ou mais, avisa que pode ser um padrão de inadimplência daquele emitente/sacado.</div>
      <div style="font-weight:700;margin-bottom:4px">3. Lançamentos duplicados</div>
      <div style="color:var(--mut);margin-bottom:12px">Verificação manual (botão na tela de Backup) — procura lançamentos idênticos (mesma conta, data, valor, tipo, fornecedor/cliente), útil depois de importar extratos.</div>
      <div style="font-size:11px;color:var(--mut);border-top:1px solid var(--bor);padding-top:10px;margin-top:6px">
        Novas regras vão sendo criadas conforme a gente for identificando padrões nas conversas — não existe um jeito automático de "pedir novas regras" pelo próprio app ainda (isso exigiria conectar uma IA de verdade, algo que decidimos deixar pra depois). Por enquanto, sempre que quiser revisar ou pedir uma regra nova, é só me chamar no chat.
      </div>
    </div>
    <div style="margin-top:14px">${B('Fechar','FM()','var(--sur)','var(--txt)')}</div>
  `);
}
async function atualizarResumoChequeSys(silencioso){
  const token = getTokenChequeSys();
  const resultado = { contas:[], total:0, porEmitente:{}, porSacado:{}, erro:null, atualizadoEm:new Date().toISOString() };
  if(token){
    try{
      const dados = await buscarDadosChequeSys(token);
      const r = resumoContasDeChequeSys(dados);
      resultado.contas = r.contas; resultado.total = r.total;
      const p = resumoPorPessoaChequeSys(dados);
      resultado.porEmitente = p.porEmitente; resultado.porSacado = p.porSacado;
      const novosAlertas = detectarAlertasChequeSys(dados);
      if(novosAlertas.length) await processarNovosAlertas(novosAlertas);
    }catch(e){ resultado.erro = 'Não foi possível conectar (verifique o token).'; }
  } else { resultado.erro = 'Token não configurado.'; }
  _resumoChequeSys = resultado;
  try{ localStorage.setItem('tsr_resumo_chequesys', JSON.stringify(resultado)); }catch(e){}
  if(!silencioso){ renderAba(); setStatus('ok','✅ Resumo do ChequeSys atualizado'); setTimeout(()=>{document.getElementById('status').style.display='none';},3000); }
}
function configurarTokenChequeSys(){
  AM('⚙ Integração com ChequeSys',`
    ${EH('e-tokchq')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Esse token permite que o TesourariaSys <strong>leia</strong> (nunca altera) o saldo das "Minhas Contas" do ChequeSys.
      Se você já usa o ChequeSys neste mesmo navegador, o token já deve estar preenchido automaticamente abaixo.
    </div>
    ${C('Token GitHub — ChequeSys',`<input type="password" id="tok-chq" value="${esc(getTokenChequeSys())}" placeholder="github_pat_...">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar e Atualizar','salvarTokenChequeSys()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarTokenChequeSys(){
  setTokenChequeSys(document.getElementById('tok-chq').value.trim());
  FM();
  atualizarResumoChequeSys(false).then(()=>sincronizarCaixaChequeSys(true));
}

// ══════════════════════════════════════════
// 🔗 SINCRONIZAÇÃO DE CAIXA — ChequeSys → TesourariaSys (só nesse sentido;
// o TesourariaSys nunca escreve no dados.json do ChequeSys).
// Cada conta do ChequeSys pode ser "mapeada" para uma conta real do
// TesourariaSys; a partir daí, todo lançamento de DB.caixa daquela conta
// vira um lançamento de verdade aqui (criado/editado/removido em espelho).
// Lançamentos do ChequeSys sem conta definida caem na "conta padrão".
// Contas do ChequeSys SEM mapeamento continuam só no resumo somente-leitura
// (linhasContasChequeSys/totalSaldoChequeSys), como já era antes.
// ══════════════════════════════════════════
function categoriaOperacaoChequeSys(tipoLancamento){
  return categoriaPorNome('Operação ChequeSys', tipoLancamento==='entrada'?'receita':'despesa');
}
// Monta o link que abre o ChequeSys já direto na tela de edição do cheque/boleto
// de origem de um lançamento sincronizado — usa os campos chequeId/boletoId
// gravados pela sincronização (ver sincronizarCaixaChequeSys).
function linkEdicaoChequeSys(l){
  if(l.chequeId) return 'https://fabio9500.github.io/chequesys/chequesys.html?editarCheque='+encodeURIComponent(l.chequeId);
  if(l.boletoId) return 'https://fabio9500.github.io/chequesys/chequesys.html?editarBoleto='+encodeURIComponent(l.boletoId);
  return null;
}
function abrirMapeamentoChequeSys(){
  if(!_resumoChequeSys || _resumoChequeSys.erro){
    AM('🔗 Sincronizar Caixa do ChequeSys',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Configure e atualize primeiro o token do ChequeSys (botão ⚙ ao lado do resumo) antes de mapear as contas.
      </div>
      <div style="margin-top:14px">${B('Entendi','FM()','var(--sur)','var(--txt)')}</div>
    `);
    return;
  }
  const integ = DB.integracaoChequeSys||{mapaContas:{},contaPadrao:null,sincronizados:{}};
  const contasChq = _resumoChequeSys.contas||[];
  const linhas = contasChq.map(c=>`
    <div class="row" style="align-items:center">
      ${C(`${esc(c.nome)}${c.bancoNome?' — '+esc(c.bancoNome):''}`,`<select id="map-chq-${c.id}"><option value="">— não sincronizar —</option>${opcoesContas(integ.mapaContas[c.id]||'')}</select>`)}
    </div>
  `).join('');
  AM('🔗 Sincronizar Caixa do ChequeSys',`
    ${EH('e-map-chq')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Para cada conta do ChequeSys, escolha a conta do TesourariaSys que vai receber os lançamentos de caixa automaticamente.
      Deixe em branco pra não sincronizar aquela conta (ela continua aparecendo só como resumo, do jeito que já era).
    </div>
    ${linhas}
    <div style="margin:10px 0">
      ${C('Lançamentos sem conta definida no ChequeSys ("Dinheiro/Outros")',`<select id="map-chq-padrao"><option value="">— ignorar —</option>${opcoesContas(integ.contaPadrao||'')}</select>`)}
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar Mapeamento','salvarMapeamentoChequeSys()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarMapeamentoChequeSys(){
  const contasChq = _resumoChequeSys?.contas||[];
  const mapaContas = {};
  contasChq.forEach(c=>{
    const v = document.getElementById(`map-chq-${c.id}`).value;
    if(v) mapaContas[c.id] = v;
  });
  const contaPadrao = document.getElementById('map-chq-padrao').value || null;
  const integ = DB.integracaoChequeSys||{sincronizados:{}};
  salvar({...DB, integracaoChequeSys:{...integ, mapaContas, contaPadrao}});
  FM();
  sincronizarCaixaChequeSys(false);
}
async function sincronizarCaixaChequeSys(silencioso){
  const token = getTokenChequeSys();
  const integ = DB.integracaoChequeSys||{mapaContas:{},contaPadrao:null,sincronizados:{}};
  const mapaContas = integ.mapaContas||{};
  if(!token || (!Object.keys(mapaContas).length && !integ.contaPadrao)) return;
  if(!isOnline()) return;
  let dados;
  try{ dados = await buscarDadosChequeSys(token); }
  catch(e){ if(!silencioso){ setStatus('err','⚠ Não foi possível sincronizar com o ChequeSys'); setTimeout(()=>{document.getElementById('status').style.display='none';},4000); } return; }

  // Entradas do caixa do ChequeSys marcadas naoSincronizar:true são saldo em
  // TRÂNSITO dentro do próprio ChequeSys (depósito aguardando compensar/devolver,
  // ou o débito que zera essa mesma conta na hora da compensação/devolução) —
  // não representam dinheiro liquidado ainda, então não entram aqui. O crédito
  // de verdade na Tesouraria só acontece via eventosLiquidacaoTesouraria (abaixo),
  // gerado pelo ChequeSys no momento da COMPENSAÇÃO.
  const caixa = (dados.caixa||[]).filter(l=>!l.naoSincronizar);
  const eventosLiq = dados.eventosLiquidacaoTesouraria||[];
  // Nome dos clientes do ChequeSys, pra trazer como contraparte do lançamento espelhado
  const clientesChq = {};
  (dados.clientes||[]).forEach(cl=>{ clientesChq[cl.id] = cl.nome||''; });
  // Emitentes (cheques) e cheques/boletos do ChequeSys, pra identificar número do
  // título + emitente/sacado direto no lançamento espelhado — em vez de depender
  // só do texto livre da descrição (que nem sempre traz isso de forma clara/completa).
  const emitentesChq = {};
  (dados.emitentes||[]).forEach(e=>{ emitentesChq[e.id] = e.razaoSocial||e.nome||''; });
  const chequesChq = {};
  (dados.cheques||[]).forEach(c=>{ chequesChq[c.id] = c; });
  const boletosChq = {};
  (dados.boletos||[]).forEach(b=>{ boletosChq[b.id] = b; });
  // Rótulo da categoria específica do ChequeSys (mesmo mapa usado na aba Caixa/Minhas Contas de lá),
  // pra não jogar tudo achatado num "Outros" genérico do lado do TesourariaSys
  const CATS_CHQ = {desconto_cheque:'Desc. Cheque',emprestimo:'Empréstimo',recebimento_cheque:'Receb. Cheque',recebimento_emprestimo:'Receb. Empréstimo',recebimento_boleto:'Receb. Boleto',outros:'Outros'};
  const sincronizados = {...(integ.sincronizados||{})};
  let lancamentos = [...(DB.lancamentos||[])];
  let mudou = false;
  const destinoConta = (contaId) => contaId ? (mapaContas[contaId]||null) : (integ.contaPadrao||null);

  const idsAtuais = new Set();
  for(const chq of caixa){
    const contaDestino = destinoConta(chq.contaId);
    if(!contaDestino) continue;
    idsAtuais.add(chq.id);
    const contraparte = clientesChq[chq.clienteId] || '';
    const rotuloCat = CATS_CHQ[chq.cat] || chq.cat || '';

    // Identificação do título (número + emitente/sacado), quando o lançamento
    // vier de um cheque ou boleto específico
    let identificacao = '';
    if(chq.chequeId && chequesChq[chq.chequeId]){
      const c = chequesChq[chq.chequeId];
      const nomeEmitente = emitentesChq[c.emitenteId] || '';
      identificacao = `Cheque nº ${c.numero||'-'}${nomeEmitente?' — Emitente: '+nomeEmitente:''}`;
    } else if(chq.boletoId && boletosChq[chq.boletoId]){
      const b = boletosChq[chq.boletoId];
      identificacao = `Boleto nº ${b.numero||'-'}${b.sacado?' — Sacado: '+b.sacado:''}`;
    }

    const descricao = `[ChequeSys${rotuloCat?' — '+rotuloCat:''}]${identificacao?' '+identificacao+' —':''} ${chq.desc||''}`.trim();
    const fingerprint = `${chq.tipo}|${chq.valor}|${chq.data}|${chq.desc||''}|${contaDestino}|${contraparte}|${chq.cat||''}|${identificacao}|${chq.chequeId||''}|${chq.boletoId||''}`;
    const reg = sincronizados[chq.id];
    if(!reg){
      const cat = categoriaOperacaoChequeSys(chq.tipo);
      const novo = {
        id:uid(), contaId:contaDestino, data:chq.data, tipo:chq.tipo, valor:Number(chq.valor||0),
        categoriaId: cat?cat.id:'', centroCustoId:'', contraparte,
        descricao, origem:'chequesys', origemId:chq.id,
        chequeId: chq.chequeId||null, boletoId: chq.boletoId||null,
        contaPagarId:null, criadoEm:new Date().toISOString()
      };
      lancamentos.push(novo);
      sincronizados[chq.id] = {lancId:novo.id, fingerprint, ausenteDesde:null};
      mudou = true;
    } else if(reg.fingerprint !== fingerprint){
      lancamentos = lancamentos.map(l=> l.id===reg.lancId ? {...l, contaId:contaDestino, data:chq.data, tipo:chq.tipo, valor:Number(chq.valor||0), contraparte, descricao, chequeId:chq.chequeId||null, boletoId:chq.boletoId||null} : l);
      sincronizados[chq.id] = {...reg, fingerprint, ausenteDesde:null};
      mudou = true;
    } else if(reg.ausenteDesde){
      sincronizados[chq.id] = {...reg, ausenteDesde:null};
      mudou = true;
    }
  }

  // ═══ EVENTOS DE LIQUIDAÇÃO (novo modelo de saldo em trânsito) ═══
  // Cada evento representa uma COMPENSAÇÃO de cheque no ChequeSys — é o momento
  // em que o dinheiro realmente liquida e deve virar crédito de verdade aqui na
  // Tesouraria (diferente do depósito, que fica só como trânsito interno do
  // ChequeSys). Usa o mesmo mapa "sincronizados", com chave prefixada "evt_" pra
  // nunca colidir com um id de lançamento de caixa do ChequeSys.
  for(const ev of eventosLiq){
    const contaDestino = destinoConta(ev.contaId);
    if(!contaDestino) continue;
    const chaveEv = 'evt_'+ev.id;
    idsAtuais.add(chaveEv);
    const contraparte = clientesChq[ev.clienteId] || '';
    let identificacao = '';
    if(ev.chequeId && chequesChq[ev.chequeId]){
      const c = chequesChq[ev.chequeId];
      const nomeEmitente = emitentesChq[c.emitenteId] || '';
      identificacao = `Cheque nº ${c.numero||'-'}${nomeEmitente?' — Emitente: '+nomeEmitente:''}`;
    }
    const descricao = `[ChequeSys — Compensação]${identificacao?' '+identificacao+' —':''} ${ev.desc||''}`.trim();
    const fingerprint = `entrada|${ev.valor}|${ev.data}|${ev.desc||''}|${contaDestino}|${contraparte}|compensacao|${identificacao}|${ev.chequeId||''}|`;
    const reg = sincronizados[chaveEv];
    if(!reg){
      const cat = categoriaOperacaoChequeSys('entrada');
      const novo = {
        id:uid(), contaId:contaDestino, data:ev.data, tipo:'entrada', valor:Number(ev.valor||0),
        categoriaId: cat?cat.id:'', centroCustoId:'', contraparte,
        descricao, origem:'chequesys', origemId:chaveEv,
        chequeId: ev.chequeId||null, boletoId: null,
        contaPagarId:null, criadoEm:new Date().toISOString()
      };
      lancamentos.push(novo);
      sincronizados[chaveEv] = {lancId:novo.id, fingerprint, ausenteDesde:null};
      mudou = true;
    } else if(reg.fingerprint !== fingerprint){
      lancamentos = lancamentos.map(l=> l.id===reg.lancId ? {...l, contaId:contaDestino, data:ev.data, tipo:'entrada', valor:Number(ev.valor||0), contraparte, descricao, chequeId:ev.chequeId||null} : l);
      sincronizados[chaveEv] = {...reg, fingerprint, ausenteDesde:null};
      mudou = true;
    } else if(reg.ausenteDesde){
      sincronizados[chaveEv] = {...reg, ausenteDesde:null};
      mudou = true;
    }
  }

  // Exclusão de lançamento espelhado: NUNCA na primeira leitura em que o registro
  // não aparece mais no ChequeSys. Uma leitura isolada pode vir incompleta
  // (instabilidade da API do GitHub, ou o ChequeSys ainda não terminou de gravar a
  // última ação na fila offline dele). Só exclui de fato se continuar ausente na
  // sincronização SEGUINTE também — aí sim é exclusão real na origem, não instabilidade.
  for(const chave of Object.keys(sincronizados)){
    if(!idsAtuais.has(chave)){
      const reg = sincronizados[chave];
      if(reg.ausenteDesde){
        lancamentos = lancamentos.filter(l=>l.id!==reg.lancId);
        delete sincronizados[chave];
        mudou = true;
      } else {
        sincronizados[chave] = {...reg, ausenteDesde:new Date().toISOString()};
        mudou = true;
      }
    }
  }
  if(mudou){
    salvar({...DB, lancamentos, integracaoChequeSys:{...integ, sincronizados}});
    if(!silencioso){ setStatus('ok','✅ Caixa do ChequeSys sincronizado'); setTimeout(()=>{document.getElementById('status').style.display='none';},3000); }
  } else if(!silencioso){
    setStatus('ok','✅ Já estava tudo sincronizado');
    setTimeout(()=>{document.getElementById('status').style.display='none';},3000);
  }
}
function totalSaldoChequeSys(){
  const mapa = DB.integracaoChequeSys?.mapaContas||{};
  return (_resumoChequeSys?.contas||[]).filter(c=>!mapa[c.id]).reduce((s,c)=>s+c.saldo,0);
}
// Linhas de conta do ChequeSys, no mesmo formato usado nas tabelas de
// "Saldo por Conta" do Dashboard e Relatórios — pra aparecerem juntas.
// Só mostra contas AINDA NÃO mapeadas: as mapeadas já têm lançamentos
// de verdade sincronizados dentro de uma conta real do TesourariaSys,
// então aparecem na tabela normal de contas — mostrar aqui também
// duplicaria o saldo.
function linhasContasChequeSys(){
  const mapa = DB.integracaoChequeSys?.mapaContas||{};
  const naoMapeadas = (_resumoChequeSys?.contas||[]).filter(c=>!mapa[c.id]);
  if(!naoMapeadas.length) return '';
  return naoMapeadas.map(c=>`<tr>
    <td>${esc(c.nome)} ${T('ChequeSys','pur')}</td>
    <td>${esc(c.bancoNome||'-')}</td>
    <td style="text-align:right;font-weight:700;color:${c.saldo<0?'var(--red)':'var(--txt)'}">R$ ${fmt(c.saldo)}</td>
  </tr>`).join('');
}

// ── Registro de Pagamento de Fatura de Cartão (apenas lança a saída — NUNCA sincroniza de volta com CartoesPF/PJ) ──
function abrirPagamentoFaturaCartao(tipoPre, valorPre){
  const r = _resumoCartoes;
  const sugestaoPF = valorPre!==undefined && tipoPre==='pf' ? valorPre : (r?.pf?.totalAberto||0);
  const sugestaoPJ = valorPre!==undefined && tipoPre==='pj' ? valorPre : (r?.pj?.totalAberto||0);
  const tipoInicial = tipoPre || 'pf';
  const sugestaoInicial = tipoInicial==='pf' ? sugestaoPF : sugestaoPJ;
  AM('💳 Registrar Pagamento de Fatura de Cartão',`
    ${EH('e-pagcc')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px;line-height:1.5">
      Isso lança a saída no seu extrato bancário do TesourariaSys. <strong>Não altera nada no CartoesPF/PJ</strong> — continue fechando a fatura por lá normalmente.
    </div>
    <div class="row">
      ${C('Cartão *',`<select id="pagcc-tipo" onchange="atualizarSugestaoPagamentoCC()">
        <option value="pf"${tipoInicial==='pf'?' selected':''}>CartoesPF${sugestaoPF?' — sugestão R$ '+fmt(sugestaoPF):''}</option>
        <option value="pj"${tipoInicial==='pj'?' selected':''}>CartoesPJ${sugestaoPJ?' — sugestão R$ '+fmt(sugestaoPJ):''}</option>
      </select>`,'1','220')}
      ${C('Conta de Pagamento *',`<select id="pagcc-conta">${opcoesContas()}</select>`,'1','200')}
    </div>
    <div class="row">
      ${C('Valor (R$) *',`<input id="pagcc-valor" value="${sugestaoInicial?fmt(sugestaoInicial):''}" placeholder="0,00">`,'1','160')}
      ${C('Data do Pagamento *',`<input type="date" id="pagcc-data" value="${hoje()}">`,'1','150')}
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Pagamento','confirmarPagamentoFaturaCartao()','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function atualizarSugestaoPagamentoCC(){
  const tipo = document.getElementById('pagcc-tipo').value;
  const r = _resumoCartoes;
  const val = tipo==='pf' ? (r?.pf?.totalAberto||0) : (r?.pj?.totalAberto||0);
  document.getElementById('pagcc-valor').value = val?fmt(val):'';
}
function confirmarPagamentoFaturaCartao(){
  const tipo = document.getElementById('pagcc-tipo').value;
  const contaId = document.getElementById('pagcc-conta').value;
  const valor = parseValor(document.getElementById('pagcc-valor').value);
  const data = document.getElementById('pagcc-data').value||hoje();
  if(!contaId){ ME('e-pagcc','Selecione a conta de pagamento.'); return; }
  if(!valor||valor<=0){ ME('e-pagcc','Informe um valor válido maior que zero.'); return; }
  const catFatCartao = categoriaPorNome('Fatura Cartão de Crédito','despesa');
  const novo = {
    id:uid(), contaId, data, tipo:'saida', valor,
    categoriaId: catFatCartao?catFatCartao.id:'', centroCustoId:'',
    contraparte: tipo==='pf'?'CartoesPF':'CartoesPJ',
    descricao: `Pagamento fatura cartão ${tipo==='pf'?'PF':'PJ'}`,
    origem:'manual', contaPagarId:null,
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, lancamentos:[...(DB.lancamentos||[]), novo]});
  FM();
}

// ══════════════════════════════════════════
// CRUD — CONTAS BANCÁRIAS
// ══════════════════════════════════════════
function novaConta(){
  AM('➕ Nova Conta',`
    ${EH('e-conta')}
    <div class="row">
      ${C('Tipo *',`<select id="cta-tipo"><option value="PF">Pessoa Física (PF)</option><option value="PJ">Pessoa Jurídica (PJ)</option></select>`,'1','140')}
      ${C('Titular / Empresa *',`<input id="cta-titular" placeholder="Ex: Telasul Materiais">`,'2','200')}
    </div>
    <div class="row">
      ${C('Banco',`<input id="cta-banco" placeholder="Ex: Banco do Brasil">`,'2','160')}
      ${C('Agência',`<input id="cta-agencia" placeholder="0000">`,'1','100')}
      ${C('Conta',`<input id="cta-conta" placeholder="00000-0">`,'1','120')}
    </div>
    <div class="row">
      ${C('Saldo Inicial (R$) *',`<input id="cta-saldo" placeholder="0,00">`,'1','160')}
      ${C('Data do Saldo Inicial',`<input type="date" id="cta-data-saldo" value="${hoje()}">`,'1','160')}
    </div>
    ${C('Observações',`<textarea id="cta-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaConta()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovaConta(){
  const titular = document.getElementById('cta-titular').value.trim();
  if(!titular){ ME('e-conta','Informe o titular/empresa.'); return; }
  const nova = {
    id:uid(),
    tipo: document.getElementById('cta-tipo').value,
    titular,
    banco: document.getElementById('cta-banco').value.trim(),
    agencia: document.getElementById('cta-agencia').value.trim(),
    conta: document.getElementById('cta-conta').value.trim(),
    saldoInicial: parseValor(document.getElementById('cta-saldo').value),
    dataSaldoInicial: document.getElementById('cta-data-saldo').value||hoje(),
    ativa: true,
    obs: document.getElementById('cta-obs').value.trim(),
    atualizadoEm: new Date().toISOString()
  };
  salvar({...DB, contas:[...(DB.contas||[]), nova]});
  FM();
}
// ══════════════════════════════════════════
// 🏷 IDENTIFICAR CONTAS PF/PJ — a pedido de Fabio: renomeia as contas
// criadas automaticamente ("Conta PF 1", "Conta PJ 1"...) pros bancos
// reais, mantendo o MESMO id de cada uma pra não quebrar nenhum
// lançamento/conta a pagar/cheque que já esteja vinculado a elas. Se
// a lista nova tiver mais contas do que já existem, cria as extras.
// Roda 1x — depois disso, editar normalmente pela tela de Contas.
// ══════════════════════════════════════════
const NOMES_CONTAS_PF = ['Bradesco','Santander','Cef','PicPay','C6','Bc. Brasil','Inter','Santander 2'];
const NOMES_CONTAS_PJ = ['Bradesco 1','Bradesco 2','SICRED 1','SICRED 2','Cef 1','Cef 2','InfinitePay','PagSeg'];

function abrirIdentificarContas(){
  const contasPF = (DB.contas||[]).filter(c=>c.tipo==='PF');
  const contasPJ = (DB.contas||[]).filter(c=>c.tipo==='PJ');
  const linhaPreview = (nomes, contasAtuais, tipo) => nomes.map((nome,i)=>{
    const atual = contasAtuais[i];
    const acao = atual ? `${esc(atual.titular)} → <strong>${esc(nome)}</strong>` : `<span style="color:var(--grn)">+ Nova conta: <strong>${esc(nome)}</strong></span>`;
    return `<div style="padding:4px 0;border-bottom:1px solid var(--bor);font-size:12px">${acao}</div>`;
  }).join('');
  AM('🏷 Identificar Contas PF/PJ', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:14px;line-height:1.5">
      Isso vai renomear (Titular e Banco) as contas que já existem, na ordem em que foram criadas, e adicionar as que ainda não existem. Nenhum lançamento é apagado — as contas mantêm o mesmo ID por baixo.
    </div>
    <div style="font-weight:700;margin-bottom:6px;color:var(--blu)">👤 Pessoa Física (${contasPF.length} existente(s) → ${NOMES_CONTAS_PF.length})</div>
    ${linhaPreview(NOMES_CONTAS_PF, contasPF, 'PF')}
    <div style="font-weight:700;margin:14px 0 6px;color:var(--pur)">🏢 Pessoa Jurídica (${contasPJ.length} existente(s) → ${NOMES_CONTAS_PJ.length})</div>
    ${linhaPreview(NOMES_CONTAS_PJ, contasPJ, 'PJ')}
    <div style="display:flex;gap:8px;margin-top:16px">
      ${B('✅ Aplicar','confirmarIdentificarContas()','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarIdentificarContas(){
  const contasPF = (DB.contas||[]).filter(c=>c.tipo==='PF');
  const contasPJ = (DB.contas||[]).filter(c=>c.tipo==='PJ');
  let novasContas = [...(DB.contas||[])];

  function aplicar(nomes, contasAtuais, tipo){
    nomes.forEach((nome,i)=>{
      const atual = contasAtuais[i];
      if(atual){
        novasContas = novasContas.map(c=>c.id===atual.id?{...c, titular:nome, banco:nome}:c);
      } else {
        novasContas.push({
          id:uid(), tipo, titular:nome, banco:nome, agencia:'', conta:'',
          saldoInicial:0, dataSaldoInicial:hoje(), ativa:true, obs:''
        });
      }
    });
  }
  aplicar(NOMES_CONTAS_PF, contasPF, 'PF');
  aplicar(NOMES_CONTAS_PJ, contasPJ, 'PJ');

  salvar({...DB, contas:novasContas});
  FM();
  setStatus('ok','✅ Contas identificadas! Agora edite cada uma pra completar agência e conta.');
  setTimeout(()=>{ document.getElementById('status').style.display='none'; },5000);
}

function editarConta(id){
  const c = contaById(id); if(!c) return;
  AM('✏ Editar Conta',`
    ${EH('e-conta-ed')}
    <div class="row">
      ${C('Tipo *',`<select id="ecta-tipo"><option value="PF"${c.tipo==='PF'?' selected':''}>Pessoa Física (PF)</option><option value="PJ"${c.tipo==='PJ'?' selected':''}>Pessoa Jurídica (PJ)</option></select>`,'1','140')}
      ${C('Titular / Empresa *',`<input id="ecta-titular" value="${esc(c.titular)}">`,'2','200')}
    </div>
    <div class="row">
      ${C('Banco',`<input id="ecta-banco" value="${esc(c.banco||'')}">`,'2','160')}
      ${C('Agência',`<input id="ecta-agencia" value="${esc(c.agencia||'')}">`,'1','100')}
      ${C('Conta',`<input id="ecta-conta" value="${esc(c.conta||'')}">`,'1','120')}
    </div>
    <div class="row">
      ${C('Saldo Inicial (R$) *',`<input id="ecta-saldo" value="${fmt(c.saldoInicial)}">`,'1','160')}
      ${C('Data do Saldo Inicial',`<input type="date" id="ecta-data-saldo" value="${c.dataSaldoInicial||hoje()}">`,'1','160')}
    </div>
    ${C('Observações',`<textarea id="ecta-obs" rows="2">${esc(c.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoConta(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir Conta','excluirConta(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoConta(id){
  const titular = document.getElementById('ecta-titular').value.trim();
  if(!titular){ ME('e-conta-ed','Informe o titular/empresa.'); return; }
  const patch = {
    tipo: document.getElementById('ecta-tipo').value,
    titular,
    banco: document.getElementById('ecta-banco').value.trim(),
    agencia: document.getElementById('ecta-agencia').value.trim(),
    conta: document.getElementById('ecta-conta').value.trim(),
    saldoInicial: parseValor(document.getElementById('ecta-saldo').value),
    dataSaldoInicial: document.getElementById('ecta-data-saldo').value||hoje(),
    obs: document.getElementById('ecta-obs').value.trim(),
    atualizadoEm: new Date().toISOString()
  };
  salvar({...DB, contas:(DB.contas||[]).map(c=>c.id===id?{...c,...patch}:c)});
  FM();
}
function toggleAtivaConta(id){
  const c = contaById(id); if(!c) return;
  const acao = c.ativa!==false ? 'inativar' : 'reativar';
  CF(`${acao.charAt(0).toUpperCase()+acao.slice(1)} a conta "${c.titular}"?`, ()=>{
    salvar({...DB, contas:(DB.contas||[]).map(x=>x.id===id?{...x,ativa:c.ativa===false}:x)});
  });
}
function excluirConta(id){
  const temMov = (DB.lancamentos||[]).some(l=>l.contaId===id);
  if(temMov){ ME('e-conta-ed','Esta conta já possui lançamentos e não pode ser excluída. Você pode inativá-la em vez disso.'); return; }
  CF('Excluir esta conta definitivamente?', ()=>{
    salvar({...DB, contas:(DB.contas||[]).filter(c=>c.id!==id)});
    FM();
  });
}

// ══════════════════════════════════════════
// CRUD — CATEGORIAS E CENTROS DE CUSTO
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// 🔀 SEPARAÇÃO PF/PJ NOS CADASTROS — a pedido de Fabio: Categoria, Centro de
// Custo, Direcionamento, Fornecedor e Cliente agora carregam um campo
// tipoPFPJ ('PF'|'PJ'|'ambos'). Itens sem tipoPFPJ definido (dado antigo)
// são tratados como 'ambos' por segurança, até serem classificados.
// ══════════════════════════════════════════
function itemValidoParaPFPJ(item, tipoConta){
  if(!tipoConta) return true; // sem conta selecionada ainda — não filtra
  const t = item.tipoPFPJ;
  if(!t || t==='ambos') return true;
  return t===tipoConta;
}
// Sugere tipoPFPJ para um item com base em QUAIS TIPOS DE CONTA (PF/PJ) ele
// já foi usado nos lançamentos — usado só na tela de classificação em lote.
function sugerirTiposPorHistorico(){
  const tipoContaId = {};
  (DB.contas||[]).forEach(c=>{ tipoContaId[c.id]=c.tipo; });
  function tiposUsados(matchFn){
    const tipos = new Set();
    (DB.lancamentos||[]).forEach(l=>{ if(matchFn(l)){ const t=tipoContaId[l.contaId]; if(t) tipos.add(t); } });
    return tipos.size>1 ? 'ambos' : (tipos.size===1 ? [...tipos][0] : '');
  }
  const sug = {categorias:{}, centrosCusto:{}, direcionamentos:{}, fornecedores:{}, clientes:{}};
  (DB.categorias||[]).forEach(c=>{ sug.categorias[c.id] = tiposUsados(l=>l.categoriaId===c.id); });
  (DB.centrosCusto||[]).forEach(c=>{ sug.centrosCusto[c.id] = tiposUsados(l=>l.centroCustoId===c.id); });
  (DB.direcionamentos||[]).forEach(d=>{ sug.direcionamentos[d.id] = tiposUsados(l=>l.direcionamento===d.nome); });
  (DB.fornecedores||[]).forEach(f=>{ sug.fornecedores[f.id] = tiposUsados(l=>l.contraparte===f.nome); });
  (DB.clientes||[]).forEach(c=>{ sug.clientes[c.id] = tiposUsados(l=>l.contraparte===c.nome); });
  return sug;
}
function campoPFPJ(id, valorAtual){
  const v = valorAtual || 'ambos';
  return `<select id="${id}">
    <option value="PF"${v==='PF'?' selected':''}>Somente PF</option>
    <option value="PJ"${v==='PJ'?' selected':''}>Somente PJ</option>
    <option value="ambos"${v==='ambos'?' selected':''}>Ambos (PF e PJ)</option>
  </select>`;
}
function seletorPFPJ(campoPrefix, item, sugestao){
  const atual = item.tipoPFPJ || sugestao || 'ambos';
  return `<select id="pfpj-${campoPrefix}-${item.id}" style="font-size:11px">
    <option value="PF"${atual==='PF'?' selected':''}>Somente PF</option>
    <option value="PJ"${atual==='PJ'?' selected':''}>Somente PJ</option>
    <option value="ambos"${atual==='ambos'?' selected':''}>Ambos</option>
  </select>`;
}
function abrirClassificacaoPFPJ(){
  const sug = sugerirTiposPorHistorico();
  const linha = (item, sugestao, campoPrefix) => {
    const semHistorico = !item.tipoPFPJ && !sugestao;
    return `<div class="row" style="align-items:center;margin-bottom:6px;gap:8px">
      <div style="flex:2;min-width:150px;font-size:12px">${esc(item.nome)}${semHistorico?' <span style="color:var(--mut);font-size:10px">(sem histórico — revise)</span>':''}</div>
      <div style="flex:1;min-width:130px">${seletorPFPJ(campoPrefix, item, sugestao)}</div>
    </div>`;
  };
  const cats = (DB.categorias||[]).map(c=>linha(c, sug.categorias[c.id], 'cat')).join('') || '<div style="font-size:11px;color:var(--mut)">Nenhuma categoria cadastrada.</div>';
  const ccs = (DB.centrosCusto||[]).map(c=>linha(c, sug.centrosCusto[c.id], 'cc')).join('') || '<div style="font-size:11px;color:var(--mut)">Nenhum centro de custo cadastrado.</div>';
  const direcs = (DB.direcionamentos||[]).map(c=>linha(c, sug.direcionamentos[c.id], 'direc')).join('') || '<div style="font-size:11px;color:var(--mut)">Nenhum direcionamento cadastrado ainda.</div>';
  const forns = (DB.fornecedores||[]).map(c=>linha(c, sug.fornecedores[c.id], 'forn')).join('') || '<div style="font-size:11px;color:var(--mut)">Nenhum fornecedor cadastrado ainda.</div>';
  const clis = (DB.clientes||[]).map(c=>linha(c, sug.clientes[c.id], 'cli')).join('') || '<div style="font-size:11px;color:var(--mut)">Nenhum cliente cadastrado ainda.</div>';
  AM('🔀 Classificar Cadastros — PF ou PJ', `
    <div style="font-size:11px;color:var(--mut);margin-bottom:12px;line-height:1.6">
      Defina se cada cadastro deve aparecer só em contas <strong>PF</strong>, só em <strong>PJ</strong>, ou nos dois ("Ambos"). Isso controla onde ele aparece como sugestão no Novo Lançamento, Contas a Pagar e Contas a Receber.<br>
      Já vem pré-marcado com uma sugestão baseada no histórico de uso — revise e ajuste o que precisar antes de salvar.
    </div>
    <div class="card" style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:8px">📂 Categorias</div>${cats}</div>
    <div class="card" style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:8px">🏢 Centros de Custo</div>${ccs}</div>
    <div class="card" style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:8px">📍 Direcionamentos</div>${direcs}</div>
    <div class="card" style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:8px">🏭 Fornecedores</div>${forns}</div>
    <div class="card" style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:8px">🧑 Clientes</div>${clis}</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar Classificação','salvarClassificacaoPFPJ()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarClassificacaoPFPJ(){
  const ler = (campoPrefix, id) => document.getElementById(`pfpj-${campoPrefix}-${id}`)?.value || 'ambos';
  const categorias = (DB.categorias||[]).map(c=>({...c, tipoPFPJ: ler('cat', c.id)}));
  const centrosCusto = (DB.centrosCusto||[]).map(c=>({...c, tipoPFPJ: ler('cc', c.id)}));
  const direcionamentos = (DB.direcionamentos||[]).map(c=>({...c, tipoPFPJ: ler('direc', c.id)}));
  const fornecedores = (DB.fornecedores||[]).map(c=>({...c, tipoPFPJ: ler('forn', c.id)}));
  const clientes = (DB.clientes||[]).map(c=>({...c, tipoPFPJ: ler('cli', c.id)}));
  salvar({...DB, categorias, centrosCusto, direcionamentos, fornecedores, clientes});
  FM();
  setStatus('ok','✅ Classificação PF/PJ salva'); setTimeout(()=>{const el=document.getElementById('status'); if(el)el.style.display='none';},3000);
}
function checkboxesCC(idsSelecionados){
  const sel = new Set(idsSelecionados||[]);
  const itens = (DB.centrosCusto||[]).map(cc=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;padding:4px 0;cursor:pointer">
      <input type="checkbox" class="cat-cc-check" value="${cc.id}"${sel.has(cc.id)?' checked':''}> ${esc(nomeCompletoCentroCusto(cc))}
    </label>`).join('');
  return itens || '<div style="font-size:11px;color:var(--mut)">Nenhum Centro de Custo cadastrado ainda.</div>';
}
function lerCCsMarcados(){
  return [...document.querySelectorAll('.cat-cc-check:checked')].map(el=>el.value);
}
function novaCategoria(){
  AM('➕ Nova Categoria',`
    ${EH('e-cat')}
    <div class="campo" style="margin-bottom:10px">
      <label>Categoria-mãe (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe em branco para criar uma categoria de nível principal. Escolha uma pra criar uma SUBCATEGORIA dela (ex: mãe "Transporte", subcategoria "Combustível").</div>
      <select id="cat-pai" onchange="aoMudarCategoriaPai('cat')">
        <option value="">— Nenhuma (categoria principal) —</option>
        ${opcoesCategoriasPaiParaSelect()}
      </select>
    </div>
    <div class="row" id="cat-tipo-pfpj-wrap">
      ${C('Tipo *',`<select id="cat-tipo"><option value="receita">Receita</option><option value="despesa">Despesa</option></select>`,'1','160')}
      ${C('PF ou PJ *',campoPFPJ('cat-pfpj'),'1','160')}
    </div>
    ${C('Nome *',`<input id="cat-nome" placeholder="Ex: Tarifas Bancárias">`,'2','200')}
    <div class="campo" style="margin-bottom:10px">
      <label>Vincular a Centro(s) de Custo (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe tudo desmarcado para esta categoria aparecer em qualquer Centro de Custo. Se marcar um ou mais, ela só vai aparecer no Novo Lançamento quando esse(s) Centro(s) de Custo forem selecionados.</div>
      <div class="card" style="padding:8px 12px;background:var(--bg)">${checkboxesCC()}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaCategoria()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarNovaCategoria(){
  const nome = document.getElementById('cat-nome').value.trim();
  if(!nome){ ME('e-cat','Informe o nome da categoria.'); return; }
  const parentId = document.getElementById('cat-pai')?.value||null;
  const pai = parentId ? categoriaById(parentId) : null;
  const nova = {
    id:uid(), nome,
    tipo: pai ? pai.tipo : document.getElementById('cat-tipo').value,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('cat-pfpj').value,
    parentId: parentId||null,
    centrosCustoIds:lerCCsMarcados()
  };
  setStatus('saving','⏳ Salvando categoria...');
  await salvarItemCadastroUnico('categorias', nova, false);
  FM(); renderAba();
}
function editarCategoria(id){
  const c = categoriaById(id); if(!c) return;
  AM('✏ Editar Categoria',`
    ${EH('e-cat-ed')}
    <div class="campo" style="margin-bottom:10px">
      <label>Categoria-mãe (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe em branco pra ela ser uma categoria principal.</div>
      <select id="ecat-pai" onchange="aoMudarCategoriaPai('ecat')">
        <option value="">— Nenhuma (categoria principal) —</option>
        ${opcoesCategoriasPaiParaSelect(c.parentId, id)}
      </select>
    </div>
    <div class="row" id="ecat-tipo-pfpj-wrap" style="${c.parentId?'display:none':''}">
      ${C('Tipo *',`<select id="ecat-tipo"><option value="receita"${c.tipo==='receita'?' selected':''}>Receita</option><option value="despesa"${c.tipo==='despesa'?' selected':''}>Despesa</option></select>`,'1','160')}
      ${C('PF ou PJ *',campoPFPJ('ecat-pfpj', c.tipoPFPJ),'1','160')}
    </div>
    ${C('Nome *',`<input id="ecat-nome" value="${esc(c.nome)}">`,'2','200')}
    <div class="campo" style="margin-bottom:10px">
      <label>Vincular a Centro(s) de Custo (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe tudo desmarcado para esta categoria aparecer em qualquer Centro de Custo.</div>
      <div class="card" style="padding:8px 12px;background:var(--bg)">${checkboxesCC(c.centrosCustoIds)}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoCategoria(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirCategoria(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarEdicaoCategoria(id){
  const nome = document.getElementById('ecat-nome').value.trim();
  if(!nome){ ME('e-cat-ed','Informe o nome da categoria.'); return; }
  const parentId = document.getElementById('ecat-pai')?.value||null;
  if(parentId===id){ ME('e-cat-ed','Uma categoria não pode ser mãe dela mesma.'); return; }
  const temFilhas = (DB.categorias||[]).some(x=>x.parentId===id);
  if(parentId && temFilhas){ ME('e-cat-ed','Esta categoria já tem subcategorias — não pode virar subcategoria de outra (só 2 níveis são suportados).'); return; }
  const pai = parentId ? categoriaById(parentId) : null;
  const c = categoriaById(id);
  const atualizada = {
    ...c, nome,
    tipo: pai ? pai.tipo : document.getElementById('ecat-tipo').value,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('ecat-pfpj').value,
    parentId: parentId||null,
    centrosCustoIds:lerCCsMarcados()
  };
  setStatus('saving','⏳ Salvando categoria...');
  await salvarItemCadastroUnico('categorias', atualizada, false);
  FM(); renderAba();
}
function excluirCategoria(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.categoriaId===id) || (DB.contasPagar||[]).some(cp=>cp.categoriaId===id);
  if(emUso){ ME('e-cat-ed','Esta categoria já está em uso em lançamentos ou contas a pagar e não pode ser excluída.'); return; }
  const temFilhas = (DB.categorias||[]).some(c=>c.parentId===id);
  if(temFilhas){ ME('e-cat-ed','Esta categoria tem subcategorias — exclua ou mova as subcategorias primeiro.'); return; }
  const c = categoriaById(id);
  CF('Excluir esta categoria?', async ()=>{ setStatus('saving','⏳ Excluindo...'); await salvarItemCadastroUnico('categorias', c, true); FM(); renderAba(); });
}

function novoCentroCusto(){
  AM('➕ Novo Centro de Custo',`
    ${EH('e-cc')}
    <div class="campo" style="margin-bottom:10px">
      <label>Centro de Custo-mãe (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe em branco pra um centro de custo principal. Escolha um pra criar um SUB-centro dele (ex: mãe "Telasul", sub "Telasul: Produção").</div>
      <select id="cc-pai" onchange="aoMudarCentroCustoPai('cc')">
        <option value="">— Nenhum (centro de custo principal) —</option>
        ${opcoesCentroCustoPaiParaSelect()}
      </select>
    </div>
    <div class="row">
      ${C('Nome *',`<input id="cc-nome" placeholder="Ex: Telasul">`,'2','200')}
      <div class="campo" id="cc-pfpj-wrap" style="flex:1;min-width:160px;margin-bottom:10px">
        <label>PF ou PJ *</label>
        ${campoPFPJ('cc-pfpj')}
      </div>
    </div>
    ${C('Observações',`<input id="cc-obs" placeholder="Opcional">`,'2','200')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoCC()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarNovoCC(){
  const nome = document.getElementById('cc-nome').value.trim();
  if(!nome){ ME('e-cc','Informe o nome do centro de custo.'); return; }
  const parentId = document.getElementById('cc-pai')?.value||null;
  const pai = parentId ? centroCustoById(parentId) : null;
  const novo = {
    id:uid(), nome,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('cc-pfpj').value,
    parentId: parentId||null,
    obs:document.getElementById('cc-obs').value.trim()
  };
  setStatus('saving','⏳ Salvando centro de custo...');
  await salvarItemCadastroUnico('centrosCusto', novo, false);
  FM(); renderAba();
}
function editarCentroCusto(id){
  const cc = centroCustoById(id); if(!cc) return;
  AM('✏ Editar Centro de Custo',`
    ${EH('e-cc-ed')}
    <div class="campo" style="margin-bottom:10px">
      <label>Centro de Custo-mãe (opcional)</label>
      <select id="ecc-pai" onchange="aoMudarCentroCustoPai('ecc')">
        <option value="">— Nenhum (centro de custo principal) —</option>
        ${opcoesCentroCustoPaiParaSelect(cc.parentId, id)}
      </select>
    </div>
    <div class="row">
      ${C('Nome *',`<input id="ecc-nome" value="${esc(cc.nome)}">`,'2','200')}
      <div class="campo" id="ecc-pfpj-wrap" style="flex:1;min-width:160px;margin-bottom:10px;${cc.parentId?'display:none':''}">
        <label>PF ou PJ *</label>
        ${campoPFPJ('ecc-pfpj', cc.tipoPFPJ)}
      </div>
    </div>
    ${C('Observações',`<input id="ecc-obs" value="${esc(cc.obs||'')}">`,'2','200')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoCC(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirCC(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarEdicaoCC(id){
  const nome = document.getElementById('ecc-nome').value.trim();
  if(!nome){ ME('e-cc-ed','Informe o nome.'); return; }
  const parentId = document.getElementById('ecc-pai')?.value||null;
  if(parentId===id){ ME('e-cc-ed','Um centro de custo não pode ser mãe dele mesmo.'); return; }
  const temFilhos = (DB.centrosCusto||[]).some(x=>x.parentId===id);
  if(parentId && temFilhos){ ME('e-cc-ed','Este centro de custo já tem sub-centros — não pode virar sub-centro de outro (só 2 níveis são suportados).'); return; }
  const pai = parentId ? centroCustoById(parentId) : null;
  const atualizado = {
    ...cc, nome,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('ecc-pfpj').value,
    parentId: parentId||null,
    obs:document.getElementById('ecc-obs').value.trim()
  };
  setStatus('saving','⏳ Salvando centro de custo...');
  await salvarItemCadastroUnico('centrosCusto', atualizado, false);
  FM(); renderAba();
}
function excluirCC(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.centroCustoId===id) || (DB.contasPagar||[]).some(cp=>cp.centroCustoId===id);
  if(emUso){ ME('e-cc-ed','Este centro de custo já está em uso e não pode ser excluído.'); return; }
  const temFilhos = (DB.centrosCusto||[]).some(c=>c.parentId===id);
  if(temFilhos){ ME('e-cc-ed','Este centro de custo tem sub-centros — exclua ou mova os sub-centros primeiro.'); return; }
  const cc = centroCustoById(id);
  CF('Excluir este centro de custo?', async ()=>{ setStatus('saving','⏳ Excluindo...'); await salvarItemCadastroUnico('centrosCusto', cc, true); FM(); renderAba(); });
}

function direcionamentoById(id){ return (DB.direcionamentos||[]).find(d=>d.id===id); }
// Acha um Direcionamento cadastrado pelo nome (mãe + sub opcional); cria o que
// faltar. Usado pela migração abaixo, que transforma o texto livre que os
// lançamentos antigos tinham em referência de verdade (direcionamentoId),
// igual já funciona com Categoria e Centro de Custo.
function acharOuCriarDirecionamento(listaAtual, nomeMae, nomeSub){
  let lista = listaAtual;
  let mae = lista.find(d=>!d.parentId && d.nome===nomeMae);
  if(!mae){ mae = {id:uid(), nome:nomeMae, parentId:null, tipoPFPJ:'ambos', obs:''}; lista = [...lista, mae]; }
  if(!nomeSub) return {id:mae.id, lista};
  let sub = lista.find(d=>d.parentId===mae.id && d.nome===nomeSub);
  if(!sub){ sub = {id:uid(), nome:nomeSub, parentId:mae.id, tipoPFPJ:mae.tipoPFPJ||'ambos', obs:''}; lista = [...lista, sub]; }
  return {id:sub.id, lista};
}
let _direcMigrado = false;
// Roda uma única vez por sessão: todo lançamento com texto em `direcionamento`
// mas sem `direcionamentoId` ganha o vínculo de verdade (criando o cadastro
// correspondente se ainda não existir). O campo de texto continua sendo
// atualizado igual antes, então relatórios/filtros antigos não quebram.
function migrarDirecionamentosParaId(){
  // Superada pelo cadastro único (cadastros-pf.json/cadastros-pj.json) — a
  // partir daqui, direcionamento de lançamento antigo sem ID fica em branco
  // e é reclassificado manualmente, por decisão do Fabio (21/07/2026).
  return;
  if(_direcMigrado) return;
  _direcMigrado = true;
  let direcionamentos = DB.direcionamentos||[];
  let mudou = false;
  const lancamentos = (DB.lancamentos||[]).map(l=>{
    if(l.direcionamentoId || !l.direcionamento) return l;
    const partes = l.direcionamento.split(':').map(s=>s.trim());
    const nomeMae = partes[0], nomeSub = partes[1]||'';
    if(!nomeMae) return l;
    const r = acharOuCriarDirecionamento(direcionamentos, nomeMae, nomeSub);
    direcionamentos = r.lista;
    mudou = true;
    return {...l, direcionamentoId: r.id};
  });
  if(mudou){
    DB = {...DB, lancamentos, direcionamentos};
    _relCacheVersion++;
    ghSalvar(DB);
  }
}
// Direcionamento tinha campo de TEXTO LIVRE nos lançamentos, sem ID — desde a
// migração acima, todo lançamento novo/editado grava direcionamentoId de
// verdade (igual Categoria/Centro de Custo); o texto continua preenchido
// automaticamente a partir do ID, só por compatibilidade com relatórios
// antigos que ainda leem a string.
function nomeCompletoDirecionamento(d){
  if(!d) return '-';
  if(!d.parentId) return d.nome;
  const pai = direcionamentoById(d.parentId);
  return pai ? `${pai.nome}: ${d.nome}` : d.nome;
}
function opcoesDirecionamentoPaiParaSelect(selId, excluirId){
  return (DB.direcionamentos||[]).filter(d=>!d.parentId && d.id!==excluirId)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(d=>`<option value="${d.id}"${d.id===selId?' selected':''}>${esc(d.nome)}</option>`).join('');
}
function aoMudarDirecionamentoPai(prefix){
  const paiId = document.getElementById(prefix+'-pai')?.value||'';
  const wrap = document.getElementById(prefix+'-pfpj-wrap');
  if(paiId){
    const pai = direcionamentoById(paiId);
    if(pai){
      const selPfpj = document.getElementById(prefix+'-pfpj'); if(selPfpj) selPfpj.value = pai.tipoPFPJ||'ambos';
    }
    if(wrap) wrap.style.display='none';
  } else {
    if(wrap) wrap.style.display='';
  }
}
function novoDirecionamento(){
  AM('➕ Novo Direcionamento',`
    ${EH('e-drc')}
    <div class="campo" style="margin-bottom:10px">
      <label>Direcionamento-mãe (opcional)</label>
      <div style="font-size:11px;color:var(--mut);margin-bottom:6px">Deixe em branco pra um direcionamento principal. Escolha um pra criar um SUB-direcionamento (ex: mãe "Telasul", sub "Obra X" → sugere "Telasul: Obra X").</div>
      <select id="drc-pai" onchange="aoMudarDirecionamentoPai('drc')">
        <option value="">— Nenhum (direcionamento principal) —</option>
        ${opcoesDirecionamentoPaiParaSelect()}
      </select>
    </div>
    <div class="row">
      ${C('Nome *',`<input id="drc-nome" placeholder="Ex: Obra X, Setor Y...">`,'2','200')}
      <div class="campo" id="drc-pfpj-wrap" style="flex:1;min-width:160px;margin-bottom:10px">
        <label>PF ou PJ *</label>
        ${campoPFPJ('drc-pfpj')}
      </div>
    </div>
    ${C('Observações',`<input id="drc-obs" placeholder="Opcional">`,'2','200')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoDirecionamento()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarNovoDirecionamento(){
  const nome = document.getElementById('drc-nome').value.trim();
  if(!nome){ ME('e-drc','Informe o nome do direcionamento.'); return; }
  const parentId = document.getElementById('drc-pai')?.value||null;
  const pai = parentId ? direcionamentoById(parentId) : null;
  const novo = {
    id:uid(), nome,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('drc-pfpj').value,
    parentId: parentId||null,
    obs:document.getElementById('drc-obs').value.trim()
  };
  setStatus('saving','⏳ Salvando direcionamento...');
  await salvarItemCadastroUnico('direcionamentos', novo, false);
  FM(); renderAba();
}
function editarDirecionamento(id){
  const d = direcionamentoById(id); if(!d) return;
  AM('✏ Editar Direcionamento',`
    ${EH('e-drc-ed')}
    <div class="campo" style="margin-bottom:10px">
      <label>Direcionamento-mãe (opcional)</label>
      <select id="edrc-pai" onchange="aoMudarDirecionamentoPai('edrc')">
        <option value="">— Nenhum (direcionamento principal) —</option>
        ${opcoesDirecionamentoPaiParaSelect(d.parentId, id)}
      </select>
    </div>
    <div class="row">
      ${C('Nome *',`<input id="edrc-nome" value="${esc(d.nome)}">`,'2','200')}
      <div class="campo" id="edrc-pfpj-wrap" style="flex:1;min-width:160px;margin-bottom:10px;${d.parentId?'display:none':''}">
        <label>PF ou PJ *</label>
        ${campoPFPJ('edrc-pfpj', d.tipoPFPJ)}
      </div>
    </div>
    ${C('Observações',`<input id="edrc-obs" value="${esc(d.obs||'')}">`,'2','200')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoDirecionamento(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirDirecionamento(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarEdicaoDirecionamento(id){
  const nome = document.getElementById('edrc-nome').value.trim();
  if(!nome){ ME('e-drc-ed','Informe o nome.'); return; }
  const parentId = document.getElementById('edrc-pai')?.value||null;
  if(parentId===id){ ME('e-drc-ed','Um direcionamento não pode ser mãe dele mesmo.'); return; }
  const temFilhos = (DB.direcionamentos||[]).some(x=>x.parentId===id);
  if(parentId && temFilhos){ ME('e-drc-ed','Este direcionamento já tem subdirecionamentos — não pode virar sub de outro (só 2 níveis são suportados).'); return; }
  const antigo = direcionamentoById(id);
  const nomeCompletoAntigo = nomeCompletoDirecionamento(antigo);
  const pai = parentId ? direcionamentoById(parentId) : null;
  const atualizado = {
    ...antigo, nome,
    tipoPFPJ: pai ? (pai.tipoPFPJ||'ambos') : document.getElementById('edrc-pfpj').value,
    parentId: parentId||null,
    obs:document.getElementById('edrc-obs').value.trim()
  };
  const nomeCompletoNovo = nomeCompletoDirecionamento(atualizado);
  setStatus('saving','⏳ Salvando direcionamento...');
  await salvarItemCadastroUnico('direcionamentos', atualizado, false);
  // Se o nome completo mudou (renomeou a si mesma OU mudou de mãe), atualiza os
  // lançamentos que já usam o nome completo antigo, pra não "quebrar" o vínculo
  // do que já foi lançado (direcionamento é texto livre gravado por valor).
  if(nomeCompletoAntigo!==nomeCompletoNovo){
    const lancamentos = (DB.lancamentos||[]).map(l=>l.direcionamento===nomeCompletoAntigo?{...l,direcionamento:nomeCompletoNovo}:l);
    salvar({...DB, lancamentos});
  } else {
    FM(); renderAba();
  }
}
function excluirDirecionamento(id){
  const d = direcionamentoById(id); if(!d) return;
  const temFilhos = (DB.direcionamentos||[]).some(x=>x.parentId===id);
  if(temFilhos){ ME('e-drc-ed','Este direcionamento tem subdirecionamentos — exclua ou mova os subdirecionamentos primeiro.'); return; }
  const nomeCompleto = nomeCompletoDirecionamento(d);
  const emUso = (DB.lancamentos||[]).some(l=>l.direcionamento===nomeCompleto);
  if(emUso){ ME('e-drc-ed','Este direcionamento já está em uso em lançamentos e não pode ser excluído. Você pode editá-lo se quiser só renomear.'); return; }
  CF('Excluir este direcionamento?', async ()=>{ setStatus('saving','⏳ Excluindo...'); await salvarItemCadastroUnico('direcionamentos', d, true); FM(); renderAba(); });
}

// ══════════════════════════════════════════
// CRUD — FORNECEDORES (para Contas a Pagar)
// ══════════════════════════════════════════
function campoFornecedorForm(prefixo, f){
  f = f||{};
  return `
    <div class="row">
      ${C('Nome / Razão Social *',`<input id="${prefixo}-nome" value="${esc(f.nome||'')}" placeholder="Ex: Fornecedor XYZ Ltda">`,'2','200')}
      ${C('CPF / CNPJ',`<input id="${prefixo}-doc" value="${esc(f.cpfCnpj||'')}" placeholder="000.000.000-00 ou 00.000.000/0000-00">`,'1','180')}
    </div>
    <div class="row">
      ${C('Telefone',`<input id="${prefixo}-tel" value="${esc(f.telefone||'')}" placeholder="(00) 00000-0000">`,'1','160')}
      ${C('E-mail',`<input id="${prefixo}-email" value="${esc(f.email||'')}" placeholder="contato@email.com">`,'1','200')}
    </div>
    ${C('PF ou PJ *',campoPFPJ(prefixo+'-pfpj', f.tipoPFPJ),'1','160')}
    ${C('Endereço',`<input id="${prefixo}-end" value="${esc(f.endereco||'')}" placeholder="Opcional">`)}
    ${C('Observações',`<textarea id="${prefixo}-obs" rows="2">${esc(f.obs||'')}</textarea>`)}
  `;
}
function lerFornecedorForm(prefixo){
  return {
    nome: document.getElementById(prefixo+'-nome')?.value?.trim()||'',
    cpfCnpj: document.getElementById(prefixo+'-doc')?.value?.trim()||'',
    telefone: document.getElementById(prefixo+'-tel')?.value?.trim()||'',
    email: document.getElementById(prefixo+'-email')?.value?.trim()||'',
    tipoPFPJ: document.getElementById(prefixo+'-pfpj')?.value||'ambos',
    endereco: document.getElementById(prefixo+'-end')?.value?.trim()||'',
    obs: document.getElementById(prefixo+'-obs')?.value?.trim()||'',
  };
}
function novoFornecedor(){
  AM('➕ Novo Fornecedor',`
    ${EH('e-forn')}
    ${campoFornecedorForm('forn')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoFornecedor()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovoFornecedor(){
  const dados = lerFornecedorForm('forn');
  if(!dados.nome){ ME('e-forn','Informe o nome/razão social.'); return; }
  if(!validarCpfCnpj(dados.cpfCnpj)){ ME('e-forn','CPF/CNPJ inválido. Confira os números digitados.'); return; }
  const novo = {id:uid(), ...dados};
  salvar({...DB, fornecedores:[...(DB.fornecedores||[]), novo]});
  FM();
}
function editarFornecedor(id){
  const f = fornecedorById(id); if(!f) return;
  AM('✏ Editar Fornecedor',`
    ${EH('e-forn-ed')}
    ${campoFornecedorForm('eforn', f)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoFornecedor(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirFornecedor(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoFornecedor(id){
  const dados = lerFornecedorForm('eforn');
  if(!dados.nome){ ME('e-forn-ed','Informe o nome/razão social.'); return; }
  if(!validarCpfCnpj(dados.cpfCnpj)){ ME('e-forn-ed','CPF/CNPJ inválido. Confira os números digitados.'); return; }
  salvar({...DB, fornecedores:(DB.fornecedores||[]).map(f=>f.id===id?{...f,...dados}:f)});
  FM();
}
function excluirFornecedor(id){
  const emUso = (DB.contasPagar||[]).some(cp=>cp.fornecedorId===id);
  if(emUso){ ME('e-forn-ed','Este fornecedor já está vinculado a contas a pagar e não pode ser excluído.'); return; }
  CF('Excluir este fornecedor?', ()=>{ salvar({...DB, fornecedores:(DB.fornecedores||[]).filter(f=>f.id!==id)}); FM(); });
}

// ══════════════════════════════════════════
// CRUD — CLIENTES (contraparte em lançamentos de entrada)
// ══════════════════════════════════════════
function novoCliente(){
  AM('➕ Novo Cliente',`
    ${EH('e-cli')}
    ${campoFornecedorForm('cli')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoCliente()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovoCliente(){
  const dados = lerFornecedorForm('cli');
  if(!dados.nome){ ME('e-cli','Informe o nome/razão social.'); return; }
  if(!validarCpfCnpj(dados.cpfCnpj)){ ME('e-cli','CPF/CNPJ inválido. Confira os números digitados.'); return; }
  const novo = {id:uid(), ...dados};
  salvar({...DB, clientes:[...(DB.clientes||[]), novo]});
  FM();
}
function editarCliente(id){
  const c = clienteById(id); if(!c) return;
  AM('✏ Editar Cliente',`
    ${EH('e-cli-ed')}
    ${campoFornecedorForm('ecli', c)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoCliente(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirCliente(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoCliente(id){
  const dados = lerFornecedorForm('ecli');
  if(!dados.nome){ ME('e-cli-ed','Informe o nome/razão social.'); return; }
  if(!validarCpfCnpj(dados.cpfCnpj)){ ME('e-cli-ed','CPF/CNPJ inválido. Confira os números digitados.'); return; }
  salvar({...DB, clientes:(DB.clientes||[]).map(c=>c.id===id?{...c,...dados}:c)});
  FM();
}
function excluirCliente(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.clienteId===id);
  if(emUso){ ME('e-cli-ed','Este cliente já está vinculado a lançamentos e não pode ser excluído.'); return; }
  CF('Excluir este cliente?', ()=>{ salvar({...DB, clientes:(DB.clientes||[]).filter(c=>c.id!==id)}); FM(); });
}

// ══════════════════════════════════════════
// SALVAR (persistência central)
// ══════════════════════════════════════════
function salvar(novo){ DB=novo; _relCacheVersion++; ghSalvar({...DB, categorias:undefined, centrosCusto:undefined, direcionamentos:undefined}); renderAba(); }

function opcoesContas(selId){
  return (DB.contas||[]).filter(c=>c.ativa!==false).map(c=>`<option value="${c.id}"${c.id===selId?' selected':''}>${esc(nomeConta(c))}</option>`).join('');
}
// Sugestão de Categoria/Direcionamento/Centro de Custo com base no BENEFICIÁRIO
// digitado no Novo Lançamento — mesmo motor de aprendizado (construirDicionarioAprendizado
// + casarComHistorico) já usado há tempos no importador de OFX, só que aplicado também
// na hora de digitar manualmente. Só sugere, nunca trava — o usuário sempre pode trocar.
function sugerirPorContraparteLC(prefix){
  const campoContraparte = document.getElementById(prefix+'-contraparte');
  const nome = campoContraparte?.value?.trim();
  const dica = document.getElementById(prefix+'-dica-contraparte');
  if(!nome || nome.length<2){ if(dica) dica.style.display='none'; return; }
  const dic = construirDicionarioAprendizado();
  const match = casarComHistorico(nome, dic);
  if(!match){ if(dica) dica.style.display='none'; return; }
  let aplicouAlgo = false;
  if(match.categoriaId){
    const {maeId,subId} = idsMaeSub(categoriaById(match.categoriaId));
    const selMae = document.getElementById(prefix+'-categoria-mae');
    if(selMae && [...selMae.options].some(o=>o.value===maeId)){
      selMae.value = maeId;
      const selSub = document.getElementById(prefix+'-categoria-sub');
      if(selSub) selSub.innerHTML = opcoesSubcategoria(maeId, subId);
      aplicouAlgo = true;
    }
  }
  if(match.centroCustoId){
    const {maeId,subId} = idsMaeSub(centroCustoById(match.centroCustoId));
    const selMae = document.getElementById(prefix+'-cc-mae');
    if(selMae && [...selMae.options].some(o=>o.value===maeId)){
      selMae.value = maeId;
      const selSub = document.getElementById(prefix+'-cc-sub');
      if(selSub) selSub.innerHTML = opcoesSubCentroCusto(maeId, subId);
      aplicouAlgo = true;
    }
  }
  if(match.direcionamentoId){
    const {maeId,subId} = idsMaeSub(direcionamentoById(match.direcionamentoId));
    const selMae = document.getElementById(prefix+'-direc-mae');
    if(selMae && [...selMae.options].some(o=>o.value===maeId)){
      selMae.value = maeId;
      const selSub = document.getElementById(prefix+'-direc-sub');
      if(selSub) selSub.innerHTML = opcoesSubDirecionamento(maeId, subId);
      aplicouAlgo = true;
    }
  }
  if(dica) dica.style.display = aplicouAlgo ? 'block' : 'none';
}
// ══════════════════════════════════════════
// 📥 IMPORTAR EXTRATO (OFX) — lê o arquivo baixado do internet banking e já
// lança tudo, tentando reconhecer cada lançamento pelo HISTÓRICO de uso
// (mesma contraparte já apareceu antes → reaproveita categoria/direcionamento/
// centro de custo/nome limpo que você já usou), em vez de deixar a descrição
// crua do banco, que muitas vezes não diz nada.
// ══════════════════════════════════════════
function parseOFX(texto){
  const inicio = texto.search(/<OFX>|<STMTTRN>/i);
  const corpo = inicio>=0 ? texto.slice(inicio) : texto;
  const blocos = corpo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  function tag(bloco, nome){
    const m = bloco.match(new RegExp('<'+nome+'>([^<\r\n]*)','i'));
    return m ? m[1].trim() : '';
  }
  return blocos.map(bloco=>{
    const dt = tag(bloco,'DTPOSTED').replace(/[^0-9]/g,'');
    const data = dt.length>=8 ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}` : '';
    const valorRaw = tag(bloco,'TRNAMT').replace(',','.');
    const valor = parseFloat(valorRaw)||0;
    const memo = tag(bloco,'MEMO') || tag(bloco,'NAME') || '';
    return {
      data, valor: Math.abs(valor), tipo: valor>=0?'entrada':'saida',
      fitid: tag(bloco,'FITID'), memoOriginal: memo,
    };
  }).filter(t=>t.data && t.valor>0);
}
function normalizarTextoOFX(s){
  return (s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // remove acentos
    .toUpperCase()
    .replace(/\b(PIX|RECEBIDO|RECEBIMENTO|ENVIADO|PAGAMENTO|TRANSFERENCIA|TED|DOC|DES|REM|COMPRA|DEBITO|CREDITO|CARTAO|AUTOMATICO|DE|DA|DO|LTDA|ME|EIRELI|S\/A|SA)\b/g,'')
    .replace(/\b\d{6,}\b/g,'') // CPF/CNPJ/numeros de transacao
    .replace(/[^A-Z0-9 ]/g,'')
    .replace(/\s+/g,' ').trim();
}
function construirDicionarioAprendizado(contaId){
  const dic = {};
  (DB.lancamentos||[]).filter(l=>l.contraparte && (!contaId || l.contaId===contaId)).forEach(l=>{
    const chave = normalizarTextoOFX(l.contraparte);
    if(!chave) return;
    if(!dic[chave] || l.criadoEm > dic[chave].ultimaData){
      dic[chave] = {
        contraparte: l.contraparte, categoriaId: l.categoriaId||'', direcionamento: l.direcionamento||'',
        direcionamentoId: l.direcionamentoId||'', centroCustoId: l.centroCustoId||'', ultimaData: l.criadoEm||l.data,
      };
    }
  });
  return dic;
}
function casarComHistorico(memoOriginal, dicionario){
  const chaveOfx = normalizarTextoOFX(memoOriginal);
  if(!chaveOfx) return null;
  if(dicionario[chaveOfx]) return dicionario[chaveOfx];
  // sem igual exato: tenta achar uma chave conhecida contida no texto do OFX (ou vice-versa)
  let melhor = null, melhorTam = 0;
  Object.keys(dicionario).forEach(chave=>{
    if(chave.length<4) return;
    if(chaveOfx.includes(chave) || chave.includes(chaveOfx)){
      if(chave.length>melhorTam){ melhorTam = chave.length; melhor = dicionario[chave]; }
    }
  });
  return melhor;
}
// ══════════════════════════════════════════
// CONCILIAÇÃO — acha um lançamento MANUAL (digitado por você, sem fitid ainda)
// que provavelmente é a MESMA transação real que veio no extrato do banco:
// mesma conta, mesmo tipo, mesmo valor (exato) e data próxima (até 3 dias de
// diferença — cobre o caso do Pix compensar num dia e você ter digitado no outro).
// Impede duplicar o lançamento; em vez disso, na hora de confirmar a importação,
// o lançamento manual existente é marcado como conferido com o banco (ganha um
// fitid), ao invés de criar um segundo lançamento igual.
// ══════════════════════════════════════════
function encontrarLancamentoManualParecido(t, contaId, jaUsados){
  return (DB.lancamentos||[]).find(l=>
    l.contaId===contaId && !l.fitid && l.origem==='manual' && !jaUsados.has(l.id) &&
    l.tipo===t.tipo && Math.abs(Number(l.valor)-Number(t.valor))<0.01 &&
    Math.abs(diasEntreDatas(l.data,t.data))<=3
  );
}
let _ofxPendente = [];
let _ofxContaId = '';
function abrirImportarOFX(contaIdPre){
  AM('📥 Importar Extrato', `
    ${EH('e-ofx')}
    <div style="font-size:12px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Baixe o extrato no site/app do banco (geralmente em "Extrato" → "Exportar" ou "Outros formatos") e escolha o arquivo aqui — pode ser <strong>.ofx</strong>, <strong>.csv</strong> ou um <strong>.qif</strong> exportado do Microsoft Money. O sistema tenta reconhecer cada lançamento pelo que você já categorizou antes (e, no QIF, também tenta casar pela categoria que o Money usava).
    </div>
    <div class="campo">
      <label>Formato do arquivo</label>
      <select id="ofx-formato" onchange="aoMudarFormatoImportExtrato()">
        <option value="ofx">OFX (.ofx / .qfx)</option>
        <option value="csv">CSV (exportado do banco)</option>
        <option value="qif">QIF (exportado do Microsoft Money)</option>
      </select>
    </div>
    <div class="campo" id="campo-qif-formato-data" style="display:none">
      <label>Formato de data no arquivo QIF</label>
      <select id="qif-formato-data">
        <option value="auto">Detectar automaticamente</option>
        <option value="DMA">Dia/Mês/Ano (padrão brasileiro)</option>
        <option value="MDA">Mês/Dia/Ano (padrão americano do Money)</option>
      </select>
    </div>
    <div class="campo">
      <label>Conta *</label>
      <select id="ofx-conta">${opcoesContasFiltradas(contaIdPre)}</select>
    </div>
    <div class="campo">
      <label>Arquivo</label>
      <input type="file" id="ofx-arquivo" accept=".ofx,.qfx,text/plain" style="padding:8px">
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      ${B('📂 Ler e Conferir','processarArquivoOFX()','var(--acc)','#000')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function aoMudarFormatoImportExtrato(){
  const formato = document.getElementById('ofx-formato').value;
  document.getElementById('campo-qif-formato-data').style.display = formato==='qif' ? 'block' : 'none';
  document.getElementById('ofx-arquivo').accept = formato==='csv' ? '.csv,text/csv' : formato==='qif' ? '.qif,text/plain' : '.ofx,.qfx,text/plain';
}
function fitidSinteticoCSV(data, valor, memo){
  const base = data+'|'+Number(valor).toFixed(2)+'|'+(memo||'').trim().toUpperCase();
  let hash = 0;
  for(let i=0;i<base.length;i++){ hash = ((hash<<5)-hash+base.charCodeAt(i))|0; }
  return 'csv'+Math.abs(hash);
}
// Parser genérico de CSV bancário — aceita os formatos mais comuns de banco
// brasileiro: cabeçalho com Data + Descrição/Histórico + (Valor único COM
// sinal, OU colunas separadas de Débito/Crédito). Detecta delimitador (';'
// ou ',') e formatos de data (dd/mm/aaaa) e número (1.234,56) automaticamente.
// Parser QIF (Microsoft Money) para conta bancária/Extrato. Diferente do
// parser de fatura de cartão: aqui T positivo é ENTRADA e negativo é SAÍDA
// (convenção padrão de conta corrente no Money), sem filtrar transferências
// — elas entram como entrada/saída normal, igual o OFX/CSV já fazem.
function parseDataQIF(s, formato){
  s=(s||'').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})'(\d{2})$/);
  if(m){ let [,a,b,ano]=m; ano='20'+ano;
    return formato==='DMA' ? `${ano}-${b.padStart(2,'0')}-${a.padStart(2,'0')}` : `${ano}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){ let [,a,b,ano]=m; if(ano.length===2) ano=(parseInt(ano,10)<50?'20':'19')+ano;
    return formato==='DMA' ? `${ano}-${b.padStart(2,'0')}-${a.padStart(2,'0')}` : `${ano}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){ let [,ano,mes,dia]=m; return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`; }
  return '';
}
function parseNumeroQIF(s){ s=String(s||'').trim().replace(/,/g,''); return parseFloat(s)||0; }
function sugerirFormatoDataQIF(texto){
  const datas = [...texto.matchAll(/^D(\d{1,2})\/(\d{1,2})[\/'](\d{2,4})/gm)];
  let temA=false, temB=false;
  datas.forEach(m=>{ if(parseInt(m[1],10)>12) temA=true; if(parseInt(m[2],10)>12) temB=true; });
  if(temA && !temB) return 'DMA';
  if(temB && !temA) return 'MDA';
  return 'DMA';
}
function parseQIFBancario(texto, formatoData){
  const linhas = texto.split(/\r?\n/);
  const registros=[]; let atual=null, splits=[];
  function fecharRegistro(){
    if(!atual) return;
    if(splits.length){
      splits.forEach(s=>{ if(s.valor) registros.push({data:atual.data, valor:s.valor, memoOriginal:(atual.payee||s.memo||atual.memo||'').trim(), categoriaTextoMoney:s.categoria||atual.categoriaTexto, centroCustoTextoMoney:s.centroCusto||atual.centroCustoTexto}); });
    } else if(atual.data && atual.valor){
      registros.push({data:atual.data, valor:atual.valor, memoOriginal:(atual.payee||atual.memo||'').trim(), categoriaTextoMoney:atual.categoriaTexto, centroCustoTextoMoney:atual.centroCustoTexto});
    }
    atual=null; splits=[];
  }
  linhas.forEach(linhaRaw=>{
    const linha=linhaRaw.trim(); if(!linha) return;
    if(linha==='^'){ fecharRegistro(); return; }
    if(linha[0]==='!') return;
    if(!atual) atual={data:'',valor:0,payee:'',categoriaTexto:'',centroCustoTexto:'',memo:''};
    const tipo=linha[0], resto=linha.slice(1);
    if(tipo==='D') atual.data=parseDataQIF(resto,formatoData);
    else if(tipo==='T'||tipo==='U') atual.valor=parseNumeroQIF(resto);
    else if(tipo==='P') atual.payee=resto.trim();
    else if(tipo==='M') atual.memo=resto.trim();
    // O Money grava "Categoria:Subcategoria/ClasseMãe:ClasseSub" na linha L —
    // a parte depois da "/" é o que o Fabio chama de Centro de Custo.
    else if(tipo==='L'){ const partesL=resto.split('/'); atual.categoriaTexto=(partesL[0]||'').trim(); atual.centroCustoTexto=(partesL[1]||'').trim(); }
    else if(tipo==='S'){ const partesS=resto.split('/'); splits.push({categoria:(partesS[0]||'').trim(), centroCusto:(partesS[1]||'').trim(), valor:0, memo:''}); }
    else if(tipo==='E'){ if(splits.length) splits[splits.length-1].memo=resto.trim(); }
    else if(tipo==='$'){ if(splits.length) splits[splits.length-1].valor=parseNumeroQIF(resto); }
  });
  fecharRegistro();
  return registros.filter(r=>r.data && r.valor && !/^opening balance$/i.test((r.memoOriginal||'').trim())).map(r=>{
    const catTexto = (r.categoriaTextoMoney||'').trim();
    const ccTexto = (r.centroCustoTextoMoney||'').trim();
    // No Money, categoria entre colchetes "[Nome da Conta]" significa TRANSFERÊNCIA
    // entre contas, não uma categoria de verdade — não entra no mapeamento de
    // categorias (viraria um cadastro de categoria com nome de banco). Fica sem
    // categoria e um aviso na descrição pra você revisar e marcar como
    // Transferência depois, se quiser (Editar Lançamento → Tipo → Transferência).
    const ehTransferenciaMoney = /^\[.*\]$/.test(catTexto);
    const nomeContaMoney = ehTransferenciaMoney ? catTexto.slice(1,-1).trim() : '';
    return {
      data:r.data, valor:Math.abs(r.valor), tipo: r.valor>=0?'entrada':'saida',
      memoOriginal: (r.memoOriginal||'(sem descrição)') + (ehTransferenciaMoney ? ` [Transferência p/ "${nomeContaMoney}" no Money — confira]` : ''),
      categoriaTextoMoney: ehTransferenciaMoney ? '' : catTexto,
      centroCustoTextoMoney: ccTexto,
      fitid: fitidSinteticoCSV(r.data, Math.abs(r.valor), r.memoOriginal)
    };
  });
}
function parseCSVBancario(texto){
  const linhas = texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!linhas.length) return [];
  const delim = (linhas[0].match(/;/g)||[]).length >= (linhas[0].match(/,/g)||[]).length ? ';' : ',';
  function quebrarLinha(l){ return l.split(delim).map(c=>c.trim().replace(/^"|"$/g,'')); }
  const cabecalho = quebrarLinha(linhas[0]).map(h=>h.toLowerCase());
  const idxData = cabecalho.findIndex(h=>/data|date/.test(h));
  const idxDesc = cabecalho.findIndex(h=>/hist[oó]rico|descri[cç][aã]o|memo|lan[cç]amento|favorecido/.test(h));
  const idxValor = cabecalho.findIndex(h=>/^valor(\s*\(r\$\))?$|montante|amount/.test(h));
  const idxDebito = cabecalho.findIndex(h=>/d[eé]bito|sa[ií]da/.test(h));
  const idxCredito = cabecalho.findIndex(h=>/cr[eé]dito|entrada/.test(h));
  const temCabecalho = idxData>=0 && (idxValor>=0 || idxDebito>=0 || idxCredito>=0);
  const linhasDados = temCabecalho ? linhas.slice(1) : linhas;
  function parseDataBR(s){
    const m = (s||'').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if(!m) return '';
    let [,d,mo,a] = m;
    if(a.length===2) a = '20'+a;
    return `${a}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  function parseNumeroBR(s){
    if(!s) return 0;
    s = String(s).replace(/[^\d,.\-]/g,'');
    if(s.includes(',')) s = s.replace(/\.(?=\d{3}(\D|$))/g,'').replace(',', '.');
    return parseFloat(s)||0;
  }
  const out = [];
  linhasDados.forEach(l=>{
    const campos = quebrarLinha(l);
    if(campos.length<2) return;
    const data = parseDataBR(idxData>=0 ? campos[idxData] : campos[0]);
    const memo = idxDesc>=0 ? campos[idxDesc] : (campos.find((c,i)=>i!==idxData&&i!==idxValor&&i!==idxDebito&&i!==idxCredito)||'');
    let valor=0, tipo='saida';
    if(idxValor>=0){
      valor = parseNumeroBR(campos[idxValor]);
      tipo = valor>=0 ? 'entrada':'saida';
      valor = Math.abs(valor);
    } else {
      const vD = idxDebito>=0 ? parseNumeroBR(campos[idxDebito]) : 0;
      const vC = idxCredito>=0 ? parseNumeroBR(campos[idxCredito]) : 0;
      if(Math.abs(vC)>0){ valor=Math.abs(vC); tipo='entrada'; } else { valor=Math.abs(vD); tipo='saida'; }
    }
    if(!data || !valor) return;
    out.push({ data, valor, tipo, memoOriginal: (memo||'').trim(), fitid: fitidSinteticoCSV(data,valor,memo) });
  });
  return out;
}
function processarArquivoOFX(){
  const contaId = document.getElementById('ofx-conta').value;
  const formato = document.getElementById('ofx-formato')?.value || 'ofx';
  const formatoDataEsc = document.getElementById('qif-formato-data')?.value || 'auto';
  const input = document.getElementById('ofx-arquivo');
  const arquivo = input?.files?.[0];
  if(!contaId){ ME('e-ofx','Selecione a conta.'); return; }
  if(!arquivo){ ME('e-ofx','Escolha um arquivo primeiro.'); return; }
  const leitor = new FileReader();
  leitor.onload = (e) => {
    let transacoes;
    try{
      if(formato==='csv') transacoes = parseCSVBancario(e.target.result);
      else if(formato==='qif'){
        const fd = formatoDataEsc==='auto' ? sugerirFormatoDataQIF(e.target.result) : formatoDataEsc;
        transacoes = parseQIFBancario(e.target.result, fd);
      }
      else transacoes = parseOFX(e.target.result);
    }
    catch(err){ ME('e-ofx',`Não consegui ler este arquivo. Confira se é um ${formato==='csv'?'.csv':formato==='qif'?'.qif':'.ofx'} válido exportado do banco/Money.`); return; }
    if(!transacoes.length){ ME('e-ofx','Nenhum lançamento encontrado neste arquivo.'); return; }
    if(formato==='qif'){
      // QIF do Money passa primeiro pelo mapeamento de categorias (criar novas
      // ou usar existentes) antes de ir pra revisão normal do Extrato.
      _qifTransacoesBrutas = transacoes; _qifContaIdBruta = contaId;
      const contagem = {};
      transacoes.forEach(t=>{ const tx=(t.categoriaTextoMoney||'').trim()||'(Sem categoria)'; contagem[tx]=(contagem[tx]||0)+1; });
      _qifCategoriasUnicasTSR = Object.entries(contagem).map(([texto,count])=>({texto,count})).sort((a,b)=>b.count-a.count);
      mostrarMapeamentoCategoriasQIF();
      return;
    }
    _ofxContaId = contaId;
    _ofxPendente = montarOfxPendente(transacoes, contaId);
    mostrarRevisaoOFX();
  };
  leitor.onerror = () => ME('e-ofx','Não foi possível ler o arquivo. Tente novamente.');
  // QIF exportado do Microsoft Money vem em ISO-8859-1 (Windows), não UTF-8 —
  // lendo como UTF-8 os acentos (Ç, Ã, Á...) viriam corrompidos.
  leitor.readAsText(arquivo, formato==='qif' ? 'ISO-8859-1' : 'UTF-8');
}
// Monta a lista de conferência (_ofxPendente) a partir das transações já
// parseadas — compartilhado entre OFX/CSV (direto) e QIF (depois da etapa
// de mapeamento de categorias). categoriaIdMoney vem preenchido só no QIF,
// depois que o mapeamento foi confirmado.
function montarOfxPendente(transacoes, contaId){
  const idsExistentes = new Set((DB.lancamentos||[]).filter(l=>l.contaId===contaId && l.fitid).map(l=>l.fitid));
  const dicionario = construirDicionarioAprendizado(contaId);
  const jaUsadosConciliacao = new Set();
  return transacoes.map(t=>{
    const jaExiste = t.fitid && idsExistentes.has(t.fitid);
    const match = casarComHistorico(t.memoOriginal, dicionario);
    const parecido = !jaExiste ? encontrarLancamentoManualParecido(t, contaId, jaUsadosConciliacao) : null;
    if(parecido) jaUsadosConciliacao.add(parecido.id);
    const categoriaIdSugerida = match ? match.categoriaId : (t.categoriaIdMoney||'');
    const centroCustoIdSugerido = match ? match.centroCustoId : (t.centroCustoIdMoney||'');
    return {
      ...t, incluir: !jaExiste && !parecido, jaExiste,
      contraparte: match?match.contraparte:t.memoOriginal,
      categoriaId: categoriaIdSugerida, direcionamento: match?match.direcionamento:'',
      centroCustoId: centroCustoIdSugerido, reconhecido: !!match,
      parecidoId: parecido?parecido.id:null,
      parecidoInfo: parecido?`Já lançado em ${fmtD(parecido.data)} — ${esc(parecido.contraparte||parecido.descricao||'sem nome')} — R$ ${fmt(parecido.valor)}`:null,
    };
  });
}
// ── MAPEAMENTO DE CATEGORIAS DO QIF (Money) ANTES DA REVISÃO ──────
// Acha uma Categoria cadastrada pelo nome (mãe + sub opcional, filtrando por
// tipo receita/despesa); cria a que faltar. Mesmo padrão de
// acharOuCriarDirecionamento, usado aqui pro mapeamento em lote do QIF.
function acharOuCriarCategoria(listaAtual, tipo, nomeMae, nomeSub){
  let lista = listaAtual;
  let mae = lista.find(c=>!c.parentId && c.tipo===tipo && c.nome===nomeMae);
  if(!mae){ mae = {id:uid(), nome:nomeMae, parentId:null, tipo, tipoPFPJ:'ambos'}; lista=[...lista, mae]; }
  if(!nomeSub) return {id:mae.id, lista};
  let sub = lista.find(c=>c.parentId===mae.id && c.nome===nomeSub);
  if(!sub){ sub = {id:uid(), nome:nomeSub, parentId:mae.id, tipo, tipoPFPJ:mae.tipoPFPJ||'ambos'}; lista=[...lista, sub]; }
  return {id:sub.id, lista};
}
// Mesma lógica, mas pra Centro de Custo (sem dimensão de tipo receita/despesa).
function acharOuCriarCentroCustoQIF(listaAtual, nomeMae, nomeSub){
  let lista = listaAtual;
  let mae = lista.find(c=>!c.parentId && c.nome===nomeMae);
  if(!mae){ mae = {id:uid(), nome:nomeMae, parentId:null, tipoPFPJ:'ambos'}; lista=[...lista, mae]; }
  if(!nomeSub) return {id:mae.id, lista};
  let sub = lista.find(c=>c.parentId===mae.id && c.nome===nomeSub);
  if(!sub){ sub = {id:uid(), nome:nomeSub, parentId:mae.id, tipoPFPJ:mae.tipoPFPJ||'ambos'}; lista=[...lista, sub]; }
  return {id:sub.id, lista};
}
// Grava várias categorias novas de uma vez só (um round-trip por arquivo
// pf/pj, em vez de um por categoria) — usado ao confirmar o mapeamento do QIF.
async function salvarNovasCategoriasEmLote(novasCategorias){
  if(!novasCategorias.length) return;
  const cadPf = await ghCadastroCarregar('pf');
  const cadPj = await ghCadastroCarregar('pj');
  cadPf.categorias = [...(cadPf.categorias||[]), ...novasCategorias];
  cadPj.categorias = [...(cadPj.categorias||[]), ...novasCategorias];
  await ghCadastroSalvar('pf', cadPf);
  await ghCadastroSalvar('pj', cadPj);
  await carregarCadastrosUnicos();
}
async function salvarNovosCentrosCustoEmLote(novosCC){
  if(!novosCC.length) return;
  const cadPf = await ghCadastroCarregar('pf');
  const cadPj = await ghCadastroCarregar('pj');
  cadPf.centrosCusto = [...(cadPf.centrosCusto||[]), ...novosCC];
  cadPj.centrosCusto = [...(cadPj.centrosCusto||[]), ...novosCC];
  await ghCadastroSalvar('pf', cadPf);
  await ghCadastroSalvar('pj', cadPj);
  await carregarCadastrosUnicos();
}
let _qifTransacoesBrutas=[], _qifContaIdBruta='', _qifCategoriasUnicasTSR=[], _qifMapaCategoriaTSR={};
function mostrarMapeamentoCategoriasQIF(){
  const conta = contaById(_qifContaIdBruta);
  const tipoConta = conta ? conta.tipo : null;
  const linhas = _qifCategoriasUnicasTSR.map((c,i)=>{
    if(c.texto==='(Sem categoria)') return '';
    const [maeTexto, subTexto] = c.texto.split(':').map(s=>s?.trim());
    const maeExistente = (DB.categorias||[]).find(x=>!x.parentId && x.nome.toLowerCase()===(maeTexto||'').toLowerCase() && itemValidoParaPFPJ(x,tipoConta));
    let matchMaeId='', matchSubId='';
    if(maeExistente){
      matchMaeId = maeExistente.id;
      if(subTexto){ const sub=(DB.categorias||[]).find(x=>x.parentId===maeExistente.id && x.nome.toLowerCase()===subTexto.toLowerCase()); if(sub) matchSubId=sub.id; }
    }
    const criarPorPadrao = !matchMaeId;
    const tipoSugerido = maeExistente ? maeExistente.tipo : 'despesa';
    return `<tr>
      <td style="font-size:12px;padding:5px 8px">${esc(c.texto)} <span style="color:var(--mut);font-size:10px">(${c.count}x)</span></td>
      <td style="text-align:center;padding:5px 4px;white-space:nowrap">
        <input type="checkbox" id="qifmapTsr${i}-criar" ${criarPorPadrao?'checked':''} onchange="aoMudarCriarNovaQIFTsr(${i})">
        <select id="qifmapTsr${i}-tipo" style="font-size:11px;margin-left:4px" ${criarPorPadrao?'':'disabled'}>
          <option value="despesa"${tipoSugerido==='despesa'?' selected':''}>Despesa</option>
          <option value="receita"${tipoSugerido==='receita'?' selected':''}>Receita</option>
        </select>
      </td>
      <td style="padding:5px 8px"><div style="display:flex;gap:4px">
        <select id="qifmapTsr${i}-categoria-mae" onchange="aoMudarMaeCascata('qifmapTsr${i}','categoria')" ${criarPorPadrao?'disabled':''} style="font-size:11px">${opcoesCategoriaMae('', tipoConta, '', matchMaeId)}</select>
        <select id="qifmapTsr${i}-categoria-sub" ${criarPorPadrao?'disabled':''} style="font-size:11px">${opcoesSubcategoria(matchMaeId, matchSubId)}</select>
      </div></td>
    </tr>`;
  }).join('');
  AM('🔗 Mapear Categorias do Money', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:12px;line-height:1.5">${_qifTransacoesBrutas.length} lançamento(s), em ${_qifCategoriasUnicasTSR.length} categoria(s) diferentes do Money. Marque <strong>"Criar nova"</strong> pra criar um cadastro igual aqui (escolhendo Despesa ou Receita), ou desmarque e escolha uma categoria já existente na cascata. As sem categoria no Money ficam sem categoria aqui também.</div>
    <div style="max-height:360px;overflow-y:auto;border:1px solid var(--bor);border-radius:8px;">
      <table style="width:100%;font-size:12px"><thead><tr style="background:var(--sur);position:sticky;top:0"><th style="text-align:left;padding:6px 8px">Categoria no Money</th><th style="padding:6px 4px">Criar nova / Tipo</th><th style="text-align:left;padding:6px 8px">Ou usar categoria existente</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      ${B('Continuar →','confirmarMapeamentoQIFTsr()','var(--acc)','#000')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function aoMudarCriarNovaQIFTsr(i){
  const criar = document.getElementById(`qifmapTsr${i}-criar`)?.checked;
  const tipoSel = document.getElementById(`qifmapTsr${i}-tipo`);
  const maeSel = document.getElementById(`qifmapTsr${i}-categoria-mae`);
  const subSel = document.getElementById(`qifmapTsr${i}-categoria-sub`);
  if(tipoSel) tipoSel.disabled = !criar;
  if(maeSel) maeSel.disabled = criar;
  if(subSel) subSel.disabled = criar;
}
async function confirmarMapeamentoQIFTsr(){
  const btn = event?.target; if(btn) btn.disabled=true;
  try{
    let categoriasAtuais = DB.categorias||[];
    const novasCriadas=[];
    const mapa={};
    _qifCategoriasUnicasTSR.forEach((c,i)=>{
      if(c.texto==='(Sem categoria)'){ mapa[c.texto]=''; return; }
      const criar = document.getElementById(`qifmapTsr${i}-criar`)?.checked;
      if(!criar){ mapa[c.texto] = valorFinalCascata('qifmapTsr'+i, 'categoria'); return; }
      const tipo = document.getElementById(`qifmapTsr${i}-tipo`)?.value || 'despesa';
      const [maeTexto, subTexto] = c.texto.split(':').map(s=>s?.trim());
      const antes = categoriasAtuais.length;
      const r = acharOuCriarCategoria(categoriasAtuais, tipo, maeTexto, subTexto);
      if(r.lista.length>antes) novasCriadas.push(...r.lista.slice(antes));
      categoriasAtuais = r.lista;
      mapa[c.texto] = r.id;
    });
    if(novasCriadas.length) await salvarNovasCategoriasEmLote(novasCriadas);
    _qifMapaCategoriaTSR = mapa;
    _qifTransacoesBrutas.forEach(t=>{ t.categoriaIdMoney = mapa[(t.categoriaTextoMoney||'').trim()||'(Sem categoria)']||''; });
    // Depois da Categoria, mapeia o Centro de Custo (2ª parte do campo L do
    // Money, "Categoria/Classe") — mesmo fluxo, uma etapa depois.
    const contagemCC = {};
    _qifTransacoesBrutas.forEach(t=>{ const tx=(t.centroCustoTextoMoney||'').trim()||'(Sem centro de custo)'; contagemCC[tx]=(contagemCC[tx]||0)+1; });
    _qifCentrosCustoUnicasTSR = Object.entries(contagemCC).map(([texto,count])=>({texto,count})).sort((a,b)=>b.count-a.count);
    mostrarMapeamentoCentroCustoQIF();
  }catch(err){
    setStatus('err', 'Erro ao criar categorias: '+err.message);
  }finally{
    if(btn) btn.disabled=false;
  }
}
let _qifCentrosCustoUnicasTSR=[];
function mostrarMapeamentoCentroCustoQIF(){
  const conta = contaById(_qifContaIdBruta);
  const tipoConta = conta ? conta.tipo : null;
  const linhas = _qifCentrosCustoUnicasTSR.map((c,i)=>{
    if(c.texto==='(Sem centro de custo)') return '';
    const [maeTexto, subTexto] = c.texto.split(':').map(s=>s?.trim());
    const maeExistente = (DB.centrosCusto||[]).find(x=>!x.parentId && x.nome.toLowerCase()===(maeTexto||'').toLowerCase() && itemValidoParaPFPJ(x,tipoConta));
    let matchMaeId='', matchSubId='';
    if(maeExistente){
      matchMaeId = maeExistente.id;
      if(subTexto){ const sub=(DB.centrosCusto||[]).find(x=>x.parentId===maeExistente.id && x.nome.toLowerCase()===subTexto.toLowerCase()); if(sub) matchSubId=sub.id; }
    }
    const criarPorPadrao = !matchMaeId;
    return `<tr>
      <td style="font-size:12px;padding:5px 8px">${esc(c.texto)} <span style="color:var(--mut);font-size:10px">(${c.count}x)</span></td>
      <td style="text-align:center;padding:5px 4px;white-space:nowrap">
        <input type="checkbox" id="qifmapCC${i}-criar" ${criarPorPadrao?'checked':''} onchange="aoMudarCriarNovaCCQIFTsr(${i})">
      </td>
      <td style="padding:5px 8px"><div style="display:flex;gap:4px">
        <select id="qifmapCC${i}-cc-mae" onchange="aoMudarMaeCascata('qifmapCC${i}','cc')" ${criarPorPadrao?'disabled':''} style="font-size:11px">${opcoesCentroCustoMae(tipoConta, matchMaeId)}</select>
        <select id="qifmapCC${i}-cc-sub" ${criarPorPadrao?'disabled':''} style="font-size:11px">${opcoesSubCentroCusto(matchMaeId, matchSubId)}</select>
      </div></td>
    </tr>`;
  }).join('');
  AM('🔗 Mapear Centro de Custo do Money', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:12px;line-height:1.5">${_qifCentrosCustoUnicasTSR.length} centro(s) de custo diferente(s) do Money (2ª parte do campo Categoria/Classe). Marque <strong>"Criar novo"</strong> pra criar um cadastro igual aqui, ou desmarque e escolha um já existente na cascata.</div>
    <div style="max-height:360px;overflow-y:auto;border:1px solid var(--bor);border-radius:8px;">
      <table style="width:100%;font-size:12px"><thead><tr style="background:var(--sur);position:sticky;top:0"><th style="text-align:left;padding:6px 8px">Centro de Custo no Money</th><th style="padding:6px 4px">Criar novo</th><th style="text-align:left;padding:6px 8px">Ou usar centro de custo existente</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      ${B('Continuar →','confirmarMapeamentoCCQIFTsr()','var(--acc)','#000')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function aoMudarCriarNovaCCQIFTsr(i){
  const criar = document.getElementById(`qifmapCC${i}-criar`)?.checked;
  const maeSel = document.getElementById(`qifmapCC${i}-cc-mae`);
  const subSel = document.getElementById(`qifmapCC${i}-cc-sub`);
  if(maeSel) maeSel.disabled = criar;
  if(subSel) subSel.disabled = criar;
}
async function confirmarMapeamentoCCQIFTsr(){
  const btn = event?.target; if(btn) btn.disabled=true;
  try{
    let ccAtuais = DB.centrosCusto||[];
    const novosCriados=[];
    const mapa={};
    _qifCentrosCustoUnicasTSR.forEach((c,i)=>{
      if(c.texto==='(Sem centro de custo)'){ mapa[c.texto]=''; return; }
      const criar = document.getElementById(`qifmapCC${i}-criar`)?.checked;
      if(!criar){ mapa[c.texto] = valorFinalCascata('qifmapCC'+i, 'cc'); return; }
      const [maeTexto, subTexto] = c.texto.split(':').map(s=>s?.trim());
      const antes = ccAtuais.length;
      const r = acharOuCriarCentroCustoQIF(ccAtuais, maeTexto, subTexto);
      if(r.lista.length>antes) novosCriados.push(...r.lista.slice(antes));
      ccAtuais = r.lista;
      mapa[c.texto] = r.id;
    });
    if(novosCriados.length) await salvarNovosCentrosCustoEmLote(novosCriados);
    _qifTransacoesBrutas.forEach(t=>{ t.centroCustoIdMoney = mapa[(t.centroCustoTextoMoney||'').trim()||'(Sem centro de custo)']||''; });
    _ofxContaId = _qifContaIdBruta;
    _ofxPendente = montarOfxPendente(_qifTransacoesBrutas, _qifContaIdBruta);
    mostrarRevisaoOFX();
  }catch(err){
    setStatus('err', 'Erro ao criar centros de custo: '+err.message);
  }finally{
    if(btn) btn.disabled=false;
  }
}
function alternarTodosOFX(marcar){
  _ofxPendente.forEach(t=>t.incluir=marcar);
  mostrarRevisaoOFX();
}
function mostrarRevisaoOFX(){
  const conta = contaById(_ofxContaId);
  const tipoConta = conta ? conta.tipo : null;
  const reconhecidos = _ofxPendente.filter(t=>t.reconhecido).length;
  const duplicados = _ofxPendente.filter(t=>t.jaExiste).length;
  const conciliaveis = _ofxPendente.filter(t=>t.parecidoId && !t.jaExiste).length;
  const todosMarcados = _ofxPendente.length>0 && _ofxPendente.every(t=>t.incluir);
  const linhas = _ofxPendente.map((t,i)=>`<tr style="${t.jaExiste?'opacity:.5':''}">
    <td><input type="checkbox" ${t.incluir?'checked':''} onchange="_ofxPendente[${i}].incluir=this.checked">${t.jaExiste?' <span style="font-size:10px;color:var(--mut)">(já importado)</span>':''}${t.parecidoId&&!t.jaExiste?` <span style="font-size:10px;color:#f0a500" title="${esc(t.parecidoInfo||'')}">🔗 conciliar</span>`:''}</td>
    <td>${fmtD(t.data)}</td>
    <td><input type="text" value="${esc(t.contraparte)}" style="width:100%;font-size:11px" onchange="_ofxPendente[${i}].contraparte=this.value">${t.reconhecido?' <span title="Reconhecido pelo histórico">✓</span>':''}</td>
    <td><div style="display:flex;gap:2px"><select id="ofxrev${i}-categoria-mae" onchange="aoMudarMaeCascataFixo('ofxrev${i}','categoria');_ofxPendente[${i}].categoriaId=valorFinalCascata('ofxrev${i}','categoria')" style="font-size:10px;width:85px">${opcoesCategoriaMae(t.tipo==='entrada'?'receita':'despesa',tipoConta,'',idsMaeSub(categoriaById(t.categoriaId)).maeId)}</select><select id="ofxrev${i}-categoria-sub" onchange="_ofxPendente[${i}].categoriaId=valorFinalCascata('ofxrev${i}','categoria')" style="font-size:10px;width:75px">${opcoesSubcategoria(idsMaeSub(categoriaById(t.categoriaId)).maeId, idsMaeSub(categoriaById(t.categoriaId)).subId)}</select></div></td>
    <td><input type="text" value="${esc(t.direcionamento)}" style="width:100%;font-size:11px" list="dl-direcionamentos-ofx" onchange="_ofxPendente[${i}].direcionamento=this.value"></td>
    <td style="text-align:right;color:${t.tipo==='entrada'?'#3fb950':'#f85149'};font-weight:700">${t.tipo==='entrada'?'+':'-'} R$ ${fmt(t.valor)}</td>
  </tr>`).join('');
  AM('🔍 Conferir Antes de Importar', `
    <datalist id="dl-direcionamentos-ofx">${direcionamentosExistentes(tipoConta).map(d=>`<option value="${esc(d)}">`).join('')}</datalist>
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">
      Conta: <strong>${esc(conta?conta.titular:'-')}</strong> · ${_ofxPendente.length} lançamento(s) encontrado(s) ·
      <span style="color:#3fb950">${reconhecidos} reconhecido(s) pelo histórico</span>
      ${duplicados?` · <span style="color:#f0a500">${duplicados} já importado(s) antes (desmarcados)</span>`:''}
      ${conciliaveis?` · <span style="color:#f0a500">${conciliaveis} parece(m) já ter sido digitado(s) manualmente — desmarcados, vão ser conciliados com o que já existe em vez de duplicar</span>`:''}
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th><input type="checkbox" ${todosMarcados?'checked':''} onchange="alternarTodosOFX(this.checked)" title="Marcar/desmarcar todos"></th><th>Data</th><th>Fornecedor/Cliente</th><th>Categoria</th><th>Direcionamento</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${B('✅ Confirmar Importação','confirmarImportacaoOFX()','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarImportacaoOFX(){
  const selecionados = _ofxPendente.filter(t=>t.incluir);
  const paraConciliar = _ofxPendente.filter(t=>!t.incluir && t.parecidoId && !t.jaExiste);
  if(!selecionados.length && !paraConciliar.length){ _ofxPendente=[]; _ofxContaId=''; FM(); return; }
  let direcionamentosAtuais = DB.direcionamentos||[];
  const novos = selecionados.map(t=>{
    let direcionamentoId = null;
    if(t.direcionamento){
      const partes = t.direcionamento.split(':').map(s=>s.trim());
      const r = acharOuCriarDirecionamento(direcionamentosAtuais, partes[0], partes[1]||'');
      direcionamentosAtuais = r.lista;
      direcionamentoId = r.id;
    }
    return {
      id: uid(), contaId: _ofxContaId, data: t.data, tipo: t.tipo, valor: t.valor,
      categoriaId: t.categoriaId||'', centroCustoId: t.centroCustoId||'',
      contraparte: t.contraparte, direcionamento: t.direcionamento||'', direcionamentoId,
      descricao: t.memoOriginal, origem: 'ofx', fitid: t.fitid||null, contaPagarId: null,
      criadoEm: new Date().toISOString(),
    };
  });
  let lancamentos = [...(DB.lancamentos||[]), ...novos];
  // Concilia: em vez de criar um segundo lançamento igual, marca o que você já
  // tinha digitado manualmente como "conferido com o banco" (ganha um fitid).
  paraConciliar.forEach(t=>{
    lancamentos = lancamentos.map(l=> (l.id===t.parecidoId && !l.fitid) ? {...l, fitid: t.fitid||('conc_'+uid())} : l);
  });
  salvar({...DB, lancamentos, direcionamentos: direcionamentosAtuais});
  _ofxPendente = []; _ofxContaId = '';
  FM();
  const msgConc = paraConciliar.length ? ` · ${paraConciliar.length} conciliado(s) com lançamentos já digitados` : '';
  setStatus('ok', `✅ ${novos.length} lançamento(s) importado(s)${msgConc}`);
  setTimeout(()=>{document.getElementById('status').style.display='none';},4500);
}
function opcoesContasFiltradas(selId){
  return contasFiltradasPFPJ().map(c=>`<option value="${c.id}"${c.id===selId?' selected':''}>${esc(nomeConta(c))}</option>`).join('');
}
function opcoesCategorias(tipo,selId,centroCustoId,tipoConta){
  const todas = (DB.categorias||[]).filter(c=>(!tipo||c.tipo===tipo)&&categoriaValidaParaCC(c,centroCustoId)&&itemValidoParaPFPJ(c,tipoConta));
  const pais = todas.filter(c=>!c.parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const filhosDe = pid => todas.filter(c=>c.parentId===pid).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  let html = '';
  pais.forEach(p=>{
    html += `<option value="${p.id}"${p.id===selId?' selected':''}>${esc(p.nome)}</option>`;
    filhosDe(p.id).forEach(f=>{
      html += `<option value="${f.id}"${f.id===selId?' selected':''}>&nbsp;&nbsp;— ${esc(f.nome)}</option>`;
    });
  });
  // Subcategoria cuja mãe não passou nesse filtro específico (ex: vínculo de
  // Centro de Custo diferente) — mostra solta no fim, com nome completo pra
  // não perder o contexto de qual categoria-mãe ela pertence.
  const idsPaisMostrados = new Set(pais.map(p=>p.id));
  todas.filter(c=>c.parentId && !idsPaisMostrados.has(c.parentId)).forEach(f=>{
    html += `<option value="${f.id}"${f.id===selId?' selected':''}>${esc(nomeCompletoCategoria(f))}</option>`;
  });
  return html;
}
function opcoesCC(selId,tipoConta){
  const todos = (DB.centrosCusto||[]).filter(c=>itemValidoParaPFPJ(c,tipoConta));
  const pais = todos.filter(c=>!c.parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const filhosDe = pid => todos.filter(c=>c.parentId===pid).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  let html = '';
  pais.forEach(p=>{
    html += `<option value="${p.id}"${p.id===selId?' selected':''}>${esc(p.nome)}</option>`;
    filhosDe(p.id).forEach(f=>{
      html += `<option value="${f.id}"${f.id===selId?' selected':''}>&nbsp;&nbsp;— ${esc(f.nome)}</option>`;
    });
  });
  const idsPaisMostrados = new Set(pais.map(p=>p.id));
  todos.filter(c=>c.parentId && !idsPaisMostrados.has(c.parentId)).forEach(f=>{
    html += `<option value="${f.id}"${f.id===selId?' selected':''}>${esc(nomeCompletoCentroCusto(f))}</option>`;
  });
  return html;
}
// ══════════════════════════════════════════
// SELETORES EM CASCATA (Mãe → Sub) — estilo Microsoft Money: um dropdown
// pra escolher a Categoria/Centro de Custo/Direcionamento "mãe" e outro,
// dependente, só com as SUBdivisões daquela mãe. A pedido do Fabio, usado
// no Novo Lançamento e na Edição de Lançamento (referência: imagem do Money
// mostrando Categoria/Centro de Custo/Direcionamento cada um com 2 campos).
// ══════════════════════════════════════════
function opcoesCategoriaMae(tipoReceitaDespesa, tipoConta, centroCustoId, selMaeId){
  const maes = categoriasPorTipoConta(tipoReceitaDespesa, tipoConta, centroCustoId).filter(c=>!c.parentId)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return '<option value="">— Selecione —</option>' + maes.map(c=>`<option value="${c.id}"${c.id===selMaeId?' selected':''}>${esc(c.nome)}</option>`).join('');
}
function opcoesSubcategoria(maeId, selSubId){
  if(!maeId) return '<option value="">—</option>';
  const filhos = (DB.categorias||[]).filter(c=>c.parentId===maeId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(!filhos.length) return '<option value="">— Nenhuma —</option>';
  return '<option value="">— Nenhuma (usar a categoria-mãe) —</option>' + filhos.map(c=>`<option value="${c.id}"${c.id===selSubId?' selected':''}>${esc(c.nome)}</option>`).join('');
}
function opcoesCentroCustoMae(tipoConta, selMaeId){
  const maes = (DB.centrosCusto||[]).filter(c=>!c.parentId && itemValidoParaPFPJ(c,tipoConta)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return '<option value="">-</option>' + maes.map(c=>`<option value="${c.id}"${c.id===selMaeId?' selected':''}>${esc(c.nome)}</option>`).join('');
}
function opcoesSubCentroCusto(maeId, selSubId){
  if(!maeId) return '<option value="">—</option>';
  const filhos = (DB.centrosCusto||[]).filter(c=>c.parentId===maeId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(!filhos.length) return '<option value="">— Nenhum —</option>';
  return '<option value="">— Nenhum (usar o centro-mãe) —</option>' + filhos.map(c=>`<option value="${c.id}"${c.id===selSubId?' selected':''}>${esc(c.nome)}</option>`).join('');
}
function opcoesDirecionamentoMae(tipoConta, selMaeId){
  const maes = (DB.direcionamentos||[]).filter(d=>!d.parentId && itemValidoParaPFPJ(d,tipoConta)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return '<option value="">-</option>' + maes.map(d=>`<option value="${d.id}"${d.id===selMaeId?' selected':''}>${esc(d.nome)}</option>`).join('');
}
function opcoesSubDirecionamento(maeId, selSubId){
  if(!maeId) return '<option value="">—</option>';
  const filhos = (DB.direcionamentos||[]).filter(d=>d.parentId===maeId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(!filhos.length) return '<option value="">— Nenhum —</option>';
  return '<option value="">— Nenhum (usar o direcionamento-mãe) —</option>' + filhos.map(d=>`<option value="${d.id}"${d.id===selSubId?' selected':''}>${esc(d.nome)}</option>`).join('');
}
// Ao trocar a mãe, repopula o select de sub (limpo) — mesmo padrão pras 3 dimensões.
function aoMudarMaeCascata(prefixo, campo){
  const maeSel = document.getElementById(`${prefixo}-${campo}-mae`);
  const subSel = document.getElementById(`${prefixo}-${campo}-sub`);
  if(!maeSel || !subSel) return;
  const maeId = maeSel.value;
  if(campo==='categoria') subSel.innerHTML = opcoesSubcategoria(maeId, '');
  else if(campo==='cc') subSel.innerHTML = opcoesSubCentroCusto(maeId, '');
  else if(campo==='direc') subSel.innerHTML = opcoesSubDirecionamento(maeId, '');
  if(campo==='categoria' || campo==='cc') atualizarSugestoesConta(prefixo);
}
// Versão "leve" da troca de mãe — só repopula o sub, sem disparar o reflow
// completo do formulário de Lançamento (que tem tipo Entrada/Saída dinâmico
// e Direcionamento). Usada em formulários de tipo fixo — Conta a Pagar/
// Receber, Cheque Emitido — e em filtros, onde não há isso pra recalcular.
function aoMudarMaeCascataFixo(prefixo, campo){
  const maeSel = document.getElementById(`${prefixo}-${campo}-mae`);
  const subSel = document.getElementById(`${prefixo}-${campo}-sub`);
  if(!maeSel || !subSel) return;
  if(campo==='categoria') subSel.innerHTML = opcoesSubcategoria(maeSel.value, '');
  else if(campo==='cc') subSel.innerHTML = opcoesSubCentroCusto(maeSel.value, '');
  else if(campo==='direc') subSel.innerHTML = opcoesSubDirecionamento(maeSel.value, '');
}
// Resolve o ID final (sub, se escolhida; senão a mãe) — usado ao salvar.
function valorFinalCascata(prefixo, campo){
  const sub = document.getElementById(`${prefixo}-${campo}-sub`)?.value||'';
  if(sub) return sub;
  return document.getElementById(`${prefixo}-${campo}-mae`)?.value||'';
}
// Resolve o Direcionamento final pros dois campos que o lançamento salva:
// o ID de verdade (novo) e o texto (mantido só por compatibilidade com
// relatórios/filtros que ainda leem a string).
function direcionamentoFinal(prefixo){
  const id = valorFinalCascata(prefixo,'direc');
  return { direcionamentoId: id||null, direcionamento: id?nomeCompletoDirecionamento(direcionamentoById(id)):'' };
}
// Dado um item com parentId (categoria, centro de custo ou direcionamento),
// resolve o par {maeId, subId} pra pré-selecionar os dois dropdowns em
// cascata ao editar.
function idsMaeSub(item){
  if(!item) return {maeId:'', subId:''};
  if(item.parentId) return {maeId:item.parentId, subId:item.id};
  return {maeId:item.id, subId:''};
}
// Uma categoria sem centrosCustoIds (ou array vazio) é "genérica" e aparece
// em qualquer Centro de Custo. Se tiver centrosCustoIds preenchido, só
// aparece quando o Centro de Custo selecionado estiver na lista dela.
function categoriaValidaParaCC(categoria, centroCustoId){
  const vinculos = categoria.centrosCustoIds||[];
  if(!vinculos.length) return true;
  if(!centroCustoId) return true;
  return vinculos.includes(centroCustoId);
}

// ══════════════════════════════════════════
// CRUD — LANÇAMENTOS
// ══════════════════════════════════════════
function novoLancamento(contaIdPre){
  AM('➕ Novo Lançamento',`
    ${EH('e-lanc')}
    <div class="row">
      ${C('<span id="lc-conta-label">Conta *</span>',`<select id="lc-conta" onchange="atualizarSugestoesConta('lc')">${opcoesContas(contaIdPre)}</select>`,'2','200')}
      ${C('Data *',`<input type="date" id="lc-data" value="${hoje()}">`,'1','150')}
    </div>
    <div class="row" id="lc-destino-wrap" style="display:none">
      ${C('Conta Destino *',`<select id="lc-conta-destino">${opcoesContas()}</select>`,'2','200')}
    </div>
    <div class="row">
      ${C('Tipo *',`<select id="lc-tipo" onchange="atualizarSugestoesConta('lc');atualizarLabelRecorrencia();atualizarUITipoLancamento('lc')"><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="transferencia">Transferência</option></select>`,'1','140')}
      ${C('Valor (R$) *',`<input id="lc-valor" placeholder="0,00">`,'1','150')}
    </div>
    <div class="row" id="lc-categoria-wrap">
      ${C('Categoria',`<select id="lc-categoria-mae" onchange="aoMudarMaeCascata('lc','categoria')">${opcoesCategoriaMae('receita', tipoDaConta(contaIdPre), '', '')}</select>`,'1','160')}
      ${C('Subcategoria',`<select id="lc-categoria-sub">${opcoesSubcategoria('', '')}</select>`,'1','160')}
    </div>
    <div class="row">
      ${C('Centro de Custo',`<select id="lc-cc-mae" onchange="aoMudarMaeCascata('lc','cc')">${opcoesCentroCustoMae(tipoDaConta(contaIdPre), '')}</select>`,'1','160')}
      ${C('Sub-Centro de Custo',`<select id="lc-cc-sub">${opcoesSubCentroCusto('', '')}</select>`,'1','160')}
    </div>
    ${C('Cliente / Fornecedor (opcional)',`<input id="lc-contraparte" list="dl-contrapartes" placeholder="Quem pagou ou recebeu" oninput="sugerirPorContraparteLC('lc')">
      <datalist id="dl-contrapartes">${opcoesDatalist(contrapartesPorTipoConta(tipoDaConta(contaIdPre)))}</datalist>`)}
    <div id="lc-dica-contraparte" style="display:none;font-size:11px;color:var(--acc);margin:-6px 0 8px">🔁 Categoria/direcionamento sugeridos com base no histórico desse beneficiário — pode trocar à vontade.</div>
    <div class="row">
      ${C('Direcionamento',`<select id="lc-direc-mae" onchange="aoMudarMaeCascata('lc','direc')">${opcoesDirecionamentoMae(tipoDaConta(contaIdPre), '')}</select>`,'1','160')}
      ${C('Sub-Direcionamento',`<select id="lc-direc-sub">${opcoesSubDirecionamento('', '')}</select>`,'1','160')}
    </div>
    ${C('Descrição / Histórico',`<input id="lc-desc" list="dl-descricoes" placeholder="Ex: recebimento cliente X">
      <datalist id="dl-descricoes">${descricoesExistentes().map(d=>`<option value="${esc(d)}">`).join('')}</datalist>`)}
    <div id="lc-tipo-info" style="font-size:11px;color:var(--mut);margin:-4px 0 8px"></div>

    <div class="card" id="lc-recorrencia-wrap" style="margin:10px 0;padding:10px;background:var(--sur)">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13px">
        <input type="checkbox" id="lc-recorrente" onchange="document.getElementById('lc-recorrencia-opcoes').style.display=this.checked?'block':'none'">
        🔁 Replicar automaticamente em <span id="lc-rec-label">Contas a Receber</span>
      </label>
      <div id="lc-recorrencia-opcoes" style="display:none;margin-top:10px">
        <div style="font-size:11px;color:var(--mut);margin-bottom:8px">Cria os próximos lançamentos já pendentes em Contas a Pagar/Receber, repetindo favorecido, valor, categoria e conta deste — pra você não ter que redigitar todo mês.</div>
        <div class="row">
          ${C('Periodicidade',`<select id="lc-rec-periodo"><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select>`,'1','150')}
          ${C('Quantas vezes replicar',`<input type="number" id="lc-rec-qtd" min="1" max="60" value="12">`,'1','150')}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoLancamento()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
  atualizarSugestoesConta('lc');
  atualizarLabelRecorrencia();
  atualizarUITipoLancamento('lc');
}
function atualizarUITipoLancamento(prefixo){
  const tipoEl = document.getElementById(prefixo+'-tipo');
  if(!tipoEl) return;
  const ehTransf = tipoEl.value==='transferencia';
  const destinoWrap = document.getElementById(prefixo+'-destino-wrap');
  const catWrap = document.getElementById(prefixo+'-categoria-wrap');
  const recWrap = document.getElementById(prefixo+'-recorrencia-wrap');
  const contaLabel = document.getElementById(prefixo+'-conta-label');
  if(destinoWrap) destinoWrap.style.display = ehTransf ? 'flex' : 'none';
  if(catWrap) catWrap.style.display = ehTransf ? 'none' : 'block';
  if(recWrap) recWrap.style.display = ehTransf ? 'none' : 'block';
  if(contaLabel) contaLabel.textContent = ehTransf ? 'Conta Origem *' : 'Conta *';
}
function atualizarLabelRecorrencia(prefixo){
  prefixo = prefixo || 'lc';
  const tipoEl = document.getElementById(prefixo+'-tipo');
  const label = document.getElementById(prefixo+'-rec-label');
  if(!tipoEl || !label) return;
  label.textContent = tipoEl.value==='saida' ? 'Contas a Pagar' : 'Contas a Receber';
}
// ══════════════════════════════════════════
// 🔀 SUGESTÕES SEPARADAS POR PF/PJ — a pedido de Fabio: fornecedor,
// cliente e categoria sugeridos no lançamento levam em conta o
// histórico de uso em contas do MESMO tipo (PF ou PJ) da conta
// selecionada, pra não misturar o histórico dos dois lados. Se nunca
// foi usado nenhum fornecedor/categoria com esse tipo ainda, mostra
// todos (não trava o usuário numa lista vazia).
// ══════════════════════════════════════════
function tipoDaConta(contaId){
  const c = contaById(contaId);
  return c ? c.tipo : null;
}
function contrapartesPorTipoConta(tipo){
  const todos = [...(DB.clientes||[]),...(DB.fornecedores||[])];
  return todos.filter(x=>itemValidoParaPFPJ(x,tipo));
}
function direcionamentosExistentes(tipoConta){
  const vistos = new Set();
  (DB.direcionamentos||[]).forEach(d=>{ if(d.nome && itemValidoParaPFPJ(d,tipoConta)) vistos.add(nomeCompletoDirecionamento(d)); });
  // Texto livre já usado em lançamentos mas ainda não cadastrado formalmente
  // como Direcionamento — só entra no filtro se bater com o tipo de conta certo.
  const nomesCadastrados = new Set((DB.direcionamentos||[]).map(d=>nomeCompletoDirecionamento(d)));
  const tipoContaId = {}; (DB.contas||[]).forEach(c=>{ tipoContaId[c.id]=c.tipo; });
  (DB.lancamentos||[]).forEach(l=>{
    if(!l.direcionamento || nomesCadastrados.has(l.direcionamento)) return;
    if(tipoConta && tipoContaId[l.contaId] && tipoContaId[l.contaId]!==tipoConta) return;
    vistos.add(l.direcionamento);
  });
  return [...vistos].sort();
}
function descricoesExistentes(){
  const vistos = new Set();
  (DB.lancamentos||[]).forEach(l=>{ if(l.descricao) vistos.add(l.descricao); });
  return [...vistos].sort();
}
function contrapartesExistentes(){
  const vistos = new Set();
  (DB.lancamentos||[]).forEach(l=>{ if(l.contraparte) vistos.add(l.contraparte); });
  return [...vistos].sort();
}
function categoriasPorTipoConta(tipoReceitaDespesa, tipoConta, centroCustoId){
  // CORRIGIDO 20/07/2026: antes isso só REORDENAVA por histórico de uso, sem
  // nunca esconder nenhuma categoria — a pedido de Fabio, agora filtra de
  // verdade pelo campo tipoPFPJ da categoria (separação estrita PF/PJ).
  return (DB.categorias||[]).filter(c=>(!tipoReceitaDespesa||c.tipo===tipoReceitaDespesa)&&categoriaValidaParaCC(c,centroCustoId)&&itemValidoParaPFPJ(c,tipoConta));
}
function atualizarSugestoesConta(prefixo){
  const contaEl = document.getElementById(prefixo+'-conta');
  const tipoConta = tipoDaConta(contaEl?.value);
  const dl = document.getElementById(prefixo==='elc' ? 'dl-contrapartes-ed' : 'dl-contrapartes');
  if(dl) dl.innerHTML = opcoesDatalist(contrapartesPorTipoConta(tipoConta));

  const tipoLancEl = document.getElementById(prefixo+'-tipo');
  const tipoLanc = tipoLancEl ? (tipoLancEl.value==='entrada'?'receita':'despesa') : null;

  // Centro de Custo (mãe → sub) — refiltra pelo tipo de conta
  const ccMaeEl = document.getElementById(prefixo+'-cc-mae');
  if(ccMaeEl){
    const ccAtual = ccMaeEl.value;
    ccMaeEl.innerHTML = opcoesCentroCustoMae(tipoConta, ccAtual);
    if(![...ccMaeEl.options].some(o=>o.value===ccAtual)) ccMaeEl.value='';
    const ccSubEl = document.getElementById(prefixo+'-cc-sub');
    if(ccSubEl) ccSubEl.innerHTML = opcoesSubCentroCusto(ccMaeEl.value, ccSubEl.value);
  }
  const centroCustoId = valorFinalCascata(prefixo,'cc');

  // Categoria (mãe → sub) — refiltra por tipo receita/despesa, tipo de conta e CC
  const catMaeEl = document.getElementById(prefixo+'-categoria-mae');
  if(catMaeEl){
    const catAtual = catMaeEl.value;
    catMaeEl.innerHTML = opcoesCategoriaMae(tipoLanc, tipoConta, centroCustoId, catAtual);
    if(![...catMaeEl.options].some(o=>o.value===catAtual)) catMaeEl.value='';
    const catSubEl = document.getElementById(prefixo+'-categoria-sub');
    if(catSubEl) catSubEl.innerHTML = opcoesSubcategoria(catMaeEl.value, catSubEl.value);
  }

  // Direcionamento (mãe → sub) — refiltra pelo tipo de conta
  const direcMaeEl = document.getElementById(prefixo+'-direc-mae');
  if(direcMaeEl){
    const direcAtual = direcMaeEl.value;
    direcMaeEl.innerHTML = opcoesDirecionamentoMae(tipoConta, direcAtual);
    if(![...direcMaeEl.options].some(o=>o.value===direcAtual)) direcMaeEl.value='';
    const direcSubEl = document.getElementById(prefixo+'-direc-sub');
    if(direcSubEl) direcSubEl.innerHTML = opcoesSubDirecionamento(direcMaeEl.value, direcSubEl.value);
  }

  const info = document.getElementById(prefixo+'-tipo-info');
  if(info){
    const partesInfo = [];
    if(tipoConta) partesInfo.push(`somente cadastros PF/Ambos ou PJ/Ambos, conforme a conta ${tipoConta}`);
    if(centroCustoId) partesInfo.push('categorias vinculadas ao Centro de Custo selecionado');
    info.textContent = partesInfo.length ? `Sugestões filtradas por: ${partesInfo.join(' e ')}.` : '';
  }
}
function proximaDataRecorrencia(data, periodo){
  const d = new Date(data+'T12:00:00');
  if(periodo==='semanal') d.setDate(d.getDate()+7);
  else if(periodo==='quinzenal') d.setDate(d.getDate()+15);
  else d.setMonth(d.getMonth()+1); // mensal
  return d.toISOString().slice(0,10);
}
function salvarNovaTransferencia(){
  const contaOrigemId = document.getElementById('lc-conta').value;
  const contaDestinoId = document.getElementById('lc-conta-destino').value;
  const valor = parseValor(document.getElementById('lc-valor').value);
  const data = document.getElementById('lc-data').value||hoje();
  const descricao = document.getElementById('lc-desc').value.trim();
  const centroCustoId = valorFinalCascata('lc','cc');
  const direc = direcionamentoFinal('lc');
  if(!contaOrigemId){ ME('e-lanc','Selecione a conta de origem.'); return; }
  if(!contaDestinoId){ ME('e-lanc','Selecione a conta de destino.'); return; }
  if(contaOrigemId===contaDestinoId){ ME('e-lanc','A conta de origem e a conta de destino não podem ser a mesma.'); return; }
  if(!valor||valor<=0){ ME('e-lanc','Informe um valor válido maior que zero.'); return; }
  const transferenciaId = uid();
  const nomeOrigem = nomeConta(contaById(contaOrigemId));
  const nomeDestino = nomeConta(contaById(contaDestinoId));
  const agora = new Date().toISOString();
  const saida = {
    id:uid(), contaId:contaOrigemId, data, tipo:'saida', valor,
    categoriaId:'', centroCustoId,
    contraparte:'', ...direc,
    descricao: descricao || `Transferência para ${nomeDestino}`,
    origem:'transferencia', transferenciaId, contaVinculadaId:contaDestinoId, contaPagarId:null,
    criadoEm: agora
  };
  const entrada = {
    id:uid(), contaId:contaDestinoId, data, tipo:'entrada', valor,
    categoriaId:'', centroCustoId,
    contraparte:'', ...direc,
    descricao: descricao || `Transferência de ${nomeOrigem}`,
    origem:'transferencia', transferenciaId, contaVinculadaId:contaOrigemId, contaPagarId:null,
    criadoEm: agora
  };
  const novoDB = {...DB, lancamentos:[...(DB.lancamentos||[]), saida, entrada]};
  salvar(novoDB);
  FM();
}
function salvarNovoLancamento(){
  const tipo = document.getElementById('lc-tipo').value;
  if(tipo==='transferencia'){ salvarNovaTransferencia(); return; }
  const contaId = document.getElementById('lc-conta').value;
  const valor = parseValor(document.getElementById('lc-valor').value);
  if(!contaId){ ME('e-lanc','Selecione a conta.'); return; }
  if(!valor||valor<=0){ ME('e-lanc','Informe um valor válido maior que zero.'); return; }
  const novo = {
    id:uid(), contaId,
    data: document.getElementById('lc-data').value||hoje(),
    tipo: document.getElementById('lc-tipo').value,
    valor,
    categoriaId: valorFinalCascata('lc','categoria'),
    centroCustoId: valorFinalCascata('lc','cc'),
    contraparte: document.getElementById('lc-contraparte').value.trim(),
    ...direcionamentoFinal('lc'),
    descricao: document.getElementById('lc-desc').value.trim(),
    origem:'manual', contaPagarId:null,
    criadoEm: new Date().toISOString()
  };
  let novoDB = {...DB, lancamentos:[...(DB.lancamentos||[]), novo]};

  const recorrente = document.getElementById('lc-recorrente')?.checked;
  if(recorrente){
    const periodo = document.getElementById('lc-rec-periodo').value;
    const qtd = Math.max(1, Math.min(60, Number(document.getElementById('lc-rec-qtd').value)||1));
    const ehPagar = novo.tipo==='saida';
    const novasContas = [];
    let dataAtual = novo.data;
    for(let i=0;i<qtd;i++){
      dataAtual = proximaDataRecorrencia(dataAtual, periodo);
      const base = {
        id:uid(), valor:novo.valor, vencimento:dataAtual,
        categoriaId:novo.categoriaId, centroCustoId:novo.centroCustoId, contaId:novo.contaId,
        lancamentoId:null,
        obs:`Replicado automaticamente a partir do lançamento de ${fmtD(novo.data)}${novo.descricao?' — '+novo.descricao:''}`,
        criadoEm:new Date().toISOString()
      };
      if(ehPagar){
        novasContas.push({...base, favorecido:novo.contraparte||'(replicado)', fornecedorId:fornecedorIdPorNome(novo.contraparte), status:'pendente', dataPagamento:null, valorPago:null});
      } else {
        novasContas.push({...base, cliente:novo.contraparte||'(replicado)', clienteId:clienteIdPorNome(novo.contraparte), status:'pendente', dataRecebimento:null, valorRecebido:null});
      }
    }
    if(ehPagar) novoDB = {...novoDB, contasPagar:[...(DB.contasPagar||[]), ...novasContas]};
    else novoDB = {...novoDB, contasReceber:[...(DB.contasReceber||[]), ...novasContas]};
  }

  salvar(novoDB);
  FM();
}
function salvarEdicaoTransferencia(transferenciaId){
  const data = document.getElementById('etf-data').value;
  const valor = parseValor(document.getElementById('etf-valor').value);
  const descricao = document.getElementById('etf-desc').value.trim();
  if(!data){ ME('e-lanc-transf','Informe a data.'); return; }
  if(!valor||valor<=0){ ME('e-lanc-transf','Informe um valor válido maior que zero.'); return; }
  const novoDb = {...DB, lancamentos:(DB.lancamentos||[]).map(l=>{
    if(l.transferenciaId!==transferenciaId) return l;
    return {...l, data, valor, descricao: descricao || l.descricao};
  })};
  salvar(novoDb);
  FM();
}
function editarLancamento(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  if(l.origem==='pagamento'){
    AM('ℹ Lançamento de Pagamento',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento foi gerado automaticamente pelo pagamento de uma Conta a Pagar.<br><br>
        Para alterá-lo, cancele o pagamento na aba <strong>Contas a Pagar</strong> — isso reverterá o lançamento e devolverá a conta para "pendente".
      </div>
      <div style="margin-top:14px">${B('Entendi','FM()','var(--sur)','var(--txt)')}</div>
    `);
    return;
  }
  if(l.origem==='recebimento'){
    AM('ℹ Lançamento de Recebimento',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento foi gerado automaticamente pelo recebimento de uma Conta a Receber.<br><br>
        Para alterá-lo, cancele o recebimento na aba <strong>Contas a Receber</strong> — isso reverterá o lançamento e devolverá a conta para "pendente".
      </div>
      <div style="margin-top:14px">${B('Entendi','FM()','var(--sur)','var(--txt)')}</div>
    `);
    return;
  }
  if(l.origem==='cheque'){
    AM('ℹ Lançamento de Cheque',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento foi gerado automaticamente pela compensação de um Cheque Emitido.<br><br>
        Para alterá-lo, cancele a compensação na aba <strong>Cheques Emitidos</strong> — isso reverterá o lançamento e o cheque volta para "emitido".
      </div>
      <div style="margin-top:14px">${B('Entendi','FM()','var(--sur)','var(--txt)')}</div>
    `);
    return;
  }
  if(l.origem==='investimento'||l.origem==='previdencia'||l.origem==='capitalizacao'||l.origem==='seguro'){
    const nomes = {investimento:'Investimentos',previdencia:'Previdência',capitalizacao:'Capitalização',seguro:'Seguros'};
    AM('ℹ Lançamento Vinculado',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento foi gerado automaticamente por uma movimentação em <strong>${nomes[l.origem]}</strong>.<br><br>
        Para corrigi-lo, exclua-o pelo botão abaixo (a movimentação de origem será revertida), ou gerencie diretamente na aba <strong>Investimentos &amp; Seguros</strong>.
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${BPerm('excluir','🗑 Excluir e Reverter','excluirLancamento(\''+id+'\')','var(--red)','#fff')}
        ${B('Fechar','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  if(l.origem==='chequesys'){
    const linkChq = linkEdicaoChequeSys(l);
    AM('ℹ Lançamento do ChequeSys',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento foi sincronizado automaticamente do <strong>ChequeSys</strong> (caixa da operação de factoring).<br><br>
        Para alterá-lo ou excluí-lo, faça isso diretamente no ChequeSys — a próxima sincronização (automática ao abrir o app, ou pelo botão 🔄) atualiza ou remove o espelho aqui.
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${linkChq ? B('🔗 Abrir no ChequeSys',`window.open('${linkChq}','tsr_janela_chequesys')`,'var(--acc)') : ''}
        ${B('Entendi','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  if(l.origem==='transferencia'){
    const par = (DB.lancamentos||[]).find(x=>x.transferenciaId===l.transferenciaId && x.id!==l.id);
    const contaOrigemId = l.tipo==='saida' ? l.contaId : (par?par.contaId:l.contaVinculadaId);
    const contaDestinoId = l.tipo==='entrada' ? l.contaId : (par?par.contaId:l.contaVinculadaId);
    AM('✏ Editar Transferência',`
      ${EH('e-lanc-transf')}
      <div style="font-size:12px;color:var(--mut);margin-bottom:10px;line-height:1.5">
        Transferência de <strong>${esc(nomeConta(contaById(contaOrigemId)))}</strong> para <strong>${esc(nomeConta(contaById(contaDestinoId)))}</strong>.<br>
        Alterar data e valor aqui atualiza as duas pernas (origem e destino) juntas.
      </div>
      <div class="row">
        ${C('Data *',`<input type="date" id="etf-data" value="${l.data}">`,'1','150')}
        ${C('Valor (R$) *',`<input id="etf-valor" value="${fmt(l.valor)}">`,'1','150')}
      </div>
      ${C('Descrição (opcional)',`<input id="etf-desc" value="${esc(l.descricao||'')}">`)}
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${B('💾 Salvar','salvarEdicaoTransferencia(\''+l.transferenciaId+'\')','var(--acc)')}
        ${BPerm('excluir','🗑 Excluir Transferência','excluirLancamento(\''+id+'\')','var(--red)','#fff')}
        ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  AM('✏ Editar Lançamento',`
    ${EH('e-lanc-ed')}
    <div class="row">
      ${C('<span id="elc-conta-label">Conta *</span>',`<select id="elc-conta" onchange="atualizarSugestoesConta('elc')">${opcoesContas(l.contaId)}</select>`,'2','200')}
      ${C('Data *',`<input type="date" id="elc-data" value="${l.data}">`,'1','150')}
    </div>
    <div class="row" id="elc-destino-wrap" style="display:none">
      ${C('Conta Destino *',`<select id="elc-conta-destino">${opcoesContas()}</select>`,'2','200')}
    </div>
    <div class="row">
      ${C('Tipo *',`<select id="elc-tipo" onchange="atualizarSugestoesConta('elc');atualizarLabelRecorrencia('elc');atualizarUITipoLancamento('elc')"><option value="entrada"${l.tipo==='entrada'?' selected':''}>Entrada</option><option value="saida"${l.tipo==='saida'?' selected':''}>Saída</option><option value="transferencia">🔀 Transferência</option></select>`,'1','140')}
      ${C('Valor (R$) *',`<input id="elc-valor" value="${fmt(l.valor)}">`,'1','150')}
    </div>
    <div class="row" id="elc-categoria-wrap">
      ${C('Categoria',`<select id="elc-categoria-mae" onchange="aoMudarMaeCascata('elc','categoria')">${opcoesCategoriaMae(l.tipo==='entrada'?'receita':'despesa', tipoDaConta(l.contaId), l.centroCustoId, idsMaeSub(categoriaById(l.categoriaId)).maeId)}</select>`,'1','160')}
      ${C('Subcategoria',`<select id="elc-categoria-sub">${opcoesSubcategoria(idsMaeSub(categoriaById(l.categoriaId)).maeId, idsMaeSub(categoriaById(l.categoriaId)).subId)}</select>`,'1','160')}
    </div>
    <div class="row">
      ${C('Centro de Custo',`<select id="elc-cc-mae" onchange="aoMudarMaeCascata('elc','cc')">${opcoesCentroCustoMae(tipoDaConta(l.contaId), idsMaeSub(centroCustoById(l.centroCustoId)).maeId)}</select>`,'1','160')}
      ${C('Sub-Centro de Custo',`<select id="elc-cc-sub">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(l.centroCustoId)).maeId, idsMaeSub(centroCustoById(l.centroCustoId)).subId)}</select>`,'1','160')}
    </div>
    <div style="font-size:11px;color:var(--mut);margin:-6px 0 10px">Escolher "🔀 Transferência" aqui substitui este lançamento por um par de Transferência entre as contas escolhidas (remove o lançamento único, cria origem + destino vinculados).</div>
    ${C('Cliente / Fornecedor (opcional)',`<input id="elc-contraparte" list="dl-contrapartes-ed" value="${esc(l.contraparte||'')}">
      <datalist id="dl-contrapartes-ed">${opcoesDatalist(contrapartesPorTipoConta(tipoDaConta(l.contaId)))}</datalist>`)}
    <div class="row">
      ${C('Direcionamento',`<select id="elc-direc-mae" onchange="aoMudarMaeCascata('elc','direc')">${opcoesDirecionamentoMae(tipoDaConta(l.contaId), idsMaeSub(direcionamentoById(l.direcionamentoId)).maeId)}</select>`,'1','160')}
      ${C('Sub-Direcionamento',`<select id="elc-direc-sub">${opcoesSubDirecionamento(idsMaeSub(direcionamentoById(l.direcionamentoId)).maeId, idsMaeSub(direcionamentoById(l.direcionamentoId)).subId)}</select>`,'1','160')}
    </div>
    ${C('Descrição / Histórico',`<input id="elc-desc" list="dl-descricoes-ed" value="${esc(l.descricao||'')}">
      <datalist id="dl-descricoes-ed">${descricoesExistentes().map(d=>`<option value="${esc(d)}">`).join('')}</datalist>`)}
    <div id="elc-tipo-info" style="font-size:11px;color:var(--mut);margin:-4px 0 8px"></div>

    <div class="card" id="elc-recorrencia-wrap" style="margin:10px 0;padding:10px;background:var(--sur)">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13px">
        <input type="checkbox" id="elc-recorrente" onchange="document.getElementById('elc-recorrencia-opcoes').style.display=this.checked?'block':'none'">
        🔁 Replicar automaticamente em <span id="elc-rec-label">Contas a Receber</span>
      </label>
      <div id="elc-recorrencia-opcoes" style="display:none;margin-top:10px">
        <div style="font-size:11px;color:var(--mut);margin-bottom:8px">Útil quando este lançamento já foi importado/lançado (então não passou pelo "Novo Lançamento") e você quer gerar as próximas ocorrências pendentes em Contas a Pagar/Receber a partir dele agora.</div>
        <div class="row">
          ${C('Periodicidade',`<select id="elc-rec-periodo"><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select>`,'1','150')}
          ${C('Quantas vezes replicar',`<input type="number" id="elc-rec-qtd" min="1" max="60" value="12">`,'1','150')}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoLancamento(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirLancamento(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
  atualizarSugestoesConta('elc');
  atualizarLabelRecorrencia('elc');
  atualizarUITipoLancamento('elc');
}
function salvarEdicaoLancamento(id){
  const tipoSel = document.getElementById('elc-tipo').value;
  if(tipoSel==='transferencia'){ salvarConversaoParaTransferencia(id); return; }
  const valor = parseValor(document.getElementById('elc-valor').value);
  if(!valor||valor<=0){ ME('e-lanc-ed','Informe um valor válido maior que zero.'); return; }
  const patch = {
    contaId: document.getElementById('elc-conta').value,
    data: document.getElementById('elc-data').value||hoje(),
    tipo: document.getElementById('elc-tipo').value,
    valor,
    categoriaId: valorFinalCascata('elc','categoria'),
    centroCustoId: valorFinalCascata('elc','cc'),
    contraparte: document.getElementById('elc-contraparte').value.trim(),
    ...direcionamentoFinal('elc'),
    descricao: document.getElementById('elc-desc').value.trim()
  };
  let novoDB = {...DB, lancamentos:(DB.lancamentos||[]).map(l=>l.id===id?{...l,...patch}:l)};

  const recorrente = document.getElementById('elc-recorrente')?.checked;
  if(recorrente){
    const periodo = document.getElementById('elc-rec-periodo').value;
    const qtd = Math.max(1, Math.min(60, Number(document.getElementById('elc-rec-qtd').value)||1));
    const ehPagar = patch.tipo==='saida';
    const novasContas = [];
    let dataAtual = patch.data;
    for(let i=0;i<qtd;i++){
      dataAtual = proximaDataRecorrencia(dataAtual, periodo);
      const base = {
        id:uid(), valor:patch.valor, vencimento:dataAtual,
        categoriaId:patch.categoriaId, centroCustoId:patch.centroCustoId, contaId:patch.contaId,
        lancamentoId:null,
        obs:`Replicado automaticamente a partir do lançamento de ${fmtD(patch.data)}${patch.descricao?' — '+patch.descricao:''}`,
        criadoEm:new Date().toISOString()
      };
      if(ehPagar){
        novasContas.push({...base, favorecido:patch.contraparte||'(replicado)', fornecedorId:fornecedorIdPorNome(patch.contraparte), status:'pendente', dataPagamento:null, valorPago:null});
      } else {
        novasContas.push({...base, cliente:patch.contraparte||'(replicado)', clienteId:clienteIdPorNome(patch.contraparte), status:'pendente', dataRecebimento:null, valorRecebido:null});
      }
    }
    if(ehPagar) novoDB = {...novoDB, contasPagar:[...(DB.contasPagar||[]), ...novasContas]};
    else novoDB = {...novoDB, contasReceber:[...(DB.contasReceber||[]), ...novasContas]};
  }

  salvar(novoDB);
  FM();
}
// Converte um lançamento comum (entrada/saída) que estava sendo editado em
// uma Transferência entre contas — remove o lançamento original e cria o par
// origem+destino vinculados, mesmo padrão de salvarNovaTransferencia().
function salvarConversaoParaTransferencia(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  const contaOrigemId = document.getElementById('elc-conta').value;
  const contaDestinoId = document.getElementById('elc-conta-destino').value;
  const valor = parseValor(document.getElementById('elc-valor').value);
  const data = document.getElementById('elc-data').value||hoje();
  const descricao = document.getElementById('elc-desc').value.trim();
  const centroCustoId = valorFinalCascata('elc','cc');
  const direc = direcionamentoFinal('elc');
  if(!contaOrigemId){ ME('e-lanc-ed','Selecione a conta de origem.'); return; }
  if(!contaDestinoId){ ME('e-lanc-ed','Selecione a conta de destino.'); return; }
  if(contaOrigemId===contaDestinoId){ ME('e-lanc-ed','A conta de origem e a conta de destino não podem ser a mesma.'); return; }
  if(!valor||valor<=0){ ME('e-lanc-ed','Informe um valor válido maior que zero.'); return; }
  const transferenciaId = uid();
  const nomeOrigem = nomeConta(contaById(contaOrigemId));
  const nomeDestino = nomeConta(contaById(contaDestinoId));
  const agora = new Date().toISOString();
  const saida = {
    id:uid(), contaId:contaOrigemId, data, tipo:'saida', valor,
    categoriaId:'', centroCustoId,
    contraparte:'', ...direc,
    descricao: descricao || `Transferência para ${nomeDestino}`,
    origem:'transferencia', transferenciaId, contaVinculadaId:contaDestinoId, contaPagarId:null,
    criadoEm: agora
  };
  const entrada = {
    id:uid(), contaId:contaDestinoId, data, tipo:'entrada', valor,
    categoriaId:'', centroCustoId,
    contraparte:'', ...direc,
    descricao: descricao || `Transferência de ${nomeOrigem}`,
    origem:'transferencia', transferenciaId, contaVinculadaId:contaOrigemId, contaPagarId:null,
    criadoEm: agora
  };
  const novoDB = {...DB, lancamentos:[...(DB.lancamentos||[]).filter(x=>x.id!==id), saida, entrada]};
  salvar(novoDB);
  FM();
}
function excluirLancamento(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  if(l.origem==='chequesys'){
    const linkChq = linkEdicaoChequeSys(l);
    AM('ℹ Lançamento do ChequeSys',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este lançamento veio do ChequeSys — exclua-o por lá; a sincronização remove o espelho automaticamente aqui.
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${linkChq ? B('🔗 Abrir no ChequeSys',`window.open('${linkChq}','tsr_janela_chequesys')`,'var(--acc)') : ''}
        ${B('Entendi','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  if(l.origem==='transferencia'){
    CF('Esta é uma Transferência entre contas. Excluir vai remover as duas pernas (origem e destino) juntas. Confirma?', ()=>{
      const novoDb = {...DB, lancamentos:(DB.lancamentos||[]).filter(x=>x.transferenciaId!==l.transferenciaId)};
      salvar(novoDb);
      FM();
    });
    return;
  }
  const nomesOrigem = {investimento:'Investimento',previdencia:'Previdência',capitalizacao:'Capitalização',seguro:'Seguro'};
  const msg = l.origem==='pagamento'
    ? 'Este lançamento pertence a um pagamento de Conta a Pagar. Excluir vai reverter a conta para "pendente" novamente. Confirma?'
    : l.origem==='recebimento'
    ? 'Este lançamento pertence a um recebimento de Conta a Receber. Excluir vai reverter a conta para "pendente" novamente. Confirma?'
    : l.origem==='cheque'
    ? 'Este lançamento pertence à compensação de um Cheque Emitido. Excluir vai reverter o cheque para "emitido" novamente. Confirma?'
    : nomesOrigem[l.origem]
    ? `Este lançamento pertence a uma movimentação de ${nomesOrigem[l.origem]}. Excluir vai reverter essa movimentação. Confirma?`
    : 'Excluir este lançamento?';
  CF(msg, ()=>{
    let novoDb = {...DB, lancamentos:(DB.lancamentos||[]).filter(x=>x.id!==id)};
    if(l.origem==='pagamento' && l.contaPagarId){
      novoDb.contasPagar = (novoDb.contasPagar||[]).map(cp=>cp.id===l.contaPagarId?{...cp,status:'pendente',dataPagamento:null,valorPago:null,lancamentoId:null}:cp);
    }
    if(l.origem==='recebimento' && l.contaReceberId){
      novoDb.contasReceber = (novoDb.contasReceber||[]).map(cr=>cr.id===l.contaReceberId?{...cr,status:'pendente',dataRecebimento:null,valorRecebido:null,lancamentoId:null}:cr);
    }
    if(l.origem==='cheque' && l.chequeId){
      novoDb.chequesEmitidos = (novoDb.chequesEmitidos||[]).map(c=>c.id===l.chequeId?{...c,status:'emitido',dataCompensacao:null,lancamentoId:null}:c);
    }
    if(l.origem==='investimento' && l.investimentoId){
      novoDb.investimentos = (novoDb.investimentos||[]).map(i=>{
        if(i.id!==l.investimentoId) return i;
        if(l.opInvest==='aporte') return {...i, valorAplicado:Number(i.valorAplicado)-l.valor, valorAtual:Number(i.valorAtual)-l.valor};
        if(l.opInvest==='resgate') return {...i, valorResgatado:Number(i.valorResgatado)-l.valor, valorAtual:Number(i.valorAtual)+l.valor, status:'ativo'};
        return i;
      });
    }
    if(l.origem==='previdencia' && l.previdenciaId){
      novoDb.previdencias = (novoDb.previdencias||[]).map(p=>{
        if(p.id!==l.previdenciaId) return p;
        if(l.opInvest==='aporte') return {...p, valorAplicado:Number(p.valorAplicado)-l.valor, valorAtual:Number(p.valorAtual)-l.valor};
        if(l.opInvest==='resgate') return {...p, valorResgatado:Number(p.valorResgatado)-l.valor, valorAtual:Number(p.valorAtual)+l.valor, status:'ativo'};
        return p;
      });
    }
    if(l.origem==='capitalizacao' && l.capitalizacaoId){
      novoDb.capitalizacoes = (novoDb.capitalizacoes||[]).map(c=>{
        if(c.id!==l.capitalizacaoId) return c;
        if(l.opInvest==='parcela') return {...c, parcelasPagas:Math.max(0,c.parcelasPagas-1), status:'ativo'};
        if(l.opInvest==='resgate') return {...c, status:'ativo'};
        return c;
      });
    }
    salvar(novoDb);
    FM();
  });
}

// ══════════════════════════════════════════
// CRUD — CONTAS A PAGAR (integrado aos Lançamentos)
// ══════════════════════════════════════════
function novaContaPagar(vencimentoPre){
  AM('➕ Nova Conta a Pagar',`
    ${EH('e-cp')}
    <div class="row">
      ${C('Favorecido / Fornecedor *',`<input id="cp-fav" list="dl-fornecedores" placeholder="Digite ou escolha um fornecedor cadastrado">
        <datalist id="dl-fornecedores">${opcoesDatalist(DB.fornecedores||[])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="cp-valor" placeholder="0,00">`,'1','140')}
    </div>
    <div style="font-size:11px;color:var(--mut);margin:-6px 0 10px">Fornecedor não está na lista? Digite o nome normalmente — depois é só cadastrar os dados completos (CPF/CNPJ, contato) em <strong>Cadastros → Fornecedores</strong>.</div>
    ${C('Conta bancária de pagamento (opcional — escolher já filtra Categoria/Fornecedor por PF/PJ)',`<select id="cp-conta" onchange="atualizarSugestoesContaPagar('cp')"><option value="">A definir no momento do pagamento</option>${opcoesContas()}</select>`)}
    <div class="row">
      ${C('Vencimento *',`<input type="date" id="cp-venc" value="${vencimentoPre||hoje()}">`,'1','150')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="cp-categoria-mae" onchange="aoMudarMaeCascataFixo('cp','categoria');atualizarSugestoesContaPagar('cp')" style="flex:1">${opcoesCategoriaMae('despesa','','','')}</select><select id="cp-categoria-sub" onchange="atualizarSugestoesContaPagar('cp')" style="flex:1">${opcoesSubcategoria('','')}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="cp-cc-mae" onchange="aoMudarMaeCascataFixo('cp','cc');atualizarSugestoesContaPagar('cp')" style="flex:1">${opcoesCentroCustoMae('','')}</select><select id="cp-cc-sub" onchange="atualizarSugestoesContaPagar('cp')" style="flex:1">${opcoesSubCentroCusto('','')}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="cp-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaContaPagar()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function atualizarSugestoesContaPagar(prefixo){
  const contaId = document.getElementById(prefixo+'-conta')?.value||'';
  const tipoConta = tipoDaConta(contaId);
  const dl = document.getElementById(prefixo==='ecp' ? 'dl-fornecedores-ed' : 'dl-fornecedores');
  if(dl) dl.innerHTML = opcoesDatalist((DB.fornecedores||[]).filter(f=>itemValidoParaPFPJ(f,tipoConta)));
  const ccMaeEl = document.getElementById(prefixo+'-cc-mae');
  if(ccMaeEl){
    const ccAtual = ccMaeEl.value;
    ccMaeEl.innerHTML = opcoesCentroCustoMae(tipoConta, ccAtual);
    if(![...ccMaeEl.options].some(o=>o.value===ccAtual)) ccMaeEl.value='';
    const ccSubEl = document.getElementById(prefixo+'-cc-sub');
    if(ccSubEl) ccSubEl.innerHTML = opcoesSubCentroCusto(ccMaeEl.value, ccSubEl.value);
  }
  const centroCustoId = valorFinalCascata(prefixo,'cc');
  const catMaeEl = document.getElementById(prefixo+'-categoria-mae');
  if(catMaeEl){
    const catAtual = catMaeEl.value;
    catMaeEl.innerHTML = opcoesCategoriaMae('despesa', tipoConta, centroCustoId, catAtual);
    if(![...catMaeEl.options].some(o=>o.value===catAtual)) catMaeEl.value='';
    const catSubEl = document.getElementById(prefixo+'-categoria-sub');
    if(catSubEl) catSubEl.innerHTML = opcoesSubcategoria(catMaeEl.value, catSubEl.value);
  }
}
function fornecedorIdPorNome(nome){
  const alvo = (nome||'').trim().toLowerCase();
  if(!alvo) return null;
  const f = (DB.fornecedores||[]).find(x=>x.nome.trim().toLowerCase()===alvo);
  return f?f.id:null;
}
function clienteIdPorNome(nome){
  const alvo = (nome||'').trim().toLowerCase();
  if(!alvo) return null;
  const c = (DB.clientes||[]).find(x=>x.nome.trim().toLowerCase()===alvo);
  return c?c.id:null;
}
function salvarNovaContaPagar(){
  const fav = document.getElementById('cp-fav').value.trim();
  const valor = parseValor(document.getElementById('cp-valor').value);
  if(!fav){ ME('e-cp','Informe o favorecido/fornecedor.'); return; }
  if(!valor||valor<=0){ ME('e-cp','Informe um valor válido maior que zero.'); return; }
  const nova = {
    id:uid(), favorecido:fav, fornecedorId: fornecedorIdPorNome(fav), valor,
    vencimento: document.getElementById('cp-venc').value||hoje(),
    categoriaId: valorFinalCascata('cp','categoria'),
    centroCustoId: valorFinalCascata('cp','cc'),
    contaId: document.getElementById('cp-conta').value||'',
    status:'pendente', dataPagamento:null, valorPago:null, lancamentoId:null,
    obs: document.getElementById('cp-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, contasPagar:[...(DB.contasPagar||[]), nova]});
  FM();
}
function editarContaPagar(id){
  const cp = (DB.contasPagar||[]).find(x=>x.id===id); if(!cp) return;
  if(cp.status==='pago'){
    AM('ℹ Conta já Paga',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Esta conta já foi paga em <strong>${fmtD(cp.dataPagamento)}</strong>, no valor de <strong>R$ ${fmt(cp.valorPago)}</strong>.<br><br>
        Para corrigir, cancele o pagamento — isso vai reverter o lançamento gerado no extrato.
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${BPerm('excluir','↩ Cancelar Pagamento','cancelarPagamento(\''+id+'\')','var(--red)','#fff')}
        ${B('Fechar','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  AM('✏ Editar Conta a Pagar',`
    ${EH('e-cp-ed')}
    <div class="row">
      ${C('Favorecido / Fornecedor *',`<input id="ecp-fav" list="dl-fornecedores-ed" value="${esc(cp.favorecido)}">
        <datalist id="dl-fornecedores-ed">${opcoesDatalist(DB.fornecedores||[])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="ecp-valor" value="${fmt(cp.valor)}">`,'1','140')}
    </div>
    ${C('Conta bancária de pagamento (opcional — escolher já filtra Categoria/Fornecedor por PF/PJ)',`<select id="ecp-conta" onchange="atualizarSugestoesContaPagar('ecp')"><option value="">A definir no momento do pagamento</option>${opcoesContas(cp.contaId)}</select>`)}
    <div class="row">
      ${C('Vencimento *',`<input type="date" id="ecp-venc" value="${cp.vencimento}">`,'1','150')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="ecp-categoria-mae" onchange="aoMudarMaeCascataFixo('ecp','categoria');atualizarSugestoesContaPagar('ecp')" style="flex:1">${opcoesCategoriaMae('despesa', tipoDaConta(cp.contaId), cp.centroCustoId, idsMaeSub(categoriaById(cp.categoriaId)).maeId)}</select><select id="ecp-categoria-sub" onchange="atualizarSugestoesContaPagar('ecp')" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(cp.categoriaId)).maeId, idsMaeSub(categoriaById(cp.categoriaId)).subId)}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="ecp-cc-mae" onchange="aoMudarMaeCascataFixo('ecp','cc');atualizarSugestoesContaPagar('ecp')" style="flex:1">${opcoesCentroCustoMae(tipoDaConta(cp.contaId), idsMaeSub(centroCustoById(cp.centroCustoId)).maeId)}</select><select id="ecp-cc-sub" onchange="atualizarSugestoesContaPagar('ecp')" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(cp.centroCustoId)).maeId, idsMaeSub(centroCustoById(cp.centroCustoId)).subId)}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="ecp-obs" rows="2">${esc(cp.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoContaPagar(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirContaPagar(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoContaPagar(id){
  const fav = document.getElementById('ecp-fav').value.trim();
  const valor = parseValor(document.getElementById('ecp-valor').value);
  if(!fav){ ME('e-cp-ed','Informe o favorecido/fornecedor.'); return; }
  if(!valor||valor<=0){ ME('e-cp-ed','Informe um valor válido maior que zero.'); return; }
  const patch = {
    favorecido:fav, fornecedorId: fornecedorIdPorNome(fav), valor,
    vencimento: document.getElementById('ecp-venc').value||hoje(),
    categoriaId: valorFinalCascata('ecp','categoria'),
    centroCustoId: valorFinalCascata('ecp','cc'),
    contaId: document.getElementById('ecp-conta').value||'',
    obs: document.getElementById('ecp-obs').value.trim()
  };
  salvar({...DB, contasPagar:(DB.contasPagar||[]).map(cp=>cp.id===id?{...cp,...patch}:cp)});
  FM();
}
function excluirContaPagar(id){
  const cp = (DB.contasPagar||[]).find(x=>x.id===id); if(!cp) return;
  if(cp.status==='pago'){ ME('e-cp-ed','Contas já pagas não podem ser excluídas diretamente. Cancele o pagamento primeiro.'); return; }
  CF('Excluir esta conta a pagar?', ()=>{ salvar({...DB, contasPagar:(DB.contasPagar||[]).filter(x=>x.id!==id)}); FM(); });
}

// ── PAGAMENTO: gera automaticamente o lançamento de saída na conta escolhida ──
function abrirPagamento(id){
  const cp = (DB.contasPagar||[]).find(x=>x.id===id); if(!cp) return;
  AM('💵 Pagar Conta — '+esc(cp.favorecido),`
    ${EH('e-pag')}
    <div class="prev">
      <div>Valor previsto: <strong>R$ ${fmt(cp.valor)}</strong></div>
      <div>Vencimento: <strong>${fmtD(cp.vencimento)}</strong></div>
    </div>
    <div class="row">
      ${C('Conta bancária que vai pagar *',`<select id="pag-conta">${opcoesContas(cp.contaId)}</select>`,'2','200')}
      ${C('Data do Pagamento *',`<input type="date" id="pag-data" value="${hoje()}">`,'1','150')}
    </div>
    ${C('Valor Efetivamente Pago (R$) *',`<input id="pag-valor" value="${fmt(cp.valor)}">`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">
      Ao confirmar, será lançada automaticamente uma <strong>saída</strong> no extrato da conta escolhida.
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Pagamento','confirmarPagamento(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarPagamento(id){
  const cp = (DB.contasPagar||[]).find(x=>x.id===id); if(!cp) return;
  const contaId = document.getElementById('pag-conta').value;
  const valorPago = parseValor(document.getElementById('pag-valor').value);
  const dataPagamento = document.getElementById('pag-data').value||hoje();
  if(!contaId){ ME('e-pag','Selecione a conta bancária que vai pagar.'); return; }
  if(!valorPago||valorPago<=0){ ME('e-pag','Informe um valor pago válido maior que zero.'); return; }
  const lancId = uid();
  const lancamento = {
    id: lancId, contaId, data: dataPagamento, tipo:'saida', valor: valorPago,
    categoriaId: cp.categoriaId||'', centroCustoId: cp.centroCustoId||'',
    descricao: `Pagamento — ${cp.favorecido}`,
    origem:'pagamento', contaPagarId: cp.id,
    criadoEm: new Date().toISOString()
  };
  const novaCp = {...cp, status:'pago', dataPagamento, valorPago, lancamentoId:lancId, contaId};
  salvar({
    ...DB,
    lancamentos:[...(DB.lancamentos||[]), lancamento],
    contasPagar:(DB.contasPagar||[]).map(x=>x.id===id?novaCp:x)
  });
  FM();
}
function cancelarPagamento(id){
  const cp = (DB.contasPagar||[]).find(x=>x.id===id); if(!cp) return;
  CF('Cancelar este pagamento? O lançamento no extrato será removido e a conta voltará para "pendente".', ()=>{
    salvar({
      ...DB,
      lancamentos:(DB.lancamentos||[]).filter(l=>l.id!==cp.lancamentoId),
      contasPagar:(DB.contasPagar||[]).map(x=>x.id===id?{...x,status:'pendente',dataPagamento:null,valorPago:null,lancamentoId:null}:x)
    });
    FM();
  });
}

// ══════════════════════════════════════════
// CRUD — CONTAS A RECEBER (espelho de Contas a Pagar)
// ══════════════════════════════════════════
function novaContaReceber(){
  AM('➕ Nova Conta a Receber',`
    ${EH('e-cr')}
    <div class="row">
      ${C('Cliente *',`<input id="cr-cli" list="dl-clientes" placeholder="Digite ou escolha um cliente cadastrado">
        <datalist id="dl-clientes">${opcoesDatalist(DB.clientes||[])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="cr-valor" placeholder="0,00">`,'1','140')}
    </div>
    <div style="font-size:11px;color:var(--mut);margin:-6px 0 10px">Cliente não está na lista? Digite o nome normalmente — depois é só cadastrar os dados completos em <strong>Cadastros → Clientes</strong>.</div>
    ${C('Conta bancária de recebimento (opcional — escolher já filtra Categoria/Cliente por PF/PJ)',`<select id="cr-conta" onchange="atualizarSugestoesContaReceber('cr')"><option value="">A definir no momento do recebimento</option>${opcoesContas()}</select>`)}
    <div class="row">
      ${C('Vencimento *',`<input type="date" id="cr-venc" value="${hoje()}">`,'1','150')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="cr-categoria-mae" onchange="aoMudarMaeCascataFixo('cr','categoria');atualizarSugestoesContaReceber('cr')" style="flex:1">${opcoesCategoriaMae('receita','','','')}</select><select id="cr-categoria-sub" onchange="atualizarSugestoesContaReceber('cr')" style="flex:1">${opcoesSubcategoria('','')}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="cr-cc-mae" onchange="aoMudarMaeCascataFixo('cr','cc');atualizarSugestoesContaReceber('cr')" style="flex:1">${opcoesCentroCustoMae('','')}</select><select id="cr-cc-sub" onchange="atualizarSugestoesContaReceber('cr')" style="flex:1">${opcoesSubCentroCusto('','')}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="cr-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaContaReceber()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function atualizarSugestoesContaReceber(prefixo){
  const contaId = document.getElementById(prefixo+'-conta')?.value||'';
  const tipoConta = tipoDaConta(contaId);
  const dl = document.getElementById(prefixo==='ecr' ? 'dl-clientes-ed' : 'dl-clientes');
  if(dl) dl.innerHTML = opcoesDatalist((DB.clientes||[]).filter(c=>itemValidoParaPFPJ(c,tipoConta)));
  const ccMaeEl = document.getElementById(prefixo+'-cc-mae');
  if(ccMaeEl){
    const ccAtual = ccMaeEl.value;
    ccMaeEl.innerHTML = opcoesCentroCustoMae(tipoConta, ccAtual);
    if(![...ccMaeEl.options].some(o=>o.value===ccAtual)) ccMaeEl.value='';
    const ccSubEl = document.getElementById(prefixo+'-cc-sub');
    if(ccSubEl) ccSubEl.innerHTML = opcoesSubCentroCusto(ccMaeEl.value, ccSubEl.value);
  }
  const centroCustoId = valorFinalCascata(prefixo,'cc');
  const catMaeEl = document.getElementById(prefixo+'-categoria-mae');
  if(catMaeEl){
    const catAtual = catMaeEl.value;
    catMaeEl.innerHTML = opcoesCategoriaMae('receita', tipoConta, centroCustoId, catAtual);
    if(![...catMaeEl.options].some(o=>o.value===catAtual)) catMaeEl.value='';
    const catSubEl = document.getElementById(prefixo+'-categoria-sub');
    if(catSubEl) catSubEl.innerHTML = opcoesSubcategoria(catMaeEl.value, catSubEl.value);
  }
}
function salvarNovaContaReceber(){
  const cli = document.getElementById('cr-cli').value.trim();
  const valor = parseValor(document.getElementById('cr-valor').value);
  if(!cli){ ME('e-cr','Informe o cliente.'); return; }
  if(!valor||valor<=0){ ME('e-cr','Informe um valor válido maior que zero.'); return; }
  const nova = {
    id:uid(), cliente:cli, clienteId: clienteIdPorNome(cli), valor,
    vencimento: document.getElementById('cr-venc').value||hoje(),
    categoriaId: valorFinalCascata('cr','categoria'),
    centroCustoId: valorFinalCascata('cr','cc'),
    contaId: document.getElementById('cr-conta').value||'',
    status:'pendente', dataRecebimento:null, valorRecebido:null, lancamentoId:null,
    obs: document.getElementById('cr-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, contasReceber:[...(DB.contasReceber||[]), nova]});
  FM();
}
function editarContaReceber(id){
  const cr = (DB.contasReceber||[]).find(x=>x.id===id); if(!cr) return;
  if(cr.status==='recebido'){
    AM('ℹ Conta já Recebida',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este recebimento já foi confirmado em <strong>${fmtD(cr.dataRecebimento)}</strong>, no valor de <strong>R$ ${fmt(cr.valorRecebido)}</strong>.<br><br>
        Para corrigir, cancele o recebimento — isso vai reverter o lançamento gerado no extrato.
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${BPerm('excluir','↩ Cancelar Recebimento','cancelarRecebimento(\''+id+'\')','var(--red)','#fff')}
        ${B('Fechar','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  AM('✏ Editar Conta a Receber',`
    ${EH('e-cr-ed')}
    <div class="row">
      ${C('Cliente *',`<input id="ecr-cli" list="dl-clientes-ed" value="${esc(cr.cliente)}">
        <datalist id="dl-clientes-ed">${opcoesDatalist(DB.clientes||[])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="ecr-valor" value="${fmt(cr.valor)}">`,'1','140')}
    </div>
    ${C('Conta bancária de recebimento (opcional — escolher já filtra Categoria/Cliente por PF/PJ)',`<select id="ecr-conta" onchange="atualizarSugestoesContaReceber('ecr')"><option value="">A definir no momento do recebimento</option>${opcoesContas(cr.contaId)}</select>`)}
    <div class="row">
      ${C('Vencimento *',`<input type="date" id="ecr-venc" value="${cr.vencimento}">`,'1','150')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="ecr-categoria-mae" onchange="aoMudarMaeCascataFixo('ecr','categoria');atualizarSugestoesContaReceber('ecr')" style="flex:1">${opcoesCategoriaMae('receita', tipoDaConta(cr.contaId), cr.centroCustoId, idsMaeSub(categoriaById(cr.categoriaId)).maeId)}</select><select id="ecr-categoria-sub" onchange="atualizarSugestoesContaReceber('ecr')" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(cr.categoriaId)).maeId, idsMaeSub(categoriaById(cr.categoriaId)).subId)}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="ecr-cc-mae" onchange="aoMudarMaeCascataFixo('ecr','cc');atualizarSugestoesContaReceber('ecr')" style="flex:1">${opcoesCentroCustoMae(tipoDaConta(cr.contaId), idsMaeSub(centroCustoById(cr.centroCustoId)).maeId)}</select><select id="ecr-cc-sub" onchange="atualizarSugestoesContaReceber('ecr')" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(cr.centroCustoId)).maeId, idsMaeSub(centroCustoById(cr.centroCustoId)).subId)}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="ecr-obs" rows="2">${esc(cr.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoContaReceber(\''+id+'\')','var(--acc)')}
      ${BPerm('excluir','🗑 Excluir','excluirContaReceber(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoContaReceber(id){
  const cli = document.getElementById('ecr-cli').value.trim();
  const valor = parseValor(document.getElementById('ecr-valor').value);
  if(!cli){ ME('e-cr-ed','Informe o cliente.'); return; }
  if(!valor||valor<=0){ ME('e-cr-ed','Informe um valor válido maior que zero.'); return; }
  const patch = {
    cliente:cli, clienteId: clienteIdPorNome(cli), valor,
    vencimento: document.getElementById('ecr-venc').value||hoje(),
    categoriaId: valorFinalCascata('ecr','categoria'),
    centroCustoId: valorFinalCascata('ecr','cc'),
    contaId: document.getElementById('ecr-conta').value||'',
    obs: document.getElementById('ecr-obs').value.trim()
  };
  salvar({...DB, contasReceber:(DB.contasReceber||[]).map(cr=>cr.id===id?{...cr,...patch}:cr)});
  FM();
}
function excluirContaReceber(id){
  const cr = (DB.contasReceber||[]).find(x=>x.id===id); if(!cr) return;
  if(cr.status==='recebido'){ ME('e-cr-ed','Contas já recebidas não podem ser excluídas diretamente. Cancele o recebimento primeiro.'); return; }
  CF('Excluir esta conta a receber?', ()=>{ salvar({...DB, contasReceber:(DB.contasReceber||[]).filter(x=>x.id!==id)}); FM(); });
}

// ── RECEBIMENTO: gera automaticamente o lançamento de entrada na conta escolhida ──
function abrirRecebimento(id){
  const cr = (DB.contasReceber||[]).find(x=>x.id===id); if(!cr) return;
  AM('💰 Receber — '+esc(cr.cliente),`
    ${EH('e-receb')}
    <div class="prev">
      <div>Valor previsto: <strong>R$ ${fmt(cr.valor)}</strong></div>
      <div>Vencimento: <strong>${fmtD(cr.vencimento)}</strong></div>
    </div>
    <div class="row">
      ${C('Conta bancária que vai receber *',`<select id="receb-conta">${opcoesContas(cr.contaId)}</select>`,'2','200')}
      ${C('Data do Recebimento *',`<input type="date" id="receb-data" value="${hoje()}">`,'1','150')}
    </div>
    ${C('Valor Efetivamente Recebido (R$) *',`<input id="receb-valor" value="${fmt(cr.valor)}">`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">
      Ao confirmar, será lançada automaticamente uma <strong>entrada</strong> no extrato da conta escolhida.
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Recebimento','confirmarRecebimento(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarRecebimento(id){
  const cr = (DB.contasReceber||[]).find(x=>x.id===id); if(!cr) return;
  const contaId = document.getElementById('receb-conta').value;
  const valorRecebido = parseValor(document.getElementById('receb-valor').value);
  const dataRecebimento = document.getElementById('receb-data').value||hoje();
  if(!contaId){ ME('e-receb','Selecione a conta bancária que vai receber.'); return; }
  if(!valorRecebido||valorRecebido<=0){ ME('e-receb','Informe um valor recebido válido maior que zero.'); return; }
  const lancId = uid();
  const lancamento = {
    id: lancId, contaId, data: dataRecebimento, tipo:'entrada', valor: valorRecebido,
    categoriaId: cr.categoriaId||'', centroCustoId: cr.centroCustoId||'',
    contraparte: cr.cliente,
    descricao: `Recebimento — ${cr.cliente}`,
    origem:'recebimento', contaReceberId: cr.id,
    criadoEm: new Date().toISOString()
  };
  const novaCr = {...cr, status:'recebido', dataRecebimento, valorRecebido, lancamentoId:lancId, contaId};
  salvar({
    ...DB,
    lancamentos:[...(DB.lancamentos||[]), lancamento],
    contasReceber:(DB.contasReceber||[]).map(x=>x.id===id?novaCr:x)
  });
  FM();
}
function cancelarRecebimento(id){
  const cr = (DB.contasReceber||[]).find(x=>x.id===id); if(!cr) return;
  CF('Cancelar este recebimento? O lançamento no extrato será removido e a conta voltará para "pendente".', ()=>{
    salvar({
      ...DB,
      lancamentos:(DB.lancamentos||[]).filter(l=>l.id!==cr.lancamentoId),
      contasReceber:(DB.contasReceber||[]).map(x=>x.id===id?{...x,status:'pendente',dataRecebimento:null,valorRecebido:null,lancamentoId:null}:x)
    });
    FM();
  });
}

// ══════════════════════════════════════════
// CRUD — CHEQUES EMITIDOS (pela empresa, para pagar terceiros)
// Diferente do ChequeSys: lá se desconta cheque de terceiros; aqui a
// própria Telasul/Construsul emite o cheque para pagar alguém.
// ══════════════════════════════════════════
function novoChequeEmitido(contaIdPre){
  AM('➕ Novo Cheque Emitido',`
    ${EH('e-chq')}
    <div class="row">
      ${C('Conta Emissora *',`<select id="chq-conta" onchange="atualizarSugestoesChequeEmitido('chq')">${opcoesContas(contaIdPre)}</select>`,'1','200')}
      ${C('Número do Cheque',`<input id="chq-numero" placeholder="Ex: 000123">`,'1','140')}
    </div>
    <div class="row">
      ${C('Favorecido *',`<input id="chq-fav" list="dl-fornecedores-chq" placeholder="Para quem o cheque foi emitido">
        <datalist id="dl-fornecedores-chq">${opcoesDatalist([...(DB.fornecedores||[]),...(DB.clientes||[])])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="chq-valor" placeholder="0,00">`,'1','140')}
    </div>
    <div class="row">
      ${C('Data de Emissão *',`<input type="date" id="chq-emissao" value="${hoje()}">`,'1','150')}
      ${C('Previsão de Compensação *',`<input type="date" id="chq-prevista" value="${hoje()}">`,'1','150')}
    </div>
    <div class="row">
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="chq-categoria-mae" onchange="aoMudarMaeCascataFixo('chq','categoria');atualizarSugestoesChequeEmitido('chq')" style="flex:1">${opcoesCategoriaMae('despesa','','','')}</select><select id="chq-categoria-sub" onchange="atualizarSugestoesChequeEmitido('chq')" style="flex:1">${opcoesSubcategoria('','')}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="chq-cc-mae" onchange="aoMudarMaeCascataFixo('chq','cc');atualizarSugestoesChequeEmitido('chq')" style="flex:1">${opcoesCentroCustoMae('','')}</select><select id="chq-cc-sub" onchange="atualizarSugestoesChequeEmitido('chq')" style="flex:1">${opcoesSubCentroCusto('','')}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="chq-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoChequeEmitido()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
  atualizarSugestoesChequeEmitido('chq');
}
function atualizarSugestoesChequeEmitido(prefixo){
  const contaId = document.getElementById(prefixo+'-conta')?.value||'';
  const tipoConta = tipoDaConta(contaId);
  const dl = document.getElementById(prefixo==='echq' ? 'dl-fornecedores-chq-ed' : 'dl-fornecedores-chq');
  if(dl) dl.innerHTML = opcoesDatalist([...(DB.fornecedores||[]),...(DB.clientes||[])].filter(x=>itemValidoParaPFPJ(x,tipoConta)));
  const ccMaeEl = document.getElementById(prefixo+'-cc-mae');
  if(ccMaeEl){
    const ccAtual = ccMaeEl.value;
    ccMaeEl.innerHTML = opcoesCentroCustoMae(tipoConta, ccAtual);
    if(![...ccMaeEl.options].some(o=>o.value===ccAtual)) ccMaeEl.value='';
    const ccSubEl = document.getElementById(prefixo+'-cc-sub');
    if(ccSubEl) ccSubEl.innerHTML = opcoesSubCentroCusto(ccMaeEl.value, ccSubEl.value);
  }
  const centroCustoId = valorFinalCascata(prefixo,'cc');
  const catMaeEl = document.getElementById(prefixo+'-categoria-mae');
  if(catMaeEl){
    const catAtual = catMaeEl.value;
    catMaeEl.innerHTML = opcoesCategoriaMae('despesa', tipoConta, centroCustoId, catAtual);
    if(![...catMaeEl.options].some(o=>o.value===catAtual)) catMaeEl.value='';
    const catSubEl = document.getElementById(prefixo+'-categoria-sub');
    if(catSubEl) catSubEl.innerHTML = opcoesSubcategoria(catMaeEl.value, catSubEl.value);
  }
}
function salvarNovoChequeEmitido(){
  const contaId = document.getElementById('chq-conta').value;
  const fav = document.getElementById('chq-fav').value.trim();
  const valor = parseValor(document.getElementById('chq-valor').value);
  if(!contaId){ ME('e-chq','Selecione a conta emissora.'); return; }
  if(!fav){ ME('e-chq','Informe o favorecido.'); return; }
  if(!valor||valor<=0){ ME('e-chq','Informe um valor válido maior que zero.'); return; }
  const novo = {
    id:uid(), numero: document.getElementById('chq-numero').value.trim(), contaId,
    favorecido: fav, fornecedorId: fornecedorIdPorNome(fav), valor,
    dataEmissao: document.getElementById('chq-emissao').value||hoje(),
    dataPrevista: document.getElementById('chq-prevista').value||hoje(),
    status:'emitido', dataCompensacao:null, lancamentoId:null,
    categoriaId: valorFinalCascata('chq','categoria'),
    centroCustoId: valorFinalCascata('chq','cc'),
    obs: document.getElementById('chq-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, chequesEmitidos:[...(DB.chequesEmitidos||[]), novo]});
  FM();
}
function editarChequeEmitido(id){
  const c = chequeById(id); if(!c) return;
  if(c.status==='compensado'){
    AM('ℹ Cheque já Compensado',`
      <div style="font-size:13px;color:var(--mut);line-height:1.6">
        Este cheque foi compensado em <strong>${fmtD(c.dataCompensacao)}</strong>, gerando a saída correspondente no extrato.<br><br>
        Para corrigir, cancele a compensação — isso vai reverter o lançamento e o cheque volta para "emitido".
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${BPerm('excluir','↩ Cancelar Compensação','cancelarCompensacaoCheque(\''+id+'\')','var(--red)','#fff')}
        ${B('Fechar','FM()','var(--sur)','var(--txt)')}
      </div>
    `);
    return;
  }
  AM('✏ Editar Cheque Emitido',`
    ${EH('e-chq-ed')}
    <div class="row">
      ${C('Conta Emissora *',`<select id="echq-conta" onchange="atualizarSugestoesChequeEmitido('echq')">${opcoesContas(c.contaId)}</select>`,'1','200')}
      ${C('Número do Cheque',`<input id="echq-numero" value="${esc(c.numero||'')}">`,'1','140')}
    </div>
    <div class="row">
      ${C('Favorecido *',`<input id="echq-fav" list="dl-fornecedores-chq-ed" value="${esc(c.favorecido)}">
        <datalist id="dl-fornecedores-chq-ed">${opcoesDatalist([...(DB.fornecedores||[]),...(DB.clientes||[])])}</datalist>`,'2','200')}
      ${C('Valor (R$) *',`<input id="echq-valor" value="${fmt(c.valor)}">`,'1','140')}
    </div>
    <div class="row">
      ${C('Data de Emissão *',`<input type="date" id="echq-emissao" value="${c.dataEmissao}">`,'1','150')}
      ${C('Previsão de Compensação *',`<input type="date" id="echq-prevista" value="${c.dataPrevista}">`,'1','150')}
    </div>
    <div class="row">
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="echq-categoria-mae" onchange="aoMudarMaeCascataFixo('echq','categoria');atualizarSugestoesChequeEmitido('echq')" style="flex:1">${opcoesCategoriaMae('despesa', tipoDaConta(c.contaId), c.centroCustoId, idsMaeSub(categoriaById(c.categoriaId)).maeId)}</select><select id="echq-categoria-sub" onchange="atualizarSugestoesChequeEmitido('echq')" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(c.categoriaId)).maeId, idsMaeSub(categoriaById(c.categoriaId)).subId)}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="echq-cc-mae" onchange="aoMudarMaeCascataFixo('echq','cc');atualizarSugestoesChequeEmitido('echq')" style="flex:1">${opcoesCentroCustoMae(tipoDaConta(c.contaId), idsMaeSub(centroCustoById(c.centroCustoId)).maeId)}</select><select id="echq-cc-sub" onchange="atualizarSugestoesChequeEmitido('echq')" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(c.centroCustoId)).maeId, idsMaeSub(centroCustoById(c.centroCustoId)).subId)}</select></div>`,'2','260')}
    </div>
    ${C('Observações',`<textarea id="echq-obs" rows="2">${esc(c.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoChequeEmitido(\''+id+'\')','var(--acc)')}
      ${c.status==='emitido'?BPerm('excluir','🚫 Devolvido','marcarChequeDevolvido(\''+id+'\')','var(--red)','#fff'):''}
      ${BPerm('excluir','🗑 Excluir','excluirChequeEmitido(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoChequeEmitido(id){
  const fav = document.getElementById('echq-fav').value.trim();
  const valor = parseValor(document.getElementById('echq-valor').value);
  if(!fav){ ME('e-chq-ed','Informe o favorecido.'); return; }
  if(!valor||valor<=0){ ME('e-chq-ed','Informe um valor válido maior que zero.'); return; }
  const patch = {
    contaId: document.getElementById('echq-conta').value,
    numero: document.getElementById('echq-numero').value.trim(),
    favorecido: fav, fornecedorId: fornecedorIdPorNome(fav), valor,
    dataEmissao: document.getElementById('echq-emissao').value||hoje(),
    dataPrevista: document.getElementById('echq-prevista').value||hoje(),
    categoriaId: valorFinalCascata('echq','categoria'),
    centroCustoId: valorFinalCascata('echq','cc'),
    obs: document.getElementById('echq-obs').value.trim()
  };
  salvar({...DB, chequesEmitidos:(DB.chequesEmitidos||[]).map(c=>c.id===id?{...c,...patch}:c)});
  FM();
}
function marcarChequeDevolvido(id){
  CF('Marcar este cheque como devolvido (não compensado pelo banco)? Ele não afeta o extrato, mas fica sinalizado para acompanhamento.', ()=>{
    salvar({...DB, chequesEmitidos:(DB.chequesEmitidos||[]).map(c=>c.id===id?{...c,status:'devolvido'}:c)});
    FM();
  });
}
function cancelarChequeEmitido(id){
  const c = chequeById(id); if(!c) return;
  CF('Cancelar este cheque (nunca chegou a ser usado)?', ()=>{
    salvar({...DB, chequesEmitidos:(DB.chequesEmitidos||[]).map(x=>x.id===id?{...x,status:'cancelado'}:x)});
    FM();
  });
}
function excluirChequeEmitido(id){
  const c = chequeById(id); if(!c) return;
  if(c.status==='compensado'){ ME('e-chq-ed','Cheques já compensados não podem ser excluídos diretamente. Cancele a compensação primeiro.'); return; }
  CF('Excluir este cheque definitivamente?', ()=>{ salvar({...DB, chequesEmitidos:(DB.chequesEmitidos||[]).filter(x=>x.id!==id)}); FM(); });
}

// ── COMPENSAÇÃO: gera automaticamente o lançamento de saída na conta emissora ──
function abrirCompensacaoCheque(id){
  const c = chequeById(id); if(!c) return;
  AM('✅ Compensar Cheque — '+esc(c.favorecido),`
    ${EH('e-comp')}
    <div class="prev">
      <div>Valor: <strong>R$ ${fmt(c.valor)}</strong></div>
      <div>Previsão: <strong>${fmtD(c.dataPrevista)}</strong></div>
    </div>
    ${C('Data Real da Compensação *',`<input type="date" id="comp-data" value="${hoje()}">`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">
      Ao confirmar, será lançada automaticamente uma <strong>saída</strong> no extrato da conta emissora.
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Compensação','confirmarCompensacaoCheque(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarCompensacaoCheque(id){
  const c = chequeById(id); if(!c) return;
  const dataCompensacao = document.getElementById('comp-data').value||hoje();
  const lancId = uid();
  const lancamento = {
    id: lancId, contaId: c.contaId, data: dataCompensacao, tipo:'saida', valor: c.valor,
    categoriaId: c.categoriaId||'', centroCustoId: c.centroCustoId||'',
    contraparte: c.favorecido,
    descricao: `Cheque${c.numero?' nº '+c.numero:''} — ${c.favorecido}`,
    origem:'cheque', contaPagarId:null, chequeId: c.id,
    criadoEm: new Date().toISOString()
  };
  salvar({
    ...DB,
    lancamentos:[...(DB.lancamentos||[]), lancamento],
    chequesEmitidos:(DB.chequesEmitidos||[]).map(x=>x.id===id?{...x,status:'compensado',dataCompensacao,lancamentoId:lancId}:x)
  });
  FM();
}
function cancelarCompensacaoCheque(id){
  const c = chequeById(id); if(!c) return;
  CF('Cancelar esta compensação? O lançamento no extrato será removido e o cheque volta para "emitido".', ()=>{
    salvar({
      ...DB,
      lancamentos:(DB.lancamentos||[]).filter(l=>l.id!==c.lancamentoId),
      chequesEmitidos:(DB.chequesEmitidos||[]).map(x=>x.id===id?{...x,status:'emitido',dataCompensacao:null,lancamentoId:null}:x)
    });
    FM();
  });
}

// ══════════════════════════════════════════
// TARIFAS BANCÁRIAS — atalho rápido de lançamento
// ══════════════════════════════════════════
function novaTarifaBancaria(contaIdPre){
  const catTarifa = categoriaPorNome('Tarifas Bancárias','despesa');
  AM('🏦 Nova Tarifa Bancária',`
    ${EH('e-tar')}
    <div class="row">
      ${C('Conta *',`<select id="tar-conta">${opcoesContas(contaIdPre)}</select>`,'2','200')}
      ${C('Data *',`<input type="date" id="tar-data" value="${hoje()}">`,'1','150')}
    </div>
    ${C('Valor (R$) *',`<input id="tar-valor" placeholder="0,00">`)}
    ${C('Descrição',`<input id="tar-desc" placeholder="Ex: manutenção de conta, TED, DOC...">`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Lançado automaticamente como saída na categoria "Tarifas Bancárias".</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaTarifa()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovaTarifa(){
  const contaId = document.getElementById('tar-conta').value;
  const valor = parseValor(document.getElementById('tar-valor').value);
  if(!contaId){ ME('e-tar','Selecione a conta.'); return; }
  if(!valor||valor<=0){ ME('e-tar','Informe um valor válido maior que zero.'); return; }
  const catTarifa = categoriaPorNome('Tarifas Bancárias','despesa');
  const novo = {
    id:uid(), contaId,
    data: document.getElementById('tar-data').value||hoje(),
    tipo:'saida', valor,
    categoriaId: catTarifa?catTarifa.id:'',
    centroCustoId:'', contraparte:'',
    descricao: document.getElementById('tar-desc').value.trim()||'Tarifa bancária',
    origem:'manual', contaPagarId:null,
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, lancamentos:[...(DB.lancamentos||[]), novo]});
  FM();
}

// ══════════════════════════════════════════
// CRUD — INVESTIMENTOS (ativo acumulador: aporte / resgate / posição)
// ══════════════════════════════════════════
function novoInvestimento(){
  AM('➕ Novo Investimento',`
    ${EH('e-inv')}
    <div class="row">
      ${C('Tipo *',`<select id="inv-tipo"><option>CDB</option><option>Tesouro Direto</option><option>Fundo de Investimento</option><option>Poupança</option><option>Ações</option><option>Outro</option></select>`,'1','160')}
      ${C('Instituição *',`<input id="inv-instituicao" placeholder="Ex: Banco XP, Corretora...">`,'1','180')}
    </div>
    <div class="row">
      ${C('Conta de Origem do Aporte *',`<select id="inv-conta">${opcoesContas()}</select>`,'2','200')}
      ${C('Valor Aplicado (R$) *',`<input id="inv-valor" placeholder="0,00">`,'1','150')}
    </div>
    <div class="row">
      ${C('Data da Aplicação *',`<input type="date" id="inv-data" value="${hoje()}">`,'1','150')}
      ${C('Indexador',`<select id="inv-indexador"><option>CDI</option><option>SELIC</option><option>IPCA</option><option>Prefixado</option><option>Outro</option></select>`,'1','150')}
      ${C('Taxa (% a.a.)',`<input id="inv-taxa" placeholder="Ex: 12,5">`,'1','130')}
    </div>
    ${C('Vencimento (se houver)',`<input type="date" id="inv-vencimento">`)}
    ${C('Observações',`<textarea id="inv-obs" rows="2"></textarea>`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">O valor aplicado será lançado automaticamente como saída na conta de origem.</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoInvestimento()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovoInvestimento(){
  const contaId = document.getElementById('inv-conta').value;
  const instituicao = document.getElementById('inv-instituicao').value.trim();
  const valor = parseValor(document.getElementById('inv-valor').value);
  if(!instituicao){ ME('e-inv','Informe a instituição.'); return; }
  if(!contaId){ ME('e-inv','Selecione a conta de origem.'); return; }
  if(!valor||valor<=0){ ME('e-inv','Informe um valor válido maior que zero.'); return; }
  const id = uid();
  const dataAplicacao = document.getElementById('inv-data').value||hoje();
  const novo = {
    id, tipo: document.getElementById('inv-tipo').value, instituicao, contaId,
    dataAplicacao, valorAplicado: valor, valorResgatado: 0, valorAtual: valor,
    indexador: document.getElementById('inv-indexador').value,
    taxa: parseValor(document.getElementById('inv-taxa').value),
    vencimento: document.getElementById('inv-vencimento').value||null,
    status:'ativo', obs: document.getElementById('inv-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  const catInv = categoriaPorNome('Investimentos (Aporte)','despesa');
  const lancamento = {
    id:uid(), contaId, data:dataAplicacao, tipo:'saida', valor,
    categoriaId: catInv?catInv.id:'', centroCustoId:'', contraparte: instituicao,
    descricao: `Aplicação em investimento — ${instituicao}`,
    origem:'investimento', contaPagarId:null, investimentoId:id, opInvest:'aporte',
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, investimentos:[...(DB.investimentos||[]), novo], lancamentos:[...(DB.lancamentos||[]), lancamento]});
  FM();
}
function editarInvestimento(id){
  const i = investimentoById(id); if(!i) return;
  AM('✏ Editar Investimento — '+esc(i.instituicao),`
    ${EH('e-inv-ed')}
    <div class="prev">
      <div>Aplicado: <strong>R$ ${fmt(i.valorAplicado)}</strong></div>
      <div>Resgatado: <strong>R$ ${fmt(i.valorResgatado)}</strong></div>
      <div>Posição Atual: <strong>R$ ${fmt(i.valorAtual)}</strong></div>
      <div>Ganho: <strong style="color:${ganhoInvestimento(i)>=0?'#3fb950':'#f85149'}">R$ ${fmt(ganhoInvestimento(i))}</strong></div>
    </div>
    <div class="row">
      ${C('Instituição *',`<input id="einv-instituicao" value="${esc(i.instituicao)}">`,'1','180')}
      ${C('Indexador',`<select id="einv-indexador"><option${i.indexador==='CDI'?' selected':''}>CDI</option><option${i.indexador==='SELIC'?' selected':''}>SELIC</option><option${i.indexador==='IPCA'?' selected':''}>IPCA</option><option${i.indexador==='Prefixado'?' selected':''}>Prefixado</option><option${i.indexador==='Outro'?' selected':''}>Outro</option></select>`,'1','150')}
      ${C('Taxa (% a.a.)',`<input id="einv-taxa" value="${i.taxa||''}">`,'1','120')}
    </div>
    ${C('Vencimento (se houver)',`<input type="date" id="einv-vencimento" value="${i.vencimento||''}">`)}
    ${C('Observações',`<textarea id="einv-obs" rows="2">${esc(i.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${B('💾 Salvar','salvarEdicaoInvestimento(\''+id+'\')','var(--acc)')}
      ${i.status==='ativo'?B('➕ Aportar Mais','abrirAporteInvestimento(\''+id+'\')','var(--grn)','#fff'):''}
      ${i.status==='ativo'?B('📊 Atualizar Posição','abrirAtualizarPosicao(\''+id+'\')','var(--blu)','#fff'):''}
      ${i.status==='ativo'?B('💵 Resgatar','abrirResgateInvestimento(\''+id+'\')','#f0a500','#000'):''}
      ${BPerm('excluir','🗑 Excluir','excluirInvestimento(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoInvestimento(id){
  const instituicao = document.getElementById('einv-instituicao').value.trim();
  if(!instituicao){ ME('e-inv-ed','Informe a instituição.'); return; }
  const patch = {
    instituicao,
    indexador: document.getElementById('einv-indexador').value,
    taxa: parseValor(document.getElementById('einv-taxa').value),
    vencimento: document.getElementById('einv-vencimento').value||null,
    obs: document.getElementById('einv-obs').value.trim()
  };
  salvar({...DB, investimentos:(DB.investimentos||[]).map(i=>i.id===id?{...i,...patch}:i)});
  FM();
}
function excluirInvestimento(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.investimentoId===id);
  if(emUso){ ME('e-inv-ed','Este investimento já possui movimentações e não pode ser excluído.'); return; }
  CF('Excluir este investimento?', ()=>{ salvar({...DB, investimentos:(DB.investimentos||[]).filter(i=>i.id!==id)}); FM(); });
}
function abrirAporteInvestimento(id){
  const i = investimentoById(id); if(!i) return;
  AM('➕ Aportar Mais — '+esc(i.instituicao),`
    ${EH('e-aporte')}
    ${C('Conta de Origem *',`<select id="aporte-conta">${opcoesContas(i.contaId)}</select>`)}
    ${C('Valor do Aporte (R$) *',`<input id="aporte-valor" placeholder="0,00">`)}
    ${C('Data *',`<input type="date" id="aporte-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Aporte','confirmarAporteInvestimento(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarAporteInvestimento(id){
  const i = investimentoById(id); if(!i) return;
  const contaId = document.getElementById('aporte-conta').value;
  const valor = parseValor(document.getElementById('aporte-valor').value);
  const data = document.getElementById('aporte-data').value||hoje();
  if(!valor||valor<=0){ ME('e-aporte','Informe um valor válido maior que zero.'); return; }
  const catInv = categoriaPorNome('Investimentos (Aporte)','despesa');
  const lancamento = {
    id:uid(), contaId, data, tipo:'saida', valor,
    categoriaId: catInv?catInv.id:'', centroCustoId:'', contraparte: i.instituicao,
    descricao: `Aporte adicional — ${i.instituicao}`,
    origem:'investimento', contaPagarId:null, investimentoId:id, opInvest:'aporte',
    criadoEm: new Date().toISOString()
  };
  salvar({
    ...DB,
    investimentos:(DB.investimentos||[]).map(x=>x.id===id?{...x,valorAplicado:Number(x.valorAplicado)+valor,valorAtual:Number(x.valorAtual)+valor}:x),
    lancamentos:[...(DB.lancamentos||[]), lancamento]
  });
  FM();
}
function abrirAtualizarPosicao(id){
  const i = investimentoById(id); if(!i) return;
  AM('📊 Atualizar Posição — '+esc(i.instituicao),`
    ${EH('e-pos')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Use esta opção para registrar o rendimento acumulado (extrato do banco/corretora), sem gerar lançamento bancário.</div>
    ${C('Valor Atual da Posição (R$) *',`<input id="pos-valor" value="${fmt(i.valorAtual)}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Atualizar','confirmarAtualizarPosicao(\''+id+'\')','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarAtualizarPosicao(id){
  const valor = parseValor(document.getElementById('pos-valor').value);
  if(valor<0){ ME('e-pos','Informe um valor válido.'); return; }
  salvar({...DB, investimentos:(DB.investimentos||[]).map(x=>x.id===id?{...x,valorAtual:valor}:x)});
  FM();
}
function abrirResgateInvestimento(id){
  const i = investimentoById(id); if(!i) return;
  AM('💵 Resgatar — '+esc(i.instituicao),`
    ${EH('e-resg')}
    <div class="prev"><div>Posição disponível: <strong>R$ ${fmt(i.valorAtual)}</strong></div></div>
    ${C('Conta de Destino *',`<select id="resg-conta">${opcoesContas(i.contaId)}</select>`)}
    ${C('Valor do Resgate (R$) *',`<input id="resg-valor" value="${fmt(i.valorAtual)}">`)}
    ${C('Data *',`<input type="date" id="resg-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Resgate','confirmarResgateInvestimento(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarResgateInvestimento(id){
  const i = investimentoById(id); if(!i) return;
  const contaId = document.getElementById('resg-conta').value;
  const valor = parseValor(document.getElementById('resg-valor').value);
  const data = document.getElementById('resg-data').value||hoje();
  if(!valor||valor<=0){ ME('e-resg','Informe um valor válido maior que zero.'); return; }
  if(valor>Number(i.valorAtual)+0.01){ ME('e-resg','O valor do resgate não pode ser maior que a posição atual.'); return; }
  const catRend = categoriaPorNome('Rendimentos Financeiros','receita');
  const lancamento = {
    id:uid(), contaId, data, tipo:'entrada', valor,
    categoriaId: catRend?catRend.id:'', centroCustoId:'', contraparte: i.instituicao,
    descricao: `Resgate de investimento — ${i.instituicao}`,
    origem:'investimento', contaPagarId:null, investimentoId:id, opInvest:'resgate',
    criadoEm: new Date().toISOString()
  };
  const novoValorAtual = Number(i.valorAtual)-valor;
  salvar({
    ...DB,
    investimentos:(DB.investimentos||[]).map(x=>x.id===id?{...x,valorResgatado:Number(x.valorResgatado)+valor,valorAtual:novoValorAtual,status:novoValorAtual<=0.01?'encerrado':'ativo'}:x),
    lancamentos:[...(DB.lancamentos||[]), lancamento]
  });
  FM();
}

// ══════════════════════════════════════════
// CRUD — PREVIDÊNCIA (mesmo padrão de Investimentos)
// ══════════════════════════════════════════
function novaPrevidencia(){
  AM('➕ Nova Previdência',`
    ${EH('e-prev')}
    <div class="row">
      ${C('Tipo *',`<select id="prev-tipo"><option>PGBL</option><option>VGBL</option></select>`,'1','140')}
      ${C('Instituição *',`<input id="prev-instituicao" placeholder="Ex: Bradesco Vida e Previdência">`,'1','200')}
    </div>
    <div class="row">
      ${C('Conta de Origem *',`<select id="prev-conta">${opcoesContas()}</select>`,'2','200')}
      ${C('Aporte Inicial (R$) *',`<input id="prev-valor" placeholder="0,00">`,'1','150')}
    </div>
    ${C('Data de Início *',`<input type="date" id="prev-data" value="${hoje()}">`)}
    ${C('Beneficiário',`<input id="prev-benef" placeholder="Opcional">`)}
    ${C('Observações',`<textarea id="prev-obs" rows="2"></textarea>`)}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">O valor será lançado automaticamente como saída na conta escolhida.</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaPrevidencia()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovaPrevidencia(){
  const contaId = document.getElementById('prev-conta').value;
  const instituicao = document.getElementById('prev-instituicao').value.trim();
  const valor = parseValor(document.getElementById('prev-valor').value);
  if(!instituicao){ ME('e-prev','Informe a instituição.'); return; }
  if(!valor||valor<=0){ ME('e-prev','Informe um valor válido maior que zero.'); return; }
  const id = uid();
  const dataInicio = document.getElementById('prev-data').value||hoje();
  const novo = {
    id, tipo: document.getElementById('prev-tipo').value, instituicao, contaId,
    dataInicio, valorAplicado: valor, valorResgatado:0, valorAtual: valor,
    beneficiario: document.getElementById('prev-benef').value.trim(),
    status:'ativo', obs: document.getElementById('prev-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  const catPrev = categoriaPorNome('Previdência (Aporte)','despesa');
  const lancamento = {
    id:uid(), contaId, data:dataInicio, tipo:'saida', valor,
    categoriaId: catPrev?catPrev.id:'', centroCustoId:'', contraparte: instituicao,
    descricao: `Aporte em previdência — ${instituicao}`,
    origem:'previdencia', contaPagarId:null, previdenciaId:id, opInvest:'aporte',
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, previdencias:[...(DB.previdencias||[]), novo], lancamentos:[...(DB.lancamentos||[]), lancamento]});
  FM();
}
function editarPrevidencia(id){
  const p = previdenciaById(id); if(!p) return;
  AM('✏ Editar Previdência — '+esc(p.instituicao),`
    ${EH('e-prev-ed')}
    <div class="prev">
      <div>Aplicado: <strong>R$ ${fmt(p.valorAplicado)}</strong></div>
      <div>Resgatado: <strong>R$ ${fmt(p.valorResgatado)}</strong></div>
      <div>Posição Atual: <strong>R$ ${fmt(p.valorAtual)}</strong></div>
    </div>
    <div class="row">
      ${C('Instituição *',`<input id="eprev-instituicao" value="${esc(p.instituicao)}">`,'1','200')}
      ${C('Beneficiário',`<input id="eprev-benef" value="${esc(p.beneficiario||'')}">`,'1','180')}
    </div>
    ${C('Observações',`<textarea id="eprev-obs" rows="2">${esc(p.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${B('💾 Salvar','salvarEdicaoPrevidencia(\''+id+'\')','var(--acc)')}
      ${p.status==='ativo'?B('➕ Aportar Mais','abrirAportePrevidencia(\''+id+'\')','var(--grn)','#fff'):''}
      ${p.status==='ativo'?B('📊 Atualizar Posição','abrirAtualizarPosicaoPrev(\''+id+'\')','var(--blu)','#fff'):''}
      ${p.status==='ativo'?B('💵 Resgatar','abrirResgatePrevidencia(\''+id+'\')','#f0a500','#000'):''}
      ${BPerm('excluir','🗑 Excluir','excluirPrevidencia(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoPrevidencia(id){
  const instituicao = document.getElementById('eprev-instituicao').value.trim();
  if(!instituicao){ ME('e-prev-ed','Informe a instituição.'); return; }
  salvar({...DB, previdencias:(DB.previdencias||[]).map(p=>p.id===id?{...p,instituicao,beneficiario:document.getElementById('eprev-benef').value.trim(),obs:document.getElementById('eprev-obs').value.trim()}:p)});
  FM();
}
function excluirPrevidencia(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.previdenciaId===id);
  if(emUso){ ME('e-prev-ed','Esta previdência já possui movimentações e não pode ser excluída.'); return; }
  CF('Excluir esta previdência?', ()=>{ salvar({...DB, previdencias:(DB.previdencias||[]).filter(p=>p.id!==id)}); FM(); });
}
function abrirAportePrevidencia(id){
  const p = previdenciaById(id); if(!p) return;
  AM('➕ Aportar Mais — '+esc(p.instituicao),`
    ${EH('e-aportep')}
    ${C('Conta de Origem *',`<select id="aportep-conta">${opcoesContas(p.contaId)}</select>`)}
    ${C('Valor do Aporte (R$) *',`<input id="aportep-valor" placeholder="0,00">`)}
    ${C('Data *',`<input type="date" id="aportep-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Aporte','confirmarAportePrevidencia(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarAportePrevidencia(id){
  const p = previdenciaById(id); if(!p) return;
  const contaId = document.getElementById('aportep-conta').value;
  const valor = parseValor(document.getElementById('aportep-valor').value);
  const data = document.getElementById('aportep-data').value||hoje();
  if(!valor||valor<=0){ ME('e-aportep','Informe um valor válido maior que zero.'); return; }
  const catPrev = categoriaPorNome('Previdência (Aporte)','despesa');
  const lancamento = {
    id:uid(), contaId, data, tipo:'saida', valor,
    categoriaId: catPrev?catPrev.id:'', centroCustoId:'', contraparte: p.instituicao,
    descricao: `Aporte adicional em previdência — ${p.instituicao}`,
    origem:'previdencia', contaPagarId:null, previdenciaId:id, opInvest:'aporte',
    criadoEm: new Date().toISOString()
  };
  salvar({
    ...DB,
    previdencias:(DB.previdencias||[]).map(x=>x.id===id?{...x,valorAplicado:Number(x.valorAplicado)+valor,valorAtual:Number(x.valorAtual)+valor}:x),
    lancamentos:[...(DB.lancamentos||[]), lancamento]
  });
  FM();
}
function abrirAtualizarPosicaoPrev(id){
  const p = previdenciaById(id); if(!p) return;
  AM('📊 Atualizar Posição — '+esc(p.instituicao),`
    ${EH('e-posp')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Registre o saldo atual conforme extrato da seguradora, sem gerar lançamento bancário.</div>
    ${C('Valor Atual da Posição (R$) *',`<input id="posp-valor" value="${fmt(p.valorAtual)}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Atualizar','confirmarAtualizarPosicaoPrev(\''+id+'\')','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarAtualizarPosicaoPrev(id){
  const valor = parseValor(document.getElementById('posp-valor').value);
  if(valor<0){ ME('e-posp','Informe um valor válido.'); return; }
  salvar({...DB, previdencias:(DB.previdencias||[]).map(x=>x.id===id?{...x,valorAtual:valor}:x)});
  FM();
}
function abrirResgatePrevidencia(id){
  const p = previdenciaById(id); if(!p) return;
  AM('💵 Resgatar — '+esc(p.instituicao),`
    ${EH('e-resgp')}
    <div class="prev"><div>Posição disponível: <strong>R$ ${fmt(p.valorAtual)}</strong></div></div>
    ${C('Conta de Destino *',`<select id="resgp-conta">${opcoesContas(p.contaId)}</select>`)}
    ${C('Valor do Resgate (R$) *',`<input id="resgp-valor" value="${fmt(p.valorAtual)}">`)}
    ${C('Data *',`<input type="date" id="resgp-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Resgate','confirmarResgatePrevidencia(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarResgatePrevidencia(id){
  const p = previdenciaById(id); if(!p) return;
  const contaId = document.getElementById('resgp-conta').value;
  const valor = parseValor(document.getElementById('resgp-valor').value);
  const data = document.getElementById('resgp-data').value||hoje();
  if(!valor||valor<=0){ ME('e-resgp','Informe um valor válido maior que zero.'); return; }
  if(valor>Number(p.valorAtual)+0.01){ ME('e-resgp','O valor do resgate não pode ser maior que a posição atual.'); return; }
  const catRend = categoriaPorNome('Rendimentos Financeiros','receita');
  const lancamento = {
    id:uid(), contaId, data, tipo:'entrada', valor,
    categoriaId: catRend?catRend.id:'', centroCustoId:'', contraparte: p.instituicao,
    descricao: `Resgate de previdência — ${p.instituicao}`,
    origem:'previdencia', contaPagarId:null, previdenciaId:id, opInvest:'resgate',
    criadoEm: new Date().toISOString()
  };
  const novoValorAtual = Number(p.valorAtual)-valor;
  salvar({
    ...DB,
    previdencias:(DB.previdencias||[]).map(x=>x.id===id?{...x,valorResgatado:Number(x.valorResgatado)+valor,valorAtual:novoValorAtual,status:novoValorAtual<=0.01?'encerrado':'ativo'}:x),
    lancamentos:[...(DB.lancamentos||[]), lancamento]
  });
  FM();
}

// ══════════════════════════════════════════
// CRUD — CAPITALIZAÇÃO (parcelas + resgate final)
// ══════════════════════════════════════════
function novaCapitalizacao(){
  AM('➕ Novo Título de Capitalização',`
    ${EH('e-cap')}
    <div class="row">
      ${C('Instituição *',`<input id="cap-instituicao" placeholder="Ex: Bradesco Capitalização">`,'1','180')}
      ${C('Número do Título',`<input id="cap-numero" placeholder="Opcional">`,'1','150')}
    </div>
    <div class="row">
      ${C('Conta de Débito *',`<select id="cap-conta">${opcoesContas()}</select>`,'1','200')}
      ${C('Valor da Parcela (R$) *',`<input id="cap-parcela" placeholder="0,00">`,'1','150')}
      ${C('Total de Parcelas *',`<input id="cap-total" placeholder="Ex: 60">`,'1','120')}
    </div>
    <div class="row">
      ${C('Data de Início *',`<input type="date" id="cap-inicio" value="${hoje()}">`,'1','150')}
      ${C('Data Final Prevista',`<input type="date" id="cap-fim">`,'1','150')}
    </div>
    ${C('Observações',`<textarea id="cap-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovaCapitalizacao()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovaCapitalizacao(){
  const instituicao = document.getElementById('cap-instituicao').value.trim();
  const contaId = document.getElementById('cap-conta').value;
  const valorParcela = parseValor(document.getElementById('cap-parcela').value);
  const totalParcelas = parseInt(document.getElementById('cap-total').value)||0;
  if(!instituicao){ ME('e-cap','Informe a instituição.'); return; }
  if(!valorParcela||valorParcela<=0){ ME('e-cap','Informe um valor de parcela válido.'); return; }
  if(!totalParcelas||totalParcelas<=0){ ME('e-cap','Informe o total de parcelas.'); return; }
  const novo = {
    id:uid(), instituicao, numero: document.getElementById('cap-numero').value.trim(), contaId,
    valorParcela, totalParcelas, parcelasPagas:0,
    dataInicio: document.getElementById('cap-inicio').value||hoje(),
    dataFim: document.getElementById('cap-fim').value||null,
    status:'ativo', obs: document.getElementById('cap-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, capitalizacoes:[...(DB.capitalizacoes||[]), novo]});
  FM();
}
function editarCapitalizacao(id){
  const c = capitalizacaoById(id); if(!c) return;
  AM('✏ Editar Capitalização — '+esc(c.instituicao),`
    ${EH('e-cap-ed')}
    <div class="prev"><div>Parcelas pagas: <strong>${c.parcelasPagas} / ${c.totalParcelas}</strong></div></div>
    ${C('Instituição *',`<input id="ecap-instituicao" value="${esc(c.instituicao)}">`,'1','200')}
    ${C('Observações',`<textarea id="ecap-obs" rows="2">${esc(c.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${B('💾 Salvar','salvarEdicaoCapitalizacao(\''+id+'\')','var(--acc)')}
      ${c.status==='ativo'&&c.parcelasPagas<c.totalParcelas?B('💳 Pagar Parcela','abrirPagarParcela(\''+id+'\')','var(--grn)','#fff'):''}
      ${c.status==='ativo'?B('🏁 Encerrar/Resgatar','abrirEncerrarCapitalizacao(\''+id+'\')','#f0a500','#000'):''}
      ${BPerm('excluir','🗑 Excluir','excluirCapitalizacao(\''+id+'\')','var(--red)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoCapitalizacao(id){
  const instituicao = document.getElementById('ecap-instituicao').value.trim();
  if(!instituicao){ ME('e-cap-ed','Informe a instituição.'); return; }
  salvar({...DB, capitalizacoes:(DB.capitalizacoes||[]).map(c=>c.id===id?{...c,instituicao,obs:document.getElementById('ecap-obs').value.trim()}:c)});
  FM();
}
function excluirCapitalizacao(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.capitalizacaoId===id);
  if(emUso){ ME('e-cap-ed','Este título já possui movimentações e não pode ser excluído.'); return; }
  CF('Excluir este título de capitalização?', ()=>{ salvar({...DB, capitalizacoes:(DB.capitalizacoes||[]).filter(c=>c.id!==id)}); FM(); });
}
function abrirPagarParcela(id){
  const c = capitalizacaoById(id); if(!c) return;
  AM('💳 Pagar Parcela — '+esc(c.instituicao),`
    ${EH('e-parc')}
    <div class="prev"><div>Parcela: <strong>R$ ${fmt(c.valorParcela)}</strong></div><div>Nº ${c.parcelasPagas+1} de ${c.totalParcelas}</div></div>
    ${C('Data do Pagamento *',`<input type="date" id="parc-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Pagamento','confirmarPagarParcela(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarPagarParcela(id){
  const c = capitalizacaoById(id); if(!c) return;
  const data = document.getElementById('parc-data').value||hoje();
  const catCap = categoriaPorNome('Capitalização (Parcela)','despesa');
  const lancamento = {
    id:uid(), contaId:c.contaId, data, tipo:'saida', valor:c.valorParcela,
    categoriaId: catCap?catCap.id:'', centroCustoId:'', contraparte: c.instituicao,
    descricao: `Parcela ${c.parcelasPagas+1}/${c.totalParcelas} — Capitalização ${c.instituicao}`,
    origem:'capitalizacao', contaPagarId:null, capitalizacaoId:id, opInvest:'parcela',
    criadoEm: new Date().toISOString()
  };
  const novasParcelas = c.parcelasPagas+1;
  salvar({
    ...DB,
    capitalizacoes:(DB.capitalizacoes||[]).map(x=>x.id===id?{...x,parcelasPagas:novasParcelas,status:novasParcelas>=x.totalParcelas?'quitado':'ativo'}:x),
    lancamentos:[...(DB.lancamentos||[]), lancamento]
  });
  FM();
}
function abrirEncerrarCapitalizacao(id){
  const c = capitalizacaoById(id); if(!c) return;
  AM('🏁 Encerrar / Resgatar — '+esc(c.instituicao),`
    ${EH('e-enccap')}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Se houve valor de resgate/sorteio a receber, informe abaixo. Deixe zero se for apenas cancelamento sem devolução.</div>
    ${C('Conta de Destino',`<select id="enccap-conta">${opcoesContas(c.contaId)}</select>`)}
    ${C('Valor a Receber (R$)',`<input id="enccap-valor" placeholder="0,00">`)}
    ${C('Data *',`<input type="date" id="enccap-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Encerramento','confirmarEncerrarCapitalizacao(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarEncerrarCapitalizacao(id){
  const c = capitalizacaoById(id); if(!c) return;
  const valor = parseValor(document.getElementById('enccap-valor').value);
  const contaId = document.getElementById('enccap-conta').value;
  const data = document.getElementById('enccap-data').value||hoje();
  let novoDb = {...DB, capitalizacoes:(DB.capitalizacoes||[]).map(x=>x.id===id?{...x,status:'encerrado'}:x)};
  if(valor>0){
    const catRend = categoriaPorNome('Rendimentos Financeiros','receita');
    const lancamento = {
      id:uid(), contaId, data, tipo:'entrada', valor,
      categoriaId: catRend?catRend.id:'', centroCustoId:'', contraparte: c.instituicao,
      descricao: `Resgate de capitalização — ${c.instituicao}`,
      origem:'capitalizacao', contaPagarId:null, capitalizacaoId:id, opInvest:'resgate',
      criadoEm: new Date().toISOString()
    };
    novoDb.lancamentos = [...(DB.lancamentos||[]), lancamento];
  }
  salvar(novoDb);
  FM();
}

// ══════════════════════════════════════════
// CRUD — SEGUROS (apólice + prêmio)
// ══════════════════════════════════════════
function novoSeguro(){
  AM('➕ Novo Seguro',`
    ${EH('e-seg')}
    <div class="row">
      ${C('Tipo *',`<select id="seg-tipo"><option>Vida</option><option>Empresarial</option><option>Veículo</option><option>Predial</option><option>Outro</option></select>`,'1','150')}
      ${C('Seguradora *',`<input id="seg-seguradora" placeholder="Ex: Porto Seguro">`,'1','180')}
    </div>
    ${C('Nº da Apólice',`<input id="seg-apolice" placeholder="Opcional">`)}
    <div class="row">
      ${C('Conta de Pagamento *',`<select id="seg-conta">${opcoesContas()}</select>`,'1','200')}
      ${C('Valor do Prêmio (R$) *',`<input id="seg-premio" placeholder="0,00">`,'1','150')}
      ${C('Forma de Pagamento',`<select id="seg-forma"><option value="anual">Anual</option><option value="mensal">Mensal</option><option value="avista">À vista</option></select>`,'1','140')}
    </div>
    <div class="row">
      ${C('Vigência Início *',`<input type="date" id="seg-inicio" value="${hoje()}">`,'1','150')}
      ${C('Vigência Fim *',`<input type="date" id="seg-fim">`,'1','150')}
    </div>
    ${C('Valor da Cobertura (R$)',`<input id="seg-cobertura" placeholder="Opcional">`)}
    ${C('Observações',`<textarea id="seg-obs" rows="2"></textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarNovoSeguro()','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarNovoSeguro(){
  const seguradora = document.getElementById('seg-seguradora').value.trim();
  const contaId = document.getElementById('seg-conta').value;
  const premio = parseValor(document.getElementById('seg-premio').value);
  const vigenciaFim = document.getElementById('seg-fim').value;
  if(!seguradora){ ME('e-seg','Informe a seguradora.'); return; }
  if(!premio||premio<=0){ ME('e-seg','Informe um valor de prêmio válido.'); return; }
  if(!vigenciaFim){ ME('e-seg','Informe a data final da vigência.'); return; }
  const novo = {
    id:uid(), tipo: document.getElementById('seg-tipo').value, seguradora,
    apolice: document.getElementById('seg-apolice').value.trim(), contaId,
    valorPremio: premio, formaPagamento: document.getElementById('seg-forma').value,
    vigenciaInicio: document.getElementById('seg-inicio').value||hoje(), vigenciaFim,
    valorCobertura: parseValor(document.getElementById('seg-cobertura').value),
    status:'ativo', obs: document.getElementById('seg-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, seguros:[...(DB.seguros||[]), novo]});
  FM();
}
function editarSeguro(id){
  const s = seguroById(id); if(!s) return;
  AM('✏ Editar Seguro — '+esc(s.seguradora),`
    ${EH('e-seg-ed')}
    <div class="row">
      ${C('Seguradora *',`<input id="eseg-seguradora" value="${esc(s.seguradora)}">`,'1','180')}
      ${C('Nº da Apólice',`<input id="eseg-apolice" value="${esc(s.apolice||'')}">`,'1','150')}
    </div>
    <div class="row">
      ${C('Vigência Início *',`<input type="date" id="eseg-inicio" value="${s.vigenciaInicio}">`,'1','150')}
      ${C('Vigência Fim *',`<input type="date" id="eseg-fim" value="${s.vigenciaFim}">`,'1','150')}
    </div>
    ${C('Observações',`<textarea id="eseg-obs" rows="2">${esc(s.obs||'')}</textarea>`)}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${B('💾 Salvar','salvarEdicaoSeguro(\''+id+'\')','var(--acc)')}
      ${s.status==='ativo'?B('💳 Pagar Prêmio','abrirPagarPremio(\''+id+'\')','var(--grn)','#fff'):''}
      ${s.status==='ativo'?B('🔄 Renovar Vigência','abrirRenovarSeguro(\''+id+'\')','var(--blu)','#fff'):''}
      ${s.status==='ativo'?B('🚫 Cancelar Seguro','cancelarSeguro(\''+id+'\')','#f0a500','#000'):''}
      ${BPerm('excluir','🗑 Excluir','excluirSeguro(\''+id+'\')','var(--red)','#fff')}
      ${B('Fechar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoSeguro(id){
  const seguradora = document.getElementById('eseg-seguradora').value.trim();
  if(!seguradora){ ME('e-seg-ed','Informe a seguradora.'); return; }
  const patch = {
    seguradora, apolice: document.getElementById('eseg-apolice').value.trim(),
    vigenciaInicio: document.getElementById('eseg-inicio').value,
    vigenciaFim: document.getElementById('eseg-fim').value,
    obs: document.getElementById('eseg-obs').value.trim()
  };
  salvar({...DB, seguros:(DB.seguros||[]).map(s=>s.id===id?{...s,...patch}:s)});
  FM();
}
function excluirSeguro(id){
  const emUso = (DB.lancamentos||[]).some(l=>l.seguroId===id);
  if(emUso){ ME('e-seg-ed','Este seguro já possui pagamentos e não pode ser excluído.'); return; }
  CF('Excluir este seguro?', ()=>{ salvar({...DB, seguros:(DB.seguros||[]).filter(s=>s.id!==id)}); FM(); });
}
function cancelarSeguro(id){
  CF('Cancelar este seguro?', ()=>{ salvar({...DB, seguros:(DB.seguros||[]).map(s=>s.id===id?{...s,status:'cancelado'}:s)}); FM(); });
}
function abrirPagarPremio(id){
  const s = seguroById(id); if(!s) return;
  AM('💳 Pagar Prêmio — '+esc(s.seguradora),`
    ${EH('e-prem')}
    ${C('Conta de Pagamento *',`<select id="prem-conta">${opcoesContas(s.contaId)}</select>`)}
    ${C('Valor (R$) *',`<input id="prem-valor" value="${fmt(s.valorPremio)}">`)}
    ${C('Data *',`<input type="date" id="prem-data" value="${hoje()}">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Pagamento','confirmarPagarPremio(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarPagarPremio(id){
  const s = seguroById(id); if(!s) return;
  const contaId = document.getElementById('prem-conta').value;
  const valor = parseValor(document.getElementById('prem-valor').value);
  const data = document.getElementById('prem-data').value||hoje();
  if(!valor||valor<=0){ ME('e-prem','Informe um valor válido maior que zero.'); return; }
  const catSeg = categoriaPorNome('Seguros (Prêmio)','despesa');
  const lancamento = {
    id:uid(), contaId, data, tipo:'saida', valor,
    categoriaId: catSeg?catSeg.id:'', centroCustoId:'', contraparte: s.seguradora,
    descricao: `Prêmio de seguro — ${s.seguradora}`,
    origem:'seguro', contaPagarId:null, seguroId:id, opInvest:'premio',
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, lancamentos:[...(DB.lancamentos||[]), lancamento]});
  FM();
}
function abrirRenovarSeguro(id){
  const s = seguroById(id); if(!s) return;
  AM('🔄 Renovar Vigência — '+esc(s.seguradora),`
    ${EH('e-renov')}
    ${C('Nova Vigência Início *',`<input type="date" id="renov-inicio" value="${s.vigenciaFim}">`)}
    ${C('Nova Vigência Fim *',`<input type="date" id="renov-fim">`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Confirmar Renovação','confirmarRenovarSeguro(\''+id+'\')','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarRenovarSeguro(id){
  const inicio = document.getElementById('renov-inicio').value;
  const fim = document.getElementById('renov-fim').value;
  if(!inicio||!fim){ ME('e-renov','Informe as duas datas de vigência.'); return; }
  salvar({...DB, seguros:(DB.seguros||[]).map(s=>s.id===id?{...s,vigenciaInicio:inicio,vigenciaFim:fim}:s)});
  FM();
}

// ══════════════════════════════════════════
// RENDER — DASHBOARD
// ══════════════════════════════════════════
let _filtroDashPFPJ = 'todos';
function mudarFiltroDashPFPJ(tipo){ _filtroDashPFPJ = tipo; _cartaoSelecionadoDash = null; renderAba(); }
let _dashSoTitulos = false;
let _kpiAberto = null;
function alternarDashSoTitulos(){ _dashSoTitulos = !_dashSoTitulos; _kpiAberto=null; renderAba(); }
function toggleKpi(chave){
  _kpiAberto = (_kpiAberto===chave ? null : chave);
  if(_kpiAberto!=='cartoes') _cartaoSelecionadoDash = null;
  renderAba();
  if(_kpiAberto==='cartoes'){
    const semDados = !_resumoCartoes || (!_resumoCartoes.pf?.porCartao && !_resumoCartoes.pj?.porCartao);
    if(semDados) atualizarResumoCartoes(true);
  }
}
function abrirContaEmLancamentos(contaId){ _filtroLancConta = contaId; irPara('lancamentos'); }
function abrirContaNoExtrato(contaId){
  RelExtrato = { contaId, de:'', ate:'', fornecedor:'' };
  RLT.cat = 'bancarias'; RLT.tipo = 'extrato_conta';
  irPara('relatorios');
}
function kpiCard(chave, label, valorHtml, subtitulo, composicaoHtml){
  const aberto = _kpiAberto===chave;
  if(_dashSoTitulos){
    return `<div class="card kpi" onclick="alternarDashSoTitulos()" style="cursor:pointer">
      <div class="kpi-l">${label}</div>
    </div>`;
  }
  return `<div class="card kpi" onclick="toggleKpi('${chave}')" style="cursor:pointer">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1">
        <div class="kpi-l">${label}</div>
        <div class="kpi-v">${valorHtml}</div>
        <div class="kpi-s">${subtitulo}</div>
      </div>
      <span style="font-size:11px;color:var(--mut);margin-left:6px">${aberto?'▲':'▼'}</span>
    </div>
    ${aberto&&composicaoHtml ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bor)" onclick="event.stopPropagation()">${composicaoHtml}</div>` : ''}
  </div>`;
}
function htmlDashboard(){
  const filtro = _filtroDashPFPJ;
  const contasTodasAtivas = (DB.contas||[]).filter(c=>c.ativa!==false);
  const contas = filtro==='todos' ? contasTodasAtivas : contasTodasAtivas.filter(c=>c.tipo===filtro);
  const saldoPF = saldoTotalPorTipo('PF');
  const saldoPJ = saldoTotalPorTipo('PJ');
  const saldoGeral = saldoPF+saldoPJ;
  const pendentes = contasPagarPendentes();
  const vencidas = contasPagarVencidas();
  const proximos7 = pendentes.filter(cp=>{const d=diffDias(cp.vencimento); return d>=0&&d<=7;});
  const totalPendente = pendentes.reduce((s,cp)=>s+cp.valor,0);
  const receberPendentes = contasReceberPendentes();
  const receberVencidas = contasReceberVencidas();
  const receberProximos7 = receberPendentes.filter(cr=>{const d=diffDias(cr.vencimento); return d>=0&&d<=7;});
  const totalReceberPendente = receberPendentes.reduce((s,cr)=>s+cr.valor,0);
  const chequesPend = chequesEmitidosPendentes();
  const totalChequesPend = chequesPend.reduce((s,c)=>s+Number(c.valor||0),0);
  const patrimonioInvestido = totalPatrimonioInvestido();
  const segurosVenc = segurosVencidos();
  const segurosProx30 = segurosVencendoEm(30);
  const posicaoLiquida = saldoGeral + totalSaldoChequeSys() + patrimonioInvestido + totalReceberPendente - totalPendente - totalChequesPend - totalFaturasCartoesAberto();

  let alertas = '';
  if(vencidas.length>0) alertas += `<div class="alerta av">⚠ ${vencidas.length} conta(s) a pagar VENCIDA(S) — total R$ ${fmt(vencidas.reduce((s,c)=>s+c.valor,0))}</div>`;
  if(proximos7.length>0) alertas += `<div class="alerta aa">🔔 ${proximos7.length} conta(s) a pagar vencendo nos próximos 7 dias</div>`;
  if(receberVencidas.length>0) alertas += `<div class="alerta av">⚠ ${receberVencidas.length} conta(s) a receber VENCIDA(S) — total R$ ${fmt(receberVencidas.reduce((s,c)=>s+c.valor,0))}</div>`;
  if(receberProximos7.length>0) alertas += `<div class="alerta aa">🔔 ${receberProximos7.length} conta(s) a receber vencendo nos próximos 7 dias</div>`;
  if(segurosVenc.length>0) alertas += `<div class="alerta av">⚠ ${segurosVenc.length} seguro(s) VENCIDO(S) — verifique a renovação</div>`;
  if(segurosProx30.length>0) alertas += `<div class="alerta aa">🔔 ${segurosProx30.length} seguro(s) vencendo nos próximos 30 dias</div>`;

  // Contas do ChequeSys não têm classificação PF/PJ — só aparecem na visão "Todos"
  const linhasContas = contas.map(c=>{
    const saldo = saldoConta(c.id);
    return `<tr onclick="abrirContaEmLancamentos('${c.id}')" style="cursor:pointer">
      <td>${esc(c.titular)} ${T(c.tipo,c.tipo==='PF'?'az':'pur')}</td>
      <td>${esc(c.banco||'-')}</td>
      <td style="text-align:right;font-weight:700;color:${saldo<0?'var(--red)':'var(--txt)'}">R$ ${fmt(saldo)}</td>
    </tr>`;
  }).join('') + (filtro==='todos' ? linhasContasChequeSys() : '') || '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Nenhuma conta cadastrada</td></tr>';
  const saldoGeralComChequeSys = saldoGeral + totalSaldoChequeSys();
  const tabsPFPJ = `<div class="row" style="margin-bottom:6px;gap:8px">
    ${B('Ver Tudo','mudarFiltroDashPFPJ(\'todos\')',filtro==='todos'?'var(--acc)':'var(--sur)',filtro==='todos'?'#000':'var(--txt)')}
    ${B('👤 Somente PF','mudarFiltroDashPFPJ(\'PF\')',filtro==='PF'?'var(--blu)':'var(--sur)',filtro==='PF'?'#fff':'var(--txt)')}
    ${B('🏢 Somente PJ','mudarFiltroDashPFPJ(\'PJ\')',filtro==='PJ'?'var(--pur)':'var(--sur)',filtro==='PJ'?'#fff':'var(--txt)')}
    <span style="width:1px;background:var(--bor);margin:2px 4px"></span>
    ${B('🔍 Relatório de Filtragem','irParaRelatorioFlex()','var(--sur)','var(--acc)',0,'Monte um relatório sob medida escolhendo colunas e filtros')}
    ${B('📈 Patrimônio Evolução','irPara(\'patrimonio_evol\')','var(--sur)','var(--acc)',0,'Veja a evolução do saldo em contas ao longo do tempo')}
    <span style="width:1px;background:var(--bor);margin:2px 4px"></span>
    ${B('💳 Cartões PF ↗','window.open(\'https://fabio9500.github.io/Cartoes/CartoesPF.html\',\'tsr_janela_cartoespf\')','var(--sur)','var(--blu)',0,'Abrir o sistema CartõesPF (reaproveita a mesma aba)')}
    ${B('💳 Cartões PJ ↗','window.open(\'https://fabio9500.github.io/Cartoes/CartoesPJ.html\',\'tsr_janela_cartoespj\')','var(--sur)','var(--pur)',0,'Abrir o sistema CartõesPJ (reaproveita a mesma aba)')}
    ${B('🧾 ChequeSys ↗','window.open(\'https://fabio9500.github.io/chequesys/chequesys.html\',\'tsr_janela_chequesys\')','var(--sur)','#f0a500',0,'Abrir o ChequeSys (reaproveita a mesma aba)')}
  </div>
  <div style="font-size:11px;color:var(--mut);margin-bottom:14px">Os botões com ↗ abrem o sistema original em outra aba — nenhuma funcionalidade deles muda aqui. Toque em qualquer conta da tabela abaixo para ver a movimentação dela.</div>`;

  // ── Composição (detalhe) de cada KPI, mostrado ao tocar no card ──
  const compPosicao = `<table><tbody>
    <tr><td>Saldo em Contas (Tesouraria+ChequeSys)</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(saldoGeralComChequeSys)}</td></tr>
    <tr><td>Patrimônio Investido</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(patrimonioInvestido)}</td></tr>
    <tr><td>Contas a Receber Pendentes</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(totalReceberPendente)}</td></tr>
    <tr><td>Contas a Pagar Pendentes</td><td style="text-align:right;color:#f85149">− R$ ${fmt(totalPendente)}</td></tr>
    <tr><td>Cheques Emitidos Aguardando</td><td style="text-align:right;color:#f85149">− R$ ${fmt(totalChequesPend)}</td></tr>
    <tr><td>Faturas de Cartão em Aberto</td><td style="text-align:right;color:#f85149">− R$ ${fmt(totalFaturasCartoesAberto())}</td></tr>
  </tbody></table>`;
  const compSaldoTotal = `<table><tbody>
    ${contasTodasAtivas.map(c=>`<tr onclick="abrirContaNoExtrato('${c.id}')" style="cursor:pointer"><td>${esc(c.titular)} ${T(c.tipo,c.tipo==='PF'?'az':'pur')}</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoConta(c.id))}</td></tr>`).join('')}
    ${(_resumoChequeSys?.contas||[]).map(c=>`<tr><td>${esc(c.nome)} ${T('ChequeSys','pur')}</td><td style="text-align:right;font-weight:700">R$ ${fmt(c.saldo)}</td></tr>`).join('')}
  </tbody></table>
  <div style="font-size:11px;color:var(--mut);margin-top:6px">Toque em uma conta acima para ver o extrato dela (com saldo do dia).</div>`;
  const compSaldoPF = `<table><tbody>${contasTodasAtivas.filter(c=>c.tipo==='PF').map(c=>`<tr onclick="abrirContaNoExtrato('${c.id}')" style="cursor:pointer"><td>${esc(c.titular)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoConta(c.id))}</td></tr>`).join('')}</tbody></table>`;
  const compSaldoPJ = `<table><tbody>${contasTodasAtivas.filter(c=>c.tipo==='PJ').map(c=>`<tr onclick="abrirContaNoExtrato('${c.id}')" style="cursor:pointer"><td>${esc(c.titular)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoConta(c.id))}</td></tr>`).join('')}</tbody></table>`;
  const compPagar = pendentes.length ? `<table><tbody>${pendentes.slice(0,10).map(cp=>`<tr><td>${esc(cp.favorecido)}</td><td>${fmtD(cp.vencimento)}</td><td style="text-align:right;color:${diffDias(cp.vencimento)<0?'var(--red)':'inherit'}">R$ ${fmt(cp.valor)}</td></tr>`).join('')}</tbody></table>${pendentes.length>10?`<div style="font-size:11px;color:var(--mut);margin-top:6px">+ ${pendentes.length-10} outra(s) — veja a aba Contas a Pagar</div>`:''}` : '';
  const compReceber = receberPendentes.length ? `<table><tbody>${receberPendentes.slice(0,10).map(cr=>`<tr><td>${esc(cr.cliente)}</td><td>${fmtD(cr.vencimento)}</td><td style="text-align:right;color:${diffDias(cr.vencimento)<0?'var(--red)':'inherit'}">R$ ${fmt(cr.valor)}</td></tr>`).join('')}</tbody></table>${receberPendentes.length>10?`<div style="font-size:11px;color:var(--mut);margin-top:6px">+ ${receberPendentes.length-10} outra(s) — veja a aba Contas a Receber</div>`:''}` : '';
  const compCheques = chequesPend.length ? `<table><tbody>${chequesPend.slice(0,10).map(c=>`<tr><td>${esc(c.favorecido)}</td><td>${fmtD(c.dataPrevista)}</td><td style="text-align:right">R$ ${fmt(c.valor)}</td></tr>`).join('')}</tbody></table>` : '';
  const compPatrimonio = `<table><tbody>
    ${(DB.investimentos||[]).map(i=>`<tr><td>${esc(i.instituicao)} (${esc(i.tipo)})</td><td style="text-align:right">R$ ${fmt(i.valorAtual)}</td></tr>`).join('')}
    ${(DB.previdencias||[]).map(p=>`<tr><td>${esc(p.instituicao)} (${esc(p.tipo)})</td><td style="text-align:right">R$ ${fmt(p.valorAtual)}</td></tr>`).join('')}
  </tbody></table>`;

  const kpisHtml = [
    filtro==='todos' ? kpiCard('posicao','Posição Líquida Consolidada',`<span style="color:${posicaoLiquida<0?'var(--red)':'var(--acc)'}">R$ ${fmt(posicaoLiquida)}</span>`,'Contas + Investim. + A Receber − Pendências − Cartões',compPosicao) : '',
    filtro==='todos' ? kpiCard('saldototal','Saldo Total (todas as contas)',`<span style="color:${saldoGeralComChequeSys<0?'var(--red)':'var(--acc)'}">R$ ${fmt(saldoGeralComChequeSys)}</span>`,`${contasTodasAtivas.length} conta(s) TesourariaSys${_resumoChequeSys?.contas?.length?' + '+_resumoChequeSys.contas.length+' do ChequeSys':''}`,compSaldoTotal) : '',
    filtro!=='PJ' ? kpiCard('saldopf','Saldo PF',`<span style="color:var(--blu)">R$ ${fmt(saldoPF)}</span>`,`${contasTodasAtivas.filter(c=>c.tipo==='PF').length} conta(s)`,compSaldoPF) : '',
    filtro!=='PF' ? kpiCard('saldopj','Saldo PJ',`<span style="color:var(--pur)">R$ ${fmt(saldoPJ)}</span>`,`${contasTodasAtivas.filter(c=>c.tipo==='PJ').length} conta(s)`,compSaldoPJ) : '',
    kpiCard('pagar','Contas a Pagar Pendentes',`<span style="color:${vencidas.length>0?'var(--red)':'#f0a500'}">R$ ${fmt(totalPendente)}</span>`,`${pendentes.length} pendente(s) · ${vencidas.length} vencida(s)`,compPagar),
    kpiCard('receber','Contas a Receber Pendentes',`<span style="color:${receberVencidas.length>0?'var(--red)':'#3fb950'}">R$ ${fmt(totalReceberPendente)}</span>`,`${receberPendentes.length} pendente(s) · ${receberVencidas.length} vencida(s)`,compReceber),
    kpiCard('cheques','Cheques Emitidos (aguardando)',`<span style="color:#f0a500">R$ ${fmt(totalChequesPend)}</span>`,`${chequesPend.length} ainda não compensado(s)`,compCheques),
    filtro==='todos' ? kpiCard('patrimonio','Patrimônio Investido',`<span style="color:var(--pur)">R$ ${fmt(patrimonioInvestido)}</span>`,'Investimentos + Previdência ativos',compPatrimonio) : '',
  ].join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="titulo acc" style="margin-bottom:0">📊 Dashboard — TesourariaSys</div>
      <div style="display:flex;gap:6px">
        ${B(alertasPendentes().length?`🔔 ${alertasPendentes().length}`:'🔔','mostrarPainelAlertas(false)',alertasPendentes().length?'var(--red)':'var(--sur)',alertasPendentes().length?'#fff':'var(--txt)',1,'Alertas do ChequeSys')}
        ${B(_dashSoTitulos?'▶ Expandir':'▼ Recolher','alternarDashSoTitulos()','var(--sur)','var(--txt)',1,'Alterna entre ver só os títulos ou todas as informações dos cards')}
      </div>
    </div>
    <div style="height:8px"></div>
    ${tabsPFPJ}
    ${alertas}
    <div class="kpis">${kpisHtml}</div>
    ${htmlResumoCartoesCard(filtro)}
    ${_dashSoTitulos ? `
    <div class="card kpi" style="margin-bottom:14px;cursor:pointer" onclick="alternarDashSoTitulos()">
      <div class="kpi-l">🏦 Saldo por Conta</div>
    </div>` : `
    <div class="card" style="margin-bottom:14px">
      <div onclick="toggleKpi('saldoporconta')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:700">🏦 Saldo por Conta ${filtro==='todos'?'(TesourariaSys + ChequeSys)':'('+filtro+')'}</div>
        <div onclick="event.stopPropagation()">
          ${B('⚙','configurarTokenChequeSys()','var(--sur)','var(--txt)',1,'Configurar integração com ChequeSys')}
          ${B('🔄','atualizarResumoChequeSys(false)','var(--sur)','var(--txt)',1,'Atualizar agora')}
          <span style="font-size:11px;color:var(--mut);cursor:pointer" onclick="toggleKpi('saldoporconta')">${_kpiAberto==='saldoporconta'?'▲':'▼'}</span>
        </div>
      </div>
      ${_kpiAberto==='saldoporconta' ? `<div onclick="event.stopPropagation()">
        ${filtro==='todos'&&_resumoChequeSys?.erro?`<div style="font-size:11px;color:var(--mut);margin-bottom:8px">ChequeSys: ${esc(_resumoChequeSys.erro)}</div>`:''}
        ${filtro!=='todos'?`<div style="font-size:11px;color:var(--mut);margin-bottom:8px">Contas do ChequeSys não são classificadas como PF/PJ — aparecem só na visão "Ver Tudo".</div>`:''}
        <table><thead><tr><th>Conta</th><th>Banco</th><th style="text-align:right">Saldo Atual</th></tr></thead><tbody>${linhasContas}</tbody></table>
      </div>` : ''}
    </div>`}
    <div class="row" style="gap:10px">
      ${BPerm('lancamentos','➕ Novo Lançamento','novoLancamento()','var(--acc)')}
      ${BPerm('lancamentos','📥 Importar Extrato (OFX)','abrirImportarOFX()','var(--blu)','#fff')}
      ${BPerm('lancamentos','➕ Nova Conta a Pagar','novaContaPagar()','var(--blu)','#fff')}
      ${BPerm('lancamentos','➕ Nova Conta a Receber','novaContaReceber()','#3fb950','#fff')}
      ${BPerm('lancamentos','✍️ Novo Cheque Emitido','novoChequeEmitido()','var(--pur)','#fff')}
      ${BPerm('lancamentos','🏦 Nova Tarifa Bancária','novaTarifaBancaria()','var(--sur)','var(--txt)')}
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER — CONTAS
// ══════════════════════════════════════════
function htmlContas(){
  const contas = (DB.contas||[]).filter(c=>_filtroDashPFPJ==='todos'||c.tipo===_filtroDashPFPJ).slice().sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.titular.localeCompare(b.titular));
  const linhas = contas.map(c=>{
    const saldo = saldoConta(c.id);
    return `<tr style="${c.ativa===false?'opacity:.5':''}">
      <td style="cursor:pointer" ondblclick="abrirContaNoExtrato('${c.id}')" title="Duplo clique para abrir o extrato desta conta">${esc(c.titular)}</td>
      <td>${T(c.tipo,c.tipo==='PF'?'az':'pur')}</td>
      <td>${esc(c.banco||'-')} ${c.agencia?'· Ag '+esc(c.agencia):''} ${c.conta?'· Cc '+esc(c.conta):''}</td>
      <td style="text-align:right;font-weight:700;color:${saldo<0?'var(--red)':'var(--txt)'}">R$ ${fmt(saldo)}</td>
      <td>${c.ativa===false?T('Inativa','cz'):T('Ativa','vd')}</td>
      <td>
        ${B('✏','editarConta(\''+c.id+'\')','var(--sur)','var(--txt)',1)}
        ${B('📋','irPara(\'lancamentos\');setTimeout(()=>filtrarLancPorConta(\''+c.id+'\'),50)','var(--blu)','#fff',1,'Ver lançamentos')}
        ${BPerm('editar_dados', c.ativa===false?'↩':'⏸','toggleAtivaConta(\''+c.id+'\')','var(--sur)','var(--txt)',1, c.ativa===false?'Reativar':'Inativar')}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--mut)">Nenhuma conta cadastrada</td></tr>';

  return `
    <div class="titulo acc">🏦 Contas Bancárias</div>
    ${barraFiltroPFPJGlobal()}
    <div class="row" style="margin-bottom:12px">
      ${BPerm('lancamentos','➕ Nova Conta','novaConta()','var(--acc)')}
      ${BPerm('editar_dados','🏷 Identificar Contas PF/PJ (Bradesco, Santander...)','abrirIdentificarContas()','var(--pur)','#fff')}
    </div>
    <div class="card">
      <table><thead><tr><th>Titular</th><th>Tipo</th><th>Banco</th><th style="text-align:right">Saldo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER — LANÇAMENTOS
// ══════════════════════════════════════════
let _filtroLancConta = '';
// PADRÃO: últimos 90 dias, para não travar o navegador renderizando os
// 20+ mil lançamentos de uma vez só. "Todos" continua disponível manualmente
// (basta apagar a data "De"). A pedido do Fabio (23/07/2026).
let _filtroLancIni = (()=>{ const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10); })();
let _filtroLancFim = '';
let _filtroLancContraparte = '';
let _filtroLancCategoria = '';
let _filtroLancCC = '';
function filtrarLancPorConta(contaId){
  _filtroLancConta = contaId;
  const sel = document.getElementById('flc-conta');
  if(sel) sel.value = contaId;
  aplicarFiltroLanc();
}
function aplicarFiltroLanc(){
  _filtroLancConta = document.getElementById('flc-conta')?.value||'';
  _filtroLancIni = document.getElementById('flc-ini')?.value||'';
  _filtroLancFim = document.getElementById('flc-fim')?.value||'';
  _filtroLancContraparte = document.getElementById('flc-contraparte')?.value.trim()||'';
  _filtroLancCategoria = valorFinalCascata('flc','categoria');
  _filtroLancCC = valorFinalCascata('flc','cc');
  renderAba();
}
function limparFiltroLanc(){
  _filtroLancConta=''; _filtroLancIni=''; _filtroLancFim='';
  _filtroLancContraparte=''; _filtroLancCategoria=''; _filtroLancCC='';
  const catMae=document.getElementById('flc-categoria-mae'); if(catMae){ catMae.value=''; aoMudarMaeCascataFixo('flc','categoria'); }
  const ccMae=document.getElementById('flc-cc-mae'); if(ccMae){ ccMae.value=''; aoMudarMaeCascataFixo('flc','cc'); }
  renderAba();
}
// ══════════════════════════════════════════
// MENU DE CONTEXTO — LANÇAMENTOS (clique direito, estilo Money)
// ══════════════════════════════════════════
// Ao clicar com o botão direito num lançamento, monta um menu com as
// dimensões que aquele lançamento tem (Categoria, Centro de Custo,
// Direcionamento, Cliente/Fornecedor) — cada opção "Ir para" reseta o
// Relatório de Filtragem e aplica só aquele filtro, abrindo o extrato
// já filtrado, igual ao padrão do Money na imagem que o Fabio mandou.
let _ctxLancId = null;
// Ações ficam num array de funções (não em string de onclick) — evita quebrar o
// HTML quando contraparte/direcionamento tiverem aspas ou caracteres especiais.
function badgeStatusLancamento(l){
  if(l.status==='C') return ' <span title="Compensado" style="font-size:10px;font-weight:800;color:#f0a500;border:1px solid #f0a500;border-radius:3px;padding:0 3px;margin-left:4px">C</span>';
  if(l.status==='R') return ' <span title="Reconciliado" style="font-size:10px;font-weight:800;color:#3fb950;border:1px solid #3fb950;border-radius:3px;padding:0 3px;margin-left:4px">R</span>';
  if(l.status==='nulo') return ' <span title="Nulo — não conta no saldo" style="font-size:10px;font-weight:800;color:var(--mut);border:1px solid var(--bor);border-radius:3px;padding:0 3px;margin-left:4px">NULO</span>';
  return '';
}
function abrirMenuLancamento(ev, id){
  ev.preventDefault(); ev.stopPropagation();
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return false;
  _ctxLancId = id;
  const cat = categoriaById(l.categoriaId);
  const catMae = cat ? (cat.parentId ? categoriaById(cat.parentId) : cat) : null;
  const cc = centroCustoById(l.centroCustoId);
  const ccMae = cc ? (cc.parentId ? centroCustoById(cc.parentId) : cc) : null;
  const direcPartes = (l.direcionamento||'').split(':').map(s=>s.trim()).filter(Boolean);
  const direcMaeNome = direcPartes[0]||'';
  const direcTemSub = direcPartes.length>1;
  // Na página de Extratos, os "Ir para" filtram e ficam na própria tela
  // (igual ao Money); nas demais telas que usam esse mesmo menu, abrem o
  // Relatório Flexível filtrado.
  const naExtratos = ABA==='relatorios' && RLT.tipo==='extrato_conta';
  const irPara_ = (campo, valor) => {
    fecharMenuLancamento();
    if(naExtratos){
      if(campo==='contraparte') filtrarExtratoPorFornecedor(valor);
      else if(campo==='categoriaId') filtrarExtratoPorCategoria(valor);
      else if(campo==='centroCustoId') filtrarExtratoPorCentroCusto(valor);
      else if(campo==='direcionamento') filtrarExtratoPorDirecionamento(valor);
    } else {
      irParaFiltroFRF(campo, valor);
    }
  };

  const acoes = [];
  acoes.push({label:'✏ Editar', fn:()=>{ fecharMenuLancamento(); editarLancamento(id); }});
  if(l.contraparte) acoes.push({label:`👉 Ir para favorecido: ${l.contraparte}`, fn:()=>irPara_('contraparte', l.contraparte)});
  if(catMae) acoes.push({label:`👉 Ir para categoria: ${catMae.nome}`, fn:()=>irPara_('categoriaId', catMae.id)});
  if(cat && cat.parentId) acoes.push({label:`👉 Ir para subcategoria: ${cat.nome}`, fn:()=>irPara_('categoriaId', cat.id)});
  if(ccMae) acoes.push({label:`👉 Ir para Centro de Custo: ${ccMae.nome}`, fn:()=>irPara_('centroCustoId', ccMae.id)});
  if(cc && cc.parentId) acoes.push({label:`👉 Ir para Centro de Custo: ${nomeCompletoCentroCusto(cc)}`, fn:()=>irPara_('centroCustoId', cc.id)});
  if(direcMaeNome) acoes.push({label:`👉 Ir para Direcionamento: ${direcMaeNome}`, fn:()=>irPara_('direcionamento', direcMaeNome)});
  if(direcTemSub) acoes.push({label:`👉 Ir para Direcionamento: ${l.direcionamento}`, fn:()=>irPara_('direcionamento', l.direcionamento)});
  acoes.push({sep:true});
  acoes.push({label:'☑ Marcar como', submenu:[
    {label:(!l.status?'● ':'○ ')+'Não reconciliado', fn:()=>marcarStatusLancamento(id,null)},
    {label:(l.status==='C'?'● ':'○ ')+'Compensado (C)', fn:()=>marcarStatusLancamento(id,'C')},
    {label:(l.status==='R'?'● ':'○ ')+'Reconciliado (R)', fn:()=>marcarStatusLancamento(id,'R')},
    {label:(l.status==='nulo'?'● ':'○ ')+'Nulo', fn:()=>marcarStatusLancamento(id,'nulo')},
  ]});
  acoes.push({label:'⇄ Alterar tipo de transação para', submenu:[
    {label:(l.tipo==='saida'?'● ':'○ ')+'Saída', fn:()=>alterarTipoLancamento(id,'saida')},
    {label:(l.tipo==='entrada'?'● ':'○ ')+'Entrada', fn:()=>alterarTipoLancamento(id,'entrada')},
    {label:(l.origem==='transferencia'?'● ':'○ ')+'Transferência', fn:()=>alterarTipoLancamento(id,'transferencia')},
  ]});
  acoes.push({sep:true});
  acoes.push({label:'➕ Adicionar a Contas a pagar e depósitos...', fn:()=>{ fecharMenuLancamento(); adicionarContasAPagarDepositos(id); }});
  acoes.push({label:'↪ Mover para conta...', fn:()=>{ fecharMenuLancamento(); moverLancamentoParaConta(id); }});
  acoes.push({sep:true});
  acoes.push({label:'🗑 Excluir', cor:'var(--red)', fn:()=>{ fecharMenuLancamento(); excluirLancamento(id); }});

  const menu = document.getElementById('ctx-menu-lanc');
  menu.innerHTML = acoes.map((a,i)=> a.sep ? `<div class="ctxmenu-sep"></div>` : `<div class="ctxmenu-item" data-idx="${i}" style="${a.cor?`color:${a.cor}`:''}${a.submenu?';display:flex;justify-content:space-between;align-items:center':''}">${esc(a.label)}${a.submenu?' <span style="opacity:.6">▸</span>':''}</div>`).join('');
  menu.querySelectorAll('.ctxmenu-item').forEach(el=>{
    const a = acoes[Number(el.dataset.idx)];
    if(a.submenu){
      el.addEventListener('click', (e)=>{ e.stopPropagation(); abrirSubmenuCtx(el, a.submenu); });
    } else {
      el.addEventListener('click', (e)=>{ e.stopPropagation(); a.fn(); });
    }
  });
  fecharSubmenuCtx();
  menu.style.display = 'block';
  const x = Math.min(ev.clientX, window.innerWidth-260);
  const y = Math.min(ev.clientY, window.innerHeight-(acoes.length*34+20));
  menu.style.left = Math.max(4,x)+'px';
  menu.style.top = Math.max(4,y)+'px';
  return false;
}
// Submenu flyout (usado por "Marcar como" e "Alterar tipo de transação para") —
// mesmo estilo visual do menu principal, posicionado à direita do item clicado.
function abrirSubmenuCtx(parentEl, submenuAcoes){
  fecharSubmenuCtx();
  const sub = document.createElement('div');
  sub.id = 'ctx-submenu-lanc';
  sub.className = 'no-print';
  sub.style.cssText = 'display:block;position:fixed;z-index:501;background:var(--card);border:1px solid var(--bor);border-radius:8px;box-shadow:0 6px 20px #000a;min-width:190px;padding:4px;font-size:12px';
  sub.innerHTML = submenuAcoes.map((a,i)=>`<div class="ctxmenu-item" data-idx="${i}">${esc(a.label)}</div>`).join('');
  document.body.appendChild(sub);
  sub.querySelectorAll('.ctxmenu-item').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); submenuAcoes[Number(el.dataset.idx)].fn(); fecharMenuLancamento(); });
  });
  const r = parentEl.getBoundingClientRect();
  const left = Math.min(r.right, window.innerWidth-198);
  const top = Math.min(r.top, window.innerHeight-(submenuAcoes.length*34+20));
  sub.style.left = Math.max(4,left)+'px';
  sub.style.top = Math.max(4,top)+'px';
}
function fecharSubmenuCtx(){
  const s = document.getElementById('ctx-submenu-lanc');
  if(s) s.remove();
}
// Marca o lançamento como Não reconciliado / Compensado (C) / Reconciliado (R) / Nulo.
// "Nulo" mantém o lançamento visível no extrato mas ele deixa de contar no saldo
// (mesmo princípio do Money: registro fica lá, mas "não vale" pro saldo da conta).
function marcarStatusLancamento(id, status){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  const lancamentos = (DB.lancamentos||[]).map(x=>x.id===id?{...x, status:status||null}:x);
  salvar({...DB, lancamentos});
}
// Alterar tipo de transação: Saída/Entrada é uma troca simples de sinal; Transferência
// pede a conta de destino e converte este lançamento no par saída/entrada vinculado
// (mesmo formato usado por "Nova Transferência").
function alterarTipoLancamento(id, novoTipo){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  if(novoTipo==='transferencia'){
    if(l.origem==='transferencia'){ showToast('Este lançamento já é uma transferência.'); return; }
    abrirEscolherContaDestinoTransferencia(id);
    return;
  }
  if(l.tipo===novoTipo && l.origem!=='transferencia'){ return; }
  CF(`Alterar este lançamento para ${novoTipo==='saida'?'Saída':'Entrada'}?${l.origem==='transferencia'?' Isso desfaz o vínculo com a transferência (o lançamento pareado na outra conta não é alterado).':''}`, ()=>{
    const lancamentos = (DB.lancamentos||[]).map(x=>x.id===id?{...x, tipo:novoTipo, origem:x.origem==='transferencia'?'manual':x.origem, transferenciaId:null, contaVinculadaId:null}:x);
    salvar({...DB, lancamentos});
  });
}
function abrirEscolherContaDestinoTransferencia(id){
  AM('↪ Transformar em Transferência', `
    ${EH('e-transf-tipo')}
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Escolha a conta de destino/origem — vamos criar o lançamento pareado lá e transformar este numa transferência de verdade.</div>
    ${C('Conta vinculada *',`<select id="tt-conta">${opcoesContas()}</select>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Confirmar','confirmarAlterarParaTransferencia(\''+id+'\')','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarAlterarParaTransferencia(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  const contaVinculadaId = document.getElementById('tt-conta').value;
  if(!contaVinculadaId){ ME('e-transf-tipo','Escolha a conta.'); return; }
  if(contaVinculadaId===l.contaId){ ME('e-transf-tipo','A conta vinculada não pode ser a mesma conta do lançamento.'); return; }
  const transferenciaId = uid();
  const tipoParelho = l.tipo==='entrada' ? 'saida' : 'entrada';
  const nomeConta_ = nomeConta(contaById(contaVinculadaId));
  const pareado = {
    id: uid(), contaId: contaVinculadaId, data: l.data, tipo: tipoParelho, valor: l.valor,
    categoriaId:'', centroCustoId: l.centroCustoId||'',
    contraparte:'', direcionamentoId: l.direcionamentoId||null, direcionamento: l.direcionamento||'',
    descricao: l.descricao || (tipoParelho==='saida'?`Transferência para ${nomeConta(contaById(l.contaId))}`:`Transferência de ${nomeConta(contaById(l.contaId))}`),
    origem:'transferencia', transferenciaId, contaVinculadaId: l.contaId, contaPagarId:null,
    criadoEm: new Date().toISOString()
  };
  const lancamentos = (DB.lancamentos||[]).map(x=>x.id===id?{
    ...x, categoriaId:'', contraparte:'',
    origem:'transferencia', transferenciaId, contaVinculadaId, contaPagarId:null
  }:x).concat(pareado);
  salvar({...DB, lancamentos});
  FM();
}
// "Adicionar a Contas a pagar e depósitos": agenda um novo lançamento futuro
// (conta a pagar/receber) já pré-preenchido com os dados deste lançamento —
// útil pra transformar um pagamento recorrente numa cobrança agendada.
function adicionarContasAPagarDepositos(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  if(l.tipo==='saida'){
    novaContaPagar();
    setTimeout(()=>{
      const favEl=document.getElementById('cp-fav'); if(favEl) favEl.value = l.contraparte||'';
      const valEl=document.getElementById('cp-valor'); if(valEl) valEl.value = fmt(l.valor);
      const contaEl=document.getElementById('cp-conta'); if(contaEl){ contaEl.value = l.contaId||''; atualizarSugestoesContaPagar('cp'); }
      const catEl=document.getElementById('cp-categoria'); if(catEl && l.categoriaId) catEl.value = l.categoriaId;
      const ccEl=document.getElementById('cp-cc'); if(ccEl && l.centroCustoId) ccEl.value = l.centroCustoId;
    }, 50);
  } else {
    novaContaReceber();
    setTimeout(()=>{
      const favEl=document.getElementById('cr-cli'); if(favEl) favEl.value = l.contraparte||'';
      const valEl=document.getElementById('cr-valor'); if(valEl) valEl.value = fmt(l.valor);
      const contaEl=document.getElementById('cr-conta'); if(contaEl) contaEl.value = l.contaId||'';
      const catEl=document.getElementById('cr-categoria'); if(catEl && l.categoriaId) catEl.value = l.categoriaId;
      const ccEl=document.getElementById('cr-cc'); if(ccEl && l.centroCustoId) ccEl.value = l.centroCustoId;
    }, 50);
  }
}
// "Mover para conta": só troca a conta do lançamento (mesmo saldo lógico, mas
// passa a contar na outra conta) — diferente de Transferência, que cria um par.
function moverLancamentoParaConta(id){
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  AM('↪ Mover para Conta', `
    ${EH('e-mover-conta')}
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">O lançamento passa a valer pra outra conta (não cria transferência nem lançamento pareado).</div>
    ${C('Nova conta *',`<select id="mc-conta">${opcoesContas(l.contaId)}</select>`)}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Mover','confirmarMoverLancamentoParaConta(\''+id+'\')','var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarMoverLancamentoParaConta(id){
  const novaContaId = document.getElementById('mc-conta').value;
  if(!novaContaId){ ME('e-mover-conta','Escolha a conta.'); return; }
  const l = (DB.lancamentos||[]).find(x=>x.id===id); if(!l) return;
  if(novaContaId===l.contaId){ FM(); return; }
  const lancamentos = (DB.lancamentos||[]).map(x=>x.id===id?{...x, contaId:novaContaId}:x);
  salvar({...DB, lancamentos});
  FM();
}
function fecharMenuLancamento(){
  const menu = document.getElementById('ctx-menu-lanc');
  if(menu) menu.style.display = 'none';
  fecharSubmenuCtx();
  _ctxLancId = null;
}
// Fecha o menu ao clicar em qualquer lugar da tela ou rolar a página
document.addEventListener('click', fecharMenuLancamento);
document.addEventListener('scroll', fecharMenuLancamento, true);
// Reseta o Relatório de Filtragem, aplica só o filtro escolhido no menu e
// já abre a tela mostrando o extrato filtrado por aquela opção.
function irParaFiltroFRF(campo, valor){
  fecharMenuLancamento();
  FRF = {...FRF, de:'',ate:'',tipo:'',contaId:'',categoriaId:'',centroCustoId:'',contraparte:'',direcionamento:'',busca:'',origem:'',agruparPor:'',gruposAbertos:{}};
  FRF[campo] = valor;
  irPara('relatorio_flex');
}
// ══════════════════════════════════════════
// PÁGINA LANÇAMENTOS — colunas ordenáveis (duplo clique), ocultáveis (ícone 👁)
// e com filtro por valores (ícone 🔻, estilo Excel); e um "Modo Categorização"
// que permite pintar Categoria/Centro de Custo/Direcionamento arrastando o
// mouse sobre várias linhas de uma vez — útil pra classificar em massa
// lançamentos zerados. A pedido do Fabio (21/07/2026).
// ══════════════════════════════════════════
let _lancColOcultas = new Set();
let _lancColFiltros = {}; // {chave: Set(valores permitidos)}
let _lancOrdem = { campo:'data', dir:'desc' };
let _lancEdit = { ativo:false, arrastando:false, idsAlterados:new Set() };

function colunasLanc(){
  return [
    {chave:'data', label:'Data', get:l=>l.data, disp:l=>fmtD(l.data)+badgeStatusLancamento(l)},
    {chave:'conta', label:'Conta', get:l=>nomeConta(contaById(l.contaId)), disp:l=>esc(nomeConta(contaById(l.contaId)))},
    {chave:'tipo', label:'Tipo', get:l=>l.tipo==='entrada'?'Entrada':'Saída', disp:l=>T(l.tipo==='entrada'?'Entrada':'Saída', l.tipo==='entrada'?'vd':'vm')+(l.origem==='transferencia'?' '+T('🔀 Transf.','az'):'')},
    {chave:'categoria', label:'Categoria', get:l=>nomeCompletoCategoria(categoriaById(l.categoriaId))||'-', disp:l=>esc(nomeCompletoCategoria(categoriaById(l.categoriaId))||'-')},
    {chave:'cc', label:'C. Custo', get:l=>nomeCompletoCentroCusto(centroCustoById(l.centroCustoId))||'-', disp:l=>esc(nomeCompletoCentroCusto(centroCustoById(l.centroCustoId))||'-')},
    {chave:'direcionamento', label:'Direcionamento', get:l=>nomeCompletoDirecionamento(direcionamentoById(l.direcionamentoId))||l.direcionamento||'-', disp:l=>esc(nomeCompletoDirecionamento(direcionamentoById(l.direcionamentoId))||l.direcionamento||'-')},
    {chave:'contraparte', label:'Cliente/Fornecedor', get:l=>l.contraparte||'-', disp:l=>esc(l.contraparte||'-')},
    {chave:'descricao', label:'Descrição', get:l=>l.descricao||'-', disp:l=>`${esc(l.descricao||'-')}${l.origem==='pagamento'?' '+T('Pagamento','az'):''}${l.fitid?' <span title="Conferido com o extrato do banco" style="color:#3fb950">✅</span>':''}`, onclick:l=>l.origem==='chequesys'?` style="cursor:pointer;text-decoration:underline dotted" title="Abrir no ChequeSys" onclick="editarLancamento('${l.id}')"`:''},
    {chave:'valor', label:'Valor', get:l=>l.valor, numerico:true, disp:l=>`<span style="font-weight:700;color:${l.tipo==='entrada'?'#3fb950':'#f85149'}">${l.tipo==='entrada'?'+':'-'} R$ ${fmt(l.valor)}</span>`},
  ];
}
function lancamentosBaseFiltrados(){
  let lista = (DB.lancamentos||[]).slice();
  lista = lista.filter(l=>contaTipoOk(l.contaId));
  if(_filtroLancConta) lista = lista.filter(l=>l.contaId===_filtroLancConta);
  if(_filtroLancIni) lista = lista.filter(l=>l.data>=_filtroLancIni);
  if(_filtroLancFim) lista = lista.filter(l=>l.data<=_filtroLancFim);
  if(_filtroLancContraparte) lista = lista.filter(l=>(l.contraparte||'').toLowerCase().includes(_filtroLancContraparte.toLowerCase()));
  if(_filtroLancCategoria) lista = lista.filter(l=>l.categoriaId===_filtroLancCategoria || categoriaById(l.categoriaId)?.parentId===_filtroLancCategoria);
  if(_filtroLancCC) lista = lista.filter(l=>l.centroCustoId===_filtroLancCC || centroCustoById(l.centroCustoId)?.parentId===_filtroLancCC);
  return lista;
}
// Aplica os filtros de coluna (checklist estilo Excel) por cima da lista já
// filtrada pelos campos "de cima" (conta/período/categoria/CC/etc).
function lancamentosComFiltroColunas(base, excluirChave){
  const cols = colunasLanc();
  let lista = base;
  cols.forEach(col=>{
    if(col.chave===excluirChave) return;
    const permitidos = _lancColFiltros[col.chave];
    if(permitidos) lista = lista.filter(l=>permitidos.has(String(col.get(l))));
  });
  return lista;
}
function lancamentosOrdenados(lista){
  const {campo, dir} = _lancOrdem;
  const cols = colunasLanc();
  const col = cols.find(c=>c.chave===campo) || cols[0];
  const mult = dir==='asc'?1:-1;
  return lista.slice().sort((a,b)=>{
    const va = col.get(a), vb = col.get(b);
    if(col.numerico) return (Number(va)-Number(vb))*mult;
    return String(va).localeCompare(String(vb),'pt-BR')*mult || (b.criadoEm||'').localeCompare(a.criadoEm||'');
  });
}
function linhaLancTabela(l){
  const cols = colunasLanc().filter(c=>!_lancColOcultas.has(c.chave));
  const tds = cols.map(c=>`<td${c.onclick?c.onclick(l):''}>${c.disp(l)}</td>`).join('');
  if(_lancEdit.ativo){
    return `<tr data-lid="${l.id}" style="cursor:crosshair;user-select:none${_lancEdit.idsAlterados.has(l.id)?';background:#f0a50022':''}" onmousedown="iniciarArrastarCategorizacao('${l.id}',event)" onmouseenter="continuarArrastarCategorizacao('${l.id}')">${tds}</tr>`;
  }
  return `<tr style="cursor:pointer${l.status==='nulo'?';opacity:.55':''}" ondblclick="editarLancamento('${l.id}')" oncontextmenu="return abrirMenuLancamento(event,'${l.id}')" title="Duplo clique: editar — Clique direito: mais opções">${tds}<td>${B('✏','editarLancamento(\''+l.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`;
}
// Recalcula e substitui só o corpo da tabela (usado durante o arrasto de
// categorização, pra não re-renderizar filtros/toolbar a cada linha).
function renderTabelaLancamentos(){
  const base = lancamentosBaseFiltrados();
  const lista = lancamentosOrdenados(lancamentosComFiltroColunas(base, null));
  const tbody = document.getElementById('lanc-tbody');
  const cols = colunasLanc().filter(c=>!_lancColOcultas.has(c.chave));
  if(tbody) tbody.innerHTML = lista.map(linhaLancTabela).join('') || `<tr><td colspan="${cols.length+1}" style="text-align:center;color:var(--mut)">Nenhum lançamento encontrado</td></tr>`;
  const totalEntradas = lista.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
  const totalSaidas = lista.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);
  const elE = document.getElementById('lanc-kpi-entradas'); if(elE) elE.textContent = 'R$ '+fmt(totalEntradas);
  const elS = document.getElementById('lanc-kpi-saidas'); if(elS) elS.textContent = 'R$ '+fmt(totalSaidas);
  const elR = document.getElementById('lanc-kpi-resultado'); if(elR){ elR.textContent = 'R$ '+fmt(totalEntradas-totalSaidas); elR.style.color = (totalEntradas-totalSaidas)<0?'var(--red)':'var(--acc)'; }
}
function ordenarPorColunaLanc(chave){
  if(_lancOrdem.campo===chave) _lancOrdem.dir = _lancOrdem.dir==='asc'?'desc':'asc';
  else _lancOrdem = {campo:chave, dir: chave==='data'?'desc':'asc'};
  renderAba();
}
function ocultarColunaLanc(chave){
  _lancColOcultas.add(chave);
  delete _lancColFiltros[chave];
  renderAba();
}
function mostrarColunaLanc(chave){
  _lancColOcultas.delete(chave);
  renderAba();
}
// Popup de filtro por valores (estilo Excel) — lista os valores distintos
// que aparecem naquela coluna (considerando os outros filtros já aplicados)
// com checkbox, e permite escolher só alguns.
function abrirFiltroColunaLanc(chave, ev){
  ev.stopPropagation();
  fecharSubmenuCtx();
  const base = lancamentosComFiltroColunas(lancamentosBaseFiltrados(), chave);
  const col = colunasLanc().find(c=>c.chave===chave);
  const valores = [...new Set(base.map(l=>String(col.get(l))))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const selecionados = _lancColFiltros[chave] || new Set(valores);
  const pop = document.createElement('div');
  pop.id = 'ctx-submenu-lanc';
  pop.className = 'no-print';
  pop.style.cssText = 'display:block;position:fixed;z-index:501;background:var(--card);border:1px solid var(--bor);border-radius:8px;box-shadow:0 6px 20px #000a;min-width:220px;max-width:280px;max-height:340px;overflow-y:auto;padding:8px;font-size:12px';
  pop.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <span style="cursor:pointer;color:var(--acc)" onclick="_lancFiltroTemp=new Set(${JSON.stringify(valores)});renderFiltroColunaCheckboxes()">Selecionar todos</span>
      <span style="cursor:pointer;color:var(--acc)" onclick="_lancFiltroTemp=new Set();renderFiltroColunaCheckboxes()">Limpar</span>
    </div>
    <div id="filtro-col-checks">${valores.map(v=>`<div style="padding:3px 0"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-v="${esc(v)}" ${selecionados.has(v)?'checked':''}> ${esc(v)||'(vazio)'}</label></div>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:8px;border-top:1px solid var(--bor);padding-top:8px">
      ${B('Aplicar', `aplicarFiltroColunaLanc('${chave}')`, 'var(--acc)')}
      ${B('Cancelar', 'fecharSubmenuCtx()', 'var(--sur)', 'var(--txt)')}
    </div>`;
  document.body.appendChild(pop);
  pop.addEventListener('click', e=>e.stopPropagation());
  const r = ev.target.getBoundingClientRect();
  pop.style.left = Math.max(4,Math.min(r.left, window.innerWidth-290))+'px';
  pop.style.top = Math.max(4,Math.min(r.bottom+2, window.innerHeight-360))+'px';
}
function aplicarFiltroColunaLanc(chave){
  const pop = document.getElementById('ctx-submenu-lanc'); if(!pop) return;
  const marcados = [...pop.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.dataset.v);
  const todos = [...pop.querySelectorAll('input[type=checkbox]')].length;
  if(marcados.length===todos) delete _lancColFiltros[chave];
  else _lancColFiltros[chave] = new Set(marcados);
  fecharSubmenuCtx();
  renderAba();
}
// ── MODO CATEGORIZAÇÃO (arrastar pra pintar Categoria/CC/Direcionamento) ──
function alternarModoEditarLanc(){
  _lancEdit.ativo = !_lancEdit.ativo;
  _lancEdit.idsAlterados.clear();
  renderAba();
}
function popularCascataLancEdit(campo){
  aoMudarMaeCascata('le', campo);
}
function iniciarArrastarCategorizacao(id, ev){
  ev.preventDefault();
  _lancEdit.arrastando = true;
  aplicarCategorizacaoArrasto(id);
  document.addEventListener('mouseup', finalizarArrastarCategorizacao, {once:true});
}
function continuarArrastarCategorizacao(id){
  if(!_lancEdit.arrastando) return;
  aplicarCategorizacaoArrasto(id);
}
function aplicarCategorizacaoArrasto(id){
  const categoriaId = valorFinalCascata('le','categoria');
  const centroCustoId = valorFinalCascata('le','cc');
  const direcionamentoId = valorFinalCascata('le','direc');
  if(!categoriaId && !centroCustoId && !direcionamentoId) return;
  const idx = (DB.lancamentos||[]).findIndex(x=>x.id===id);
  if(idx<0) return;
  const atual = DB.lancamentos[idx];
  const atualizado = {...atual};
  if(categoriaId) atualizado.categoriaId = categoriaId;
  if(centroCustoId) atualizado.centroCustoId = centroCustoId;
  if(direcionamentoId){
    atualizado.direcionamentoId = direcionamentoId;
    atualizado.direcionamento = nomeCompletoDirecionamento(direcionamentoById(direcionamentoId));
  }
  DB.lancamentos = DB.lancamentos.map((x,i)=>i===idx?atualizado:x);
  _lancEdit.idsAlterados.add(id);
  renderTabelaLancamentos();
}
function finalizarArrastarCategorizacao(){
  if(!_lancEdit.arrastando) return;
  _lancEdit.arrastando = false;
  if(_lancEdit.idsAlterados.size){
    const n = _lancEdit.idsAlterados.size;
    salvar(DB);
    showToast(`✅ ${n} lançamento(s) categorizado(s)`);
  }
}
function htmlLancamentos(){
  const base = lancamentosBaseFiltrados();
  const lista = lancamentosOrdenados(lancamentosComFiltroColunas(base, null));
  const totalEntradas = lista.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
  const totalSaidas = lista.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);
  const cols = colunasLanc().filter(c=>!_lancColOcultas.has(c.chave));
  const linhas = lista.map(linhaLancTabela).join('') || `<tr><td colspan="${cols.length+1}" style="text-align:center;color:var(--mut)">Nenhum lançamento encontrado</td></tr>`;
  const ocultasChips = [..._lancColOcultas].map(chave=>{
    const col = colunasLanc().find(c=>c.chave===chave);
    return `<span style="cursor:pointer;font-size:11px;background:var(--sur);border:1px solid var(--bor);border-radius:12px;padding:2px 10px;margin-right:6px" onclick="mostrarColunaLanc('${chave}')" title="Clique pra mostrar de novo">👁‍🗨 ${esc(col?col.label:chave)} ✕</span>`;
  }).join('');
  const cabecalho = cols.map(col=>{
    const filtroAtivo = !!_lancColFiltros[col.chave];
    const setaOrdem = _lancOrdem.campo===col.chave ? (_lancOrdem.dir==='asc'?' ▲':' ▼') : '';
    return `<th${col.numerico?' style="text-align:right"':''}>
      <span style="cursor:pointer;user-select:none" ondblclick="ordenarPorColunaLanc('${col.chave}')" title="Duplo clique pra ordenar">${esc(col.label)}${setaOrdem}</span>
      <span style="cursor:pointer;margin-left:4px;opacity:${filtroAtivo?1:.5}" title="Filtrar por valor" onclick="abrirFiltroColunaLanc('${col.chave}',event)">🔻</span>
      <span style="cursor:pointer;margin-left:2px;opacity:.5" title="Ocultar coluna" onclick="ocultarColunaLanc('${col.chave}')">👁</span>
    </th>`;
  }).join('');
  return `
    <div class="titulo acc">📋 Lançamentos</div>
    ${barraFiltroPFPJGlobal()}
    <div class="card" style="margin-bottom:12px">
      <div class="row">
        ${C('Conta',`<select id="flc-conta" onchange="aplicarFiltroLanc()"><option value="">Todas</option>${opcoesContasFiltradas(_filtroLancConta)}</select>`,'1','200')}
        ${C('De',`<input type="date" id="flc-ini" value="${_filtroLancIni}" onchange="aplicarFiltroLanc()">`,'1','150')}
        ${C('Até',`<input type="date" id="flc-fim" value="${_filtroLancFim}" onchange="aplicarFiltroLanc()">`,'1','150')}
      </div>
      <div class="row">
        ${C('Cliente/Fornecedor',`<input type="text" id="flc-contraparte" value="${esc(_filtroLancContraparte)}" placeholder="Buscar por nome..." onchange="aplicarFiltroLanc()">`,'1','200')}
        ${C('Categoria',`<div style="display:flex;gap:5px"><select id="flc-categoria-mae" onchange="aoMudarMaeCascataFixo('flc','categoria');aplicarFiltroLanc()" style="flex:1">${opcoesCategoriaMae('','','',idsMaeSub(categoriaById(_filtroLancCategoria)).maeId)}</select><select id="flc-categoria-sub" onchange="aplicarFiltroLanc()" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(_filtroLancCategoria)).maeId, idsMaeSub(categoriaById(_filtroLancCategoria)).subId)}</select></div>`,'2','260')}
        ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="flc-cc-mae" onchange="aoMudarMaeCascataFixo('flc','cc');aplicarFiltroLanc()" style="flex:1">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(_filtroLancCC)).maeId)}</select><select id="flc-cc-sub" onchange="aplicarFiltroLanc()" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(_filtroLancCC)).maeId, idsMaeSub(centroCustoById(_filtroLancCC)).subId)}</select></div>`,'2','260')}
      </div>
      <div class="row">${BPerm('lancamentos','➕ Novo Lançamento','novoLancamento(\''+_filtroLancConta+'\')','var(--acc)')}${BPerm('lancamentos','📥 Importar Extrato (OFX/CSV)','abrirImportarOFX(\''+_filtroLancConta+'\')','var(--blu)','#fff')}${BPerm('lancamentos','🏦 Nova Tarifa Bancária','novaTarifaBancaria(\''+_filtroLancConta+'\')','var(--sur)','var(--txt)')}${B('✕ Limpar Filtros','limparFiltroLanc()','var(--sur)','var(--txt)')}
      ${BPerm('lancamentos', _lancEdit.ativo?'✅ Sair do Modo Categorização':'🖌 Modo Categorização (arrastar)', 'alternarModoEditarLanc()', _lancEdit.ativo?'var(--acc)':'var(--sur)', _lancEdit.ativo?'#fff':'var(--txt)')}</div>
      ${ocultasChips?`<div style="margin-top:8px">${ocultasChips}</div>`:''}
    </div>
    ${_lancEdit.ativo?`
    <div class="card" style="margin-bottom:12px;border:1px dashed var(--acc)">
      <div style="font-size:12px;color:var(--mut);margin-bottom:8px">🖌 <strong>Modo Categorização:</strong> escolha a Categoria/Centro de Custo/Direcionamento abaixo (o que ficar em branco não altera), depois segure o botão esquerdo do mouse numa linha e arraste pra cima ou pra baixo — todas as linhas que passar recebem essa classificação. Solte o mouse pra salvar.</div>
      <div class="row">
        <div class="campo" style="flex:1;min-width:160px"><label>Categoria</label>
          <div class="row" style="margin-bottom:0">
            <select id="le-categoria-mae" onchange="aoMudarMaeCascata('le','categoria')">${opcoesCategoriaMae(null,'',null,'')}</select>
            <select id="le-categoria-sub">${opcoesSubcategoria('','')}</select>
          </div>
        </div>
        <div class="campo" style="flex:1;min-width:160px"><label>Centro de Custo</label>
          <div class="row" style="margin-bottom:0">
            <select id="le-cc-mae" onchange="aoMudarMaeCascata('le','cc')">${opcoesCentroCustoMae('','')}</select>
            <select id="le-cc-sub">${opcoesSubCentroCusto('','')}</select>
          </div>
        </div>
        <div class="campo" style="flex:1;min-width:160px"><label>Direcionamento</label>
          <div class="row" style="margin-bottom:0">
            <select id="le-direc-mae" onchange="aoMudarMaeCascata('le','direc')">${opcoesDirecionamentoMae('','')}</select>
            <select id="le-direc-sub">${opcoesSubDirecionamento('','')}</select>
          </div>
        </div>
      </div>
    </div>`:''}
    <div class="kpis">
      <div class="card kpi"><div class="kpi-l">Entradas no filtro</div><div class="kpi-v" id="lanc-kpi-entradas" style="color:#3fb950">R$ ${fmt(totalEntradas)}</div></div>
      <div class="card kpi"><div class="kpi-l">Saídas no filtro</div><div class="kpi-v" id="lanc-kpi-saidas" style="color:#f85149">R$ ${fmt(totalSaidas)}</div></div>
      <div class="card kpi"><div class="kpi-l">Resultado</div><div class="kpi-v" id="lanc-kpi-resultado" style="color:${(totalEntradas-totalSaidas)<0?'var(--red)':'var(--acc)'}">R$ ${fmt(totalEntradas-totalSaidas)}</div></div>
    </div>
    <div class="card">
      <table><thead class="thead-fixo"><tr>${cabecalho}<th></th></tr></thead><tbody id="lanc-tbody">${linhas}</tbody></table>
    </div>
  `;
}

// ══════════════════════════════════════════
// RELATÓRIO DE FILTRAGEM (flexível) — usuário escolhe colunas e filtros
// ══════════════════════════════════════════
let FRF = {
  colunas: {data:true, conta:true, tipo:true, categoria:true, centroCusto:true, direcionamento:false, contraparte:true, descricao:true, valor:true, origem:false},
  // PADRÃO: últimos 90 dias (mesmo motivo de Lançamentos — evitar travar
  // renderizando a base inteira). "Todos" continua disponível apagando "De".
  de:(()=>{ const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10); })(), ate:'', tipo:'', contaId:'', categoriaId:'', centroCustoId:'', contraparte:'', direcionamento:'', busca:'', origem:'',
  agruparPor:'', gruposAbertos:{}
};
const COLUNAS_FRF = [
  {id:'data', label:'Data'},
  {id:'conta', label:'Conta'},
  {id:'tipo', label:'Tipo'},
  {id:'categoria', label:'Categoria'},
  {id:'centroCusto', label:'Centro de Custo'},
  {id:'direcionamento', label:'Direcionamento'},
  {id:'contraparte', label:'Fornecedor/Cliente'},
  {id:'descricao', label:'Descrição'},
  {id:'origem', label:'Origem'},
  {id:'valor', label:'Valor'},
];
const DIMENSOES_AGRUPAMENTO_FRF = [
  {id:'', label:'Nenhum (lista simples)'},
  {id:'categoria', label:'Categoria'},
  {id:'centroCusto', label:'Centro de Custo'},
  {id:'direcionamento', label:'Direcionamento'},
  {id:'contraparte', label:'Fornecedor/Cliente'},
  {id:'conta', label:'Conta'},
  {id:'mes', label:'Mês'},
];
function toggleColunaFRF(col){ FRF.colunas[col] = !FRF.colunas[col]; renderAba(); }
function aplicarFiltroFRF(){
  FRF.de = document.getElementById('frf-de')?.value||'';
  FRF.ate = document.getElementById('frf-ate')?.value||'';
  FRF.tipo = document.getElementById('frf-tipo')?.value||'';
  FRF.contaId = document.getElementById('frf-conta')?.value||'';
  FRF.categoriaId = valorFinalCascata('frf','categoria');
  FRF.centroCustoId = valorFinalCascata('frf','cc');
  FRF.contraparte = document.getElementById('frf-contraparte')?.value||'';
  FRF.direcionamento = document.getElementById('frf-direc')?.value||'';
  FRF.busca = document.getElementById('frf-busca')?.value||'';
  FRF.origem = document.getElementById('frf-origem')?.value||'';
  FRF.agruparPor = document.getElementById('frf-agrupar')?.value||'';
  renderAba();
}
function limparFiltroFRF(){
  FRF = {...FRF, de:'',ate:'',tipo:'',contaId:'',categoriaId:'',centroCustoId:'',contraparte:'',direcionamento:'',busca:'',origem:'',agruparPor:'',gruposAbertos:{}};
  const catMae=document.getElementById('frf-categoria-mae'); if(catMae){ catMae.value=''; aoMudarMaeCascataFixo('frf','categoria'); }
  const ccMae=document.getElementById('frf-cc-mae'); if(ccMae){ ccMae.value=''; aoMudarMaeCascataFixo('frf','cc'); }
  renderAba();
}
function irParaRelatorioFlex(){ irPara('relatorio_flex'); }
function toggleGrupoFRF(chave){ FRF.gruposAbertos[chave] = !FRF.gruposAbertos[chave]; renderAba(); }
// Emitente/Sacado/Vencimento do título não existem como campo próprio aqui na
// Tesouraria (isso é modelo de dados do ChequeSys) — só aparecem dentro do texto
// da descrição de lançamentos espelhados de lá. Por isso a Busca Livre varre
// descrição + contraparte, o que cobre a maioria dos casos de busca por esses termos.
function _lancamentosFiltradosFRF(){
  let lista = (DB.lancamentos||[]).slice();
  lista = lista.filter(l=>contaTipoOk(l.contaId));
  if(FRF.de) lista = lista.filter(l=>l.data>=FRF.de);
  if(FRF.ate) lista = lista.filter(l=>l.data<=FRF.ate);
  if(FRF.tipo) lista = lista.filter(l=>l.tipo===FRF.tipo);
  if(FRF.contaId) lista = lista.filter(l=>l.contaId===FRF.contaId);
  if(FRF.categoriaId) lista = lista.filter(l=>l.categoriaId===FRF.categoriaId || categoriaById(l.categoriaId)?.parentId===FRF.categoriaId);
  if(FRF.centroCustoId) lista = lista.filter(l=>l.centroCustoId===FRF.centroCustoId || centroCustoById(l.centroCustoId)?.parentId===FRF.centroCustoId);
  if(FRF.origem) lista = lista.filter(l=>l.origem===FRF.origem);
  if(FRF.contraparte) lista = lista.filter(l=>(l.contraparte||'').toLowerCase().includes(FRF.contraparte.toLowerCase()));
  if(FRF.direcionamento) lista = lista.filter(l=>(l.direcionamento||'')===FRF.direcionamento || (l.direcionamento||'').startsWith(FRF.direcionamento+':'));
  if(FRF.busca) lista = lista.filter(l=>(l.descricao||'').toLowerCase().includes(FRF.busca.toLowerCase()) || (l.contraparte||'').toLowerCase().includes(FRF.busca.toLowerCase()));
  lista.sort((a,b)=>b.data.localeCompare(a.data)||(b.criadoEm||'').localeCompare(a.criadoEm||''));
  return lista;
}
function _valoresLinhaFRF(l){
  const c = contaById(l.contaId);
  const cat = categoriaById(l.categoriaId);
  const cc = centroCustoById(l.centroCustoId);
  return {
    data: fmtD(l.data),
    conta: c?nomeConta(c):'-',
    tipo: l.tipo==='entrada'?'Entrada':'Saída',
    categoria: cat?nomeCompletoCategoria(cat):'-',
    centroCusto: cc?nomeCompletoCentroCusto(cc):'-',
    direcionamento: l.direcionamento||'-',
    contraparte: l.contraparte||'-',
    descricao: l.descricao||'-',
    origem: l.origem||'-',
    valor: (l.tipo==='entrada'?'+':'-')+' R$ '+fmt(l.valor)
  };
}
// Chave+rótulo de agrupamento pra um lançamento, conforme a dimensão escolhida —
// mesmo espírito do "Classification"/agrupamento do Money: qualquer relatório
// pode virar um resumo por Categoria, Direcionamento, Fornecedor, Mês, etc.
function _chaveGrupoFRF(l, dimensao){
  if(dimensao==='categoria'){ const c=categoriaById(l.categoriaId); return {chave:l.categoriaId||'(sem)', label:c?nomeCompletoCategoria(c):'(sem categoria)'}; }
  if(dimensao==='centroCusto'){ const c=centroCustoById(l.centroCustoId); return {chave:l.centroCustoId||'(sem)', label:c?nomeCompletoCentroCusto(c):'(sem centro de custo)'}; }
  if(dimensao==='direcionamento'){ return {chave:l.direcionamento||'(sem)', label:l.direcionamento||'(sem direcionamento)'}; }
  if(dimensao==='contraparte'){ return {chave:l.contraparte||'(sem)', label:l.contraparte||'(sem fornecedor/cliente)'}; }
  if(dimensao==='conta'){ const c=contaById(l.contaId); return {chave:l.contaId||'(sem)', label:c?nomeConta(c):'(sem conta)'}; }
  if(dimensao==='mes'){ const m=(l.data||'').slice(0,7); return {chave:m, label:m?`${m.slice(5,7)}/${m.slice(0,4)}`:'(sem data)'}; }
  return {chave:'', label:''};
}
function _agruparLancamentosFRF(lista, dimensao){
  const mapa = {};
  lista.forEach(l=>{
    const {chave, label} = _chaveGrupoFRF(l, dimensao);
    if(!mapa[chave]) mapa[chave] = {chave, label, itens:[], totalEntrada:0, totalSaida:0};
    mapa[chave].itens.push(l);
    if(l.tipo==='entrada') mapa[chave].totalEntrada += Number(l.valor); else mapa[chave].totalSaida += Number(l.valor);
  });
  return Object.values(mapa).map(g=>({...g, total:g.totalEntrada-g.totalSaida}))
    .sort((a,b)=>Math.abs(b.total)-Math.abs(a.total));
}
function _svgBarrasGrupos(grupos){
  if(!grupos.length) return '';
  const top = grupos.slice(0,10);
  const w=700, alturaLinha=26, h = top.length*alturaLinha + 20, padEsq=170, padDir=90;
  const maxAbs = Math.max(...top.map(g=>Math.abs(g.total)), 1);
  const barras = top.map((g,i)=>{
    const y = 10 + i*alturaLinha;
    const largura = Math.abs(g.total)/maxAbs * (w-padEsq-padDir);
    const cor = g.total>=0 ? '#3fb950' : '#f85149';
    return `<text x="${padEsq-8}" y="${y+14}" font-size="10" fill="#c9d1d9" text-anchor="end">${esc(g.label.length>26?g.label.slice(0,25)+'…':g.label)}</text>
      <rect x="${padEsq}" y="${y+3}" width="${Math.max(largura,2).toFixed(1)}" height="16" rx="3" fill="${cor}"/>
      <text x="${(padEsq+largura+6).toFixed(1)}" y="${y+14}" font-size="10" fill="#c9d1d9">R$ ${fmt(g.total)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${barras}</svg>`;
}
function htmlRelatorioFlex(){
  const lista = _lancamentosFiltradosFRF();
  const totalEntradas = lista.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor),0);
  const totalSaidas = lista.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor),0);

  const checksColunas = COLUNAS_FRF.map(c=>`
    <label style="display:flex;align-items:center;gap:5px;font-size:12px;background:var(--sur);border:1px solid var(--bor);border-radius:6px;padding:5px 10px;cursor:pointer">
      <input type="checkbox" ${FRF.colunas[c.id]?'checked':''} onchange="toggleColunaFRF('${c.id}')"> ${c.label}
    </label>`).join('');

  const colsAtivas = COLUNAS_FRF.filter(c=>FRF.colunas[c.id]);
  const cabecalho = colsAtivas.map(c=>`<th${c.id==='valor'?' style="text-align:right"':''}>${c.label}</th>`).join('');

  function linhasDe(itens){
    return itens.map(l=>{
      const v = _valoresLinhaFRF(l);
      return `<tr>${colsAtivas.map(c=>{
        let conteudo = esc(v[c.id]);
        if(c.id==='tipo') conteudo = T(v.tipo, l.tipo==='entrada'?'vd':'vm');
        if(c.id==='valor') conteudo = `<span style="font-weight:700;color:${l.tipo==='entrada'?'#3fb950':'#f85149'}">${esc(v.valor)}</span>`;
        return `<td${c.id==='valor'?' style="text-align:right"':''}>${conteudo}</td>`;
      }).join('')}</tr>`;
    }).join('');
  }

  let corpoTabela;
  if(FRF.agruparPor){
    const grupos = _agruparLancamentosFRF(lista, FRF.agruparPor);
    corpoTabela = grupos.map(g=>{
      const aberto = !!FRF.gruposAbertos[g.chave];
      const linhaGrupo = `<tr onclick="toggleGrupoFRF('${esc(g.chave).replace(/'/g,"\\'")}')" style="cursor:pointer;background:var(--sur);font-weight:700">
        <td colspan="${colsAtivas.length}">
          <span style="display:inline-block;width:14px">${aberto?'▾':'▸'}</span>
          ${esc(g.label)} <span style="font-weight:400;color:var(--mut);font-size:11px">(${g.itens.length} lançamento${g.itens.length>1?'s':''})</span>
          <span style="float:right;color:${g.total>=0?'#3fb950':'#f85149'}">R$ ${fmt(g.total)}</span>
        </td>
      </tr>`;
      return linhaGrupo + (aberto ? linhasDe(g.itens) : '');
    }).join('') || `<tr><td colspan="${colsAtivas.length||1}" style="text-align:center;color:var(--mut);padding:20px">Nenhum lançamento encontrado com esses filtros.</td></tr>`;
  } else {
    corpoTabela = linhasDe(lista) || `<tr><td colspan="${colsAtivas.length||1}" style="text-align:center;color:var(--mut);padding:20px">Nenhum lançamento encontrado com esses filtros.</td></tr>`;
  }

  const grupoChart = FRF.agruparPor ? _agruparLancamentosFRF(lista, FRF.agruparPor) : [];
  const favoritos = DB.relatoriosFavoritos||[];
  const chipsFavoritos = favoritos.length ? `<div class="row" style="margin-bottom:8px;gap:6px;flex-wrap:wrap">
    ${favoritos.map(f=>`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--sur);border:1px solid var(--bor);border-radius:14px;padding:4px 6px 4px 12px;font-size:11px">
      <span style="cursor:pointer" onclick="carregarRelatorioFavoritoFRF('${f.id}')" title="Carregar este relatório">⭐ ${esc(f.nome)}</span>
      <span style="cursor:pointer;color:var(--mut);padding:0 4px" onclick="excluirRelatorioFavoritoFRF('${f.id}')" title="Excluir favorito">✕</span>
    </span>`).join('')}
  </div>` : '';

  return `<div class="titulo acc">🔍 Relatório de Filtragem</div>
  <div style="font-size:11px;color:var(--mut);margin:-6px 0 14px;line-height:1.5">Escolha colunas, filtros e (se quiser) uma forma de agrupar — clique num grupo pra abrir os lançamentos dele. Emitente/Sacado/Vencimento do título aparecem dentro da Descrição — use a Busca Livre pra achar por esses termos.</div>

  ${chipsFavoritos}

  <div class="card" style="margin-bottom:12px">
    <div style="font-weight:700;margin-bottom:8px">Colunas do Relatório</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${checksColunas}</div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div style="font-weight:700;margin-bottom:8px">Filtros</div>
    <div class="row">
      ${C('Período — De',`<input type="date" id="frf-de" value="${FRF.de}" onchange="aplicarFiltroFRF()">`,'1','150')}
      ${C('Período — Até',`<input type="date" id="frf-ate" value="${FRF.ate}" onchange="aplicarFiltroFRF()">`,'1','150')}
      ${C('Tipo',`<select id="frf-tipo" onchange="aplicarFiltroFRF()"><option value="">Todos</option><option value="entrada"${FRF.tipo==='entrada'?' selected':''}>Entrada</option><option value="saida"${FRF.tipo==='saida'?' selected':''}>Saída</option></select>`,'1','130')}
    </div>
    <div class="row">
      ${C('Conta',`<select id="frf-conta" onchange="aplicarFiltroFRF()"><option value="">Todas</option>${opcoesContasFiltradas(FRF.contaId)}</select>`,'1','200')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="frf-categoria-mae" onchange="aoMudarMaeCascataFixo('frf','categoria');aplicarFiltroFRF()" style="flex:1">${opcoesCategoriaMae('','','',idsMaeSub(categoriaById(FRF.categoriaId)).maeId)}</select><select id="frf-categoria-sub" onchange="aplicarFiltroFRF()" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(FRF.categoriaId)).maeId, idsMaeSub(categoriaById(FRF.categoriaId)).subId)}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="frf-cc-mae" onchange="aoMudarMaeCascataFixo('frf','cc');aplicarFiltroFRF()" style="flex:1">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(FRF.centroCustoId)).maeId)}</select><select id="frf-cc-sub" onchange="aplicarFiltroFRF()" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(FRF.centroCustoId)).maeId, idsMaeSub(centroCustoById(FRF.centroCustoId)).subId)}</select></div>`,'2','260')}
    </div>
    <div class="row">
      ${C('Fornecedor/Cliente',`<input type="text" id="frf-contraparte" value="${esc(FRF.contraparte)}" placeholder="Buscar por nome..." onchange="aplicarFiltroFRF()">`,'1','200')}
      ${C('Direcionamento',`<select id="frf-direc" onchange="aplicarFiltroFRF()"><option value="">Todos</option>${direcionamentosExistentes().map(d=>`<option value="${esc(d)}"${d===FRF.direcionamento?' selected':''}>${esc(d)}</option>`).join('')}</select>`,'1','180')}
      ${C('Origem',`<select id="frf-origem" onchange="aplicarFiltroFRF()"><option value="">Todas</option><option value="manual"${FRF.origem==='manual'?' selected':''}>Manual</option><option value="chequesys"${FRF.origem==='chequesys'?' selected':''}>ChequeSys</option><option value="pagamento"${FRF.origem==='pagamento'?' selected':''}>Pagamento Cartão</option><option value="ofx"${FRF.origem==='ofx'?' selected':''}>Importado OFX</option><option value="transferencia"${FRF.origem==='transferencia'?' selected':''}>Transferência</option></select>`,'1','170')}
      ${C('Busca Livre (descrição, emitente, sacado, nº do título...)',`<input type="text" id="frf-busca" value="${esc(FRF.busca)}" placeholder="Ex: nome do emitente, nº do cheque..." onchange="aplicarFiltroFRF()">`,'2','280')}
    </div>
    <div class="row">
      ${C('Agrupar por',`<select id="frf-agrupar" onchange="aplicarFiltroFRF()">${DIMENSOES_AGRUPAMENTO_FRF.map(d=>`<option value="${d.id}"${FRF.agruparPor===d.id?' selected':''}>${d.label}</option>`).join('')}</select>`,'1','220')}
    </div>
    <div class="row">${B('✕ Limpar Filtros','limparFiltroFRF()','var(--sur)','var(--txt)')}${B('⭐ Salvar como Favorito','salvarRelatorioFavoritoFRF()','var(--sur)','var(--acc)')}${B('🖨 Imprimir','imprimirRelatorioFlex()','var(--acc)')}${B('📥 Exportar CSV','exportarCSVRelatorioFlex()','var(--sur)','var(--txt)')}</div>
  </div>

  <div class="kpis">
    <div class="card kpi"><div class="kpi-l">Entradas no filtro</div><div class="kpi-v" style="color:#3fb950">R$ ${fmt(totalEntradas)}</div></div>
    <div class="card kpi"><div class="kpi-l">Saídas no filtro</div><div class="kpi-v" style="color:#f85149">R$ ${fmt(totalSaidas)}</div></div>
    <div class="card kpi"><div class="kpi-l">Resultado</div><div class="kpi-v" style="color:${(totalEntradas-totalSaidas)<0?'var(--red)':'var(--acc)'}">R$ ${fmt(totalEntradas-totalSaidas)}</div></div>
    <div class="card kpi"><div class="kpi-l">Lançamentos</div><div class="kpi-v">${lista.length}</div></div>
  </div>

  ${FRF.agruparPor && grupoChart.length ? `<div class="card" style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:8px">Gráfico — Top 10 por ${DIMENSOES_AGRUPAMENTO_FRF.find(d=>d.id===FRF.agruparPor).label}</div>${_svgBarrasGrupos(grupoChart)}</div>` : ''}

  <div class="card tabela-mobile-cards" style="overflow-x:auto"><table><thead><tr>${cabecalho}</tr></thead><tbody>${corpoTabela}</tbody></table></div>`;
}
function salvarRelatorioFavoritoFRF(){
  const nome = prompt('Nome deste relatório favorito (ex: "Despesas Telasul por Categoria"):');
  if(!nome || !nome.trim()) return;
  const novo = {
    id: uid(), nome: nome.trim(),
    config: { colunas:{...FRF.colunas}, de:FRF.de, ate:FRF.ate, tipo:FRF.tipo, contaId:FRF.contaId, categoriaId:FRF.categoriaId, centroCustoId:FRF.centroCustoId, contraparte:FRF.contraparte, busca:FRF.busca, origem:FRF.origem, agruparPor:FRF.agruparPor },
    criadoEm: new Date().toISOString()
  };
  salvar({...DB, relatoriosFavoritos:[...(DB.relatoriosFavoritos||[]), novo]});
  setStatus('ok', `⭐ Relatório "${novo.nome}" salvo nos favoritos`);
  setTimeout(()=>{document.getElementById('status').style.display='none';},3000);
}
function carregarRelatorioFavoritoFRF(id){
  const f = (DB.relatoriosFavoritos||[]).find(x=>x.id===id);
  if(!f) return;
  FRF = {...FRF, ...f.config, colunas:{...f.config.colunas}, gruposAbertos:{}};
  renderAba();
}
function excluirRelatorioFavoritoFRF(id){
  const f = (DB.relatoriosFavoritos||[]).find(x=>x.id===id);
  if(!f) return;
  CF(`Excluir o relatório favorito "${f.nome}"?`, ()=>{
    salvar({...DB, relatoriosFavoritos:(DB.relatoriosFavoritos||[]).filter(x=>x.id!==id)});
  });
}
function imprimirRelatorioFlex(){
  const lista = _lancamentosFiltradosFRF();
  const colsAtivas = COLUNAS_FRF.filter(c=>FRF.colunas[c.id]);
  const totalEntradas = lista.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor),0);
  const totalSaidas = lista.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor),0);
  const cabecalho = colsAtivas.map(c=>`<th>${c.label}</th>`).join('');
  function linhasDe(itens){
    return itens.map(l=>{
      const v = _valoresLinhaFRF(l);
      return `<tr>${colsAtivas.map(c=>`<td${c.id==='valor'?' align=right':''}>${esc(v[c.id])}</td>`).join('')}</tr>`;
    }).join('');
  }
  let corpo;
  if(FRF.agruparPor){
    const grupos = _agruparLancamentosFRF(lista, FRF.agruparPor);
    corpo = grupos.map(g=>`<tr style="background:#eee;font-weight:bold"><td colspan="${colsAtivas.length}">${esc(g.label)} (${g.itens.length}) — R$ ${fmt(g.total)}</td></tr>${linhasDe(g.itens)}`).join('');
  } else {
    corpo = linhasDe(lista);
  }
  const filtroResumo = [
    FRF.de?`De ${fmtD(FRF.de)}`:'', FRF.ate?`Até ${fmtD(FRF.ate)}`:'', FRF.tipo?`Tipo: ${FRF.tipo==='entrada'?'Entrada':'Saída'}`:'',
    FRF.contraparte?`Contraparte: ${FRF.contraparte}`:'', FRF.direcionamento?`Direcionamento: ${FRF.direcionamento}`:'', FRF.busca?`Busca: ${FRF.busca}`:'',
    FRF.agruparPor?`Agrupado por: ${DIMENSOES_AGRUPAMENTO_FRF.find(d=>d.id===FRF.agruparPor).label}`:''
  ].filter(Boolean).join(' | ') || 'Sem filtros aplicados';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Filtragem</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
    body{font-family:Arial;font-size:11px;color:#111;margin:0}
    h2{margin:0 0 4px}
    .filtros{font-size:10px;color:#555;margin-bottom:10px}
    table{border-collapse:collapse;width:100%}
    th{background:#1a1a2e;color:#fff;padding:5px 7px;font-size:10px;text-align:left;text-transform:uppercase}
    td{padding:4px 7px;border-bottom:1px solid #ddd}
    tfoot td{font-weight:bold;background:#f0f0f0}
  </style></head><body>
  <h2>Relatório de Filtragem — TesourariaSys</h2>
  <div class="filtros">${esc(filtroResumo)} — Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  <table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody>
  <tfoot><tr><td colspan="${colsAtivas.length}">Entradas: R$ ${fmt(totalEntradas)} — Saídas: R$ ${fmt(totalSaidas)} — Resultado: R$ ${fmt(totalEntradas-totalSaidas)} — ${lista.length} lançamento(s)</td></tr></tfoot>
  </table>
  </body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}
function exportarCSVRelatorioFlex(){
  const lista = _lancamentosFiltradosFRF();
  const colsAtivas = COLUNAS_FRF.filter(c=>FRF.colunas[c.id]);
  if(!lista.length){ alert('Nenhum lançamento encontrado para exportar.'); return; }
  const linhasCsv = [colsAtivas.map(c=>c.label).join(',')];
  lista.forEach(l=>{
    const v = _valoresLinhaFRF(l);
    const linha = colsAtivas.map(c=>`"${String(v[c.id]||'').replace(/"/g,'""')}"`).join(',');
    linhasCsv.push(linha);
  });
  const csv = '\uFEFF'+linhasCsv.join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `relatorio_filtragem_${hoje()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════
// PATRIMÔNIO — EVOLUÇÃO HISTÓRICA (gráfico simples em SVG, sem dependência
// externa — mantém o sistema 100% offline-first, sem precisar carregar
// biblioteca de gráfico nenhuma de fora)
// ══════════════════════════════════════════
let _pfEvolPeriodo = 90; // em dias: 30, 90 ou 365
function mudarPeriodoEvolPatrimonio(dias){ _pfEvolPeriodo = dias; renderAba(); }
function _serieEvolucaoPatrimonio(diasTotal){
  const hj = hoje();
  let passoDias, qtdPontos;
  if(diasTotal<=30){ passoDias=1; qtdPontos=diasTotal; }
  else if(diasTotal<=90){ passoDias=7; qtdPontos=Math.ceil(diasTotal/7); }
  else { passoDias=30; qtdPontos=Math.ceil(diasTotal/30); }
  const pontos = [];
  for(let i=qtdPontos;i>=0;i--){
    const d = addDiasStr(hj, -i*passoDias);
    pontos.push({ data:d, label:fmtD(d), valor: saldoTotalGeralAteData(d) });
  }
  return pontos;
}
function _svgLinhaEvolucao(pontos){
  if(pontos.length<2) return '<div style="text-align:center;color:var(--mut);padding:30px">Não há histórico suficiente ainda para desenhar o gráfico.</div>';
  const w=700, h=220, pad=38;
  const valores = pontos.map(p=>p.valor);
  const minV = Math.min(...valores,0), maxV = Math.max(...valores,0);
  const rangeV = (maxV-minV)||1;
  const stepX = (w-2*pad)/(pontos.length-1);
  const cx = i => pad + i*stepX;
  const cy = v => h-pad - ((v-minV)/rangeV)*(h-2*pad);
  const pathD = pontos.map((p,i)=>`${i===0?'M':'L'}${cx(i).toFixed(1)},${cy(p.valor).toFixed(1)}`).join(' ');
  const zeroY = cy(0);
  const subiu = valores[valores.length-1] >= valores[0];
  const cor = subiu ? '#3fb950' : '#f85149';
  const areaD = `${pathD} L${cx(pontos.length-1).toFixed(1)},${zeroY.toFixed(1)} L${cx(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const idxLabels = [0, Math.floor((pontos.length-1)/2), pontos.length-1];
  const labels = idxLabels.map(i=>`<text x="${cx(i).toFixed(1)}" y="${h-10}" font-size="9" fill="#8b949e" text-anchor="middle">${pontos[i].label}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;max-height:240px;display:block">
    <line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${w-pad}" y2="${zeroY.toFixed(1)}" stroke="#30363d" stroke-dasharray="3,3"/>
    <path d="${areaD}" fill="${cor}" fill-opacity="0.12" stroke="none"/>
    <path d="${pathD}" fill="none" stroke="${cor}" stroke-width="2.2"/>
    ${labels}
  </svg>`;
}
function htmlPatrimonioEvolucao(){
  const pontos = _serieEvolucaoPatrimonio(_pfEvolPeriodo);
  const inicio = pontos.length ? pontos[0].valor : 0;
  const atual = pontos.length ? pontos[pontos.length-1].valor : 0;
  const diff = atual - inicio;
  const pct = inicio!==0 ? (diff/Math.abs(inicio)*100) : 0;
  const opcoes = [{d:30,l:'30 dias'},{d:90,l:'90 dias'},{d:365,l:'12 meses'}];
  return `<div class="titulo acc">📈 Patrimônio — Evolução</div>
  <div style="font-size:11px;color:var(--mut);margin:-6px 0 14px;line-height:1.5">Mostra a evolução do Saldo em Contas (soma de todas as contas ativas da Tesouraria) ao longo do tempo, reconstruído a partir dos lançamentos reais — nunca um valor gravado à parte. Não inclui patrimônio investido, contas a pagar/receber pendentes nem saldo do ChequeSys (esses só têm o valor de HOJE, disponíveis no Dashboard) — reconstruir esses retroativamente ainda não é confiável com os dados que temos hoje.</div>

  <div class="card" style="margin-bottom:12px">
    <div class="row" style="margin-bottom:10px">
      ${opcoes.map(o=>B(o.l,'mudarPeriodoEvolPatrimonio('+o.d+')', _pfEvolPeriodo===o.d?'var(--acc)':'var(--sur)', _pfEvolPeriodo===o.d?'#000':'var(--txt)')).join('')}
    </div>
    ${_svgLinhaEvolucao(pontos)}
  </div>

  <div class="kpis">
    <div class="card kpi"><div class="kpi-l">Início do período</div><div class="kpi-v">R$ ${fmt(inicio)}</div></div>
    <div class="card kpi"><div class="kpi-l">Hoje</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(atual)}</div></div>
    <div class="card kpi"><div class="kpi-l">Variação no período</div><div class="kpi-v" style="color:${diff>=0?'#3fb950':'#f85149'}">${diff>=0?'+':''}R$ ${fmt(diff)} (${pct>=0?'+':''}${pct.toFixed(1)}%)</div></div>
  </div>`;
}

// ══════════════════════════════════════════
// RENDER — CONTAS A PAGAR
// ══════════════════════════════════════════
let _filtroCPStatus = 'pendente';
function filtrarCP(st){ _filtroCPStatus = st; renderAba(); }
// ── Calendário de Contas a Pagar (estilo Money: grade do mês, clique no dia
// abre as transações agendadas daquele dia numa janela à parte) ──
let _cpModoView = 'lista';
function toggleModoViewCP(modo){ _cpModoView = modo; renderAba(); }
let _calPagarMes = hoje().slice(0,7); // 'AAAA-MM'
function calPagarMudarMes(delta){
  const [y,m] = _calPagarMes.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  _calPagarMes = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderAba();
}
function calPagarIrHoje(){ _calPagarMes = hoje().slice(0,7); renderAba(); }
function _dataStrLocal(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function htmlCalendarioContasPagar(){
  const [ano, mes] = _calPagarMes.split('-').map(Number);
  const primeiroDia = new Date(ano, mes-1, 1);
  const inicioGrid = new Date(primeiroDia);
  inicioGrid.setDate(inicioGrid.getDate() - primeiroDia.getDay());
  const dias = [];
  for(let i=0;i<42;i++){ const d=new Date(inicioGrid); d.setDate(inicioGrid.getDate()+i); dias.push(d); }

  const porDia = {};
  (DB.contasPagar||[]).filter(cp=>contaTipoOk(cp.contaId)).forEach(cp=>{
    (porDia[cp.vencimento]=porDia[cp.vencimento]||[]).push(cp);
  });

  const nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const diasSemana = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const cabecalhoDias = diasSemana.map(d=>`<th style="padding:6px;font-size:10.5px;text-transform:capitalize;text-align:left">${d}</th>`).join('');

  const hojeStr = hoje();
  let linhasSemanas = '';
  for(let semana=0; semana<6; semana++){
    let cel = '';
    for(let diaSem=0; diaSem<7; diaSem++){
      const d = dias[semana*7+diaSem];
      const dataStr = _dataStrLocal(d);
      const foraDoMes = (d.getMonth()+1)!==mes;
      const itens = (porDia[dataStr]||[]).slice().sort((a,b)=>a.favorecido.localeCompare(b.favorecido,'pt-BR'));
      const ehHoje = dataStr===hojeStr;
      cel += `<td onclick="abrirDiaCalendarioPagar('${dataStr}')" title="Ver transações de ${fmtD(dataStr)}"
        style="vertical-align:top;padding:5px;cursor:pointer;min-width:110px;height:72px;border:1px solid var(--bor);${foraDoMes?'opacity:.35':''}${ehHoje?'background:#2f81f722;box-shadow:inset 0 0 0 2px var(--acc)':''}">
        <div style="font-weight:800;font-size:11px;margin-bottom:2px">${d.getDate()}</div>
        ${itens.slice(0,3).map(cp=>`<div style="font-size:9.5px;color:${cp.status==='pago'?'var(--mut)':'var(--txt)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cp.status==='pago'?'✓ ':''}${esc(cp.favorecido)}</div>`).join('')}
        ${itens.length>3?`<div style="font-size:9px;color:var(--acc)">+${itens.length-3} mais</div>`:''}
      </td>`;
    }
    linhasSemanas += `<tr>${cel}</tr>`;
  }

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      ${B('◀','calPagarMudarMes(-1)','var(--sur)','var(--txt)')}
      <div style="font-weight:800;font-size:15px;min-width:170px;text-align:center">${nomesMes[mes-1]} ${ano}</div>
      ${B('▶','calPagarMudarMes(1)','var(--sur)','var(--txt)')}
      ${B('Hoje','calPagarIrHoje()','var(--sur)','var(--txt)')}
    </div>
    <div class="card" style="overflow-x:auto;padding:8px">
      <table style="min-width:760px"><thead><tr>${cabecalhoDias}</tr></thead><tbody>${linhasSemanas}</tbody></table>
    </div>
  `;
}
function abrirDiaCalendarioPagar(dataStr){
  const itens = (DB.contasPagar||[]).filter(cp=>cp.vencimento===dataStr && contaTipoOk(cp.contaId))
    .sort((a,b)=>a.favorecido.localeCompare(b.favorecido,'pt-BR'));
  const linhas = itens.map(cp=>{
    const cta = contaById(cp.contaId);
    const sv = statusVisualContaPagar(cp);
    return `<tr>
      <td>${fmtD(cp.vencimento)}</td>
      <td>${esc(cp.favorecido)}</td>
      <td>${esc(cta?cta.titular:'A definir')}</td>
      <td style="text-align:right;font-weight:700">R$ ${fmt(cp.status==='pago'?cp.valorPago:cp.valor)}</td>
      <td>${T(sv.label,sv.tag)}</td>
      <td style="white-space:nowrap">
        ${cp.status==='pendente'?B('💵 Registrar pagto...',`fecharCalDia();abrirPagamento('${cp.id}')`,'var(--grn)','#fff',1):''}
        ${B('✏ Editar detalhes...',`fecharCalDia();editarContaPagar('${cp.id}')`,'var(--sur)','var(--txt)',1)}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--mut);padding:16px">Nenhuma transação agendada para este dia</td></tr>`;
  document.getElementById('caldia-titulo').textContent = 'Transações agendadas para '+fmtD(dataStr);
  document.getElementById('caldia-corpo').innerHTML = `
    <div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Favorecido</th><th>Conta</th><th style="text-align:right">Montante</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      ${BPerm('lancamentos','➕ Nova conta a pagar/depósito...',`fecharCalDia();novaContaPagar('${dataStr}')`,'var(--acc)')}
      ${B('Fechar','fecharCalDia()','var(--sur)','var(--txt)')}
    </div>
  `;
  document.getElementById('ov-cal-dia').classList.add('vis');
  _resetPosicaoJanela(document.querySelector('#ov-cal-dia .modal'));
}
function fecharCalDia(){ document.getElementById('ov-cal-dia').classList.remove('vis'); }
function htmlContasPagar(){
  let lista = (DB.contasPagar||[]).slice();
  lista = lista.filter(cp=>contaTipoOk(cp.contaId));
  if(_filtroCPStatus==='pendente') lista = lista.filter(cp=>cp.status==='pendente');
  else if(_filtroCPStatus==='pago') lista = lista.filter(cp=>cp.status==='pago');
  else if(_filtroCPStatus==='vencido') lista = lista.filter(cp=>cp.status==='pendente'&&diffDias(cp.vencimento)<0);
  lista.sort((a,b)=>a.vencimento.localeCompare(b.vencimento));

  const totalFiltro = lista.reduce((s,cp)=>s+(cp.status==='pago'?cp.valorPago:cp.valor),0);

  const linhas = lista.map(cp=>{
    const cat = categoriaById(cp.categoriaId);
    const cc = centroCustoById(cp.centroCustoId);
    const cta = contaById(cp.contaId);
    const sv = statusVisualContaPagar(cp);
    return `<tr>
      <td>${fmtD(cp.vencimento)}</td>
      <td>${esc(cp.favorecido)}</td>
      <td>${esc(cat?nomeCompletoCategoria(cat):'-')}</td>
      <td>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td>
      <td>${esc(cta?cta.titular:'A definir')}</td>
      <td style="text-align:right;font-weight:700">R$ ${fmt(cp.status==='pago'?cp.valorPago:cp.valor)}</td>
      <td>${T(sv.label,sv.tag)}</td>
      <td>
        ${cp.status==='pendente'?BPerm('pagar','💵 Pagar','abrirPagamento(\''+cp.id+'\')','var(--grn)','#fff',1):''}
        ${B('✏','editarContaPagar(\''+cp.id+'\')','var(--sur)','var(--txt)',1)}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mut)">Nenhuma conta encontrada neste filtro</td></tr>';

  const filtros = [
    {id:'pendente',label:'Pendentes'},
    {id:'vencido',label:'Vencidas'},
    {id:'pago',label:'Pagas'},
    {id:'todos',label:'Todas'},
  ];

  return `
    <div class="titulo acc">📤 Contas a Pagar</div>
    ${barraFiltroPFPJGlobal()}
    <div class="row" style="margin-bottom:12px">
      ${BPerm('lancamentos','➕ Nova Conta a Pagar','novaContaPagar()','var(--acc)')}
      <button type="button" class="tab${_cpModoView==='lista'?' ativo':''}" style="background:${_cpModoView==='lista'?'var(--acc)':'var(--sur)'};color:${_cpModoView==='lista'?'#000':'var(--txt)'};padding:6px 14px" onclick="toggleModoViewCP('lista')">📋 Lista</button>
      <button type="button" class="tab${_cpModoView==='calendario'?' ativo':''}" style="background:${_cpModoView==='calendario'?'var(--acc)':'var(--sur)'};color:${_cpModoView==='calendario'?'#000':'var(--txt)'};padding:6px 14px" onclick="toggleModoViewCP('calendario')">📅 Calendário</button>
    </div>
    ${_cpModoView==='calendario' ? htmlCalendarioContasPagar() : `
    <div class="row" style="margin-bottom:12px">
      ${filtros.map(f=>`<button type="button" class="tab${_filtroCPStatus===f.id?' ativo':''}" style="background:${_filtroCPStatus===f.id?'var(--acc)':'var(--sur)'};color:${_filtroCPStatus===f.id?'#000':'var(--txt)'};padding:6px 14px" onclick="filtrarCP('${f.id}')">${f.label}</button>`).join('')}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--mut)">Total no filtro atual</div>
      <div style="font-size:20px;font-weight:800;color:var(--acc)">R$ ${fmt(totalFiltro)}</div>
    </div>
    <div class="card">
      <table><thead><tr><th>Vencimento</th><th>Favorecido</th><th>Categoria</th><th>C. Custo</th><th>Conta Direcionada</th><th style="text-align:right">Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>`}
  `;
}

// ══════════════════════════════════════════
// RENDER — CONTAS A RECEBER (espelho de Contas a Pagar)
// ══════════════════════════════════════════
let _filtroCRStatus = 'pendente';
function filtrarCR(st){ _filtroCRStatus = st; renderAba(); }
function htmlContasReceber(){
  let lista = (DB.contasReceber||[]).slice();
  lista = lista.filter(cr=>contaTipoOk(cr.contaId));
  if(_filtroCRStatus==='pendente') lista = lista.filter(cr=>cr.status==='pendente');
  else if(_filtroCRStatus==='recebido') lista = lista.filter(cr=>cr.status==='recebido');
  else if(_filtroCRStatus==='vencido') lista = lista.filter(cr=>cr.status==='pendente'&&diffDias(cr.vencimento)<0);
  lista.sort((a,b)=>a.vencimento.localeCompare(b.vencimento));

  const totalFiltro = lista.reduce((s,cr)=>s+(cr.status==='recebido'?cr.valorRecebido:cr.valor),0);

  const linhas = lista.map(cr=>{
    const cat = categoriaById(cr.categoriaId);
    const cc = centroCustoById(cr.centroCustoId);
    const cta = contaById(cr.contaId);
    const sv = statusVisualContaReceber(cr);
    return `<tr>
      <td>${fmtD(cr.vencimento)}</td>
      <td>${esc(cr.cliente)}</td>
      <td>${esc(cat?nomeCompletoCategoria(cat):'-')}</td>
      <td>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td>
      <td>${esc(cta?cta.titular:'A definir')}</td>
      <td style="text-align:right;font-weight:700">R$ ${fmt(cr.status==='recebido'?cr.valorRecebido:cr.valor)}</td>
      <td>${T(sv.label,sv.tag)}</td>
      <td>
        ${cr.status==='pendente'?BPerm('pagar','💰 Receber','abrirRecebimento(\''+cr.id+'\')','var(--grn)','#fff',1):''}
        ${B('✏','editarContaReceber(\''+cr.id+'\')','var(--sur)','var(--txt)',1)}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mut)">Nenhuma conta encontrada neste filtro</td></tr>';

  const filtrosCR = [
    {id:'pendente',label:'Pendentes'},
    {id:'vencido',label:'Vencidas'},
    {id:'recebido',label:'Recebidas'},
    {id:'todos',label:'Todas'},
  ];

  return `
    <div class="titulo acc">📥 Contas a Receber</div>
    ${barraFiltroPFPJGlobal()}
    <div class="row" style="margin-bottom:12px">
      ${BPerm('lancamentos','➕ Nova Conta a Receber','novaContaReceber()','var(--acc)')}
      ${filtrosCR.map(f=>`<button type="button" class="tab${_filtroCRStatus===f.id?' ativo':''}" style="background:${_filtroCRStatus===f.id?'var(--acc)':'var(--sur)'};color:${_filtroCRStatus===f.id?'#000':'var(--txt)'};padding:6px 14px" onclick="filtrarCR('${f.id}')">${f.label}</button>`).join('')}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--mut)">Total no filtro atual</div>
      <div style="font-size:20px;font-weight:800;color:var(--acc)">R$ ${fmt(totalFiltro)}</div>
    </div>
    <div class="card">
      <table><thead><tr><th>Vencimento</th><th>Cliente</th><th>Categoria</th><th>C. Custo</th><th>Conta Direcionada</th><th style="text-align:right">Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER — CHEQUES EMITIDOS
// ══════════════════════════════════════════
let _filtroChqStatus = 'emitido';
function filtrarChq(st){ _filtroChqStatus = st; renderAba(); }
function htmlChequesEmitidos(){
  let lista = (DB.chequesEmitidos||[]).slice();
  lista = lista.filter(c=>contaTipoOk(c.contaId));
  if(_filtroChqStatus!=='todos') lista = lista.filter(c=>c.status===_filtroChqStatus);
  lista.sort((a,b)=>a.dataPrevista.localeCompare(b.dataPrevista));

  const totalFiltro = lista.reduce((s,c)=>s+Number(c.valor||0),0);
  const totalPendenteGeral = chequesEmitidosPendentes().reduce((s,c)=>s+Number(c.valor||0),0);

  const linhas = lista.map(c=>{
    const cta = contaById(c.contaId);
    const cat = categoriaById(c.categoriaId);
    const sv = statusVisualCheque(c);
    return `<tr>
      <td>${esc(c.numero||'-')}</td>
      <td>${esc(cta?cta.titular:'-')}</td>
      <td>${esc(c.favorecido)}</td>
      <td>${esc(cat?nomeCompletoCategoria(cat):'-')}</td>
      <td>${fmtD(c.dataEmissao)}</td>
      <td>${fmtD(c.dataPrevista)}</td>
      <td style="text-align:right;font-weight:700">R$ ${fmt(c.valor)}</td>
      <td>${T(sv.label,sv.tag)}</td>
      <td>
        ${c.status==='emitido'?BPerm('pagar','✅ Compensar','abrirCompensacaoCheque(\''+c.id+'\')','var(--grn)','#fff',1):''}
        ${B('✏','editarChequeEmitido(\''+c.id+'\')','var(--sur)','var(--txt)',1)}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--mut)">Nenhum cheque encontrado neste filtro</td></tr>';

  const filtros = [
    {id:'emitido',label:'Emitidos (aguardando)'},
    {id:'compensado',label:'Compensados'},
    {id:'devolvido',label:'Devolvidos'},
    {id:'cancelado',label:'Cancelados'},
    {id:'todos',label:'Todos'},
  ];

  return `
    <div class="titulo acc">✍️ Cheques Emitidos</div>
    <div style="font-size:11px;color:var(--mut);margin:-6px 0 12px">Cheques emitidos pela própria Telasul/Construsul para pagar terceiros — diferente do ChequeSys, que controla o desconto de cheques recebidos de clientes.</div>
    <div class="row" style="margin-bottom:12px">
      ${BPerm('lancamentos','➕ Novo Cheque Emitido','novoChequeEmitido()','var(--acc)')}
      ${filtros.map(f=>`<button type="button" class="tab${_filtroChqStatus===f.id?' ativo':''}" style="background:${_filtroChqStatus===f.id?'var(--acc)':'var(--sur)'};color:${_filtroChqStatus===f.id?'#000':'var(--txt)'};padding:6px 14px" onclick="filtrarChq('${f.id}')">${f.label}</button>`).join('')}
    </div>
    <div class="kpis">
      <div class="card kpi"><div class="kpi-l">Total no filtro</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(totalFiltro)}</div></div>
      <div class="card kpi"><div class="kpi-l">Compromisso futuro (não compensados)</div><div class="kpi-v" style="color:#f0a500">R$ ${fmt(totalPendenteGeral)}</div><div class="kpi-s">Ainda não descontado do saldo em conta</div></div>
    </div>
    <div class="card">
      <table><thead><tr><th>Nº</th><th>Conta Emissora</th><th>Favorecido</th><th>Categoria</th><th>Emissão</th><th>Previsão</th><th style="text-align:right">Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER — INVESTIMENTOS & SEGUROS (Sessão 3)
// ══════════════════════════════════════════
let _abaInvest = 'investimentos';
function irParaInvest(sub){ _abaInvest=sub; renderAba(); }
function htmlInvestimentosSeguros(){
  const sub = _abaInvest;
  const subAbas = [
    {id:'investimentos', r:'Investimentos'},
    {id:'previdencia', r:'Previdência'},
    {id:'capitalizacao', r:'Capitalização'},
    {id:'seguros', r:'Seguros'},
  ];
  const tabsHtml = `<div class="row" style="margin-bottom:14px">${subAbas.map(a=>
    `<button type="button" class="tab${sub===a.id?' ativo':''}" style="background:${sub===a.id?'var(--acc)':'var(--sur)'};color:${sub===a.id?'#000':'var(--txt)'};padding:6px 14px" onclick="irParaInvest('${a.id}')">${a.r}</button>`
  ).join('')}</div>`;

  let corpo = '';
  if(sub==='investimentos'){
    const lista = (DB.investimentos||[]).slice().sort((a,b)=>b.dataAplicacao.localeCompare(a.dataAplicacao));
    const totalAtivo = lista.filter(i=>i.status==='ativo').reduce((s,i)=>s+Number(i.valorAtual||0),0);
    const totalGanho = lista.reduce((s,i)=>s+ganhoInvestimento(i),0);
    const linhas = lista.map(i=>{
      const cta = contaById(i.contaId);
      const ganho = ganhoInvestimento(i);
      return `<tr>
        <td>${esc(i.instituicao)}</td><td>${esc(i.tipo)}</td><td>${esc(cta?cta.titular:'-')}</td>
        <td style="text-align:right">R$ ${fmt(i.valorAplicado)}</td>
        <td style="text-align:right;font-weight:700">R$ ${fmt(i.valorAtual)}</td>
        <td style="text-align:right;color:${ganho>=0?'#3fb950':'#f85149'}">R$ ${fmt(ganho)}</td>
        <td>${T(i.status==='ativo'?'Ativo':'Encerrado',i.status==='ativo'?'vd':'cz')}</td>
        <td>${B('✏','editarInvestimento(\''+i.id+'\')','var(--sur)','var(--txt)',1)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mut)">Nenhum investimento cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Investimento','novoInvestimento()','var(--acc)')}</div>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-l">Posição Total Ativa</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(totalAtivo)}</div></div>
        <div class="card kpi"><div class="kpi-l">Ganho Acumulado</div><div class="kpi-v" style="color:${totalGanho>=0?'#3fb950':'#f85149'}">R$ ${fmt(totalGanho)}</div></div>
      </div>
      <div class="card"><table><thead><tr><th>Instituição</th><th>Tipo</th><th>Conta</th><th style="text-align:right">Aplicado</th><th style="text-align:right">Posição Atual</th><th style="text-align:right">Ganho</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='previdencia'){
    const lista = (DB.previdencias||[]).slice().sort((a,b)=>b.dataInicio.localeCompare(a.dataInicio));
    const totalAtivo = lista.filter(p=>p.status==='ativo').reduce((s,p)=>s+Number(p.valorAtual||0),0);
    const linhas = lista.map(p=>{
      const cta = contaById(p.contaId);
      return `<tr>
        <td>${esc(p.instituicao)}</td><td>${esc(p.tipo)}</td><td>${esc(cta?cta.titular:'-')}</td>
        <td style="text-align:right">R$ ${fmt(p.valorAplicado)}</td>
        <td style="text-align:right;font-weight:700">R$ ${fmt(p.valorAtual)}</td>
        <td>${esc(p.beneficiario||'-')}</td>
        <td>${T(p.status==='ativo'?'Ativo':'Encerrado',p.status==='ativo'?'vd':'cz')}</td>
        <td>${B('✏','editarPrevidencia(\''+p.id+'\')','var(--sur)','var(--txt)',1)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--mut)">Nenhuma previdência cadastrada</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Nova Previdência','novaPrevidencia()','var(--acc)')}</div>
      <div class="kpis"><div class="card kpi"><div class="kpi-l">Posição Total Ativa</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(totalAtivo)}</div></div></div>
      <div class="card"><table><thead><tr><th>Instituição</th><th>Tipo</th><th>Conta</th><th style="text-align:right">Aportado</th><th style="text-align:right">Posição Atual</th><th>Beneficiário</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='capitalizacao'){
    const lista = (DB.capitalizacoes||[]).slice().sort((a,b)=>b.dataInicio.localeCompare(a.dataInicio));
    const linhas = lista.map(c=>{
      const cta = contaById(c.contaId);
      return `<tr>
        <td>${esc(c.instituicao)}</td><td>${esc(c.numero||'-')}</td><td>${esc(cta?cta.titular:'-')}</td>
        <td style="text-align:right">R$ ${fmt(c.valorParcela)}</td>
        <td style="text-align:center">${c.parcelasPagas}/${c.totalParcelas}</td>
        <td>${T(c.status==='ativo'?'Ativo':c.status==='quitado'?'Quitado':'Encerrado',c.status==='ativo'?'az':c.status==='quitado'?'vd':'cz')}</td>
        <td>${B('✏','editarCapitalizacao(\''+c.id+'\')','var(--sur)','var(--txt)',1)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--mut)">Nenhum título de capitalização cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Título','novaCapitalizacao()','var(--acc)')}</div>
      <div class="card"><table><thead><tr><th>Instituição</th><th>Número</th><th>Conta</th><th style="text-align:right">Parcela</th><th>Parcelas</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='seguros'){
    const lista = (DB.seguros||[]).slice().sort((a,b)=>a.vigenciaFim.localeCompare(b.vigenciaFim));
    const linhas = lista.map(s=>{
      const sv = statusVisualSeguro(s);
      return `<tr>
        <td>${esc(s.seguradora)}</td><td>${esc(s.tipo)}</td><td>${esc(s.apolice||'-')}</td>
        <td style="text-align:right">R$ ${fmt(s.valorPremio)}</td>
        <td>${fmtD(s.vigenciaInicio)} – ${fmtD(s.vigenciaFim)}</td>
        <td>${T(sv.label,sv.tag)}</td>
        <td>${B('✏','editarSeguro(\''+s.id+'\')','var(--sur)','var(--txt)',1)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--mut)">Nenhum seguro cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Seguro','novoSeguro()','var(--acc)')}</div>
      <div class="card"><table><thead><tr><th>Seguradora</th><th>Tipo</th><th>Apólice</th><th style="text-align:right">Prêmio</th><th>Vigência</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  return `<div class="titulo acc">📈 Investimentos & Seguros</div>${tabsHtml}${corpo}`;
}

// ══════════════════════════════════════════
// RENDER — RELATÓRIOS
// ══════════════════════════════════════════
let _extratoModoEdicao = false;
let _extratoIdsEditaveis = [];
function alternarEdicaoExtrato(){ _extratoModoEdicao = !_extratoModoEdicao; renderAba(); }
function cancelarEdicaoExtrato(){ _extratoModoEdicao = false; renderAba(); }
function salvarEdicaoEmMassaExtrato(){
  const patches = {};
  let alterados = 0;
  _extratoIdsEditaveis.forEach(id=>{
    const dataEl = document.getElementById('edtx-data-'+id);
    if(!dataEl) return; // linha protegida, sem inputs
    const valor = parseValor(document.getElementById('edtx-valor-'+id).value);
    patches[id] = {
      data: dataEl.value,
      contraparte: document.getElementById('edtx-forn-'+id).value.trim(),
      descricao: document.getElementById('edtx-desc-'+id).value.trim(),
      categoriaId: valorFinalCascata('edtx'+id,'categoria'),
      centroCustoId: valorFinalCascata('edtx'+id,'cc'),
      direcionamento: document.getElementById('edtx-direc-'+id).value.trim(),
      tipo: document.getElementById('edtx-tipo-'+id).value,
      valor: valor||0,
    };
    alterados++;
  });
  if(!alterados){ _extratoModoEdicao=false; renderAba(); return; }
  const novosLancamentos = (DB.lancamentos||[]).map(l=>patches[l.id] ? {...l, ...patches[l.id]} : l);
  _extratoModoEdicao = false;
  salvar({...DB, lancamentos: novosLancamentos});
  setStatus('ok', `✅ ${alterados} lançamento(s) atualizado(s)`);
  setTimeout(()=>{document.getElementById('status').style.display='none';},4000);
}
// PADRÃO: últimos 90 dias, mesmo critério usado em Lançamentos e Relatório
// Flexível — contas antigas/movimentadas podem ter milhares de lançamentos.
let RelExtrato = { contaId:'', de:(()=>{ const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10); })(), ate:'', fornecedor:'', categoriaId:'', centroCustoId:'', direcionamento:'' };

// CACHE DE RELATÓRIOS (23/07/2026, a pedido do Fabio): guarda o resultado
// das seções não-interativas de Relatórios. _relCacheVersion é incrementado
// toda vez que os dados são substituídos (salvar/sincronizar) — só então o
// cache é invalidado de verdade; trocar de aba ou de filtro interativo
// (conta no extrato, etc.) não mexe nele.
let _relCacheVersion = 0;
let _relCacheRelatorios = null;

// PERÍODO GERAL DA TELA DE RELATÓRIOS (23/07/2026, a pedido do Fabio): os
// quadros de fluxo (por categoria, centro de custo, fornecedor, top
// lançamentos, transferências internas) somavam o histórico completo — com
// ~24 mil lançamentos isso pesava bastante. Agora tem um período padrão de
// 90 dias, VISÍVEL na tela (não é um corte escondido), com opção de trocar
// pra "Todos" quando quiser o histórico completo de verdade. O saldo das
// contas continua sempre sendo o histórico completo (isso nunca muda, tem
// que estar sempre certo).
let _filtroRelDe = (()=>{ const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10); })();
let _filtroRelAte = '';
function aplicarFiltroPeriodoRel(){
  _filtroRelDe = document.getElementById('rel-periodo-de')?.value||'';
  _filtroRelAte = document.getElementById('rel-periodo-ate')?.value||'';
  renderAba();
}
function limparFiltroPeriodoRel(){
  _filtroRelDe=''; _filtroRelAte='';
  renderAba();
}
function htmlFiltroPeriodoRel(){
  const rotulo = _filtroRelDe||_filtroRelAte ? `Período: ${_filtroRelDe?fmtD(_filtroRelDe):'início'} até ${_filtroRelAte?fmtD(_filtroRelAte):'hoje'}` : 'Mostrando: TODO O HISTÓRICO (pode demorar mais pra carregar)';
  return `<div class="card" style="margin-bottom:14px;padding:10px 14px">
    <div class="row" style="align-items:flex-end;gap:8px">
      ${C('De',`<input type="date" id="rel-periodo-de" value="${_filtroRelDe}" onchange="aplicarFiltroPeriodoRel()">`,'1','140')}
      ${C('Até',`<input type="date" id="rel-periodo-ate" value="${_filtroRelAte}" onchange="aplicarFiltroPeriodoRel()">`,'1','140')}
      <div class="campo" style="flex:0;min-width:auto"><button type="button" onclick="limparFiltroPeriodoRel()" style="background:var(--sur);color:var(--txt);border:1px solid var(--bor);border-radius:6px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Ver Tudo</button></div>
      <div style="flex:1;font-size:11px;color:${_filtroRelDe||_filtroRelAte?'var(--mut)':'var(--acc)'};font-weight:700">${rotulo}</div>
    </div>
    <div style="font-size:10px;color:var(--mut);margin-top:4px">Este período afeta os quadros de fluxo abaixo (por categoria, fornecedor, top lançamentos etc). Saldo das contas sempre reflete o histórico completo.</div>
  </div>`;
}
function aplicarFiltroRelExtrato(){
  RelExtrato.contaId = document.getElementById('re-conta')?.value||'';
  RelExtrato.de = document.getElementById('re-de')?.value||'';
  RelExtrato.ate = document.getElementById('re-ate')?.value||'';
  RelExtrato.fornecedor = document.getElementById('re-forn')?.value||'';
  RelExtrato.categoriaId = valorFinalCascata('re','categoria');
  RelExtrato.centroCustoId = valorFinalCascata('re','cc');
  RelExtrato.direcionamento = document.getElementById('re-direc')?.value||'';
  renderAba();
}
function limparFiltroRelExtrato(){
  RelExtrato = {contaId:'',de:'',ate:'',fornecedor:'',categoriaId:'',centroCustoId:'',direcionamento:''};
  renderAba();
}
// Ao tocar numa célula de Categoria/Centro de Custo/Direcionamento/Fornecedor no extrato — refiltra pelo item,
// mantendo a conta e o período que já estavam selecionados.
function filtrarExtratoPorCategoria(catId){ empilharHistorico(); RelExtrato.categoriaId = catId; RelExtrato.fornecedor=''; RelExtrato.centroCustoId=''; RelExtrato.direcionamento=''; renderAba(); }
function filtrarExtratoPorCentroCusto(ccId){ empilharHistorico(); RelExtrato.centroCustoId = ccId; RelExtrato.fornecedor=''; RelExtrato.categoriaId=''; RelExtrato.direcionamento=''; renderAba(); }
function filtrarExtratoPorDirecionamento(valor){ empilharHistorico(); RelExtrato.direcionamento = valor; RelExtrato.fornecedor=''; RelExtrato.categoriaId=''; RelExtrato.centroCustoId=''; renderAba(); }
function filtrarExtratoPorFornecedor(nome){ empilharHistorico(); RelExtrato.fornecedor = nome; RelExtrato.categoriaId=''; RelExtrato.centroCustoId=''; RelExtrato.direcionamento=''; renderAba(); }

let RelPagarF = { de:'', ate:'', centroCustoId:'', texto:'' };
function aplicarFiltroRelPagar(){
  RelPagarF.de = document.getElementById('rp-de')?.value||'';
  RelPagarF.ate = document.getElementById('rp-ate')?.value||'';
  RelPagarF.centroCustoId = valorFinalCascata('rp','cc');
  RelPagarF.texto = document.getElementById('rp-txt')?.value||'';
  renderAba();
}
function limparFiltroRelPagar(){ RelPagarF = {de:'',ate:'',centroCustoId:'',texto:''}; renderAba(); }

let RelReceberF = { de:'', ate:'', centroCustoId:'', texto:'' };
function aplicarFiltroRelReceber(){
  RelReceberF.de = document.getElementById('rr-de')?.value||'';
  RelReceberF.ate = document.getElementById('rr-ate')?.value||'';
  RelReceberF.centroCustoId = valorFinalCascata('rr','cc');
  RelReceberF.texto = document.getElementById('rr-txt')?.value||'';
  renderAba();
}
function limparFiltroRelReceber(){ RelReceberF = {de:'',ate:'',centroCustoId:'',texto:''}; renderAba(); }

let RLT = { cat: null, tipo: null };
// ── Impressão de relatórios: gera uma janela separada, com layout claro/legível
// (fundo branco, tabela com bordas), em vez de imprimir a tela escura do app. ──
function imprimirRelatorio(titulo, subtitulo, corpoHtml, orientacao){
  orientacao = orientacao || 'landscape';
  const win = window.open('', 'tsr_impressao');
  if(!win){ alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.'); return; }
  const agora = new Date().toLocaleString('pt-BR');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:16px;font-size:11px;margin:0}
      h1{font-size:17px;margin:0 0 2px;color:#0b3d24}
      .sub{color:#555;font-size:10px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:auto}
      th,td{border:1px solid #ccc;padding:3px 6px;text-align:left;font-size:9.5px;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
      th{background:#eef1f0;font-weight:700}
      tr.trow td{background:#eaf3ff;font-weight:700;white-space:normal}
      .kpi-print{display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap}
      .kpi-print div{border:1px solid #ccc;border-radius:6px;padding:8px 14px}
      .kpi-print b{display:block;font-size:14px}
      .footer{margin-top:24px;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:8px}
      @media print{ @page{size:${orientacao};margin:10mm} a{color:inherit;text-decoration:none} }
    </style>
  </head><body>
    <h1>${esc(titulo)}</h1>
    <div class="sub">${esc(subtitulo)}<br>Impresso em ${agora} — TesourariaSys</div>
    ${corpoHtml}
    <div class="footer">Fabio Oliveira Santos — Telasul / Construsul — documento gerado automaticamente, sujeito a conferência.</div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>{ try{ win.print(); }catch(e){} }, 350);
}
let _impPagarTotal = 0, _impPagarLinhas = '';
let _impReceberTotal = 0, _impReceberLinhas = '';
function imprimirPagarPeriodo(){
  const partes = [];
  if(RelPagarF.de||RelPagarF.ate) partes.push('Período: '+(RelPagarF.de?fmtD(RelPagarF.de):'início')+' até '+(RelPagarF.ate?fmtD(RelPagarF.ate):'hoje'));
  if(RelPagarF.centroCustoId){ const cc=centroCustoById(RelPagarF.centroCustoId); if(cc) partes.push('Centro de Custo: '+nomeCompletoCentroCusto(cc)); }
  if(RelPagarF.texto) partes.push('Fornecedor: '+RelPagarF.texto);
  const kpis = `<div class="kpi-print"><div>Total Pago no Filtro<b style="color:#b3261e">R$ ${fmt(_impPagarTotal)}</b></div></div>`;
  imprimirRelatorio('Contas a Pagar — Pagamentos por Período', partes.join(' · ')||'Todos os pagamentos', kpis+`<table><thead><tr><th>Data Pagamento</th><th>Favorecido</th><th>C. Custo</th><th>Conta</th><th style="text-align:right">Valor Pago</th></tr></thead><tbody>${_impPagarLinhas}</tbody></table>`);
}
function imprimirReceberPeriodo(){
  const partes = [];
  if(RelReceberF.de||RelReceberF.ate) partes.push('Período: '+(RelReceberF.de?fmtD(RelReceberF.de):'início')+' até '+(RelReceberF.ate?fmtD(RelReceberF.ate):'hoje'));
  if(RelReceberF.centroCustoId){ const cc=centroCustoById(RelReceberF.centroCustoId); if(cc) partes.push('Centro de Custo: '+nomeCompletoCentroCusto(cc)); }
  if(RelReceberF.texto) partes.push('Cliente: '+RelReceberF.texto);
  const kpis = `<div class="kpi-print"><div>Total Recebido no Filtro<b style="color:#0a7d33">R$ ${fmt(_impReceberTotal)}</b></div></div>`;
  imprimirRelatorio('Contas a Receber — Recebimentos por Período', partes.join(' · ')||'Todos os recebimentos', kpis+`<table><thead><tr><th>Data Recebimento</th><th>Cliente</th><th>C. Custo</th><th>Conta</th><th style="text-align:right">Valor Recebido</th></tr></thead><tbody>${_impReceberLinhas}</tbody></table>`);
}
let _impExtratoEnt = 0, _impExtratoSai = 0, _impExtratoCabecalho = '', _impExtratoLinhas = '';
let _impExtratoRows = [], _impExtratoMostraConta = false;
let PrefsImpressaoExtrato = { conta:true, fornecedor:true, descricao:true, categoria:true, centroCusto:true, direcionamento:true, orientacao:'landscape' };
function abrirOpcoesImpressaoExtrato(){
  const p = PrefsImpressaoExtrato;
  const chk = (chave,rotulo) => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px"><input type="checkbox" id="opimp-${chave}" ${p[chave]?'checked':''}> ${rotulo}</label>`;
  AM('🖨 Opções de Impressão', `
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Marque as colunas que quer no relatório. Se não marcar nenhuma, sai completo.</div>
    ${_impExtratoMostraConta?chk('conta','Conta'):''}
    ${chk('fornecedor','Fornecedor/Cliente')}
    ${chk('descricao','Descrição')}
    ${chk('categoria','Categoria')}
    ${chk('centroCusto','Centro de Custo')}
    ${chk('direcionamento','Direcionamento')}
    <div style="margin-top:14px">
      <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Orientação da página</label>
      <div style="display:flex;gap:14px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="radio" name="opimp-orient" value="landscape" ${p.orientacao==='landscape'?'checked':''}> Paisagem</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="radio" name="opimp-orient" value="portrait" ${p.orientacao==='portrait'?'checked':''}> Retrato</label>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      ${B('🖨 Imprimir','confirmarImpressaoExtrato()','var(--acc)','#000')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function confirmarImpressaoExtrato(){
  ['conta','fornecedor','descricao','categoria','centroCusto','direcionamento'].forEach(chave=>{
    const el = document.getElementById('opimp-'+chave);
    if(el) PrefsImpressaoExtrato[chave] = el.checked;
  });
  const orientEl = document.querySelector('input[name="opimp-orient"]:checked');
  if(orientEl) PrefsImpressaoExtrato.orientacao = orientEl.value;
  FM();
  imprimirExtrato();
}
function imprimirExtrato(){
  const contaExt = RelExtrato.contaId ? contaById(RelExtrato.contaId) : null;
  const partes = [];
  if(contaExt) partes.push('Conta: '+contaExt.titular);
  if(RelExtrato.de||RelExtrato.ate) partes.push('Período: '+(RelExtrato.de?fmtD(RelExtrato.de):'início')+' até '+(RelExtrato.ate?fmtD(RelExtrato.ate):'hoje'));
  if(RelExtrato.fornecedor) partes.push('Fornecedor/Cliente: '+RelExtrato.fornecedor);
  if(RelExtrato.categoriaId){ const c=categoriaById(RelExtrato.categoriaId); if(c) partes.push('Categoria: '+c.nome); }
  if(RelExtrato.centroCustoId){ const cc=centroCustoById(RelExtrato.centroCustoId); if(cc) partes.push('Centro de Custo: '+cc.nome); }
  if(RelExtrato.direcionamento) partes.push('Direcionamento: '+RelExtrato.direcionamento);
  const subtitulo = partes.length ? partes.join(' · ') : 'Todas as contas, sem filtro de período';
  const kpis = `<div class="kpi-print">
    <div>Entradas<b style="color:#0a7d33">R$ ${fmt(_impExtratoEnt)}</b></div>
    <div>Saídas<b style="color:#b3261e">R$ ${fmt(_impExtratoSai)}</b></div>
    <div>Resultado<b>R$ ${fmt(_impExtratoEnt-_impExtratoSai)}</b></div>
  </div>`;
  // Se nenhuma coluna opcional estiver marcada, sai completo (todas)
  const p = PrefsImpressaoExtrato;
  const nenhumaMarcada = !p.conta && !p.fornecedor && !p.descricao && !p.categoria && !p.centroCusto && !p.direcionamento;
  const mostraConta = _impExtratoMostraConta && (nenhumaMarcada || p.conta);
  const mostraForn = nenhumaMarcada || p.fornecedor;
  const mostraDesc = nenhumaMarcada || p.descricao;
  const mostraCat = nenhumaMarcada || p.categoria;
  const mostraCC = nenhumaMarcada || p.centroCusto;
  const mostraDirec = nenhumaMarcada || p.direcionamento;
  const cab = `<tr><th>Data</th>${mostraConta?'<th>Conta</th>':''}${mostraForn?'<th>Fornecedor/Cliente</th>':''}${mostraDesc?'<th>Descrição</th>':''}${mostraCat?'<th>Categoria</th>':''}${mostraCC?'<th>Centro de Custo</th>':''}${mostraDirec?'<th>Direcionamento</th>':''}<th style="text-align:right">Entrada</th><th style="text-align:right">Saída</th></tr>`;
  const nColsImp = 3 + mostraConta + mostraForn + mostraDesc + mostraCat + mostraCC + mostraDirec;
  const linhas = _impExtratoRows.map(r=>{
    if(r.tipo==='saldo'){
      return `<tr class="trow"><td colspan="${nColsImp-1}">${esc(r.label)}</td><td style="text-align:right">R$ ${fmt(r.valor)}</td></tr>`;
    }
    return `<tr>
      <td>${fmtD(r.data)}</td>
      ${mostraConta?`<td>${esc(r.conta)}</td>`:''}
      ${mostraForn?`<td>${esc(r.contraparte)}</td>`:''}
      ${mostraDesc?`<td>${esc(r.descricao)}</td>`:''}
      ${mostraCat?`<td>${esc(r.categoria)}</td>`:''}
      ${mostraCC?`<td>${esc(r.centroCusto)}</td>`:''}
      ${mostraDirec?`<td>${esc(r.direcionamento)}</td>`:''}
      <td style="text-align:right">${r.valorEntrada?'R$ '+fmt(r.valorEntrada):''}</td>
      <td style="text-align:right">${r.valorSaida?'R$ '+fmt(r.valorSaida):''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="${nColsImp}" style="text-align:center">Nenhum lançamento com esses filtros</td></tr>`;
  imprimirRelatorio('Extrato de Conta', subtitulo, kpis+`<table><thead>${cab}</thead><tbody>${linhas}</tbody></table>`, PrefsImpressaoExtrato.orientacao);
}
function irRelCategoria(cat, tipo){
  RLT.cat=cat; RLT.tipo=tipo; renderAba();
  if(cat==='cartoes') atualizarResumoCartoes(true);
  if(cat==='chequesys') atualizarResumoChequeSys(true);
}
function irRelTipo(tipo){ RLT.tipo=tipo; renderAba(); }
function voltarRelCategorias(){ RLT.cat=null; RLT.tipo=null; renderAba(); }

function grafBarraH(items, cor){
  const max = Math.max(...items.map(i=>Math.abs(i.valor)), 1);
  return items.map(i=>{
    const pct = Math.min(100, Math.abs(i.valor)/max*100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span>${esc(i.label)}</span><span style="font-weight:700">R$ ${fmt(i.valor)}</span></div>
      <div style="background:var(--bg);border-radius:4px;height:11px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${cor};border-radius:4px"></div></div>
    </div>`;
  }).join('') || '<div style="text-align:center;color:var(--mut);font-size:12px">Sem dados ainda</div>';
}
function grafDuploMes(items){
  const max = Math.max(...items.map(i=>Math.max(i.entrada,i.saida)), 1);
  return items.map(i=>`
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px;text-transform:capitalize">${esc(i.label)}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="width:52px;font-size:10px;color:var(--mut)">Entrada</span><div style="flex:1;background:var(--bg);border-radius:4px;height:10px;overflow:hidden"><div style="width:${Math.min(100,i.entrada/max*100)}%;height:100%;background:#3fb950"></div></div><span style="width:90px;text-align:right;font-size:10px">R$ ${fmt(i.entrada)}</span></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="width:52px;font-size:10px;color:var(--mut)">Saída</span><div style="flex:1;background:var(--bg);border-radius:4px;height:10px;overflow:hidden"><div style="width:${Math.min(100,i.saida/max*100)}%;height:100%;background:#f85149"></div></div><span style="width:90px;text-align:right;font-size:10px">R$ ${fmt(i.saida)}</span></div>
    </div>`).join('') || '<div style="text-align:center;color:var(--mut);font-size:12px">Sem dados ainda</div>';
}

// ══════════════════════════════════════════
// 📋 FECHAMENTO DIÁRIO — resumo consolidado de todos os sistemas integrados
// (TesourariaSys + ChequeSys + CartoesPF + CartoesPJ), com observações
// automáticas (regras, não IA) e impressão formal em uma página só.
// ══════════════════════════════════════════
function addDiasStr(dataStr,dias){
  const d=new Date(dataStr+'T12:00:00'); d.setDate(d.getDate()+dias); return d.toISOString().slice(0,10);
}
let _fechamentoDados = null;
try{ const _fRaw = localStorage.getItem('tsr_fechamento_'+hoje()); if(_fRaw) _fechamentoDados = JSON.parse(_fRaw); }catch(e){}

async function gerarFechamentoDiario(){
  setStatus('saving','⏳ Buscando dados nos sistemas integrados...');
  const hj = hoje();
  const resultado = { data:hj, geradoEm:new Date().toISOString() };

  // ── TesourariaSys (já em memória, não precisa buscar) ──
  const movTeso = (DB.lancamentos||[]).filter(l=>l.data===hj);
  resultado.tesouraria = {
    entradas: movTeso.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor||0),0),
    saidas: movTeso.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor||0),0),
    lancamentos: movTeso,
    contasPagarHoje: contasPagarPendentes().filter(cp=>cp.vencimento===hj),
    contasPagarAmanha: contasPagarPendentes().filter(cp=>cp.vencimento===addDiasStr(hj,1)),
    contasReceberHoje: contasReceberPendentes().filter(cr=>cr.vencimento===hj),
  };

  // ── ChequeSys (busca fresca — precisa dos dados crus pra saber o que aconteceu HOJE) ──
  const tokenChq = getTokenChequeSys();
  if(tokenChq){
    try{
      const dadosChq = await buscarDadosChequeSys(tokenChq);
      const cheques = dadosChq.cheques||[], boletos = dadosChq.boletos||[];
      resultado.chequesys = {
        ok:true,
        depositadosHoje: cheques.filter(c=>c.dataDeposito===hj),
        compensadosHoje: cheques.filter(c=>c.dataCompensacao===hj),
        devolvidosHoje: cheques.filter(c=>c.dataDevolucao===hj),
        resgatadosHoje: cheques.filter(c=>c.dataResgate===hj),
        boletosEnviadosHoje: boletos.filter(b=>b.dataEnvio===hj),
        boletosDevolvidosHoje: boletos.filter(b=>b.dataDevolucao===hj),
        devolvidosAbertos: cheques.filter(c=>c.status==='devolvido').length + boletos.filter(b=>b.status==='devolvido').length,
        valorDevolvidosAbertos: cheques.filter(c=>c.status==='devolvido').reduce((s,c)=>s+Number(c.bruto||0),0) + boletos.filter(b=>b.status==='devolvido').reduce((s,b)=>s+Number(b.bruto||0),0),
        capitalTerceirosVencendo: (dadosChq.capitalTerceiros||[]).flatMap(ct=>(ct.parcelas||[]).filter(p=>!p.pago && p.vencimento && p.vencimento<=addDiasStr(hj,7)).map(p=>({...p,banco:ct.banco}))),
        saldoContas: resumoContasDeChequeSys(dadosChq).total,
      };
    }catch(e){ resultado.chequesys = {ok:false, erro:'Não foi possível conectar (verifique o token).'}; }
  } else resultado.chequesys = {ok:false, erro:'Token não configurado.'};

  // ── CartoesPF / CartoesPJ (busca fresca) ──
  async function resumoCartaoHoje(arquivo, token){
    if(!token) return {ok:false, erro:'Token não configurado.'};
    try{
      const dados = await buscarDadosCartao(arquivo, token);
      const comprasHoje = (dados.compras||[]).filter(c=>c.dataCompra===hj);
      return {
        ok:true,
        comprasHoje,
        totalComprasHoje: comprasHoje.reduce((s,c)=>s+Number(c.valorParcela||0),0),
        resumoFaturas: resumoFaturasDeDados(dados),
      };
    }catch(e){ return {ok:false, erro:'Não foi possível conectar (verifique o token).'}; }
  }
  resultado.cartoesPF = await resumoCartaoHoje('dados.json', getTokenCartoesPF());
  resultado.cartoesPJ = await resumoCartaoHoje('dados-pj.json', getTokenCartoesPJ());

  // ── Posição Líquida Consolidada (mesma fórmula usada em Relatórios) ──
  const cartoesPFAberto = resultado.cartoesPF?.resumoFaturas?.totalAberto||0;
  const cartoesPJAberto = resultado.cartoesPJ?.resumoFaturas?.totalAberto||0;
  const totalReceberPend = contasReceberPendentes().reduce((s,cr)=>s+cr.valor,0);
  const totalPagarPend = contasPagarPendentes().reduce((s,cp)=>s+cp.valor,0);
  const chqEmitPend = chequesEmitidosPendentes().reduce((s,c)=>s+Number(c.valor||0),0);
  resultado.posicao = {
    saldoTesouraria: saldoTotalGeral(),
    saldoChequeSys: resultado.chequesys?.saldoContas||0,
    patrimonioInvestido: totalPatrimonioInvestido(),
    receberPend: totalReceberPend,
    pagarPend: totalPagarPend,
    chequesEmitidosPend: chqEmitPend,
    cartoesPF: cartoesPFAberto,
    cartoesPJ: cartoesPJAberto,
  };
  resultado.posicao.liquida = resultado.posicao.saldoTesouraria + resultado.posicao.saldoChequeSys + resultado.posicao.patrimonioInvestido
    + resultado.posicao.receberPend - resultado.posicao.pagarPend - resultado.posicao.chequesEmitidosPend
    - resultado.posicao.cartoesPF - resultado.posicao.cartoesPJ;

  // ── Comparação com o fechamento salvo do dia útil anterior (se existir) ──
  let ontemStr = addDiasStr(hj,-1);
  let tentativas=0;
  while(tentativas<4){
    const dOntem = new Date(ontemStr+'T12:00:00');
    if(dOntem.getDay()!==0 && dOntem.getDay()!==6) break;
    ontemStr = addDiasStr(ontemStr,-1); tentativas++;
  }
  try{
    const anteriorRaw = localStorage.getItem('tsr_fechamento_'+ontemStr);
    resultado.posicaoAnterior = anteriorRaw ? JSON.parse(anteriorRaw).posicao?.liquida : null;
  }catch(e){ resultado.posicaoAnterior = null; }

  _fechamentoDados = resultado;
  try{ localStorage.setItem('tsr_fechamento_'+hj, JSON.stringify(resultado)); }catch(e){}
  setStatus('ok','✅ Fechamento de hoje gerado com sucesso');
  setTimeout(()=>{ const el=document.getElementById('status'); if(el) el.style.display='none'; },3000);
  renderAba();
}

// Gera a lista de observações automáticas (regras, sem IA) a partir dos dados já buscados
function observacoesFechamento(f){
  const obs = [];
  if(!f) return obs;
  const chq = f.chequesys, cpf = f.cartoesPF, cpj = f.cartoesPJ;

  if(chq?.ok){
    if(chq.devolvidosHoje.length>0){
      const v = chq.devolvidosHoje.reduce((s,c)=>s+Number(c.bruto||0),0);
      obs.push({tipo:'alerta', txt:`${chq.devolvidosHoje.length} cheque(s) devolvido(s) hoje, totalizando R$ ${fmt(v)}. Vale entrar em contato com os clientes envolvidos.`});
    }
    if(chq.boletosDevolvidosHoje.length>0){
      const v = chq.boletosDevolvidosHoje.reduce((s,b)=>s+Number(b.bruto||0),0);
      obs.push({tipo:'alerta', txt:`${chq.boletosDevolvidosHoje.length} boleto(s) devolvido(s) hoje, totalizando R$ ${fmt(v)}.`});
    }
    if(chq.devolvidosAbertos>0){
      obs.push({tipo:'info', txt:`Carteira acumula ${chq.devolvidosAbertos} título(s) devolvido(s) ainda em aberto, somando R$ ${fmt(chq.valorDevolvidosAbertos)}.`});
    }
    if(chq.capitalTerceirosVencendo.length>0){
      const v = chq.capitalTerceirosVencendo.reduce((s,p)=>s+Number(p.valor||0),0);
      obs.push({tipo:'alerta', txt:`${chq.capitalTerceirosVencendo.length} parcela(s) de Capital de Terceiros vence(m) nos próximos 7 dias, total de R$ ${fmt(v)}. Confira se há caixa disponível.`});
    }
  } else if(chq && !chq.ok){
    obs.push({tipo:'info', txt:`Não foi possível ler o ChequeSys agora (${chq.erro}). Os números deste sistema podem estar incompletos.`});
  }

  if(f.tesouraria.contasPagarHoje.length>0){
    const v=f.tesouraria.contasPagarHoje.reduce((s,c)=>s+Number(c.valor||0),0);
    obs.push({tipo:'alerta', txt:`${f.tesouraria.contasPagarHoje.length} conta(s) a pagar vence(m) hoje, total de R$ ${fmt(v)}.`});
  }
  if(f.tesouraria.contasPagarAmanha.length>0){
    const v=f.tesouraria.contasPagarAmanha.reduce((s,c)=>s+Number(c.valor||0),0);
    obs.push({tipo:'info', txt:`${f.tesouraria.contasPagarAmanha.length} conta(s) a pagar vence(m) amanhã, total de R$ ${fmt(v)}.`});
  }

  (DB.contas||[]).filter(c=>c.ativa!==false).forEach(c=>{
    const s = saldoConta(c.id);
    if(s<0) obs.push({tipo:'alerta', txt:`Conta "${c.titular||c.nome}" está com saldo negativo: R$ ${fmt(s)}.`});
  });

  if(cpf?.ok && cpf.resumoFaturas?.proximaVenc){
    const dias = Math.round((new Date(cpf.resumoFaturas.proximaVenc+'T12:00:00')-new Date(hoje()+'T12:00:00'))/86400000);
    if(dias>=0 && dias<=3) obs.push({tipo:'info', txt:`Fatura de cartão PF vence em ${dias===0?'hoje':dias+' dia(s)'}, valor R$ ${fmt(cpf.resumoFaturas.proximoValor)}.`});
  }
  if(cpj?.ok && cpj.resumoFaturas?.proximaVenc){
    const dias = Math.round((new Date(cpj.resumoFaturas.proximaVenc+'T12:00:00')-new Date(hoje()+'T12:00:00'))/86400000);
    if(dias>=0 && dias<=3) obs.push({tipo:'info', txt:`Fatura de cartão PJ vence em ${dias===0?'hoje':dias+' dia(s)'}, valor R$ ${fmt(cpj.resumoFaturas.proximoValor)}.`});
  }

  if(f.posicaoAnterior!==null && f.posicaoAnterior!==undefined){
    const diff = f.posicao.liquida - f.posicaoAnterior;
    const pct = f.posicaoAnterior!==0 ? (diff/Math.abs(f.posicaoAnterior)*100) : 0;
    if(Math.abs(diff)>=1){
      obs.push({tipo: diff>=0?'positivo':'alerta', txt:`Posição Líquida ${diff>=0?'subiu':'caiu'} R$ ${fmt(Math.abs(diff))} (${pct>=0?'+':''}${pct.toFixed(1)}%) desde o último fechamento registrado.`});
    }
  }

  if(!obs.length) obs.push({tipo:'positivo', txt:'Nenhum ponto de atenção identificado hoje. Operação dentro da normalidade.'});
  return obs;
}

function htmlFechamentoDiario(){
  const f = _fechamentoDados;
  const hj = hoje();
  const desatualizado = f && f.data!==hj;
  if(!f){
    return `<div class="titulo acc">📋 Fechamento Diário</div>
    <div class="card" style="text-align:center;padding:40px 20px">
      <div style="font-size:14px;color:var(--mut);margin-bottom:16px">Nenhum fechamento gerado ainda hoje. Clique no botão abaixo para buscar os dados atualizados em todos os sistemas integrados (ChequeSys, CartoesPF, CartoesPJ) e montar o resumo do dia.</div>
      ${B('🔄 Gerar Fechamento de Hoje','gerarFechamentoDiario()','var(--acc)')}
    </div>`;
  }
  const obs = observacoesFechamento(f);
  const corObs = {alerta:'var(--red)', info:'var(--acc)', positivo:'#3fb950'};
  const iconObs = {alerta:'⚠', info:'ℹ', positivo:'✅'};
  return `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
    <div class="titulo acc" style="margin-bottom:0">📋 Fechamento Diário — ${fmtD(f.data)}</div>
    <div style="display:flex;gap:8px">
      ${desatualizado?`<span style="font-size:11px;color:var(--mut);align-self:center">Gerado em ${fmtD(f.data)}, não é de hoje</span>`:''}
      ${B('🔄 Atualizar','gerarFechamentoDiario()','var(--sur)','var(--txt)')}
      ${B('🖨 Imprimir (1 página)','imprimirFechamentoDiario()','var(--acc)')}
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div style="font-weight:700;margin-bottom:10px">🧭 Posição Consolidada</div>
    <table><tbody>
      <tr><td>Saldo em Contas (TesourariaSys)</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(f.posicao.saldoTesouraria)}</td></tr>
      <tr><td>Saldo em Contas (ChequeSys)${!f.chequesys?.ok?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(f.posicao.saldoChequeSys)}</td></tr>
      <tr><td>Patrimônio Investido</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(f.posicao.patrimonioInvestido)}</td></tr>
      <tr><td>Contas a Receber Pendentes</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(f.posicao.receberPend)}</td></tr>
      <tr><td>Contas a Pagar Pendentes</td><td style="text-align:right;color:var(--red)">− R$ ${fmt(f.posicao.pagarPend)}</td></tr>
      <tr><td>Cheques Emitidos Aguardando</td><td style="text-align:right;color:var(--red)">− R$ ${fmt(f.posicao.chequesEmitidosPend)}</td></tr>
      <tr><td>Fatura Cartão PF em Aberto${!f.cartoesPF?.ok?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:var(--red)">− R$ ${fmt(f.posicao.cartoesPF)}</td></tr>
      <tr><td>Fatura Cartão PJ em Aberto${!f.cartoesPJ?.ok?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:var(--red)">− R$ ${fmt(f.posicao.cartoesPJ)}</td></tr>
      <tr class="trow"><td>Posição Líquida</td><td style="text-align:right;font-size:16px;color:${f.posicao.liquida<0?'var(--red)':'var(--acc)'}">R$ ${fmt(f.posicao.liquida)}</td></tr>
    </tbody></table>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div style="font-weight:700;margin-bottom:10px">📊 Movimento do Dia</div>
    <table><tbody>
      <tr><td>Entradas (TesourariaSys)</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(f.tesouraria.entradas)}</td></tr>
      <tr><td>Saídas (TesourariaSys)</td><td style="text-align:right;color:var(--red)">− R$ ${fmt(f.tesouraria.saidas)}</td></tr>
      ${f.chequesys?.ok?`
      <tr><td>Cheques Depositados Hoje</td><td style="text-align:right">${f.chequesys.depositadosHoje.length}</td></tr>
      <tr><td>Cheques Compensados Hoje</td><td style="text-align:right">${f.chequesys.compensadosHoje.length}</td></tr>
      <tr><td>Boletos Enviados Hoje</td><td style="text-align:right">${f.chequesys.boletosEnviadosHoje.length}</td></tr>`:''}
      ${f.cartoesPF?.ok?`<tr><td>Compras no Cartão PF Hoje</td><td style="text-align:right">${f.cartoesPF.comprasHoje.length} — R$ ${fmt(f.cartoesPF.totalComprasHoje)}</td></tr>`:''}
      ${f.cartoesPJ?.ok?`<tr><td>Compras no Cartão PJ Hoje</td><td style="text-align:right">${f.cartoesPJ.comprasHoje.length} — R$ ${fmt(f.cartoesPJ.totalComprasHoje)}</td></tr>`:''}
    </tbody></table>
  </div>

  <div class="card">
    <div style="font-weight:700;margin-bottom:10px">💡 Pontos de Atenção e Observações</div>
    ${obs.map(o=>`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--bor)"><span style="color:${corObs[o.tipo]};font-weight:700">${iconObs[o.tipo]}</span><span style="font-size:13px">${esc(o.txt)}</span></div>`).join('')}
  </div>`;
}

function imprimirFechamentoDiario(){
  const f = _fechamentoDados;
  if(!f){ alert('Gere o fechamento de hoje antes de imprimir.'); return; }
  const obs = observacoesFechamento(f);
  const linhaPos = (label,val,sinal)=>`<tr><td>${label}</td><td class="v">${sinal}R$ ${fmt(Math.abs(val))}</td></tr>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fechamento Diário — ${fmtD(f.data)}</title>
  <style>
    @page{size:A4;margin:14mm}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#000;margin:0;line-height:1.35}
    h1{font-size:16px;margin:0 0 2px;font-weight:700}
    .sub{font-size:10px;color:#000;margin-bottom:12px}
    .cabecalho{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    .secao{margin-bottom:12px}
    .secao-titulo{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:6px}
    table{width:100%;border-collapse:collapse}
    td{padding:2.5px 4px;border-bottom:1px solid #ccc;color:#000}
    td.v{text-align:right;font-weight:700;white-space:nowrap}
    tr.tot td{font-weight:700;border-top:1.5px solid #000;border-bottom:none;padding-top:5px}
    .duascols{display:flex;gap:20px}
    .duascols>div{flex:1}
    .obs-item{padding:4px 0;border-bottom:1px dotted #999;font-size:10px}
    .obs-marca{font-weight:700;margin-right:4px}
    .rodape{margin-top:16px;padding-top:8px;border-top:1px solid #000;font-size:8.5px;color:#000;display:flex;justify-content:space-between}
  </style></head>
  <body>
    <div class="cabecalho">
      <div><h1>FECHAMENTO DIÁRIO CONSOLIDADO</h1><div class="sub">Fabio Oliveira Santos — Telasul / Construsul / Operação de Factoring — Itabuna/BA</div></div>
      <div style="text-align:right"><div style="font-size:13px;font-weight:700">${fmtD(f.data)}</div><div class="sub">Gerado em ${new Date(f.geradoEm).toLocaleString('pt-BR')}</div></div>
    </div>

    <div class="duascols">
      <div class="secao">
        <div class="secao-titulo">Posição Consolidada</div>
        <table><tbody>
          ${linhaPos('Saldo em Contas (TesourariaSys)',f.posicao.saldoTesouraria,'+ ')}
          ${linhaPos('Saldo em Contas (ChequeSys)',f.posicao.saldoChequeSys,'+ ')}
          ${linhaPos('Patrimônio Investido',f.posicao.patrimonioInvestido,'+ ')}
          ${linhaPos('Contas a Receber Pendentes',f.posicao.receberPend,'+ ')}
          ${linhaPos('Contas a Pagar Pendentes',f.posicao.pagarPend,'− ')}
          ${linhaPos('Cheques Emitidos Aguardando',f.posicao.chequesEmitidosPend,'− ')}
          ${linhaPos('Fatura Cartão PF em Aberto',f.posicao.cartoesPF,'− ')}
          ${linhaPos('Fatura Cartão PJ em Aberto',f.posicao.cartoesPJ,'− ')}
          <tr class="tot"><td>POSIÇÃO LÍQUIDA</td><td class="v">R$ ${fmt(f.posicao.liquida)}</td></tr>
        </tbody></table>
      </div>
      <div class="secao">
        <div class="secao-titulo">Movimento do Dia</div>
        <table><tbody>
          ${linhaPos('Entradas (TesourariaSys)',f.tesouraria.entradas,'+ ')}
          ${linhaPos('Saídas (TesourariaSys)',f.tesouraria.saidas,'− ')}
          <tr><td>Cheques Depositados Hoje</td><td class="v">${f.chequesys?.ok?f.chequesys.depositadosHoje.length:'—'}</td></tr>
          <tr><td>Cheques Compensados Hoje</td><td class="v">${f.chequesys?.ok?f.chequesys.compensadosHoje.length:'—'}</td></tr>
          <tr><td>Cheques Devolvidos Hoje</td><td class="v">${f.chequesys?.ok?f.chequesys.devolvidosHoje.length:'—'}</td></tr>
          <tr><td>Boletos Enviados Hoje</td><td class="v">${f.chequesys?.ok?f.chequesys.boletosEnviadosHoje.length:'—'}</td></tr>
          <tr><td>Compras Cartão PF Hoje</td><td class="v">${f.cartoesPF?.ok?f.cartoesPF.comprasHoje.length+' — R$ '+fmt(f.cartoesPF.totalComprasHoje):'—'}</td></tr>
          <tr><td>Compras Cartão PJ Hoje</td><td class="v">${f.cartoesPJ?.ok?f.cartoesPJ.comprasHoje.length+' — R$ '+fmt(f.cartoesPJ.totalComprasHoje):'—'}</td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="secao">
      <div class="secao-titulo">Pontos de Atenção e Observações</div>
      ${obs.map(o=>`<div class="obs-item"><span class="obs-marca">${o.tipo==='alerta'?'[ATENÇÃO]':o.tipo==='positivo'?'[OK]':'[INFO]'}</span>${esc(o.txt)}</div>`).join('')}
    </div>

    <div class="rodape">
      <span>Fechamento gerado automaticamente pelo TesourariaSys — dados consolidados de TesourariaSys, ChequeSys, CartoesPF e CartoesPJ.</span>
      <span>Pág. 1/1</span>
    </div>
  </body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),300);
}

function htmlRelatorios(){
  // CACHE (23/07/2026, a pedido do Fabio): os quadros de fluxo que NÃO
  // dependem dos filtros interativos de Extrato/Contas a Pagar/Contas a
  // Receber (categoria, centro de custo, transferências, top lançamentos,
  // fluxo mensal, pareto, investimentos, seguros, cartões, ChequeSys) só são
  // recalculados quando o período do relatório muda ou quando os dados são
  // salvos — trocar de aba ou de conta dentro de Relatórios não recalcula
  // mais essa parte pesada, só reaproveita o resultado já pronto.
  const _relCacheChave = _filtroRelDe+'|'+_filtroRelAte+'|'+_relCacheVersion;
  let secoes;
  if(_relCacheRelatorios && _relCacheRelatorios.chave===_relCacheChave){
    secoes = {..._relCacheRelatorios.secoes};
  } else {
    secoes = _montarSecoesNaoInterativasRelatorios();
    _relCacheRelatorios = {chave:_relCacheChave, secoes:{...secoes}};
  }

  // ── Extrato por Conta / Período / Fornecedor / Categoria / Direcionamento (Contas Bancárias) ──
  let extratoLista = (DB.lancamentos||[]).filter(l=>contaTipoOk(l.contaId));
  if(RelExtrato.contaId) extratoLista = extratoLista.filter(l=>l.contaId===RelExtrato.contaId);
  if(RelExtrato.de) extratoLista = extratoLista.filter(l=>l.data>=RelExtrato.de);
  if(RelExtrato.ate) extratoLista = extratoLista.filter(l=>l.data<=RelExtrato.ate);
  if(RelExtrato.fornecedor) extratoLista = extratoLista.filter(l=>(l.contraparte||'')===RelExtrato.fornecedor);
  if(RelExtrato.categoriaId) extratoLista = extratoLista.filter(l=>l.categoriaId===RelExtrato.categoriaId || categoriaById(l.categoriaId)?.parentId===RelExtrato.categoriaId);
  if(RelExtrato.centroCustoId) extratoLista = extratoLista.filter(l=>l.centroCustoId===RelExtrato.centroCustoId || centroCustoById(l.centroCustoId)?.parentId===RelExtrato.centroCustoId);
  if(RelExtrato.direcionamento) extratoLista = extratoLista.filter(l=>(l.direcionamento||'')===RelExtrato.direcionamento || (l.direcionamento||'').startsWith(RelExtrato.direcionamento+':'));
  extratoLista = extratoLista.slice().sort((a,b)=>a.data.localeCompare(b.data)||a.criadoEm.localeCompare(b.criadoEm));
  const extratoTotEnt = extratoLista.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
  const extratoTotSai = extratoLista.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);

  // REMOVIDO (23/07/2026, a pedido do Fabio): o extrato tinha um cálculo de
  // "Saldo Anterior/Saldo Atual/Saldo do Dia" que reconstituía o saldo da
  // conta dia a dia percorrendo TODO o histórico dela toda vez que a conta
  // era trocada no filtro — pesado e, segundo o Fabio, sem utilidade prática.
  // O restante do código já lida bem com saldoAcumuladoExtrato=null (as
  // linhas de saldo simplesmente não aparecem), então manter como null
  // desativa a funcionalidade sem precisar mexer no resto da tela.
  const extratoEhRecorteItem = !!(RelExtrato.categoriaId || RelExtrato.centroCustoId || RelExtrato.direcionamento || RelExtrato.fornecedor);
  let saldoAcumuladoExtrato = null;
  const nCols = 7 + (RelExtrato.contaId?0:1) + (saldoAcumuladoExtrato!==null?1:0);
  const saldoAnteriorExtrato = saldoAcumuladoExtrato;
  const linhaAnterior = saldoAcumuladoExtrato!==null
    ? `<tr class="trow"><td colspan="${nCols-1}" style="font-weight:700">Saldo Anterior${RelExtrato.de?' ('+fmtD(RelExtrato.de)+')':''}</td><td style="text-align:right;font-weight:800;color:${saldoAnteriorExtrato<0?'var(--red)':'var(--acc)'}">R$ ${fmt(saldoAnteriorExtrato)}</td></tr>`
    : '';
  const gruposPorDia = {};
  const ordemDiasAsc = [];
  extratoLista.forEach(l=>{
    if(!gruposPorDia[l.data]){ gruposPorDia[l.data]=[]; ordemDiasAsc.push(l.data); }
    gruposPorDia[l.data].push(l);
  });
  // pré-calcula o saldo acumulado ao final de cada dia, em ordem cronológica ascendente
  // (o cálculo tem que ser feito do mais antigo pro mais recente pra ficar correto,
  // mesmo que a exibição depois seja do mais recente pro mais antigo)
  const saldoFinalPorDia = {};
  let _saldoCalc = saldoAcumuladoExtrato;
  if(_saldoCalc!==null){
    ordemDiasAsc.forEach(dia=>{
      gruposPorDia[dia].forEach(l=>{ _saldoCalc += (l.tipo==='entrada'?l.valor:-l.valor); });
      saldoFinalPorDia[dia] = _saldoCalc;
    });
  }
  const saldoAtualExtrato = _saldoCalc;
  const linhaAtual = (saldoAtualExtrato!==null && !_extratoModoEdicao)
    ? `<tr class="trow" style="border-top:2px solid var(--acc)"><td colspan="${nCols-1}" style="font-weight:800">Saldo Atual</td><td style="text-align:right;font-weight:900;color:${saldoAtualExtrato<0?'var(--red)':'var(--acc)'}">R$ ${fmt(saldoAtualExtrato)}</td></tr>`
    : '';
  // exibição: do mais recente para o mais antigo (dias e lançamentos dentro do dia)
  const ordemDias = ordemDiasAsc.slice().reverse();
  const linhasExtrato = linhaAtual + ordemDias.map(dia=>{
    const linhasDia = gruposPorDia[dia].slice().reverse().map(l=>{
      const cta = contaById(l.contaId);
      const cat = categoriaById(l.categoriaId);
      const cc = centroCustoById(l.centroCustoId);
      if(_extratoModoEdicao){
        const protegido = l.origem && l.origem!=='manual' && l.origem!=='ofx';
        if(protegido){
          return `<tr style="opacity:.6">
            <td>${fmtD(l.data)}</td>
            ${RelExtrato.contaId?'':`<td>${esc(cta?cta.titular:'-')}</td>`}
            <td>${esc(l.contraparte||'-')}</td>
            <td>${esc(l.descricao||'-')} ${T('não editável aqui','cz')}</td>
            <td>${esc(cat?nomeCompletoCategoria(cat):'-')}</td>
            <td>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td>
            <td>${esc(l.direcionamento||'-')}</td>
            <td>${l.tipo==='entrada'?'Entrada':'Saída'}</td>
            <td style="text-align:right">R$ ${fmt(l.valor)}</td>
            <td>${BPerm('excluir','🗑','excluirLancamento(\''+l.id+'\')','var(--sur)','var(--red)',1,'Excluir este lançamento')}</td>
          </tr>`;
        }
        return `<tr>
          <td><input type="date" id="edtx-data-${l.id}" value="${l.data}" style="width:130px;font-size:11px"></td>
          ${RelExtrato.contaId?'':`<td>${esc(cta?cta.titular:'-')}</td>`}
          <td><input type="text" id="edtx-forn-${l.id}" value="${esc(l.contraparte||'')}" list="dl-contrapartes-edtx" style="width:130px;font-size:11px"></td>
          <td><input type="text" id="edtx-desc-${l.id}" value="${esc(l.descricao||'')}" style="width:130px;font-size:11px"></td>
          <td><div style="display:flex;gap:2px"><select id="edtx${l.id}-categoria-mae" onchange="aoMudarMaeCascataFixo('edtx${l.id}','categoria')" style="font-size:10px;width:80px">${opcoesCategoriaMae(l.tipo==='entrada'?'receita':'despesa','','',idsMaeSub(categoriaById(l.categoriaId)).maeId)}</select><select id="edtx${l.id}-categoria-sub" style="font-size:10px;width:70px">${opcoesSubcategoria(idsMaeSub(categoriaById(l.categoriaId)).maeId, idsMaeSub(categoriaById(l.categoriaId)).subId)}</select></div></td>
          <td><div style="display:flex;gap:2px"><select id="edtx${l.id}-cc-mae" onchange="aoMudarMaeCascataFixo('edtx${l.id}','cc')" style="font-size:10px;width:80px">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(l.centroCustoId)).maeId)}</select><select id="edtx${l.id}-cc-sub" style="font-size:10px;width:70px">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(l.centroCustoId)).maeId, idsMaeSub(centroCustoById(l.centroCustoId)).subId)}</select></div></td>
          <td><input type="text" id="edtx-direc-${l.id}" value="${esc(l.direcionamento||'')}" list="dl-direcionamentos-edtx" style="width:110px;font-size:11px"></td>
          <td><select id="edtx-tipo-${l.id}" style="font-size:11px"><option value="entrada"${l.tipo==='entrada'?' selected':''}>Entrada</option><option value="saida"${l.tipo==='saida'?' selected':''}>Saída</option></select></td>
          <td><input type="text" id="edtx-valor-${l.id}" value="${fmt(l.valor)}" style="width:90px;font-size:11px;text-align:right"></td>
          <td>${BPerm('excluir','🗑','excluirLancamento(\''+l.id+'\')','var(--sur)','var(--red)',1,'Excluir este lançamento')}</td>
        </tr>`;
      }
      return `<tr style="cursor:pointer${l.status==='nulo'?';opacity:.55':''}" ondblclick="editarLancamento('${l.id}')" oncontextmenu="return abrirMenuLancamento(event,'${l.id}')" title="Duplo clique: editar — Clique direito: mais opções">
        <td>${fmtD(l.data)}${badgeStatusLancamento(l)}</td>
        ${RelExtrato.contaId?'':`<td>${esc(cta?cta.titular:'-')}</td>`}
        <td${l.contraparte?` style="cursor:pointer;text-decoration:underline dotted" title="Ver só este fornecedor/cliente" onclick="filtrarExtratoPorFornecedor('${esc(l.contraparte).replace(/'/g,"\\'")}')"`:''}>${esc(l.contraparte||'-')}</td>
        <td${l.origem==='chequesys'?` style="cursor:pointer;text-decoration:underline dotted" title="Abrir no ChequeSys" onclick="editarLancamento('${l.id}')"`:''}>${esc(l.descricao||'-')}</td>
        <td${l.categoriaId?` style="cursor:pointer;text-decoration:underline dotted" title="Ver só esta categoria" onclick="filtrarExtratoPorCategoria('${l.categoriaId}')"`:''}>${esc(cat?nomeCompletoCategoria(cat):'-')}</td>
        <td${l.centroCustoId?` style="cursor:pointer;text-decoration:underline dotted" title="Ver só este centro de custo" onclick="filtrarExtratoPorCentroCusto('${l.centroCustoId}')"`:''}>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td>
        <td${l.direcionamento?` style="cursor:pointer;text-decoration:underline dotted" title="Ver só este direcionamento" onclick="filtrarExtratoPorDirecionamento('${esc(l.direcionamento).replace(/'/g,"\\'")}')"`:''}>${esc(l.direcionamento||'-')}</td>
        <td style="text-align:right;color:#3fb950">${l.tipo==='entrada'?'R$ '+fmt(l.valor):''}</td>
        <td style="text-align:right;color:#f85149">${l.tipo==='saida'?'R$ '+fmt(l.valor):''}</td>
      </tr>`;
    }).join('');
    const saldoDoDia = saldoFinalPorDia[dia];
    const linhaSaldoDia = (saldoDoDia!==undefined && !_extratoModoEdicao)
      ? `<tr class="trow"><td colspan="${nCols-1}" style="font-weight:700">Saldo do dia — ${fmtD(dia)}</td><td style="text-align:right;font-weight:800;color:${saldoDoDia<0?'var(--red)':'var(--acc)'}">R$ ${fmt(saldoDoDia)}</td></tr>`
      : '';
    return linhasDia + linhaSaldoDia;
  }).join('') + linhaAnterior || `<tr><td colspan="${nCols}" style="text-align:center;color:var(--mut)">Nenhum lançamento com esses filtros</td></tr>`;
  const cabecalhoExtrato = _extratoModoEdicao
    ? `<tr><th>Data</th>${RelExtrato.contaId?'':'<th>Conta</th>'}<th>Fornecedor/Cliente</th><th>Descrição</th><th>Categoria</th><th>Centro de Custo</th><th>Direcionamento</th><th>Tipo</th><th style="text-align:right">Valor</th><th></th></tr>`
    : `<tr><th>Data</th>${RelExtrato.contaId?'':'<th>Conta</th>'}<th>Fornecedor/Cliente</th><th>Descrição</th><th>Categoria</th><th>Centro de Custo</th><th>Direcionamento</th><th style="text-align:right">Entrada</th><th style="text-align:right">Saída</th></tr>`;
  // Dados brutos (não HTML) para a impressão poder escolher colunas dinamicamente
  const impRows = [];
  if(saldoAnteriorExtrato!==null) impRows.push({tipo:'saldo', label:'Saldo Anterior'+(RelExtrato.de?' ('+fmtD(RelExtrato.de)+')':''), valor:saldoAnteriorExtrato});
  let _saldoImp = saldoAnteriorExtrato;
  ordemDias.forEach(dia=>{
    gruposPorDia[dia].forEach(l=>{
      const cta = contaById(l.contaId);
      const cat = categoriaById(l.categoriaId);
      const cc = centroCustoById(l.centroCustoId);
      if(_saldoImp!==null) _saldoImp += (l.tipo==='entrada'?l.valor:-l.valor);
      impRows.push({tipo:'lancamento', data:l.data, conta:cta?cta.titular:'-', contraparte:l.contraparte||'-', descricao:l.descricao||'-', categoria:cat?nomeCompletoCategoria(cat):'-', centroCusto:cc?nomeCompletoCentroCusto(cc):'-', direcionamento:l.direcionamento||'-', valorEntrada:l.tipo==='entrada'?l.valor:null, valorSaida:l.tipo==='saida'?l.valor:null});
    });
    if(_saldoImp!==null) impRows.push({tipo:'saldo', label:'Saldo do dia — '+fmtD(dia), valor:_saldoImp});
  });
  if(_saldoImp!==null) impRows.push({tipo:'saldo', label:'Saldo Atual', valor:_saldoImp});
  _impExtratoEnt = extratoTotEnt; _impExtratoSai = extratoTotSai;
  _impExtratoCabecalho = cabecalhoExtrato; _impExtratoLinhas = linhasExtrato;
  _impExtratoRows = impRows; _impExtratoMostraConta = !RelExtrato.contaId;
  _extratoIdsEditaveis = extratoLista.filter(l=>!l.origem || l.origem==='manual' || l.origem==='ofx').map(l=>l.id);
  const filtroExtratoHtml = `
    <div class="row" style="margin-bottom:10px">
      ${C('Conta',`<select id="re-conta" onchange="aplicarFiltroRelExtrato()"><option value="">Todas</option>${opcoesContasFiltradas(RelExtrato.contaId)}</select>`,'1','200')}
      ${C('De',`<input type="date" id="re-de" value="${RelExtrato.de}" onchange="aplicarFiltroRelExtrato()">`,'1','150')}
      ${C('Até',`<input type="date" id="re-ate" value="${RelExtrato.ate}" onchange="aplicarFiltroRelExtrato()">`,'1','150')}
      ${C('Fornecedor/Cliente',`<select id="re-forn" onchange="aplicarFiltroRelExtrato()"><option value="">Todos</option>${contrapartesExistentes().map(n=>`<option value="${esc(n)}"${n===RelExtrato.fornecedor?' selected':''}>${esc(n)}</option>`).join('')}</select>`,'1','200')}
      ${C('Categoria',`<div style="display:flex;gap:5px"><select id="re-categoria-mae" onchange="aoMudarMaeCascataFixo('re','categoria');aplicarFiltroRelExtrato()" style="flex:1">${opcoesCategoriaMae('','','',idsMaeSub(categoriaById(RelExtrato.categoriaId)).maeId)}</select><select id="re-categoria-sub" onchange="aplicarFiltroRelExtrato()" style="flex:1">${opcoesSubcategoria(idsMaeSub(categoriaById(RelExtrato.categoriaId)).maeId, idsMaeSub(categoriaById(RelExtrato.categoriaId)).subId)}</select></div>`,'2','260')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="re-cc-mae" onchange="aoMudarMaeCascataFixo('re','cc');aplicarFiltroRelExtrato()" style="flex:1">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(RelExtrato.centroCustoId)).maeId)}</select><select id="re-cc-sub" onchange="aplicarFiltroRelExtrato()" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(RelExtrato.centroCustoId)).maeId, idsMaeSub(centroCustoById(RelExtrato.centroCustoId)).subId)}</select></div>`,'2','260')}
      ${C('Direcionamento',`<select id="re-direc" onchange="aplicarFiltroRelExtrato()"><option value="">Todos</option>${direcionamentosExistentes().map(d=>`<option value="${esc(d)}"${d===RelExtrato.direcionamento?' selected':''}>${esc(d)}</option>`).join('')}</select>`,'1','180')}
    </div>
    <div class="row" style="margin-bottom:10px">
      ${B('✕ Limpar Filtros','limparFiltroRelExtrato()','var(--sur)','var(--txt)')}
      ${B('🖨 Imprimir','abrirOpcoesImpressaoExtrato()','var(--sur)','var(--txt)')}
      ${!_extratoModoEdicao ? BPerm('lancamentos','➕ Novo Lançamento',`novoLancamento('${RelExtrato.contaId||''}')`,'var(--acc)') : ''}
      ${_extratoModoEdicao
        ? BPerm('lancamentos','💾 Salvar Alterações','salvarEdicaoEmMassaExtrato()','var(--grn)','#fff') + B('✕ Cancelar Edição','cancelarEdicaoExtrato()','var(--sur)','var(--mut)')
        : BPerm('lancamentos','✏️ Editar','alternarEdicaoExtrato()','var(--blu)','#fff')}
    </div>
    <datalist id="dl-contrapartes-edtx">${contrapartesExistentes().map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <datalist id="dl-direcionamentos-edtx">${direcionamentosExistentes().map(d=>`<option value="${esc(d)}">`).join('')}</datalist>
    ${_extratoModoEdicao ? '<div style="font-size:11px;color:#f0a500;margin-bottom:10px">✏️ Modo edição ativo — altere os campos direto na tabela e clique em "Salvar Alterações" quando terminar. Selecione o período/filtros antes de entrar em edição.</div>' : ''}
    ${!RelExtrato.contaId ? '<div style="font-size:11px;color:var(--mut);margin-bottom:10px">💡 Selecione uma conta específica para ver o saldo de fechamento de cada dia — com "Todas" selecionado, não há um saldo bancário único para mostrar.</div>' : ''}
    <div style="font-size:11px;color:var(--mut);margin-bottom:10px">💡 Toque em um Fornecedor, Categoria ou Direcionamento na tabela abaixo para ver só os lançamentos daquele item, mantendo o período filtrado.</div>`;

  // ── Contas a Pagar — Pagas em Período (com filtro CC / texto) ──
  let pagarLista = (DB.contasPagar||[]).filter(cp=>cp.status==='pago' && contaTipoOk(cp.contaId));
  if(RelPagarF.de) pagarLista = pagarLista.filter(cp=>(cp.dataPagamento||cp.vencimento)>=RelPagarF.de);
  if(RelPagarF.ate) pagarLista = pagarLista.filter(cp=>(cp.dataPagamento||cp.vencimento)<=RelPagarF.ate);
  if(RelPagarF.centroCustoId) pagarLista = pagarLista.filter(cp=>cp.centroCustoId===RelPagarF.centroCustoId);
  if(RelPagarF.texto) pagarLista = pagarLista.filter(cp=>(cp.favorecido||'').toLowerCase().includes(RelPagarF.texto.toLowerCase()));
  pagarLista = pagarLista.slice().sort((a,b)=>(b.dataPagamento||b.vencimento).localeCompare(a.dataPagamento||a.vencimento));
  const pagarTotFiltro = pagarLista.reduce((s,cp)=>s+Number(cp.valorPago||0),0);
  const linhasPagarPeriodo = pagarLista.map(cp=>{
    const cc = centroCustoById(cp.centroCustoId);
    const cta = contaById(cp.contaId);
    return `<tr><td>${fmtD(cp.dataPagamento||cp.vencimento)}</td><td>${esc(cp.favorecido)}</td><td>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td><td>${esc(cta?cta.titular:'-')}</td><td style="text-align:right;font-weight:700">R$ ${fmt(cp.valorPago)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Nenhum pagamento com esses filtros</td></tr>';
  const filtroPagarHtml = `
    <div class="row" style="margin-bottom:10px">
      ${C('De',`<input type="date" id="rp-de" value="${RelPagarF.de}" onchange="aplicarFiltroRelPagar()">`,'1','150')}
      ${C('Até',`<input type="date" id="rp-ate" value="${RelPagarF.ate}" onchange="aplicarFiltroRelPagar()">`,'1','150')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="rp-cc-mae" onchange="aoMudarMaeCascataFixo('rp','cc');aplicarFiltroRelPagar()" style="flex:1">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(RelPagarF.centroCustoId)).maeId)}</select><select id="rp-cc-sub" onchange="aplicarFiltroRelPagar()" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(RelPagarF.centroCustoId)).maeId, idsMaeSub(centroCustoById(RelPagarF.centroCustoId)).subId)}</select></div>`,'2','260')}
      ${C('Fornecedor',`<input type="text" id="rp-txt" value="${esc(RelPagarF.texto)}" placeholder="Buscar por nome..." onchange="aplicarFiltroRelPagar()">`,'1','200')}
    </div>
    <div class="row" style="margin-bottom:10px">${B('✕ Limpar Filtros','limparFiltroRelPagar()','var(--sur)','var(--txt)')}${B('🖨 Imprimir','imprimirPagarPeriodo()','var(--sur)','var(--txt)')}</div>`;
  _impPagarTotal = pagarTotFiltro; _impPagarLinhas = linhasPagarPeriodo;

  // ── Contas a Receber — Recebidas em Período (com filtro CC / texto) ──
  let receberLista = (DB.contasReceber||[]).filter(cr=>cr.status==='recebido' && contaTipoOk(cr.contaId));
  if(RelReceberF.de) receberLista = receberLista.filter(cr=>(cr.dataRecebimento||cr.vencimento)>=RelReceberF.de);
  if(RelReceberF.ate) receberLista = receberLista.filter(cr=>(cr.dataRecebimento||cr.vencimento)<=RelReceberF.ate);
  if(RelReceberF.centroCustoId) receberLista = receberLista.filter(cr=>cr.centroCustoId===RelReceberF.centroCustoId);
  if(RelReceberF.texto) receberLista = receberLista.filter(cr=>(cr.cliente||'').toLowerCase().includes(RelReceberF.texto.toLowerCase()));
  receberLista = receberLista.slice().sort((a,b)=>(b.dataRecebimento||b.vencimento).localeCompare(a.dataRecebimento||a.vencimento));
  const receberTotFiltro = receberLista.reduce((s,cr)=>s+Number(cr.valorRecebido||0),0);
  const linhasReceberPeriodo = receberLista.map(cr=>{
    const cc = centroCustoById(cr.centroCustoId);
    const cta = contaById(cr.contaId);
    return `<tr><td>${fmtD(cr.dataRecebimento||cr.vencimento)}</td><td>${esc(cr.cliente)}</td><td>${esc(cc?nomeCompletoCentroCusto(cc):'-')}</td><td>${esc(cta?cta.titular:'-')}</td><td style="text-align:right;font-weight:700">R$ ${fmt(cr.valorRecebido)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Nenhum recebimento com esses filtros</td></tr>';
  const filtroReceberHtml = `
    <div class="row" style="margin-bottom:10px">
      ${C('De',`<input type="date" id="rr-de" value="${RelReceberF.de}" onchange="aplicarFiltroRelReceber()">`,'1','150')}
      ${C('Até',`<input type="date" id="rr-ate" value="${RelReceberF.ate}" onchange="aplicarFiltroRelReceber()">`,'1','150')}
      ${C('Centro de Custo',`<div style="display:flex;gap:5px"><select id="rr-cc-mae" onchange="aoMudarMaeCascataFixo('rr','cc');aplicarFiltroRelReceber()" style="flex:1">${opcoesCentroCustoMae('',idsMaeSub(centroCustoById(RelReceberF.centroCustoId)).maeId)}</select><select id="rr-cc-sub" onchange="aplicarFiltroRelReceber()" style="flex:1">${opcoesSubCentroCusto(idsMaeSub(centroCustoById(RelReceberF.centroCustoId)).maeId, idsMaeSub(centroCustoById(RelReceberF.centroCustoId)).subId)}</select></div>`,'2','260')}
      ${C('Cliente',`<input type="text" id="rr-txt" value="${esc(RelReceberF.texto)}" placeholder="Buscar por nome..." onchange="aplicarFiltroRelReceber()">`,'1','200')}
    </div>
    <div class="row" style="margin-bottom:10px">${B('✕ Limpar Filtros','limparFiltroRelReceber()','var(--sur)','var(--txt)')}${B('🖨 Imprimir','imprimirReceberPeriodo()','var(--sur)','var(--txt)')}</div>`;
  _impReceberTotal = receberTotFiltro; _impReceberLinhas = linhasReceberPeriodo;
  // Extrato/Contas a Pagar/Contas a Receber por período: dependem de filtros
  // que mudam a cada interação (conta, fornecedor, categoria...), por isso
  // são sempre recalculados na hora, mesmo com o cache acima.
  secoes.extrato_conta = `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">📄 Extrato — por Conta / Período / Fornecedor</div>
      ${filtroExtratoHtml}
      <div class="kpis" style="margin-bottom:10px">
        <div class="card kpi"><div class="kpi-l">Entradas no filtro</div><div class="kpi-v" style="color:#3fb950">R$ ${fmt(extratoTotEnt)}</div></div>
        <div class="card kpi"><div class="kpi-l">Saídas no filtro</div><div class="kpi-v" style="color:#f85149">R$ ${fmt(extratoTotSai)}</div></div>
        <div class="card kpi"><div class="kpi-l">Resultado</div><div class="kpi-v" style="color:${(extratoTotEnt-extratoTotSai)<0?'var(--red)':'var(--acc)'}">R$ ${fmt(extratoTotEnt-extratoTotSai)}</div></div>
      </div>
      <table><thead class="thead-fixo">${cabecalhoExtrato}</thead><tbody>${linhasExtrato}</tbody></table>
    </div>`;
  secoes.pagar_periodo = `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">📅 Pagamentos por Período / Centro de Custo / Fornecedor</div>
      ${filtroPagarHtml}
      <div class="card kpi" style="margin-bottom:10px"><div class="kpi-l">Total pago no filtro</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(pagarTotFiltro)}</div></div>
      <table><thead><tr><th>Data Pagamento</th><th>Favorecido</th><th>C. Custo</th><th>Conta</th><th style="text-align:right">Valor Pago</th></tr></thead><tbody>${linhasPagarPeriodo}</tbody></table>
    </div>`;
  secoes.receber_periodo = `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">📅 Recebimentos por Período / Centro de Custo / Cliente</div>
      ${filtroReceberHtml}
      <div class="card kpi" style="margin-bottom:10px"><div class="kpi-l">Total recebido no filtro</div><div class="kpi-v" style="color:var(--acc)">R$ ${fmt(receberTotFiltro)}</div></div>
      <table><thead><tr><th>Data Recebimento</th><th>Cliente</th><th>C. Custo</th><th>Conta</th><th style="text-align:right">Valor Recebido</th></tr></thead><tbody>${linhasReceberPeriodo}</tbody></table>
    </div>`;

  const CATS_TR = {
    geral:      { label:'🌐 Geral',            cor:'var(--acc)', tipos:['resumo_graficos','fluxo_mensal','pareto_despesas','top_entradas','top_saidas','fluxo_categoria','fluxo_centro_custo','mov_contraparte','investimentos','seguros'] },
    bancarias:  { label:'🏦 Contas Bancárias',  cor:'var(--blu)', tipos:['saldo_conta','extrato_conta','tarifas_conta'] },
    pagar:      { label:'📤 Contas a Pagar',    cor:'var(--red)', tipos:['pagar_periodo','pagar_cc','pagar_fornecedor','cheques_emitidos'] },
    receber:    { label:'📥 Contas a Receber',  cor:'#3fb950',    tipos:['receber_periodo','receber_cc','receber_cliente'] },
    cartoes:    { label:'💳 Cartões',           cor:'var(--pur)', tipos:['cartoes_resumo','cartoes_direcionamento','cartoes_historico'] },
    chequesys:  { label:'🧾 ChequeSys',         cor:'#f0a500',    tipos:['chq_emitentes','chq_sacados'] },
  };
  const rotulos = {
    resumo_graficos:'🧭 Resumo e Gráficos', fluxo_mensal:'📅 Fluxo Mensal', pareto_despesas:'📉 Pareto de Despesas',
    top_entradas:'🔝 Top Entradas', top_saidas:'🔝 Top Saídas', fluxo_categoria:'📊 Por Categoria',
    fluxo_centro_custo:'🏷️ Por Centro de Custo',
    mov_contraparte:'👥 Por Cliente/Fornecedor', investimentos:'📈 Investimentos', seguros:'🛡️ Seguros',
    saldo_conta:'💰 Saldo por Conta', extrato_conta:'📄 Extrato (Conta/Período/Fornecedor)', tarifas_conta:'🏦 Tarifas Bancárias',
    pagar_periodo:'📅 Por Período', pagar_cc:'📤 Por Centro de Custo', pagar_fornecedor:'🏭 Por Fornecedor', cheques_emitidos:'✍️ Cheques Emitidos',
    receber_periodo:'📅 Por Período', receber_cc:'📥 Por Centro de Custo', receber_cliente:'🤝 Por Cliente',
    cartoes_resumo:'💳 Resumo', cartoes_direcionamento:'🧭 Por Direcionamento', cartoes_historico:'💳 Histórico de Faturas',
    chq_emitentes:'🧾 Por Emitente (Cheques)', chq_sacados:'🧾 Por Sacado (Boletos)',
  };

  if(!RLT.cat){
    const cards = Object.entries(CATS_TR).map(([k,v])=>`
      <div onclick="irRelCategoria('${k}','${v.tipos[0]}')"
        style="cursor:pointer;background:var(--card);border:2px solid ${v.cor};border-radius:12px;padding:32px 24px;text-align:center;transition:transform .15s;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:150px;flex:1"
        onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
        <div style="font-size:36px">${v.label.split(' ')[0]}</div>
        <div style="font-size:16px;font-weight:800;color:${v.cor}">${v.label.split(' ').slice(1).join(' ')}</div>
        <div style="font-size:11px;color:var(--mut)">${v.tipos.length} relatório${v.tipos.length>1?'s':''}</div>
      </div>`).join('');
    return `<div class="titulo acc">📊 Relatórios</div>
      <p style="color:var(--mut);font-size:13px;margin-bottom:18px">Selecione a categoria:</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">${cards}</div>`;
  }

  const catAtual = CATS_TR[RLT.cat];
  if(!RLT.tipo || !catAtual.tipos.includes(RLT.tipo)) RLT.tipo = catAtual.tipos[0];
  const btnVoltar = `<button type="button" onclick="voltarRelCategorias()" style="background:var(--sur);color:var(--mut);border:1px solid var(--bor);border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">← Categorias</button>`;
  const tabsBtns = catAtual.tipos.map(t=>
    `<button type="button" onclick="irRelTipo('${t}')" style="background:${RLT.tipo===t?catAtual.cor:'var(--sur)'};color:${RLT.tipo===t?'#fff':'var(--mut)'};border:1px solid var(--bor);border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin:2px">${rotulos[t]||t}</button>`
  ).join('');

  return `<div class="titulo acc">📊 Relatórios</div>
    ${htmlFiltroPeriodoRel()}
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      ${btnVoltar}
      <span style="font-size:14px;font-weight:800;color:${catAtual.cor}">${catAtual.label}</span>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px">${tabsBtns}</div>
    ${secoes[RLT.tipo]}
  `;
}
function _montarSecoesNaoInterativasRelatorios(){
  const contas = (DB.contas||[]).filter(c=>c.ativa!==false);
  // Base de lançamentos já recortada pelo período selecionado (padrão 90
  // dias) — usada nos quadros de FLUXO abaixo. Saldo das contas continua
  // usando o histórico completo (DB.lancamentos direto), nunca essa base.
  const lancRelBase = (DB.lancamentos||[]).filter(l=>(!_filtroRelDe||l.data>=_filtroRelDe)&&(!_filtroRelAte||l.data<=_filtroRelAte));
  // Fluxo por categoria (dentro do período selecionado)
  const porCategoria = {};
  lancRelBase.forEach(l=>{
    const cat = categoriaById(l.categoriaId);
    const nome = cat?nomeCompletoCategoria(cat):'(sem categoria)';
    if(!porCategoria[nome]) porCategoria[nome]={entrada:0,saida:0};
    porCategoria[nome][l.tipo==='entrada'?'entrada':'saida'] += l.valor;
  });
  const linhasCat = Object.keys(porCategoria).sort().map(nome=>{
    const v = porCategoria[nome];
    return `<tr><td>${esc(nome)}</td><td style="text-align:right;color:#3fb950">R$ ${fmt(v.entrada)}</td><td style="text-align:right;color:#f85149">R$ ${fmt(v.saida)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(v.entrada-v.saida)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Sem lançamentos ainda</td></tr>';

  // Fluxo por centro de custo (todos os lançamentos, histórico completo — mesmo
  // espírito do fluxo por Categoria acima, só que agrupado por Centro de Custo)
  const porCentroCustoGeral = {};
  lancRelBase.forEach(l=>{
    const cc = centroCustoById(l.centroCustoId);
    const nome = cc?nomeCompletoCentroCusto(cc):'(sem centro de custo)';
    if(!porCentroCustoGeral[nome]) porCentroCustoGeral[nome]={entrada:0,saida:0};
    porCentroCustoGeral[nome][l.tipo==='entrada'?'entrada':'saida'] += l.valor;
  });
  const linhasCCGeral = Object.keys(porCentroCustoGeral).sort().map(nome=>{
    const v = porCentroCustoGeral[nome];
    return `<tr><td>${esc(nome)}</td><td style="text-align:right;color:#3fb950">R$ ${fmt(v.entrada)}</td><td style="text-align:right;color:#f85149">R$ ${fmt(v.saida)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(v.entrada-v.saida)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Sem lançamentos ainda</td></tr>';

  // Contas a pagar por centro de custo (pendentes)
  const porCC = {};
  contasPagarPendentes().forEach(cp=>{
    const cc = centroCustoById(cp.centroCustoId);
    const nome = cc?nomeCompletoCentroCusto(cc):'(sem centro de custo)';
    porCC[nome] = (porCC[nome]||0) + cp.valor;
  });
  const linhasCC = Object.keys(porCC).sort().map(nome=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(porCC[nome])}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Sem contas pendentes</td></tr>';

  // Extrato consolidado por conta (saldo)
  const linhasContas = contas.map(c=>`<tr><td>${esc(nomeConta(c))}</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoConta(c.id))}</td></tr>`).join('');

  // Total pago por Fornecedor (Contas a Pagar já pagas)
  const porFornecedor = {};
  (DB.contasPagar||[]).filter(cp=>cp.status==='pago').forEach(cp=>{
    const f = fornecedorById(cp.fornecedorId);
    const nome = f?f.nome:cp.favorecido;
    porFornecedor[nome] = (porFornecedor[nome]||0) + Number(cp.valorPago||0);
  });
  const linhasForn = Object.entries(porFornecedor).sort((a,b)=>b[1]-a[1]).map(([nome,total])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(total)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Nenhum pagamento realizado ainda</td></tr>';

  // Total recebido por Cliente (Contas a Receber já recebidas)
  const porCliente = {};
  (DB.contasReceber||[]).filter(cr=>cr.status==='recebido').forEach(cr=>{
    const cl = clienteById(cr.clienteId);
    const nome = cl?cl.nome:cr.cliente;
    porCliente[nome] = (porCliente[nome]||0) + Number(cr.valorRecebido||0);
  });
  const linhasCliente = Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).map(([nome,total])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(total)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Nenhum recebimento realizado ainda</td></tr>';

  // Contas a Receber pendentes por Centro de Custo
  const porCCReceber = {};
  contasReceberPendentes().forEach(cr=>{
    const cc = centroCustoById(cr.centroCustoId);
    const nome = cc?nomeCompletoCentroCusto(cc):'(sem centro de custo)';
    porCCReceber[nome] = (porCCReceber[nome]||0) + cr.valor;
  });
  const linhasCCReceber = Object.keys(porCCReceber).sort().map(nome=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(porCCReceber[nome])}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Sem contas pendentes</td></tr>';

  // Movimentação por Cliente/Fornecedor (contraparte) nos Lançamentos
  const porContraparte = {};
  lancRelBase.filter(l=>l.contraparte).forEach(l=>{
    if(!porContraparte[l.contraparte]) porContraparte[l.contraparte]={entrada:0,saida:0};
    porContraparte[l.contraparte][l.tipo==='entrada'?'entrada':'saida'] += l.valor;
  });
  const linhasContraparte = Object.keys(porContraparte).sort().map(nome=>{
    const v = porContraparte[nome];
    return `<tr><td>${esc(nome)}</td><td style="text-align:right;color:#3fb950">R$ ${fmt(v.entrada)}</td><td style="text-align:right;color:#f85149">R$ ${fmt(v.saida)}</td></tr>`;
  }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Nenhum lançamento com cliente/fornecedor vinculado ainda</td></tr>';

  // Cheques Emitidos pendentes de compensação (compromisso futuro por conta)
  const linhasChq = chequesEmitidosPendentes().map(c=>{
    const cta = contaById(c.contaId);
    return `<tr><td>${esc(cta?cta.titular:'-')}</td><td>${esc(c.favorecido)}</td><td>${fmtD(c.dataPrevista)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(c.valor)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Nenhum cheque aguardando compensação</td></tr>';

  // Tarifas Bancárias por Conta
  const catTarifa = categoriaPorNome('Tarifas Bancárias','despesa');
  const porTarifaConta = {};
  if(catTarifa){
    lancRelBase.filter(l=>l.categoriaId===catTarifa.id).forEach(l=>{
      const cta = contaById(l.contaId);
      const nome = cta?cta.titular:'(conta removida)';
      porTarifaConta[nome] = (porTarifaConta[nome]||0) + l.valor;
    });
  }
  const linhasTarifa = Object.entries(porTarifaConta).sort((a,b)=>b[1]-a[1]).map(([nome,total])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(total)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Nenhuma tarifa lançada ainda</td></tr>';

  // Rentabilidade por Investimento/Previdência
  const linhasRent = [
    ...(DB.investimentos||[]).map(i=>({nome:i.instituicao,tipo:i.tipo,aplicado:i.valorAplicado,atual:i.valorAtual,ganho:ganhoInvestimento(i)})),
    ...(DB.previdencias||[]).map(p=>({nome:p.instituicao,tipo:p.tipo,aplicado:p.valorAplicado,atual:p.valorAtual,ganho:Number(p.valorAtual)+Number(p.valorResgatado)-Number(p.valorAplicado)})),
  ].sort((a,b)=>b.ganho-a.ganho).map(r=>
    `<tr><td>${esc(r.nome)}</td><td>${esc(r.tipo)}</td><td style="text-align:right">R$ ${fmt(r.aplicado)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(r.atual)}</td><td style="text-align:right;color:${r.ganho>=0?'#3fb950':'#f85149'}">R$ ${fmt(r.ganho)}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Nenhum investimento ou previdência cadastrado ainda</td></tr>';

  // Seguros — Vigência e Status
  const linhasSeg = (DB.seguros||[]).slice().sort((a,b)=>a.vigenciaFim.localeCompare(b.vigenciaFim)).map(s=>{
    const sv = statusVisualSeguro(s);
    return `<tr><td>${esc(s.seguradora)}</td><td>${esc(s.tipo)}</td><td style="text-align:right">R$ ${fmt(s.valorPremio)}</td><td>${fmtD(s.vigenciaFim)}</td><td>${T(sv.label,sv.tag)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Nenhum seguro cadastrado ainda</td></tr>';

  // Fluxo de Caixa Mensal (evolução mês a mês)
  const porMes = {};
  lancRelBase.forEach(l=>{
    const mes = (l.data||'').slice(0,7);
    if(!mes) return;
    if(!porMes[mes]) porMes[mes]={entrada:0,saida:0};
    porMes[mes][l.tipo==='entrada'?'entrada':'saida'] += l.valor;
  });
  const mesesOrdenados = Object.keys(porMes).sort();
  const nomeMesFmt = mes => { const [ano,mm]=mes.split('-'); return new Date(Number(ano),Number(mm)-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}); };
  let saldoAcumMes = 0;
  const linhasMes = mesesOrdenados.map(mes=>{
    const v = porMes[mes];
    const resultado = v.entrada - v.saida;
    saldoAcumMes += resultado;
    return `<tr><td style="text-transform:capitalize">${esc(nomeMesFmt(mes))}</td><td style="text-align:right;color:#3fb950">R$ ${fmt(v.entrada)}</td><td style="text-align:right;color:#f85149">R$ ${fmt(v.saida)}</td><td style="text-align:right;font-weight:700;color:${resultado<0?'var(--red)':'#3fb950'}">R$ ${fmt(resultado)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoAcumMes)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Sem lançamentos ainda</td></tr>';
  const graficoMeses = grafDuploMes(mesesOrdenados.map(mes=>({label:nomeMesFmt(mes),entrada:porMes[mes].entrada,saida:porMes[mes].saida})));

  // Concentração de Despesas por Categoria (Pareto 80/20)
  const totalDespesasCat = Object.values(porCategoria).reduce((s,v)=>s+v.saida,0);
  let acumPct = 0;
  const catsOrdenadas = Object.entries(porCategoria).filter(([,v])=>v.saida>0).sort((a,b)=>b[1].saida-a[1].saida);
  const linhasPareto = catsOrdenadas.map(([nome,v])=>{
    const pct = totalDespesasCat? (v.saida/totalDespesasCat*100) : 0;
    acumPct += pct;
    return `<tr><td>${esc(nome)}</td><td style="text-align:right">R$ ${fmt(v.saida)}</td><td style="text-align:right">${pct.toFixed(1)}%</td><td style="text-align:right;font-weight:700;color:${acumPct<=80?'#3fb950':'var(--mut)'}">${acumPct.toFixed(1)}%</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Sem despesas ainda</td></tr>';
  const graficoPareto = grafBarraH(catsOrdenadas.slice(0,8).map(([nome,v])=>({label:nome,valor:v.saida})), '#f85149');

  // Maiores Lançamentos (Top 15 entradas + Top 15 saidas)
  const topEntradas = lancRelBase.filter(l=>l.tipo==='entrada').slice().sort((a,b)=>b.valor-a.valor).slice(0,15);
  const topSaidas = lancRelBase.filter(l=>l.tipo==='saida').slice().sort((a,b)=>b.valor-a.valor).slice(0,15);
  const linhasTop = (arr,cor)=>arr.map(l=>{
    const cta = contaById(l.contaId);
    return `<tr><td>${fmtD(l.data)}</td><td>${esc(cta?cta.titular:'-')}</td><td>${esc(l.contraparte||l.descricao||'-')}</td><td style="text-align:right;font-weight:700;color:${cor}">R$ ${fmt(l.valor)}</td></tr>`;
  }).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--mut)">Sem lançamentos</td></tr>`;

  // Transferências Entre Contas Próprias (por pareamento real) vs Fluxo de Caixa Real
  const { idsPareados: idsTransfInternas, suspeitasSemPar } = identificarTransferenciasInternas(lancRelBase);
  let transfEntrada=0, transfSaida=0, realEntrada=0, realSaida=0;
  lancRelBase.forEach(l=>{
    if(idsTransfInternas.has(l.id)){
      if(l.tipo==='entrada') transfEntrada+=l.valor; else transfSaida+=l.valor;
    } else {
      if(l.tipo==='entrada') realEntrada+=l.valor; else realSaida+=l.valor;
    }
  });
  const fluxoRealLiquido = realEntrada - realSaida;
  const linhasSuspeitas = suspeitasSemPar.slice().sort((a,b)=>b.valor-a.valor).map(l=>{
    const cta = contaById(l.contaId);
    return `<tr><td>${fmtD(l.data)}</td><td>${esc(cta?cta.titular:'-')}</td><td>${esc(l.contraparte||'-')}</td><td style="text-align:right">R$ ${fmt(l.valor)}</td><td>${l.tipo==='entrada'?'Entrada':'Saída'}</td></tr>`;
  }).join('');

  // Indicador de Liquidez / Meses de Reserva (baseado no fluxo real, exclui transferencias entre contas proprias)
  const nMesesComDados = mesesOrdenados.length||1;
  const mediaDespesaMensalReal = (realSaida)/nMesesComDados;
  const saldoAtualTotal = saldoTotalGeral();
  const mesesReserva = mediaDespesaMensalReal>0 ? (saldoAtualTotal/mediaDespesaMensalReal) : 0;

  // Cartões — resumo (integração com CartoesPF/PJ) e histórico de faturas pagas
  const cartoesPF = _resumoCartoes?.pf?.totalAberto||0;
  const cartoesPJ = _resumoCartoes?.pj?.totalAberto||0;
  const catFatCartao = categoriaPorNome('Fatura Cartão de Crédito','despesa');
  const lancFatCartao = catFatCartao ? lancRelBase.filter(l=>l.categoriaId===catFatCartao.id) : [];
  const totalPagoFaturas = lancFatCartao.reduce((s,l)=>s+l.valor,0);
  const porContaFatura = {};
  lancFatCartao.forEach(l=>{
    const cta = contaById(l.contaId);
    const nome = cta?cta.titular:'(conta removida)';
    porContaFatura[nome] = (porContaFatura[nome]||0) + l.valor;
  });
  const linhasFaturaConta = Object.entries(porContaFatura).sort((a,b)=>b[1]-a[1]).map(([nome,total])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right;font-weight:700">R$ ${fmt(total)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:var(--mut)">Nenhum pagamento de fatura lançado ainda</td></tr>';
  const linhasFaturaHist = lancFatCartao.slice().sort((a,b)=>b.data.localeCompare(a.data)).map(l=>{
    const cta = contaById(l.contaId);
    return `<tr><td>${fmtD(l.data)}</td><td>${esc(cta?cta.titular:'-')}</td><td>${esc(l.descricao||'-')}</td><td style="text-align:right;font-weight:700">R$ ${fmt(l.valor)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Nenhum pagamento de fatura lançado ainda</td></tr>';

  // Posição Financeira Consolidada (Sessão 4 — puxa resumo do CartoesPF/PJ)
  const totalReceberPend = contasReceberPendentes().reduce((s,cr)=>s+cr.valor,0);
  const totalPagarPend = contasPagarPendentes().reduce((s,cp)=>s+cp.valor,0);
  const posicaoLiquida = saldoTotalGeral() + totalSaldoChequeSys() + totalPatrimonioInvestido() + totalReceberPend - totalPagarPend - chequesEmitidosPendentes().reduce((s,c)=>s+Number(c.valor||0),0) - cartoesPF - cartoesPJ;

  // ── Cartões por Direcionamento (PF + PJ) ──
  const direcPF = _resumoCartoes?.pf?.porDirecionamento || {};
  const direcPJ = _resumoCartoes?.pj?.porDirecionamento || {};
  const linhasDirecionamento = (tag,obj)=>Object.entries(obj).sort((a,b)=>b[1].total-a[1].total).map(([nome,v])=>
    `<tr><td>${esc(nome)} ${T(tag,tag==='PF'?'az':'pur')}</td><td style="text-align:right">${v.qtd}</td><td style="text-align:right;font-weight:700">R$ ${fmt(v.total)}</td></tr>`
  ).join('');
  const linhasDirecTotal = (linhasDirecionamento('PF',direcPF)+linhasDirecionamento('PJ',direcPJ)) || '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Sem dados ainda — abra a aba Cartões para carregar</td></tr>';

  // ── ChequeSys por Emitente (cheques) e por Sacado (boletos) — carteira ativa ──
  const porEmitenteChq = _resumoChequeSys?.porEmitente || {};
  const porSacadoChq = _resumoChequeSys?.porSacado || {};
  const linhasEmitenteChq = Object.entries(porEmitenteChq).sort((a,b)=>b[1].total-a[1].total).map(([nome,v])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right">${v.qtd}</td><td style="text-align:right;font-weight:700">R$ ${fmt(v.total)}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Sem dados ainda — abra a aba ChequeSys para carregar</td></tr>';
  const linhasSacadoChq = Object.entries(porSacadoChq).sort((a,b)=>b[1].total-a[1].total).map(([nome,v])=>
    `<tr><td>${esc(nome)}</td><td style="text-align:right">${v.qtd}</td><td style="text-align:right;font-weight:700">R$ ${fmt(v.total)}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Sem dados ainda — abra a aba ChequeSys para carregar</td></tr>';
  const secoes = {
    resumo_graficos: `
      <div class="card" style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:10px">🧭 Posição Financeira Consolidada</div>
        <table><tbody>
          <tr><td>Saldo em Contas Bancárias (TesourariaSys)</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(saldoTotalGeral())}</td></tr>
          <tr><td>Saldo em Contas do ChequeSys${_resumoChequeSys?.erro?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(totalSaldoChequeSys())}</td></tr>
          <tr><td>Patrimônio Investido (Investimentos + Previdência)</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(totalPatrimonioInvestido())}</td></tr>
          <tr><td>Contas a Receber Pendentes</td><td style="text-align:right;color:#3fb950">+ R$ ${fmt(totalReceberPend)}</td></tr>
          <tr><td>Contas a Pagar Pendentes</td><td style="text-align:right;color:#f85149">− R$ ${fmt(totalPagarPend)}</td></tr>
          <tr><td>Cheques Emitidos Aguardando Compensação</td><td style="text-align:right;color:#f85149">− R$ ${fmt(chequesEmitidosPendentes().reduce((s,c)=>s+Number(c.valor||0),0))}</td></tr>
          <tr><td>Fatura Cartão PF em Aberto${_resumoCartoes?.erroPf?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#f85149">− R$ ${fmt(cartoesPF)}</td></tr>
          <tr><td>Fatura Cartão PJ em Aberto${_resumoCartoes?.erroPj?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#f85149">− R$ ${fmt(cartoesPJ)}</td></tr>
          <tr class="trow"><td>Posição Líquida</td><td style="text-align:right;font-size:16px;color:${posicaoLiquida<0?'var(--red)':'var(--acc)'}">R$ ${fmt(posicaoLiquida)}</td></tr>
        </tbody></table>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:10px">💧 Liquidez — Meses de Reserva</div>
        <table><tbody>
          <tr><td>Saldo total atual em contas</td><td style="text-align:right;font-weight:700">R$ ${fmt(saldoAtualTotal)}</td></tr>
          <tr><td>Despesa real média mensal (${nMesesComDados} ${nMesesComDados===1?'mês':'meses'} com dados)</td><td style="text-align:right">R$ ${fmt(mediaDespesaMensalReal)}</td></tr>
          <tr class="trow"><td>Meses de reserva (cobertura no ritmo atual de gasto)</td><td style="text-align:right;font-size:16px;color:${mesesReserva<1?'var(--red)':(mesesReserva<3?'#f0a500':'#3fb950')}">${mesesReserva.toFixed(1)} meses</td></tr>
        </tbody></table>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:10px">📊 Gráfico — Entradas x Saídas por Mês</div>
        ${graficoMeses}
      </div>
      <div class="card" style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:10px">📉 Gráfico — Maiores Categorias de Despesa (Top 8)</div>
        ${graficoPareto}
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:10px">🔀 Transferências Entre Contas Próprias (por pareamento) vs Fluxo de Caixa Real</div>
        <table><tbody>
          <tr><td>Receitas reais (excluindo transferências próprias)</td><td style="text-align:right;color:#3fb950">R$ ${fmt(realEntrada)}</td></tr>
          <tr><td>Despesas reais (excluindo transferências próprias)</td><td style="text-align:right;color:#f85149">R$ ${fmt(realSaida)}</td></tr>
          <tr><td>Movimentado só entre contas próprias (entrada/saída, pareado por valor+data)</td><td style="text-align:right;color:var(--mut)">R$ ${fmt(transfEntrada)} / R$ ${fmt(transfSaida)}</td></tr>
          <tr class="trow"><td>Fluxo de Caixa Real Líquido</td><td style="text-align:right;font-size:16px;color:${fluxoRealLiquido<0?'var(--red)':'var(--acc)'}">R$ ${fmt(fluxoRealLiquido)}</td></tr>
        </tbody></table>
        <div style="color:var(--mut);font-size:11px;margin-top:8px">Identificadas por pareamento real (mesma quantia, contas diferentes, até 2 dias de diferença) — não só pelo nome, então um cliente real chamado "Fabio Oliveira" não seria classificado como transferência interna por engano.</div>
        ${suspeitasSemPar.length ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bor)">
          <div style="font-weight:700;margin-bottom:8px;color:#f0a500">⚠️ ${suspeitasSemPar.length} lançamento(s) com nome "Fabio Oliveira" sem par encontrado — revisar manualmente</div>
          <table><thead><tr><th>Data</th><th>Conta</th><th>Contraparte</th><th style="text-align:right">Valor</th><th>Tipo</th></tr></thead><tbody>${linhasSuspeitas}</tbody></table>
          <div style="color:var(--mut);font-size:11px;margin-top:8px">Estão contados como receita/despesa real acima (não como transferência), porque não foi possível confirmar a outra ponta — pode ser um extrato que ainda falta importar, ou pode ser mesmo um lançamento de terceiro.</div>
        </div>` : ''}
      </div>`,
    fluxo_mensal: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📅 Fluxo de Caixa Mensal</div>
      <table><thead><tr><th>Mês</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Resultado do Mês</th><th style="text-align:right">Saldo Acumulado</th></tr></thead><tbody>${linhasMes}</tbody></table></div>`,
    pareto_despesas: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📉 Concentração de Despesas por Categoria (Curva de Pareto)</div>
      <table><thead><tr><th>Categoria</th><th style="text-align:right">Total Gasto</th><th style="text-align:right">% do Total</th><th style="text-align:right">% Acumulado</th></tr></thead><tbody>${linhasPareto}</tbody></table>
      <div style="color:var(--mut);font-size:11px;margin-top:8px">Categorias em verde no acumulado somam até 80% do total — prioritárias para controle de custos.</div></div>`,
    top_entradas: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🔝 Maiores Lançamentos — Top 15 Entradas</div>
      <table><thead><tr><th>Data</th><th>Conta</th><th>Contraparte/Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhasTop(topEntradas,'#3fb950')}</tbody></table></div>`,
    top_saidas: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🔝 Maiores Lançamentos — Top 15 Saídas</div>
      <table><thead><tr><th>Data</th><th>Conta</th><th>Contraparte/Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhasTop(topSaidas,'#f85149')}</tbody></table></div>`,
    fluxo_categoria: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📊 Fluxo de Caixa por Categoria (histórico completo)</div>
      <table><thead><tr><th>Categoria</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Resultado</th></tr></thead><tbody>${linhasCat}</tbody></table></div>`,
    fluxo_centro_custo: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🏷️ Fluxo de Caixa por Centro de Custo (histórico completo)</div>
      <table><thead><tr><th>Centro de Custo</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Resultado</th></tr></thead><tbody>${linhasCCGeral}</tbody></table></div>`,
    mov_contraparte: `<div class="card"><div style="font-weight:700;margin-bottom:10px">👥 Movimentação por Cliente/Fornecedor</div>
      <table><thead><tr><th>Cliente/Fornecedor</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th></tr></thead><tbody>${linhasContraparte}</tbody></table></div>`,
    investimentos: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📈 Rentabilidade — Investimentos e Previdência</div>
      <table><thead><tr><th>Instituição</th><th>Tipo</th><th style="text-align:right">Aplicado</th><th style="text-align:right">Posição Atual</th><th style="text-align:right">Ganho</th></tr></thead><tbody>${linhasRent}</tbody></table></div>`,
    seguros: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🛡️ Seguros — Vigência e Status</div>
      <table><thead><tr><th>Seguradora</th><th>Tipo</th><th style="text-align:right">Prêmio</th><th>Vigência Fim</th><th>Status</th></tr></thead><tbody>${linhasSeg}</tbody></table></div>`,
    saldo_conta: `<div class="card"><div style="font-weight:700;margin-bottom:10px">💰 Saldo Consolidado por Conta (TesourariaSys + ChequeSys)</div>
      <table><thead><tr><th>Conta</th><th style="text-align:right">Saldo</th></tr></thead><tbody>${linhasContas}${(_resumoChequeSys?.contas||[]).map(c=>`<tr><td>${esc(c.nome)} ${T('ChequeSys','pur')}</td><td style="text-align:right;font-weight:700;color:${c.saldo<0?'var(--red)':'inherit'}">R$ ${fmt(c.saldo)}</td></tr>`).join('')}</tbody></table></div>`,
    extrato_conta: '',
    tarifas_conta: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🏦 Tarifas Bancárias por Conta</div>
      <table><thead><tr><th>Conta</th><th style="text-align:right">Total em Tarifas</th></tr></thead><tbody>${linhasTarifa}</tbody></table></div>`,
    pagar_cc: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📤 Contas a Pagar Pendentes por Centro de Custo</div>
      <table><thead><tr><th>Centro de Custo</th><th style="text-align:right">Total Pendente</th></tr></thead><tbody>${linhasCC}</tbody></table></div>`,
    pagar_fornecedor: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🏭 Total Pago por Fornecedor</div>
      <table><thead><tr><th>Fornecedor</th><th style="text-align:right">Total Pago</th></tr></thead><tbody>${linhasForn}</tbody></table></div>`,
    pagar_periodo: '',
    cheques_emitidos: `<div class="card"><div style="font-weight:700;margin-bottom:10px">✍️ Cheques Emitidos Aguardando Compensação</div>
      <table><thead><tr><th>Conta Emissora</th><th>Favorecido</th><th>Previsão</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhasChq}</tbody></table></div>`,
    receber_cc: `<div class="card"><div style="font-weight:700;margin-bottom:10px">📥 Contas a Receber Pendentes por Centro de Custo</div>
      <table><thead><tr><th>Centro de Custo</th><th style="text-align:right">Total Pendente</th></tr></thead><tbody>${linhasCCReceber}</tbody></table></div>`,
    receber_cliente: `<div class="card"><div style="font-weight:700;margin-bottom:10px">🤝 Total Recebido por Cliente</div>
      <table><thead><tr><th>Cliente</th><th style="text-align:right">Total Recebido</th></tr></thead><tbody>${linhasCliente}</tbody></table></div>`,
    receber_periodo: '',
    cartoes_resumo: `<div class="card" style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:10px">💳 Faturas de Cartão em Aberto (integração com CartoesPF/PJ)</div>
      <table><tbody>
        <tr><td>Fatura Cartão PF em Aberto${_resumoCartoes?.erroPf?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#f85149;font-weight:700">R$ ${fmt(cartoesPF)}</td></tr>
        <tr><td>Fatura Cartão PJ em Aberto${_resumoCartoes?.erroPj?' <span style="color:var(--mut);font-size:11px">(indisponível)</span>':''}</td><td style="text-align:right;color:#f85149;font-weight:700">R$ ${fmt(cartoesPJ)}</td></tr>
        <tr class="trow"><td>Total pago em faturas de cartão (histórico, via TesourariaSys)</td><td style="text-align:right;font-size:16px">R$ ${fmt(totalPagoFaturas)}</td></tr>
      </tbody></table></div>
      <div class="card"><div style="font-weight:700;margin-bottom:10px">💳 Total Pago em Faturas por Conta</div>
      <table><thead><tr><th>Conta</th><th style="text-align:right">Total Pago</th></tr></thead><tbody>${linhasFaturaConta}</tbody></table></div>`,
    cartoes_historico: `<div class="card"><div style="font-weight:700;margin-bottom:10px">💳 Histórico de Pagamentos de Fatura de Cartão</div>
      <table><thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhasFaturaHist}</tbody></table></div>`,
    cartoes_direcionamento: `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">🧭 Compras por Direcionamento (integração com CartoesPF/PJ)</div>
      <div style="margin-bottom:10px">${B('🔄 Atualizar agora','atualizarResumoCartoes(false)','var(--sur)','var(--txt)')}</div>
      <table><thead><tr><th>Direcionamento</th><th style="text-align:right">Qtd. Compras</th><th style="text-align:right">Total</th></tr></thead><tbody>${linhasDirecTotal}</tbody></table>
      <div style="color:var(--mut);font-size:11px;margin-top:8px">Histórico completo de compras (não só o mês em aberto). Dados carregados automaticamente ao abrir esta categoria.</div>
    </div>`,
    chq_emitentes: `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">🧾 Carteira Ativa por Emitente (Cheques — ChequeSys)</div>
      <div style="margin-bottom:10px">${B('🔄 Atualizar agora','atualizarResumoChequeSys(false)','var(--sur)','var(--txt)')}</div>
      <table><thead><tr><th>Emitente</th><th style="text-align:right">Qtd. Cheques</th><th style="text-align:right">Total (bruto)</th></tr></thead><tbody>${linhasEmitenteChq}</tbody></table>
      <div style="color:var(--mut);font-size:11px;margin-top:8px">Considera cheques em mãos, devolvidos ou reapresentados (carteira ativa), exceto cheques em caução.</div>
    </div>`,
    chq_sacados: `<div class="card">
      <div style="font-weight:700;margin-bottom:10px">🧾 Carteira Ativa por Sacado (Boletos — ChequeSys)</div>
      <div style="margin-bottom:10px">${B('🔄 Atualizar agora','atualizarResumoChequeSys(false)','var(--sur)','var(--txt)')}</div>
      <table><thead><tr><th>Sacado</th><th style="text-align:right">Qtd. Boletos</th><th style="text-align:right">Total (bruto)</th></tr></thead><tbody>${linhasSacadoChq}</tbody></table>
      <div style="color:var(--mut);font-size:11px;margin-top:8px">Considera boletos em carteira, enviados, devolvidos ou reapresentados (carteira ativa), exceto boletos em caução.</div>
    </div>`,
  };
  return secoes;
}


// ══════════════════════════════════════════
// RENDER — CADASTROS (Categorias / Centro de Custo / Usuários)
// ══════════════════════════════════════════
function badgePFPJ(tipoPFPJ){
  const t = tipoPFPJ||'ambos';
  const cor = t==='PF'?'az':t==='PJ'?'pur':'cz';
  const label = t==='PF'?'PF':t==='PJ'?'PJ':'Ambos';
  return T(label, cor);
}
let _abaCadastro = 'categorias';
function irParaCadastro(sub){ _abaCadastro=sub; renderAba(); }
function htmlCadastros(){
  const sub = _abaCadastro;
  const abas = [
    {id:'categorias', r:'Categorias'},
    {id:'centrocusto', r:'Centro de Custo'},
    {id:'direcionamentos', r:'Direcionamentos'},
    {id:'fornecedores', r:'Fornecedores'},
    {id:'clientes', r:'Clientes'},
    {id:'usuarios', r:'Usuários'},
    {id:'integracoes', r:'Integrações'},
  ];
  const tabsHtml = `<div class="row" style="margin-bottom:14px">${abas.map(a=>
    `<button type="button" class="tab${sub===a.id?' ativo':''}" style="background:${sub===a.id?'var(--acc)':'var(--sur)'};color:${sub===a.id?'#000':'var(--txt)'};padding:6px 14px" onclick="irParaCadastro('${a.id}')">${a.r}</button>`
  ).join('')}<button type="button" class="tab" style="background:var(--pur);color:#fff;padding:6px 14px" onclick="abrirClassificacaoPFPJ()">🔀 Classificar PF/PJ</button></div>`;

  let corpo = '';
  if(sub==='categorias'){
    const receitas = (DB.categorias||[]).filter(c=>c.tipo==='receita');
    const despesas = (DB.categorias||[]).filter(c=>c.tipo==='despesa');
    const vinculoTxt = c => (c.centrosCustoIds||[]).length ? (c.centrosCustoIds||[]).map(id=>{const cc=centroCustoById(id); return cc?esc(nomeCompletoCentroCusto(cc)):'';}).filter(Boolean).join(', ') : '<span style="color:var(--mut)">Todos</span>';
    const linha = (c, sub) => `<tr${sub?' style="background:var(--bg)"':''}><td>${sub?'&nbsp;&nbsp;— ':''}${esc(c.nome)}</td><td>${badgePFPJ(c.tipoPFPJ)}</td><td style="font-size:11px">${vinculoTxt(c)}</td><td>${B('✏','editarCategoria(\''+c.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`;
    const arvore = lista => {
      const pais = lista.filter(c=>!c.parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      const filhosDe = pid => lista.filter(c=>c.parentId===pid).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      return pais.map(p=>linha(p,false)+filhosDe(p.id).map(f=>linha(f,true)).join('')).join('');
    };
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Nova Categoria','novaCategoria()','var(--acc)')}</div>
      <div style="font-size:11px;color:var(--mut);margin:-6px 0 12px">Categorias indentadas com "—" são subcategorias.</div>
      <div class="row">
        <div class="card" style="flex:1;min-width:280px">
          <div style="font-weight:700;color:#3fb950;margin-bottom:8px">Receitas</div>
          <table><thead><tr><th>Nome</th><th>PF/PJ</th><th>Centro(s) de Custo</th><th></th></tr></thead><tbody>${arvore(receitas)||'<tr><td style="color:var(--mut)">Nenhuma</td></tr>'}</tbody></table>
        </div>
        <div class="card" style="flex:1;min-width:280px">
          <div style="font-weight:700;color:#f85149;margin-bottom:8px">Despesas</div>
          <table><thead><tr><th>Nome</th><th>PF/PJ</th><th>Centro(s) de Custo</th><th></th></tr></thead><tbody>${arvore(despesas)||'<tr><td style="color:var(--mut)">Nenhuma</td></tr>'}</tbody></table>
        </div>
      </div>`;
  } else if(sub==='centrocusto'){
    const linhaCC = (cc, subN) => `<tr${subN?' style="background:var(--bg)"':''}><td>${subN?'&nbsp;&nbsp;— ':''}${esc(cc.nome)}</td><td>${badgePFPJ(cc.tipoPFPJ)}</td><td>${esc(cc.obs||'-')}</td><td>${B('✏','editarCentroCusto(\''+cc.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`;
    const paisCC = (DB.centrosCusto||[]).filter(c=>!c.parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const filhosDeCC = pid => (DB.centrosCusto||[]).filter(c=>c.parentId===pid).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const linhas = paisCC.map(p=>linhaCC(p,false)+filhosDeCC(p.id).map(f=>linhaCC(f,true)).join('')).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Nenhum centro de custo cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Centro de Custo','novoCentroCusto()','var(--acc)')}</div>
      <div style="font-size:11px;color:var(--mut);margin:-6px 0 12px">Centros indentados com "—" são sub-centros.</div>
      <div class="card"><table><thead><tr><th>Nome</th><th>PF/PJ</th><th>Observações</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='direcionamentos'){
    const linhaDrc = (d, subN) => `<tr${subN?' style="background:var(--bg)"':''}><td>${subN?'&nbsp;&nbsp;— ':''}${esc(d.nome)}</td><td>${badgePFPJ(d.tipoPFPJ)}</td><td>${esc(d.obs||'-')}</td><td>${B('✏','editarDirecionamento(\''+d.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`;
    const paisDrc = (DB.direcionamentos||[]).filter(d=>!d.parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const filhosDeDrc = pid => (DB.direcionamentos||[]).filter(d=>d.parentId===pid).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const linhas = paisDrc.map(p=>linhaDrc(p,false)+filhosDeDrc(p.id).map(f=>linhaDrc(f,true)).join('')).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Nenhum direcionamento cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Direcionamento','novoDirecionamento()','var(--acc)')}</div>
      <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Direcionamentos cadastrados aqui aparecem como sugestão no campo "Direcionamento" dos Lançamentos (ex: Obra X, Setor Y). Direcionamentos indentados com "—" são subdirecionamentos — a sugestão vem no formato "Mãe: Sub".</div>
      <div class="card"><table><thead><tr><th>Nome</th><th>PF/PJ</th><th>Observações</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='fornecedores'){
    const linhas = (DB.fornecedores||[]).map(f=>`<tr>
      <td>${esc(f.nome)}</td><td>${badgePFPJ(f.tipoPFPJ)}</td><td>${esc(f.cpfCnpj||'-')}</td><td>${esc(f.telefone||'-')}</td><td>${esc(f.email||'-')}</td>
      <td>${B('✏','editarFornecedor(\''+f.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--mut)">Nenhum fornecedor cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Fornecedor','novoFornecedor()','var(--acc)')}</div>
      <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Fornecedores cadastrados aqui aparecem como sugestão automática no campo "Favorecido" das Contas a Pagar — só para contas do mesmo PF/PJ (ou "Ambos").</div>
      <div class="card"><table><thead><tr><th>Nome</th><th>PF/PJ</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='clientes'){
    const linhas = (DB.clientes||[]).map(c=>`<tr>
      <td>${esc(c.nome)}</td><td>${badgePFPJ(c.tipoPFPJ)}</td><td>${esc(c.cpfCnpj||'-')}</td><td>${esc(c.telefone||'-')}</td><td>${esc(c.email||'-')}</td>
      <td>${B('✏','editarCliente(\''+c.id+'\')','var(--sur)','var(--txt)',1)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--mut)">Nenhum cliente cadastrado</td></tr>';
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Cliente','novoCliente()','var(--acc)')}</div>
      <div style="font-size:11px;color:var(--mut);margin-bottom:10px">Clientes cadastrados aqui aparecem como sugestão automática no campo "Cliente/Fornecedor" dos Lançamentos — só para contas do mesmo PF/PJ (ou "Ambos").</div>
      <div class="card"><table><thead><tr><th>Nome</th><th>PF/PJ</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='usuarios'){
    const linhas = (DB.usuarios||[]).map(u=>`<tr style="${u.ativo===false?'opacity:.5':''}">
      <td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${T(LABELS_PERFIL[u.perfil]||u.perfil,u.perfil==='master'?'am':u.perfil==='operador'?'az':'cz')}</td>
      <td>${u.ativo===false?T('Inativo','cz'):T('Ativo','vd')}</td>
      <td>
        ${B('✏','editarUsuario(\''+u.id+'\')','var(--sur)','var(--txt)',1)}
        ${B('🔑','alterarSenhaUsuario(\''+u.id+'\')','var(--sur)','var(--txt)',1,'Alterar senha')}
        ${B(u.ativo===false?'↩':'⏸','toggleAtivoUsuario(\''+u.id+'\')','var(--sur)','var(--txt)',1,u.ativo===false?'Ativar':'Desativar')}
      </td></tr>`).join('');
    corpo = `
      <div class="row" style="margin-bottom:12px">${B('➕ Novo Usuário','novoUsuario()','var(--acc)')}</div>
      <div class="card"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  } else if(sub==='integracoes'){
    const r = _resumoCartoes;
    const rq = _resumoChequeSys;
    corpo = `
      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:8px">💳 CartoesPF / CartoesPJ</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:12px;line-height:1.5">
          Integração somente-leitura: o TesourariaSys lê o total de faturas em aberto direto do repositório Fabio9500/Cartoes, sem nunca alterar nada por lá.
        </div>
        <div style="font-size:13px;line-height:1.8;margin-bottom:12px">
          <div>Token CartoesPF: ${getTokenCartoesPF()?T('Configurado','vd'):T('Não configurado','cz')}</div>
          <div>Token CartoesPJ: ${getTokenCartoesPJ()?T('Configurado','vd'):T('Não configurado','cz')}</div>
          ${r?.atualizadoEm?`<div style="color:var(--mut);font-size:11px;margin-top:6px">Última atualização: ${new Date(r.atualizadoEm).toLocaleString('pt-BR')}</div>`:''}
        </div>
        <div class="row">
          ${B('⚙ Configurar Tokens','configurarTokensCartoes()','var(--acc)')}
          ${B('🔄 Atualizar Agora','atualizarResumoCartoes(false)','var(--sur)','var(--txt)')}
        </div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">🔗 ChequeSys</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:12px;line-height:1.5">
          O TesourariaSys lê o dados.json do ChequeSys, sem nunca alterar nada por lá. Contas que você mapear abaixo passam a ter os lançamentos de caixa do ChequeSys espelhados automaticamente como lançamentos reais aqui.
        </div>
        <div style="font-size:13px;line-height:1.8;margin-bottom:12px">
          <div>Token ChequeSys: ${getTokenChequeSys()?T('Configurado','vd'):T('Não configurado','cz')}</div>
          ${rq?.erro?`<div style="color:var(--mut);font-size:11px">${esc(rq.erro)}</div>`:''}
          ${rq?.contas?.length?`<div style="margin-top:4px">${rq.contas.length} conta(s) encontrada(s) no ChequeSys — total R$ ${fmt(rq.total)}</div>`:''}
          <div style="margin-top:4px">Contas mapeadas (sincronizando): ${Object.keys(DB.integracaoChequeSys?.mapaContas||{}).length}${DB.integracaoChequeSys?.contaPadrao?' + conta padrão':''}</div>
          <div style="margin-top:4px">Lançamentos sincronizados: ${Object.keys(DB.integracaoChequeSys?.sincronizados||{}).length}</div>
          ${rq?.atualizadoEm?`<div style="color:var(--mut);font-size:11px;margin-top:6px">Última atualização: ${new Date(rq.atualizadoEm).toLocaleString('pt-BR')}</div>`:''}
        </div>
        <div class="row">
          ${B('⚙ Configurar Token','configurarTokenChequeSys()','var(--acc)')}
          ${B('🔗 Mapear Contas','abrirMapeamentoChequeSys()','var(--acc)')}
          ${B('🔄 Sincronizar Agora','sincronizarCaixaChequeSys(false)','var(--sur)','var(--txt)')}
        </div>

      </div>`;
  }

  return `<div class="titulo acc">🗂 Cadastros</div>${tabsHtml}${corpo}`;
}

// ── CRUD Usuários (Master/Operador/Consulta) ──
function novoUsuario(){
  AM('➕ Novo Usuário',`
    ${EH('e-usu')}
    <div class="row">
      ${C('Nome *',`<input id="usu-nome" placeholder="Nome completo">`,'2','160')}
      ${C('Login *',`<input id="usu-login" placeholder="login" style="text-transform:lowercase" oninput="this.value=this.value.toLowerCase()">`,'1','120')}
    </div>
    ${C('Perfil',`<select id="usu-perfil">
      <option value="operador">Operador</option>
      <option value="master">Master</option>
      <option value="consulta">Consulta (somente leitura)</option>
    </select>`,'1','200')}
    ${C('Senha *',`<input type="password" id="usu-senha" placeholder="Mínimo 4 caracteres">`,'1','160')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('✅ Criar Usuário','salvarNovoUsuario()','var(--grn)','#fff')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarNovoUsuario(){
  const nome  = document.getElementById('usu-nome')?.value?.trim()||'';
  const login = document.getElementById('usu-login')?.value?.trim()||'';
  const perfil= document.getElementById('usu-perfil')?.value||'operador';
  const senha = document.getElementById('usu-senha')?.value||'';
  if(!nome)  { ME('e-usu','Informe o nome.'); return; }
  if(!login) { ME('e-usu','Informe o login.'); return; }
  if(senha.length<4){ ME('e-usu','Senha precisa ter ao menos 4 caracteres.'); return; }
  if((DB.usuarios||[]).find(u=>u.login===login)){ ME('e-usu','Este login já está em uso.'); return; }
  const hash = await hashSenha(senha);
  const novo = {id:uid(), nome, login, hash, perfil, ativo:true};
  salvar({...DB, usuarios:[...(DB.usuarios||[]),novo]});
  FM();
}
function editarUsuario(id){
  const u = (DB.usuarios||[]).find(x=>x.id===id); if(!u) return;
  AM('✏ Editar Usuário — '+esc(u.nome), `
    ${EH('e-usu-ed')}
    <div class="row">
      ${C('Nome *',`<input id="eusu-nome" value="${esc(u.nome)}">`,'2','160')}
      ${C('Login',`<input id="eusu-login" value="${esc(u.login||'')}" style="text-transform:lowercase" oninput="this.value=this.value.toLowerCase()">`,'1','120')}
    </div>
    ${C('Perfil',`<select id="eusu-perfil">
      <option value="operador"${u.perfil==='operador'?' selected':''}>Operador</option>
      <option value="master"${u.perfil==='master'?' selected':''}>Master</option>
      <option value="consulta"${u.perfil==='consulta'?' selected':''}>Consulta (somente leitura)</option>
    </select>`,'1','200')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar','salvarEdicaoUsuario(\''+id+'\')' ,'var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
function salvarEdicaoUsuario(id){
  const nome  = document.getElementById('eusu-nome')?.value?.trim()||'';
  const login = document.getElementById('eusu-login')?.value?.trim()||'';
  const perfil= document.getElementById('eusu-perfil')?.value||'operador';
  if(!nome){ ME('e-usu-ed','Informe o nome.'); return; }
  const novoUsuarios = (DB.usuarios||[]).map(u=>u.id===id?{...u,nome,login,perfil}:u);
  salvar({...DB, usuarios:novoUsuarios});
  if(USUARIO_ATUAL?.id===id){ USUARIO_ATUAL={...USUARIO_ATUAL,nome,perfil}; localStorage.setItem('tsr_usu',JSON.stringify(USUARIO_ATUAL)); atualizarNavUsuario(); }
  FM();
}
function alterarSenhaUsuario(id){
  const u = (DB.usuarios||[]).find(x=>x.id===id); if(!u) return;
  AM('🔑 Alterar Senha — '+esc(u.nome), `
    ${EH('e-senha-ed')}
    ${C('Nova Senha *',`<input type="password" id="nova-senha-usu" placeholder="Mínimo 4 caracteres">`,'1','180')}
    ${C('Confirmar Senha *',`<input type="password" id="nova-senha-usu2" placeholder="Repita a nova senha">`,'1','180')}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${B('💾 Salvar Senha','salvarNovaSenhaUsuario(\''+id+'\')' ,'var(--acc)')}
      ${B('Cancelar','FM()','var(--sur)','var(--txt)')}
    </div>
  `);
}
async function salvarNovaSenhaUsuario(id){
  const s1 = document.getElementById('nova-senha-usu')?.value||'';
  const s2 = document.getElementById('nova-senha-usu2')?.value||'';
  if(s1.length<4){ ME('e-senha-ed','Senha precisa ter ao menos 4 caracteres.'); return; }
  if(s1!==s2)    { ME('e-senha-ed','As senhas não coincidem.'); return; }
  const hash = await hashSenha(s1);
  salvar({...DB, usuarios:(DB.usuarios||[]).map(u=>u.id===id?{...u,hash}:u)});
  FM();
}
function toggleAtivoUsuario(id){
  const u = (DB.usuarios||[]).find(x=>x.id===id); if(!u) return;
  const acao = u.ativo!==false ? 'desativar' : 'ativar';
  CF(`${acao.charAt(0).toUpperCase()+acao.slice(1)} o usuário ${u.nome}?`, ()=>{
    salvar({...DB, usuarios:(DB.usuarios||[]).map(x=>x.id===id?{...x,ativo:u.ativo===false}:x)});
  });
}

// ══════════════════════════════════════════
// PWA — SERVICE WORKER
// ══════════════════════════════════════════
let _swReg=null;
function registrarSW(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js',{scope:'./'})
    .then(reg=>{
      _swReg=reg;
      reg.addEventListener('updatefound',()=>{
        const nSW=reg.installing;
        nSW.addEventListener('statechange',()=>{
          if(nSW.state==='installed'&&navigator.serviceWorker.controller) mostrarAtualizacaoSW();
        });
      });
    })
    .catch(err=>console.warn('[TesourariaSys] SW não registrado:',err));
  navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
}
function mostrarAtualizacaoSW(){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;top:58px;left:50%;transform:translateX(-50%);background:var(--acc);color:#000;padding:10px 18px;border-radius:20px;font-size:12px;font-weight:700;z-index:9999;cursor:pointer;box-shadow:0 4px 12px #0006;white-space:nowrap';
  el.innerHTML='🔄 Nova versão disponível — toque para atualizar';
  el.onclick=()=>{ if(_swReg&&_swReg.waiting)_swReg.waiting.postMessage('SKIP_WAITING'); el.remove(); };
  document.body.appendChild(el); setTimeout(()=>el.remove(),8000);
}
registrarSW();
