// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let addedTasks = [];
let tasksLoading = true;
let tasks = [];
let weatherByRegion = {};

async function loadWeather() {
  const status = document.getElementById('weatherStatus');
  const testWind = new URLSearchParams(window.location.search).get('test') === 'wind';
  const failedRegions = [];
  const testNotice = testWind ? ' · 강풍 시험: 풍속 12m/s 적용' : '';
  status.textContent = '오늘 날씨를 불러오는 중입니다.' + testNotice;

  await Promise.all(Object.keys(REGIONS).map(async (region) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패');
      weatherByRegion[region] = parseWeather(await response.json(), testWind);
      renderTasks();
    } catch (error) {
      failedRegions.push(region);
    } finally {
      clearTimeout(timeout);
    }
  }));

  status.textContent = failedRegions.length
    ? '날씨를 불러오지 못한 지역: ' + failedRegions.join(', ') + '. 인터넷 연결을 확인하고 새로고침해 주세요. 일정은 계속 볼 수 있습니다.' + testNotice
    : '오늘 날씨 반영 완료 · 최고 기온(℃) / 최대 풍속(m/s) / 최대 강수확률(%)' + testNotice;
}

function isTask(task) {
  return task && typeof task.title === 'string' && typeof task.owner === 'string' &&
    Object.hasOwn(REGIONS, task.region) && ['야외', '고소', '실내'].includes(task.kind);
}

async function loadTasks() {
  const message = document.getElementById('msgBox');
  message.textContent = '일정 목록을 불러오는 중입니다.';
  try {
    const response = await fetch('data/tasks.json');
    if (!response.ok) throw new Error('일정 요청 실패');
    const data = await response.json();
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('일정 형식 오류');
    baseTasks = data;
    message.textContent = '';
  } catch (error) {
    message.textContent = window.location.protocol === 'file:'
      ? '배포주소로열어주세요'
      : '기본 일정 목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.';
  }

  // 기본 JSON을 먼저 읽은 뒤, 이 브라우저에서 추가한 일정만 합칩니다.
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    if (!Array.isArray(saved) || !saved.every(isTask)) throw new Error('저장된 일정 형식 오류');
    addedTasks = saved;
  } catch (error) {
    message.textContent += ' 브라우저에 저장된 추가 일정을 읽지 못했습니다.';
  }
  tasks = baseTasks.concat(addedTasks);
  tasksLoading = false;
  renderTasks();
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function addTask(e) {
  e.preventDefault();
  if (tasksLoading) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const updated = addedTasks.concat(t);
  try {
    localStorage.setItem('wx_added', JSON.stringify(updated));
  } catch (error) {
    document.getElementById('msgBox').textContent = '추가 일정을 저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.';
    return;
  }
  addedTasks = updated;
  tasks = baseTasks.concat(addedTasks);
  e.target.reset();
  renderTasks();
}

const today = new Date();
document.getElementById('todayDate').textContent =
  today.getFullYear() + '-' +
  String(today.getMonth() + 1).padStart(2, '0') + '-' +
  String(today.getDate()).padStart(2, '0');

document.getElementById('taskForm').addEventListener('submit', addTask);
loadTasks();
renderTasks();
loadWeather();
