(() => {
  const { seasons, pointsSystem } = window.GTO_DATA;
  const state = { seasonIndex: seasons.length - 1, roundIndex: 0, sortKey: 'championshipPosition', sortDirection: 'asc', selectedDriver: null, profileSummarySortKey: 'seasonIndex', profileSummarySortDirection: 'desc', profileH2HSortKey: 'raceMeetings', profileH2HSortDirection: 'desc', profileCarSortKey: 'avgFinish', profileCarSortDirection: 'asc', profileLogSortKey: 'seasonIndex', profileLogSortDirection: 'desc', recordType: 'race', recordPosition: 1, carClass: null, carSortKey: 'points', carSortDirection: 'desc', leadPeriod: 'overall', leadSortKey: 'percentage', leadSortDirection: 'desc', trackSortKey: 'wins', trackSortDirection: 'desc' };
  const elements = {
    tabs: document.querySelector('#season-tabs'), summary: document.querySelector('#season-summary'), statCards: document.querySelector('#stat-cards'),
    standingsHeaders: document.querySelector('#standings-headers'), standings: document.querySelector('#standings-body'), standingsSortStatus: document.querySelector('#standings-sort-status'), standingsViewControls: document.querySelector('#standings-view-controls'),
    raceCards: document.querySelector('#race-cards'), roundSelect: document.querySelector('#round-select'), roundResults: document.querySelector('#round-results'),
    driverSelect: document.querySelector('#driver-select'), driverProfile: document.querySelector('#driver-profile-content'),
    carClassTabs: document.querySelector('#car-class-tabs'), carClassContent: document.querySelector('#car-class-content'),
    recordTypeTabs: document.querySelector('#record-type-tabs'), recordPositionTabs: document.querySelector('#record-position-tabs'), records: document.querySelector('#records-content'),
    leadPeriodTabs: document.querySelector('#lead-period-tabs'),
    pointsSystem: document.querySelector('#points-system'),
  };
  const number = new Intl.NumberFormat('en-US');
  const sortDefaults = { championshipPosition: 'asc', name: 'asc', points: 'desc', invertPoints: 'desc', wins: 'desc', podiums: 'desc', poles: 'desc', fastestLaps: 'desc', completed: 'desc', avgFinish: 'asc', avgQualifying: 'asc', lapsLed: 'desc', lapsLedPercentage: 'desc' };
  const sortLabels = { championshipPosition: 'championship position', name: 'driver', points: 'points', invertPoints: 'invert points', wins: 'wins', podiums: 'podiums', poles: 'pole positions', fastestLaps: 'fastest laps', completed: 'starts', avgFinish: 'average finish', avgQualifying: 'average qualifying position', lapsLed: 'laps led', lapsLedPercentage: 'laps led percentage' };
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const position = (value) => value === null || value === undefined ? '—' : `P${value}`;
  const average = (value) => value === null || value === undefined ? '—' : value.toFixed(1);
  const getSeason = () => seasons[state.seasonIndex];
  const carClassOrder = ['Gr.1', 'Gr.2', 'Gr.3', 'Gr.4', 'Dirt', 'Karts', 'Formula', 'Drafting', 'One-off'];
  const carClassNames = { 'gr.1': 'Gr.1', 'gr.2': 'Gr.2', 'gr.3': 'Gr.3', 'gr.4': 'Gr.4', dirt: 'Dirt', karts: 'Karts', formula: 'Formula', drafting: 'Drafting' };
  function getCarClass(race) {
    const match = (race.name || '').match(/\(([^)]+)\)/);
    const label = match ? match[1].trim().toLowerCase().replace(/\s+/g, '') : '';
    return carClassNames[label] || 'One-off';
  }
  function getRoundLaps(race) {
    const match = (race.label || '').match(/\((\d+)\s*laps?\)/i);
    return match ? Number(match[1]) : null;
  }
  function getArchiveRounds(season) {
    return season.races.map((race, index) => ({ race, index })).filter(({ index }) => season.id !== '1' || season.drivers.some((driver) => driver.results[index]?.position !== null && driver.results[index]?.position !== undefined));
  }
  function getParticipationLapStats(entries) {
    const eligible = entries.filter((entry) => entry.position !== null && entry.position !== undefined && getRoundLaps(entry.race));
    const eligibleLaps = eligible.reduce((total, entry) => total + getRoundLaps(entry.race), 0);
    const lapsLed = eligible.reduce((total, entry) => total + (entry.lapsLed || 0), 0);
    return { eligibleLaps, lapsLedPercentage: eligibleLaps ? lapsLed / eligibleLaps * 100 : null };
  }

  function getStats(results) {
    const completed = results.filter((result) => result.position !== null && result.position !== undefined);
    const qualifying = results.filter((result) => result.qualifyingPosition !== null && result.qualifyingPosition !== undefined);
    const positionCounts = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 0]));
    const qualifyingCounts = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 0]));
    completed.forEach((result) => { if (result.position <= 15) positionCounts[result.position] += 1; });
    qualifying.forEach((result) => { if (result.qualifyingPosition <= 15) qualifyingCounts[result.qualifyingPosition] += 1; });
    return {
      completed, qualifying, positionCounts, qualifyingCounts,
      points: results.reduce((total, result) => total + (result.points || 0), 0),
      wins: positionCounts[1], podiums: completed.filter((result) => result.position <= 3).length,
      poles: results.filter((result) => result.pole).length, fastestLaps: results.filter((result) => result.fastestLap).length,
      lapsLed: results.reduce((total, result) => total + (result.lapsLed || 0), 0),
      avgFinish: completed.length ? completed.reduce((total, result) => total + result.position, 0) / completed.length : null,
      avgQualifying: qualifying.length ? qualifying.reduce((total, result) => total + result.qualifyingPosition, 0) / qualifying.length : null,
    };
  }

  const championshipPointDrops = { '3': 2, '4': 3 };
  const championshipInvertRounds = { '4': new Set([8, 9, 10, 11, 12]) };
  function seasonHasPointDrops(season) { return Boolean(championshipPointDrops[season.id]); }
  function getChampionshipBonus(entry, season) {
    const fastestLapPoints = entry.fastestLap ? 1 : 0;
    const polePoints = entry.pole ? 1 : 0;
    const invertPoints = entry.pole && championshipInvertRounds[season.id]?.has(entry.roundIndex) ? 5 : 0;
    return { fastestLapPoints, polePoints, invertPoints, totalBonusPoints: fastestLapPoints + polePoints + invertPoints };
  }
  function getDroppedChampionshipIndexes(entries, dropCount) {
    if (!dropCount) return new Set();
    return new Set(entries.map((entry, index) => ({ entry, index })).sort((a, b) => {
      const aMissed = a.entry.position === null || a.entry.position === undefined;
      const bMissed = b.entry.position === null || b.entry.position === undefined;
      if (aMissed !== bMissed) return aMissed ? -1 : 1;
      return (b.entry.position || 0) - (a.entry.position || 0) || (a.entry.championshipPoints || 0) - (b.entry.championshipPoints || 0) || a.index - b.index;
    }).slice(0, dropCount).map(({ index }) => index));
  }
  function calculateStandings(season, { applyChampionshipPointDrops = false, applyChampionshipBonusPoints = false, rounds = getArchiveRounds(season) } = {}) {
    return season.drivers.map((driver) => {
      const entries = rounds.map(({ race, index }) => {
        const result = { ...driver.results[index], race, roundIndex: index };
        const bonuses = applyChampionshipBonusPoints ? getChampionshipBonus(result, season) : { fastestLapPoints: 0, polePoints: 0, invertPoints: 0, totalBonusPoints: 0 };
        return { ...result, ...bonuses, championshipPoints: (result.points || 0) + bonuses.totalBonusPoints };
      });
      const stats = getStats(entries);
      const dropped = applyChampionshipPointDrops ? getDroppedChampionshipIndexes(entries, championshipPointDrops[season.id] || 0) : new Set();
      const credited = entries.filter((_, index) => !dropped.has(index));
      const pointTotals = credited.reduce((totals, entry) => ({
        basePoints: totals.basePoints + (entry.points || 0),
        fastestLapPoints: totals.fastestLapPoints + entry.fastestLapPoints,
        polePoints: totals.polePoints + entry.polePoints,
        invertPoints: totals.invertPoints + entry.invertPoints,
        points: totals.points + entry.championshipPoints
      }), { basePoints: 0, fastestLapPoints: 0, polePoints: 0, invertPoints: 0, points: 0 });
      return { ...driver, ...stats, ...pointTotals, ...getParticipationLapStats(entries) };
    }).filter((driver) => driver.completed.length)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.avgFinish - b.avgFinish || a.name.localeCompare(b.name))
      .map((driver, index) => ({ ...driver, championshipPosition: index + 1 }));
  }
  function getChampionshipFinishingStandings(season) {
    return calculateStandings(season, { applyChampionshipPointDrops: true, applyChampionshipBonusPoints: true });
  }

  function getCareerDrivers() {
    const map = new Map();
    seasons.forEach((season, seasonIndex) => season.drivers.forEach((driver) => {
      if (!map.has(driver.name)) map.set(driver.name, { name: driver.name, entries: [], seasons: [] });
      const career = map.get(driver.name);
      const entries = getArchiveRounds(season).map(({ race, index: roundIndex }) => ({ ...driver.results[roundIndex], season, seasonIndex, race, roundIndex }));
      career.entries.push(...entries);
      if (entries.some((result) => result.position !== null || result.qualifyingPosition !== null)) career.seasons.push({ season, seasonIndex, entries });
    }));
    return [...map.values()].map((driver) => ({ ...driver, ...getStats(driver.entries), ...getParticipationLapStats(driver.entries) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  const getCareerDriver = (name) => getCareerDrivers().find((driver) => driver.name === name);
  const driverLink = (name, className = 'driver-link') => `<button class="${className}" type="button" data-driver-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
  function roundResultRows(season, roundIndex) {
    const round = getArchiveRounds(season)[roundIndex]; if (!round) return [];
    return season.drivers.map((driver) => ({ ...driver, result: driver.results[round.index] }))
      .filter((driver) => driver.result.position !== null || driver.result.qualifyingPosition !== null)
      .sort((a, b) => (a.result.position ?? 999) - (b.result.position ?? 999) || (a.result.qualifyingPosition ?? 999) - (b.result.qualifyingPosition ?? 999));
  }

  function renderSortControls() {
    elements.standingsHeaders.querySelectorAll('[data-sort-key]').forEach((button) => {
      const active = button.dataset.sortKey === state.sortKey;
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('.sort-icon').textContent = active ? (state.sortDirection === 'asc' ? '↑' : '↓') : '↕';
    });
    const ordering = state.sortKey === 'name' ? (state.sortDirection === 'asc' ? 'A to Z' : 'Z to A') : (state.sortDirection === sortDefaults[state.sortKey] ? 'best to worst' : 'worst to best');
    elements.standingsSortStatus.textContent = `Standings sorted by ${sortLabels[state.sortKey]}, ${ordering}.`;
  }
  function sortStandings(standings) {
    return [...standings].sort((a, b) => {
      const aValue = state.sortKey === 'completed' ? a.completed.length : a[state.sortKey];
      const bValue = state.sortKey === 'completed' ? b.completed.length : b[state.sortKey];
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? a.championshipPosition - b.championshipPosition : 1;
      if (bValue === null || bValue === undefined) return -1;
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (state.sortDirection === 'asc' ? 1 : -1) || a.championshipPosition - b.championshipPosition;
    });
  }

  function renderTabs() {
    elements.tabs.innerHTML = seasons.map((season, index) => `<button class="season-tab" role="tab" type="button" aria-selected="${index === state.seasonIndex}" aria-controls="standings" data-season-index="${index}">${escapeHtml(season.name)}<span>${getArchiveRounds(season).length} rounds</span></button>`).join('');
  }
  function getStandingsUsePointDrops(season) { return seasonHasPointDrops(season) && state.standingsMode !== 'full'; }
  function renderStandingsViewControls() {
    const season = getSeason();
    if (!elements.standingsViewControls) return;
    if (!seasonHasPointDrops(season)) { elements.standingsViewControls.hidden = true; elements.standingsViewControls.innerHTML = ''; return; }
    const drops = championshipPointDrops[season.id]; const applyingDrops = getStandingsUsePointDrops(season);
    elements.standingsViewControls.hidden = false;
    elements.standingsViewControls.innerHTML = '<div class="segmented-controls" aria-label="Championship standings view">' +
      '<button type="button" data-standings-mode="full" aria-pressed="' + (!applyingDrops) + '">Full standings</button>' +
      '<button type="button" data-standings-mode="drops" aria-pressed="' + applyingDrops + '">Standings with points drops</button>' +
      '</div><p class="standings-view-note">' + escapeHtml(season.name) + ' uses ' + drops + ' point drop' + (drops === 1 ? '' : 's') + ': each driver\'s ' + (drops === 1 ? 'lowest-scoring round is' : drops + ' lowest-scoring rounds are') + ' excluded from championship points. A missed race counts as a lowest-scoring round. The dropped round\'s finish, pole, fastest lap, and laps-led statistics still remain in the archive.</p>' +
      '<p class="standings-bonus-note">Championship bonus points: +1 for fastest lap, +1 for pole position, and +5 invert points when the pole winner elects to invert the field. Invert points began in Season 4 and apply only when that option is chosen.</p>';
  }
  function renderOverview(standings) {
    const sourceSeason = getSeason(); const season = { ...sourceSeason, races: getArchiveRounds(sourceSeason).map(({ race }) => race) }; const leader = standings[0];
    const completedRounds = season.races.filter((_, index) => roundResultRows(season, index).length).length;
    const totalStarts = standings.reduce((total, driver) => total + driver.completed.length, 0);
    const pointsTotal = standings.reduce((total, driver) => total + driver.points, 0);
    elements.summary.textContent = `${season.races.length} scheduled rounds · ${standings.length} drivers with a start`;
    elements.statCards.innerHTML = `<article class="stat-card highlight"><p>Championship leader</p><strong>${leader ? escapeHtml(leader.name) : '—'}</strong><div class="meta">${leader ? `${number.format(leader.points)} pts · ${leader.wins} win${leader.wins === 1 ? '' : 's'} · ${leader.podiums} podium${leader.podiums === 1 ? '' : 's'}` : 'No recorded results'}</div></article><article class="stat-card"><p>Completed rounds</p><strong>${completedRounds}<span class="zero">/${season.races.length}</span></strong><div class="meta">Season calendar</div></article><article class="stat-card"><p>Drivers listed</p><strong>${standings.length}</strong><div class="meta">Drivers with a recorded start</div></article><article class="stat-card"><p>Recorded starts</p><strong>${totalStarts}</strong><div class="meta">${number.format(pointsTotal)} points awarded</div></article>`;
  }
  function getCareerCarClasses() {
    return [...new Set(seasons.flatMap((season) => getArchiveRounds(season).map(({ race }) => getCarClass(race))))].sort((a, b) => carClassOrder.indexOf(a) - carClassOrder.indexOf(b));
  }
  function renderCarClassStats() {
    const classes = getCareerCarClasses();
    if (!classes.includes(state.carClass)) state.carClass = classes[0] || 'One-off';
    elements.carClassTabs.innerHTML = classes.map((carClass) => `<button class="car-class-tab" type="button" role="tab" data-car-class="${escapeHtml(carClass)}" aria-selected="${carClass === state.carClass}">${escapeHtml(carClass)}</button>`).join('');
    const roundIndexes = seasons.flatMap((season) => getArchiveRounds(season).filter(({ race }) => getCarClass(race) === state.carClass).map(({ race, index }) => ({ season, race, index })));
    const standings = getCareerDrivers().map((driver) => {
      const entries = driver.entries.filter((entry) => getCarClass(entry.race) === state.carClass);
      return { ...driver, ...getStats(entries), ...getParticipationLapStats(entries) };
    }).filter((driver) => driver.completed.length)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.avgFinish - b.avgFinish || a.name.localeCompare(b.name));
    const leader = standings[0]; const eventList = roundIndexes.map(({ race, index }) => `R${index + 1} · ${escapeHtml(race.name || 'TBC')}`).join(' <span aria-hidden="true">/</span> ');
    elements.carClassContent.innerHTML = `<div class="car-class-header"><div><p class="eyebrow">${escapeHtml(state.carClass)} programme</p><h3>${roundIndexes.length} round${roundIndexes.length === 1 ? '' : 's'} in ${escapeHtml(state.carClass)}</h3><p>${eventList}</p></div><div class="car-class-leader"><span>Class leader</span><strong>${leader ? driverLink(leader.name, 'record-driver-link') : '—'}</strong><small>${leader ? `${number.format(leader.points)} pts · ${leader.wins} win${leader.wins === 1 ? '' : 's'}` : 'No classified starts'}</small></div></div><div class="table-shell car-class-table-shell"><table class="car-class-table"><thead><tr><th>Rank</th><th>Driver</th><th>Points</th><th>Wins</th><th>Podiums</th><th>Poles</th><th>Fastest laps</th><th>Starts</th><th>Avg. finish</th><th>Avg. qualifying</th><th>Laps led</th></tr></thead><tbody>${standings.map((driver, index) => `<tr><td class="standing-rank ${index < 3 ? 'top-three' : ''}">${String(index + 1).padStart(2, '0')}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td class="record-total">${number.format(driver.points)}</td><td>${driver.wins || '—'}</td><td>${driver.podiums || '—'}</td><td>${driver.poles || '—'}</td><td>${driver.fastestLaps || '—'}</td><td>${driver.completed.length}</td><td>${average(driver.avgFinish)}</td><td>${average(driver.avgQualifying)}</td><td>${driver.lapsLed || '—'}</td></tr>`).join('') || '<tr><td colspan="11">No classified results in this car class.</td></tr>'}</tbody></table></div>`;
  }
  function getCarSortValue(driver, key) {
    return key === 'completed' ? driver.completed.length : driver[key];
  }
  function sortCarStandings(standings) {
    return [...standings].sort((a, b) => {
      const aValue = getCarSortValue(a, state.carSortKey); const bValue = getCarSortValue(b, state.carSortKey);
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? a.name.localeCompare(b.name) : 1;
      if (bValue === null || bValue === undefined) return -1;
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (state.carSortDirection === 'asc' ? 1 : -1) || a.name.localeCompare(b.name);
    });
  }
  function carSortHeader(label, key) {
    return `<th><button class="sort-button car-sort-button" type="button" data-car-sort-key="${key}" aria-pressed="${key === state.carSortKey}">${label} <span class="sort-icon" aria-hidden="true">${key === state.carSortKey ? (state.carSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>`;
  }
  function renderCarClassStats() {
    const classes = getCareerCarClasses();
    if (!classes.includes(state.carClass)) state.carClass = classes[0] || 'One-off';
    elements.carClassTabs.innerHTML = classes.map((carClass) => `<button class="car-class-tab" type="button" role="tab" data-car-class="${escapeHtml(carClass)}" aria-selected="${carClass === state.carClass}">${escapeHtml(carClass)}</button>`).join('');
    const rounds = seasons.flatMap((season) => getArchiveRounds(season).filter(({ race }) => getCarClass(race) === state.carClass).map(({ race, index }) => ({ season, race, index })));
    const standings = getCareerDrivers().map((driver) => {
      const entries = driver.entries.filter((entry) => getCarClass(entry.race) === state.carClass);
      return { ...driver, ...getStats(entries), ...getParticipationLapStats(entries) };
    }).filter((driver) => driver.completed.length).sort((a, b) => b.points - a.points || b.wins - a.wins || a.avgFinish - b.avgFinish || a.name.localeCompare(b.name));
    const leader = standings[0]; const sorted = sortCarStandings(standings);
    const eventList = rounds.map(({ season, race, index }) => `${escapeHtml(season.name)} R${index + 1} - ${escapeHtml(race.name || 'TBC')}`).join(' <span aria-hidden="true">/</span> ');
    elements.carClassContent.innerHTML = `<div class="car-class-header"><div><p class="eyebrow">${escapeHtml(state.carClass)} all-time programme</p><h3>${rounds.length} round${rounds.length === 1 ? '' : 's'} in ${escapeHtml(state.carClass)}</h3><p>${eventList}</p></div><div class="car-class-leader"><span>Class leader</span><strong>${leader ? driverLink(leader.name, 'record-driver-link') : '—'}</strong><small>${leader ? `${number.format(leader.points)} pts - ${leader.wins} win${leader.wins === 1 ? '' : 's'}` : 'No classified starts'}</small></div></div><div class="table-shell car-class-table-shell"><table class="car-class-table"><thead><tr><th>Order</th>${carSortHeader('Driver', 'name')}${carSortHeader('Points', 'points')}${carSortHeader('Wins', 'wins')}${carSortHeader('Podiums', 'podiums')}${carSortHeader('Poles', 'poles')}${carSortHeader('Fastest laps', 'fastestLaps')}${carSortHeader('Starts', 'completed')}${carSortHeader('Avg. finish', 'avgFinish')}${carSortHeader('Avg. qualifying', 'avgQualifying')}${carSortHeader('Laps led', 'lapsLed')}${carSortHeader('Laps led %', 'lapsLedPercentage')}</tr></thead><tbody>${sorted.map((driver, index) => `<tr><td class="standing-rank ${index < 3 ? 'top-three' : ''}">${String(index + 1).padStart(2, '0')}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td class="record-total">${number.format(driver.points)}</td><td>${driver.wins || '—'}</td><td>${driver.podiums || '—'}</td><td>${driver.poles || '—'}</td><td>${driver.fastestLaps || '—'}</td><td>${driver.completed.length}</td><td>${average(driver.avgFinish)}</td><td>${average(driver.avgQualifying)}</td><td>${driver.lapsLed || '—'}</td><td class="lap-led-percent">${driver.lapsLedPercentage === null ? '—' : `${driver.lapsLedPercentage.toFixed(1)}%`}</td></tr>`).join('') || '<tr><td colspan="12">No classified results in this car class.</td></tr>'}</tbody></table></div>`;
  }
  function renderStandings(standings) {
    const sorted = sortStandings(standings); const leaderPoints = standings[0]?.points || 1;
    elements.standings.innerHTML = sorted.map((driver) => `<tr><td class="lap-led-percent">${driver.lapsLedPercentage === null ? '—' : `${driver.lapsLedPercentage.toFixed(1)}%`}</td><td class="standing-rank ${driver.championshipPosition <= 3 ? 'top-three' : ''}">${String(driver.championshipPosition).padStart(2, '0')}</td><td class="driver-name">${driverLink(driver.name)}</td><td><div class="points-value">${number.format(driver.points)} <span class="points-track" aria-hidden="true"><span class="points-fill" style="width:${driver.points / leaderPoints * 100}%"></span></span></div></td><td>${driver.wins || '<span class="zero">—</span>'}</td><td>${driver.podiums || '<span class="zero">—</span>'}</td><td>${driver.poles || '<span class="zero">—</span>'}</td><td>${driver.fastestLaps || '<span class="zero">—</span>'}</td><td>${driver.completed.length || '<span class="zero">—</span>'}</td><td>${average(driver.avgFinish)}</td><td>${average(driver.avgQualifying)}</td><td>${driver.lapsLed || '<span class="zero">—</span>'}</td></tr>`).join('');
    renderSortControls();
  }
  function renderSchedule() {
    const sourceSeason = getSeason(); const season = { ...sourceSeason, races: getArchiveRounds(sourceSeason).map(({ race }) => race) };
    elements.raceCards.innerHTML = season.races.map((race, index) => {
      const winner = roundResultRows(season, index).find((entry) => entry.result.position === 1);
      return `<article class="race-card"><div class="race-number">Round ${String(index + 1).padStart(2, '0')}<span>${winner ? 'Final' : 'No result'}</span></div><h3>${escapeHtml(race.name || 'TBC')}</h3><p>${escapeHtml(race.label || 'Round details unavailable')}</p><p class="winner">${winner ? `Winner · ${driverLink(winner.name, 'inline-driver-link')}` : 'No classified finish recorded'}</p></article>`;
    }).join('');
  }
  function renderRoundPicker() {
    const sourceSeason = getSeason(); const season = { ...sourceSeason, races: getArchiveRounds(sourceSeason).map(({ race }) => race) }; if (state.roundIndex >= season.races.length) state.roundIndex = 0;
    elements.roundSelect.innerHTML = season.races.map((race, index) => `<option value="${index}" ${index === state.roundIndex ? 'selected' : ''}>Round ${index + 1} · ${escapeHtml(race.name || 'TBC')}</option>`).join('');
  }
  function renderRoundResults() {
    const sourceSeason = getSeason(); const season = { ...sourceSeason, races: getArchiveRounds(sourceSeason).map(({ race }) => race) }; const race = season.races[state.roundIndex]; const results = roundResultRows(season, state.roundIndex);
    const rows = results.map((entry) => `<div class="result-row"><span class="result-position">${position(entry.result.position)}</span><span class="result-name">${driverLink(entry.name, 'result-driver-link')}</span><span class="result-qualifying">Q${entry.result.qualifyingPosition ?? '—'}<small>Qualifying</small></span><span class="result-points">${entry.result.points} pts<span>${entry.result.lapsLed ? `${entry.result.lapsLed} laps led` : '—'}</span></span></div>`).join('');
    elements.roundResults.innerHTML = `<div class="round-results-header"><div><p class="round-label">Round ${state.roundIndex + 1} · ${escapeHtml(race.label || 'Race details unavailable')}</p><h3>${escapeHtml(race.name || 'TBC')}</h3></div><p>${results.length ? `${results.length} driver record${results.length === 1 ? '' : 's'} · P = finish · Q = qualifying` : 'No classified result recorded'}</p></div>${results.length ? `<div class="results-list">${rows}</div>` : '<p class="no-results">This round does not have a recorded classified result in the supplied score sheet.</p>'}`;
  }

  function getHeadToHead(targetName) {
    return getCareerDrivers().filter((driver) => driver.name !== targetName).map((opponent) => {
      let raceWins = 0; let raceLosses = 0; let raceTies = 0; let qualWins = 0; let qualLosses = 0; let qualTies = 0;
      seasons.forEach((season) => {
        const target = season.drivers.find((driver) => driver.name === targetName); const rival = season.drivers.find((driver) => driver.name === opponent.name);
        if (!target || !rival) return;
        getArchiveRounds(season).forEach(({ index: roundIndex }) => {
          const a = target.results[roundIndex]; const b = rival.results[roundIndex];
          if (a.position !== null && b.position !== null) { if (a.position < b.position) raceWins += 1; else if (a.position > b.position) raceLosses += 1; else raceTies += 1; }
          if (a.qualifyingPosition !== null && b.qualifyingPosition !== null) { if (a.qualifyingPosition < b.qualifyingPosition) qualWins += 1; else if (a.qualifyingPosition > b.qualifyingPosition) qualLosses += 1; else qualTies += 1; }
        });
      });
      return { opponent, raceWins, raceLosses, raceTies, raceMeetings: raceWins + raceLosses + raceTies, qualWins, qualLosses, qualTies, qualMeetings: qualWins + qualLosses + qualTies };
    }).filter((row) => row.raceMeetings || row.qualMeetings).sort((a, b) => b.raceMeetings - a.raceMeetings || b.raceWins - a.raceWins || a.opponent.name.localeCompare(b.opponent.name));
  }
  function recordString(wins, losses, ties) { return `${wins}-${losses}${ties ? `-${ties}` : ''}`; }
  function renderProfileSelector() {
    const drivers = getCareerDrivers(); if (!state.selectedDriver || !drivers.some((driver) => driver.name === state.selectedDriver)) state.selectedDriver = drivers[0]?.name || null;
    elements.driverSelect.innerHTML = drivers.map((driver) => `<option value="${escapeHtml(driver.name)}" ${driver.name === state.selectedDriver ? 'selected' : ''}>${escapeHtml(driver.name)}</option>`).join('');
  }
  function renderDriverProfile() {
    const driver = getCareerDriver(state.selectedDriver); if (!driver) { elements.driverProfile.innerHTML = '<p class="no-profile">No driver history is available.</p>'; return; }
    const seasonRows = driver.seasons.slice().reverse().map(({ season, entries }) => { const stats = getStats(entries); const rank = calculateStandings(season).find((entry) => entry.name === driver.name); return `<tr><td>${escapeHtml(season.name)}</td><td>${rank ? `P${rank.championshipPosition}` : '—'}</td><td>${stats.completed.length}</td><td>${number.format(stats.points)}</td><td>${stats.wins || '—'}</td><td>${stats.podiums || '—'}</td><td>${stats.poles || '—'}</td><td>${average(stats.avgFinish)}</td></tr>`; }).join('');
    const raceRows = driver.entries.filter((entry) => entry.position !== null || entry.qualifyingPosition !== null).sort((a, b) => b.seasonIndex - a.seasonIndex || a.roundIndex - b.roundIndex).map((entry) => `<tr><td>${escapeHtml(entry.season.name)}</td><td>R${entry.roundIndex + 1}</td><td><strong>${escapeHtml(entry.race.name || 'TBC')}</strong><small>${escapeHtml(entry.race.label || 'Round details unavailable')}</small></td><td>${position(entry.position)}</td><td>${position(entry.qualifyingPosition)}</td><td>${entry.points || '—'}</td><td>${entry.lapsLed || '—'}</td><td class="race-log-notes">${entry.pole ? '<span>Pole</span>' : ''}${entry.fastestLap ? '<span>Fastest lap</span>' : ''}${!entry.pole && !entry.fastestLap ? '—' : ''}</td></tr>`).join('');
    const h2hRows = getHeadToHead(driver.name).map((entry) => `<tr><td>${driverLink(entry.opponent.name, 'record-driver-link')}</td><td>${entry.raceMeetings ? recordString(entry.raceWins, entry.raceLosses, entry.raceTies) : '—'}</td><td>${entry.raceMeetings || '—'}</td><td>${entry.qualMeetings ? recordString(entry.qualWins, entry.qualLosses, entry.qualTies) : '—'}</td><td>${entry.qualMeetings || '—'}</td></tr>`).join('');
    elements.driverProfile.innerHTML = `<article class="profile-hero"><div><p class="eyebrow">Career at a glance</p><h3>${escapeHtml(driver.name)}</h3><p>${driver.seasons.length} season${driver.seasons.length === 1 ? '' : 's'} · ${driver.completed.length} race start${driver.completed.length === 1 ? '' : 's'} · ${number.format(driver.points)} career points</p></div><div class="profile-metrics"><div><strong>${driver.wins}</strong><span>Wins</span></div><div><strong>${driver.podiums}</strong><span>Podiums</span></div><div><strong>${driver.poles}</strong><span>Poles</span></div><div><strong>${driver.fastestLaps}</strong><span>Fastest laps</span></div><div><strong>${driver.lapsLed}</strong><span>Laps led</span></div></div></article><div class="profile-layout"><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Season by season</p><h3>Championship summary</h3></div><p>Finish position reflects the final table from recorded results.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr><th>Season</th><th>Finish</th><th>Starts</th><th>Points</th><th>Wins</th><th>Podiums</th><th>Poles</th><th>Avg. finish</th></tr></thead><tbody>${seasonRows}</tbody></table></div></section><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Against the field</p><h3>Head-to-head</h3></div><p>W-L-T only counts rounds where both drivers have a recorded result.</p></div><div class="mini-table-shell"><table class="profile-table h2h-table"><thead><tr><th>Opponent</th><th>Race W-L-T</th><th>Races</th><th>Qual. W-L-T</th><th>Qual.</th></tr></thead><tbody>${h2hRows || '<tr><td colspan="5">No shared results recorded.</td></tr>'}</tbody></table></div></section></div><section class="profile-panel race-log-panel"><div class="panel-title"><div><p class="eyebrow">Complete race log</p><h3>Every recorded round</h3></div><p>P = finish · Q = qualifying</p></div><div class="mini-table-shell"><table class="profile-table race-log"><thead><tr><th>Season</th><th>Round</th><th>Event</th><th>Finish</th><th>Qual.</th><th>Points</th><th>Led</th><th>Notes</th></tr></thead><tbody>${raceRows || '<tr><td colspan="8">No round-by-round results recorded.</td></tr>'}</tbody></table></div></section>`;
  }

  const profileLogSortDefaults = { seasonIndex: 'desc', roundIndex: 'asc', event: 'asc', position: 'asc', qualifyingPosition: 'asc', points: 'desc', lapsLed: 'desc', notes: 'desc' };
  function getProfileLogSortValue(entry, key) {
    if (key === 'event') return entry.race.name || '';
    if (key === 'notes') return Number(entry.pole) + Number(entry.fastestLap);
    return entry[key];
  }
  function sortProfileLogEntries(entries) {
    return [...entries].sort((a, b) => {
      const aValue = getProfileLogSortValue(a, state.profileLogSortKey); const bValue = getProfileLogSortValue(b, state.profileLogSortKey);
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? b.seasonIndex - a.seasonIndex || a.roundIndex - b.roundIndex : 1;
      if (bValue === null || bValue === undefined) return -1;
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (state.profileLogSortDirection === 'asc' ? 1 : -1) || b.seasonIndex - a.seasonIndex || a.roundIndex - b.roundIndex;
    });
  }
  function profileLogHeader(label, key) {
    const active = state.profileLogSortKey === key;
    return `<th><button class="sort-button" type="button" data-profile-log-sort-key="${key}" aria-pressed="${active}">${label} <span class="sort-icon" aria-hidden="true">${active ? (state.profileLogSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>`;
  }
  function renderDriverProfile() {
    const driver = getCareerDriver(state.selectedDriver); if (!driver) { elements.driverProfile.innerHTML = '<p class="no-profile">No driver history is available.</p>'; return; }
    const seasonRows = driver.seasons.slice().reverse().map(({ season, entries }) => { const stats = getStats(entries); const rank = calculateStandings(season).find((entry) => entry.name === driver.name); return `<tr><td>${escapeHtml(season.name)}</td><td>${rank ? `P${rank.championshipPosition}` : '—'}</td><td>${stats.completed.length}</td><td>${number.format(stats.points)}</td><td>${stats.wins || '—'}</td><td>${stats.podiums || '—'}</td><td>${stats.poles || '—'}</td><td>${average(stats.avgFinish)}</td></tr>`; }).join('');
    const carAverageRows = getCareerCarClasses().map((carClass) => { const entries = driver.entries.filter((entry) => getCarClass(entry.race) === carClass); const stats = getStats(entries); return { carClass, stats }; }).filter(({ stats }) => stats.completed.length).map(({ carClass, stats }) => `<tr><td><strong>${escapeHtml(carClass)}</strong></td><td>${stats.completed.length}</td><td>${average(stats.avgFinish)}</td><td>${average(stats.avgQualifying)}</td><td>${stats.wins || '—'}</td><td>${stats.podiums || '—'}</td><td>${number.format(stats.points)}</td></tr>`).join('');
    const raceEntries = driver.entries.filter((entry) => entry.position !== null || entry.qualifyingPosition !== null);
    const raceRows = sortProfileLogEntries(raceEntries).map((entry) => `<tr><td>${escapeHtml(entry.season.name)}</td><td>R${entry.roundIndex + 1}</td><td><strong>${escapeHtml(entry.race.name || 'TBC')}</strong><small>${escapeHtml(entry.race.label || 'Round details unavailable')}</small></td><td>${position(entry.position)}</td><td>${position(entry.qualifyingPosition)}</td><td>${entry.points || '—'}</td><td>${entry.lapsLed || '—'}</td><td class="race-log-notes">${entry.pole ? '<span>Pole</span>' : ''}${entry.fastestLap ? '<span>Fastest lap</span>' : ''}${!entry.pole && !entry.fastestLap ? '—' : ''}</td></tr>`).join('');
    const h2hRows = getHeadToHead(driver.name).map((entry) => `<tr><td>${driverLink(entry.opponent.name, 'record-driver-link')}</td><td>${entry.raceMeetings ? recordString(entry.raceWins, entry.raceLosses, entry.raceTies) : '—'}</td><td>${entry.raceMeetings || '—'}</td><td>${entry.qualMeetings ? recordString(entry.qualWins, entry.qualLosses, entry.qualTies) : '—'}</td><td>${entry.qualMeetings || '—'}</td></tr>`).join('');
    elements.driverProfile.innerHTML = `<article class="profile-hero"><div><p class="eyebrow">Career at a glance</p><h3>${escapeHtml(driver.name)}</h3><p>${driver.seasons.length} season${driver.seasons.length === 1 ? '' : 's'} - ${driver.completed.length} race start${driver.completed.length === 1 ? '' : 's'} - ${number.format(driver.points)} career points</p></div><div class="profile-metrics"><div><strong>${driver.wins}</strong><span>Wins</span></div><div><strong>${driver.podiums}</strong><span>Podiums</span></div><div><strong>${driver.poles}</strong><span>Poles</span></div><div><strong>${driver.fastestLaps}</strong><span>Fastest laps</span></div><div><strong>${driver.lapsLed}</strong><span>Laps led</span></div></div></article><div class="profile-layout"><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Season by season</p><h3>Championship summary</h3></div><p>Finish position reflects the final table from recorded results.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr><th>Season</th><th>Finish</th><th>Starts</th><th>Points</th><th>Wins</th><th>Podiums</th><th>Poles</th><th>Avg. finish</th></tr></thead><tbody>${seasonRows}</tbody></table></div></section><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Against the field</p><h3>Head-to-head</h3></div><p>W-L-T only counts rounds where both drivers have a recorded result.</p></div><div class="mini-table-shell"><table class="profile-table h2h-table"><thead><tr><th>Opponent</th><th>Race W-L-T</th><th>Races</th><th>Qual. W-L-T</th><th>Qual.</th></tr></thead><tbody>${h2hRows || '<tr><td colspan="5">No shared results recorded.</td></tr>'}</tbody></table></div></section></div><section class="profile-panel car-average-panel"><div class="panel-title"><div><p class="eyebrow">By car type</p><h3>Average finish by class</h3></div><p>Career results across every archived season.</p></div><div class="mini-table-shell"><table class="profile-table car-average-table"><thead><tr><th>Car class</th><th>Starts</th><th>Avg. finish</th><th>Avg. qualifying</th><th>Wins</th><th>Podiums</th><th>Points</th></tr></thead><tbody>${carAverageRows || '<tr><td colspan="7">No classified class results recorded.</td></tr>'}</tbody></table></div></section><section class="profile-panel race-log-panel"><div class="panel-title"><div><p class="eyebrow">Complete race log</p><h3>Every recorded round</h3></div><p>Click a column heading to sort. P = finish; Q = qualifying.</p></div><div class="mini-table-shell"><table class="profile-table race-log"><thead><tr>${profileLogHeader('Season', 'seasonIndex')}${profileLogHeader('Round', 'roundIndex')}${profileLogHeader('Event', 'event')}${profileLogHeader('Finish', 'position')}${profileLogHeader('Qual.', 'qualifyingPosition')}${profileLogHeader('Points', 'points')}${profileLogHeader('Led', 'lapsLed')}${profileLogHeader('Notes', 'notes')}</tr></thead><tbody>${raceRows || '<tr><td colspan="8">No round-by-round results recorded.</td></tr>'}</tbody></table></div></section>`;
  }
  const profileSectionSortDefaults = {
    summary: { seasonIndex: 'desc', championshipPosition: 'asc', starts: 'desc', points: 'desc', wins: 'desc', podiums: 'desc', poles: 'desc', avgFinish: 'asc' },
    h2h: { opponent: 'asc', raceWins: 'desc', raceMeetings: 'desc', qualWins: 'desc', qualMeetings: 'desc' },
    car: { carClass: 'asc', starts: 'desc', avgFinish: 'asc', avgQualifying: 'asc', wins: 'desc', podiums: 'desc', points: 'desc' },
  };
  const profileSectionStateKeys = { summary: ['profileSummarySortKey', 'profileSummarySortDirection'], h2h: ['profileH2HSortKey', 'profileH2HSortDirection'], car: ['profileCarSortKey', 'profileCarSortDirection'] };
  function getProfileSectionSort(section) { const [keyName, directionName] = profileSectionStateKeys[section]; return { key: state[keyName], direction: state[directionName] }; }
  function getProfileSectionValue(row, section, key) { return section === 'h2h' && key === 'opponent' ? row.opponent.name : row[key]; }
  function sortProfileSection(rows, section) {
    const { key, direction } = getProfileSectionSort(section);
    return [...rows].sort((a, b) => {
      const aValue = getProfileSectionValue(a, section, key); const bValue = getProfileSectionValue(b, section, key);
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? 0 : 1;
      if (bValue === null || bValue === undefined) return -1;
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (direction === 'asc' ? 1 : -1);
    });
  }
  function profileSectionHeader(label, section, key) {
    const sort = getProfileSectionSort(section); const active = sort.key === key;
    return `<th><button class="sort-button" type="button" data-profile-sort-section="${section}" data-profile-sort-key="${key}" aria-pressed="${active}">${label} <span class="sort-icon" aria-hidden="true">${active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>`;
  }
  function renderDriverProfile() {
    const driver = getCareerDriver(state.selectedDriver); if (!driver) { elements.driverProfile.innerHTML = '<p class="no-profile">No driver history is available.</p>'; return; }
    const summaryRows = sortProfileSection(driver.seasons.map(({ season, seasonIndex, entries }) => { const stats = getStats(entries); const standing = calculateStandings(season).find((entry) => entry.name === driver.name); return { season, seasonIndex, championshipPosition: standing?.championshipPosition ?? null, starts: stats.completed.length, points: stats.points, wins: stats.wins, podiums: stats.podiums, poles: stats.poles, avgFinish: stats.avgFinish }; }), 'summary').map((row) => `<tr><td>${escapeHtml(row.season.name)}</td><td>${row.championshipPosition ? `P${row.championshipPosition}` : '—'}</td><td>${row.starts}</td><td>${number.format(row.points)}</td><td>${row.wins || '—'}</td><td>${row.podiums || '—'}</td><td>${row.poles || '—'}</td><td>${average(row.avgFinish)}</td></tr>`).join('');
    const carRows = sortProfileSection(getCareerCarClasses().map((carClass) => { const entries = driver.entries.filter((entry) => getCarClass(entry.race) === carClass); const stats = getStats(entries); return { carClass, starts: stats.completed.length, avgFinish: stats.avgFinish, avgQualifying: stats.avgQualifying, wins: stats.wins, podiums: stats.podiums, points: stats.points }; }).filter((row) => row.starts), 'car').map((row) => `<tr><td><strong>${escapeHtml(row.carClass)}</strong></td><td>${row.starts}</td><td>${average(row.avgFinish)}</td><td>${average(row.avgQualifying)}</td><td>${row.wins || '—'}</td><td>${row.podiums || '—'}</td><td>${number.format(row.points)}</td></tr>`).join('');
    const raceRows = sortProfileLogEntries(driver.entries.filter((entry) => entry.position !== null || entry.qualifyingPosition !== null)).map((entry) => `<tr><td>${escapeHtml(entry.season.name)}</td><td>R${entry.roundIndex + 1}</td><td><strong>${escapeHtml(entry.race.name || 'TBC')}</strong><small>${escapeHtml(entry.race.label || 'Round details unavailable')}</small></td><td>${position(entry.position)}</td><td>${position(entry.qualifyingPosition)}</td><td>${entry.points || '—'}</td><td>${entry.lapsLed || '—'}</td><td class="race-log-notes">${entry.pole ? '<span>Pole</span>' : ''}${entry.fastestLap ? '<span>Fastest lap</span>' : ''}${!entry.pole && !entry.fastestLap ? '—' : ''}</td></tr>`).join('');
    const h2hRows = sortProfileSection(getHeadToHead(driver.name), 'h2h').map((entry) => `<tr><td>${driverLink(entry.opponent.name, 'record-driver-link')}</td><td>${entry.raceMeetings ? recordString(entry.raceWins, entry.raceLosses, entry.raceTies) : '—'}</td><td>${entry.raceMeetings || '—'}</td><td>${entry.qualMeetings ? recordString(entry.qualWins, entry.qualLosses, entry.qualTies) : '—'}</td><td>${entry.qualMeetings || '—'}</td></tr>`).join('');
    elements.driverProfile.innerHTML = `<article class="profile-hero"><div><p class="eyebrow">Career at a glance</p><h3>${escapeHtml(driver.name)}</h3><p>${driver.seasons.length} season${driver.seasons.length === 1 ? '' : 's'} - ${driver.completed.length} race start${driver.completed.length === 1 ? '' : 's'} - ${number.format(driver.points)} career points</p></div><div class="profile-metrics"><div><strong>${driver.wins}</strong><span>Wins</span></div><div><strong>${driver.podiums}</strong><span>Podiums</span></div><div><strong>${driver.poles}</strong><span>Poles</span></div><div><strong>${driver.fastestLaps}</strong><span>Fastest laps</span></div><div><strong>${driver.lapsLed}</strong><span>Laps led</span></div></div></article><div class="profile-layout"><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Season by season</p><h3>Championship summary</h3></div><p>Click a column heading to sort each recorded championship finish.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>${profileSectionHeader('Season', 'summary', 'seasonIndex')}${profileSectionHeader('Finish', 'summary', 'championshipPosition')}${profileSectionHeader('Starts', 'summary', 'starts')}${profileSectionHeader('Points', 'summary', 'points')}${profileSectionHeader('Wins', 'summary', 'wins')}${profileSectionHeader('Podiums', 'summary', 'podiums')}${profileSectionHeader('Poles', 'summary', 'poles')}${profileSectionHeader('Avg. finish', 'summary', 'avgFinish')}</tr></thead><tbody>${summaryRows}</tbody></table></div></section><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Against the field</p><h3>Head-to-head</h3></div><p>W-L-T only counts rounds where both drivers have a recorded result.</p></div><div class="mini-table-shell"><table class="profile-table h2h-table"><thead><tr>${profileSectionHeader('Opponent', 'h2h', 'opponent')}${profileSectionHeader('Race W-L-T', 'h2h', 'raceWins')}${profileSectionHeader('Races', 'h2h', 'raceMeetings')}${profileSectionHeader('Qual. W-L-T', 'h2h', 'qualWins')}${profileSectionHeader('Qual.', 'h2h', 'qualMeetings')}</tr></thead><tbody>${h2hRows || '<tr><td colspan="5">No shared results recorded.</td></tr>'}</tbody></table></div></section></div><section class="profile-panel car-average-panel"><div class="panel-title"><div><p class="eyebrow">By car type</p><h3>Average finish by class</h3></div><p>Career results across every archived season.</p></div><div class="mini-table-shell"><table class="profile-table car-average-table"><thead><tr>${profileSectionHeader('Car class', 'car', 'carClass')}${profileSectionHeader('Starts', 'car', 'starts')}${profileSectionHeader('Avg. finish', 'car', 'avgFinish')}${profileSectionHeader('Avg. qualifying', 'car', 'avgQualifying')}${profileSectionHeader('Wins', 'car', 'wins')}${profileSectionHeader('Podiums', 'car', 'podiums')}${profileSectionHeader('Points', 'car', 'points')}</tr></thead><tbody>${carRows || '<tr><td colspan="7">No classified class results recorded.</td></tr>'}</tbody></table></div></section><section class="profile-panel race-log-panel"><div class="panel-title"><div><p class="eyebrow">Complete race log</p><h3>Every recorded round</h3></div><p>Click a column heading to sort. P = finish; Q = qualifying.</p></div><div class="mini-table-shell"><table class="profile-table race-log"><thead><tr>${profileLogHeader('Season', 'seasonIndex')}${profileLogHeader('Round', 'roundIndex')}${profileLogHeader('Event', 'event')}${profileLogHeader('Finish', 'position')}${profileLogHeader('Qual.', 'qualifyingPosition')}${profileLogHeader('Points', 'points')}${profileLogHeader('Led', 'lapsLed')}${profileLogHeader('Notes', 'notes')}</tr></thead><tbody>${raceRows || '<tr><td colspan="8">No round-by-round results recorded.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderRecordTypeTabs() { elements.recordTypeTabs.querySelectorAll('[data-record-type]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.recordType === state.recordType))); }
  function renderRecordPositionTabs() {
    const showPositions = state.recordType === 'race' || state.recordType === 'qualifying'; elements.recordPositionTabs.hidden = !showPositions; if (!showPositions) return;
    elements.recordPositionTabs.innerHTML = Array.from({ length: 15 }, (_, index) => { const value = index + 1; return `<button class="position-tab" type="button" data-record-position="${value}" aria-pressed="${value === state.recordPosition}">P${value}</button>`; }).join('');
  }
  function renderSpecialRecords(drivers) {
    const records = [{ label: 'Most fastest laps', value: (driver) => driver.fastestLaps, unit: 'fastest laps' }, { label: 'Most laps led', value: (driver) => driver.lapsLed, unit: 'laps led' }, { label: 'Most poles', value: (driver) => driver.poles, unit: 'poles' }, { label: 'Most race starts', value: (driver) => driver.completed.length, unit: 'starts' }];
    elements.records.innerHTML = `<div class="special-records">${records.map((record) => { const ranked = [...drivers].sort((a, b) => record.value(b) - record.value(a) || a.name.localeCompare(b.name)).slice(0, 8); return `<article class="special-record-card"><h3>${record.label}</h3><ol>${ranked.map((driver, index) => `<li><span>${index + 1}</span>${driverLink(driver.name, 'record-driver-link')}<strong>${record.value(driver)}</strong></li>`).join('')}</ol><p>${record.unit} across all archived seasons</p></article>`; }).join('')}</div>`;
  }
  function getEligibleLapRounds(season) {
    return season.races.map((race, index) => ({ index, laps: getRoundLaps(race) })).filter((round) => round.laps && season.drivers.some((driver) => driver.results[round.index]?.position !== null));
  }
  function renderLeadPeriodTabs() {
    const visible = state.recordType === 'lead-percentage'; elements.leadPeriodTabs.hidden = !visible; if (!visible) return;
    const periods = [{ id: 'overall', label: 'Overall' }, ...seasons.map((season) => ({ id: season.id, label: season.name }))];
    if (!periods.some((period) => period.id === state.leadPeriod)) state.leadPeriod = 'overall';
    elements.leadPeriodTabs.innerHTML = periods.map((period) => `<button class="lead-period-tab" type="button" data-lead-period="${escapeHtml(period.id)}" aria-pressed="${period.id === state.leadPeriod}">${escapeHtml(period.label)}</button>`).join('');
  }
  function getLeadPercentageRows() {
    const selectedSeasons = state.leadPeriod === 'overall' ? seasons : seasons.filter((season) => season.id === state.leadPeriod);
    const eligibleRounds = selectedSeasons.flatMap((season) => getEligibleLapRounds(season).map((round) => ({ ...round, season })));
    const totalLaps = eligibleRounds.reduce((total, round) => total + round.laps, 0);
    const rows = getCareerDrivers().map((careerDriver) => {
      let lapsLed = 0; let starts = 0; let startedRaceLaps = 0;
      eligibleRounds.forEach(({ season, index, laps }) => {
        const driver = season.drivers.find((entry) => entry.name === careerDriver.name); const result = driver?.results[index];
        if (result?.position !== null && result?.position !== undefined) { starts += 1; lapsLed += result.lapsLed || 0; startedRaceLaps += laps; }
      });
      return { ...careerDriver, lapsLed, starts, startedRaceLaps, percentage: totalLaps ? lapsLed / totalLaps * 100 : 0, startedRacePercentage: startedRaceLaps ? lapsLed / startedRaceLaps * 100 : 0 };
    }).filter((driver) => driver.starts).sort((a, b) => b.percentage - a.percentage || b.lapsLed - a.lapsLed || a.name.localeCompare(b.name));
    return { rows, totalLaps, rounds: eligibleRounds.length };
  }
  function renderLeadPercentageRecords() {
    const { rows, totalLaps, rounds } = getLeadPercentageRows(); const period = state.leadPeriod === 'overall' ? 'all archived seasons' : seasons.find((season) => season.id === state.leadPeriod)?.name;
    elements.records.innerHTML = `<div class="records-header"><div><p class="eyebrow">Race control</p><h3>Laps led percentage</h3></div><p>${escapeHtml(period)} · ${rounds} round${rounds === 1 ? '' : 's'} with a stated lap count · ${number.format(totalLaps)} eligible laps.</p></div><div class="table-shell records-table-shell"><table class="records-table lead-percentage-table"><thead><tr><th>Rank</th><th>Driver</th><th>Laps led</th><th>Eligible race laps</th><th>% led</th><th>Starts</th></tr></thead><tbody>${rows.map((driver, index) => `<tr><td class="standing-rank ${index < 3 ? 'top-three' : ''}">${String(index + 1).padStart(2, '0')}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td>${driver.lapsLed}</td><td>${number.format(totalLaps)}</td><td class="record-total">${driver.percentage.toFixed(1)}%</td><td>${driver.starts}</td></tr>`).join('') || '<tr><td colspan="6">No rounds with stated lap counts and classified results are available.</td></tr>'}</tbody></table></div><p class="lead-percentage-note">The percentage is each driver’s laps led divided by the total scheduled laps in completed rounds whose calendar entry includes a lap count.</p>`;
  }
  function renderLeadPercentageRecords() {
    const { rows, totalLaps, rounds } = getLeadPercentageRows(); const period = state.leadPeriod === 'overall' ? 'all archived seasons' : seasons.find((season) => season.id === state.leadPeriod)?.name;
    elements.records.innerHTML = `<div class="records-header"><div><p class="eyebrow">Race control</p><h3>Laps led percentage</h3></div><p>${escapeHtml(period)} - ${rounds} round${rounds === 1 ? '' : 's'} with a stated lap count - ${number.format(totalLaps)} eligible laps.</p></div><div class="table-shell records-table-shell"><table class="records-table lead-percentage-table"><thead><tr><th>Rank</th><th>Driver</th><th>Laps led</th><th>All race laps</th><th>% of all laps</th><th>% of started laps</th><th>Starts</th></tr></thead><tbody>${rows.map((driver, index) => `<tr><td class="standing-rank ${index < 3 ? 'top-three' : ''}">${String(index + 1).padStart(2, '0')}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td>${driver.lapsLed}</td><td>${number.format(totalLaps)}</td><td class="record-total">${driver.percentage.toFixed(1)}%</td><td class="lap-led-percent">${driver.startedRacePercentage.toFixed(1)}%</td><td>${driver.starts}</td></tr>`).join('') || '<tr><td colspan="7">No rounds with stated lap counts and classified results are available.</td></tr>'}</tbody></table></div><p class="lead-percentage-note">% of all laps uses the total scheduled laps in completed rounds. % of started laps uses only the scheduled laps from rounds where that driver recorded a classified start.</p>`;
  }
  const leadSortDefaults = { name: 'asc', lapsLed: 'desc', totalLaps: 'desc', percentage: 'desc', startedRaceLaps: 'desc', startedRacePercentage: 'desc', starts: 'desc' };
  function getLeadSortValue(driver, key, totalLaps) { return key === 'totalLaps' ? totalLaps : driver[key]; }
  function sortLeadRows(rows, totalLaps) {
    return [...rows].sort((a, b) => {
      const aValue = getLeadSortValue(a, state.leadSortKey, totalLaps); const bValue = getLeadSortValue(b, state.leadSortKey, totalLaps);
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (state.leadSortDirection === 'asc' ? 1 : -1) || b.percentage - a.percentage || a.name.localeCompare(b.name);
    });
  }
  function leadSortHeader(label, key) {
    const active = state.leadSortKey === key;
    return `<th><button class="sort-button" type="button" data-lead-sort-key="${key}" aria-pressed="${active}">${label} <span class="sort-icon" aria-hidden="true">${active ? (state.leadSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>`;
  }
  function renderLeadPercentageRecords() {
    const { rows, totalLaps, rounds } = getLeadPercentageRows(); const period = state.leadPeriod === 'overall' ? 'all archived seasons' : seasons.find((season) => season.id === state.leadPeriod)?.name; const sorted = sortLeadRows(rows, totalLaps);
    elements.records.innerHTML = `<div class="records-header"><div><p class="eyebrow">Race control</p><h3>Laps led percentage</h3></div><p>${escapeHtml(period)} - ${rounds} round${rounds === 1 ? '' : 's'} with a stated lap count - ${number.format(totalLaps)} eligible laps.</p></div><div class="table-shell records-table-shell"><table class="records-table lead-percentage-table"><thead><tr><th>Order</th>${leadSortHeader('Driver', 'name')}${leadSortHeader('Laps led', 'lapsLed')}${leadSortHeader('All race laps', 'totalLaps')}${leadSortHeader('% of all laps', 'percentage')}${leadSortHeader('Laps in starts', 'startedRaceLaps')}${leadSortHeader('% of started laps', 'startedRacePercentage')}${leadSortHeader('Starts', 'starts')}</tr></thead><tbody>${sorted.map((driver, index) => `<tr><td class="standing-rank ${index < 3 ? 'top-three' : ''}">${String(index + 1).padStart(2, '0')}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td>${driver.lapsLed}</td><td>${number.format(totalLaps)}</td><td class="record-total">${driver.percentage.toFixed(1)}%</td><td>${number.format(driver.startedRaceLaps)}</td><td class="lap-led-percent">${driver.startedRacePercentage.toFixed(1)}%</td><td>${driver.starts}</td></tr>`).join('') || '<tr><td colspan="8">No rounds with stated lap counts and classified results are available.</td></tr>'}</tbody></table></div><p class="lead-percentage-note">Click a heading to sort. % of all laps uses the total scheduled laps in completed rounds. % of started laps and Laps in starts use only rounds where that driver recorded a classified start.</p>`;
  }
  function renderRecords() {
    renderRecordTypeTabs(); renderRecordPositionTabs(); const drivers = getCareerDrivers();
    renderLeadPeriodTabs();
    if (state.recordType === 'special') { renderSpecialRecords(drivers); return; }
    if (state.recordType === 'lead-percentage') { renderLeadPercentageRecords(); return; }
    const countsKey = state.recordType === 'race' ? 'positionCounts' : 'qualifyingCounts'; const count = (driver) => driver[countsKey][state.recordPosition] || 0;
    const ranked = [...drivers].sort((a, b) => count(b) - count(a) || b.completed.length - a.completed.length || a.name.localeCompare(b.name));
    const label = state.recordType === 'race' ? (state.recordPosition === 1 ? 'Most wins' : `Most P${state.recordPosition} finishes`) : (state.recordPosition === 1 ? 'Most poles' : `Most P${state.recordPosition} qualifying results`);
    elements.records.innerHTML = `<div class="records-header"><div><p class="eyebrow">${state.recordType === 'race' ? 'Race finishing positions' : 'Qualifying positions'}</p><h3>${label}</h3></div><p>Every driver is ranked by career ${state.recordType === 'race' ? 'race finishes' : 'qualifying results'} at P${state.recordPosition}.</p></div><div class="table-shell records-table-shell"><table class="records-table"><thead><tr><th>Rank</th><th>Driver</th><th>P${state.recordPosition} total</th><th>Race starts</th><th>Wins</th><th>Poles</th><th>Fastest laps</th><th>Laps led</th></tr></thead><tbody>${ranked.map((driver, index) => `<tr><td class="standing-rank ${index < 3 && count(driver) ? 'top-three' : ''}">${count(driver) ? String(index + 1).padStart(2, '0') : '—'}</td><td>${driverLink(driver.name, 'record-driver-link')}</td><td class="record-total">${count(driver)}</td><td>${driver.completed.length}</td><td>${driver.wins || '—'}</td><td>${driver.poles || '—'}</td><td>${driver.fastestLaps || '—'}</td><td>${driver.lapsLed || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderPointsSystem() {
    const finishPoints = Object.entries(pointsSystem).sort(([a], [b]) => Number(a) - Number(b)).map(([place, pointsValue]) => `<div class="point-cell"><span>P${place}</span><strong>${pointsValue}</strong></div>`).join('');
    const bonusPoints = [
      ['Pole position', '+1', 'One point for earning pole.'],
      ['Fastest lap', '+1', 'One point for setting fastest lap.'],
      ['Invert field', '+5', 'Season 4 onward: awarded when the pole winner elects to invert the field.']
    ].map(([label, points, description]) => `<div class="point-cell point-cell-bonus"><span>${label}</span><strong>${points}</strong><small>${description}</small></div>`).join('');
    elements.pointsSystem.innerHTML = finishPoints + bonusPoints;
  }
  function renderSeason() { const standings = calculateStandings(getSeason()); renderTabs(); renderOverview(standings); renderCarClassStats(); renderStandings(standings); renderSchedule(); renderRoundPicker(); renderRoundResults(); }
  function openDriver(name, scroll = true) { if (!getCareerDriver(name)) return; state.selectedDriver = name; renderProfileSelector(); renderDriverProfile(); if (scroll) document.querySelector('#driver-profile').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  document.addEventListener('click', (event) => { const button = event.target.closest('[data-driver-name]'); if (button) openDriver(button.dataset.driverName); });
  elements.tabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-season-index]'); if (tab) { state.seasonIndex = Number(tab.dataset.seasonIndex); state.standingsMode = seasonHasPointDrops(getSeason()) ? 'drops' : 'full'; state.roundIndex = 0; renderSeason(); } });
  elements.roundSelect.addEventListener('change', (event) => { state.roundIndex = Number(event.target.value); renderRoundResults(); });
  elements.driverSelect.addEventListener('change', (event) => openDriver(event.target.value, false));
  elements.driverProfile.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-sort-section]'); if (!button) return; const section = button.dataset.profileSortSection; const key = button.dataset.profileSortKey; const [keyName, directionName] = profileSectionStateKeys[section]; if (state[keyName] === key) state[directionName] = state[directionName] === 'asc' ? 'desc' : 'asc'; else { state[keyName] = key; state[directionName] = profileSectionSortDefaults[section][key]; } renderDriverProfile(); });
  elements.driverProfile.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-log-sort-key]'); if (!button) return; const key = button.dataset.profileLogSortKey; if (state.profileLogSortKey === key) state.profileLogSortDirection = state.profileLogSortDirection === 'asc' ? 'desc' : 'asc'; else { state.profileLogSortKey = key; state.profileLogSortDirection = profileLogSortDefaults[key]; } renderDriverProfile(); });
  elements.carClassTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-car-class]'); if (tab) { state.carClass = tab.dataset.carClass; renderCarClassStats(); } });
  elements.carClassContent.addEventListener('click', (event) => { const button = event.target.closest('[data-car-sort-key]'); if (!button) return; const key = button.dataset.carSortKey; if (state.carSortKey === key) state.carSortDirection = state.carSortDirection === 'asc' ? 'desc' : 'asc'; else { state.carSortKey = key; state.carSortDirection = sortDefaults[key]; } renderCarClassStats(); });
  elements.standingsHeaders.addEventListener('click', (event) => { const button = event.target.closest('[data-sort-key]'); if (!button) return; const key = button.dataset.sortKey; if (state.sortKey === key) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'; else { state.sortKey = key; state.sortDirection = sortDefaults[key]; } const season = getSeason(); renderStandings(calculateStandings(season, { applyChampionshipPointDrops: getStandingsUsePointDrops(season), applyChampionshipBonusPoints: true })); });
  elements.standingsViewControls?.addEventListener('click', (event) => { const button = event.target.closest('[data-standings-mode]'); if (!button) return; state.standingsMode = button.dataset.standingsMode; renderSeason(); });
  elements.recordTypeTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-record-type]'); if (tab) { state.recordType = tab.dataset.recordType; renderRecords(); } });
  elements.records.addEventListener('click', (event) => { const button = event.target.closest('[data-lead-sort-key]'); if (!button) return; const key = button.dataset.leadSortKey; if (state.leadSortKey === key) state.leadSortDirection = state.leadSortDirection === 'asc' ? 'desc' : 'asc'; else { state.leadSortKey = key; state.leadSortDirection = leadSortDefaults[key]; } renderRecords(); });
  elements.recordPositionTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-record-position]'); if (tab) { state.recordPosition = Number(tab.dataset.recordPosition); renderRecords(); } });
  elements.leadPeriodTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-lead-period]'); if (tab) { state.leadPeriod = tab.dataset.leadPeriod; renderRecords(); } });
  /*
   * Archive expansion.  Everything below reads directly from window.GTO_DATA so
   * adding a season, a driver, or another completed race automatically flows
   * through the charts, records, comparison, and track pages.
   */
  const enhPalette = ['#2864ff', '#d93b19', '#0c8b5c', '#8a3ffc', '#d18b00', '#007b9e', '#c12677', '#4f6b00', '#9b3e00', '#255bdb', '#6d4c41', '#00695c', '#ad1457', '#455a64', '#7b1fa2', '#1565c0', '#ef6c00', '#2e7d32'];
  function enhResultHasFinish(result) { return result && result.position !== null && result.position !== undefined; }
  function enhResultHasQualifying(result) { return result && result.qualifyingPosition !== null && result.qualifyingPosition !== undefined; }
  function enhPositionChange(result) { return enhResultHasFinish(result) && enhResultHasQualifying(result) ? result.qualifyingPosition - result.position : null; }
  function enhChange(value) { return value === null || value === undefined ? '—' : (value > 0 ? '+' : '') + value; }
  function enhTrackName(race) {
    const raw = String(race.name || 'TBC').replace(/\s*\([^)]+\)\s*$/, '').trim();
    const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (compact === 'lemans' || compact === 'houratlemans' || compact === 'houroflemans') return 'Le Mans';
    if (compact === 'daytonarc' || compact === 'daytonaroadcourse') return 'Daytona Road Course';
    if (/n.rburgring/i.test(raw) || /^gr\.?\s*3\s+n/i.test(raw)) return 'Nurburgring';
    return raw || 'TBC';
  }
  function enhRoundLabel(entry) { return entry.season.name + ' R' + (entry.roundIndex + 1); }
  function enhColor(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) value = (value * 31 + name.charCodeAt(index)) >>> 0;
    return enhPalette[value % enhPalette.length];
  }
  function enhAllRounds(seasonFilter) {
    const selected = seasonFilter === undefined || seasonFilter === null ? seasons : seasons.filter((season, index) => seasonFilter === 'all' || seasonFilter === season.id || seasonFilter === index);
    return selected.flatMap((season) => getArchiveRounds(season).map(({ race, index }) => ({ season, seasonIndex: seasons.indexOf(season), race, roundIndex: index })));
  }
  function enhAllEntries(seasonFilter) {
    return enhAllRounds(seasonFilter).flatMap((round) => round.season.drivers.map((driver) => ({
      name: driver.name, driver, result: driver.results[round.roundIndex] || {}, season: round.season, seasonIndex: round.seasonIndex,
      race: round.race, roundIndex: round.roundIndex
    })));
  }
  function enhEntriesForDriver(name, seasonFilter) {
    return enhAllEntries(seasonFilter).filter((entry) => entry.name === name).map((entry) => ({ ...entry.result, ...entry, positionChange: enhPositionChange(entry.result) }));
  }
  function enhCareerNames() { return [...new Set(enhAllEntries().map((entry) => entry.name))].sort((a, b) => a.localeCompare(b)); }
  function enhEntriesWithResult(entries) { return entries.filter((entry) => enhResultHasFinish(entry) || enhResultHasQualifying(entry)); }
  function getStats(results) {
    const completed = results.filter((result) => enhResultHasFinish(result));
    const qualifying = results.filter((result) => enhResultHasQualifying(result));
    const positionCounts = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 0]));
    const qualifyingCounts = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, 0]));
    completed.forEach((result) => { if (result.position <= 15) positionCounts[result.position] += 1; });
    qualifying.forEach((result) => { if (result.qualifyingPosition <= 15) qualifyingCounts[result.qualifyingPosition] += 1; });
    const changes = completed.filter((result) => enhResultHasQualifying(result)).map((result) => result.qualifyingPosition - result.position);
    const positionsGained = changes.filter((value) => value > 0).reduce((total, value) => total + value, 0);
    const positionsLost = changes.filter((value) => value < 0).reduce((total, value) => total + Math.abs(value), 0);
    return {
      completed, qualifying, positionCounts, qualifyingCounts,
      points: results.reduce((total, result) => total + (result.points || 0), 0),
      wins: positionCounts[1], podiums: completed.filter((result) => result.position <= 3).length,
      poles: results.filter((result) => result.pole).length, fastestLaps: results.filter((result) => result.fastestLap).length,
      lapsLed: results.reduce((total, result) => total + (result.lapsLed || 0), 0),
      avgFinish: completed.length ? completed.reduce((total, result) => total + result.position, 0) / completed.length : null,
      avgQualifying: qualifying.length ? qualifying.reduce((total, result) => total + result.qualifyingPosition, 0) / qualifying.length : null,
      positionsGained, positionsLost, netPositions: positionsGained - positionsLost
    };
  }
  function enhStreakLabel(streak) {
    return streak && streak.length ? streak.length + ' (' + enhRoundLabel(streak.start) + '–' + enhRoundLabel(streak.end) + ')' : '—';
  }
  function enhLongestDriverStreak(name, predicate, seasonFilter) {
    const rounds = enhAllRounds(seasonFilter); let current = null; let best = null;
    rounds.forEach((round) => {
      const driver = round.season.drivers.find((item) => item.name === name);
      const result = driver ? driver.results[round.roundIndex] : null;
      const entry = result ? { ...result, name, season: round.season, seasonIndex: round.seasonIndex, race: round.race, roundIndex: round.roundIndex } : null;
      if (entry && enhResultHasFinish(entry) && predicate(entry)) {
        if (!current) current = { length: 0, start: entry, end: entry };
        current.length += 1; current.end = entry;
        if (!best || current.length > best.length) best = { ...current };
      } else current = null;
    });
    return best || { length: 0, start: null, end: null };
  }
  function enhLongestSameFinish(name, seasonFilter) {
    const rounds = enhAllRounds(seasonFilter); let current = null; let best = null;
    rounds.forEach((round) => {
      const driver = round.season.drivers.find((item) => item.name === name);
      const result = driver ? driver.results[round.roundIndex] : null;
      const entry = result ? { ...result, name, season: round.season, seasonIndex: round.seasonIndex, race: round.race, roundIndex: round.roundIndex } : null;
      if (!entry || !enhResultHasFinish(entry)) { current = null; return; }
      if (current && current.position === entry.position) { current.length += 1; current.end = entry; }
      else current = { length: 1, position: entry.position, start: entry, end: entry };
      if (!best || current.length > best.length) best = { ...current };
    });
    return best || { length: 0, position: null, start: null, end: null };
  }
  function enhChampionships(name, seasonFilter) {
    return seasons.filter((season, index) => seasonFilter === 'all' || seasonFilter === undefined || seasonFilter === season.id || seasonFilter === index)
      .filter((season) => getChampionshipFinishingStandings(season)[0]?.name === name).length;
  }
  function enhCareerBests(name) {
    const entries = enhEntriesForDriver(name).filter((entry) => enhResultHasFinish(entry) || enhResultHasQualifying(entry));
    const finishes = entries.filter((entry) => enhResultHasFinish(entry));
    const qualifying = entries.filter((entry) => enhResultHasQualifying(entry));
    const bestMove = entries.filter((entry) => entry.positionChange !== null).sort((a, b) => b.positionChange - a.positionChange)[0];
    const mostLed = entries.slice().sort((a, b) => (b.lapsLed || 0) - (a.lapsLed || 0))[0];
    return {
      bestFinish: finishes.length ? Math.min(...finishes.map((entry) => entry.position)) : null,
      bestQualifying: qualifying.length ? Math.min(...qualifying.map((entry) => entry.qualifyingPosition)) : null,
      bestMove, mostLed,
      winStreak: enhLongestDriverStreak(name, (entry) => entry.position === 1),
      podiumStreak: enhLongestDriverStreak(name, (entry) => entry.position <= 3)
    };
  }
  function enhSvgLine(points) {
    let path = ''; let active = false;
    points.forEach((point) => {
      if (!point) { active = false; return; }
      path += (active ? ' L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1); active = true;
    });
    return path;
  }
  function enhProgressionData(season) {
    const rounds = getArchiveRounds(season).filter(({ index }) => season.drivers.some((driver) => enhResultHasFinish(driver.results[index])));
    const names = season.drivers.map((driver) => driver.name);
    const series = Object.fromEntries(names.map((name) => [name, []]));
    rounds.forEach((_, roundNumber) => {
      const rows = calculateStandings(season, { applyChampionshipPointDrops: getStandingsUsePointDrops(season), applyChampionshipBonusPoints: true, rounds: rounds.slice(0, roundNumber + 1) });
      const ranking = new Map(rows.map((driver, positionIndex) => [driver.name, positionIndex + 1]));
      names.forEach((name) => series[name].push(ranking.get(name) || null));
    });
    return { rounds, names: names.filter((name) => series[name].some((value) => value)), series };
  }
  function enhRenderProgression() {
    const container = elements.progressionChart; const controls = elements.progressionControls; if (!container || !controls) return;
    const currentSeason = getSeason(); const data = enhProgressionData(currentSeason); const finalStandings = calculateStandings(currentSeason, { applyChampionshipPointDrops: getStandingsUsePointDrops(currentSeason), applyChampionshipBonusPoints: true });
    if (!state.progressionMode) state.progressionMode = 'all';
    if (!state.progressionSelected) state.progressionSelected = new Set();
    if (state.progressionMode === 'select' && !state.progressionSelected.size) finalStandings.slice(0, 5).forEach((driver) => state.progressionSelected.add(driver.name));
    const visible = state.progressionMode === 'all' ? new Set(data.names)
      : state.progressionMode === 'top5' ? new Set(finalStandings.slice(0, 5).map((driver) => driver.name))
        : state.progressionSelected;
    controls.innerHTML = '<div class="segmented-controls">' +
      [['all', 'All Drivers'], ['top5', 'Top 5'], ['select', 'Select Drivers']].map((item) => '<button class="progression-mode" type="button" data-progression-mode="' + item[0] + '" aria-pressed="' + (state.progressionMode === item[0]) + '">' + item[1] + '</button>').join('') +
      '</div><div class="progression-legend">' + data.names.map((name) => '<button type="button" class="progression-legend-item" data-progression-driver="' + escapeHtml(name) + '" aria-pressed="' + visible.has(name) + '"><i style="background:' + enhColor(name) + '"></i>' + escapeHtml(name) + '</button>').join('') + '</div>';
    if (!data.rounds.length) { container.innerHTML = '<p class="no-results">No completed rounds are available for a standings progression graph.</p>'; return; }
    const width = 1000; const height = 410; const margin = { top: 24, right: 24, bottom: 48, left: 54 };
    const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom;
    const positions = Math.max(...data.names.map((name) => Math.max(...data.series[name].filter(Boolean))), 1);
    const x = (index) => margin.left + (data.rounds.length === 1 ? plotWidth / 2 : index / (data.rounds.length - 1) * plotWidth);
    const y = (rank) => margin.top + (rank - 1) / Math.max(positions - 1, 1) * plotHeight;
    const grid = Array.from({ length: positions }, (_, index) => '<line x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + y(index + 1) + '" y2="' + y(index + 1) + '" class="chart-grid"></line><text x="' + (margin.left - 10) + '" y="' + (y(index + 1) + 4) + '" class="chart-axis" text-anchor="end">P' + (index + 1) + '</text>').join('');
    const labels = data.rounds.map((round, index) => '<text x="' + x(index) + '" y="' + (height - 18) + '" class="chart-axis" text-anchor="middle">R' + (index + 1) + '</text>').join('');
    const lines = data.names.filter((name) => visible.has(name)).map((name) => {
      const points = data.series[name].map((rank, index) => rank ? { x: x(index), y: y(rank) } : null);
      return '<path class="progression-line" d="' + enhSvgLine(points) + '" stroke="' + enhColor(name) + '"><title>' + escapeHtml(name) + '</title></path>' +
        points.filter(Boolean).map((point) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="3.5" fill="' + enhColor(name) + '"><title>' + escapeHtml(name) + '</title></circle>').join('');
    }).join('');
    container.innerHTML = '<div class="chart-scroll"><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Championship standings progression graph">' + grid + labels + lines + '</svg></div>';
  }
  function enhStandingsHeader(label, key) {
    const active = state.sortKey === key;
    return '<th scope="col"><button class="sort-button" type="button" data-sort-key="' + key + '" aria-pressed="' + active + '">' + label + ' <span class="sort-icon" aria-hidden="true">' + (active ? (state.sortDirection === 'asc' ? '↑' : '↓') : '↕') + '</span></button></th>';
  }
  Object.assign(sortDefaults, { positionsGained: 'desc', positionsLost: 'desc', netPositions: 'desc' });
  Object.assign(sortLabels, { positionsGained: 'total positions gained', positionsLost: 'total positions lost', netPositions: 'net positions gained/lost' });
  function renderStandings(standings) {
    const showInvertPoints = getSeason().id === '4';
    elements.standingsHeaders.innerHTML = '<tr>' +
      enhStandingsHeader('Pos', 'championshipPosition') + enhStandingsHeader('Driver', 'name') + enhStandingsHeader('Points', 'points') +
      (showInvertPoints ? enhStandingsHeader('Invert points', 'invertPoints') : '') +
      enhStandingsHeader('Wins', 'wins') + enhStandingsHeader('Podiums', 'podiums') + enhStandingsHeader('Pole positions', 'poles') +
      enhStandingsHeader('Fastest laps', 'fastestLaps') + enhStandingsHeader('Starts', 'completed') + enhStandingsHeader('Avg. finish', 'avgFinish') +
      enhStandingsHeader('Avg. qualifying', 'avgQualifying') + enhStandingsHeader('Laps led', 'lapsLed') + enhStandingsHeader('Laps led %', 'lapsLedPercentage') +
      enhStandingsHeader('Positions gained', 'positionsGained') + enhStandingsHeader('Positions lost', 'positionsLost') + enhStandingsHeader('Net positions', 'netPositions') + '</tr>';
    const sorted = sortStandings(standings); const leaderPoints = standings[0]?.points || 1;
    elements.standings.innerHTML = sorted.map((driver) => '<tr><td class="standing-rank ' + (driver.championshipPosition <= 3 ? 'top-three' : '') + '">' + String(driver.championshipPosition).padStart(2, '0') + '</td><td class="driver-name">' + driverLink(driver.name) + '</td><td><div class="points-value">' + number.format(driver.points) + ' <span class="points-track" aria-hidden="true"><span class="points-fill" style="width:' + (driver.points / leaderPoints * 100) + '%"></span></span></div></td><td>' + (driver.wins || '<span class="zero">—</span>') + '</td><td>' + (driver.podiums || '<span class="zero">—</span>') + '</td><td>' + (driver.poles || '<span class="zero">—</span>') + '</td><td>' + (driver.fastestLaps || '<span class="zero">—</span>') + '</td><td>' + driver.completed.length + '</td><td>' + average(driver.avgFinish) + '</td><td>' + average(driver.avgQualifying) + '</td><td>' + (driver.lapsLed || '<span class="zero">—</span>') + '</td><td class="lap-led-percent">' + (driver.lapsLedPercentage === null ? '—' : driver.lapsLedPercentage.toFixed(1) + '%') + '</td><td class="movement-positive">' + driver.positionsGained + '</td><td class="movement-negative">' + driver.positionsLost + '</td><td class="' + (driver.netPositions > 0 ? 'movement-positive' : driver.netPositions < 0 ? 'movement-negative' : '') + '">' + enhChange(driver.netPositions) + '</td></tr>').join('');
    if (showInvertPoints) sorted.forEach((driver, index) => {
      const cell = document.createElement('td');
      cell.textContent = driver.invertPoints || '—';
      elements.standings.children[index].insertBefore(cell, elements.standings.children[index].children[3]);
    });
    renderSortControls(); enhRenderProgression();
  }
  const enhRoundSortDefaults = { position: 'asc', name: 'asc', flags: 'desc', qualifyingPosition: 'asc', positionChange: 'desc', points: 'desc', lapsLed: 'desc' };
  function enhRoundSortHeader(label, key) {
    const active = state.roundSortKey === key;
    return '<th><button class="sort-button" type="button" data-round-sort-key="' + key + '" aria-pressed="' + active + '">' + label + ' <span class="sort-icon" aria-hidden="true">' + (active ? (state.roundSortDirection === 'asc' ? '↑' : '↓') : '↕') + '</span></button></th>';
  }
  function enhSortRoundRows(rows) {
    return rows.slice().sort((a, b) => {
      const value = (row) => state.roundSortKey === 'flags' ? Number(row.result.pole) + Number(row.result.fastestLap) : state.roundSortKey === 'positionChange' ? enhPositionChange(row.result) : state.roundSortKey === 'name' ? row.name : row.result[state.roundSortKey];
      const aValue = value(a); const bValue = value(b);
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? a.name.localeCompare(b.name) : 1;
      if (bValue === null || bValue === undefined) return -1;
      return (typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue) * (state.roundSortDirection === 'asc' ? 1 : -1) || (a.result.position || 999) - (b.result.position || 999);
    });
  }
  function renderRoundResults() {
    const sourceSeason = getSeason(); const archiveRounds = getArchiveRounds(sourceSeason); const round = archiveRounds[state.roundIndex];
    if (!round) { elements.roundResults.innerHTML = '<p class="no-results">No round is selected.</p>'; return; }
    const rows = sourceSeason.drivers.map((driver) => ({ name: driver.name, result: driver.results[round.index] || {} }))
      .filter((entry) => enhResultHasFinish(entry.result) || enhResultHasQualifying(entry.result));
    if (!state.roundSortKey) { state.roundSortKey = 'position'; state.roundSortDirection = 'asc'; }
    const winner = rows.find((entry) => entry.result.position === 1);
    const pole = rows.find((entry) => entry.result.pole);
    const fastest = rows.find((entry) => entry.result.fastestLap);
    const led = rows.slice().sort((a, b) => (b.result.lapsLed || 0) - (a.result.lapsLed || 0))[0];
    const mover = rows.filter((entry) => enhPositionChange(entry.result) !== null).slice().sort((a, b) => Math.abs(enhPositionChange(b.result)) - Math.abs(enhPositionChange(a.result)) || enhPositionChange(b.result) - enhPositionChange(a.result))[0];
    const summaryItem = (label, entry, value) => '<div><span>' + label + '</span><strong>' + (entry ? driverLink(entry.name, 'record-driver-link') : (value || '—')) + (entry && value ? '<small>' + value + '</small>' : '') + '</strong></div>';
    const flags = (result) => (result.pole ? '<span class="result-badge pole-badge">POLE</span>' : '') + (result.fastestLap ? '<span class="result-badge fl-badge">FL</span>' : '') || '—';
    const tableRows = enhSortRoundRows(rows).map((entry) => '<tr><td>' + position(entry.result.position) + '</td><td class="driver-name">' + driverLink(entry.name, 'result-driver-link') + '</td><td>' + flags(entry.result) + '</td><td>' + position(entry.result.qualifyingPosition) + '</td><td class="' + (enhPositionChange(entry.result) > 0 ? 'movement-positive' : enhPositionChange(entry.result) < 0 ? 'movement-negative' : '') + '">' + enhChange(enhPositionChange(entry.result)) + '</td><td>' + (entry.result.points || '—') + '</td><td>' + (entry.result.lapsLed || '—') + '</td></tr>').join('');
    elements.roundResults.innerHTML = '<div class="round-results-header"><div><p class="round-label">' + escapeHtml(sourceSeason.name) + ' — Round ' + (state.roundIndex + 1) + ' · ' + escapeHtml(round.race.label || 'Race details unavailable') + '</p><h3>' + escapeHtml(round.race.name || 'TBC') + '</h3></div><p>' + rows.length + ' driver record' + (rows.length === 1 ? '' : 's') + '</p></div><section class="race-summary"><p class="eyebrow">Race summary</p><div class="race-summary-grid">' + summaryItem('Winner', winner) + summaryItem('Pole', pole) + summaryItem('Fastest lap', fastest) + summaryItem('Most laps led', led, led?.result.lapsLed ? led.result.lapsLed + ' laps' : '') + summaryItem('Biggest mover', mover, mover ? enhChange(enhPositionChange(mover.result)) : '') + '</div></section><div class="table-shell round-results-table-shell"><table class="results-table"><thead><tr>' + enhRoundSortHeader('Finish', 'position') + enhRoundSortHeader('Driver', 'name') + enhRoundSortHeader('Indicators', 'flags') + enhRoundSortHeader('Qualifying', 'qualifyingPosition') + enhRoundSortHeader('Change', 'positionChange') + enhRoundSortHeader('Points', 'points') + enhRoundSortHeader('Laps led', 'lapsLed') + '</tr></thead><tbody>' + (tableRows || '<tr><td colspan="7">No classified result recorded.</td></tr>') + '</tbody></table></div><p class="round-result-note">Change is qualifying position minus finishing position. Positive values gained places; negative values lost places.</p>';
  }
  Object.assign(profileLogSortDefaults, { positionChange: 'desc' });
  Object.assign(profileSectionSortDefaults, { tracks: { track: 'asc', starts: 'desc', wins: 'desc', podiums: 'desc', poles: 'desc', avgFinish: 'asc', bestFinish: 'asc', lapsLed: 'desc' } });
  Object.assign(profileSectionStateKeys, { tracks: ['profileTrackSortKey', 'profileTrackSortDirection'] });
  function getProfileLogSortValue(entry, key) {
    if (key === 'event') return entry.race.name || '';
    if (key === 'notes') return Number(entry.pole) + Number(entry.fastestLap);
    if (key === 'positionChange') return enhPositionChange(entry);
    return entry[key];
  }
  function sortProfileLogEntries(entries) {
    return entries.slice().sort((a, b) => {
      const aValue = getProfileLogSortValue(a, state.profileLogSortKey); const bValue = getProfileLogSortValue(b, state.profileLogSortKey);
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? b.seasonIndex - a.seasonIndex || a.roundIndex - b.roundIndex : 1;
      if (bValue === null || bValue === undefined) return -1;
      return (typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue) * (state.profileLogSortDirection === 'asc' ? 1 : -1) || b.seasonIndex - a.seasonIndex || a.roundIndex - b.roundIndex;
    });
  }
  function enhProfileTabs() {
    return '<div class="profile-data-tabs" role="tablist" aria-label="Driver profile views">' +
      [['overview', 'Overview'], ['tracks', 'Tracks'], ['charts', 'Charts']].map((item) => '<button type="button" role="tab" data-profile-tab="' + item[0] + '" aria-selected="' + (state.profileTab === item[0]) + '">' + item[1] + '</button>').join('') + '</div>';
  }
  function enhCareerBestsBox(bests) {
    const bestMove = bests.bestMove ? enhChange(enhPositionChange(bests.bestMove)) + ' · ' + enhRoundLabel(bests.bestMove) : '—';
    const mostLed = bests.mostLed && bests.mostLed.lapsLed ? bests.mostLed.lapsLed + ' · ' + enhRoundLabel(bests.mostLed) : '—';
    const item = (label, value) => '<div><span>' + label + '</span><strong>' + value + '</strong></div>';
    return '<section class="career-bests"><p class="eyebrow">Career bests</p><div>' +
      item('Best finish', position(bests.bestFinish)) + item('Best qualifying', position(bests.bestQualifying)) +
      item('Most positions gained', bestMove) + item('Most laps led', mostLed) +
      item('Longest win streak', enhStreakLabel(bests.winStreak)) + item('Longest podium streak', enhStreakLabel(bests.podiumStreak)) +
      '</div></section>';
  }
  function enhProfileChartSvg(driver, entries) {
    const paired = entries.filter((entry) => enhResultHasFinish(entry) && enhResultHasQualifying(entry));
    const complete = entries.filter((entry) => enhResultHasFinish(entry)).slice().sort((a, b) => a.seasonIndex - b.seasonIndex || a.roundIndex - b.roundIndex);
    const scatterWidth = 470; const scatterHeight = 310; const margin = 42; const maxPosition = Math.max(15, ...paired.flatMap((entry) => [entry.position, entry.qualifyingPosition]), ...complete.map((entry) => entry.position));
    const point = (value, invert, length) => margin + (value - 1) / Math.max(maxPosition - 1, 1) * (length - margin * 2);
    const grid = Array.from({ length: maxPosition }, (_, index) => '<line class="chart-grid" x1="' + point(index + 1, false, scatterWidth) + '" x2="' + point(index + 1, false, scatterWidth) + '" y1="' + margin + '" y2="' + (scatterHeight - margin) + '"></line><line class="chart-grid" x1="' + margin + '" x2="' + (scatterWidth - margin) + '" y1="' + point(index + 1, false, scatterHeight) + '" y2="' + point(index + 1, false, scatterHeight) + '"></line>').join('');
    const dots = paired.map((entry) => '<circle cx="' + point(entry.qualifyingPosition, false, scatterWidth) + '" cy="' + point(entry.position, false, scatterHeight) + '" r="5" fill="' + enhColor(driver.name) + '"><title>' + escapeHtml(enhRoundLabel(entry) + ': Q' + entry.qualifyingPosition + ' to P' + entry.position) + '</title></circle>').join('');
    const lineWidth = 850; const lineHeight = 300; const lineX = (index) => 42 + (complete.length < 2 ? (lineWidth - 84) / 2 : index / (complete.length - 1) * (lineWidth - 84));
    const lineY = (value) => 30 + (value - 1) / Math.max(maxPosition - 1, 1) * (lineHeight - 72);
    const linePoints = complete.map((entry, index) => ({ x: lineX(index), y: lineY(entry.position) }));
    return '<div class="profile-charts"><article><h4>Starting vs. finishing position</h4><p>Each point compares qualifying (horizontal) with finishing position (vertical). P1 is at the top and left.</p><div class="chart-scroll"><svg viewBox="0 0 ' + scatterWidth + ' ' + scatterHeight + '" role="img" aria-label="Qualifying position compared with finishing position">' + grid + '<line class="chart-axis-line" x1="' + margin + '" x2="' + (scatterWidth - margin) + '" y1="' + (scatterHeight - margin) + '" y2="' + (scatterHeight - margin) + '"></line><line class="chart-axis-line" x1="' + margin + '" x2="' + margin + '" y1="' + margin + '" y2="' + (scatterHeight - margin) + '"></line><text class="chart-axis" x="' + (scatterWidth / 2) + '" y="' + (scatterHeight - 8) + '" text-anchor="middle">Qualifying position</text><text class="chart-axis" transform="translate(13 ' + (scatterHeight / 2) + ') rotate(-90)" text-anchor="middle">Finishing position</text>' + dots + '</svg></div></article><article><h4>Finishing-position trend</h4><p>Every classified career finish in chronological order. P1 is at the top.</p><div class="chart-scroll"><svg viewBox="0 0 ' + lineWidth + ' ' + lineHeight + '" role="img" aria-label="Career finishing position trend">' + Array.from({ length: maxPosition }, (_, index) => '<line class="chart-grid" x1="42" x2="' + (lineWidth - 42) + '" y1="' + lineY(index + 1) + '" y2="' + lineY(index + 1) + '"></line>').join('') + '<path class="progression-line" stroke="' + enhColor(driver.name) + '" d="' + enhSvgLine(linePoints) + '"></path>' + linePoints.map((point, index) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="4" fill="' + enhColor(driver.name) + '"><title>' + escapeHtml(enhRoundLabel(complete[index]) + ': P' + complete[index].position) + '</title></circle>').join('') + '</svg></div></article></div>';
  }
  function enhProfileTracks(driver) {
    const rows = sortProfileSection([...new Set(enhAllRounds().map((round) => enhTrackName(round.race)))].map((track) => {
      const stats = getStats(driver.entries.filter((entry) => enhTrackName(entry.race) === track));
      return { track, starts: stats.completed.length, wins: stats.wins, podiums: stats.podiums, poles: stats.poles, avgFinish: stats.avgFinish, bestFinish: stats.completed.length ? Math.min(...stats.completed.map((entry) => entry.position)) : null, lapsLed: stats.lapsLed };
    }).filter((row) => row.starts), 'tracks');
    return '<section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Circuit form</p><h3>Track performance</h3></div><p>Every GTO circuit where this driver recorded a classified start.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + profileSectionHeader('Track', 'tracks', 'track') + profileSectionHeader('Starts', 'tracks', 'starts') + profileSectionHeader('Wins', 'tracks', 'wins') + profileSectionHeader('Podiums', 'tracks', 'podiums') + profileSectionHeader('Poles', 'tracks', 'poles') + profileSectionHeader('Avg. finish', 'tracks', 'avgFinish') + profileSectionHeader('Best finish', 'tracks', 'bestFinish') + profileSectionHeader('Laps led', 'tracks', 'lapsLed') + '</tr></thead><tbody>' + (rows.map((row) => '<tr><td><button type="button" class="profile-jump-link" data-profile-track="' + escapeHtml(row.track) + '">' + escapeHtml(row.track) + '</button></td><td>' + row.starts + '</td><td>' + (row.wins || '—') + '</td><td>' + (row.podiums || '—') + '</td><td>' + (row.poles || '—') + '</td><td>' + average(row.avgFinish) + '</td><td>' + position(row.bestFinish) + '</td><td>' + (row.lapsLed || '—') + '</td></tr>').join('') || '<tr><td colspan="8">No track results recorded.</td></tr>') + '</tbody></table></div></section>';
  }
  function renderDriverProfile() {
    const driver = getCareerDriver(state.selectedDriver); if (!driver) { elements.driverProfile.innerHTML = '<p class="no-profile">No driver history is available.</p>'; return; }
    if (!state.profileTab) state.profileTab = 'overview';
    if (!state.profileRaceSeason || (state.profileRaceSeason !== 'all' && !driver.seasons.some(({ season }) => season.id === state.profileRaceSeason))) {
      state.profileRaceSeason = driver.seasons.slice().sort((a, b) => b.seasonIndex - a.seasonIndex)[0]?.season.id || 'all';
    }
    const bests = enhCareerBests(driver.name);
    const hero = '<article class="profile-hero"><div><p class="eyebrow">Career at a glance</p><h3>' + escapeHtml(driver.name) + '</h3><p>' + driver.seasons.length + ' season' + (driver.seasons.length === 1 ? '' : 's') + ' · ' + driver.completed.length + ' race start' + (driver.completed.length === 1 ? '' : 's') + ' · ' + number.format(driver.points) + ' career points</p></div><div class="profile-metrics"><div><strong>' + driver.wins + '</strong><span>Wins</span></div><div><strong>' + driver.podiums + '</strong><span>Podiums</span></div><div><strong>' + driver.poles + '</strong><span>Poles</span></div><div><strong>' + driver.fastestLaps + '</strong><span>Fastest laps</span></div><div><strong>' + driver.lapsLed + '</strong><span>Laps led</span></div></div></article>' + enhCareerBestsBox(bests) + enhProfileTabs();
    if (state.profileTab === 'tracks') { elements.driverProfile.innerHTML = hero + enhProfileTracks(driver); return; }
    if (state.profileTab === 'charts') { elements.driverProfile.innerHTML = hero + enhProfileChartSvg(driver, enhEntriesWithResult(driver.entries)); return; }
    const summaryRows = sortProfileSection(driver.seasons.map(({ season, seasonIndex, entries }) => { const stats = getStats(entries); const standing = getChampionshipFinishingStandings(season).find((entry) => entry.name === driver.name); return { season, seasonIndex, championshipPosition: standing?.championshipPosition ?? null, starts: stats.completed.length, points: stats.points, wins: stats.wins, podiums: stats.podiums, poles: stats.poles, avgFinish: stats.avgFinish }; }), 'summary');
    const carRows = sortProfileSection(getCareerCarClasses().map((carClass) => { const stats = getStats(driver.entries.filter((entry) => getCarClass(entry.race) === carClass)); return { carClass, starts: stats.completed.length, avgFinish: stats.avgFinish, avgQualifying: stats.avgQualifying, wins: stats.wins, podiums: stats.podiums, points: stats.points }; }).filter((row) => row.starts), 'car');
    const races = driver.entries.filter((entry) => enhResultHasFinish(entry) || enhResultHasQualifying(entry)).filter((entry) => state.profileRaceSeason === 'all' || entry.season.id === state.profileRaceSeason);
    const raceRows = sortProfileLogEntries(races).map((entry) => '<tr><td>' + escapeHtml(entry.season.name) + '</td><td>R' + (entry.roundIndex + 1) + '</td><td><button type="button" class="profile-jump-link" data-profile-race-season-index="' + entry.seasonIndex + '" data-profile-race-round-index="' + entry.roundIndex + '">' + escapeHtml(entry.race.name || 'TBC') + '</button><small>' + escapeHtml(entry.race.label || 'Round details unavailable') + '</small></td><td>' + position(entry.position) + '</td><td>' + position(entry.qualifyingPosition) + '</td><td class="' + (enhPositionChange(entry) > 0 ? 'movement-positive' : enhPositionChange(entry) < 0 ? 'movement-negative' : '') + '">' + enhChange(enhPositionChange(entry)) + '</td><td>' + (entry.points || '—') + '</td><td>' + (entry.lapsLed || '—') + '</td><td class="race-log-notes">' + (entry.pole ? '<span>Pole</span>' : '') + (entry.fastestLap ? '<span>Fastest lap</span>' : '') + (!entry.pole && !entry.fastestLap ? '—' : '') + '</td></tr>').join('');
    const h2hRows = sortProfileSection(getHeadToHead(driver.name), 'h2h').map((entry) => '<tr><td>' + driverLink(entry.opponent.name, 'record-driver-link') + '</td><td>' + (entry.raceMeetings ? recordString(entry.raceWins, entry.raceLosses, entry.raceTies) : '—') + '</td><td>' + (entry.raceMeetings || '—') + '</td><td>' + (entry.qualMeetings ? recordString(entry.qualWins, entry.qualLosses, entry.qualTies) : '—') + '</td><td>' + (entry.qualMeetings || '—') + '</td></tr>').join('');
    const seasonOptions = '<option value="all">All Seasons</option>' + seasons.map((season) => '<option value="' + escapeHtml(season.id) + '"' + (state.profileRaceSeason === season.id ? ' selected' : '') + '>' + escapeHtml(season.name) + '</option>').join('');
    elements.driverProfile.innerHTML = hero + '<div class="profile-layout"><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Season by season</p><h3>Championship summary</h3></div><p>Click a heading to sort.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + profileSectionHeader('Season', 'summary', 'seasonIndex') + profileSectionHeader('Finish', 'summary', 'championshipPosition') + profileSectionHeader('Starts', 'summary', 'starts') + profileSectionHeader('Points', 'summary', 'points') + profileSectionHeader('Wins', 'summary', 'wins') + profileSectionHeader('Podiums', 'summary', 'podiums') + profileSectionHeader('Poles', 'summary', 'poles') + profileSectionHeader('Avg. finish', 'summary', 'avgFinish') + '</tr></thead><tbody>' + summaryRows.map((row) => '<tr><td>' + escapeHtml(row.season.name) + '</td><td>' + position(row.championshipPosition) + '</td><td>' + row.starts + '</td><td>' + number.format(row.points) + '</td><td>' + (row.wins || '—') + '</td><td>' + (row.podiums || '—') + '</td><td>' + (row.poles || '—') + '</td><td>' + average(row.avgFinish) + '</td></tr>').join('') + '</tbody></table></div></section><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Against the field</p><h3>Head-to-head</h3></div><p>W-L-T uses shared results only.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + profileSectionHeader('Opponent', 'h2h', 'opponent') + profileSectionHeader('Race W-L-T', 'h2h', 'raceWins') + profileSectionHeader('Races', 'h2h', 'raceMeetings') + profileSectionHeader('Qual. W-L-T', 'h2h', 'qualWins') + profileSectionHeader('Qual.', 'h2h', 'qualMeetings') + '</tr></thead><tbody>' + (h2hRows || '<tr><td colspan="5">No shared results recorded.</td></tr>') + '</tbody></table></div></section></div><section class="profile-panel car-average-panel"><div class="panel-title"><div><p class="eyebrow">By car type</p><h3>Average finish by class</h3></div><p>Career results across every archived season.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + profileSectionHeader('Car class', 'car', 'carClass') + profileSectionHeader('Starts', 'car', 'starts') + profileSectionHeader('Avg. finish', 'car', 'avgFinish') + profileSectionHeader('Avg. qualifying', 'car', 'avgQualifying') + profileSectionHeader('Wins', 'car', 'wins') + profileSectionHeader('Podiums', 'car', 'podiums') + profileSectionHeader('Points', 'car', 'points') + '</tr></thead><tbody>' + carRows.map((row) => '<tr><td><strong>' + escapeHtml(row.carClass) + '</strong></td><td>' + row.starts + '</td><td>' + average(row.avgFinish) + '</td><td>' + average(row.avgQualifying) + '</td><td>' + (row.wins || '—') + '</td><td>' + (row.podiums || '—') + '</td><td>' + number.format(row.points) + '</td></tr>').join('') + '</tbody></table></div></section><section class="profile-panel race-log-panel"><div class="panel-title"><div><p class="eyebrow">Every race results</p><h3>Complete race log</h3></div><label class="profile-season-filter">Season <select data-profile-race-season>' + seasonOptions + '</select></label></div><p class="profile-filter-note">Choose a season to view only those races. New seasons appear automatically.</p><div class="mini-table-shell"><table class="profile-table race-log"><thead><tr>' + profileLogHeader('Season', 'seasonIndex') + profileLogHeader('Round', 'roundIndex') + profileLogHeader('Event', 'event') + profileLogHeader('Finish', 'position') + profileLogHeader('Qual.', 'qualifyingPosition') + profileLogHeader('Change', 'positionChange') + profileLogHeader('Points', 'points') + profileLogHeader('Led', 'lapsLed') + profileLogHeader('Notes', 'notes') + '</tr></thead><tbody>' + (raceRows || '<tr><td colspan="9">No round-by-round results recorded for this filter.</td></tr>') + '</tbody></table></div></section>';
  }
  function enhExtraSortRows(scope, rows, columns) {
    const defaultColumn = columns.find((column) => column.defaultSort) || columns[0];
    const sort = state.extraSorts[scope] || { key: defaultColumn.key, direction: defaultColumn.direction || 'desc' };
    return rows.slice().sort((a, b) => {
      const aValue = a[sort.key]; const bValue = b[sort.key];
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      return (typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue) * (sort.direction === 'asc' ? 1 : -1);
    });
  }
  function enhExtraTable(scope, title, note, columns, rows, limit) {
    const sorted = enhExtraSortRows(scope, rows, columns); const displayed = limit ? sorted.slice(0, limit) : sorted;
    const sort = state.extraSorts[scope] || { key: columns[0].key, direction: columns[0].direction || 'desc' };
    const header = (column) => '<th><button class="sort-button" type="button" data-extra-sort-scope="' + scope + '" data-extra-sort-key="' + column.key + '" aria-pressed="' + (sort.key === column.key) + '">' + column.label + ' <span class="sort-icon" aria-hidden="true">' + (sort.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕') + '</span></button></th>';
    const cell = (row, column) => column.render ? column.render(row) : escapeHtml(row[column.key] === null || row[column.key] === undefined ? '—' : row[column.key]);
    return '<section class="record-panel"><div class="panel-title"><div><p class="eyebrow">Series record</p><h3>' + title + '</h3></div><p>' + note + '</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + columns.map(header).join('') + '</tr></thead><tbody>' + (displayed.map((row) => '<tr>' + columns.map((column) => '<td>' + cell(row, column) + '</td>').join('') + '</tr>').join('') || '<tr><td colspan="' + columns.length + '">No qualifying records are available.</td></tr>') + '</tbody></table></div></section>';
  }
  function enhStreakRows(predicate) {
    return enhCareerNames().map((name) => ({ driver: name, ...enhLongestDriverStreak(name, predicate) })).filter((row) => row.length);
  }
  function enhRecordDriver(row) { return driverLink(row.driver, 'record-driver-link'); }
  function enhRecordPeriod(row) { return row.start ? enhRoundLabel(row.start) + ' to ' + enhRoundLabel(row.end) : '—'; }
  function enhStreakTable(scope, title, predicate) {
    return enhExtraTable(scope, title, 'Top 10 career streaks. A missing or non-qualifying result breaks a streak.', [
      { key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'length', label: 'Streak', render: (row) => row.length + ' races' },
      { key: 'start', label: 'Start', render: (row) => row.start ? enhRoundLabel(row.start) : '—' }, { key: 'end', label: 'End', render: (row) => row.end ? enhRoundLabel(row.end) : '—' }
    ], enhStreakRows(predicate), 10);
  }
  function enhPodiumCombinations() {
    const combinations = new Map();
    enhAllRounds().forEach((round) => {
      const trio = round.season.drivers.map((driver) => ({ name: driver.name, result: driver.results[round.roundIndex] || {} })).filter((entry) => entry.result.position >= 1 && entry.result.position <= 3).sort((a, b) => a.result.position - b.result.position);
      if (trio.length !== 3) return;
      const names = trio.map((entry) => entry.name).sort((a, b) => a.localeCompare(b)); const key = names.join('|');
      combinations.set(key, { driver1: names[0], driver2: names[1], driver3: names[2], count: (combinations.get(key)?.count || 0) + 1 });
    });
    return [...combinations.values()];
  }
  function enhConversionRows(type) {
    return enhCareerNames().map((name) => {
      const entries = enhEntriesForDriver(name); let opportunities = 0; let converted = 0;
      entries.forEach((entry) => {
        const finish = enhResultHasFinish(entry); const leading = (entry.lapsLed || 0) > 0;
        let eligible = false; let success = false;
        if (type === 'poleWin') { eligible = entry.qualifyingPosition === 1; success = entry.position === 1; }
        if (type === 'polePodium') { eligible = entry.qualifyingPosition === 1; success = finish && entry.position <= 3; }
        if (type === 'top3Win') { eligible = enhResultHasQualifying(entry) && entry.qualifyingPosition <= 3; success = entry.position === 1; }
        if (type === 'top5Podium') { eligible = enhResultHasQualifying(entry) && entry.qualifyingPosition <= 5; success = finish && entry.position <= 3; }
        if (type === 'ledWin') { eligible = leading; success = entry.position === 1; }
        if (eligible) { opportunities += 1; if (success) converted += 1; }
      });
      return { driver: name, opportunities, converted, rate: opportunities ? converted / opportunities * 100 : null };
    });
  }
  function enhWinnerStartChart(winningEntries) {
    const distribution = [...winningEntries.reduce((map, entry) => map.set(entry.result.qualifyingPosition, (map.get(entry.result.qualifyingPosition) || 0) + 1), new Map()).entries()].sort((a, b) => a[0] - b[0]);
    if (state.winnerStartFilter === undefined) state.winnerStartFilter = distribution[0]?.[0] || null;
    const maximum = Math.max(...distribution.map(([, count]) => count), 1);
    const selected = winningEntries.filter((entry) => entry.result.qualifyingPosition === state.winnerStartFilter);
    return '<section class="record-panel"><div class="panel-title"><div><p class="eyebrow">Winner analysis</p><h3>Race winner starting-position distribution</h3></div><p>Select a starting position to see every win from that grid spot.</p></div><div class="winner-start-chart">' + distribution.map(([start, wins]) => '<button type="button" data-winner-start="' + start + '" aria-pressed="' + (start === state.winnerStartFilter) + '"><span>P' + start + '</span><i><b style="width:' + (wins / maximum * 100) + '%"></b></i><strong>' + wins + '</strong></button>').join('') + '</div><div class="mini-table-shell"><table class="profile-table"><thead><tr><th>Driver</th><th>Season</th><th>Round</th><th>Event</th><th>Finish</th></tr></thead><tbody>' + selected.map((entry) => '<tr><td>' + driverLink(entry.name, 'record-driver-link') + '</td><td>' + escapeHtml(entry.season.name) + '</td><td>R' + (entry.roundIndex + 1) + '</td><td>' + escapeHtml(entry.race.name) + '</td><td>P1</td></tr>').join('') + '</tbody></table></div></section>';
  }
  function renderSpecialRecords() {
    const career = getCareerDrivers();
    const movement = career.map((driver) => ({ driver: driver.name, gained: driver.positionsGained, lost: driver.positionsLost, net: driver.netPositions }));
    const racesLed = career.map((driver) => ({ driver: driver.name, racesLed: driver.completed.filter((entry) => (entry.lapsLed || 0) > 0).length, starts: driver.completed.length }));
    const sameFinish = enhCareerNames().map((name) => ({ driver: name, ...enhLongestSameFinish(name) })).filter((row) => row.length);
    const winsBetween = enhCareerNames().flatMap((name) => {
      const starts = enhEntriesForDriver(name).filter((entry) => enhResultHasFinish(entry)); const wins = starts.map((entry, index) => ({ ...entry, startIndex: index })).filter((entry) => entry.position === 1); const rows = [];
      for (let index = 1; index < wins.length; index += 1) rows.push({ driver: name, racesBetween: Math.max(0, wins[index].startIndex - wins[index - 1].startIndex - 1), previous: wins[index - 1], next: wins[index] });
      return rows;
    });
    const oneRaceMoves = enhAllEntries().map((entry) => ({ driver: entry.name, gain: enhPositionChange(entry.result), qualifying: entry.result.qualifyingPosition, finish: entry.result.position, season: entry.season.name, round: entry.roundIndex + 1 })).filter((row) => row.gain !== null && row.gain > 0);
    const allRaceMoves = enhAllEntries().map((entry) => ({ driver: entry.name, change: enhPositionChange(entry.result), qualifying: entry.result.qualifyingPosition, finish: entry.result.position, season: entry.season.name, round: entry.roundIndex + 1 })).filter((row) => row.change !== null);
    const winningEntries = enhAllEntries().filter((entry) => entry.result.position === 1 && enhResultHasQualifying(entry.result));
    const winsFromPole = career.map((driver) => ({ driver: driver.name, wins: winningEntries.filter((entry) => entry.name === driver.name && entry.result.qualifyingPosition === 1).length })).filter((row) => row.wins);
    const winsOutsideTopFive = career.map((driver) => ({ driver: driver.name, wins: winningEntries.filter((entry) => entry.name === driver.name && entry.result.qualifyingPosition > 5).length })).filter((row) => row.wins);
    const winnerStartDistribution = [...winningEntries.reduce((map, entry) => map.set(entry.result.qualifyingPosition, (map.get(entry.result.qualifyingPosition) || 0) + 1), new Map()).entries()].map(([start, wins]) => ({ start, wins }));
    const seasonDriverRows = (metric) => seasons.flatMap((season) => calculateStandings(season).map((driver) => ({ driver: driver.name, season: season.name, value: metric(driver) }))).filter((row) => row.value);
    const differentWinners = seasons.map((season) => ({ season: season.name, winners: new Set(getArchiveRounds(season).flatMap(({ index }) => season.drivers.filter((driver) => driver.results[index]?.position === 1).map((driver) => driver.name))).size }));
    const allRounds = enhAllRounds();
    const perfectWeekends = enhAllEntries().filter((entry) => entry.result.pole && entry.result.position === 1 && entry.result.fastestLap);
    const grandSlams = perfectWeekends.filter((entry) => {
      const raceLaps = getRoundLaps(entry.race);
      return raceLaps !== null && (entry.result.lapsLed || 0) === raceLaps;
    });
    const countByDriver = (entries) => [...entries.reduce((counts, entry) => counts.set(entry.name, (counts.get(entry.name) || 0) + 1), new Map()).entries()].map(([driver, total]) => ({ driver, total }));
    const recordOccurrences = (entries) => entries.map((entry) => ({
      driver: entry.name, round: entry.roundIndex + 1, event: entry.race.name || 'TBC', season: entry.season.name
    }));
    const dominantWins = enhAllEntries().filter((entry) => entry.result.position === 1 && getRoundLaps(entry.race) !== null).map((entry) => {
      const raceLaps = getRoundLaps(entry.race); const lapsLed = entry.result.lapsLed || 0;
      return { driver: entry.name, lapsLed, raceLaps, percentage: lapsLed / raceLaps * 100, round: entry.roundIndex + 1, event: entry.race.name || 'TBC', season: entry.season.name };
    });
    const records = '<div class="special-records">' + [
      ['Most fastest laps', (driver) => driver.fastestLaps, 'fastest laps'], ['Most laps led', (driver) => driver.lapsLed, 'laps led'],
      ['Most poles', (driver) => driver.poles, 'poles'], ['Most race starts', (driver) => driver.completed.length, 'starts']
    ].map((record) => '<article class="special-record-card"><h3>' + record[0] + '</h3><ol>' + career.slice().sort((a, b) => record[1](b) - record[1](a) || a.name.localeCompare(b.name)).slice(0, 8).map((driver, index) => '<li><span>' + (index + 1) + '</span>' + driverLink(driver.name, 'record-driver-link') + '<strong>' + record[1](driver) + '</strong></li>').join('') + '</ol><p>' + record[2] + ' across all archived seasons</p></article>').join('') + '<article class="special-record-card joke-record"><h3>Most Driver of the Day (DOTD) Awards</h3><ol><li><span>1</span>' + driverLink('Zay Smitty', 'record-driver-link') + '<strong>' + allRounds.length + '</strong></li></ol><p>Every race ever run in GTO history. This one is intentionally a joke.</p></article></div>';
    elements.records.innerHTML = records +
      enhExtraTable('racesLed', 'Most races leading at least one lap', 'Career races in which a driver led one or more laps.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'racesLed', label: 'Races led' }, { key: 'starts', label: 'Race starts' }], racesLed) +
      enhExtraTable('movement', 'Career position change', 'Only races with both a qualifying and finishing position are counted.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'gained', label: 'Total gained' }, { key: 'lost', label: 'Total lost' }, { key: 'net', label: 'Net', render: (row) => '<span class="' + (row.net > 0 ? 'movement-positive' : row.net < 0 ? 'movement-negative' : '') + '">' + enhChange(row.net) + '</span>' }], movement) +
      enhExtraTable('sameFinish', 'Most consecutive finishes in the same position', 'Top 10 streaks with a matching classified finishing position.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'position', label: 'Finish', render: (row) => position(row.position) }, { key: 'length', label: 'Streak' }, { key: 'start', label: 'Start', render: (row) => row.start ? enhRoundLabel(row.start) : '—' }, { key: 'end', label: 'End', render: (row) => row.end ? enhRoundLabel(row.end) : '—' }], sameFinish, 10) +
      enhStreakTable('wins', 'Most consecutive wins', (entry) => entry.position === 1) +
      enhStreakTable('podiums', 'Most consecutive podiums', (entry) => entry.position <= 3) +
      enhStreakTable('poles', 'Most consecutive poles', (entry) => entry.pole) +
      enhStreakTable('fastest', 'Most consecutive fastest laps', (entry) => entry.fastestLap) +
      enhStreakTable('led', 'Most consecutive races led', (entry) => (entry.lapsLed || 0) > 0) +
      enhStreakTable('top5', 'Most consecutive top-5 finishes', (entry) => entry.position <= 5) +
      enhExtraTable('betweenWins', 'Most races between wins', 'The gap counts a driver’s classified starts between two victories.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'racesBetween', label: 'Races between' }, { key: 'previous', label: 'Previous win', render: (row) => enhRoundLabel(row.previous) }, { key: 'next', label: 'Next win', render: (row) => enhRoundLabel(row.next) }], winsBetween, 10) +
      enhExtraTable('oneRaceMoves', 'Most positions gained in one race', 'Top 10 gains from qualifying to the finish.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'gain', label: 'Positions gained', render: (row) => enhChange(row.gain) }, { key: 'qualifying', label: 'Starting position', render: (row) => position(row.qualifying) }, { key: 'finish', label: 'Finishing position', render: (row) => position(row.finish) }, { key: 'season', label: 'Season' }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }], oneRaceMoves, 10) +
      enhExtraTable('allRaceMoves', 'Qualifying-to-finish movement — every race', 'Sortable career log of all gains and losses from every recorded race.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'change', label: 'Position change', render: (row) => '<span class="' + (row.change > 0 ? 'movement-positive' : row.change < 0 ? 'movement-negative' : '') + '">' + enhChange(row.change) + '</span>' }, { key: 'qualifying', label: 'Starting position', render: (row) => position(row.qualifying) }, { key: 'finish', label: 'Finishing position', render: (row) => position(row.finish) }, { key: 'season', label: 'Season' }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }], allRaceMoves) +
      enhExtraTable('differentWinners', 'Most different winners in a season', 'Every season is included.', [{ key: 'season', label: 'Season', direction: 'asc' }, { key: 'winners', label: 'Different winners' }], differentWinners) +
      enhExtraTable('winsSeason', 'Most wins in one season', 'Top 10 driver-seasons.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'season', label: 'Season' }, { key: 'value', label: 'Wins' }], seasonDriverRows((driver) => driver.wins), 10) +
      enhExtraTable('podiumsSeason', 'Most podiums in one season', 'Top 10 driver-seasons.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'season', label: 'Season' }, { key: 'value', label: 'Podiums' }], seasonDriverRows((driver) => driver.podiums), 10) +
      enhExtraTable('polesSeason', 'Most poles in one season', 'Top 10 driver-seasons.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'season', label: 'Season' }, { key: 'value', label: 'Poles' }], seasonDriverRows((driver) => driver.poles), 10) +
      enhExtraTable('ledSeason', 'Most laps led in one season', 'Top 10 driver-seasons.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'season', label: 'Season' }, { key: 'value', label: 'Laps led' }], seasonDriverRows((driver) => driver.lapsLed), 10) +
      enhExtraTable('podiumCombinations', 'Most common podium combinations', 'Every unique trio of P1, P2, and P3 finishers. Order does not matter.', [{ key: 'driver1', label: 'Driver 1', direction: 'asc', render: (row) => driverLink(row.driver1, 'record-driver-link') }, { key: 'driver2', label: 'Driver 2', render: (row) => driverLink(row.driver2, 'record-driver-link') }, { key: 'driver3', label: 'Driver 3', render: (row) => driverLink(row.driver3, 'record-driver-link') }, { key: 'count', label: 'Podiums together' }], enhPodiumCombinations()) +
      enhExtraTable('winnerStarts', 'Lowest starting position to win', 'The highest qualifying number represents the furthest back a winner started.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'qualifying', label: 'Starting position', render: (row) => position(row.qualifying) }, { key: 'season', label: 'Season' }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }], winningEntries.map((entry) => ({ driver: entry.name, qualifying: entry.result.qualifyingPosition, season: entry.season.name, round: entry.roundIndex + 1 })), 10) +
      enhExtraTable('winsFromPole', 'Most wins from pole', 'Wins after qualifying first.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'wins', label: 'Wins from pole' }], winsFromPole) +
      enhExtraTable('winsOutsideTopFive', 'Most wins from outside the top 5', 'Wins after qualifying sixth or lower.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'wins', label: 'Wins outside top 5' }], winsOutsideTopFive) +
      enhExtraTable('winnerStartDistribution', 'Winner starting-position totals', 'Every win grouped by its qualifying position.', [{ key: 'start', label: 'Starting position', direction: 'asc', render: (row) => position(row.start) }, { key: 'wins', label: 'Wins' }], winnerStartDistribution) +
      enhWinnerStartChart(winningEntries) +
      enhExtraTable('perfectWeekends', 'Most Perfect Weekends', 'Pole, win, and fastest lap in the same race.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'total', label: 'Perfect weekends', defaultSort: true }], countByDriver(perfectWeekends)) +
      enhExtraTable('perfectWeekendOccurrences', 'Every Perfect Weekend', 'Each occurrence of pole, win, and fastest lap in one race.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }, { key: 'event', label: 'Event' }, { key: 'season', label: 'Season' }], recordOccurrences(perfectWeekends)) +
      enhExtraTable('grandSlams', 'Most Grand Slams', 'Pole, win, fastest lap, and every lap of the race led.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'total', label: 'Grand Slams', defaultSort: true }], countByDriver(grandSlams)) +
      enhExtraTable('grandSlamOccurrences', 'Every Grand Slam', 'Each occurrence of pole, win, fastest lap, and every lap led.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }, { key: 'event', label: 'Event' }, { key: 'season', label: 'Season' }], recordOccurrences(grandSlams)) +
      enhExtraTable('dominantWins', 'Highest percentage of race laps led by a winner', 'Race winners ranked by the share of laps they led.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'lapsLed', label: 'Laps led' }, { key: 'raceLaps', label: 'Race laps' }, { key: 'percentage', label: 'Laps led %', defaultSort: true, render: (row) => row.percentage.toFixed(1) + '%' }, { key: 'round', label: 'Round', render: (row) => 'R' + row.round }, { key: 'event', label: 'Event' }, { key: 'season', label: 'Season' }], dominantWins, 10);
  }
  function renderConversionRates() {
    const definitions = [['poleWin', 'Pole → Win %', 'Poles', 'Wins from pole'], ['polePodium', 'Pole → Podium %', 'Poles', 'Podiums from pole'], ['top3Win', 'Top-3 Start → Win %', 'Top-3 starts', 'Wins'], ['top5Podium', 'Top-5 Start → Podium %', 'Top-5 starts', 'Podiums'], ['ledWin', 'Race Led → Win %', 'Races led', 'Wins']];
    elements.records.innerHTML = definitions.map((definition) => enhExtraTable('conversion-' + definition[0], definition[1], 'Opportunities show how often the situation occurred; N/A means no opportunity.', [{ key: 'driver', label: 'Driver', direction: 'asc', render: enhRecordDriver }, { key: 'opportunities', label: definition[2] }, { key: 'converted', label: definition[3] }, { key: 'rate', label: 'Conversion %', render: (row) => row.rate === null ? 'N/A' : row.rate.toFixed(1) + '%' }], enhConversionRows(definition[0]))).join('');
  }
  function renderRecords() {
    renderRecordTypeTabs(); renderRecordPositionTabs(); renderLeadPeriodTabs();
    if (state.recordType === 'special') { renderSpecialRecords(); return; }
    if (state.recordType === 'lead-percentage') { renderLeadPercentageRecords(); return; }
    if (state.recordType === 'conversion') { renderConversionRates(); return; }
    const drivers = getCareerDrivers(); const countsKey = state.recordType === 'race' ? 'positionCounts' : 'qualifyingCounts';
    const count = (driver) => driver[countsKey][state.recordPosition] || 0;
    const ranked = drivers.slice().sort((a, b) => count(b) - count(a) || b.completed.length - a.completed.length || a.name.localeCompare(b.name));
    const label = state.recordType === 'race' ? (state.recordPosition === 1 ? 'Most wins' : 'Most P' + state.recordPosition + ' finishes') : (state.recordPosition === 1 ? 'Most poles' : 'Most P' + state.recordPosition + ' qualifying results');
    elements.records.innerHTML = '<div class="records-header"><div><p class="eyebrow">' + (state.recordType === 'race' ? 'Race finishing positions' : 'Qualifying positions') + '</p><h3>' + label + '</h3></div><p>Every driver is ranked by career results at the selected position.</p></div><div class="table-shell records-table-shell"><table class="records-table"><thead><tr><th>Rank</th><th>Driver</th><th>P' + state.recordPosition + ' total</th><th>Race starts</th><th>Wins</th><th>Poles</th><th>Fastest laps</th><th>Laps led</th></tr></thead><tbody>' + ranked.map((driver, index) => '<tr><td class="standing-rank ' + (index < 3 && count(driver) ? 'top-three' : '') + '">' + (count(driver) ? String(index + 1).padStart(2, '0') : '—') + '</td><td>' + driverLink(driver.name, 'record-driver-link') + '</td><td class="record-total">' + count(driver) + '</td><td>' + driver.completed.length + '</td><td>' + (driver.wins || '—') + '</td><td>' + (driver.poles || '—') + '</td><td>' + (driver.fastestLaps || '—') + '</td><td>' + (driver.lapsLed || '—') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function enhH2H(nameA, nameB, kind, seasonFilter) {
    const meetings = enhAllRounds(seasonFilter).map((round) => {
      const a = round.season.drivers.find((driver) => driver.name === nameA)?.results[round.roundIndex];
      const b = round.season.drivers.find((driver) => driver.name === nameB)?.results[round.roundIndex];
      const aValue = kind === 'qualifying' ? a?.qualifyingPosition : a?.position;
      const bValue = kind === 'qualifying' ? b?.qualifyingPosition : b?.position;
      if (aValue === null || aValue === undefined || bValue === null || bValue === undefined) return null;
      return { season: round.season, seasonIndex: round.seasonIndex, race: round.race, roundIndex: round.roundIndex, winner: aValue < bValue ? nameA : aValue > bValue ? nameB : null };
    }).filter(Boolean);
    const aWins = meetings.filter((entry) => entry.winner === nameA).length;
    const bWins = meetings.filter((entry) => entry.winner === nameB).length;
    const ties = meetings.filter((entry) => !entry.winner).length;
    const streak = (name) => {
      let current = null; let best = null;
      meetings.forEach((entry) => {
        if (entry.winner === name) {
          if (!current) current = { length: 0, start: entry, end: entry };
          current.length += 1; current.end = entry;
          if (!best || current.length > best.length) best = { ...current };
        } else current = null;
      });
      return best || { length: 0, start: null, end: null };
    };
    return { aWins, bWins, ties, meetings: meetings.length, aStreak: streak(nameA), bStreak: streak(nameB) };
  }
  function enhComparisonStat(name, seasonFilter) {
    const entries = enhEntriesForDriver(name, seasonFilter); const stats = getStats(entries); const lap = getParticipationLapStats(entries);
    return { ...stats, ...lap, starts: stats.completed.length, championships: enhChampionships(name, seasonFilter), bests: enhCareerBests(name) };
  }
  function enhCompareCell(value, winner) {
    return '<td class="' + (winner ? 'comparison-leader' : '') + '">' + value + '</td>';
  }
  function enhComparisonValue(value, type) {
    if (value === null || value === undefined) return '—';
    if (type === 'percentage') return value.toFixed(1) + '%';
    if (type === 'change') return enhChange(value);
    if (type === 'position') return position(value);
    return number.format(value);
  }
  function renderComparison() {
    if (!elements.comparisonControls || !elements.comparisonContent) return;
    const names = enhCareerNames(); if (!state.compareDriverA || !names.includes(state.compareDriverA)) state.compareDriverA = names[0] || '';
    if (!state.compareDriverB || !names.includes(state.compareDriverB) || state.compareDriverB === state.compareDriverA) state.compareDriverB = names.find((name) => name !== state.compareDriverA) || state.compareDriverA;
    if (!state.compareSeason) state.compareSeason = 'all';
    const options = (selected) => names.map((name) => '<option value="' + escapeHtml(name) + '"' + (name === selected ? ' selected' : '') + '>' + escapeHtml(name) + '</option>').join('');
    elements.comparisonControls.innerHTML = '<label>Driver 1<select data-comparison-driver="a">' + options(state.compareDriverA) + '</select></label><label>Driver 2<select data-comparison-driver="b">' + options(state.compareDriverB) + '</select></label><label>Period<select data-comparison-season><option value="all"' + (state.compareSeason === 'all' ? ' selected' : '') + '>Career / All Seasons</option>' + seasons.map((season) => '<option value="' + escapeHtml(season.id) + '"' + (state.compareSeason === season.id ? ' selected' : '') + '>' + escapeHtml(season.name) + '</option>').join('') + '</select></label>';
    const a = enhComparisonStat(state.compareDriverA, state.compareSeason); const b = enhComparisonStat(state.compareDriverB, state.compareSeason);
    const race = enhH2H(state.compareDriverA, state.compareDriverB, 'race', state.compareSeason); const qualifying = enhH2H(state.compareDriverA, state.compareDriverB, 'qualifying', state.compareSeason);
    const metric = (label, aValue, bValue, type, lower) => {
      const aWins = aValue !== null && bValue !== null && (lower ? aValue < bValue : aValue > bValue);
      const bWins = aValue !== null && bValue !== null && (lower ? bValue < aValue : aValue < bValue);
      return '<tr>' + enhCompareCell(enhComparisonValue(aValue, type), aWins) + '<th scope="row">' + label + '</th>' + enhCompareCell(enhComparisonValue(bValue, type), bWins) + '</tr>';
    };
    const streak = (label, aStreak, bStreak) => '<tr>' + enhCompareCell(enhStreakLabel(aStreak), aStreak.length > bStreak.length) + '<th scope="row">' + label + '</th>' + enhCompareCell(enhStreakLabel(bStreak), bStreak.length > aStreak.length) + '</tr>';
    const rows = [
      metric('Starts', a.starts, b.starts), metric('Wins', a.wins, b.wins), metric('Podiums', a.podiums, b.podiums), metric('Poles', a.poles, b.poles),
      metric('Fastest laps', a.fastestLaps, b.fastestLaps), metric('Points', a.points, b.points), metric('Laps led', a.lapsLed, b.lapsLed),
      metric('Percentage of laps led', a.lapsLedPercentage, b.lapsLedPercentage, 'percentage'), metric('Average finish', a.avgFinish, b.avgFinish, 'decimal', true),
      metric('Average qualifying position', a.avgQualifying, b.avgQualifying, 'decimal', true), metric('Championships', a.championships, b.championships),
      metric('Total positions gained', a.positionsGained, b.positionsGained), metric('Total positions lost', a.positionsLost, b.positionsLost, null, true),
      metric('Net positions gained/lost', a.netPositions, b.netPositions, 'change'), metric('Best finish', a.bests.bestFinish, b.bests.bestFinish, 'position', true),
      metric('Best qualifying position', a.bests.bestQualifying, b.bests.bestQualifying, 'position', true),
      streak('Longest win streak', a.bests.winStreak, b.bests.winStreak), streak('Longest podium streak', a.bests.podiumStreak, b.bests.podiumStreak)
    ].join('');
    const h2hRows = '<tr>' + enhCompareCell(race.aWins + (race.ties ? ' (' + race.ties + ' T)' : ''), race.aWins > race.bWins) + '<th scope="row">Race H2H record (' + race.meetings + ' shared races)</th>' + enhCompareCell(race.bWins + (race.ties ? ' (' + race.ties + ' T)' : ''), race.bWins > race.aWins) + '</tr>' +
      streak('Longest Race H2H Streak', race.aStreak, race.bStreak) +
      '<tr>' + enhCompareCell(qualifying.aWins + (qualifying.ties ? ' (' + qualifying.ties + ' T)' : ''), qualifying.aWins > qualifying.bWins) + '<th scope="row">Qualifying H2H record (' + qualifying.meetings + ' shared sessions)</th>' + enhCompareCell(qualifying.bWins + (qualifying.ties ? ' (' + qualifying.ties + ' T)' : ''), qualifying.bWins > qualifying.aWins) + '</tr>' +
      streak('Longest Qualifying H2H Streak', qualifying.aStreak, qualifying.bStreak);
    elements.comparisonContent.innerHTML = '<div class="comparison-key"><span><i style="background:' + enhColor(state.compareDriverA) + '"></i>' + escapeHtml(state.compareDriverA) + '</span><span><i style="background:' + enhColor(state.compareDriverB) + '"></i>' + escapeHtml(state.compareDriverB) + '</span><small>Highlighted values lead the selected comparison. H2H streak periods only include races where both drivers participated.</small></div><div class="table-shell comparison-table-shell"><table class="comparison-table"><thead><tr><th>' + escapeHtml(state.compareDriverA) + '</th><th>Statistic</th><th>' + escapeHtml(state.compareDriverB) + '</th></tr></thead><tbody>' + rows + h2hRows + '</tbody></table></div>';
  }
  function enhTrackRows(track) {
    return enhAllRounds().filter((round) => enhTrackName(round.race) === track);
  }
  const trackSortDefaults = { driver: 'asc', starts: 'desc', wins: 'desc', podiums: 'desc', poles: 'desc', fastestLaps: 'desc', lapsLed: 'desc', avgFinish: 'asc', avgQualifying: 'asc' };
  function trackSortHeader(label, key) {
    const active = state.trackSortKey === key;
    return '<th><button class="sort-button" type="button" data-track-sort-key="' + key + '" aria-pressed="' + active + '">' + label + ' <span class="sort-icon" aria-hidden="true">' + (active ? (state.trackSortDirection === 'asc' ? '↑' : '↓') : '↕') + '</span></button></th>';
  }
  function sortTrackRows(rows) {
    return rows.slice().sort((a, b) => {
      const aValue = a[state.trackSortKey]; const bValue = b[state.trackSortKey];
      if (aValue === null || aValue === undefined) return bValue === null || bValue === undefined ? a.driver.localeCompare(b.driver) : 1;
      if (bValue === null || bValue === undefined) return -1;
      const comparison = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
      return comparison * (state.trackSortDirection === 'asc' ? 1 : -1) || a.driver.localeCompare(b.driver);
    });
  }
  function renderTrackHistory() {
    if (!elements.trackHistoryControls || !elements.trackHistoryContent) return;
    const tracks = [...new Set(enhAllRounds().map((round) => enhTrackName(round.race)))].sort((a, b) => a.localeCompare(b));
    if (!state.selectedTrack || !tracks.includes(state.selectedTrack)) state.selectedTrack = tracks[0] || '';
    elements.trackHistoryControls.innerHTML = '<label class="track-picker">Choose track<select data-track-select>' + tracks.map((track) => '<option value="' + escapeHtml(track) + '"' + (track === state.selectedTrack ? ' selected' : '') + '>' + escapeHtml(track) + '</option>').join('') + '</select></label>';
    const rounds = enhTrackRows(state.selectedTrack);
    const entries = enhAllEntries().filter((entry) => enhTrackName(entry.race) === state.selectedTrack);
    const driverRows = enhCareerNames().map((name) => {
      const stats = getStats(entries.filter((entry) => entry.name === name).map((entry) => entry.result));
      return { driver: name, ...stats, starts: stats.completed.length };
    }).filter((row) => row.starts).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || (a.avgFinish || 999) - (b.avgFinish || 999) || a.driver.localeCompare(b.driver));
    const sortedDriverRows = sortTrackRows(driverRows);
    const winners = rounds.map((round) => round.season.drivers.find((driver) => driver.results[round.roundIndex]?.position === 1)).filter(Boolean);
    const winningStarts = rounds.map((round) => {
      const winner = round.season.drivers.find((driver) => driver.results[round.roundIndex]?.position === 1); return winner?.results[round.roundIndex]?.qualifyingPosition;
    }).filter((value) => value !== null && value !== undefined);
    const top = (key) => driverRows.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0))[0];
    const bestFinish = driverRows.slice().filter((row) => row.avgFinish !== null).sort((a, b) => a.avgFinish - b.avgFinish)[0];
    const bestQualifying = driverRows.slice().filter((row) => row.avgQualifying !== null).sort((a, b) => a.avgQualifying - b.avgQualifying)[0];
    const stat = (label, value) => '<div><span>' + label + '</span><strong>' + value + '</strong></div>';
    elements.trackHistoryContent.innerHTML = '<section class="track-summary"><div><p class="eyebrow">Selected circuit</p><h3>' + escapeHtml(state.selectedTrack) + '</h3><p>' + rounds.length + ' GTO race' + (rounds.length === 1 ? '' : 's') + ' held here.</p></div><div class="track-summary-grid">' +
      stat('Most wins', top('wins') ? driverLink(top('wins').driver, 'record-driver-link') + ' · ' + top('wins').wins : '—') +
      stat('Most podiums', top('podiums') ? driverLink(top('podiums').driver, 'record-driver-link') + ' · ' + top('podiums').podiums : '—') +
      stat('Most poles', top('poles') ? driverLink(top('poles').driver, 'record-driver-link') + ' · ' + top('poles').poles : '—') +
      stat('Most fastest laps', top('fastestLaps') ? driverLink(top('fastestLaps').driver, 'record-driver-link') + ' · ' + top('fastestLaps').fastestLaps : '—') +
      stat('Most laps led', top('lapsLed') ? driverLink(top('lapsLed').driver, 'record-driver-link') + ' · ' + top('lapsLed').lapsLed : '—') +
      stat('Best average finish', bestFinish ? driverLink(bestFinish.driver, 'record-driver-link') + ' · ' + average(bestFinish.avgFinish) : '—') +
      stat('Best average qualifying', bestQualifying ? driverLink(bestQualifying.driver, 'record-driver-link') + ' · ' + average(bestQualifying.avgQualifying) : '—') +
      stat('Different winners', new Set(winners.map((winner) => winner.name)).size) +
      stat('Winner average start', winningStarts.length ? average(winningStarts.reduce((sum, value) => sum + value, 0) / winningStarts.length) : '—') +
      '</div></section><section class="track-events"><div class="panel-title"><div><p class="eyebrow">Race archive</p><h3>Every GTO race at ' + escapeHtml(state.selectedTrack) + '</h3></div><p>Tap a race to open its complete results.</p></div><div class="track-event-list">' + rounds.map((round) => {
        const winner = round.season.drivers.find((driver) => driver.results[round.roundIndex]?.position === 1);
        return '<button type="button" class="track-event" data-track-season-index="' + round.seasonIndex + '" data-track-round-index="' + getArchiveRounds(round.season).findIndex((item) => item.index === round.roundIndex) + '"><span>' + escapeHtml(round.season.name) + ' · R' + (round.roundIndex + 1) + '</span><strong>' + escapeHtml(round.race.name) + '</strong><small>Winner: ' + (winner ? escapeHtml(winner.name) : 'No result') + '</small></button>';
      }).join('') + '</div></section><section class="profile-panel"><div class="panel-title"><div><p class="eyebrow">Track standings</p><h3>Driver history at ' + escapeHtml(state.selectedTrack) + '</h3></div><p>Click a column heading to sort. Classified results only.</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + trackSortHeader('Driver', 'driver') + trackSortHeader('Starts', 'starts') + trackSortHeader('Wins', 'wins') + trackSortHeader('Podiums', 'podiums') + trackSortHeader('Poles', 'poles') + trackSortHeader('Fastest laps', 'fastestLaps') + trackSortHeader('Laps led', 'lapsLed') + trackSortHeader('Avg. finish', 'avgFinish') + trackSortHeader('Avg. qualifying', 'avgQualifying') + '</tr></thead><tbody>' + sortedDriverRows.map((row) => '<tr><td>' + driverLink(row.driver, 'record-driver-link') + '</td><td>' + row.starts + '</td><td>' + (row.wins || '—') + '</td><td>' + (row.podiums || '—') + '</td><td>' + (row.poles || '—') + '</td><td>' + (row.fastestLaps || '—') + '</td><td>' + (row.lapsLed || '—') + '</td><td>' + average(row.avgFinish) + '</td><td>' + average(row.avgQualifying) + '</td></tr>').join('') + '</tbody></table></div></section>';
  }
  function enhFacts() {
    const career = getCareerDrivers(); const allEntries = enhAllEntries(); const allRounds = enhAllRounds();
    const named = (name) => escapeHtml(name);
    const highest = (rows, key) => rows.filter((row) => row[key] > 0).slice().sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))[0];
    const second = highest(career.map((driver) => ({ name: driver.name, total: driver.positionCounts[2] })), 'total');
    const wins = highest(career, 'wins'); const podiums = highest(career, 'podiums'); const poles = highest(career, 'poles');
    const fastestLaps = highest(career, 'fastestLaps'); const laps = highest(career, 'lapsLed'); const starts = highest(career.map((driver) => ({ name: driver.name, total: driver.completed.length })), 'total');
    const points = highest(career, 'points'); const moves = highest(career.map((driver) => ({ name: driver.name, total: driver.netPositions })), 'total');
    const topFive = highest(career.map((driver) => ({ name: driver.name, total: driver.completed.filter((result) => result.position <= 5).length })), 'total');
    const regulars = career.filter((driver) => driver.completed.length >= 5);
    const bestAverageFinish = regulars.slice().filter((driver) => driver.avgFinish !== null).sort((a, b) => a.avgFinish - b.avgFinish || a.name.localeCompare(b.name))[0];
    const bestAverageQualifying = regulars.slice().filter((driver) => driver.avgQualifying !== null).sort((a, b) => a.avgQualifying - b.avgQualifying || a.name.localeCompare(b.name))[0];
    const raceMoves = allEntries.map((entry) => ({ ...entry, change: enhPositionChange(entry.result) })).filter((entry) => entry.change !== null);
    const biggestMover = raceMoves.filter((entry) => entry.change > 0).sort((a, b) => b.change - a.change || a.name.localeCompare(b.name))[0];
    const mostLapsInRace = allEntries.filter((entry) => entry.result.lapsLed > 0).slice().sort((a, b) => b.result.lapsLed - a.result.lapsLed || a.name.localeCompare(b.name))[0];
    const ledRaces = highest(career.map((driver) => ({ name: driver.name, total: driver.entries.filter((entry) => entry.position !== null && entry.position !== undefined && entry.lapsLed > 0).length })), 'total');
    const winStarts = highest(career.map((driver) => ({ name: driver.name, total: new Set(driver.entries.filter((entry) => entry.position === 1 && entry.qualifyingPosition !== null && entry.qualifyingPosition !== undefined).map((entry) => entry.qualifyingPosition)).size })), 'total');
    const winningTracks = highest(career.map((driver) => ({ name: driver.name, total: new Set(driver.entries.filter((entry) => entry.position === 1).map((entry) => enhTrackName(entry.race))).size })), 'total');
    const lowestStartWin = allEntries.filter((entry) => entry.result.position === 1 && enhResultHasQualifying(entry.result)).slice().sort((a, b) => b.result.qualifyingPosition - a.result.qualifyingPosition || a.name.localeCompare(b.name))[0];
    const streakRows = enhCareerNames().map((name) => ({ name, wins: enhLongestDriverStreak(name, (entry) => entry.position === 1), podiums: enhLongestDriverStreak(name, (entry) => entry.position <= 3), poles: enhLongestDriverStreak(name, (entry) => entry.pole), sameFinish: enhLongestSameFinish(name) }));
    const winStreak = streakRows.filter((row) => row.wins.length).sort((a, b) => b.wins.length - a.wins.length || a.name.localeCompare(b.name))[0];
    const podiumStreak = streakRows.filter((row) => row.podiums.length).sort((a, b) => b.podiums.length - a.podiums.length || a.name.localeCompare(b.name))[0];
    const poleStreak = streakRows.filter((row) => row.poles.length).sort((a, b) => b.poles.length - a.poles.length || a.name.localeCompare(b.name))[0];
    const sameFinish = streakRows.filter((row) => row.sameFinish.length > 1).sort((a, b) => b.sameFinish.length - a.sameFinish.length || a.name.localeCompare(b.name))[0];
    const commonFinish = career.map((driver) => {
      const entries = Object.entries(driver.positionCounts).map(([position, total]) => ({ position: Number(position), total })).sort((a, b) => b.total - a.total || a.position - b.position)[0];
      return { name: driver.name, ...entries };
    }).filter((row) => row.total).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))[0];
    const seasonWins = seasons.flatMap((season) => season.drivers.map((driver) => {
      const stats = getStats(getArchiveRounds(season).map(({ index }) => driver.results[index] || {}));
      return { name: driver.name, season: season.name, total: stats.wins };
    })).filter((row) => row.total).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))[0];
    const podiumCombos = new Map();
    allRounds.forEach((round) => {
      const podium = round.season.drivers.filter((driver) => driver.results[round.roundIndex]?.position <= 3).map((driver) => driver.name).sort((a, b) => a.localeCompare(b));
      if (podium.length !== 3) return;
      const key = podium.join('|'); const existing = podiumCombos.get(key) || { drivers: podium, total: 0 };
      existing.total += 1; podiumCombos.set(key, existing);
    });
    const commonPodium = [...podiumCombos.values()].sort((a, b) => b.total - a.total || a.drivers.join('|').localeCompare(b.drivers.join('|')))[0];
    return [
      second ? named(second.name) + ' has finished second ' + second.total + ' times — more than any other driver.' : '',
      wins ? named(wins.name) + ' leads the archive with ' + wins.wins + ' wins.' : '',
      podiums ? named(podiums.name) + ' has reached the podium ' + podiums.podiums + ' times.' : '',
      poles ? named(poles.name) + ' has earned ' + poles.poles + ' pole position' + (poles.poles === 1 ? '' : 's') + '.' : '',
      fastestLaps ? named(fastestLaps.name) + ' owns the most fastest laps with ' + fastestLaps.fastestLaps + '.' : '',
      laps ? named(laps.name) + ' leads the archive with ' + laps.lapsLed + ' laps led.' : '',
      starts ? named(starts.name) + ' has made ' + starts.total + ' GTO starts — the most in series history.' : '',
      points ? named(points.name) + ' has scored ' + number.format(points.points) + ' career points.' : '',
      topFive ? named(topFive.name) + ' has recorded ' + topFive.total + ' top-five finishes.' : '',
      bestAverageFinish ? named(bestAverageFinish.name) + ' owns the best career average finish among drivers with at least five starts: ' + average(bestAverageFinish.avgFinish) + '.' : '',
      bestAverageQualifying ? named(bestAverageQualifying.name) + ' owns the best average qualifying position among drivers with at least five starts: ' + average(bestAverageQualifying.avgQualifying) + '.' : '',
      moves ? named(moves.name) + ' has the best net position change at ' + enhChange(moves.total) + '.' : '',
      biggestMover ? named(biggestMover.name) + ' made the biggest one-race gain: ' + enhChange(biggestMover.change) + ' at ' + enhRoundLabel(biggestMover) + '.' : '',
      mostLapsInRace ? named(mostLapsInRace.name) + ' led ' + mostLapsInRace.result.lapsLed + ' laps in one race at ' + enhRoundLabel(mostLapsInRace) + '.' : '',
      ledRaces ? named(ledRaces.name) + ' has led at least one lap in ' + ledRaces.total + ' races.' : '',
      winStarts ? named(winStarts.name) + ' has won from ' + winStarts.total + ' different starting position' + (winStarts.total === 1 ? '' : 's') + '.' : '',
      winningTracks ? named(winningTracks.name) + ' has won at ' + winningTracks.total + ' different track' + (winningTracks.total === 1 ? '' : 's') + '.' : '',
      lowestStartWin ? named(lowestStartWin.name) + ' won from P' + lowestStartWin.result.qualifyingPosition + ' — the lowest starting position for a GTO win.' : '',
      winStreak ? named(winStreak.name) + ' owns the longest win streak: ' + enhStreakLabel(winStreak.wins) + '.' : '',
      podiumStreak ? named(podiumStreak.name) + ' owns the longest podium streak: ' + enhStreakLabel(podiumStreak.podiums) + '.' : '',
      poleStreak ? named(poleStreak.name) + ' owns the longest pole streak: ' + enhStreakLabel(poleStreak.poles) + '.' : '',
      sameFinish ? named(sameFinish.name) + ' finished P' + sameFinish.sameFinish.position + ' in ' + sameFinish.sameFinish.length + ' consecutive races.' : '',
      commonFinish ? named(commonFinish.name) + ' has finished P' + commonFinish.position + ' ' + commonFinish.total + ' times — their most common finish.' : '',
      seasonWins ? named(seasonWins.name) + ' won ' + seasonWins.total + ' races in ' + escapeHtml(seasonWins.season) + '.' : '',
      commonPodium ? commonPodium.drivers.map(named).join(', ') + ' have shared the podium ' + commonPodium.total + ' time' + (commonPodium.total === 1 ? '' : 's') + '.' : ''
    ].filter(Boolean);
  }
  function renderDidYouKnow() {
    if (!elements.didYouKnow) return; const facts = enhFacts(); if (!facts.length) return;
    let nextIndex = Math.floor(Math.random() * facts.length);
    if (facts.length > 1 && nextIndex === state.didYouKnowIndex) nextIndex = (nextIndex + 1) % facts.length;
    state.didYouKnowIndex = nextIndex;
    elements.didYouKnow.innerHTML = '<span>Did you know?</span><strong>' + facts[nextIndex] + '</strong><button type="button" data-next-fact aria-label="Show another fact">↻</button>';
  }
  function renderSeason() {
    const season = getSeason(); const standings = calculateStandings(season, { applyChampionshipPointDrops: getStandingsUsePointDrops(season), applyChampionshipBonusPoints: true });
    renderTabs(); renderStandingsViewControls(); renderOverview(standings); renderCarClassStats(); renderStandings(standings); renderSchedule(); renderRoundPicker(); renderRoundResults(); renderComparison(); renderTrackHistory(); renderDidYouKnow();
  }
  function openDriver(name, scroll) {
    const driver = getCareerDriver(name); if (!driver) return;
    state.selectedDriver = name;
    state.profileRaceSeason = driver.seasons.slice().sort((a, b) => b.seasonIndex - a.seasonIndex)[0]?.season.id || 'all';
    renderProfileSelector(); renderDriverProfile();
    if (scroll !== false) document.querySelector('#driver-profile').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setupEnhancedArchive() {
    Object.assign(state, {
      progressionMode: 'all', progressionSelected: new Set(), profileTab: 'overview', profileRaceSeason: null,
      profileTrackSortKey: 'track', profileTrackSortDirection: 'asc', compareSeason: 'all', extraSorts: {}, specialRecordFilter: 'all', didYouKnowIndex: null,
      roundSortKey: 'position', roundSortDirection: 'asc', standingsMode: 'drops'
    });
    Object.assign(elements, {
      progressionControls: document.querySelector('#progression-controls'), progressionChart: document.querySelector('#progression-chart'),
      didYouKnow: document.querySelector('#did-you-know'), comparisonControls: document.querySelector('#comparison-controls'),
      comparisonContent: document.querySelector('#comparison-content'), trackHistoryControls: document.querySelector('#track-history-controls'),
      trackHistoryContent: document.querySelector('#track-history-content'), backToTop: document.querySelector('#back-to-top')
    });
    elements.progressionControls?.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-progression-mode]'); const driver = event.target.closest('[data-progression-driver]');
      if (mode) state.progressionMode = mode.dataset.progressionMode;
      if (driver) { state.progressionMode = 'select'; const name = driver.dataset.progressionDriver; state.progressionSelected.has(name) ? state.progressionSelected.delete(name) : state.progressionSelected.add(name); }
      if (mode || driver) enhRenderProgression();
    });
    elements.roundResults.addEventListener('click', (event) => {
      const button = event.target.closest('[data-round-sort-key]'); if (!button) return; const key = button.dataset.roundSortKey;
      if (state.roundSortKey === key) state.roundSortDirection = state.roundSortDirection === 'asc' ? 'desc' : 'asc'; else { state.roundSortKey = key; state.roundSortDirection = enhRoundSortDefaults[key] || 'desc'; }
      renderRoundResults();
    });
    elements.driverProfile.addEventListener('change', (event) => {
      if (event.target.matches('[data-profile-race-season]')) { state.profileRaceSeason = event.target.value; renderDriverProfile(); }
    });
    elements.driverProfile.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-profile-tab]'); if (tab) { state.profileTab = tab.dataset.profileTab; renderDriverProfile(); }
    });
    elements.driverProfile.addEventListener('click', (event) => {
      const race = event.target.closest('[data-profile-race-season-index]');
      if (race) {
        state.seasonIndex = Number(race.dataset.profileRaceSeasonIndex);
        const archiveRoundIndex = getArchiveRounds(getSeason()).findIndex(({ index }) => index === Number(race.dataset.profileRaceRoundIndex));
        if (archiveRoundIndex < 0) return;
        state.roundIndex = archiveRoundIndex; renderSeason();
        document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const track = event.target.closest('[data-profile-track]');
      if (!track) return;
      state.selectedTrack = track.dataset.profileTrack; renderTrackHistory();
      document.querySelector('#track-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    elements.records.addEventListener('click', (event) => {
      const winnerStart = event.target.closest('[data-winner-start]');
      if (winnerStart) { state.winnerStartFilter = Number(winnerStart.dataset.winnerStart); renderRecords(); return; }
      const button = event.target.closest('[data-extra-sort-scope]'); if (!button) return; const scope = button.dataset.extraSortScope; const key = button.dataset.extraSortKey; const current = state.extraSorts[scope];
      state.extraSorts[scope] = current && current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }; renderRecords();
    });
    elements.records.addEventListener('change', (event) => {
      if (!event.target.matches('[data-special-record-filter]')) return;
      state.specialRecordFilter = event.target.value; renderRecords();
    });
    elements.comparisonControls.addEventListener('change', (event) => {
      if (event.target.matches('[data-comparison-driver="a"]')) state.compareDriverA = event.target.value;
      if (event.target.matches('[data-comparison-driver="b"]')) state.compareDriverB = event.target.value;
      if (event.target.matches('[data-comparison-season]')) state.compareSeason = event.target.value;
      renderComparison();
    });
    elements.trackHistoryControls.addEventListener('change', (event) => { if (event.target.matches('[data-track-select]')) { state.selectedTrack = event.target.value; renderTrackHistory(); } });
    elements.trackHistoryContent.addEventListener('click', (event) => {
      const sort = event.target.closest('[data-track-sort-key]');
      if (sort) { const key = sort.dataset.trackSortKey; if (state.trackSortKey === key) state.trackSortDirection = state.trackSortDirection === 'asc' ? 'desc' : 'asc'; else { state.trackSortKey = key; state.trackSortDirection = trackSortDefaults[key]; } renderTrackHistory(); return; }
      const race = event.target.closest('[data-track-season-index]'); if (!race) return;
      state.seasonIndex = Number(race.dataset.trackSeasonIndex); state.roundIndex = Number(race.dataset.trackRoundIndex); renderSeason(); document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    elements.didYouKnow.addEventListener('click', (event) => { if (event.target.closest('[data-next-fact]')) renderDidYouKnow(); });
    const backButton = elements.backToTop;
    if (backButton) {
      const updateBackButton = () => backButton.classList.toggle('is-visible', window.scrollY > 560);
      window.addEventListener('scroll', updateBackButton, { passive: true }); updateBackButton();
      backButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
    window.setInterval(renderDidYouKnow, 9000);
  }
  function enhProfileChartSvg(driver, entries) {
    const complete = entries.filter((entry) => enhResultHasFinish(entry)).slice().sort((a, b) => a.seasonIndex - b.seasonIndex || a.roundIndex - b.roundIndex);
    if (!complete.length) return '<p class="no-profile">No classified finishes are available for this chart.</p>';
    const width = 900; const height = 360; const margin = { top: 28, right: 28, bottom: 62, left: 66 };
    const maxPosition = Math.max(15, ...complete.map((entry) => entry.position));
    const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom;
    const lineX = (index) => margin.left + (complete.length < 2 ? plotWidth / 2 : index / (complete.length - 1) * plotWidth);
    const lineY = (value) => margin.top + (value - 1) / Math.max(maxPosition - 1, 1) * plotHeight;
    const points = complete.map((entry, index) => ({ x: lineX(index), y: lineY(entry.position) }));
    const yGrid = Array.from({ length: maxPosition }, (_, index) => '<line class="chart-grid" x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + lineY(index + 1) + '" y2="' + lineY(index + 1) + '"></line><text class="chart-axis" x="' + (margin.left - 10) + '" y="' + (lineY(index + 1) + 4) + '" text-anchor="end">P' + (index + 1) + '</text>').join('');
    const labelEvery = Math.max(1, Math.ceil(complete.length / 10));
    const xLabels = points.map((point, index) => (index === 0 || index === points.length - 1 || index % labelEvery === 0) ? '<text class="chart-axis" x="' + point.x + '" y="' + (height - margin.bottom + 22) + '" text-anchor="middle">' + (index + 1) + '</text>' : '').join('');
    return '<div class="profile-charts"><article><h4>Finishing-position trend</h4><p>Each point is a classified series start. P1 is at the top.</p><div class="chart-scroll"><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Finishing position by race number"><line class="chart-axis-line" x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + (height - margin.bottom) + '" y2="' + (height - margin.bottom) + '"></line><line class="chart-axis-line" x1="' + margin.left + '" x2="' + margin.left + '" y1="' + margin.top + '" y2="' + (height - margin.bottom) + '"></line>' + yGrid + xLabels + '<path class="progression-line" stroke="' + enhColor(driver.name) + '" d="' + enhSvgLine(points) + '"></path>' + points.map((point, index) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="4" fill="' + enhColor(driver.name) + '"><title>' + escapeHtml(enhRoundLabel(complete[index]) + ': P' + complete[index].position) + '</title></circle>').join('') + '<text class="chart-axis" x="' + (margin.left + plotWidth / 2) + '" y="' + (height - 12) + '" text-anchor="middle">Race number in series</text><text class="chart-axis" transform="translate(16 ' + (margin.top + plotHeight / 2) + ') rotate(-90)" text-anchor="middle">Finishing position</text></svg></div></article></div>';
  }
  function renderRoundResults() {
    const sourceSeason = getSeason(); const archiveRounds = getArchiveRounds(sourceSeason); const round = archiveRounds[state.roundIndex];
    if (!round) { elements.roundResults.innerHTML = '<p class="no-results">No round is selected.</p>'; return; }
    const classifiedRows = sourceSeason.drivers.map((driver) => ({ name: driver.name, result: driver.results[round.index] || {} }))
      .filter((entry) => enhResultHasFinish(entry.result) || enhResultHasQualifying(entry.result))
      .sort((a, b) => (a.result.position || 999) - (b.result.position || 999) || (a.result.qualifyingPosition || 999) - (b.result.qualifyingPosition || 999) || a.name.localeCompare(b.name));
    const hasZayResult = classifiedRows.some((entry) => entry.name === 'Zay Smitty');
    const rows = hasZayResult ? classifiedRows : classifiedRows.concat({ name: 'Zay Smitty', result: { position: null, qualifyingPosition: null, points: 0, lapsLed: 0, pole: false, fastestLap: false }, dotdOnly: true });
    const indicators = (entry) => (entry.result.pole ? '<span class="result-badge pole-badge">Pole</span>' : '') + (entry.result.fastestLap ? '<span class="result-badge fl-badge">FL</span>' : '') + (entry.name === 'Zay Smitty' ? '<span class="result-badge dotd-badge">DOTD</span>' : '');
    const cards = rows.map((entry) => '<div class="result-row"><span class="result-position">' + position(entry.result.position) + '</span><div class="result-name">' + driverLink(entry.name, 'result-driver-link') + '<span class="result-indicators">' + indicators(entry) + '</span></div><span class="result-qualifying">' + position(entry.result.qualifyingPosition) + '<small>Qualifying</small></span><span class="result-laps-led">' + (entry.result.lapsLed || '—') + '<span>Laps led</span></span><span class="result-points">' + (entry.dotdOnly ? '0' : (entry.result.points ?? '—')) + '<span>Points</span></span></div>').join('');
    elements.roundResults.innerHTML = '<div class="round-results-header"><div><p class="round-label">' + escapeHtml(sourceSeason.name) + ' — Round ' + (state.roundIndex + 1) + ' · ' + escapeHtml(round.race.label || 'Race details unavailable') + '</p><h3>' + escapeHtml(round.race.name || 'TBC') + '</h3></div><p>' + classifiedRows.length + ' driver result' + (classifiedRows.length === 1 ? '' : 's') + '</p></div><div class="results-list">' + (cards || '<p class="no-results">No classified result recorded.</p>') + '</div>';
  }
  function enhExtraTable(scope, title, note, columns, rows, limit) {
    if (scope === 'allRaceMoves' || scope === 'winnerStartDistribution') return '';
    const orderedColumns = columns.slice(); const seasonIndex = orderedColumns.findIndex((column) => column.key === 'season');
    if (seasonIndex >= 0 && seasonIndex !== orderedColumns.length - 1) orderedColumns.push(orderedColumns.splice(seasonIndex, 1)[0]);
    const defaultColumn = orderedColumns.find((column) => column.defaultSort) || orderedColumns[0];
    const sorted = enhExtraSortRows(scope, rows, orderedColumns); const displayed = limit ? sorted.slice(0, limit) : sorted;
    const sort = state.extraSorts[scope] || { key: defaultColumn.key, direction: defaultColumn.direction || 'desc' };
    const header = (column) => '<th><button class="sort-button" type="button" data-extra-sort-scope="' + scope + '" data-extra-sort-key="' + column.key + '" aria-pressed="' + (sort.key === column.key) + '">' + column.label + ' <span class="sort-icon" aria-hidden="true">' + (sort.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕') + '</span></button></th>';
    const cell = (row, column) => column.render ? column.render(row) : escapeHtml(row[column.key] === null || row[column.key] === undefined ? '—' : row[column.key]);
    return '<section class="record-panel"><div class="panel-title"><div><p class="eyebrow">Series record</p><h3>' + title + '</h3></div><p>' + note + '</p></div><div class="mini-table-shell"><table class="profile-table"><thead><tr>' + orderedColumns.map(header).join('') + '</tr></thead><tbody>' + (displayed.map((row) => '<tr>' + orderedColumns.map((column) => '<td>' + cell(row, column) + '</td>').join('') + '</tr>').join('') || '<tr><td colspan="' + orderedColumns.length + '">No records are available.</td></tr>') + '</tbody></table></div></section>';
  }
  function enhWinnerStartChart(winningEntries) {
    const distribution = [...winningEntries.reduce((map, entry) => map.set(entry.result.qualifyingPosition, (map.get(entry.result.qualifyingPosition) || 0) + 1), new Map()).entries()].sort((a, b) => a[0] - b[0]);
    if (state.winnerStartFilter === undefined) state.winnerStartFilter = distribution[0]?.[0] || null;
    const maximum = Math.max(...distribution.map(([, count]) => count), 1);
    const selected = winningEntries.filter((entry) => entry.result.qualifyingPosition === state.winnerStartFilter);
    return '<section class="record-panel"><div class="panel-title"><div><p class="eyebrow">Winner analysis</p><h3>Race winner starting-position distribution</h3></div><p>Select a starting position to see every win from that grid spot.</p></div><div class="winner-start-chart">' + distribution.map(([start, wins]) => '<button type="button" data-winner-start="' + start + '" aria-pressed="' + (start === state.winnerStartFilter) + '"><span>P' + start + '</span><i><b style="width:' + (wins / maximum * 100) + '%"></b></i><strong>' + wins + '</strong></button>').join('') + '</div><div class="mini-table-shell"><table class="profile-table"><thead><tr><th>Driver</th><th>Round</th><th>Event</th><th>Finish</th><th>Season</th></tr></thead><tbody>' + selected.map((entry) => '<tr><td>' + driverLink(entry.name, 'record-driver-link') + '</td><td>R' + (entry.roundIndex + 1) + '</td><td>' + escapeHtml(entry.race.name) + '</td><td>P1</td><td>' + escapeHtml(entry.season.name) + '</td></tr>').join('') + '</tbody></table></div></section>';
  }
  const renderSpecialRecordsBase = renderSpecialRecords;
  renderSpecialRecords = function renderSpecialRecordsClean() {
    renderSpecialRecordsBase();
    const dotdCard = elements.records.querySelector('.joke-record');
    dotdCard?.classList.remove('joke-record');
    dotdCard?.querySelector('p')?.remove();
    const recordItems = [...elements.records.querySelectorAll('.special-record-card, .record-panel')].map((item) => ({
      item, title: item.querySelector('h3')?.textContent.trim()
    })).filter((record) => record.title);
    const titles = [...new Set(recordItems.map((record) => record.title))];
    if (!titles.includes(state.specialRecordFilter)) state.specialRecordFilter = 'all';
    recordItems.forEach((record) => { record.item.hidden = state.specialRecordFilter !== 'all' && record.title !== state.specialRecordFilter; });
    const cardGroup = elements.records.querySelector('.special-records');
    if (cardGroup) cardGroup.hidden = state.specialRecordFilter !== 'all' && !recordItems.some((record) => record.item.classList.contains('special-record-card') && record.title === state.specialRecordFilter);
    elements.records.insertAdjacentHTML('afterbegin', '<div class="track-history-controls special-record-filter"><label class="track-picker">Choose record<select data-special-record-filter><option value="all"' + (state.specialRecordFilter === 'all' ? ' selected' : '') + '>All records</option>' + titles.map((title) => '<option value="' + escapeHtml(title) + '"' + (title === state.specialRecordFilter ? ' selected' : '') + '>' + escapeHtml(title) + '</option>').join('') + '</select></label></div>');
  };
  setupEnhancedArchive();
  renderPointsSystem(); renderSeason(); renderProfileSelector(); renderDriverProfile(); renderRecords();
})();
