const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const storageKey = "kadou-accounting-v1";
const fixedMonthlyFee = 2000;
const defaultLessonFee = 1300;
const initialState = {
  settings: {
    monthlyFee: fixedMonthlyFee,
  },
  members: [],
  months: {},
};

let state = loadState();
let selectedMonth = currentMonth();
let payingMemberId = null;
let arrearsMemberId = null;

const els = {
  targetMonth: document.querySelector("#targetMonth"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  monthlyFee: document.querySelector("#monthlyFee"),
  skipMonthlyFee: document.querySelector("#skipMonthlyFee"),
  lesson1Date: document.querySelector("#lesson1Date"),
  lesson1Fee: document.querySelector("#lesson1Fee"),
  lesson2Date: document.querySelector("#lesson2Date"),
  lesson2Fee: document.querySelector("#lesson2Fee"),
  addMemberForm: document.querySelector("#addMemberForm"),
  memberName: document.querySelector("#memberName"),
  memberGrade: document.querySelector("#memberGrade"),
  memberFaculty: document.querySelector("#memberFaculty"),
  members: document.querySelector("#members"),
  totalCharged: document.querySelector("#totalCharged"),
  totalPaid: document.querySelector("#totalPaid"),
  totalDue: document.querySelector("#totalDue"),
  totalLessons: document.querySelector("#totalLessons"),
  history: document.querySelector("#history"),
  paymentDialog: document.querySelector("#paymentDialog"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentMember: document.querySelector("#paymentMember"),
  paymentAmount: document.querySelector("#paymentAmount"),
  cancelPayment: document.querySelector("#cancelPayment"),
  arrearsDialog: document.querySelector("#arrearsDialog"),
  arrearsForm: document.querySelector("#arrearsForm"),
  arrearsMember: document.querySelector("#arrearsMember"),
  arrearsAmount: document.querySelector("#arrearsAmount"),
  cancelArrears: document.querySelector("#cancelArrears"),
  notesDialog: document.querySelector("#notesDialog"),
  notesForm: document.querySelector("#notesForm"),
  notesMember: document.querySelector("#notesMember"),
  notesText: document.querySelector("#notesText"),
  cancelNotes: document.querySelector("#cancelNotes"),
  importDialog: document.querySelector("#importDialog"),
  importForm: document.querySelector("#importForm"),
  importText: document.querySelector("#importText"),
  importPreview: document.querySelector("#importPreview"),
  cancelImport: document.querySelector("#cancelImport"),
  appendImport: document.querySelector("#appendImport"),
  openImport: document.querySelector("#openImport"),
  saveNow: document.querySelector("#saveNow"),
  saveStatus: document.querySelector("#saveStatus"),
  promoteGrades: document.querySelector("#promoteGrades"),
  settleSuggested: document.querySelector("#settleSuggested"),
  exportCsv: document.querySelector("#exportCsv"),
  exportExcel: document.querySelector("#exportExcel"),
  clearMonth: document.querySelector("#clearMonth"),
  resetDemo: document.querySelector("#resetDemo"),
};

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(initialState);

  try {
    const savedState = JSON.parse(saved);
    const normalizedState = normalizeState(savedState);
    const needsJoinMonthMigration = Array.isArray(savedState?.members) && savedState.members.some(
      (member) => !/^\d{4}-\d{2}$/.test(member.joinedMonth || ""),
    );
    if (needsJoinMonthMigration) localStorage.setItem(storageKey, JSON.stringify(normalizedState));
    return normalizedState;
  } catch {
    return structuredClone(initialState);
  }
}

function normalizeState(savedState) {
  const rawMembers = Array.isArray(savedState?.members) ? savedState.members : [];
  const savedMonths =
    savedState?.months && typeof savedState.months === "object" ? savedState.months : {};
  const isOldEmptyDemo =
    rawMembers.map((member) => member.name).join(",") === "田中,佐藤,鈴木" &&
    Object.keys(savedMonths).length === 0;

  if (isOldEmptyDemo) return structuredClone(initialState);

  const nextState = {
    settings: {
      monthlyFee: fixedMonthlyFee,
    },
    members: rawMembers,
    months: savedMonths,
  };

  nextState.members = nextState.members.map((member) => ({
    id: member.id || crypto.randomUUID(),
    name: member.name || "名前未設定",
    faculty: member.faculty || "",
    grade: Math.max(Number(member.grade) || 1, 1),
    // 既存データは今回の月から自動繰越を始め、過去の請求を重複計上しない。
    joinedMonth: /^\d{4}-\d{2}$/.test(member.joinedMonth || "") ? member.joinedMonth : currentMonth(),
    paused: Boolean(member.paused),
    priorArrears: Number(member.priorArrears) || 0,
    notes: member.notes || "",
  }));

  return nextState.members.length ? nextState : structuredClone(initialState);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  showSaveStatus("保存済み", true);
}

function showSaveStatus(text, saved = false) {
  els.saveStatus.textContent = text;
  els.saveStatus.classList.toggle("saved", saved);
}

function monthData(month = selectedMonth) {
  if (!state.months[month]) {
    state.months[month] = {
      lessons: defaultLessons(),
      monthlyFeeEnabled: true,
      attendance: {},
      payments: {},
      arrearsOverrides: {},
      pausedMembers: {},
      pauseOverrides: {},
      events: [],
    };
  }

  if (typeof state.months[month].monthlyFeeEnabled !== "boolean") {
    state.months[month].monthlyFeeEnabled = true;
  }
  if (!state.months[month].arrearsOverrides || typeof state.months[month].arrearsOverrides !== "object") {
    state.months[month].arrearsOverrides = {};
  }
  if (!state.months[month].pausedMembers || typeof state.months[month].pausedMembers !== "object") {
    state.months[month].pausedMembers = {};
  }
  if (!state.months[month].pauseOverrides || typeof state.months[month].pauseOverrides !== "object") {
    state.months[month].pauseOverrides = {};
  }
  state.members.forEach((member) => {
    if (Object.hasOwn(state.months[month].pauseOverrides, member.id)) {
      state.months[month].pausedMembers[member.id] = Boolean(state.months[month].pauseOverrides[member.id]);
    } else if (!Object.hasOwn(state.months[month].pausedMembers, member.id)) {
      const previousOverrideMonths = Object.keys(state.months)
        .filter((candidate) => candidate < month && Object.hasOwn(state.months[candidate]?.pauseOverrides || {}, member.id))
        .sort();
      const latestOverride = previousOverrideMonths.at(-1);
      state.months[month].pausedMembers[member.id] = latestOverride
        ? Boolean(state.months[latestOverride].pauseOverrides[member.id])
        : Boolean(member.paused);
    }
  });

  if (!Array.isArray(state.months[month].lessons)) {
    state.months[month].lessons = defaultLessons();
  }

  state.months[month].lessons = defaultLessons().map((lesson, index) => ({
    date: state.months[month].lessons[index]?.date || lesson.date,
    fee: normalizeMoney(state.months[month].lessons[index]?.fee, lesson.fee),
  }));

  return state.months[month];
}

function normalizeMoney(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  return Math.max(Number(value) || 0, 0);
}

function defaultLessons() {
  return [
    { date: "", fee: defaultLessonFee },
    { date: "", fee: defaultLessonFee },
  ];
}

function memberAttendance(memberId, data = monthData()) {
  const attendance = data.attendance[memberId];
  if (Array.isArray(attendance)) {
    return defaultLessons().map((_, index) => Boolean(attendance[index]));
  }

  const oldCount = Math.max(Number(attendance) || 0, 0);
  return defaultLessons().map((_, index) => oldCount > index);
}

function setMemberAttendance(memberId, lessonIndex, value) {
  const data = monthData();
  const attendance = memberAttendance(memberId, data);
  attendance[lessonIndex] = value;
  data.attendance[memberId] = attendance;
}

function previousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function propagatePauseState(member, value, fromMonth = selectedMonth) {
  let inheritedValue = value;
  const laterMonths = Object.keys(state.months).filter((month) => month > fromMonth).sort();
  laterMonths.forEach((month) => {
    const data = state.months[month];
    data.pausedMembers ||= {};
    data.pauseOverrides ||= {};
    if (Object.hasOwn(data.pauseOverrides, member.id)) {
      inheritedValue = Boolean(data.pauseOverrides[member.id]);
    } else {
      data.pausedMembers[member.id] = inheritedValue;
    }
  });
}

function memberLedger(member, month = selectedMonth) {
  const data = monthData(month);
  const attendance = memberAttendance(member.id, data);
  const lessons = attendance.filter(Boolean).length;
  const payments = data.payments[member.id] || [];
  const isPaused = Boolean(data.pausedMembers[member.id]);
  let priorArrears;
  if (Object.hasOwn(data.arrearsOverrides, member.id)) {
    priorArrears = Number(data.arrearsOverrides[member.id]) || 0;
  } else {
    const prevMonth = previousMonth(month);
    const joinedMonth = member.joinedMonth || month;
    priorArrears = prevMonth >= joinedMonth
      ? memberLedger(member, prevMonth).due
      : Number(member.priorArrears) || 0;
  }
  // 休部状態は月ごとに記録し、休部中でも稽古に参加した月は部費が発生する。
  const monthlyCharge = !data.monthlyFeeEnabled
    ? 0
    : isPaused && lessons === 0
      ? 0
      : fixedMonthlyFee;
  const lessonCharge = data.lessons.reduce((sum, lesson, index) => {
    return sum + (attendance[index] ? Math.max(Number(lesson.fee) || 0, 0) : 0);
  }, 0);
  const charged = monthlyCharge + lessonCharge;
  const billed = priorArrears + charged;
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paidCash = payments
    .filter((payment) => payment.method === "現金")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paidTransfer = payments
    .filter((payment) => payment.method === "振込")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paymentLog = payments.map(formatPayment).join(" / ");

  return {
    lessons,
    attendance,
    payments,
    priorArrears,
    isPaused,
    monthlyCharge,
    lessonCharge,
    charged,
    billed,
    paid,
    paidCash,
    paidTransfer,
    paymentLog,
    due: billed - paid,
  };
}

function addEvent(text) {
  monthData().events.unshift({
    id: crypto.randomUUID(),
    at: new Date().toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }),
    text,
  });
}

function render() {
  const data = monthData();
  els.targetMonth.value = selectedMonth;
  els.monthlyFee.value = fixedMonthlyFee;
  els.skipMonthlyFee.checked = !data.monthlyFeeEnabled;
  els.lesson1Date.value = data.lessons[0].date;
  els.lesson1Fee.value = data.lessons[0].fee;
  els.lesson2Date.value = data.lessons[1].date;
  els.lesson2Fee.value = data.lessons[1].fee;

  const ledgers = state.members.map((member) => ({ member, ledger: memberLedger(member) }));
  const totals = ledgers.reduce(
    (sum, item) => {
      sum.charged += item.ledger.billed;
      sum.paid += item.ledger.paid;
      sum.due += item.ledger.due;
      sum.lessons += item.ledger.lessons;
      return sum;
    },
    { charged: 0, paid: 0, due: 0, lessons: 0 },
  );

  els.totalCharged.textContent = yen.format(totals.charged);
  els.totalPaid.textContent = yen.format(totals.paid);
  els.totalDue.textContent = yen.format(totals.due);
  els.totalDue.className = amountClass(totals.due);
  els.totalLessons.textContent = `${totals.lessons}回`;

  els.members.innerHTML = "";
  ledgers.forEach(({ member, ledger }, index) => {
    const row = document.createElement("article");
    row.className = "member-row";
    row.innerHTML = `
      <div class="member-name ${ledger.due > 0 ? "has-arrears" : "no-arrears"}">
        <strong>${escapeHtml(member.name)}</strong>
        <small>${escapeHtml(member.faculty || "学部未設定")}</small>
        <small>部費 ${yen.format(ledger.monthlyCharge)} / 稽古 ${yen.format(ledger.lessonCharge)}</small>
      </div>
      <input class="grade-input" data-action="grade" data-id="${member.id}" type="number" min="1" step="1" value="${member.grade}" aria-label="${escapeHtml(member.name)}さんの学年" />
      <span class="status ${ledger.isPaused ? "paused" : ""}">${ledger.isPaused ? "休部中" : "在籍"}</span>
      <span>${ledger.lessons}回</span>
      <span class="amount ${amountClass(ledger.priorArrears)}">${yen.format(ledger.priorArrears)}</span>
      <span class="amount">${yen.format(ledger.billed)}</span>
      <span class="amount">${yen.format(ledger.paid)}</span>
      <span class="amount ${amountClass(ledger.due)}">${yen.format(ledger.due)}</span>
      <span class="notes-preview">${escapeHtml(member.notes || "")}</span>
      <div class="row-actions">
        <button class="move" data-action="move-up" data-id="${member.id}" type="button" aria-label="${escapeHtml(member.name)}さんを上へ" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="move" data-action="move-down" data-id="${member.id}" type="button" aria-label="${escapeHtml(member.name)}さんを下へ" ${index === state.members.length - 1 ? "disabled" : ""}>↓</button>
        <button class="primary ${ledger.attendance[0] ? "is-active" : ""}" data-action="toggle-lesson" data-lesson="0" data-id="${member.id}" type="button">${lessonButtonLabel(0)}</button>
        <button class="primary ${ledger.attendance[1] ? "is-active" : ""}" data-action="toggle-lesson" data-lesson="1" data-id="${member.id}" type="button">${lessonButtonLabel(1)}</button>
        <button class="danger" data-action="toggle-pause" data-id="${member.id}" type="button">${member.paused ? "復部" : "休部"}</button>
        <button class="payment" data-action="pay" data-id="${member.id}" type="button">入金</button>
        <button class="arrears" data-action="arrears" data-id="${member.id}" type="button">滞納設定</button>
        <button data-action="notes" data-id="${member.id}" type="button">備考</button>
        <button data-action="remove" data-id="${member.id}" type="button">削除</button>
      </div>
    `;
    els.members.append(row);
  });

  const events = monthData().events;
  els.history.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <li>
              <span><time>${event.at}</time> ${escapeHtml(event.text)}</span>
              <button data-event-id="${event.id}" type="button" aria-label="記録を削除">削除</button>
            </li>
          `,
        )
        .join("")
    : "<li>まだ記録がありません。</li>";
}

function amountClass(value) {
  if (value > 0) return "due";
  return "balance-zero";
}

function formatPayment(payment) {
  const date = new Date(payment.at);
  const label = Number.isNaN(date.getTime())
    ? selectedMonth
    : `${date.getMonth() + 1}/${date.getDate()}`;
  return `${label}:${Number(payment.amount)}円${payment.method}`;
}

function lessonButtonLabel(index) {
  const lesson = monthData().lessons[index];
  if (!lesson?.date) return `稽古${index + 1}`;

  const [, month, day] = lesson.date.split("-");
  return `稽古${index + 1} ${Number(month)}/${Number(day)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function changeMonth(offset) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  selectedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  render();
}

els.prevMonth.addEventListener("click", () => changeMonth(-1));
els.nextMonth.addEventListener("click", () => changeMonth(1));
els.targetMonth.addEventListener("change", (event) => {
  selectedMonth = event.target.value || currentMonth();
  render();
});

els.skipMonthlyFee.addEventListener("change", () => {
  const data = monthData();
  data.monthlyFeeEnabled = !els.skipMonthlyFee.checked;
  addEvent(data.monthlyFeeEnabled ? "今月の部費を有効にしました" : "今月は全員の部費を免除しました");
  saveState();
  render();
});

[
  { date: els.lesson1Date, fee: els.lesson1Fee, index: 0 },
  { date: els.lesson2Date, fee: els.lesson2Fee, index: 1 },
].forEach((controls) => {
  controls.date.addEventListener("change", () => updateLessonSetting(controls.index));
  controls.fee.addEventListener("change", () => updateLessonSetting(controls.index));
});

function updateLessonSetting(index) {
  const data = monthData();
  const dateInput = index === 0 ? els.lesson1Date : els.lesson2Date;
  const feeInput = index === 0 ? els.lesson1Fee : els.lesson2Fee;

  data.lessons[index] = {
    date: dateInput.value,
    fee: normalizeMoney(feeInput.value),
  };

  addEvent(`稽古${index + 1}を${formatLesson(data.lessons[index])}に変更`);
  saveState();
  render();
}

function formatLesson(lesson) {
  const date = lesson.date || "日程未定";
  return `${date} / ${yen.format(lesson.fee)}`;
}

els.addMemberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.memberName.value.trim();
  const faculty = els.memberFaculty.value.trim();
  const grade = Math.max(Number(els.memberGrade.value) || 1, 1);
  if (!name) return;
  state.members.push({ id: crypto.randomUUID(), name, faculty, grade, joinedMonth: selectedMonth, paused: false, priorArrears: 0, notes: "" });
  monthData().pausedMembers[state.members[state.members.length - 1].id] = false;
  addEvent(`${name}さんを追加`);
  els.memberName.value = "";
  els.memberFaculty.value = "";
  els.memberGrade.value = "";
  saveState();
  render();
});

els.members.addEventListener("input", (event) => {
  const input = event.target.closest('input[data-action="grade"]');
  if (!input) return;

  const member = state.members.find((item) => item.id === input.dataset.id);
  if (!member) return;

  member.grade = Math.max(Number(input.value) || 1, 1);
  saveState();
});

els.members.addEventListener("change", (event) => {
  const input = event.target.closest('input[data-action="grade"]');
  if (!input) return;

  const member = state.members.find((item) => item.id === input.dataset.id);
  if (!member) return;

  member.grade = Math.max(Number(input.value) || 1, 1);
  addEvent(`${member.name}さんの学年を${member.grade}年に変更`);
  saveState();
  render();
});

els.members.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const member = state.members.find((item) => item.id === button.dataset.id);
  if (!member) return;

  const data = monthData();
  const action = button.dataset.action;

  if (action === "move-up" || action === "move-down") {
    moveMember(member.id, action === "move-up" ? -1 : 1);
    saveState();
    render();
    return;
  }

  if (action === "toggle-lesson") {
    const lessonIndex = Number(button.dataset.lesson);
    const attendance = memberAttendance(member.id, data);
    const nextValue = !attendance[lessonIndex];
    setMemberAttendance(member.id, lessonIndex, nextValue);
    addEvent(`${member.name}さん 稽古${lessonIndex + 1}を${nextValue ? "参加" : "不参加"}に変更`);
  }

  if (action === "toggle-pause") {
    const nextPaused = !memberLedger(member).isPaused;
    data.pauseOverrides[member.id] = nextPaused;
    data.pausedMembers[member.id] = nextPaused;
    propagatePauseState(member, nextPaused);
    addEvent(`${member.name}さんを${nextPaused ? "休部中" : "在籍"}に変更`);
  }

  if (action === "pay") {
    payingMemberId = member.id;
    const ledger = memberLedger(member);
    els.paymentMember.textContent = `${member.name}さん`;
    els.paymentAmount.value = ledger.due > 0 ? ledger.due : "";
    els.paymentDialog.showModal();
    return;
  }

  if (action === "arrears") {
    arrearsMemberId = member.id;
    els.arrearsMember.textContent = `${member.name}さん`;
    els.arrearsAmount.value = memberLedger(member).priorArrears;
    els.arrearsDialog.showModal();
    return;
  }

  if (action === "notes") {
    arrearsMemberId = null;
    payingMemberId = null;
    els.notesMember.textContent = `${member.name}さん`;
    els.notesText.value = member.notes || "";
    els.notesDialog.dataset.memberId = member.id;
    els.notesDialog.showModal();
    return;
  }

  if (action === "remove") {
    const ok = confirm(`${member.name}さんを削除しますか？`);
    if (!ok) return;
    state.members = state.members.filter((item) => item.id !== member.id);
    addEvent(`${member.name}さんを削除`);
  }

  saveState();
  render();
});

function moveMember(memberId, offset) {
  const currentIndex = state.members.findIndex((member) => member.id === memberId);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.members.length) return;

  const [member] = state.members.splice(currentIndex, 1);
  state.members.splice(nextIndex, 0, member);
  addEvent(`${member.name}さんを${offset < 0 ? "上" : "下"}へ移動`);
}

els.paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const member = state.members.find((item) => item.id === payingMemberId);
  const amount = Math.max(Number(els.paymentAmount.value) || 0, 0);
  const method = els.paymentForm.querySelector('input[name="paymentMethod"]:checked')?.value || "振込";

  if (!member || amount <= 0) return;

  const data = monthData();
  if (!data.payments[member.id]) data.payments[member.id] = [];
  const at = new Date().toISOString();
  data.payments[member.id].push({
    id: crypto.randomUUID(),
    amount,
    method,
    at,
  });
  appendMemberNote(member, formatPayment({ amount, method, at }));
  addEvent(`${member.name}さん ${method}で${yen.format(amount)}入金`);
  saveState();
  els.paymentDialog.close();
  payingMemberId = null;
  render();
});

els.cancelPayment.addEventListener("click", () => {
  els.paymentDialog.close();
  payingMemberId = null;
});

els.arrearsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const member = state.members.find((item) => item.id === arrearsMemberId);
  const parsedAmount = Number(els.arrearsAmount.value);
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  if (!member) return;

  monthData().arrearsOverrides[member.id] = amount;
  addEvent(`${member.name}さんの先月までの滞納を${yen.format(amount)}に設定`);
  saveState();
  els.arrearsDialog.close();
  arrearsMemberId = null;
  render();
});

els.cancelArrears.addEventListener("click", () => {
  els.arrearsDialog.close();
  arrearsMemberId = null;
});

els.notesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const member = state.members.find((item) => item.id === els.notesDialog.dataset.memberId);
  if (!member) return;

  member.notes = els.notesText.value.trim();
  addEvent(`${member.name}さんの備考を更新`);
  saveState();
  els.notesDialog.close();
  render();
});

els.cancelNotes.addEventListener("click", () => {
  els.notesDialog.close();
});

function appendMemberNote(member, text) {
  member.notes = [member.notes, text].filter(Boolean).join("\n");
}

els.openImport.addEventListener("click", () => {
  els.importText.value = "";
  updateImportPreview();
  els.importDialog.showModal();
});

els.importText.addEventListener("input", updateImportPreview);

els.cancelImport.addEventListener("click", () => {
  els.importDialog.close();
});

els.appendImport.addEventListener("click", () => {
  importMembersFromPaste("append");
});

els.importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  importMembersFromPaste("replace");
});

function updateImportPreview() {
  const parsed = parseImportedMembers(els.importText.value);
  if (!els.importText.value.trim()) {
    els.importPreview.textContent = "貼り付けると読み取り結果が出ます。";
    return;
  }

  const sample = parsed.members
    .slice(0, 5)
    .map((member) => `${member.name}(${member.faculty || "学部未設定"}・${member.grade}年${member.paidProvided ? `・納金${yen.format(member.paidAmount)}` : ""})`)
    .join("、");
  els.importPreview.textContent = parsed.members.length
    ? `${parsed.members.length}人を読み取りました。${sample}${parsed.members.length > 5 ? "、..." : ""}`
    : "名前を読み取れませんでした。名前列を含む表を貼り付けてください。";
}

function importMembersFromPaste(mode) {
  const parsed = parseImportedMembers(els.importText.value);
  if (!parsed.members.length) {
    alert("読み取れる部員がありませんでした。Excelの表をコピーして貼り付けてください。");
    return;
  }

  const data = monthData();
  if (mode === "replace") {
    const ok = confirm(`${parsed.members.length}人で部員リストを入れ替えますか？`);
    if (!ok) return;
    state.members = parsed.members;
    parsed.members.forEach((member) => applyImportedPayment(member, data));
    addEvent(`Excel貼り付けから${parsed.members.length}人で部員リストを入れ替え`);
  } else {
    let added = 0;
    let updated = 0;
    parsed.members.forEach((importedMember) => {
      const existing = state.members.find((member) => member.name === importedMember.name);
      if (existing) {
        if (importedMember.faculty) existing.faculty = importedMember.faculty;
        existing.grade = importedMember.grade;
        existing.priorArrears = importedMember.priorArrears;
        data.arrearsOverrides[existing.id] = importedMember.priorArrears;
        applyImportedPayment({ ...importedMember, id: existing.id }, data);
        if (importedMember.statusProvided) {
          data.pauseOverrides[existing.id] = importedMember.paused;
          data.pausedMembers[existing.id] = importedMember.paused;
          propagatePauseState(existing, importedMember.paused);
        }
        existing.notes = importedMember.notes || existing.notes;
        updated += 1;
        return;
      }

      const { statusProvided, paidProvided, paidAmount, ...newMember } = importedMember;
      state.members.push(newMember);
      data.pausedMembers[newMember.id] = newMember.paused;
      applyImportedPayment(importedMember, data);
      if (statusProvided) {
        data.pauseOverrides[newMember.id] = newMember.paused;
        propagatePauseState(newMember, newMember.paused);
      }
      added += 1;
    });
    addEvent(`Excel貼り付けから${added}人追加、${updated}人更新`);
  }

  saveState();
  els.importDialog.close();
  render();
}

function applyImportedPayment(member, data) {
  if (!member.paidProvided) return;
  const amount = Math.max(Number(member.paidAmount) || 0, 0);
  data.payments[member.id] = amount > 0
    ? [{ id: crypto.randomUUID(), amount, method: "振込", at: new Date().toISOString() }]
    : [];
}

function parseImportedMembers(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitImportRow)
    .filter((row) => row.some(Boolean));

  if (!rows.length) return { members: [] };

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => ["名前", "氏名", "部員名"].includes(normalizeHeader(cell))),
  );
  const headers = headerIndex >= 0 ? rows[headerIndex].map(normalizeHeader) : [];
  const dataRows = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0);
  const indexes = headerIndex >= 0 ? importColumnIndexes(headers) : fallbackColumnIndexes();

  const members = dataRows
    .map((row) => importedRowToMember(row, indexes))
    .filter(Boolean);

  return { members };
}

function splitImportRow(line) {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/\s/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace("氏名", "名前");
}

function importColumnIndexes(headers) {
  const find = (...names) => headers.findIndex((header) => names.includes(header));
  return {
    faculty: find("学部", "学部名", "所属学部"),
    grade: find("学年", "年", "年次", "学年次"),
    name: find("名前", "部員名"),
    arrears: find("先月末", "先月までの滞納", "持越"),
    paid: find("納金", "入金", "入金額", "納入額", "支払額"),
    status: find("状態"),
    notes: find("備考"),
  };
}

function fallbackColumnIndexes() {
  return {
    faculty: 1,
    grade: 2,
    name: 3,
    arrears: 4,
    paid: 8,
    status: -1,
    notes: 10,
  };
}

function importedRowToMember(row, indexes) {
  const name = cleanImportedName(row[indexes.name]);
  if (!name || name === "名前") return null;

  return {
    id: crypto.randomUUID(),
    name,
    faculty: indexes.faculty >= 0 ? String(row[indexes.faculty] || "").trim() : "",
    grade: parseGrade(row[indexes.grade]),
    joinedMonth: selectedMonth,
    paused: row[indexes.status] ? row[indexes.status].includes("休") : false,
    statusProvided: indexes.status >= 0,
    priorArrears: parseAmount(row[indexes.arrears]),
    paidProvided: indexes.paid >= 0,
    paidAmount: indexes.paid >= 0 ? parseAmount(row[indexes.paid]) : 0,
    notes: row[indexes.notes] || "",
  };
}

function cleanImportedName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function parseGrade(value) {
  const match = String(value || "").normalize("NFKC").match(/-?\d+/);
  return match ? Math.max(Number(match[0]), 1) : 1;
}

function parseAmount(value) {
  const normalized = String(value || "").replace(/[￥¥,\s]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

els.history.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-event-id]");
  if (!button) return;

  const data = monthData();
  data.events = data.events.filter((item) => item.id !== button.dataset.eventId);
  saveState();
  render();
});

els.promoteGrades.addEventListener("click", () => {
  const ok = confirm("全員の学年を1つ上げますか？");
  if (!ok) return;

  state.members.forEach((member) => {
    member.grade = Math.max(Number(member.grade) || 1, 1) + 1;
  });
  addEvent("全員の学年を1つ上げました");
  saveState();
  render();
});

els.settleSuggested.addEventListener("click", () => {
  const method = prompt("入金方法を入力してください（振込 / 現金）", "振込");
  if (!method) return;

  state.members.forEach((member) => {
    const ledger = memberLedger(member);
    if (ledger.due <= 0) return;
    const data = monthData();
    if (!data.payments[member.id]) data.payments[member.id] = [];
    const at = new Date().toISOString();
    data.payments[member.id].push({
      id: crypto.randomUUID(),
      amount: ledger.due,
      method,
      at,
    });
    appendMemberNote(member, formatPayment({ amount: ledger.due, method, at }));
    addEvent(`${member.name}さん ${method}で${yen.format(ledger.due)}入金`);
  });

  saveState();
  render();
});

function exportCsv() {
  const data = monthData();
  const lesson1Title = lessonExportLabel(data.lessons[0], 1);
  const lesson2Title = lessonExportLabel(data.lessons[1], 2);
  const rows = [
    [
      "No.",
      "学部",
      "学年",
      "名前",
      "先月末",
      lesson1Title,
      lesson2Title,
      "請求",
      "納金",
      "今月末",
      "備考",
    ],
    ...state.members.map((member, index) => {
      const ledger = memberLedger(member);
      return [
        index + 1,
        member.faculty || "",
        member.grade,
        member.name,
        ledger.priorArrears,
        ledger.attendance[0] ? 1 : 0,
        ledger.attendance[1] ? 1 : 0,
        ledger.billed,
        ledger.paid,
        ledger.due,
        member.notes || "",
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `華道部会計_${selectedMonth}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

els.exportCsv.addEventListener("click", exportCsv);

els.exportExcel.addEventListener("click", () => {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.matchMedia("(max-width: 900px)").matches);
  if (isMobile) {
    exportCsv();
    showSaveStatus("スマホ用のExcel互換CSVを出力しました", true);
    return;
  }

  const data = monthData();
  const tableStartRow = 5;
  const title = `${selectedMonth}分`;
  const lesson1Title = lessonExportLabel(data.lessons[0], 1);
  const lesson2Title = lessonExportLabel(data.lessons[1], 2);
  const rowsHtml = state.members
    .map((member, index) => {
      const ledger = memberLedger(member);
      const rowNumber = tableStartRow + index + 1;
      const monthlyFeeFormula = !data.monthlyFeeEnabled
        ? "0"
        : ledger.isPaused
          ? `IF(OR(F${rowNumber}=1,G${rowNumber}=1),2000,0)`
          : "2000";
      const chargeFormula = `=${monthlyFeeFormula}+IF(F${rowNumber}=1,$F$3,0)+IF(G${rowNumber}=1,$G$3,0)`;
      const balanceFormula = `=H${rowNumber}-I${rowNumber}`;
      const debtClass = ledger.due > 0 ? "arrears" : "no-arrears";

      return `
        <tr>
          <td class="index">${index + 1}</td>
          <td>${escapeHtml(member.faculty || "")}</td>
          <td>${member.grade}年</td>
          <td class="${debtClass}">${escapeHtml(member.name)}</td>
          <td class="${ledger.priorArrears > 0 ? "arrears" : "no-arrears"}">${ledger.priorArrears}</td>
          <td>${ledger.attendance[0] ? 1 : 0}</td>
          <td>${ledger.attendance[1] ? 1 : 0}</td>
          <td class="${excelAmountClass(ledger.billed)}">=E${rowNumber}+${chargeFormula.slice(1)}</td>
          <td class="${excelAmountClass(ledger.paid)}">${ledger.paid}</td>
          <td class="${debtClass}">${balanceFormula}</td>
          <td class="notes">${escapeHtml(member.notes || "")}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; table-layout: fixed; width: 1250px; font-family: sans-serif; }
          td, th { border: 1px solid #000; padding: 4px 6px; mso-number-format: "#,##0"; }
          col.index { width: 55px; }
          col.faculty { width: 115px; }
          col.grade { width: 65px; }
          col.name { width: 125px; }
          col.money { width: 120px; }
          col.attendance { width: 85px; }
          col.notes { width: 240px; }
          .title { font-size: 16px; font-weight: bold; border: 0; }
          .meta { border: 0; color: #555; }
          th { background: #f2f2f2; font-weight: bold; }
          .index { background: #ffff00; }
          .amount-plus { color: #0070c0; font-weight: bold; }
          .amount-minus { color: #ff0000; font-weight: bold; }
          .amount-zero { color: #000000; }
          .arrears { color: #ff0000; font-weight: bold; }
          .no-arrears { color: #0070c0; font-weight: bold; }
          .notes { mso-number-format: "\\@"; }
        </style>
      </head>
      <body>
        <table>
          <colgroup>
            <col class="index" width="55" />
            <col class="faculty" width="115" />
            <col class="grade" width="65" />
            <col class="name" width="125" />
            <col class="money" width="120" />
            <col class="attendance" width="85" />
            <col class="attendance" width="85" />
            <col class="money" width="120" />
            <col class="money" width="120" />
            <col class="money" width="120" />
            <col class="notes" width="240" />
          </colgroup>
          <tr><td class="title" colspan="11">${escapeHtml(title)}</td></tr>
          <tr>
            <td class="meta" colspan="5">稽古日程・金額</td>
            <td>${escapeHtml(data.lessons[0].date || "")}</td>
            <td>${escapeHtml(data.lessons[1].date || "")}</td>
            <td class="meta" colspan="4"></td>
          </tr>
          <tr>
            <td class="meta" colspan="5"></td>
            <td>${data.lessons[0].fee}</td>
            <td>${data.lessons[1].fee}</td>
            <td class="meta" colspan="4"></td>
          </tr>
          <tr><td class="meta" colspan="11"></td></tr>
          <tr>
            <th>No.</th>
            <th>学部</th>
            <th>学年</th>
            <th>名前</th>
            <th>先月末</th>
            <th>${escapeHtml(lesson1Title)}</th>
            <th>${escapeHtml(lesson2Title)}</th>
            <th>請求</th>
            <th>納金</th>
            <th>今月末</th>
            <th>備考</th>
          </tr>
          ${rowsHtml}
        </table>
      </body>
    </html>
  `;

  downloadFile(
    `華道部会計_${selectedMonth}.xls`,
    html,
    "application/vnd.ms-excel;charset=utf-8",
  );
});

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function lessonExportLabel(lesson, number) {
  if (!lesson.date) return `稽古${number}`;
  const [, , day] = lesson.date.split("-");
  return `${Number(day)}日`;
}

function excelAmountClass(value) {
  if (value > 0) return "amount-plus";
  if (value < 0) return "amount-minus";
  return "amount-zero";
}

els.clearMonth.addEventListener("click", () => {
  const ok = confirm(`${selectedMonth}の記録だけ消しますか？`);
  if (!ok) return;
  delete state.months[selectedMonth];
  saveState();
  render();
});

els.resetDemo.addEventListener("click", () => {
  const ok = confirm("初期データに戻しますか？");
  if (!ok) return;
  state = structuredClone(initialState);
  selectedMonth = currentMonth();
  saveState();
  render();
});

render();
