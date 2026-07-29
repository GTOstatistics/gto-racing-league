(() => {
  const { seasons, pointsSystem } = window.GTO_DATA;
  const state = { seasonIndex: seasons.length - 1, roundIndex: 0, sortKey: 'championshipPosition', sortDirection: 'asc', selectedDriver: null, profileSummarySortKey: 'seasonIndex', profileSummarySortDirection: 'desc', profileH2HSortKey: 'raceMeetings', profileH2HSortDirection: 'desc', profileCarSortKey: 'avgFinish', profileCarSortDirection: 'asc', profileLogSortKey: 'seasonIndex', profileLogSortDirection: 'desc', recordType: 'race', recordPosition: 1, carClass: null, carSortKey: 'points', carSortDirection: 'desc', leadPeriod: 'overall', leadSortKey: 'percentage', leadSortDirection: 'desc' };
  const elements = {
    tabs: document.querySelector('#season-tabs'), summary: document.querySelector('#season-summary'), statCards: document.querySelector('#stat-cards'),
    standingsHeaders: document.querySelector('#standings-headers'), standings: document.querySelector('#standings-body'), standingsSortStatus: document.querySelector('#standings-sort-status'),
    raceCards: document.querySelector('#race-cards'), roundSelect: document.querySelector('#round-select'), roundResults: document.querySelector('#round-results'),
    driverSelect: document.querySelector('#driver-select'), driverProfile: document.querySelector('#driver-profile-content'),
    carClassTabs: document.querySelector('#car-class-tabs'), carClassContent: document.querySelector('#car-class-content'),
    recordTypeTabs: document.querySelector('#record-type-tabs'), recordPositionTabs: document.querySelector('#record-position-tabs'), records: document.querySelector('#records-content'),
    leadPeriodTabs: document.querySelector('#lead-period-tabs'),
    pointsSystem: document.querySelector('#points-system'),
  };
  const number = new Intl.NumberFormat('en-US');
  const sortDefaults = { championshipPosition: 'asc', name: 'asc', points: 'desc', wins: 'desc', podiums: 'desc', poles: 'desc', fastestLaps: 'desc', completed: 'desc', avgFinish: 'asc', avgQualifying: 'asc', lapsLed: 'desc', lapsLedPercentage: 'desc' };
  const sortLabels = { championshipPosition: 'championship position', name: 'driver', points: 'points', wins: 'wins', podiums: 'podiums', poles: 'pole positions', fastestLaps: 'fastest laps', completed: 'starts', avgFinish: 'average finish', avgQualifying: 'average qualifying position', lapsLed: 'laps led', lapsLedPercentage: 'laps led percentage' };
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

  function calculateStandings(season) {
    return season.drivers.map((driver) => {
      const entries = getArchiveRounds(season).map(({ race, index }) => ({ ...driver.results[index], race }));
      return { ...driver, ...getStats(entries), ...getParticipationLapStats(entries) };
    }).filter((driver) => driver.completed.length)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.avgFinish - b.avgFinish || a.name.localeCompare(b.name))
      .map((driver, index) => ({ ...driver, championshipPosition: index + 1 }));
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
  function renderPointsSystem() { elements.pointsSystem.innerHTML = Object.entries(pointsSystem).sort(([a], [b]) => Number(a) - Number(b)).map(([place, pointsValue]) => `<div class="point-cell"><span>P${place}</span><strong>${pointsValue}</strong></div>`).join(''); }
  function renderSeason() { const standings = calculateStandings(getSeason()); renderTabs(); renderOverview(standings); renderCarClassStats(); renderStandings(standings); renderSchedule(); renderRoundPicker(); renderRoundResults(); }
  function openDriver(name, scroll = true) { if (!getCareerDriver(name)) return; state.selectedDriver = name; renderProfileSelector(); renderDriverProfile(); if (scroll) document.querySelector('#driver-profile').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  document.addEventListener('click', (event) => { const button = event.target.closest('[data-driver-name]'); if (button) openDriver(button.dataset.driverName); });
  elements.tabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-season-index]'); if (tab) { state.seasonIndex = Number(tab.dataset.seasonIndex); state.roundIndex = 0; renderSeason(); } });
  elements.roundSelect.addEventListener('change', (event) => { state.roundIndex = Number(event.target.value); renderRoundResults(); });
  elements.driverSelect.addEventListener('change', (event) => openDriver(event.target.value, false));
  elements.driverProfile.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-sort-section]'); if (!button) return; const section = button.dataset.profileSortSection; const key = button.dataset.profileSortKey; const [keyName, directionName] = profileSectionStateKeys[section]; if (state[keyName] === key) state[directionName] = state[directionName] === 'asc' ? 'desc' : 'asc'; else { state[keyName] = key; state[directionName] = profileSectionSortDefaults[section][key]; } renderDriverProfile(); });
  elements.driverProfile.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-log-sort-key]'); if (!button) return; const key = button.dataset.profileLogSortKey; if (state.profileLogSortKey === key) state.profileLogSortDirection = state.profileLogSortDirection === 'asc' ? 'desc' : 'asc'; else { state.profileLogSortKey = key; state.profileLogSortDirection = profileLogSortDefaults[key]; } renderDriverProfile(); });
  elements.carClassTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-car-class]'); if (tab) { state.carClass = tab.dataset.carClass; renderCarClassStats(); } });
  elements.carClassContent.addEventListener('click', (event) => { const button = event.target.closest('[data-car-sort-key]'); if (!button) return; const key = button.dataset.carSortKey; if (state.carSortKey === key) state.carSortDirection = state.carSortDirection === 'asc' ? 'desc' : 'asc'; else { state.carSortKey = key; state.carSortDirection = sortDefaults[key]; } renderCarClassStats(); });
  elements.standingsHeaders.addEventListener('click', (event) => { const button = event.target.closest('[data-sort-key]'); if (!button) return; const key = button.dataset.sortKey; if (state.sortKey === key) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'; else { state.sortKey = key; state.sortDirection = sortDefaults[key]; } renderStandings(calculateStandings(getSeason())); });
  elements.recordTypeTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-record-type]'); if (tab) { state.recordType = tab.dataset.recordType; renderRecords(); } });
  elements.records.addEventListener('click', (event) => { const button = event.target.closest('[data-lead-sort-key]'); if (!button) return; const key = button.dataset.leadSortKey; if (state.leadSortKey === key) state.leadSortDirection = state.leadSortDirection === 'asc' ? 'desc' : 'asc'; else { state.leadSortKey = key; state.leadSortDirection = leadSortDefaults[key]; } renderRecords(); });
  elements.recordPositionTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-record-position]'); if (tab) { state.recordPosition = Number(tab.dataset.recordPosition); renderRecords(); } });
  elements.leadPeriodTabs.addEventListener('click', (event) => { const tab = event.target.closest('[data-lead-period]'); if (tab) { state.leadPeriod = tab.dataset.leadPeriod; renderRecords(); } });
  renderPointsSystem(); renderSeason(); renderProfileSelector(); renderDriverProfile(); renderRecords();
})();
