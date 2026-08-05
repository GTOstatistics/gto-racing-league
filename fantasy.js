(() => {
  const root = document.querySelector('#fantasy-content');
  if (!root || !window.GTO_LEAGUE) return;

  const SUPABASE_URL = 'https://vgyovudlmcpdimvpesuq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8-jCWdF9tKS5MrwtAsXloA_kVtXI5nl';
  const DEVICE_KEY = 'gto-fantasy-device-token';
  const ACTIVE_SEASON = '5';
  const number = new Intl.NumberFormat('en-US');
  const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  const views = ['home', 'lineup', 'lineups', 'results', 'standings', 'tiers', 'profiles', 'rules', 'admin'];
  const viewLabels = { home: 'Fantasy Home', lineup: 'Select Lineup', lineups: 'My Lineups', results: 'Weekly Results', standings: 'Season Standings', tiers: 'Driver Tiers', profiles: 'Player Profiles', rules: 'Rules', admin: 'Fantasy Admin' };
  const state = {
    view: 'home', account: null, rounds: [], currentRound: null, tiers: [], lineup: null, previousLineup: null,
    selected: {}, history: [], standings: [], profiles: [], weekResults: [], resultsRoundId: '', settings: null,
    notice: '', error: '', recoveryCode: '', adminSession: sessionStorage.getItem('gto-fantasy-admin-session') || '',
    adminPreview: [], adminRoundIndex: 0, adminPlayers: [], adminAudit: [],
    sort: {
      weekly: { key: 'rank', direction: 'asc' },
      standings: { key: 'counting_points', direction: 'desc' }
    }
  };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const dash = '&mdash;';
  const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const getToken = () => localStorage.getItem(DEVICE_KEY) || '';
  const randomToken = () => {
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const ensureToken = () => getToken() || (() => { const token = randomToken(); localStorage.setItem(DEVICE_KEY, token); return token; })();
  const setMessage = (notice = '', error = '') => { state.notice = notice; state.error = error; };
  const statusLabel = (status) => ({ not_open: 'Not Open', open: 'Open', locked: 'Locked', awaiting_results: 'Awaiting Race Results', scored: 'Scored', canceled: 'Canceled' }[status] || 'Not Open');
  const fmtDate = (value) => value ? `${dateFormat.format(new Date(value))} ET` : 'Set by administrator';
  const season = (id) => window.GTO_LEAGUE.seasons.find((item) => item.id === String(id));
  const activeSeason = () => season(ACTIVE_SEASON);
  const schedule = () => activeSeason() ? window.GTO_LEAGUE.getScheduleRounds(activeSeason()) : [];
  const roundByIndex = (index) => schedule().find((item) => Number(item.index) === Number(index));
  const isRetired = (name) => ['Trevor Levine', 'Nick Collier', 'YattMan'].includes(name);
  const rpc = async (name, body = {}) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const output = await response.json().catch(() => null);
    if (!response.ok) throw new Error(output?.message || output?.hint || `Fantasy service error (${response.status}).`);
    return output;
  };
  const currentOrNextRound = () => {
    const rows = [...state.rounds].sort((a, b) => Number(a.race_index) - Number(b.race_index));
    return rows.find((row) => ['open', 'locked', 'awaiting_results'].includes(row.status)) || rows.find((row) => row.status === 'not_open') || rows.filter((row) => row.status === 'scored').at(-1) || null;
  };
  const message = () => `${state.notice ? `<p class="fantasy-notice" role="status">${esc(state.notice)}</p>` : ''}${state.error ? `<p class="fantasy-error" role="alert">${esc(state.error)}</p>` : ''}`;
  const noData = (text) => `<p class="fantasy-empty">${esc(text)}</p>`;
  const fantasyNav = () => `<div class="fantasy-tabs" role="tablist" aria-label="Fantasy League sections">${views.map((view) => `<button type="button" data-fantasy-view="${view}" aria-selected="${state.view === view}">${viewLabels[view]}</button>`).join('')}</div>`;
  const weightPercent = (value) => `${(safeNumber(value) * 100).toFixed(0)}%`;
  const selectedRound = () => state.currentRound ? roundByIndex(state.currentRound.race_index) : null;
  const config = () => state.settings || { standings_weight: .5, prediction_weight: .5, previous_standings_through_round: 3, season_drops: 3, consecutive_driver_restriction: true };
  const sortHeader = (scope, label, key) => {
    const active = state.sort[scope].key === key;
    const arrow = active ? (state.sort[scope].direction === 'asc' ? '↑' : '↓') : '↕';
    return `<th><button class="sort-button" type="button" data-fantasy-sort-scope="${scope}" data-fantasy-sort-key="${key}" aria-pressed="${active}">${label} <span class="sort-icon" aria-hidden="true">${arrow}</span></button></th>`;
  };
  function sortedFantasyRows(rows, scope, valueFor) {
    const { key, direction } = state.sort[scope];
    const multiplier = direction === 'asc' ? 1 : -1;
    return rows.map((row, index) => ({ row, index })).sort((left, right) => {
      const a = valueFor(left.row, key, left.index); const b = valueFor(right.row, key, right.index);
      const numeric = Number(a); const numericB = Number(b);
      const compare = Number.isFinite(numeric) && Number.isFinite(numericB) ? numeric - numericB : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return compare * multiplier || left.index - right.index;
    }).map((entry) => entry.row);
  }

  function sourceResults(index) {
    const sourceSeason = activeSeason();
    return (sourceSeason?.drivers || []).map((driver) => {
      const result = driver.results?.[Number(index)];
      if (!result || result.position == null) return null;
      return {
        driver_name: driver.name,
        finishing_position: Number(result.position),
        official_race_points: Number(result.points || window.GTO_LEAGUE.pointsSystem?.[String(result.position)] || 0),
        qualifying_position: result.qualifyingPosition == null ? null : Number(result.qualifyingPosition),
        laps_led: Number(result.lapsLed || 0), pole: Boolean(result.pole), fastest_lap: Boolean(result.fastestLap)
      };
    }).filter(Boolean).sort((a, b) => a.finishing_position - b.finishing_position || a.driver_name.localeCompare(b.driver_name));
  }

  function predictionField(seasonId, raceIndex) {
    const sourceSeason = season(seasonId); const race = window.GTO_LEAGUE.getScheduleRounds(sourceSeason)[Number(raceIndex)];
    if (!sourceSeason || !race) return [];
    let forecast = [];
    try { forecast = window.GTO_LEAGUE.predictionRaceForecast(sourceSeason, race) || []; } catch (_) { forecast = []; }
    if (forecast.length) return forecast.filter((row) => !isRetired(row.name));
    return (sourceSeason.predictionDrivers || []).filter((name) => !isRetired(name)).map((name) => ({ name, winProbability: 0, rating: 50 }));
  }

  function standingsEnteringRound(seasonId, raceIndex) {
    const sourceSeason = season(seasonId); const allSeasons = window.GTO_LEAGUE.seasons; const index = allSeasons.findIndex((item) => item.id === sourceSeason?.id);
    const usePrevious = Number(raceIndex) < Number(config().previous_standings_through_round || 3);
    const standingsSeason = usePrevious && index > 0 ? allSeasons[index - 1] : sourceSeason;
    let rows = [];
    try {
      rows = window.GTO_LEAGUE.calculateStandings(standingsSeason, {
        applyChampionshipPointDrops: ['3', '4'].includes(standingsSeason.id), applyChampionshipBonusPoints: true
      }) || [];
    } catch (_) { rows = []; }
    rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return { rows, season: standingsSeason, source: usePrevious && index > 0 ? 'previous_season' : 'current_season' };
  }

  function calculateTierPreview(seasonId, raceIndex) {
    const field = predictionField(seasonId, raceIndex);
    if (!field.length) return [];
    const standings = standingsEnteringRound(seasonId, raceIndex);
    const bestProbability = Math.max(...field.map((row) => safeNumber(row.winProbability)));
    const standingsRank = new Map(standings.rows.map((row, index) => [row.name, index + 1]));
    const count = Math.max(field.length, standings.rows.length, 1);
    const settings = config();
    const rows = field.map((row) => {
      const championshipPosition = standingsRank.get(row.name) || null;
      const predictionStrength = bestProbability > 0 ? safeNumber(row.winProbability) / bestProbability * 100 : Math.max(0, Math.min(100, safeNumber(row.rating, 50)));
      const standingsStrength = championshipPosition ? (count === 1 ? 100 : ((count - championshipPosition) / (count - 1)) * 100) : predictionStrength;
      const probability = safeNumber(row.winProbability);
      const predictionOdds = probability > 0 && probability < 1 ? predictionAmericanOdds(probability) : dash;
      return {
        driver_name: row.name, championship_position: championshipPosition, standings_strength: standingsStrength,
        prediction_odds: predictionOdds, prediction_strength: predictionStrength,
        tier_rating: standingsStrength * safeNumber(settings.standings_weight, .5) + predictionStrength * safeNumber(settings.prediction_weight, .5), entered: true,
        source: {
          standings_source: standings.source, standings_season: standings.season?.name || '', race_prediction_win_probability: probability,
          standings_weight: settings.standings_weight, prediction_weight: settings.prediction_weight
        }
      };
    }).sort((a, b) => b.tier_rating - a.tier_rating || a.driver_name.localeCompare(b.driver_name));
    const base = Math.floor(rows.length / 3); const extra = rows.length % 3;
    const sizes = [base, base + (extra > 1 ? 1 : 0), base + (extra > 0 ? 1 : 0)];
    return rows.map((row, index) => ({ ...row, tier: index < sizes[0] ? 1 : index < sizes[0] + sizes[1] ? 2 : 3 }));
  }
  function predictionAmericanOdds(probability) {
    const probabilitySafe = Math.min(.999, Math.max(.001, probability));
    return probabilitySafe > .5 ? `-${Math.round(probabilitySafe / (1 - probabilitySafe) * 100)}` : `+${Math.round((1 - probabilitySafe) / probabilitySafe * 100)}`;
  }

  async function refreshAccount() {
    const token = getToken();
    state.account = token ? await rpc('fantasy_get_account', { device_token: token }) : null;
    return state.account;
  }
  async function refreshRoundData() {
    state.rounds = await rpc('fantasy_public_rounds');
    state.currentRound = currentOrNextRound();
    state.tiers = state.currentRound ? await rpc('fantasy_public_tiers', { round_uuid: state.currentRound.id }) : [];
    state.lineup = null; state.previousLineup = null; state.history = [];
    if (state.account) {
      state.history = await rpc('fantasy_my_lineup_history', { device_token: getToken(), requested_season: ACTIVE_SEASON });
      if (state.currentRound) {
        state.lineup = await rpc('fantasy_my_lineup', { device_token: getToken(), round_uuid: state.currentRound.id });
        const previous = state.rounds.find((row) => row.season_id === state.currentRound.season_id && Number(row.race_index) === Number(state.currentRound.race_index) - 1);
        state.previousLineup = previous ? await rpc('fantasy_my_lineup', { device_token: getToken(), round_uuid: previous.id }) : null;
      }
    }
  }
  async function refreshPublicResults() {
    const scored = state.rounds.filter((row) => row.status === 'scored');
    if (!scored.some((row) => row.id === state.resultsRoundId)) state.resultsRoundId = scored.at(-1)?.id || '';
    state.weekResults = state.resultsRoundId ? await rpc('fantasy_public_week_results', { round_uuid: state.resultsRoundId }) : [];
  }
  async function refreshAdminData() {
    if (!state.adminSession) return;
    const [settings, players, audit] = await Promise.all([
      rpc('fantasy_admin_settings', { session_token: state.adminSession, payload: null }),
      rpc('fantasy_admin_list_players', { session_token: state.adminSession }),
      rpc('fantasy_admin_audit', { session_token: state.adminSession, max_rows: 20 })
    ]);
    state.settings = settings; state.adminPlayers = players; state.adminAudit = audit;
  }
  async function refresh({ admin = false } = {}) {
    try {
      try { state.settings = await rpc('fantasy_public_settings'); } catch (_) { state.settings = null; }
      await refreshAccount(); await refreshRoundData();
      const [standings, profiles] = await Promise.all([
        rpc('fantasy_public_standings', { season: ACTIVE_SEASON }), rpc('fantasy_public_player_profiles', { requested_season: ACTIVE_SEASON })
      ]);
      state.standings = standings; state.profiles = profiles; await refreshPublicResults();
      if (admin || state.adminSession) await refreshAdminData();
      setMessage();
    } catch (error) { setMessage('', error.message); }
    render();
  }

  const lineupName = (drivers, tier) => (drivers || []).find((item) => Number(item.tier) === tier)?.driver_name || dash;
  const tierRows = (tiers = state.tiers) => [1, 2, 3].map((tier) => {
    const rows = tiers.filter((row) => Number(row.tier) === tier);
    return `<section class="fantasy-tier"><div class="fantasy-tier-heading"><span>Tier ${tier}</span><small>${rows.length} available driver${rows.length === 1 ? '' : 's'}</small></div>${rows.map((row) => `<article class="fantasy-driver-row"><strong>${esc(row.driver_name)}</strong><span>Champ. ${row.championship_position ? `P${row.championship_position}` : dash}</span><span>${esc(row.prediction_odds || dash)}</span><b>${safeNumber(row.tier_rating).toFixed(1)}</b></article>`).join('') || noData('No saved drivers.')}</section>`;
  }).join('');
  function renderHome() {
    const current = state.currentRound; const race = selectedRound(); const ownStanding = state.standings.find((row) => row.player_id === state.account?.id);
    const submitted = Boolean(state.lineup?.id); const deadline = current?.locks_at ? `Locks ${fmtDate(current.locks_at)}` : 'A deadline will be set by the administrator.';
    return `<div class="fantasy-home-grid"><section class="fantasy-hero-card"><p class="eyebrow">${current ? `Season ${esc(current.season_id)} &middot; Round ${Number(current.race_index) + 1}` : 'Season 5 Fantasy'}</p><h3>${current ? esc(current.race_name) : 'Fantasy League is awaiting its first round'}</h3><p>${race?.race?.label ? esc(race.race.label) : 'The administrator will publish the official race, tiers, and deadline before lineups open.'}</p><div class="fantasy-status"><strong>${current ? statusLabel(current.status) : 'Not Open'}</strong><span>${deadline}</span></div></section><section class="fantasy-account-card"><p class="eyebrow">Your Fantasy Profile</p>${state.account ? `<h3>${esc(state.account.display_name)}</h3><p>${submitted ? 'Your lineup is saved for this round.' : 'No lineup is submitted for this round.'}<br>${ownStanding ? `Season rank: P${state.standings.indexOf(ownStanding) + 1} &middot; ${ownStanding.counting_points || 0} counting points` : 'Your season position will appear after the first scored round.'}</p><button class="button button-primary" type="button" data-fantasy-view="lineup">${submitted ? 'Review lineup' : 'Build lineup'}</button>` : `<h3>Join the grid</h3><p>Create a display name on this device to submit one driver from every tier.</p><button class="button button-primary" type="button" data-fantasy-action="show-register">Create profile</button><button class="fantasy-text-button" type="button" data-fantasy-action="show-recovery">Restore a profile</button>`}</section></div><section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Saved weekly tiers</p><h3>${current ? 'Driver Tier Snapshot' : 'What happens next'}</h3></div><p>${current ? `Standings source: ${esc((current.standings_source || '').replace('_', ' '))}. Tier assignments are permanent once submissions open.` : `Tiers blend championship strength (${weightPercent(config().standings_weight)}) and the official race prediction model (${weightPercent(config().prediction_weight)}).`}</p></div>${state.tiers.length ? tierRows() : noData('No tiers are published yet. The Fantasy Admin will generate them from the official Season 5 entry list before the round opens.')}</section>`;
  }
  function renderRegister() { return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Device profile</p><h3>Choose your Fantasy League name</h3></div><p>This profile is tied to this browser and device. Save the private recovery code shown after registration.</p></div><form data-fantasy-form="register"><label>Display name<input name="display_name" maxlength="24" required pattern="[A-Za-z0-9 _-]{2,24}" autocomplete="nickname" /></label><button class="button button-primary" type="submit">Create profile</button><button class="fantasy-text-button" type="button" data-fantasy-view="home">Cancel</button></form><p class="fantasy-security-note">Clearing browser data, private browsing, a new browser, or a different device can disconnect this profile. Your recovery code is never shown publicly.</p></section>`; }
  function renderRecovery() { return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Account recovery</p><h3>Restore your profile</h3></div><p>Enter the recovery code you saved when the profile was created.</p></div><form data-fantasy-form="recover"><label>Recovery code<input name="recovery_code" required autocomplete="one-time-code" /></label><button class="button button-primary" type="submit">Restore profile</button><button class="fantasy-text-button" type="button" data-fantasy-view="home">Cancel</button></form></section>`; }
  function renderRecoveryCode(code) { return `<section class="fantasy-panel fantasy-recovery-card"><p class="eyebrow">Save this now</p><h3>Your recovery code</h3><code>${esc(code)}</code><p>Store this privately. It is the only way to reconnect this Fantasy League profile on another device. It will not be shown again.</p><button class="button button-primary" type="button" data-fantasy-view="home">I saved it</button></section>`; }
  function previousDrivers() { return config().consecutive_driver_restriction ? new Set((state.previousLineup?.drivers || []).map((item) => item.driver_name)) : new Set(); }
  function renderLineup() {
    const current = state.currentRound; if (!state.account) return renderRegister();
    if (!current) return `<section class="fantasy-panel">${noData('Lineups will appear once the Fantasy Admin publishes a Season 5 round and its tier snapshot.')}</section>`;
    const unavailable = previousDrivers(); const saved = new Map((state.lineup?.drivers || []).map((item) => [Number(item.tier), item.driver_name]));
    const choices = [1, 2, 3].map((tier) => state.selected[tier] || saved.get(tier) || dash);
    const editable = current.status === 'open' && new Date(current.opens_at) <= new Date() && new Date(current.locks_at) > new Date();
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">${esc(statusLabel(current.status))}</p><h3>Season ${esc(current.season_id)} &middot; Round ${Number(current.race_index) + 1}</h3></div><p>Deadline: ${fmtDate(current.locks_at)}. Select exactly one entered driver from each tier.</p></div><div class="fantasy-sticky-lineup"><span>Tier 1: <b>${esc(choices[0])}</b></span><span>Tier 2: <b>${esc(choices[1])}</b></span><span>Tier 3: <b>${esc(choices[2])}</b></span></div>${[1, 2, 3].map((tier) => `<section class="fantasy-tier fantasy-select-tier"><div class="fantasy-tier-heading"><span>Tier ${tier}</span><small>${tier === 1 ? 'Top-rated race choices' : tier === 2 ? 'Mid-tier race choices' : 'Value race choices'}</small></div>${state.tiers.filter((row) => Number(row.tier) === tier).map((row) => { const disabled = unavailable.has(row.driver_name); const chosen = (state.selected[tier] || saved.get(tier)) === row.driver_name; return `<label class="fantasy-driver-choice ${disabled ? 'is-unavailable' : ''} ${chosen ? 'is-selected' : ''}"><input type="radio" name="fantasy-tier-${tier}" value="${esc(row.driver_name)}" data-fantasy-tier="${tier}" ${chosen ? 'checked' : ''} ${disabled || !editable ? 'disabled' : ''}/><span><strong>${esc(row.driver_name)}</strong><small>${disabled ? 'Unavailable — selected in your previous lineup' : `Champ. ${row.championship_position ? `P${row.championship_position}` : dash} &middot; ${esc(row.prediction_odds || dash)}`}</small></span><b>${safeNumber(row.tier_rating).toFixed(1)}</b></label>`; }).join('') || noData('No drivers are saved in this tier.')}</section>`).join('')}${editable ? `<button class="button button-primary" type="button" data-fantasy-action="save-lineup">${state.lineup ? 'Update lineup' : 'Submit lineup'}</button>` : `<p class="fantasy-security-note">This lineup is read-only because the round is ${esc(statusLabel(current.status).toLowerCase())}.</p>`}</section>`;
  }
  function renderMyLineups() {
    if (!state.account) return `<section class="fantasy-panel">${noData('Create a Fantasy League profile to save and view lineups.')}</section>`;
    const history = new Map(state.history.map((row) => [row.round_id, row]));
    const rows = [...state.rounds].sort((a, b) => Number(a.race_index) - Number(b.race_index));
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Lineup history</p><h3>My Lineups</h3></div><p>Every submitted lineup retains its tier selections, time, scored result, and drop status. Missed rounds are marked No Entry and never count as a zero.</p></div>${rows.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Season</th><th>Round</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Raw Score</th><th>Finish</th><th>Champ. Pts</th><th>Counted</th><th>Submitted</th></tr></thead><tbody>${rows.map((round) => { const row = history.get(round.id); return row ? `<tr><td>${esc(row.season_id)}</td><td>R${Number(row.race_index) + 1} — ${esc(row.race_name)}</td><td>${esc(lineupName(row.drivers, 1))}</td><td>${esc(lineupName(row.drivers, 2))}</td><td>${esc(lineupName(row.drivers, 3))}</td><td>${row.raw_score ?? dash}</td><td>${row.weekly_rank ? `P${row.weekly_rank}` : dash}</td><td>${row.championship_points ?? dash}</td><td>${round.status === 'scored' ? (row.dropped ? 'Dropped' : 'Counted') : esc(statusLabel(round.status))}</td><td>${fmtDate(row.original_submitted_at)}</td></tr>` : `<tr><td>${esc(round.season_id)}</td><td>R${Number(round.race_index) + 1} — ${esc(round.race_name)}</td><td colspan="8"><em>No Entry</em></td></tr>`; }).join('')}</tbody></table></div>` : noData('No Fantasy League rounds are published yet.')}</section>`;
  }
  function renderResults() {
    const scored = state.rounds.filter((row) => row.status === 'scored').sort((a, b) => Number(a.race_index) - Number(b.race_index));
    if (!scored.length) return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Official scoring</p><h3>Weekly Results</h3></div><p>Fantasy scoring appears only after the official GTO result is finalized. No live or provisional scores are displayed.</p></div>${noData('No Fantasy League week has been finalized yet.')}</section>`;
    const rows = sortedFantasyRows(state.weekResults, 'weekly', (row, key, index) => {
      if (key === 'rank') return row.weekly_rank;
      if (key === 'player') return row.player;
      if (key === 'tier1' || key === 'tier2' || key === 'tier3') return lineupName(row.drivers, Number(key.at(-1)));
      if (key === 'raw_score') return row.raw_score;
      if (key === 'championship_points') return row.championship_points;
      return index;
    });
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Official scoring</p><h3>Weekly Results</h3></div><p>Each driver total includes finishing points and all earned bonuses. Click any heading to sort.</p></div><label class="fantasy-select-label">Choose scored round<select data-fantasy-results-round>${scored.map((round) => `<option value="${round.id}" ${round.id === state.resultsRoundId ? 'selected' : ''}>Season ${round.season_id} — Round ${Number(round.race_index) + 1}: ${esc(round.race_name)}</option>`).join('')}</select></label>${rows.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr>${sortHeader('weekly', 'Rank', 'rank')}${sortHeader('weekly', 'Player', 'player')}${sortHeader('weekly', 'Tier 1', 'tier1')}${sortHeader('weekly', 'Tier 2', 'tier2')}${sortHeader('weekly', 'Tier 3', 'tier3')}${sortHeader('weekly', 'Raw Score', 'raw_score')}${sortHeader('weekly', 'Champ. Pts', 'championship_points')}</tr></thead><tbody>${rows.map((row) => `<tr><td>P${row.weekly_rank}</td><td><strong>${esc(row.player)}</strong></td>${[1, 2, 3].map((tier) => { const driver = (row.drivers || []).find((item) => Number(item.tier) === tier); const bonuses = driver ? [['Win', driver.win_bonus], ['Podium', driver.podium_bonus], ['Pole', driver.pole_bonus], ['FL', driver.fastest_lap_bonus], ['Led', driver.led_a_lap_bonus], ['Most Led', driver.most_laps_led_bonus], ['Move', driver.movement_bonus]].filter(([, value]) => safeNumber(value) > 0).map(([label, value]) => `${label} +${value}`).join(', ') : ''; return `<td><strong>${esc(driver?.driver_name || dash)}</strong><small class="fantasy-score-detail">P${driver?.finishing_position || dash} · ${driver?.total_score ?? dash}${bonuses ? `<br>${esc(bonuses)}` : ''}</small></td>`; }).join('')}<td>${row.raw_score}</td><td>${row.championship_points}</td></tr>`).join('')}</tbody></table></div>` : noData('This scored round has no submitted lineups.')}</section>`;
  }
  function renderStandings() {
    const baseRows = state.standings || [];
    const rows = sortedFantasyRows(baseRows, 'standings', (row, key, index) => {
      if (key === 'rank') return index + 1;
      if (key === 'player') return row.display_name;
      if (key === 'counting_points') return row.counting_points;
      if (key === 'raw_points') return row.raw_points;
      if (key === 'weekly_wins') return row.weekly_wins;
      if (key === 'rounds_entered') return row.rounds_entered;
      if (key === 'average_raw_score') return row.average_raw_score;
      if (key === 'best_weekly_score') return row.best_weekly_score;
      if (key === 'lowest_counting_score') return row.lowest_counting_score;
      if (key === 'drops_used') return row.drops_used;
      if (key === 'most_selected_driver') return row.most_selected_driver || '';
      return index;
    });
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Season 5</p><h3>Fantasy Season Standings</h3></div><p>Ranked by counting fantasy championship points. Up to ${config().season_drops} lowest submitted, scored weeks are automatically dropped; No Entry never counts as zero. Click any heading to sort.</p></div>${rows.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr>${sortHeader('standings', 'Rank', 'rank')}${sortHeader('standings', 'Player', 'player')}${sortHeader('standings', 'Counting Pts', 'counting_points')}${sortHeader('standings', 'Raw Pts', 'raw_points')}${sortHeader('standings', 'Weekly Wins', 'weekly_wins')}${sortHeader('standings', 'Rounds Entered', 'rounds_entered')}${sortHeader('standings', 'Avg. Raw', 'average_raw_score')}${sortHeader('standings', 'Best Week', 'best_weekly_score')}${sortHeader('standings', 'Lowest Counting', 'lowest_counting_score')}${sortHeader('standings', 'Drops Used', 'drops_used')}${sortHeader('standings', 'Most Selected', 'most_selected_driver')}</tr></thead><tbody>${rows.map((row) => `<tr><td>${baseRows.indexOf(row) + 1}</td><td><strong>${esc(row.display_name)}</strong></td><td>${number.format(row.counting_points || 0)}</td><td>${number.format(row.raw_points || 0)}</td><td>${number.format(row.weekly_wins || 0)}</td><td>${number.format(row.rounds_entered || 0)}</td><td>${row.average_raw_score ?? dash}</td><td>${row.best_weekly_score ?? dash}</td><td>${row.lowest_counting_score ?? dash}</td><td>${row.drops_used || 0}</td><td>${esc(row.most_selected_driver || dash)}</td></tr>`).join('')}</tbody></table></div>` : noData('Season standings will appear after the first official Fantasy League round is scored.')}</section>`;
  }
  function renderTiers() {
    const current = state.currentRound;
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Weekly snapshot</p><h3>Driver Tiers</h3></div><p>${current ? `Round ${Number(current.race_index) + 1} uses ${esc((current.standings_source || '').replace('_', ' '))} standings. The saved snapshot does not change after submissions open.` : 'Tiers are generated only for officially entered drivers.'}</p></div>${state.tiers.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Tier</th><th>Driver</th><th>Champ. Pos.</th><th>Standings Score</th><th>Prediction Odds</th><th>Prediction Score</th><th>Tier Rating</th></tr></thead><tbody>${state.tiers.map((row) => `<tr><td>Tier ${row.tier}</td><td><strong>${esc(row.driver_name)}</strong></td><td>${row.championship_position ? `P${row.championship_position}` : dash}</td><td>${safeNumber(row.standings_strength).toFixed(1)}</td><td>${esc(row.prediction_odds || dash)}</td><td>${safeNumber(row.prediction_strength).toFixed(1)}</td><td><b>${safeNumber(row.tier_rating).toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div>` : noData('No tier snapshot has been published yet.')}</section>`;
  }
  function renderProfiles() {
    const profiles = state.profiles || [];
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Fantasy players</p><h3>Player Profiles</h3></div><p>Profiles never reveal device tokens or recovery codes. They update after each officially scored fantasy round.</p></div>${profiles.length ? `<div class="fantasy-profile-grid">${profiles.map((row, index) => { const tierPicks = (row.most_selected_by_tier || []).map((pick) => `T${pick.tier}: ${pick.driver_name} (${pick.selections})`).join(' · ') || 'No scored selections'; const drops = (row.dropped_rounds || []).map((drop) => `R${Number(drop.race_index) + 1}`).join(', ') || 'None yet'; return `<article><span>Rank ${index + 1}</span><h4>${esc(row.display_name)}</h4><strong>${number.format(safeNumber(row.counting_points))} pts</strong><small>${number.format(safeNumber(row.rounds_entered))} rounds · ${number.format(safeNumber(row.weekly_wins))} weekly wins<br>Best: ${row.best_weekly_score ?? dash} · Avg: ${row.average_raw_score ?? dash}<br>Drops: ${esc(drops)}<br>Tier selections: ${esc(tierPicks)}<br>Different drivers: ${row.different_drivers_used ?? 0}</small></article>`; }).join('')}</div>` : noData('Profiles will become available after a player registers and a round is scored.')}</section>`;
  }
  function renderRules() { return `<section class="fantasy-panel fantasy-rules"><div class="panel-title"><div><p class="eyebrow">How it works</p><h3>Fantasy League Rules</h3></div><p>These rules are enforced in both the website and the secure Fantasy League backend.</p></div><ol><li><strong>Pick three drivers:</strong> exactly one entered driver each from Tier 1, Tier 2, and Tier 3. Different players may select the same driver.</li><li><strong>No immediate repeat:</strong> a driver used in your immediately previous submitted round is unavailable next round. A missed round is No Entry and clears this restriction.</li><li><strong>Tier formula:</strong> entered drivers are ranked ${weightPercent(config().standings_weight)} by the applicable championship standings and ${weightPercent(config().prediction_weight)} by the event prediction model. Rounds through ${config().previous_standings_through_round} use final previous-season standings; later rounds use current-season standings.</li><li><strong>Schedule:</strong> submissions open Monday at 8:00 AM Eastern after the previous race is finalized and lock Sunday at 8:00 PM Eastern. Lineups remain editable until lock.</li><li><strong>Weekly score:</strong> finishing points are 25–20–16–13–11–10 through 15th, plus bonuses for a win, podium, pole, fastest lap, leading a lap, leading the most laps, and gaining positions.</li><li><strong>Season score:</strong> weekly lineup ranks earn fantasy championship points on the same 25–20–16 scale. The lowest ${config().season_drops} submitted and scored weeks are dropped automatically. No Entry is not a zero and does not use a drop.</li><li><strong>Profiles:</strong> your profile is attached to this browser/device. Save the recovery code during registration. Clearing browser data, private browsing, or switching devices may otherwise prevent recovery.</li></ol></section>`; }
  function toLocalInput(value) { if (!value) return ''; const date = new Date(value); const pad = (number) => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
  function adminRoundOptions() { return schedule().map((item) => `<option value="${item.index}" ${Number(item.index) === Number(state.adminRoundIndex) ? 'selected' : ''}>Season 5 · Round ${Number(item.index) + 1} — ${esc(item.race.name)}</option>`).join(''); }
  function adminRoundRecord() { return state.rounds.find((row) => row.season_id === ACTIVE_SEASON && Number(row.race_index) === Number(state.adminRoundIndex)); }
  function adminSourceTable() {
    const results = sourceResults(state.adminRoundIndex);
    if (!results.length) return noData('No official finishing positions are in the Season 5 race data yet. Enter/finalize the official results on the website before scoring this fantasy round.');
    return `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Driver</th><th>Finish</th><th>Qualifying</th><th>Race Pts</th><th>Laps Led</th><th>Pole</th><th>Fastest Lap</th></tr></thead><tbody>${results.map((result) => `<tr><td>${esc(result.driver_name)}</td><td>P${result.finishing_position}</td><td>${result.qualifying_position ? `P${result.qualifying_position}` : dash}</td><td>${result.official_race_points}</td><td>${result.laps_led || dash}</td><td>${result.pole ? 'Yes' : dash}</td><td>${result.fastest_lap ? 'Yes' : dash}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderAdmin() {
    if (!state.adminSession) return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Protected controls</p><h3>Fantasy Admin</h3></div><p>Administrator changes are saved to the audit log. The private admin code never appears publicly.</p></div><form data-fantasy-form="admin-login"><label>Administrator code<input name="admin_code" type="password" required autocomplete="current-password" /></label><button class="button button-primary" type="submit">Unlock admin</button></form></section>`;
    const selected = roundByIndex(state.adminRoundIndex); const record = adminRoundRecord(); const settings = config(); const resultRows = sourceResults(state.adminRoundIndex);
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Protected controls</p><h3>Fantasy Admin Dashboard</h3></div><p>${selected ? `Season 5 · Round ${Number(state.adminRoundIndex) + 1}: ${esc(selected.race.name)}${record ? ` · ${statusLabel(record.status)}` : ' · Not created'}` : 'No schedule round selected.'}</p></div><div class="fantasy-admin-grid"><section><h4>Manage Round</h4><label>Choose round<select data-fantasy-admin-round>${adminRoundOptions()}</select></label><label>Open time (Eastern)<input type="datetime-local" data-fantasy-open-time value="${toLocalInput(record?.opens_at)}" required /></label><label>Lock time (Eastern)<input type="datetime-local" data-fantasy-lock-time value="${toLocalInput(record?.locks_at)}" required /></label><button type="button" class="button button-primary" data-fantasy-action="generate-tiers">Generate tier preview</button><button type="button" class="button" data-fantasy-action="publish-round">Save tiers & open round</button>${record && !['scored', 'canceled'].includes(record.status) ? `<button type="button" class="fantasy-text-button" data-fantasy-action="reopen-round">Reopen as not open</button>` : ''}<p class="fantasy-security-note">A saved tier snapshot cannot be changed after entries open unless you reopen the round and record a reason.</p></section><section><h4>Driver Tiers</h4><p>Current weights: standings ${weightPercent(settings.standings_weight)} · predictions ${weightPercent(settings.prediction_weight)}. Extra drivers go to lower tiers first.</p>${state.adminPreview.length ? tierRows(state.adminPreview) : noData('Generate a preview to inspect the tier sources before publishing.')}</section></div><div class="fantasy-admin-grid"><section><h4>Score Round</h4><p>Results are read from the same completed Season 5 results used elsewhere on the site. Scoring cannot be changed silently after finalization.</p>${adminSourceTable()}${record && resultRows.length && !['scored', 'canceled'].includes(record.status) ? `<button type="button" class="button button-primary" data-fantasy-action="score-round">Finalize fantasy scoring</button>` : record?.status === 'scored' ? '<p class="fantasy-security-note">This round is finalized. Reopen it with an audit reason before making a correction.</p>' : ''}</section><section><h4>Settings</h4><form data-fantasy-form="admin-settings"><label>Standings weight (%)<input name="standings_weight" type="number" min="0" max="100" step="1" value="${safeNumber(settings.standings_weight) * 100}" required /></label><label>Prediction weight (%)<input name="prediction_weight" type="number" min="0" max="100" step="1" value="${safeNumber(settings.prediction_weight) * 100}" required /></label><label>Previous-season standings through round<input name="previous_standings_through_round" type="number" min="0" max="20" step="1" value="${settings.previous_standings_through_round}" required /></label><label>Season drops<input name="season_drops" type="number" min="0" max="20" step="1" value="${settings.season_drops}" required /></label><label class="fantasy-check"><input name="consecutive_driver_restriction" type="checkbox" ${settings.consecutive_driver_restriction ? 'checked' : ''}/> Enforce no immediate driver repeat</label><button class="button" type="submit">Save settings</button></form></section></div><section class="fantasy-admin-block"><h4>Players</h4>${state.adminPlayers.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Player</th><th>Status</th><th>Registered</th><th>Lineups</th><th>Actions</th></tr></thead><tbody>${state.adminPlayers.map((player) => `<tr><td>${esc(player.display_name)}</td><td>${esc(player.status)}</td><td>${fmtDate(player.created_at)}</td><td>${player.lineups}</td><td class="fantasy-action-cell"><button type="button" data-fantasy-player-action="rename" data-fantasy-player-id="${player.id}" data-fantasy-player-name="${esc(player.display_name)}">Rename</button><button type="button" data-fantasy-player-action="reset" data-fantasy-player-id="${player.id}" data-fantasy-player-name="${esc(player.display_name)}">Reset recovery</button><button type="button" data-fantasy-player-action="${player.status === 'active' ? 'disable' : 'enable'}" data-fantasy-player-id="${player.id}" data-fantasy-player-name="${esc(player.display_name)}">${player.status === 'active' ? 'Disable' : 'Enable'}</button></td></tr>`).join('')}</tbody></table></div>` : noData('No Fantasy League players have registered yet.')}</section><section class="fantasy-admin-block"><h4>Audit Log</h4>${state.adminAudit.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead><tbody>${state.adminAudit.map((entry) => `<tr><td>${fmtDate(entry.created_at)}</td><td>${esc(entry.action)}</td><td><code>${esc(JSON.stringify(entry.payload || {}))}</code></td></tr>`).join('')}</tbody></table></div>` : noData('No Fantasy League changes are logged yet.')}</section></section>`;
  }
  function render() {
    const body = state.view === 'register' ? renderRegister() : state.view === 'recovery' ? renderRecovery() : state.view === 'recovery-code' ? renderRecoveryCode(state.recoveryCode) : state.view === 'lineup' ? renderLineup() : state.view === 'lineups' ? renderMyLineups() : state.view === 'results' ? renderResults() : state.view === 'standings' ? renderStandings() : state.view === 'tiers' ? renderTiers() : state.view === 'profiles' ? renderProfiles() : state.view === 'rules' ? renderRules() : state.view === 'admin' ? renderAdmin() : renderHome();
    root.innerHTML = fantasyNav() + message() + body;
  }

  async function register(form) {
    const recoveryCode = `GTO-${randomToken().slice(0, 20).toUpperCase()}`;
    await rpc('fantasy_register_player', { display_name: form.display_name.value.trim(), device_token: ensureToken(), recovery_code: recoveryCode });
    state.recoveryCode = recoveryCode; await refreshAccount(); state.view = 'recovery-code'; setMessage('Fantasy profile created. Save the recovery code before continuing.'); render();
  }
  async function recover(form) {
    await rpc('fantasy_recover_account', { recovery_code: form.recovery_code.value.trim(), device_token: ensureToken() });
    state.view = 'home'; await refresh(); setMessage('Your Fantasy League profile was restored.'); render();
  }
  async function saveLineup() {
    const selections = [1, 2, 3].map((tier) => ({ tier, driver_name: state.selected[tier] || lineupName(state.lineup?.drivers, tier) })).filter((item) => item.driver_name !== dash);
    if (selections.length !== 3) throw new Error('Choose one driver from each tier before submitting.');
    state.lineup = await rpc('fantasy_save_lineup', { device_token: getToken(), round_uuid: state.currentRound.id, selections }); state.selected = {};
    setMessage('Your lineup is saved. You can update it until the Sunday deadline.'); await refresh();
  }
  async function adminLogin(form) {
    const sessionToken = randomToken(); await rpc('fantasy_admin_login', { admin_code: form.admin_code.value, session_token: sessionToken });
    state.adminSession = sessionToken; sessionStorage.setItem('gto-fantasy-admin-session', sessionToken); await refresh({ admin: true }); state.view = 'admin'; setMessage('Fantasy Admin access is unlocked for this browser session.'); render();
  }
  function selectedAdminRound() { return { index: Number(state.adminRoundIndex), race: roundByIndex(state.adminRoundIndex) }; }
  async function generateTiers() {
    const selected = selectedAdminRound(); state.adminPreview = calculateTierPreview(ACTIVE_SEASON, selected.index);
    if (!state.adminPreview.length) throw new Error('The prediction model could not produce an eligible Season 5 field for this round.');
    setMessage('Tier preview generated from the current entry list, applicable standings, and race prediction model.'); render();
  }
  async function publishRound() {
    const selected = selectedAdminRound(); if (!selected.race) throw new Error('Choose a scheduled Season 5 round.');
    const openInput = root.querySelector('[data-fantasy-open-time]')?.value; const lockInput = root.querySelector('[data-fantasy-lock-time]')?.value;
    if (!openInput || !lockInput) throw new Error('Set both Eastern opening and locking times before publishing this round.');
    if (!state.adminPreview.length) state.adminPreview = calculateTierPreview(ACTIVE_SEASON, selected.index);
    if (!state.adminPreview.length) throw new Error('Generate a valid tier preview before publishing.');
    const existing = adminRoundRecord(); const prior = state.rounds.find((row) => row.season_id === ACTIVE_SEASON && Number(row.race_index) === selected.index - 1);
    if (prior && !['scored', 'canceled'].includes(prior.status)) throw new Error('Score or cancel the previous Fantasy League round before opening this one.');
    if (existing?.status === 'open') throw new Error('This round is already open. Reopen it with an audit reason before changing its tiers.');
    const payload = { season_id: ACTIVE_SEASON, race_index: selected.index, race_name: selected.race.race.name, race_label: selected.race.race.label || '', status: 'not_open', opens_at: new Date(openInput).toISOString(), locks_at: new Date(lockInput).toISOString(), standings_source: selected.index < Number(config().previous_standings_through_round || 3) ? 'previous_season' : 'current_season' };
    const saved = await rpc('fantasy_admin_save_round', { session_token: state.adminSession, payload });
    await rpc('fantasy_admin_save_tiers', { session_token: state.adminSession, round_uuid: saved.id, tiers: state.adminPreview });
    await rpc('fantasy_admin_save_round', { session_token: state.adminSession, payload: { ...payload, status: 'open' } });
    state.adminPreview = []; await refresh({ admin: true }); state.view = 'home'; setMessage('The tier snapshot is saved and Fantasy League submissions are now open.'); render();
  }
  async function scoreRound() {
    const record = adminRoundRecord(); const results = sourceResults(state.adminRoundIndex);
    if (!record) throw new Error('Create and save this fantasy round before scoring it.');
    if (!results.length) throw new Error('Official Season 5 results are not available for this round yet.');
    if (!confirm(`Finalize Fantasy League scoring for ${record.race_name}? This reads ${results.length} official results and publishes the weekly standings.`)) return;
    await rpc('fantasy_admin_score_round', { session_token: state.adminSession, round_uuid: record.id, official_results: results });
    await refresh({ admin: true }); setMessage('Fantasy scoring is finalized and the weekly results are now public.'); render();
  }
  async function reopenRound() {
    const record = adminRoundRecord(); if (!record) throw new Error('Choose a saved round first.');
    const reason = prompt('Why is this round being reopened? This will be saved in the audit log.');
    if (!reason) return;
    await rpc('fantasy_admin_reopen_round', { session_token: state.adminSession, round_uuid: record.id, reason });
    state.adminPreview = []; await refresh({ admin: true }); setMessage('Round reopened as Not Open. Generate and save tiers again before reopening entries.'); render();
  }
  async function saveSettings(form) {
    const standingsWeight = Number(form.standings_weight.value) / 100; const predictionWeight = Number(form.prediction_weight.value) / 100;
    if (Math.abs(standingsWeight + predictionWeight - 1) > .00001) throw new Error('Standings and prediction weights must total exactly 100%.');
    const payload = { standings_weight: standingsWeight, prediction_weight: predictionWeight, previous_standings_through_round: Number(form.previous_standings_through_round.value), season_drops: Number(form.season_drops.value), consecutive_driver_restriction: form.consecutive_driver_restriction.checked };
    state.settings = await rpc('fantasy_admin_settings', { session_token: state.adminSession, payload }); setMessage('Fantasy League settings are saved for future tier snapshots and scoring.'); render();
  }
  async function adminPlayer(button) {
    const id = button.dataset.fantasyPlayerId; const name = button.dataset.fantasyPlayerName; const action = button.dataset.fantasyPlayerAction;
    if (action === 'rename') {
      const value = prompt(`New display name for ${name}:`, name); if (!value) return;
      await rpc('fantasy_admin_update_player', { session_token: state.adminSession, player_uuid: id, action_name: 'rename', value }); setMessage(`Renamed ${name}.`);
    } else if (action === 'disable') {
      const value = prompt(`Reason for disabling ${name}:`, 'Disabled by administrator.'); if (value === null) return;
      await rpc('fantasy_admin_update_player', { session_token: state.adminSession, player_uuid: id, action_name: 'disable', value }); setMessage(`${name} is disabled.`);
    } else if (action === 'enable') {
      await rpc('fantasy_admin_update_player', { session_token: state.adminSession, player_uuid: id, action_name: 'enable', value: null }); setMessage(`${name} is active again.`);
    } else if (action === 'reset') {
      const recoveryCode = `GTO-${randomToken().slice(0, 20).toUpperCase()}`;
      await rpc('fantasy_admin_reset_recovery_code', { session_token: state.adminSession, player_uuid: id, recovery_code: recoveryCode });
      setMessage(`New recovery code for ${name}: ${recoveryCode} — give it to that player privately; it is not shown publicly.`);
    }
    await refresh({ admin: true }); render();
  }

  root.addEventListener('click', async (event) => {
    const view = event.target.closest('[data-fantasy-view]'); const action = event.target.closest('[data-fantasy-action]'); const player = event.target.closest('[data-fantasy-player-action]'); const sort = event.target.closest('[data-fantasy-sort-scope]');
    if (view) { state.view = view.dataset.fantasyView; setMessage(); if (state.view === 'admin' && state.adminSession) await refreshAdminData(); render(); return; }
    try {
      if (sort) {
        const scope = sort.dataset.fantasySortScope; const key = sort.dataset.fantasySortKey; const current = state.sort[scope];
        state.sort[scope] = { key, direction: current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : (key === 'player' || key === 'tier1' || key === 'tier2' || key === 'tier3' || key === 'most_selected_driver' ? 'asc' : 'desc') };
        render(); return;
      }
      if (player) { await adminPlayer(player); return; }
      if (!action) return;
      const name = action.dataset.fantasyAction;
      if (name === 'show-register') { state.view = 'register'; render(); }
      else if (name === 'show-recovery') { state.view = 'recovery'; render(); }
      else if (name === 'save-lineup') await saveLineup();
      else if (name === 'generate-tiers') await generateTiers();
      else if (name === 'publish-round') await publishRound();
      else if (name === 'score-round') await scoreRound();
      else if (name === 'reopen-round') await reopenRound();
    } catch (error) { setMessage('', error.message); render(); }
  });
  root.addEventListener('change', async (event) => {
    try {
      if (event.target.matches('[data-fantasy-tier]')) { state.selected[Number(event.target.dataset.fantasyTier)] = event.target.value; render(); }
      if (event.target.matches('[data-fantasy-results-round]')) { state.resultsRoundId = event.target.value; await refreshPublicResults(); render(); }
      if (event.target.matches('[data-fantasy-admin-round]')) { state.adminRoundIndex = Number(event.target.value); state.adminPreview = []; render(); }
    } catch (error) { setMessage('', error.message); render(); }
  });
  root.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = event.target;
      if (form.dataset.fantasyForm === 'register') await register(form);
      else if (form.dataset.fantasyForm === 'recover') await recover(form);
      else if (form.dataset.fantasyForm === 'admin-login') await adminLogin(form);
      else if (form.dataset.fantasyForm === 'admin-settings') await saveSettings(form);
    } catch (error) { setMessage('', error.message); render(); }
  });
  refresh();
})();
