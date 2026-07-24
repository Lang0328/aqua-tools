/* ============================================================
   Aqua 工具站 · 爆款趣味工具
   1) 朋友圈/小红书文案生成器  2) 抽奖助手(转盘/骰子/抽签)
   3) 真心话大冒险 / 群友匹配度  4) 简历 / 名片一键生成
   纯前端实现，无后端依赖。自带 $ / $$ / notify 辅助函数。
   ============================================================ */
(function () {
    'use strict';
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

    /* ---------- 通用辅助 ---------- */
    function notify(msg) {
        let el = $('#toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:10px;z-index:9999;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.3)';
            document.body.appendChild(el);
        }
        const tip = document.createElement('div');
        tip.textContent = msg;
        tip.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:10px;z-index:9999;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .25s';
        document.body.appendChild(tip);
        requestAnimationFrame(() => { tip.style.opacity = '1'; });
        setTimeout(() => { tip.style.opacity = '0'; setTimeout(() => tip.remove(), 300); }, 1800);
    }

    async function copyText(t) {
        try {
            await navigator.clipboard.writeText(t);
            notify('已复制到剪贴板');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = t; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); notify('已复制到剪贴板'); }
            catch (_) { notify('复制失败，请手动复制'); }
            ta.remove();
        }
    }

    function downloadCanvas(c, name) {
        const a = document.createElement('a');
        a.download = name;
        a.href = c.toDataURL('image/png');
        a.click();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const chars = String(text).split('');
        let line = '', yy = y;
        for (const ch of chars) {
            const test = line + ch;
            if (ctx.measureText(test).width > maxWidth && line) {
                ctx.fillText(line, x, yy);
                line = ch; yy += lineHeight;
            } else { line = test; }
        }
        if (line) ctx.fillText(line, x, yy);
        return yy;
    }

    // 颜色加深/提亮 percent: -100~100
    function shade(hex, percent) {
        const m = hex.replace('#', '');
        const num = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        const t = percent < 0 ? 0 : 255, p = Math.abs(percent) / 100;
        r = Math.round((t - r) * p + r);
        g = Math.round((t - g) * p + g);
        b = Math.round((t - b) * p + b);
        return `rgb(${r},${g},${b})`;
    }

    const FUN_GRAD = ['#ff375f', '#ff9500']; // 文案/匹配分享卡渐变

    /* ============================================================
       1. 文案生成器
       ============================================================ */
    const cwRoot = $('#tool-copywriter');
    if (cwRoot) {
        const SCENARIOS = {
            love: {
                name: '表白', emoji: ['💗', '🌹', '✨', '💕'],
                lines: [
                    '其实我早就想对你说，遇见你之后，连发呆都变得有意思了。',
                    '今天的月亮没你好看，因为你的笑才是今晚最亮的光。',
                    '我不太会说话，但我愿意把所有的温柔都留给你。',
                    '喜欢你这件事，我好像藏不住了，也不想藏了。',
                    '想和你一起把平淡的日子，过成值得收藏的片段。',
                    '你是我见过最特别的意外，也是我最想要的必然。',
                    '世界很大，但我眼里只有你这一个坐标。',
                    '如果心动有声音，那我对你的，一定是震耳欲聋。'
                ]
            },
            roast: {
                name: '吐槽', emoji: ['😅', '🤡', '💢', '🫠'],
                lines: [
                    '我的存款和我的发际线一样，都在悄悄后退。',
                    '每天叫醒我的不是梦想，是迟到的恐惧。',
                    '减肥这件事，我是认真的——认真地在吃。',
                    '我的计划永远停留在「明天就开始」。',
                    '钱包：我裂开了。我：我习惯了。',
                    '努力不一定成功，但不努力一定很轻松（不是）。',
                    '别人的周末是诗和远方，我的周末是床和外卖。',
                    '打工人的精神状态：表面在笑，内心在逃。'
                ]
            },
            travel: {
                name: '旅行', emoji: ['🏔️', '🌊', '✈️', '📸'],
                lines: [
                    '山河远阔，人间烟火，我都想和你一起走过。',
                    '把烦恼留在城市，把脚印留给山川湖海。',
                    '旅行的意义，是把自己重新养一遍。',
                    '风很自由，我也想和你一样，去没有天花板的地方。',
                    '这一站的风景很好，但最好的风景是出发的心情。',
                    '收集地图上的点，也收集生活里的光。',
                    '在路上才明白，慢一点也没关系。',
                    '世界是一本大书，今天我又翻了几页。'
                ]
            },
            work: {
                name: '职场', emoji: ['💼', '☕', '📈', '🔥'],
                lines: [
                    '把简单的事做到极致，就是不简单。',
                    '今天也要做职场里最稳定的那颗螺丝钉（划掉）顶梁柱。',
                    '进度条拉满，灵感也在路上了。',
                    '与其焦虑结果，不如先把眼前这一步走漂亮。',
                    '专业能力是底气，好心态是续航。',
                    '周报写得好，升职少不了（bushi）。',
                    '把每一次交付，都当成自己的作品。',
                    '别怕起点低，怕的是停在原地。'
                ]
            },
            daily: {
                name: '日常', emoji: ['🌤️', '🍵', '📚', '🐱'],
                lines: [
                    '普通的一天，也被我过得有滋有味。',
                    '认真生活，是对平淡最好的回击。',
                    '今天的快乐是：一杯热茶 + 一首老歌。',
                    '把小确幸攒起来，就是大大的幸福。',
                    '慢下来，才看得见生活里的细碎温柔。',
                    '今日份的自己，依然值得被好好对待。',
                    '日子普通，但我在认真发光。',
                    '记录生活，是为了将来能笑着回看。'
                ]
            },
            selfie: {
                name: '自拍', emoji: ['🤳', '💄', '🌟', '🪞'],
                lines: [
                    '今天的我，是限量版的我。',
                    '原相机直出，自信拉满。',
                    '不是自恋，是懂得欣赏自己的好看。',
                    '光线、角度、心情，今天三者都在线。',
                    '美颜是尊重，原图是勇气，我都有。',
                    '镜子说：今天你挺好看的。',
                    '随手一拍，都是生活的高光时刻。',
                    '好状态，从好好爱自己开始。'
                ]
            },
            festival: {
                name: '节日', emoji: ['🎉', '🎁', '🏮', '🎊'],
                lines: [
                    '愿所求皆所愿，所行皆坦途。',
                    '节日快乐，愿你被这世界温柔以待。',
                    '把祝福打包送给你：平安、喜乐、暴富。',
                    '人间烟火气，最抚凡人心，节日更甚。',
                    '愿新的一岁，热爱与自由都奔你而来。',
                    '重要的不是节日，是和你一起过节的人。',
                    '好事正酿，万物更新，祝你如愿以偿。',
                    '岁岁常欢愉，年年皆胜意。'
                ]
            }
        };

        const scenKeys = Object.keys(SCENARIOS);
        let curScen = 'love';
        const scenBox = $('#cwScenarios');

        // 渲染场景 chips
        scenKeys.forEach(k => {
            const b = document.createElement('button');
            b.className = 'cw-chip' + (k === curScen ? ' active' : '');
            b.textContent = SCENARIOS[k].name;
            b.addEventListener('click', () => {
                curScen = k;
                $$('.cw-chip', scenBox).forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                generateCW();
            });
            scenBox.appendChild(b);
        });

        function shuffle(arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function generateCW() {
            const sc = SCENARIOS[curScen];
            const picks = shuffle(sc.lines).slice(0, 6);
            const box = $('#cwResults');
            box.innerHTML = '';
            picks.forEach(text => {
                const emoji = sc.emoji[Math.floor(Math.random() * sc.emoji.length)];
                const card = document.createElement('div');
                card.className = 'cw-card';
                card.innerHTML = `<div class="cw-text">${emoji} ${text}</div>
                    <button class="tool-btn"><i class="fas fa-copy"></i>复制</button>`;
                card.querySelector('button').addEventListener('click', () => copyText(`${emoji} ${text}`));
                box.appendChild(card);
            });
        }

        $('#cwGen').addEventListener('click', generateCW);
        $('#cwAgain').addEventListener('click', generateCW);
        $('#cwShare').addEventListener('click', () => {
            const sc = SCENARIOS[curScen];
            const picks = shuffle(sc.lines).slice(0, 5);
            const c = document.createElement('canvas');
            c.width = 800; c.height = 1000;
            const ctx = c.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 800, 1000);
            g.addColorStop(0, FUN_GRAD[0]); g.addColorStop(1, FUN_GRAD[1]);
            ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 1000);
            ctx.fillStyle = 'rgba(255,255,255,.9)';
            ctx.font = '800 44px sans-serif';
            ctx.fillText(`${sc.name}文案`, 56, 110);
            ctx.font = '400 22px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.fillText('Aqua 工具站 · 一键生成', 56, 150);
            ctx.fillStyle = '#fff';
            let y = 230;
            picks.forEach(t => { y = wrapText(ctx, t, 56, y, 690, 46) + 60; });
            downloadCanvas(c, `文案_${sc.name}.png`);
            notify('分享卡已生成');
        });

        generateCW();
    }

    /* ============================================================
       2. 抽奖助手（转盘 / 骰子 / 抽签）
       ============================================================ */
    const lotRoot = $('#tool-lottery');
    if (lotRoot) {
        const WHEEL_COLORS = ['#ff375f', '#ff9500', '#ffcc00', '#34c759', '#30b0c7', '#0071e3', '#5856d6', '#af52de', '#ff2d55', '#5ac8fa', '#ff6482', '#a2845e'];
        const wheel = $('#lotteryWheel');
        const lotSpin = $('#lotSpin');
        const lotWheelHint = $('#lotWheelHint');
        let currentRot = 0, spinning = false;

        function getOptions() {
            return $('#lotteryOptions').value
                .split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
        }

        function drawWheel(opts, rotation) {
            const ctx = wheel.getContext('2d');
            const W = wheel.width, H = wheel.height, cx = W / 2, cy = H / 2, r = W / 2 - 8;
            ctx.clearRect(0, 0, W, H);
            const n = opts.length; if (!n) return;
            const seg = 2 * Math.PI / n;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, r, i * seg - Math.PI / 2, (i + 1) * seg - Math.PI / 2);
                ctx.closePath();
                ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
                ctx.fill();
                ctx.save();
                ctx.rotate(i * seg + seg / 2 - Math.PI / 2);
                ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
                ctx.font = 'bold 24px sans-serif';
                let label = opts[i];
                if (label.length > 6) label = label.slice(0, 6) + '…';
                ctx.fillText(label, r - 18, 8);
                ctx.restore();
            }
            ctx.restore();
        }

        function spin() {
            if (spinning) return;
            const opts = getOptions();
            if (opts.length < 2) { notify('至少输入 2 个选项'); return; }
            spinning = true; lotSpin.disabled = true;
            const n = opts.length, seg = 2 * Math.PI / n;
            const k = Math.floor(Math.random() * n);
            const target = -(k * seg + seg / 2);
            let final = target;
            while (final < currentRot + Math.PI * 2 * 5) final += 2 * Math.PI;
            const start = currentRot, dur = 4200, t0 = performance.now();
            function frame(now) {
                const p = Math.min(1, (now - t0) / dur);
                const e = 1 - Math.pow(1 - p, 3);
                currentRot = start + (final - start) * e;
                drawWheel(opts, currentRot);
                if (p < 1) requestAnimationFrame(frame);
                else {
                    spinning = false; lotSpin.disabled = false;
                    lotWheelHint.textContent = '🎉 中奖：' + opts[k];
                    notify('中奖：' + opts[k]);
                }
            }
            requestAnimationFrame(frame);
        }

        lotSpin.addEventListener('click', spin);
        $('#lotteryOptions').addEventListener('input', () => drawWheel(getOptions(), currentRot));

        // 子标签切换
        $$('#lotteryTabs .sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('#lotteryTabs .sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const m = tab.dataset.lm;
                $('#lotWheelBox').style.display = m === 'wheel' ? '' : 'none';
                $('#lotDiceBox').style.display = m === 'dice' ? '' : 'none';
                $('#lotDrawBox').style.display = m === 'draw' ? '' : 'none';
                if (m === 'wheel') drawWheel(getOptions(), currentRot);
            });
        });

        // 骰子
        const pips = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
        $('#diceRoll').addEventListener('click', () => {
            const cnt = parseInt($('#diceCount').value) || 2;
            const area = $('#diceArea'); area.innerHTML = '';
            let total = 0;
            for (let i = 0; i < cnt; i++) {
                const v = 1 + Math.floor(Math.random() * 6); total += v;
                const d = document.createElement('div');
                d.className = 'die rolling'; d.textContent = pips[v];
                area.appendChild(d);
                setTimeout(() => d.classList.remove('rolling'), 400);
            }
            $('#diceHint').textContent = '点数总和：' + total;
        });

        // 抽签
        $('#drawBtn').addEventListener('click', () => {
            const opts = getOptions();
            if (!opts.length) { notify('请先输入选项'); return; }
            const w = opts[Math.floor(Math.random() * opts.length)];
            const r = $('#drawResult');
            r.textContent = w;
            r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
        });

        drawWheel(getOptions(), currentRot);
    }

    /* ============================================================
       3. 真心话大冒险 / 群友匹配度
       ============================================================ */
    const tdRoot = $('#tool-truth-dare');
    if (tdRoot) {
        const TRUTH = [
            '你最近一次心动是因为谁？',
            '说一个你从没告诉过别人的小秘密。',
            '你手机里最舍不得删的一张照片是什么？',
            '你暗恋过几个人？现在还有联系吗？',
            '你做过最社死的一件事是什么？',
            '如果可以删掉一段记忆，你会删哪段？',
            '你最怕被朋友发现的缺点是什么？',
            '你上一次哭是因为什么？',
            '你偷偷喜欢过好朋友吗？',
            '你最想对在场某个人说句什么真心话？'
        ];
        const DARE = [
            '用最深情的语气对右边的人说「我爱你」。',
            '模仿一个在场成员的经典动作或口头禅。',
            '现场表演一段你最擅长的才艺（10 秒）。',
            '给通讯录里第 5 个人发「在吗，想你了」。',
            '用方言唱一句歌。',
            '对镜头比心并说一句土味情话。',
            '让大家投票你最像哪种小动物，并接受结果。',
            '原地转三圈后说出在场所有人的名字。',
            '用屁股写出你的名字（空气书法也行）。',
            '打电话给家人说「我今天特别想你」。'
        ];
        let tdMode = 'truth';

        $('#tdModeTruth').addEventListener('click', () => {
            tdMode = 'truth';
            $('#tdModeTruth').classList.add('active');
            $('#tdModeDare').classList.remove('active');
        });
        $('#tdModeDare').addEventListener('click', () => {
            tdMode = 'dare';
            $('#tdModeDare').classList.add('active');
            $('#tdModeTruth').classList.remove('active');
        });

        $('#tdPick').addEventListener('click', () => {
            const list = tdMode === 'truth' ? TRUTH : DARE;
            const t = list[Math.floor(Math.random() * list.length)];
            const el = $('#tdText');
            el.textContent = t;
            el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
        });

        // 子标签
        $$('#tdTabs .sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('#tdTabs .sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const m = tab.dataset.td;
                $('#tdBox').style.display = m === 'td' ? '' : 'none';
                $('#matchBox').style.display = m === 'match' ? '' : 'none';
            });
        });

        // 匹配度
        function hashStr(s) {
            let h = 2166136261;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return Math.abs(h);
        }
        function verdict(s) {
            if (s >= 90) return '💞 天生一对，锁死！';
            if (s >= 75) return '✨ 默契十足，很合拍';
            if (s >= 60) return '😊 还不错哦，有戏';
            if (s >= 45) return '🤔 需要一点磨合';
            return '🤝 友尽边缘，但缘分未定';
        }

        $('#matchBtn').addEventListener('click', () => {
            const a = $('#matchA').value.trim();
            const b = $('#matchB').value.trim();
            if (!a || !b) { notify('请输入两个人的昵称'); return; }
            const score = (hashStr(a + '♥' + b) % 60) + 40;
            const res = $('#matchResult');
            res.style.display = '';
            $('#matchScore').textContent = score + '%';
            $('#matchVerdict').textContent = verdict(score);
            const fill = $('#matchBarFill');
            fill.style.width = '0';
            requestAnimationFrame(() => { fill.style.width = score + '%'; });
        });

        $('#matchShare').addEventListener('click', () => {
            const a = $('#matchA').value.trim() || 'TA';
            const b = $('#matchB').value.trim() || 'TA';
            const score = parseInt($('#matchScore').textContent) || 0;
            const c = document.createElement('canvas');
            c.width = 800; c.height = 1000;
            const ctx = c.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 800, 1000);
            g.addColorStop(0, FUN_GRAD[0]); g.addColorStop(1, FUN_GRAD[1]);
            ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 1000);
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.font = '800 46px sans-serif';
            ctx.fillText(`${a}  ❤  ${b}`, 400, 240);
            ctx.font = '800 140px sans-serif';
            ctx.fillText(score + '%', 400, 440);
            ctx.font = '400 34px sans-serif';
            ctx.fillText(verdict(score), 400, 520);
            ctx.font = '400 22px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.fillText('Aqua 工具站 · 群友匹配度', 400, 700);
            downloadCanvas(c, `匹配度_${a}_${b}.png`);
            notify('分享卡已生成');
        });
    }

    /* ============================================================
       4. 简历 / 名片一键生成
       ============================================================ */
    const rsRoot = $('#tool-resume');
    if (rsRoot) {
        // 名片实时预览
        function updateCard() {
            $('#ncNameV').textContent = $('#ncName').value || '姓名';
            $('#ncTitleV').textContent = $('#ncTitle').value || '职位';
            $('#ncContactV').textContent = [($('#ncPhone').value || ''), ($('#ncEmail').value || '')].filter(Boolean).join('  ·  ');
            $('#ncCompanyV').textContent = $('#ncCompany').value || '';
            $('#ncTagV').textContent = $('#ncTag').value || '';
            const col = $('#ncColor').value;
            $('#ncCard').style.background = `linear-gradient(135deg, ${col}, ${shade(col, -35)})`;
        }
        ['ncName', 'ncTitle', 'ncPhone', 'ncEmail', 'ncCompany', 'ncTag', 'ncColor'].forEach(id => {
            $('#' + id).addEventListener('input', updateCard);
        });
        updateCard();

        $('#ncDownload').addEventListener('click', () => {
            const c = document.createElement('canvas');
            c.width = 840; c.height = 525;
            const ctx = c.getContext('2d');
            const col = $('#ncColor').value;
            const g = ctx.createLinearGradient(0, 0, 840, 525);
            g.addColorStop(0, col); g.addColorStop(1, shade(col, -38));
            ctx.fillStyle = g; ctx.fillRect(0, 0, 840, 525);
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.beginPath(); ctx.arc(770, 470, 150, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
            ctx.font = '800 50px sans-serif';
            ctx.fillText($('#ncName').value || '姓名', 50, 155);
            ctx.font = '400 26px sans-serif';
            ctx.fillText($('#ncTitle').value || '', 50, 200);
            ctx.font = '400 20px sans-serif';
            ctx.fillText([($('#ncPhone').value || ''), ($('#ncEmail').value || '')].filter(Boolean).join('   ·   '), 50, 320);
            ctx.fillText($('#ncCompany').value || '', 50, 356);
            const tag = $('#ncTag').value || '';
            if (tag) {
                ctx.font = '400 18px sans-serif';
                const tw = ctx.measureText(tag).width + 34;
                ctx.fillStyle = 'rgba(255,255,255,.22)';
                roundRect(ctx, 50, 392, tw, 36, 18); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.fillText(tag, 67, 415);
            }
            ctx.font = '400 16px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,.7)';
            ctx.fillText('Aqua 工具站 · 名片', 50, 480);
            downloadCanvas(c, ($('#ncName').value || 'namecard') + '_名片.png');
            notify('名片已导出');
        });

        // 简历实时预览
        function updateResume() {
            $('#rpNameV').textContent = $('#rpName').value || '姓名';
            $('#rpGoalV').textContent = '求职意向：' + ($('#rpGoal').value || '');
            $('#rpMetaV').textContent = $('#rpMeta').value || '';
            $('#rpEduV').textContent = $('#rpEdu').value || '';
            $('#rpExpV').textContent = ($('#rpExp').value || '').split('\n').filter(Boolean).join('\n');
            $('#rpSkillV').textContent = ($('#rpSkill').value || '').split('\n').filter(Boolean).join('\n');
        }
        ['rpName', 'rpGoal', 'rpMeta', 'rpEdu', 'rpExp', 'rpSkill'].forEach(id => {
            $('#' + id).addEventListener('input', updateResume);
        });
        updateResume();

        $('#rpPrint').addEventListener('click', () => window.print());

        // 子标签
        $$('#resumeTabs .sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('#resumeTabs .sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const m = tab.dataset.rt;
                $('#ncBox').style.display = m === 'card' ? '' : 'none';
                $('#resumeBox').style.display = m === 'resume' ? '' : 'none';
            });
        });
    }
})();

/* ============================================================
   番茄小说下载器（前端部分）
   调用 CloudBase HTTP 云函数：搜索 / 章节列表 / 批量取章
   整本 TXT 在浏览器端拼装后触发下载。
   仅限个人备份用途，请勿传播。
   ============================================================ */
(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);

    // 默认指向本机服务（运行 cloudfunctions/fanqie/server.js 后填 http://localhost:8787）
    // 接入 CloudBase 后，可在此填云函数地址，或在面板“高级选项”里临时覆盖
    const FANQIE_API = 'http://localhost:8787';

    let currentBook = null;
    let currentChapters = [];

    function apiBase() {
        const v = $('#fqApi') && $('#fqApi').value.trim();
        return (v || FANQIE_API);
    }
    function log(msg) {
        const el = $('#fqLog');
        if (el) { el.textContent += msg + '\n'; el.scrollTop = el.scrollHeight; }
    }
    async function callApi(params) {
        const base = apiBase();
        if (!base || base === 'REPLACE_WITH_CLOUD_FUNCTION_URL') {
            alert('请先在「高级选项」里填写云函数接口地址（部署后会自动填入）');
            throw new Error('no-api');
        }
        const cookie = $('#fqCookie') && $('#fqCookie').value.trim();
        const qs = new URLSearchParams(params);
        if (cookie) qs.set('cookie', cookie);
        const res = await fetch(base + '?' + qs.toString(), { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    async function searchBook() {
        const q = $('#fqSearch').value.trim();
        if (!q) return;
        $('#fqBooks').innerHTML = '<div class="fq-meta">搜索中…</div>';
        $('#fqDetail').style.display = 'none';
        currentBook = null; currentChapters = [];
        try {
            const r = await callApi({ action: 'search', q });
            if (r.debug) { $('#fqBooks').innerHTML = '<div class="fq-meta">未解析到结果，原始返回：<br>' + escapeHtml(r.debug) + '</div>'; return; }
            const books = r.books || [];
            if (!books.length) { $('#fqBooks').innerHTML = '<div class="fq-meta">没有找到相关小说</div>'; return; }
            $('#fqBooks').innerHTML = books.map((b, i) =>
                '<div class="fq-book" data-i="' + i + '">' +
                '<img src="' + (b.cover || '') + '" onerror="this.style.visibility=\'hidden\'" alt="">' +
                '<div><div class="fb-title">' + escapeHtml(b.title) + '</div>' +
                '<div class="fb-author">' + escapeHtml(b.author || '') + '</div></div></div>'
            ).join('');
            $('#fqBooks').querySelectorAll('.fq-book').forEach(el => {
                el.addEventListener('click', () => {
                    currentBook = books[+el.dataset.i];
                    showBook(currentBook);
                });
            });
        } catch (e) {
            $('#fqBooks').innerHTML = '<div class="fq-meta">搜索失败：' + escapeHtml(e.message) + '</div>';
        }
    }

    function showBook(b) {
        $('#fqDetail').style.display = 'block';
        $('#fqBookMeta').textContent = b.title + ' · ' + (b.author || '');
        $('#fqChapCount').textContent = '';
        $('#fqProgress').textContent = '';
        $('#fqLog').textContent = '';
        currentChapters = [];
    }

    async function loadChapters() {
        if (!currentBook) return;
        $('#fqChapCount').textContent = '加载章节中…';
        try {
            const r = await callApi({ action: 'chapters', bookId: currentBook.id });
            if (r.debug) { $('#fqChapCount').textContent = '章节解析失败'; log('原始返回: ' + r.debug); return; }
            currentChapters = r.chapters || [];
            $('#fqChapCount').textContent = '共 ' + currentChapters.length + ' 章';
        } catch (e) {
            $('#fqChapCount').textContent = '加载失败';
            log('加载章节失败：' + e.message);
        }
    }

    async function downloadBook() {
        if (!currentBook || !currentChapters.length) { alert('请先加载章节'); return; }
        let list = currentChapters;
        const range = $('#fqRange').value;
        if (range !== 'all') list = list.slice(0, parseInt(range, 10));
        if (!list.length) return;

        const BATCH = 20;
        let txt = currentBook.title + '（' + (currentBook.author || '') + '）\n\n';
        log('开始下载，共 ' + list.length + ' 章…');
        $('#fqDownload').disabled = true;
        try {
            for (let i = 0; i < list.length; i += BATCH) {
                const slice = list.slice(i, i + BATCH);
                const ids = slice.map(c => c.id).join(',');
                try {
                    const r = await callApi({ action: 'batch', ids });
                    const chs = r.chapters || [];
                    for (const ch of chs) {
                        txt += '\n' + (ch.title || '') + '\n\n' + (ch.content || '') + '\n';
                    }
                    const done = Math.min(i + BATCH, list.length);
                    $('#fqProgress').textContent = '已获取 ' + done + ' / ' + list.length;
                    log('已获取 ' + done + ' / ' + list.length);
                } catch (e) {
                    log('批次失败（' + slice.length + ' 章）：' + e.message);
                }
            }
            const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (currentBook.title || 'fanqie') + '.txt';
            a.click();
            URL.revokeObjectURL(a.href);
            log('下载完成：' + (currentBook.title || 'fanqie') + '.txt');
        } finally {
            $('#fqDownload').disabled = false;
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function init() {
        const sb = $('#fqSearchBtn'); if (!sb) return;
        sb.addEventListener('click', searchBook);
        $('#fqSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchBook(); });
        $('#fqLoadChapters').addEventListener('click', loadChapters);
        $('#fqDownload').addEventListener('click', downloadBook);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
