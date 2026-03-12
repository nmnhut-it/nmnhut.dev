import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const DIR = new URL('.', import.meta.url).pathname;

const server = createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const fileName = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const filePath = join(DIR, fileName);
  if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html`);

  // Run all tests inside the browser via evaluate
  const results = await page.evaluate(async () => {
    const log = [];
    let passed = 0, failed = 0;

    function assert(cond, label) {
      if (cond) { passed++; log.push({ s: 'pass', t: '  OK: ' + label }); }
      else { failed++; log.push({ s: 'fail', t: '  FAIL: ' + label }); }
    }
    function section(name) { log.push({ s: 'section', t: '\n> ' + name }); }

    // ============================================================
    // MOCK LLM
    // ============================================================
    const mockQueue = [];
    let mockCallCount = 0;
    let lastMockInput = null;

    // Disable sequential display and NPC reactions for tests
    window.sequentialDisplayEnabled = false;
    window.npcReactionsEnabled = false;

    window.sendToLLM = async function(userMessage) {
      mockCallCount++;
      lastMockInput = userMessage;
      conversationHistory.push({ role: 'user', content: userMessage });
      await new Promise(r => setTimeout(r, 30));
      const resp = mockQueue.shift();
      if (!resp) throw new Error('No mock response available');
      conversationHistory.push({ role: 'assistant', content: JSON.stringify(resp) });
      return resp;
    };

    function pushMock(r) { mockQueue.push(r); }
    function idle() {
      return new Promise(resolve => {
        (function check() { if (!window.sending) resolve(); else setTimeout(check, 20); })();
      });
    }
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ============================================================
    section('Initial State');
    assert(document.getElementById('setup-screen') !== null, 'Setup screen exists');
    assert(document.getElementById('game-screen') !== null, 'Game screen exists');
    assert(!document.getElementById('setup-screen').classList.contains('hidden'), 'Setup screen visible');
    assert(!document.getElementById('game-screen').classList.contains('active'), 'Game screen hidden');

    // ============================================================
    section('createInitialState()');
    const st = createInitialState('TestFarmer');
    assert(st.farmerName === 'TestFarmer', 'Sets farmer name');
    assert(st.day === 1, 'Starts day 1');
    assert(st.season === 'Spring', 'Starts Spring');
    assert(st.gold === 50, 'Starts 50 gold');
    assert(st.energy === 10, 'Starts 10 energy');
    assert(st.maxEnergy === 10, 'Max energy 10');
    assert(st.grid.length === 25, '25 grid cells');
    assert(st.grid[0].crop === 'empty', 'Cells start empty');
    assert(st.grid[0].growth === 0, 'Cells start 0 growth');
    assert(st.grid[0].watered === false, 'Cells start unwatered');
    assert(Object.keys(st.inventory).length === 0, 'Inventory empty');
    assert(st.animals.length === 0, 'No animals');
    assert(st.events.length === 0, 'No events');
    assert(st.skills.farming === 1, 'Farming skill 1');
    assert(createInitialState('').farmerName === 'Farmer', 'Default name "Farmer"');

    // ============================================================
    section('applyStateChanges()');
    gameState = createInitialState('Test');

    applyStateChanges({ day: null, gold: null });
    assert(gameState.day === 1, 'Null day ignored');
    assert(gameState.gold === 50, 'Null gold ignored');

    applyStateChanges({ day: 2, gold: 75, weather: 'Rainy' });
    assert(gameState.day === 2, 'Day updated');
    assert(gameState.gold === 75, 'Gold updated');
    assert(gameState.weather === 'Rainy', 'Weather updated');

    applyStateChanges({ inventory: { wheat: 3, carrot: 5 } });
    assert(gameState.inventory.wheat === 3, 'Inv: wheat added');
    assert(gameState.inventory.carrot === 5, 'Inv: carrot added');

    applyStateChanges({ inventory: { wheat: 5, tomato: 2 } });
    assert(gameState.inventory.wheat === 5, 'Inv: wheat updated');
    assert(gameState.inventory.carrot === 5, 'Inv: carrot preserved');
    assert(gameState.inventory.tomato === 2, 'Inv: tomato added');

    applyStateChanges({ inventory: { carrot: 0 } });
    assert(gameState.inventory.carrot === undefined, 'Inv: removed at qty 0');
    applyStateChanges({ inventory: { tomato: -1 } });
    assert(gameState.inventory.tomato === undefined, 'Inv: removed at qty <0');

    applyStateChanges({ relationships: { Martha: { friendship: 20, met: true } } });
    assert(gameState.relationships.Martha.friendship === 20, 'Rel: Martha added');
    applyStateChanges({ relationships: { Bob: { friendship: 10, met: true } } });
    assert(gameState.relationships.Martha.friendship === 20, 'Rel: Martha preserved');
    assert(gameState.relationships.Bob.friendship === 10, 'Rel: Bob added');

    applyStateChanges({ skills: { farming: 3 } });
    assert(gameState.skills.farming === 3, 'Skill updated');
    assert(gameState.skills.foraging === 1, 'Other skill preserved');

    applyStateChanges({ flags: { questStarted: true } });
    assert(gameState.flags.questStarted === true, 'Flag set');
    applyStateChanges({ flags: { another: 'yes' } });
    assert(gameState.flags.questStarted === true, 'Flag preserved');
    assert(gameState.flags.another === 'yes', 'New flag added');

    applyStateChanges({ events: ['e1','e2','e3','e4','e5','e6','e7'] });
    assert(gameState.events.length === 5, 'Events capped at 5');
    assert(gameState.events[0] === 'e3', 'Keeps last 5');

    const ng = gameState.grid.map((c, i) =>
      i < 3 ? { crop: 'wheat', growth: 50, watered: true } : c
    );
    applyStateChanges({ grid: ng });
    assert(gameState.grid[0].crop === 'wheat', 'Grid cell updated');
    assert(gameState.grid[0].growth === 50, 'Grid growth correct');
    assert(gameState.grid[3].crop === 'empty', 'Other cell preserved');

    applyStateChanges({ animals: [{ type: 'chicken', name: 'Clucky', happiness: 80, daysOwned: 1 }] });
    assert(gameState.animals.length === 1, 'Animal added');
    assert(gameState.animals[0].name === 'Clucky', 'Animal name correct');

    applyStateChanges({ energy: 3, reputation: 15, season: 'Summer' });
    assert(gameState.energy === 3, 'Energy updated');
    assert(gameState.reputation === 15, 'Rep updated');
    assert(gameState.season === 'Summer', 'Season updated');

    applyStateChanges(null);
    assert(gameState.season === 'Summer', 'Null changes safe');
    applyStateChanges(undefined);
    assert(gameState.season === 'Summer', 'Undefined changes safe');

    // ============================================================
    section('escapeHtml()');
    assert(escapeHtml('<script>alert(1)</script>').indexOf('&lt;') !== -1, 'Escapes tags');
    assert(escapeHtml('A & B').indexOf('&amp;') !== -1, 'Escapes ampersand');
    assert(escapeHtml('normal') === 'normal', 'Normal text unchanged');

    // ============================================================
    section('UI Rendering');
    gameState = createInitialState('RenderTest');
    gameState.gold = 123; gameState.energy = 7; gameState.day = 5;
    gameState.season = 'Autumn'; gameState.weather = 'Foggy'; gameState.reputation = 42;
    gameState.inventory = { wheat: 3, tomato: 2 };
    gameState.animals = [
      { type: 'chicken', name: 'Henny', happiness: 90, daysOwned: 3 },
      { type: 'cow', name: 'Bessie', happiness: 70, daysOwned: 1 }
    ];
    gameState.events = ['Found key', 'Sold wheat'];
    gameState.grid[0] = { crop: 'wheat', growth: 75, watered: true };
    gameState.grid[1] = { crop: 'tomato', growth: 100, watered: false };
    gameState.grid[2] = { crop: 'tilled', growth: 0, watered: false };
    renderAll();

    assert(document.getElementById('stat-day').textContent === 'Day 5', 'Renders day');
    assert(document.getElementById('stat-season').textContent === 'Autumn', 'Renders season');
    assert(document.getElementById('stat-weather').textContent === 'Foggy', 'Renders weather');
    assert(document.getElementById('stat-gold').textContent === '123', 'Renders gold');
    assert(document.getElementById('stat-energy').textContent === '7/10', 'Renders energy');
    assert(document.getElementById('stat-reputation').textContent === '42', 'Renders rep');

    const gc = document.querySelectorAll('.farm-cell');
    assert(gc.length === 25, 'Grid: 25 cells');
    assert(gc[0].classList.contains('planted'), 'Cell 0 planted');
    assert(gc[0].classList.contains('watered'), 'Cell 0 watered');
    assert(gc[1].classList.contains('grown'), 'Cell 1 grown');
    assert(!gc[1].classList.contains('watered'), 'Cell 1 not watered');
    assert(gc[2].classList.contains('tilled'), 'Cell 2 tilled');
    assert(!gc[3].classList.contains('planted'), 'Cell 3 empty');
    assert(gc[0].querySelectorAll('.growth-bar').length === 1, 'Planted has growth bar');
    assert(gc[2].querySelectorAll('.growth-bar').length === 0, 'Tilled no bar');
    assert(gc[3].querySelectorAll('.growth-bar').length === 0, 'Empty no bar');

    assert(document.querySelectorAll('#inventory-list .inv-item').length === 2, 'Inv: 2 items');
    assert(document.getElementById('inventory-list').textContent.indexOf('wheat') !== -1, 'Inv has wheat');
    assert(document.querySelectorAll('#animal-list .animal-tag').length === 2, '2 animals');
    assert(document.getElementById('animal-list').textContent.indexOf('Henny') !== -1, 'Has Henny');
    assert(document.querySelectorAll('#event-log .event-entry').length === 2, '2 events');

    gameState.inventory = {}; renderInventory();
    assert(document.getElementById('inventory-list').textContent.indexOf('Empty') !== -1, 'Empty inv label');
    gameState.animals = []; renderAnimals();
    assert(document.getElementById('animal-list').textContent.indexOf('None yet') !== -1, 'Empty animals label');
    gameState.events = []; renderEvents();
    assert(document.getElementById('event-log').textContent.indexOf('No events yet') !== -1, 'Empty events label');

    // ============================================================
    section('addBubble()');
    const chat = document.getElementById('chat-messages');
    const typ = document.getElementById('typing');
    while (chat.firstChild !== typ) chat.removeChild(chat.firstChild);

    addBubble('narrator', 'Hello narrator');
    assert(chat.querySelector('.bubble.npc') !== null, 'Narrator bubble added (npc class)');
    assert(chat.querySelector('.bubble.npc .bubble-name').textContent === 'Narrator', 'Has speaker name');

    addBubble('player', 'Player hi');
    assert(chat.querySelector('.bubble.player') !== null, 'Player bubble added');

    addBubble('system', 'System note');
    assert(chat.querySelector('.bubble.system .bubble-text').textContent === 'System note', 'System bubble');

    addBubble('shopkeeper', 'Got wares!');
    const shopBubbles = chat.querySelectorAll('.bubble.npc');
    const lastShop = shopBubbles[shopBubbles.length - 1];
    assert(lastShop.querySelector('.bubble-name').textContent === 'Shopkeeper', 'Shopkeeper name');
    assert(lastShop.querySelector('.bubble-avatar').textContent === '🏪', 'Shopkeeper avatar');

    addBubble('fisherman', 'Catch of the day!');
    const fishBubbles = chat.querySelectorAll('.bubble.npc');
    const lastFish = fishBubbles[fishBubbles.length - 1];
    assert(lastFish.querySelector('.bubble-avatar').textContent === '🎣', 'Fisherman avatar');

    addBubble('<img src=x onerror=alert(1)>', 'narrator');
    // Unknown speaker should not crash
    assert(true, 'Unknown speaker handled');

    // XSS check on bubble text
    while (chat.firstChild !== typ) chat.removeChild(chat.firstChild);
    addBubble('narrator', '<img src=x onerror=alert(1)>');
    const nBubbles = chat.querySelectorAll('.bubble.npc');
    assert(nBubbles[nBubbles.length - 1].innerHTML.indexOf('<img') === -1, 'HTML escaped in bubble');

    // ============================================================
    section('addMessage() backwards compat');
    while (chat.firstChild !== typ) chat.removeChild(chat.firstChild);

    addMessage('Hello narrator', 'narrator');
    assert(chat.querySelector('.bubble.npc') !== null, 'addMessage narrator → npc bubble');

    addMessage('Player hi', 'player');
    assert(chat.querySelector('.bubble.player') !== null, 'addMessage player → player bubble');

    addMessage('System note', 'system');
    assert(chat.querySelector('.bubble.system') !== null, 'addMessage system → system bubble');

    // ============================================================
    section('NPC Avatars');
    const expectedAvatars = {
      narrator: '📖', shopkeeper: '🏪', traveler: '🧙', rival: '😤',
      neighbor: '👵', mayor: '🎩', blacksmith: '⚒️', fisherman: '🎣',
      witch: '🧹', child: '👦', merchant: '🐫', guard: '🛡️',
    };
    for (const [name, emoji] of Object.entries(expectedAvatars)) {
      assert(NPC_AVATARS[name] === emoji, `Avatar ${name} = ${emoji}`);
    }

    // ============================================================
    section('Suggestions');
    renderSuggestions(['Till soil', 'Visit shop', 'Go fish']);
    let sb = document.querySelectorAll('#suggestions .suggest-btn');
    assert(sb.length === 3, 'Renders 3 suggestions');
    assert(sb[0].textContent === 'Till soil', 'Sug 1 text');
    assert(sb[1].textContent === 'Visit shop', 'Sug 2 text');
    assert(sb[2].textContent === 'Go fish', 'Sug 3 text');

    clearSuggestions();
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 0, 'Cleared');
    renderSuggestions(null);
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 0, 'Null = empty');
    renderSuggestions([]);
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 0, '[] = empty');

    // ============================================================
    section('Game Start Flow');
    gameState = {};
    conversationHistory = [];
    mockCallCount = 0;
    while (chat.firstChild !== typ) chat.removeChild(chat.firstChild);

    document.getElementById('api-url').value = 'https://mock/api';
    document.getElementById('api-key').value = 'k';
    document.getElementById('model-name').value = 'model';
    document.getElementById('farmer-name').value = 'Alice';

    pushMock({
      messages: [
        { speaker: 'narrator', text: 'Welcome to your farm!' },
        { speaker: 'neighbor', text: 'Hey Alice, I am Martha!' }
      ],
      suggestedActions: ['Clear weeds', 'Check mailbox', 'Explore', 'Talk neighbor'],
      stateChanges: { events: ['Alice arrived'], weather: 'Sunny' }
    });

    document.getElementById('btn-start').click();
    await idle(); await wait(100);

    assert(document.getElementById('setup-screen').classList.contains('hidden'), 'Setup hidden');
    assert(document.getElementById('game-screen').classList.contains('active'), 'Game active');
    assert(gameState.farmerName === 'Alice', 'Name set');
    assert(mockCallCount === 1, '1 LLM call on start');
    assert(lastMockInput.indexOf('Alice') !== -1, 'Start msg has name');

    const nrBubbles = document.querySelectorAll('.bubble.npc');
    assert(nrBubbles.length >= 2, 'At least 2 NPC bubbles from messages array');
    assert(nrBubbles[0].querySelector('.bubble-text').textContent.indexOf('Welcome') !== -1, 'Opening narration');
    assert(nrBubbles[1].querySelector('.bubble-name').textContent === 'Neighbor', 'Martha bubble has Neighbor name');
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 4, '4 suggestions on start');
    assert(gameState.events[0] === 'Alice arrived', 'Event applied');

    // ============================================================
    section('Backwards compat: narrative field');
    pushMock({
      narrative: 'The sun sets slowly.',
      suggestedActions: ['Sleep'],
      stateChanges: null
    });

    document.getElementById('chat-input').value = 'Look around';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    const allNpc = document.querySelectorAll('.bubble.npc');
    assert(allNpc[allNpc.length - 1].querySelector('.bubble-text').textContent.indexOf('sun sets') !== -1, 'Narrative field renders as bubble');

    // ============================================================
    section('Player Action');
    pushMock({
      messages: [{ speaker: 'narrator', text: 'You till three plots!' }],
      suggestedActions: ['Plant wheat', 'Till more', 'Rest'],
      stateChanges: {
        energy: 8,
        grid: gameState.grid.map((c, i) => i < 3 ? { crop: 'tilled', growth: 0, watered: false } : c),
        events: ['Alice arrived', 'Tilled 3 plots']
      }
    });

    document.getElementById('chat-input').value = 'Till front row';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    assert(gameState.energy === 8, 'Energy decreased');
    assert(gameState.grid[0].crop === 'tilled', 'Cell 0 tilled');
    assert(gameState.grid[1].crop === 'tilled', 'Cell 1 tilled');
    assert(gameState.grid[2].crop === 'tilled', 'Cell 2 tilled');
    assert(gameState.grid[3].crop === 'empty', 'Cell 3 empty');
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 3, '3 suggestions');

    const pBubbles = document.querySelectorAll('.bubble.player');
    assert(pBubbles[pBubbles.length - 1].querySelector('.bubble-text').textContent.indexOf('Till front row') !== -1, 'Player msg shown');

    // ============================================================
    section('Suggestion Click');
    pushMock({
      messages: [{ speaker: 'narrator', text: 'Wheat planted!' }],
      suggestedActions: ['Water wheat', 'Buy seeds', 'Sleep'],
      stateChanges: {
        energy: 6,
        grid: gameState.grid.map((c, i) => i < 3 ? { crop: 'wheat', growth: 0, watered: false } : c)
      }
    });

    document.querySelectorAll('#suggestions .suggest-btn')[0].click();
    await idle(); await wait(100);

    assert(lastMockInput === 'Plant wheat', 'Sug text sent');
    assert(gameState.grid[0].crop === 'wheat', 'Grid updated');
    assert(gameState.energy === 6, 'Energy updated');
    assert(document.querySelectorAll('#suggestions .suggest-btn')[0].textContent === 'Water wheat', 'New suggestions');

    // ============================================================
    section('Multi-speaker messages');
    pushMock({
      messages: [
        { speaker: 'narrator', text: 'You enter the shop.' },
        { speaker: 'shopkeeper', text: 'Welcome! Browse my wares.' },
        { speaker: 'narrator', text: 'Shelves are stocked.' }
      ],
      suggestedActions: ['Buy seeds', 'Leave'],
      stateChanges: null
    });

    document.getElementById('chat-input').value = 'Visit shop';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    const afterShop = document.querySelectorAll('.bubble.npc');
    // Should have at least 3 new NPC bubbles from the messages
    assert(afterShop.length >= 3, 'Multiple NPC bubbles from multi-speaker response');

    // ============================================================
    section('Error Handling');
    // No mock = error
    document.getElementById('chat-input').value = 'Error test';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    const sAll = document.querySelectorAll('.bubble.system');
    assert(sAll[sAll.length - 1].querySelector('.bubble-text').textContent.indexOf('Something went wrong') !== -1, 'Error shown');
    assert(sending === false, 'sending reset');
    assert(!document.getElementById('btn-send').disabled, 'Send enabled');
    assert(!document.getElementById('chat-input').disabled, 'Input enabled');

    // ============================================================
    section('Typing Indicator');
    assert(!document.getElementById('typing').classList.contains('visible'), 'Hidden when idle');
    setTyping(true);
    assert(document.getElementById('typing').classList.contains('visible'), 'Shown on true');
    setTyping(false);
    assert(!document.getElementById('typing').classList.contains('visible'), 'Hidden on false');

    // ============================================================
    section('Conversation History');
    assert(conversationHistory.length > 0, 'History exists');
    assert(conversationHistory.filter(m => m.role === 'user').length >= 3, '>=3 user msgs');
    assert(conversationHistory.filter(m => m.role === 'assistant').length >= 3, '>=3 asst msgs');

    // ============================================================
    section('System Prompt');
    const pr = buildSystemPrompt();
    assert(pr.indexOf('LLM Farm') !== -1, 'Has game name');
    assert(pr.indexOf('suggestedActions') !== -1, 'Has suggestedActions');
    assert(pr.indexOf('messages') !== -1, 'Has messages format');
    assert(pr.indexOf('Alice') !== -1, 'Has farmer name');
    assert(pr.indexOf('20 words') !== -1 || pr.indexOf('20') !== -1, 'Has word limit reference');

    // ============================================================
    section('Concurrency');
    pushMock({ messages: [{ speaker: 'narrator', text: 'Water.' }], suggestedActions: ['Next'], stateChanges: { energy: 5 } });
    sending = false;
    const cb = mockCallCount;
    document.getElementById('chat-input').value = 'Water';
    document.getElementById('btn-send').click();
    document.getElementById('chat-input').value = 'Also';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);
    assert(mockCallCount === cb + 1, 'Dup sends blocked');

    // ============================================================
    section('Complex State');
    pushMock({
      messages: [
        { speaker: 'narrator', text: 'A merchant arrives!' },
        { speaker: 'merchant', text: 'Fine chicken for sale!' }
      ],
      suggestedActions: ['Name chicken', 'Plant'],
      stateChanges: {
        gold: 30, energy: 4,
        inventory: { 'carrot seeds': 5, 'pumpkin seeds': 3 },
        animals: [{ type: 'chicken', name: 'Nugget', happiness: 50, daysOwned: 0 }],
        relationships: { Marco: { friendship: 15, met: true } },
        events: ['Merchant', 'Chicken'], reputation: 5,
        flags: { metMerchant: true }
      }
    });
    document.getElementById('chat-input').value = 'Buy chicken';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    assert(gameState.gold === 30, 'Gold down');
    assert(gameState.animals[0].name === 'Nugget', 'Chicken added');
    assert(gameState.inventory['carrot seeds'] === 5, 'Seeds added');
    assert(gameState.relationships.Marco.friendship === 15, 'Rel set');
    assert(gameState.reputation === 5, 'Rep up');
    assert(gameState.flags.metMerchant === true, 'Flag set');
    assert(document.getElementById('stat-gold').textContent === '30', 'Gold UI');
    assert(document.getElementById('animal-list').textContent.indexOf('Nugget') !== -1, 'Animal UI');

    // Verify merchant bubble avatar
    const merchantBubbles = document.querySelectorAll('.bubble.npc');
    let foundMerchant = false;
    for (const b of merchantBubbles) {
      const name = b.querySelector('.bubble-name');
      if (name && name.textContent === 'Merchant') {
        assert(b.querySelector('.bubble-avatar').textContent === '🐫', 'Merchant avatar correct');
        foundMerchant = true;
        break;
      }
    }
    assert(foundMerchant, 'Found merchant bubble');

    // ============================================================
    section('Season Progression');
    pushMock({
      messages: [{ speaker: 'narrator', text: 'Summer arrives!' }],
      suggestedActions: ['Crops', 'Beach'],
      stateChanges: { day: 8, season: 'Summer', weather: 'Heatwave', energy: 10 }
    });
    document.getElementById('chat-input').value = 'Sleep';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);

    assert(gameState.day === 8, 'Day 8');
    assert(gameState.season === 'Summer', 'Summer');
    assert(gameState.weather === 'Heatwave', 'Heatwave');
    assert(gameState.energy === 10, 'Energy restored');

    // ============================================================
    section('Input Behavior');
    pushMock({ messages: [{ speaker: 'narrator', text: 'Look.' }], suggestedActions: ['Rest'], stateChanges: null });
    document.getElementById('chat-input').value = 'Look';
    document.getElementById('btn-send').click();
    assert(document.getElementById('chat-input').value === '', 'Input cleared after send');
    await idle(); await wait(100);

    const pc = mockCallCount;
    document.getElementById('chat-input').value = '';
    document.getElementById('btn-send').click();
    assert(mockCallCount === pc, 'Empty blocked');
    document.getElementById('chat-input').value = '   ';
    document.getElementById('btn-send').click();
    assert(mockCallCount === pc, 'Whitespace blocked');

    // ============================================================
    section('No suggestedActions');
    pushMock({ messages: [{ speaker: 'narrator', text: 'Nothing.' }], stateChanges: null });
    document.getElementById('chat-input').value = 'Test';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 0, 'No buttons');
    assert(sending === false, 'Still works');

    // ============================================================
    section('Null stateChanges');
    const gBefore = gameState.gold;
    pushMock({ messages: [{ speaker: 'narrator', text: 'Chat.' }], suggestedActions: ['Ok'], stateChanges: null });
    document.getElementById('chat-input').value = 'Chat';
    document.getElementById('btn-send').click();
    await idle(); await wait(100);
    assert(gameState.gold === gBefore, 'Gold unchanged');
    assert(document.querySelectorAll('#suggestions .suggest-btn').length === 1, 'Sug still works');

    return { log, passed, failed };
  });

  // Print results
  for (const { s, t } of results.log) {
    if (s === 'pass') console.log(`\x1b[32m${t}\x1b[0m`);
    else if (s === 'fail') console.log(`\x1b[31m${t}\x1b[0m`);
    else if (s === 'section') console.log(`\x1b[36m${t}\x1b[0m`);
    else console.log(t);
  }

  let totalPassed = results.passed;
  let totalFailed = results.failed;

  console.log(`\n\x1b[36m--- Unit tests: ${results.passed} passed, ${results.failed} failed ---\x1b[0m\n`);

  // ============================================================
  // MOBILE / RESPONSIVE VIEWPORT TESTS
  // ============================================================
  console.log(`\x1b[36m=== Mobile & Responsive Tests ===\x1b[0m`);

  const viewports = [
    { name: 'iPhone SE (375x667)', w: 375, h: 667 },
    { name: 'iPhone 14 (393x852)', w: 393, h: 852 },
    { name: 'iPad Mini (768x1024)', w: 768, h: 1024 },
    { name: 'Desktop (1280x800)', w: 1280, h: 800 },
  ];

  for (const vp of viewports) {
    console.log(`\x1b[36m\n> ${vp.name}\x1b[0m`);

    const mPage = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await mPage.goto(`http://localhost:${port}/index.html`);

    const mobileResults = await mPage.evaluate(async (vpWidth) => {
      const log = [];
      let passed = 0, failed = 0;
      function assert(cond, label) {
        if (cond) { passed++; log.push({ s: 'pass', t: '  OK: ' + label }); }
        else { failed++; log.push({ s: 'fail', t: '  FAIL: ' + label }); }
      }

      window.sendToLLM = async (msg) => {
        conversationHistory.push({ role: 'user', content: msg });
        const r = {
          messages: [
            { speaker: 'narrator', text: 'Welcome to your farm!' },
            { speaker: 'shopkeeper', text: 'Come check my wares!' }
          ],
          suggestedActions: ['Clear weeds', 'Check mailbox', 'Explore farmhouse', 'Visit shop', 'Go fishing'],
          stateChanges: {
            events: ['Arrived at farm'],
            inventory: { 'wheat seeds': 5, 'carrot seeds': 3 },
            animals: [{ type: 'chicken', name: 'Clucky', happiness: 80, daysOwned: 2 }],
            grid: Array.from({length: 25}, (_, i) =>
              i < 3 ? { crop: 'wheat', growth: 75, watered: true } :
              i < 5 ? { crop: 'tilled', growth: 0, watered: false } :
              { crop: 'empty', growth: 0, watered: false }
            )
          }
        };
        conversationHistory.push({ role: 'assistant', content: JSON.stringify(r) });
        return r;
      };

      // Setup screen check
      const setupBox = document.querySelector('.setup-box');
      const setupRect = setupBox.getBoundingClientRect();
      assert(setupRect.right <= vpWidth + 2, 'Setup box fits within viewport width');
      assert(setupRect.left >= -2, 'Setup box not clipped on left');

      // Start game
      document.getElementById('api-url').value = 'https://mock/api';
      document.getElementById('api-key').value = 'k';
      document.getElementById('model-name').value = 'm';
      document.getElementById('farmer-name').value = 'Test';
      document.getElementById('btn-start').click();

      await new Promise(resolve => {
        (function check() { if (!window.sending) resolve(); else setTimeout(check, 20); })();
      });
      await new Promise(r => setTimeout(r, 200));

      const isMobile = vpWidth <= 800;

      // HUD stats: all visible (not clipped)
      const stats = document.querySelectorAll('.hud-stat');
      let allStatsVisible = true;
      stats.forEach(stat => {
        const r = stat.getBoundingClientRect();
        if (r.right > vpWidth + 5 || r.left < -5) allStatsVisible = false;
      });
      assert(allStatsVisible, 'All HUD stats visible within viewport');

      // Farm grid visible and contained
      const grid = document.getElementById('farm-grid');
      const gridRect = grid.getBoundingClientRect();
      assert(gridRect.right <= vpWidth + 2, 'Farm grid fits within viewport');
      assert(gridRect.width > 50, 'Farm grid has reasonable width');

      // Farm cells rendered
      const cells = document.querySelectorAll('.farm-cell');
      assert(cells.length === 25, 'All 25 farm cells rendered');

      // Bubble area visible
      const chatMsgs = document.getElementById('chat-messages');
      const chatRect = chatMsgs.getBoundingClientRect();
      assert(chatRect.height > 0, 'Bubble area has height');

      // NPC bubbles exist
      const npcBubbles = document.querySelectorAll('.bubble.npc');
      assert(npcBubbles.length > 0, 'NPC bubble exists');

      // Suggestions visible
      const sugBtns = document.querySelectorAll('#suggestions .suggest-btn');
      assert(sugBtns.length > 0, 'Suggestion buttons rendered');
      let allSugsVisible = true;
      sugBtns.forEach(btn => {
        const r = btn.getBoundingClientRect();
        if (r.right > vpWidth + 5) allSugsVisible = false;
      });
      assert(allSugsVisible, 'Suggestion buttons fit within viewport');

      // Chat input visible and usable
      const input = document.getElementById('chat-input');
      const inputRect = input.getBoundingClientRect();
      assert(inputRect.width > 50, 'Chat input has reasonable width');
      assert(inputRect.right <= vpWidth + 2, 'Chat input fits within viewport');

      // Send button visible
      const sendBtn = document.getElementById('btn-send');
      const sendRect = sendBtn.getBoundingClientRect();
      assert(sendRect.right <= vpWidth + 2, 'Send button fits within viewport');

      // Mobile-specific: farm toggle visible
      if (isMobile) {
        const toggle = document.getElementById('farm-toggle');
        const toggleStyle = window.getComputedStyle(toggle);
        assert(toggleStyle.display !== 'none', 'Farm toggle visible on mobile');

        // Inventory/Animals/Events hidden by default
        const sections = document.querySelectorAll('.farm-side .panel-section');
        if (sections.length > 1) {
          const invSection = sections[1];
          const invStyle = window.getComputedStyle(invSection);
          assert(invStyle.display === 'none', 'Inventory hidden by default on mobile');
        }

        // Click toggle to expand
        toggle.click();
        await new Promise(r => setTimeout(r, 50));
        const sectionsAfter = document.querySelectorAll('.farm-side .panel-section');
        if (sectionsAfter.length > 1) {
          const invStyleAfter = window.getComputedStyle(sectionsAfter[1]);
          assert(invStyleAfter.display !== 'none', 'Inventory shown after toggle click');
        }

        // Click toggle to collapse
        toggle.click();
        await new Promise(r => setTimeout(r, 50));
        const sectionsCol = document.querySelectorAll('.farm-side .panel-section');
        if (sectionsCol.length > 1) {
          const invStyleCol = window.getComputedStyle(sectionsCol[1]);
          assert(invStyleCol.display === 'none', 'Inventory hidden after second toggle');
        }
      }

      // Desktop-specific: farm toggle hidden, all sections visible
      if (!isMobile) {
        const toggle = document.getElementById('farm-toggle');
        const toggleStyle = window.getComputedStyle(toggle);
        assert(toggleStyle.display === 'none', 'Farm toggle hidden on desktop');

        // All panel sections visible
        const sections = document.querySelectorAll('.farm-side .panel-section');
        let allVisible = true;
        sections.forEach(s => {
          if (window.getComputedStyle(s).display === 'none') allVisible = false;
        });
        assert(allVisible, 'All panel sections visible on desktop');

        // Side-by-side layout
        const farmSide = document.querySelector('.farm-side');
        const gameArea = document.querySelector('.game-area');
        const farmRect = farmSide.getBoundingClientRect();
        const gameRect = gameArea.getBoundingClientRect();
        assert(farmRect.right <= gameRect.left + 5, 'Farm and game areas side-by-side');
      }

      // No horizontal scroll
      assert(document.body.scrollWidth <= vpWidth + 5, 'No horizontal scrollbar');

      return { log, passed, failed };
    }, vp.w);

    for (const { s, t } of mobileResults.log) {
      if (s === 'pass') console.log(`\x1b[32m${t}\x1b[0m`);
      else console.log(`\x1b[31m${t}\x1b[0m`);
    }
    totalPassed += mobileResults.passed;
    totalFailed += mobileResults.failed;
    await mPage.close();
  }

  console.log('');
  const total = totalPassed + totalFailed;
  if (totalFailed === 0) {
    console.log(`\x1b[32m${total} tests: ${totalPassed} passed, 0 failed\x1b[0m`);
  } else {
    console.log(`\x1b[31m${total} tests: ${totalPassed} passed, ${totalFailed} failed\x1b[0m`);
  }

  await browser.close();
  server.close();
  process.exit(totalFailed === 0 ? 0 : 1);
});
