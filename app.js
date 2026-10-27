// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasksLoading = true;
let tasksReady = false;
let taskSaving = false;
let taskClient = null;
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
    taskClient = createTaskClient();
    const { data, error } = await taskClient.from('wx_tasks')
      .select('id,title,region,kind,owner').order('id', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('일정 형식 오류');
    tasks = data;
    tasksReady = true;
    message.textContent = tasks.length ? '' : '저장된 일정이 없습니다. 일정을 추가해 주세요.';
  } catch (error) {
    message.textContent = error.setupMessage || '일정 목록을 불러오지 못했습니다. 인터넷 연결, config.js 설정, setup.sql 실행 여부를 확인하고 새로고침해 주세요.';
  } finally {
    tasksLoading = false;
    renderTasks();
    document.getElementById('addTaskButton').disabled = !tasksReady;
    document.getElementById('saveMarkdownButton').disabled = !tasksReady;
  }
}

function createTaskClient() {
  function setupError(message) {
    const error = new Error(message);
    error.setupMessage = message;
    return error;
  }
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL.trim() ||
      typeof SUPABASE_PUBLIC_KEY !== 'string' || !SUPABASE_PUBLIC_KEY.trim()) {
    throw setupError('config.js에 Supabase 주소와 공개용 키를 입력해 주세요.');
  }
  // 공개용 publishable 키 또는 기존 anon 키만 허용합니다.
  let publicKey = SUPABASE_PUBLIC_KEY.startsWith('sb_publishable_');
  try {
    if (!publicKey) {
      const payload = SUPABASE_PUBLIC_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      publicKey = JSON.parse(atob(payload)).role === 'anon';
    }
  } catch (error) {
    publicKey = false;
  }
  if (!publicKey) throw setupError('공개용 publishable 또는 anon 키를 사용해 주세요. 비밀 키는 사용할 수 없습니다.');
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw setupError('Supabase 스크립트를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
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

async function addTask(e) {
  e.preventDefault();
  if (tasksLoading || !tasksReady || taskSaving) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner || !isTask(t)) return;
  const message = document.getElementById('msgBox');
  const button = document.getElementById('addTaskButton');
  taskSaving = true;
  button.disabled = true;
  message.textContent = '추가 일정을 저장하는 중입니다.';
  try {
    const { data, error } = await taskClient.from('wx_tasks').insert(t)
      .select('id,title,region,kind,owner').single();
    if (error) throw error;
    if (!isTask(data)) throw new Error('저장 응답 형식 오류');
    tasks.push(data);
    e.target.reset();
    renderTasks();
    message.textContent = '일정을 저장했습니다.';
  } catch (error) {
    message.textContent = '저장을 확인하지 못했습니다. 입력은 유지됩니다. 새로고침해 저장 여부를 확인하고, 연결과 DB 권한을 점검해 주세요.';
  } finally {
    taskSaving = false;
    button.disabled = false;
  }
}

function saveJudgmentMarkdown() {
  if (tasksLoading) return;
  const now = new Date();
  const date = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const rows = Array.from(document.getElementById('taskList').rows,
    (row) => Array.from(row.cells, (cell) => cell.textContent));
  const markdown = buildJudgmentMarkdown(rows, date);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '현장일정_판단_' + date + '.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = new Date();
document.getElementById('todayDate').textContent =
  today.getFullYear() + '-' +
  String(today.getMonth() + 1).padStart(2, '0') + '-' +
  String(today.getDate()).padStart(2, '0');

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('saveMarkdownButton').addEventListener('click', saveJudgmentMarkdown);
loadTasks();
renderTasks();
loadWeather();
