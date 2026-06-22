(function () {
  /* ---------- STATE ---------- */
  var questions = [];
  var currentIdx = 0;

  /* ---------- DOM REFS ---------- */
  var loadScreen   = document.getElementById('loadScreen');
  var quizLayout   = document.getElementById('quizLayout');
  var resultsScreen = document.getElementById('resultsScreen');
  var fileInput    = document.getElementById('fileInput');
  var loadBtn      = document.getElementById('loadBtn');
  var errorMsg     = document.getElementById('errorMsg');

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

  /* ---------- FILE LOADING ---------- */
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
    var html = '';
    for (var i = 0; i < q.alternativas.length; i++) {
      html += '<button class="alt-btn" data-idx="' + i + '">' + q.alternativas[i] + '</button>';
    }
    altsContainer.innerHTML = html;

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
      var buttons = altsContainer.querySelectorAll('.alt-btn');
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].classList.add('locked');
        if (j === q.respuesta) {
          buttons[j].classList.add('correct');
        }
      }
      if (q.chosenIdx !== q.respuesta && q.chosenIdx !== null) {
        buttons[q.chosenIdx].classList.add('incorrect');
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
      nextBtn.textContent = allDone() ? 'Finalizar' : 'Siguiente';
    } else {
      nextBtn.textContent = 'Siguiente';
    }

    buildSidebar();
    buildIndex();
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

  /* ---------- SIDEBAR ---------- */
  function buildSidebar() {
    var html = '';
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var statusIcon = '';
      var statusClass = '';

      if (q.status === 'correct') {
        statusIcon = '\u2705';
        statusClass = 'correct';
      } else if (q.status === 'incorrect') {
        statusIcon = '\u274C';
        statusClass = 'incorrect';
      } else if (q.status === 'skipped') {
        statusIcon = '\u23ED';
        statusClass = 'skipped';
      } else {
        statusIcon = '\u25A1';
        statusClass = 'unanswered';
      }

      var currentClass = (i === currentIdx) ? ' current' : '';

      html +=
        '<div class="index-item' + currentClass + '" data-idx="' + i + '">' +
          '<span class="index-num">' + (i + 1) + '</span>' +
          '<span class="index-text">' + truncate(q.enunciado, 40) + '</span>' +
          '<span class="index-status ' + statusClass + '">' + statusIcon + '</span>' +
        '</div>';
    }
    sidebarList.innerHTML = html;
  }

  /* ---------- INDEX (modal) ---------- */
  function buildIndex() {
    var html = '';
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var statusIcon = '';
      var statusClass = '';

      if (q.status === 'correct') {
        statusIcon = '\u2705';
        statusClass = 'correct';
      } else if (q.status === 'incorrect') {
        statusIcon = '\u274C';
        statusClass = 'incorrect';
      } else if (q.status === 'skipped') {
        statusIcon = '\u23ED';
        statusClass = 'skipped';
      } else {
        statusIcon = '\u25A1';
        statusClass = 'unanswered';
      }

      var currentClass = (i === currentIdx) ? ' current' : '';

      html +=
        '<div class="index-item' + currentClass + '" data-idx="' + i + '">' +
          '<span class="index-num">' + (i + 1) + '</span>' +
          '<span class="index-text">' + truncate(q.enunciado, 50) + '</span>' +
          '<span class="index-status ' + statusClass + '">' + statusIcon + '</span>' +
        '</div>';
    }
    indexList.innerHTML = html;
  }

  function openModal() {
    buildIndex();
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
})();
