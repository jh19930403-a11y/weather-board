// logic.js – 판단 규칙만 (화면을 다루는 코드 금지)

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

const REGIONS = {
  '세종': { latitude: 36.4801, longitude: 127.2890 },
  '대전': { latitude: 36.3504, longitude: 127.3845 },
  '태안': { latitude: 36.7456, longitude: 126.2980 },
  '보령': { latitude: 36.3334, longitude: 126.6128 },
};

function buildWeatherUrl(region) {
  const coordinates = REGIONS[region];
  if (!coordinates) throw new Error('지원하지 않는 지역입니다.');
  const params = new URLSearchParams({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    daily: 'temperature_2m_max,wind_speed_10m_max,precipitation_probability_max',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + params.toString();
}

function parseWeather(data, testWind = false) {
  const daily = data && data.daily;
  const tempMax = daily && daily.temperature_2m_max && daily.temperature_2m_max[0];
  const windMax = daily && daily.wind_speed_10m_max && daily.wind_speed_10m_max[0];
  const rainProb = daily && daily.precipitation_probability_max && daily.precipitation_probability_max[0];
  if (![tempMax, windMax, rainProb].every(Number.isFinite)) {
    throw new Error('날씨 응답에 필요한 숫자가 없습니다.');
  }
  return { tempMax, windMax: testWind ? 12 : windMax, rainProb };
}

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

function markdownCell(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '&#124;')
    .replace(/([*_`\[\]])/g, '\\$1')
    .replace(/\r\n|\r|\n/g, '<br>');
}

// 화면을 다루지 않고, 전달받은 표의 내용을 마크다운 문자열로 변환합니다.
function buildJudgmentMarkdown(rows, date) {
  const lines = [
    '# 현장 일정 판단 — ' + date,
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => '| ' + row.map(markdownCell).join(' | ') + ' |'),
    '',
    '판단 기준(교육용): 실내는 영향 없음; 실외 날씨 미확인은 날씨 확인 전; 그 외 고소 풍속 ' + RULES.wind + 'm/s 이상 → 중지 검토, 최고 기온 ' + RULES.heat + '℃ 이상 → 폭염 휴식, 강수확률 ' + RULES.rain + '% 이상 → 우천 주의 순으로 우선 적용하며, 해당 없으면 진행.',
    '',
  ];
  return lines.join('\n');
}

if (typeof module !== 'undefined') module.exports = { RULES, REGIONS, buildWeatherUrl, parseWeather, judge, buildJudgmentMarkdown };
