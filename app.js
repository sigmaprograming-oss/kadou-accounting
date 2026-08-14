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
  members: [
    "上田",
    "門田",
    "西脇",
    "伊藤大輔",
    "坂口",
    "月原",
    "成",
    "朝倉",
    "村上",
    "和田",
    "伊沢",
    "曽田",
    "向谷",
    "西尾",
    "佐藤",
    "大沼",
    "堀井",
    "江川",
    "田中",
    "河野奈菜世",
    "河野琳",
    "須田",
    "内田",
    "宮木",
    "岩田",
    "中山",
    "吉本",
    "福山",
    "長谷川",
    "福井",
    "山岡",
    "脇田",
    "木下",
  ].map((name) => ({
    id: crypto.randomUUID(),
    name,
    grade: 1,
    paused: false,
    priorArrears: 0,
    notes: "",
  })),
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
  lesson1Date: document.querySelector("#lesson1Date"),
  lesson1Fee: document.querySelector("#lesson1Fee"),
  lesson2Date: document.querySelector("#lesson2Date"),
  lesson2Fee: document.querySelector("#lesson2Fee"),
  addMemberForm: document.querySelector("#addMemberForm"),
  memberName: document.querySelector("#memberName"),
  memberGrade: document.querySelector("#memberGrade"),
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
    return normalizeState(JSON.parse(saved));
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
    grade: Math.max(Number(member.grade) || 1, 1),
    paused: Boolean(member.paused),
    priorArrears: Math.max(Number(member.priorArrears) || 0, 0),
    notes: member.notes || "",
  }));

  return nextState.members.length ? nextState : structuredClone(initialState);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function monthData(month = selectedMonth) {
  if (!state.months[month]) {
    state.months[month] = {
      lessons: defaultLessons(),
      attendance: {},
      payments: {},
      events: [],
    };
  }

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

function memberLedger(member) {
  const data = monthData();
  const attendance = memberAttendance(member.id, data);
  const lessons = attendance.filter(Boolean).length;
  const payments = data.payments[member.id] || [];
  const priorArrears = Math.max(Number(member.priorArrears) || 0, 0);
  const monthlyCharge = member.paused ? 0 : fixedMonthlyFee;
  const lessonCharge = data.lessons.reduce((sum, lesson, index) => {
    return sum + (attendance[index] ? Math.max(Number(lesson.fee) || 0, 0) : 0);
  }, 0);
  const charged = monthlyCharge + lessonCharge;
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
    monthlyCharge,
    lessonCharge,
    charged,
    paid,
    paidCash,
    paidTransfer,
    paymentLog,
    due: priorArrears + charged - paid,
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
  els.lesson1Date.value = data.lessons[0].date;
  els.lesson1Fee.value = data.lessons[0].fee;
  els.lesson2Date.value = data.lessons[1].date;
  els.lesson2Fee.value = data.lessons[1].fee;

  const ledgers = state.members.map((member) => ({ member, ledger: memberLedger(member) }));
  const totals = ledgers.reduce(
    (sum, item) => {
      sum.charged += item.ledger.charged;
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
      <div class="member-name">
        <strong>${escapeHtml(member.name)}</strong>
        <small>部費 ${yen.format(ledger.monthlyCharge)} / 稽古 ${yen.format(ledger.lessonCharge)}</small>
      </div>
      <input class="grade-input" data-action="grade" data-id="${member.id}" type="number" min="1" step="1" value="${member.grade}" aria-label="${escapeHtml(member.name)}さんの学年" />
      <span class="status ${member.paused ? "paused" : ""}">${member.paused ? "休部中" : "在籍"}</span>
      <span>${ledger.lessons}回</span>
      <span class="amount ${ledger.priorArrears > 0 ? "due" : "settled"}">${yen.format(ledger.priorArrears)}</span>
      <span class="amount">${yen.format(ledger.charged)}</span>
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
  if (value < 0) return "balance-negative";
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
  const grade = Math.max(Number(els.memberGrade.value) || 1, 1);
  if (!name) return;
  state.members.push({ id: crypto.randomUUID(), name, grade, paused: false, priorArrears: 0, notes: "" });
  addEvent(`${name}さんを追加`);
  els.memberName.value = "";
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
    member.paused = !member.paused;
    addEvent(`${member.name}さんを${member.paused ? "休部中" : "在籍"}に変更`);
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
    els.arrearsAmount.value = Math.max(Number(member.priorArrears) || 0, 0);
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
  const method = new FormData(els.paymentForm).get("paymentMethod");

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
  const amount = Math.max(Number(els.arrearsAmount.value) || 0, 0);

  if (!member) return;

  member.priorArrears = amount;
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

els.exportCsv.addEventListener("click", () => {
  const data = monthData();
  const rows = [
    [
      "月",
      "No.",
      "名前",
      "学年",
      "状態",
      "先月末",
      "稽古1日程",
      "稽古1金額",
      "稽古1参加",
      "稽古2日程",
      "稽古2金額",
      "稽古2参加",
      "稽古回数",
      "今月請求",
      "現金",
      "振込",
      "納金",
      "今月末",
      "入金記録",
      "備考",
    ],
    ...state.members.map((member, index) => {
      const ledger = memberLedger(member);
      return [
        selectedMonth,
        index + 1,
        member.name,
        member.grade,
        member.paused ? "休部中" : "在籍",
        ledger.priorArrears,
        data.lessons[0].date,
        data.lessons[0].fee,
        ledger.attendance[0] ? 1 : 0,
        data.lessons[1].date,
        data.lessons[1].fee,
        ledger.attendance[1] ? 1 : 0,
        ledger.lessons,
        ledger.charged,
        ledger.paidCash,
        ledger.paidTransfer,
        ledger.paid,
        ledger.due,
        ledger.paymentLog,
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
  link.click();
  URL.revokeObjectURL(url);
});

els.exportExcel.addEventListener("click", () => {
  const data = monthData();
  const tableStartRow = 5;
  const title = `${selectedMonth}分`;
  const lesson1Title = lessonExportLabel(data.lessons[0], 1);
  const lesson2Title = lessonExportLabel(data.lessons[1], 2);
  const rowsHtml = state.members
    .map((member, index) => {
      const ledger = memberLedger(member);
      const rowNumber = tableStartRow + index + 1;
      const chargeFormula = `=IF(D${rowNumber}="休部中",0,2000)+IF(F${rowNumber}=1,$F$3,0)+IF(G${rowNumber}=1,$G$3,0)`;
      const paidFormula = `=I${rowNumber}+J${rowNumber}`;
      const balanceFormula = `=E${rowNumber}+H${rowNumber}-K${rowNumber}`;

      return `
        <tr>
          <td class="index">${index + 1}</td>
          <td>${member.grade}年</td>
          <td>${escapeHtml(member.name)}</td>
          <td>${member.paused ? "休部中" : "在籍"}</td>
          <td class="${excelAmountClass(ledger.priorArrears)}">${ledger.priorArrears}</td>
          <td>${ledger.attendance[0] ? 1 : 0}</td>
          <td>${ledger.attendance[1] ? 1 : 0}</td>
          <td class="${excelAmountClass(ledger.charged)}">${chargeFormula}</td>
          <td class="${excelAmountClass(ledger.paidCash)}">${ledger.paidCash}</td>
          <td class="${excelAmountClass(ledger.paidTransfer)}">${ledger.paidTransfer}</td>
          <td class="${excelAmountClass(ledger.paid)}">${paidFormula}</td>
          <td class="${excelAmountClass(ledger.due)}">${balanceFormula}</td>
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
          table { border-collapse: collapse; font-family: sans-serif; }
          td, th { border: 1px solid #000; padding: 4px 6px; mso-number-format: "#,##0"; }
          .title { font-size: 16px; font-weight: bold; border: 0; }
          .meta { border: 0; color: #555; }
          th { background: #f2f2f2; font-weight: bold; }
          .index { background: #ffff00; }
          .amount-plus { color: #0070c0; font-weight: bold; }
          .amount-minus { color: #ff0000; font-weight: bold; }
          .amount-zero { color: #000000; }
          .notes { mso-number-format: "\\@"; }
        </style>
      </head>
      <body>
        <table>
          <tr><td class="title" colspan="13">${escapeHtml(title)}</td></tr>
          <tr>
            <td class="meta" colspan="5">稽古日程・金額</td>
            <td>${escapeHtml(data.lessons[0].date || "")}</td>
            <td>${escapeHtml(data.lessons[1].date || "")}</td>
            <td class="meta" colspan="6"></td>
          </tr>
          <tr>
            <td class="meta" colspan="5"></td>
            <td>${data.lessons[0].fee}</td>
            <td>${data.lessons[1].fee}</td>
            <td class="meta" colspan="6"></td>
          </tr>
          <tr><td class="meta" colspan="13"></td></tr>
          <tr>
            <th>No.</th>
            <th>学年</th>
            <th>名前</th>
            <th>状態</th>
            <th>先月末</th>
            <th>${escapeHtml(lesson1Title)}</th>
            <th>${escapeHtml(lesson2Title)}</th>
            <th>部費</th>
            <th>現金</th>
            <th>振込</th>
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
  link.click();
  URL.revokeObjectURL(url);
}

function lessonExportLabel(lesson, number) {
  if (!lesson.date) return `稽古${number}`;
  const [, month, day] = lesson.date.split("-");
  return `${Number(month)}日/${Number(day)}日`;
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
