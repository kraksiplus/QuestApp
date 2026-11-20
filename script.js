(function () {
  /* ---------- STATE ---------- */
  var questions = [];
  var currentIdx = 0;
  var currentQuiz = null;

  /* ---------- CONFIG ---------- */
  var PREGUNTAS_DIR = 'preguntas/';
  var MANIFEST_URL = PREGUNTAS_DIR + 'manifest.json';
  var NO_QUIZZES_MSG = 'No hay cuestionarios en la carpeta "preguntas/". Puedes cargar un archivo .json tú mismo.';
  var MARKS_KEY = 'questapp.marcas.v1';

  /* ---------- DOM REFS ---------- */
  var loadScreen   = document.getElementById('loadScreen');
  var quizLayout   = document.getElementById('quizLayout');
  var resultsScreen = document.getElementById('resultsScreen');
  var fileInput    = document.getElementById('fileInput');
  var loadBtn      = document.getElementById('loadBtn');
  var errorMsg     = document.getElementById('errorMsg');
  var quizMenu     = document.getElementById('quizMenu');

  var quizTitle      = document.getElementById('quizTitle');
  var counter        = document.getElementById('counter');
  var scoreEl        = document.getElementById('score');
  var progressFill   = document.getElementById('progressFill');
  var questionNumber = document.getElementById('questionNumber');
  var questionText   = document.getElementById('questionText');
  var altsContainer  = document.getElementById('alternativesContainer');
  var hintToggle     = document.getElementById('hintToggle');
  var hintText       = document.getElementById('hintText');
  var feedback       = document.getElementById('feedback');
  var feedbackMsg    = document.getElementById('feedbackMsg');
  var argumentText   = document.getElementById('argumentText');
  var prevBtn        = document.getElementById('prevBtn');
  var skipBtn        = document.getElementById('skipBtn');
  var nextBtn        = document.getElementById('nextBtn');

  var resultsScore  = document.getElementById('resultsScore');
  var resultsDetail = document.getElementById('resultsDetail');
  var retryBtn      = document.getElementById('retryBtn');
  var newFileBtn    = document.getElementById('newFileBtn');

  var flagBtn      = document.getElementById('flagBtn');
  var flagLabel    = document.getElementById('flagLabel');
  var noteField    = document.getElementById('noteField');
  var noteInput    = document.getElementById('noteInput');
  var exportBar    = document.getElementById('exportBar');
  var exportCount  = document.getElementById('exportCount');
  var exportSuffix = document.getElementById('exportSuffix');
  var exportStatus = document.getElementById('exportStatus');
  var exportLoadBtn     = document.getElementById('exportLoadBtn');
  var exportResultsBtn  = document.getElementById('exportResultsBtn');

  var sidebarList  = document.getElementById('sidebarList');
  var sheetScore   = document.getElementById('sheetScore');
  var hamburgerBtn = document.getElementById('hamburgerBtn');
  var indexModal   = document.getElementById('indexModal');
  var indexList    = document.getElementById('indexList');
  var modalClose   = document.getElementById('modalClose');

  var resultsBreakdown = document.getElementById('resultsBreakdown');

  /* ---------- HELPERS ---------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function shuffleAlternatives(alts, correctIdx) {
    var items = [];
    for (var i = 0; i < alts.length; i++) {
      items.push({ text: alts[i], correct: i === correctIdx });
    }
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    var newAlts = [];
    var newCorrect = -1;
    for (var i = 0; i < items.length; i++) {
      newAlts.push(items[i].text);
      if (items[i].correct) newCorrect = i;
    }
    return { alternativas: newAlts, respuesta: newCorrect };
  }

  function showScreen(screen) {
    loadScreen.classList.remove('active');
    quizLayout.classList.remove('active');
    resultsScreen.classList.remove('active');
    screen.classList.add('active');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('show');
  }

  function clearError() {
    errorMsg.classList.remove('show');
  }

  function computeScore() {
    var s = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].status === 'correct') s++;
    }
    return s;
  }

  function isAnswered(q) {
    return q.status === 'correct' || q.status === 'incorrect';
  }

  function allDone() {
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].status === 'unanswered') return false;
    }
    return true;
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  /* Crea un nodo y le asigna texto SIEMPRE por textContent (nunca innerHTML):
     evita que un "<" o un "&" en el JSON rompa el render. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /* Mapa unico de estado -> icono + clase + etiqueta accesible. */
  var STATUS = {
    correct:    { icon: '\u2713', label: 'correcta',    cls: 'correct' },
    incorrect:  { icon: '\u2715', label: 'fallada',     cls: 'incorrect' },
    skipped:    { icon: '\u2013', label: 'omitida',     cls: 'skipped' },
    unanswered: { icon: '',       label: 'sin responder', cls: 'unanswered' }
  };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function statusInfo(q) {
    return STATUS[q.status] || STATUS.unanswered;
  }

  /* ---------- MARCAS DE REVISIÓN ----------
     Viven en localStorage hasta que se exportan como JSON; quiz-writer las
     aplica a preguntas/*.json como "util": false / "nota". La app nunca las
     usa como contenido: solo excluye lo que el JSON ya trae como no útil. */
  var marksStore = null;

  function readMarks() {
    if (marksStore) return marksStore;
    try {
      var raw = window.localStorage.getItem(MARKS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      marksStore = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      marksStore = {};
    }
    return marksStore;
  }

  function saveMarks() {
    try {
      window.localStorage.setItem(MARKS_KEY, JSON.stringify(readMarks()));
    } catch (e) {
      /* Sin almacenamiento: las marcas viven hasta cerrar la pestaña. */
    }
    exportStatus.textContent = '';
    updateExportUI();
  }

  function quizMarks(archivo) {
    var entry = readMarks()[archivo];
    return (entry && entry.marcas) || null;
  }

  function markFor(id) {
    if (!currentQuiz || !id) return null;
    var marcas = quizMarks(currentQuiz.archivo);
    return (marcas && marcas[id]) || null;
  }

  function isReviewMarked(id) {
    var m = markFor(id);
    return !!(m && m.util === false);
  }

  function writeMark(id, patch) {
    if (!currentQuiz || !id) return;
    var store = readMarks();
    var entry = store[currentQuiz.archivo];
    if (!entry) {
      entry = { titulo: currentQuiz.titulo, marcas: {} };
      store[currentQuiz.archivo] = entry;
    }
    if (!entry.marcas) entry.marcas = {};
    entry.titulo = currentQuiz.titulo;

    var m = entry.marcas[id] || { util: true, nota: '' };
    if (patch.util !== undefined) m.util = patch.util;
    if (patch.nota !== undefined) m.nota = patch.nota;

    /* Al desmarcar se conserva la nota: un toque accidental no borra lo escrito. */
    if (m.util === false || (m.nota && m.nota.trim())) {
      entry.marcas[id] = m;
    } else {
      delete entry.marcas[id];
    }
    if (!Object.keys(entry.marcas).length) delete store[currentQuiz.archivo];
    saveMarks();
  }

  /* Si el JSON ya trae util:false, la marca local quedó aplicada: se limpia.
     También se descartan marcas de ids que ya no existen en el archivo. */
  function cleanAppliedMarks(data) {
    if (!currentQuiz) return;
    var store = readMarks();
    var entry = store[currentQuiz.archivo];
    if (!entry || !entry.marcas) return;

    var ids = {};
    var descartadas = {};
    var changed = false;
    for (var i = 0; i < data.preguntas.length; i++) {
      var q = data.preguntas[i];
      if (!q || !q.id) continue;
      var clave = String(q.id);
      ids[clave] = true;
      if (q.util === false) descartadas[clave] = true;
    }
    for (var id in entry.marcas) {
      if (!ids[id] || descartadas[id]) {
        delete entry.marcas[id];
        changed = true;
      }
    }
    if (!changed) return;
    if (!Object.keys(entry.marcas).length) delete store[currentQuiz.archivo];
    saveMarks();
  }

  function countMarks() {
    var store = readMarks();
    var n = 0;
    for (var archivo in store) {
      var marcas = store[archivo] && store[archivo].marcas;
      if (!marcas) continue;
      for (var id in marcas) {
        if (marcas[id] && marcas[id].util === false) n++;
      }
    }
    return n;
  }

  function buildRevision() {
    var store = readMarks();
    var revision = { generado: new Date().toISOString(), cuestionarios: [] };
    var archivos = Object.keys(store).sort();

    for (var i = 0; i < archivos.length; i++) {
      var archivo = archivos[i];
      var entry = store[archivo] || {};
      var marcas = entry.marcas || {};
      var ids = Object.keys(marcas).sort();
      var lista = [];

      for (var j = 0; j < ids.length; j++) {
        var m = marcas[ids[j]];
        if (!m || m.util !== false) continue;
        var item = { id: ids[j], util: false };
        if (m.nota && m.nota.trim()) item.nota = m.nota.trim();
        lista.push(item);
      }
      if (!lista.length) continue;

      revision.cuestionarios.push({
        archivo: archivo,
        titulo: entry.titulo || archivo,
        marcas: lista
      });
    }
    return revision;
  }

  function updateExportUI() {
    var n = countMarks();
    exportCount.textContent = n;
    exportSuffix.textContent = n === 1
      ? 'pregunta marcada como no útil, lista para revisión'
      : 'preguntas marcadas como no útiles, listas para revisión';
    exportBar.hidden = n === 0;
    exportResultsBtn.hidden = n === 0;
  }

  function downloadRevision() {
    var revision = buildRevision();
    if (!revision.cuestionarios.length) return;

    var hoy = new Date();
    var mes = hoy.getMonth() + 1;
    var dia = hoy.getDate();
    var sello = hoy.getFullYear() + '-' + (mes < 10 ? '0' + mes : mes) + '-' + (dia < 10 ? '0' + dia : dia);

    var blob = new Blob([JSON.stringify(revision, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'questapp-revision-' + sello + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    exportStatus.textContent = 'Descargado: ' + link.download;
  }

  /* ---------- VALIDATION ---------- */
  function validate(data) {
    if (!data || typeof data !== 'object') return 'El JSON debe ser un objeto con "titulo" y "preguntas".';
    if (!data.titulo || typeof data.titulo !== 'string') return 'Falta el campo "titulo" (texto).';
    if (!Array.isArray(data.preguntas) || data.preguntas.length === 0) return 'El campo "preguntas" debe ser un arreglo con al menos una pregunta.';

    for (var i = 0; i < data.preguntas.length; i++) {
      var q = data.preguntas[i];
      if (!q.enunciado || typeof q.enunciado !== 'string') return 'Pregunta ' + (i+1) + ': falta "enunciado".';
      if (!Array.isArray(q.alternativas) || q.alternativas.length < 2) return 'Pregunta ' + (i+1) + ': "alternativas" debe tener al menos 2 opciones.';
      if (typeof q.respuesta !== 'number' || q.respuesta < 0 || q.respuesta >= q.alternativas.length) return 'Pregunta ' + (i+1) + ': "respuesta" debe ser un índice válido (0 a ' + (q.alternativas.length-1) + ').';
    }
    return null;
  }

  /* ---------- QUIZ MENU ---------- */
  function renderMenuNote(text) {
    quizMenu.textContent = '';
    quizMenu.appendChild(el('div', 'menu-note', text));
  }

  function renderMenu(quizzes) {
    var valid = [];
    for (var i = 0; i < quizzes.length; i++) {
      var q = quizzes[i];
      if (!q || typeof q.archivo !== 'string' || !q.archivo) continue;
      valid.push({
        archivo: q.archivo,
        titulo: typeof q.titulo === 'string' && q.titulo ? q.titulo : q.archivo,
        total: typeof q.total === 'number' ? q.total : 0,
        descartadas: typeof q.descartadas === 'number' ? q.descartadas : 0
      });
    }

    if (valid.length === 0) {
      renderMenuNote(NO_QUIZZES_MSG);
      return;
    }

    quizMenu.textContent = '';
    for (var j = 0; j < valid.length; j++) {
      var item = el('button', 'quiz-item');
      item.type = 'button';
      item.dataset.archivo = valid[j].archivo;
      item.title = valid[j].titulo;
      item.appendChild(el('span', 'quiz-item-title', valid[j].titulo));

      var usable = Math.max(0, valid[j].total - valid[j].descartadas);
      var meta = usable + (usable === 1 ? ' pregunta' : ' preguntas');
      if (valid[j].descartadas > 0) meta += ' · ' + valid[j].descartadas + ' fuera';
      item.appendChild(el('span', 'quiz-item-meta', meta));
      quizMenu.appendChild(item);
    }
  }

  function loadManifest() {
    renderMenuNote('Buscando cuestionarios...');
    fetch(MANIFEST_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        renderMenu(data && Array.isArray(data.quizzes) ? data.quizzes : []);
      })
      .catch(function () {
        renderMenuNote(NO_QUIZZES_MSG);
      });
  }

  /* ---------- FILE LOADING ---------- */
  function loadQuizFile(path, archivo) {
    clearError();
    fetch(path, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var err = validate(data);
        if (err) { showError(err); return; }
        startQuiz(data, archivo || path.split('/').pop());
      })
      .catch(function (e) {
        showError('No se pudo cargar "' + path + '": ' + e.message);
      });
  }

  function loadFile(file) {
    clearError();
    if (!file.name.toLowerCase().endsWith('.json')) {
      showError('El archivo debe tener extensión .json');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
      } catch (err) {
        showError('Error al parsear el JSON: ' + err.message);
        return;
      }
      var err = validate(data);
      if (err) { showError(err); return; }
      startQuiz(data, file.name);
    };
    reader.onerror = function () {
      showError('Error al leer el archivo.');
    };
    reader.readAsText(file);
  }

  /* ---------- QUIZ ENGINE ---------- */
  function startQuiz(data, archivo) {
    currentQuiz = {
      archivo: archivo || 'cuestionario.json',
      titulo: data.titulo,
      data: data
    };
    cleanAppliedMarks(data);

    var usable = [];
    for (var u = 0; u < data.preguntas.length; u++) {
      if (data.preguntas[u].util !== false) usable.push(data.preguntas[u]);
    }
    if (!usable.length) {
      questions = [];
      currentIdx = 0;
      currentQuiz = null;
      showError('Todas las preguntas de "' + data.titulo + '" están marcadas como no útiles.');
      return;
    }

    var shuffled = shuffle(usable);
    questions = [];
    for (var i = 0; i < shuffled.length; i++) {
      var raw = shuffled[i];
      var r = shuffleAlternatives(raw.alternativas, raw.respuesta);
      questions.push({
        id:          raw.id ? String(raw.id) : 'sin-id-' + (i + 1),
        enunciado:   raw.enunciado,
        alternativas: r.alternativas,
        respuesta:   r.respuesta,
        pista:       raw.pista || null,
        argumento:   raw.argumento || null,
        status:      'unanswered',
        chosenIdx:   null,
        hintShown:   false
      });
    }

    currentIdx = 0;
    quizTitle.textContent = data.titulo;
    buildLists();
    showScreen(quizLayout);
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderQuestion();
  }

  function renderQuestion() {
    var q = questions[currentIdx];
    var total = questions.length;

    counter.textContent = (currentIdx + 1) + ' / ' + total;
    scoreEl.textContent = computeScore();
    sheetScore.textContent = computeScore();
    progressFill.style.width = ((currentIdx + 1) / total * 100) + '%';
    questionNumber.textContent = 'Pregunta ' + (currentIdx + 1) + ' de ' + total;
    questionText.textContent = q.enunciado;

    /* alternatives */
    altsContainer.textContent = '';
    var altButtons = [];
    for (var i = 0; i < q.alternativas.length; i++) {
      var altBtn = el('button', 'alt-btn', q.alternativas[i]);
      altBtn.type = 'button';
      altBtn.dataset.idx = i;
      altsContainer.appendChild(altBtn);
      altButtons.push(altBtn);
    }

    /* hint */
    hintText.textContent = q.pista || 'No hay pista disponible.';
    hintToggle.style.display = '';
    hintToggle.setAttribute('aria-expanded', q.hintShown ? 'true' : 'false');
    hintToggle.textContent = q.hintShown ? 'Ocultar pista' : 'Mostrar pista';
    hintText.classList.toggle('show', q.hintShown);

    /* feedback & lock state */
    if (isAnswered(q)) {
      for (var j = 0; j < altButtons.length; j++) {
        altButtons[j].classList.add('locked');
        if (j === q.respuesta) {
          altButtons[j].classList.add('correct');
        }
      }
      if (q.chosenIdx !== q.respuesta && q.chosenIdx !== null) {
        altButtons[q.chosenIdx].classList.add('incorrect');
      }

      feedback.classList.add('show');
      feedbackMsg.textContent = q.status === 'correct' ? 'Correcto' : 'Incorrecto';
      feedbackMsg.className = 'feedback-msg ' + (q.status === 'correct' ? 'ok' : 'fail');
      argumentText.textContent = q.argumento || '';
    } else {
      feedback.classList.remove('show');
    }

    /* navigation buttons */
    prevBtn.style.visibility = currentIdx === 0 ? 'hidden' : 'visible';

    if (isAnswered(q)) {
      skipBtn.style.display = 'none';
      nextBtn.disabled = false;
    } else if (q.status === 'skipped') {
      skipBtn.style.display = 'none';
      nextBtn.disabled = false;
    } else {
      skipBtn.style.display = '';
      nextBtn.disabled = true;
    }

    if (currentIdx + 1 >= total) {
      nextBtn.textContent = allDone() ? 'Finalizar' : 'Ver resultados';
    } else {
      nextBtn.textContent = 'Siguiente';
    }

    updateReviewUI();
    syncIndex();
  }

  function selectAnswer(idx) {
    var q = questions[currentIdx];
    if (isAnswered(q)) return;

    q.chosenIdx = idx;
    var correct = idx === q.respuesta;
    q.status = correct ? 'correct' : 'incorrect';
    scoreEl.textContent = computeScore();
    renderQuestion();
    revealFeedback();
  }

  function revealFeedback() {
    if (!feedback.classList.contains('show')) return;
    requestAnimationFrame(function () {
      var rect = feedback.getBoundingClientRect();
      if (rect.bottom > (window.innerHeight || document.documentElement.clientHeight)) {
        feedback.scrollIntoView({
          block: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        });
      }
    });
  }

  function toggleHint() {
    var q = questions[currentIdx];
    q.hintShown = !q.hintShown;
    hintText.classList.toggle('show', q.hintShown);
    hintToggle.setAttribute('aria-expanded', q.hintShown ? 'true' : 'false');
    hintToggle.textContent = q.hintShown ? 'Ocultar pista' : 'Mostrar pista';
  }

  /* ---------- REVISIÓN EN PANTALLA ---------- */
  function growNote() {
    noteInput.style.height = 'auto';
    var alto = noteInput.scrollHeight;
    noteInput.style.height = Math.min(alto, 140) + 'px';
    noteInput.style.overflowY = alto > 140 ? 'auto' : 'hidden';
  }

  function updateReviewUI() {
    var q = questions[currentIdx];
    var mark = q ? markFor(q.id) : null;
    var marked = !!(mark && mark.util === false);

    flagBtn.setAttribute('aria-pressed', marked ? 'true' : 'false');
    flagLabel.textContent = marked ? 'No útil' : 'Marcar no útil';
    flagBtn.title = marked
      ? 'Marcada como no útil para la próxima ronda'
      : 'Marcar como no útil para la próxima ronda';

    noteField.classList.toggle('show', marked);
    var nota = (mark && mark.nota) || '';
    if (noteInput.value !== nota) noteInput.value = nota;
    growNote();
  }

  function toggleReview() {
    var q = questions[currentIdx];
    if (!q || !currentQuiz) return;
    if (isReviewMarked(q.id)) {
      writeMark(q.id, { util: true });
    } else {
      writeMark(q.id, { util: false });
    }
    updateReviewUI();
    refreshItem(currentIdx);
  }

  function skipQuestion() {
    var q = questions[currentIdx];
    if (isAnswered(q) || q.status === 'skipped') return;
    q.status = 'skipped';

    if (currentIdx + 1 >= questions.length) {
      showResults();
      return;
    }
    currentIdx++;
    renderQuestion();
  }

  function goBack() {
    if (currentIdx <= 0) return;
    currentIdx--;
    renderQuestion();
  }

  function nextQuestion() {
    if (currentIdx + 1 >= questions.length) {
      showResults();
      return;
    }
    currentIdx++;
    renderQuestion();
  }

  function jumpTo(idx) {
    if (idx < 0 || idx >= questions.length) return;
    currentIdx = idx;
    renderQuestion();
    closeModal();
  }

  /* ---------- INDEX LISTS (sidebar + modal) ----------
     Se construyen UNA vez por quiz. Antes se reconstruian con innerHTML en cada
     render, lo que ademas reseteaba el scroll del sidebar. */
  var sidebarNodes = [];
  var modalNodes = [];
  var lastRenderedIdx = -1;

  function buildList(container, maxLen, store) {
    container.textContent = '';
    store.length = 0;

    for (var i = 0; i < questions.length; i++) {
      var root = el('button', 'index-item');
      root.type = 'button';
      root.dataset.idx = i;
      root.title = questions[i].enunciado;

      var status = el('span', 'index-status ' + STATUS.unanswered.cls, STATUS.unanswered.icon);

      root.setAttribute('aria-label', 'Pregunta ' + (i + 1) + ', sin responder: ' + questions[i].enunciado);
      root.appendChild(el('span', 'index-num', String(i + 1)));
      root.appendChild(el('span', 'index-text sr-only', truncate(questions[i].enunciado, maxLen)));
      root.appendChild(status);

      container.appendChild(root);
      store.push({ root: root, status: status });
    }
  }

  function buildLists() {
    buildList(sidebarList, 40, sidebarNodes);
    buildList(indexList, 50, modalNodes);
    lastRenderedIdx = -1;
  }

  function updateIndexNode(node, i, info) {
    if (!node) return;
    var q = questions[i];
    var text = q ? q.enunciado : '';
    var mark = q ? markFor(q.id) : null;
    var marked = !!(mark && mark.util === false);

    node.root.classList.toggle('current', i === currentIdx);
    node.root.dataset.status = info.cls;
    node.root.toggleAttribute('data-review', marked);
    node.root.setAttribute('aria-current', i === currentIdx ? 'true' : 'false');
    node.root.setAttribute('aria-label',
      'Pregunta ' + (i + 1) + ', ' + info.label + (marked ? ', no útil' : '') + ': ' + text);
    node.root.title = text + (marked ? (mark.nota ? ' — ' + mark.nota : ' — no útil') : '');
    node.status.className = 'index-status ' + info.cls;
    node.status.textContent = info.icon;
  }

  /* Mantiene la casilla actual a la vista dentro de la hoja (no mueve la pagina). */
  function ensureSheetVisible() {
    var node = sidebarNodes[currentIdx];
    if (!node) return;
    var tile = node.root.getBoundingClientRect();
    var list = sidebarList.getBoundingClientRect();
    if (tile.top < list.top) {
      sidebarList.scrollTop -= (list.top - tile.top) + 8;
    } else if (tile.bottom > list.bottom) {
      sidebarList.scrollTop += (tile.bottom - list.bottom) + 8;
    }
  }

  function refreshItem(i) {
    if (i < 0 || !questions[i]) return;
    var info = statusInfo(questions[i]);
    updateIndexNode(sidebarNodes[i], i, info);
    updateIndexNode(modalNodes[i], i, info);
  }

  function syncIndex() {
    if (lastRenderedIdx >= 0 && lastRenderedIdx !== currentIdx) {
      refreshItem(lastRenderedIdx);
    }
    refreshItem(currentIdx);
    lastRenderedIdx = currentIdx;
    ensureSheetVisible();
  }

  /* ---------- INDEX (modal) ---------- */
  /* La lista ya esta construida en buildLists(); aqui solo se muestra. */
  function openModal() {
    indexModal.classList.add('show');
  }

  function closeModal() {
    indexModal.classList.remove('show');
  }

  /* ---------- RESULTS ---------- */
  function renderBreakdown(rows, total) {
    resultsBreakdown.textContent = '';
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'breakdown-row is-' + rows[i].tone);
      var bar = el('div', 'breakdown-bar');
      var fill = el('span');
      fill.style.width = total ? (rows[i].value / total * 100) + '%' : '0%';
      bar.appendChild(fill);

      row.appendChild(el('span', 'breakdown-label', rows[i].label));
      row.appendChild(bar);
      row.appendChild(el('span', 'breakdown-count', String(rows[i].value)));
      resultsBreakdown.appendChild(row);
    }
  }

  function showResults() {
    showScreen(resultsScreen);
    updateExportUI();
    var total = questions.length;
    var sc = computeScore();
    var skipped = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].status === 'skipped') skipped++;
    }
    var incorrect = total - sc - skipped;
    var pct = total ? Math.round(sc / total * 100) : 0;

    resultsScore.textContent = sc + ' / ' + total;
    resultsDetail.textContent = pct + '% de aciertos';
    renderBreakdown([
      { label: 'Correctas',   value: sc,        tone: 'correct' },
      { label: 'Incorrectas', value: incorrect, tone: 'incorrect' },
      { label: 'Omitidas',    value: skipped,   tone: 'skipped' }
    ], total);

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function resetQuiz() {
    showScreen(loadScreen);
    clearError();
    fileInput.value = '';
    questions = [];
    currentIdx = 0;
    currentQuiz = null;
    updateExportUI();
  }

  function retryQuiz() {
    if (questions.length === 0) return;
    for (var i = 0; i < questions.length; i++) {
      questions[i].status = 'unanswered';
      questions[i].chosenIdx = null;
      questions[i].hintShown = false;
      var r = shuffleAlternatives(questions[i].alternativas, questions[i].respuesta);
      questions[i].alternativas = r.alternativas;
      questions[i].respuesta = r.respuesta;
    }
    questions = shuffle(questions);
    currentIdx = 0;
    buildLists();
    showScreen(quizLayout);
    renderQuestion();
  }

  /* ---------- EVENTS ---------- */
  loadBtn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
  });

  quizMenu.addEventListener('click', function (e) {
    var item = e.target.closest('.quiz-item');
    if (!item) return;
    loadQuizFile(PREGUNTAS_DIR + item.dataset.archivo, item.dataset.archivo);
  });

  loadScreen.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    loadScreen.classList.add('dragover');
  });
  loadScreen.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    loadScreen.classList.remove('dragover');
  });
  loadScreen.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    loadScreen.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  altsContainer.addEventListener('click', function (e) {
    var btn = e.target.closest('.alt-btn');
    if (!btn) return;
    var q = questions[currentIdx];
    if (isAnswered(q)) return;
    var idx = parseInt(btn.getAttribute('data-idx'), 10);
    selectAnswer(idx);
  });

  hintToggle.addEventListener('click', toggleHint);
  prevBtn.addEventListener('click', goBack);
  skipBtn.addEventListener('click', skipQuestion);
  nextBtn.addEventListener('click', nextQuestion);
  retryBtn.addEventListener('click', retryQuiz);
  newFileBtn.addEventListener('click', resetQuiz);

  flagBtn.addEventListener('click', toggleReview);
  noteInput.addEventListener('input', function () {
    var q = questions[currentIdx];
    if (!q || !isReviewMarked(q.id)) return;
    writeMark(q.id, { nota: noteInput.value });
    growNote();
    refreshItem(currentIdx);
  });

  exportLoadBtn.addEventListener('click', downloadRevision);
  exportResultsBtn.addEventListener('click', downloadRevision);

  /* Al rotar o cambiar el ancho, la nota vuelve a medirse. */
  var noteResizeTimer = null;
  window.addEventListener('resize', function () {
    if (!noteField.classList.contains('show')) return;
    window.clearTimeout(noteResizeTimer);
    noteResizeTimer = window.setTimeout(growNote, 120);
  });

  /* sidebar */
  sidebarList.addEventListener('click', function (e) {
    var item = e.target.closest('.index-item');
    if (!item) return;
    var idx = parseInt(item.getAttribute('data-idx'), 10);
    jumpTo(idx);
  });

  /* hamburger (narrow) */
  hamburgerBtn.addEventListener('click', openModal);

  /* modal */
  modalClose.addEventListener('click', closeModal);
  indexModal.addEventListener('click', function (e) {
    if (e.target === indexModal) closeModal();
  });
  indexList.addEventListener('click', function (e) {
    var item = e.target.closest('.index-item');
    if (!item) return;
    var idx = parseInt(item.getAttribute('data-idx'), 10);
    jumpTo(idx);
  });

  /* keyboard shortcuts */
  document.addEventListener('keydown', function (e) {
    if (!quizLayout.classList.contains('active')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape' && indexModal.classList.contains('show')) {
      closeModal();
      return;
    }
    if (indexModal.classList.contains('show')) return;

    /* Escribiendo la nota: el teclado es del textarea. */
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

    if (e.key === 'ArrowRight' && !nextBtn.disabled) { e.preventDefault(); nextQuestion(); return; }
    if (e.key === 'ArrowLeft' && currentIdx > 0) { e.preventDefault(); goBack(); return; }
    if (e.key === 'o' || e.key === 'O') { e.preventDefault(); skipQuestion(); return; }
    if (e.key === 'u' || e.key === 'U') { e.preventDefault(); toggleReview(); return; }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHint(); return; }

    if (/^[1-9]$/.test(e.key)) {
      var idx = parseInt(e.key, 10) - 1;
      var q = questions[currentIdx];
      if (q && idx < q.alternativas.length && !isAnswered(q)) {
        e.preventDefault();
        selectAnswer(idx);
      }
    }
  });

  updateExportUI();
  loadManifest();
})();
