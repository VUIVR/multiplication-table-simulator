(function () {
  "use strict";

  var els = {
    digits: document.querySelectorAll('input[name="digit"]'),
    opMul: document.getElementById("op-mul"),
    opDiv: document.getElementById("op-div"),
    count: document.getElementById("count"),
    timerEnabled: document.getElementById("timer-enabled"),
    timerMin: document.getElementById("timer-min"),
    timerSec: document.getElementById("timer-sec"),
    timerFields: document.getElementById("timer-fields"),
    digitsError: document.getElementById("digits-error"),
    countError: document.getElementById("count-error"),
    opsError: document.getElementById("ops-error"),
    opsChecks: document.getElementById("ops-checks"),
    btnStart: document.getElementById("btn-start"),
    btnPause: document.getElementById("btn-pause"),
    btnStop: document.getElementById("btn-stop"),
    playTimerWrap: document.getElementById("play-timer-wrap"),
    playTimerDisplay: document.getElementById("play-timer-display"),
    taskWrap: document.getElementById("task-wrap"),
    taskQuestion: document.getElementById("task-question"),
    taskAnswer: document.getElementById("task-answer"),
    btnAnswer: document.getElementById("btn-answer"),
    playStatus: document.getElementById("play-status"),
    statsWrap: document.getElementById("stats-wrap"),
    statsSummary: document.getElementById("stats-summary"),
    statsTime: document.getElementById("stats-time"),
    resultsList: document.getElementById("results-list"),
    resultsEmpty: document.getElementById("results-empty"),
    playSection: document.getElementById("play-section"),
    resultsSection: document.getElementById("results-section"),
  };

  var state = {
    mode: "idle",
    queue: [],
    index: 0,
    results: [],
    deadlineMs: null,
    remainingMs: null,
    tickId: null,
    sessionStartMs: null,
    pausedAt: null,
    useTimer: false,
  };

  function getSelectedDigits() {
    var list = [];
    els.digits.forEach(function (cb) {
      if (cb.checked) list.push(parseInt(cb.value, 10));
    });
    return list.sort(function (a, b) {
      return a - b;
    });
  }

  var prevOpsBothOff = false;
  var opsBlinkFallback = null;

  function clearOpsBlinkFallback() {
    if (opsBlinkFallback !== null) {
      clearTimeout(opsBlinkFallback);
      opsBlinkFallback = null;
    }
  }

  function applyOpsInvalidUI() {
    var bothOff = !els.opMul.checked && !els.opDiv.checked;
    if (bothOff) {
      els.opsChecks.classList.add("ops-checks--invalid");
      els.opsError.hidden = false;
      if (!prevOpsBothOff) {
        els.opsChecks.classList.add("ops-checks--blink");
        clearOpsBlinkFallback();
        opsBlinkFallback = setTimeout(function () {
          els.opsChecks.classList.remove("ops-checks--blink");
          opsBlinkFallback = null;
        }, 2000);
      }
      prevOpsBothOff = true;
    } else {
      els.opsChecks.classList.remove("ops-checks--invalid", "ops-checks--blink");
      els.opsError.hidden = true;
      clearOpsBlinkFallback();
      prevOpsBothOff = false;
    }
  }

  els.opsChecks.addEventListener("animationend", function (e) {
    if (e.animationName === "ops-blink") {
      els.opsChecks.classList.remove("ops-checks--blink");
      clearOpsBlinkFallback();
    }
  });

  els.opMul.addEventListener("change", applyOpsInvalidUI);
  els.opDiv.addEventListener("change", applyOpsInvalidUI);

  function updateTimerFieldsClass() {
    els.timerFields.classList.toggle("is-on", els.timerEnabled.checked);
  }
  els.timerEnabled.addEventListener("change", updateTimerFieldsClass);
  updateTimerFieldsClass();

  function parseTimerSeconds() {
    var m = parseInt(els.timerMin.value, 10) || 0;
    var s = parseInt(els.timerSec.value, 10) || 0;
    return m * 60 + s;
  }

  var MIN_EXAMPLES = 10;

  function enforceCountBounds() {
    var raw = els.count.value.trim();
    var n = parseInt(raw, 10);
    if (raw === "" || isNaN(n)) {
      n = MIN_EXAMPLES;
    } else {
      n = Math.min(999, Math.max(MIN_EXAMPLES, n));
    }
    els.count.value = String(n);
    if (n >= MIN_EXAMPLES) els.countError.hidden = true;
  }

  function randomInt(min, maxInclusive) {
    return min + Math.floor(Math.random() * (maxInclusive - min + 1));
  }

  function pick(arr) {
    return arr[randomInt(0, arr.length - 1)];
  }

  function makeExampleItem(op, d, k) {
    var product = d * k;
    if (op === "mul") {
      return {
        type: "mul",
        key: "m-" + d + "-" + k,
        text: d + " × " + k + " =",
        answer: product,
      };
    }
    return {
      type: "div",
      key: "d-" + d + "-" + product,
      text: product + " ÷ " + d + " =",
      answer: k,
    };
  }

  function buildExamplePool(digits, wantMul, wantDiv) {
    var ops = [];
    if (wantMul) ops.push("mul");
    if (wantDiv) ops.push("div");
    var pool = [];
    for (var oi = 0; oi < ops.length; oi++) {
      var op = ops[oi];
      for (var di = 0; di < digits.length; di++) {
        var d = digits[di];
        for (var k = 2; k <= 10; k++) {
          pool.push(makeExampleItem(op, d, k));
        }
      }
    }
    return pool;
  }

  function buildQueue(n, digits, wantMul, wantDiv) {
    var pool = buildExamplePool(digits, wantMul, wantDiv);
    var out = [];
    for (var step = 0; step < n; step++) {
      var lastKey = out.length ? out[out.length - 1].key : null;
      var candidates = [];
      for (var pi = 0; pi < pool.length; pi++) {
        if (pool[pi].key !== lastKey) {
          candidates.push(pool[pi]);
        }
      }
      if (candidates.length === 0) {
        candidates = pool.slice();
      }
      out.push(pick(candidates));
    }
    return out;
  }

  function setSettingsDisabled(disabled) {
    els.digits.forEach(function (cb) {
      cb.disabled = disabled;
    });
    els.opMul.disabled = disabled;
    els.opDiv.disabled = disabled;
    els.count.disabled = disabled;
    els.timerEnabled.disabled = disabled;
    els.timerMin.disabled = disabled || !els.timerEnabled.checked;
    els.timerSec.disabled = disabled || !els.timerEnabled.checked;
  }

  function clearTick() {
    if (state.tickId !== null) {
      clearInterval(state.tickId);
      state.tickId = null;
    }
  }

  function formatClock(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function updatePlayTimerDisplay() {
    if (!state.useTimer || state.remainingMs == null) {
      els.playTimerDisplay.textContent = "—";
      return;
    }
    els.playTimerDisplay.textContent = formatClock(state.remainingMs / 1000);
  }

  function tick() {
    if (state.mode !== "running") return;
    var now = Date.now();
    state.remainingMs = Math.max(0, state.deadlineMs - now);
    updatePlayTimerDisplay();
    if (state.remainingMs <= 0) {
      finishSession("time");
    }
  }

  function startTick() {
    clearTick();
    state.tickId = setInterval(tick, 250);
    tick();
  }

  function validateSettings() {
    var digits = getSelectedDigits();
    var digitsOk = digits.length > 0;
    var opsOk = els.opMul.checked || els.opDiv.checked;

    els.digitsError.hidden = digitsOk;
    els.countError.hidden = true;
    applyOpsInvalidUI();

    var ok = true;
    if (!digitsOk) ok = false;
    if (!opsOk) ok = false;
    var cnt = parseInt(els.count.value, 10);
    if (!cnt || cnt < MIN_EXAMPLES) {
      els.countError.hidden = false;
      els.count.focus();
      ok = false;
    }
    if (els.timerEnabled.checked) {
      var sec = parseTimerSeconds();
      if (sec < 1) {
        ok = false;
      }
    }
    return ok;
  }

  function setTaskControlsEnabled(on) {
    els.taskAnswer.disabled = !on;
    els.btnAnswer.disabled = !on;
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function scrollExamplesToTop(useSmooth) {
    if (!els.playSection) return;
    var behavior = "auto";
    if (useSmooth && !prefersReducedMotion()) {
      behavior = "smooth";
    }
    try {
      els.playSection.scrollIntoView({ block: "start", behavior: behavior, inline: "nearest" });
    } catch (e) {
      els.playSection.scrollIntoView(true);
    }
  }

  function focusAnswerField() {
    try {
      els.taskAnswer.focus({ preventScroll: true });
    } catch (e) {
      els.taskAnswer.focus();
    }
  }

  function showCurrentTask(opt) {
    var options = opt || {};
    var smoothScroll = !!options.smoothScroll;
    var q = state.queue[state.index];
    if (!q) return;
    els.taskQuestion.textContent = q.text;
    els.taskAnswer.value = "";

    scrollExamplesToTop(smoothScroll);

    var delayMs = 0;
    if (smoothScroll && !prefersReducedMotion()) {
      delayMs = 380;
    } else {
      delayMs = 50;
    }

    window.setTimeout(function () {
      requestAnimationFrame(function () {
        focusAnswerField();
      });
    }, delayMs);
  }

  function renderResults() {
    els.resultsList.innerHTML = "";
    var correct = 0;
    state.results.forEach(function (r) {
      var li = document.createElement("li");
      li.textContent =
        r.text + " " + (r.ok ? String(r.given) : r.given + " (верно: " + r.expected + ")");
      li.className = r.ok ? "ok" : "bad";
      els.resultsList.appendChild(li);
      if (r.ok) correct++;
    });

    var total = state.results.length;
    var wrong = total - correct;
    els.statsSummary.textContent =
      "Правильно: " +
      correct +
      ", ошибок: " +
      wrong +
      ", всего примеров: " +
      total +
      (total ? " (" + Math.round((100 * correct) / total) + "% верных)" : "");

    if (state.sessionStartMs != null && state.useTimer) {
      var elapsed = (Date.now() - state.sessionStartMs) / 1000;
      els.statsTime.textContent = "Прошло времени: " + formatClock(elapsed);
      els.statsTime.hidden = false;
    } else {
      els.statsTime.hidden = true;
    }

    els.statsWrap.hidden = total === 0;
    els.resultsEmpty.hidden = total > 0;
  }

  function setTrainingLayoutActive(on) {
    document.body.classList.toggle("is-training", !!on);
  }

  function finishSession(reason) {
    if (state.mode === "idle" || state.mode === "done") return;

    state.mode = "done";
    clearTick();
    setSettingsDisabled(false);
    els.timerMin.disabled = !els.timerEnabled.checked;
    els.timerSec.disabled = !els.timerEnabled.checked;

    els.btnStart.disabled = false;
    els.btnPause.disabled = true;
    els.btnStop.disabled = true;
    els.btnPause.textContent = "Пауза";
    setTaskControlsEnabled(true);

    els.taskWrap.hidden = true;
    if (!state.useTimer) els.playTimerWrap.hidden = true;

    if (reason === "time") {
      els.playStatus.textContent = "Время вышло. Смотрите результаты ниже.";
    } else if (reason === "stop") {
      els.playStatus.textContent = "Остановлено. Результаты ниже.";
    } else {
      els.playStatus.textContent = "Готово! Молодец!";
    }

    setTrainingLayoutActive(false);
    renderResults();
    scrollResultsSectionIntoView();
  }

  function scrollResultsSectionIntoView() {
    if (!els.resultsSection) return;
    window.setTimeout(function () {
      var smooth = !prefersReducedMotion();
      try {
        els.resultsSection.scrollIntoView({
          block: "start",
          behavior: smooth ? "smooth" : "auto",
          inline: "nearest",
        });
      } catch (e) {
        els.resultsSection.scrollIntoView(true);
      }
    }, 80);
  }

  function submitAnswer() {
    if (state.mode !== "running") return;
    var q = state.queue[state.index];
    if (!q) return;

    var raw = els.taskAnswer.value.trim();
    var given = raw === "" ? NaN : parseInt(raw, 10);
    var ok = !isNaN(given) && given === q.answer;

    state.results.push({
      text: q.text,
      given: isNaN(given) ? "—" : String(given),
      expected: q.answer,
      ok: ok,
    });

    state.index++;

    if (state.index >= state.queue.length) {
      finishSession("complete");
      return;
    }

    showCurrentTask();
  }

  function beginSession() {
    if (!validateSettings()) return;

    setTrainingLayoutActive(true);

    var digits = getSelectedDigits();
    var n = Math.min(999, Math.max(MIN_EXAMPLES, parseInt(els.count.value, 10) || MIN_EXAMPLES));
    var wantMul = els.opMul.checked;
    var wantDiv = els.opDiv.checked;

    state.mode = "running";
    state.queue = buildQueue(n, digits, wantMul, wantDiv);
    state.index = 0;
    state.results = [];
    state.sessionStartMs = Date.now();
    state.pausedAt = null;

    state.useTimer = els.timerEnabled.checked;
    if (state.useTimer) {
      var totalSec = parseTimerSeconds();
      state.remainingMs = totalSec * 1000;
      state.deadlineMs = Date.now() + state.remainingMs;
      els.playTimerWrap.hidden = false;
      startTick();
    } else {
      state.deadlineMs = null;
      state.remainingMs = null;
      els.playTimerWrap.hidden = true;
      clearTick();
    }

    setSettingsDisabled(true);
    els.btnStart.disabled = true;
    els.btnPause.disabled = false;
    els.btnStop.disabled = false;

    els.taskWrap.hidden = false;
    setTaskControlsEnabled(true);
    els.playStatus.textContent =
      "Решайте примеры. Ответ — Enter или кнопка «Ответить».";
    els.statsWrap.hidden = true;
    els.resultsEmpty.hidden = false;
    els.resultsList.innerHTML = "";

    showCurrentTask({ smoothScroll: true });
  }

  function togglePause() {
    if (state.mode === "running") {
      state.mode = "paused";
      state.pausedAt = Date.now();
      if (state.useTimer && state.deadlineMs != null) {
        state.remainingMs = Math.max(0, state.deadlineMs - state.pausedAt);
      }
      clearTick();
      updatePlayTimerDisplay();
      els.btnPause.textContent = "Продолжить";
      setTaskControlsEnabled(false);
      els.playStatus.textContent = "Пауза. Нажмите «Продолжить», чтобы идти дальше.";
    } else if (state.mode === "paused") {
      var pauseDur = Date.now() - state.pausedAt;
      if (state.useTimer && state.deadlineMs != null) {
        state.deadlineMs += pauseDur;
      }
      state.mode = "running";
      els.btnPause.textContent = "Пауза";
      setTaskControlsEnabled(true);
      els.playStatus.textContent = "Решайте примеры.";
      if (state.useTimer) startTick();
      scrollExamplesToTop(false);
      window.setTimeout(function () {
        focusAnswerField();
      }, 50);
    }
  }

  els.btnStart.addEventListener("click", function () {
    if (state.mode === "idle" || state.mode === "done") beginSession();
  });

  els.btnPause.addEventListener("click", togglePause);

  els.btnStop.addEventListener("click", function () {
    if (state.mode === "running" || state.mode === "paused") {
      finishSession("stop");
    }
  });

  function sanitizeAnswerInput() {
    var el = els.taskAnswer;
    if (!el) return;
    var v = el.value.replace(/\D/g, "");
    if (el.value !== v) {
      el.value = v;
    }
  }

  els.taskAnswer.addEventListener("input", sanitizeAnswerInput);

  els.taskAnswer.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });

  els.btnAnswer.addEventListener("click", function () {
    submitAnswer();
  });

  els.timerEnabled.addEventListener("change", function () {
    els.timerMin.disabled = !els.timerEnabled.checked;
    els.timerSec.disabled = !els.timerEnabled.checked;
  });

  els.count.addEventListener("input", function () {
    var c = parseInt(els.count.value, 10);
    if (!isNaN(c) && c >= MIN_EXAMPLES) els.countError.hidden = true;
  });
  els.count.addEventListener("blur", enforceCountBounds);
  els.count.addEventListener("change", enforceCountBounds);
})();
