const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbyv_uizvx2puwqLCBI2Nye7U9U6JREbm0fMg6mQ_1pEXT2vJ4Ht8OwfRHIHUxolIu1e0g/exec";

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
const analyzingOverlay = document.getElementById('analyzingOverlay');

let stream;
let interval;
let logRGBValues = [];

let redBoxPositions = {
    redBox1: { left: 0, top: 0 },
    redBox2: { left: 0, top: 0 },
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

    const color1 = getAverageColor(redBox1);
    const color2 = getAverageColor(redBox2);

    logRGBValues.push({
        time: intervalCount,
        color1: { r: color1.r.toFixed(3), g: color1.g.toFixed(3), b: color1.b.toFixed(3) },
        color2: { r: color2.r.toFixed(3), g: color2.g.toFixed(3), b: color2.b.toFixed(3) },
        slope: null
    });

    result.innerHTML = `
        剩餘時間: ${intervalCount} 秒<br>
        空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
        樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
    `;

    intervalCount -= 2;

    interval = setInterval(() => {
        const color1 = getAverageColor(redBox1);
        const color2 = getAverageColor(redBox2);

        const prev = logRGBValues[logRGBValues.length - 1];
        const slope = {
            b1: (parseFloat(prev.color1.b) - color1.b).toFixed(3),
            b2: (parseFloat(prev.color2.b) - color2.b).toFixed(3)
        };

        logRGBValues.push({
            time: intervalCount,
            color1: { r: color1.r.toFixed(3), g: color1.g.toFixed(3), b: color1.b.toFixed(3) },
            color2: { r: color2.r.toFixed(3), g: color2.g.toFixed(3), b: color2.b.toFixed(3) },
            slope
        });

        result.innerHTML = `
            剩餘時間: ${intervalCount} 秒<br>
            空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
            樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
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
makeDraggable(redBox1);
makeDraggable(redBox2);

//20250514
document.getElementById('startBtn').addEventListener('click', async () => {
    await startCamera();
    video.onloadeddata = () => {
        updateRedBoxPositions();

        const color1 = getAverageColor(redBox1);
        const color2 = getAverageColor(redBox2);

        result.innerHTML = `
            空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
            樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
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

    ['redBox1', 'redBox2'].forEach(id => {
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
        entry.slope &&
        !isNaN(parseFloat(entry.slope.b1)) &&
        !isNaN(parseFloat(entry.slope.b2))
    );

    const rawB1 = validData.map(entry => parseFloat(entry.slope.b1));
    const rawB2 = validData.map(entry => parseFloat(entry.slope.b2));

    const b1Smoothed = movingAverage(rawB1, 5);
    const b2Smoothed = movingAverage(rawB2, 5);

    const b1Stats = calculateQuartiles(b1Smoothed);
    const b2Stats = calculateQuartiles(b2Smoothed);

    // 空白組 R、G、B 原始值的 Q2
    const blankR = logRGBValues.map(e => parseFloat(e.color1.r)).filter(v => !isNaN(v));
    const blankG = logRGBValues.map(e => parseFloat(e.color1.g)).filter(v => !isNaN(v));
    const blankB = logRGBValues.map(e => parseFloat(e.color1.b)).filter(v => !isNaN(v));

    const blankRQ2 = parseFloat(calculateQuartiles(blankR).q2);
    const blankGQ2 = parseFloat(calculateQuartiles(blankG).q2);
    const blankBQ2 = parseFloat(calculateQuartiles(blankB).q2);
    const blankSum = blankRQ2 + blankGQ2 + blankBQ2;

    // 樣品組 R、G、B 原始值的 Q2
    const sampR = logRGBValues.map(e => parseFloat(e.color2.r)).filter(v => !isNaN(v));
    const sampG = logRGBValues.map(e => parseFloat(e.color2.g)).filter(v => !isNaN(v));
    const sampB = logRGBValues.map(e => parseFloat(e.color2.b)).filter(v => !isNaN(v));

    const sampRQ2 = parseFloat(calculateQuartiles(sampR).q2);
    const sampGQ2 = parseFloat(calculateQuartiles(sampG).q2);
    const sampBQ2 = parseFloat(calculateQuartiles(sampB).q2);
    const sampSum = sampRQ2 + sampGQ2 + sampBQ2;

    const rgbRatio = (sampSum !== 0) ? blankSum / sampSum : 1;

    const percentReduction = calculatePercentageReduction(b1Stats, b2Stats, rgbRatio);
    const percentResult = percentReduction.average;

    const errorCode = percentReduction.warning || "正常";
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const sheetName = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // 先儲存結果
    localStorage.setItem("rate", percentReduction.q2Percent);
    localStorage.setItem("errorCode", errorCode);

    // 等上傳完成後再跳轉
    await uploadToGoogleSheets({
        sheetName,
        summary: {
            nickname:       localStorage.getItem('nickname') || '未填寫',  // ← 加這行
            device: getDeviceInfo(),
            time:           now.toLocaleString("zh-TW"),
            inhibitionRate: percentResult,
            errorCode:      errorCode,
            b1Q1:           b1Stats.q1,
            b1Q2:           b1Stats.q2,
            b2Q1:           b2Stats.q1,
            b2Q2:           b2Stats.q2,
            q1Percent:      percentReduction.q1Percent,
            q2Percent:      percentReduction.q2Percent,
            blankRQ2:       blankRQ2.toFixed(3),
            blankGQ2:       blankGQ2.toFixed(3),
            blankBQ2:       blankBQ2.toFixed(3),
            blankSum:       blankSum.toFixed(3),
            sampRQ2:        sampRQ2.toFixed(3),
            sampGQ2:        sampGQ2.toFixed(3),
            sampBQ2:        sampBQ2.toFixed(3),
            sampSum:        sampSum.toFixed(3),
            rgbRatio:       rgbRatio.toFixed(5),
        },
        rawData: logRGBValues.map(entry => [
            entry.time,
            entry.color1.r, entry.color1.g, entry.color1.b,
            entry.color2.r, entry.color2.g, entry.color2.b,
            entry.slope ? entry.slope.b1 : "",
            entry.slope ? entry.slope.b2 : ""
        ])
    });

    location.href = "Results.html";
}
