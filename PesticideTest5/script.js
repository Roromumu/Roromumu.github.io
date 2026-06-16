const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxbh_gH17E5pkj4qRverA8VpHFzXx2yyc2opLVXm5RbtonfFVAQXBQXRZvOkKr03OEc/exec";

async function uploadToGoogleSheets(data) {
    const url = GOOGLE_SHEET_URL + "?t=" + Date.now();
    try {
        await fetch(url, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(data)
            // 不加 Content-Type
        });
    } catch (err) {
        console.error("上傳失敗:", err);
    }
}

function getDeviceInfo() {
    const ua = navigator.userAgent;

    // iOS 裝置
    if (/iPhone/.test(ua)) {
        const match = ua.match(/OS (\d+[_\d]*)/);
        const ver = match ? match[1].replace(/_/g, '.') : '';
        return `iPhone iOS ${ver}`;
    }
    if (/iPad/.test(ua)) {
        const match = ua.match(/OS (\d+[_\d]*)/);
        const ver = match ? match[1].replace(/_/g, '.') : '';
        return `iPad iOS ${ver}`;
    }

    // Android 裝置
    if (/Android/.test(ua)) {
        const verMatch = ua.match(/Android ([\d.]+)/);
        const ver = verMatch ? verMatch[1] : '';

        // 抓品牌名稱
        const brandMatch = ua.match(/\b(Samsung|Xiaomi|OPPO|vivo|Huawei|Pixel|OnePlus|ASUS|Sony|LG|Motorola|Realme|Nokia|HTC)\b/i);
        const brand = brandMatch ? brandMatch[1] : 'Android裝置';

        return `${brand} Android ${ver}`;
    }

    // 電腦
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';

    return ua.substring(0, 60);
}

const video = document.getElementById('camera');
const analyzeBtn = document.getElementById('analyzeBtn');
const stopBtn = document.getElementById('stopBtn');
const result = document.getElementById('result');
const redBox1 = document.getElementById('redBox1');
const redBox2 = document.getElementById('redBox2');
const redBox3 = document.getElementById('redBox3');
const redBox4 = document.getElementById('redBox4');
const redBox5 = document.getElementById('redBox5');
const analyzingOverlay = document.getElementById('analyzingOverlay');

const allBoxes = [redBox1, redBox2, redBox3, redBox4, redBox5];
const sampleBoxes = [redBox2, redBox3, redBox4, redBox5];

let stream;
let interval;
let logRGBValues = [];

let redBoxPositions = {
    redBox1: { left: 0, top: 0 },
    redBox2: { left: 0, top: 0 },
    redBox3: { left: 0, top: 0 },
    redBox4: { left: 0, top: 0 },
    redBox5: { left: 0, top: 0 },
};

async function startCamera() {
    video.setAttribute('playsinline', true);
    video.setAttribute('webkit-playsinline', true);

    try {
        const constraints = {
            video: { facingMode: 'environment' }
        };
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("瀏覽器不支持 getUserMedia");
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
        };
        analyzeBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        console.error("無法啟動攝像頭: ", err);
        result.innerHTML = `錯誤：無法啟動攝像頭。請檢查瀏覽器權限設置或設備支持性。${err.message}`;
        analyzeBtn.disabled = true;
    }
}

function makeDraggable(box) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    function startDragging(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const parentRect = box.offsetParent.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();

        offsetX = clientX - boxRect.left;
        offsetY = clientY - boxRect.top;

        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = 'grabbing';
    }

    function moveDragging(e) {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const parent = box.offsetParent;
        const camera = document.getElementById('camera');
        const parentRect = parent.getBoundingClientRect();
        const cameraRect = camera.getBoundingClientRect();

        const cameraOffsetLeft = cameraRect.left - parentRect.left;
        const cameraOffsetTop = cameraRect.top - parentRect.top;

        const boxWidth = box.offsetWidth;
        const boxHeight = box.offsetHeight;

        const rawLeft = clientX - parentRect.left - offsetX;
        const rawTop = clientY - parentRect.top - offsetY;

        const minLeft = cameraOffsetLeft;
        const maxLeft = cameraOffsetLeft + camera.offsetWidth - boxWidth;
        const minTop = cameraOffsetTop;
        const maxTop = cameraOffsetTop + camera.offsetHeight - boxHeight;

        const newLeft = Math.max(minLeft, Math.min(rawLeft, maxLeft));
        const newTop = Math.max(minTop, Math.min(rawTop, maxTop));

        box.style.left = `${newLeft}px`;
        box.style.top = `${newTop}px`;

        redBoxPositions[box.id] = { left: newLeft, top: newTop };
    }

    function stopDragging() {
        isDragging = false;
        document.body.style.cursor = 'default';
    }

    box.addEventListener('mousedown', startDragging);
    box.addEventListener('touchstart', startDragging);
    document.addEventListener('mousemove', moveDragging);
    document.addEventListener('touchmove', moveDragging, { passive: false });
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('touchend', stopDragging);
}

function getAverageColor(box) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const videoRect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const boxLeft = redBoxPositions[box.id].left;
    const boxTop = redBoxPositions[box.id].top;
    const boxWidth = box.offsetWidth;
    const boxHeight = box.offsetHeight;

    const boxX = boxLeft * scaleX;
    const boxY = boxTop * scaleY;
    const boxW = boxWidth * scaleX;
    const boxH = boxHeight * scaleY;

    const safeX = Math.max(0, Math.min(boxX, canvas.width - boxW));
    const safeY = Math.max(0, Math.min(boxY, canvas.height - boxH));

    const imageData = ctx.getImageData(safeX, safeY, boxW, boxH).data;

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
    }

    return { r: r / count, g: g / count, b: b / count };
}

function removeOutliers(values, count = 3) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.slice(count, sorted.length - count);
}

function calculateQuartiles(values) {
    values = values.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return { q1: "N/A", q2: "N/A" };

    const trimmed = removeOutliers(values, 3);
    if (trimmed.length === 0) return { q1: "N/A", q2: "N/A" };

    const median = arr => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    };

    const q2Raw = median(trimmed);
    const lowerHalf = trimmed.slice(0, Math.floor(trimmed.length / 2));
    const q1Raw = median(lowerHalf);

    return {
        q1: q1Raw.toFixed(5),
        q2: q2Raw.toFixed(5)
    };
}

analyzeBtn.addEventListener('click', async function () {
    updateRedBoxPositions();
    
    logRGBValues = [];
    let intervalCount = 180;

    stopBtn.disabled = false;
    analyzeBtn.disabled = true;

    analyzingOverlay.style.display = 'flex';

    const colors = allBoxes.map(box => getAverageColor(box));

    logRGBValues.push({
        time: intervalCount,
        colors: colors.map(c => ({ r: c.r.toFixed(3), g: c.g.toFixed(3), b: c.b.toFixed(3) })),
        slopes: null
    });

    result.innerHTML = `
        剩餘時間: ${intervalCount} 秒<br>
        空白組 RGB: (${colors[0].r.toFixed(3)}, ${colors[0].g.toFixed(3)}, ${colors[0].b.toFixed(3)})<br>
        樣品1 RGB: (${colors[1].r.toFixed(3)}, ${colors[1].g.toFixed(3)}, ${colors[1].b.toFixed(3)})<br>
        樣品2 RGB: (${colors[2].r.toFixed(3)}, ${colors[2].g.toFixed(3)}, ${colors[2].b.toFixed(3)})<br>
        樣品3 RGB: (${colors[3].r.toFixed(3)}, ${colors[3].g.toFixed(3)}, ${colors[3].b.toFixed(3)})<br>
        樣品4 RGB: (${colors[4].r.toFixed(3)}, ${colors[4].g.toFixed(3)}, ${colors[4].b.toFixed(3)})<br>
    `;

    intervalCount -= 2;

    interval = setInterval(() => {
        const colors = allBoxes.map(box => getAverageColor(box));
        const prev = logRGBValues[logRGBValues.length - 1];

        const slopes = colors.map((c, i) => ({
            b: (parseFloat(prev.colors[i].b) - c.b).toFixed(3)
        }));

        logRGBValues.push({
            time: intervalCount,
            colors: colors.map(c => ({ r: c.r.toFixed(3), g: c.g.toFixed(3), b: c.b.toFixed(3) })),
            slopes
        });

        result.innerHTML = `
            剩餘時間: ${intervalCount} 秒<br>
            空白組 RGB: (${colors[0].r.toFixed(3)}, ${colors[0].g.toFixed(3)}, ${colors[0].b.toFixed(3)})<br>
            樣品1 RGB: (${colors[1].r.toFixed(3)}, ${colors[1].g.toFixed(3)}, ${colors[1].b.toFixed(3)})<br>
            樣品2 RGB: (${colors[2].r.toFixed(3)}, ${colors[2].g.toFixed(3)}, ${colors[2].b.toFixed(3)})<br>
            樣品3 RGB: (${colors[3].r.toFixed(3)}, ${colors[3].g.toFixed(3)}, ${colors[3].b.toFixed(3)})<br>
            樣品4 RGB: (${colors[4].r.toFixed(3)}, ${colors[4].g.toFixed(3)}, ${colors[4].b.toFixed(3)})<br>
        `;

        intervalCount -= 2;

        if (intervalCount < 0) {
            clearInterval(interval);
            analyzeBtn.disabled = false;
            stopBtn.disabled = true;
            toggleTorch(false);
            analyzingOverlay.style.display = 'none';
            showQuartiles();
        }
    }, 2000);
});

function toggleTorch(on) {
    try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
            track.applyConstraints({
                advanced: [{ torch: on }]
            });
        }
    } catch (err) {
        console.error("無法控制手電筒: ", err);
    }
}

startCamera();
allBoxes.forEach(box => makeDraggable(box));

//20250514
document.getElementById('startBtn').addEventListener('click', async () => {
    await startCamera();
    video.onloadeddata = () => {
        updateRedBoxPositions();

        const colors = allBoxes.map(box => getAverageColor(box));

        result.innerHTML = `
            空白組 RGB: (${colors[0].r.toFixed(3)}, ${colors[0].g.toFixed(3)}, ${colors[0].b.toFixed(3)})<br>
            樣品1 RGB: (${colors[1].r.toFixed(3)}, ${colors[1].g.toFixed(3)}, ${colors[1].b.toFixed(3)})<br>
            樣品2 RGB: (${colors[2].r.toFixed(3)}, ${colors[2].g.toFixed(3)}, ${colors[2].b.toFixed(3)})<br>
            樣品3 RGB: (${colors[3].r.toFixed(3)}, ${colors[3].g.toFixed(3)}, ${colors[3].b.toFixed(3)})<br>
            樣品4 RGB: (${colors[4].r.toFixed(3)}, ${colors[4].g.toFixed(3)}, ${colors[4].b.toFixed(3)})<br>
        `;
    };
});
//20250514

function calculatePercentageReduction(b1Stats, b2Stats, rgbRatio = 1) {
     function safePercent(qB1, qB2) {
         const n1 = parseFloat(qB1);
         const n2 = parseFloat(qB2);
          if (n1 === 0) return { value: null, warning: null };

         if (n1 < 0.05 || n2 < 0) return { value: null, warning: "ERROR:酵素活性不足" };

          if (n2 > n1) return { value: (1 - (n1 / n2) * rgbRatio) * 100, warning: "警告:A,B位置可能錯置" };

          return { value: (1 - (n2 / n1) * rgbRatio) * 100, warning: null };
      }

    const q1Result = safePercent(b1Stats.q1, b2Stats.q1);
    const q2Result = safePercent(b1Stats.q2, b2Stats.q2);

    // 警告優先取 Q2 的
    const warning = q2Result.warning || q1Result.warning || null;

    const avg = (q1Result.value != null && q2Result.value != null)
        ? ((q1Result.value + q2Result.value) / 2).toFixed(2) + "%"
        : "N/A";

    return {
        q1Percent: q1Result.value != null ? q1Result.value.toFixed(2) + "%" : "N/A",
        q2Percent: q2Result.value != null ? q2Result.value.toFixed(2) + "%" : "N/A",
        average:   avg,
        warning:   warning
    };
}

function updateRedBoxPositions() {
    const parentRect = video.getBoundingClientRect();

    ['redBox1', 'redBox2', 'redBox3', 'redBox4', 'redBox5'].forEach(id => {
        const box = document.getElementById(id);
        const rect = box.getBoundingClientRect();

        redBoxPositions[id] = {
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top
        };
    });
}

function movingAverage(values, windowSize = 5) {
    const result = [];
    for (let i = 0; i <= values.length - windowSize; i++) {
        const window = values.slice(i, i + windowSize);
        const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
        result.push(avg);
    }
    return result;
}

// ── 計算結果並上傳 ──────────────────────────────────────
async function showQuartiles() {
    const validData = logRGBValues.filter(entry =>
        entry.slopes &&
        entry.slopes.every(s => !isNaN(parseFloat(s.b)))
    );

    // 空白組 (index 0) slope B 的統計
    const rawB_blank = validData.map(entry => parseFloat(entry.slopes[0].b));
    const b_blankSmoothed = movingAverage(rawB_blank, 5);
    const b_blankStats = calculateQuartiles(b_blankSmoothed);

    // 4個樣品組 (index 1~4) 各自統計
    const sampleResults = [];
    for (let i = 1; i <= 4; i++) {
        const rawB_samp = validData.map(entry => parseFloat(entry.slopes[i].b));
        const b_sampSmoothed = movingAverage(rawB_samp, 5);
        const b_sampStats = calculateQuartiles(b_sampSmoothed);

        // 空白組原始RGB Q2
        const blankR = logRGBValues.map(e => parseFloat(e.colors[0].r)).filter(v => !isNaN(v));
        const blankG = logRGBValues.map(e => parseFloat(e.colors[0].g)).filter(v => !isNaN(v));
        const blankB = logRGBValues.map(e => parseFloat(e.colors[0].b)).filter(v => !isNaN(v));
        const blankRQ2 = parseFloat(calculateQuartiles(blankR).q2);
        const blankGQ2 = parseFloat(calculateQuartiles(blankG).q2);
        const blankBQ2 = parseFloat(calculateQuartiles(blankB).q2);
        const blankSum = blankRQ2 + blankGQ2 + blankBQ2;

        // 樣品i原始RGB Q2
        const sampR = logRGBValues.map(e => parseFloat(e.colors[i].r)).filter(v => !isNaN(v));
        const sampG = logRGBValues.map(e => parseFloat(e.colors[i].g)).filter(v => !isNaN(v));
        const sampB = logRGBValues.map(e => parseFloat(e.colors[i].b)).filter(v => !isNaN(v));
        const sampRQ2 = parseFloat(calculateQuartiles(sampR).q2);
        const sampGQ2 = parseFloat(calculateQuartiles(sampG).q2);
        const sampBQ2 = parseFloat(calculateQuartiles(sampB).q2);
        const sampSum = sampRQ2 + sampGQ2 + sampBQ2;

        const rgbRatio = (sampSum !== 0) ? blankSum / sampSum : 1;

        const percentReduction = calculatePercentageReduction(b_blankStats, b_sampStats, rgbRatio);

        sampleResults.push({
            index: i,
            percentReduction,
            b_sampStats,
            sampRQ2, sampGQ2, sampBQ2, sampSum,
            blankRQ2, blankGQ2, blankBQ2, blankSum,
            rgbRatio
        });
    }

    const errorCode = sampleResults.map((r, i) =>
        r.percentReduction.warning ? `A${i+1}:${r.percentReduction.warning}` : null
    ).filter(Boolean).join('; ') || "正常";

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const sheetName = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // 儲存4組結果到 localStorage
    const rates = sampleResults.map(r => r.percentReduction.q2Percent);
    localStorage.setItem("rates", JSON.stringify(rates));
    localStorage.setItem("errorCode", errorCode);

    // 上傳到 Google Sheets
    await uploadToGoogleSheets({
        sheetName,
        summary: {
            nickname:  localStorage.getItem('nickname') || '未填寫',
            device:    getDeviceInfo(),
            time:      now.toLocaleString("zh-TW"),
            errorCode,
            blankRQ2:  sampleResults[0].blankRQ2.toFixed(3),
            blankGQ2:  sampleResults[0].blankGQ2.toFixed(3),
            blankBQ2:  sampleResults[0].blankBQ2.toFixed(3),
            blankSum:  sampleResults[0].blankSum.toFixed(3),
            b_blankQ1: b_blankStats.q1,
            b_blankQ2: b_blankStats.q2,
            ...Object.fromEntries(sampleResults.flatMap((r, idx) => [
                [`A${idx+1}_inhibitionRate`, r.percentReduction.average],
                [`A${idx+1}_q1Percent`,      r.percentReduction.q1Percent],
                [`A${idx+1}_q2Percent`,      r.percentReduction.q2Percent],
                [`A${idx+1}_bQ1`,            r.b_sampStats.q1],
                [`A${idx+1}_bQ2`,            r.b_sampStats.q2],
                [`A${idx+1}_rgbRatio`,       r.rgbRatio.toFixed(5)],
                [`A${idx+1}_sampSum`,        r.sampSum.toFixed(3)],
            ]))
        },
        rawData: logRGBValues.map(entry => [
            entry.time,
            ...entry.colors.flatMap(c => [c.r, c.g, c.b]),
            ...(entry.slopes ? entry.slopes.map(s => s.b) : Array(5).fill(""))
        ])
    });

    location.href = "Results.html";
}
