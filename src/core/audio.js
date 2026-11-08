/* ============================================================
 * audio.js — 程序化音频（WebAudio 合成，零音频文件）
 * 深空电子配乐、分层 Boss 战鼓与游戏音效。
 * 首次用户交互后解锁 AudioContext。
 * ============================================================ */
(function () {
  'use strict';
  const SF = (window.SF = window.SF || {});

  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let unlocked = false;
  let muted = false;

  let seqTimer = null;      // BGM 音序器定时器
  let seqStep = 0;
  let currentTrack = null;
  let musicSession = null;
  let nextStepTime = 0;
  let bossFinal = false;
  let bossPhase = 0;
  let phaseAccent = false;
  const MUSIC_LEVEL = 0.55;
  const noiseBuffers = new Map();

  function ensureCtx() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.14;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = MUSIC_LEVEL;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.9;
      sfxGain.connect(master);
      return true;
    } catch (e) {
      console.warn('[audio] unavailable', e);
      return false;
    }
  }

  // 在首次用户手势时调用
  function unlock() {
    if (!ensureCtx()) return;
    if (unlocked && ctx.state === 'running') return;
    const ready = () => {
      // 浏览器拒绝自动播放时保留重试机会；不能提前标记为已解锁。
      if (ctx.state !== 'running') return;
      unlocked = true;
      if (currentTrack && !seqTimer) playMusic(currentTrack, { final: bossFinal, phase: bossPhase });
    };
    if (ctx.state === 'running') ready();
    else ctx.resume().then(ready).catch(() => {});
  }

  function finishVoice(source, nodes, destination, room) {
    const session = musicSession && destination === musicSession.input ? musicSession : null;
    const output = nodes[nodes.length - 1];
    output.connect(destination || sfxGain);
    if (room && session) output.connect(session.space);
    if (session) session.voices.add(source);
    source.onended = () => {
      nodes.forEach(node => node.disconnect());
      if (session) {
        session.voices.delete(source);
        if (session.stopped && session.voices.size === 0) session.nodes.forEach(node => node.disconnect());
      }
    };
  }

  // ---------- 合成基元 ----------
  // 单音：type 波形 / freq 频率 / dur 时长 / vol 音量 / slide 频率滑动终点
  function tone({ type = 'square', freq = 440, dur = 0.1, vol = 0.2, slide = null,
    attack = 0.002, hold = 0, dest = null, when = 0, at = null, cutoff = 0, detune = 0, pan = 0, room = false }) {
    if (!unlocked || muted) return;
    const t0 = at === null ? ctx.currentTime + when : Math.max(ctx.currentTime, at);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const nodes = [osc];
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    if (hold > attack) g.gain.setValueAtTime(vol, t0 + Math.min(hold, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.6;
      osc.connect(filter); filter.connect(g); nodes.push(filter);
    } else osc.connect(g);
    nodes.push(g);
    if (pan) {
      const panner = ctx.createStereoPanner(); panner.pan.value = pan;
      g.connect(panner); nodes.push(panner);
    }
    finishVoice(osc, nodes, dest, room);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // 噪声爆裂（爆炸/受击）
  function noise({ dur = 0.2, vol = 0.25, freq = 1000, q = 1, when = 0,
    at = null, dest = null, filter = 'bandpass', slide = null, room = false }) {
    if (!unlocked || muted) return;
    const t0 = at === null ? ctx.currentTime + when : Math.max(ctx.currentTime, at);
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    let buf = noiseBuffers.get(len);
    if (!buf) {
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      if (noiseBuffers.size >= 32) noiseBuffers.clear();
      noiseBuffers.set(len, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(freq, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, slide === null ? freq * 0.25 : slide), t0 + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g);
    finishVoice(src, [src, flt, g], dest, room);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ---------- 音效库 ----------
  const sfx = {
    shootBlade()      { tone({ type: 'triangle', freq: 880, slide: 660, dur: 0.06, vol: 0.06 }); },
    shootBolt() {
      noise({ dur: 0.055, vol: 0.18, freq: 6200, slide: 2400, q: 1.4 });
      tone({ type: 'sawtooth', freq: 1400, slide: 180, dur: 0.14, vol: 0.12, cutoff: 3200 });
      tone({ type: 'sine', freq: 110, slide: 42, dur: 0.2, vol: 0.14 });
    },
    shootOrb()        { tone({ type: 'sine', freq: 300, slide: 520, dur: 0.12, vol: 0.09 }); },
    heatReady() {
      tone({ type: 'triangle', freq: 440, slide: 880, dur: 0.16, vol: 0.09 });
      tone({ type: 'sine', freq: 1320, dur: 0.09, vol: 0.06, when: 0.07 });
    },
    fireOverdrive() {
      noise({ dur: 0.22, vol: 0.22, freq: 1600, slide: 260, q: 0.7 });
      tone({ type: 'triangle', freq: 190, slide: 65, dur: 0.2, vol: 0.15 });
    },
    capacitorReady() {
      [660, 990, 1320].forEach((freq, i) => tone({ type: 'sine', freq, dur: 0.13, vol: 0.10, when: i * 0.055 }));
    },
    railBurst() {
      tone({ type: 'sawtooth', freq: 1500, slide: 160, dur: 0.17, vol: 0.16, cutoff: 3200 });
      tone({ type: 'sine', freq: 95, slide: 32, dur: 0.38, vol: 0.3 });
      noise({ dur: 0.26, vol: 0.22, freq: 2400, slide: 380, q: 0.7 });
    },
    iceRetaliate() {
      // 防反首击：冰层断裂的瞬态、错开的碎晶脆响、低频冲击和短冰屑尾音。
      // 此音效只由冰域的有效首击调用，后续冰蚀脉冲不重复播放。
      noise({ dur: 0.045, vol: 0.62, freq: 4800, q: 0.65, slide: 2100 });
      tone({ type: 'sine', freq: 170, slide: 48, dur: 0.24, vol: 0.32 });
      [0.013, 0.039, 0.075].forEach((when, i) => {
        noise({ dur: 0.045 + i * 0.018, vol: 0.3 - i * 0.055, freq: 6200 - i * 950, q: 1.8, when });
        tone({ type: 'sine', freq: 2840 - i * 610, slide: 1790 - i * 300,
          dur: 0.12 + i * 0.045, vol: 0.13 - i * 0.025, when, pan: i % 2 ? 0.2 : -0.2 });
      });
      noise({ dur: 0.34, vol: 0.11, freq: 3400, q: 1.1, when: 0.045, slide: 1200 });
      if (unlocked && !muted) {
        const t = ctx.currentTime;
        musicGain.gain.cancelScheduledValues(t);
        musicGain.gain.setValueAtTime(musicGain.gain.value, t);
        musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL * 0.46, t + 0.008);
        musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + 0.34);
      }
    },
    shootMissile()    { tone({ type: 'sawtooth', freq: 220, slide: 90, dur: 0.18, vol: 0.10 }); },
    // 超电磁炮命中：高频电弧下滑 + 金属噪声脆响 + 低频冲击，穿透大量敌人时每次 update 只播一次
    railHit()         { tone({ type: 'square', freq: 1400, slide: 180, dur: 0.12, vol: 0.14 }); noise({ dur: 0.15, vol: 0.18, freq: 2400, q: 0.8 }); tone({ type: 'sine', freq: 160, slide: 50, dur: 0.12, vol: 0.15 }); },
    laserStart(superBeam = false) {
      noise({ dur: 0.045, vol: superBeam ? 0.11 : 0.085, freq: 5400, slide: 2100, q: 1.2 });
      tone({ type: 'sawtooth', freq: superBeam ? 260 : 390, slide: 160, dur: 0.24,
        vol: superBeam ? 0.065 : 0.055, cutoff: 1700 });
    },
    enemyDie()        { noise({ dur: 0.12, vol: 0.12, freq: 1800 }); },
    explosion()       { noise({ dur: 0.35, vol: 0.3, freq: 900, q: 0.7 }); tone({ type: 'sine', freq: 110, slide: 40, dur: 0.3, vol: 0.25 }); },
    playerHurt()      { tone({ type: 'sawtooth', freq: 200, slide: 80, dur: 0.2, vol: 0.25 }); noise({ dur: 0.15, vol: 0.15, freq: 600 }); },
    pickup()          { tone({ type: 'sine', freq: 760, slide: 980, dur: 0.07, vol: 0.08 }); },
    levelup()         { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.09, vol: 0.12, when: i * 0.07 })); },
    chest()           { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.12, vol: 0.12, when: i * 0.06 })); },
    evolve()          { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.1, vol: 0.13, when: i * 0.08 })); },
    select()          { tone({ type: 'square', freq: 700, dur: 0.04, vol: 0.09 }); },
    confirm()         { tone({ type: 'square', freq: 900, slide: 1300, dur: 0.08, vol: 0.11 }); },
    cancel()          { tone({ type: 'square', freq: 500, slide: 300, dur: 0.08, vol: 0.09 }); },
    bossWarn()        { [0, 0.25, 0.5].forEach(w => tone({ type: 'sawtooth', freq: 160, slide: 120, dur: 0.22, vol: 0.2, when: w })); },
    victory()         { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.14, vol: 0.13, when: i * 0.11 })); },
    defeat()          { [440, 349, 294, 220].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.14, when: i * 0.18 })); },
    uiTick()          { tone({ type: 'square', freq: 1100, dur: 0.03, vol: 0.05 }); },
  };

  // ---------- BGM 音序器 ----------
  // 音符记谱: [半音偏移|null, 时值step]，null = 休止
  // 主音阶 A 小调五声，太空感
  const N = semis => 220 * Math.pow(2, semis / 12); // 以 A3 为基

  const TRACKS = {
    menu: {
      bpm: 92, steps: 32,
      bass: [[0,2],[0,2],[7,2],[0,2],[3,2],[3,2],[10,2],[7,2],[0,2],[0,2],[7,2],[0,2],[5,2],[5,2],[3,2],[7,2]],
      lead: [[12,3],[null,1],[15,2],[14,2],[12,4],[null,4],[10,2],[12,2],[14,4],[null,4],[15,3],[null,1],[14,2],[12,2],[10,4],[null,4]],
    },
    battle: {
      bpm: 132, steps: 32,
      bass: [[0,1],[0,1],[0,1],[7,1],[0,1],[0,1],[10,1],[7,1],[3,1],[3,1],[3,1],[10,1],[3,1],[3,1],[7,1],[5,1],
             [0,1],[0,1],[0,1],[7,1],[0,1],[0,1],[10,1],[7,1],[5,1],[5,1],[5,1],[12,1],[7,1],[7,1],[10,1],[10,1]],
      lead: [[12,2],[15,2],[19,2],[15,2],[12,2],[15,2],[22,2],[19,2],[17,2],[15,2],[14,2],[15,2],[12,4],[null,4],
             [12,2],[15,2],[19,2],[22,2],[24,2],[22,2],[19,2],[15,2],[17,2],[19,2],[17,2],[15,2],[14,2],[12,4],[null,2]],
    },
    boss: {
      bpm: 104, steps: 128,
      // 八小节低音动机：半音下压与小二度张力，避免明亮高音主旋律。
      roots: [0, 0, 1, 1, -5, -5, -2, 0],
    },
  };

  function createMusicSession() {
    const input = ctx.createGain(), space = ctx.createGain();
    const delay = ctx.createDelay(1), filter = ctx.createBiquadFilter(), feedback = ctx.createGain();
    input.gain.setValueAtTime(0, ctx.currentTime);
    input.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.055);
    input.connect(musicGain);
    space.gain.value = 0.2; delay.delayTime.value = 0.31;
    filter.type = 'lowpass'; filter.frequency.value = 1150;
    feedback.gain.value = 0.22;
    space.connect(delay); delay.connect(filter); filter.connect(input);
    filter.connect(feedback); feedback.connect(delay);
    return { input, space, voices: new Set(), stopped: false, nodes: [input, space, delay, filter, feedback] };
  }

  function compileChannels(track) {
    // 每个声部按自己的完整长度循环，长旋律不再截断低音声部的后半段。
    return ['bass', 'lead'].map(ch => {
      const events = new Map();
      let pos = 0;
      for (const [semi, len] of track[ch]) {
        if (semi !== null) events.set(pos, { semi, len });
        pos += len;
      }
      return { ch, steps: pos, events };
    });
  }

  function scheduleStandard(channels, step, at, stepDur) {
    const dest = musicSession.input;
    for (const channel of channels) {
      const ev = channel.events.get(step % channel.steps);
      if (!ev) continue;
      const bass = channel.ch === 'bass';
      tone({ dest, at, type: bass ? 'triangle' : 'square', freq: N(ev.semi) / (bass ? 2 : 1),
        dur: ev.len * stepDur * 0.9, vol: bass ? 0.16 : 0.065, attack: 0.005,
        cutoff: bass ? 900 : 2200, room: !bass });
    }
    if (step % 8 === 0) tone({ dest, at, type: 'sine', freq: 110, slide: 48, dur: 0.12, vol: 0.23 });
  }

  function scheduleBoss(step, at, stepDur) {
    const dest = musicSession.input;
    const beat = step % 16, bar = Math.floor(step / 16) % 8;
    const root = 55 * Math.pow(2, TRACKS.boss.roots[bar] / 12);
    const pressure = bossFinal ? (bossPhase > 0 ? 2 : 1) : bossPhase * 0.5;
    const note = options => tone({ dest, at, ...options });
    const hit = options => noise({ dest, at, ...options });

    if (beat === 0) {
      // 持续低音、失谐弦层、远处机械共振；整个乐句都有底层支撑。
      note({ type: 'sine', freq: root, dur: stepDur * 17, hold: stepDur * 9, vol: 0.2, attack: 0.045 });
      for (const [semi, pan] of [[0, -0.35], [3, 0.35], [7, 0]]) {
        note({ type: 'sawtooth', freq: root * 2 * Math.pow(2, semi / 12), detune: pan * 18,
          dur: stepDur * 18, hold: stepDur * 7, attack: 0.18, vol: 0.032,
          cutoff: 580 + pressure * 150, pan, room: true });
      }
      if (bar % 2 === 0) hit({ dur: 0.8, vol: 0.16, freq: 360, q: 1.3, slide: 100, room: true });
    }
    if ([0, 3, 6, 8, 10, 14].includes(beat) || (pressure >= 1 && beat === 12)) {
      const accent = beat === 0 || beat === 8;
      note({ type: 'sawtooth', freq: root * 2, dur: stepDur * (accent ? 1.6 : 0.9),
        vol: accent ? 0.19 : 0.12, cutoff: accent ? 680 : 360, detune: -5 });
      note({ type: 'sine', freq: root, dur: stepDur * 1.3, vol: accent ? 0.2 : 0.1 });
    }
    // 重鼓的低频下坠与噪声鼓皮分开合成，保留敌人预警的中高频空间。
    if ([0, 8, 11].includes(beat) || (pressure >= 1 && beat === 14) || (pressure >= 2 && beat === 6)) {
      note({ type: 'sine', freq: 142, slide: 37, dur: 0.28, vol: 0.58 });
      hit({ dur: 0.035, freq: 1600, slide: 450, vol: 0.16, q: 0.6 });
    }
    if (beat === 4 || beat === 12) {
      note({ type: 'triangle', freq: 183, slide: 68, dur: 0.27, vol: 0.21 });
      hit({ dur: 0.19, freq: 1450, slide: 620, vol: 0.24, q: 0.7, room: true });
    }
    if (beat % (pressure >= 2 ? 2 : 4) === 2 || (pressure >= 2 && beat % 4 === 0)) {
      hit({ dur: 0.038, freq: 7200, slide: 5200, filter: 'highpass', vol: 0.044 + pressure * 0.008 });
    }
    if (beat === 0 && bar % 2 === 0 || beat === 10 && bar % 2 === 1) {
      const semi = bar === 6 ? 6 : bar % 2 ? 1 : 0;
      for (const detune of [-9, 9]) note({ type: 'sawtooth', freq: root * 4 * Math.pow(2, semi / 12),
        detune, dur: stepDur * 5, hold: stepDur * 1.3, attack: 0.035,
        cutoff: 760, vol: 0.055, pan: detune / 40, room: true });
    }
    if (pressure >= 2 && [3, 7, 11, 15].includes(beat)) {
      note({ type: 'triangle', freq: root * (beat === 15 ? 4.24 : 4), dur: stepDur * 0.65,
        vol: 0.085, cutoff: 950, pan: beat % 8 === 3 ? -0.3 : 0.3, room: true });
    }
    if ((bar === 7 && beat >= 13) || phaseAccent) {
      const transition = phaseAccent;
      hit({ dur: transition ? 1.1 : 0.1, freq: transition ? 680 : 2400, q: 1.1,
        vol: transition ? 0.24 : 0.1, room: true });
      if (transition) note({ type: 'sine', freq: 92, slide: 30, dur: 0.9, vol: 0.34 });
      phaseAccent = false;
    }
  }

  function playMusic(name, { final = false, phase = 0 } = {}) {
    stopMusic(true);
    currentTrack = TRACKS[name] ? name : null;
    bossFinal = final; bossPhase = phase; phaseAccent = false;
    if (!currentTrack || !unlocked || !ensureCtx()) return;
    const track = TRACKS[name], channels = name === 'boss' ? null : compileChannels(track);
    const stepDur = 60 / (track.bpm + (name === 'boss' && final ? 8 : 0)) / 4;
    musicSession = createMusicSession();
    seqStep = 0; nextStepTime = ctx.currentTime + 0.035;
    const schedule = () => {
      const now = ctx.currentTime;
      if (muted || document.hidden || ctx.state !== 'running') { nextStepTime = now + 0.035; return; }
      // 用音频时钟提前排 120ms；卡帧/切页回来不追赶堆积的鼓点。
      if (nextStepTime < now - 0.04) nextStepTime = now + 0.025;
      while (nextStepTime < now + 0.12) {
        if (name === 'boss') scheduleBoss(seqStep % track.steps, nextStepTime, stepDur);
        else scheduleStandard(channels, seqStep, nextStepTime, stepDur);
        seqStep++; nextStepTime += stepDur;
      }
    };
    seqTimer = setInterval(schedule, 25);
    schedule();
  }

  function setBossPhase(phase) {
    if (currentTrack !== 'boss' || phase === bossPhase) return;
    phaseAccent = phase > bossPhase;
    bossPhase = phase;
  }

  function stopMusic(keepCurrent = false) {
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
    if (musicSession) {
      const old = musicSession, t = ctx.currentTime;
      musicSession = null; old.stopped = true;
      old.input.gain.cancelScheduledValues(t);
      old.input.gain.setValueAtTime(old.input.gain.value, t);
      old.input.gain.linearRampToValueAtTime(0, t + 0.045);
      // 同时取消已排程但尚未开始的音符，防止结算后留下旧 Boss 低音。
      for (const source of old.voices) source.stop(t + 0.055);
      if (old.voices.size === 0) old.nodes.forEach(node => node.disconnect());
    }
    if (!keepCurrent) currentTrack = null;
  }

  function setMuted(m) {
    muted = m;
    if (master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(m ? 0 : 0.5, t, 0.008);
    }
  }

  SF.audio = {
    unlock, sfx, playMusic, stopMusic, setMuted, setBossPhase,
    get muted() { return muted; },
    get track() { return currentTrack; },
    get bossPhase() { return bossPhase; },
  };
})();
