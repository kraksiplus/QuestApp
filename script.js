(function () {
  /* ---------- STATE ---------- */
  var questions = [];
  var currentIdx = 0;

  /* ---------- CONFIG ---------- */
  var PREGUNTAS_DIR = 'preguntas/';
  var MANIFEST_URL = PREGUNTAS_DIR + 'manifest.json';
  var NO_QUIZZES_MSG = 'No hay cuestionarios en la carpeta "preguntas/". Puedes cargar un archivo .json tú mismo.';

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

  var sidebarList  = document.getElementById('sidebarList');
  var hamburgerBtn = document.getElementById('hamburgerBtn');
  var indexModal   = document.getElementById('indexModal');
  var indexList    = document.getElementById('indexList');
  var modalClose   = document.getElementById('modalClose');

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

  /* Mapa unico de estado -> icono + clase. Antes esto estaba repetido en 5 lugares. */
  var STATUS = {
    correct:    { icon: '\u2705', cls: 'correct' },
    incorrect:  { icon: '\u274C', cls: 'incorrect' },
    skipped:    { icon: '\u23ED', cls: 'skipped' },
    unanswered: { icon: '\u25A1', cls: 'unanswered' }
  };

  function statusInfo(q) {
    return STATUS[q.status] || STATUS.unanswered;
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
        total: typeof q.total === 'number' ? q.total : 0
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
      item.appendChild(el('span', 'quiz-item-title', valid[j].titulo));
      item.appendChild(el('span', 'quiz-item-meta', valid[j].total + (valid[j].total === 1 ? ' pregunta' : ' preguntas')));
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
  function loadQuizFile(path) {
    clearError();
    fetch(path, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var err = validate(data);
        if (err) { showError(err); return; }
        startQuiz(data);
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
      startQuiz(data);
    };
    reader.onerror = function () {
      showError('Error al leer el archivo.');
    };
    reader.readAsText(file);
  }

  /* ---------- QUIZ ENGINE ---------- */
  function startQuiz(data) {
    var shuffled = shuffle(data.preguntas);
    questions = [];
    for (var i = 0; i < shuffled.length; i++) {
      var r = shuffleAlternatives(shuffled[i].alternativas, shuffled[i].respuesta);
      questions.push({
        enunciado:   shuffled[i].enunciado,
        alternativas: r.alternativas,
        respuesta:   r.respuesta,
        pista:       shuffled[i].pista || null,
        argumento:   shuffled[i].argumento || null,
        status:      'unanswered',
        chosenIdx:   null,
        hintShown:   false
      });
    }

    currentIdx = 0;
    quizTitle.textContent = data.titulo;
    buildLists();
    showScreen(quizLayout);
    renderQuestion();
  }

  function renderQuestion() {
    var q = questions[currentIdx];
    var total = questions.length;

    counter.textContent = (currentIdx + 1) + '/' + total;
    scoreEl.textContent = computeScore();
    progressFill.style.width = ((currentIdx + 1) / total * 100) + '%';
    questionNumber.textContent = 'PREGUNTA ' + (currentIdx + 1) + ' DE ' + total;
    questionText.textContent = q.enunciado;

    /* alternatives */
    altsContainer.textContent = '';
    var altButtons = [];
    for (var i = 0; i < q.alternativas.length; i++) {
      var altBtn = el('button', 'alt-btn', q.alternativas[i]);
      altBtn.dataset.idx = i;
      altsContainer.appendChild(altBtn);
      altButtons.push(altBtn);
    }

    /* hint */
    hintText.textContent = q.pista || 'No hay pista disponible.';
    if (q.hintShown) {
      hintText.classList.add('show');
      hintToggle.style.display = '';
      hintToggle.textContent = '\u{1F4A1} Ocultar pista';
    } else {
      hintText.classList.remove('show');
      hintToggle.style.display = '';
      hintToggle.textContent = '\u{1F4A1} Mostrar pista';
    }

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
      feedbackMsg.textContent = q.status === 'correct' ? '\u2705 ¡Correcto!' : '\u274C Incorrecto';
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
  }

  function toggleHint() {
    var q = questions[currentIdx];
    q.hintShown = !q.hintShown;
    if (q.hintShown) {
      hintText.classList.add('show');
      hintToggle.textContent = '\u{1F4A1} Ocultar pista';
    } else {
      hintText.classList.remove('show');
      hintToggle.textContent = '\u{1F4A1} Mostrar pista';
    }
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
      var root = el('div', 'index-item');
      root.dataset.idx = i;

      var status = el('span', 'index-status ' + STATUS.unanswered.cls, STATUS.unanswered.icon);

      root.appendChild(el('span', 'index-num', String(i + 1)));
      root.appendChild(el('span', 'index-text', truncate(questions[i].enunciado, maxLen)));
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
    node.root.classList.toggle('current', i === currentIdx);
    node.status.className = 'index-status ' + info.cls;
    node.status.textContent = info.icon;
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
  function showResults() {
    showScreen(resultsScreen);
    var total = questions.length;
    var sc = computeScore();
    var skipped = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].status === 'skipped') skipped++;
    }
    var pct = Math.round(sc / total * 100);
    resultsScore.textContent = sc + ' / ' + total;
    var detail = 'Lograste un ' + pct + '% de aciertos.';
    if (skipped > 0) {
      detail += '<br><span class="skipped-info">' + skipped + ' pregunta(s) omitida(s).</span>';
    }
    resultsDetail.innerHTML = detail;
  }

  function resetQuiz() {
    showScreen(loadScreen);
    clearError();
    fileInput.value = '';
    questions = [];
    currentIdx = 0;
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
    loadQuizFile(PREGUNTAS_DIR + item.dataset.archivo);
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
    if (e.key === 'ArrowRight' && !nextBtn.disabled) nextQuestion();
    if (e.key === 'ArrowLeft' && currentIdx > 0) goBack();
    if (e.key === 'Escape' && indexModal.classList.contains('show')) closeModal();
  });

  loadManifest();
})();
