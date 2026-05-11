// ===========================
// CONFIG & CONSTANTS
// ===========================
const DEFAULT_PIN = '1234';
const COLORS = ['#7c6fcd','#4ecdc4','#f4a261','#ff6b6b','#6bcb77','#a8dadc','#e9c46a','#e76f51'];

// ===========================
// STATE
// ===========================
let adminPin          = DEFAULT_PIN;
let employees         = [];
let tasks             = [];
let currentRole       = null;
let currentEmployee   = null;
let pinTarget         = null;
let selectedPriority  = 'med';
let photoData         = null;
let adminStatusFilter = 'all';
let adminEmpFilter    = 'all';
let editingEmpId      = null;
let selectedColor     = COLORS[0];
let doneTaskId        = null;
let viewingTaskId     = null;
let pinBuffer         = '';

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadInitialData();
    setupRealtimeListeners();
  } catch(e) {
    console.error('Firebase error:', e);
    showToast('⚠️ Sin conexión. Verifica la configuración de Firebase.');
  }
  initColorPicker();
  setDefaultDeadline();
  showScreen('screen-role');
});

// ===========================
// FIREBASE — CARGA INICIAL
// ===========================
async function loadInitialData() {
  // Admin PIN
  const cfg = await db.collection('config').doc('settings').get();
  if(cfg.exists && cfg.data().adminPin) adminPin = cfg.data().adminPin;

  // Employees
  const empSnap = await db.collection('employees').get();
  employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Tasks (ordered by creation date)
  const taskSnap = await db.collection('tasks').orderBy('createdAt','desc').get();
  tasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===========================
// FIREBASE — REAL-TIME SYNC
// ===========================
function setupRealtimeListeners() {
  // Listen for employees changes in real-time
  db.collection('employees').onSnapshot(snap => {
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(currentRole === 'admin') {
      renderEmployeeList(); populateAssignSelect(); populateFilterSelect();
    }
  });

  // Listen for tasks changes in real-time
  db.collection('tasks').orderBy('createdAt','desc').onSnapshot(snap => {
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(currentRole === 'admin')    { renderAdminTasks(); updateAdminBadge(); }
    if(currentRole === 'employee') { renderEmployeeView(); }
  });
}

// ===========================
// NAVIGATION
// ===========================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.add('hidden'); s.classList.remove('active'); });
  const el = document.getElementById(id);
  if(el){ el.classList.remove('hidden'); el.classList.add('active'); }
}

function goHome() {
  currentRole = null; currentEmployee = null;
  showScreen('screen-role');
}

// ===========================
// MODALS
// ===========================
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  if(id === 'modal-pin'){ pinBuffer = ''; updatePinDots(); document.getElementById('pin-error').classList.add('hidden'); }
}
function overlayClose(e, id) { if(e.target === e.currentTarget) closeModal(id); }

// ===========================
// ADMIN LOGIN
// ===========================
function startAdminLogin() {
  pinTarget = 'admin';
  document.getElementById('pin-modal-title').textContent = '🔐 PIN de Administrador';
  document.getElementById('pin-modal-sub').textContent   = 'Ingresa el PIN para continuar';
  pinBuffer = ''; updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
  openModal('modal-pin');
}

// ===========================
// EMPLOYEE SELECT
// ===========================
function openEmployeeSelect() {
  const list  = document.getElementById('emp-select-list');
  const empty = document.getElementById('emp-select-empty');
  list.innerHTML = '';
  if(employees.length === 0){
    empty.classList.remove('hidden'); list.style.display = 'none';
  } else {
    empty.classList.add('hidden'); list.style.display = '';
    employees.forEach(emp => {
      const btn = document.createElement('button');
      btn.className = 'emp-select-btn';
      btn.innerHTML = `<div class="emp-avatar" style="background:${emp.color}20;color:${emp.color}">${emp.name.charAt(0).toUpperCase()}</div>
        <div><div class="esp-name">${esc(emp.name)}</div><div class="esp-sub">Toca para continuar</div></div>`;
      btn.onclick = () => startEmployeeLogin(emp.id);
      list.appendChild(btn);
    });
  }
  openModal('modal-emp-select');
}

function startEmployeeLogin(empId) {
  pinTarget = empId;
  const emp = employees.find(e => e.id === empId);
  document.getElementById('pin-modal-title').textContent = `👤 ${emp?.name || 'Empleado'}`;
  document.getElementById('pin-modal-sub').textContent   = 'Ingresa tu PIN y presiona ✓';
  pinBuffer = ''; updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
  closeModal('modal-emp-select');
  openModal('modal-pin');
}

// ===========================
// PIN LOGIC
// ===========================
function pinKey(d) {
  const maxLen = 7; // 4-7 dígitos para todos
  if(pinBuffer.length >= maxLen) return;
  pinBuffer += d; updatePinDots();
  // No hay auto-submit: todos deben presionar ✓
}
function pinClear() {
  pinBuffer = pinBuffer.slice(0,-1); updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
}
function updatePinDots() {
  const container = document.getElementById('pin-dots');
  if(container) {
    container.innerHTML = '';
    const maxDots = 7;
    for(let i = 1; i <= maxDots; i++) {
      const span = document.createElement('span');
      span.className = 'dot' + (i <= pinBuffer.length ? ' filled' : '');
      span.id = 'd' + i;
      container.appendChild(span);
    }
  }
}
function pinSubmit() {
  if(pinTarget === 'change-admin') {
    // Flujo cambio de PIN admin
    if(pinBuffer.length < 4){ showToast('⚠️ Mínimo 4 dígitos'); return; }
    saveAdminPin(pinBuffer);
    return;
  }
  let correct = false;
  if(pinTarget === 'admin') {
    if(pinBuffer.length < 4){ showToast('⚠️ Ingresa al menos 4 dígitos'); return; }
    correct = pinBuffer === adminPin;
    if(correct){ closeModal('modal-pin'); enterAdmin(); }
  } else {
    const emp = employees.find(e => e.id === pinTarget);
    correct = emp && pinBuffer === emp.pin;
    if(correct){ closeModal('modal-pin'); enterEmployee(emp); }
  }
  if(!correct){
    document.querySelectorAll('.dot').forEach(d => { d.classList.add('error'); d.classList.remove('filled'); });
    document.getElementById('pin-error').classList.remove('hidden');
    pinBuffer = '';
    setTimeout(updatePinDots, 700);
  }
}

// ===========================
// CHANGE ADMIN PIN
// ===========================
function startChangeAdminPin() {
  pinTarget = 'change-admin';
  document.getElementById('pin-modal-title').textContent = '🔑 Nuevo PIN de Admin';
  document.getElementById('pin-modal-sub').textContent   = 'Elige un PIN de 4 a 7 dígitos y presiona ✓';
  pinBuffer = ''; updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
  openModal('modal-pin');
}

async function saveAdminPin(newPin) {
  try {
    await db.collection('config').doc('settings').set({ adminPin: newPin }, { merge: true });
    adminPin = newPin;
    closeModal('modal-pin');
    showToast('✅ PIN de admin actualizado (' + newPin.length + ' dígitos)');
  } catch(e) { showToast('❌ Error al guardar el PIN'); console.error(e); }
}

// ===========================
// ENTER ADMIN
// ===========================
function enterAdmin() {
  currentRole = 'admin';
  showScreen('screen-admin');
  showAdminTab('new');
  populateAssignSelect(); populateFilterSelect(); populateHistoryFilter();
  renderAdminTasks(); renderEmployeeList(); updateAdminBadge();
}

function showAdminTab(tab) {
  ['new','tasks','team','history'].forEach(t => {
    document.getElementById('tab-'+t)?.classList.toggle('hidden', t !== tab);
    document.getElementById('tbtn-'+t)?.classList.toggle('active-tab', t === tab);
  });
  if(tab === 'tasks')   renderAdminTasks();
  if(tab === 'team')    renderEmployeeList();
  if(tab === 'history') { populateHistoryFilter(); renderHistory(); }
}

// ===========================
// ENTER EMPLOYEE
// ===========================
function enterEmployee(emp) {
  currentRole = 'employee'; currentEmployee = emp;
  // Si el empleado tiene rol admin, entra al panel admin
  if(emp.role === 'admin') {
    currentRole = 'admin';
    enterAdmin();
    return;
  }
  document.getElementById('emp-name-hdr').textContent = emp.name;
  const av = document.getElementById('emp-avatar-hdr');
  av.textContent = emp.name.charAt(0).toUpperCase();
  av.style.background = emp.color + '30'; av.style.color = emp.color;
  showScreen('screen-employee');
  renderEmployeeView();
}

// ===========================
// PRIORITY
// ===========================
function setPriority(p) {
  selectedPriority = p;
  ['high','med','low'].forEach(x => document.getElementById('prio-'+x)?.classList.toggle('active-prio', x === p));
}

// ===========================
// PHOTO UPLOAD
// ===========================
function handlePhotoUpload(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Max 600px, 0.6 quality → fits in Firestore 1MB limit
      const max = 600; const ratio = Math.min(max/img.width, max/img.height, 1);
      canvas.width = img.width*ratio; canvas.height = img.height*ratio;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      photoData = canvas.toDataURL('image/jpeg', 0.6);
      document.getElementById('photo-preview').src = photoData;
      document.getElementById('photo-preview').classList.remove('hidden');
      document.getElementById('photo-placeholder').classList.add('hidden');
      document.getElementById('photo-remove-btn').classList.remove('hidden');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto(e) {
  if(e) e.stopPropagation();
  photoData = null;
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('photo-placeholder').classList.remove('hidden');
  document.getElementById('photo-remove-btn').classList.add('hidden');
  document.getElementById('photo-input').value = '';
}

// ===========================
// ADD TASK (Firestore)
// ===========================
async function addTask() {
  const title    = document.getElementById('task-title').value.trim();
  const desc     = document.getElementById('task-desc').value.trim();
  const assignId = document.getElementById('task-assign').value;
  const deadline = document.getElementById('task-deadline').value;
  if(!title)    { showToast('⚠️ Escribe un título'); return; }
  if(!assignId) { showToast('⚠️ Selecciona un empleado'); return; }
  const emp = employees.find(e => e.id === assignId);
  const task = {
    id: Date.now().toString(), title, desc,
    assignedTo: assignId, assignedName: emp?.name || '',
    priority: selectedPriority, status: 'pending',
    deadline: deadline || null, photo: photoData || null,
    createdAt: new Date().toISOString(),
    startedAt: null, doneAt: null, doneComment: ''
  };
  try {
    await db.collection('tasks').doc(task.id).set(task);
    // Reset form
    document.getElementById('task-title').value  = '';
    document.getElementById('task-desc').value   = '';
    document.getElementById('task-assign').value = '';
    document.getElementById('task-deadline').value = '';
    removePhoto(null); setPriority('med'); setDefaultDeadline();
    showToast('✅ Tarea asignada a ' + (emp?.name || 'empleado'));
  } catch(e) { showToast('❌ Error al guardar la tarea'); console.error(e); }
}

// ===========================
// POPULATE SELECTS
// ===========================
function populateAssignSelect() {
  const sel = document.getElementById('task-assign'); if(!sel) return;
  sel.innerHTML = '<option value="">— Selecciona empleado —</option>';
  employees.forEach(e => { const o=document.createElement('option'); o.value=e.id; o.textContent=e.name; sel.appendChild(o); });
}
function populateFilterSelect() {
  const sel = document.getElementById('filter-employee'); if(!sel) return;
  sel.innerHTML = '<option value="all">Todos los empleados</option>';
  employees.forEach(e => { const o=document.createElement('option'); o.value=e.id; o.textContent=e.name; sel.appendChild(o); });
}

// ===========================
// STATUS FILTER
// ===========================
function setStatusFilter(f, btn) {
  adminStatusFilter = f;
  document.querySelectorAll('.spill').forEach(b => b.classList.remove('active-spill'));
  btn.classList.add('active-spill'); renderAdminTasks();
}

// ===========================
// RENDER ADMIN TASKS
// ===========================
function renderAdminTasks() {
  adminEmpFilter = document.getElementById('filter-employee')?.value || 'all';
  let filtered = tasks;
  if(adminEmpFilter !== 'all')    filtered = filtered.filter(t => t.assignedTo === adminEmpFilter);
  if(adminStatusFilter !== 'all') filtered = filtered.filter(t => t.status === adminStatusFilter);
  const list  = document.getElementById('admin-task-list');
  const empty = document.getElementById('admin-empty');
  list.innerHTML = '';
  if(filtered.length === 0){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  filtered.forEach(t => list.appendChild(buildTaskCard(t, true)));
}

// ===========================
// HISTORY TAB
// ===========================
function populateHistoryFilter() {
  const sel = document.getElementById('filter-history-emp'); if(!sel) return;
  sel.innerHTML = '<option value="all">Todos los empleados</option>';
  employees.forEach(e => { const o=document.createElement('option'); o.value=e.id; o.textContent=e.name; sel.appendChild(o); });
}

function renderHistory() {
  const empF  = document.getElementById('filter-history-emp')?.value  || 'all';
  const stF   = document.getElementById('filter-history-status')?.value || 'all';
  let filtered = tasks.filter(t => t.status === 'done');
  if(empF !== 'all') filtered = filtered.filter(t => t.assignedTo === empF);
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if(!list) return;
  list.innerHTML = '';
  if(filtered.length === 0){ empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');
  filtered.forEach(t => {
    const emp = employees.find(e => e.id === t.assignedTo);
    const empColor = emp?.color || '#7c6fcd';
    const prioLabel = {high:'🔴 Alta', med:'🟡 Media', low:'🟢 Baja'}[t.priority] || '';
    const createdStr = t.createdAt  ? formatDateFull(t.createdAt)  : '—';
    const startedStr = t.startedAt  ? formatDateFull(t.startedAt)  : '—';
    const doneStr    = t.doneAt     ? formatDateFull(t.doneAt)     : '—';
    const dur = (t.createdAt && t.doneAt)
      ? Math.round((new Date(t.doneAt)-new Date(t.createdAt))/(1000*60*60)) + 'h'
      : null;
    const card = document.createElement('div');
    card.className = 'task-card history-card';
    card.innerHTML = `
      <div class="history-header">
        <div class="emp-avatar" style="background:${empColor}20;color:${empColor};width:38px;height:38px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem">${esc(t.assignedName?.charAt(0)||'?')}</div>
        <div style="flex:1;min-width:0">
          <div class="task-title" style="margin-bottom:4px">${esc(t.title)}</div>
          <div class="task-assignee">👤 ${esc(t.assignedName)} &nbsp;·&nbsp; ${prioLabel}</div>
        </div>
        <span class="status-tag st-done">✅ Completada</span>
      </div>
      <div class="history-timeline-steps">
        <div class="ht-step"><span class="ht-dot pending-dot"></span><div><div class="ht-label">Creada</div><div class="ht-time">${createdStr}</div></div></div>
        <div class="ht-connector"></div>
        <div class="ht-step"><span class="ht-dot inprog-dot"></span><div><div class="ht-label">Iniciada</div><div class="ht-time">${startedStr}</div></div></div>
        <div class="ht-connector"></div>
        <div class="ht-step"><span class="ht-dot done-dot"></span><div><div class="ht-label">Completada</div><div class="ht-time">${doneStr}</div></div></div>
        ${dur ? `<div class="ht-duration">⏱ ${dur} totales</div>` : ''}
      </div>
      ${t.doneComment ? `<div class="history-comment">💬 ${esc(t.doneComment)}</div>` : ''}
    `;
    list.appendChild(card);
  });
}

// ===========================
// RENDER EMPLOYEE VIEW
// ===========================
function renderEmployeeView() {
  if(!currentEmployee) return;
  const mine   = tasks.filter(t => t.assignedTo === currentEmployee.id);
  const pending = mine.filter(t => t.status === 'pending');
  const inprog  = mine.filter(t => t.status === 'inprogress');
  const done    = mine.filter(t => t.status === 'done');
  fill('emp-pending-list','emp-empty-pending', pending, false);
  fill('emp-inprog-list', 'emp-empty-inprog',  inprog,  false);
  fill('emp-done-list',   null,                done,    false);
  document.getElementById('stat-pending').textContent    = pending.length;
  document.getElementById('stat-inprog').textContent     = inprog.length;
  document.getElementById('stat-done').textContent       = done.length;
  document.getElementById('done-count-label').textContent = `(${done.length})`;
  document.getElementById('emp-pending-badge').textContent = pending.length + inprog.length;
}

function fill(listId, emptyId, items, isAdmin) {
  const list = document.getElementById(listId); if(!list) return;
  list.innerHTML = '';
  if(emptyId){ const em=document.getElementById(emptyId); if(items.length===0){em?.classList.remove('hidden');return;} em?.classList.add('hidden'); }
  items.forEach(t => list.appendChild(buildTaskCard(t, isAdmin)));
}

// ===========================
// BUILD TASK CARD
// ===========================
function buildTaskCard(task, isAdmin) {
  const prioClass = {high:'tc-high',med:'tc-med',low:'tc-low'}[task.priority];
  const prioLabel = {high:'🔴 Alta',med:'🟡 Media',low:'🟢 Baja'}[task.priority];
  const tagClass  = {high:'tag-high',med:'tag-med',low:'tag-low'}[task.priority];
  const siClass   = {pending:'si-pending',inprogress:'si-inprog',done:'si-done'}[task.status];
  const siIcon    = {pending:'',inprogress:'🔄',done:'✓'}[task.status];
  const stLabel   = {pending:'Pendiente',inprogress:'En Proceso',done:'Completada'}[task.status];
  const stClass   = {pending:'st-pending',inprogress:'st-inprog',done:'st-done'}[task.status];
  const extraCls  = task.status==='done'?' done-card':task.status==='inprogress'?' inprog-card':'';
  const overdue   = task.deadline && task.status!=='done' && new Date(task.deadline) < new Date();
  const card = document.createElement('div');
  card.className = `task-card ${prioClass}${extraCls}`;
  card.onclick = () => openTaskDetail(task.id);
  card.innerHTML = `
    <div class="status-icon ${siClass}">${siIcon}</div>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      ${isAdmin ? `<div class="task-assignee">👤 ${esc(task.assignedName)}</div>` : ''}
      <div class="task-meta">
        <span class="prio-tag ${tagClass}">${prioLabel}</span>
        <span class="status-tag ${stClass}">${stLabel}</span>
        ${overdue ? `<span class="task-overdue">⚠️ Vencida</span>` : ''}
        ${task.deadline&&!overdue ? `<span class="task-date">📅 ${formatDeadline(task.deadline)}</span>` : ''}
      </div>
    </div>
    ${task.photo ? `<img class="photo-thumb" src="${task.photo}" alt="foto"/>` : ''}
    ${isAdmin ? `<button class="task-del-btn" onclick="event.stopPropagation();deleteTask('${task.id}')">🗑️</button>` : ''}
  `;
  return card;
}

// ===========================
// TASK DETAIL MODAL
// ===========================
function openTaskDetail(taskId) {
  const task = tasks.find(t => t.id === taskId); if(!task) return;
  viewingTaskId = taskId;
  const prioLabel = {high:'🔴 Alta',med:'🟡 Media',low:'🟢 Baja'}[task.priority];
  const tagClass  = {high:'tag-high',med:'tag-med',low:'tag-low'}[task.priority];
  const stLabel   = {pending:'Pendiente',inprogress:'En Proceso',done:'Completada'}[task.status];
  const stClass   = {pending:'st-pending',inprogress:'st-inprog',done:'st-done'}[task.status];
  document.getElementById('detail-prio-tag').textContent  = prioLabel;
  document.getElementById('detail-prio-tag').className    = `prio-tag ${tagClass}`;
  document.getElementById('detail-status-tag').textContent = stLabel;
  document.getElementById('detail-status-tag').className   = `status-tag ${stClass}`;
  document.getElementById('detail-title').textContent     = task.title;
  document.getElementById('detail-assigned').innerHTML    = `<span>👤 ${esc(task.assignedName)}</span>`;
  document.getElementById('detail-desc').textContent      = task.desc || 'Sin descripción.';
  const photoEl = document.getElementById('detail-photo');
  if(task.photo){ photoEl.src=task.photo; photoEl.classList.remove('hidden'); } else { photoEl.classList.add('hidden'); }
  const dlEl = document.getElementById('detail-deadline');
  if(task.deadline){ const ov=task.status!=='done'&&new Date(task.deadline)<new Date(); dlEl.textContent='📅 '+formatDeadline(task.deadline)+(ov?' ⚠️ Vencida':''); dlEl.className=ov?'deadline-overdue':''; } else { dlEl.textContent=''; }
  document.getElementById('detail-created').textContent = '🕐 '+formatDateFull(task.createdAt);
  const cb = document.getElementById('detail-comment-box');
  if(task.doneComment){ cb.classList.remove('hidden'); document.getElementById('detail-comment-text').textContent=task.doneComment; } else { cb.classList.add('hidden'); }
  const actDiv = document.getElementById('detail-actions'); actDiv.innerHTML='';
  if(currentRole==='employee'){
    if(task.status==='pending'){ const b=document.createElement('button'); b.className='btn-start'; b.textContent='🔄 Iniciar tarea'; b.onclick=()=>{updateStatus(taskId,'inprogress');closeModal('modal-task-detail');}; actDiv.appendChild(b); }
    else if(task.status==='inprogress'){ const b=document.createElement('button'); b.className='btn-done-action'; b.textContent='✅ Marcar como Completada'; b.onclick=()=>openDoneComment(taskId); actDiv.appendChild(b); }
  } else if(currentRole==='admin'){
    if(task.status!=='pending'){ const b=document.createElement('button'); b.className='btn-reset'; b.textContent='↩️ Resetear a Pendiente'; b.onclick=()=>{updateStatus(taskId,'pending');closeModal('modal-task-detail');}; actDiv.appendChild(b); }
  }
  openModal('modal-task-detail');
}

// ===========================
// STATUS UPDATE (Firestore)
// ===========================
async function updateStatus(taskId, status) {
  const updates = { status };
  if(status==='inprogress') updates.startedAt = new Date().toISOString();
  if(status==='pending')    { updates.startedAt=null; updates.doneAt=null; updates.doneComment=''; }
  try {
    await db.collection('tasks').doc(taskId).update(updates);
    const labels = {pending:'Tarea reiniciada',inprogress:'¡Tarea iniciada! 🔄',done:'¡Completada! 🎉'};
    showToast(labels[status]);
  } catch(e) { showToast('❌ Error al actualizar'); console.error(e); }
}

function openDoneComment(taskId) {
  doneTaskId = taskId;
  document.getElementById('done-comment-input').value = '';
  closeModal('modal-task-detail'); openModal('modal-done');
}

async function submitDone() {
  const comment = document.getElementById('done-comment-input').value.trim();
  try {
    await db.collection('tasks').doc(doneTaskId).update({ status:'done', doneAt: new Date().toISOString(), doneComment: comment });
    closeModal('modal-done'); showToast('🎉 ¡Tarea completada!');
  } catch(e) { showToast('❌ Error al completar'); console.error(e); }
}

// ===========================
// DELETE TASK (Firestore)
// ===========================
async function deleteTask(taskId) {
  try { await db.collection('tasks').doc(taskId).delete(); showToast('🗑️ Tarea eliminada'); }
  catch(e) { showToast('❌ Error al eliminar'); console.error(e); }
}

// ===========================
// ADMIN BADGE
// ===========================
function updateAdminBadge() {
  const n = tasks.filter(t => t.status !== 'done').length;
  const el = document.getElementById('admin-pending-badge'); if(el) el.textContent = n;
}

// ===========================
// EMPLOYEE MANAGEMENT (Firestore)
// ===========================
function renderEmployeeList() {
  const list  = document.getElementById('employee-list');
  const empty = document.getElementById('emp-list-empty');
  list.innerHTML = '';
  if(employees.length===0){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  employees.forEach(emp => {
    const myTasks = tasks.filter(t=>t.assignedTo===emp.id);
    const active  = myTasks.filter(t=>t.status!=='done').length;
    const isAdmin = emp.role === 'admin';
    const roleBadge = isAdmin
      ? `<span class="role-badge-admin">⚙️ Admin</span>`
      : `<span class="role-badge-emp">👤 Empleado</span>`;
    const div = document.createElement('div'); div.className='emp-row';
    div.innerHTML = `
      <div class="emp-avatar" style="background:${emp.color}20;color:${emp.color}">${emp.name.charAt(0).toUpperCase()}</div>
      <div class="emp-info">
        <div class="emp-row-name">${esc(emp.name)} ${roleBadge}</div>
        <div class="emp-row-pin">PIN: ${'•'.repeat(emp.pin.length)} · ${active} tarea(s) activa(s)</div>
      </div>
      <div class="emp-row-actions">
        <button class="emp-action-btn" onclick="openAddEmployee('${emp.id}')">✏️</button>
        <button class="emp-action-btn" onclick="deleteEmployee('${emp.id}')">🗑️</button>
      </div>`;
    list.appendChild(div);
  });
}

function openAddEmployee(empId) {
  editingEmpId = empId || null;
  document.getElementById('add-emp-title').textContent = empId ? '✏️ Editar Empleado' : '➕ Nuevo Empleado';
  if(empId){
    const emp = employees.find(e=>e.id===empId);
    document.getElementById('emp-name-input').value = emp?.name||'';
    document.getElementById('emp-pin-input').value  = emp?.pin||'';
    document.getElementById('emp-role-input').value = emp?.role||'employee';
    selectedColor = emp?.color||COLORS[0];
  } else {
    document.getElementById('emp-name-input').value='';
    document.getElementById('emp-pin-input').value='';
    document.getElementById('emp-role-input').value='employee';
    selectedColor = COLORS[0];
  }
  updateColorPicker(); openModal('modal-add-emp');
}

async function saveEmployee() {
  const name = document.getElementById('emp-name-input').value.trim();
  const pin  = document.getElementById('emp-pin-input').value.trim();
  const role = document.getElementById('emp-role-input')?.value || 'employee';
  if(!name){ showToast('⚠️ Escribe el nombre'); return; }
  if(!/^\d{4,7}$/.test(pin)){ showToast('⚠️ El PIN debe tener entre 4 y 7 dígitos'); return; }
  const id = editingEmpId || Date.now().toString();
  const emp = { id, name, pin, role, color: selectedColor };
  try {
    await db.collection('employees').doc(id).set(emp);
    closeModal('modal-add-emp');
    showToast(editingEmpId ? '✅ Empleado actualizado' : '✅ Empleado agregado');
  } catch(e) { showToast('❌ Error al guardar'); console.error(e); }
}

async function deleteEmployee(empId) {
  const emp = employees.find(e=>e.id===empId); if(!emp) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('employees').doc(empId));
    // Delete all tasks assigned to this employee
    const empTasks = tasks.filter(t=>t.assignedTo===empId);
    empTasks.forEach(t => batch.delete(db.collection('tasks').doc(t.id)));
    await batch.commit();
    showToast(`🗑️ ${emp.name} eliminado`);
  } catch(e) { showToast('❌ Error al eliminar'); console.error(e); }
}

// ===========================
// COLOR PICKER
// ===========================
function initColorPicker() {
  const cp = document.getElementById('color-picker');
  COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch'+(c===selectedColor?' selected':'');
    sw.style.background = c;
    sw.onclick = () => { selectedColor=c; updateColorPicker(); };
    cp.appendChild(sw);
  });
}
function updateColorPicker() {
  document.querySelectorAll('.color-swatch').forEach((sw,i) => sw.classList.toggle('selected', COLORS[i]===selectedColor));
}

// ===========================
// HELPERS
// ===========================
function setDefaultDeadline() {
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  const el = document.getElementById('task-deadline'); if(el) el.valueAsDate = tom;
}
function formatDeadline(iso) {
  if(!iso) return '';
  return new Date(iso+'T00:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
}
function formatDateFull(iso) {
  if(!iso) return '';
  return new Date(iso).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
